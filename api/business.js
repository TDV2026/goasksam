// /business (GoAskSam for business) - rebuilt inside the shared app shell (lib/appShell.js), Oct 2026.
// Replaces the old static business.html (its own token system, no rail, no sign-in). URL, title and
// canonical kept byte-identical to the previous page. The example panel runs the SAME engine call
// Market Check's own landing uses (lib/live/marketCheckExample.js, the SAME cached spec_key) - never
// a second implementation, never a typed-in figure.
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { heroHtml, HERO_CSS } from "../lib/heroImage.js";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { marketCheckExample } from "../lib/live/marketCheckExample.js";

const TITLE = "GoAskSam for business";
const DESC = "GoAskSam for business: transaction-derived reference values built entirely from real completed sales, with the band, the count, the window and the receipts attached. For insurers, lenders and dealers.";
const SITE = "https://goasksam.com";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const mailHref = subject => `mailto:feedback@goasksam.com?subject=${encodeURIComponent(subject)}`;

const YOUR_RESULTS_RAIL = '<a class="gas-navitem" id="gas-nav-results" href="#" style="display:none">Your results</a><div class="gas-submenu" id="gas-results-menu"></div>';

// Sub copy (item 1): the referenceFigure-aware line when the engine returns one, the archive-only
// fallback otherwise. Computed per request from the SAME example read as the panel below (zero
// extra engine calls) - never a second guess at whether the field exists.
const SUB_WITH_FIGURE = "One reference figure for any enthusiast or collector car, with the range and the sales behind it. For the people who have to stand behind a number.";
const SUB_FALLBACK = "A reference you can stand behind for any enthusiast or collector car, with the range and the sales that back it.";

const PROBLEMS = [
  { icon: "shield", name: "Cover that holds up in a claim.", body: "Set the sum insured from sales that actually closed, with the receipts to show the customer why." },
  { icon: "scale", name: "Lending on a car with no obvious price.", bodyFigure: "A reference figure and the range around it for any enthusiast car, before you set the loan.", bodyFallback: "The range most sales landed in and the sales behind it, for any enthusiast car, before you set the loan." },
  { icon: "book", name: "A book that moves.", body: "Run every car you cover or hold against last night's sales and see which ones moved, so renewals and loan reviews start from what changed." },
  { icon: "check", name: "A number your auditor will accept.", body: "Every figure opens to the sales behind it. Cars that do not belong are set aside and the reason is shown." },
  { icon: "slash", name: "No guess in your file.", body: "Where there are not enough sales to say, you get a plain answer that there is not enough, never a made-up figure." },
  { icon: "plug", name: "Fits how you work.", body: "Inside your quote or loan flow, or for your team to use directly." }
];

const HOW_YOU_USE = [
  { icon: "chat", text: "Ask it in plain words" },
  { icon: "list", text: "Send it a list of cars" },
  { icon: "plug", text: "Build it into your own system" }
];

const WHO_FOR = [
  { name: "Insurers", body: "a sum insured you can defend, with the sales behind it." },
  { name: "Lenders and finance", body: "a reference figure and the range around it before you set the loan." },
  { name: "Auction platforms and houses", body: "sort inbound, prepare consignments, see where you stand." },
  { name: "Dealers, advisers and funds", body: "the recent sales record behind a number, not a guess." }
];

const WHY = [
  "Built entirely from completed sales.",
  "Updated every night.",
  "Where sales are thin, Sam says so instead of guessing.",
  "Built in house, on the same engine as Buy, Sell, Market Check and Tasks, so the answers always agree."
];

const ICON = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><path d="M12 3v18M7 7h10M4 7l3-4 3 4-3 5-3-5Zm10 0l3-4 3 4-3 5-3-5Z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5c2-1 5-1 7 0v14c-2-1-5-1-7 0V5Z"/><path d="M20 5c-2-1-5-1-7 0v14c2-1 5-1 7 0V5Z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M7 3h10l4 4v14H7V3Z"/><path d="M11 3v5h5M8 13l2.5 2.5L16 10"/></svg>',
  slash: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
  plug: '<svg viewBox="0 0 24 24"><path d="M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0V8Z"/><path d="M12 18v3"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>'
};

