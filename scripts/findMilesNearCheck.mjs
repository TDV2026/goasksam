// findMilesNearCheck (Lane B, lane-b-variant-3, Nov 17 2026; Lane C's live fault: "2003 Mercedes-Benz SL500 38,400 miles" opened Find as "38,400 to 38,400 miles under 38,400 miles" and found nothing): a bare mileage is the person's car, not a filter.
//  1 THE WORDS: a number with a distance word and no comparison word is the car's own mileage (bareMileage); "under", "over", "at least", "between" and the rest make a limit, and keep working.
//  2 EVERY ROAD IN: the typed words into Find (parseQueryResolved), a car arriving by token, the chat's search tool (a model that sends the number as a minimum and a maximum), the car bar's words: none makes a minimum and a maximum of one figure.
//  3 THE READ: cars within 15,000 miles (25,000 from 60,000) when at least three are live, every live match with one engine line when there are fewer, and the line says which; a limit the buyer typed still limits.
//   node scripts/findMilesNearCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const log = console.log, errl = console.error; console.log = () => {}; console.error = () => {};
const S = await imp("lib/live/search.js"), SC = await imp("lib/live/samChat.js"), CT = await imp("lib/carToken.js"), CB = await imp("lib/carBar.js");
const bare = S.bareMileage || (() => undefined), guard = SC.milesNearGuard || (p => p);
// 1 THE WORDS
const WORDS = [["2003 Mercedes-Benz SL500 38,400 miles", 38400], ["2003 Mercedes-Benz SL500 38400 mi", 38400], ["2003 Mercedes-Benz SL500 38.4k miles", 38400], ["2003 Mercedes-Benz SL500 38k miles", 38000], ["2003+Mercedes-Benz+SL500+38,400+miles", 38400], ["1999 Porsche Boxster 45,911 miles", 45911], ["2001 BMW M3 62,328 miles", 62328],
  ["38,400 miles 2003 Mercedes-Benz SL500", 38400], ["2003 Mercedes-Benz SL500, 38,400 miles, asking $18,000", 38400],
  ["2003 Mercedes-Benz SL500 under 40,000 miles", null], ["2003 Mercedes-Benz SL500 over 100,000 miles", null], ["2003 Mercedes-Benz SL500 at least 50k miles", null], ["2003 Mercedes-Benz SL500 less than 30k mi", null], ["2003 Mercedes-Benz SL500 more than 80,000 miles", null], ["2003 Mercedes-Benz SL500 up to 60,000 miles", null], ["2003 Mercedes-Benz SL500 between 20 and 30k miles", null],
  ["2003 Mercedes-Benz SL500 38,400 to 38,400 miles under 38,400 miles", null], ["2003 Mercedes-Benz SL500 62,000 km", null], ["2003 Mercedes-Benz SL500 $18,000", null], ["2003 Mercedes-Benz SL500", null]];
