// A CHART IS NEVER DRAWN FOR ANOTHER YEAR THAN THE ONE ASKED (Lane B, Oct 29 2026, the live chart sweep, read 6 of the B-ENGINE reads): of 39 answers whose held chart was scoped to one option, the examples included a 2019 Bentley Continental GT drawn from its 2008 sales
// ("The candles show the 2008 sales only") and a 2014 BMW X5 drawn from its 2013 sales: on a YEAR split chartOf tried every year's option, so the largest year drew the chart for a car of another year. FIX (lib/onebox.js chartOf): on a year split only the asked
// year's own option can scope the chart; every other dimension (gearbox, body, edition, mileage) still tries all options, largest first. This check: a 2019 car whose big option is 2008 is withheld, never scoped to 2008; when its own year clears the floor it is scoped to 2019;
// a gearbox split still tries the largest option.
//   node scripts/chartYearScopeCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let id = 0; const QS = ["2025-11-10", "2026-02-10", "2026-05-10", "2026-08-10"];
const sale = (year, date, tx = "Manual") => ({ id: "y" + id++, _usd: 90000 + (id % 7) * 900, auction_end_date: date, year, transmission: tx, rtitle: `${year} Bentley Continental GT`, raw_title: `${year} Bentley Continental GT` });
const many = (year, per, tx) => QS.flatMap(d => Array.from({ length: per }, (_, i) => sale(year, d.slice(0, 8) + String(10 + i), tx)));
const yearAnswer = (askedYear, rows, counts) => ({ tier: "result", poolN: rows.length, rawPool: rows, headlineDimension: "year", optionsState: "split", resolvedCar: { year: askedYear, make: "Bentley", model: "Continental GT" }, trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null,
  options: Object.entries(counts).map(([y, n]) => ({ dimension: "year", label: y, value: y, n, low: 80000, high: 120000, rangeFloor: false })) });
{ const rows = [...many(2008, 6), ...Array.from({ length: 3 }, (_, i) => sale(2019, `2026-0${1 + i}-15`))];
  const c = E.chartOf(yearAnswer(2019, rows, { 2008: 24, 2019: 3 }));
  ok("a 2019 car whose big year is 2008: the chart is withheld, never drawn from the 2008 sales", c && c.type === "withheld" && !c.scope, c && JSON.stringify([c.type, c.scope && c.scope.label])); }
{ const rows = [...many(2008, 6), ...many(2019, 6)];
  const c = E.chartOf(yearAnswer(2019, rows, { 2008: 24, 2019: 24 }));
  ok("when the asked year clears the floor on its own, the chart is scoped to the asked year", c && c.type === "candles" && c.scope && c.scope.label === "2019", c && JSON.stringify([c.type, c.scope && c.scope.label])); }
{ const rows = [...many(2019, 6, "Manual"), ...Array.from({ length: 3 }, (_, i) => sale(2019, `2026-0${1 + i}-20`, "SMG"))];
  const a = { tier: "result", poolN: rows.length, rawPool: rows, headlineDimension: "gearbox", optionsState: "split", resolvedCar: { year: 2019 }, trendHeld: { reason: "mix_changes" }, trend: { quarters: [] }, cluster: null, options: [{ dimension: "gearbox", label: "SMG", value: "auto", n: 3 }, { dimension: "gearbox", label: "Manual", value: "manual", n: 24 }] };
  const c = E.chartOf(a); ok("a gearbox split still tries the largest option (Manual draws)", c && c.type === "candles" && c.scope && c.scope.label === "Manual", c && JSON.stringify([c.type, c.scope && c.scope.label])); }
console.log(fail ? `chartYearScopeCheck: ${fail} failure(s)` : "chartYearScopeCheck: all pass");
process.exit(fail ? 1 : 0);
