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
// ITEM 2 (now item 1 of Sam's new block): the pale green panel, no S mark, no Sam label
const askSrc = client.slice(client.indexOf("  var ASK_SUB"), client.indexOf("  // Listings that don"));
ok(/var ASK_SUB = "Choose one, or tell Sam how else to narrow your search below\.";/.test(client) && /<section class="ask samq" aria-label="Narrow the search">' \+ \(before \|\| ""\) \+ '<div class="sq-b"><p class="ask-q">/.test(askSrc), "2: the question, then the brief's line, in the panel");
ok(!/sq-mark|sq-who|class="lav"/.test(client), "2 (new block item 1): no S mark and no Sam label (the location turn has no S mark either)");
ok(/if \(light\) return samAskHtml\(a\.q, chips\.join\(""\)\);/.test(client) && /return samAskHtml\(lead \+ a\.q, chips\.join\(""\)/.test(client), "2: the panel and the light row both draw it; the quiet line stays");
const n1 = css.slice(css.indexOf("SAM'S NEW 1f BLOCK, ITEM 1,"));
ok(/\.msg\.sam \.ask\.samq\{display:block;margin:2px 0 12px;padding:10px 16px;background:var\(--tint,#E7EBE4\)/.test(n1) && /p\.ask-q\{margin:0;font:500 19px/.test(n1), "2 (new block item 1): the pale green panel, 10px padding (was 12), the question at 19px (was 17)");
ok(/\.ask\.samq \.rchip\.achip\.on\{background:var\(--green\)/.test(css) && /if \(ap\) ap\.classList\.add\("on"\);/.test(client), "2: the applied chip fills deep green");
// ITEM 3
ok(/\.msg\.results p\.unst\{margin:0 0 16px;padding:12px 2px 0;border-top:1px solid var\(--div\)/.test(after(3)) && /data-send="Show the ones that don’t say too">Show them too →<\/button>/.test(client), "3: the unknown-data row keeps its words and button, a quiet row under a thin rule");
// NEW BLOCK ITEM 2: "Show them too" with an arrow, an underlined text link
ok(/">Show them too →<\/button>/.test(client) && !/Show them too<\/button>/.test(client) && /\.msg\.results p\.unst \.rchip\{all:unset;cursor:pointer;color:var\(--green\);[^}]*text-decoration:underline/.test(css), "new 2: 'Show them too →' is an underlined text link with an arrow");
// ITEM 4
ok(/\.car \.ph \.chip\{background:rgba\(21,24,20,\.82\);color:#fff/.test(after(4)), "4: the source and time label is dark, like the bid strip");
ok(!/star|heart|data-save|aria-label="Save/i.test(client.slice(client.indexOf("function photoHtml"), client.indexOf("function photoHtml") + 1500)), "4: no star, heart or save icon on a card");
// ITEM 5
ok(/\.car \.specs \.spec\.hchip\[aria-expanded=true\]\{background:#F7F3E8;color:var\(--green\);border:1px solid var\(--green\)/.test(after(5)) && !/hchip[^{]*\{[^}]*background:var\(--green\)/.test(after(5)), "5: the Sold before / Listed before tag is outlined on cream, never filled");
// ITEM 6
ok(/var ALIGN = \[".tx > .trow", ".tx > .meta", ".tx > .specs", ".tx > .sl"\]/.test(client) && /new MutationObserver\(alignSoon\)\.observe\(log, \{ childList: true, subtree: true \}\); window\.addEventListener\("resize", alignSoon\);/.test(client), "6: each row's title, meta, tag row and Sam box are matched (layout only), again on any change and on resize");
ok(/\.cgrid \.car \.ph\{aspect-ratio:16\/10;height:auto\}/.test(after(6)) && /\.cgrid \.car \.acts\{margin-top:auto\}/.test(after(6)), "6: one image shape; the actions on one baseline");
// NEW BLOCK ITEM 4: what links where
const cardFn = client.slice(client.indexOf("  function card(l, big, eager){"), client.indexOf("  // THE ADAPTIVE GRID"));
ok(/<h3><span class="ttl"/.test(cardFn) && !/<h3><a /.test(cardFn) && (cardFn.match(/href="' \+ esc\(l\.url\)/g) || []).length === 1 && /class="vauc" href="' \+ esc\(l\.url\)/.test(cardFn), "new 4: the title is plain text; inside the card's text only View auction links to the auction (the photo is the other link)");
ok(/<a class="ph" href="' \+ esc\(l\.url\)/.test(client), "new 4: the photo opens the auction");
ok(!/sfin|data-sqedit|data-sfield/.test(client), "new 4: no inline Edit the search field");
// NEW BLOCK ITEM 5: the tags
const n5 = css.slice(css.indexOf("SAM'S NEW 1f BLOCK, ITEM 5,"));
ok(/\.car \.specs \.spec\.hchip\{background:#F7F3E8;color:var\(--green\);border:1px solid var\(--green\);cursor:pointer/.test(n5) && /\.car \.specs \.spec\.hchip:hover,\.car \.specs \.spec\.hchip:focus-visible\{background:#E3EEE6/.test(n5), "new 5: outlined on cream at rest; pale green fill and a pointer on hover and keyboard focus");
// NEW BLOCK ITEM 6: the fold
const n6 = css.slice(css.indexOf("SAM'S NEW 1f BLOCK, ITEM 6,"));
ok(/\.cgrid \.car h3\{min-height:0\}/.test(n6) && /var ALIGN = \[".tx > .trow"/.test(client), "new 6: no empty second title line; a row makes room only when one of its titles wraps (measured: the first row's range bottom 694px against the composer at 823px, 1440 by 900, local render)");
// NEW BLOCK ITEM 7: Sign in never on the Sort
ok(/function clearSignIn\(\)\{/.test(client) && /row\.style\.paddingRight = Math\.ceil\(rr\.right - pr\.left \+ 12\) \+ "px"/.test(client) && /alignRows\(\); clearSignIn\(\);/.test(client) && /new MutationObserver\(alignSoon\)\.observe\(sbar/.test(client), "new 7: the header row keeps clear of the Sign in pill by its measured width, on every change, resize and when the pill fills");
//__NEXT__
console.log(`buyStage1fCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
