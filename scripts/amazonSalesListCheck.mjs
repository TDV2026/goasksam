// AMAZON DEMO REVISION 3, STAGE R3-B item 5 (Sam, Oct 20 2026): the open Market Check card as a clean list like Buy's drawer.
// The card's text, rows and order are the shared card's, unchanged; the page only restyles the rows (a fixed-size photo, the
// car's own name, the price right-aligned, date and miles under the name), shows at most 10 sales, and "Show more" only reveals
// rows the card already holds. No network.
//   node scripts/amazonSalesListCheck.mjs     exit 1 on any failure.
import { amazonPageHtml } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
import { sellsForCardHtml } from "../lib/sellsForCard.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const h = amazonPageHtml("c", "6", { carOf, listing: DUMMY }), js = h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>")), css = h.slice(h.indexOf("<style>"), h.indexOf("</style>"));
ok(/var MORE_AT = 10;/.test(js) && /if \(ul\.hasAttribute\("data-tidy"\) \|\| rows\.length <= MORE_AT\) return;/.test(js) && /if \(i >= MORE_AT\) r\.hidden = true;/.test(js), "at most 10 sales show, in the card's own order (rows are hidden by position, never moved or sorted)");
ok(/b\.className = "btn out more"; b\.setAttribute\("data-more", ""\); b\.textContent = "Show more";/.test(js), "'Show more' follows the list");
const more = js.slice(js.indexOf('var m = e.target.closest("[data-more]")'), js.indexOf("function drawC(a){"));
ok(/r\.hidden = false/.test(more) && !/fetch|ask\(|read\(|createElement|innerHTML|appendChild/.test(more), "'Show more' only reveals rows already in the card: no read, no new row");
ok(!/\.sort\(|\.reverse\(/.test(js.slice(js.indexOf("function tidyRows"), js.indexOf("function drawC(a){"))), "the list is never re-sorted");
ok(/main \.sfc-row-img,main \.sfc-row-nophoto\{flex:0 0 96px;width:96px;height:72px/.test(css), "a fixed-size photo (or the marked no-photo slot)");
ok(/main \.sfc-row-price\{grid-column:2;grid-row:1\/span 2;text-align:right/.test(css) && /main \.sfc-row-title\{grid-column:1;grid-row:1/.test(css) && /main \.sfc-row-meta\{grid-column:1;grid-row:2/.test(css), "the price right-aligned; the date and miles under the car's own name");
ok(/\.mc-body \.sfc-card\{border:0/.test(css) && /mc-body\{margin:22px 0 0/.test(css), "the open card is a clean full-width list on tab c");
// the shared card's own markup still carries the rows in this order (nothing in the page changes the text)
const d = { tier: "thin", poolN: 12, thinLine: "L", latestSaleLine: "S", cards: Array.from({ length: 12 }, (_, i) => ({ price: 1000 + i, date: "2026-10-" + String(20 - i).padStart(2, "0"), mi: 5000 + i, title: "Car " + i })) };
const card = sellsForCardHtml(d, {}), rows = [...card.matchAll(/<li class="sfc-row">/g)].length;
ok(rows === 12 && /sfc-row-title">Car 0</.test(card) && card.indexOf("Car 0") < card.indexOf("Car 11"), "the shared card builds every row in the engine's order (the page hides past the tenth, it never drops one)");
// REVISION 4, R4-A (Sam, Oct 20 2026, item 1): a ranged answer shows the sales behind it, as a thin answer does, from Lane E's rows field
{ const helpers = js.slice(js.indexOf("var esc = "), js.indexOf("// Sam's decision 6"));
  const fn = js.slice(js.indexOf("function saleRow(r){"), js.indexOf("function cardHtml(a){"));
  const { withRows } = new Function(helpers + "\n" + fn + "\nreturn { withRows: withRows };")();
  const rows = Array.from({ length: 12 }, (_, i) => ({ photo: "p" + i, name: "Car " + i, price: 90000 + i, date: "2026-10-" + String(20 - i).padStart(2, "0"), miles: 1000 + i }));
  const ranged = '<div class="sfc-card"><p class="sfc-range">$1 <span class="sfc-to">to</span> $2</p><p class="sfc-half">Half</p><p class="sfc-basis">Based on 12 sales, the latest in October 2026.</p><p class="sfc-basis">Includes sales from 2019.</p><div class="sfc-footer">F</div></div>';
  const out = withRows(ranged, { rows });
  ok(out.indexOf('Includes sales from 2019.</p><ul class="sfc-rows">') > 0 && out.indexOf('</ul><div class="sfc-footer">') > 0 && (out.match(/<li class="sfc-row">/g) || []).length === 12, "a ranged card's list sits directly under 'Based on N sales' (and its includes line), before the footer, one row per sale in the field's order");
  ok(/<span class="sfc-row-meta">October 2026, 1,000 miles at sale<\/span>/.test(out) && /<span class="sfc-row-price">\$90,000<\/span>/.test(out) && /<img class="sfc-row-img" src="\/api\/partnerAnswer\?photo=p0&w=320"/.test(out), "the row wording is the shared card's own (sale month, miles at sale, the gated photo)");
  ok(out.replace(/<ul class="sfc-rows">[\s\S]*?<\/ul>/, "") === ranged, "removing the list gives the unchanged card: the range, its lines, the footer are untouched");
  ok(withRows(ranged, { rows: [] }) === ranged && withRows(ranged, {}) === ranged && withRows(out, { rows }) === out, "no rows, or a card that already carries rows (a thin card), is left exactly as it is"); }

ok(!/[–—]/.test(h), "no dashes");
console.log(`amazonSalesListCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
