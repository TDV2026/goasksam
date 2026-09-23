// Sam Desk — the constrained query DSL (Stage 1).
// =====================================================================
// A Desk query is a JSON object with ONLY the dimensions and measures below.
// The model (or the Build chip bar) fills this object; it NEVER writes SQL.
// validateDsl() is the gate: anything outside the schema is rejected and the
// caller is told exactly what was ignored, so a query never silently means
// something other than what the user sees echoed back as chips.
//
// This module is PURE (no I/O). lib/desk/execute.js compiles a validated DSL
// into archive reads, reusing the One Box engine so the Desk can never
// disagree with One Box or /sell on the same car.
// =====================================================================

// ---- Allowed vocabulary (the whole schema; extend here, nowhere else) ----

// Dimensions you can filter and group by.
export const DIMENSIONS = {
  // car
  make: { group: true },
  model: { group: true },
  generation: { group: true },        // resolved generation code (964, 993, E30, ...)
  trim: { group: true },
  model_year: { group: true },        // the car's model year
  era: { group: true, enum: ["pre-war", "post-war", "60s", "70s", "80s-90s", "2000s", "modern"] },
  body: { group: true },
  transmission: { group: true, enum: ["manual", "automatic", "other"] },
  engine: { group: true },
  color: { group: true },
  // condition proxies
  mileage_band: { group: true },
  title_status: { group: true },
  flag: { group: true, enum: ["modified", "restored", "matching_numbers", "documented"] },
  chassis_known: { group: true, enum: ["yes", "no"] },
  // venue
  channel: { group: true, enum: ["online", "house", "all"] },
  sale_type: { group: true, enum: ["live", "online"] },   // house live room vs house online sale (change 2)
  venue: { group: true },             // a specific source by name/slug
  room: { group: true },              // event/room (stated when carried, inferred + labelled otherwise)
  // time
  day: { group: true },
  week: { group: true },
  month: { group: true },
  quarter: { group: true },
  year: { group: true },              // sale year (calendar)
  season: { group: true, enum: ["winter", "spring", "summer", "fall"] },
  day_of_week: { group: true },
  listing_length: { group: true },    // online only
  days_to_sale: { group: true },
  // geography
  state: { group: true },
  country: { group: true },
  currency: { group: true },
  // outcome + price
  outcome: { group: true, enum: ["sold", "reserve_not_met", "withdrawn", "all"] },
  price_basis: { group: false, enum: ["hammer", "buyer_paid"] },  // labelled, never mixed
  price_band: { group: true }
};

// Measures. NEVER a mean. NEVER a midpoint presented as a value.
export const MEASURES = new Set([
  "count", "share", "median", "p25", "p75", "min", "max",
  "sell_through_rate", "reserve_not_met_rate", "withdrawn_rate",
  "reserve_premium",     // with vs without, same car type + window
  "trend",               // change in median and count over the period
  "velocity",            // same-chassis repeat sales: time between, price change
  "day_of_week_effect", "month_effect",
  "freshness"            // newest sale in the pool
]);

// Filter keys accepted on the `filters` object, mapped to the dimension they constrain.
// A filter value may be a scalar or an array (OR within a dimension).
export const FILTER_KEYS = new Set(Object.keys(DIMENSIONS).concat([
  "descriptor",          // free-text car descriptor ("air-cooled 911") resolved by the resolver + generation expansion
  "year_min", "year_max",// model-year range
  "sale_from", "sale_to",// explicit sale-date range (ISO)
  "window",              // relative window: "24mo" | "12mo" | "36mo" | "qtd" | "ytd" | "this_quarter" | "last_quarter"
  "flags"                // array form of `flag`
]));

export const GROUPABLE = new Set(Object.entries(DIMENSIONS).filter(([, v]) => v.group).map(([k]) => k));

// Relative windows the executor understands (kept small and explicit).
export const WINDOWS = new Set(["7d", "30d", "90d", "6mo", "12mo", "18mo", "24mo", "36mo", "qtd", "ytd", "this_quarter", "last_quarter", "this_year", "last_year"]);

