// The car-only Sell block (Lane B, Oct 26 2026, "make Sell fast, whole and current"). Everything on a Sell result that
// depends only on the CAR, computed once from the engine's own answer (one oneEngineAnswer call, or the stored MCWARM
// answer sellerDecision reads) and stored under the engine stamp:
//   key  sell|v13|<ENGINE_VERSION>|<specKey>      (no UTC day, no typed label)
//   the engine's first answer (refusal / question / no range), the venue counts (placesFor on the answer's pool),
//   the three latest sales, the value for the partner gate, the platform pick (online, and the rush variant),
//   best_day and reserve_split from the answer.
// The visitor part (state for the partner match, the pick's copy, the order of the cards) is computed at request
// time in lib/sell/sellFlow.js from this block. Nothing here reads fetchQualifying: the pool is the answer's rawPool.
import { oneEngineAnswer, bestDayOf, isSingerPorsche, ENGINE_VERSION } from "../onebox.js";
import { specKeyFor, warmAnswerKeyFor, readWarmAnswerDetailed, writeWarmAnswer, answerCacheable, engineWaitMs, engineSettleMs } from "../live/search.js";
import { keepAlive } from "../keepAlive.js";
import { supabaseSelect } from "../_supabase.js";
import { currentEpoch } from "../_epoch.js";
import { pickPlatform } from "../platformPick.js";
import { resolveSellCar, placesFor, recentSales, poolValueUsd, refusalOf, choiceOf, noRangeOf, capped } from "./sellFacts.js";

export const SELL_BLOCK_V = 13;
const BLOCK_TTL_MS = 24 * 3600e3;
const vEngineOf = car => car.vEngine || car.v;
const gEngineOf = car => (car.vEngine ? car.generationEngine : car.generation);
export function blockKeyFor(car) { return "sell|v" + SELL_BLOCK_V + "|" + ENGINE_VERSION + "|" + specKeyFor(vEngineOf(car), gEngineOf(car) || null, null); }

