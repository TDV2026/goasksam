// The Sell day-of-week tile (Oct 2026, Lane B2): sold cars only, from the engine's pool. No network: every read stubbed.
//   node scripts/sellDayTileCheck.mjs [--print]
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const { dayBuckets, scopeWithSpan } = await import("../lib/sell/sellFacts.js");
const { dayTile } = await import("../lib/sell/sellFlow.js");
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
// A pool: rows[day offset] -> sale dates. 2026-01-04 is a Sunday.
const SUN = "2026-01-04", MON = "2026-01-05", SAT = "2026-01-10", WED = "2026-01-07";
const mk = (spec) => spec.flatMap(([date, n, base]) => Array.from({ length: n }, (_, i) => ({ auction_end_date: date + "T18:00:00Z", _hv: base + i * 1000, _usd: base + i * 1000, source: "bringatrailer" })));
const BANNED = /\b(worth|value[sd]?|valuation|estimate[sd]?|appraisal|median|percentile|sell-through|sold through)\b|%|[–—]|\b\d+ (sources|venues)\b/i;
const cases = [
  ["11 Sunday of 30, ranges both groups", mk([[SUN, 11, 50000], [MON, 6, 40000], [WED, 8, 42000], [SAT, 5, 45000]]), { total: 30, top: "Sunday", ranges: true, line: "11 of the 30 sales in the last 12 months" }],
  ["top day has only 6: count, no range", mk([[SUN, 6, 50000], [MON, 5, 40000], [WED, 4, 42000]]), { total: 15, top: "Sunday", ranges: false, line: "six of the 15 sales in the last 12 months" }],
  ["top has 9, others only 5: no range", mk([[SUN, 9, 50000], [MON, 3, 40000], [WED, 2, 42000]]), { total: 14, top: "Sunday", ranges: false, line: "nine of the 14 sales in the last 12 months" }],
  ["exactly eight in all", mk([[SUN, 4, 50000], [MON, 2, 40000], [WED, 2, 42000]]), { total: 8, top: "Sunday", ranges: false, line: "four of the eight sales in the last 12 months" }],
  ["seven in all: hidden", mk([[SUN, 4, 50000], [MON, 3, 40000]]), { hidden: true }],
  ["empty pool: hidden", [], { hidden: true }],
  ["two-way tie", mk([[SUN, 5, 50000], [SAT, 5, 40000], [WED, 2, 42000]]), { total: 12, tie: true }],
];
for (const [what, rows, w] of cases) {
  const bd = dayBuckets(rows), pl = { by_day: bd, window_label: "in the last 12 months", total: rows.length };
  const t = dayTile(pl);
  if (w.hidden) { ok(!bd && !t, `${what}: tile hidden`); continue; }
  ok(bd && bd.days.reduce((n, g) => n + g.count, 0) + bd.undated === rows.length, `${what}: day counts add up to the pool (${rows.length})`);
  ok(!!t, `${what}: tile shown`); if (!t) continue;
  const text = [t.label, t.head, t.line, t.line2, t.words].filter(Boolean).join(" ");
  if (w.tie) ok(t.line === "five sales each, among the 12 in the last 12 months", `${what}: tie line reads naturally (got ${t.line})`);
  if (w.tie) ok(/Sunday and Saturday|Saturday and Sunday/.test(t.head) && !t.line2, `${what}: ties named, no range`);
  else { ok(t.head === w.top, `${what}: top day ${w.top} (got ${t.head})`); ok(t.line === w.line, `${what}: line ${JSON.stringify(w.line)} (got ${JSON.stringify(t.line)})`); }
  ok(w.ranges ? /^The middle half of Sunday sales landed between \$[\d,]+ and \$[\d,]+, and of sales on other days between \$[\d,]+ and \$[\d,]+\.$/.test(t.line2 || "") : !t.line2, `${what}: range only with eight or more in both groups`);
  if (t.line2) { const n = bd.top.count; ok(bd.top.count >= 8 && bd.other.count >= 8, `${what}: both range groups hold eight or more`); }
  ok(!BANNED.test(text), `${what}: no percentage, no banned word, no dash (${text})`);
  ok(!/\bwords?\b/.test(t.words) && !/[0-9$]/.test(t.words), `${what}: landing words carry no figure`);
  if (process.argv.includes("--print")) console.log(`${what}\n  ${t.head} | ${t.line}${t.line2 ? "\n  " + t.line2 : ""}\n  ${t.words}`);
}
// Undated rows are counted in the total and never invented a day.
{ const rows = [...mk([[SUN, 8, 50000]]), { auction_end_date: null, _hv: 1000 }]; const bd = dayBuckets(rows); ok(bd && bd.undated === 1 && bd.days[0].count === 8 && bd.total === 9, "undated rows are counted apart"); }
// The scope line carries the span the engine label carries (golden cars 6 and 14).
ok(scopeWithSpan({ scopeLabel: "2006 Mercedes-Benz CLK DTM", rungLabel: "CLK DTM, 2005 to 2007" }) === "CLK DTM, 2005 to 2007", "thin CLK DTM scope names 2005 to 2007");
ok(scopeWithSpan({ scopeLabel: "1966 Ferrari 275 GTB", rungLabel: "275 GTB, 1965 to 1966" }) === "275 GTB, 1965 to 1966", "thin 275 GTB scope names 1965 to 1966");
ok(scopeWithSpan({ scopeLabel: "S2000 models, 2009 to 2013", rungLabel: "S2000 models, 2009 to 2013" }) === "S2000 models, 2009 to 2013", "a scope that has the span is kept");
ok(scopeWithSpan({ scopeLabel: "1995 Carrera", rungLabel: "1995 911 Carrera" }) === "1995 Carrera", "no span in the label: the scope stands");
ok(scopeWithSpan({}) === null, "no engine answer: no scope");
console.log(`sellDayTileCheck: ${passes} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
