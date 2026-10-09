// lib/appShell.js (Round D, Oct 2026): ONE shared app shell for every public product page (Buy, Sell,
// Market Check, Tasks, the homepage) - the left rail, the main area and the mobile top bar. Before
// this, four pages carried four separate copies (onebox.html's #ob-rail, api/_chrome.js's .rail for
// Tasks/history/VIN/spec pages, api/buy.js's own redesigned .rail, index.html's .hp-rail-*), each with
// its own hex copies of the same two surface colours. This file is the single source for all of them.
//
// Surfaces (Sam, Round D): the rail is the pale sage surface - the SAME token the search/context boxes
// already use (onebox.html .mk/.widen pills, api/buy.js .mcdrawer: var(--tint)). The main area is the
// existing cream (var(--page)). The hairline between them is the existing var(--div). Defined once here
// as --rail-bg/--rail-line/--main-bg so no page keeps a per-page hex copy.
//
// Scope note: api/_chrome.js (Lane C) still serves History/VIN/Spec pages unchanged - out of this
// round's named list (Buy, Sell, Market Check, Tasks, homepage) - so its railHtml()/whyResultHtml()
// are left alone. Buy's own markup/CSS/JS are not edited here (Lane C's js files); the handoff for
// Buy to adopt this module is in docs/lane-notes.md.
import { AUTH_SIGNBAR_HTML } from "./authBar.js";
import { gaBootstrapHtml } from "./analytics.js";

// Tasks leads every rail (full and reduced, Oct 2026 "Keep looking" round): placed first in the
// main group, above "Where to sell", the same position in both lists below. Suppressed only on
// "sell" (see pagesForActive) - new Sell (api/sellNext.js) is the one caller that still passes
// active:"sell" through this file; live /sell (api/sellPage.js) never calls railOpenHtml at all,
// so it never sees this list in the first place and needs no special case of its own.
export const SHELL_PAGES = [
  { key: "tasks", href: "/tasks", label: "Tasks" },
  { key: "buy", href: "/buy", label: "Buy" },
  { key: "sell", href: "/sell", label: "Sell" },
  { key: "market-check", href: "/market-check", label: "Market Check" },
  { key: "business", href: "/business", label: "For business" }
];

// PUBLIC LAUNCH SWITCH (Oct 2026, Sam): until PUBLIC_LAUNCH=1, a visitor without the gas_crew=ok
// cookie sees a reduced rail/footer - Where to sell, PowerSellers, Your results (when the page
// passes it), Send feedback, Privacy, About - nothing that names or links to Buy, Market Check,
// Tasks, For business or How Sam decides. Crew always sees the full rail; everyone does once
// PUBLIC_LAUNCH=1. The pages themselves are NOT gated (reachable by direct address either way) -
// this hides the discovery surface only, per Sam's explicit instruction not to touch URLs/titles/
// canonicals/sitemap/noindex. Mirrored in styles.css for the homepage/Sell's own rail system.
export function isFullAccess(crew) { return !!crew || process.env.PUBLIC_LAUNCH === "1"; }
const REDUCED_PAGES = [
  { key: "tasks", href: "/tasks", label: "Tasks" },
  { key: "sell", href: "/sell", label: "Where to sell" },
  { key: "powersellers", href: "/powersellers", label: "PowerSellers" }
];
// Tasks is public on every shared-shell page except the Sell door (live /sell never reaches this
// file at all; new Sell passes active:"sell" and is the one case that must drop it - smallest
// possible check, see SHELL_PAGES's comment above).
function pagesForActive(list, active) { return active === "sell" ? list.filter(p => p.key !== "tasks") : list; }
const REDUCED_FOOT = '<a class="gas-navitem" href="mailto:feedback@goasksam.com?subject=GoAskSam%20feedback">Send feedback</a>' +
  '<a class="gas-navitem" href="/privacy">Privacy</a><a class="gas-navitem" href="/about">About</a>';

export const SHELL_TOKENS_CSS = `:root{--rail-bg:#EDF3EE;--rail-line:#D5E2D8;--main-bg:#F6F3EC;--shell-div:#E2DED3;--rail-text:#46524B;--rail-active-bg:#D7E6DA;--rail-hover-bg:#E3EFE6}`;

