// Build the Sam Desk aggregates cube, desk_aggregates (Stage C, step 3).
// =====================================================================
// Reads sales_archive BY model_family (populated by scripts/backfillModelFamily.js),
// applies the SAME basis + set-aside rule as One Box / the Desk executor (implied
// hammer, house premiums backed out, parts/memorabilia/race/restomod/tuner set aside,
// medians + quartiles only), slices into the Core + venue cube, and upserts. So a cube
// lookup can never disagree with a raw read of the same scope.
//
// SET-ASIDE POLICY (matches the Desk's family/generation reads): the always-aside
// classes (race, restomod, period tuner, parts, memorabilia) are removed from every
// slice; HALOS are KEPT in the pool (the Desk's generation reads include a generation's
// own halo — e.g. the 930 Turbo is part of the G-body air-cooled read) and only COUNTED
// in set_aside for transparency. The RECORD path removes halos and reads the
// model_family price index directly, not this cube.
//
// Heavy: run in GitHub Actions (nightly job, AFTER ingest + the model_family backfill),
// never locally. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/deskCube.js            build + upsert
//   node scripts/deskCube.js --dry       build + report only, NO writes
//   node scripts/deskCube.js --min 8     only families with >= N qualifying sales (default 8)
// =====================================================================
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";
import { hammerUsd, isHouseSource, sourceSlugOf } from "../lib/_houseComps.js";
import { isPartsListing, isMemorabilia } from "../lib/_classify.js";
import { recordExcludeReason } from "../lib/onebox.js";
import { generationsForModel } from "../lib/generations.js";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const MIN_FAMILY = (() => { const i = argv.indexOf("--min"); return i >= 0 ? Number(argv[i + 1]) : 8; })();
const THIN = 5;                          // below this, no median/quartiles (parity with the executor)
const DAY = 864e5;

const env = supabaseEnv();
if (!env) { console.error("FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required."); process.exit(1); }

const todayIso = new Date().toISOString().slice(0, 10);
const t = Date.now();
// windows -> [fromMs, toMs]. prior12 = the 12 months BEFORE the last 12 (for the trend read).
const WINDOWS = {
  "36mo": [t - 1095 * DAY, t],
  "24mo": [t - 730 * DAY, t],
  "12mo": [t - 365 * DAY, t],
  "prior12": [t - 730 * DAY, t - 365 * DAY],
  "ytd": [Date.UTC(new Date().getUTCFullYear(), 0, 1), t]
};
const VENUE_WINDOWS = ["36mo", "12mo"];  // per-venue rows only for the two common windows (bound size)
const YEAR_WINDOWS = ["36mo", "12mo", "prior12"];

// ---- load 36 months of sold rows with model_family set ----
async function loadRows() {
  const fromIso = new Date(t - 1095 * DAY).toISOString().slice(0, 10);
  const cols = "source_id,make,model,model_family,year,sale_price,sale_date,platform,source_slug,listing_title,mileage,currency:raw_record->>currency";
  const rows = []; let cursor = "";
  for (let p = 0; p < 2000; p++) {
    let q = `sales_archive?select=${cols}&model_family=not.is.null&sale_price=not.is.null&sale_date=gte.${fromIso}&order=source_id.asc&limit=1000`;
    if (cursor) q += `&source_id=gt.${encodeURIComponent(cursor)}`;
    const batch = await supabaseSelect(env, q);
    if (!batch || !batch.length) break;
    for (const r of batch) rows.push(r);
    cursor = batch[batch.length - 1].source_id;
    process.stderr.write(`\rloaded ${rows.length}   `);
    if (batch.length < 1000) break;
  }
  process.stderr.write("\n");
  return rows;
}

function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function pct(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1)))); return s[i]; }

// aggregate a set of clean rows (already hygiene-passed, value = hammer usd) into a cube stat.
function statOf(rows) {
  const vals = rows.map(r => r.value).filter(v => Number.isFinite(v) && v > 0);
  const n = vals.length;
  const newest = rows.reduce((mx, r) => { const d = String(r.sale_date || "").slice(0, 10); return d > mx ? d : mx; }, "");
  const thin = n < THIN;
  return {
    n,
    median_usd: thin ? null : median(vals),
    q1_usd: thin ? null : pct(vals, 25), q3_usd: thin ? null : pct(vals, 75),
    min_usd: n ? Math.min(...vals) : null, max_usd: n ? Math.max(...vals) : null,
    newest_sale: newest || null
  };
}

function inWindow(r, key) { const [a, b] = WINDOWS[key]; const d = new Date(String(r.sale_date).slice(0, 10) + "T00:00:00Z").getTime(); return d >= a && d <= b; }
function channelOf(r) { return isHouseSource(r) ? "house" : "online"; }

