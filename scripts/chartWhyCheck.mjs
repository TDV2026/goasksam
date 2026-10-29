// A WITHHELD CHART SAYS THE OPTIONS' REASON, NOT THE POOLED ANSWER'S (Lane B, Oct 29 2026). Live: the 2004 BMW M3, the 1995 Porsche 911 and the 1986 Porsche 911 Carrera all showed "The mix of cars changed from quarter to quarter".
// CAUSE (lib/onebox.js chartOf): when the pooled series is held the chart tries each option in turn, but the sentence under a withheld chart was taken from the POOLED answer (trendHeld.reason) whatever stopped the options, so an option that was
// simply too thin (fewer sales than the candle floor in too few quarters) was reported as a changing mix. NOW: each option's own test is kept (sales per quarter, the floor, the quarters that meet it, which test failed) and the sentence is the options':
// "mix changed" only if an option met the floor and its other dimension moved, "too few sales in each period" when none had enough. Every answer split by an option with a held pooled chart is this class (gearbox, body, edition, mileage, year).
//   node scripts/chartWhyCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const HELD = "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.", FEW = "There are too few sales in each period to draw a chart.";
const sale = (i, date, gb, body) => ({ id: "s" + i, _usd: 30000 + (i % 7) * 900, auction_end_date: date, transmission: gb, rtitle: `2004 BMW M3 ${body}`, raw_title: `2004 BMW M3 ${body}`, year: 2004 });
const opts = [{ dimension: "gearbox", label: "Manual", value: "manual", n: 0 }, { dimension: "gearbox", label: "SMG", value: "auto", n: 0 }];
const mk = (rows, n1, n2) => ({ tier: "result", poolN: rows.length, rawPool: rows, headlineDimension: "gearbox", optionsState: "split", options: opts.map((o, i) => ({ ...o, n: i ? n2 : n1 })), trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null, windowWords: "since October 2025" });
let id = 0;
// A. both options far under the floor: 6 Manual and 3 SMG sales in one quarter, the pooled series held for its mix. The options' reason is "too few".
{ const rows = [...Array.from({ length: 6 }, (_, i) => sale(id++, `2026-0${1 + (i % 3)}-1${i}`, "Manual (6-speed)", "Coupe")), ...Array.from({ length: 3 }, (_, i) => sale(id++, `2026-0${1 + i}-2${i}`, "SMG", "Coupe"))];
  const c = E.chartOf(mk(rows, 6, 3));
  ok("A. every option too thin: withheld", c && c.type === "withheld");
  ok("A. ... and the sentence is the too-few sentence, not the pooled answer's mix sentence", c && c.withheld.reason === "too_few" && c.withheld.line === FEW, c && JSON.stringify(c.withheld.reason));
  ok("A. ... each option's own test is kept: sales, the floor, the quarters meeting it, the test that failed", c && Array.isArray(c.withheld.options) && c.withheld.options.length === 2 && c.withheld.options.every(t => t.failed === "floor" && t.floor === 5 && t.quartersNeeded === 3 && Number.isFinite(t.n) && Array.isArray(t.perQuarter)), c && JSON.stringify(c.withheld.options)); }
// B. an option that meets the floor (10 a quarter over four quarters) whose body mix moves from all coupes to all convertibles: the mix is the reason
{ const qs = ["2025-11-10", "2026-02-10", "2026-05-10", "2026-08-10"], rows = [];
  qs.forEach((d, qi) => { for (let i = 0; i < 10; i++) rows.push(sale(id++, d.slice(0, 8) + String(10 + i), "Manual (6-speed)", qi < 2 ? "Coupe" : "Convertible")); });
  for (let i = 0; i < 3; i++) rows.push(sale(id++, `2026-03-0${1 + i}`, "SMG", "Coupe"));
  const c = E.chartOf(mk(rows, 40, 3));
  ok("B. an option that meets the floor but whose body mix moved: the mix sentence", c && c.type === "withheld" && c.withheld.reason === "mix_changes" && c.withheld.line === HELD, c && JSON.stringify(c.withheld && [c.withheld.reason, (c.withheld.options || []).map(t => t.label + ":" + t.failed)])); }
// C. an option that clears both tests draws, as before
{ const qs = ["2025-11-10", "2026-02-10", "2026-05-10", "2026-08-10"], rows = [];
  qs.forEach(d => { for (let i = 0; i < 10; i++) rows.push(sale(id++, d.slice(0, 8) + String(10 + i), "Manual (6-speed)", "Coupe")); });
  for (let i = 0; i < 3; i++) rows.push(sale(id++, `2026-03-0${1 + i}`, "SMG", "Coupe"));
  const c = E.chartOf(mk(rows, 40, 3)); ok("C. an option that clears the floor with a steady mix draws, scoped to it", c && c.type === "candles" && c.scope && c.scope.label === "Manual", c && c.type); }
// D. a pooled answer that is not split keeps the pooled reason (no options were tried)
{ const rows = Array.from({ length: 6 }, (_, i) => sale(id++, `2026-0${1 + i}-10`, "Manual", "Coupe")); const c = E.chartOf({ tier: "result", poolN: 6, rawPool: rows, trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null });
  ok("D. no options tried: the pooled answer's own reason stands", c && c.withheld.reason === "mix_changes" && !c.withheld.options); }
// E. the other option kinds are the same class: body, mileage, year, edition each report the options' reason
for (const dim of ["body", "mileage", "year", "edition"]) {
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...sale(id++, `2026-0${1 + (i % 3)}-1${i}`, "Manual", i % 2 ? "Coupe" : "Convertible"), year: i % 2 ? 2004 : 2005, mileage: i % 2 ? 30000 : 70000 }));
  const o = dim === "body" ? [{ dimension: "body", label: "Coupe", value: "coupe", n: 4 }, { dimension: "body", label: "Convertible", value: "convertible", n: 4 }] : dim === "mileage" ? [{ dimension: "mileage", label: "Under 50,000 miles", value: "under50", n: 4 }, { dimension: "mileage", label: "Over 50,000 miles", value: "over50", n: 4 }] : dim === "year" ? [{ dimension: "year", label: "2004", value: 2004, n: 4 }, { dimension: "year", label: "2005", value: 2005, n: 4 }] : [{ dimension: "edition", label: "Coupe", value: "coupe", n: 4 }, { dimension: "edition", label: "Convertible", value: "convertible", n: 4 }];
  const c = E.chartOf({ tier: "result", poolN: 8, rawPool: rows, headlineDimension: dim, options: o, trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null });
  ok(`E. ${dim}: options too thin, withheld with the too-few sentence`, c && c.type === "withheld" && c.withheld.reason === "too_few", c && c.withheld && c.withheld.reason); }
// F. the page prints the engine's sentence: nothing in a page decides the reason
{ const pg = fs.readFileSync("public/js/onebox.js", "utf8"); ok("F. the page prints the engine's plain heading and decides no reason (the reasons are not printed, Oct 29 2026)", /chartLatestHeading/.test(pg) && !/changed from quarter to quarter/.test(pg.replace(/\/\/[^\n]*/g, ""))); }
console.log(fail ? `chartWhyCheck: ${fail} failure(s)` : "chartWhyCheck: all pass");
process.exit(fail ? 1 : 0);
