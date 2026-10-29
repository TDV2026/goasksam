// A SPLIT ANSWER WITH AN OPTION OVER THE CANDLE FLOOR IS NEVER WITHHELD (Lane B, Oct 29 2026). The live 1986 Porsche 911 Carrera (35 sales: targa, cabriolet, coupe) sent no chart with "The mix of cars changed
// from quarter to quarter". CAUSE (lib/onebox.js chartOf): when the pooled chart is withheld for a changing mix, the scoped rung tried ONE option, the matched or the first in the order sent, and withheld
// if that one missed the floor (CANDLE_MIN 5 sales a candle, CANDLE_MIN_COUNT 3 candles, by quarter, else half-year, else year), even when a larger option cleared it. Now every option is tried (the matched or
// leading one first as before, then the rest largest first) and the chart is withheld only when none clears. The rung reads the answer's stored window (rawPool), so an option the window cannot give three
// candles (the 1986 coupe, 16 sales in about four quarters) is still withheld, said as such; a longer chart window needs the stored answer to carry it (after launch, not a read-time change).
// Affects every split or apart answer whose pooled chart is held: body, gearbox, edition, mileage and year splits, on Market Check, Sell, Find cards and the email. Swept by the ops task chartsweep.
//   node scripts/chartSplitFloorCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let n = 0;
const sales = (body, perQuarter, price) => perQuarter.flatMap((cnt, qi) => Array.from({ length: cnt }, (_, i) => { n++; return { id: "r" + n, _usd: price + i * 500, auction_end_date: `${["2025-11-", "2026-02-", "2026-05-"][qi]}${String(5 + i).padStart(2, "0")}`, rtitle: `1986 Porsche 911 Carrera ${body}`, year: 1986 }; }));
const answer = (opts, pool) => ({ tier: "result", trendHeld: { reason: "mix_changes", spreadPts: 30, limitPts: 10, periods: 4 }, trend: null, headlineDimension: "body", optionsState: "split", cluster: null,
  options: opts.map(([label, value, k]) => ({ label, value, n: k, dimension: "body" })), rawPool: pool });
const quarters = { targa: [4, 4, 3], coupe: [6, 6, 6], coupeThin: [4, 4, 4], cab: [2, 3, 3] };
// 1. the first option misses the floor, a larger one clears it: the larger draws, scoped
{ const a = answer([["Targa", "targa", 11], ["Coupe", "coupe", 18], ["Cabriolet", "cabriolet", 8]], [...sales("Targa", quarters.targa, 60000), ...sales("Coupe", quarters.coupe, 55000), ...sales("Cabriolet", quarters.cab, 70000)]);
  const c = E.chartOf(a);
  ok("a split answer whose first option misses the floor but whose coupe clears it draws candles", c && c.type === "candles", c && c.type);
  ok("the chart states its scope: the coupe, its own count and the total", c && c.scope && c.scope.value === "coupe" && /coupe/i.test(String(c.scope.line)) && c.scope.line.includes("18") && c.scope.line.includes(String(a.rawPool.length)), c && c.scope && c.scope.line);
  ok("its candles are the coupe's own (6 sales each)", c && Array.isArray(c.buckets) && c.buckets.length === 3 && c.buckets.every(b => b.count === 6)); }
// 2. no option clears (the 1986 case on a window of about four quarters): withheld, said as mix_changes
{ const a = answer([["Targa", "targa", 11], ["Coupe", "coupe", 12], ["Cabriolet", "cabriolet", 8]], [...sales("Targa", quarters.targa, 60000), ...sales("Coupe", quarters.coupeThin, 55000), ...sales("Cabriolet", quarters.cab, 70000)]);
  const c = E.chartOf(a); ok("no option clears the floor: withheld, with the engine's reason", c && c.type === "withheld" && c.withheld && c.withheld.reason === "mix_changes", c && c.type); }
// 3. the leading option clears: unchanged, it still draws (no new order for a chart that drew before)
{ const a = answer([["Coupe", "coupe", 18], ["Targa", "targa", 11]], [...sales("Coupe", quarters.coupe, 55000), ...sales("Targa", [6, 6, 6], 60000)]);
  const c = E.chartOf(a); ok("the leading option clears: it draws, as before", c && c.type === "candles" && c.scope && c.scope.value === "coupe"); }
// 4. the class, any split dimension: a gearbox split whose second option clears
{ const g = (label, value, k, q, title) => ({ label, value, k, q, title }); n = 0;
  const rows = [...[4, 4, 4].flatMap((cnt, qi) => Array.from({ length: cnt }, (_, i) => ({ id: "m" + (n++), _usd: 40000 + i * 300, auction_end_date: `${["2025-11-", "2026-02-", "2026-05-"][qi]}${String(5 + i).padStart(2, "0")}`, rtitle: "2004 BMW M3 6-Speed Manual", year: 2004 }))),
    ...[6, 6, 6].flatMap((cnt, qi) => Array.from({ length: cnt }, (_, i) => ({ id: "s" + (n++), _usd: 36000 + i * 300, auction_end_date: `${["2025-11-", "2026-02-", "2026-05-"][qi]}${String(7 + i).padStart(2, "0")}`, rtitle: "2004 BMW M3 SMG", year: 2004 })))];
  const a = { ...answer([], rows), headlineDimension: "gearbox", options: [{ label: "Manual", value: "manual", n: 12, dimension: "gearbox" }, { label: "SMG", value: "auto", n: 18, dimension: "gearbox" }] };
  const c = E.chartOf(a); ok("a gearbox split: the SMG option clears while the manual option does not, and it draws", c && c.type === "candles" && c.scope && c.scope.dimension === "gearbox", c && JSON.stringify(c.scope || c.type)); }
console.log(failed ? `chartSplitFloorCheck: ${failed} failure(s)` : "chartSplitFloorCheck: all pass");
process.exit(failed ? 1 : 0);
