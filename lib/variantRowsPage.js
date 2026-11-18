// THE VARIANT ROWS on the Market Check result (Lane S, Nov 17 2026; crew only). When the engine's answer carries variantSplit with show true, the page draws it directly under the price range:
// the engine's line, then one row per variant, in the engine's order: the label on the left, rangeText and salesText on the right (a row with no rangeText shows the label and salesText), each row a real link to that row's car address
// (Market Check already run for that variant, the car bar carrying that car). The page prints the engine's words and nothing else: no question, no chooser, no total, no sort, no arithmetic.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer.
// THE SHAPE (Lane B's lane-b-variant-rows will post the exact one in docs/lane-notes.md; until then this fixture shape): variantSplit { show, line, rows: [ { label, rangeText, salesText, car: { token, words, address } } ] }.
// WHERE IT RUNS: the result is drawn in the browser by public/js/onebox.js from the engine's answer, and that file is the same bytes for a visitor and for the crew, so it is NOT edited. For the crew the new design's Market Check page carries this small module
// (carBarFinish adds it, crew only): it reads variantSplit off the engine's answer as it arrives and puts the rows under the price range card. The row builder is ONE function (variantRowsFactory) that the page runs from its own source and a check runs in Node, the way lib/sellsForCard.js does.
import { splitServed } from "./variants.js";

export function variantRowsFactory() {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function text(x) { return typeof x === "string" && x.trim() ? x.trim() : ""; }
  return function variantRowsHtml(vs) {
    if (!vs || vs.show !== true || !Array.isArray(vs.rows)) return "";
    var rows = vs.rows.filter(function (r) { return r && text(r.label); });
    if (!rows.length) return "";
    var h = '<div class="vrs" id="vrs" data-stage="answer">' + (text(vs.line) ? '<p class="vrs-line">' + esc(vs.line) + "</p>" : "") + '<ul class="vrs-list">';
    rows.forEach(function (r) {
      var href = r.car && typeof r.car.address === "string" && r.car.address.charAt(0) === "/" ? r.car.address : "";
      var inner = '<span class="vrs-l">' + esc(r.label) + '</span><span class="vrs-r">' + (text(r.rangeText) ? '<span class="vrs-range">' + esc(r.rangeText) + "</span>" : "") + (text(r.salesText) ? '<span class="vrs-sales">' + esc(r.salesText) + "</span>" : "") + (text(r.mileageNote) ? '<span class="vrs-mi">' + esc(r.mileageNote) + "</span>" : "") + "</span>";
      h += "<li>" + (href ? '<a class="vrs-row" href="' + esc(href) + '">' + inner + "</a>" : '<div class="vrs-row">' + inner + "</div>") + "</li>";
    });
    return h + "</ul>" + (text(vs.mileageLine) ? '<p class="vrs-miline">' + esc(vs.mileageLine) + "</p>" : "") + (text(vs.asideLine) ? '<p class="vrs-aside">' + esc(vs.asideLine) + "</p>" : "") + "</div>";
  };
}
export const variantRowsHtml = variantRowsFactory();

// the page's own type and spacing: the sans and the secondary colour of the lines around the range, the card's hairline, the same rhythm; one column on a phone, the figures under the label
export const VARIANT_ROWS_CSS = `.vrs{margin:12px 0 0;max-width:100%}.vrs-line{margin:0 0 6px;font:400 15px/1.45 var(--sans);color:var(--sec)}
.vrs-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.vrs-list li{border-bottom:1px solid var(--line)}
.vrs-row{display:flex;align-items:baseline;justify-content:space-between;gap:4px 16px;padding:9px 0;color:var(--ink);text-decoration:none;font:400 16px/1.4 var(--sans)}
a.vrs-row:hover .vrs-l{text-decoration:underline;text-underline-offset:3px}a.vrs-row:focus-visible{outline:2px solid var(--forest,#0B3126);outline-offset:2px}
.vrs-l{min-width:0;overflow-wrap:anywhere}.vrs-r{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 12px;text-align:right;color:var(--sec)}.vrs-range{color:var(--ink);font-variant-numeric:tabular-nums}.vrs-sales{font-variant-numeric:tabular-nums}.vrs-mi{flex-basis:100%;font:400 14px/1.4 var(--sans)}.vrs-miline,.vrs-aside{margin:8px 0 0;font:400 14px/1.45 var(--sans);color:var(--sec)}
@media (max-width:640px){.vrs-row{flex-direction:column;align-items:flex-start}.vrs-r{justify-content:flex-start;text-align:left}}`;

export const VARIANT_ROWS_JS = `(function(){var build=(${variantRowsFactory.toString()})(),vs=null,of=window.fetch;
function scan(o,d){if(!o||typeof o!=="object"||d>5)return undefined;if(Object.prototype.hasOwnProperty.call(o,"variantSplit"))return o.variantSplit;for(var k in o){var r=scan(o[k],d+1);if(r!==undefined)return r}return undefined}
function isAnswer(o){return !!o&&typeof o==="object"&&(o.resolvedCar!==undefined||o.cluster!==undefined||o.poolN!==undefined)}
function narrow(hide){Array.prototype.forEach.call(document.querySelectorAll(".narrow-strip"),function(n){if(hide){n.style.display="none";n.setAttribute("data-vrs-hid","1")}else if(n.getAttribute("data-vrs-hid")){n.style.display="";n.removeAttribute("data-vrs-hid")}})}
function place(){var old=document.getElementById("vrs"),card=document.querySelector(".hero-left .sfc-card");
 if(!vs||vs.show!==true||!card){if(old&&(!vs||vs.show!==true))old.remove();if(card&&card.getAttribute("data-vrs-hid")){card.style.display="";card.removeAttribute("data-vrs-hid")}if(!vs||vs.show!==true)narrow(false);return}
 var h=build(vs);if(!h){if(old)old.remove();return}
 card.style.display="none";card.setAttribute("data-vrs-hid","1");narrow(true);
 if(old&&old.previousElementSibling===card&&old.getAttribute("data-v")===h.length+":"+h.slice(0,60))return;if(old)old.remove();card.insertAdjacentHTML("afterend",h);var n=document.getElementById("vrs");if(n)n.setAttribute("data-v",h.length+":"+h.slice(0,60))}
if(of){window.fetch=function(){var p=of.apply(this,arguments);try{p.then(function(r){try{if(/json/.test(String(r.headers.get("content-type")||"")))r.clone().json().then(function(j){var f=scan(j,0);if(f!==undefined)vs=f;else if(isAnswer(j)||(j&&isAnswer(j.answer)))vs=null;place()},function(){})}catch(e){}},function(){})}catch(e){}return p}}
function watch(){try{new MutationObserver(function(){place()}).observe(document.body||document.documentElement,{childList:true,subtree:true})}catch(e){}}
if(document.body)watch();else document.addEventListener("DOMContentLoaded",watch)})();`;

// html in, html out. Crew only (a visitor's page is the same bytes), on the Market Check page only; added at the top of the body so the fetch hook is in place before the page's own script asks for the answer.
export function variantRowsFinish(html, req, tool) {
  const s = String(html);
  if (tool !== "mc" || !splitServed(req) || s.indexOf('id="vrs-mod"') >= 0 || !/<body[^>]*>/.test(s)) return s;
  return s.replace(/<body[^>]*>/, m => m + `<style id="vrs-css">${VARIANT_ROWS_CSS}</style><script id="vrs-mod">${VARIANT_ROWS_JS}</script>`);
}
