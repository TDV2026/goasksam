// Spec-page DATA LAYER for the Porsche 911 (the first page type in docs/search-rules.md). ENGINE ONLY
// - this produces the facts; Lane C renders the HTML on top. Every number reads the SAME One Box engine
// (buildSpec + fetchQualifying + the thin/spread gate), so a spec page and a /onebox query for the same
// car never disagree. Archive-only, read-only, zero OldCarsData.
//
// Canonical slug scheme (rule 2 - one URL per object, for life):
//   leaf  /cars/porsche/911/{gen}/{trim}/{body}-{gearbox}   e.g. /cars/porsche/911/997/carrera-s/coupe-manual
//   hub   /cars/porsche/911/{gen}/{trim}                     e.g. /cars/porsche/911/997/carrera-s
//   hub   /cars/porsche/911/{gen}                            e.g. /cars/porsche/911/997
//   hub   /cars/porsche/911                                  (model)
// Lowercase, hyphen-separated; generation codes as owners say them (964/993/996/997/991/992, plus
// 3.2 Carrera -> "3-2-carrera", 911SC -> "911sc", G-Body -> "g-body", 901 -> "901"); 991.1 and 991.2
// share the owner "991" hub (the facelift is finer than a page). Gearbox is manual|auto.
import { buildSpec, fetchQualifying, __specEngine } from "./onebox.js";
import { supabaseSelect } from "./_supabase.js";
const { gearboxType, percentile, r4Cluster, roundFloor, roundCeil, DISPLAY_FLOOR } = __specEngine;

// Generations in canonical order (parent <-> child navigation reads this array).
const GENS_911 = [
  { slug: "901", code: "901", y: [1964, 1973] },
  { slug: "g-body", code: "G-Body", y: [1974, 1977] },
  { slug: "911sc", code: "911SC", y: [1978, 1983] },
  { slug: "3-2-carrera", code: "3.2 Carrera", y: [1984, 1988] },
  { slug: "964", code: "964", y: [1990, 1994] },
  { slug: "993", code: "993", y: [1994, 1998] },
  { slug: "996", code: "996", y: [1999, 2004] },
  { slug: "997", code: "997", y: [2005, 2011] },
  { slug: "991", code: "991", y: [2012, 2019] },
  { slug: "992", code: "992", y: [2020, 2026] }
];
const BODIES = ["coupe", "cabriolet", "targa"];
const GEARBOXES = ["manual", "auto"];
// Trims the engine scopes cleanly for the 911, by generation (the enumeration matrix; a trim absent
// from a generation simply yields a thin/empty pool and a noindex page, never a wrong one).
// Targa is a BODY (a Carrera with a Targa top), not a trim - it is reached via trim=Carrera + body=targa,
// never listed here.
const TRIMS_BY_GEN = {
  "901": ["Carrera", "Carrera S", "Turbo"],
  "g-body": ["Carrera", "Turbo"],
  "911sc": ["Carrera"],
  "3-2-carrera": ["Carrera", "Turbo"],
  "964": ["Carrera 2", "Carrera 4", "Turbo"],
  "993": ["Carrera", "Carrera S", "Carrera 4", "Carrera 4S", "Turbo", "Turbo S"],
  "996": ["Carrera", "Carrera 4", "Turbo", "GT3", "GT2"],
  "997": ["Carrera", "Carrera S", "Carrera 4", "Carrera 4S", "Turbo", "Turbo S", "GT3", "GT3 RS", "GT2", "GT2 RS"],
  "991": ["Carrera", "Carrera S", "Carrera 4", "Carrera 4S", "Turbo", "Turbo S", "GT3", "GT3 RS", "R"],
  "992": ["Carrera", "Carrera S", "Carrera 4", "Carrera 4S", "Turbo", "Turbo S", "GT3", "GT3 RS"]
};

