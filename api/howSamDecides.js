// /how-sam-decides (Round D follow-up, Oct 2026): rebuilt inside the shared app shell (lib/appShell.js)
// like every other product page. The old static how-sam-decides.html is retired - it loaded a
// versioned stylesheet (/styles.20260906c.css) with no matching vercel.json rewrite (only
// /styles.20260907a.css is rewritten to /styles.css), so the page served completely unstyled; its
// copy was also Sell-only, first person ("I'd sell your vehicle"), named specific venues and said
// "more sources being added". This version: one section per product (Market Check, Buy, Sell,
// Tasks), ownership-neutral, no first person, no venue names, no valuation language, no median.
import { copy, copyText } from "../lib/copy.js";
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { withNewDesign } from "../lib/_newDesign.js";

const TITLE = copy("howSamDecides.TITLE");
const DESC = copy("howSamDecides.DESC");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The six sections (Sam, Oct 26 and 28 2026, exact copy; every earlier line on this page is gone). Plain text, no icons. The page describes the engine and
// computes nothing. Section 2 keeps its own wording because Market Check shows a candle panel (public/js/onebox.js candleChartHtml, 3+ candles).
const PARTS = copy("howSamDecides.PARTS");

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
.hd-never{margin:12px 0 0;padding:0;list-style:none;font:400 17px/1.6 var(--sans,sans-serif);color:var(--ink,#15201A);max-width:74ch;display:flex;flex-direction:column;gap:8px}
.hd-nv{color:var(--amber)}
.hd-p+.hd-p{margin-top:14px}
.hd-close{margin:40px 0 0;padding-top:34px;border-top:1px solid var(--shell-div,#E2DED3);font:400 21px/1.5 var(--serif,Georgia,serif);color:var(--soft,#3C4942)}
@media (max-width:640px){
  .hd-col{padding:32px 20px 56px}
  .hd-h1{font-size:32px}
  .hd-intro{font-size:17px}
  .hd-headline{font-size:22px}
}`;

function page(req) {
  const crew = isCrewRequest(req);
  const body = PARTS.map((x, n) => `<section class="hd-sec"><h2 class="hd-headline">${esc(x.h)}</h2>${x.never ? `<ul class="hd-never">${x.never.map(l => `<li><span class="hd-nv">Never</span> ${esc(l)}</li>`).join("")}</ul>` : x.p.map((t, k) => `<p class="hd-body hd-p"${n === 0 && k === 0 ? " data-lead-sentence" : ""}>${esc(t)}</p>`).join("")}</section>`).join("");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com/how-sam-decides">
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="https://goasksam.com/how-sam-decides"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--amber:#9a6000;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "how", crew, req, analytics: true })}
<main><div class="hd-col">
<h1 class="hd-h1">${copyText("howSamDecides.H1")}</h1>
${body}
<p class="hd-body hd-p hd-hist">${copyText("howSamDecides.HISTORY_BEFORE")}<a href="/history">${copyText("howSamDecides.HISTORY_LINK")}</a>${copyText("howSamDecides.HISTORY_AFTER")}</p>
</div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
</body></html>`;
  return { html, crew };
}

async function handler(req, res) {
  const { html, crew } = page(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  // Same no-Vary reasoning as the other shared-shell pages: the public response is identical for
  // every anonymous visitor, so it is safely edge-cacheable with no Vary at all.
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  // LAUNCH-STAGE SAFETY (Oct 2026, production incident, api/marketCheck.js has the full writeup):
  // this page's own rail is filtered by isReleased() - public caching at all is only safe once
  // fullyLaunched() is true and the request carries no server credential (so an ops/probe stage
  // override never seeds the shared cache with a simulated state).
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}
export default withNewDesign("how", handler);