for (const [t, want] of WORDS) ok(`the words "${t}": ${want == null ? "no bare mileage" : "the car's mileage is " + want}`, (bare(t) ?? null) === want, bare(t));
// 2 EVERY ROAD IN
const SL = { year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500", mileage: 38400, confidence: "high" }, TOKEN = CT.encodeCar(SL);
for (const [t, want] of WORDS.filter(([t]) => /Mercedes-Benz SL500/.test(t))) {
  const r = await S.parseQueryResolved(t, {}), f = r.filters || {};
  if (want != null) { ok(`typed into Find "${t}": the mileage is the car's (milesNear ${want}), no minimum and no maximum`, f.milesNear === want && f.miMin == null && f.miMax == null, [f.milesNear, f.miMin, f.miMax]); }
  else if (/under|less than|up to/.test(t) && !/38,400 to/.test(t)) ok(`typed into Find "${t}": a maximum, and no car mileage`, f.miMax > 0 && f.miMin == null && !f.milesNear, [f.miMin, f.miMax, f.milesNear]);
  else if (/over|at least|more than/.test(t)) ok(`typed into Find "${t}": a minimum, and no car mileage`, f.miMin > 0 && f.miMax == null && !f.milesNear, [f.miMin, f.miMax, f.milesNear]);
  ok(`typed into Find "${t}": never a minimum and a maximum of one figure`, !(f.miMin && f.miMax && f.miMin === f.miMax), [f.miMin, f.miMax]);
}
{ const r = await S.parseQueryResolved("2003 Mercedes-Benz SL-Class SL500", { car: CT.decodeCar(TOKEN) }), f = r.filters || {};
  ok("a car arriving by token carries its mileage as the car's (milesNear 38400), no limit", f.milesNear === 38400 && f.miMin == null && f.miMax == null, [f.milesNear, f.miMin, f.miMax]);
  const r2 = await S.parseQueryResolved("2003 Mercedes-Benz SL-Class SL500 under 50,000 miles", { car: CT.decodeCar(TOKEN) }), f2 = r2.filters || {}; ok("a token and 'under 50,000 miles': the limit stands and the car's mileage is not a second one", f2.miMax === 50000 && f2.miMin == null && !f2.milesNear, [f2.miMax, f2.milesNear]);
  const info = CB.carInfo(TOKEN), r3 = await S.parseQueryResolved(info.label, {}), f3 = r3.filters || {}; ok("the car bar's words (the Find pill's q) read as the car's mileage, not a range", /38,400 miles$/.test(info.label) && f3.milesNear === 38400 && f3.miMin == null && f3.miMax == null, [info.label, f3.milesNear, f3.miMin, f3.miMax]); }
// the chat's search tool: the model sends the number as both limits
{ const sent = { make: "Mercedes-Benz", model: "SL-Class", trim: "SL500", year_min: 2003, year_max: 2003, miles_min: 38400, miles_max: 38400 };
  const g = guard(sent, "2003 Mercedes-Benz SL500 38,400 miles");
  ok("the chat tool's minimum and maximum of the typed bare mileage are dropped and the mileage is the car's (miles_near)", g.miles_min === undefined && g.miles_max === undefined && g.miles_near === 38400, g);
  const g2 = guard({ ...sent, miles_min: undefined, miles_max: 40000 }, "2003 Mercedes-Benz SL500 under 40,000 miles"); ok("a limit the buyer typed stays", g2.miles_max === 40000 && g2.miles_near === undefined, g2);
  const g3 = guard({ ...sent, miles_min: undefined, miles_max: 50000 }, "2003 Mercedes-Benz SL500 38,400 miles"); ok("a limit the page's own button sent (another number) stays beside the car's mileage", g3.miles_max === 50000 && g3.miles_near === 38400, g3);
  const g4 = guard({ ...sent, miles_min: 100000, miles_max: undefined }, "2003 Mercedes-Benz SL500 over 100,000 miles"); ok("an 'over' stays a minimum", g4.miles_min === 100000 && g4.miles_near === undefined, g4);
  ok("the chat tool's own spec (runSearch) takes miles_near as the filter milesNear", /miles_near/.test(fs.readFileSync(path.join(ROOT, "lib/live/samChat.js"), "utf8")) && /f\.milesNear = n/.test(fs.readFileSync(path.join(ROOT, "lib/live/samChat.js"), "utf8"))); }
// 3 THE READ
const mk = (i, mi) => ({ id: "L" + i, source: "bringatrailer", make: "Mercedes-Benz", model: "SL-Class", year: 2003, listing_title: "2003 Mercedes-Benz SL500", mileage: String(mi), stated_mileage: mi, country: "US", end_time: new Date(Date.now() + 864e5 * (1 + i)).toISOString(), current_bid: 20000, currency: "USD", url: "https://x/" + i, image: "x", state: "TX" });
const read = async (mis, f) => S.searchLive({}, SL, f, "", { rows: mis.map((m, i) => mk(i, m)) });
{ const f = S.emptyFilters(); f.milesNear = 38400;
  const enough = await read([20000, 30000, 38000, 45000, 52000, 90000, 120000], f), ni = enough.milesNear;
  ok("enough cars live within 15,000 miles: Find shows those (4 of 7) and says so in the engine's line", enough.rows.length === 4 && ni && ni.applied === true && ni.within === 4 && ni.total === 7 && ni.line === "Cars within 15,000 miles of 38,400 miles.", [enough.rows.length, ni]);
  ok("and every car shown is inside the band", enough.rows.every(x => x.facts.miles >= 23400 && x.facts.miles <= 53400));
  const few = await read([20000, 90000, 38000, 120000], f), nf = few.milesNear;
  ok("too few within the band: EVERY live match is shown (4), with one line saying so", few.rows.length === 4 && nf && nf.applied === false && nf.within === 1 && nf.line === "Too few are live near 38,400 miles to narrow it, so every live match is shown.", [few.rows.length, nf]);
  const three = await read([30000, 38000, 45000, 90000], f); ok("three within the band is enough (the engine's question floor)", three.rows.length === 3 && three.milesNear.applied === true);
  const two = await read([30000, 38000, 90000, 100000], f); ok("two is not", two.rows.length === 4 && two.milesNear.applied === false);
  const f60 = S.emptyFilters(); f60.milesNear = 70000; const wide = await read([40000, 50000, 60000, 80000, 90000, 120000], f60); ok("from 60,000 miles the band is 25,000 either side (45,000 to 95,000)", wide.milesNear.miMin === 45000 && wide.milesNear.miMax === 95000 && wide.rows.length === 4, wide.milesNear);
  const none = await read([20000, 90000], S.emptyFilters()); ok("no mileage given: no band, no line, every match", none.rows.length === 2 && !none.milesNear, none.milesNear);
  const lim = S.emptyFilters(); lim.miMax = 40000; const limited = await read([20000, 30000, 38000, 45000, 90000], lim); ok("a typed maximum still limits (3 of 5) and is no band", limited.rows.length === 3 && !limited.milesNear, limited.rows.length); }
ok("the Find page prints the engine's line (milesNear.line) with the other engine notes and words nothing of its own", /d\.milesNear && typeof d\.milesNear\.line/.test(fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8")) && !/Too few are live near/.test(fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8")));
console.log = log; console.error = errl;
log(fails.slice(0, 40).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `findMilesNearCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const M = [
    ["a bare mileage is read as a limit again (the comparison word test is gone)", "lib/live/search.js", "if (COMPARE_BEFORE.test(t.slice(Math.max(0, start - 16), start))) return null;", ""],
    ["a mileage with 'under' is read as bare", "lib/live/search.js", "(?:under|below|less than|max(?:imum)?|up to|no more than|over|above|more than|at least|min(?:imum)?|between|and|to|<|>|sub)\\s*$/i", "(?:over)\\s*$/i"],
    ["Find does not read the bare mileage", "lib/live/search.js", "const out = withMilesNear(await parseQueryResolvedInner(raw, env), raw);", "const out = await parseQueryResolvedInner(raw, env);"],
    ["a car's own mileage (the token) is not carried", "lib/live/search.js", "const own = pq.vehicle && Number(pq.vehicle.mileage) > 0 ? Math.round(Number(pq.vehicle.mileage)) : null, n = bareMileage(raw) || own;", "const own = null, n = bareMileage(raw) || own;"],
    ["the chat tool's minimum and maximum of the bare mileage are kept", "lib/live/samChat.js", "if (isB(q.miles_max)) delete q.miles_max; if (isB(q.miles_min)) delete q.miles_min;", ""],
    ["the chat tool drops a limit the buyer typed", "lib/live/samChat.js", "const isB = x => Math.round(Number(x)) === bare, q = { ...p };", "const isB = x => true, q = { ...p };"],
    ["too few live cars still narrows", "lib/live/search.js", "applied = within.length >= MILES_NEAR_MIN,", "applied = within.length >= 0,"],
    ["the floor is four", "lib/live/search.js", "MILES_NEAR_MIN = 3", "MILES_NEAR_MIN = 4"],
    ["the band is not Market Check's", "lib/live/search.js", "bandedRefine({ miTarget: n })", "({ miMin: n - 5000, miMax: n + 5000 })"],
    ["the line does not say which", "lib/reasonWords.js", "Too few are live near ${p.miles} miles to narrow it, so every live match is shown.", "Cars within ${p.miles} miles."],
    ["the Find page does not print the line", "api/buy.js", "if (d.milesNear && typeof d.milesNear.line === \\\"string\\\" && d.milesNear.line) xl.push(d.milesNear.line);", ""]
  ];
  let survived = 0;
  for (const [name, file, from, to] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fn-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"); if (!before.includes(from)) { console.log("SKIP (no match) " + name); survived++; continue; }
      fs.writeFileSync(f, before.replace(from, () => to));
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
