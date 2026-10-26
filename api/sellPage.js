// /sell (Oct 2026, search rules 1/3/5): index.html served with the parts a crawler must see in the raw
// HTML. The registry title, the hero H1 (the same markup js/result-copy.js homeHeroHTML draws, so the
// page reads the same before and after its scripts run), and one quiet "Updated [date]" line under
// "Built for enthusiast and specialty vehicles" (the real last-updated date, lib/asOf.js
// lastUpdatedDate; no count, omitted when the date cannot be read). Edge-cached 1 hour.
import { OUTBOUND_JS } from "../lib/outboundUtm.js";
import fs from "node:fs";
import path from "node:path";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { isCrewRequest, FONT_LINKS } from "./_chrome.js";
import { isTesterRequest } from "../lib/_tester.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE, SHELL_TOKENS_CSS, brandPaletteCss, ALL_PALETTES_CSS, PALETTE_APPLY_JS } from "../lib/appShell.js";
import { gaBootstrapHtml } from "../lib/analytics.js";
import { isReleased, fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";
import { heldFor } from "../lib/_hold.js";
import { sellHeroHtml, SELL_ENTRY, SELL_ENTRY_CSS, SELL_GO_HTML } from "../lib/sell/sellEntry.js";

const TITLE = "Where to sell your collector car";
const HERO = sellHeroHtml();
let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// LAUNCH STAGE (Oct 2026, replaces the old binary PUBLIC_LAUNCH switch): strips the nav items for
// whichever products are not yet released at the current stage (lib/_launchStage.js isReleased,
// crew- and test-override-aware) - never all-or-nothing. "Where to sell" (this page), How Sam
// decides, Your results and the footer (Send feedback/Privacy/About) are stage-0 (always on) and
// never touched. PowerSellers has no nav link on this page at all (removed, see index.html).
// Each item removed by its own href so a copy/markup change elsewhere can never silently stop
// matching and leak a link.
const HIDDEN_FOR = { "/find": "buy", "/buy": "buy", "/market-check": "market-check", "/tasks": "tasks", "/business": "business" };
function stripUnreleasedNav(html, req) {
  let out = html;
  for (const href of Object.keys(HIDDEN_FOR)) {
    if (isReleased(HIDDEN_FOR[href], req)) continue;
    out = out.replace(new RegExp(`\\s*<a class="hp-navitem" href="${href.replace(/\//g, "\\/")}"[^>]*>[^<]*<\\/a>`, "g"), "");
  }
  return out;
}

export async function sellShellHtml(req) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "public", "sell-old.html"), "utf8");
  // The real last-updated date, shared with Market Check (lib/asOf.js lastUpdatedDate). No count.
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const crew = isCrewRequest(req);
  // No palette bar on any Sell page (Sam, Oct 23 2026): it lives on Home only (lib/appShell.js PALETTE_BAR_ON).
  // GOASKSAM 2.0 STAGE 2 (Sam's block, Oct 23 2026): the old Sell page gets ONLY the shared rail (lib/appShell.js), nothing else changes.
  // The old rail (logo, value trio, nav, the signed-in "Your results" list, footer) is replaced by the shared one; the saved-results
  // block is kept and carried into the shared rail so a signed-in seller still reopens a saved result. The old page's own content
  // (#main, its input, its wizard) sits inside the shared main area exactly as before.
  let page = shell;
  const rs = page.indexOf('<button id="hp-hamburger"'), ms = page.indexOf('<div id="main">'), ns = page.indexOf('<div id="nav-saved"'), ne = page.indexOf("<!-- PULSE_RAIL: TODAY'S MARKET");
  if (rs > 0 && ms > rs) {
    const saved = ns > rs && ne > ns ? page.slice(ns, ne) : "";
    page = page.slice(0, rs) + railOpenHtml({ active: "sell", pageExtra: saved, crew, req, analytics: false }) + page.slice(ms);
    page = page.replace("\n<!-- JS served at a VERSIONED PATH PREFIX", () => `\n${SHELL_MAIN_CLOSE}\n<script>${SHELL_JS}</script>\n<!-- JS served at a VERSIONED PATH PREFIX`);
    page = page.replace("</head>", () => `${FONT_LINKS}<style>#gas-rail,.gas-mhead,#gas-scrim,#gas-main{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--green-dk:#143A29;--card:#fff;--border:#D8D4CB;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}\n${SHELL_CSS}\n#gas-main{display:flex;flex-direction:column}#gas-main>#main{margin-left:0;flex:1}\n@media (max-width:860px){#hp-topbar{top:68px}.gas-mhead{z-index:70}}</style>\n</head>`);
  }
  return stripUnreleasedNav(page, req)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n<script>${PALETTE_APPLY_JS}</script>`)
    .replace("</head>", `<style>${SHELL_TOKENS_CSS}${brandPaletteCss(crew)}${ALL_PALETTES_CSS}${SELL_ENTRY_CSS}</style>\n</head>`)
    .replace('<button id="btn">↑</button>', () => SELL_GO_HTML)
    .replace('placeholder="Type your car, or paste a VIN."', `placeholder="${esc(SELL_ENTRY.placeholder)}"`)
    .replace("</body>", `<style>${CONSENT_BANNER_CSS}</style>\n${CONSENT_BANNER_HTML}\n<script>${CONSENT_BANNER_JS}</script>\n<script>${OUTBOUND_JS};gasOutboundInstall("sell")</script>\n${gaBootstrapHtml()}\n</body>`)
    .replace('<div id="msgs"></div>', `<div id="msgs">${HERO}</div>`)
        .replace('<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>',
      '<div class="hp-value-preview hp-home-only">Built for enthusiast and specialty vehicles</div>' +
      (updated ? `\n    <div class="hp-value-preview hp-home-only hp-updated" style="margin-top:6px;font-size:12px;color:var(--faint,#8C877C)">Updated ${esc(updated)}</div>` : ""));
}

export default async function handler(req, res) {
  if (heldFor(req, res)) return;   // the holding page while CURTAIN_SEALED=1 (lib/_hold.js); a keyed server job, crew and testers pass
  const crew = isCrewRequest(req);
  const html = await sellShellHtml(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Crew's full rail (and, Oct 2026, the brand palette override) is never shared or stored. The
  // public response (no crew cookie) is identical for every anonymous visitor, so it is safely
  // cacheable at the shared edge with no Vary at all - a prior `Vary: Cookie` made the cache key
  // the raw cookie string, which differs per visitor and was an effectively permanent MISS.
  // crew alone is not enough: an INVALID gas_crew cookie (expired, made up, or stale) still
  // computes crew=false and would get the PUBLIC, cacheable header - and the edge has no Vary on
  // Cookie, so that cached entry could later be served to a REAL crew request for the same bare
  // URL (the same cache-poisoning gap fixed on Market Check/business/spec/publicConfig/history
  // this quarter - closing it here too now that this page also varies its palette by crew).
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  // No palette bar on any Sell page (Sam, Oct 23 2026): it lives on Home only (lib/appShell.js PALETTE_BAR_ON).
  // LAUNCH-STAGE SAFETY (Oct 2026, production incident, api/marketCheck.js has the full writeup):
  // this page's own rail is filtered by isReleased() - public caching at all is only safe once
  // fullyLaunched() is true (every gated product released for crew and public alike) and the
  // request carries no server credential (so an ops/probe stage override never seeds the shared
  // cache with a simulated state).
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}
