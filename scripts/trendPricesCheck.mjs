// trendPricesCheck (Lane B, Oct 21 2026, Lane C's ask for Sam's Market Check chart fix (b)): offline, no network. The trend's
// quarters carry their own sale prices (rounded, sorted, as many as the quarter's count) and the trend carries minForRange (8),
// both passed through mapEngineAnswer's trendQuarters; the quarter's low, high, typical and count are computed as before.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const row = (d, p) => ({ auction_end_date: d, _usd: p });
const solid = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => row(`2026-08-${String(i + 10).padStart(2, "0")}`, 90000 + i * 1000.4)),   // Q3 2026: 9 sales (a range)
  row("2026-05-02", 70000.6), row("2026-04-20", 81000.2), row("2026-06-11", 76000)                                  // Q2 2026: 3 sales (thin)
];
const t = ob.runWithAsOf("2026-10-21", () => ob.trendFor(solid, []));
ok(t && Array.isArray(t.quarters) && t.quarters.length === 4, "four quarters, as before");
ok(t.minForRange === 8, `the trend carries minForRange 8 (${t.minForRange})`);
for (const q of t.quarters) {
  ok(Array.isArray(q.prices) && q.prices.length === q.count, `${q.period}: as many prices as its count (${q.prices && q.prices.length} of ${q.count})`);
  ok(q.prices.every((x, i, a) => Number.isInteger(x) && (i === 0 || a[i - 1] <= x)), `${q.period}: prices rounded and sorted`);
}
const q2 = t.quarters.find(q => q.period === "2026-Q2"), q3 = t.quarters.find(q => q.period === "2026-Q3");
ok(q2 && q2.thin === true && q2.prices.join() === "70001,76000,81000", `the thin quarter shows its three sales (${q2 && q2.prices.join()})`);
ok(q3 && q3.thin === false && q3.count === 9 && q3.low != null && q3.high != null, "the full quarter keeps its range");
const m = ob.mapEngineAnswer({ tier: "result", trend: t });
ok(Array.isArray(m.trendQuarters) && m.trendQuarters.every((q, i) => Array.isArray(q.prices) && q.prices.length === t.quarters[i].count), "mapEngineAnswer passes each quarter's prices");
ok(m.trendMinForRange === 8, "mapEngineAnswer passes minForRange");
ok(ob.mapEngineAnswer({ tier: "result" }).trendQuarters === null, "no trend: no quarters, as before");
console.log(bad ? `trendPricesCheck: ${bad} failed` : "trendPricesCheck: all passed");
process.exit(bad ? 1 : 0);
