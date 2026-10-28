// e100: a zero-sale run is flagged only when it is longer than the source's own longest earlier gap in the window.
// Cause (The Market, Oct 28): it sold 1 to 3 cars most days and nothing on Friday to Sunday, twice in four weeks; zeroStreakFlag flagged every run of 3 zero days in a source that normally sells, with no weekday shape.
// Class: every low volume source with a weekly gap (The Market, PistonHeads, PCARMarket, ACC, MB Market) trips the warning each week, which trains the reader to ignore it. A real outage (longer than any gap the source had) must still flag.
//   node scripts/zeroStreakGapCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const H = await import(pathToFileURL(path.join(root, "lib/_ingestHealth.js")).href);
const asOf = "2026-10-28";
const days = H.recentDayList(asOf, 29);
const series = (zeros) => Object.fromEntries(days.map(d => [d, zeros.includes(d.slice(5)) ? 0 : 2]));
// The Market as read on Oct 28: zero Oct 16 to 18 and Oct 23 to 25, sales every other day
const market = series(["10-16", "10-17", "10-18", "10-23", "10-24", "10-25"]);
ok("The Market's second weekend gap (3 days, same as the first) is not flagged", H.zeroStreakFlag(market, { asOf }) === null, JSON.stringify(H.zeroStreakFlag(market, { asOf })));
const outage = series(["10-09", "10-10", "10-11", "10-22", "10-23", "10-24", "10-25", "10-26", "10-27"]);
ok("a run of 6 after earlier gaps of 3 is flagged", (H.zeroStreakFlag(outage, { asOf }) || {}).zeroRun === 6, JSON.stringify(H.zeroStreakFlag(outage, { asOf })));
const firstGap = series(["10-24", "10-25", "10-26"]);
ok("a first gap of 3 with no earlier gap is flagged (nothing to compare it with)", (H.zeroStreakFlag(firstGap, { asOf }) || {}).zeroRun === 3);
ok("a source that sells in bursts is still never flagged", H.zeroStreakFlag(series(Array.from({ length: 24 }, (_, i) => days[i].slice(5))), { asOf }) === null);
process.exit(fail ? 1 : 0);
