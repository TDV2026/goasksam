// A THIN BUY CARD SHOWS ITS SALES (Sam, Oct 19 2026; Lane C). The grid card lists the engine's own sale rows
// (l.market.rows) when the engine flags l.market.cardListsSales; a card with a range, a card without the flag and an
// engine-swapped card show none. Each row: a thumbnail or the marked no-photo slot, the record's own title, month and
// year, mileage at sale when stated, price; no venue name, no link. Runs Buy's own client functions, no network.
//   node scripts/buyRowsCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const pick = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const helpers = pick("  function usd(n)", "\n", 0) + "\n" + pick("  function num(n)", "\n") + "\n" + pick("  var MON3 = ", "\n") + "\n" + pick("  function monShort(d)", "\n") + "\n";
const esc = "function esc(s){ return String(s == null ? \"\" : s).replace(/[&<>\"]/g, function(ch){ return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\" }[ch]; }); }\n";
const styles = []; const document = { createElement: () => ({}), head: { appendChild: x => styles.push(x) } };
const body = pick("  var ROWS_CSS_DONE = false;", "  function card(l, big, eager){");
const rowsHtml = new Function("document", esc + helpers + body + "\nreturn rowsHtml;")(document);
const R650 = [{ price: 25500, date: "2026-05-14", mi: 4000, title: "2010 BMW 650i Coupe Sport", image: "https://img.example/a.jpg" }, { price: 16800, date: "2025-07-02", mi: 30000, title: "2009 BMW 650i Coupe Sport", image: null }, { price: 17555, date: "2025-05-20", mi: 29000, title: "2009 BMW 650i Coupe Sport", image: "https://img.example/c.jpg" }];
const h = rowsHtml({ market: { kind: "none", cardListsSales: true, rows: R650 } });
const text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok((h.match(/class="crow"/g) || []).length === 3, "the 650i card lists the engine's three sales");
ok(text.includes("2010 BMW 650i Coupe Sport") && text.includes("$25,500") && text.includes("May 2026, 4,000 miles at sale") && text.includes("$16,800") && text.includes("$17,555"), "each row: the record's own title, month and year, mileage at sale, price");
ok(h.indexOf("$25,500") < h.indexOf("$16,800") && h.indexOf("$16,800") < h.indexOf("$17,555"), "rows in the engine's own order");
ok(/<span class="cth nop">No photo<\/span>/.test(h) && (h.match(/<img class="cth"/g) || []).length === 2, "a row with no photo gets the marked no-photo slot; the others a thumbnail");
ok(!/<a |href=|Bring a Trailer|Mecum|Bonhams|Cars & Bids/i.test(h), "no venue name and no link");
ok(styles.length === 1, "the rows' style is added once");
rowsHtml({ market: { cardListsSales: true, rows: R650 } }); ok(styles.length === 1, "and only once");
ok(rowsHtml({ market: { kind: "range", low: 30000, high: 45000, count: 20 } }) === "", "a range card: no rows");
ok(rowsHtml({ market: { kind: "none", rows: R650 } }) === "", "no engine flag: no rows (the engine decides, never the page)");
ok(rowsHtml({ market: { cardListsSales: true, rows: [] } }) === "" && rowsHtml({ market: null }) === "" && rowsHtml({}) === "", "no rows or no market: nothing");
ok(rowsHtml({ swap: true, market: { cardListsSales: true, rows: R650 } }) === "", "an engine-swapped card: no rows");
// The card puts the rows inside its Sam block, under the line.
ok(c.includes(`'<span class="who">Sam</span>' + (line ? line.html : "") + rowsHtml(l)`) && c.includes(`(sl ? '<div class="sl">' + sl + "</div>" : "")`), "the rows sit in the card's Sam block, under the Sam line");
console.log(`buyRowsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
