// indexingCheck (Lane E, Nov 3 2026, lane-e-indexing). Search Console: 1 page indexed, 16 not (11 "Page with redirect", 2 404, 1 alternate
// page with canonical, 2 crawled not indexed). CAUSE found in the repo: (1) the public Sell landing was served noindex, nofollow while the
// pages sitemap listed it; (2) three addresses of one page answered (the clean path, the .html file, the trailing-slash path that 404'd)
// and the retired addresses redirected with 302/308 mixes; (3) vercel.app answered 308, not 301. CLASS: any public page a crawler is told
// about (sitemap) that is not 200, indexable, self-canonical, with its title and H1 in the server HTML; any second address for it that does
// not 301 to the one canonical address; any host that is not goasksam.com that does not 301 to it.
//
//   node scripts/indexingCheck.mjs           offline: vercel.json, robots.txt, every public page rendered in process as Googlebot
//   node scripts/indexingCheck.mjs --live    ALSO reads goasksam.com as Googlebot (public GETs; the Vercel automation bypass header from
//                                            $VERCEL_AUTOMATION_BYPASS_SECRET or the Keychain item goasksam-bypass stands in for the
//                                            platform's verified-crawler pass, which a spoofed Googlebot does not get)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const vj = JSON.parse(read("vercel.json"));
const SITE = "https://goasksam.com";

// ---- 1. hosts and second addresses redirect once, with a 301, to the canonical address
const reds = vj.redirects || [];
const statusOf = r => r.statusCode || (r.permanent === true ? 308 : r.permanent === false ? 307 : 308);
const host = reds.find(r => (r.has || []).some(h => h.type === "host" && h.value === "goasksam.vercel.app"));
ok(host && /^https:\/\/goasksam\.com\/\$1$/.test(host.destination) && statusOf(host) === 301, "goasksam.vercel.app 301s to https://goasksam.com/$1 (status " + (host && statusOf(host)) + ")");
const slash = reds.find(r => r.source === "/:path+/");
ok(slash && slash.destination === "/:path+" && statusOf(slash) === 301, "a trailing-slash address (/find/, /whats-new/) 301s to the address without it, so it is not a 404 (status " + (slash && statusOf(slash)) + ")");
// every file in public/ that a clean path serves is a second address for that page: its .html address must 301 to the clean one
const rewrites = vj.rewrites || [];
const staticPages = fs.readdirSync(path.join(ROOT, "public")).filter(f => /\.html$/.test(f));
for (const f of staticPages) {
  const clean = rewrites.find(r => r.destination === "/" + f);
  const dup = reds.find(r => r.source === "/" + f);
  if (clean) ok(dup && statusOf(dup) === 301 && dup.destination === clean.source, `/${f} is a second address for ${clean.source}: it 301s to it (${dup ? statusOf(dup) + " " + dup.destination : "no redirect"})`);
  else if (dup) ok(statusOf(dup) === 301, `/${f} is a retired address: its redirect is a 301 (${statusOf(dup)})`);
}
// a redirect of a retired public address is permanent; the only temporary ones are the crew and demo doors
const DOORS = new Set(["/rudy", "/partner-demo"]);
for (const r of reds) if (!(r.has || []).length && !DOORS.has(r.source)) ok(statusOf(r) === 301, `redirect ${r.source} is a 301 (is ${statusOf(r)})`);

