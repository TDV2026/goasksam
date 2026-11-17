// THE CAR BAR (Lane S, Nov 2026). One component under the header on Find results, Market Check results, Sell results, the Tasks composer and the VIN page, CREW COOKIE ONLY (a visitor's page is byte for byte what it was).
// Left: the resolved car in one line (the answer's own car.line) and Change. Right: Find, Market Check, Sell and Tasks as plain links to that tool with ?car=<the answer's car.token>; the current tool is filled, the others outlined.
// The page encodes nothing and resolves nothing: the token is printed as the engine sent it and a target tool decodes it on the server (lib/carToken.js, the stub until Lane B's contract posts). No car, no bar.
// The car is kept for the session (sessionStorage) so Home and the rail show "Back to your {car}" while a car is live; Change clears it. Words: the tool names as the rail has them, "Change" and "Back to your".
import { isCrewRequest } from "./_crew.js";
import { copyText } from "./copy.js";
import { decodeCarToken, stubTokenFor, resolveCarUrl, carTokenOf, changeTokenOf } from "./carToken.js";

export const CAR_TOOLS = [["find", "/find", "rail.NAV_FIND"], ["mc", "/market-check", "rail.NAV_MARKET_CHECK"], ["sell", "/sell", "rail.NAV_SELL"], ["tasks", "/tasks", "rail.NAV_TASKS"]];
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
var C=window.GAS_CAR_BAR||{},KEY="gas_car_bar",slot=document.getElementById("gas-carbar");if(!slot)return;
function load(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(e){return null}}
function save(c){try{if(c)sessionStorage.setItem(KEY,JSON.stringify(c));else sessionStorage.removeItem(KEY)}catch(e){}}
function href(path,token){return (C.base||"")+path+"?car="+encodeURIComponent(token)}
function toolPath(k){var t=(C.tools||[]).filter(function(x){return x.key===k})[0];return t?t.path:"/find"}
var car=C.car||null;if(car&&car.token)save({token:car.token,line:car.line,short:car.short,tool:C.tool});
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function pageRail(){return document.getElementById("gas-rail")||document.querySelector("aside.rail")}
function backLink(s,cls){var a=el("a",cls,"Back to your "+(s.short||"car"));a.href=href(toolPath(s.tool==="vin"||s.tool==="home"?"find":s.tool),s.token);return a}
function size(){try{window.dispatchEvent(new Event("resize"))}catch(e){}}
function draw(){
 slot.textContent="";var saved=load();
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
function scan(o,d){if(!o||typeof o!=="object"||d>4)return null;if(o.car&&typeof o.car==="object"&&typeof o.car.token==="string"&&o.car.token)return o.car;for(var k in o){var r=scan(o[k],d+1);if(r)return r}return null}
function take(c){if(!c||!c.token||(car&&car.token===c.token&&car.line===c.line))return;car={token:c.token,line:c.line||c.title||"",short:c.short||""};save({token:car.token,line:car.line,short:car.short,tool:C.tool});draw()}
if(window.fetch){var of=window.fetch;window.fetch=function(){var p=of.apply(this,arguments);try{p.then(function(r){try{var ct=String(r.headers.get("content-type")||"");if(/json/.test(ct))r.clone().json().then(function(j){take(scan(j,0))},function(){});else if(/event-stream/.test(ct))r.clone().text().then(function(t){t.split("\n").forEach(function(x){if(x.indexOf("data:")===0){try{take(scan(JSON.parse(x.slice(5)),0))}catch(e){}}})},function(){})}catch(e){}},function(){})}catch(e){}return p}}
window.gasCarBar={set:take};
draw();
// a target tool opened from a pill or Change: the words of the car go into the tool's own input, the focus on the field to finish (Tasks: the job field)
function fillInto(text,sel,focus){var tries=0,t=setInterval(function(){var i=document.querySelector(sel);tries++;if(i){clearInterval(t);if(!i.value||i.getAttribute("data-carfill")){i.value=text+(focus?" ":"");i.setAttribute("data-carfill","1");try{i.dispatchEvent(new Event("input",{bubbles:true}))}catch(e){}}if(focus){i.focus();try{i.setSelectionRange(i.value.length,i.value.length)}catch(e){}}}else if(tries>80)clearInterval(t)},100)}
if(C.fill&&C.fill.text)fillInto(C.fill.text,C.tool==="tasks"?"#tkq":"#pq,#q,#ob-input,input[name=q],textarea[name=q]",true);
else if(C.tool==="tasks"&&C.car&&C.car.text)fillInto(C.car.text,"#tkq",true);
})();`;
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const jsonIn = o => JSON.stringify(o).replace(/</g, "\\u003c");
// html in, html out. Not crew: the page unchanged. Crew: the slot after the header, the style, the config and the script. tool is "find" | "mc" | "sell" | "tasks" | "vin" | "home"; car is { token, line, short, text } from the engine (or the stub decode) or null.
export function carBarApply(html, req, { tool, car = null, fill = null, base = "" } = {}) {
  const s = String(html);
  if (!tool || isCrewRequest(req) !== true || s.indexOf("</header>") < 0 || s.indexOf('id="gas-carbar"') >= 0) return s;
  const cfg = { tool, base, car: car ? { token: car.token, line: car.line, short: car.short, text: car.text } : null, fill: fill ? { text: fill.text } : null, tools: CAR_TOOLS.map(([key, path, c]) => ({ key, path, label: copyText(c) })) };
  return s.replace("</header>", () => '</header><div class="gcb" id="gas-carbar" hidden></div>').replace("</head>", () => `<style>${CAR_BAR_CSS}</style></head>`).replace("</body>", () => `<script>window.GAS_CAR_BAR=${jsonIn(cfg)};</script><script>${CAR_BAR_JS}</script></body>`);
}
// the tool a page key is (the crew preview page names and the door's route keys); a page that is none of the five (and Home, which only shows the Back link) has no bar
export const TOOL_OF = { "preview-find": "find", find: "find", "find-results": "find", "preview-market-check": "mc", "market-check": "mc", "preview-sell": "sell", sell: "sell", "preview-tasks": "tasks", "preview-tasks-mine": "tasks", tasks: "tasks", "tasks-mine": "tasks", "preview-history": "vin", history: "vin", "preview-home": "home", home: "home" };
// BEFORE the page is built: a crew request whose address carries a car token (?car=c1....) or a change token (?change=) is rewritten so the tool's own entry gets the car's words (Find and Market Check q, Sell car) and opens already run; the decoded car is kept for the bar.
export function prepareCarRequest(req, tool, pathOverride = null) {
  if (!req || !tool || isCrewRequest(req) !== true) return req;
  const r = resolveCarUrl(req.url, tool === "vin" ? "" : tool); if (!r.car && !r.fill && !r.redirect) return req;
  if (r.redirect) { const u = new URL(r.redirect, "https://x"); u.searchParams.delete("page"); req.__redirect = (pathOverride || u.pathname) + u.search; return req; }
  const orig = req.url; req.url = r.url; req.__car = r.car; req.__fill = r.fill;
  try { const u = new URL(r.url, "https://x"), q = { ...(req.query || {}) }; delete q.car; delete q.change; delete q.ct; for (const [k, v] of u.searchParams) if (k === "q" || k === "car") q[k] = v; req.query = q; } catch { req.url = orig; }
  return req;
}
// the redirect a crew request for ?car=<token> gets: the tool's own address (the page's client runs its search from it); the preview prefix is kept
export function carRedirect(req, res) {
  if (!req || !req.__redirect) return false;
  res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Location", req.__redirect); res.status(302).send("");
  return true;
}
const baseOf = req => req && req.__base != null ? req.__base : (/^\/preview(\/|$|\?)/.test(String((req && req.url) || "")) ? "/preview" : "");
// AFTER the page is built: the bar for a crew request (nothing for anyone else)
export function carBarFinish(html, req, tool) { return carBarApply(html, req, { tool, car: (req && req.__car) || null, fill: (req && req.__fill) || null, base: baseOf(req) }); }
// the VIN page's car: the live page carries the vehicle in its JSON-LD (name, VIN, odometer, model year). The token is the STUB's (lib/carToken.js) until the engine answer carries car.token.
export function vinCarOf(liveHtml) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g; let x;
  while ((x = m.exec(String(liveHtml)))) { try { const j = JSON.parse(x[1]); const v = Array.isArray(j) ? j.find(o => o && o["@type"] === "Vehicle") : (j && j["@type"] === "Vehicle" ? j : null); if (v && v.vehicleIdentificationNumber) { const name = String(v.name || ""), yr = v.vehicleModelDate || (/^(\d{4})\b/.exec(name) || [])[1], rest = name.replace(/^\d{4}\s+/, ""), mk = (v.brand && v.brand.name) || "", mod = rest.startsWith(mk) ? rest.slice(mk.length).trim() : rest; return decodeCarToken(stubTokenFor({ year: yr, make: mk, model: mod, miles: v.mileageFromOdometer && v.mileageFromOdometer.value, vin: v.vehicleIdentificationNumber })); } } catch {} }
  return null;
}
export { resolveCarUrl, carTokenOf, changeTokenOf, decodeCarToken };
