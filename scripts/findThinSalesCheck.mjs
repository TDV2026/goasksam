// FIND'S THIN CARD, FOUR STATES (Sam, Oct 26 2026; e93): a Find card never reads blank. The Sam block prints the engine's own thin_sales
// fields: 8 or more sales is the range card (unchanged), 2 to 7 "Thin so far" + the listed sales, 1 the one sale, 0 "No car like this has
// sold at auction yet." The card computes nothing. Also: the engine fields reach the card (lib/live/search.js carries thin_sales and the zero
// state), and the shared card (lib/sellsForCard.js) is untouched. No network.   node scripts/findThinSalesCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const esc = new Function(block("function esc(s){", "function usd(n)") + "\nreturn esc;")();
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const num = n => Math.round(Number(n)).toLocaleString("en-US");
const mk = rel => new Function("esc", "usd", "num", "REL_MC", block("  function fxOpt(", "  function samLine(l){") + "\nreturn thinSales;")(esc, usd, num, rel);
const thinSales = mk(true);
const sale = (price, month, extra) => ({ price, month, gearbox: "Manual", mi: 31000, venue: "Bring a Trailer", url: "https://bringatrailer.com/x", ...(extra || {}) });
const card = (m, extra) => ({ id: 1, market: { kind: "count", query: "2006 BMW 325i Sedan", specLabel: "2006 BMW 325i Sedan", ...m }, ...(extra || {}) });
const text = h => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
// THE FIND CARD'S SALES-ONLY STATES (the five-line Sam box, Oct 29 2026; scripts/findCardShapeCheck.mjs has the fixtures through the whole Find path). A card of sales only prints the engine's answer line and each sale as a line that opens the modal; no "Thin so far", no "Only N sales", no link to Market Check.
const a = thinSales(card({ countLine: "Three sales since January 2026.", thin_sales: { count: 3, answer_line: "Three sales, too few for a range.", count_line: "Three sales since January 2026.", sales: [sale(8500, "September 2026"), sale(7200, "June 2026"), sale(6500, "March 2026")] } }));
ok(a && /<p class="fx-ans fx-answer">Three sales, too few for a range\.<\/p>/.test(a.html) && /<p class="fx-spec">2006 BMW 325i Sedan<\/p>/.test(a.html), "2 to 7: the spec, then the engine's 'too few for a range' line");
ok(a && !/fx-sale/.test(a.html) && !/\$8,500|miles/.test(text(a.html)), "2 to 7 (e98): the card carries NO sale line; the sales are in See the sales");
ok(a && /<p class="fx-count">Three sales since January 2026\.<\/p>/.test(a.html) && !/<a /.test(a.html) && !/Thin so far|Only \d|latest in/i.test(a.html), "2 to 7: the count with its window, no link, none of the old lines");
const b = thinSales(card({ countLine: "One sale since August 2026.", thin_sales: { count: 1, answer_line: "One sale, too few for a range.", count_line: "One sale since August 2026.", sales: [sale(9100, "August 2026")] } }));
ok(b && /One sale, too few for a range\./.test(b.html) && !/fx-sale/.test(b.html), "1: the engine's line, and no sale line");
const z = thinSales(card({ kind: "not_tracked", thin_sales: { count: 0, answer_line: "No sale of a car like this on record in the US or Canada yet." } }));
ok(z && text(z.html).replace(/\|/g, "") === "2006 BMW 325i SedanNo sale of a car like this on record in the US or Canada yet." && !/Thin so far/.test(z.html), "0: the engine's own zero line and nothing else");
ok(thinSales(card({ kind: "range", low: 6500, high: 9000, thin_sales: null })) === null, "8 or more: a range card is left to the range block");
ok(thinSales(card({ kind: "range", low: 6500, high: 9000, count: 10, thin_sales: { count: 10, sales: [sale(1, "x")] } })) === null, "a range wins even if a thin field were present");
ok(thinSales({ id: 1, market: { kind: "pending" } }) === null && thinSales({ id: 1 }) === null && thinSales({ id: 1, market: null }) === null, "no thin_sales: nothing drawn here, the card keeps its own line");
ok(thinSales(card({ thin_sales: { count: 3, sales: [sale(1, "x")] } }, { swap: true })) === null, "a swap listing draws no thin block");
ok(!/[–—]/.test(a.html + b.html + z.html), "no dashes");
// REFUSED and NOT TRACKED: the card is never blank. A refusal prints the engine's refusal sentence as it comes; a car that is not tracked prints the zero line (thin_sales count 0), not nothing.
{ const sl2 = new Function("esc", "thinSales", "READING_LINE", "rungHtml", "rungShown", "usd", "var REL_MC = true;\n" + block("  function fxOpt(", "  function noRange(") + "\n" + block("  function noRange(", "  function compactNoRange(") + "\n" + block("  function compactNoRange(", "  function samLine(") + "\n" + block("  function samLine(l){", "  // SPEC CHIPS under the bid line") + "\nreturn samLine;")(esc, thinSales, "Sam is still reading the sales for this one.", () => "", () => [], usd);
  const refused = sl2({ id: 1, market: { kind: "refused", refusalLine: "Sam could not verify this one, so no figures are shown." } });
  ok(refused && /<p class="nt">Sam could not verify this one, so no figures are shown\.<\/p>/.test(refused.html), "refused: the card prints the engine's refusal sentence");
  const zeroCard = sl2({ id: 1, market: { kind: "not_tracked", notTrackedLine: "Sam does not track this car.", thin_sales: { count: 0, answer_line: "No sale of a car like this on record in the US or Canada yet." } } });
  ok(zeroCard && /No sale of a car like this on record in the US or Canada yet\./.test(zeroCard.html) && !/does not track/.test(zeroCard.html), "not tracked: the card prints the zero line"); }
{ const sl3 = new Function("esc", "thinSales", "READING_LINE", "rungHtml", "rungShown", "usd", "var REL_MC = true;\n" + block("  function fxOpt(", "  function noRange(") + "\n" + block("  function noRange(", "  function compactNoRange(") + "\n" + block("  function compactNoRange(", "  function samLine(") + "\n" + block("  function samLine(l){", "  // SPEC CHIPS under the bid line") + "\nreturn samLine;")(esc, thinSales, "x", () => "", () => [], usd);
  const um = sl3({ id: 1, market: { kind: "unmatched" } });
  ok(um && /<p class="nt">Sam could not match this listing to a car yet\.<\/p>/.test(um.html), "unmatched: a listing the resolver cannot read prints the fixed line"); }
