// Sam Desk page ("ask the whole market") worked example (Lane A, Oct 2026). Runs the SAME engine
// Market Check, Buy and Sell use (api/_historyData.js oneBoxFor -> lib/onebox.js runOneBox - never a
// second implementation) for three real, year-pinned Porsche 911 generations, so the ASK/REFINE/
// COMPARE/VERIFY steps on /business are real numbers, never typed in.
//
// A BARE "Porsche 911" (no year) cannot be used directly: it lands on tier "generation_choice" and
// the capped whole-nameplate retry measured live at 15000ms+ twice, never returning a card (see
// api/_historyData.js oneBoxFor's own comment) - OCD files modern 911s under their chassis code, so a
// pooled all-generations query is not a fast path today. Instead this resolves THREE year-pinned
// generations directly (each a normal, fast single-generation call, same as any other car on this
// site) and composes the demo from their real fields:
//   ASK    = the sum of each generation's own soldCount (engine's own word-or-number, see countWord)
//   REFINE = the three generations themselves, each with its own real soldCount - a genuine small
//            table, not exhaustive back to the 1963 original (bounded to keep this build fast)
//   COMPARE = the newest generation's own yoyDirection (recentBand/priorBand, the engine's real
//             twelve-month-vs-twelve-month read - the task asked for "the last three months versus
//             the six before it"; the engine's native window is twelve-vs-twelve months, so the copy
//             on /business says twelve months, not three - flagged in docs/lane-notes.md for Lane B)
//   VERIFY = that same generation's own real cards (d.cards), first three
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { oneBoxFor, familyOf } from "../../api/_historyData.js";
import { supabaseSelect, supabaseInsert } from "../_supabase.js";

// Representative year per generation, chosen to land inside each generation's own production span
// (lib/generations.js CURATED_GENERATIONS: 997 2005-2012, 991 2012-2019, 992 2019+). Queried by the
// CHASSIS CODE, not "Porsche 911" - OCD files modern 911s under their chassis code as its own model
// string, so "Porsche 997"/"991"/"992" resolves straight to a normal tier:"result" (generationsForModel
// returns exactly one row for a literal chassis-code model, so no generation_choice ask fires - see
// docs/lane-notes.md). A bare "Porsche 911" (any year) hits the curated 911 rule's generation-ask
// gate instead and must never be queried directly here.
const GENS = [
  { code: "997", text: "2008 Porsche 997" },
  { code: "991", text: "2015 Porsche 991" },
  { code: "992", text: "2021 Porsche 992" }
];
const EXAMPLE_KEY = "business|sam-desk-example|v1";
const TTL = 24 * 3600e3;
const MIN_SALES = 5;

async function resolveId(text) {
  const r = await resolveVehicle(text, {});
  const v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null;
  if (!v || !v.make || !v.model) return null;
  return { year: v.year, make: v.make, model: v.model, trim: v.trim || null, family: familyOf(v), genCode: v.genCode || null, bodyStyle: v.bodyStyle || null, vehicle: v };
}

async function buildOne(env, gen) {
  const id = await resolveId(gen.text);
  if (!id) return null;
  const d = await oneBoxFor(env, id, null);
  if (!d || d.tier !== "result" || !Array.isArray(d.cluster) || d.cluster.length !== 2) return null;
  const cards = Array.isArray(d.cards) ? d.cards.filter(c => Number(c.price) > 0) : [];
  if (cards.length < MIN_SALES) return null;
  return {
    code: id.genCode || gen.code,
    label: `${id.genCode || gen.code} (${id.year ? id.year : ""})`,
    // d.poolN (lib/onebox.js: "poolN: solid.length") is the raw integer the engine's own soldCount
    // word-ifies for prose under ten - reading poolN directly skips that round trip entirely.
    soldCount: Number(d.poolN) || 0,
    windowLabel: d.windowLabel || null,
    cluster: [Number(d.cluster[0]), Number(d.cluster[1])],
    yoyDirection: d.yoyDirection || null,
    cards: cards.slice(0, 3).map(c => ({
      price: c.price, mileageText: c.mileageText || null, platform: c.platform || null,
      platformSlug: c.platformSlug || null, date: c.date || null, month: c.month || null,
      title: c.title || null, image: c.image || null, url: c.url || null
    }))
  };
}

// Returns { gens: [...], totalSoldCount, windowLabel, compare: {gen, yoyDirection}, verify: [cards] }
// or null when fewer than two generations clear the honesty floor (never a thin or invented demo).
async function build() {
  const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
  if (!env.supabaseUrl || !env.supabaseKey) { console.error("deskExample build: no Supabase env"); return null; }
  const results = (await Promise.all(GENS.map(g => buildOne(env, g).catch(e => { console.error("deskExample build:", g.text, e && e.message); return null; })))).filter(Boolean);
  if (results.length < 2) { console.error("deskExample build: fewer than 2 generations cleared the floor,", results.length); return null; }
  const totalSoldCount = results.reduce((s, r) => s + r.soldCount, 0);
  const newest = results[results.length - 1];
  return {
    gens: results.map(r => ({ code: r.code, label: r.label, soldCount: r.soldCount, cluster: r.cluster })),
    totalSoldCount,
    windowLabel: newest.windowLabel,
    compare: newest.yoyDirection ? { genCode: newest.code, yoyDirection: newest.yoyDirection } : null,
    verify: newest.cards
  };
}

let cache = { at: 0, data: undefined }, inflight = null;
async function readStored(env) {
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(EXAMPLE_KEY)}&select=market,computed_at&limit=1`).catch(() => null);
  const r = rows && rows[0];
  return r && Date.now() - Date.parse(r.computed_at) < TTL ? { data: r.market, at: Date.parse(r.computed_at) } : null;
}
async function store(env, data) {
  try { await supabaseInsert("spec_market_cache", [{ spec_key: EXAMPLE_KEY, market: data, low_usd: data ? data.gens[0].cluster[0] : null, high_usd: data ? data.gens[data.gens.length - 1].cluster[1] : null, sale_count: data ? data.totalSoldCount : null, computed_at: new Date().toISOString() }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=spec_key"); }
  catch { /* best-effort */ }
}

export async function deskExample(waitMs = 4000, opts = {}) {
  const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
  if (!env.supabaseUrl || !env.supabaseKey) return null;
  if (opts.fresh) { const d = await build(); cache = { at: Date.now(), data: d }; await store(env, d); return d; }
  if (cache.data !== undefined && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) inflight = (async () => {
    const st = await readStored(env);
    if (st) { cache = { at: st.at, data: st.data }; return st.data; }
    const d = await build();
    cache = { at: Date.now(), data: d }; await store(env, d); return d;
  })().catch(e => { console.error("deskExample:", e && e.message); cache = { at: Date.now() - TTL + 300e3, data: null }; return null; }).finally(() => { inflight = null; });
  const p = inflight;
  return Promise.race([p, new Promise(res => setTimeout(() => res(undefined), waitMs))]);
}
