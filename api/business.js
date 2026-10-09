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

const SUB = "The market record for enthusiast and collector cars. Every number traces back to a real sale, with the receipt attached.";

const WAYS_IN = [
  { icon: "desk", name: "Sam Desk", body: "Ask anything about the market in plain words and get the answer with the sales behind it. Slice by model, era, venue and sale type. Open any number to see which sales are in it and which were set aside, and why. Export the answer with its receipts." },
  { icon: "inbox", name: "Leads and inbound", body: "Send in the cars that cross your desk. Each one comes back with the closest sales and the range most sales landed in, so your team can sort a pile of submissions fast and answer each one properly." },
  { icon: "plug", name: "In your own system", body: "One car at a time, straight into your quote, loan or consignment flow. The range, the number of sales behind it, the dates and the receipts. Built to sit inside your own quote, loan or consignment flow." }
];

const AGENTS = [
  { icon: "sort", text: "Sort my inbound. Every submission checked against recent sales and ranked for your team." },
  { icon: "doc", text: "Build a consignment pitch. The record for the car, ready to put in front of the owner." },
  { icon: "check", text: "Check my book. A list of vehicles read against recent sales, with the ones that moved flagged." }
];

const WHO_FOR = [
  { name: "Auction platforms and houses", body: "sort inbound, prepare consignments, see where you stand." },
  { name: "Insurers and lenders", body: "a defensible reference on every vehicle, with the evidence to show customers and auditors." },
  { name: "Dealers and consignors", body: "the recent sales record behind a number, not a guess." },
  { name: "Advisers, funds and manufacturers", body: "the market record for enthusiast cars, ready to build on." }
];

const WHY = [
  "Built entirely from completed sales.",
  "Open any number to see its sales.",
  "Cars that do not belong are set aside, and the reason is shown.",
  "Every venue read on the same basis.",
  "Where sales are thin, Sam says so instead of guessing.",
  "Built in house, on the same engine as Buy, Sell, Market Check and Tasks, so the answers always agree."
];

