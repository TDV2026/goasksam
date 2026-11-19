// The Sell entry page's heading (Sam, Oct 26 2026). The signed-in Sell page (api/sellPage.js, the page with the left rail) used a handwritten
// script line and a large serif headline of its own. It now draws the SAME heading pieces as Find, Market Check and Home (lib/startPage.js: the
// small caps eyebrow, the serif headline, one sans supporting sentence, the same sizes and spacing), with the words it always had: "Tell Sam the
// car you're selling." and the line about where to sell it and why. No script font anywhere on the page. Layout and wording only; the engine is untouched.
// The browser copy of these strings is homeHeroHTML in public/js/result-copy.js (a classic script cannot import); scripts/sellEntryCheck.mjs keeps the two equal.
import { START_CSS, START_BOX_MAX, GO_ARROW_SVG } from "../startPage.js";

export const SELL_ENTRY = {
  eyebrow: "Sell · Selling intelligence",
  title: "Tell Sam the car you're selling.",
  sub: "Sam will show you where to sell it, and why.",
  placeholder: "e.g. 2004 Porsche 911 Carrera, or paste a VIN."
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Sell's send button and box width are the shared start-page ones (lib/startPage.js): the same .gst-go button (40 px, 12 px corners, the brand green, the
// right arrow) and the same 600 px box. The old up-arrow #btn and its own sizes are overridden here, never copied.
export const SELL_GO_HTML = `<button id="btn" class="gst-go" type="button" aria-label="Send">${GO_ARROW_SVG}</button>`;
export function sellHeroHtml() {
  return `<div id="hero"><section class="gst gst-entry"><p class="gst-eye">${esc(SELL_ENTRY.eyebrow)}</p><h1 class="gst-h">${esc(SELL_ENTRY.title)}</h1><p class="gst-sub">${esc(SELL_ENTRY.sub)}</p></section></div>`;
}
// The shared start component's rules (the eyebrow, headline and sub are scoped by their own classes) plus the tokens they read, and the old
// handwritten-script classes drawn without the script font wherever else the page still uses them (the quiet eyebrow on the Your results panel, the serif on the result card's lead-in), so no script font remains.
export const SELL_ENTRY_CSS = START_CSS + `
#hero .gst-entry{--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--ink:#15201A;--sec:#5E6B63;--green:#1E4D38;padding-bottom:6px}
.hp-script{font:600 12px/1.3 "Instrument Sans",system-ui,sans-serif !important;letter-spacing:.2em;text-transform:uppercase;color:#1E4D38 !important}
body.home #input-area{max-width:${START_BOX_MAX + 32}px;width:100%;margin:0 auto;padding:0 16px;box-sizing:border-box}
body #btn.gst-go,body.home #btn.gst-go{width:40px;height:40px;min-width:40px;border:0;border-radius:12px;background:#123F33;color:#fff;padding:0;box-shadow:none;opacity:1;font-size:0;display:grid;place-items:center;flex:none;cursor:pointer}
body #btn.gst-go:hover,body.home #btn.gst-go:hover{background:#0C2F25;opacity:1}
body #btn.gst-go:disabled{background:#123F33;opacity:.45;cursor:default}
.pcard-script{font-family:"Newsreader",Georgia,"Times New Roman",serif !important;font-style:normal}`;
