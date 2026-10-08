// /sell (Oct 2026, search rules 1/3/5): index.html served with the parts a crawler must see in the raw
// HTML. The registry title, the hero H1 (the same markup js/result-copy.js homeHeroHTML draws, so the
// page reads the same before and after its scripts run), and one dated lead sentence with a real
// number: how many collector car auction sales the archive holds from the last 12 months. The lead sits
// at the top of #input-area as a home-only line (the scripts never redraw it). Edge-cached 1 hour.
import fs from "node:fs";
import path from "node:path";
import { supabaseEnv } from "../lib/_supabase.js";
import { isCrewRequest } from "./_chrome.js";

const TITLE = "Where to sell your collector car";
const HERO = `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what vehicle you're selling.<br>I'll tell you where I'd sell it, <br class="hero-br2">and why.</h1>
  </div></div>`;
let shell = null, sold = { n: null, at: 0 };
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

// Public nav lockdown (Oct 2026, urgent, Sam): for the public, the /sell rail shows ONLY "Where to
// sell" - Buy, PowerSellers and How Sam decides are removed from the HTML entirely (never CSS-hidden).
// Crew (gas_crew=ok cookie, the same mechanism the One Box crew gate used) see the rail unchanged.
const CREW_ONLY_HREFS = ["/buy", "/powersellers", "/how-sam-decides"];
function stripPublicNav(html) {
  let out = html;
  for (const href of CREW_ONLY_HREFS) {
    out = out.replace(new RegExp(`\\s*<a class="hp-navitem" href="${href.replace(/\//g, "\\/")}"[^>]*>[^<]*<\\/a>`, "g"), "");
  }
  return out;
}

export default async function handler(req, res) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const crew = isCrewRequest(req);
  const n = await soldLastYear();
  const asOf = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  const lead = n ? `Sam reads ${n.toLocaleString("en-US")} collector car auction sales from the last 12 months, as of ${asOf}, to tell you where to sell your car and why.`
    : `Sam reads the collector car auction sales from the last 12 months, as of ${asOf}, to tell you where to sell your car and why.`;
  let html = (crew ? shell : stripPublicNav(shell))
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(lead)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(lead)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(lead)}$2`)
    .replace('<div id="msgs"></div>', `<div id="msgs">${HERO}</div>`)
    .replace('<div id="input-area">', `<div id="input-area">\n    <p class="hp-supporting hp-home-only hp-lead" data-lead-sentence>${esc(lead)}</p>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // The response now varies by the gas_crew cookie, so the shared edge cache must partition on it -
  // otherwise one visitor's crew/public nav could get served to the other from cache.
  res.setHeader("Vary", "Cookie");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
