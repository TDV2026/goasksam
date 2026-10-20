// BUY STAGE 1d ITEM 4, THE CARD ACTIONS (Sam, Oct 20 2026): the thin card's "See the sales in Market Check" link is
// removed (the defect: it was a static button under the card's stretched title link, so a click reached the link and
// opened the auction site); every card has exactly two actions, "View auction" and "Market Check"; while its panel is
// open the button reads "Close Market Check" with an active state, and "Market Check" again when closed. No network.
//   node scripts/buyActionsCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const code = client.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
ok(!/mclink|See the sales/.test(code), "no 'See the sales' link anywhere in the page's code");
const fn = name => { const i = code.indexOf("function " + name + "("); return code.slice(i, code.indexOf("\n  function ", i + 1)); };
ok(/return '<p class="nr-scope">' \+ rungHtml\(\{ rungLines: rungShown\(l, x\.rung\) \}\) \+ '<\/p><p class="nr-line">' \+ esc\(first\) \+ "<\/p>";/.test(fn("compactNoRange")), "the thin card keeps the scope and the engine's first sentence, nothing after it");
const card = fn("card");
ok((card.match(/<a class="vauc"/g) || []).length === 1 && (card.match(/class="act" data-mc=/g) || []).length === 1, "each card has exactly the two actions, View auction and Market Check");
ok(/function mcState\(b, open\)\{ b\.setAttribute\("aria-expanded", open \? "true" : "false"\); if \(REL_MC && b\.classList\.contains\("act"\)\) b\.textContent = open \? "Close Market Check" : "Market Check"; \}/.test(code), "the button reads Close Market Check while open, Market Check when closed");
ok(/mcState\(btn, true\)/.test(fn("openDrawer")) && /mcState\(b, false\)/.test(fn("closeOverlays")), "opening sets it, every close resets it");
ok(/\.car \.acts \.act\[data-mc\]\[aria-expanded=true\]\{background:var\(--ink\);color:#fff;border-color:var\(--ink\)\}/.test(css), "the open button has an active state");
console.log(`buyActionsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
