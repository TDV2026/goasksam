// THE CAR BAR (Lane S, Nov 2026; joined to Lane B's real token, Nov 17 2026). One component under the header on Find results, Market Check results, Sell results, the Tasks composer and the VIN page, CREW COOKIE ONLY (a visitor's page is byte for byte what it was).
// Left: the resolved car in one line and Change. Right: Find, Market Check, Sell and Tasks as plain links to that tool with ?car=<the engine's car.token>; the current tool is filled, the others outlined. No car, no bar.
// THE TOKEN IS LANE B'S (lib/carToken.js, "v1." + base64url(deflateRaw) + "." + checksum; decodeCar returns null for anything cut or edited). A page encodes nothing and resolves nothing:
//   - a page opened with ?car=<v1 token> hands that token to its API calls (?car= on /api/buySearch, /api/sellerDecision, /api/sellChat, /api/tasks) until an engine answer carries a car.token of its own, so the tool runs on the decoded car with no second resolve;
//   - every engine answer carries car.token (raw.car.token, car.token): the bar takes it from the answer, so it also appears after an ordinary typed search, and a mileage, transmission or VIN changed in a tool comes back as a new token and the pills carry it;
//   - a token that does not decode (cut, edited, plain words) is never a car: the tool opens as it does today (Sell's ?car= plain words keep working exactly as before; only a v1. token is told apart from them).
// The car is kept for the session (sessionStorage) so Home and the rail show "Back to your {car}" while it is live; Change clears it. Words: the tool names as the rail has them, "Change" and "Back to your".
import { isCrewRequest } from "./_crew.js";
import { variantRowsFinish } from "./variantRowsPage.js";
import { modelChoiceFinish } from "./modelChoicePage.js";
import { saleLabelFinish } from "./saleLabelPage.js";
import { copyText } from "./copy.js";
import { decodeCar, encodeCar, carWords, TOKEN_VERSION, partialCarOk } from "./carToken.js";