const slugPart = s => String(s || "").toLowerCase().trim().replace(/\./g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const trimSlug = t => slugPart(t);                       // "Carrera S" -> "carrera-s", "GT3 RS" -> "gt3-rs"
const genBySlug = s => GENS_911.find(g => g.slug === s) || null;
const genByCode = c => GENS_911.find(g => g.code === c) || null;

// Build the canonical slug for a spec (any level). Omit trailing parts for hubs.
export function slugForSpec({ gen, trim, body, gearbox }) {
  const g = genByCode(gen) || genBySlug(gen);
  if (!g) return null;
  const parts = ["cars", "porsche", "911", g.slug];
  if (trim) parts.push(trimSlug(trim));
  if (body && gearbox) parts.push(`${slugPart(body)}-${slugPart(gearbox)}`);
  return "/" + parts.join("/");
}

// Parse a canonical slug back to its spec parts + level. Returns null for a non-911 / malformed slug.
export function parseSlug(slug) {
  const parts = String(slug || "").replace(/^\/+|\/+$/g, "").split("/");
  if (parts[0] !== "cars" || parts[1] !== "porsche" || parts[2] !== "911") return null;
  const rest = parts.slice(3);
  if (rest.length === 0) return { level: "model" };
  const g = genBySlug(rest[0]);
  if (!g) return null;
  if (rest.length === 1) return { level: "gen", gen: g };
  const trim = (TRIMS_BY_GEN[g.slug] || []).find(t => trimSlug(t) === rest[1]) || null;
  if (!trim) return null;
  if (rest.length === 2) return { level: "trim", gen: g, trim };
  const m = /^([a-z]+)-([a-z]+)$/.exec(rest[2] || "");
  if (rest.length === 3 && m && BODIES.includes(m[1]) && GEARBOXES.includes(m[2])) return { level: "leaf", gen: g, trim, body: m[1], gearbox: m[2] };
  return null;
}

// ---- pool read + stats (one place, so hubs and leaves agree) --------------------------------------
function iso12mo(asOf) { return new Date(asOf.getTime() - 365 * 864e5).toISOString(); }

async function poolFor(gen, trim, body, env, asOf) {
  const vehicle = { make: "Porsche", model: "911", trim: trim || "", year: null, bodyStyle: body || null };
  const generation = { make: "Porsche", model: "911", code: gen.code, yearStart: gen.y[0], yearEnd: gen.y[1] };
  const searchText = [gen.code, trim, body].filter(Boolean).join(" ");
  const spec = buildSpec(vehicle, generation, searchText);
  spec.yearMin = gen.y[0]; spec.yearMax = gen.y[1]; spec.genCode = gen.code;   // hub year window is the whole generation
  const rows = await fetchQualifying(spec, iso12mo(asOf), env, {});
  return (rows || []).filter(r => Number(r.value) >= DISPLAY_FLOOR);
}

function statsFor(rows, gearbox) {
  const pool = gearbox ? rows.filter(r => gearboxType(r) === gearbox) : rows;
  const vals = pool.map(r => Number(r.value)).filter(v => v > 0).sort((a, b) => a - b);
  const n = vals.length;
  if (!n) return { count: 0, low: null, high: null, midLow: null, midHigh: null, indexable: false, reason: "No recorded sales of this car in the last 12 months.", pool };
  const low = roundFloor(vals[0]), high = roundCeil(vals[n - 1]);
  const midLow = roundFloor(percentile(vals, 0.25)), midHigh = roundCeil(percentile(vals, 0.75));
  // Thin/spread gate (rule 4, same as One Box): a typical band needs a real cluster of 8+ solid sales.
  const band = r4Cluster(pool.map(r => ({ _usd: Number(r.value) })));
  let indexable = n >= 8 && !!band, reason = null;
  if (!indexable) reason = n < 8
    ? `Only ${n} recorded ${n === 1 ? "sale" : "sales"} in the last 12 months, too few to mark a typical band.`
    : "The recorded sales are too spread out to mark a typical band.";
  return { count: n, low, high, midLow, midHigh, indexable, reason, pool };
}

const money = v => v == null ? null : "$" + Math.round(v).toLocaleString("en-US");
const fmtDate = d => { const p = ["January","February","March","April","May","June","July","August","September","October","November","December"]; const s = String(d.toISOString()).slice(0, 10).split("-"); return `${Number(s[2])} ${p[Number(s[1]) - 1]} ${s[0]}`; };

function leadSentence(label, st, asOf) {
  const d = fmtDate(asOf);
  if (!st.count) return `As of ${d}, no sales of ${label} are on record in the last 12 months.`;
  const plural = st.count === 1 ? "" : "s";
  const base = `In the 12 months to ${d}, ${st.count} ${label}${plural} sold at auction between ${money(st.low)} and ${money(st.high)}.`;
  return st.indexable ? `${base} Most sold between ${money(st.midLow)} and ${money(st.midHigh)}.` : base;
}

// Repeat-appearance VINs in the pool (2+ auction appearances, from vin_index), up to 10.
async function repeatVins(pool, env) {
  const vins = [...new Set(pool.map(r => String(r.vin_norm || "").trim()).filter(v => v.length >= 6))];
  if (!vins.length) return [];
  const inList = vins.slice(0, 300).map(v => encodeURIComponent(v)).join(",");
  const rows = await supabaseSelect(env, `vin_index?vin_norm=in.(${inList})&select=vin_norm,appearance_date,source,price_usd,mileage&order=appearance_date.desc.nullslast&limit=1000`) || [];
  const byVin = new Map();
  for (const r of rows) { const k = r.vin_norm; if (!byVin.has(k)) byVin.set(k, []); byVin.get(k).push(r); }
  const out = [];
  for (const [vin, apps] of byVin) if (apps.length >= 2) out.push({ vin, appearances: apps.length, last: String(apps[0].appearance_date || "").slice(0, 10), historyUrl: `/vin/${vin}` });
  return out.sort((a, b) => b.appearances - a.appearances).slice(0, 10);
}

// Live listings matching the spec right now (count only; the /buy page owns the listings).
async function liveCount(gen, trim, body, env) {
  let q = `live_listings?status=eq.live&make=ilike.*porsche*&model=ilike.*911*&year=gte.${gen.y[0]}&year=lte.${gen.y[1]}&select=id`;
  const r = await supabaseSelect(env, q + "&limit=500") || [];
  const trimRe = trim ? new RegExp("\\b" + trimSlug(trim).replace(/-/g, "[\\s-]?") + "\\b", "i") : null;
  const bodyRe = body ? new RegExp("\\b" + body + "\\b", "i") : null;
  // live_listings carries a title; when present, narrow by trim/body, else count the generation window.
  const titled = await supabaseSelect(env, q.replace("select=id", "select=id,listing_title") + "&limit=500") || [];
  if (!titled.length) return r.length;
  return titled.filter(x => { const t = String(x.listing_title || ""); return (!trimRe || trimRe.test(t)) && (!bodyRe || bodyRe.test(t)); }).length;
}

function recentSales(pool) {
  return pool.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")))
    .slice(0, 10)
    .map(r => ({ date: String(r.auction_end_date || "").slice(0, 10), house: r.source || null, hammer: Number(r.value) || null, miles: (r.mi && r.mi.miles) || null, url: r.srcurl || r.srcurl2 || null }));
}

// ---- public API -----------------------------------------------------------------------------------
// specPage(slug, env, opts?) -> the full data object for a canonical slug (leaf or hub). opts.asOf is a
// Date (defaults to now at call time; the caller/cron stamps a stable date for the nightly build).
export async function specPage(slug, env, opts = {}) {
  const parsed = parseSlug(slug);
  if (!parsed) return null;
  const asOf = opts.asOf instanceof Date ? opts.asOf : new Date();
  const asOfISO = asOf.toISOString().slice(0, 10);

  if (parsed.level === "leaf") {
    const { gen, trim, body, gearbox } = parsed;
    const rows = await poolFor(gen, trim, body, env, asOf);
    const st = statsFor(rows, gearbox);
    const label = `${gen.code} ${trim} ${body}, ${gearbox === "manual" ? "manual" : "automatic"}`;
    const self = slugForSpec({ gen: gen.code, trim, body, gearbox });
    const siblings = BODIES.flatMap(b => GEARBOXES.map(gb => slugForSpec({ gen: gen.code, trim, body: b, gearbox: gb }))).filter(s => s !== self);
    const [repeats, live] = await Promise.all([repeatVins(st.pool, env), liveCount(gen, trim, body, env)]);
    return {
      slug: self, level: "leaf", label, asOf: asOfISO, windowDays: 365,
      parent: slugForSpec({ gen: gen.code, trim }), siblings, children: [],
      count: st.count, low: st.low, high: st.high, middleHalf: [st.midLow, st.midHigh],
      indexable: st.indexable, indexReason: st.reason,
      lead: leadSentence(label, st, asOf),
      recentSales: recentSales(st.pool), repeatVins: repeats, liveListings: live
    };
  }

  // Hubs: aggregate over children (same engine read, wider scope) + a child table.
  let gen = parsed.gen, trim = parsed.trim || null, label, self, parent, childDefs;
  if (parsed.level === "trim") {
    label = `${gen.code} ${trim}`; self = slugForSpec({ gen: gen.code, trim }); parent = slugForSpec({ gen: gen.code });
    childDefs = BODIES.flatMap(b => GEARBOXES.map(gb => ({ body: b, gearbox: gb, slug: slugForSpec({ gen: gen.code, trim, body: b, gearbox: gb }) })));
  } else if (parsed.level === "gen") {
    label = `${gen.code} 911`; self = slugForSpec({ gen: gen.code }); parent = "/cars/porsche/911";
    childDefs = (TRIMS_BY_GEN[gen.slug] || []).map(t => ({ trim: t, slug: slugForSpec({ gen: gen.code, trim: t }) }));
  } else { // model
    label = "Porsche 911"; self = "/cars/porsche/911"; parent = null;
    childDefs = GENS_911.map(g => ({ genSlug: g.slug, code: g.code, slug: `/cars/porsche/911/${g.slug}` }));
  }

  const rows = parsed.level === "model"
    ? null
    : await poolFor(gen, trim, null, env, asOf);   // trim-hub: gen+trim, all bodies/gearboxes
  const st = parsed.level === "model" ? null : statsFor(rows, null);

  // Child table: each child's count / middle-half / indexable (one read per child).
  const children = [];
  for (const c of childDefs) {
    let cRows, cSt;
    if (parsed.level === "trim") { cRows = (rows || []); cSt = statsFor(cRows.filter(r => { const rb = (r.body || "").toLowerCase(); return true; }), c.gearbox); if (c.body) cSt = statsFor((await poolFor(gen, trim, c.body, env, asOf)), c.gearbox); }
    else if (parsed.level === "gen") cSt = statsFor(await poolFor(gen, c.trim, null, env, asOf), null);
    else { const cg = genBySlug(c.genSlug); cSt = statsFor(await poolFor(cg, null, null, env, asOf), null); }
    children.push({ slug: c.slug, count: cSt.count, middleHalf: [cSt.midLow, cSt.midHigh], indexable: cSt.indexable });
  }

  const out = {
    slug: self, level: parsed.level, label, asOf: asOfISO, windowDays: 365,
    parent, siblings: [], children
  };
  if (st) {
    const [repeats, live] = await Promise.all([repeatVins(st.pool, env), liveCount(gen, trim, null, env)]);
    Object.assign(out, {
      count: st.count, low: st.low, high: st.high, middleHalf: [st.midLow, st.midHigh],
      indexable: st.indexable, indexReason: st.reason, lead: leadSentence(label, st, asOf),
      recentSales: recentSales(st.pool), repeatVins: repeats, liveListings: live
    });
  } else {
    // Model hub aggregates its children's counts (no single pool read of all 911s).
    const total = children.reduce((s, c) => s + (c.count || 0), 0);
    Object.assign(out, { count: total, low: null, high: null, middleHalf: [null, null], indexable: total >= 8, indexReason: null, lead: `As of ${asOfISO}, ${total} Porsche 911 sales across ${children.length} generations are on record in the last 12 months.`, recentSales: [], repeatVins: [], liveListings: null });
  }
  return out;
}

// Enumerate every 911 spec the engine produces (901 -> 992): all hubs + every leaf in the matrix.
export function allSpecSlugs911() {
  const slugs = ["/cars/porsche/911"];
  for (const g of GENS_911) {
    slugs.push(`/cars/porsche/911/${g.slug}`);
    for (const trim of (TRIMS_BY_GEN[g.slug] || [])) {
      slugs.push(slugForSpec({ gen: g.code, trim }));
      for (const body of BODIES) for (const gearbox of GEARBOXES) slugs.push(slugForSpec({ gen: g.code, trim, body, gearbox }));
    }
  }
  return slugs;
}

export const __specMeta = { GENS_911, TRIMS_BY_GEN, BODIES, GEARBOXES };
