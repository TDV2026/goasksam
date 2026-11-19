// The new Sell start page (GoAskSam 2.0 Stage 2, Sam's block and reference image, Oct 23 2026), behind SELL_NEXT_ON with the rest of the
// new Sell. Drawn by the ONE shared start component (lib/startPage.js) like Home, Find and Market Check. Server-rendered by
// api/sellNext.js and handed to the page through the Sell home hook (window.GAS_SELL.homeHtml), so js/onebox.js's own wire() attaches the
// box (#ob-input / #ob-go) exactly as it does on Market Check; submitting starts the new Sell flow. The old landing (hero photo, example
// band, specialist band, feature cards) is gone: an entry screen is a headline and a box. The dated line stays as one quiet "Updated"
// line (search rule 1's named /sell exception).
import { startHtml, START_CSS } from "../startPage.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";

import { shortDate } from "../asOf.js";

export function sellStartCfg(updated) {
  return {
    id: "gas-start-sell", eyebrow: "Sell · Selling intelligence", title: "Where should you sell your car?",
    sub: "Tell Sam what you're selling. See what the auction data says about where and how to sell it.",
    examples: PLACEHOLDERS.sell.examples, helper: "",
    label: "Describe the car you are selling or paste a VIN", ids: { input: "ob-input", mic: "ob-mic", go: "ob-go" },
    line: "Platform performance · Selling strategy · PowerSeller matching",
    asof: "Auction data" + (updated ? ` \u00b7 Updated ${shortDate(updated)}` : "")
  };
}
export function sellLandingHtml({ updated } = {}) {
  return '<div id="sell-landing" class="mc gst-lead">' + startHtml(sellStartCfg(updated)) + "</div>";
}
export const SELL_LANDING_CSS = START_CSS + `
#sell-landing.gst-lead{--gst-off:10px}
@media (max-width:900px){#sell-landing.gst-lead{--gst-off:20px}}   /* the tablet header bar sits 10 px lower here, so the group meets Home and Find */   /* how far this page's wrapper already sits from the top of the window; the position itself is START_CSS */
@media (max-width:700px){#sell-landing.gst-lead{min-height:0;justify-content:flex-start;padding:28px 0 40px}}`;
