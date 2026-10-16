// THE SHARED "What these sell for" CARD (Lane A, Oct 2026): every number comes off the engine's own
// answer object, never computed here, and the house-steered thin shape (answer.thin.*, Oct 16 2026)
// is never read directly - the card gates on flat fields only (poolN, qualifyingTotal) and shows its
// existing spread-too-wide line, no number, no venue word. FOR LANE B: once the house-steered shape
// carries the same flat fields as every other answer (answerType, poolSize, low, high, a spread
// flag), read those instead of qualifyingTotal and delete that fallback - see lib/sellsForCard.js's
// own FOR LANE B comment.
//   node scripts/sellsForCardCheck.mjs     exit 1 on any failure.
import { sellsForCardHtml, latestQuarterRowHtml, SELLS_FOR_CARD_JS } from "../lib/sellsForCard.js";

let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };

// Normal range, readAt present, set-aside present.
const normal = sellsForCardHtml({
  cluster: [121000, 134000], poolN: 42, windowMonths: 12,
  setAsideCount: 2, setAsideReasons: { modified: 1, "odd sale": 1 },
  readAt: "2026-10-14T08:00:00Z"
});
ok(normal.includes('<h3 class="sfc-heading">What these sell for</h3>'), "heading, exact text");
ok(normal.includes('$121,000 <span class="sfc-to">to</span> $134,000'), "range, the big line");
ok(normal.includes("Middle half of 42 sales, last 12 months."), "basis line from the engine's own numbers");
ok(normal.includes("2 set aside: 1 modified, 1 odd sale."), "set-aside footnote, engine's own reasons");
ok(normal.includes("Powered by GoAskSam &middot; Updated Oct 14") && normal.includes('href="/how-sam-decides"'), "footer: Powered by, Updated date, How Sam decides link");

// Stale answer: the stale line replaces the date, never both.
const stale = sellsForCardHtml({ cluster: [50000, 70000], poolN: 20, windowMonths: 12, stale: true, staleLine: "Sales read on October 14. Sales since then are not in yet. Updating now.", readAt: "2026-10-14T08:00:00Z" });
ok(stale.includes("Sales read on October 14. Sales since then are not in yet. Updating now.") && !stale.includes("Updated Oct"), "stale line replaces the date, never both");

// readAt missing entirely: the date clause is left out, never invented.
const noDate = sellsForCardHtml({ cluster: [80000, 95000], poolN: 15, windowMonths: 12 });
ok(noDate.includes("Powered by GoAskSam</span>") && !noDate.includes("Updated"), "readAt missing: no date clause, never invented");

// Under eight: a known poolN says how many, never a range.
ok(sellsForCardHtml({ cluster: null, poolN: 3 }).includes("3 sales found, not enough for a range."), "under eight, known poolN: says how many");
ok(sellsForCardHtml({ cluster: null, poolN: 1 }).includes("1 sale found, not enough for a range."), "exactly one: singular");

// Eight or more, no cluster (sales too spread out), known poolN.
ok(sellsForCardHtml({ cluster: null, poolN: 40, readAt: "2026-10-14T08:00:00Z" }).includes("Sales too spread out for a range."), "8+ poolN, no cluster: spread-too-wide line");

// Truly nothing: no cluster, no poolN, no qualifyingTotal.
ok(sellsForCardHtml({ tier: "zero_result" }) === "", "truly nothing: empty string, never an empty shell");

// THE HOUSE-STEERED SHAPE (1966 Ferrari 275 GTB, captured live Oct 16 2026): tier "thin", no
// top-level cluster/poolN/readAt - the real count sits only in answer.thin.*, never read here.
// qualifyingTotal is the one flat field present, used ONLY to gate detection, never displayed.
const GTB_275 = {
  status: "one_box", tier: "thin", answerType: "not_enough_data", reasonFlag: "too_few_online_for_a_range",
  qualifyingTotal: 9, setAsideCount: 0,
  thin: { totalN: 9, isThin: true, houseSteer: true, span: [1100000, 3160000] },
  factsBlock: { count: 9, lowest: 1215000, highest: 3481000 }
};
const gtb = sellsForCardHtml(GTB_275);
ok(gtb.includes("Sales too spread out for a range."), "house-steered (275 GTB): the spread-too-wide line, not empty");
ok(!/\$[\d,]+/.test(gtb), "house-steered: no dollar number anywhere (factsBlock.lowest/highest never shown)");
ok(!/\b9\b/.test(gtb), "house-steered: the real count (9) is never shown, no verified flat field for it yet");
ok(!/\b(RM Sotheby|Sotheby|auction house|online)\b/i.test(gtb), "house-steered: no venue word");

// Partner pill placement: directly under the range, nowhere else.
const withPill = sellsForCardHtml({ cluster: [100000, 120000], poolN: 20, windowMonths: 12, readAt: "2026-10-14T08:00:00Z" }, { partnerPillsHtml: '<div class="pill">Partner pill</div>' });
ok(withPill.indexOf('class="sfc-range"') < withPill.indexOf('class="pill"') && withPill.indexOf('class="pill"') < withPill.indexOf('class="sfc-basis"'), "partner pill sits between the range and the basis line");

// latestQuarterRowHtml - the trendQuarters shape (Lane B's e58), oldest first, latest is the last element.
const shown = latestQuarterRowHtml({
  cluster: [100000, 120000],
  trendQuarters: [
    { period: "2025-Q4", low: 90000, high: 110000, count: 12, thin: false },
    { period: "2026-Q3", low: 120000, high: 133000, count: 9, thin: false }
  ]
});
ok(shown === '<p class="sfc-quarter">Latest quarter: 2026 Q3, $120,000 to $133,000 (9 sales)</p>', "latest quarter: exact brief wording");
ok(latestQuarterRowHtml({ cluster: [100000, 120000], trendQuarters: [{ period: "2026-Q3", low: 102000, high: 122000, count: 9, thin: false }] }) === "", "latest quarter hidden: midpoint too close to the main range");
ok(latestQuarterRowHtml({ cluster: [100000, 120000], trendQuarters: [{ period: "2026-Q3", low: 150000, high: 170000, count: 5, thin: true }] }) === "", "latest quarter hidden: thin flag from the engine");
ok(latestQuarterRowHtml({ trendQuarters: [{ period: "2026-Q3", low: 150000, high: 170000, count: 9, thin: false }] }) === "", "latest quarter hidden: no main range to compare against");

// Client/server parity: the exact same source runs in the browser.
const vm = await import("node:vm");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(SELLS_FOR_CARD_JS, sandbox);
const fixture = { cluster: [121000, 134000], poolN: 42, windowMonths: 12, readAt: "2026-10-14T08:00:00Z" };
ok(sandbox.window.sellsForCardHtml(fixture, {}) === sellsForCardHtml(fixture, {}), "client embedding is byte-identical to the Node function");
const quarterFixture = { cluster: [100000, 120000], trendQuarters: [{ period: "2026-Q3", low: 120000, high: 133000, count: 9, thin: false }] };
ok(sandbox.window.latestQuarterRowHtml(quarterFixture) === latestQuarterRowHtml(quarterFixture) && sandbox.window.latestQuarterRowHtml(quarterFixture) === shown, "client latestQuarterRowHtml is byte-identical to the Node function");

console.log(`sellsForCardCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