const CSS = `
:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--green-dk:#15372A;--page:#F6F3EC;--card:#FFFFFF;--div:#E2DED3;--border:#DCD8CC;--tint:#EDF3EE;--tint-line:#D5E2D8;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--main-bg,var(--page));color:var(--ink);font:400 17px/1.5 var(--sans)}
a{color:var(--green)}a:hover{color:var(--green-dk)}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.biz-col{max-width:1080px;margin:0 auto;padding:0 48px 80px}
.biz-eyebrow{margin:0 0 10px;padding:24px 0 0;font:500 14px/1.4 var(--sans);color:var(--sec)}
.biz-h1{margin:0 0 14px;font:600 clamp(34px,4.2vw,48px)/1.1 var(--serif);letter-spacing:-.02em;color:var(--ink);text-wrap:balance}
.biz-sub{margin:0 0 26px;font:400 19px/1.5 var(--sans);color:var(--soft);max-width:60ch}
.biz-ctas{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:0 0 36px}
.biz-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:12px;background:var(--green);color:#fff;font:600 16px var(--sans);text-decoration:none}
.biz-btn:hover{background:var(--green-dk);color:#fff}
.biz-quiet{font:600 15px/1 var(--sans);color:var(--green);text-decoration:underline;text-underline-offset:3px}
.biz-sec{padding:44px 0;border-top:1px solid var(--div)}
.biz-sec h2{margin:0 0 22px;font:600 26px/1.3 var(--serif);color:var(--ink)}
.biz-problems{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.biz-card{background:var(--card);border:1px solid var(--div);border-radius:16px;padding:26px 22px;box-shadow:0 10px 24px -18px rgba(21,32,26,.35)}
.biz-ic{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--tint);margin-bottom:16px}
.biz-ic svg{width:30px;height:30px;fill:none;stroke:var(--green);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.biz-card h3{margin:0 0 8px;font:500 19px/1.3 var(--serif);color:var(--ink)}
.biz-card p{margin:0;font:400 15px/1.55 var(--sans);color:var(--soft)}
.biz-howuse-lab{margin:36px 0 14px;font:600 13px/1.4 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec)}
.biz-howuse{display:flex;gap:28px;flex-wrap:wrap;padding:20px 0;border-top:1px solid var(--div)}
.biz-howuse-item{display:flex;align-items:center;gap:12px;font:500 15px/1.4 var(--sans);color:var(--ink)}
.biz-howuse-item .biz-ic{width:36px;height:36px;margin-bottom:0;flex:none}
.biz-howuse-item .biz-ic svg{width:18px;height:18px}
.biz-who{display:grid;grid-template-columns:1fr 1fr;gap:18px 32px}
.biz-who-item{padding:4px 0}
.biz-who-item b{display:block;margin:0 0 4px;font:600 16px/1.4 var(--sans);color:var(--ink)}
.biz-who-item span{font:400 15px/1.55 var(--sans);color:var(--soft)}
.biz-why{margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:10px;font:400 17px/1.55 var(--sans);color:var(--ink);max-width:70ch}
.biz-ex{margin-top:28px;background:var(--tint);border:1px solid var(--tint-line);border-radius:16px;padding:26px 28px}
.biz-ex-lab{margin:0 0 6px;font:600 13px/1.4 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.biz-ex-name{margin:0 0 4px;font:400 16px/1.4 var(--sans);color:var(--soft)}
.biz-ex-figlab{margin:0 0 2px;font:600 12px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec)}
.biz-ex-range{margin:0 0 4px;font:600 36px/1.1 var(--serif);color:var(--green)}
.biz-ex-range .to{font-weight:400;font-size:24px;color:var(--sec)}
.biz-ex-count{margin:0 0 10px;font:400 15px/1.4 var(--sans);color:var(--sec)}
.biz-ex-opens{margin:0;font:400 15px/1.4 var(--sans);color:var(--soft)}
.biz-close{margin-top:28px;padding:30px 32px;background:var(--card);border:1px solid var(--div);border-radius:16px}
.biz-close h2{margin:0 0 10px;font:600 24px/1.3 var(--serif);color:var(--ink)}
.biz-close p{margin:0 0 18px;font:400 16px/1.55 var(--sans);color:var(--soft);max-width:60ch}
.biz-close-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.biz-close-mail{font:500 15px var(--sans);color:var(--green)}
@media (max-width:860px){
  .biz-problems{grid-template-columns:1fr 1fr}
  .biz-who{grid-template-columns:1fr}
}
@media (max-width:640px){
  .biz-col{padding:0 20px 56px}
  .biz-h1{font-size:30px}
  .biz-sub{font-size:17px}
  .biz-sec{padding:34px 0}
  .biz-sec h2{font-size:22px}
  .biz-problems{grid-template-columns:1fr}
  .biz-howuse{gap:16px;flex-direction:column}
}
${HERO_CSS}`;

