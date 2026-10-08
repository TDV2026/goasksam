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
  if (process.env.SELL_NEXT_ON !== "1" && !(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)))) return res.status(404).json({ error: "Not found." });
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8");
  if (cardCss == null) cardCss = pcardCss();
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const cfg = JSON.stringify({ updated: updated || "" }).replace(/</g, "\\u003c");
  // Function replacements throughout: the client holds "$" sequences a replacement string would expand.
  const html = stripLaunchGate(shell)
    .replace(/<title>[\s\S]*?<\/title>/, () => "<title>Sell your car | GoAskSam</title>")
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, () => "")
    .replace("</head>", () => `<meta name="robots" content="noindex, nofollow">\n<style>${cardCss}\n${SELL_MC_CSS}</style>\n</head>`)
    // The Sell hook must exist before js/onebox.js boots, so the client goes in ahead of it.
    .replace(/<script src="\/obx\.[^"]+\/onebox\.js"><\/script>/, m => `<script>window.GAS_SELL_CFG=${cfg};</script>\n<script>${SELL_MC_CLIENT}</script>\n${m}`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(html);
}
