// MARKET CHECK AND SELL ENTRY EXAMPLES, IN LANE E'S SHAPES (Lane B, Nov 8 2026; CREW ONLY, NOT LIVE until Sam says so in writing). Lane E's reader (lib/preview/mcSellPreview.js exampleSalesOf, sellExampleOf, read by api/crewPage.js from THIS file) wins over the first
// shapes Lane B posted (lib/live/entryExamples.js): where the two differ, this file speaks Lane E's.
//   marketCheckExampleSales(env, req) -> { pickDate, model, poolN, line, sales: [ { title, soldLine, mileageLine, platformLine, dateLine, photo_url, url } x3 ] } or null
//   sellExample(env, req)             -> { pickDate, note, cars: [ { title, line, url } x2 or x3 ] } or null
// Market Check: three completed sales of the day's model chosen from the pool Market Check prints (the engine, lib/live/entryExamples.js buildMarketCheckExample), each with a photo that passed the photo rule (a 200 image under 600 KB) and a link to the sale; a sale without them is never a card.
// Sell: two or three cars, each the Sell engine's own record of that car by venue (lib/sell/sellFacts.js placesFor): the sales counted and where they sold, one reason table sentence per car (entry.sell_car); no promise of a price anywhere.
// The pick is made once per Pacific date and is the same for every visitor (completed sales do not end); the photos of a stored pick are re-checked at most once an hour on a crew read, and a pick whose photo has gone is built again, else the section is hidden.
// Fallback is no field (the section is hidden), never an invented card. Kill switches: CREW_MC_EXAMPLES=0 and CREW_SELL_EXAMPLE=0 (crew_mc_examples, crew_sell_example); the first build's older switches MC_EXAMPLE_SALES=0 and SELL_EXAMPLE_FIELD=0 still work. Zero OldCarsData.
import { defaultDeps, daily, buildMarketCheckExample, RESULT_FIELDS, platformsOf, SELL_CANDIDATES, MC_CANDIDATES, MC_KEY, STORE_V, BUILD_BUDGET_MS, BUILD_TOTAL_MS } from "./entryExamples.js";
import { reasonLine, venueSplitWords } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";
import { choosePhoto, photoCandidates } from "./photoRule.js";
import { ptDateKey } from "./findExamples.js";
import { withClock } from "./withClock.js";
import { genuinePhoto } from "./featuredHistory.js";

export const MC_STORE = MC_KEY, SELL_STORE = "crew_sell_example_cars", RECHECK_MS = 3600000;
const CHECKED = new Map();
export const resetRecheck = () => CHECKED.clear();   // for the checks
const hashOf = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rotate = (list, dateKey, salt) => { const k = hashOf(salt + ":" + dateKey) % list.length; return list.slice(k).concat(list.slice(0, k)); };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const https = u => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u);