const DEFAULT_MEASURES = ["count", "median", "p25", "p75", "min", "max"];
const DEFAULT_WINDOW = "36mo";           // matches One Box HT_WINDOW_DAYS (1095d); never widened silently

// ---- Validation ----

// Returns { dsl, ignored, errors, notice }.
//  dsl     : the cleaned, schema-only query (or null if unusable)
//  ignored : [{ path, value, reason }] — surfaced to the user ("I ignored X")
//  errors  : hard problems that make the query unusable (empty otherwise)
//  notice  : one-line human summary of what was ignored (or "")
export function validateDsl(raw) {
  const ignored = [];
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { dsl: null, ignored, errors: ["query is not an object"], notice: "" };
  }

  const dsl = {};

  // filters
  const rawFilters = (raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters)) ? raw.filters : {};
  const filters = {};
  for (const [k, v] of Object.entries(rawFilters)) {
    if (!FILTER_KEYS.has(k)) { ignored.push({ path: `filters.${k}`, value: v, reason: "not a Desk dimension" }); continue; }
    // enum-constrained dimensions: drop values outside the enum, keep the rest
    const dim = DIMENSIONS[k];
    if (dim && dim.enum) {
      const vals = (Array.isArray(v) ? v : [v]).map(x => String(x).toLowerCase().trim());
      const ok = vals.filter(x => dim.enum.includes(x));
      const bad = vals.filter(x => !dim.enum.includes(x));
      for (const b of bad) ignored.push({ path: `filters.${k}`, value: b, reason: `not one of ${dim.enum.join(", ")}` });
      if (ok.length) filters[k] = Array.isArray(v) ? ok : ok[0];
      continue;
    }
    if (k === "window") {
      const w = String(v).toLowerCase().trim();
      if (!WINDOWS.has(w)) { ignored.push({ path: "filters.window", value: v, reason: `unknown window (use ${[...WINDOWS].join(", ")})` }); continue; }
      filters.window = w; continue;
    }
    if (k === "flags") {
      const vals = (Array.isArray(v) ? v : [v]).map(x => String(x).toLowerCase().trim()).filter(x => DIMENSIONS.flag.enum.includes(x));
      if (vals.length) filters.flags = vals;
      const bad = (Array.isArray(v) ? v : [v]).map(x => String(x).toLowerCase().trim()).filter(x => !DIMENSIONS.flag.enum.includes(x));
      for (const b of bad) ignored.push({ path: "filters.flags", value: b, reason: `not a known flag` });
      continue;
    }
    filters[k] = v;
  }
  dsl.filters = filters;

  // groupBy
  const rawGroup = Array.isArray(raw.groupBy) ? raw.groupBy : (raw.groupBy ? [raw.groupBy] : []);
  const groupBy = [];
  for (const g of rawGroup) {
    const key = String(g).toLowerCase().trim();
    if (GROUPABLE.has(key)) groupBy.push(key);
    else ignored.push({ path: "groupBy", value: g, reason: "not a groupable dimension" });
  }
  dsl.groupBy = groupBy;

  // measures
  const rawMeasures = Array.isArray(raw.measures) ? raw.measures : (raw.measures ? [raw.measures] : []);
  const measures = [];
  for (const m of rawMeasures) {
    const key = String(m).toLowerCase().trim();
    if (key === "mean" || key === "average" || key === "midpoint") {
      ignored.push({ path: "measures", value: m, reason: "the Desk never reports a mean or a midpoint; use median with p25/p75" });
      continue;
    }
    if (MEASURES.has(key)) measures.push(key);
    else ignored.push({ path: "measures", value: m, reason: "not a Desk measure" });
  }
  dsl.measures = measures.length ? measures : DEFAULT_MEASURES.slice();

  // price basis (labelled, never mixed) — default hammer (the pool/compute basis)
  const basis = raw.price_basis || (filters.price_basis);
  dsl.price_basis = (basis && DIMENSIONS.price_basis.enum.includes(String(basis).toLowerCase())) ? String(basis).toLowerCase() : "hammer";
  if (basis && !DIMENSIONS.price_basis.enum.includes(String(basis).toLowerCase())) {
    ignored.push({ path: "price_basis", value: basis, reason: "price basis is hammer or buyer_paid" });
  }

  // outcome default (sold); sold and not-sold are never mixed in one figure
  dsl.outcome = (filters.outcome) || "sold";

  // window default
  if (!filters.window && !filters.sale_from && !filters.sale_to) filters.window = DEFAULT_WINDOW;

  // comparison (optional): { dimension, a, b } e.g. this_quarter vs last_quarter
  if (raw.compare && typeof raw.compare === "object") {
    const dim = String(raw.compare.dimension || "").toLowerCase();
    if (GROUPABLE.has(dim) || dim === "window") dsl.compare = { dimension: dim, a: raw.compare.a, b: raw.compare.b };
    else ignored.push({ path: "compare.dimension", value: raw.compare.dimension, reason: "not comparable" });
  }

  // A query must reference a car (make/model/descriptor/trim/generation) OR be a pure
  // cross-market question scoped by venue or channel ("sell-through on Bring a Trailer",
  // "which house sold the most last quarter"). A bare query with neither is rejected.
  const hasCar = filters.make || filters.model || filters.descriptor || filters.generation || filters.trim;
  const hasMarketScope = filters.venue || (filters.channel && filters.channel !== "all") || dsl.measures.some(m => /sell_through|reserve_not_met_rate|withdrawn_rate/.test(m));
  if (!hasCar && !hasMarketScope) errors.push("name a car (make, model, or a descriptor like 'air-cooled 911'), or scope the market by a venue or channel");

  const notice = ignored.length
    ? "Ignored " + ignored.map(i => `${i.path}=${JSON.stringify(i.value)}`).join(", ") + "."
    : "";

  return { dsl: errors.length ? null : dsl, ignored, errors, notice };
}

