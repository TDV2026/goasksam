// The Find start page (GoAskSam 2.0 Stage 2, Sam's block, Oct 23 2026): the state before a first search, drawn by the ONE shared start
// component (lib/startPage.js) like Home, Market Check and Sell. Server-rendered inside <div id="lead">, which the page's client removes
// on the first search (send()), so the chat and the results after a first search are exactly as before. The old landing (hero, feature
// cards, "Put Sam on it", the example band) is gone: an entry screen is a headline and a box. The box keeps this page's own ids (hq,
// hgo, hmic), so Find's engine path is untouched. The dated lead sentence search rule 1 asks for stays on the page as one quiet
// line under the box (data-lead-sentence).
import { startHtml, START_CSS } from "../startPage.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { keepLookingHtml } from "../appShell.js";

// THE KEEP LOOKING ICON (Oct 2026): the shared Keep looking card's own icon (lib/appShell.js keepLookingHtml), read from its markup, so
// the results page's card in api/buy.js shows exactly what the shared card shows. The neutral loupe is only a fallback.
const KEEP_FALLBACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>';
export const KEEP_ICON = (/<span class="gas-kl-ic"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/.exec(keepLookingHtml({ context: "spec", subject: "it", href: "#" })) || [])[1] || KEEP_FALLBACK;

// lead: the page's one dated sentence (api/buy.js builds it from the live count and the date).
export function landingHtml({ lead } = {}) {
  return '<div id="lead" class="lk gst-lead">' + startHtml({
    id: "gas-start-find", eyebrow: "Find \u00b7 Live auctions", title: "What car are you looking for?",
    sub: "Describe it naturally. Sam searches live enthusiast car auctions for you.",
    placeholder: PLACEHOLDERS.find.text, helper: "Type it or say it. No complicated filters.",
    label: "What car are you looking for?", ids: { input: "hq", mic: "hmic", go: "hgo" },
    asof: lead || "", leadMark: true
  }) + "</div>";
}

export const LANDING_CSS = START_CSS + `
#lead.gst-lead{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 0 48px;box-sizing:border-box}
body:has(#lead) .composer{display:none}
body:has(#lead) .scroll .col{margin-top:0}
@media (max-width:700px){#lead.gst-lead{min-height:0;justify-content:flex-start;padding:28px 0 40px}}`;