// the stored pick (entryExamples' own shape) in Lane E's shape; null unless all three sales are complete
export function mcShape(data) {
  if (!data || !Array.isArray(data.sales) || data.sales.length !== 3) return null;
  const sales = data.sales.map(s => ({ title: String(s.title || "").trim(), soldLine: s.priceLabel || "", mileageLine: s.milesLabel || "", platformLine: String(s.platform || "").trim(), dateLine: s.dateLine || "", photo_url: https(s.photo) ? s.photo : "", url: https(s.url) ? s.url : "" }));
  return sales.every(s => s.title && s.soldLine && s.photo_url && s.url) ? { pickDate: data.pickDate, model: data.model, poolN: data.poolN, line: data.line, sales } : null;
}
// the result of the same pick, in the answer's own fields: null unless it is a result with a sales table and all three example sales are rows of that table (the same sale url)
export function mcResultShape(data) {
  const r = data && data.result, sales = data && Array.isArray(data.sales) ? data.sales : [];
  if (!r || r.tier !== "result" || !Array.isArray(r.cards) || sales.length !== 3) return null;
  const urls = new Set(r.cards.map(c => c && c.url).filter(Boolean));
  if (!sales.every(s => s && urls.has(s.url))) return null;
  const result = {}; for (const k of RESULT_FIELDS) if (r[k] !== undefined) result[k] = r[k];
  return { pickDate: data.pickDate, model: data.model, result };
}
// the Sell cars: up to three of the day's rotation, each with at least eight sales over at least two venues of three or more sales
// WHY THE FIELD CAME BACK EMPTY ON THE LIVE PREVIEW (Lane B, Nov 9 2026, from the code; no production read): the build asked the candidates ONE AT A TIME, each under its own 20 second clock and with no limit on the whole,
// and it needs two or three cars where Market Check's example needs one. Seven cold Sell reads (each the engine's pool plus the sold-through reads) can run past what one request is given; the request ends, nothing is stored, and the page
// shows no section and no error. The failures inside were also swallowed (a read that threw looked like a car with no record), so nothing said which. Now: SELL_PARALLEL candidates are asked at a time (three, the heavy-read rule),
// the whole build has one clock (SELL_BUILD_MS) and keeps the cars found by then, a candidate that threw, timed out or was too thin is counted, and a build that finds fewer than two cars logs why (tag crew_sell_example_miss).
export const SELL_PARALLEL = 3, SELL_BUILD_MS = 45000;
export async function buildSellCars(env, d, dateKey) {
  const each = d.budgetMs || BUILD_BUDGET_MS, all = d.buildMs || SELL_BUILD_MS, list = rotate(SELL_CANDIDATES, dateKey, "sellcars"), found = [], why = {};
  let next = 0;
  const one = async (text, i) => {
    let pl = null; try { pl = await withClock(d.places(env, text), each); } catch { why[text] = "threw"; return; }
    if (!pl) { why[text] = "no_record_or_clock"; return; }
    const platforms = platformsOf(pl), total = platforms.reduce((t, p) => t + p.sales, 0);
    if (platforms.length < 2) { why[text] = "under_two_venues"; return; }
    if (total < 8) { why[text] = "under_eight_sales"; return; }
    const title = pl.cohort_name ? String(pl.cohort_name) : text;
    found.push({ i, car: { title, line: reasonLine("entry.sell_car", { sales: countNoun(total, "sale", { words: false }), window: pl.window_label || (Number(pl.window_months) > 0 ? `in the last ${Number(pl.window_months)} months` : ""), split: venueSplitWords(platforms) }), url: "/sell?car=" + encodeURIComponent(text).replace(/%20/g, "%20") } });
  };
  const worker = async () => { while (found.length < 3 && next < list.length) { const i = next++; await one(list[i], i); } };
  await withClock(Promise.all(Array.from({ length: Math.min(SELL_PARALLEL, list.length) }, worker)), all);
  const cars = found.slice().sort((a, b) => a.i - b.i).slice(0, 3).map(x => x.car);
  if (cars.length < 2) { try { console.error(JSON.stringify({ tag: "crew_sell_example_miss", day: dateKey, found: cars.length, tried: Object.keys(why).length, notTried: list.length - next, reasons: why })); } catch {} }
  return cars.length >= 2 ? { pickDate: dateKey, note: reasonLine("entry.sell_note"), cars } : null;
}
export const sellShape = data => (data && Array.isArray(data.cars) && data.cars.length >= 2 && data.cars.length <= 3 && data.cars.every(c => c && c.title && c.line) ? data : null);

