// /sell (Oct 2026, search rules 1/3/5): index.html served with the parts a crawler must see in the raw
// HTML. The registry title, the hero H1 (the same markup js/result-copy.js homeHeroHTML draws, so the
// page reads the same before and after its scripts run), and one quiet "Updated [date]" line under
// "Built for enthusiast, specialty and collector vehicles" (the real last-updated date, lib/asOf.js
// lastUpdatedDate; no count, omitted when the date cannot be read). Edge-cached 1 hour.
import fs from "node:fs";
import path from "node:path";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { isCrewRequest } from "./_chrome.js";
import { SHELL_TOKENS_CSS, brandPaletteCss } from "../lib/appShell.js";
import { gaBootstrapHtml } from "../lib/analytics.js";
import { isReleased } from "../lib/_launchStage.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";

const TITLE = "Where to sell your collector car";
const HERO = `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what vehicle you're selling.<br>I'll tell you where I'd sell it, <br class="hero-br2">and why.</h1>
  </div></div>`;
let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// LAUNCH STAGE (Oct 2026, replaces the old binary PUBLIC_LAUNCH switch): strips the nav items for
// whichever products are not yet released at the current stage (lib/_launchStage.js isReleased,
// crew- and test-override-aware) - never all-or-nothing. "Where to sell" (this page), How Sam
// decides, Your results and the footer (Send feedback/Privacy/About) are stage-0 (always on) and
// never touched. PowerSellers has no nav link on this page at all (removed, see index.html).
// Each item removed by its own href so a copy/markup change elsewhere can never silently stop
// matching and leak a link.
const HIDDEN_FOR = { "/buy": "buy", "/market-check": "market-check", "/tasks": "tasks", "/business": "business" };
function stripUnreleasedNav(html, req) {
  let out = html;
  for (const href of Object.keys(HIDDEN_FOR)) {
    if (isReleased(HIDDEN_FOR[href], req)) continue;
    out = out.replace(new RegExp(`\\s*<a class="hp-navitem" href="${href.replace(/\//g, "\\/")}"[^>]*>[^<]*<\\/a>`, "g"), "");
  }
  return out;
}

export async function sellShellHtml(req) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  // The real last-updated date, shared with Market Check (lib/asOf.js lastUpdatedDate). No count.
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const crew = isCrewRequest(req);
  return stripUnreleasedNav(shell, req)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace("</head>", `<style>${SHELL_TOKENS_CSS}${brandPaletteCss(crew)}</style>\n</head>`)
    .replace("</body>", `<style>${CONSENT_BANNER_CSS}</style>\n${CONSENT_BANNER_HTML}\n<script>${CONSENT_BANNER_JS}</script>\n${gaBootstrapHtml()}\n</body>`)
    .replace('<div id="msgs"></div>', `<div id="msgs">${HERO}</div>`)
    .replace('<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>',
      '<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>' +
      (updated ? `\n    <div class="hp-value-preview hp-home-only hp-updated" style="margin-top:6px;font-size:12px;color:var(--faint,#8C877C)">Updated ${esc(updated)}</div>` : ""));
}

export default async function handler(req, res) {
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
  res.setHeader("Cache-Control", (crew || hasCrewCookie) ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
