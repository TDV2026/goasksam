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
// ITEM 2
const askSrc = client.slice(client.indexOf("  var ASK_SUB"), client.indexOf("  // Listings that don"));
ok(/var ASK_SUB = "Choose one, or tell Sam how else to narrow your search below\.";/.test(client) && /<span class="sq-mark" aria-hidden="true">S<\/span><div class="sq-b"><p class="sq-who">Sam<\/p><p class="ask-q">/.test(askSrc), "2: the S letter mark (text only), small Sam, the question, the brief's line");
ok(/if \(light\) return samAskHtml\(a\.q, chips\.join\(""\)\);/.test(client) && /return samAskHtml\(lead \+ a\.q, chips\.join\(""\)/.test(client), "2: the panel and the light row both draw it; the quiet line stays");
ok(!/Narrow your search</.test(client) && !/<img[^>]*sq-mark|sq-mark[^>]*><img/.test(client), "2: no 'Narrow your search' label, no image in the mark");
ok(/\.ask\.samq \.rchip\.achip\.on\{background:var\(--green\)/.test(after(2)) && /if \(ap\) ap\.classList\.add\("on"\);/.test(client), "2: the applied chip fills deep green");
//__NEXT__
console.log(`buyStage1fCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