const ICON = {
  desk: '<svg viewBox="0 0 24 24"><path d="M4 18V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v11M2 18h20M9 11l2 2 4-4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 4h16l-1.5 13a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4 4Z"/><path d="M4 12h5l1 2h4l1-2h5"/></svg>',
  plug: '<svg viewBox="0 0 24 24"><path d="M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0V8Z"/><path d="M12 18v3"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M6 8h12M6 12h8M6 16h4"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7V3Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/><path d="M19 15l2 2 3-3" transform="translate(-4 2)"/></svg>'
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
.biz-ways{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.biz-card{background:var(--card);border:1px solid var(--div);border-radius:16px;padding:26px 22px;box-shadow:0 10px 24px -18px rgba(21,32,26,.35)}
.biz-ic{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--tint);margin-bottom:16px}
.biz-ic svg{width:30px;height:30px;fill:none;stroke:var(--green);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.biz-card h3{margin:0 0 8px;font:500 19px/1.3 var(--serif);color:var(--ink)}
.biz-card p{margin:0;font:400 15px/1.55 var(--sans);color:var(--soft)}
.biz-agents{display:flex;flex-direction:column;gap:16px}
.biz-agent{display:flex;align-items:flex-start;gap:16px}
.biz-agent .biz-ic{flex:none;width:44px;height:44px;margin-bottom:0}
.biz-agent .biz-ic svg{width:22px;height:22px}
.biz-agent p{margin:0;padding-top:8px;font:400 17px/1.5 var(--sans);color:var(--ink)}
.biz-who{display:grid;grid-template-columns:1fr 1fr;gap:18px 32px}
.biz-who-item{padding:4px 0}
.biz-who-item b{display:block;margin:0 0 4px;font:600 16px/1.4 var(--sans);color:var(--ink)}
.biz-who-item span{font:400 15px/1.55 var(--sans);color:var(--soft)}
.biz-why{margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:10px;font:400 17px/1.55 var(--sans);color:var(--ink);max-width:70ch}
.biz-ex{margin-top:28px;background:var(--tint);border:1px solid var(--tint-line);border-radius:16px;padding:26px 28px}
.biz-ex-lab{margin:0 0 6px;font:600 13px/1.4 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.biz-ex-name{margin:0 0 4px;font:400 16px/1.4 var(--sans);color:var(--soft)}
.biz-ex-range{margin:0 0 4px;font:600 36px/1.1 var(--serif);color:var(--green)}
.biz-ex-range .to{font-weight:400;font-size:24px;color:var(--sec)}
.biz-ex-count{margin:0 0 20px;font:400 15px/1.4 var(--sans);color:var(--sec)}
.biz-ex-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.biz-ex-card{background:var(--card);border:1px solid var(--div);border-radius:12px;overflow:hidden;text-decoration:none;display:block}
.biz-ex-ph{display:block;width:100%;aspect-ratio:16/10;background:var(--border);object-fit:cover}
.biz-ex-body{padding:12px 14px}
.biz-ex-price{font:600 17px/1.2 var(--serif);color:var(--ink)}
.biz-ex-title{margin:4px 0 0;font:400 13px/1.4 var(--sans);color:var(--soft)}
.biz-close{margin-top:28px;padding:30px 32px;background:var(--card);border:1px solid var(--div);border-radius:16px}
.biz-close h2{margin:0 0 10px;font:600 24px/1.3 var(--serif);color:var(--ink)}
.biz-close p{margin:0 0 18px;font:400 16px/1.55 var(--sans);color:var(--soft);max-width:60ch}
.biz-close-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.biz-close-mail{font:500 15px var(--sans);color:var(--green)}
@media (max-width:860px){
  .biz-ways{grid-template-columns:1fr}
  .biz-who{grid-template-columns:1fr}
  .biz-ex-cards{grid-template-columns:1fr 1fr}
}
@media (max-width:640px){
  .biz-col{padding:0 20px 56px}
  .biz-h1{font-size:30px}
  .biz-sub{font-size:17px}
  .biz-sec{padding:34px 0}
  .biz-sec h2{font-size:22px}
  .biz-ex-cards{grid-template-columns:1fr}
}
${HERO_CSS}`;

function wayCardsHtml() {
  return WAYS_IN.map(w => `<div class="biz-card"><div class="biz-ic">${ICON[w.icon]}</div><h3>${esc(w.name)}</h3><p>${esc(w.body)}</p></div>`).join("");
}
function agentLinesHtml() {
  return AGENTS.map(a => `<div class="biz-agent"><div class="biz-ic">${ICON[a.icon]}</div><p>${esc(a.text)}</p></div>`).join("");
}
function whoHtml() {
  return WHO_FOR.map(w => `<div class="biz-who-item"><b>${esc(w.name)}</b><span>${esc(w.body)}</span></div>`).join("");
}
function whyHtml() {
  return `<ul class="biz-why">${WHY.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
}

// The example panel: the SAME reduced object Market Check's own landing example reads (same spec_key,
// same cache, same engine). A static summary only (range, sale count, the closest few receipts) - no
// interactive chips here, this page never asks a question. Left out entirely when the engine has
// nothing to show, rather than ever inventing a figure.
function examplePanelHtml(ex) {
  if (!ex || !Array.isArray(ex.cluster) || ex.cluster.length !== 2 || !Array.isArray(ex.cards) || !ex.cards.length) return "";
  const cards = ex.cards.slice(0, 3).map(c => {
    const img = c.image ? `<img class="biz-ex-ph" src="${esc(c.image)}" alt="" loading="lazy">` : '<span class="biz-ex-ph"></span>';
    const meta = [c.mileageText, c.platform, c.month].filter(Boolean).join(" · ");
    return `<a class="biz-ex-card" href="${esc(c.url || "#")}" target="_blank" rel="noopener noreferrer">${img}<div class="biz-ex-body"><div class="biz-ex-price">${esc(usd(c.price))}</div><div class="biz-ex-title">${esc(c.title || "")}</div><div class="biz-ex-title">${esc(meta)}</div></div></a>`;
  }).join("");
  return `<div class="biz-ex"><p class="biz-ex-lab">An example</p><p class="biz-ex-name">${esc(ex.name)}</p>` +
    `<p class="biz-ex-range">${esc(usd(ex.cluster[0]))} <span class="to">to</span> ${esc(usd(ex.cluster[1]))}</p>` +
    `<p class="biz-ex-count">${esc(ex.cards.length)} sale${ex.cards.length === 1 ? "" : "s"}${ex.windowLabel ? " in " + esc(ex.windowLabel) : ""}.</p>` +
    `<div class="biz-ex-cards">${cards}</div></div>`;
}

async function page(req) {
  const crew = isCrewRequest(req);
  const env = supabaseEnv();
  const [updated, ex] = await Promise.all([
    lastUpdatedDate(env).catch(() => null),
    marketCheckExample(4000).catch(() => null)
  ]);
  const heroInner = `<p class="biz-eyebrow">For business${updated ? ". Updated " + esc(updated) : ""}</p>` +
    `<h1 class="biz-h1">GoAskSam for business</h1><p class="biz-sub">${esc(SUB)}</p>` +
    `<div class="biz-ctas"><a class="biz-btn" href="${mailHref("GoAskSam for business")}">Request a walkthrough</a><a class="biz-quiet" href="/how-sam-decides">How Sam decides</a></div>`;
  const body = `<main><div class="biz-col">` +
    heroHtml(heroInner, { alt: "A collector car", layout: "banner" }) +
    `<section class="biz-sec"><h2>Three ways in.</h2><div class="biz-ways">${wayCardsHtml()}</div></section>` +
    `<section class="biz-sec"><h2>Agents with one job each.</h2><div class="biz-agents">${agentLinesHtml()}</div></section>` +
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
