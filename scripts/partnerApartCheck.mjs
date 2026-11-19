// AN ANSWER THAT PRICES APART RETURNS POSITIONS AND SALES FOR EACH OPTION, NOT AN EMPTY LIST (Lane B, Nov 1 2026; the eBay demo, a 2008 Carrera S whose coupes and cabriolets price apart).
// CAUSE: an answer apart by body (or by gearbox, year or mileage) has no single range (lib/onebox.js sets cluster null, noCluster true), and partnerPositionsOf placed a typed price against that range only, so it returned positions [] and sales [] and the demo could not place a starting bid or Buy It Now without the visitor picking a body first.
// FIX: partnerOptionsOf places each option against its own range with the same comparison (placingFor) and the same five-sale rule; an option with no range of its own carries no positions and no sales. CLASS: every car whose answer comes back apart or split, on every dimension (body, gearbox, year, mileage, edition).
// Worked through the partner endpoint on a fake archive. This check fails without the fix.
//   node scripts/partnerApartCheck.mjs [repo root]
import fs from "fs";
const EPOCH = "2026-10-28T19:34:12.871Z"; let archiveReads = 0; const STORE = new Map();
const cacheFetch = async (u, init) => {
  if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
  if (init && init.method === "DELETE") { STORE.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response("", { status: 204 }); }
  const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""), r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
};
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (model, body, tx, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pa" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: MK, model, year: 2001,
  listing_title: `2001 ${MK} ${model} ${body}${tx ? " " + tx : ""}`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const DELAY = 250;
const APP = new Map();
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) return cacheFetch(u, init);
  if (u.pathname.endsWith("/app_config")) {
    if (init && init.method === "POST") { for (const r of [].concat(JSON.parse(init.body))) APP.set(r.key, r.value); return new Response("", { status: 201 }); }
    const k = (u.searchParams.get("key") || "").replace(/^eq\./, ""); if (/^partner_last:/.test(k)) return new Response(JSON.stringify(APP.has(k) ? [{ value: APP.get(k) }] : []), { status: 200 });
    return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  }
  if (init && init.method === "POST") return new Response("", { status: 201 });
  await new Promise(r => setTimeout(r, DELAY));
  if (u.pathname.endsWith("/sales_archive")) archiveReads++;
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.PARTNER_KEY = "pk"; process.env.OPS_KEY = "ok"; process.env.PROBE_KEY = "ok"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.ANTHROPIC_API_KEY = "x"; process.env.SUPABASE_ANON_KEY = "k";
MK = "Porsche"; rows = [];
const T = (title, price, ago, mi) => { mkS("Porsche", "911", title, price, ago, 2014); const r = rows[rows.length - 1]; r.raw_record.mileage = String(mi); r.raw_record.body_style = "Coupe"; };
for (let i = 0; i < 14; i++) T(`2014 Porsche 911 GT3 Coupe ${i % 2 ? "PDK" : "6-Speed"}`, 120000 + i * 3500, 15 + i * 20, 8000 + i * 2500);
const PA = await import(pathToFileURL(path.join(root, "api/partnerAnswer.js")).href);
const post = (body, hdrs = {}) => new Promise(async resolve => { const t0 = Date.now(); let code = 200; const res = { statusCode: 200, headers: {}, setHeader() {}, status(c) { code = c; return this; }, json(o) { resolve({ ms: Date.now() - t0, code, body: o }); return this; }, send(o) { resolve({ ms: Date.now() - t0, code, body: o }); return this; }, end() {} };
  await PA.default({ method: "POST", url: "/api/partnerAnswer", headers: { "x-partner-key": "pk", host: "goasksam.com", "user-agent": "t", ...hdrs }, query: {}, body }, res); });
