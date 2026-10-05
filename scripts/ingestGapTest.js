// Stubbed, no-network test for the gap-aware delta (item 2). Drives the SHARED walker
// (lib/_ingestHealth.js walkDeltaSource) with an injected fetchPage + isHeld, so it exercises the
// exact stop logic scripts/ingest.js uses in production, without any OCD or Supabase call.
//
//   node scripts/ingestGapTest.js
//
// Model: a source that normally sells ~10/day. The archive is missing a chunk of 2026-09-29
// (3 held, the rest dropped during the blocked nights). Newest-first OCD pages:
//   p1: 2026-10-02/01 (all already held)      <- old behaviour stops HERE
//   p2: 2026-09-30     (all already held)
//   p3: 2026-09-29     (2 held + 3 MISSING)   <- gap-aware must reach this page
//   p4: 2026-09-28     (all held)

import {
  weekdayOf, median, recentDayList, typicalByWeekday, earliestGapDay, deltaShouldStop, walkDeltaSource, requestCapReached
} from "../lib/_ingestHealth.js";

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

// --- pure helper sanity ---
eq("weekdayOf 2026-10-02 is Friday(5)", weekdayOf("2026-10-02"), 5);
eq("median even", median([1, 2, 3, 4]), 2.5);
eq("median empty is 0", median([]), 0);
eq("recentDayList excludes asOf, oldest first", recentDayList("2026-10-02", 3), ["2026-09-29", "2026-09-30", "2026-10-01"]);

// --- typical + gap detection ---
// 42 days of ~10/day; zero out the window's copy of the target weekday is NOT needed - we just prove
// the gap check flags a thin recent day. Build a daily map where everything is ~10 except 2026-09-29.
const asOf = "2026-10-03";
const daily = {};
for (const d of recentDayList(asOf, 42)) daily[d] = 10;
daily["2026-09-29"] = 2;                         // the thin day (archive only has 2, typical ~10)
const typical = typicalByWeekday(daily, { asOf, windowDays: 42 });
ok("typicalByWeekday >0 for a selling weekday", typical[weekdayOf("2026-09-29")] >= 8);
eq("earliestGapDay finds the thin day", earliestGapDay(daily, typical, { asOf, days: 7, fraction: 0.5 }), "2026-09-29");

// no gap when every recent day is healthy
const healthy = {}; for (const d of recentDayList(asOf, 42)) healthy[d] = 10;
eq("earliestGapDay null when healthy", earliestGapDay(healthy, typical, { asOf, days: 7, fraction: 0.5 }), null);

// a weekday the source never sells (typical 0) is never a gap
const neverSun = {}; for (const d of recentDayList(asOf, 42)) neverSun[d] = (weekdayOf(d) === 0 ? 0 : 10);
const typNever = typicalByWeekday(neverSun, { asOf, windowDays: 42 });
eq("Sunday typical is 0", typNever[0], 0);
eq("no gap flagged for a never-sell weekday", earliestGapDay(neverSun, typNever, { asOf, days: 7, fraction: 0.5 }), null);

// --- deltaShouldStop truth table ---
ok("stop=false while page has new rows", deltaShouldStop({ pageAllKnown: false, oldestDay: "2026-10-01", catchUpFrom: null }) === false);
ok("stop=true on known page, no gap", deltaShouldStop({ pageAllKnown: true, oldestDay: "2026-10-01", catchUpFrom: null }) === true);
ok("stop=false on known page while gap not yet reached", deltaShouldStop({ pageAllKnown: true, oldestDay: "2026-10-01", catchUpFrom: "2026-09-29" }) === false);
ok("stop=true on known page once gap reached", deltaShouldStop({ pageAllKnown: true, oldestDay: "2026-09-29", catchUpFrom: "2026-09-29" }) === true);

// --- the stubbed walk: gap-aware vs old stop-at-first-known-page ---
const PAGES = {
  1: { rows: [{ id: "a1", day: "2026-10-02" }, { id: "a2", day: "2026-10-01" }], totalPages: 4 },
  2: { rows: [{ id: "b1", day: "2026-09-30" }, { id: "b2", day: "2026-09-30" }], totalPages: 4 },
  3: { rows: [{ id: "c1", day: "2026-09-29" }, { id: "c2", day: "2026-09-29" }, { id: "m1", day: "2026-09-29" }, { id: "m2", day: "2026-09-29" }, { id: "m3", day: "2026-09-29" }], totalPages: 4 },
  4: { rows: [{ id: "d1", day: "2026-09-28" }], totalPages: 4 }
};
const heldSet = new Set(["a1", "a2", "b1", "b2", "c1", "c2", "d1"]);   // the m* rows are the missing gap
let fetched;
const fetchPage = async p => { fetched.push(p); return PAGES[p]; };
const isHeld = id => heldSet.has(id);

// Without a gap target, the walk stops at the first fully-known page (p1) - the old behaviour.
fetched = [];
let r = await walkDeltaSource({ fetchPage, isHeld, catchUpFrom: null, maxPages: 60 });
eq("no-gap: stops at page 1", r.pages, 1);
eq("no-gap: recovers nothing", r.kept.map(x => x.id), []);

// With the gap target 2026-09-29, the walk pushes past the known pages, recovers the three missing
// rows on page 3, then stops on the first FULLY-KNOWN page at/past the gap boundary (page 4, oldest
// 2026-09-28 <= catchUpFrom). The gap page itself is not "all known" (it holds the missing rows), so
// stopping one page later is correct - it confirms the gap boundary is fully cleared.
fetched = [];
r = await walkDeltaSource({ fetchPage, isHeld, catchUpFrom: "2026-09-29", maxPages: 60 });
eq("gap-aware: walked past the gap to the next known page (4)", r.pages, 4);
eq("gap-aware: fetched pages 1..4", fetched, [1, 2, 3, 4]);
eq("gap-aware: recovered the 3 missing rows", r.kept.map(x => x.id).sort(), ["m1", "m2", "m3"]);
ok("gap-aware: did not hit the page ceiling", r.hitCeiling === false);

// --- hard --max-requests budget ---
ok("requestCapReached: null max is unlimited", requestCapReached(1000, null) === false);
ok("requestCapReached: below max", requestCapReached(4, 6) === false);
ok("requestCapReached: at max", requestCapReached(6, 6) === true);
ok("requestCapReached: over max", requestCapReached(7, 6) === true);

// The walker stops BEFORE a fetch that would exceed the budget. A gap would otherwise walk 4 pages;
// with maxRequests=2 it fetches exactly 2 and reports capped, so the cap is a true hard ceiling.
fetched = [];
r = await walkDeltaSource({ fetchPage, isHeld, catchUpFrom: "2026-09-29", maxPages: 60, maxRequests: 2 });
eq("max-requests: fetched exactly 2 pages", fetched, [1, 2]);
eq("max-requests: requestsMade is 2", r.requestsMade, 2);
ok("max-requests: reports capped", r.capped === true);

// A budget wider than the work never binds: full gap walk completes, not capped.
fetched = [];
r = await walkDeltaSource({ fetchPage, isHeld, catchUpFrom: "2026-09-29", maxPages: 60, maxRequests: 20 });
eq("wide budget: full walk to page 4", fetched, [1, 2, 3, 4]);
ok("wide budget: not capped", r.capped === false);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
