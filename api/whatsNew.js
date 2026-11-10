// /whats-new (Lane E, Oct 31 2026, Sam's order): "What's new", the plain log of what changed on GoAskSam, newest first. The same shell, type and rail as About and How Sam decides,
// one column about 640px wide. The entries come from data/whatsNew.json through lib/whatsNew.js and nothing is computed here; with no file or no entries the page is the heading, the intro and the foot.
import { copy, copyText } from "../lib/copy.js";
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { whatsNewGroups, dateHeading } from "../lib/whatsNew.js";
import { withNewDesign } from "../lib/_newDesign.js";

const TITLE = copy("whatsNew.TITLE");
const INTRO = copy("whatsNew.INTRO");
const DESC = INTRO;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
.wn-col{max-width:640px;margin:0 auto;padding:56px 48px 80px}
.wn-h1{margin:0 0 12px;font:600 44px/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A);text-wrap:balance}
.wn-intro{margin:0 0 36px;font:400 17px/1.5 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.wn-group{margin:0 0 26px}
.wn-group+.wn-group{border-top:1px solid var(--shell-div,#E2DED3);padding-top:24px}
.wn-date{margin:0 0 16px;font:500 13px/1.3 var(--sans,sans-serif);letter-spacing:.08em;font-variant-caps:all-small-caps;color:var(--sec,#5E6B63)}
.wn-e{position:relative;margin:0 0 1.5em;font:400 18px/1.5 var(--serif,Georgia,serif);color:var(--ink,#15201A)}
.wn-e:last-child{margin-bottom:0}
.wn-e::before{content:"";position:absolute;left:-18px;top:.62em;width:6px;height:6px;border-radius:50%;background:var(--green,#1E4D38)}
.wn-ti{font-weight:600}
.wn-th{font:400 14px/1.4 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.wn-foot{margin:40px 0 0;font:400 15px/1.5 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.wn-foot a{color:var(--green,#1E4D38);text-decoration:underline}
@media (max-width:640px){.wn-col{padding:32px 20px 56px 32px}.wn-h1{font-size:32px}.wn-e::before{left:-14px}}`;

// a titled entry is its title as one line, then each of its lines as a line of its own (same dot, same air); a plain entry is one line
const thanksHtml = e => e.thanks ? ` <span class="wn-th">${esc(e.thanks)}</span>` : "";
const entryHtml = e => e.lines
  ? `<p class="wn-e wn-ti">${esc(e.title)}</p>` + e.lines.map((l, i) => `<p class="wn-e wn-ln">${esc(l)}${i === e.lines.length - 1 ? thanksHtml(e) : ""}</p>`).join("")
  : `<p class="wn-e">${esc(e.text)}${thanksHtml(e)}</p>`;
export function whatsNewPageHtml(req, entries) {
  const crew = isCrewRequest(req || {});
  const groups = whatsNewGroups(entries).map(g => `<section class="wn-group"><h2 class="wn-date">${esc(dateHeading(g.date))}</h2>${g.entries.map(entryHtml).join("")}</section>`).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://goasksam.com/whats-new">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "whatsnew", crew, req, analytics: true })}
<main><div class="wn-col">
<h1 class="wn-h1">${copyText("whatsNew.H1")}</h1>
<p class="wn-intro">${esc(INTRO)}</p>
${groups}
<p class="wn-foot">${copyText("whatsNew.FOOT_BEFORE")}<a href="/feedback">${copyText("whatsNew.FOOT_LINK")}</a>${copyText("whatsNew.FOOT_AFTER")}</p>
</div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
</body></html>`;
}

async function handler(req, res) {
  const crew = isCrewRequest(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  // the same caching rule as About and How Sam decides: the rail is filtered by isReleased(), so public caching is only safe once the site is fully launched and the request carries no crew cookie or server credential
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(whatsNewPageHtml(req));
}
export default withNewDesign("whatsnew", handler);
