// THE SHARED "What these sell for" CARD (Lane A, Oct 2026; the thin card, Lane C, Oct 19 2026, e63): every number
// and every word comes off the engine's own answer object, never computed or written here. With no range the card
// draws the engine's thinLine (else a refusal's own samLine), its latestSaleLine and its sale rows, nothing else.
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

// setAsideCount WORD-IFIED under ten (confirmed live on the 1957 Porsche 356 Speedster: "two", not 2)
// - the footnote must still show, counted from setAsideReasons' own real numbers, never from this field.
const wordCount = sellsForCardHtml({ cluster: [282000, 363000], poolN: 8, windowMonths: 57, setAsideCount: "two", setAsideReasons: { project: 0, replica: 0, modified: 1, "odd sale": 1 }, readAt: "2026-10-16T08:00:00Z" });
ok(wordCount.includes("2 set aside: 1 modified, 1 odd sale."), "setAsideCount as a word (\"two\") still produces the right footnote, counted from setAsideReasons");

// Stale answer: the stale line replaces the date, never both.
const stale = sellsForCardHtml({ cluster: [50000, 70000], poolN: 20, windowMonths: 12, stale: true, staleLine: "Sales read on October 14. Sales since then are not in yet. Updating now.", readAt: "2026-10-14T08:00:00Z" });
ok(stale.includes("Sales read on October 14. Sales since then are not in yet. Updating now.") && !stale.includes("Updated Oct"), "stale line replaces the date, never both");

// readAt missing entirely: the date clause is left out, never invented.
const noDate = sellsForCardHtml({ cluster: [80000, 95000], poolN: 15, windowMonths: 12 });
ok(noDate.includes("Powered by GoAskSam</span>") && !noDate.includes("Updated"), "readAt missing: no date clause, never invented");

// THE THIN CARD (e63): the engine's line, its latest-sale line and its rows; no wording of the card's own.
const L = { house_share: "The sales of this car are too one-sided to mark a range from. These are the sales we found.", few_sales: "Not enough sales of this exact car to give a reliable range. These are the sales we found.", few_comparable: "Too few of these sales can be compared side by side to give a reliable range. These are the sales we found." };
const COBRA = { tier: "thin", poolN: 8, soldCountN: 8, thinReason: "house_share", thinLine: L.house_share, latestSaleLine: "Latest sale: October 2025.", lowestSaleN: 47300, highestSaleN: 132500, thin: { isThin: true, houseSteer: true, totalN: 8 },
  cards: [{ id: "a1", price: 132500, date: "2024-01-12", mi: 4100, title: "2000 Ford Mustang SVT Cobra R", image: "https://img.example/a.jpg", platform: "others", platformName: "Mecum", url: "https://example.com/lot/1" },
          { id: "a2", price: 47300, date: "2025-10-03", mi: null, title: "2000 Ford Mustang SVT Cobra R", image: null, platformName: "Bonhams", url: "https://example.com/lot/2" }] };
