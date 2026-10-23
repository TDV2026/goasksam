// The new Sell start page (GoAskSam 2.0 Stage 2, Sam's block and reference image, Oct 23 2026), behind SELL_NEXT_ON with the rest of the
// new Sell. Drawn by the ONE shared start component (lib/startPage.js) like Home, Find and Market Check. Server-rendered by
// api/sellNext.js and handed to the page through the Sell home hook (window.GAS_SELL.homeHtml), so js/onebox.js's own wire() attaches the
// box (#ob-input / #ob-go) exactly as it does on Market Check; submitting starts the new Sell flow. The old landing (hero photo, example
// band, specialist band, feature cards) is gone: an entry screen is a headline and a box. The dated line stays as one quiet "Updated"
// line (search rule 1's named /sell exception).
import { startHtml, START_CSS } from "../startPage.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";

const shortDate = full => { const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || "")); return m ? `${m[1]} ${m[2]}, ${m[3]}` : full; };

export function sellStartCfg(updated) {
  return {
    id: "gas-start-sell", eyebrow: "Sell · Selling intelligence", title: "Where should you sell your car?",
    sub: "Tell Sam what you're selling. See what the auction data says about where and how to sell it.",
    placeholder: PLACEHOLDERS.sell.text, helper: "Type or speak naturally.",
    label: "Tell Sam about your car, or paste a VIN", ids: { input: "ob-input", mic: "ob-mic", go: "ob-go" },
    line: "Platform performance · Selling strategy · PowerSeller matching",
    asof: updated ? `Updated ${shortDate(updated)}.` : ""
  };
}
export function sellLandingHtml({ updated } = {}) {
  return '<div id="sell-landing" class="mc gst-lead">' + startHtml(sellStartCfg(updated)) + '<p class="gst-foot">Real completed sales. Evidence behind the recommendations.</p></div>';
}
export const SELL_LANDING_CSS = START_CSS + `
#sell-landing.gst-lead{width:100%;min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 0 48px;box-sizing:border-box}
.gst-foot{margin:34px 0 0;font:400 13px/1.4 var(--sans,system-ui);color:#9AA39D;text-align:center}
@media (max-width:700px){#sell-landing.gst-lead{min-height:0;justify-content:flex-start;padding:28px 0 40px}}`;
