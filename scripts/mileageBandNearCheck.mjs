// A CAR IN A THIN MILEAGE BAND READS THE NEAREST BAND THAT HAS A RANGE, THE OPTION LIST NEVER RESTATES THE HEADLINE, BANDS PRINT ASCENDING (Lane B, Oct 30 2026).
// THE LIVE CASE: a Task email, 1995 BMW M3 Coupe, 61,000 km (about 38,000 miles), Bellingham WA. Its own band (under 50,000 miles) holds 4 sales; the next (50,000 to 100,000 miles) holds 9, $26,000 to $36,500.
// The card printed "Four sales under 50,000 miles, too few for a range." as the headline, then "Under 50,000 miles, 4 sales, too few for a range" as its first option (the same band twice), then the options as under 50,
// over 100, 50 to 100. CAUSES: (1) findAnswerOf answered for the matched band even when the band had no range; (2) the option list was sent whole, matched option first, and the email printed it under the headline;
// (3) the one-order sort put the matched option first, then options with a range, then thin ones, so the bands lost their scale. And the footer read "Matches your Task: 1995." (a bare year): the reason line joined the filters' own
// values (a year, a model code) instead of naming the car.
// FIX: nearBandOf (lib/onebox.js): the nearest band with a range headlines, with the engine's sentence ("Few sales under 50,000 miles, so this is the 50,000 to 100,000 mile range.", reason table nearband.line / find.near_band);
// findAnswer.otherLines is the option lines the headline does not already state; mileage options keep the scale's order wherever they print; matchReasonLine names the car in words. A Market Check answer carries the same sentence as nearBand.
// CLASS: Find cards, Task emails and Market Check with typed miles all place a car in a band through matchedOptionOf / findAnswerOf / withReadFields, so one check drives all three, for every band the car can sit in.
//   node scripts/mileageBandNearCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js"), T = await imp("lib/tasks/tasks.js"), C = await imp("lib/tasks/emailCards.js");
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const mk = (mi, p, i) => ({ id: "r" + i, _usd: p, mileage: mi, year: 1995, auction_end_date: "2026-0" + (1 + i % 9) + "-10", rtitle: "1995 BMW M3 Coupe", raw_title: "1995 BMW M3 Coupe" });
const BAND = { lt50: "Under 50,000 miles", "50to100": "50,000 to 100,000 miles", gt100: "Over 100,000 miles" };
// an answer whose mileage bands hold [n under 50, n 50 to 100, n over 100] sales; a band with 8 or more has its range (prices rise 1,500 a sale from the band's floor)
const answer = (ns) => {
  const rows = []; let i = 0; const starts = [20000, 55000, 110000], floors = [38000, 26000, 20000];
  ns.forEach((n, b) => { for (let k = 0; k < n; k++) rows.push(mk(starts[b] + k * 2500, floors[b] + k * 1500, i++)); });
  const vals = ["lt50", "50to100", "gt100"], opts = ns.map((n, b) => { const low = n >= 8 ? floors[b] : null, high = n >= 8 ? floors[b] + (n - 1) * 1500 : null; return { dimension: "mileage", label: BAND[vals[b]], value: vals[b], n, low, high, median: floors[b] + 3000, rangeFloor: n < 8, ownWindow: false, windowWords: "since June 2025" }; }).filter(o => o.n >= 3);
  const lines = opts.map(o => o.rangeFloor ? `${o.label}, ${o.n} sales, too few for a range` : `${o.label} $${o.low.toLocaleString("en-US")} to $${o.high.toLocaleString("en-US")}, ${o.n} sales since June 2025`);
  return { ...base, tier: "result", optionsState: "split", headlineDimension: "mileage", poolN: ns.reduce((t, x) => t + x, 0), soldCount: ns.reduce((t, x) => t + x, 0), cluster: null, windowWords: "since June 2025", rawPool: rows, options: opts, refineOptions: [], thinReason: "pooled_apart", headlineLines: lines, optionLines: lines };
};
const served = (d, miles) => E.withReadFields(d, "1995 BMW M3 Coupe", { year: 1995, listingMiles: miles });
const find = (d, miles) => E.findAnswerOf(served(d, miles), { title: "1995 BMW M3 Coupe", year: 1995, miles, bid: 7000 });
const NO_TOO_FEW_HEAD = fa => !(fa.lines || []).some(l => /too few for a range/i.test(l));
// 1. the live car: 38,000 miles (61,000 km), under 50 holds 4, 50 to 100 holds 9, over 100 holds 5
{
  const d = answer([4, 9, 5]), fa = find(d, 38000);
  ok("the live car: the headline is the 50,000 to 100,000 mile range, not 'too few'", !!(fa && fa.state === "range" && fa.basis === "band_near" && fa.range && fa.range.low === 26000), JSON.stringify(fa && fa.range));
  ok("... with the engine's one sentence naming both bands", fa && fa.lines[0] === "Few sales under 50,000 miles, so this is the 50,000 to 100,000 mile range.", fa && fa.lines[0]);
  ok("... and no headline line says 'too few for a range'", fa && NO_TOO_FEW_HEAD(fa), fa && JSON.stringify(fa.lines));
  ok("... the total is stated once (the count line), the sentence carries no count", fa && fa.lines.filter(l => /\b\d+ sales?\b/.test(l)).length === 1, fa && JSON.stringify(fa.lines));
  ok("the option list does not restate the headline band or the thin band the sentence names", fa && (fa.otherLines || []).length === 1 && /^Over 100,000 miles/.test((fa.otherLines || [])[0]) && !(fa.otherLines || []).some(l => /^(Under 50,000|50,000 to 100,000)/.test(l)), fa && JSON.stringify(fa.otherLines));
  const sv = served(d, 38000);
  ok("Market Check with typed miles carries the same sentence as nearBand", sv.nearBand && sv.nearBand.line === fa.lines[0] && sv.nearBand.to.value === "50to100" && sv.nearBand.from.n === 4, sv.nearBand && JSON.stringify(sv.nearBand));
}
// 2. every band a car can sit in: the headline never says 'too few' while a neighbour has a range; options are never restated; bands ascend
const SHAPES = [[4, 9, 5], [9, 4, 5], [5, 4, 9], [3, 9, 3], [9, 9, 4], [4, 3, 9], [9, 3, 3], [3, 3, 9]];
for (const ns of SHAPES) for (const miles of [20000, 38000, 49999, 50000, 75000, 99999, 120000]) {
  const d = answer(ns), sv = served(d, miles), fa = E.findAnswerOf(sv, { title: "1995 BMW M3 Coupe", year: 1995, miles, bid: 7000 });
  const own = miles < 50000 ? 0 : miles < 100000 ? 1 : 2, anyRange = ns.some(n => n >= 8), ownRange = ns[own] >= 8, tag = `${ns.join("/")} at ${miles}`;
  if (!fa) { ok(`${tag}: an answer`, false); continue; }
  if (ns[own] >= 3 && !ownRange && anyRange) ok(`${tag}: own band thin, a neighbour has a range: the headline is a range`, fa.state === "range" && fa.basis === "band_near" && NO_TOO_FEW_HEAD(fa), JSON.stringify(fa.lines));
  if (ns[own] >= 3 && ownRange) ok(`${tag}: own band has a range: no near-band sentence`, !fa.nearBand && fa.basis !== "band_near");
  const heads = new Set([fa.option && fa.option.label, fa.nearBand && fa.nearBand.from.label].filter(Boolean));
  ok(`${tag}: the option list restates no band the headline states`, !(fa.otherLines || []).some(l => [...heads].some(h => l.startsWith(h))), JSON.stringify([...heads, fa.otherLines]));
  const order = (sv.options || []).map(o => ["lt50", "50to100", "gt100"].indexOf(o.value)), asc = a => a.every((x, i) => i === 0 || a[i - 1] < x);
  ok(`${tag}: options and their lines print ascending`, asc(order) && asc((sv.optionLines || []).map(l => ["Under", "50,000", "Over"].findIndex(w => l.startsWith(w)))) && asc((fa.otherLines || []).map(l => ["Under", "50,000", "Over"].findIndex(w => l.startsWith(w)))), JSON.stringify([order, sv.optionLines]));
}
// 3. nothing to headline: no band has a range, the sentence is not made up
{ const fa = find(answer([4, 5, 3]), 38000); ok("no band has a range: the engine says too few (honest), with no near-band sentence", fa && fa.state === "few" && !fa.nearBand && /too few for a range/.test(fa.lines[0]), fa && JSON.stringify(fa.lines)); }
// 4. km: 61,000 km is about 37,900 miles before it is banded, and the band label is in miles
{ const f = S.listingFacts({ listing_title: "1995 BMW M3 Coupe, 61,000-Kilometer", mileage: 61000, year: 1995, source: "bringatrailer", location: "Bellingham, WA", country: "US" });
  ok("61,000 km is converted to miles before banding (37,000 to 38,000)", f.miles >= 37000 && f.miles <= 38000, String(f.miles));
  const fa = find(answer([4, 9, 5]), f.miles);
  ok("... and lands in the under 50,000 miles band, the sentence in miles", fa && /under 50,000 miles/.test(fa.lines[0]) && fa.nearBand && fa.nearBand.from.value === "lt50", fa && fa.lines[0]); }
