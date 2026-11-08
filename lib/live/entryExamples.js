// ENTRY PAGE EXAMPLES (Lane B, Nov 8 2026, for Lane E's Market Check and Sell entry pages; CREW ONLY, NOT LIVE until Sam says so in writing). Shapes: docs/lane-notes.md "SHAPES B to E, marketCheckExampleSales and sellExample".
//   marketCheckExampleSales(env, req) -> { pickDate, model, poolN, line, sales: [ { title, photo, price, priceLabel, miles, milesLabel, platform, date, dateLine, url } x3 ] } or null
//   sellExample(env, req)             -> { pickDate, car, line, note, platforms: [ { name, kind, sales, salesLine, range, rangeLine } ] } or null
// Both read the engine: the Market Check example is one model's pool from oneEngineAnswer (the pool Market Check prints), three of its real completed sales chosen to show how MILEAGE moved the price (fewest miles, most miles, the one nearest the middle);
// the Sell example is one model's observed record from the Sell engine (lib/sell/sellFacts.js placesFor: sales per venue, the typical range only where a venue has 8 or more). Nothing is computed for the page: every sentence is a reason table line (entry.*), every figure a pool field.
// COMPLETED SALES DO NOT END, so there is no hourly revalidation: ONE pick per Pacific date (a candidate model chosen by a hash of the date, the next candidate when one does not qualify), stored under a crew key with pickDate, the same for every visitor; the first crew
// read of a day builds it under a time budget; a failed build keeps the last good pick; with none, null. ZERO OldCarsData (the archive). Crew gate: null without the signed crew cookie. Kill switches: MC_EXAMPLE_SALES=0, SELL_EXAMPLE_FIELD=0.
import { supabaseSelect, supabaseInsert } from "../_supabase.js";
import { isCrewRequest } from "../_crew.js";
import { reasonLine } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";
import { genuinePhoto } from "./featuredHistory.js";
import { isFailedRead } from "../tools/_shared.js";
import { ptDateKey } from "./findExamples.js";
import { choosePhoto, photoCandidates, headPhoto } from "./photoRule.js";

export const MC_KEY = "crew_mc_example_sales", SELL_KEY = "crew_sell_example", STORE_V = 1;
export const BUILD_BUDGET_MS = 20000, RETRY_MS = 60000;
const FAILED = new Map();
export const resetRetryGuard = () => FAILED.clear();   // for the checks
export const MC_CANDIDATES = ["2001 BMW M3", "2008 Porsche 911 Carrera S", "1999 Porsche 911 Carrera", "2006 Chevrolet Corvette Z06", "1995 Mazda Miata", "2002 Honda S2000", "1967 Ford Mustang", "1991 Toyota Land Cruiser", "2004 Porsche 911 Carrera", "1969 Chevrolet Camaro"];
export const SELL_CANDIDATES = ["2008 Porsche 911 Carrera S Coupe", "1967 Ford Mustang Fastback", "2015 Chevrolet Corvette Z06", "1999 Nissan Skyline GT-R", "1995 Mazda Miata", "1969 Chevrolet Camaro Z/28", "2001 BMW M3"];
const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ""));
const hashOf = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rotate = (list, dateKey, salt) => { const k = hashOf(salt + ":" + dateKey) % list.length; return list.slice(k).concat(list.slice(0, k)); };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const withClock = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);

export const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  head: headPhoto,   // the photo rule: a 200 under 600 KB at selection (lib/live/photoRule.js)
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  // the pool Market Check prints: the car resolved, then the engine's own answer
  answer: async (env, text) => {
    const [{ resolveVehicle }, { oneEngineAnswer, withReadFields }] = await Promise.all([import("../vehicle.js"), import("../onebox.js")]);
    const r = await resolveVehicle(text, {}), v = r && r.status === "valid" ? r.vehicle : null;
    if (!v) return null;
    const res = await oneEngineAnswer(v, null, text, env, null);
    // A READ THAT DID NOT FINISH IS "TRY AGAIN", NEVER "THIS MODEL HAS NO EXAMPLE": the engine's still-reading answer is a failed read, not a pool (the build keeps the last good pick and asks again in a minute)
    if (isFailedRead(res && res.raw)) return { failedRead: true };
    return res && res.raw ? withReadFields(res.raw, text, v) : null;
  },
  // the Sell engine's record of the car by venue
  places: async (env, text) => {
    const { resolveSellCar, placesFor } = await import("../sell/sellFacts.js");
    const sc = await resolveSellCar(text, env);
    return sc && sc.car ? placesFor({ ...sc.car, env }) : null;
  }
});

