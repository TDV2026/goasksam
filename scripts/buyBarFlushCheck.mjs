// BUY STAGE 1e ITEM 5 (Sam, Oct 21 2026): the follow-up bar sits flush at the bottom of the screen and the strip behind it
// is only the bar plus a small margin (the phone's safe area added below), so it hides as little of the cards as possible.
// Measured in a local render (Oct 21 2026): 1440 strip 77 px around a 60 px bar (was 85), 390 strip 72 px around 59 (was
// 82, with the suggestion row above it gone too); the strip's bottom is the window's bottom at both. No network.
//   node scripts/buyBarFlushCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const css = JSON.parse(/^const BUY_CARD_CSS = (".*");$/m.exec(buy)[1]);
const b = css.slice(css.indexOf("BUY STAGE 1e ITEM 5"));
ok(/\.composer\{padding:8px 24px calc\(8px \+ env\(safe-area-inset-bottom,0px\)\);margin:0\}/.test(b), "desktop: 8 px above and below the bar (plus the safe area), no margin under the strip");
ok(/@media \(max-width:860px\)\{\.composer\{padding:6px 12px calc\(6px \+ env\(safe-area-inset-bottom,0px\)\)\}\}/.test(b), "phone: 6 px above and below (plus the safe area)");
const end = css.indexOf("@media (max-width:860px){.composer{padding:6px", css.indexOf("BUY STAGE 1e ITEM 5"));
ok(end > 0 && !/\.composer\{/.test(css.slice(end + 60)), "no later rule pads the strip again");
console.log(`buyBarFlushCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
