// Browser side of the analytics layer (Oct 2026, Lane C; docs/analytics-events.md).
//   GET  /api/track?js=1       the browser helper (window.gasTrack), built from lib/track/catalog.js so the
//                              browser and the server share one list of events and fields. Cacheable.
//   GET  /api/track?consent=1  this visitor's consent state; makes gas_aid and gas_sid when allowed, deletes
//                              them when declined. private, no-store.
//   POST /api/track            {events:[...], page:{ref, utm}} up to 20 events; journey events are dropped for
//                              a declined visitor before anything is stored. Always answers 204 quickly.
import { EVENTS, PRODUCTS, SURFACES, SCHEMA_VERSION } from "../lib/track/catalog.js";
import { identity } from "../lib/track/consent.js";
import { trackFromBrowser } from "../lib/track/log.js";
import { UTM_FIELDS } from "../lib/track/privacy.js";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

// Only browser-fired events go to the browser, with their field types.
function browserCatalog() {
  const out = {};
  for (const [name, d] of Object.entries(EVENTS)) if (d.by.includes("browser")) out[name] = { req: d.req, opt: d.opt };
  return out;
}

export function helperJs() {
  return `/* GoAskSam analytics helper, schema ${SCHEMA_VERSION}. Built from lib/track/catalog.js; see docs/analytics-events.md. */
(function(){
if(window.gasTrack)return;
var CAT=${JSON.stringify(browserCatalog())},PRODUCTS=${JSON.stringify(PRODUCTS)},SURFACES=${JSON.stringify(SURFACES)},UTM=${JSON.stringify(UTM_FIELDS)};
var q=[],state="unknown",timer=null,strict=!!window.GAS_TRACK_STRICT;
function where(){var p=location.pathname,d=document.documentElement.dataset||{};
 var product=d.gasProduct||(/^\\/buy/.test(p)?"buy":/^\\/(market-check|onebox|o\\/)/.test(p)?"market_check":/^\\/sell/.test(p)?"sell":/^\\/tasks/.test(p)?"tasks":"site");
 var surface=d.gasSurface||(p==="/"?"home":/^\\/buy/.test(p)?"buy_page":/^\\/(market-check|onebox|o\\/)/.test(p)?"market_check_page":/^\\/cars\\//.test(p)?"spec_page":/^\\/sell/.test(p)?"sell_page":/^\\/tasks/.test(p)?"tasks_page":/^\\/(history|vin)/.test(p)?"history_page":"static_page");
 return {product:product,surface:surface};}
function bad(m){if(strict)throw new Error("gasTrack: "+m);return false;}
function check(name,props){var d=CAT[name];if(!d)return bad("unknown event "+name);props=props||{};
 for(var k in props){if(!(k in d.req)&&!(k in d.opt))return bad(name+": unknown field "+k);}
 for(var r in d.req){if(props[r]===undefined||props[r]===null||props[r]==="")return bad(name+": missing "+r);}
 return true;}
function uuid(){try{return crypto.randomUUID();}catch(e){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);});}}
function page(){var u={},s=new URLSearchParams(location.search);UTM.forEach(function(k){var v=s.get(k);if(v)u[k]=v.slice(0,60);});return {ref:document.referrer||"",utm:u};}
function send(beacon){if(state!=="ok"||!q.length)return;var batch=q.splice(0,20),body=JSON.stringify({events:batch,page:page()});
 try{if(beacon&&navigator.sendBeacon){navigator.sendBeacon("/api/track",new Blob([body],{type:"application/json"}));}
 else fetch("/api/track",{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:true,credentials:"same-origin"}).catch(function(){});}catch(e){}
 if(q.length)schedule();}
function schedule(){if(timer)return;timer=setTimeout(function(){timer=null;send(false);},400);}
function gasTrack(name,props,opts){try{if(!check(name,props))return;var w=where();opts=opts||{};
 var p=opts.product||w.product,s=opts.surface||w.surface;if(PRODUCTS.indexOf(p)<0||SURFACES.indexOf(s)<0)return bad("bad product or surface");
 if(state==="declined")return;if(q.length>=50)return;
 q.push({event_id:uuid(),ts:new Date().toISOString(),name:name,product:p,surface:s,props:props||{}});if(state==="ok")schedule();}catch(e){if(strict)throw e;}}
function consent(){return fetch("/api/track?consent=1",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(j){
 state=j&&j.consent==="declined"?"declined":(j?"ok":"off");if(state==="declined")q.length=0;else send(false);}).catch(function(){state="off";});}
gasTrack.consentChanged=consent;
gasTrack.events=Object.keys(CAT);
window.gasTrack=gasTrack;
addEventListener("pagehide",function(){send(true);});
var d=document.documentElement.dataset||{};
if(!d.gasNoPageview)gasTrack("page_view",{path:location.pathname});
consent();
})();`;
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (req.method === "GET" && q.js) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(helperJs());
  }
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET" && q.consent) {
    const id = identity(req, res, { mint: true });
    return res.status(200).json({ consent: id.consent, region_class: id.region_class });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const host = String(req.headers.host || "").toLowerCase();
  if (host && host !== "goasksam.com" && !host.endsWith(".vercel.app") && !host.startsWith("localhost")) return res.status(204).end();
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  try {
    const page = body && body.page && typeof body.page === "object" ? { ref: String(body.page.ref || "").slice(0, 400), utm: body.page.utm && typeof body.page.utm === "object" ? body.page.utm : null } : null;
    trackFromBrowser(req, res, body && body.events, page);
  } catch {}
  return res.status(204).end();
}
