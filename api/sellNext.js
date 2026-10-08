// The new one-direction Sell (Lane C, Oct 2026), behind SELL_NEXT_ON until Sam has checked it. /sell itself
// stays on the previous front page and wizard (api/sellPage.js). Four questions at most (the car, only what
// is missing, the state, how to sell it), then ONE direction from the shared Sell engine
// (lib/sell/sellFlow.js), the latest sales, and How Sam decides. The page is the client in
// lib/sell/sellFlowClient.js; the earlier chat client (lib/sell/sellClient.js) is kept in the repo, unused.
import { PAGE_CSS, FONT_LINKS, railHtml, isCrewRequest } from "./_chrome.js";
import { BUY_CSS } from "./buy.js";
import { FLOW_CSS, FLOW_CLIENT } from "../lib/sell/sellFlowClient.js";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";

const TITLE = "Where to sell your collector car";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default async function handler(req, res) {
  // SWITCHED OFF for the public (Oct 8 2026, Sam): 404 unless SELL_NEXT_ON=1 or the probe key is presented.
  if (process.env.SELL_NEXT_ON !== "1" && !(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)))) return res.status(404).json({ error: "Not found." });
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const rail = railHtml("sell", undefined, isCrewRequest(req));
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${TITLE}</title><meta name="description" content="GoAskSam tells you where to sell your car and why, backed by real market data. No valuations, no guesswork.">
<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="https://goasksam.com/sell">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
${FONT_LINKS}<style>${PAGE_CSS}${BUY_CSS}${FLOW_CSS}</style></head><body>
${rail}
<main class="buymain"><div class="scroll" id="scroll"><div class="col"><div class="sflow" id="sflow">
<header class="hero" id="hero"><p class="script">Go ahead, ask Sam.</p><h1>Tell me what vehicle you're selling. I'll tell you where I'd sell it, and why.</h1>
<div class="box"><label for="carq" style="position:absolute;left:-9999px">Your car, or its VIN</label><input id="carq" autocomplete="off" placeholder="Type your car, or paste a VIN."><button type="button" id="go">Send</button></div>
${updated ? `<p class="updated">Updated ${esc(updated)}</p>` : ""}</header>
<div id="turns" aria-live="polite"></div>
</div></div></div></main>
<script>try{sessionStorage.setItem("gas_fe_homepage_view","1")}catch(e){}window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};</script>
<script src="/js/auth.js" defer></script>
<script>${FLOW_CLIENT}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(html);
}
