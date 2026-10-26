// / (GoAskSam 2.0 Stage 2, Sam's block, Oct 23 2026): the Home page. It no longer redirects to /sell. It introduces Find first (one box that
// goes straight to populated Find results, never the empty Find page) and points to the other two doors (Market Check, Sell). It is the
// shared start page (lib/startPage.js) inside the shared shell, so the rail, the account control and the input are the same as every
// other product's. Until Find is released to the public (lib/_launchStage.js isReleased("buy")), this page is not open: "/" answers
// exactly as before (to /sell), with a temporary redirect, so the launch gate stays as it is. The page computes nothing.
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE, paletteHead, paletteSwitcherHtml, PALETTE_SWITCHER_JS, brandPaletteCss } from "../lib/appShell.js";
import { fullyLaunched, isReleased } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { startHtml, START_CSS, START_JS } from "../lib/startPage.js";
import { PLACEHOLDERS } from "../lib/startPlaceholders.js";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { heldFor } from "../lib/_hold.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TITLE = "GoAskSam | Find enthusiast cars at auction, check what they sell for, sell yours";
const DESC = "Tell Sam what you want and search live enthusiast car auctions in your own words, see what similar cars have actually sold for, and find where and how to sell yours.";
const EXAMPLES = PLACEHOLDERS.home.examples;
const IC_CHART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M9 20V6M14 20v-8M19 20V4M3 20h18"/></svg>';
const IC_TAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>';
const IC_OUT = '<svg class="gst-card-ar" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
const card = (href, ic, title, sub) => `<a class="gst-card" href="${href}"><span class="gst-card-ic">${ic}</span><span class="gst-card-t"><b>${esc(title)}</b><span>${esc(sub)}</span></span>${IC_OUT}</a>`;

// STRUCTURED DATA (GoAskSam 2.0 Stage 4, Sam's block): who is behind GoAskSam (the organization and its parent, never a named person: Sam is a persona) and the site's search
// box, so a search engine can offer GoAskSam's own search: the target is Find, with the typed words as ?q=.
const LD = JSON.stringify({ "@context": "https://schema.org", "@graph": [
  { "@type": "Organization", "@id": "https://goasksam.com/#org", name: "GoAskSam", url: "https://goasksam.com/", logo: "https://goasksam.com/icon-512.png",
    description: "GoAskSam helps enthusiasts find cars at live auction, see what similar cars have actually sold for, and decide where to sell theirs, using real auction results. Built by the team behind The Daily Vroom.",
    parentOrganization: { "@type": "Organization", name: "The Daily Vroom", url: "https://thedailyvroom.com" }, sameAs: ["https://thedailyvroom.com"] },
  { "@type": "WebSite", "@id": "https://goasksam.com/#site", name: "GoAskSam", url: "https://goasksam.com/", publisher: { "@id": "https://goasksam.com/#org" },
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: "https://goasksam.com/find?q={search_term_string}" }, "query-input": "required name=search_term_string" } }
] }).replace(/</g, "\\u003c");

const CSS = `
#gas-start-home .gst-box{max-width:960px}   /* Home keeps its own width; Sell, Find and Market Check share 600 (lib/startPage.js START_BOX_MAX) */
.hm{position:relative;min-height:calc(100dvh - 24px);display:flex;align-items:center;justify-content:center;padding:72px 32px 56px;box-sizing:border-box}
@media (max-width:700px){.hm{min-height:calc(100dvh - 60px);padding:28px 18px 64px;align-items:flex-start}}
.hm-legal{position:absolute;left:0;right:0;bottom:16px;display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;font:400 12.5px/1.4 var(--sans,sans-serif);color:var(--sec,#5E6B63)}.hm-legal a{color:inherit;text-decoration:none}.hm-legal a:hover{text-decoration:underline}`;

export default async function handler(req, res) {
  if (heldFor(req, res)) return;   // the holding page while CURTAIN_SEALED=1 (lib/_hold.js); a keyed server job, crew and testers pass
  const crew = isCrewRequest(req);
  const showPal = crew;   // the palette bar: the crew cookie only (lib/appShell.js PALETTE_BAR_ON is its one switch)
  if (!isReleased("buy", req)) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Location", "/sell"); return res.status(302).end(); }
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const start = startHtml({
    id: "gas-start-home", enter: true, eyebrow: "Welcome to GoAskSam", title: "Find the car you're looking for.",
    sub: "Tell Sam what you want. Search live enthusiast car auctions in your own words.",
    examples: EXAMPLES, helper: "Speak or type naturally.", label: "What are you looking for?",
    ids: { input: "gst-home-q", mic: "gst-home-mic", go: "gst-home-go" },
    asof: updated ? `Sam reads live and completed enthusiast car auctions, updated ${updated}.` : "Sam reads live and completed enthusiast car auctions.", leadMark: true,
    after: `<div class="gst-cards">${card("/market-check", IC_CHART, "Market Check", "See what similar cars have actually sold for.")}${card("/sell", IC_TAG, "Sell a car", "Discover where and how to sell.")}</div>`
  });
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com/">
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="https://goasksam.com/"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
<script type="application/ld+json">${LD}</script>
${paletteHead(showPal)}${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--green-dk:#143A29;--card:#fff;--border:#D8D4CB;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${START_CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}${brandPaletteCss(crew)}${CONSENT_BANNER_CSS}</style></head><body>
${showPal ? paletteSwitcherHtml() + "\n" : ""}${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "home", crew, req, analytics: true })}
<main class="hm">${start}<div class="hm-legal"><span>&copy; GoAskSam, from The Daily Vroom</span><a href="/privacy">Privacy</a><a href="#" onclick="if(window.gasShowConsentBanner)window.gasShowConsentBanner();return false;">Privacy choices</a></div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>${START_JS}</script>
${showPal ? `<script>${PALETTE_SWITCHER_JS}</script>\n` : ""}<script>(function(){var q=document.getElementById("gst-home-q"),go=document.getElementById("gst-home-go");if(!q||!go)return;go.addEventListener("click",function(){var v=String(q.value||"").trim();if(!v){q.focus();return;}location.href="/find?q="+encodeURIComponent(v);});})();</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
${CONSENT_BANNER_HTML}
<script>${CONSENT_BANNER_JS}</script>
</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}
