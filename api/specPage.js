// /cars/porsche/911/... (Oct 2026, search rules): the Porsche 911 spec + hub pages. Reads the nightly
// `spec_pages` table (rule 11, under 1s) when a row exists; falls back to calling the fenced
// `specPage()` live (lib/specPages.js, Lane B's contract) when the table has no row yet - the DDL and
// first nightly build are landing now, so this fallback is what serves the pages until then. Lane A
// owns this file; the DATA layer (lib/specPages.js, the race-car fence, the pool/stats engine) is
// Lane B's, untouched here.
//
// In the /buy card design (api/_chrome.js PAGE_CSS/railHtml, the shared chrome every page uses).
// SEO: unique title + meta description, one H1, the dated lead as the first paragraph, BreadcrumbList +
// FAQPage JSON-LD, links up/sideways/down (parent, siblings, children) plus to Market Check (prefilled)
// and /buy. Indexable ONLY when the data says so (rule 4); a thin/no-sales spec is noindex and still
// shows the sales themselves (or the honest reason) - never a number without evidence.
import { specPage, parseSlug, allSpecSlugs911 } from "../lib/specPages.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { PAGE_CSS, FONT_LINKS, railHtml, WHY_RESULT_HTML } from "./_chrome.js";

const SITE = "https://goasksam.com";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => n == null ? null : "$" + Math.round(n).toLocaleString("en-US");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso || ""; };

// A readable label for any slug level, from parseSlug's parts (never the raw slug string).
function labelFor(parsed) {
  if (!parsed) return null;
  if (parsed.level === "model") return "Porsche 911";
  const gen = `${parsed.gen.code} 911`;
  if (parsed.level === "gen") return gen;
  if (parsed.level === "trim") return `${parsed.gen.code} ${parsed.trim}`;
  return `${parsed.gen.code} ${parsed.trim} ${parsed.body}, ${parsed.gearbox === "manual" ? "manual" : "automatic"}`;
}
// Breadcrumb chain (up to 4 deep: model -> gen -> trim -> leaf), built from the slug's own parts -
// never a guess, always re-derivable from parseSlug.
function breadcrumbChain(slug, parsed) {
  const chain = [{ name: "GoAskSam", url: SITE }, { name: "Porsche 911", url: `${SITE}/cars/porsche/911` }];
  if (parsed.level === "model") return chain;
  const genSlug = `${SITE}/cars/porsche/911/${parsed.gen.slug}`;
  chain.push({ name: `${parsed.gen.code} 911`, url: genSlug });
  if (parsed.level === "gen") return chain;
  const trimSlug = `${genSlug}/${slug.split("/")[5]}`;
  chain.push({ name: `${parsed.gen.code} ${parsed.trim}`, url: trimSlug });
  if (parsed.level === "trim") return chain;
  chain.push({ name: labelFor(parsed), url: `${SITE}${slug}` });
  return chain;
}