function problemCardsHtml(hasFigure) {
  return PROBLEMS.map(p => {
    const body = p.bodyFigure ? (hasFigure ? p.bodyFigure : p.bodyFallback) : p.body;
    return `<div class="biz-card"><div class="biz-ic">${ICON[p.icon]}</div><h3>${esc(p.name)}</h3><p>${esc(body)}</p></div>`;
  }).join("");
}
function howUseHtml() {
  return `<p class="biz-howuse-lab">How you use it</p><div class="biz-howuse">${HOW_YOU_USE.map(h => `<div class="biz-howuse-item"><div class="biz-ic">${ICON[h.icon]}</div><span>${esc(h.text)}</span></div>`).join("")}</div>`;
}
function whoHtml() {
  return WHO_FOR.map(w => `<div class="biz-who-item"><b>${esc(w.name)}</b><span>${esc(w.body)}</span></div>`).join("");
}
function whyHtml() {
  return `<ul class="biz-why">${WHY.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
}

// The example panel: the SAME reduced object Market Check's own landing example reads (same spec_key,
// same cache, same engine). A customer-facing summary only (the car, the range or figure, the sale
// count and window, one line about how every figure works) - no car cards, no link, this page shows
// what a customer sees, not the evidence browser. Left out entirely when the engine has nothing to
// show, rather than ever inventing a figure.
function examplePanelHtml(ex) {
  if (!ex || !Array.isArray(ex.cluster) || ex.cluster.length !== 2 || !Array.isArray(ex.cards) || !ex.cards.length) return "";
  const rf = ex.referenceFigure;
  const rangeHtml = rf
    ? `<p class="biz-ex-figlab">Reference figure</p><p class="biz-ex-range">${esc(usd(rf.amount))}</p><p class="biz-ex-count">Range ${esc(usd(ex.cluster[0]))} to ${esc(usd(ex.cluster[1]))}</p>`
    : `<p class="biz-ex-range">${esc(usd(ex.cluster[0]))} <span class="to">to</span> ${esc(usd(ex.cluster[1]))}</p>`;
  return `<div class="biz-ex"><p class="biz-ex-lab">An example</p><p class="biz-ex-name">${esc(ex.name)}</p>` +
    rangeHtml +
    `<p class="biz-ex-count">${esc(ex.cards.length)} sale${ex.cards.length === 1 ? "" : "s"}${ex.windowLabel ? " in " + esc(ex.windowLabel) : ""}.</p>` +
    `<p class="biz-ex-opens">Every figure opens to the sales behind it.</p></div>`;
}

async function page(req) {
  const crew = isCrewRequest(req);
  const env = supabaseEnv();
  const [updated, ex] = await Promise.all([
    lastUpdatedDate(env).catch(() => null),
    marketCheckExample(4000).catch(() => null)
  ]);
  const hasFigure = !!(ex && ex.referenceFigure);
  const sub = hasFigure ? SUB_WITH_FIGURE : SUB_FALLBACK;
  const heroInner = `<p class="biz-eyebrow">For business${updated ? ". Updated " + esc(updated) : ""}</p>` +
    `<h1 class="biz-h1">GoAskSam for business</h1><p class="biz-sub">${esc(sub)}</p>` +
    `<div class="biz-ctas"><a class="biz-btn" href="${mailHref("GoAskSam for business")}">Request a walkthrough</a><a class="biz-quiet" href="/how-sam-decides">How Sam decides</a></div>`;
  const body = `<main><div class="biz-col">` +
    heroHtml(heroInner, { alt: "A collector car", layout: "banner" }) +
    `<section class="biz-sec"><h2>The problems it solves.</h2><div class="biz-problems">${problemCardsHtml(hasFigure)}</div>${howUseHtml()}</section>` +
    `<section class="biz-sec"><h2>Who it is for.</h2><div class="biz-who">${whoHtml()}</div></section>` +
    `<section class="biz-sec"><h2>Why it holds up.</h2>${whyHtml()}${examplePanelHtml(ex)}</section>` +
    `<div class="biz-close"><h2>Talk to us.</h2><p>Tell us the volume and the kinds of cars you cover and we will show you what the record looks like for your cars.</p>` +
    `<div class="biz-close-row"><a class="biz-btn" href="${mailHref("GoAskSam for business")}">Request a walkthrough</a><a class="biz-close-mail" href="${mailHref("GoAskSam for business")}">feedback@goasksam.com</a></div></div>` +
    `</div></main>${SHELL_MAIN_CLOSE}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${SITE}/business">
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="${SITE}/business"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "business", pageExtra: YOUR_RESULTS_RAIL, crew })}
${body}
<script>${SHELL_JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
</body></html>`;
  return { html, crew };
}

export default async function handler(req, res) {
  const { html, crew } = await page(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  res.setHeader("Cache-Control", crew ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
