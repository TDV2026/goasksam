// THE PUBLIC HEAD (Lane E, Nov 10 2026, go live Stage 2; Sam's answer): a new page that answers a PUBLIC address wears the head of the CURRENT page for the same address, byte for byte:
// the title, the meta description, the meta robots tag (or none, when the current page has none), the canonical, the Open Graph and Twitter tags and every JSON-LD block. Only the h1
// (and the body) are the new design's. The preview head ("GoAskSam preview: Find", noindex, nofollow, no canonical, no description, no structured data) never reaches a public response.
// Nothing is written here: every tag is lifted verbatim from the page the handler already answered.
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "./authBar.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "./consentBanner.js";
const META = n => new RegExp(`<meta\\b[^>]*\\bname=["']${n}["'][^>]*>`, "gi");
const PROP = p => new RegExp(`<meta\\b[^>]*\\bproperty=["']${p}[^"']*["'][^>]*>`, "gi");
const SHAPES = [
  ["title", /<title\b[^>]*>[\s\S]*?<\/title>/gi],
  ["description", META("description")],
  ["robots", META("robots")],
  ["canonical", /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi],
  ["og", PROP("og:")],
  ["twitter", META("twitter:[^\"']*")],
  ["ld", /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi]
];
export function headTagsOf(html) {
  const out = {}; const s = String(html || "");
  const head = (/<head\b[\s\S]*?<\/head>/i.exec(s) || [s])[0];
  for (const [k, re] of SHAPES) { re.lastIndex = 0; out[k] = (k === "ld" ? s : head).match(re) || []; re.lastIndex = 0; }
  return out;
}
export function applyPublicHead(newHtml, legacyHtml) {
  let h = String(newHtml || "");
  const legacy = headTagsOf(legacyHtml);
  for (const [, re] of SHAPES) { re.lastIndex = 0; h = h.replace(re, ""); re.lastIndex = 0; }
  const block = ["title", "description", "robots", "canonical", "og", "twitter", "ld"].flatMap(k => legacy[k]).join("\n");
  return /<\/head>/i.test(h) ? h.replace(/<\/head>/i, () => block + "\n</head>") : h;
}

// PUBLIC ADDRESSES (Stage 2): the crew previews name their own addresses (/preview/market-check, /preview/tasks/api, the patched onebox script). A public response names the public ones:
// each preview address is replaced by the address it previews, longest first, and the patched Market Check script by the script the current page loads. Text replacement only.
const ADDR = [
  ["/preview/market-check/example", "/market-check"], ["/preview/tasks/mine", "/tasks/mine"], ["/preview/tasks/api", "/api/tasks"], ["/preview/for-business", "/business"],
  ["/preview/how-sam-decides", "/how-sam-decides"], ["/preview/market-check", "/market-check"], ["/preview/whats-new", "/whats-new"], ["/preview/feedback", "/feedback"],
  ["/preview/business", "/business"], ["/preview/history", "/history"], ["/preview/privacy", "/privacy"], ["/preview/about", "/about"], ["/preview/terms", "/terms"],
  ["/preview/tasks", "/tasks"], ["/preview/sell", "/sell"], ["/preview/find", "/find"], ["/preview/home", "/"]
];
export function publicAddresses(newHtml, legacyHtml) {
  let h = String(newHtml || "");
  const js = /<script\b[^>]*\bsrc="([^"]*onebox\.js[^"]*)"/i.exec(String(legacyHtml || ""));
  if (js) h = h.split("/preview/market-check/onebox.js").join(js[1]);
  h = h.split('"/preview"+u').join("u");   // Sell's recent searches: the saved address, not a crew address
  for (const [from, to] of ADDR) h = h.split(from).join(to);
  return h;
}

