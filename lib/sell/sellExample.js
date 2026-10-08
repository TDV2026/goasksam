// The new Sell landing's "An example" band (Lane C, Oct 2026, Sam's approved mock). ONE live example car:
// the first candidate, in Sam's order, for which the SAME result a visitor gets (lib/sell/sellFlow.js
// buildResult: the shared pick lib/platformPick.js, the shared Sell facts, the shared partner gate) returns
// a pick. So the landing shows exactly what entering that car shows: the same platform, the same reasons
// (the figure-free wording built by the same branch as the figured one) and the same three latest sales.
// None returns a pick: null, and the whole band and the recent sales strip are hidden.
// The visitor answers it is matched to: no state named, "I'm not sure yet", "No rush" (the pick reads no
// state; the partner gate's region check sees the US).
// Built nightly into spec_market_cache (key EXAMPLE_KEY) by scripts/buildSellExample.js and read from there;
// cached one hour in this instance's memory; a failed build is retried after 30 seconds. The page waits for a build within a budget (api/sellNext.js, about 8 seconds)
// and never relies on a build finishing after the response is sent.
import { buildResult } from "./sellFlow.js";
import { supabaseSelect } from "../_supabase.js";

export const CANDIDATES = [
  "2008 Porsche 911 Carrera S Coupe",
  "1967 Ford Mustang Fastback",
  "2015 Chevrolet Corvette Z06",
  "1999 Nissan Skyline GT-R",
  "1995 Mazda Miata",
  "1969 Chevrolet Camaro Z/28"
];
export const EXAMPLE_ANSWERS = { state: null, how: "unsure", rush: "none" };
// Memory: one hour, then the stored row is read again. The stored row: built nightly (scripts/
// buildSellExample.js), so it is served until the next night's build (26 hours); older, the page builds
// one within its wait budget. v2: carries bandPhoto.
const TTL = 3600e3, STORED_TTL = 26 * 3600e3, RETRY = 30e3, EXAMPLE_KEY = "sell|landing-example|v2";
let cache = { at: 0, data: undefined, ttl: TTL }, inflight = null;

function reduce(carText, r) {
  const p = r.platform;
  const tiles = [];
  if (p.whyWords) tiles.push({ key: "where", label: "Where they sell", words: p.whyWords });
  for (const b of p.boxes || []) if (b.words) tiles.push({ key: b.key, label: b.label, words: b.words });
  return {
    car: carText, label: r.label, cohort: r.cohort || null,
    platform: { slug: p.slug, name: p.name, house: !!p.house, link: p.link || null },
    tiles,
    // Display only on the landing: whether a specialist would be offered for this car (never a name, never a form).
    partner: !!r.partner,
    bandPhoto: r.bandPhoto || null,
    recent: (r.recent || []).filter(s => s && s.price > 0).map(s => ({ title: s.title || null, price: s.price, house: s.house || null, date: s.date || null, photo: s.photo || null, url: s.url || null }))
  };
}
async function build(env) {
  const tried = [];
  for (const car of CANDIDATES) {
    const r = await buildResult(env, { carText: car, ...EXAMPLE_ANSWERS }).catch(e => { tried.push({ car, error: String(e && e.message || e) }); return null; });
    if (!r) continue;
    tried.push({ car, platform: r.platform ? r.platform.name : null });
    if (r.platform && r.platform.whyWords) return { at: new Date().toISOString(), example: reduce(car, r), tried };
  }
  return { at: new Date().toISOString(), example: null, tried };
}
async function readStored(env) {
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(EXAMPLE_KEY)}&select=market,computed_at&limit=1`).catch(() => null);
  const r = rows && rows[0];
  return r && r.market && r.market.example && Date.now() - Date.parse(r.computed_at) < STORED_TTL ? { data: r.market } : null;
}
async function store(env, data) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ spec_key: EXAMPLE_KEY, market: data, computed_at: new Date().toISOString() }]) });
  } catch { /* best-effort */ }
}

// { example, tried } | null, waiting at most waitMs: memory, then the stored row, then a fresh build.
export async function sellExample(env, waitMs = 8000, opts = {}) {
  if (!env) return null;
  if (opts.fresh) { const d = await build(env); cache = { at: Date.now(), data: d, ttl: d.example ? TTL : RETRY }; if (d.example) await store(env, d); return d; }
  if (cache.data !== undefined && Date.now() - cache.at < cache.ttl) return cache.data;
  if (!inflight) inflight = (async () => {
    const st = await readStored(env);
    if (st) { cache = { at: Date.now(), data: st.data, ttl: TTL }; return st.data; }
    const d = await build(env);
    // A build with no example is kept only 30 seconds, so a passing hiccup never hides the band for an hour.
    cache = { at: Date.now(), data: d, ttl: d.example ? TTL : RETRY };
    if (d.example) await store(env, d);
    return d;
  })().catch(e => { console.error("sell example:", e && e.message); cache = { at: Date.now(), data: null, ttl: RETRY }; return null; }).finally(() => { inflight = null; });
  const p = inflight;
  return Promise.race([p, new Promise(res => setTimeout(() => res(undefined), waitMs))]);
}
