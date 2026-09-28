// Stage C read-side of the Sam Desk aggregates cube (desk_aggregates). A cube row is a precomputed
// slice keyed on (make, model_family, generation, model_year, channel, venue, window_key) holding
// n, median, q1, q3, min, max, newest_sale. The read paths (single read, ranking member, comparison
// member, trend) try the cube FIRST for the simple case it covers and fall back to the raw scan for
// anything it cannot answer. The cube NEVER changes a number - it serves the same median (built on
// the same hammer basis and set-aside rules) faster. A miss (empty pool, missing table, unusual
// filter) always yields null, so the caller scans raw and the answer is identical, just slower.
import { supabaseSelect } from "../_supabase.js";
import { deskModelFamily } from "./familyKey.js";

const CUBE_WINDOWS = new Set(["ytd", "12mo", "24mo", "36mo", "prior12"]);
// The only filter keys the cube models. Any OTHER active filter (transmission, body, price band,
// sale_type, ...) means the cube cannot answer it -> raw scan.
const CUBE_FILTER_KEYS = new Set(["make", "model", "trim", "generation", "channel", "venue", "window", "year_min", "year_max", "descriptor", "outcome", "price_basis"]);

function windowKeyFor(filters) {
  if (filters.sale_from || filters.sale_to) return null;   // an explicit date range is never a cube window
  const w = filters.window || "36mo";
  return CUBE_WINDOWS.has(w) ? w : null;
}
function channelVenue(filters) {
  const channel = filters.channel && filters.channel !== "all" ? String(filters.channel).toLowerCase() : "all";
  const venue = filters.venue && filters.venue !== "all" ? String(filters.venue).toLowerCase() : "all";
  return { channel, venue };
}

// Resolve a (scope, filters) pair to a cube lookup key, or null if the cube cannot serve it.
// windowOverride forces a window_key (trend passes "12mo" / "prior12" for its two reads).
export function cubeKey(scope, filters, windowOverride) {
  const f = filters || {};
  const { make, model, trim, generation } = scope || {};
  if (trim || f.trim) return null;                 // the cube has no trim dimension
  if (f.descriptor && !generation) return null;    // a descriptor that is not already a resolved generation
  for (const k of Object.keys(f)) {
    if (f[k] == null || f[k] === "") continue;
    if (!CUBE_FILTER_KEYS.has(k)) return null;      // an unmodeled filter -> raw scan
  }
  if (!make || !model) return null;
  const window_key = windowOverride || windowKeyFor(f);
  if (!window_key || !CUBE_WINDOWS.has(window_key)) return null;
  // model_year: 0 = all years in scope (or a generation slice, where the generation IS the scoping).
  // A single pinned year is a real per-year cube row. An arbitrary year RANGE cannot be summed from
  // per-year medians, so it falls to the raw scan.
  const gen = generation || "";
  const yMin = f.year_min != null ? Number(f.year_min) : null;
  const yMax = f.year_max != null ? Number(f.year_max) : null;
  let model_year = 0;
  if (!gen && (yMin != null || yMax != null)) {
    if (yMin != null && yMin === yMax) model_year = yMin;
    else return null;
  }
  const family = deskModelFamily({ make, model }, {});
  if (!family) return null;
  const { channel, venue } = channelVenue(f);
  return { make, model_family: family, generation: gen, model_year, channel, venue, window_key };
}

const enc = encodeURIComponent;
export async function cubeLookup(env, key) {
  if (!env || !key) return null;
  const q = "desk_aggregates?select=n,median_usd,q1_usd,q3_usd,min_usd,max_usd,newest_sale"
    + `&make=eq.${enc(key.make)}`
    + `&model_family=eq.${enc(key.model_family)}`
    + `&generation=eq.${enc(key.generation)}`
    + `&model_year=eq.${key.model_year}`
    + `&channel=eq.${enc(key.channel)}`
    + `&venue=eq.${enc(key.venue)}`
    + `&window_key=eq.${enc(key.window_key)}`
    + "&limit=1";
  const rows = await supabaseSelect(env, q);
  if (!rows || !rows.length) return null;
  const r = rows[0];
  return {
    count: r.n || 0,
    median: r.median_usd != null ? Number(r.median_usd) : null,
    p25: r.q1_usd != null ? Number(r.q1_usd) : null,
    p75: r.q3_usd != null ? Number(r.q3_usd) : null,
    min: r.min_usd != null ? Number(r.min_usd) : null,
    max: r.max_usd != null ? Number(r.max_usd) : null,
    freshness: r.newest_sale || null,
    _cube: true
  };
}

// One call: resolve a scope+filters to a cube stat (the shape poolMembers rows use) or null.
export async function cubeStat(env, scope, filters, windowOverride) {
  const key = cubeKey(scope, filters, windowOverride);
  if (!key) return null;
  return await cubeLookup(env, key);
}

// Per-model-year rows for a family in one window (trend-by-year). Family-wide (generation=''),
// channel=all, venue=all, model_year>0. Returns [{year,count,median}] or null on a miss (missing
// table / family not in the cube), so the caller scans raw. A model_year uniquely belongs to one
// generation, so a generation-scoped by-year trend clips these to the generation's year span.
export async function cubeYearRows(env, scope, windowKey) {
  if (!env || !scope || !scope.make || !scope.model || scope.trim) return null;
  if (!CUBE_WINDOWS.has(windowKey)) return null;
  const family = deskModelFamily({ make: scope.make, model: scope.model }, {});
  if (!family) return null;
  const q = "desk_aggregates?select=model_year,n,median_usd"
    + `&make=eq.${enc(scope.make)}&model_family=eq.${enc(family)}`
    + "&generation=eq.&channel=eq.all&venue=eq.all&model_year=gt.0"
    + `&window_key=eq.${enc(windowKey)}`;
  const rows = await supabaseSelect(env, q);
  if (!rows || !rows.length) return null;
  return rows.map(r => ({ year: Number(r.model_year), count: r.n || 0, median: r.median_usd != null ? Number(r.median_usd) : null }));
}