// ---- the Market Check example: three sales of one model that show the mileage moving the price
export function mileageCorr(cards) {
  const pts = cards.filter(c => num(c.mi) > 0 && num(c.price) > 0);
  if (pts.length < 5) return 0;
  const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(pts.map(p => p.mi)), ry = rank(pts.map(p => p.price)), n = pts.length, mx = (n - 1) / 2;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - mx); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - mx) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
const saleOk = c => num(c.price) > 0 && num(c.mi) > 0 && !c.milesHidden && genuinePhoto(c.image) && isHttps(c.image) && isHttps(c.url) && /\S/.test(String(c.title || "")) && /\S/.test(String(c.platformName || c.platform || "")) && /^\d{4}-\d{2}-\d{2}/.test(String(c.date || ""));
// three of the pool: fewest miles, most miles, nearest the middle mileage; ordered from fewest miles to most. null when the three do not tell the story.
export function threeSales(cards, floor = 5) {
  const ok = (cards || []).filter(saleOk).slice().sort((a, b) => a.mi - b.mi || String(a.url).localeCompare(String(b.url)));
  if (ok.length < floor) return null;
  const lo = ok[0], hi = ok[ok.length - 1], mid = ok.slice(1, -1).sort((a, b) => Math.abs(a.mi - (lo.mi + hi.mi) / 2) - Math.abs(b.mi - (lo.mi + hi.mi) / 2) || String(a.url).localeCompare(String(b.url)))[0];
  if (!mid || hi.mi < 2 * lo.mi) return null;   // mileage at least twice apart
  const three = [lo, mid, hi], ps = three.map(c => c.price);
  if (Math.max(...ps) < 1.25 * Math.min(...ps)) return null;   // prices at least 25 percent apart
  if (!(lo.price > hi.price)) return null;   // the fewest miles sold for more than the most miles
  return three;
}
export function saleOf(c) {
  const month = c.date.slice(0, 10), mon = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(month.slice(5, 7)) - 1], yr = month.slice(0, 4);
  return { title: String(c.title).trim(), photo: c.image, price: Math.round(c.price), priceLabel: reasonLine("demo.sold_for", { price: Math.round(c.price) }), miles: Math.round(c.mi), milesLabel: reasonLine("tasks.demo_miles", { miles: Math.round(c.mi) }), platform: String(c.platformName || c.platform).trim(), date: month, dateLine: reasonLine("demo.sold_date", { when: `${mon} ${yr}` }), url: c.url };
}
export async function buildMarketCheckExample(env, d, dateKey) {
  const tried = []; let failedReads = 0;
  for (const pass of [8, 5]) {
    for (const text of rotate(MC_CANDIDATES, dateKey, "mc")) {
      let a = null; try { a = await withClock(d.answer(env, text), BUILD_BUDGET_MS); } catch { a = null; }
      if (a && a.failedRead) { failedReads++; tried.push(text); continue; }   // try again later: this model is neither used nor judged
      if (!a || a.tier !== "result" || !Array.isArray(a.cards)) { tried.push(text); continue; }
      const cards = a.cards.filter(c => num(c.price) > 0), poolN = cards.length;
      if (poolN < pass || mileageCorr(cards) > -0.3) { tried.push(text); continue; }   // price falls with mileage across the pool
      // THE PHOTO RULE (Nov 8 2026): each of the three sales' photos is HEADed (a 200 image under 600 KB); a sale whose photo fails is set aside and the three are chosen again from the rest
      let rest = cards, three = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const t = threeSales(rest, pass); if (!t) break;
        const bad = []; for (const c of t) if (!(await choosePhoto(photoCandidates({ photo_url: c.image }), d.head))) bad.push(c);
        if (!bad.length) { three = t; break; }
        rest = rest.filter(x => !bad.includes(x));
      }
      if (!three) { tried.push(text); continue; }
      const sales = three.map(saleOf), since = cards.map(c => String(c.date || "").slice(0, 10)).filter(Boolean).sort()[0];
      const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const sinceWords = since ? `${MON[Number(since.slice(5, 7)) - 1]} ${since.slice(0, 4)}` : null;
      return { pickDate: dateKey, model: text, poolN, line: reasonLine("entry.mc_line", { sales: countNoun(poolN, "sale", { words: false }), since: sinceWords, lo: sales[0].miles.toLocaleString("en-US"), hi: sales[2].miles.toLocaleString("en-US"), pLo: Math.min(...sales.map(x => x.price)), pHi: Math.max(...sales.map(x => x.price)) }), sales };
    }
  }
  return null;
}

