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
const mk = rel => new Function("esc", "usd", "REL_MC", block("  function thinSales(l){", "  function samLine(l){") + "\nreturn thinSales;")(esc, usd, rel);
const thinSales = mk(true), unlinked = mk(false);
const sale = (price, month) => ({ price, month, venue: "Bring a Trailer", url: "https://bringatrailer.com/x" });
const card = (m, extra) => ({ id: 1, market: { kind: "count", query: "2006 BMW 325i Sedan", ...m }, ...(extra || {}) });
const text = h => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

// 2 to 7
const a = thinSales(card({ thin_sales: { count: 3, sales: [sale(8500, "September 2026"), sale(7200, "June 2026"), sale(6500, "March 2026")], latest_month: "September 2026", scope_label: "2006 325i Sedan" } }));
ok(a && /<p class="nr-scope">Thin so far<\/p>/.test(a.html), "2 to 7: the heading 'Thin so far'");
ok(a && text(a.html).includes("Only 3 sales of cars like this: |$8,500|, |$7,200|, |$6,500|, the latest in September 2026."), "2 to 7: 'Only N sales of cars like this: $a, $b, $c, the latest in Month Year.'");
ok(a && (a.html.match(/<a href="\/market-check\?q=2006%20BMW%20325i%20Sedan" target="_blank" rel="noopener">/g) || []).length === 3, "2 to 7: every price links to Market Check for the car");
ok(a && !/range|Based on|bid/i.test(text(a.html)), "2 to 7: no range, no bid read, no basis line");
// 1
const b = thinSales(card({ thin_sales: { count: 1, sales: [sale(9100, "August 2026")], latest_month: "August 2026" } }));
ok(b && /Thin so far/.test(b.html) && text(b.html).includes("One sale of a car like this: |$9,100| in August 2026."), "1: heading and 'One sale of a car like this: $a in Month Year.' linked");
ok(b && /<a href="\/market-check\?q=/.test(b.html), "1: the price is linked");
// 0
const z = thinSales(card({ kind: "not_tracked", thin_sales: { count: 0 } }));
ok(z && text(z.html) === "|No car like this has sold at auction yet.|" && !/Thin so far/.test(z.html), "0: 'No car like this has sold at auction yet.' and nothing else");
// 8 or more: the range card is not touched
ok(thinSales(card({ kind: "range", low: 6500, high: 9000, thin_sales: null })) === null, "8 or more: a range card is left to the range block");
ok(thinSales(card({ kind: "range", low: 6500, high: 9000, count: 10, thin_sales: { count: 10, sales: [sale(1, "x")] } })) === null, "a range wins even if a thin field were present");
ok(thinSales({ id: 1, market: { kind: "pending" } }) === null && thinSales({ id: 1 }) === null && thinSales({ id: 1, market: null }) === null, "no thin_sales: nothing drawn here, the card keeps its own line");
ok(thinSales(card({ thin_sales: { count: 3, sales: [sale(1, "x")] } }, { swap: true })) === null, "a swap listing draws no thin block");
// not released Market Check: the prices are plain text, never a dead link
const u = unlinked(card({ thin_sales: { count: 2, sales: [sale(8500, "Sep"), sale(7200, "Jun")], latest_month: "September 2026" } }));
ok(u && !/<a /.test(u.html) && text(u.html).includes("$8,500"), "Market Check not released: prices print without a link");
ok(!/[–—]/.test(a.html + b.html + z.html), "no dashes");
// samLine draws it first (a card with no sam_lines still shows it) and falls through otherwise
const sl = block("  function samLine(l){", "    var ls = l.swap");
ok(/var thin = thinSales\(l\); if \(thin\) return thin;/.test(sl), "samLine returns the thin block first");
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
