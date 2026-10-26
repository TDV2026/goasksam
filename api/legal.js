// /privacy and /terms (Sam, Oct 26 2026): the two legal pages in the shared app shell (the left rail, the mobile menu), no page footer, open while the site is
// sealed (this handler never calls heldFor, like /feedback and /api/crew). The text is Sam's approved text word for word (lib/legal/*Text.js); this file only
// draws it. Each page opens with its effective date and one small line that links the three: Terms, Privacy, Privacy choices (the cookie choice).
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { legalBodyHtml } from "../lib/legal/render.js";
import { PRIVACY_TEXT } from "../lib/legal/privacyText.js";
import { TERMS_TEXT } from "../lib/legal/termsText.js";

export const EFFECTIVE = "Effective October 29, 2026";
export const PAGES = {
  privacy: { path: "/privacy", h1: "Privacy Policy", title: "Privacy Policy - GoAskSam", desc: "How GoAskSam collects, uses, and protects your information.", text: PRIVACY_TEXT },
  terms: { path: "/terms", h1: "Terms and Conditions", title: "Terms and Conditions | GoAskSam", desc: "The terms for using GoAskSam, including Market Check, Find, Sell and Tasks.", text: TERMS_TEXT }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CHOICES = `<a href="#" onclick="if(window.gasShowConsentBanner)window.gasShowConsentBanner();return false;">Privacy choices</a>`;
const CSS = `
.lg-col{max-width:760px;margin:0 auto;padding:56px 48px 96px}
.lg-h1{margin:0 0 10px;font:600 44px/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A)}
.lg-eff{margin:0 0 10px;font:400 15px/1.5 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.lg-nav{margin:0 0 28px;font:400 13.5px/1.5 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.lg-nav a{color:var(--sec,#5E6B63);text-decoration:underline;text-underline-offset:3px}.lg-nav i{font-style:normal;margin:0 8px;opacity:.6}
.lg-body p,.lg-body li{font:400 16.5px/1.65 var(--sans,sans-serif);color:var(--ink,#15201A)}
.lg-body p{margin:0 0 14px}
.lg-body ul{margin:0 0 16px;padding:0 0 0 22px;display:flex;flex-direction:column;gap:8px}
.lg-h{margin:34px 0 10px;font:600 22px/1.3 var(--serif,Georgia,serif);color:var(--ink,#15201A)}
.lg-body a{color:var(--green,#1E4D38)}
@media (max-width:640px){.lg-col{padding:32px 20px 64px}.lg-h1{font-size:32px}.lg-h{font-size:20px}}`;

function page(req, key) {
  const P = PAGES[key], crew = isCrewRequest(req);
  const nav = `<p class="lg-nav"><a href="/terms">Terms</a><i>&middot;</i><a href="/privacy">Privacy</a><i>&middot;</i>${CHOICES}</p>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(P.title)}</title><meta name="description" content="${esc(P.desc)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com${P.path}">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}${CONSENT_BANNER_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "", crew, req, analytics: true })}
<main><div class="lg-col">
<h1 class="lg-h1">${esc(P.h1)}</h1>
<p class="lg-eff" data-lead-sentence>${EFFECTIVE}</p>
${nav}
<div class="lg-body">
${legalBodyHtml(P.text)}
</div>
</div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
${CONSENT_BANNER_HTML}
<script>${CONSENT_BANNER_JS}</script>
</body></html>`;
  return { html, crew };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return res.status(405).end(); }
  const key = String((req.query && req.query.page) || "") === "terms" ? "terms" : "privacy";
  const { html, crew } = page(req, key);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=300");
  res.status(200).send(html);
}