// 5. the same rule on other dimensions: the matched option is never printed twice (gearbox, body)
for (const [dim, labels, title] of [["gearbox", [["Manual", "manual"], ["Tiptronic", "auto"]], "1995 Porsche 911 Carrera 6-Speed Manual"], ["body", [["Coupe", "coupe"], ["Cabriolet", "open"]], "1995 Porsche 911 Carrera Coupe"]]) {
  const opts = labels.map(([label, value], i) => ({ dimension: dim, label, value, n: i ? 9 : 12, low: 40000 + i * 9000, high: 60000 + i * 9000, median: 50000 + i * 9000, rangeFloor: false, ownWindow: false, windowWords: "since June 2025" }));
  const d = { ...base, tier: "result", optionsState: "split", headlineDimension: dim, poolN: 21, cluster: null, windowWords: "since June 2025", rawPool: [], options: opts, refineOptions: [], headlineLines: opts.map(o => `${o.label}, $${o.low} to $${o.high}, ${o.n} sales`), optionLines: opts.map(o => `${o.label}, $${o.low} to $${o.high}, ${o.n} sales`) };
  const fa = E.findAnswerOf(E.withReadFields(d, title, { year: 1995 }), { title, year: 1995 });
  ok(`${dim}: the matched option is the headline and the option list holds only the others`, fa && fa.option && fa.otherLines && fa.otherLines.length === 1 && !fa.otherLines[0].startsWith(fa.option.label), fa && JSON.stringify([fa.option, fa.otherLines]));
}
// 6. the Task email prints what the engine sends: the sentence once, the other bands once, ascending, no band twice
{
  const d = answer([4, 9, 5]), sv = served(d, 38000), fa = E.findAnswerOf(sv, { title: "1995 BMW M3 Coupe", year: 1995, miles: 38000, bid: 7000 });
  const { samLines } = await imp("api/buySearch.js");
  const market = { kind: "range", low: fa.range ? fa.range.low : 0, high: fa.range ? fa.range.high : 0, count: fa.n, emailMode: "range_with_options", optionLines: sv.optionLines, options: sv.options, findAnswer: fa };
  const l = { id: 1, title: "1995 BMW M3 Coupe", make: "BMW", url: "https://a.test/1", source: "Bring a Trailer", photo_url: null, end_time: new Date(Date.now() + 5 * 3600e3).toISOString(), current_bid_usd: 7000, bid_at: new Date(Date.now() - 600e3).toISOString(), miles: 38000, location: "Bellingham, WA", country: "US", chips: [], market, sam_lines: samLines({ market }) };
  const t = C.emailCardText(l), lines = t.split("\n");
  ok("email: the near-band sentence prints once", lines.filter(x => x === fa.lines[0]).length === 1, t);
  ok("email: 'too few for a range' does not head the card", !/Four sales under 50,000 miles, too few for a range/.test(t) && !/^Under 50,000 miles, 4 sales/m.test(t), t);
  ok("email: the other band prints once, after the headline", lines.filter(x => /^Over 100,000 miles/.test(x)).length === 1, t);
  ok("email: no band line is printed twice", new Set(lines.filter(x => /miles/.test(x) && /sales?/.test(x))).size === lines.filter(x => /miles/.test(x) && /sales?/.test(x)).length, t);
}
// 7. the match reason names what matched, in words (tasks and every other reason string)
{
  const R = T.matchReasonLine || (() => null), car = { year: 1995, gearbox: "manual", colour: "Red", miles: 30000, distance_miles: 30 };
  const cases = [[{ make: "BMW", year_min: 1995, year_max: 1995 }, car, 7000, "Matches your Task: a BMW from 1995."], [{ make: "Audi", model: "RS 6", year_min: 2005, year_max: 2010, budget_max: 60000 }, { year: 2007 }, 50000, "Matches your Task: an Audi RS 6 from 2007, under $60,000."],
    [{ make: "Porsche", model: "911", generation: "997", gearbox: "manual", year_min: 2005, year_max: 2008 }, { year: 2006, gearbox: "manual" }, null, "Matches your Task: a manual Porsche 997 from 2006."], [{ budget_max: 20000 }, {}, 15000, "Matches your Task: a car under $20,000."],
    [{ make: "BMW", model: "M3", year_min: 1995 }, car, null, "Matches your Task: a BMW M3 from 1995."], [{ colour: "red" }, car, null, "Matches your Task: a red car."]];
  for (const [f, c, bid, want] of cases) ok(`reason: ${want}`, R(f, c, bid) === want, R(f, c, bid));
  const sweep = []; for (const make of [null, "BMW", "Audi", "Honda", "Porsche"]) for (const model of [null, "M3", "911", "RS 6"]) for (const generation of [null, "997", "E36"]) for (const y of [null, 1995]) for (const gearbox of [null, "manual"]) {
    const line = R({ make, model, generation, year_min: y, year_max: y, gearbox }, { year: 1995, gearbox: "manual" }, null); if (line) sweep.push(line); }
  ok(`every reason (${sweep.length} filter shapes) is a sentence naming a car ("a ..." or "an ..."), never a bare year, make or code`, sweep.every(l => /^Matches your Task: an? [^,.]*(car|[A-Za-z]{2,})[^.]*\.$/.test(l) && !/^Matches your Task: (\d{4}|[A-Z0-9-]{2,6})\.$/.test(l)), sweep.find(l => !/^Matches your Task: an? /.test(l)));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git|proofs|docs/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const hits = [...walk("lib"), ...walk("api"), ...walk("public")].filter(f => /Matches your Task|Matches your task|matches your Task/i.test(fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "")));
  ok("the reason string is built in one place (lib/tasks/tasks.js), so no watch or Task path has its own", hits.length === 1 && hits[0] === path.join("lib", "tasks", "tasks.js"), hits.join(" | "));
}
console.log(fail ? `mileageBandNearCheck: ${fail} failure(s)` : "mileageBandNearCheck: all pass");
process.exit(fail ? 1 : 0);