// ---- the Sell example: one model's record by venue
export function platformsOf(pl) {
  const places = (pl && Array.isArray(pl.places) ? pl.places : []).filter(p => p && Number(p.sales) >= 3 && /\S/.test(String(p.name || ""))).slice(0, 4);
  return places.map(p => {
    const rg = Array.isArray(p.most_sold_between) && p.most_sold_between.length === 2 && num(p.most_sold_between[0]) > 0 && num(p.most_sold_between[1]) >= num(p.most_sold_between[0]) ? [Math.round(p.most_sold_between[0]), Math.round(p.most_sold_between[1])] : null;
    return { name: String(p.name), kind: p.house ? "auction house" : "auction site", sales: Number(p.sales), salesLine: countNoun(Number(p.sales), "sale", { words: false }), range: rg, rangeLine: rg ? reasonLine("entry.sell_range", { lo: rg[0], hi: rg[1] }) : null };
  });
}
export async function buildSellExample(env, d, dateKey) {
  for (const text of rotate(SELL_CANDIDATES, dateKey, "sell")) {
    let pl = null; try { pl = await withClock(d.places(env, text), BUILD_BUDGET_MS); } catch { pl = null; }
    if (!pl) continue;
    const platforms = platformsOf(pl), total = (pl.places || []).reduce((t, p) => t + (Number(p.sales) || 0), 0);
    if (total < 8 || platforms.length < 2) continue;
    const label = pl.cohort_name ? String(pl.cohort_name) : text;
    return { pickDate: dateKey, car: text, line: reasonLine("entry.sell_line", { sales: countNoun(total, "sale", { words: false }), window: pl.window_label || (Number(pl.window_months) > 0 ? `in the last ${Number(pl.window_months)} months` : ""), cohort: label }), note: reasonLine("entry.sell_note"), platforms };
  }
  return null;
}

// ---- the daily pick, stored; the same for every visitor
async function readStore(env, d, key) {
  const rows = await d.select(env, `app_config?key=eq.${key}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
async function daily(env, req, d, { off, key, build }) {
  if (process.env[off] === "0" || !isCrewRequest(req)) return null;
  const dateKey = ptDateKey(d.now()), s = await readStore(env, d, key), st = s.value;
  if (st && st.v === STORE_V && st.data && st.data.pickDate === dateKey) return st.data;   // today's pick
  if (FAILED.get(key) > d.now() - RETRY_MS) return st && st.v === STORE_V && st.data ? st.data : null;   // a build that just failed is not retried by every visitor
  let built = null; try { built = await build(env, d, dateKey); } catch { built = null; }
  if (!built) FAILED.set(key, d.now());
  if (built) { try { await d.write(env, { key, value: { v: STORE_V, data: built, builtAt: new Date(d.now()).toISOString() } }); } catch {} return built; }
  return st && st.v === STORE_V && st.data ? st.data : null;   // a failed build keeps the last good pick; none: null
}
export async function marketCheckExampleSales(env, req, deps = {}) { const d = { ...defaultDeps(), ...deps }; return daily(env, req, d, { off: "MC_EXAMPLE_SALES", key: MC_KEY, build: buildMarketCheckExample }); }
export async function sellExample(env, req, deps = {}) { const d = { ...defaultDeps(), ...deps }; return daily(env, req, d, { off: "SELL_EXAMPLE_FIELD", key: SELL_KEY, build: buildSellExample }); }