const cobra = sellsForCardHtml(COBRA);
const cobraText = cobra.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(cobra.includes(L.house_share), "thin: the engine's thinLine, verbatim");
ok(cobra.includes("Latest sale: October 2025."), "thin: the engine's latestSaleLine");
ok((cobra.match(/class="sfc-row"/g) || []).length === 2 && cobra.includes("$132,500") && cobra.includes("$47,300"), "thin: every sale row the answer carried");
ok(cobra.indexOf("$132,500") < cobra.indexOf("$47,300"), "thin: rows in the engine's own order");
ok(cobra.includes("January 2024, 4,100 miles at sale") && cobra.includes(">October 2025<"), "thin: row date and mileage at that sale, no mileage invented");
ok(cobra.includes('class="sfc-row-nophoto">No photo<'), "thin: a row with no photo gets a marked no-photo slot");
ok(!/\$[\d,]+\s*(?:to|-)\s*\$[\d,]+/.test(cobraText), "thin: no lowest-to-highest line");
ok(!/Mecum|Bonhams|example\.com\/lot|<a [^>]*href="https?:/i.test(cobra), "thin: no venue name, no sale link");
ok(!/not enough sales/i.test(cobra), "thin: a pool of eight is never told not enough sales");
ok(!/sales found, not enough for a range|Sales too spread out/.test(cobra), "thin: no wording of the card's own");
ok(cobra.indexOf('class="sfc-thin"') < cobra.indexOf('class="sfc-latest"') && cobra.indexOf('class="sfc-latest"') < cobra.indexOf('class="sfc-rows"'), "thin: line, then latest sale, then rows");
const few = sellsForCardHtml({ tier: "refusal", refusal: { kind: "thin" }, poolN: 2, thinReason: "few_sales", thinLine: L.few_sales, latestSaleLine: "Latest sale: May 2026.", cards: [{ price: 61000, date: "2026-05-02", mi: 52000, title: "1971 Citroen SM" }] });
ok(few.includes(L.few_sales) && !few.includes("Sales too spread out"), "refusal kind thin: the engine's thinLine, never the spread line");
// "Sales too spread out for a range." only when the engine's refusal says so (its samLine), never on a thin answer.
const varied = sellsForCardHtml({ tier: "refusal", refusal: { kind: "varied" }, samLine: "Sales too spread out for a range.", poolN: 40, cards: [{ price: 90000, date: "2026-02-01", mi: 30000, title: "1990 Porsche 911 Carrera 4" }] });
ok(varied.includes("Sales too spread out for a range.") && varied.includes("$90,000"), "spread refusal: the engine's samLine, then its rows");
ok(!sellsForCardHtml({ tier: "thin", poolN: 40, samLine: "Sales too spread out for a range.", thinLine: L.few_comparable, cards: [] }).includes("Sales too spread out"), "thin answer: never the spread line, even with a samLine present");
ok(sellsForCardHtml({ cluster: null, poolN: 3 }) === "", "no range, no engine line, no rows: nothing, never a line of the card's own");
const invariant = sellsForCardHtml({ tier: "refusal", refusal: { kind: "invariant_failed" }, samLine: "Sam could not verify this one, so no figures are shown.", poolN: 0, cards: [] });
ok(invariant.includes("Sam could not verify this one") && !/\$\d/.test(invariant), "invariant refusal: the engine's line, no figures");

// Truly nothing: no cluster, no line, no rows.
ok(sellsForCardHtml({ tier: "zero_result" }) === "", "truly nothing: empty string, never an empty shell");

// Partner views: the photo path the caller names, titles left off (date, price, mileage, photo only).
const partner = sellsForCardHtml(COBRA, { rowTitles: false, rowPhoto: c => c.image && c.id ? "/api/partnerAnswer?photo=" + c.id : null });
ok(!partner.includes("Cobra R</span>") && partner.includes('src="/api/partnerAnswer?photo=a1"') && !partner.includes("img.example"), "partner rows: no title, gated photo path only");

// Partner pill placement: directly under the headline, every case, nowhere else.
const withPill = sellsForCardHtml({ cluster: [100000, 120000], poolN: 20, windowMonths: 12, readAt: "2026-10-14T08:00:00Z" }, { partnerPillsHtml: '<div class="pill">Partner pill</div>' });
ok(withPill.indexOf('class="sfc-range"') < withPill.indexOf('class="pill"') && withPill.indexOf('class="pill"') < withPill.indexOf('class="sfc-basis"'), "range case: partner pill sits between the range and the basis line");
const pillThin = sellsForCardHtml(COBRA, { partnerPillsHtml: '<div class="pill">P</div>' });
ok(pillThin.indexOf('class="sfc-thin"') < pillThin.indexOf('class="pill"') && pillThin.indexOf('class="pill"') < pillThin.indexOf('class="sfc-latest"'), "thin: partner pill sits right after the engine's line");
ok(cobra === sellsForCardHtml(COBRA), "no opts passed: thin case output stable");

// "No listing states a body" (2006 Porsche Boxster Convertible, e58, Sam's golden row 38): the
// engine's own bodyLine, printed verbatim, never reconstructed, in the same spot - before the
// range line - whether the whole pool lands a range or stays thin.
const boxsterLine = "No listing of the 2006 Porsche Boxster states a body, so this reads every 2006 Boxster.";
const boxsterRange = sellsForCardHtml({ cluster: [21000, 31000], poolN: 18, windowMonths: 12, bodyLine: boxsterLine, bodyLabel: "Convertible", readAt: "2026-10-16T08:00:00Z" });
ok(boxsterRange.includes(boxsterLine), "bodyLine prints the engine's own sentence verbatim (range case)");
ok(boxsterRange.indexOf('class="sfc-bodyline"') < boxsterRange.indexOf('class="sfc-range"'), "bodyLine sits before the range");
const boxsterThin = sellsForCardHtml({ cluster: null, poolN: 5, tier: "thin", thinLine: L.few_sales, cards: [{ price: 30000, date: "2026-03-01", mi: 40000, title: "2006 Porsche Boxster" }], bodyLine: boxsterLine, bodyLabel: "Convertible", readAt: "2026-10-16T08:00:00Z" });
ok(boxsterThin.includes(boxsterLine), "bodyLine prints the engine's own sentence verbatim (thin case)");
ok(boxsterThin.indexOf('class="sfc-bodyline"') < boxsterThin.indexOf('class="sfc-thin"'), "bodyLine sits before the thin text, same relative spot as the range case");
ok(!sellsForCardHtml({ cluster: [21000, 31000], poolN: 18, windowMonths: 12, readAt: "2026-10-16T08:00:00Z" }).includes("sfc-bodyline"), "no bodyLine on the answer: no bodyline paragraph, no regression");

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