function run() {
  return loadRows().then(async rows => {
    // 1) hygiene + hammer basis + set-aside counts (halos kept, counted).
    const clean = []; const setAsideByFamily = new Map();
    for (const r of rows) {
      const title = r.listing_title || "";
      if (isPartsListing(title, r.mileage)) { bump(setAsideByFamily, r, "parts"); continue; }
      if (isMemorabilia(title)) { bump(setAsideByFamily, r, "parts"); continue; }
      const reason = recordExcludeReason(title, r.make, { wantHalo: false });
      if (reason && reason !== "halo") { bump(setAsideByFamily, r, reason.split(" ")[0]); continue; }  // race/restomod/period(tuner)
      r.value = hammerUsd({ source_slug: r.source_slug, source: r.platform, price: Number(r.sale_price), currency: r.currency || "USD" });
      if (!Number.isFinite(r.value) || r.value <= 0) continue;
      if (isHouseSource(r) && r.value < 2500) continue;   // house data-error floor
      if (reason === "halo") bump(setAsideByFamily, r, "halo");   // KEEP in pool, count it
      r._slug = sourceSlugOf(r) || String(r.source_slug || "").toLowerCase();
      r._gen = genCodeFor(r);
      clean.push(r);
    }

    // 2) group by (make, model_family).
    const fams = new Map();   // "make|family" -> rows
    for (const r of clean) { const k = r.make + "|" + r.model_family; (fams.get(k) || fams.set(k, []).get(k)).push(r); }

    const cubeRows = [];
    for (const [k, frows] of fams) {
      if (frows.length < MIN_FAMILY) continue;
      const [make, family] = k.split("|");
      const sa = setAsideByFamily.get(k) || {};
      const gens = [...new Set(frows.map(r => r._gen).filter(Boolean))];
      const years = [...new Set(frows.map(r => Number(r.year)).filter(y => y >= 1900 && y <= 2100))];
      const venues = [...new Set(frows.map(r => r._slug).filter(Boolean))];

      const emit = (generation, model_year, channel, venue, window_key, pool) => {
        const st = statOf(pool);
        if (!st.n) return;
        cubeRows.push({ make, model_family: family, generation, model_year, channel, venue, window_key, ...st, set_aside: (generation === "" && model_year === 0 && channel === "all" && venue === "all") ? sa : {} });
      };

      for (const w of Object.keys(WINDOWS)) {
        const win = frows.filter(r => inWindow(r, w));
        if (!win.length) continue;
        // family level (gen="", year=0): all / online / house
        emit("", 0, "all", "all", w, win);
        emit("", 0, "online", "all", w, win.filter(r => channelOf(r) === "online"));
        emit("", 0, "house", "all", w, win.filter(r => channelOf(r) === "house"));
        // per-generation (channel all)
        for (const g of gens) emit(g, 0, "all", "all", w, win.filter(r => r._gen === g));
        // per-venue (family level, channel all) — home-screen "which house sold the most"
        if (VENUE_WINDOWS.includes(w)) {
          for (const v of venues) emit("", 0, "all", v, w, win.filter(r => r._slug === v));
          for (const g of gens) for (const v of venues) { const pool = win.filter(r => r._gen === g && r._slug === v); if (pool.length) emit(g, 0, "all", v, w, pool); }
        }
        // per-model-year (channel all) — trend-by-year + year filtering
        if (YEAR_WINDOWS.includes(w)) for (const y of years) emit("", y, "all", "all", w, win.filter(r => Number(r.year) === y));
      }
    }

    console.log(`\nFamilies: ${fams.size} (>= ${MIN_FAMILY} sales kept). Clean rows: ${clean.length}. Cube rows: ${cubeRows.length}.`);
    for (const probe of ["Camaro", "Mustang", "911", "M3", "944 Turbo"]) {
      const hit = cubeRows.filter(r => r.model_family === probe && r.generation === "" && r.model_year === 0 && r.channel === "all" && r.venue === "all" && r.window_key === "36mo")[0];
      if (hit) console.log(`  probe ${probe} (36mo, all): n=${hit.n} median=${hit.median_usd} q1-q3=${hit.q1_usd}-${hit.q3_usd} newest=${hit.newest_sale}`);
    }

    if (DRY) { console.log("\n--dry: no writes."); return; }

    // 3) upsert (on the unique key) in chunks so a slice is never half-written.
    let written = 0;
    for (let i = 0; i < cubeRows.length; i += 500) {
      const chunk = cubeRows.slice(i, i + 500).map(r => ({ ...r, computed_at: new Date().toISOString() }));
      const res = await supabaseInsert("desk_aggregates", chunk, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates", "?on_conflict=make,model_family,generation,model_year,channel,venue,window_key");
      if (res.error) { console.error("  upsert failed:", res.error); process.exit(1); }
      written += chunk.length; process.stderr.write(`\rupserted ${written}/${cubeRows.length}   `);
    }
    process.stderr.write("\n");
    console.log(`Cube built. Rows upserted: ${written}.`);
  });
}

// generation code for a row, from the model's curated generations by year. Uses the
// family value as the model (M3/911 are curated); base families use themselves.
const genCache = new Map();
function gensFor(make, family) { const k = make + "|" + family; if (!genCache.has(k)) genCache.set(k, generationsForModel(make, family) || []); return genCache.get(k); }
function genCodeFor(r) { const g = gensFor(r.make, r.model_family); const y = Number(r.year); if (!g.length || !(y >= 1900)) return ""; const hit = g.find(x => y >= x.yearStart && y <= x.yearEnd); return hit ? hit.code : ""; }
function bump(map, r, key) { const k = r.make + "|" + r.model_family; const o = map.get(k) || map.set(k, {}).get(k); o[key] = (o[key] || 0) + 1; }

run().catch(e => { console.error("FATAL:", e && e.stack || e); process.exit(1); });
