// /market-check (Oct 2026, search rules 1/3/5): the public SSR entry for Market Check (the One Box
// engine). Reads onebox.html as the client template (the same file /onebox always served) and splices
// in what a crawler must see in the raw HTML before any script runs: a unique title, the canonical, a
// dated lead sentence (date only, no count - lib/asOf.js's shared lastUpdatedDate(), the real last
// successful ingest date, the same helper /sell uses; one copy, never a second; null-safe - the lead
// drops the date clause entirely rather than ever showing a made-up one), and the H1/sub the client's
// own renderEmpty() draws (kept in lockstep so there is no visible flash on hydration - js/onebox.js's
// h1 text matches this file's H1).
//
// PUBLIC LAUNCH (Oct 2026, Sam: "index Market Check now, the same as /buy"): the pre-launch crew/tester
// access gate (hide-until-flag-resolves + invite-code exchange + redirect home on a non-public flag) is
// stripped from the served HTML here - nobody needs it, the page is open. ROLLBACK: stop calling
// stripLaunchGate() (one line below) and Market Check reverts to crew/tester-gated + noindex, same as
// before this file existed; the underlying onebox.html source (and its gate script) is untouched.
//
// Query-string variants (?q=<car>, a prefilled search, or a legacy ?tester=/?crew= link) are noindex
// with THIS canonical (bare /market-check) - rule 2, one URL per object.
import fs from "node:fs";
import path from "node:path";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { landingHtml, LANDING_CSS } from "../lib/live/marketCheckLanding.js";
import { marketCheckExample } from "../lib/live/marketCheckExample.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";

const TITLE = "Market Check: what could your car bring?";
const H1 = "What could mine bring?";
const SITE = "https://goasksam.com";

let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Strips the pre-launch crew/tester access-gate <script> block AND its preceding explainer comment.
// Public launch: no gate, no stale comment describing one, ships.
// Exported for api/sellNext.js (Lane C), which serves the same onebox.html for the new Sell.
export function stripLaunchGate(html) {
  return html
    .replace(/<!-- Internal review surface[\s\S]*?noindex at launch\. -->\n/, "")
    .replace(/<script>\n\(function\(\)\{try\{[\s\S]*?\}catch\(e\)\{location\.replace\("\/"\);\}\}\)\(\);\n<\/script>\n/, "");
}

export default async function handler(req, res) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8");
  const env = supabaseEnv();
  // Date only, no count (Oct 2026, Sam): the real last-ingest date (lib/asOf.js lastUpdatedDate()),
  // the same shared helper /sell uses. Null-safe: no date clause when it cannot be read, never a
  // made-up one. Used for the <meta name="description"> (unchanged logic); the new landing's own
  // on-page "Market Check. Updated ..." line (search rule 1's lead sentence) is built inside
  // landingHtml() from this same date.
  const updated = await lastUpdatedDate(env).catch(() => null);
  const metaDesc = updated ? `GoAskSam reads real auction sales every night, as of ${updated}.` : `GoAskSam reads real auction sales every night.`;
  // The landing's "An example" band (lib/live/marketCheckExample.js): cached daily, rebuilt nightly
  // (scripts/buildMarketCheckExample.js). A short wait so a cold cache never stalls the page; past it
  // the band is simply hidden for this one request while the build finishes in the background.
  // 8s: generous enough that a cold cache (e.g. the row expires before scripts/
  // buildMarketCheckExample.js is wired into the nightly) still reliably gets a real example
  // rather than relying on serverless "finish in the background" (unreliable - confirmed live:
  // a request past its wait budget does not guarantee the build completes before this instance
  // is frozen). Once a row exists, every request is a cheap table read regardless of this number.
  const example = await marketCheckExample(8000).catch((e) => { console.error("marketCheck example fetch threw:", e && e.message); return null; });
  // Rule 2: ANY query string is a variant (?q=, ?tester=, ?crew=) and stays noindex with the bare
  // /market-check as canonical - never its own indexed URL.
  const hasQuery = /\?./.test(String(req.url || ""));
  const robots = hasQuery ? "noindex, follow" : "index, follow";

  let html = stripLaunchGate(shell)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${robots}" />`)
    .replace("</head>", `<link rel="canonical" href="${SITE}/market-check" />\n<meta name="description" content="${esc(metaDesc)}" />\n<meta property="og:title" content="${TITLE}" />\n<meta property="og:description" content="${esc(metaDesc)}" />\n<meta property="og:type" content="website" />\n<meta property="og:url" content="${SITE}/market-check" />\n<style>${LANDING_CSS}\n${AUTH_SIGNBAR_CSS}</style>\n</head>`)
    .replace('<main class="wrap"><div id="ob"></div></main>',
      `<main class="wrap"><div id="ob">${landingHtml({ updated, example, h1Text: H1 })}</div></main>`)
    // Item 9 (shared top bar, Oct 2026): "Sign in" / the account control, one shared file
    // (lib/authBar.js) - the same markup/CSS Buy now uses, GAS_AUTH_MODE="topbar" so js/auth.js
    // runs its lighter boot (no /sell-wizard upfront gate check, no homepage_view funnel stamp).
    .replace("<body>", `<body>\n${AUTH_SIGNBAR_HTML}\n<script>${AUTH_SIGNBAR_MIRROR_JS}</script>\n<script>window.GAS_AUTH_MODE="topbar";</script>\n<script src="/js/auth.js" defer></script>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", robots);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
