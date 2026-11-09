// THE SITE PAGES ON THE NEW SHELL (Lane E, Nov 9 2026; Sam's order: /business (for business), /how-sam-decides, /about, /whats-new, /feedback, /terms, /privacy, and the history pages). Crew previews at /preview/<path>, noindex, no store.
// ONLY THE FRAME AND THE TYPE CHANGE. The page is the LIVE page, exactly as its own handler answers: its <main> (every heading, paragraph, link, list, table and form) is carried over byte for byte, its own stylesheet and scripts come with it, and its structured data stays.
// What is taken away is the old chrome: the left rail, the mobile menu, the sign in bar and the old shell's own scripts. What is put in is the approved header (dark green, logo and Beta, Find, Market Check, Sell, Tasks, Account, no active pill), NO left rail,
// the approved footer, and one centered column at the homepage's content width with the homepage's heading and body type, spacing and link style. Nothing is removed, reworded or reordered.
// Rule: pages compute nothing. This file writes no word of the page; the words are the live handler's.
import { SHARED } from "./previewPages.js";
import { SHELL_CSS, SHELL_JS, SHELL_TOKENS_CSS } from "../appShell.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../authBar.js";
const { header, footer, doc, esc } = SHARED;

export class SiteMarkerMissing extends Error {}
// the preview address of each live page, and which header tab is active (none: the site pages are not one of the three products)
export const SITE = {
  business: { live: "/business", path: "/preview/business", api: "business" },
  how: { live: "/how-sam-decides", path: "/preview/how-sam-decides", api: "howSamDecides" },
  about: { live: "/about", path: "/preview/about", api: "about" },
  whatsnew: { live: "/whats-new", path: "/preview/whats-new", api: "whatsNew" },
  feedback: { live: "/feedback", path: "/preview/feedback", api: "feedback" },
  terms: { live: "/terms", path: "/preview/terms", api: "legal", query: "page=terms" },
  privacy: { live: "/privacy", path: "/preview/privacy", api: "legal", query: "page=privacy" }
};

// THE HOMEPAGE'S COLUMN AND TYPE (lib/preview/previewPages.js: .wrap is the homepage's content width, .t-h2 and .t-h3 its headings, .t-body its text, the pills' ink for links). The selectors lead with .sitecol so they out-rank the page's own class rules
// (.ab-h1, .wn-col h2 and the like) without !important, and a page's tables, forms and lists keep their own layout.
export const SITE_CSS = `
.sitepage{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;position:static!important;float:none!important;min-height:0!important}   /* a live page's own rule on main (the old rail's left margin) never moves the column */
.sitecol{padding-top:56px;padding-bottom:84px;padding-left:var(--gut);padding-right:var(--gut)}
.sitecol>div,.sitecol>.col{max-width:none;margin:0;padding:0;width:100%}
.sitecol h1{margin:0 0 20px;color:var(--forest);font:500 clamp(34px,4vw,50px)/1.1 var(--serif);letter-spacing:-.012em;text-wrap:balance}
.sitecol h2{margin:36px 0 12px;color:var(--forest);font:500 clamp(26px,2.4vw,32px)/1.18 var(--serif);letter-spacing:-.008em}
.sitecol h3{margin:26px 0 8px;color:var(--ink);font:500 22px/1.2 var(--serif)}
.sitecol p,.sitecol li,.sitecol dd,.sitecol td,.sitecol th,.sitecol label{color:var(--ink);font:400 17px/1.6 var(--sans)}
.sitecol p,.sitecol ul,.sitecol ol{max-width:78ch}.sitecol p{margin:0 0 14px}
.sitecol ul,.sitecol ol{margin:0 0 14px;padding-left:22px}.sitecol li{margin:0 0 6px}
.sitecol a{color:var(--forest);text-decoration:underline;text-underline-offset:3px;text-decoration-color:#B9B2A6}.sitecol a:hover{text-decoration-color:var(--forest)}
.sitecol input,.sitecol textarea,.sitecol select,.sitecol button{font-family:var(--sans)}
@media (max-width:860px){.sitecol{padding-top:34px;padding-bottom:56px}}`;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const isJsonLd = attrs => /type\s*=\s*["']application\/ld\+json["']/i.test(attrs);
// what the old shell put in the page, taken out by its own text (so a change to the old shell's script is never silently kept): its stylesheets, its scripts, the sign in bar, the rail
const OLD_JS = [SHELL_JS, AUTH_SIGNBAR_MIRROR_JS];

// the live page's own head styles with the OLD CHROME's rules removed (the rail and mobile menu: SHELL_CSS; the sign in bar), so what is left is the page's tokens and its own content rules
export function ownCss(liveHtml) {
  let css = ""; for (const m of String(liveHtml).matchAll(STYLE_RE)) css += m[1] + "\n";
  for (const old of [SHELL_CSS, SHELL_TOKENS_CSS, AUTH_SIGNBAR_CSS]) if (old) css = css.split(old).join("");
  // the old page's own body and reset rules would restyle the shared shell; the page's content classes stay
  css = css.replace(/(?<=^|\})\s*(?:html\s*,\s*)?body\s*\{[^}]*\}/g, "").replace(/(?<=^|\})\s*:root\s*\{[^}]*\}/g, "").replace(/\*\s*\{box-sizing:border-box\}/g, "");
  return css;
}
export const mainOf = liveHtml => { const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(String(liveHtml)); return m ? m[1] : null; };
export function pageScripts(liveHtml) {
  const keep = [];
  for (const m of String(liveHtml).matchAll(SCRIPT_RE)) {
    const attrs = m[1], body = m[2];
    if (isJsonLd(attrs)) continue;                                    // structured data is carried separately
    if (/\bsrc\s*=\s*["']\/js\/auth\.js["']/.test(attrs)) continue;   // the old sign in bar's script
    if (!/\bsrc\s*=/.test(attrs) && OLD_JS.some(j => body.trim() === j.trim())) continue;
    if (!/\bsrc\s*=/.test(attrs) && /gasIsGuestLink|GAS_AUTH_MODE/.test(body) && body.length < 400) continue;   // the old sign in bar's two flags
    if (/\bsrc\s*=\s*["']\/api\/track/.test(attrs)) continue;                                                // a preview sends no analytics
    if (!/\bsrc\s*=/.test(attrs) && /googletagmanager|gtag\(|dataLayer|gas_consent|consent banner/i.test(body)) continue;   // the analytics bootstrap and the cookie banner's script (the banner's markup is outside <main> and is not carried)
    keep.push(m[0]);
  }
  return keep.join("\n");
}
export const jsonLdOf = liveHtml => [...String(liveHtml).matchAll(SCRIPT_RE)].filter(m => isJsonLd(m[1])).map(m => m[0]).join("\n");
export const titleOf = liveHtml => { const m = /<title>([\s\S]*?)<\/title>/i.exec(String(liveHtml)); return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "GoAskSam"; };

// wrapSite: the live page inside the shell. Throws when the page has no <main> (the door then answers the platform 404: never a half page).
export function wrapSite(liveHtml, { rail = false } = {}) {
  const inner = mainOf(liveHtml); if (inner == null) throw new SiteMarkerMissing("the live page has no <main>");
  const body = `${header("")}${rail ? `<aside class="rail" aria-label="Site">x</aside>` : ""}<main class="sitepage"><div class="sitecol wrap">${inner}</div></main>${footer()}`;
  return doc(titleOf(liveHtml), ownCss(liveHtml) + "\n" + SITE_CSS, body, jsonLdOf(liveHtml) + pageScripts(liveHtml));
}
export { esc as _esc };