export const SHELL_CSS = SHELL_TOKENS_CSS + `
.gas-keepline{margin:6px 12px 10px;font-size:12.5px;line-height:1.45;color:var(--soft,#6B675E)}
.gas-keepline a{color:inherit;text-decoration:underline;text-underline-offset:2px}
#gas-scrim{display:none;position:fixed;inset:0;background:rgba(21,32,26,.36);z-index:45}
#gas-scrim.open{display:block}
#gas-rail{position:fixed;left:0;top:0;bottom:0;width:240px;background:var(--rail-bg);border-right:1px solid var(--shell-div);display:flex;flex-direction:column;padding:28px 24px 20px;z-index:50}
.gas-logo{text-decoration:none;display:block;margin:0 0 22px;font:600 26px/1.1 var(--serif);letter-spacing:-.01em;color:var(--ink)}
.gas-rail-nav{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow:auto}
.gas-navitem{display:flex;align-items:center;min-height:44px;text-decoration:none;color:var(--rail-text);font:400 15px/1.3 var(--sans);padding:0 14px;border-radius:10px;cursor:pointer}
.gas-navitem:hover,.gas-navitem:focus-visible{background:var(--rail-hover-bg);color:var(--ink)}
.gas-navitem.active{background:var(--rail-active-bg);color:var(--green);font-weight:600}
.gas-tbadge{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:9px;background:#1A1A1A;color:#fff;font:600 11px/1.3 var(--sans);vertical-align:1px}
.gas-rail-extra{display:flex;flex-direction:column;border-top:1px solid var(--rail-line);padding-top:10px;margin-top:10px}
.gas-rail-foot{display:flex;flex-direction:column;border-top:1px solid var(--rail-line);padding-top:10px;margin-top:12px}
.gas-rail-foot .gas-navitem{font-size:14px}
.gas-submenu{display:none;flex-direction:column;margin:0 0 4px 14px;border-left:1px solid var(--rail-line)}
.gas-submenu.open{display:flex}
.gas-submenu a{display:flex;align-items:center;min-height:40px;font:400 14px/1.3 var(--sans);color:var(--sec);text-decoration:none;padding:0 12px;cursor:pointer}
.gas-submenu a:hover{color:var(--ink)}
/* Shared Watching rail (Oct 2026) */
.gas-rail-head{font-weight:600;color:var(--rail-text);pointer-events:none;min-height:32px}
.gas-watch-row{display:flex;align-items:center;gap:6px;min-height:36px;padding:0 14px}
.gas-watch-t{flex:1;min-width:0;display:flex;flex-direction:column;font:400 14px/1.25 var(--sans);color:var(--rail-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gas-watch-e{font-size:12px;color:var(--sec);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gas-watch-x{flex:none;width:26px;height:26px;border:0;border-radius:50%;background:none;color:var(--sec);font-size:16px;line-height:1;cursor:pointer}
.gas-watch-x:hover{background:var(--rail-hover-bg);color:var(--ink)}
#gas-main{margin-left:240px;background:var(--main-bg);min-height:100vh}
.gas-mhead{display:none}
@media (max-width:860px){
  #gas-rail{width:260px;transform:translateX(-100%);transition:transform .22s ease;box-shadow:0 22px 56px rgba(21,32,26,.18)}
  #gas-rail.open{transform:none}
  #gas-main{margin-left:0}
  .gas-mhead{display:flex;align-items:center;gap:10px;padding:16px 16px 0 16px;background:var(--main-bg)}
  .gas-mhead .gas-brand{font:600 22px/1 var(--serif);color:var(--ink);text-decoration:none;margin-right:auto}
  .gas-mhead .gas-signbar-m{flex:none}
  .gas-mhead .gas-menu{width:44px;height:44px;flex:none;border:1px solid var(--border,#DCD8CC);border-radius:10px;background:var(--card,#fff);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;cursor:pointer}
  .gas-mhead .gas-menu span{width:18px;height:2px;background:var(--ink);display:block}
}
@media (prefers-reduced-motion:reduce){#gas-rail{transition:none}}
`;

