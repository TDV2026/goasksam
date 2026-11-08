// clock: real-ok the fixture sales are dated relative to now (days ago), no calendar date is asserted (Lane B, Nov 2026)
// SHEET READ = MARKET CHECK (Lane B, Nov 2026, Desk Valuations spec item 2). No database, no network: a fake PostgREST holds a sales archive for twenty cars. For each car, the one sheet read call
// (lib/sheetRead.js sheetRead) must carry the SAME figures the Market Check path (oneEngineAnswer + withReadFields) gives the same car: the same count, range, window, newest sale, splits and set
// asides; the median and quartiles are those of that answer's own pool; and with a tier the same tier pool and starting figure the engine's tier fields give. Also: the object is serialisable,
// a car it cannot read is null (never invented), a VIN reads the car the VIN names, and the sheet screen's files compute no figure of their own.
//   node scripts/sheetReadCheck.mjs [repo root]        (a tree without the call fails it)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href).catch(() => null);
ok("lib/sheetRead.js (the one sheet read call) exists", !!(S && S.sheetRead));
if (!S || !S.sheetRead) { console.log(`\n${failed} FAILED`); process.exit(1); }
const quiet = console.error; console.error = () => {};

const CARS = [["Porsche", "911", [1999, 2008]], ["BMW", "M3", [2001, 2006]], ["Chevrolet", "Corvette", [1970, 1996]], ["Ford", "Mustang", [1966, 2003]], ["Jaguar", "E-Type", [1965, 1969]],
  ["Toyota", "Supra", [1994, 1998]], ["Chevrolet", "Camaro", [1967, 1992]], ["Mazda", "Miata", [1990, 1999]], ["Dodge", "Viper", [1996, 2002]], ["Honda", "NSX", [1991, 2000]]];
