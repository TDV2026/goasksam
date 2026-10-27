// /about (Sam, Oct 25 2026): moved from a static page into the shared app shell (lib/appShell.js) like How Sam decides, so it
// carries the same left rail (no active item) and the same mobile menu. Copy is the page's own; the sections other than What this is, Who's behind it
// and How it works are word for word what the static page said. No first person, no engine figure on the page.
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";

const TITLE = "About GoAskSam";
const DESC = "GoAskSam reads real auction sales to show what cars are bringing, find live cars that fit, and tell you where to sell. Built by the team behind The Daily Vroom.";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const WHAT = "GoAskSam is market intelligence for enthusiast cars, built on real auction sales. Every answer starts with a car that actually sold, on a date, for a price. Sam matches your car to those sales and tells you what they add up to. If the sales are not there, Sam says so instead of guessing.";
const PRODUCTS = [
  ["Market Check", "what cars like yours are bringing, as a range with the count and the closest sales behind it."],
  ["Find", "the live cars that fit exactly what you asked, each with what similar cars sold for."],
  ["Sell", "where cars like yours sell best, and why."],
  ["Tasks", "tell Sam once what you want, and Sam keeps looking and tells you when something genuinely fits."]
];
const HOW = "Sam matches your car to real sales: same model, generation, body and gearbox, and the same trim when it changes the price. From those sales, our own rules and methodology work out the range, the count, the closest sales and where cars like yours sell best, the same way every time, in all four products. We use AI for the conversation: it helps Sam understand what you typed and explains what the engine found. AI never sets a price, a range, a count, which sales are set aside, or where to sell. New sales are added every day. When the exact match is thin, Sam widens the read a step at a time and says so, rather than dressing up a guess as a certainty.";
const NEVER = "Sam never invents a number. Every figure you see comes from a real recorded sale. GoAskSam does not appraise your car or put a value on it: it shows you what cars like yours actually sold for, with the sales behind it. It never sends your details out to a list of buyers, never claims a platform gets you more money than the evidence actually shows, and never emails you about a car that does not match what you asked for. When the read is less certain, Sam says so plainly.";
const STAND = "We are independent and sales first. Nobody pays to be recommended, and nothing on GoAskSam is sponsored. Every answer follows the sales record, not a relationship: what a car is bringing, which live cars fit what you asked, and where to sell all come from the same real sales. It is the same call we would make on our own car. If the numbers say to list it yourself, that is exactly what Sam will tell you. If the sales are not there, Sam says that instead.";

const CSS = `
.ab-col{max-width:760px;margin:0 auto;padding:56px 48px 80px}
.ab-h1{margin:0 0 20px;font:600 44px/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A);text-wrap:balance}
.ab-h2{margin:34px 0 10px;font:600 24px/1.3 var(--serif,Georgia,serif);color:var(--ink,#15201A)}
.ab-col p{margin:0 0 14px;font:400 17px/1.65 var(--sans,sans-serif);color:var(--ink,#15201A)}
.ab-list{margin:0 0 14px;padding:0 0 0 20px;font:400 17px/1.6 var(--sans,sans-serif);display:flex;flex-direction:column;gap:8px}
.ab-list b{font-weight:600}
.ab-col a.inline{color:var(--green,#1E4D38);text-decoration:underline}
@media (max-width:640px){.ab-col{padding:32px 20px 56px}.ab-h1{font-size:32px}.ab-h2{font-size:22px}}`;

function page(req) {
  const crew = isCrewRequest(req);
  const list = `<ul class="ab-list">${PRODUCTS.map(([n, t]) => `<li><b>${esc(n)}:</b> ${esc(t)}</li>`).join("")}</ul>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com/about">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "", crew, req, analytics: true })}
<main><div class="ab-col">
<h1 class="ab-h1">About GoAskSam</h1>
<p class="ab-free" style="margin:0 0 22px"><b>Sam is free to use. Built for the community, from The Daily Vroom.</b></p>
<h2 class="ab-h2">What this is</h2>
<p data-lead-sentence>${esc(WHAT)}</p>
${list}
<h2 class="ab-h2">Who's behind it</h2>
<p>GoAskSam is built by the team behind <a class="inline" href="https://thedailyvroom.com" rel="noopener">The Daily Vroom</a>, the incredibly popular collector car newsletter that has tracked this market every day for years. GoAskSam puts that same daily attention to real results to work for you: what cars like yours are bringing, which live cars are worth your time, and where to sell.</p>
<h2 class="ab-h2">How it works</h2>
<p>${esc(HOW)}</p>
<h2 class="ab-h2">What it will never do</h2>
<p>${esc(NEVER)}</p>
<h2 class="ab-h2">Where we stand</h2>
<p>${esc(STAND)}</p>
</div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
</body></html>`;
  return { html, crew };
}

export default async function handler(req, res) {
  const { html, crew } = page(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  // The same caching rule as How Sam decides (api/howSamDecides.js): the rail is filtered by isReleased(), so public caching is only safe
  // once the site is fully launched and the request carries no crew cookie or server credential.
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}
