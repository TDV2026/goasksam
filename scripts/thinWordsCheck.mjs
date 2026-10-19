// NO PAGE-WRITTEN THIN WORDING (Sam, Oct 19 2026): under a thin card, and on the refusals, the engine's own line and
// latest-sale line (drawn by the shared card, lib/sellsForCard.js) are the only explanation. Reads the page sources and
// fails if a dropped page-written line comes back, or if Market Check's thin hero or refusal stops drawing the shared
// card with {rows:false} (the tiles or grid below are the one list of sales). No network.
//   node scripts/thinWordsCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const code = s => s.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");   // comments may quote the old lines
const fnBody = (s, name) => { const i = s.indexOf("function " + name + "("); if (i < 0) return ""; const j = s.indexOf("\n  function ", i + 1); return s.slice(i, j < 0 ? undefined : j); };

const mc = code(src("public/js/onebox.js")), demo = code(src("api/partnerDemo.js")), buy = code(src("api/buy.js"));
const DROPPED = [
  ["public/js/onebox.js", mc, /sold at the auction houses, none online/],
  ["public/js/onebox.js", mc, /mostly trade at the auction houses/],
  ["public/js/onebox.js", mc, /sell online and at the auction houses/],
  ["public/js/onebox.js", mc, /to show an honest spread/],
  ["public/js/onebox.js", mc, /No range on this one\. It would be a guess\./],
  ["public/js/onebox.js", mc, /would invent a pattern that is not there/],
  ["api/partnerDemo.js", demo, /No range for cars like this yet/],
  ["api/buy.js", buy, /Not enough recent sales to show a range\./],
];
for (const [f, s, re] of DROPPED) ok(!re.test(s), `${f}: page-written thin wording is back: ${re}`);

const thinHero = fnBody(mc, "thinHeroHtml"), refusal = fnBody(mc, "refusalHtml"), rangeHero = fnBody(mc, "heroRangeHtml");
ok(/sellsForCardHtml\(d, \{ rows: false \}\)/.test(thinHero), "Market Check thin hero draws the shared card with {rows:false}");
ok(/sellsForCardHtml\(d, \{ rows: false \}\)/.test(rangeHero), "Market Check range hero draws the shared card with {rows:false}");
const refusalCalls = (refusal.match(/sellsForCardHtml\(d, \{ rows: false \}\)/g) || []).length;
ok(refusalCalls === 2, `Market Check refusal draws the shared card on both the thin and the spread refusal (found ${refusalCalls})`);
ok(!/lint\(esc\(lead\)/.test(refusal) && !/"refuse\.reason"/.test(refusal), "Market Check refusal prints no lead or reason of its own");

console.log(`thinWordsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
