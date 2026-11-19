// MARKET CHECK, A VIN AND ITS MILEAGE (Lane B, Nov 2 2026; Sam's find on VIN WP0AA29962S621698, a 2002 Porsche 911 Carrera 4S, live at 130,000 miles). One check per class, each shown failing on origin/main:
//  (1) a VIN whose own sale or live listing names a trim reads the typed search of THAT trim: the same stored key as typing "2002 Porsche 911 Carrera 4S", so a stored row is served and nothing is computed cold;
//  (2) an asked trim is never shown a sibling's range (S, GTS, 4S, Turbo, Turbo S, 4 and the pairs among them);
//  (3) nearestSales: up to five sales of the answer's own pool, ordered by closeness in mileage, date / miles / price / name only;
//  (4) one mileage: rangeMileage names the mileage and where it came from, the live listing's over the VIN record's (130,000, never 120,000), and the page prints that line and fills its box with that number;
//  (5) "Narrowed to" is said once on an answer.
// Offline, a seeded pool.   node scripts/mcVinCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), V = await imp("lib/vehicle.js"), A = await imp("lib/vinAsTyped.js"), G = await imp("lib/generations.js"), S = await imp("lib/live/search.js");
const gen = v => G.findGeneration(v, { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }).catch(() => null);
const mk = (id, y, make, model, title, price, i, miles, vin) => ({ id, price, _usd: price, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: y, make, model, raw_title: title, rtitle: title, mileage: String(miles ?? 40000 + i * 4000), vin_norm: vin || "Z" + id.replace(/\W/g, ""), transmission: "Manual (6-speed)", image: "https://img.test/x.jpg", source: "bringatrailer", platform: "bringatrailer" });
const poolOf = (y, make, model, spec, own) => { const rows = []; for (const [t, base, n] of spec) for (let i = 0; i < n; i++) rows.push(mk(t + i, y, make, model, `${y} ${make} ${model} ${t} Coupe`, base + i * 700, i)); if (own) { const j = rows.findIndex(r => new RegExp(own.trim).test(r.rtitle)); rows[j] = { ...rows[j], vin_norm: own.vin, price: 32000, _usd: 32000, mileage: "120000", rtitle: own.title, raw_title: own.title }; } return rows; };
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
const P911 = [["Carrera", 30000, 14], ["Carrera 4", 38000, 8], ["Carrera 4S", 50000, 9], ["Turbo", 90000, 17]];
const VIN = "WP0AA29962S621698", TITLE = "2002 Porsche 911 Carrera 4S Coupe 6-Speed";
// (1) the stored key
{ const veh = { year: 2002, make: "Porsche", model: "911", nameModel: "911", trim: "Carrera", bodyStyle: "coupe", vin: VIN, raw: VIN };
  const plan = await A.vinSearchPlan(veh, { resolveVehicle: V.resolveVehicle, archive: null, live: { title: TITLE, mileage: 130000 } }).catch(() => null);
  const typedWords = "2002 Porsche 911 Carrera 4S", tr = (await V.resolveVehicle(typedWords, {})).vehicle;
  const kPlan = plan && plan.vehicle ? S.warmAnswerKeyFor(plan.vehicle, await gen(plan.vehicle)) : null, kTyped = S.warmAnswerKeyFor(tr, await gen(tr));
  ok("a VIN whose live listing says Carrera 4S plans the typed search of the Carrera 4S", !!plan && !plan.unresolved && plan.text === typedWords, plan && plan.text);
  ok("... and reads the SAME stored key a typed search of that trim reads, so a stored row is served and nothing is computed cold", !!kPlan && kPlan === kTyped, kPlan);
  ok("... and the decode's family word (Carrera) is not what it reads", !!plan && plan.vehicle && plan.vehicle.trim === "Carrera 4S", plan && plan.vehicle && plan.vehicle.trim); }