function rowsTableHtml(rows) {
  if (!rows || !rows.length) return "";
  const body = rows.map(r => `<tr><td data-l="Date">${esc(fmtDate(r.date))}</td><td data-l="Where">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.house || "")}</a>` : esc(r.house || "")}</td><td data-l="Miles" class="r">${r.miles != null ? Number(r.miles).toLocaleString("en-US") : ""}</td><td data-l="Hammer" class="r">${esc(money(r.hammer) || "")}</td></tr>`).join("");
  return `<section class="card"><div class="sh"><h2>Recent sales</h2></div><table class="stack"><thead><tr><th>Date</th><th>Where</th><th class="r">Miles</th><th class="r">Hammer</th></tr></thead><tbody>${body}</tbody></table></section>`;
}
function repeatVinsHtml(reps) {
  if (!reps || !reps.length) return "";
  const body = reps.map(r => `<tr><td data-l="VIN"><a href="${esc(r.historyUrl)}">${esc(r.vin)}</a></td><td data-l="Appearances" class="r">${r.appearances}</td><td data-l="Last seen">${esc(fmtDate(r.last))}</td></tr>`).join("");
  return `<section class="card"><div class="sh"><h2>Cars seen more than once</h2></div><table class="stack"><thead><tr><th>VIN</th><th class="r">Appearances</th><th>Last seen</th></tr></thead><tbody>${body}</tbody></table></section>`;
}
function childrenTableHtml(children, label) {
  if (!children || !children.length) return "";
  const rows = children.map(c => {
    const name = c.slug.split("/").pop().replace(/-/g, " ");
    const rangeTxt = c.indexable ? `${esc(money(c.middleHalf[0]))} to ${esc(money(c.middleHalf[1]))}` : (c.count ? `${c.count} sale${c.count === 1 ? "" : "s"}, too few for a typical band` : "No recorded sales in the last 12 months");
    return `<tr><td data-l="Spec"><a href="${esc(c.slug)}">${esc(name)}</a></td><td data-l="Sales" class="r">${c.count}</td><td data-l="Typical range">${rangeTxt}</td></tr>`;
  }).join("");
  return `<section class="card"><div class="sh"><h2>${esc(label)}</h2></div><table class="stack"><thead><tr><th>Spec</th><th class="r">Sales</th><th>Typical range</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function siblingsHtml(siblings) {
  if (!siblings || !siblings.length) return "";
  const links = siblings.map(s => { const name = s.split("/").slice(-2).join(" ").replace(/-/g, " "); return `<a href="${esc(s)}">${esc(name)}</a>`; }).join("");
  return `<section class="card"><div class="sh"><h2>Other body/gearbox combinations</h2></div><nav class="links">${links}</nav></section>`;
}

// sitemap-specs.xml: ONLY indexable rows, with their own computed_at as lastmod (rule 7). Reads the
// spec_pages TABLE in bulk (one query) - never loops allSpecSlugs911() through a live specPage() call
// per slug here, which would be 300+ archive reads and could time the request out. Until the nightly
// build has written rows (the DDL/first run are landing now), this honestly lists just the one slug
// that is always indexable (the model hub) rather than guessing or timing out - "nothing fake" (rule 12).
async function sitemapSpecs(req, res, env) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  const urlset = list => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list.map(u => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  if (!env) return res.status(200).send(urlset([]));
  const rows = await supabaseSelect(env, `spec_pages?indexable=eq.true&select=slug,computed_at`).catch(() => null);
  if (rows && rows.length) {
    return res.status(200).send(urlset(rows.map(r => ({ loc: `${SITE}${r.slug}`, lastmod: String(r.computed_at || "").slice(0, 10) }))));
  }
  // Table not populated yet: the model hub always aggregates its children's counts and is indexable
  // the moment the archive has any 911 sales at all (lib/specPages.js), so it is the one safe entry.
  return res.status(200).send(urlset([{ loc: `${SITE}/cars/porsche/911`, lastmod: new Date().toISOString().slice(0, 10) }]));
}

export default async function handler(req, res) {
  const env = supabaseEnv();
  if (req.query && req.query.sitemap) return sitemapSpecs(req, res, env);
  const rawSlug = String((req.query && req.query.slug) || "").replace(/^\/+/, "/");
  const slug = rawSlug.startsWith("/") ? rawSlug.replace(/\/$/, "") : "/" + rawSlug.replace(/\/$/, "");
  const parsed = parseSlug(slug);
  if (!parsed) return notFound(res, slug);

  // Serve-from-table first (rule 11); fall back to the live engine call until the nightly build has
  // written this slug (or the table/DDL has not landed yet). Both paths return the exact same shape.
  let data = null;
  if (env) {
    const rows = await supabaseSelect(env, `spec_pages?slug=eq.${encodeURIComponent(slug)}&select=data&limit=1`).catch(() => null);
    if (rows && rows[0] && rows[0].data) data = rows[0].data;
  }
  if (!data) { try { data = await specPage(slug, env, {}); } catch { data = null; } }
  if (!data) return notFound(res, slug);

  const label = labelFor(parsed);
  const breadcrumb = breadcrumbChain(slug, parsed);
  const title = `${label}: what it's sold for`;
  const marketCheckLink = `${SITE}/market-check?q=${encodeURIComponent("Porsche " + label)}`;
  const buyLink = `${SITE}/buy`;

  const headline = data.indexable
    ? `<p class="range">${esc(money(data.low))} <span class="to">to</span> ${esc(money(data.high))}</p><p class="landed">Most sold between ${esc(money(data.middleHalf[0]))} and ${esc(money(data.middleHalf[1]))}.</p>`
    : "";
  const faq = [];
  if (data.count) faq.push(["How many have sold in the last 12 months?", `${data.count} recorded sale${data.count === 1 ? "" : "s"}.`]);
  if (data.indexable) faq.push([`What does a ${esc(label)} typically sell for?`, `Most sold between ${money(data.middleHalf[0])} and ${money(data.middleHalf[1])} in the 12 months to ${fmtDate(data.asOf)}.`]);
  else if (data.indexReason) faq.push(["Why is there no typical range shown?", data.indexReason]);

  const parentLink = data.parent ? `<a href="${esc(data.parent)}">&#8592; ${esc(labelFor(parseSlug(data.parent)))}</a>` : "";
  const childLabel = parsed.level === "model" ? "Generations" : parsed.level === "gen" ? "Trims" : "Body and gearbox";

  const body = `
<div class="top"><div><span class="eyebrow">Porsche 911 &middot; Market Check</span>
<h1>${esc(label)}</h1>
<p class="answer" data-lead-sentence>${esc(data.lead)}</p></div></div>
${parentLink ? `<nav class="links">${parentLink}</nav>` : ""}
<section class="card anscard solo"><div class="ans-main">
${headline || `<p class="landed">${esc(data.indexReason || "No recorded sales in the last 12 months.")}</p>`}
<p class="muted">${data.count} sale${data.count === 1 ? "" : "s"} in the 12 months to ${esc(fmtDate(data.asOf))}.</p>
</div></section>
${rowsTableHtml(data.recentSales)}
${repeatVinsHtml(data.repeatVins)}
${childrenTableHtml(data.children, childLabel)}
${data.level === "leaf" ? siblingsHtml(data.siblings) : ""}
<section class="card"><div class="sh"><h2>Go further</h2></div>
<nav class="links"><a href="${esc(marketCheckLink)}">Check a specific ${esc(label)} on Market Check &#8594;</a>
${data.liveListings ? `<a href="${esc(buyLink)}">${data.liveListings} live right now on Buy &#8594;</a>` : `<a href="${esc(buyLink)}">See live listings on Buy &#8594;</a>`}</nav></section>
${faq.length ? `<section class="card"><h2 style="margin-bottom:12px">Questions</h2><dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>` : ""}
${WHY_RESULT_HTML}
<p class="foot">GoAskSam links to every sale. Bidding happens on the auction site.</p>`;

  const canonical = `${SITE}${slug === "/cars/porsche/911" ? slug : data.slug}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: breadcrumb.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: b.url })) }
  ];
  if (faq.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  const index = !!data.indexable;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(data.lead)}">
${index ? '<meta name="robots" content="index, follow">' : '<meta name="robots" content="noindex, follow">'}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(data.lead)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(canonical)}">
${FONT_LINKS}<style>${PAGE_CSS}</style>${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("")}</head><body>
${railHtml("history")}
<main><div class="col">${body}</div></main></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!index) res.setHeader("X-Robots-Tag", "noindex, follow");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}

function notFound(res, slug) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>No spec found | GoAskSam</title><meta name="robots" content="noindex, follow"></head><body>
${railHtml("history")}
<main><div class="col"><section class="card notfound"><h1>No spec found</h1><p class="muted">That Porsche 911 spec (${esc(slug)}) does not exist - either it was never offered with that body/gearbox, or the slug is malformed.</p><p><a class="full" href="/cars/porsche/911">Back to the Porsche 911 &#8594;</a></p></section></div></main></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, follow");
  res.status(404).send(html);
}