const fixture = (make, model, year, title, sets) => { MK = make; rows = []; for (const s of sets) for (let i = 0; i < s.n; i++) { mkS(make, model, `${year} ${make} ${model} ${title} ${s.word || ""}`.replace(/\s+/g, " ").trim(), s.base + i * (s.step || 1200), 12 + i * 22, year); const r = rows[rows.length - 1]; r.raw_record.mileage = String((s.mi || 20000) + i * 3000); r.raw_record.body_style = s.body || null; if (s.tx) r.raw_record.transmission = s.tx; } };
const placeOf = (p, lo, hi) => (p < lo ? "below" : p > hi ? "above" : "within");
const invariants = (name, b) => {
  const po = b && b.perOption;
  ok(`${name}: the answer carries perOption`, !!(po && Array.isArray(po.options) && po.options.length >= 2), JSON.stringify(b && b.answerType));
  if (!po) return;
  for (const o of po.options) {
    const hasRange = !!(o.range && o.range.low > 0 && o.range.high >= o.range.low);
    ok(`${name}: ${o.label}: a range gets positions for every typed price, no range gets none`, hasRange ? o.positions.length === 2 : (o.positions.length === 0 && o.placedSales.length === 0), `range ${JSON.stringify(o.range)} positions ${o.positions.length} sales ${o.placedSales.length}`);
    ok(`${name}: ${o.label}: a range has up to five sales or says why not`, !hasRange || (o.placedSales.length >= 1 && o.placedSales.length <= 5) || !!o.salesReason);
    ok(`${name}: ${o.label}: each position is the comparison against THIS option's range`, !hasRange || o.positions.every(p => p.place === placeOf(p.value, o.range.low, o.range.high) && p.low === o.range.low && p.high === o.range.high));
    ok(`${name}: ${o.label}: each sale is placed against its own option's range, with no venue and no address`, !hasRange || o.placedSales.every(s => s.place === placeOf(s.price, o.range.low, o.range.high) && !("venue" in s) && !("url" in s) && !("title" in s)));
  }
  ok(`${name}: nothing leaks a venue or address, key "title" blocked`, PA.venueLeak(b).length === 0);
};
// 1. THE REPORTED CAR: coupes and cabriolets price apart
fixture("Porsche", "911", 2008, "Carrera S", [{ n: 14, base: 52000, body: "Coupe", word: "Coupe", mi: 15000 }, { n: 14, base: 82000, body: "Cabriolet", word: "Cabriolet", mi: 15000 }]);
const A = await post({ q: "2008 Porsche 911 Carrera S", order: "date", prices: { starting_bid: 60000, buy_it_now: 92000 } });
console.log(`INFO  apart read: ${A.body.answerType}, range ${JSON.stringify(A.body.range)}, options ${JSON.stringify((A.body.perOption || {}).options && A.body.perOption.options.map(o => [o.label, o.n, o.range]))}`);
ok("the answer is apart (no single range), as in the report", A.body.ok === true && !A.body.range);
invariants("2008 Carrera S", A.body);
if (A.body.perOption) {
  const cp = A.body.perOption.options.find(o => /coupe/i.test(o.label)), cb = A.body.perOption.options.find(o => /cabrio|convert/i.test(o.label));
  ok("the coupe's own range holds the 60,000 bid and the cabriolet's does not", cp && cb && cp.positions.find(p => p.key === "starting_bid").place === "within" && cb.positions.find(p => p.key === "starting_bid").place === "below", JSON.stringify([cp && cp.range, cb && cb.range]));
  ok("the cabriolet's range holds the 92,000 Buy It Now and the coupe's does not", cp.positions.find(p => p.key === "buy_it_now").place === "above" && cb.positions.find(p => p.key === "buy_it_now").place === "within");
  ok("each body's sales are that body's own (no coupe among the cabriolets)", cp.placedSales.every(s => s.price < 75000) && cb.placedSales.every(s => s.price > 78000));
}
// 2. a typed mileage still orders the five sales of each body, nearest first
const M = await post({ q: "2008 Porsche 911 Carrera S", order: "miles", mileage: 30000, prices: { starting_bid: 60000, buy_it_now: 92000 } });
invariants("typed mileage", M.body);
if (M.body.perOption) for (const o of M.body.perOption.options) { const d = o.placedSales.map(s => Math.abs((s.miles || 0) - 30000)); ok(`typed mileage: ${o.label}: the sales are nearest the typed miles first`, d.every((x, i) => i === 0 || x >= d[i - 1]), JSON.stringify(o.placedSales.map(s => s.miles))); }
// 3. no prices typed and no ask: the answer is what it was (no perOption)
const N = await post({ q: "2008 Porsche 911 Carrera S" });
ok("a request that asks nothing gets no perOption (the answer is what it was)", N.body.ok === true && !("perOption" in N.body) && !("perOptionPlaced" in N.body));
// 4. a body too thin for a range carries no positions and no sales, never a fake range
fixture("Porsche", "911", 2008, "Carrera S", [{ n: 14, base: 52000, body: "Coupe", word: "Coupe" }, { n: 14, base: 82000, body: "Cabriolet", word: "Cabriolet" }, { n: 3, base: 150000, body: "Targa", word: "Targa" }]);
const T3 = await post({ q: "2008 Porsche 911 Carrera S", order: "date", prices: { starting_bid: 60000, buy_it_now: 92000 } });
invariants("a thin third body", T3.body);
if (T3.body.perOption) { const tg = T3.body.perOption.options.find(o => /targa/i.test(o.label)); ok("the three-sale Targa has no range, no positions and no sales", !tg || (tg.range === null && tg.positions.length === 0 && tg.placedSales.length === 0), JSON.stringify(tg)); }
// 5. apart by gearbox on the same body
fixture("Porsche", "911", 2008, "Carrera S Coupe", [{ n: 14, base: 76000, body: "Coupe", tx: "Manual", word: "6-Speed" }, { n: 14, base: 38000, body: "Coupe", tx: "Automatic", word: "Tiptronic" }]);
const G = await post({ q: "2008 Porsche 911 Carrera S Coupe", order: "date", prices: { starting_bid: 45000, buy_it_now: 80000 } });
console.log(`INFO  gearbox read: ${G.body.answerType}, perOption ${G.body.perOption ? G.body.perOption.dimension : "none"}`);
if (G.body.perOption || !G.body.range) invariants("apart by gearbox", G.body);
// 6. THE STORED DEMO CAR: first read stored with each body's sales; the second read comes from storage, prices placed per body, no archive read
fixture("Porsche", "911", 2014, "GT3", [{ n: 14, base: 120000, body: "Coupe", word: "Coupe", step: 3500 }, { n: 14, base: 190000, body: "Cabriolet", word: "Cabriolet", step: 3500 }]);
const CAR = "2014 Porsche 911 GT3", FIRST = { q: CAR, order: "date", prices: { starting_bid: 130000, buy_it_now: 200000 } };
archiveReads = 0; const D1 = await post(FIRST); const dr1 = archiveReads;
console.log(`INFO  demo first read ${D1.ms} ms, ${dr1} archive reads, ${D1.body.answerType}`);
invariants("demo car, first read", D1.body);
await new Promise(r => setTimeout(r, 300));
archiveReads = 0; const D2 = await post({ q: CAR, order: "date", prices: { starting_bid: 100000, buy_it_now: 300000 } }); const dr2 = archiveReads;
ok("the second read of an apart demo car comes from storage with no archive read", dr2 === 0 && D2.body.storedDemo === true, `${dr2} reads, storedDemo ${D2.body.storedDemo}`);
if (D2.body.perOption) {
  const cp2 = D2.body.perOption.options[0];
  ok("... the typed prices are placed per body from the stored ranges", cp2.positions.find(p => p.key === "starting_bid").place === placeOf(100000, cp2.range.low, cp2.range.high) && cp2.positions.find(p => p.key === "buy_it_now").place === "above");
  ok("... and the stored sales are the same five as the live read's", JSON.stringify(D2.body.perOption.options.map(o => o.placedSales)) === JSON.stringify(D1.body.perOption.options.map(o => o.placedSales)));
} else ok("the stored apart answer carries perOption", false);
invariants("demo car, stored read", D2.body);
// a typed mileage on the demo car reads live
const D3 = await post({ q: CAR, order: "miles", mileage: 50000, prices: { starting_bid: 130000 } });
ok("a typed mileage on the demo car reads live and still carries each body", !D3.body.storedDemo && D3.body.perOption && D3.body.perOption.options.length >= 2);
// 7. THE OTHER DIMENSIONS, from the engine's own option shapes: year, mileage, edition
{
  const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
  const rowsY = [], mk = (y, price, mi, i) => ({ id: "r" + y + i, year: y, _usd: price, mileage: String(mi), rtitle: `${y} Test Car`, auction_end_date: `2026-0${1 + (i % 8)}-1${i % 9}`, image: "https://x/i.jpg" });
  for (let i = 0; i < 9; i++) { rowsY.push(mk(2005, 30000 + i * 900, 20000 + i * 9000, i)); rowsY.push(mk(2006, 44000 + i * 900, 20000 + i * 9000, i)); }
  const optY = [{ dimension: "year", value: "2005", label: "2005", n: 9, low: 31000, high: 36000, rangeFloor: false }, { dimension: "year", value: "2006", label: "2006", n: 9, low: 45000, high: 50000, rangeFloor: false }, { dimension: "year", value: "2007", label: "2007", n: 3, low: null, high: null, rangeFloor: true }];
  const dY = { optionsState: "apart", headlineDimension: "year", cluster: null, options: optY, rawPool: rowsY };
  const yr = E.partnerPositionsOf(dY, { prices: { starting_bid: 33000, buy_it_now: 60000 }, order: "date" });
  ok("year split: each year with a range gets positions and its own sales; the thin year gets none", yr.perOption && yr.perOption.options.length === 3 && yr.perOption.options[0].positions.length === 2 && yr.perOption.options[0].sales.length === 5 && yr.perOption.options[0].sales.every(s => s.price < 40000) && yr.perOption.options[1].sales.every(s => s.price > 40000) && yr.perOption.options[2].range === null && yr.perOption.options[2].positions.length === 0 && yr.perOption.options[2].sales.length === 0, JSON.stringify(yr.perOption && yr.perOption.options.map(o => [o.value, o.positions.length, o.sales.length])));
  const optM = [{ dimension: "mileage", value: "lt50", label: "Under 50,000 miles", n: 9, low: 40000, high: 48000, rangeFloor: false }, { dimension: "mileage", value: "50to100", label: "50,000 to 100,000 miles", n: 9, low: 30000, high: 36000, rangeFloor: false }, { dimension: "mileage", value: "gt100", label: "Over 100,000 miles", n: 2, low: null, high: null, rangeFloor: true }];
  const rowsM = []; for (let i = 0; i < 9; i++) { rowsM.push(mk(2008, 40000 + i * 900, 10000 + i * 4000, i)); rowsM.push(mk(2008, 30000 + i * 700, 55000 + i * 4000, i)); }
  const mr = E.partnerPositionsOf({ optionsState: "split", headlineDimension: "mileage", cluster: null, options: optM, rawPool: rowsM }, { prices: { starting_bid: 35000 }, mileage: 30000, order: "miles" });
  ok("mileage split: the band the typed miles sit in is named, each band places its own sales", mr.perOption && mr.perOption.forMileage && mr.perOption.forMileage.value === "lt50" && mr.perOption.options[0].sales.every(s => (s.miles || 0) < 50000) && mr.perOption.options[1].sales.every(s => (s.miles || 0) >= 50000), JSON.stringify(mr.perOption && mr.perOption.forMileage));
  const mr2 = E.partnerPositionsOf({ optionsState: "split", headlineDimension: "mileage", cluster: null, options: optM, rawPool: rowsM }, { prices: { starting_bid: 35000 }, mileage: 150000, order: "miles" });
  ok("mileage split: a typed mileage in a band with no range is told its band is thin, in the engine's words, and is not pointed at a neighbour's range", mr2.perOption && mr2.perOption.forMileage && mr2.perOption.forMileage.nearest === false && mr2.perOption.forMileage.thin === true && /^Few sales .+\. Pick a mileage band to see its range\.$/.test(mr2.perOption.forMileage.line || ""), JSON.stringify(mr2.perOption && mr2.perOption.forMileage));
  const optE = [{ dimension: "edition", value: "gts", label: "GTS", n: 9, low: 70000, high: 80000, rangeFloor: false }, { dimension: "edition", value: "base", label: "Base", n: 9, low: 40000, high: 50000, rangeFloor: false }];
  const er = E.partnerPositionsOf({ optionsState: "apart", headlineDimension: "edition", cluster: null, options: optE, rawPool: rowsY }, { prices: { starting_bid: 45000 }, order: "date" });
  ok("edition split: the range places the price, the sales are not listed and it says so", er.perOption && er.perOption.options.every(o => o.positions.length === 1 && o.sales.length === 0 && o.salesReason === "not_listed"));
  ok("a single range answer has no perOption", E.partnerPositionsOf({ cluster: [1000, 2000], cards: [], options: optY, optionsState: "apart" }, { order: "date" }).perOption === undefined);
}
console.log(failed ? `partnerApartCheck: ${failed} failure(s)` : "partnerApartCheck: all pass");
process.exit(failed ? 1 : 0);