// ---- 2. robots.txt and the sitemap
const robots = read("public/robots.txt");
ok(/User-agent: Googlebot\s+Allow: \//.test(robots) && !/^\s*Disallow:\s*\/\s*$/m.test(robots), "robots.txt allows Googlebot everywhere");
const smUrl = (/^Sitemap:\s*(\S+)/m.exec(robots) || [])[1];
ok(smUrl && smUrl.startsWith(SITE + "/"), "robots.txt names a sitemap on goasksam.com (" + smUrl + ")");
const smPath = smUrl ? new URL(smUrl).pathname : "";
const resolves = p => fs.existsSync(path.join(ROOT, "public", p)) || rewrites.some(r => r.source === p);
ok(resolves(smPath) && resolves("/sitemap.xml"), "the named sitemap and /sitemap.xml both resolve (a file or a rewrite)");
const idx = read("public/sitemap-index.xml");
const kids = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
ok(kids.length >= 3, "the sitemap index lists its sitemaps (" + kids.length + ")");
for (const k of kids) ok(resolves(k) || rewrites.some(r => new RegExp("^" + r.source.replace(/\\\\/g, "\\") + "$").test(k)), "sitemap " + k + " resolves");
ok(kids.length < 50000, "an index lists fewer than 50,000 sitemaps");

// ---- 3. every public page: rendered in process as Googlebot, then the same list read from the sitemap
process.env.LAUNCH_STAGE = "2";   // every product released: the public list
process.env.SELL_NEXT_ON = "1";
const { PAGES } = await import("../api/sitemapPages.js");
const DB_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]; for (const k of DB_ENV) delete process.env[k];
const HANDLER = { "/": "api/home.js", "/sell": "api/sellNext.js", "/find": "api/buy.js", "/tasks": "api/tasksPage.js", "/market-check": "api/marketCheck.js",
  "/how-sam-decides": "api/howSamDecides.js", "/about": "api/about.js", "/whats-new": "api/whatsNew.js", "/privacy": "api/legal.js", "/terms": "api/legal.js", "/business": "api/business.js" };