const srcS = fs.readFileSync(new URL("../lib/live/search.js", import.meta.url), "utf8");
ok(/d\.refusal_line\) refusal = String\(d\.refusal_line\)/.test(srcS) && /refusalMem/.test(srcS) && /refusalLine: refusalMem\.get\(spec\.key\) \|\| null/.test(srcS) && /kind: "refused", emailMode: "none", refusalLine: rf/.test(srcS), "the engine's refusal sentence is carried and stored (refusalLine) for a spec with no sales to count");
// samLine draws it first (a card with no sam_lines still shows it) and falls through otherwise
const sl = block("  function samLine(l){", "    var ls = l.swap");
ok(/var thin = thinSales\(l, bl0 && bl0\.bidLine\); if \(thin\) return thin;/.test(sl), "samLine returns the sales-only block first");
// the engine fields reach the card
const src = fs.readFileSync(new URL("../lib/live/search.js", import.meta.url), "utf8");
ok(/if \(m\.kind !== "range" && core\.thin_sales\) m\.thin_sales = core\.thin_sales;/.test(src), "listingMarket passes the engine's thin_sales through, never on a range card");
ok(/thinZeroMem/.test(src) && /thin_sales: \{ count: 0 \}/.test(src) && /thinZero: thinZeroMem\.has\(spec\.key\)/.test(src), "the zero state is carried and stored (thinZero) for a spec with no core");
ok(/m\.thin_sales = d\.thin_sales \|\| null/.test(src) || /m\.thin_sales = /.test(src), "the stored core carries thin_sales");
// Tasks (its page and its emails) lift Find's card code by name: the thin block must be in that list or the email card cannot build
const kit = fs.readFileSync(new URL("../lib/findCardKit.js", import.meta.url), "utf8");
ok(/"compactNoRange", "thinSales", "samLine"/.test(kit), "findCardKit lifts thinSales with samLine, so the Tasks page and its emails print the same thin card");
// the shared card is unchanged
const shared = fs.readFileSync(new URL("../lib/sellsForCard.js", import.meta.url), "utf8");
ok(!/thin_sales|Thin so far/.test(shared), "lib/sellsForCard.js (Sell, Tasks, the partner demo) is unchanged");
console.log(`findThinSalesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