// (2) an asked trim never gets a sibling's range
const PAIRS = [[2002, [["Carrera 4", 30000, 8], ["Carrera 4S", 50000, 9]], ["Carrera 4", "Carrera 4S"]], [2008, [["Carrera S", 70000, 12], ["Carrera 4S", 80000, 10], ["Carrera 4", 60000, 10]], ["Carrera S", "Carrera 4S", "Carrera 4"]], [2012, [["Carrera GTS", 100000, 9], ["Carrera S", 80000, 15]], ["Carrera GTS", "Carrera S"]], [2002, [["Turbo", 90000, 17], ["Turbo S", 120000, 9]], ["Turbo", "Turbo S"]]];
for (const [year, spec, asks] of PAIRS) for (const asked of asks) {
  const rows = poolOf(year, "Porsche", "911", spec), text = `${year} Porsche 911 ${asked}`, v = (await V.resolveVehicle(text, {})).vehicle;
  const a = (await E.oneEngineAnswer(v, await gen(v), text, env(rows), null)).raw, titles = (a.rawPool || []).map(r => String(r.raw_title || r.rtitle || ""));
  const mine = new RegExp("\\b" + asked.replace(/\s+/g, "\\s+") + "(?![A-Za-z0-9])", "i"), sib = titles.filter(t => !mine.test(t));
  ok(`${text}: every sale in the range's pool is a ${asked} (no sibling's sales)`, a.tier === "result" && titles.length > 0 && sib.length === 0, `${a.tier} pool ${titles.length}, other trims ${sib.length} ${sib[0] || ""}`);
}
// the asked trim too thin: nothing of a sibling's is shown as its range
{ const rows = poolOf(2002, "Porsche", "911", [["Carrera 4", 30000, 8], ["Carrera 4S", 50000, 2]]), v = (await V.resolveVehicle("2002 Porsche 911 Carrera 4S", {})).vehicle;
  const a = (await E.oneEngineAnswer(v, await gen(v), "2002 Porsche 911 Carrera 4S", env(rows), null)).raw;
  ok("a Carrera 4S with two sales is never answered with the Carrera 4's range", !(Array.isArray(a.cluster) && a.cluster[0] < 40000), JSON.stringify(a.cluster) + " " + a.tier); }
