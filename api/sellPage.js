// /sell (Oct 2026, search rules 1/3/5): index.html served with the parts a crawler must see in the raw
// HTML. The registry title, the hero H1 (the same markup js/result-copy.js homeHeroHTML draws, so the
// page reads the same before and after its scripts run), and one dated lead sentence with a real
// date (lib/asOf.js shared "as of"), no count. The lead sits
// at the top of #input-area as a home-only line (the scripts never redraw it). Edge-cached 1 hour.
import fs from "node:fs";
import path from "node:path";
import { asOfDate } from "../lib/asOf.js";
import { isCrewRequest } from "./_chrome.js";

const TITLE = "Where to sell your collector car";
const HERO = `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what vehicle you're selling.<br>I'll tell you where I'd sell it, <br class="hero-br2">and why.</h1>
  </div></div>`;
let shell = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default async function handler(req, res) {
  if (!shell) shell = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const crew = isCrewRequest(req);
  // Date only, no count (Oct 2026): the shared "as of" date (lib/asOf.js).
  const lead = `Sam reads real collector car auction sales every night, as of ${asOfDate()}, to tell you where to sell your car and why.`;
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
