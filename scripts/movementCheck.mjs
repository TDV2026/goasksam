// movementCheck (Lane B, Oct 21 2026, Sam's Market Check chart order): offline, no network. The engine buckets the movement the chart
// draws: quarters if every quarter that has a sale meets the range minimum (8), else half-years, else years; only buckets that
// meet the minimum are returned; a bucket with no sale never appears (no $0); fewer than two qualify: no movement. The three cars
// Sam named are modelled on their real shapes: a 2025 911 Carrera T (a current quarter with no sale yet), a sparse 2014 911, and a
// car with full quarters.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const mk = (month, day, n, base, year = 2026) => Array.from({ length: n }, (_, i) => ({ auction_end_date: `${year}-${String(month).padStart(2, "0")}-${String(day + (i % 20)).padStart(2, "0")}`, _usd: base + i * 900 }));
const run = rows => ob.runWithAsOf("2026-10-21", () => ob.movementFor(rows));
// (1) FULL QUARTERS: 8 or more sales in each of the four quarters Q1 to Q4 2026 (the last four as of Oct 21 2026)
const full = [...mk(2, 1, 9, 100000), ...mk(5, 1, 10, 104000), ...mk(8, 1, 12, 108000), ...mk(10, 1, 9, 112000)];
const f = run(full);
ok(f && f.size === "quarter" && f.label === "by quarter" && f.buckets.length === 4, `full quarters: by quarter, four buckets (${f && f.size} ${f && f.buckets.length})`);
ok(f.buckets.every(b => b.count >= 8 && b.low > 0 && b.high >= b.low && b.typical > 0 && /^Q\d \d{4}$/.test(b.label)), "each bucket: its count, typical range, median and label");
ok(f.buckets.every(b => b.count > 0 && b.typical > 0), "no bucket is empty or $0");
// (2) THE 2025 911 CARRERA T SHAPE: eight or more in Q1 to Q3 2026, Q4 2026 still empty, nothing before: quarters, three buckets, no empty one
const t = run([...mk(2, 1, 8, 130000), ...mk(5, 1, 9, 133000), ...mk(8, 1, 8, 138000)]);
ok(t && t.size === "quarter" && t.buckets.length === 3 && t.buckets.every(b => b.count > 0 && b.typical > 0), "2025 Carrera T shape: three quarter candles, no $0 and no empty Q4 2026");
// (3) THE 2014 911 SHAPE: sparse quarters (1 to 5 sales each), enough by half-year: the next size
const sparse = [...mk(1, 1, 3, 60000), ...mk(2, 1, 3, 61000), ...mk(5, 1, 5, 62000), ...mk(8, 1, 4, 64000), ...mk(9, 1, 4, 65000)];   // Q1 6, Q2 5, Q3 8, no Q4: thin quarters; H1 11 and H2 8
const s2 = run(sparse);
ok(s2 && s2.size === "half-year" && s2.label === "by half-year" && s2.buckets.length >= 2 && s2.buckets.every(b => b.count >= 8), `2014 911 shape: thin quarters, so by half-year (${s2 && s2.size} ${s2 && s2.buckets.length})`);
// (4) SPARSER STILL: by year, thin years dropped
const yearly = [...Array.from({ length: 9 }, (_, i) => ({ auction_end_date: `2025-0${1 + (i % 9)}-10`, _usd: 50000 + i * 700 })), ...Array.from({ length: 10 }, (_, i) => ({ auction_end_date: `2024-0${1 + (i % 9)}-10`, _usd: 48000 + i * 700 })), ...mk(9, 1, 3, 52000)];
const y = run(yearly);
ok(y && y.size === "year" && y.label === "by year" && y.buckets.every(b => b.count >= 8) && y.buckets.length === 2, `by year when halves are thin (${y && y.size} ${y && y.buckets.length}: the thin 2026 year is dropped)`);
// (5) too few: one qualifying bucket, or none: no movement
ok(run(mk(8, 1, 9, 90000)) === null, "one qualifying bucket: no movement (the page's too-few line)");
ok(run(mk(8, 1, 5, 90000)) === null && run([]) === null, "under the minimum, or no sales: no movement");
// (6) the trend carries it and mapEngineAnswer passes it through; the old quarters stay for the other consumers
const trend = ob.runWithAsOf("2026-10-21", () => ob.trendFor(full, []));
ok(trend && trend.movement && trend.movement.size === "quarter" && Array.isArray(trend.quarters) && trend.quarters.length === 4, "the trend carries movement and keeps its four quarters");
const m = ob.mapEngineAnswer({ tier: "result", trend });
ok(m.trendMovement && m.trendMovement.label === "by quarter" && m.trendMovement.buckets.length === 4, "mapEngineAnswer passes trendMovement");
ok(ob.mapEngineAnswer({ tier: "result" }).trendMovement === null, "no trend: no movement");
ok(/^e7[7-9]-|^e[89]\d-/.test(ob.ENGINE_VERSION), `the new engine stamp: ${ob.ENGINE_VERSION}`);
console.log(bad ? `movementCheck: ${bad} failed` : "movementCheck: all passed");
process.exit(bad ? 1 : 0);
