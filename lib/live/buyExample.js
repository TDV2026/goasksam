// The Buy landing's "A real example" band and its example chips (Lane C, Oct 2026). Tries a short list of
// searches that usually have plenty of live cars, through the SAME search the live Buy page runs for typed
// text (lib/live/converse.js converse) and the same card shapes (api/buySearch.js cardOf + nameOf) and the
// same sold-sales engine (lib/live/search.js listingMarket: the exact-spec range and its latest sales).
// A search qualifies with three or more live US cars that confirm every filter; the first qualifying one
// with a sold range is the example; the first three qualifying ones are the chips, so every chip returns
// real cars. None qualifies: the band and the chips are hidden. Cached one hour, in this instance's memory
// and in spec_market_cache (key EXAMPLE_KEY) so a cold instance reads one row instead of re-searching.
import { converse } from "./converse.js";
import { listingMarket, specOf, refreshSpec, cardFlag } from "./search.js";
import { cardOf, nameOf } from "../../api/buySearch.js";
import { supabaseSelect } from "../_supabase.js";

export const CANDIDATES = ["manual 997 Carrera S under $70k", "air-cooled Porsche 911", "Ford Mustang Fastback", "Porsche 911 under $100k", "BMW M3", "Mercedes-Benz SL", "Chevrolet Corvette", "Toyota Land Cruiser"];
const TTL = 3600e3, ASIDE = { engine_swap: 1, modified: 1, project: 1 }, EXAMPLE_KEY = "buy|landing-example|v2";
let cache = { at: 0, data: undefined }, inflight = null;

// The query filters the sold range does NOT apply, named so the range line never claims them: the range is
// the exact spec (generation, trim, body); a gearbox only when the engine refined it (its family names it).
function notApplied(f, family) {
  const out = [], fam = String(family || "").toLowerCase();
  if (f && f.gearbox && !/manual|automatic|pdk|tiptronic|dct|smg/.test(fam)) out.push("all gearboxes");
  if (f && f.colours && f.colours.length) out.push("any colour");
  if (f && (f.miMax || f.miMin)) out.push("any mileage");
  return out;
}
async function qualify(env, query) {
  const r = await converse(env, { messages: [query] }).catch(() => null);
  if (!r || r.type !== "results") return null;
  // Confirmed matches only (every filter stated in the listing), never a set-aside car, US cars.
  const ok = (r.matches || []).filter(x => !(x.unknown || []).length && !(cardFlag(x.r) && ASIDE[cardFlag(x.r).kind]) && (!x.r.country || String(x.r.country).toUpperCase() === "US"));
  return ok.length >= 3 ? { query, ok, filters: r.filters || null } : null;
}
async function exampleFrom(env, q) {
  const top = q.ok.slice(0, 3);
  let m = await listingMarket(env, top[0].r, top[0].facts).catch(() => null);
  // An older cached read may predate the sales' title and photo: one fresh read of the same spec.
  if (m && m.kind === "range" && (m.recent || []).some(s => !s.title)) {
    const spec = await specOf(env, top[0].r, top[0].facts).catch(() => null);
    if (spec) { await refreshSpec(env, spec).catch(() => null); m = await listingMarket(env, top[0].r, top[0].facts).catch(() => m); }
  }
  if (!m || m.kind !== "range" || !(m.low > 0) || !(m.high > 0)) return null;
  const cards = await Promise.all(top.map(async x => ({ ...cardOf(x), name: await nameOf(env, x).catch(() => null) })));
  return { query: q.query, sample: cards[0], cards,
    range: { family: m.family, low: m.low, high: m.high, count: m.count || null, window: m.window || null, notApplied: notApplied(q.filters, m.family) },
    recent: (m.recent || []).filter(s => s.price && s.title).slice(0, 3) };
}
async function build(env) {
  const qualifying = [];
  let example = null;
  for (const query of CANDIDATES) {
    const q = await qualify(env, query);
    if (!q) continue;
    qualifying.push(q.query);
    if (!example) example = await exampleFrom(env, q).catch(() => null);
    if (example && qualifying.length >= 3) break;
  }
  return { at: new Date().toISOString(), chips: qualifying.slice(0, 3), example };
}
async function readStored(env) {
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(EXAMPLE_KEY)}&select=market,computed_at&limit=1`).catch(() => null);
  const r = rows && rows[0];
  return r && r.market && Date.now() - Date.parse(r.computed_at) < TTL ? { data: r.market, at: Date.parse(r.computed_at) } : null;
}
async function store(env, data) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ spec_key: EXAMPLE_KEY, market: data, computed_at: new Date().toISOString() }]) });
  } catch { /* best-effort */ }
}

// { chips: [query...], example: {...} | null }, waiting at most `waitMs` (the page never stalls on it):
// memory, then the stored row, then a fresh build (finished in the background for the next request).
export async function exampleBand(env, waitMs = 6000) {
  if (!env) return null;
  if (cache.data !== undefined && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) inflight = (async () => {
    const st = await readStored(env);
    if (st) { cache = { at: st.at, data: st.data }; return st.data; }
    const d = await build(env);
    cache = { at: Date.now(), data: d }; await store(env, d); return d;
  })().catch(e => { console.error("buy example:", e && e.message); cache = { at: Date.now() - TTL + 300e3, data: null }; return null; }).finally(() => { inflight = null; });
  const p = inflight;
  return Promise.race([p, new Promise(res => setTimeout(() => res(undefined), waitMs))]);
}
