// EVERY DEMO PHOTO ASKS A WIDTH THE PHOTO PATH SERVES (Lane E's Amazon stage 5 find, Oct 20 2026): the 275 GTB card's
// sale-row photos asked no width, and the history rows asked 160, which is not one of PHOTO_WIDTHS, so both came back at
// full size. Every ?photo= address the partner pages build must carry &w= one of PHOTO_WIDTHS. No network.
//   node scripts/photoWidthCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { PHOTO_WIDTHS } from "../lib/_salePhoto.js";
import { cardWithRowsOf } from "../api/partnerAnswer.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
for (const f of ["api/partnerAnswer.js", "api/_amazonDemo.js", "api/partnerDemo.js"]) {
  const s = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
  const built = [...s.matchAll(/["']\/api\/partnerAnswer\?photo=["']\s*\+\s*encodeURIComponent\([^)]*\)\s*\+?\s*(["'][^"']*["'])?/g)];
  ok(built.length > 0, `${f}: has photo addresses`);
  for (const m of built) { const w = /&w=(\d+)/.exec(m[1] || ""); ok(!!w && PHOTO_WIDTHS.includes(Number(w[1])), `${f}: a photo address asks a served width (${(m[1] || "no width").slice(0, 40)})`); }
}
const d = { tier: "thin", cards: [{ title: "1966 Ferrari 275 GTB", price: 2700000, date: "2026-08-20", image: "https://example.test/a.jpg", id: 7, url: "https://example.test/x" }], thinLine: "These are the sales we found.", latestSaleLine: "Latest sale: August 2026." };
const h = String(cardWithRowsOf(d) || "");
ok(/\?photo=7&amp;w=320"|\?photo=7&w=320"/.test(h) && !/\?photo=[^"&]+"/.test(h), "cardWithRows: the row photo asks w=320, none without a width");
console.log(`photoWidthCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