// "Keep looking" card (Oct 2026): one shared component, every page that shows sales or live cars
// renders the SAME markup/CSS rather than its own copy. Exported on its own - not folded into
// SHELL_CSS - because the older chrome (api/_chrome.js, still serving History/VIN/Spec pages) has
// its own root token set (no --rail-* tokens, no gas-rail at all) and needs this CSS without the
// rest of the shared-shell styling. Every var() below carries a literal fallback for that reason;
// --div/--card/--ink/--sec are defined in both chrome systems already, --red only in Buy's - the
// fallback (#D7262C, Buy's own red) keeps the button correct wherever --red is not defined.
export const KEEPLOOK_CSS = `
.gas-keepl{display:flex;align-items:center;gap:18px;margin:28px 0 0;padding:18px 22px;border:1px solid var(--div,#E2DED3);border-radius:14px;background:var(--card,#fff)}
.gas-kl-ic{flex:none;width:56px;height:56px;border-radius:50%;background:#F3EFE6;display:grid;place-items:center}
.gas-kl-ic svg{width:26px;height:26px;fill:none;stroke:var(--ink,#15201A);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.gas-kl-t{flex:1;min-width:0}
.gas-keepl p.gas-kl-eye{margin:0;font:600 11.5px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--red,#D7262C)}
.gas-keepl h3{margin:6px 0 2px;font:500 24px/1.2 var(--serif);color:var(--ink,#15201A)}
.gas-keepl .gas-kl-t p{margin:0;font:400 15px/1.45 var(--sans);color:var(--sec,#5E6B61)}
.gas-kl-a{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.gas-kl-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 26px;border-radius:8px;background:var(--red,#D7262C);color:#fff;text-decoration:none;font:500 15px/1 var(--sans);border:0;cursor:pointer}
.gas-keepl .gas-kl-a p{margin:0;font:400 12.5px/1.4 var(--sans);color:var(--sec,#5E6B61)}
@media (max-width:700px){
  .gas-keepl{flex-direction:column;align-items:flex-start}
  .gas-kl-a{align-items:stretch;width:100%}
}
`;

// Copy by context (locked, product rule: ownership-neutral, no valuation/estimate/worth language).
// "spec" covers Market Check results AND every spec/hub/car page (identical copy, Sam's brief).
// "buy_live"/"buy_empty" are defined for parity with Buy's own existing card (api/buy.js keepHtml)
// but are not called from this file today - Buy keeps its own matching implementation (Lane C's
// file, not edited here); see docs/lane-notes.md for the handoff.
const KEEPLOOK_COPY = {
  spec: { heading: "Keep looking.", line: s => "Sam can keep watching for the next sale of " + s + " and tell you when it happens." },
  buy_live: { heading: "Keep looking.", line: s => "Sam can keep watching for another " + s + "." },
  buy_empty: { heading: "Nothing else right now.", line: s => "Sam can keep watching for another " + s + "." }
};
const KEEPLOOK_BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0"/></svg>';

