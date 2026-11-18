// THE MODEL CHOICES (Lane S, Nov 17 2026; crew only). A search that names a make and no model is answered on Market Check and Sell with modelChoice { line, choices: [ { label, car: { token, words, address } } ], more } served in place of an answer.
// The page prints the engine's line, then each choice as a tap button that is a real link to that choice's address (the tool already run for the full car, the car bar then carrying the full car), then `more` when the engine sent it (a string is printed as it is; an object with a label and an address is a link).
// Nothing is counted, sorted or worded here: the engine's order, the engine's words. The box stays where it is, so a model can still be typed.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer.
// THE SHAPE (Lane D's lane-d-car-bar-partial will post the exact one in docs/lane-notes.md; until then this fixture shape).
// WHERE IT RUNS: the answer is read in the browser by public/js/onebox.js (Market Check) and the Sell shell, both the same bytes for a visitor, so neither is edited. For the crew the new design's pages carry this small module (carBarFinish adds it): it reads modelChoice off the engine's reply
// as it arrives and draws the block under the car bar. A later reply without modelChoice removes it. The block builder is ONE function (modelChoiceFactory) that the page runs from its own source and a check runs in Node.
import { isCrewRequest } from "./_crew.js";

export function modelChoiceFactory() {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function text(x) { return typeof x === "string" && x.trim() ? x.trim() : ""; }
  function addr(c) { return c && c.car && typeof c.car.address === "string" && c.car.address.charAt(0) === "/" ? c.car.address : ""; }
  return function modelChoiceHtml(mc) {
    if (!mc || typeof mc !== "object" || !Array.isArray(mc.choices)) return "";
    var cs = mc.choices.filter(function (c) { return c && text(c.label); });
    if (!cs.length) return "";
    var h = '<div class="gmc" id="gmc" role="region" aria-label="Models">' + (text(mc.line) ? '<p class="gmc-line">' + esc(mc.line) + "</p>" : "") + '<ul class="gmc-list">';
    cs.forEach(function (c) { var a = addr(c); h += "<li>" + (a ? '<a class="gmc-btn" href="' + esc(a) + '">' + esc(c.label) + "</a>" : '<span class="gmc-btn">' + esc(c.label) + "</span>") + "</li>"; });
    h += "</ul>";
    var m = mc.more;
    if (text(m)) h += '<p class="gmc-more">' + esc(m) + "</p>";
    else if (m && typeof m === "object" && text(m.label)) { var ma = typeof m.address === "string" && m.address.charAt(0) === "/" ? m.address : ""; h += '<p class="gmc-more">' + (ma ? '<a href="' + esc(ma) + '">' + esc(m.label) + "</a>" : esc(m.label)) + "</p>"; }
    return h + "</div>";
  };
}
export const modelChoiceHtml = modelChoiceFactory();

// the page's own look: the car bar's outlined pill for a tap button, the same sans and secondary colour as the lines around it; the buttons wrap, so a phone gets rows and never a sideways scroll
export const MODEL_CHOICE_CSS = `.gmc{box-sizing:border-box;max-width:100%;padding:14px 28px 4px;font:400 15px/1.45 var(--sans,system-ui,sans-serif);color:var(--ink,#15201A)}.gmc-line{margin:0 0 10px;color:var(--sec,#4A5A52)}
.gmc-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}.gmc-list li{min-width:0;max-width:100%}
.gmc-btn{display:inline-flex;align-items:center;min-height:36px;max-width:100%;box-sizing:border-box;padding:6px 16px;border-radius:18px;border:1px solid var(--forest,#0B3126);color:var(--forest,#0B3126);background:transparent;text-decoration:none;font:500 15px/1.3 var(--sans,system-ui,sans-serif);overflow-wrap:anywhere}
a.gmc-btn:hover{background:var(--forest,#0B3126);color:#fff}a.gmc-btn:focus-visible{outline:2px solid var(--forest,#0B3126);outline-offset:2px}.gmc-more{margin:10px 0 0;color:var(--sec,#4A5A52)}.gmc-more a{color:var(--forest,#0B3126);text-decoration:underline;text-underline-offset:2px}
@media (max-width:640px){.gmc{padding:12px 16px 4px}}`;

export const MODEL_CHOICE_JS = `(function(){var build=(${modelChoiceFactory.toString()})(),of=window.fetch,API=/\\/api\\/(sellerDecision|buySearch|sellChat)(\\?|$)/;
function scan(o,d){if(!o||typeof o!=="object"||d>4)return undefined;if(Object.prototype.hasOwnProperty.call(o,"modelChoice"))return o.modelChoice;for(var k in o){var r=scan(o[k],d+1);if(r!==undefined)return r}return undefined}
function draw(mc){var old=document.getElementById("gmc");if(old)old.remove();if(!mc)return;var h=build(mc);if(!h)return;var bar=document.getElementById("gas-carbar"),hd=document.querySelector("header");
 if(bar&&bar.parentNode)bar.insertAdjacentHTML("afterend",h);else if(hd&&hd.parentNode)hd.insertAdjacentHTML("afterend",h);else if(document.body)document.body.insertAdjacentHTML("afterbegin",h)}
if(of){window.fetch=function(input){var p=of.apply(this,arguments);try{var u=typeof input==="string"?input:(input&&input.url)||"";if(API.test(u))p.then(function(r){try{if(/json/.test(String(r.headers.get("content-type")||"")))r.clone().json().then(function(j){var f=scan(j,0);draw(f===undefined?null:f)},function(){})}catch(e){}},function(){})}catch(e){}return p}}})();`;

// html in, html out. Crew only (a visitor's page is the same bytes), on Market Check and Sell; at the top of the body so the fetch hook is in place before the page's own script asks for the answer.
export function modelChoiceFinish(html, req, tool) {
  const s = String(html);
  if ((tool !== "mc" && tool !== "sell") || isCrewRequest(req) !== true || s.indexOf('id="gmc-mod"') >= 0 || !/<body[^>]*>/.test(s)) return s;
  return s.replace(/<body[^>]*>/, m => m + `<style id="gmc-css">${MODEL_CHOICE_CSS}</style><script id="gmc-mod">${MODEL_CHOICE_JS}</script>`);
}
