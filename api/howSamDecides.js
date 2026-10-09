// /how-sam-decides (Round D follow-up, Oct 2026): rebuilt inside the shared app shell (lib/appShell.js)
// like every other product page. The old static how-sam-decides.html is retired - it loaded a
// versioned stylesheet (/styles.20260906c.css) with no matching vercel.json rewrite (only
// /styles.20260907a.css is rewritten to /styles.css), so the page served completely unstyled; its
// copy was also Sell-only, first person ("I'd sell your vehicle"), named specific venues and said
// "more sources being added". This version: one section per product (Market Check, Buy, Sell,
// Tasks), ownership-neutral, no first person, no venue names, no valuation language, no median.
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";

const TITLE = "How Sam decides | GoAskSam";
const DESC = "Every answer on GoAskSam starts with a real sale. Here is how Market Check, Buy, Sell and Tasks each use that evidence.";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const INTRO = "Every answer on GoAskSam starts with a real sale: a car that actually sold, at auction, on a date, for a price. Sam matches your car to those sales, shows you the ones that matter, and tells you what they add up to. When there is not enough to say something, Sam says that instead.";

const BUILT_INHOUSE = { headline: "Built in house.", body: "Every answer on GoAskSam comes from one engine we built ourselves, with our own rules and algorithms for which sales count as cars like yours and which get set aside. Buy, Sell, Market Check and Tasks all use it, so the same car gets the same answer wherever you ask. If the sales aren't there, Sam says so instead of guessing." };

const SECTIONS = [
  { name: "Market Check", headline: "What cars like yours are bringing.", body: "Sam matches like with like: same model, same generation, same body, same gearbox, and the same trim when it changes the price. A GT3 is not a Carrera. From those sales Sam shows the range where most of them landed, the count behind it, and the closest sales with the photo, date and venue attached. Sales that sat far outside the range are shown separately and never used to set it. If your car is a different trim from the one Sam assumed, you can switch with one tap and the whole answer reruns. A VIN tells Sam whether that exact car has sold before." },
  { name: "Buy", headline: "What is live, and what it means.", body: "Sam searches the live collector car auctions and shows only the cars that fit what you asked. Nothing is added to fill the page. When a search is wide, Sam asks one question at a time, with the count behind each answer. Every live car carries what similar cars sold for, so the bid is never just a number, and when the same car has been to auction before, Sam says so. A car that does not state its colour, gearbox or mileage is never counted as a match; Sam tells you how many of those there are and lets you see them." },
  { name: "Sell", headline: "Where cars like yours sell best.", body: "Sam looks at where cars like yours have sold in the recent past: how many, how consistently, and at what level. Depth matters. A venue with a long record for your kind of car counts for more than one with a couple of strong results. Sam also looks at whether most of them sold with a reserve and which day of the week the sale ended. Then Sam weighs what you have told him about timing and how involved you want to be, and names the place, with the reasons. Where a specialist has a proven record with cars like yours, Sam says so." },
  { name: "Tasks", headline: "Sam keeps looking.", body: "Tell Sam once what you want. Sam checks the market as new cars go live, matches them against exactly what you asked, and tells you only when something genuinely fits. Sam never notifies you for a car that does not state what you asked about. You can pause or stop at any time." }
];

const RULES = [
  "No guesses. Every figure is a real sale, matched to the car's trim, body and gearbox, converted at the rate on the day it sold.",
  "Nothing sponsored. No venue and no specialist can pay to be recommended.",
  "Thin data gets said, not hidden. When there are not enough sales for a range, Sam shows the sales themselves.",
  "Outliers are shown, not counted. Sales far above or below the range appear separately.",
  "Same answer everywhere. Market Check, Buy, Sell and Tasks read the same sales, with the same rules.",
  "Replicas, projects and odd sales are set aside, and Sam says when a comparison has been widened."
];

const CLOSING = "Sam is a way of reading the market, not a person. Go ask Sam.";

const CSS = `
.hd-col{max-width:1080px;margin:0 auto;padding:56px 48px 80px;display:flex;flex-direction:column;gap:0}
.hd-h1{margin:0 0 18px;font:600 44px/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A);text-wrap:balance}
.hd-intro{margin:0 0 40px;font:400 19px/1.55 var(--sans,sans-serif);color:var(--sec,#5E6B63);max-width:70ch}
.hd-inhouse{margin:0 0 34px}
.hd-inhouse .hd-headline{margin:0 0 12px}
.hd-inhouse .hd-body{max-width:74ch}
.hd-sec{padding:34px 0;border-top:1px solid var(--shell-div,#E2DED3)}
.hd-sec:first-of-type{border-top:1px solid var(--shell-div,#E2DED3)}
.hd-eyebrow{margin:0 0 8px;font:600 13px/1.4 var(--sans,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--green,#1E4D38)}
.hd-headline{margin:0 0 12px;font:600 26px/1.3 var(--serif,Georgia,serif);color:var(--ink,#15201A)}
.hd-body{margin:0;font:400 17px/1.6 var(--sans,sans-serif);color:var(--ink,#15201A);max-width:74ch}
.hd-rules{margin:12px 0 0;padding:0 0 0 20px;font:400 17px/1.6 var(--sans,sans-serif);color:var(--ink,#15201A);max-width:74ch;display:flex;flex-direction:column;gap:10px}
.hd-rules li{padding-left:4px}
.hd-close{margin:40px 0 0;padding-top:34px;border-top:1px solid var(--shell-div,#E2DED3);font:400 21px/1.5 var(--serif,Georgia,serif);color:var(--soft,#3C4942)}
@media (max-width:640px){
  .hd-col{padding:32px 20px 56px}
  .hd-h1{font-size:32px}
  .hd-intro{font-size:17px}
  .hd-headline{font-size:22px}
}`;

function page(req) {
  const crew = isCrewRequest(req);
  const sections = SECTIONS.map(s => `<section class="hd-sec"><p class="hd-eyebrow">${esc(s.name)}</p><h2 class="hd-headline">${esc(s.headline)}</h2><p class="hd-body">${esc(s.body)}</p></section>`).join("");
  const rules = `<section class="hd-sec"><p class="hd-eyebrow">Rules Sam never breaks</p><ul class="hd-rules">${RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul></section>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com/how-sam-decides">
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="https://goasksam.com/how-sam-decides"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "how" })}
<main><div class="hd-col">
<h1 class="hd-h1">How Sam decides.</h1>
<p class="hd-intro" data-lead-sentence>${esc(INTRO)}</p>
<div class="hd-inhouse"><h2 class="hd-headline">${esc(BUILT_INHOUSE.headline)}</h2><p class="hd-body">${esc(BUILT_INHOUSE.body)}</p></div>
${sections}
${rules}
<p class="hd-close">${esc(CLOSING)}</p>
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
  // Same no-Vary reasoning as the other shared-shell pages: the public response is identical for
  // every anonymous visitor, so it is safely edge-cacheable with no Vary at all.
  res.setHeader("Cache-Control", crew ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