// (3) nearestSales, (4) one mileage
const cars = [["a 2008 Carrera S, live listing at 61,000", "2008 Porsche 911 Carrera S", [["Carrera S", 70000, 14]], 61000, "live_listing"], ["a 2002 Carrera 4S, live at 130,000 with a record at 120,000", "2002 Porsche 911 Carrera 4S", P911, 130000, "live_listing"]];
for (const [label, text, spec, live, src] of cars) {
  const y = Number(text.slice(0, 4)), rows = poolOf(y, "Porsche", "911", spec), v = (await V.resolveVehicle(text, {})).vehicle;
  const raw = (await E.oneEngineAnswer(v, await gen(v), text, env(rows), null)).raw;
  const d = E.withReadFields(raw, text, { ...v, listingMiles: live, recordMiles: 120000, recordDate: "2022-03-14" });
  const ns = d.nearestSales || [];
  ok(`${label}: nearestSales is present, up to five`, Array.isArray(ns) && ns.length >= 1 && ns.length <= 5, String(ns.length));
  const dist = ns.map(s => Math.abs((s.miles || 0) - live)), sorted = dist.every((x, i) => i === 0 || dist[i - 1] <= x);
  ok(`${label}: ordered by closeness in mileage to the car (${dist.join(", ")})`, sorted);
  const pool = new Set((d.cards || []).map(c => `${c.date}|${Math.round(c.price)}`));
  ok(`${label}: each is a sale of the answer's own pool, shaped date, miles, price, name only`, ns.every(s => Object.keys(s).sort().join() === "date,miles,name,price" && pool.has(`${s.date}|${s.price}`)) && !/bringatrailer|bring a trailer|https?:/i.test(JSON.stringify(ns)));
  ok(`${label}: the one mileage is the live listing's, not the record's`, d.rangeMileage && d.rangeMileage.miles === live && d.rangeMileage.source === "live_listing" && !/120,000/.test(d.rangeMileage.line), d.rangeMileage && d.rangeMileage.line);
  ok(`${label}: the heading names the same mileage, and says "this car" (rule 20: no "yours")`, typeof d.nearestSalesHeading === "string" && d.nearestSalesHeading.includes(live.toLocaleString("en-US")) && /^Closest sales to this car, matched at /.test(d.nearestSalesHeading) && !/\byours?\b/i.test(d.nearestSalesHeading), d.nearestSalesHeading);
  ok(`${label}: the line says the range is for all mileages and the sales are matched (the range is not narrowed to a mileage it was not)`, d.rangeMileage && d.rangeMileage.narrowed === false && /for all mileages/.test(d.rangeMileage.line));
}
{ const rows = poolOf(2008, "Porsche", "911", [["Carrera S", 70000, 14]]), v = (await V.resolveVehicle("2008 Porsche 911 Carrera S", {})).vehicle;
  const raw = (await E.oneEngineAnswer(v, await gen(v), "2008 Porsche 911 Carrera S", env(rows), null)).raw;
  const rec = E.withReadFields(raw, "x", { ...v, recordMiles: 120000, recordDate: "2022-03-14" }), none = E.withReadFields(raw, "x", { ...v });
  ok("only the VIN's last sale record: that mileage, said as the record's, with its month", rec.rangeMileage && rec.rangeMileage.miles === 120000 && rec.rangeMileage.source === "vin_record" && /March 2022/.test(rec.rangeMileage.line), rec.rangeMileage && rec.rangeMileage.line);
  ok("no mileage anywhere: no mileage line and no nearest sales block", none.rangeMileage === null && Array.isArray(none.nearestSales) && none.nearestSales.length === 0 && none.nearestSalesHeading === null); }
// the page prints the engine's line and the engine's number, and the block only when the field has sales
{ const pg = fs.readFileSync(path.join(root, "public/js/onebox.js"), "utf8");
  ok("the page prints rangeMileage.line and pre-fills the Change box with rangeMileage.miles", /d\.rangeMileage[\s\S]{0,400}esc\(rm\.line \+ rnote\)[\s\S]{0,300}milesFieldHtml\(rm\.miles\)/.test(pg));
  ok("the page prints nearestSales under the range and renders nothing when the field is empty", /function nearestSalesHtml\(d\)[\s\S]{0,200}if \(!list\.length\) return ""/.test(pg) && /heroRangeHtml\(d, m, thinTile\) \+ nearestSalesHtml\(d\)/.test(pg)); }
// (5) "Narrowed to" once
{ const rows = poolOf(2008, "Porsche", "911", [["Carrera 4", 60000, 10], ["Carrera 4S", 80000, 10]]), text = "2008 Porsche 911 Carrera 4", v = (await V.resolveVehicle(text, {})).vehicle;
  for (const [name, refine] of [["a trim", { trim: "carrera-4" }], ["a typed mileage", { miTarget: 50000 }], ["a trim and a typed mileage", { trim: "carrera-4", miTarget: 50000 }]]) {
    const raw = (await E.oneEngineAnswer(v, await gen(v), text, env(rows), refine)).raw, d = E.withReadFields(raw, text, v);
    const all = JSON.stringify([d.scopeLine, d.metaLine, d.appliedLine, d.windowLine, d.basisLine, d.samLine, d.footerLine].filter(x => typeof x === "string")), n = (all.match(/Narrowed to/g) || []).length;
    ok(`${name}: "Narrowed to" is said at most once across the answer's lines`, n <= 1, `${n} in ${all.slice(0, 160)}`); } }
console.log(fail ? `mcVinCheck: ${fail} failure(s)` : "mcVinCheck: all pass");
process.exit(fail ? 1 : 0);