const mem = new Map();
export function forgetBlocks() { mem.clear(); }   // the instance memory only (the check drops it to read the table)
export async function readBlock(env, key) {
  const m = mem.get(key);
  if (m && Date.now() - m.at < 10 * 60e3) return m.block;
  try {
    const r = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market,computed_at&limit=1`);
    const row = Array.isArray(r) && r[0];
    if (!row || !row.market || row.market.kind !== "sellblock" || row.market.engineVersion !== ENGINE_VERSION || row.market.blockV !== SELL_BLOCK_V) return null;
    const at = Date.parse(row.computed_at);
    if (!Number.isFinite(at) || Date.now() - at >= BLOCK_TTL_MS) return null;
    const epoch = await currentEpoch(env).catch(() => null);
    const block = { ...row.market, stale: !!(epoch && row.market.warmEpoch && row.market.warmEpoch !== epoch) };
    mem.set(key, { at: Date.now(), block }); if (mem.size > 300) mem.delete(mem.keys().next().value);
    return block;
  } catch { return null; }
}
export async function writeBlock(env, key, block) {
  mem.set(key, { at: Date.now(), block });
  const total = block.places ? Number(block.places.total) || 0 : 0;
  await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST",
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ spec_key: key, market: block, sale_count: total, computed_at: new Date().toISOString() }]) }).catch(() => {});
}

// The stored Market Check answer first (the same row and the same stamp rule sellerDecision reads), the engine only when there is none.
// A Singer car never reads the plain car's row (it resolves to the same key). One engine call at most, asked 0 the way Market Check asks.
export async function answerFor(car, env, timings) {
  const vE = vEngineOf(car), gE = gEngineOf(car) || null, text = car.v.raw || car.label;
  const key = warmAnswerKeyFor(vE, gE, null);
  const singer = isSingerPorsche(text, vE);
  if (!singer) {
    const st = await capped("stored_answer", timings, () => readWarmAnswerDetailed(env, key), STORED_READ_MS);   // a stored read is one small row: a 2 s cap dropped it under database load and sent the visit to a cold compute (Oct 29 2026)
    const raw = st && st.raw;
    const poolTier = raw && /^(result|thin|refusal)$/.test(String(raw.tier || ""));
    if (raw && (!poolTier || Array.isArray(raw.rawPool))) { timings.answer = "stored"; if (st.stale) timings.stale = true; return raw; }
  }
  timings.answer = "engine"; timings.engineCalls = (timings.engineCalls || 0) + 1;
  const t0 = Date.now();
  // THE ENGINE NEVER HOLDS THE PAGE FOR EVER (Lane B, Oct 29 2026, Sam's live 2004 Porsche 911 Carrera: a wait with a bar that never ended): the compute races the engine's own wait; past it the page gets the engine's own "still being read" line and the
  // compute finishes behind the response (keepAlive) and stores its row, so the next ask is a stored read. A compute that throws is the same plain line, never a silent end.
  const run = oneEngineAnswer(vE, gE, text, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 0, ...(env.poolSeed ? { poolSeed: env.poolSeed } : {}) }, null).catch(() => null);
  const capMs = Number(env && env.sellEngineMs) > 0 ? Number(env.sellEngineMs) : engineWaitMs() - engineSettleMs();   // the engine's own wait (lib/live/search.js), less the settle time, so the engine's "still being read" line arrives before the page's deadline
  const TIMEOUT = Symbol("timeout"); let timer;
  const first = await Promise.race([run, new Promise(res => { timer = setTimeout(() => res(TIMEOUT), capMs); })]); clearTimeout(timer);
  if (first === TIMEOUT) { timings.engine = capMs; timings.timedOut = true; if (!env.noStore) keepAlive(run.then(async a2 => { const d2 = a2 && a2.raw; if (d2 && !singer && answerCacheable(d2) && !/_choice$/.test(String(d2.tier || ""))) await writeWarmAnswer(env, key, slimOf(d2)).catch(() => {}); }).catch(() => {})); return null; }
  let a = first; timings.engine = Date.now() - t0;
  let d = a && a.raw ? a.raw : null;
  // A QUESTION SELL CANNOT SHOW is answered by the pooled read (the read the Find ladder takes, asked 2): a trim, documented-history, variant or model question has no card in Sell, so the page would end on nothing. Generation and body questions keep their own screen.
  if (d && /_choice$/.test(String(d.tier || "")) && !/^(generation|body)_choice$/.test(String(d.tier))) {
    const left = Math.max(1000, capMs - (Date.now() - t0));
    const a2 = await Promise.race([oneEngineAnswer(vE, gE, text, { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, asked: 2, qelig: "compute", ...(env.poolSeed ? { poolSeed: env.poolSeed } : {}) }, null).catch(() => null), new Promise(res => setTimeout(() => res(null), left))]);
    const d2 = a2 && a2.raw ? a2.raw : null;
    if (d2 && !/_choice$/.test(String(d2.tier || ""))) { d = { ...d2, escalatedFrom: { tier: d.tier } }; timings.escalated = true; }
  }
  if (d && !singer && !env.noStore && !timings.escalated && answerCacheable(d) && !/_choice$/.test(String(d.tier || ""))) {
    writeWarmAnswer(env, key, slimOf(d)).catch(() => {});
  }
  return d;
}
export const STORED_READ_MS = 8000;
function slimOf(d) {
  const slim = { ...d };
  if (slim.dedup && typeof slim.dedup === "object") { const { excluded, abroad, fetchMemo, ...keep } = slim.dedup; slim.dedup = keep; }
  if (slim.htMeta && typeof slim.htMeta === "object") { const { receipts, pairs, cards, rawPool, ...keep } = slim.htMeta; slim.htMeta = keep; }
  return slim;
}

// The block from one answer. Each read that stays (sold_through, the pick's venue counts) runs in parallel under the 2 second cap;
// a piece past its cap is left out and named in timings.dropped. Never stored with a piece missing.
export async function buildBlock(car, d, env, timings) {
  const first = { refusal: refusalOf(d), question: choiceOf(d), noRange: noRangeOf(d) };
  const base = { kind: "sellblock", blockV: SELL_BLOCK_V, engineVersion: ENGINE_VERSION, warmEpoch: await currentEpoch(env).catch(() => null), builtAt: new Date().toISOString(), first };
  if (!d || first.refusal || first.question || first.noRange) return base;
  const vE = vEngineOf(car), gE = gEngineOf(car) || null;
  const cc = { ...car, env };
  const crit = timeline => ({ timeline, sellerPreference: null, involvement: null });
  const [pl, pickOnline, pickSpeed] = await Promise.all([
    placesFor(cc, d, timings),
    capped("pick", timings, () => pickPlatform(vE, gE, env, crit(null), d)),
    capped("pick_rush", timings, () => pickPlatform(vE, gE, env, crit("ASAP"), d))
  ]);
  const { _pool, _spec, ...places } = pl;
  const recent = recentSales(pl, 12);
  const extra = recent.slice(3).find(s => s.photo);
  return { ...base, places, recent: recent.slice(0, 3), extraPhoto: extra ? { photo: extra.photo, title: extra.title } : null, value_usd: poolValueUsd(_pool),
    pickOnline, pickSpeed, best_day: d.best_day !== undefined ? d.best_day : bestDayOf(d), reserve_split: d.reserve_split || null };
}

// The nightly warm: store the car-only block for a spec the warm has just answered. text is the words the warm asked with; the car is
// resolved the way a Sell visit resolves it, and the block is stored only when that car's key is the warm answer's own key.
export async function warmSellBlock(env, text, d, expectKey) {
  const out = { stored: false };
  try {
    const sc = await resolveSellCar(text, env);
    if (!sc.car) return { ...out, why: "unresolved" };
    const car = { ...sc.car, env };
    if (expectKey && warmAnswerKeyFor(vEngineOf(car), gEngineOf(car) || null, null) !== expectKey) return { ...out, why: "key_differs" };
    const timings = {};
    const block = await buildBlock(car, d, env, timings);
    if (timings.dropped && timings.dropped.length) return { ...out, why: "dropped:" + timings.dropped.join(",") };
    await writeBlock(env, blockKeyFor(car), block);
    return { stored: true };
  } catch (e) { return { ...out, why: String(e && e.message || e).slice(0, 80) }; }
}
