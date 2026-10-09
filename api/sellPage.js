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
import { SHELL_TOKENS_CSS, isFullAccess } from "../lib/appShell.js";

const TITLE = "Where to sell your collector car";
const HERO = `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what vehicle you're selling.<br>I'll tell you where I'd sell it, <br class="hero-br2">and why.</h1>
  </div></div>`;
let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// PUBLIC LAUNCH SWITCH (Oct 2026, Sam), mirroring lib/appShell.js isFullAccess so Sell's own rail
// system agrees with the shared shell: strips the nav items that name or link to the other
// products - Buy, Market Check, Tasks, For business, How Sam decides - for a visitor without the
// gas_crew=ok cookie, until PUBLIC_LAUNCH=1. "Where to sell" (this page), PowerSellers, Your
// results and the footer (Send feedback/Privacy/About) are never touched. Each item removed by its
// own href so a copy/markup change elsewhere can never silently stop matching and leak a link.
const HIDDEN_HREFS = ["/buy", "/market-check", "/tasks", "/business", "/how-sam-decides"];
function stripHiddenNav(html) {
  let out = html;
  for (const href of HIDDEN_HREFS) {
    out = out.replace(new RegExp(`\\s*<a class="hp-navitem" href="${href.replace(/\//g, "\\/")}"[^>]*>[^<]*<\\/a>`, "g"), "");
  }
  return out;
}

// Round D (app shell, Oct 2026, Sam: lift the public nav lockdown): the rail showed the full shared
// page list for every visitor, signed out included. SUPERSEDED (Oct 2026, PUBLIC_LAUNCH switch):
// back to a reduced public rail until launch - see stripHiddenNav above.
export async function sellShellHtml(req) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  // The real last-updated date, shared with Market Check (lib/asOf.js lastUpdatedDate). No count.
  const updated = await lastUpdatedDate(supabaseEnv()).catch(() => null);
  const full = isFullAccess(isCrewRequest(req));
  return (full ? shell : stripHiddenNav(shell))
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${TITLE}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
    .replace("</head>", `<style>${SHELL_TOKENS_CSS}</style>\n</head>`)
    .replace('<div id="msgs"></div>', `<div id="msgs">${HERO}</div>`)
    .replace('<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>',
      '<div class="hp-value-preview hp-home-only">Built for enthusiast, specialty and collector vehicles</div>' +
      (updated ? `\n    <div class="hp-value-preview hp-home-only hp-updated" style="margin-top:6px;font-size:12px;color:var(--faint,#8C877C)">Updated ${esc(updated)}</div>` : ""));
}

export default async function handler(req, res) {
  const html = await sellShellHtml(req);
  const crew = isCrewRequest(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Crew's full rail is never shared or stored. The public response (no crew cookie) is identical
  // for every anonymous visitor, so it is safely cacheable at the shared edge with no Vary at all -
  // a prior `Vary: Cookie` made the cache key the raw cookie string, which differs per visitor and
  // was an effectively permanent MISS.
  res.setHeader("Cache-Control", crew ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
