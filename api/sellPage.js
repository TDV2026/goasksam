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

const TITLE = "Where to sell your collector car";
const HERO = `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what vehicle you're selling.<br>I'll tell you where I'd sell it, <br class="hero-br2">and why.</h1>
  </div></div>`;
let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Public nav lockdown (Oct 2026, urgent, Sam): for the public, the /sell rail shows ONLY "Where to
// sell" - Buy, PowerSellers and How Sam decides are removed from the HTML entirely (never CSS-hidden).
// Crew (gas_crew=ok cookie, the same mechanism the One Box crew gate used) see the rail unchanged.
// RESTORED Oct 2026: this function was dropped (call site kept, body lost) in a later edit to this
// file, which threw "stripPublicNav is not defined" on every public (crew=false) request - a live
// FUNCTION_INVOCATION_FAILED 500 for every signed-out visitor. If this file is edited again, keep this
// function attached to its call site below.
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
  // The real last-updated date, shared with Market Check (lib/asOf.js lastUpdatedDate). No count.
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  let html = (crew ? shell : stripPublicNav(shell))
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace('<div id="msgs"></div>', `<div id="msgs">${HERO}</div>`)
    .replace('<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>',
      '<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>' +
      (updated ? `\n    <div class="hp-value-preview hp-home-only hp-updated" style="margin-top:6px;font-size:12px;color:var(--faint,#8C877C)">Updated ${esc(updated)}</div>` : ""));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // The response now varies by the gas_crew cookie, so the shared edge cache must partition on it -
  // otherwise one visitor's crew/public nav could get served to the other from cache.
  res.setHeader("Vary", "Cookie");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
