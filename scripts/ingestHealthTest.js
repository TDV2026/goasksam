// Stubbed, no-network test for the archive-based health check (item 3): zero-streak detection that
// judges a source by the archive's own per-day totals and only flags a source that NORMALLY sells.
//
//   node scripts/ingestHealthTest.js

import { longestZeroRun, normallyHasSales, zeroStreakFlag, recentDayList, weekdayOf, isFutureSale } from "../lib/_ingestHealth.js";

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

const asOf = "2026-10-03";
const window = recentDayList(asOf, 28);   // oldest first

// A continuous source (sells every day ~30) that just died: the last 4 days (before today) are zero.
const died = {}; for (const d of window) died[d] = 30;
for (const d of recentDayList(asOf, 4)) died[d] = 0;   // 2026-09-29..2026-10-02 zeroed
ok("continuous source normallyHasSales", normallyHasSales(died, { asOf, window: 28 }) === true);
eq("longestZeroRun is 4", longestZeroRun(died, { asOf, window: 14 }).run, 4);
const flagDied = zeroStreakFlag(died, { asOf, window: 14, minRun: 3, salesWindow: 28 });
ok("dead continuous source IS flagged", !!flagDied && flagDied.zeroRun === 4);

// A healthy continuous source: no streak, not flagged.
const healthy = {}; for (const d of window) healthy[d] = 30;
eq("healthy longest zero run is 0", longestZeroRun(healthy, { asOf, window: 14 }).run, 0);
ok("healthy source NOT flagged", zeroStreakFlag(healthy, { asOf, window: 14, minRun: 3, salesWindow: 28 }) === null);

// A one-day blip (single zero day) does not trip the 3-day minimum.
const blip = {}; for (const d of window) blip[d] = 30;
blip[recentDayList(asOf, 2)[0]] = 0;   // a single zero day
ok("single zero day NOT flagged (below minRun)", zeroStreakFlag(blip, { asOf, window: 14, minRun: 3 }) === null);

// An auction house that sold on ONE day in the window and is otherwise empty: a long zero run, but it
// does NOT normally sell, so it must NOT be flagged (monthly-burst sources are exempt).
const house = {}; for (const d of window) house[d] = 0;
house[window[10]] = 120;   // one big sale day
ok("monthly house does NOT normallyHasSales", normallyHasSales(house, { asOf, window: 28 }) === false);
ok("monthly house NOT flagged despite long zero run", zeroStreakFlag(house, { asOf, window: 14, minRun: 3, salesWindow: 28 }) === null);

// Weekend-quiet source: sells Mon-Fri ~20, zero on weekends. Its median daily is >0, so it normally
// sells; but a routine 2-day weekend gap must stay under the 3-day minimum and not be flagged.
const weekdaysOnly = {}; for (const d of window) weekdaysOnly[d] = (weekdayOf(d) === 0 || weekdayOf(d) === 6) ? 0 : 20;
ok("weekday source normallyHasSales", normallyHasSales(weekdaysOnly, { asOf, window: 28 }) === true);
ok("routine weekend gap (2d) NOT flagged", zeroStreakFlag(weekdaysOnly, { asOf, window: 14, minRun: 3 }) === null);

// --- future-sale guard (item 2): a completed sale can never be dated after the run day ---
const runDay = "2026-10-05";
ok("future: tomorrow rejected", isFutureSale("2026-10-06", runDay) === true);
ok("future: months ahead rejected", isFutureSale("2026-12-09", runDay) === true);
ok("future: today allowed (same-day close)", isFutureSale("2026-10-05", runDay) === false);
ok("future: yesterday allowed", isFutureSale("2026-10-04", runDay) === false);
ok("future: blank date is not future", isFutureSale("", runDay) === false);
ok("future: datetime form compared by day", isFutureSale("2026-10-06T14:00:00Z", runDay) === true);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