// keepLookingHtml: the card itself, for server-rendered callers (api/history.js, api/specPage.js).
// subject fills the {car}/{search}/{spec} slot in the line - pass the resolved vehicle/spec's own
// label text, never typed/raw text (product rule 25's "own record" principle extended to this
// card). href is built by keepLookingHref below. Market Check (js/onebox.js) renders client-side
// and cannot import this Node module, so KEEPLOOK_JS below carries a byte-for-byte equivalent
// (gasKeepLookingHtml/gasKeepLookingHref) for that one caller - the markup/copy/href logic has one
// source of truth in this comment's intent even though it exists as two literal strings, one per
// runtime; keep them in sync if the copy or href shape ever changes.
export function keepLookingHtml({ context, subject, href }) {
  const copy = KEEPLOOK_COPY[context] || KEEPLOOK_COPY.spec;
  return '<section class="gas-keepl" aria-label="Keep looking">' +
    '<span class="gas-kl-ic" aria-hidden="true">' + KEEPLOOK_BELL + '</span>' +
    '<div class="gas-kl-t"><p class="gas-kl-eye">Keep looking</p><h3>' + esc(copy.heading) + '</h3><p>' + esc(copy.line(subject || "it")) + '</p></div>' +
    '<div class="gas-kl-a"><a class="gas-kl-btn" data-kl-btn data-kl-href="' + esc(href) + '" href="' + esc(href) + '" target="_blank" rel="noopener">Have Sam keep looking</a><p>You&#8217;ll be notified when another matching car goes live.</p></div>' +
    '</section>';
}
// keepLookingHref: /tasks/mine's existing seed contract (api/tasksPage.js seedWords/seedObj) - a VIN
// gets the same seed=vin&vin=&car= shape the VIN page's old crew-only link already used (now public,
// through this shared card instead); anything else is a plain words= ask in Sam's own voice, read
// back to the buyer as the task's first line once Tasks opens.
export function keepLookingHref({ subject, vin }) {
  if (vin) return "/tasks/mine?seed=vin&vin=" + encodeURIComponent(vin) + "&car=" + encodeURIComponent(subject || "");
  return "/tasks/mine?words=" + encodeURIComponent("Keep watching for the next sale of " + (subject || "this car") + ".");
}
// KEEPLOOK_JS: click-through behaviour, identical wherever the card renders. Signed in: the anchor's
// own target=_blank/href already does the job natively, no JS needed, the page never navigates.
// Signed out: the browser's default click is cancelled, the destination is stashed (sessionStorage,
// not a cookie - gone with the tab), and the EXISTING sign-in card opens in place (js/auth.js
// openSignInCard, the same modal every other sign-in path on the site already uses - no second
// dialog built for this). gasKlResume() runs on every page load carrying this script and finishes
// the job once a session exists: immediately if one already does (the Google-redirect return case,
// since that round trip reloads the page), or after a short poll (the email-code case, which
// resolves in place with no reload). A 6-minute stash TTL matches the "Put Sam on it" resume pattern
// already shipped for js/onebox.js's watch arm (lib/appShell.js's own prior round) rather than
// inventing a second timeout convention.
export const KEEPLOOK_JS = `function gasKeepLookingHtml(o){
  o=o||{};
  var copy={spec:{heading:"Keep looking.",line:function(s){return "Sam can keep watching for the next sale of "+s+" and tell you when it happens.";}},
    buy_live:{heading:"Keep looking.",line:function(s){return "Sam can keep watching for another "+s+".";}},
    buy_empty:{heading:"Nothing else right now.",line:function(s){return "Sam can keep watching for another "+s+".";}}}[o.context]||{heading:"Keep looking.",line:function(s){return "Sam can keep watching for the next sale of "+s+" and tell you when it happens.";}};
  var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});};
  var bell='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0"/></svg>';
  return '<section class="gas-keepl" aria-label="Keep looking"><span class="gas-kl-ic" aria-hidden="true">'+bell+'</span>'+
    '<div class="gas-kl-t"><p class="gas-kl-eye">Keep looking</p><h3>'+esc(copy.heading)+'</h3><p>'+esc(copy.line(o.subject||"it"))+'</p></div>'+
    '<div class="gas-kl-a"><a class="gas-kl-btn" data-kl-btn data-kl-href="'+esc(o.href)+'" href="'+esc(o.href)+'" target="_blank" rel="noopener">Have Sam keep looking</a><p>You\\u2019ll be notified when another matching car goes live.</p></div></section>';
}
function gasKeepLookingHref(o){
  o=o||{};
  if(o.vin)return "/tasks/mine?seed=vin&vin="+encodeURIComponent(o.vin)+"&car="+encodeURIComponent(o.subject||"");
  return "/tasks/mine?words="+encodeURIComponent("Keep watching for the next sale of "+(o.subject||"this car")+".");
}
function gasKlPending(){try{return JSON.parse(sessionStorage.getItem("gas_kl_pending")||"null");}catch(e){return null;}}
function gasKlStash(href){try{sessionStorage.setItem("gas_kl_pending",JSON.stringify({href:href,at:Date.now()}));}catch(e){}}
function gasKlClear(){try{sessionStorage.removeItem("gas_kl_pending");}catch(e){}}
function gasKlSignedIn(){try{var s=JSON.parse(localStorage.getItem("gas_auth_session")||"null");return !!(s&&s.access_token);}catch(e){return false;}}
function gasKlResume(){
  var p=gasKlPending(); if(!p||!p.href)return;
  if(Date.now()-(p.at||0)>360000){gasKlClear();return;}
  if(gasKlSignedIn()){gasKlClear();window.open(p.href,"_blank","noopener");return;}
  var tries=0,t=setInterval(function(){
    tries++;
    if(gasKlSignedIn()){clearInterval(t);gasKlClear();window.open(p.href,"_blank","noopener");return;}
    if(!gasKlPending()||tries>30)clearInterval(t);
  },400);
}
document.addEventListener("click",function(e){
  var el=e.target&&e.target.closest?e.target.closest("[data-kl-btn]"):null; if(!el)return;
  if(gasKlSignedIn())return;
  e.preventDefault();
  gasKlStash(el.getAttribute("data-kl-href"));
  if(typeof openSignInCard==="function")openSignInCard("Sign in and Sam will keep watching this for you.");
},true);
gasKlResume();`;

