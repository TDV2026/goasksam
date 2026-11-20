// forSaleOneCardCheck (Lane D, Nov 20 2026): ONE CARD PER CAR on Find's Dealers, Classifieds and All, with the engine's own pieces (lib/forsale/rules.js onePerCar, liveShape, serve.js cardOf), no network.
// CAUSE (Lane F's launch census, 3.0% of its sample): onePerCar matched two listings only on a full 17 character VIN, so a car listed by its dealer AND by a classifieds source with no VIN on either (or a short chassis number, or the VIN on one side only) was two cards.
// THE RULE: one card per car, the dealer's own page wins. With no VIN to go by: the same year, make, model, stated mileage and asking price (in the same state when both name one). A filler mileage, a missing mileage or a missing price never matches; two different full VINs are two cars.
// THE CLASS: every pair of live sources (dealer and classified, classified and classified), not the example pair. Node scripts/forSaleOneCardCheck.mjs [root]; --mutants breaks one rule at a time in a copy (each must fail).
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " :: " + JSON.stringify(d) : "")); } };
if (args.includes("--mutants")) process.exit(mutants());
const origLog = console.log; console.log = () => {};   // the world modules print; the verdict goes through origLog
const RULES = await imp("lib/forsale/rules.js"), SERVE = await imp("lib/forsale/serve.js"), REP = await imp("lib/forsale/report.js"); console.log = origLog;
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
let ID = 1; const car = (source, o = {}) => ({ id: ID++, source, source_type: RULES.typeOf(source), vin_norm: null, year: 1965, make: "Ford", model: "Mustang", mileage: 61200, asking_price_usd: 38500, state: "NH", last_seen: ago(2), title: "x", url: "https://example.test/" + ID, ...o });
const cardsFor = rows => RULES.onePerCar(rows).rows.map(r => SERVE.cardOf({ r: RULES.liveShape(r, true) }));
const ids = rows => RULES.onePerCar(rows).rows.map(r => r.id).sort((a, b) => a - b);
const VINA = "1FAEP12A5BF123456", VINB = "1FAEP12A5BF654321";
{ // the census case: the dealer's page and a classifieds copy, no VIN on either
  const d = car("streetside"), c = car("classiccars", { last_seen: ago(1) }); const out = RULES.onePerCar([c, d]);
  ok("a dealer's car and its classifieds copy with no VIN are ONE card", out.rows.length === 1 && out.droppedAsTwin === 1, out.rows.length);
  ok("and the card is the dealer's own page (the classifieds copy was seen more recently and still loses)", out.rows[0].id === d.id);
  ok("the card the visitor sees comes through the engine's card builder once, with the dealer's address", cardsFor([c, d]).length === 1 && /example\.test\/\d+/.test(JSON.stringify(cardsFor([c, d]))) , cardsFor([c, d]).length);
  ok("the order the rows arrive in does not matter", ids([d, c]).join() === ids([c, d]).join());
}
{ // a VIN on one side only, a short chassis number, a VIN written differently
  const d = car("streetside", { vin_norm: VINA }), c = car("classiccars"); ok("a VIN on the dealer's page only: still one card (the dealer's)", ids([d, c]).join() === String(d.id));
  const s1 = car("rkmotors", { vin_norm: "5F08C123456" }), s2 = car("barnfinds"); ok("a short chassis number is no VIN: matched on the facts, one card", RULES.onePerCar([s1, s2]).rows.length === 1);
  const a = car("streetside", { vin_norm: VINA }), b = car("classiccars", { vin_norm: VINA }); ok("the same full VIN is one card, as before", RULES.onePerCar([a, b]).rows.length === 1);
}
{ // what never matches
  const base = car("streetside");
  const no = (name, o) => ok(name, RULES.onePerCar([base, car("classiccars", o)]).rows.length === 2, o);
  no("a different asking price is another car", { asking_price_usd: 36900 }); no("a different mileage is another car", { mileage: 61201 });
  no("a different year is another car", { year: 1966 }); no("a different model is another car", { model: "Mustang II" }); no("a different make is another car", { make: "Mercury" });
  no("a different state is another car", { state: "MA" });
  const t = car("streetside", { vin_norm: VINA }); ok("two different full VINs, both sides, same facts: two cards", RULES.onePerCar([t, car("classiccars", { vin_norm: VINB })]).rows.length === 2);
  const f1 = car("streetside", { mileage: 999999 }), f2 = car("classiccars", { mileage: 999999 }); ok("a filler mileage is no mileage and never matches (999,999 on both stays two cards)", RULES.onePerCar([f1, f2]).rows.length === 2);
  const n1 = car("streetside", { mileage: null }), n2 = car("classiccars", { mileage: null }); ok("no stated mileage on either side never matches", RULES.onePerCar([n1, n2]).rows.length === 2);
  const p1 = car("streetside", { asking_price_usd: null }), p2 = car("classiccars", { asking_price_usd: null }); ok("no asking price never matches", RULES.onePerCar([p1, p2]).rows.length === 2);
  ok("a state named on one side only does not keep them apart", RULES.onePerCar([car("streetside", { state: null }), car("classiccars")]).rows.length === 1);
}
{ // THE CLASS: every pair of live sources
  const S = Object.keys(RULES.SOURCE_TABLE).filter(s => !RULES.SOURCE_TABLE[s].hold); let pairs = 0, bad = [];
  for (const a of S) for (const b of S) { if (a >= b) continue; pairs++; const x = car(a, { last_seen: ago(1) }), y = car(b, { last_seen: ago(5) }), out = RULES.onePerCar([x, y]);
    const want = x.source_type === "dealer" && y.source_type !== "dealer" ? x.id : y.source_type === "dealer" && x.source_type !== "dealer" ? y.id : x.id;   // a dealer wins; otherwise the more recently seen
    if (out.rows.length !== 1 || out.rows[0].id !== want) bad.push(a + "|" + b); }
  ok(`every pair of live sources (${pairs} pairs) shows one car once, the dealer's own page first, then the most recently seen`, pairs > 100 && bad.length === 0, bad.slice(0, 4));
}
{ // the sweep's count by source pair, from the same rule
  const d1 = car("streetside"), c1 = car("classiccars"), c2 = car("dupontregistry", { year: 1987, make: "Porsche", model: "911", mileage: 40000, asking_price_usd: 90000, state: "CA" }), c3 = car("classiccars", { year: 1987, make: "Porsche", model: "911", mileage: 40000, asking_price_usd: 90000, state: "CA" }), lone = car("rkmotors", { year: 1970 });
  const sw = await REP.twinSweep({}, { pages: async () => [d1, c1, c2, c3, lone] });
  ok("the sweep counts the twins by the pair of sources and by how it knew", sw.twins === 2 && sw.compared === 5 && sw.shown_after_rule === 3 && sw.byMethod.match === 2 && sw.byPair["dealer:streetside kept | classified:classiccars dropped"] === 1, sw);
  const seen = await REP.lastSeenSweep({}, { count: async (e, f) => /last_seen=lt/.test(f) ? (/source=eq.classiccars/.test(f) ? 7 : 0) : 10 });
  ok("the last seen sweep counts, per source, the live rows seen over 24 hours ago", seen.bySource.classiccars.over_24h === 7 && seen.bySource.streetside.over_24h === 0 && seen.total.over_24h === 7, seen.total);
}
console.log(`forSaleOneCardCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f); process.exit(fail ? 1 : 0);

function mutants() {
  const sub = (file, from, to) => [file, s => s.includes(from) ? s.replace(from, () => to) : s, from], R = "lib/forsale/rules.js";
  const M = [
    ["only a full VIN matches (the census fault)", ...sub(R, "const pool = out.concat([...keep.values()]), groups = new Map(), result = [];\n  for (const r of pool) { const k = matchKey(r);", "const pool = out.concat([...keep.values()]), groups = new Map(), result = [];\n  for (const r of pool) { const k = null;")],
    ["the mileage is left out of the match", ...sub(R, "return [Number(r.year), norm(r.make), norm(r.model), mi, Math.round(p)].join(\"|\");", "return [Number(r.year), norm(r.make), norm(r.model), Math.round(p)].join(\"|\");")],
    ["the asking price is left out of the match", ...sub(R, "norm(r.model), mi, Math.round(p)].join", "norm(r.model), mi].join")],
    ["a filler mileage matches", ...sub(R, "const mi = statedMiles(r.mileage), p", "const mi = Number(r.mileage), p")],
    ["two different VINs are merged", ...sub(R, "!(vinOf(k) && vinOf(r) && vinOf(k) !== vinOf(r)) && ", "")],
    ["a different state is merged", ...sub(R, " && !(stateOf(k) && stateOf(r) && stateOf(k) !== stateOf(r))", "")],
    ["the marketplace copy wins over the dealer's page", ...sub(R, "const rank = r => [r.source_type === \"dealer\" ? 0 : 1,", "const rank = r => [r.source_type === \"dealer\" ? 1 : 0,")],
    ["the make is left out of the match", ...sub(R, "Number(r.year), norm(r.make), norm(r.model), mi", "Number(r.year), norm(r.model), mi")],
    ["the sweep does not count by the pair", ...sub("lib/forsale/report.js", "byPair[k] = (byPair[k] || 0) + 1;", "")]
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-")); spawnSync("rsync", ["-a", ...["lib", "api", "data", "docs", "scripts"].map(d => path.join(ROOT, d)), tmp]); try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules")); } catch {}
  let killed = 0, survived = 0, skipped = 0;
  for (const [name, file, fn, from] of M) { const f = path.join(tmp, file), orig = fs.readFileSync(f, "utf8"); if (!orig.includes(from)) { skipped++; console.log("SKIP (text not found) " + name); continue; } fs.writeFileSync(f, fn(orig)); const r = spawnSync("node", [path.join(tmp, "scripts/forSaleOneCardCheck.mjs"), tmp], { encoding: "utf8" }); fs.writeFileSync(f, orig); if (r.status !== 0) { killed++; console.log("KILLED   " + name); } else { survived++; console.log("SURVIVED " + name); } }
  console.log(`forSaleOneCardCheck mutants: ${killed} of ${M.length} killed${survived ? `, ${survived} SURVIVED` : ""}${skipped ? `, ${skipped} skipped` : ""}`); fs.rmSync(tmp, { recursive: true, force: true }); return survived || skipped ? 1 : 0;
}
