// THE SALE CARD LABEL on the Market Check result (Lane S, Nov 17 2026; crew only, behind SALE_LABEL_PUBLIC). The sale cards under "The N sales" (and the cards of "Sales behind this answer") print price, month, venue and miles and nothing that says which car it is, so a
// 1987 Firebird's eleven cards mix base cars, Trans Ams and GTAs unlabelled. Each card gets one line above the price: the engine's words for that sale, printed exactly as sent ("1987 Trans Am GTA", "1987 Firebird" when the variant is unstated, "1987 Firebird Replica",
// the engine's set aside word).
// THE SHAPE (Lane B has not served it yet; posted in docs/lane-notes.md as MISSING FIELD for Lane B): every sale row of the answer (cards, setAsideRows, asideCards, the thin tier's receipts) carries  saleLine: "<the engine's words for this sale>"  beside its id.
//   Nothing else: no kind, no flag, no year. The page prints saleLine and decides nothing: it does not read the title, does not pick a variant, does not add the year, does not add the word Replica. A sale with no saleLine (or an empty one) gets no line.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer.
// WHERE IT RUNS: the cards are drawn in the browser by public/js/onebox.js, the same bytes for a visitor and for the crew, so it is NOT edited. For the crew the new design's Market Check page carries this small module (carBarFinish adds it): it reads the sale rows off the
// engine's answer as it arrives (a map of the row's id to its saleLine) and puts the line above the price of each card that carries that id (the card's link carries data-gas-listing-id). One line, never wrapped: the page's own meta type and spacing. On a phone the nine to sixteen sale grid is three across (111 px cards), too narrow for the engine's line in the page's type, so while the cards carry a line it is two across (class sl-on); nothing is shrunk or cut.
import { isCrewRequest } from "./_crew.js";

// THE ONE SWITCH. Crew only while false; true gives the line to every visitor too. Nothing else gates it.
export const SALE_LABEL_PUBLIC = false;

export const SALE_LABEL_CSS = `.sale-line{margin:0 0 2px;font:400 13px/1.35 var(--sans);color:var(--sec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.salescard-body>.sale-line{margin:0;font-size:15px;line-height:1.4}
@media (max-width:640px){.salescard-body>.sale-line{font-size:14px}.thin-tiles-wide.sl-on{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

export const SALE_LABEL_JS = `(function(){var map={},of=window.fetch,busy=false;
function take(o,d){if(!o||typeof o!=="object"||d>6)return;if(Array.isArray(o)){for(var i=0;i<o.length;i++)take(o[i],d+1);return}
 if(o.id!=null&&typeof o.saleLine==="string"&&o.saleLine.trim())map[String(o.id)]=o.saleLine.trim();for(var k in o)if(o[k]&&typeof o[k]==="object")take(o[k],d+1)}
function isAnswer(o){return !!o&&typeof o==="object"&&(o.resolvedCar!==undefined||o.cluster!==undefined||o.poolN!==undefined)}
function paint(){if(busy)return;busy=true;try{var els=document.querySelectorAll(".thin-tile[data-gas-listing-id],.salescard[data-gas-listing-id]");
 for(var i=0;i<els.length;i++){var el=els[i],id=el.getAttribute("data-gas-listing-id"),line=map[id],old=el.querySelector(".sale-line");
  if(!line){if(old)old.remove();continue}
  if(old){if(old.textContent!==line)old.textContent=line;continue}
  var at=el.querySelector(".thin-tile-price,.salescard-price");if(!at)continue;var p=document.createElement("p");p.className="sale-line";p.textContent=line;p.title=line;at.parentNode.insertBefore(p,at)}var gs=document.querySelectorAll(".thin-tiles-wide");for(var g=0;g<gs.length;g++)gs[g].classList.toggle("sl-on",!!gs[g].querySelector(".sale-line"))}catch(e){}busy=false}
if(of){window.fetch=function(){var p=of.apply(this,arguments);try{p.then(function(r){try{if(/json/.test(String(r.headers.get("content-type")||"")))r.clone().json().then(function(j){if(isAnswer(j)||(j&&isAnswer(j.answer)))map={};take(j,0);paint()},function(){})}catch(e){}},function(){})}catch(e){}return p}}
function watch(){try{new MutationObserver(function(){paint()}).observe(document.body||document.documentElement,{childList:true,subtree:true})}catch(e){}}
if(document.body)watch();else document.addEventListener("DOMContentLoaded",watch)})();`;

// html in, html out. Crew only unless SALE_LABEL_PUBLIC (a visitor's page is the same bytes), on the Market Check page only; added at the top of the body so the fetch hook is in place before the page's own script asks for the answer.
export function saleLabelFinish(html, req, tool) {
  const s = String(html);
  if (tool !== "mc" || (!SALE_LABEL_PUBLIC && isCrewRequest(req) !== true) || s.indexOf('id="sl-mod"') >= 0 || !/<body[^>]*>/.test(s)) return s;
  return s.replace(/<body[^>]*>/, m => m + `<style id="sl-css">${SALE_LABEL_CSS}</style><script id="sl-mod">${SALE_LABEL_JS}</script>`);
}