// gasDockSignin: moves the mobile sign-in control (lib/authBar.js's .gas-signbar-m, a plain in-flow
// element with no position of its own) into .gas-mhead as its last child, so it reads as part of
// the same row as the logo and hamburger instead of wherever AUTH_SIGNBAR_HTML happened to be
// injected in the raw HTML (right after <body> on every caller). Safe to call once the shared shell
// markup exists; a no-op if either element is missing (a page with no sign-in bar, or none of this
// shell). Called inline below - both elements are already in the DOM by the time this script tag is
// reached on every current caller (api/marketCheck.js, api/sellNext.js, api/tasksPage.js,
// api/howSamDecides.js, api/publicConfig.js's /o/:id share).
// page_view beacon (Oct 2026, open-search policy Part 1): mints the pseudonymous visitor id and
// counts the visit on every page that includes it, not just the ones that happen to fire a wizard/
// sign-in beacon first (api/funnel.js's ensureVisitorId otherwise only runs when something else
// beacons). Exported on its OWN (not just inlined into SHELL_JS) so a page that does not use the
// rest of this shell - Buy (api/buy.js), which keeps its own inline rail markup - can still reuse
// the exact same function instead of writing a second copy: splice `<script>window.GAS_TOOL="buy";
// </script><script>${PAGE_VIEW_JS}</script>` wherever that page's own inline script already sits.
// Reads window.GAS_TOOL (set per-page by railOpenHtml below, or by the caller directly) rather than
// scraping the DOM, so it works identically whether or not #gas-rail exists on the page. Client-side
// skip on the crew cookie (cheap, avoids a wasted request); the EEA/UK/Switzerland skip happens
// server-side in api/funnel.js's ensureVisitorId, same as every other gas_vid-reading path. Path
// only, no query string: location.pathname never carries ?... Minting happens inside the
// /api/funnel response (Set-Cookie on the beacon's own response), never in this page's own SSR
// output, so the page itself stays a plain cacheable response.
// Delegated click events (Oct 2026, open-search policy Part 1.3): market_check_open, receipt_click
// and auction_clickout, ALL through this one listener - no per-card/per-link JS, just a
// data-gas-event attribute on the existing element (plus optional data-gas-source /
// data-gas-listing-id). Capture phase so it still fires on an element whose own click handler
// calls stopPropagation() or navigates away before bubbling would reach here. THE ATTRIBUTES
// THEMSELVES ARE NOT YET ADDED TO ANY CARD/LINK TEMPLATE - see docs/lane-notes.md for the exact
// spots in js/onebox.js (receipt cards, the outbound auction link, the search/go button) and
// api/buy.js's own card markup, left to Lane A/C since those files were mid-edit at the time this
// listener was written.
const CLICK_EVENTS_JS = `document.addEventListener("click",function(e){
  var el=e.target&&e.target.closest?e.target.closest("[data-gas-event]"):null; if(!el)return;
  var ev=el.getAttribute("data-gas-event");
  if(ev!=="market_check_open"&&ev!=="receipt_click"&&ev!=="auction_clickout")return;
  var props={}; var src=el.getAttribute("data-gas-source"); if(src)props.source=src;
  var lid=el.getAttribute("data-gas-listing-id"); if(lid)props.listing_id=lid;
  gasBeacon(ev,props);
},true);`;

