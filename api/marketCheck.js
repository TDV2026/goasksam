// /market-check (Oct 2026, search rules 1/3/5): the public SSR entry for Market Check (the One Box
// engine). Reads onebox.html as the client template (the same file /onebox always served) and splices
// in what a crawler must see in the raw HTML before any script runs: a unique title, the canonical, a
// dated lead sentence with a real number, and the H1/sub the client's own renderEmpty() draws (kept in
// lockstep so there is no visible flash on hydration - js/onebox.js's h1 text matches this file's H1).
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
import { supabaseEnv } from "../lib/_supabase.js";

const TITLE = "Market Check: what could your car bring?";
const H1 = "What could mine bring?";
const SUB = "See what cars like it actually sold for.";
const TAG = "Real sales, updated every night.";
const SITE = "https://goasksam.com";

let shell = null;
let soldCache = { n: null, at: 0 };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function soldLast12mo() {
  if (soldCache.n != null && Date.now() - soldCache.at < 3600e3) return soldCache.n;
  const env = supabaseEnv(); if (!env) return null;
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?sale_date=gte.${since}&select=id`, {
      method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" }, signal: AbortSignal.timeout(4000)
    });
    const n = Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]);
    if (Number.isFinite(n) && n > 0) soldCache = { n, at: Date.now() };
  } catch { /* the lead keeps its date and drops the count */ }
  return soldCache.n;
}

// Strips the pre-launch crew/tester access-gate <script> block AND its preceding explainer comment.
// Public launch: no gate, no stale comment describing one, ships.
function stripLaunchGate(html) {
  return html
    .replace(/<!-- Internal review surface[\s\S]*?noindex at launch\. -->\n/, "")
    .replace(/<script>\n\(function\(\)\{try\{[\s\S]*?\}catch\(e\)\{location\.replace\("\/"\);\}\}\)\(\);\n<\/script>\n/, "");
}

export default async function handler(req, res) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8");
  const n = await soldLast12mo();
  const asOf = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  const lead = n
    ? `GoAskSam has read ${n.toLocaleString("en-US")} real auction sales in the last 12 months, as of ${asOf}.`
    : `GoAskSam reads real auction sales every night, as of ${asOf}.`;
  // Rule 2: ANY query string is a variant (?q=, ?tester=, ?crew=) and stays noindex with the bare
  // /market-check as canonical - never its own indexed URL.
  const hasQuery = /\?./.test(String(req.url || ""));
  const robots = hasQuery ? "noindex, follow" : "index, follow";

  let html = stripLaunchGate(shell)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${robots}" />`)
    .replace("</head>", `<link rel="canonical" href="${SITE}/market-check" />\n<meta name="description" content="${esc(lead)}" />\n<meta property="og:title" content="${TITLE}" />\n<meta property="og:description" content="${esc(lead)}" />\n<meta property="og:type" content="website" />\n<meta property="og:url" content="${SITE}/market-check" />\n</head>`)
    .replace('<main class="wrap"><div id="ob"></div></main>',
      `<p class="ob-leadbar" data-lead-sentence>${esc(lead)}</p><main class="wrap"><div id="ob"><div class="ob-home"><p class="ob-tag">${esc(TAG)}</p><h1 class="ob-head">${esc(H1)}</h1><p class="ob-sub">${esc(SUB)}</p></div></div></main>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", robots);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
