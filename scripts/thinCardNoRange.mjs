// THIN CARD NO RANGE (e62, Sam's condition): under eight sales the shared card shows words and no range, so a thin
// answer that now carries the exact lowest and highest sale as DATA must never print them as "lowest to highest".
// Renders thin fixtures (with lowestSaleN / highestSaleN set) through the shared card (lib/sellsForCard.js) and fails
// on any "$X to $Y" line or on either figure appearing as a pair. Exit 1 on failure. No network.
//   node scripts/thinCardNoRange.mjs
import { sellsForCardHtml } from "../lib/sellsForCard.js";
const fixtures = [
  { tier: "thin", poolN: 6, soldCount: "six", soldCountN: 6, lowestSaleN: 23250, highestSaleN: 76000, latestSaleLine: "Latest sale: September 2026.", basisLine: "Based on six sales, the latest in September 2026.", cluster: null, span: null, rungLabel: "2001 Mustang Cobra R", cards: [] },
  { tier: "thin", poolN: 3, soldCount: "three", soldCountN: 3, lowestSaleN: 33000, highestSaleN: 56500, latestSaleLine: "Latest sale: June 2026.", cluster: null, rungLabel: "1969 Camaro Convertible", cards: [] },
  { tier: "result", poolN: 4, soldCount: "four", soldCountN: 4, spanOnly: true, lowestSaleN: 57000, highestSaleN: 150911, latestSaleLine: "Latest sale: May 2026.", cluster: null, rungLabel: "1973 911 Targa", cards: [] }
];
const money = n => "$" + Number(n).toLocaleString("en-US");
let bad = 0;
for (const f of fixtures) {
  let html = "";
  try { html = String(sellsForCardHtml(f, {}) || ""); } catch (e) { console.log(`FAIL  ${f.rungLabel}: the card threw (${String(e.message).slice(0, 80)})`); bad++; continue; }
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
  const rangeLine = /\$[\d,]+\s*(?:to|-)\s*\$[\d,]+/.test(text);
  const pair = text.includes(money(f.lowestSaleN)) && text.includes(money(f.highestSaleN));
  if (rangeLine || pair) { console.log(`FAIL  ${f.rungLabel}: a thin card shows a lowest-to-highest line: "${(text.match(/\$[\d,]+\s*(?:to|-)\s*\$[\d,]+/) || [""])[0]}"`); bad++; }
  else console.log(`PASS  ${f.rungLabel}: no range on a ${f.poolN}-sale answer`);
}
console.log(bad ? `thinCardNoRange: ${bad} failed` : `thinCardNoRange: ${fixtures.length} passed`);
process.exit(bad ? 1 : 0);