// page_view beacon (Oct 2026, open-search policy Part 1): mints the pseudonymous visitor id and
// counts the visit on every page that includes it, not just the ones that happen to fire a wizard/
// sign-in beacon first (api/funnel.js's ensureVisitorId otherwise only runs when something else
// beacons). Exported on its OWN (not just inlined into SHELL_JS) so a page that does not use the
// rest of this shell - Buy (api/buy.js), which keeps its own inline rail markup - can still reuse
// the exact same function instead of writing a second copy: splice `<script>window.GAS_TOOL="buy";
// </script><script>${PAGE_VIEW_JS}</script>` wherever that page's own inline script already sits
// (this also carries gasBeacon/the click listener, so Buy's own receipt/clickout attributes would
// work too, once added, with no further import). Reads window.GAS_TOOL (set per-page by
// railOpenHtml below, or by the caller directly) rather than scraping the DOM, so it works
// identically whether or not #gas-rail exists on the page. Client-side skip on the crew cookie
// (cheap, avoids a wasted request); the EEA/UK/Switzerland skip happens server-side in
// api/funnel.js's ensureVisitorId, same as every other gas_vid-reading path. Path only, no query
// string: location.pathname never carries ?... Minting happens inside the /api/funnel response
// (Set-Cookie on the beacon's own response), never in this page's own SSR output, so the page
// itself stays a plain cacheable response.
export const PAGE_VIEW_JS = `function gasBeacon(event,props,extra){
  try{
    if(/(?:^|; )gas_crew=ok(?:;|$)/.test(document.cookie))return;
    var tool=(typeof window!=="undefined"&&window.GAS_TOOL)||null;
    var body=JSON.stringify(Object.assign({event:event,tool:tool,props:props||null},extra||null));
    var url="/api/funnel";
    if(navigator&&navigator.sendBeacon)navigator.sendBeacon(url,new Blob([body],{type:"application/json"}));
    else fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true}).catch(function(){});
  }catch(e){}
}
// First touch (Part 1.4): read raw, once, right here - NOT via js/auth.js's gasCaptureTouch/
// localStorage, because that is a deferred script and would not have run yet on a visitor's
// genuinely first page load (the one load where the server will actually mint the id and store
// this). The server only ever uses it on that first mint (api/funnel.js, minted:true) - sent on
// every page_view regardless, since it is cheap and harmless to ignore on a repeat visitor.
function gasFirstTouch(){
  try{
    var p=new URLSearchParams(location.search);
    var t={utm_source:p.get("utm_source"),utm_medium:p.get("utm_medium"),utm_campaign:p.get("utm_campaign"),referrer:document.referrer||null};
    return t;
  }catch(e){ return null; }
}
function gasPageView(){ gasBeacon("page_view",{path:location.pathname},{touch:gasFirstTouch()}); }
gasPageView();
${CLICK_EVENTS_JS}`;

// active -> canonical tool name (lib/events.js TOOLS), for the window.GAS_TOOL inline script
// railOpenHtml emits below. "business"/"how" and anything else map to null (still counted, just
// not attributed to a product) rather than guessing.
const TOOL_FOR_ACTIVE = { buy: "buy", sell: "sell", "market-check": "market_check", tasks: "tasks" };