// THE ONE SWITCH (Lane C, Nov 17 2026, Sam's word: the car bar is public). true: every visitor gets the bar, the ?car= token and the pills (Find, Market Check, Sell, Tasks); false: crew only, as it was. The variant rows are NOT behind this
// switch: lib/variantRowsPage.js gates them on isCrewRequest itself, so a visitor gets the bar and no rows. carBarCheck, hiddenCrewCheck and variantRowsPageCheck assert both states.
export const CAR_BAR_PUBLIC = true;
export { PARTIAL_CAR_PUBLIC } from "./carToken.js";   // the partial car (a make with no model) stays crew only: the switch lives with the token code the engine reads, and is named here beside the bar's
const barFor = req => CAR_BAR_PUBLIC || isCrewRequest(req) === true;
export const CAR_TOOLS = [["find", "/find", "rail.NAV_FIND"], ["mc", "/market-check", "rail.NAV_MARKET_CHECK"], ["sell", "/sell", "rail.NAV_SELL"], ["tasks", "/tasks", "rail.NAV_TASKS"]];
// a v1 token is told apart from Sell's plain words by its prefix
export const isCarToken = v => typeof v === "string" && v.startsWith(TOKEN_VERSION + ".");
const nf = n => Number(n).toLocaleString("en-US");
// the car's words are Lane B's one function (lib/carToken.js carWords, beside encodeCar); this file builds none. carInfo is the server side of a page opened with ?car=: the words of the token it opened with, for the bar before any answer exists.
// PARTIAL CAR (Lane S, Nov 17 2026): a car that names a make and no model is opened ONLY for the crew (partialOk); everyone else reads it as a token that does not decode, exactly as before.
export function carInfo(token, partialOk = false) { let car = isCarToken(token) ? decodeCar(token) : null; const partial = !!car && !car.model; if (partial && !partialOk) car = null;   /* Lane D's decodeCar reads a car with no model for everyone; only the crew may open one (Sam: crew only) */ if (!car) return null; const w = carWords(car); if (!w) return null; return { token, line: w.line, short: w.short, label: w.label, partial }; }
const crewOnly = req => partialCarOk(req);   // whether a partial car (a make, no model) may be opened: the crew's, or everyone's when PARTIAL_CAR_PUBLIC is on (the name is the old one)
export const CAR_BAR_CSS = `.gcb{background:var(--tint,#E8EFEA);border-bottom:1px solid var(--line,#DDD8CB);color:var(--ink,#15201A);font:14px/20px var(--sans,system-ui,sans-serif)}
.gcb[hidden]{display:none}.gcb-in{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;padding:8px 28px;box-sizing:border-box;max-width:100%}
.gcb-l{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 280px}.gcb-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.gcb-change{flex:0 0 auto;color:var(--forest,#0B3126);text-decoration:underline;text-underline-offset:2px}
.gcb-pills{display:flex;gap:8px;flex-wrap:wrap;flex:0 1 auto}.gcb-pill{display:inline-flex;align-items:center;height:30px;padding:0 14px;border-radius:15px;border:1px solid var(--forest,#0B3126);color:var(--forest,#0B3126);background:transparent;text-decoration:none;font-weight:500}
.gcb-pill.on{background:var(--forest,#0B3126);color:#fff}.gcb-pill:focus-visible,.gcb-change:focus-visible,.gcb-back:focus-visible{outline:2px solid var(--forest,#0B3126);outline-offset:2px}
.gcb-back{display:block;padding:8px 28px;color:var(--forest,#0B3126);text-decoration:underline;text-underline-offset:2px;font:14px/20px var(--sans,system-ui,sans-serif)}
.gcb-railback{display:block;margin:8px 0;padding:6px 12px;color:var(--forest,#0B3126);text-decoration:underline;text-underline-offset:2px;font:14px/20px var(--sans,system-ui,sans-serif)}
@media (max-width:640px){.gcb-in{padding:8px 16px}.gcb-l{flex:1 1 100%}.gcb-back{padding:8px 16px}}`;
export const CAR_BAR_JS = String.raw`(function(){
var C=window.GAS_CAR_BAR||{},KEY="gas_car_bar",of=window.fetch,car=C.car||null,pending=C.boot&&C.boot.token||null;
function load(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(e){return null}}
function save(c){try{if(c)sessionStorage.setItem(KEY,JSON.stringify(c));else sessionStorage.removeItem(KEY)}catch(e){}}
function href(path,token){return (C.base||"")+path+"?car="+encodeURIComponent(token)}
function toolPath(k){var t=(C.tools||[]).filter(function(x){return x.key===k})[0];return t?t.path:"/find"}
if(car&&car.token)save({token:car.token,line:car.line,short:car.short,tool:C.tool});
// the tool's own address carries the car's words before the page reads it (Find and Market Check q, Sell car); the token travels on the API calls
if(C.strip&&window.history&&history.replaceState){try{var u0=new URL(location.href);u0.searchParams.delete("car");u0.searchParams.delete("change");history.replaceState(null,"",u0.pathname+u0.search+u0.hash)}catch(e){}}
if(C.boot&&C.boot.label&&!C.boot.keep&&window.history&&history.replaceState){try{var u=new URL(location.href);if(C.tool!=="tasks")u.searchParams.delete("car");if(C.tool==="sell")u.searchParams.set("car",C.boot.label);else if(C.tool==="find"||C.tool==="mc")u.searchParams.set("q",C.boot.label);history.replaceState(null,"",u.pathname+u.search.replace(/\+/g,"%20")+u.hash)}catch(e){}}
var API=/\/(api\/(buySearch|sellerDecision|sellChat|tasks)|preview\/tasks\/api)(\?|$)/;
function scan(o,d){if(!o||typeof o!=="object"||d>4)return null;if(o.car&&typeof o.car==="object"&&typeof o.car.token==="string"&&o.car.token&&typeof o.car.line==="string"&&o.car.line)return o.car;for(var k in o){var r=scan(o[k],d+1);if(r)return r}return null}
function take(c){if(!c||!c.token||(car&&car.token===c.token))return;pending=null;car={token:c.token,line:c.line,short:c.short||""};save({token:car.token,line:car.line,short:car.short,tool:C.tool});if(C.tool==="sell"&&/[?&]car=/.test(location.search)&&history.replaceState){try{history.replaceState(history.state,"",location.pathname+location.search+location.hash)}catch(e){}}draw()}
// SELL'S STEP ADDRESS CARRIES THE TOKEN (cb=): Sell builds every step address itself from the car's words (car=), so a reload kept the words and lost the bar. Any address the page writes with a car= in it gets cb=<the token of the car in hand>; a reload reads it back (lib/carBar.js prepareCarRequest).
if(C.tool==="sell"&&window.history){["pushState","replaceState"].forEach(function(m){var o=history[m];if(typeof o!=="function")return;history[m]=function(st,t,url){try{if(url&&car&&car.token){var u1=new URL(url,location.href);if(u1.origin===location.origin&&u1.searchParams.get("car")){u1.searchParams.set("cb",car.token);url=u1.pathname+u1.search+u1.hash}}}catch(e){}return o.call(this,st,t,url)}})}
if(of){window.fetch=function(input,init){var a=arguments;try{if(pending&&typeof input==="string"&&API.test(input)&&input.indexOf("car=")<0){a=[input+(input.indexOf("?")<0?"?":"&")+"car="+encodeURIComponent(pending)].concat([].slice.call(arguments,1))}}catch(e){}
 var p=of.apply(this,a);try{p.then(function(r){try{var ct=String(r.headers.get("content-type")||"");if(/json/.test(ct))r.clone().json().then(function(j){take(scan(j,0))},function(){});else if(/event-stream/.test(ct))r.clone().text().then(function(t){t.split("\n").forEach(function(x){if(x.indexOf("data:")===0){try{take(scan(JSON.parse(x.slice(5)),0))}catch(e){}}})},function(){})}catch(e){}},function(){})}catch(e){}return p}}
window.gasCarBar={set:take};
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function pageRail(){return document.getElementById("gas-rail")||document.querySelector("aside.rail")}
function backLink(s,cls){var a=el("a",cls,"Back to your "+(s.short||"car"));a.href=href(toolPath(s.tool==="vin"||s.tool==="home"?"find":s.tool),s.token);return a}
// THE SIGN IN CARD KEEPS THE CAR: a page that sends a person to sign in (Tasks, Sell, Market Check, Find) opens auth.js openSignInCard, which returns them to the address they were on. With a car in hand that address carries it (the token; Sell's cb), unless the caller named its own destination, so the person is back on the same page, the same car, the bar and the box filled.
function dest(){try{if(!(car&&car.token))return null;var u=new URL(location.href);if(C.tool==="sell")u.searchParams.set("cb",car.token);else u.searchParams.set("car",car.token);return u.pathname+u.search+u.hash}catch(e){return null}}
function wrapSign(){var o=window.openSignInCard;if(typeof o!=="function"||o.__gcb)return;var w=function(s,opts){try{if(!(opts&&opts.dest)){var d=dest();if(d){opts=opts||{};opts.dest=d}}}catch(e){}return o.call(this,s,opts)};w.__gcb=1;window.openSignInCard=w}
function size(){try{window.dispatchEvent(new Event("resize"))}catch(e){}}
function draw(){
 var slot=document.getElementById("gas-carbar");if(!slot)return;slot.textContent="";var saved=load();
 if(car&&car.token&&car.line){
  slot.hidden=false;var inn=el("div","gcb-in"),l=el("div","gcb-l"),ln=el("span","gcb-line",car.line);ln.title=car.line;l.appendChild(ln);
  var ch=el("a","gcb-change","Change");ch.href=(C.base||"")+toolPath(C.tool==="vin"?"find":C.tool)+"?change="+encodeURIComponent(car.token);ch.addEventListener("click",function(){save(null)});l.appendChild(ch);inn.appendChild(l);
  var nav=el("nav","gcb-pills");(C.tools||[]).forEach(function(t){var a=el("a","gcb-pill"+(t.key===C.tool?" on":""),t.label);a.href=href(t.path,car.token);if(t.key===C.tool)a.setAttribute("aria-current","page");nav.appendChild(a)});inn.appendChild(nav);slot.appendChild(inn);
 }else if(saved&&saved.token&&C.tool==="home"){slot.hidden=false;slot.appendChild(backLink(saved,"gcb-back"))}
 else slot.hidden=true;
 var rail=pageRail(),old=document.getElementById("gcb-railback");if(old)old.remove();
 if(rail&&saved&&saved.token&&!(car&&car.token)){var b=backLink(saved,"gcb-railback");b.id="gcb-railback";rail.insertBefore(b,rail.firstChild)}
 size();
}
// a tool opened from Change or a Tasks link: the words of the car go into the tool's own input, the focus on the field to finish (Tasks: the job field)
function fillInto(text,sel,focus){var tries=0,t=setInterval(function(){var i=document.querySelector(sel);tries++;if(i){clearInterval(t);if(!i.value||i.getAttribute("data-carfill")){i.value=text+(focus?" ":"");i.setAttribute("data-carfill","1");try{i.dispatchEvent(new Event("input",{bubbles:true}))}catch(e){}}if(focus){i.focus();try{i.setSelectionRange(i.value.length,i.value.length)}catch(e){}}}else if(tries>80)clearInterval(t)},100)}
function ready(){wrapSign();draw();
 if(C.fill&&C.fill.text)fillInto(C.fill.text,C.tool==="tasks"?"#tkq,#pq":"#pq,#q,#ob-input,input[name=q],textarea[name=q]",true);
 else if(C.tool==="tasks"&&C.boot&&C.boot.label)fillInto(C.boot.label,"#tkq,#pq",true)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready);else ready();
})();`;
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jsonIn = o => JSON.stringify(o).replace(/</g, "\\u003c");
// html in, html out. Not crew: the page unchanged. Crew: the early script and its config at the top of the head (the page's own scripts come after it), the slot after the header and the style. tool is "find" | "mc" | "sell" | "tasks" | "vin" | "home";
// car is { token, line, short } (the engine's token and its words) or null; boot { token, label } is a token the page was opened with; fill { text } is a Change.
// TASKS (Lane S, Nov 17 2026): the public Tasks page sends a signed in person with Tasks on to the app (location.replace(MINE)) and carries a typed request through sign in (destFor): both dropped the car, so the app opened with no bar and no fill. For a crew request with a token the two addresses carry it (the page the pill opened is patched, the visitor's page is never touched).
export function carBarApply(html, req, { tool, car = null, boot = null, fill = null, strip = false, base = "" } = {}) {
  const s = String(html);
  if (!tool || !barFor(req) || s.indexOf("</header>") < 0 || s.indexOf('id="gas-carbar"') >= 0 || !/<head[^>]*>/.test(s)) return s;
  const cfg = { tool, base, car: car ? { token: car.token, line: car.line, short: car.short } : null, boot: boot ? (boot.keep ? { token: boot.token, label: boot.label, keep: true } : { token: boot.token, label: boot.label }) : null, fill: fill ? { text: fill.text } : null, strip: !!strip, tools: CAR_TOOLS.map(([key, path, c]) => ({ key, path, label: copyText(c) })) };
  const hopTok = tool === "tasks" ? ((car && car.token) || (boot && boot.token) || null) : null, ENC = hopTok ? encodeURIComponent(hopTok) : "";
  const page = hopTok ? s.replace('return MINE + "?start=1"', () => 'return MINE + "?start=1&car=' + ENC + '"').replace("location.replace(MINE);", () => 'location.replace(MINE + "?car=' + ENC + '");') : s;
  return page.replace(/<head[^>]*>/, m => m + `<script>window.GAS_CAR_BAR=${jsonIn(cfg)};</script><script>${CAR_BAR_JS}</script>`).replace("</header>", () => '</header><div class="gcb" id="gas-carbar" hidden></div>').replace("</head>", () => `<style>${CAR_BAR_CSS}</style></head>`);
}
// the tool a page key is (the crew preview page names and the door's route keys); Home only shows the Back link
export const TOOL_OF = { "preview-find": "find", find: "find", "find-results": "find", "preview-market-check": "mc", "market-check": "mc", "preview-sell": "sell", sell: "sell", "preview-tasks": "tasks", "preview-tasks-mine": "tasks", tasks: "tasks", "tasks-mine": "tasks", "preview-history": "vin", history: "vin", "preview-home": "home", home: "home" };
// BEFORE the page is built (crew only): a ?car=<v1 token> in the address is Lane B's token. Decoded, the tool's own search words go into the request the live page is built from (Find and Market Check q, Sell car) so the results page is built, and the token is kept for the page's API calls;
// a v1 token that does not decode is simply removed (the tool opens as it does today); plain words in ?car= (Sell's own) are never touched. ?change=<token> opens the tool's landing with the car's words in its input.
export function prepareCarRequest(req, tool) {
  if (!req || !tool || !barFor(req)) return req;
  let u; try { u = new URL(String(req.url || "/"), "https://x"); } catch { return req; }
  const v = u.searchParams.get("car"), ch = u.searchParams.get("change"); let touched = false;
  if (isCarToken(v)) {
    const info = tool === "vin" ? null : carInfo(v, crewOnly(req)); touched = true; u.searchParams.delete("car"); if (!info) req.__strip = true;
    if (info) { req.__car = { token: info.token, line: info.line, short: info.short }; req.__boot = { token: info.token, label: info.label }; if (tool === "sell") u.searchParams.set("car", info.label); else if (tool === "find" || tool === "mc") u.searchParams.set("q", info.label); }
  }
  // SELL'S RELOAD (Lane S, Nov 17 2026): the step address carries the car's words (car=) and, beside them, the token (cb=); a reload reads the token back so the bar is there before any answer. A cb that does not decode is just dropped; a car= that is itself a token wins.
  if (tool === "sell" && u.searchParams.has("cb")) { const cb = u.searchParams.get("cb"); touched = true; u.searchParams.delete("cb"); const info = isCarToken(cb) ? carInfo(cb, crewOnly(req)) : null; if (info && !isCarToken(u.searchParams.get("car")) && !req.__car) { req.__car = { token: info.token, line: info.line, short: info.short }; req.__boot = { token: info.token, label: info.label, keep: true }; } }
  if (isCarToken(ch)) { const info = carInfo(ch, crewOnly(req)); touched = true; u.searchParams.delete("change"); if (info) req.__fill = { text: info.label }; else req.__strip = true; }
  if (!touched && tool === "tasks") { const nx = u.searchParams.get("next"); if (nx) { try { const t = new URL(nx, "https://x").searchParams.get("car"), info = isCarToken(t) ? carInfo(t, crewOnly(req)) : null; if (info) { req.__car = { token: info.token, line: info.line, short: info.short }; req.__boot = { token: info.token, label: info.label }; } } catch {} } }
  if (!touched) return req;
  req.url = u.pathname + (u.search || "");
  try { const q = { ...(req.query || {}) }; delete q.car; delete q.change; delete q.q; for (const [k, x] of u.searchParams) if (k === "q" || k === "car") q[k] = x; req.query = q; } catch {}
  return req;
}
const baseOf = req => req && req.__base != null ? req.__base : (/^\/preview(\/|$|\?)/.test(String((req && req.url) || "")) ? "/preview" : "");
// AFTER the page is built: the bar for a crew request (nothing for anyone else)
export function carBarFinish(html, req, tool) { return saleLabelFinish(modelChoiceFinish(variantRowsFinish(carBarApply(html, req, { tool, car: (req && req.__car) || null, boot: (req && req.__boot) || null, fill: (req && req.__fill) || null, strip: !!(req && req.__strip), base: baseOf(req) }), req, tool), req, tool), req, tool); }
// FIND'S DOOR (api/buy.js route key), crew only: a request whose only query is a car token is the new Find. ?car=<valid token> opens the results already run (find-results), ?change=<token> or a token that does not decode opens the landing (find);
// any other query, a visitor, or a plain ?q= is decided by the door as before. Without this the door read ?car= as an unknown parameter and served the rollback page: the empty "What car are you looking for?" with no bar (Lane S, Nov 17 2026).
export function carFindRoute(req, q) {
  if (!req || !q || !barFor(req)) return null;
  const car = q.get("car"), ch = q.get("change"); if (!isCarToken(car) && !isCarToken(ch)) return null;
  if (q.get("part") || q.get("q") || [...q.keys()].some(k => k !== "car" && k !== "change")) return null;
  return isCarToken(car) && carInfo(car, crewOnly(req)) ? "find-results" : "find";
}
// the VIN page's car: the live page carries the vehicle in its JSON-LD (name, VIN, odometer, model year); Lane B's encodeCar makes the token from those fields (server side; a car without a 17 character VIN, a make or a model has none)
export function vinCarOf(liveHtml) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g; let x;
  while ((x = m.exec(String(liveHtml)))) { try { const j = JSON.parse(x[1]); const v = Array.isArray(j) ? j.find(o => o && o["@type"] === "Vehicle") : (j && j["@type"] === "Vehicle" ? j : null); if (v && v.vehicleIdentificationNumber) { const mk = (v.brand && v.brand.name) || "", name = String(v.name || "").replace(/^\d{4}\s+/, ""), mod = name.startsWith(mk) ? name.slice(mk.length).trim() : name, car = { year: Number(v.vehicleModelDate) || null, make: mk, model: String(v.model || mod), vin: String(v.vehicleIdentificationNumber).toUpperCase() }; if (!car.year) delete car.year; const mi = v.mileageFromOdometer && Number(v.mileageFromOdometer.value); if (mi > 0) car.mileage = mi; const t = encodeCar(car); return t ? carInfo(t) : null; } } catch {} }
  return null;
}
