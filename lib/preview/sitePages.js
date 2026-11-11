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
/* THE SHELL'S FORM STYLE (Sam, Nov 11 2026: the For business walkthrough form drew with no field borders, no field backgrounds and an unstyled button). CAUSE: ownCss() takes the live page's :root token block out (so the page cannot restyle the shell), and a page's form rules read those tokens (business: var(--border), var(--page), var(--green)); with the tokens gone the declarations were invalid, so the fields had no border or fill and the button no fill. The form style is now the shell's, written in the shell's own values, not the page's tokens: a field is boxed like the Find search box (1px --line, white, the search box's type and its 17px size), and a form's button is the filled forest button of the search box's Go (white type, --r-ctl corners). !important so no page rule or page token can bring the drop back. */
.sitecol input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=file]),.sitecol textarea,.sitecol select{box-sizing:border-box!important;border:1px solid var(--line)!important;border-radius:var(--r-ctl)!important;background:#fff!important;color:var(--ink)!important;font:400 17px/1.4 var(--sans)!important;padding:12px 14px!important;margin:0}
.sitecol input::placeholder,.sitecol textarea::placeholder{color:var(--sec);opacity:1}
.sitecol .biz-desk-search input{border:0!important;border-radius:0!important;background:transparent!important;padding:1px 2px!important}   /* a field inside a search box the page draws keeps the box's own edge, as the Find search box does */
.sitecol form button,.sitecol button[type=submit],.sitecol input[type=submit]{box-sizing:border-box!important;background:var(--forest)!important;color:#fff!important;border:1px solid var(--forest)!important;border-radius:var(--r-ctl)!important;min-height:44px;padding:0 22px!important;font:500 16px/1 var(--sans)!important;cursor:pointer}
.sitecol form button:hover,.sitecol button[type=submit]:hover{background:var(--forest-hover)!important}
.sitecol form button:disabled{opacity:.6;cursor:default}
/* BUTTONS THAT ARE LINKS (Sam, Nov 11 2026, the history pages' Keep looking card and the For business walkthrough link). CAUSE, the same as the form drop: the shell's own link rule (.sitecol a: forest ink, underlined) out-ranks a page's button rule (.gas-kl-btn, .biz-btn), so a button drew dark underlined link text on its own dark green fill. A link that is a button (a class with "btn" in it, or role=button) takes the button style of the search box's Go: the forest fill, white type, no underline, the shell's corners. */
.sitecol a:is([class*="btn"],[role=button]){box-sizing:border-box!important;display:inline-flex!important;align-items:center;justify-content:center;min-height:44px;padding:0 22px!important;background:var(--forest)!important;color:#fff!important;border:1px solid var(--forest)!important;border-radius:var(--r-ctl)!important;font:500 16px/1 var(--sans)!important;text-decoration:none!important;cursor:pointer}
.sitecol a:is([class*="btn"],[role=button]):hover{background:var(--forest-hover)!important;color:#fff!important;text-decoration:none!important}
/* THE KEEP LOOKING CARD (history pages): the title says it, so the eyebrow that repeated it goes; the button and the line under it are one column of the card's own grid (icon, words, action), the line under the button, both left aligned in that column, inside the card */
.sitecol .gas-keepl .gas-kl-eye{display:none!important}
.sitecol .gas-keepl .gas-kl-t h3{margin:0 0 4px}
.sitecol .gas-keepl .gas-kl-a{flex:0 0 300px;align-items:flex-start;gap:8px;text-align:left}
.sitecol .gas-keepl .gas-kl-a p{margin:0;max-width:300px;text-align:left}
@media (max-width:700px){.sitecol .gas-keepl .gas-kl-a{flex:none;width:100%;align-items:stretch}}
@media (max-width:860px){.sitecol{padding-top:34px;padding-bottom:56px}}`;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const isJsonLd = attrs => /type\s*=\s*["']application\/ld\+json["']/i.test(attrs);
// what the old shell put in the page, taken out by its own text (so a change to the old shell's script is never silently kept): its stylesheets, its scripts, the sign in bar, the rail
const OLD_JS = [SHELL_JS, AUTH_SIGNBAR_MIRROR_JS];

// the live page's own head styles with the OLD CHROME's rules removed (the rail and mobile menu: SHELL_CSS; the sign in bar), so what is left is the page's tokens and its own content rules
export const SHELL_OWNED = new Set(["--forest", "--forest-hover", "--forest-line", "--ink", "--sec", "--cream", "--card", "--line", "--tint", "--foot", "--sans", "--serif", "--gut", "--maxw", "--hdr", "--r-ctl", "--r-box", "--r-pill"]);
export function ownCss(liveHtml) {
  let css = ""; for (const m of String(liveHtml).matchAll(STYLE_RE)) css += m[1] + "\n";
  for (const old of [SHELL_CSS, SHELL_TOKENS_CSS, AUTH_SIGNBAR_CSS]) if (old) css = css.split(old).join("");
  // the old page's own body and reset rules would restyle the shared shell; the page's content classes stay
  // THE PAGE'S OWN TOKENS STAY (Nov 11 2026, the For business form drop): the old :root block is taken out so a page cannot restyle the shell, but the page's rules read tokens that only that block defined (business: var(--border), var(--page), var(--green); the history pages: --ph, --live, --take; every site page: --green), and with the block gone those declarations were invalid, so borders, fills and colours silently vanished. The tokens the shell does NOT own are put back, scoped to the page's own column (.sitepage), so the page's own rules read what they always read; the shell's own names (SHELL_OWNED: its colours, type and sizes) are never overridden.
  const kept = [];
  for (const m of css.matchAll(/(?<=^|\})\s*:root\s*\{([^}]*)\}/g)) for (const d of m[1].split(";")) { const i = d.indexOf(":"); if (i < 0) continue; const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim(); if (/^--[\w-]+$/.test(k) && v && !SHELL_OWNED.has(k) && !kept.some(x => x.startsWith(k + ":"))) kept.push(k + ":" + v); }
  css = css.replace(/(?<=^|\})\s*(?:html\s*,\s*)?body\s*\{[^}]*\}/g, "").replace(/(?<=^|\})\s*:root\s*\{[^}]*\}/g, "").replace(/\*\s*\{box-sizing:border-box\}/g, "");
  return (kept.length ? `.sitepage{${kept.join(";")}}\n` : "") + css;
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
