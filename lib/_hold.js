// THE HOLDING PAGE (Sam, Oct 25 2026): while CURTAIN_SEALED=1 the product pages answer a visitor who is not crew, a tester or a server job with ONE holding
// page: a headline and, with NO opening time set (LAUNCH_AT empty, the state until Sam knows it), the line "GoAskSam is opening soon" with no date, no time and no
// countdown. When Sam sets LAUNCH_AT (lib/launchTime.js is the one setting) the page prints the date and time in Pacific time with a live countdown. It is never a
// redirect, a 404 or a "noindex": it answers 503 with Retry-After, which is how a search engine is told "closed for now, come back, keep what you have". At a SET
// time's zero the page does NOT open the site (opening is a switch and a redeploy); it keeps the same headline and look, drops the timer and says "Opening now"
// (never shown while no time is set). In every state, from the moment it loads, it also asks the home page every 15 to 25 seconds, quietly, and goes there as soon
// as the home page stops answering 503 (the seal is lifted), so a reader who left it open sees the open site without reloading. Every page handler calls heldFor(req, res) first.
// Not held, on purpose: the data and sign-in endpoints (they have their own seal: sellerDecision and vehicleIdentity refuse non-crew), robots.txt and the
// sitemaps, static assets, the crew link (/api/crew), and the plain informational pages named in HELD_NOTE below. Nothing here computes a market fact.
import { launchAtMs, launchWords } from "./launchTime.js";
import { isCrewRequest } from "./_crew.js";
import { isTesterRequest } from "./_tester.js";
import { hasServerCredential } from "./_credential.js";
import { FONT_LINKS } from "../api/_chrome.js";

export const HELD_NOTE = "Held: Home, Find, Market Check, Sell, Tasks, For business, the spec, history and shared-result pages. Open: How Sam decides, About, Privacy, PowerSellers, robots.txt, the sitemaps.";
export const HEADLINE = "Something big is coming";
export const OPENING_NOW = "Opening now";
export const OPENING_SOON = "GoAskSam is opening soon";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function siteHeld() { return process.env.CURTAIN_SEALED === "1"; }
export function launchMs() { return launchAtMs(); }
export { launchWords };

export function holdingHtml(nowMs = Date.now(), at = launchMs()) {
  const left = at - nowMs, open = left > 0, unset = !at;
  const words = launchWords(at);
  const part = (id, label) => `<div class="u"><b id="${id}">00</b><span>${label}</span></div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>GoAskSam</title><meta name="description" content="${unset ? esc(OPENING_SOON) : "GoAskSam opens " + esc(words)}.">
${FONT_LINKS}
<style>
:root{--bg:#F6F3EC;--ink:#15201A;--sec:#5E6B63;--green:#1E4D38;--card:#FFFFFF;--line:#D8D4CB;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme: dark){:root{--bg:#121512;--ink:#F3F1EA;--sec:#B9C2BC;--green:#8FD0A8;--card:#1D221F;--line:#3A423D}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font:400 17px/1.5 var(--sans);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:640px;text-align:center}
.wm{font:600 26px/1.1 var(--serif);letter-spacing:-.01em;margin:0 0 36px}
h1{margin:0 0 14px;font:500 clamp(34px,6.4vw,54px)/1.1 var(--serif);letter-spacing:-.01em}
.when{margin:0 0 30px;color:var(--sec);font-size:18px}
.clock{display:flex;justify-content:center;gap:12px;flex-wrap:nowrap}
.u{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 8px 12px;min-width:0;flex:1 1 0;max-width:132px}
.u b{display:block;font:600 clamp(30px,8vw,46px)/1 var(--serif);color:var(--green);font-variant-numeric:tabular-nums}
.u span{display:block;margin-top:8px;font:600 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
@media (max-width:420px){.clock{gap:8px}.u{padding:14px 4px 10px}.u span{font-size:10px;letter-spacing:.08em}}
.foot{margin-top:40px;color:var(--sec);font-size:13px}.foot a{color:inherit}
</style></head><body><main>
<p class="wm">GoAskSam</p>
<h1>${esc(HEADLINE)}</h1>
${unset ? `<p class="when" id="when">${esc(OPENING_SOON)}</p>` : open ? `<p class="when" id="when">Opening ${esc(words)}</p>
<div class="clock" id="clock" role="timer" aria-live="off" data-at="${at}" data-now="${esc(OPENING_NOW)}">${part("d", "Days")}${part("h", "Hours")}${part("m", "Minutes")}${part("s", "Seconds")}</div>` : `<p class="when" id="when">${esc(OPENING_NOW)}</p>`}
<p class="foot">goasksam.com &middot; <a href="/api/crew">Crew</a></p>
</main>
<script>
(function(){var c=document.getElementById("clock"),w=document.getElementById("when");
function two(n){return (n<10?"0":"")+n}
function now(){var n=c&&c.getAttribute("data-now");if(c&&c.parentNode)c.parentNode.removeChild(c);c=null;if(w&&n)w.textContent=n}
function tick(){if(!c)return false;var at=Number(c.getAttribute("data-at")),left=at-Date.now();if(left<=0){now();return false}
var s=Math.floor(left/1000);document.getElementById("d").textContent=String(Math.floor(s/86400));document.getElementById("h").textContent=two(Math.floor(s%86400/3600));
document.getElementById("m").textContent=two(Math.floor(s%3600/60));document.getElementById("s").textContent=two(s%60);return true}
if(tick()){var t=setInterval(function(){if(!tick())clearInterval(t)},1000)}
var busy=false;
function look(){if(busy)return;busy=true;fetch("/",{cache:"no-store",redirect:"manual",credentials:"same-origin"}).then(function(r){busy=false;if(r.type==="opaqueredirect"||(r.status>=200&&r.status<400))location.replace("/")}).catch(function(){busy=false})}
function later(){setTimeout(function(){if(!document.hidden)look();later()},15000+Math.floor(Math.random()*10000))}
document.addEventListener("visibilitychange",function(){if(!document.hidden)look()});later()})();
</script></body></html>`;
}

