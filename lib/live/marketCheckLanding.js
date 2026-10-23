// The Market Check start page (GoAskSam 2.0 Stage 2, Sam's block and reference image, Oct 23 2026): the state before a first search,
// drawn by the ONE shared start component (lib/startPage.js) like Home, Find and Sell. Server-rendered into #ob (the page's client
// replaces it on the first real search, same as every other Market Check render). The old landing (hero photo, example band, chips,
// "How Sam gets there") is gone: an entry screen is a headline and a box; a VIN is accepted in the same box. The box keeps this
// page's own ids (ob-input, ob-go), so Market Check's engine path is untouched. The dated lead sentence search rule 1 asks for stays
// as one quiet line under the box (data-lead-sentence, date only, never a count).
import { startHtml, START_CSS } from "../startPage.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";

const MONTHS_SHORT = { January: "Jan", February: "Feb", March: "Mar", April: "Apr", May: "May", June: "Jun", July: "Jul", August: "Aug", September: "Sep", October: "Oct", November: "Nov", December: "Dec" };
// lib/asOf.js's lastUpdatedDate() returns "October 8, 2026"; this line's copy calls for the abbreviated month ("Oct 8, 2026").
function abbrevMonth(full) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || ""));
  return m ? `${MONTHS_SHORT[m[1]] || m[1]} ${m[2]}, ${m[3]}` : full;
}
// The start page's copy, ONE object: the server's first paint and the page's own "new search" screen (public/js/onebox.js reads it from
// window.GAS_START_CFG) draw the same words through the same function.
export function startCfg(updated) {
  return {
    id: "gas-start-mc", eyebrow: "Market Check · Completed sales", title: "What have cars like yours sold for?",
    sub: "Real completed sales. A typical sold range. The evidence behind it.",
    placeholder: PLACEHOLDERS.mc.text, helper: "Describe the car, enter a VIN, or use your voice.",
    label: "Search a car or a VIN", ids: { input: "ob-input", mic: "ob-mic", go: "ob-go" },
    line: "Completed sales only. Every result links to its source.",
    asof: "Market Check." + (updated ? ` Updated ${abbrevMonth(updated)}.` : ""), leadMark: true, goAttrs: 'data-gas-event="market_check_open"'
  };
}
export function landingHtml({ updated, h1Text } = {}) {
  return '<div id="mc-landing" class="mc gst-lead">' + startHtml(startCfg(updated)) + "</div>";
}

export const LANDING_CSS = START_CSS + `
#ob:has(#mc-landing){max-width:1080px}
#mc-landing.gst-lead{width:100%;min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 0 48px;box-sizing:border-box}
@media (max-width:700px){#mc-landing.gst-lead{min-height:0;justify-content:flex-start;padding:28px 0 40px}}`;
