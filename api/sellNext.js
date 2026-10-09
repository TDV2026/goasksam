// The new one-direction Sell (Lane C, Oct 2026), behind SELL_NEXT_ON until Sam has checked it. ONE design
// and ONE question flow with Market Check (Sam, Oct 2026): this serves Market Check's own page (onebox.html,
// js/onebox.js) so "porsche 911" asks exactly Market Check's questions in its cards and serif. js/onebox.js
// exposes a small Sell hook (window.GAS_SELL, inert on Market Check); lib/sell/sellMcClient.js asks the
// state and how to sell it in the same card, then shows the result from /api/sellChat {action:"flow"}.
import fs from "node:fs";
import path from "node:path";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { stripLaunchGate } from "./marketCheck.js";
import { SELL_MC_CSS, SELL_MC_CLIENT } from "../lib/sell/sellMcClient.js";
import { sellLandingHtml, SELL_LANDING_CSS } from "../lib/sell/sellLanding.js";
import { sellExample } from "../lib/sell/sellExample.js";
import sellPage from "./sellPage.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml } from "../lib/appShell.js";
import { isCrewRequest } from "./_chrome.js";

const YOUR_RESULTS_RAIL = '<a class="gas-navitem" id="gas-nav-results" href="#" style="display:none" onclick="return obToggleResults(event)">Your results</a><div class="gas-submenu" id="gas-results-menu"></div>';

let shell = null, cardCss = null;
// The old /sell result cards' own CSS (the .pcard family, styles.css: from its --pc-* tokens to its closing
// @container rule), read from that file so the two pages share ONE card style, never a copy.
const PCARD_FROM = ":root{color-scheme:light;--pc-cta", PCARD_TO = "@container (max-width:280px){.pcard-tiles{grid-template-columns:1fr;}}";
function pcardCss() {
  const css = fs.readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
  const a = css.indexOf(PCARD_FROM), b = css.indexOf(PCARD_TO, a);
  if (a < 0 || b < 0) { console.error("sellNext: .pcard section markers not found in styles.css"); return ""; }
  return css.slice(a, b + PCARD_TO.length);
}

export default async function handler(req, res) {
  // SWITCHED OFF for the public (Oct 8 2026, Sam): 404 unless SELL_NEXT_ON=1 or the probe key is presented.
  const keyed = !!(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)));
  // A result address (/sell?car=..., routed here by vercel.json) while the new Sell is off: the live /sell
  // page, exactly as /sell serves it, so the public never sees the new Sell before the cutover.
  if (process.env.SELL_NEXT_ON !== "1" && !keyed) return /[?&]car=/.test(String(req.url || "")) ? (res.setHeader("X-Robots-Tag", "noindex, follow"), sellPage(req, res)) : res.status(404).json({ error: "Not found." });
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8");
  if (cardCss == null) cardCss = pcardCss();
  const crew = isCrewRequest(req);
  const env = supabaseEnv();
  // The landing's one live example (lib/sell/sellExample.js, the same result a visitor gets): memory, the
  // stored row, or a build waited on for up to 8 seconds (never left to finish after the response is sent).
  // Past the wait, this one request shows the landing without the example band.
  const [updated, ex] = await Promise.all([
    lastUpdatedDate(env).catch(() => null),
    sellExample(env, 8000).catch(e => { console.error("sell example threw:", e && e.message); return null; })
  ]);
  const home = sellLandingHtml({ updated, example: ex && ex.example });
  const cfg = JSON.stringify({ updated: updated || "", home }).replace(/</g, "\\u003c");
  // Function replacements throughout: the client holds "$" sequences a replacement string would expand.
  const html = stripLaunchGate(shell)
    .replace(/<title>[\s\S]*?<\/title>/, () => "<title>Sell your car | GoAskSam</title>")
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, () => "")
    // Every new Sell address is noindex with the Sell landing as its canonical (result addresses included).
    .replace("</head>", () => `<meta name="robots" content="noindex, nofollow">\n<link rel="canonical" href="https://goasksam.com/sell">\n<style>${cardCss}\n${SELL_MC_CSS}\n${SELL_LANDING_CSS}\n${AUTH_SIGNBAR_CSS}\n${SHELL_CSS}</style>\n</head>`)
    // Round D (app shell, Oct 2026): the same shared rail as every other product - the full page
    // list, current page ("sell") marked - replacing the old Sell-only stripped-down rail.
    .replace("<!--SHELL_RAIL-->", () => railOpenHtml({ active: "sell", pageExtra: YOUR_RESULTS_RAIL, logoHref: "/sell", crew }))
    .replace("<script>\nfunction obToggleResults", () => `<script>${SHELL_JS}</script>\n<script>\nfunction obToggleResults`)
    // The Sell hook must exist before js/onebox.js boots, so the client goes in ahead of it.
    .replace(/<script src="\/obx\.[^"]+\/onebox\.js"><\/script>/, m => `<script>window.GAS_SELL_CFG=${cfg};</script>\n<script>${SELL_MC_CLIENT}</script>\n${m}`)
    // Item 9 (shared top bar): same control as Market Check/Buy, one file (lib/authBar.js).
    // window.GAS_SELL is already set above (SELL_MC_CLIENT), so js/onebox.js's own address-bar
    // code correctly skips this page either way; GAS_AUTH_MODE="topbar" is this page's own,
    // separate flag for js/auth.js's lighter boot and is unrelated to GAS_SELL.
    .replace("<body>", () => `<body>\n${AUTH_SIGNBAR_HTML}\n<script>${AUTH_SIGNBAR_MIRROR_JS}</script>\n<script>window.GAS_AUTH_MODE="topbar";</script>\n<script src="/js/auth.js" defer></script>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // A probe-key preview, or crew (whose rail differs from the public's, PUBLIC_LAUNCH switch), stays
  // private; once SELL_NEXT_ON serves it to everyone it is a public page (no Vary on the cookie).
  res.setHeader("Cache-Control", (keyed || crew) ? "private, no-store" : "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
}
