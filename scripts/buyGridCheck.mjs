// BUY STAGE 1d ITEM 3, THE CARD GRID (Sam, Oct 20 2026): every card in a row takes the row's height, the actions sit
// on one baseline at the bottom, the title is held to two lines (full title kept in the markup and its title
// attribute, rule 25) and the metadata to one. Nothing is added to fill a shorter card. No network.
//   node scripts/buyGridCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
const i = css.indexOf("BUY STAGE 1d ITEM 3"), block = i > 0 ? css.slice(i) : "";
ok(i > 0 && i > css.lastIndexOf(".cgrid{align-items:start}"), "the item 3 block comes after (and so overrides) Stage 1c item 4c");
ok(/\.cgrid\{align-items:stretch\}/.test(block), "every card in a row takes the row's height");
ok(/\.cgrid \.car \.acts\{margin-top:auto;padding-top:14px\}/.test(block), "the actions sit on one baseline at the bottom");
ok(/\.cgrid \.car h3\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;min-height:2\.6em\}/.test(block), "the title is held to two lines, with room for two");
ok(/\.cgrid \.car p\.meta\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/.test(block), "the metadata is held to one line");
ok(/data-gas-listing-id="' \+ esc\(String\(l\.id\|\|""\)\) \+ '" title="' \+ esc\(carTitle\(l\)\) \+ '">' \+ esc\(carTitle\(l\)\) \+ "<\/a><\/h3>/.test(client), "the full title is the link text and its title attribute (rule 25: the card's own title)");
ok(!/(^|[;{])\s*content:/.test(block), "no words added by CSS");
console.log(`buyGridCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
