// The Sell entry page's heading (Sam, Oct 26 2026). The signed-in Sell page (api/sellPage.js, the page with the left rail) used a handwritten
// script line and a large serif headline of its own. It now draws the SAME heading pieces as Find, Market Check and Home (lib/startPage.js: the
// small caps eyebrow, the serif headline, one sans supporting sentence, the same sizes and spacing), with the words it always had: "Tell Sam the
// car you're selling." and the line about where to sell it and why. No script font anywhere on the page. Layout and wording only; the engine is untouched.
// The browser copy of these strings is homeHeroHTML in public/js/result-copy.js (a classic script cannot import); scripts/sellEntryCheck.mjs keeps the two equal.
import { START_CSS } from "../startPage.js";

export const SELL_ENTRY = {
  eyebrow: "Sell · Selling intelligence",
  title: "Tell Sam the car you're selling.",
  sub: "Sam will show you where to sell it, and why.",
  placeholder: "e.g. 2004 Porsche 911 Carrera, or paste a VIN."
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function sellHeroHtml() {
  return `<div id="hero"><section class="gst gst-entry"><p class="gst-eye">${esc(SELL_ENTRY.eyebrow)}</p><h1 class="gst-h">${esc(SELL_ENTRY.title)}</h1><p class="gst-sub">${esc(SELL_ENTRY.sub)}</p></section></div>`;
}
// The shared start component's rules (the eyebrow, headline and sub are scoped by their own classes) plus the tokens they read, and the old
// handwritten-script classes drawn without the script font wherever else the page still uses them (the quiet eyebrow on the Your results panel, the serif on the result card's lead-in), so no script font remains.
export const SELL_ENTRY_CSS = START_CSS + `
#hero .gst-entry{--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--ink:#15201A;--sec:#5E6B63;--green:#1E4D38;padding-bottom:6px}
.hp-script{font:600 12px/1.3 "Instrument Sans",system-ui,sans-serif !important;letter-spacing:.2em;text-transform:uppercase;color:#1E4D38 !important}
.pcard-script{font-family:"Newsreader",Georgia,"Times New Roman",serif !important;font-style:normal}`;
