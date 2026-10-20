// BUY STAGE 1d ITEM 1, THE TOP OF THE PAGE (Sam, Oct 20 2026): less space above the results, lighter chips, the count
// and Sort on one row next to the chips, the question higher and tighter. Layout only: the CSS is there and the header's
// markup and words are unchanged (the count, then Sort, inside .scount). No network.
//   node scripts/buyTopCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
const i = css.indexOf("BUY STAGE 1d ITEM 1"), block = i > 0 ? css.slice(i) : "";
ok(i > 0, "the item 1 block is in BUY_CARD_CSS");
ok(/\.msg\.sam \.scount\{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:4px 14px\}/.test(block), "the count and Sort share one row");
ok(/@media \(min-width:861px\)\{\.msg\.sam \.scount\{padding-top:0\}\}/.test(block) && /\.ssort\{margin-top:0\}/.test(block), "no gap above the count or between the count and Sort");
ok(/\.msg\.results \.shead\{margin:0 0 10px\}/.test(block) && /\.ask\{margin:2px 0 14px;padding:12px 16px\}/.test(block), "less space above the results and a tighter question");
ok(/\.rchip\{min-height:32px;padding:5px 12px;border-color:rgba\(31,30,27,\.13\)/.test(block), "lighter chips, still 32 px tall");
ok(/@media \(max-width:700px\)\{\.msg\.results \.shead \.srow2\{align-items:flex-start\}/.test(block), "phones: the stacked header stays left-aligned");
ok(/'<div class="scount"><p class="sc-1">'|class=\\?"scount\\?"/.test(client) && /sortHtml\(m\)/.test(client), "the header markup still carries the count and Sort");
ok(!/(^|[;{])\s*content:/.test(block), "no words added by CSS (no content property)");
console.log(`buyTopCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