// once an hour a stored pick's photos are checked again; a sale whose photo has gone makes the pick be built again, and if it cannot be, there is no field
async function stillGood(env, d, key, data, build) {
  if (!data) return data;
  const last = CHECKED.get(key); if (last && d.now() - last < RECHECK_MS) return data;
  CHECKED.set(key, d.now());
  const photos = [...(data.sales || []).map(s => s.photo), ...(data.recentSale ? [data.photo, data.recentSale.photo] : [])].filter((x, i, arr) => x && arr.indexOf(x) === i);
  if (!photos.length) return data;
  const res = await Promise.all(photos.map(p => choosePhoto(photoCandidates({ photo_url: p }), d.head)));
  if (res.every(Boolean)) return data;
  let built = null; try { built = await build(env, d, data.pickDate); } catch { built = null; }
  if (!built) return null;
  try { await d.write(env, { key, value: { v: STORE_V, data: built, builtAt: new Date(d.now()).toISOString() } }); } catch {}
  return built;
}
export async function marketCheckExampleSales(env, req, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const data = await daily(env, req, d, { off: "CREW_MC_EXAMPLES", also: ["MC_EXAMPLE_SALES"], key: MC_STORE, build: buildMarketCheckExample });
  return mcShape(await stillGood(env, d, MC_STORE, data, buildMarketCheckExample));
}
export async function marketCheckExampleResult(env, req, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const data = await daily(env, req, d, { off: "CREW_MC_EXAMPLES", also: ["MC_EXAMPLE_SALES"], key: MC_STORE, build: buildMarketCheckExample });
  return mcResultShape(await stillGood(env, d, MC_STORE, data, buildMarketCheckExample));
}
// ---- THE MARKET CHECK ENTRY CARD (Lane B, Nov 9 2026, the final entry-page brief; CREW ONLY): one car a day, { pickDate, model, titleLine, photo, range:{low,high}, rangeLine, countLine, periodLine, recentSale:{price, priceLine, platform, milesLine, metaLine, url, photo}, resultUrl }.
// The range, the count and the period are ONE evidence population, the engine's own: the answer's referenceFigure (rangeLow, rangeHigh, salesCount, windowLabel), never narrowed; the recent sale is the newest sale card of that same answer with a hammer price, a photo that passes the photo rule and a venue.
// Among the candidates that give a result the one with the most focused range (the width of the figure's range against its middle) is the day's pick. Every sentence is a reason table line (mc.card_*); the page prints them as sent.
export const MC_CARD_KEY = "crew_mc_example_card", MC_CARD_PARALLEL = 3, MC_CARD_QUALIFIERS = 4;
const MC_CARD_STORE = MC_CARD_KEY;
export const focusOf = f => { const lo = num(f.rangeLow), hi = num(f.rangeHigh); return lo > 0 && hi >= lo ? (hi - lo) / ((hi + lo) / 2) : null; };
const newestFirst = (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.url).localeCompare(String(b.url));
const cardSaleOk = c => num(c.price) > 0 && num(c.mi) > 0 && !c.milesHidden && genuinePhoto(c.image) && https(c.image) && https(c.url) && /\S/.test(String(c.platformName || c.platform || "")) && /^\d{4}-\d{2}-\d{2}/.test(String(c.date || ""));
export async function cardOfAnswer(a, text, d) {
  if (!a || a.failedRead || a.tier !== "result" || !Array.isArray(a.cards) || !a.referenceFigure) return null;
  const f = a.referenceFigure, lo = num(f.rangeLow), hi = num(f.rangeHigh), n = num(f.salesCount);
  if (!(lo > 0) || !(hi >= lo) || !(n > 0) || !String(f.windowLabel || "").trim() || !String(a.titleLine || "").trim()) return null;
  // the recent sale: the newest sale of the answer's own cards that passes the photo rule; the card photo: the next newest that does
  const sales = a.cards.filter(cardSaleOk).sort(newestFirst), good = [];
  for (const c of sales) { if (good.length >= 2) break; if (await choosePhoto(photoCandidates({ photo_url: c.image }), d.head)) good.push(c); }
  if (!good.length) return null;
  const rs = good[0], pic = (good[1] || good[0]).image;
  const title = String(a.titleLine).trim();
  return { model: text, titleLine: title, photo: pic, range: { low: Math.round(lo), high: Math.round(hi) }, rangeLine: reasonLine("mc.card_range", { lo: Math.round(lo), hi: Math.round(hi) }), countLine: reasonLine("mc.card_count", { n }), periodLine: reasonLine("mc.card_period", { label: f.windowLabel }),
    recentSale: { price: Math.round(rs.price), priceLine: reasonLine("mc.card_sale", { price: Math.round(rs.price) }), platform: String(rs.platformName || rs.platform).trim(), milesLine: reasonLine("tasks.demo_miles", { miles: Math.round(rs.mi) }), metaLine: reasonLine("mc.card_sale_meta", { platform: String(rs.platformName || rs.platform).trim(), miles: reasonLine("tasks.demo_miles", { miles: Math.round(rs.mi) }) }), url: rs.url, photo: rs.image },
    resultUrl: "/market-check?q=" + encodeURIComponent(title), focus: focusOf(f) };
}
export async function buildMcCard(env, d, dateKey) {
  const list = rotate(MC_CANDIDATES, dateKey, "mccard"), all = d.buildMs || BUILD_TOTAL_MS, each = d.budgetMs || BUILD_BUDGET_MS, found = []; let next = 0;
  const one = async text => { let a = null; try { a = await withClock(d.answer(env, text), each); } catch { return; } let c = null; try { c = await cardOfAnswer(a, text, d); } catch { c = null; } if (c) found.push(c); };
  const worker = async () => { while (found.length < MC_CARD_QUALIFIERS && next < list.length) await one(list[next++]); };
  try { await withClock(Promise.all(Array.from({ length: Math.min(MC_CARD_PARALLEL, list.length) }, worker)), all); } catch {}
  if (!found.length) return null;
  const best = found.slice().sort((x, y) => (x.focus ?? 9) - (y.focus ?? 9) || list.indexOf(x.model) - list.indexOf(y.model))[0], { focus, ...rest } = best;
  return { pickDate: dateKey, ...rest };
}
export const mcCardShape = data => {
  if (!data || typeof data !== "object") return null;
  const r = data.recentSale, g = data.range;
  const ok = String(data.titleLine || "").trim() && https(data.photo) && g && num(g.low) > 0 && num(g.high) >= num(g.low) && String(data.countLine || "") && String(data.periodLine || "") && r && num(r.price) > 0 && String(r.platform || "").trim() && String(r.milesLine || "") && https(r.url) && https(r.photo) && /^\//.test(String(data.resultUrl || ""));
  return ok ? data : null;
};
export async function marketCheckExample(env, req, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const data = await daily(env, req, d, { off: "CREW_MC_EXAMPLES", also: ["MC_EXAMPLE_SALES"], key: MC_CARD_STORE, build: buildMcCard });
  return mcCardShape(await stillGood(env, d, MC_CARD_STORE, data, buildMcCard));
}
export async function sellExample(env, req, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  return sellShape(await daily(env, req, d, { off: "CREW_SELL_EXAMPLE", also: ["SELL_EXAMPLE_FIELD"], key: SELL_STORE, build: buildSellCars }));
}
export { ptDateKey, num };
