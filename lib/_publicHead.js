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
/* the new shell: the header's Account button is the way in, so the bar draws only when someone is signed in (email and Sign out), just under the header */
.gas-signbar:not(:has(.hp-signout)),.gas-signbar-m:not(:has(.hp-signout)){display:none!important}
.gas-signbar .hp-signin,.gas-signbar-m .hp-signin{display:none}
.gas-signbar{top:68px;right:16px}
@media (max-width:760px){.gas-signbar-m{position:absolute;top:64px;right:12px;z-index:40;background:var(--main-bg,#F6F3EC);box-shadow:0 0 0 1px rgba(21,32,26,.12);border-radius:999px;padding:2px 10px}}`;
const ACCOUNT_JS = `(function(){var a=document.getElementById("acct");if(!a)return;a.addEventListener("click",function(e){try{if(typeof authIsSignedIn==="function"&&authIsSignedIn())return;if(typeof openSignInCard==="function"){e.preventDefault();openSignInCard(undefined,{dest:"/tasks/mine"});}}catch(x){}});})();`;
const TRACK_RE = /<script\b[^>]*\bsrc="\/api\/track\?js=1"[^>]*><\/script>/;
export function applyPublicScripts(newHtml, legacyHtml) {
  let h = String(newHtml || ""); const L = String(legacyHtml || ""), end = [], css = [];
  if (/\/auth\.js/.test(L)) {
    if (!/id="signin-area"/.test(h)) { h = h.replace(/<body\b[^>]*>/i, m => m + "\n" + AUTH_SIGNBAR_HTML); end.push(`<script>${AUTH_SIGNBAR_MIRROR_JS}</script>`); css.push(SIGNIN_CSS); }
    if (!/GAS_AUTH_MODE/.test(h)) end.push(`<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>`);   // before the deferred script runs
    if (!/\/auth\.js/.test(h)) end.push(`<script src="/js/auth.js" defer></script>`);
    if (/id="acct"/.test(h)) end.push(`<script>${ACCOUNT_JS}</script>`);
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
