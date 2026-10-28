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
ok(!/mclink|See the sales in Market Check/.test(code), "no 'See the sales in Market Check' link anywhere in the page's code (the card's own button is See the sales, Oct 29 2026)");
const fn = name => { const i = code.indexOf("function " + name + "("); return code.slice(i, code.indexOf("\n  function ", i + 1)); };
ok(/return fxHead\(l\) \+ '<p class="fx-answer">' \+ esc\(m\.answerLine \|\| first\) \+ "<\/p>" \+ fxOpt\(l\) \+ fxTail\(l, x\);/.test(fn("compactNoRange")) && /scope_reason \? '<p class="fx-scope">'/.test(fn("fxHead")), "the no-range card keeps the engine's spec, its scope and its reason line (the five-line box, Oct 29 2026)");
const card = fn("card");
ok((card.match(/<a class="vauc"/g) || []).length === 1 && (card.match(/class="act" data-mc=/g) || []).length === 1, "each card has exactly the two actions, View auction and See the sales");
ok(/function mcState\(b, open\)\{ b\.setAttribute\("aria-expanded", open \? "true" : "false"\); if \(b\.classList\.contains\("act"\)\) b\.textContent = open \? "Hide the sales" : "See the sales"; \}/.test(code), "the button reads Hide the sales while open, See the sales when closed");
ok(/mcState\(btn, true\)/.test(fn("openDrawer")) && /mcState\(b, false\)/.test(fn("closeOverlays")), "opening sets it, every close resets it");
ok(/\.car \.acts \.act\[data-mc\]\[aria-expanded=true\]\{background:var\(--ink\);color:#fff;border-color:var\(--ink\)\}/.test(css), "the open button has an active state");
console.log(`buyActionsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
