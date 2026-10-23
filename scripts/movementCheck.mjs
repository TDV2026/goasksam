// movementCheck (Lane B, Oct 23 2026, Sam's candle rulings): offline, no network. The chart reads up to 36 months of the same pool, bucketed by
// quarter, else half-year, else year. A candle needs 5 sales, the chart needs 3 candles; a bucket under the floor (a partial oldest or newest
// period included) is left out and never forces a coarser size; the size widens only when fewer than 3 candles qualify; a bucket with no sale never
// appears; the span is labelled. The range threshold of 8 is untouched.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const mk = (year, month, n, base) => Array.from({ length: n }, (_, i) => ({ auction_end_date: `${year}-${String(month).padStart(2, "0")}-${String(1 + (i % 25)).padStart(2, "0")}`, _usd: base + i * 500 }));
const mv = rows => ob.movementFor(rows);
// (1) the 2000 Boxster shape: Q1 15, Q2 13, Q3 12 full quarters, the oldest partial quarter 9 and the current one 6: all five clear 5, by quarter
const boxster = [...mk(2025, 11, 9, 20000), ...mk(2026, 2, 15, 21000), ...mk(2026, 5, 13, 22000), ...mk(2026, 8, 12, 23000), ...mk(2026, 10, 6, 24000)];
const b = mv(boxster);
ok(b && b.size === "quarter" && b.buckets.length === 5 && b.buckets.every(x => x.count >= 5), `Boxster shape: five quarter candles (${b && b.size} ${b && b.buckets.length})`);
ok(/^by quarter, November 2025 to October 2026$/.test(b.label) && b.spanLabel === "November 2025 to October 2026", `the span is labelled: ${b && b.label}`);
// (2) a partial edge below the floor is left out and does NOT force a coarser size
const edge = [...mk(2025, 11, 3, 20000), ...mk(2026, 2, 9, 21000), ...mk(2026, 5, 8, 22000), ...mk(2026, 8, 7, 23000), ...mk(2026, 10, 2, 24000)];
const e = mv(edge);
ok(e && e.size === "quarter" && e.buckets.length === 3 && e.buckets.map(x => x.count).join() === "9,8,7", `thin oldest (3) and newest (2) quarters are dropped, three quarter candles stay (${e && e.size} ${e && e.buckets.map(x => x.count).join()})`);
// (3) fewer than three candles at quarters widens to half-years, then years
const sparse = [...mk(2025, 2, 3, 59000), ...mk(2025, 5, 3, 59500), ...mk(2025, 8, 3, 60000), ...mk(2025, 11, 3, 60500), ...mk(2026, 2, 3, 61000), ...mk(2026, 5, 3, 62000), ...mk(2026, 8, 2, 64000)];
const sp = mv(sparse);
ok(sp && sp.size === "half-year" && sp.buckets.length >= 3 && sp.buckets.every(x => x.count >= 5), `thin quarters: by half-year (${sp && sp.size} ${sp && sp.buckets.map(x => x.count).join()})`);
const yearly = [...mk(2024, 3, 6, 50000), ...mk(2024, 10, 3, 50500), ...mk(2025, 3, 3, 51000), ...mk(2025, 9, 4, 52000), ...mk(2026, 2, 6, 53000), ...mk(2026, 9, 2, 54000)];
const yv = mv(yearly);
ok(yv && yv.size === "year" && yv.buckets.length === 3 && yv.buckets.every(x => x.count >= 5), `thin halves: by year (${yv && yv.size} ${yv && yv.buckets.map(x => x.count).join()})`);
// (4) no zero-sale bucket is ever returned, and every candle carries its count and a real range
ok([b, e, sp, yv].every(m => m.buckets.every(x => x.count > 0 && x.low > 0 && x.high >= x.low && x.typical > 0)), "no bucket is empty or $0; each has its count, range and median");
// (5) too few: two qualifying buckets, one, none
ok(mv([...mk(2026, 2, 9, 90000), ...mk(2026, 5, 9, 91000)]) === null && mv(mk(2026, 8, 9, 90000)) === null && mv([]) === null, "under three candles at every size: no movement");
// (6) the trend carries it, the old quarters stay, mapEngineAnswer passes it through
const trend = ob.runWithAsOf("2026-10-23", () => ob.trendFor(boxster, [], boxster));
ok(trend && trend.movement && trend.movement.size === "quarter" && Array.isArray(trend.quarters) && trend.quarters.length === 4, "the trend carries movement and keeps its four quarters");
const m = ob.mapEngineAnswer({ tier: "result", trend });
ok(m.trendMovement && m.trendMovement.buckets.length === 5, "mapEngineAnswer passes trendMovement");
ok(ob.CANDLE_MIN === 5 && ob.CANDLE_MIN_COUNT === 3 && ob.__specEngine.RANGE_THRESHOLD === 8, "candle floor 5 and 3; the range threshold stays 8");
ok(/^e80-/.test(ob.ENGINE_VERSION), `the engine stamp: ${ob.ENGINE_VERSION}`);
console.log(bad ? `movementCheck: ${bad} failed` : "movementCheck: all passed");
process.exit(bad ? 1 : 0);