// Call first in every held page handler. Returns true when it has answered (the caller returns at once).
export function heldFor(req, res) {
  // The sitemaps are served by the spec and history handlers (?sitemap=...): a search engine must always be able to read them, held or not.
  if (req && req.query && typeof req.query.sitemap !== "undefined") return false;
  const preview = !!(req && req.headers && req.headers["x-hold-preview"] === "1" && hasServerCredential(req));   // a keyed look at the page before the switch is set
  if (!preview) {
    if (!siteHeld()) return false;
    if (hasServerCredential(req) || isCrewRequest(req) || isTesterRequest(req)) return false;
  }
  const at = launchMs(), left = at ? Math.max(60, Math.min(7 * 86400, Math.round((at - Date.now()) / 1000))) : 3600;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", String(left));
  res.status(503).send(holdingHtml());
  return true;
}

// THE CALM ANSWER FOR A PAGE THAT COULD NOT BE BUILT (Lane S review, Oct 27 2026): when a page handler throws (a database failure, a vendor outage) the visitor gets the same
// calm page as the holding page's look, 503 with Retry-After, one plain sentence, and no error text; the detail goes to the server log only. withCalm wraps a handler so a throw
// (sync or async) becomes this answer instead of the platform's generic 500 page.
export const CALM_PAGE_TEXT = "Sam could not load this page just now. Please try again in a moment.";
export function calmHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<title>GoAskSam</title>
${FONT_LINKS}
<style>
:root{--bg:#F6F3EC;--ink:#15201A;--sec:#5E6B63;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme: dark){:root{--bg:#121512;--ink:#F3F1EA;--sec:#B9C2BC}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font:400 17px/1.5 var(--sans);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:640px;text-align:center}
.wm{font:600 26px/1.1 var(--serif);letter-spacing:-.01em;margin:0 0 36px}
h1{margin:0 0 14px;font:500 clamp(30px,5.6vw,46px)/1.1 var(--serif);letter-spacing:-.01em}
p{margin:0;color:var(--sec);font-size:18px}
</style></head><body><main>
<p class="wm">GoAskSam</p>
<h1>One moment</h1>
<p>${esc(CALM_PAGE_TEXT)}</p>
</main></body></html>`;
}
export function calmAnswer(res, retryAfterSeconds = 30) {
  try {
    if (res.headersSent) return;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(503).send(calmHtml());
  } catch {}
}
export function withCalm(handler, where = "page") {
  return async function calmHandler(req, res) {
    try { return await handler(req, res); }
    catch (err) { try { console.error("calm " + where + ":", (err && err.stack) || (err && err.message) || err); } catch {} calmAnswer(res); }
  };
}
