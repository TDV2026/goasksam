// /cars/porsche/911/... (Oct 2026, search rules): the Porsche 911 spec + hub pages. Since Oct 18 2026 (Sam, one
// engine) they print no number at all and are noindex until each row reads the engine's own stored answers (see ONE
// ENGINE below). Structure only: the spec, its parent, children and siblings, from the slug list (no archive read).
//
// In the /buy card design (api/_chrome.js PAGE_CSS/railHtml, the shared chrome every page uses).
// SEO: unique title + meta description, one H1, the lead as the first paragraph, BreadcrumbList JSON-LD, links
// up/sideways/down (parent, siblings, children) plus to Market Check (prefilled) and /buy.
import { withTracking } from "../lib/track/log.js";
import { parseSlug, allSpecSlugs911 } from "../lib/specPages.js";
import { PAGE_CSS, FONT_LINKS, railHtml, isCrewRequest } from "./_chrome.js";
import { KEEPLOOK_CSS, KEEPLOOK_JS, keepLookingHtml, keepLookingHref } from "../lib/appShell.js";
import { isReleased, fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { gaBootstrapHtml } from "../lib/analytics.js";
import { AUTH_SIGNBAR_CSS } from "../lib/authBar.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";

const SITE = "https://goasksam.com";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ONE ENGINE (Sam, Oct 18 2026): every number on a /cars page must come from the engine's own stored answers
// (oneEngineAnswer, the same read Market Check takes). Until Lane B defines which Market Check read each spec
// corresponds to, and Lane E's row check shows zero differences, NO row has a stored engine answer, so these pages
// print no count, no range, no price and no sale row (lib/specPages.js poolFor/statsFor are a second source and are
// not read here at all), and every /cars page is noindex. The pages keep their structure: the spec, its parent, its
// children and siblings, all derived from the slug list alone (no archive read, so a crawler never triggers one).
const NOINDEX = "noindex, follow";
const SPEC_SLUGS = new Set(allSpecSlugs911());
const depthOf = slug => slug.split("/").filter(Boolean).length;
const parentOf = slug => depthOf(slug) > 3 ? slug.split("/").slice(0, -1).join("/") : null;
const childrenOf = slug => [...SPEC_SLUGS].filter(c => c.startsWith(slug + "/") && depthOf(c) === depthOf(slug) + 1);
// A child row's label: the engine's own generation name (lib/generations.js: "G-Body", "911SC", "3.2 Carrera", the same
// names Market Check shows), the trim, or the body and gearbox, from the parsed slug; never the slug's own words.
function childLabelFor(slug) {
  const c = parseSlug(slug);
  if (!c) return slug.split("/").pop();
  if (c.level === "gen") return c.gen.code;
  if (c.level === "trim") return c.trim;
  if (c.level === "leaf" || c.body) return `${c.body ? c.body.charAt(0).toUpperCase() + c.body.slice(1) : ""}, ${c.gearbox === "manual" ? "manual" : "automatic"}`;
  return labelFor(c);
}
// A generation's own name (Sam, Oct 18 2026): a chassis number or a name that already says 911 stands alone ("997",
// "911SC"); a named era carries the 911 ("911 G-Body", "911 3.2 Carrera"). Never "911SC 911".
const genName = code => /911/.test(code) || /^\d{3}$/.test(code) ? code : `911 ${code}`;
// A readable label for any slug level, from parseSlug's parts (never the raw slug string).
function labelFor(parsed) {
  if (!parsed) return null;
  if (parsed.level === "model") return "Porsche 911";
  const gen = genName(parsed.gen.code);
  if (parsed.level === "gen") return gen;
  if (parsed.level === "trim") return `${gen} ${parsed.trim}`;
  return `${gen} ${parsed.trim} ${parsed.body}, ${parsed.gearbox === "manual" ? "manual" : "automatic"}`;
}
// Breadcrumb chain (up to 4 deep: model -> gen -> trim -> leaf), built from the slug's own parts -
// never a guess, always re-derivable from parseSlug.
function breadcrumbChain(slug, parsed) {
  const chain = [{ name: "GoAskSam", url: SITE }, { name: "Porsche 911", url: `${SITE}/cars/porsche/911` }];
  if (parsed.level === "model") return chain;
  const genSlug = `${SITE}/cars/porsche/911/${parsed.gen.slug}`;
  chain.push({ name: genName(parsed.gen.code), url: genSlug });
  if (parsed.level === "gen") return chain;
  const trimSlug = `${genSlug}/${slug.split("/")[5]}`;
  chain.push({ name: `${genName(parsed.gen.code)} ${parsed.trim}`, url: trimSlug });
  if (parsed.level === "trim") return chain;
  chain.push({ name: labelFor(parsed), url: `${SITE}${slug}` });
  return chain;
}

function linksHtml(title, slugs) {
  if (!slugs || !slugs.length) return "";
  return `<section class="card"><div class="sh"><h2>${esc(title)}</h2></div><nav class="links">${slugs.map(c => `<a href="${esc(c)}">${esc(childLabelFor(c))}</a>`).join("")}</nav></section>`;
}
// The lead: what the page is and where it leads, with no number (one engine, above).
function leadFor(parsed, label, mcOn) {
  const tail = mcOn ? " For what cars like a specific one sold for, check it on Market Check." : "";
  if (parsed.level === "model") return `Every Porsche 911 generation, from the 901 to the 992. Pick one to see its trims.${tail}`;
  if (parsed.level === "gen") return `The ${genName(parsed.gen.code)} by trim. Pick a trim to see its body and gearbox combinations.${tail}`;
  if (parsed.level === "trim") return `The ${genName(parsed.gen.code)} ${parsed.trim} by body and gearbox.${tail}`;
  return `The ${label}.${tail}`;
}

async function sitemapSpecs(req, res) {
  // Every /cars page is noindex until its numbers read from the engine (one engine, above), and a noindex page never
  // sits in a sitemap (search rule), so this lists nothing for now.
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
}

async function handler(req, res) {
  const crew = isCrewRequest(req);
  // In-content links to Market Check/Buy (Job 1, Oct 2026: "spec and car pages link to Market
  // Check and Buy: both must follow the stage") - these used to be unconditional for every visitor.
  const mcOn = isReleased("market-check", req), buyOn = isReleased("buy", req);
  if (req.query && req.query.sitemap) return sitemapSpecs(req, res);
  const rawSlug = String((req.query && req.query.slug) || "").replace(/^\/+/, "/");
  const slug = rawSlug.startsWith("/") ? rawSlug.replace(/\/$/, "") : "/" + rawSlug.replace(/\/$/, "");
  const parsed = parseSlug(slug);
  if (!parsed || !SPEC_SLUGS.has(slug)) return notFound(res, slug, crew, req);

  const label = labelFor(parsed);
  // labelFor already returns "Porsche 911" at the model level (the only level that names the
  // make); every other level omits it ("997 Carrera GTS Coupe, manual"). Never double it.
  const porscheLabel = label.startsWith("Porsche ") ? label : "Porsche " + label;
  const breadcrumb = breadcrumbChain(slug, parsed);
  const title = `${porscheLabel} | GoAskSam`;
  const marketCheckLink = `${SITE}/market-check?q=${encodeURIComponent("Porsche " + label)}`;
  const buyLink = `${SITE}/buy`;
  const lead = leadFor(parsed, porscheLabel, mcOn);
  const parent = parentOf(slug);
  const children = childrenOf(slug);
  const siblings = parsed.level === "leaf" && parent ? childrenOf(parent).filter(c => c !== slug) : [];
  const childLabel = parsed.level === "model" ? "Generations" : parsed.level === "gen" ? "Trims" : "Body and gearbox";

  const body = `
<div class="top"><div><span class="eyebrow">Porsche 911 &middot; Market Check</span>
<h1>${esc(porscheLabel)}</h1>
<p class="answer" data-lead-sentence>${esc(lead)}</p></div></div>
${parent ? `<nav class="links"><a href="${esc(parent)}">&#8592; ${esc(labelFor(parseSlug(parent)))}</a></nav>` : ""}
${linksHtml(childLabel, children)}
${linksHtml("Other body and gearbox combinations", siblings)}
${(mcOn || buyOn) ? `<section class="card"><div class="sh"><h2>Go further</h2></div>
<nav class="links">${mcOn ? `<a href="${esc(marketCheckLink)}">Check a specific ${esc(label)} on Market Check &#8594;</a>` : ""}
${buyOn ? `<a href="${esc(buyLink)}">See live listings on Buy &#8594;</a>` : ""}</nav></section>` : ""}
${keepLookingHtml({ context: "spec", subject: porscheLabel, href: keepLookingHref({ subject: porscheLabel }) })}`;

  const canonical = `${SITE}${slug}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: breadcrumb.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: b.url })) }
  ];

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(lead)}">
<meta name="robots" content="${NOINDEX}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(lead)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(canonical)}">
${FONT_LINKS}<style>${PAGE_CSS}${KEEPLOOK_CSS}${AUTH_SIGNBAR_CSS}${CONSENT_BANNER_CSS}</style>${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("")}</head><body>
${railHtml("history", undefined, crew, req)}
<main><div class="col">${body}</div></main>
${CONSENT_BANNER_HTML}
<script>${KEEPLOOK_JS}</script>
<script>window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
${gaBootstrapHtml()}
<script src="/api/track?js=1" defer></script>
<script>${CONSENT_BANNER_JS}</script>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", NOINDEX);
  // Crew's rail differs, so that response is never shared or stored. The public response (no crew
  // cookie) is identical for every anonymous visitor, so it is safely cacheable at the shared edge
  // with no Vary at all - a prior `Vary: Cookie` made the cache key the raw cookie string, which
  // differs per visitor and was an effectively permanent MISS.
  // BUT crew alone missed one case (reproduced live, Oct 2026): an INVALID gas_crew cookie still
  // computes crew=false and got the public header too, so its response could be cached and later
  // served to a REAL crew request for the same bare URL - the reduced rail, shown to real crew.
  // Any gas_crew cookie at all, valid or not, is reason enough to skip the shared cache.
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  // LAUNCH-STAGE SAFETY (Oct 2026, production incident, api/marketCheck.js has the full writeup):
  // this page's own rail is filtered by isReleased() - public caching at all is only safe once
  // fullyLaunched() is true and the request carries no server credential (so an ops/probe stage
  // override never seeds the shared cache with a simulated state).
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}

function notFound(res, slug, crew, req) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>No spec found | GoAskSam</title><meta name="robots" content="noindex, follow"></head><body>
${railHtml("history", undefined, crew, req)}
<main><div class="col"><section class="card notfound"><h1>No spec found</h1><p class="muted">That Porsche 911 spec (${esc(slug)}) does not exist - either it was never offered with that body/gearbox, or the slug is malformed.</p><p><a class="full" href="/cars/porsche/911">Back to the Porsche 911 &#8594;</a></p></section></div></main></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, follow");
  res.status(404).send(html);
}

// Analytics (docs/analytics-events.md): an error event when this route throws or answers 5xx.
export default withTracking("/api/specPage", handler, "site");