const CASES = CARS.flatMap(([make, model, [y0, y1]]) => [{ make, model, year: y0 }, { make, model, year: y1 }]);   // twenty cars
const DATA = new Map(); let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
for (const [ci, [make, model, [y0, y1]]] of CARS.entries()) {
  const rows = Array.from({ length: 70 }, (_, i) => { const year = y0 + (i % (y1 - y0 + 1)), price = Math.round((15000 + ci * 7000) * (0.8 + rnd() * 0.5)), title = `${year} ${make} ${model}`;
    const raw = { id: "ocd" + ci + "_" + i, title, featured_image_url: "https://img.example/x.jpg", mileage: String(8000 + Math.round(rnd() * 90000)), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + ci + "_" + i, source_url: "https://src.example/" + ci + "_" + i, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    return { id: `c${String(ci).padStart(2, "0")}-${String(i).padStart(5, "0")}`, source_id: raw.id, sale_price: price, sale_date: new Date(Date.now() - (6 + (i % 100)) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: title, year, make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }; });
  DATA.set(model, rows);
}
const tierOf = id => { const n = Number(id.split("-")[1]); return n % 7 === 0 ? null : 1 + (n % 4); };
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
globalThis.fetch = async (url) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "", dec = decodeURIComponent(String(url));
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  if (/condition_tier/.test(sel)) { const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean); return new Response(JSON.stringify(ids.map(id => ({ id, condition_tier: tierOf(id), condition_version: "ct3-20261105" }))), { status: 200 }); }
  if (u.searchParams.get("id")) return new Response("[]", { status: 200 });
  if (/^model$/.test(sel)) return new Response(JSON.stringify(CARS.map(c => ({ model: c[1] }))), { status: 200 });
  const hit = CARS.find(c => dec.toLowerCase().includes(c[1].toLowerCase()));
  const rows = hit ? DATA.get(hit[1]) : [];
  return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const deps = { resolveVehicle: async (text) => { const m = /^(\d{4}) (\S+) (.+)$/.exec(text); return { status: "valid", vehicle: { year: Number(m[1]), make: m[2], model: m[3] } }; }, decodeVin: async () => null, archiveMatch: async () => null, vinPlan: null, vinOverlay: null, liveFor: async () => ({ rows: [], total: 0 }) };
const medianOf = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
const priceOf = r => Number(r._usd ?? r._allin ?? r._hammer);
const miOf = r => Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\d]/g, "")) || 0;
let withPool = 0, tierChecked = 0;
for (const c of CASES) {
  const label = `${c.year} ${c.make} ${c.model}`, text = label, vehicle = { year: c.year, make: c.make, model: c.model };
  const direct = (await E.oneEngineAnswer(vehicle, null, text, { ...env, asked: 0, noStageLog: true }, null)).raw, mc = E.withReadFields(JSON.parse(JSON.stringify(direct)), text, vehicle);
  const sh = await S.sheetRead({ ...env, asked: 0, noStageLog: true }, { year: c.year, make: c.make, model: c.model, mileage: 40000 }, deps);
  if (!sh) { ok(`${label}: the sheet read returns a read`, false); continue; }
  const m = sh.market, pool = (mc.rawPool || []).filter(r => priceOf(r) > 0), res = mc.tier === "result";
  if (res) withPool++;
  const same = m.count === (mc.poolN ?? mc.qualifyingTotal) && (res ? m.low === mc.cluster[0] && m.high === mc.cluster[1] : m.low === null) && m.window.stated === (mc.windowWords || null) && m.newest === (mc.latestSaleDate ? String(mc.latestSaleDate).slice(0, 10) : null) && m.tier === mc.tier;
  ok(`${label}: count, range, window and newest sale equal Market Check's`, same, `sheet ${m.count} ${m.low}-${m.high} ${m.window.stated}; market check ${mc.poolN} ${mc.cluster} ${mc.windowWords}`);
  const optsEq = JSON.stringify(m.splits.flatMap(g => g.options.map(o => [g.dimension, o.label, o.count]))) === JSON.stringify((mc.options || []).map(o => [o.dimension, o.label, o.n]));
  ok(`${label}: the splits are the engine's options`, optsEq);
  ok(`${label}: median and quartiles are those of the same pool`, !res || (m.median === Math.round(medianOf(pool.map(priceOf))) && m.median >= m.p25 && m.median <= m.p75));
  // a tier
  for (const tier of [2, 3]) {
    const t = await S.sheetRead({ ...env, asked: 0, noStageLog: true }, { year: c.year, make: c.make, model: c.model, mileage: 40000, tier }, deps);
    const band = E.bandedRefine({ miTarget: 40000 });
    const same_ = pool.filter(r => tierOf(r.id) === tier), inb = same_.filter(r => miOf(r) >= band.miMin && miOf(r) <= band.miMax);
    const exp = inb.length >= 5 ? Math.round(medianOf(inb.map(priceOf))) : null;
    tierChecked++;
    ok(`${label} tier ${tier}: same tier count, band count and starting figure are the engine's`, t && t.condition.sameTierCount === same_.length && t.condition.bandCount === inb.length && t.market.startingFigure === exp && (exp === null ? t.condition.tooFew && /sales of this body( since [A-Z][a-z]+ \d{4})?\, \d+ in tier \d, shown on the full set\./.test(t.condition.tooFewLine) : !t.condition.tooFew), `tier pool ${t && t.condition.sameTierCount}/${same_.length}, band ${t && t.condition.bandCount}/${inb.length}, figure ${t && t.market.startingFigure}/${exp}`);
    ok(`${label} tier ${tier}: the market figures do not move with the tier (same pool)`, t && t.market.count === m.count && t.market.low === m.low && t.market.high === m.high);
  }
}
ok("the twenty cars include results with a pool, and tier calls were checked", withPool >= 12 && tierChecked === 40, `${withPool} results`);
// shape and honesty
{ const sh = await S.sheetRead({ ...env, asked: 0, noStageLog: true }, { year: 2001, make: "BMW", model: "M3" }, deps);
  ok("the read is serialisable and carries sections 1 to 4, the stamp and the coverage", sh && JSON.stringify(JSON.parse(JSON.stringify(sh))) === JSON.stringify(sh) && sh.car && sh.exact && sh.market && sh.condition && sh.coverage && sh.version === 1 && sh.engineVersion === E.ENGINE_VERSION && sh.readAt);
  ok("no tier chosen: the tier counts are there for the page to show, no figure", sh.condition.tiers.every(t => t.count != null) && sh.condition.selected === null && sh.market.startingFigure === null && /Pick a condition tier/.test(sh.market.startingNote));
  ok("the mileage was not given: the read says so and asks", sh.car.mileage.value === null && /Mileage was not in the submission/.test(sh.car.mileage.ask));
  const none = await S.sheetRead(env, { year: 2001, make: "Nope", model: "" }, deps); ok("a car it cannot read is null, never an invented read", none === null);
  const vin = await S.sheetRead({ ...env, asked: 0, noStageLog: true }, { vin: "WBSBL93461PN55123" }, { ...deps, decodeVin: async () => ({ year: 2001, make: "BMW", model: "M3", trim: null }), archiveMatch: async () => ({ soldDate: "2025-05-14", source: "Bring a Trailer", price: 31500, url: "https://bat.example/x", mileage: 52000, transmission: "Manual", colour: "Silver" }) });
  ok("a VIN reads the car it names, with the exact car's own record in section 2", vin && vin.car.vin === "WBSBL93461PN55123" && vin.car.decode.source === "vin" && vin.exact.appearances.length === 1 && vin.exact.appearances[0].price === 31500 && vin.exact.none === null && vin.market.count === sh.market.count);
  const vinNone = await S.sheetRead({ ...env, asked: 0, noStageLog: true }, { vin: "WBSBL93461PN55123" }, { ...deps, decodeVin: async () => ({ year: 2001, make: "BMW", model: "M3" }) });
  ok("a VIN with no sale in the record says so in the engine's line", vinNone && vinNone.exact.appearances.length === 0 && /No prior auction record/.test(vinNone.exact.none)); }
// the sheet screen computes nothing: no median, quartile or sum over prices in the Desk valuations files
{ const files = ["lib/desk/sheetActions.js", "lib/desk/sheetRead.js", "lib/desk/sheetShape.js"].filter(f => fs.existsSync(path.join(ROOT, f))), bad = files.filter(f => f !== "lib/desk/sheetShape.js" && /percentile|\.sort\(\(a, b\) => a - b\)|reduce\(\(.*\+/.test(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\/[^\n]*/g, "")));
  ok("the sheet actions and the read gate compute no figure of their own", bad.length === 0, bad.join(",")); }
console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
