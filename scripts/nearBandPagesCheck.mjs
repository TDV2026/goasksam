// THE TWO PAGES PRINT THE ENGINE'S NEAR-BAND FIELDS AND NOTHING OF THEIR OWN (Lane E, Oct 30 2026; Lane B's 8c6025fb: nearBand.line, findAnswer.otherLines).
// (1) Market Check's shared answer card (lib/sellsForCard.js) prints nearBand.line, the engine's sentence, when the answer sets it, and prints nothing of its own when it does not.
// (2) Find's expanded panel (api/buy.js drawerHtml) prints findAnswer.otherLines, the options the headline does not state, never the whole option list.
// CLASS: every band a car can sit in, with every neighbour shape (the engine's own answers, scripts/mileageBandNearCheck.mjs's builder), at the card and at the panel.
//   node scripts/nearBandPagesCheck.mjs [repo root]
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
const card = await imp("lib/sellsForCard.js");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// the panel's option block, lifted from the page's own client code (api/buy.js CLIENT, drawerHtml) and run on a market object
const src = fs.readFileSync("api/buy.js", "utf8"), CL = JSON.parse(/const CLIENT = ("(?:[^"\\]|\\.)*");/.exec(src)[1]);
const a = CL.indexOf("    var fa1 = m && m.findAnswer"), a0 = a >= 0 ? a : CL.indexOf("    if (m && Array.isArray(m.optionLines) && m.optionLines.length) out.push('<div class=\"md-opts\">'");
const b0 = CL.indexOf("\n", CL.indexOf("out.push('<div class=\"md-opts\">'", a0));
const panelOf = new Function("esc", "m", "var out = [];\n" + CL.slice(a0, b0 + 1) + "\nreturn out.join('');");
const optTexts = html => [...html.matchAll(/<p class="md-opt">([^<]*)<\/p>/g)].map(x => x[1].replace(/&amp;/g, "&"));
const SHAPES = [[4, 9, 5], [9, 4, 5], [5, 4, 9], [3, 9, 3], [9, 9, 4], [4, 3, 9], [9, 3, 3], [3, 3, 9], [9, 9, 9], [4, 5, 3]];
let nearN = 0, ownN = 0, panelN = 0;
for (const ns of SHAPES) for (const miles of [20000, 38000, 49999, 50000, 75000, 99999, 120000]) {
  const tag = `${ns.join("/")} at ${miles}`, d = answer(ns), sv = served(d, miles), fa = E.findAnswerOf(sv, { title: "1995 BMW M3 Coupe", year: 1995, miles, bid: 7000 });
  // Market Check: the card prints the engine's sentence once when nearBand is set, and none when it is not
  const html = card.sellsForCardHtml(sv, { rows: false, reasonsShown: true, interactive: true }), n = (html.split(esc(sv.nearBand ? sv.nearBand.line : "\u0000")).length - 1);
  if (sv.nearBand) { nearN++; ok(`${tag}: Market Check prints the engine's near-band sentence once`, n === 1 && /sfc-small/.test(html), String(n)); }
  else { ownN++; ok(`${tag}: no near-band sentence on the card when the engine sets none`, !/so this is the .* mile range/.test(html)); }
  // Find's panel: only the other options, exactly as the engine wrote them
  if (fa && fa.otherLines) { panelN++;
    const market = { kind: "range", optionLines: sv.optionLines, findAnswer: fa }, got = optTexts(panelOf(esc, market));
    ok(`${tag}: the panel prints findAnswer.otherLines, line for line`, JSON.stringify(got) === JSON.stringify(fa.otherLines), JSON.stringify([got, fa.otherLines]));
    const head = fa.option && fa.option.label;
    ok(`${tag}: the panel never restates the headline band`, !got.some(l => head && l.startsWith(head)) && !(fa.nearBand && got.some(l => l.startsWith(fa.nearBand.from.label))), JSON.stringify(got)); }
}
// the empty list prints nothing, and an answer stored before otherLines keeps the older list
ok("an empty otherLines prints no options block", panelOf(esc, { kind: "range", optionLines: ["A, 3 sales", "B, 4 sales"], findAnswer: { state: "range", otherLines: [] } }) === "");
ok("a findAnswer with no otherLines (the headline dimension is not the options') prints no options block", panelOf(esc, { kind: "range", optionLines: ["A, 3 sales"], findAnswer: { state: "range", otherLines: null } }) === "");
ok("an answer stored before findAnswer keeps the older option list", optTexts(panelOf(esc, { kind: "range", optionLines: ["A, 3 sales", "B, 4 sales"] })).length === 2);
ok(`the sweep reached near-band and own-band cases at the card (${nearN} + ${ownN}) and the panel (${panelN})`, nearN >= 10 && ownN >= 10 && panelN >= 40, `${nearN}/${ownN}/${panelN}`);
console.log(fail ? `nearBandPagesCheck: ${fail} failure(s)` : "nearBandPagesCheck: all pass");
process.exit(fail ? 1 : 0);
