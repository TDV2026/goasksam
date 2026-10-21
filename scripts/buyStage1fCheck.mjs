// BUY STAGE 1f (Sam's polish pass, Oct 21 2026; Lane C): one assertion group per item, each added by that item's commit.
// Layout and wording only; the page computes nothing. No network.   node scripts/buyStage1fCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]), css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const after = k => css.slice(css.indexOf("BUY STAGE 1f ITEM " + k + ","));
// ITEM 1
ok(/\.msg\.results \.scount \.ssort\{order:2;margin-top:0\}/.test(after(1)) && /\.msg\.results \.scount p\.sc-2\{order:3;flex-basis:100%\}/.test(after(1)), "1: count and Sort on one line, the quiet line under them");
ok(!/class="sq"/.test(client.slice(client.indexOf("function headerHtml"), client.indexOf("function everythingLine"))), "1: no headline above the chips");
//__NEXT__
console.log(`buyStage1fCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