const STATIC = { "/mcp": "public/mcp.html", "/powersellers": "public/powersellers.html" };
async function render(mod, url) {
  const m = await import("../" + mod);
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, writeHead(c, h) { this.code = c; Object.assign(this.h, h || {}); } };
  const u = new URL(SITE + url);
  const req = { url, method: "GET", query: Object.fromEntries(u.searchParams), headers: { "user-agent": UA, host: "goasksam.com" } };
  await Promise.race([m.default(req, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 25000))]);
  return res;
}
const LEGAL = { "/privacy": "/privacy?page=privacy", "/terms": "/terms?page=terms" };
// the page facts a crawler needs, from HTML alone (no script run)
function facts(html) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const can = [...noScript.matchAll(/<link[^>]+rel=["']canonical["'][^>]*>/gi)].map(m => (/href=["']([^"']+)/.exec(m[0]) || [])[1]);
  const rob = [...noScript.matchAll(/<meta[^>]+name=["']robots["'][^>]*>/gi)].map(m => (/content=["']([^"']*)/.exec(m[0]) || [])[1]);
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(noScript), h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(noScript);
  return { can, rob, title: t ? t[1].trim() : "", h1: h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : "" };
}
function judge(label, loc, code, headers, html) {
  const f = facts(html), xr = String(headers["x-robots-tag"] || "");
  ok(code === 200, `${label}: 200 to Googlebot (is ${code})`);
  ok(!headers["x-vercel-mitigated"] && !/Security Checkpoint/.test(html), `${label}: no Vercel challenge`);
  ok(f.can.length === 1 && f.can[0] === SITE + (loc === "/" ? "/" : loc), `${label}: one canonical, itself (${JSON.stringify(f.can)})`);
  ok(!/noindex/i.test(xr) && !f.rob.some(r => /noindex/i.test(r)), `${label}: no noindex (header "${xr}", meta ${JSON.stringify(f.rob)})`);
  ok(f.title.length > 3, `${label}: the title is in the server HTML`);
  ok(f.h1.length > 3, `${label}: the H1 is in the server HTML`);
}
const sitemapXml = await (async () => {
  const res = await render("api/sitemapPages.js", "/sitemap-pages.xml");
  return res.body;
})();
const listed = new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname));
ok(PAGES.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.lastmod || "2026-01-01") ) && /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemapXml) && (sitemapXml.match(/<url>/g) || []).length === (sitemapXml.match(/<lastmod>/g) || []).length, "every page in the pages sitemap carries a lastmod");
for (const p of PAGES) {
  const label = p.loc;
  ok(listed.has(p.loc), `${label}: is in /sitemap-pages.xml`);
  try {
    if (STATIC[p.loc]) { judge(label, p.loc, 200, {}, read(STATIC[p.loc])); continue; }
    const mod = HANDLER[p.loc]; if (!mod) { ok(false, `${label}: no handler registered in indexingCheck (add it)`); continue; }
    const r = await render(mod, LEGAL[p.loc] || p.loc);
    judge(label, p.loc, r.code, r.h, r.body);
  } catch (e) { ok(false, `${label}: rendering threw: ${String(e.message).slice(0, 120)}`); }
}
// a page the crew sees stays noindex: the Sell result address, a query variant of Find
{
  const r = await render("api/sellNext.js", "/sell?car=2016-porsche-911-gt3-rs").catch(() => null);
  ok(r && /noindex/i.test(String(r.h["x-robots-tag"] || "")), "a Sell result address (/sell?car=) stays noindex");
  const f = await render("api/buy.js", "/find?q=porsche").catch(() => null);
  ok(f && /noindex/i.test(String(f.h["x-robots-tag"] || "")) && facts(f.body).can[0] === SITE + "/find", "a Find query variant stays noindex with /find as its canonical");
}

// ---- 4. LIVE: the same facts read from goasksam.com
if (LIVE) {
  let byp = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!byp) { try { byp = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* none */ } }
  const get = async (url, bypass) => { const h = { "user-agent": UA }; if (bypass && byp) h["x-vercel-protection-bypass"] = byp; const r = await fetch(url, { redirect: "manual", headers: h }); const hd = {}; r.headers.forEach((v, k) => { hd[k] = v; }); return { code: r.status, h: hd, body: r.status < 300 || r.status >= 400 ? await r.text() : "" }; };
  ok(!!byp, "live: the automation bypass secret is available");
  // hosts: one hop, a 301, to the canonical address
  for (const u of ["https://goasksam.vercel.app/find", "https://www.goasksam.com/find"]) {
    const r = await get(u, true);
    ok(r.code === 301 && r.h.location === SITE + "/find", `live: ${u} answers 301 to ${SITE}/find in one hop (is ${r.code} ${r.h.location || ""})`);
  }
  for (const u of ["/find/", "/whats-new/", "/mcp.html", "/powersellers.html", "/buy", "/onebox", "/vin/WBSBF9327SEH06974"]) {
    const r = await get(SITE + u, true);
    ok(r.code === 301 && !!r.h.location, `live: ${u} 301s (is ${r.code} ${r.h.location || ""})`);
  }
  const live = [...PAGES.map(p => p.loc), "/history/1995-bmw-m3/WBSBF9327SEH06974"];
  for (const loc of live) {
    const r = await get(SITE + loc, true); judge("live " + loc, loc, r.code, r.h, r.body);
  }
  // the robots file and the sitemap: what Search Console is given
  const rb = await get(SITE + "/robots.txt", false); ok(rb.code === 200 && /Sitemap:/.test(rb.body), "live: /robots.txt is 200 without a bypass and names the sitemap");
  const sm = await get(SITE + "/sitemap.xml", false); ok(sm.code === 200 && /<sitemapindex/.test(sm.body), "live: /sitemap.xml is 200 without a bypass and is the sitemap index");
  // every sitemap in the index is 200 XML
  for (const m of sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)) { const r = await get(m[1], true); ok(r.code === 200 && /<(urlset|sitemapindex)/.test(r.body), `live: ${m[1]} is 200 XML`); }
  // a spread of the VIN sitemap: each is 200, indexable, its own canonical (the sitemap never lists a page that 404s or noindexes)
  const vins = await get(SITE + "/sitemap-vins-1.xml", true);
  const urls = [...vins.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const u of urls.filter((_, i) => i % 125 === 0).slice(0, 8)) { const r = await get(u, true); judge("live sitemap " + new URL(u).pathname.slice(0, 50), new URL(u).pathname, r.code, r.h, r.body); }
}
console.log(`indexingCheck${LIVE ? " (live)" : ""}: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
