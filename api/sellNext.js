// /sell (Lane C, Oct 2026): where to sell a collector car, a conversation with Sam (Claude with the engine
// as tools, lib/sell/sellChat.js via /api/sellChat) in the /buy card design. Served at /sell (and at the
// noindex staging path /sell-next). Rare house-only cars reach their sales through the keyword route
// (lib/sell/sellFacts.js), so no car dead-ends. The old wizard (index.html via api/sellPage.js) is retired. Search rules: the registry title, an H1 and one dated lead sentence with a real number (the
// last 12 months' auction sales in the archive) are in the raw HTML; a conversation is never a URL
// (?car= only starts one in the page), so any query-string variant is noindex with /sell canonical.
// Edge-cached 1 hour (the lead's count is recounted then).
import { PAGE_CSS, FONT_LINKS, railHtml } from "./_chrome.js";
import { BUY_CSS } from "./buy.js";
import { SELL_CSS, SELL_CLIENT } from "../lib/sell/sellClient.js";
import { supabaseEnv } from "../lib/_supabase.js";

const TITLE = "Where to sell your collector car";
let sold = { n: null, at: 0 };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function soldLastYear() {
  if (sold.n != null && Date.now() - sold.at < 3600e3) return sold.n;
  const env = supabaseEnv(); if (!env) return null;
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?sale_date=gte.${since}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" }, signal: AbortSignal.timeout(4000) });
    const n = Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]);
    if (Number.isFinite(n) && n > 0) sold = { n, at: Date.now() };
  } catch { /* the lead keeps its date and drops the count */ }
  return sold.n;
}

export default async function handler(req, res) {
  const n = await soldLastYear();
  const asOf = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  const lead = n ? `Sam reads ${n.toLocaleString("en-US")} collector car auction sales from the last 12 months, as of ${asOf}, to show where cars like yours sell and how they sold.`
    : `Sam reads the collector car auction sales from the last 12 months, as of ${asOf}, to show where cars like yours sell and how they sold.`;
  // Indexable only as /sell itself; /sell-next and any query-string variant (?car= starts a
  // conversation in the page) are noindex with /sell as the canonical.
  const u = String(req.url || "");
  const robots = /\?./.test(u) || /sell-next/.test(u) ? "noindex, follow" : "index, follow";
  const rail = railHtml("sell").replace(/<nav class="mnav"[\s\S]*?<\/nav>/, '<nav class="mnav" aria-label="Sections"><a class="n" href="/buy">Buy</a><span class="bar">|</span><a class="n on" aria-current="page" href="/sell">Sell</a><span class="bar">|</span><a class="n" href="/business">For business</a></nav>');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${TITLE}</title><meta name="description" content="${esc(lead)}">
<meta name="robots" content="${robots}"><link rel="canonical" href="https://goasksam.com/sell">
<meta property="og:title" content="${TITLE}"><meta property="og:description" content="${esc(lead)}"><meta property="og:url" content="https://goasksam.com/sell"><meta property="og:type" content="website"><meta property="og:image" content="https://goasksam.com/og-card.png">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
${FONT_LINKS}<style>${PAGE_CSS}${BUY_CSS}${SELL_CSS}</style></head><body>
${rail}
<main class="buymain">
<div class="scroll" id="scroll"><div class="col"><header id="lead"><h1>Where to sell your collector car</h1><p data-lead-sentence>${esc(lead)}</p></header><div id="convo" aria-live="polite"></div></div></div>
<div class="composer"><div class="col">
<div class="search" role="search"><label for="q" style="position:absolute;left:-9999px">Tell Sam what you're selling</label><input id="q" autocomplete="off" enterkeyhint="send" placeholder="Tell Sam what you're selling"><button type="button" class="mic" id="mic" aria-label="Speak instead of typing" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg></button><button type="button" class="go" id="go" aria-label="Send">&#8594;</button></div>
</div></div>
</main>
<script>try{sessionStorage.setItem("gas_fe_homepage_view","1")}catch(e){}window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};</script>
<script src="/js/auth.js" defer></script>
<script>${SELL_CLIENT}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", robots);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