// Human-readable chip echo of a validated DSL: the middot-joined line the UI shows
// ("Porsche 911 · air-cooled generations · houses only · sold · 24 months · by venue").
export function echoChips(dsl, resolvedLabel) {
  if (!dsl) return [];
  const f = dsl.filters || {};
  const chips = [];
  if (resolvedLabel) chips.push(resolvedLabel);
  else if (f.make || f.model) chips.push([f.make, f.model].filter(Boolean).join(" "));
  if (f.descriptor) chips.push(String(f.descriptor));
  if (f.generation) chips.push(`${f.generation} generation`);
  if (f.trim) chips.push(String(f.trim));
  if (f.channel && f.channel !== "all") chips.push(f.channel === "house" ? "houses only" : "online only");
  else if (Array.isArray(f.venue) ? f.venue.length : f.venue) chips.push([].concat(f.venue).join(" / "));
  if (dsl.outcome && dsl.outcome !== "all") chips.push(dsl.outcome.replace(/_/g, " "));
  const win = f.window && windowLabel(f.window);
  if (win) chips.push(win);
  else if (f.sale_from || f.sale_to) chips.push(`${f.sale_from || "…"} to ${f.sale_to || "…"}`);
  if (dsl.groupBy && dsl.groupBy.length) chips.push("by " + dsl.groupBy.map(g => g.replace(/_/g, " ")).join(" and "));
  if (dsl.price_basis) chips.push(dsl.price_basis === "hammer" ? "hammer basis" : "buyer paid basis");
  return chips;
}

export function windowLabel(w) {
  const map = {
    "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days",
    "6mo": "last 6 months", "12mo": "last 12 months", "18mo": "last 18 months", "24mo": "last 24 months", "36mo": "last 36 months",
    "qtd": "quarter to date", "ytd": "year to date",
    "this_quarter": "this quarter", "last_quarter": "last quarter",
    "this_year": "this year", "last_year": "last year"
  };
  return map[w] || w;
}
