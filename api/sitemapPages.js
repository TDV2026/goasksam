// /sitemap-pages.xml (Oct 2026, Job 4 of the launch-stage round): the static public-pages sitemap
// became a dynamic, stage-aware one - a product not yet released at the current stage is left out
// of this list entirely until its stage opens (lib/_launchStage.js isReleased). Sell, How Sam
// decides, PowerSellers, About and Privacy are stage-0 (always listed). Crawlers never see a page
// they would 302 away from (the address-level redirect, api/marketCheck.js etc.) - the one thing
// this file exists to keep true. Crew is never a consideration here: search engines don't carry a
// crew cookie, so this always serves the PUBLIC list.
import { isReleased } from "../lib/_launchStage.js";

const SITE = "https://goasksam.com";
// Each entry's own lastmod/changefreq/priority, same values the old static file carried. "product"
// is null for the always-on stage-0 pages; isReleased(null, req) is never called for those.
const PAGES = [
  { loc: "/sell", lastmod: "2026-10-07", changefreq: "daily", priority: "1.0", product: null },
  { loc: "/buy", lastmod: "2026-10-07", changefreq: "daily", priority: "0.9", product: "buy" },
  { loc: "/tasks", lastmod: "2026-10-08", changefreq: "weekly", priority: "0.8", product: "tasks" },
  { loc: "/market-check", lastmod: "2026-10-08", changefreq: "daily", priority: "0.9", product: "market-check" },
  { loc: "/mcp", lastmod: "2026-10-07", changefreq: "monthly", priority: "0.7", product: null },
  { loc: "/how-sam-decides", lastmod: "2026-09-03", changefreq: "monthly", priority: "0.6", product: null },
  { loc: "/powersellers", lastmod: "2026-09-03", changefreq: "monthly", priority: "0.6", product: null },
  { loc: "/about", lastmod: "2026-09-03", changefreq: "yearly", priority: "0.3", product: null },
  { loc: "/privacy", lastmod: "2026-08-31", changefreq: "yearly", priority: "0.3", product: null },
  { loc: "/business", lastmod: "2026-09-03", changefreq: "monthly", priority: "0.5", product: "business" }
];

export default async function handler(req, res) {
  const rows = PAGES
    .filter(p => p.product == null || isReleased(p.product, req))
    .map(p => `  <url>\n    <loc>${SITE}${p.loc}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Public, short-lived: a stage change should not leave a stale listing for long (Job 5's caching
  // answer covers the exact window). Crawlers re-fetch sitemaps on their own schedule regardless.
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(xml);
}