export const SHELL_JS = `function gasToggleRail(open){var r=document.getElementById("gas-rail"),s=document.getElementById("gas-scrim"),b=document.getElementById("gas-hamburger");if(!r)return;var on=(open===undefined)?!r.classList.contains("open"):!!open;r.classList.toggle("open",on);if(s)s.classList.toggle("open",on);if(b)b.setAttribute("aria-expanded",on?"true":"false");}
function gasDockSignin(){var sb=document.querySelector(".gas-signbar-m"),mh=document.querySelector(".gas-mhead");if(sb&&mh&&sb.parentNode!==mh)mh.appendChild(sb);}
gasDockSignin();
// Shared Watching rail (Oct 2026): one list call, one render, every shell page except Buy (which
// already shows its own, built before this shared one existed - see railOpenHtml's note above).
// Runs on the reduced pre-launch rail too (Sam, Oct 2026: a signed-in visitor's own watches are
// personalization, not the discovery surface PUBLIC_LAUNCH hides) - gated on being signed in, never
// on data-full. Skips when there is nothing to show (not signed in, or no active watch).
function gasWatchRail(){
  var rail = document.getElementById("gas-rail"); if (!rail) return;
  if (rail.getAttribute("data-active") === "buy") return;
  var box = document.getElementById("gas-watching-rail"); if (!box) return;
  var sess = null; try { sess = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); } catch (e) {}
  if (!sess || !sess.access_token) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token }, body: JSON.stringify({ action: "list" }) })
    .then(function (r) { return r.json(); }).then(function (j) {
      var list = (j && j.watches) || []; if (!list.length) return;
      box.hidden = false;
      box.innerHTML = '<div class="gas-navitem gas-rail-head">Watching</div>' + list.map(function (w) {
        var t = w.label || "A car", tail = w.last_event || "Nothing yet";
        return '<div class="gas-watch-row"><span class="gas-watch-t" title="' + esc(t + " \\u00b7 " + tail) + '">' + esc(t) + '<span class="gas-watch-e">' + esc(tail) + '</span></span><button type="button" class="gas-watch-x" data-wstop="' + esc(w.id) + '" aria-label="Stop watching ' + esc(t) + '">&times;</button></div>';
      }).join("");
      Array.prototype.forEach.call(box.querySelectorAll("[data-wstop]"), function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-wstop");
          fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token }, body: JSON.stringify({ action: "stop", id: id }) }).catch(function () {});
          var row = b.closest(".gas-watch-row"); if (row) row.remove();
          if (!box.querySelector(".gas-watch-row")) box.hidden = true;
        });
      });
    }).catch(function () {});
}
gasWatchRail();
// "Your searches", signed out (Oct 2026): one quiet line under the list once it holds a search, "Sign in free
// to keep these searches.", whose link opens the sign in card in place. Never a popup or banner, never in
// the way of a search; gone once signed in. Works for any rail section headed "Your searches".
function gasKeepSearchesLine(){
  function on(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch (e) { return false; } }
  var heads = Array.prototype.filter.call(document.querySelectorAll("#gas-rail .rh"), function (h) { return String(h.textContent || "").trim().toLowerCase() === "your searches"; });
  heads.forEach(function (h) {
    var list = h.nextElementSibling; if (!list) return;
    function sync(){
      var line = list.nextElementSibling && list.nextElementSibling.classList.contains("gas-keepline") ? list.nextElementSibling : null;
      var want = !on() && !!list.querySelector(".srow,[data-visit]");   // a real search row, never the empty placeholder
      if (want && !line) {
        line = document.createElement("p"); line.className = "gas-keepline";
        line.innerHTML = '<a href="#">Sign in free</a> to keep these searches.';
        line.firstChild.addEventListener("click", function (e) { e.preventDefault(); if (typeof openSignInCard === "function") openSignInCard(); });
        list.insertAdjacentElement("afterend", line);
      } else if (!want && line) line.remove();
    }
    sync();
    if (window.MutationObserver) new MutationObserver(sync).observe(list, { childList: true });
    setInterval(sync, 2000);
  });
}
gasKeepSearchesLine();
// Tasks rail badge (Oct 2026 "Keep looking" round): a small count next to "Tasks" in the rail,
// signed-in only, when there is an active task (Sam's one-task-at-a-time model, api/tasks.js
// summary - at most one, so the count is always "1" when shown). Skipped on "sell" the same way
// gasWatchRail skips "buy" - the Tasks nav item itself is already absent there (pagesForActive), so
// this is defensive, not load-bearing.
function gasTasksBadge(){
  var rail = document.getElementById("gas-rail"); if (!rail) return;
  if (rail.getAttribute("data-active") === "sell") return;
  var badges = document.querySelectorAll("[data-gas-tasks-badge]"); if (!badges.length) return;
  var sess = null; try { sess = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); } catch (e) {}
  if (!sess || !sess.access_token) return;
  fetch("/api/tasks?summary=1", { headers: { Authorization: "Bearer " + sess.access_token } })
    .then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.signedIn || !j.active) return;
      Array.prototype.forEach.call(badges, function (b) { b.textContent = "1"; b.hidden = false; });
    }).catch(function () {});
}
gasTasksBadge();
${KEEPLOOK_JS}
${PAGE_VIEW_JS}`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function navItems(active, list) {
  return list.map(p => '<a class="gas-navitem' + (active === p.key ? ' active' : '') + '" href="' + p.href + '"' + (active === p.key ? ' aria-current="page"' : '') +
    '>' + esc(p.label) + (p.key === "tasks" ? '<span class="gas-tbadge" data-gas-tasks-badge hidden></span>' : '') + '</a>').join("");
}