// SIGN IN AND ANALYTICS (go live held items 2 and 3). A new public page loads, from the shared files, what the CURRENT page for the same address loads: the sign in script and bar (lib/authBar.js, js/auth.js, topbar mode), and the
// analytics script with its consent banner and outbound tagging (js/track, lib/consentBanner.js, lib/outboundUtm.js), each lifted from the current page's own answer, so crew traffic and the EEA and UK exclusions (they live in those
// files and in the track endpoint) are exactly today's. A page that already carries a piece is not given a second one. The header's Account button opens the same sign in card.
const SIGNIN_CSS = AUTH_SIGNBAR_CSS + `
/* the new shell has no sign in strip: the header's Account button is the way in and, signed in, the account menu. The strip's container stays in the page (js/auth.js writes the signed in state there and the menu reads the address from it) but is never shown, on any width. */
.gas-signbar,.gas-signbar-m{display:none!important}
/* the account menu, in the header's own style (the forest bar, the white tab type) */
.tabs{position:relative}
.acct-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:60;min-width:220px;max-width:min(320px,calc(100vw - 24px));background:var(--forest);color:#fff;border:1px solid rgba(255,255,255,.45);border-radius:var(--r-ctl);padding:6px;box-shadow:0 8px 24px rgba(11,49,38,.28)}
.acct-menu[hidden]{display:none}
.acct-email{display:block;padding:10px 12px;font:400 14px/1.3 var(--sans);color:rgba(255,255,255,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acct-out{display:flex;align-items:center;width:100%;height:38px;padding:0 12px;border:0;background:none;color:rgba(255,255,255,.94);border-radius:var(--r-ctl);font:500 15.5px/1 var(--sans);cursor:pointer;text-align:left}
.acct-out:hover{background:rgba(255,255,255,.1)}.acct-out:focus-visible,.tabs a.acct:focus-visible{outline:2px solid #fff;outline-offset:2px}`;
const ACCOUNT_MENU_HTML = '<div class="acct-menu" id="acct-menu" role="menu" hidden><span class="acct-email" role="presentation"></span><button type="button" class="acct-out" role="menuitem">Sign out</button></div>';
// THE ACCOUNT BUTTON. Signed out: it opens the sign in card, which remembers THIS page, query and all (js/auth.js openSignInCard), and the sign in returns here (Home when nothing was remembered). Signed in: it opens the account menu (the address and Sign out). Nothing is decided here: the signed in state and the address come from js/auth.js, through the hidden strip container it writes.
const ACCOUNT_JS = `(function(){window.GAS_NEW_DESIGN=1;var a=document.getElementById("acct"),m=document.getElementById("acct-menu"),src=document.getElementById("signin-area");if(!a)return;
function signed(){return typeof authIsSignedIn==="function"&&authIsSignedIn();}
function close(){if(m){m.hidden=true;a.setAttribute("aria-expanded","false");}}
function fill(){if(!m)return;var e=src&&src.querySelector(".hp-account-email");m.querySelector(".acct-email").textContent=(e&&e.textContent)||"Signed in";}
a.setAttribute("aria-haspopup","menu");a.setAttribute("aria-expanded","false");
a.addEventListener("click",function(e){try{if(signed()){e.preventDefault();if(!m)return;fill();m.hidden=!m.hidden;a.setAttribute("aria-expanded",String(!m.hidden));return;}if(typeof openSignInCard==="function"){e.preventDefault();openSignInCard();}}catch(x){}});
if(m){m.querySelector(".acct-out").addEventListener("click",function(){close();if(typeof authSignOut==="function")authSignOut();});
document.addEventListener("click",function(e){if(!m.hidden&&!m.contains(e.target)&&!a.contains(e.target))close();});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!m.hidden){close();a.focus();}});}
if(src&&window.MutationObserver)new MutationObserver(function(){if(!signed())close();else fill();}).observe(src,{childList:true,subtree:true,characterData:true});})();`;
const TRACK_RE = /<script\b[^>]*\bsrc="\/api\/track\?js=1"[^>]*><\/script>/;
export function applyPublicScripts(newHtml, legacyHtml) {
  let h = String(newHtml || ""); const L = String(legacyHtml || ""), end = [], css = [];
  if (/\/auth\.js/.test(L)) {
    if (!/id="signin-area"/.test(h)) { h = h.replace(/<body\b[^>]*>/i, m => m + "\n" + AUTH_SIGNBAR_HTML); end.push(`<script>${AUTH_SIGNBAR_MIRROR_JS}</script>`); css.push(SIGNIN_CSS); }
    if (!/GAS_AUTH_MODE/.test(h)) end.push(`<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>`);   // before the deferred script runs
    if (!/\/auth\.js/.test(h)) end.push(`<script src="/js/auth.js" defer></script>`);
    if (/id="acct"/.test(h)) { if (!h.includes("id=\"acct-menu\"")) h = h.replace(/(<a\b[^>]*\bid="acct"[^>]*>[^<]*<\/a>)/, (m0) => m0 + ACCOUNT_MENU_HTML); end.push(`<script>${ACCOUNT_JS}</script>`); }
  }
  // each piece is lifted when the CURRENT page has it, on its own: Home, Feedback, the legal pages and others carry the consent banner and its script WITHOUT the /api/track?js=1 tag (their events are written on the server), so the banner must not wait for that tag (Lane C's live read, Nov 10: the look had no banner on Home)
  const track = TRACK_RE.exec(L);
  if (L.includes(CONSENT_BANNER_CSS) && !h.includes(CONSENT_BANNER_CSS)) css.push(CONSENT_BANNER_CSS);
  const inline = [...L.matchAll(/<script>([\s\S]*?)<\/script>/g)].filter(m => (m[1].includes(CONSENT_BANNER_JS) || /gasOutboundInstall\(/.test(m[1])) && !h.includes(m[0])).map(m => m[0]);
  if (L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) end.push(CONSENT_BANNER_HTML);
  if (track && !TRACK_RE.test(h)) end.push(track[0]);
  end.push(...inline);
  // a page that loads the analytics script offers the consent choice (every public page that loads it does, except today's Sell, the one served at /sell with SELL_NEXT_ON=1: it loads the script and never had the banner, so a visitor from the EEA, UK or Switzerland, whose consent is declined until they accept, could never accept there and was never counted). The shared component, nothing of its own; pages that do not load the script (About, How Sam decides, What's new) are not touched.
  if (track && !L.includes(CONSENT_BANNER_HTML) && !h.includes(CONSENT_BANNER_HTML)) { css.push(CONSENT_BANNER_CSS); end.push(CONSENT_BANNER_HTML, `<script>${CONSENT_BANNER_JS}</script>`); }
  if (css.length) h = h.replace(/<\/head>/i, () => `<style>${css.join("\n")}</style></head>`);
  if (end.length) h = h.replace(/<\/body>/i, () => end.join("\n") + "\n</body>");
  return h;
}
