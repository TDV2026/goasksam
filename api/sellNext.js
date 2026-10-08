// The new one-direction Sell (Lane C, Oct 2026), behind SELL_NEXT_ON until Sam has checked it. ONE design
// with the live /sell: this is the same page shell (api/sellPage.js sellShellHtml: index.html, styles.css,
// the hero, the centred input, the "Updated [date]" line). Only the scripts differ: the old wizard's
// modules are left out and the one-direction flow runs instead (lib/sell/sellFlowClient.js ->
// /api/sellChat {action:"flow"} -> lib/sell/sellFlow.js). /sell itself still serves the old wizard.
import { sellShellHtml } from "./sellPage.js";
import { FLOW_CSS, FLOW_CLIENT } from "../lib/sell/sellFlowClient.js";

const OLD_WIZARD = /<script src="js\.[^"]+\/(?:wizard|pipeline|steps|result|chat-core|result-copy|result-v2|entry|homepage)\.js"><\/script>\s*/g;

export default async function handler(req, res) {
  // SWITCHED OFF for the public (Oct 8 2026, Sam): 404 unless SELL_NEXT_ON=1 or the probe key is presented.
  if (process.env.SELL_NEXT_ON !== "1" && !(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)))) return res.status(404).json({ error: "Not found." });
  let html = await sellShellHtml(req);
  html = html
    // The shell's load diagnostics watch for the old wizard's functions; this page does not have them.
    .replace(/<script>\s*\(function\(\)\{\s*try\{\s*var sent=0;[\s\S]*?<\/script>\s*/, "")
    .replace(OLD_WIZARD, "")
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, "")
    // Function replacements: the client contains "$'" ("Sold $'+..."), which a replacement STRING would
    // expand into page text and break the script.
    .replace("</head>", () => `<meta name="robots" content="noindex, nofollow">\n<style>${FLOW_CSS}</style>\n</head>`)
    .replace("</body>", () => `<script>${FLOW_CLIENT}</script>\n</body>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(html);
}
