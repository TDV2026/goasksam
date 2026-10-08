// The Buy landing's "A real example" band (Lane C, Oct 2026). Runs the SAME search the live Buy page runs
// for a typed request (lib/live/converse.js converse, the page's own engine) and the same per-car shapes
// (api/buySearch.js cardOf + nameOf) and the same sold-sales engine (lib/live/search.js listingMarket:
// the exact-spec range and its latest sales). Nothing is computed here beyond picking what to show.
// The band shows only when the search has three confirmed live US cars AND the engine returns a range;
// otherwise null and the page hides the band. Cached one hour per instance.
import { converse } from "./converse.js";
import { listingMarket, specOf, refreshSpec, cardFlag } from "./search.js";
import { cardOf, nameOf } from "../../api/buySearch.js";

export const EXAMPLE_QUERY = "manual 997 Carrera S under $70k";
const TTL = 3600e3, ASIDE = { engine_swap: 1, modified: 1, project: 1 };
let cache = { at: 0, data: undefined }, inflight = null;

async function build(env) {
  const r = await converse(env, { messages: [EXAMPLE_QUERY] });
  if (!r || r.type !== "results") return null;
  // Confirmed matches only (every filter stated in the listing), never a set-aside car, US cars.
  const ok = (r.matches || []).filter(x => !(x.unknown || []).length && !(cardFlag(x.r) && ASIDE[cardFlag(x.r).kind]) && (!x.r.country || String(x.r.country).toUpperCase() === "US"));
  // The "Put Sam on it" sample notification: the search's first confirmed live car, so its figures are
  // real (product rule 1), present even when the band itself is hidden.
  const sample = ok[0] ? { ...cardOf(ok[0]), name: await nameOf(env, ok[0]).catch(() => null) } : null;
  if (ok.length < 3) return { hidden: "fewer than three live cars", live: ok.length, sample };
  const top = ok.slice(0, 3);
  const cards = await Promise.all(top.map(async x => ({ ...cardOf(x), name: await nameOf(env, x).catch(() => null) })));
  let m = await listingMarket(env, top[0].r, top[0].facts).catch(() => null);
  // An older cached read may predate the sales' title and photo: one fresh read of the same spec.
  if (m && m.kind === "range" && (m.recent || []).some(s => !s.title)) {
    const spec = await specOf(env, top[0].r, top[0].facts).catch(() => null);
    if (spec) { await refreshSpec(env, spec).catch(() => null); m = await listingMarket(env, top[0].r, top[0].facts).catch(() => m); }
  }
  if (!m || m.kind !== "range" || !(m.low > 0) || !(m.high > 0)) return { hidden: "no sold range", live: ok.length, sample };
  return { query: EXAMPLE_QUERY, sample, cards, range: { family: m.family, low: m.low, high: m.high, count: m.count || null, window: m.window || null }, recent: (m.recent || []).filter(s => s.price && s.title).slice(0, 3) };
}

// The cached band, waiting at most `waitMs` (the page never stalls on it): a cold instance renders
// without the band and the read finishes in the background for the next request.
export async function exampleBand(env, waitMs = 6000) {
  if (cache.data !== undefined && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) inflight = build(env).then(d => { cache = { at: Date.now(), data: d }; return d; }).catch(e => { console.error("buy example:", e && e.message); cache = { at: Date.now() - TTL + 300e3, data: null }; return null; }).finally(() => { inflight = null; });
  const p = inflight;
  return Promise.race([p, new Promise(res => setTimeout(() => res(undefined), waitMs))]);
}