// railOpenHtml: everything from the scrim through the opening <div id="gas-main"> and its mobile
// header - placed right after <body> (after AUTH_SIGNBAR_HTML, same injection point every page
// already uses). pageExtra is an optional HTML string for a page-specific rail section rendered
// between the shared nav and the footer (e.g. Buy's "Your searches", Market Check/Sell/business's
// "Your results" placeholder for js/onebox.js to fill at runtime) - shown in BOTH access states.
// crew: pass isCrewRequest(req) from the caller; gates the full page list vs the reduced public set
// (see isFullAccess above). Callers write their own page content, then close with SHELL_MAIN_CLOSE.
export function railOpenHtml({ active, pageExtra, logoHref, crew, analytics }) {
  const home = logoHref || "/market-check";
  const full = isFullAccess(crew);
  const nav = navItems(active, pagesForActive(full ? SHELL_PAGES : REDUCED_PAGES, active));
  const foot = full
    ? '<a class="gas-navitem' + (active === "how" ? ' active' : '') + '" href="/how-sam-decides"' + (active === "how" ? ' aria-current="page"' : '') + '>How Sam decides</a>'
    : REDUCED_FOOT;
  // gas-watching-rail (Oct 2026): a Watching list container, shared across every shell page (the
  // SHELL_JS gasWatchRail() below fills it from the same /api/watch list call Buy's own page uses).
  // data-active/data-full tell that script whether to run at all: Buy already renders its own
  // Watching section (its page-specific pageExtra JS, not this file) - gasWatchRail() checks
  // data-active==="buy" and no-ops there, so the two never double up. Reduced rail (pre-launch,
  // data-full="0") never fetches it either, per the PUBLIC_LAUNCH rule.
  // Analytics (Oct 2026, opt-in only - see lib/analytics.js): every railOpenHtml caller except the
  // not-yet-launched new Sell (api/sellNext.js) passes analytics:true explicitly. Defaulting this
  // OFF, not on, means a future shared-shell page never gets the tag by accident.
  const analyticsHtml = analytics ? gaBootstrapHtml() : "";
  // window.GAS_TOOL (Part 1.1): read by PAGE_VIEW_JS's gasPageView(), set here from the SAME
  // active key the rail/nav already use, so the page_view event's tool always matches this page's
  // own nav highlight - never a second, independently-maintained mapping.
  const toolHtml = '<script>window.GAS_TOOL=' + JSON.stringify(TOOL_FOR_ACTIVE[active] || null) + ';</script>';
  return toolHtml + analyticsHtml + '<div id="gas-scrim" onclick="gasToggleRail(false)"></div>' +
    '<aside id="gas-rail" aria-label="Main navigation" data-active="' + esc(active || "") + '" data-full="' + (full ? "1" : "0") + '">' +
    '<a class="gas-logo" href="' + home + '">GoAskSam</a>' +
    '<nav class="gas-rail-nav">' + nav + '<div class="gas-rail-extra" id="gas-watching-rail" hidden></div>' + (pageExtra ? '<div class="gas-rail-extra">' + pageExtra + '</div>' : '') + '</nav>' +
    '<div class="gas-rail-foot">' + foot + '</div>' +
    '</aside>' +
    '<div id="gas-main">' +
    '<header class="gas-mhead"><a class="gas-brand" href="' + home + '">GoAskSam</a>' +
    '<button type="button" class="gas-menu" id="gas-hamburger" aria-label="Menu" aria-controls="gas-rail" onclick="gasToggleRail()"><span></span><span></span><span></span></button>' +
    '</header>';
}

export const SHELL_MAIN_CLOSE = "</div>";
