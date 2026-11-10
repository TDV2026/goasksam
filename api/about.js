// /about (Sam, Oct 25 2026): moved from a static page into the shared app shell (lib/appShell.js) like How Sam decides, so it
// carries the same left rail (no active item) and the same mobile menu. Copy is the page's own; the sections other than What this is, Who's behind it
// and How it works are word for word what the static page said. No first person, no engine figure on the page.
import { copy, copyText } from "../lib/copy.js";
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";

const TITLE = copy("about.TITLE");
const DESC = copy("about.DESC");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const WHAT = copy("about.WHAT");
const PRODUCTS = copy("about.PRODUCTS");
const HOW = copy("about.HOW");
const NEVER = copy("about.NEVER");
const STAND = copy("about.STAND");

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
<h1 class="ab-h1">${copyText("about.H1")}</h1>
<p class="ab-free" style="margin:0 0 22px"><b>${copyText("about.FREE")}</b></p>
<p class="ab-cover" style="margin:-10px 0 22px">${copyText("about.COVER")}</p>
<h2 class="ab-h2">${copyText("about.H2_WHAT")}</h2>
<p data-lead-sentence>${esc(WHAT)}</p>
${list}
<h2 class="ab-h2">${copyText("about.H2_WHO")}</h2>
<p>${copyText("about.WHO_BEFORE")}<a class="inline" href="https://thedailyvroom.com" rel="noopener">${copyText("about.WHO_LINK")}</a>${copyText("about.WHO_AFTER")}</p>
<h2 class="ab-h2">${copyText("about.H2_HOW")}</h2>
<p>${esc(HOW)}</p>
<h2 class="ab-h2">${copyText("about.H2_NEVER")}</h2>
<p>${esc(NEVER)}</p>
<h2 class="ab-h2">${copyText("about.H2_STAND")}</h2>
<p>${esc(STAND)}</p>
<p class="ab-hist">${copyText("about.HISTORY_BEFORE")}<a class="inline" href="/history">${copyText("about.HISTORY_LINK")}</a>${copyText("about.HISTORY_AFTER")}</p>
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
