// bareHostCheck (Lane S, Nov 20 2026). Search Console: 241 Google requests in 90 days, 79 percent of them 301s on www.goasksam.com, 7 percent HTML,
// 10,569 pages discovered and not crawled. goasksam.com (no www) is the one host. CAUSE of the 301s: Google was told about, and kept, a second host and
// addresses that redirect (www; /buy?q= links from the Find example card; /vin/ addresses in a hub's structured data; a Tasks page link to /buy), and the VIN
// sitemap listed pages with no sale behind them (bid-only cars), which Google reads as thin. CLASS: any host that is not the bare host in a canonical, og:url,
// structured data url, sitemap loc or robots line; any sitemap address that redirects; any address a crawlable page links to that redirects; any listed VIN page with no sale.
// Real responses: the sitemap files come from the real api/history.js handler over a stubbed table, the pages from their real handlers.
//   node scripts/bareHostCheck.mjs          offline     node scripts/bareHostCheck.mjs --live   ALSO reads goasksam.com and www (a few GETs, no bypass)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const SITE = "https://goasksam.com";
const vj = JSON.parse(read("vercel.json"));

// ---- 1. the sweep: every file a visitor or a crawler is served, counted per file
const BAD = /www\.goasksam|goasksam\.vercel\.app/g;
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const served = [...walk("api"), ...walk("lib"), ...walk("public"), "vercel.json"].filter(f => /\.(js|mjs|html|json|txt|xml|webmanifest)$/.test(f));
const found = {};
for (const f of served) { const n = (read(f).match(BAD) || []).length; if (n) found[f] = n; }
// the only places the other hosts may be named: the redirect rules that send them to the bare host
for (const [f, n] of Object.entries(found)) ok(f === "vercel.json", `${f}: ${n} mention(s) of www or goasksam.vercel.app outside vercel.json`);
console.log("host sweep (www or goasksam.vercel.app per served file): " + (Object.keys(found).length ? JSON.stringify(found) : "none outside vercel.json") + " over " + served.length + " files");
const reds = vj.redirects || [], statusOf = r => r.statusCode || (r.permanent === true ? 308 : r.permanent === false ? 307 : 308);
const hostRule = h => reds.find(r => (r.has || []).some(x => x.type === "host" && x.value === h));
for (const h of ["www.goasksam.com", "goasksam.vercel.app"]) { const r = hostRule(h); ok(r && r.destination === "https://goasksam.com/$1" && statusOf(r) === 301, `${h} answers a 301 to https://goasksam.com/$1 from the repo's own redirects (${r ? statusOf(r) + " " + r.destination : "no rule"})`); }
const robots = read("public/robots.txt");
ok(!BAD.test(robots) && [...robots.matchAll(/^Sitemap:\s*(\S+)/gm)].every(m => m[1].startsWith(SITE + "/")), "robots.txt: every Sitemap line is on the bare host, no other host named");
BAD.lastIndex = 0;

// the addresses that redirect (vercel.json): a sitemap never lists one and a crawlable page never links to one
const redirectsHere = p => p === "/buy" || p === "/onebox" || /^\/vin\//.test(p) || /\.html$/.test(p) || (p.length > 1 && p.endsWith("/")) || reds.some(r => !(r.has || []).length && r.source === p && !["/rudy", "/partner-demo"].includes(r.source));

// ---- 2. the sitemap, from the real handler over a stubbed table
const hub = ["porsche-911", "ferrari-250-gt", "bmw-m3"];
const car = (vin, sold, slug) => ({ vin, loc: `${SITE}/history/${slug}/${vin}`, lastmod: "2026-11-01", ...(sold === undefined ? {} : { sold }), ident: { year: 1995, make: "X", family: "Y", slug } });
const ROLLOUT = { hubs: hub, hubsVerified: true, hubLast: { "porsche-911": "2026-11-01" }, hubPhotos: {}, motos: [], others: [], fallback: [], merged: [],
  vins: [car("WP0AAA00000000001", 2, "1995-porsche-911"), car("WP0AAA00000000002", 1, "1995-porsche-911"), car("WP0BID00000000003", 0, "1995-porsche-911"), car("WP0OLD00000000004", undefined, "1995-porsche-911")],
  linkedVins: ["WP0AAA00000000001", "WP0AAA00000000002", "WP0BID00000000003", "WP0OLD00000000004"] };
process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub"; process.env.LAUNCH_STAGE = "2";
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const s = String(u); if (!/stub\.invalid/.test(s)) return realFetch(u, o); const body = /vin_rollout_cache/.test(s) ? [{ data: ROLLOUT, computed_at: "2026-11-20T00:00:00Z" }] : []; return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); };
const mkres = () => ({ h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; this.statusCode = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; } });
const history = (await import("../api/history.js")).default;
const getSm = async which => { const res = mkres(); await history({ url: "/api/history?sitemap=" + which, method: "GET", query: { sitemap: which }, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0" } }, res); return res; };
const locs = x => [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const root = await getSm("root"), rootLocs = locs(root.body);
ok(root.code === 200, "the sitemap index answers 200 (" + root.code + ")");
ok(rootLocs.every(l => l.startsWith(SITE + "/")), "the sitemap index lists bare-host files only");
ok(/sitemap-vins-hubs\.xml$/.test(rootLocs[0]), "the hub file is first in the sitemap index (" + (rootLocs[0] || "").replace(SITE, "") + ")");
const all = {};
for (const l of rootLocs) { const m = /sitemap-vins-(hubs|\d+)\.xml$/.exec(l); if (!m) continue; const r = await getSm(m[1]); all[l] = { code: r.code, urls: locs(r.body) }; }
for (const [l, v] of Object.entries(all)) {
  ok(v.code === 200, `${l.replace(SITE, "")} answers 200 (${v.code})`);
  const badHost = v.urls.filter(u => !u.startsWith(SITE + "/")), redir = v.urls.filter(u => redirectsHere(new URL(u).pathname));
  ok(!badHost.length, `${l.replace(SITE, "")}: every address is on the bare host (${badHost.length} are not)`);
  ok(!redir.length, `${l.replace(SITE, "")}: no address is one that redirects (${redir.slice(0, 2).join(" ")})`);
}
const vinUrls = Object.entries(all).filter(([l]) => !/hubs/.test(l)).flatMap(([, v]) => v.urls), hubUrls = Object.entries(all).filter(([l]) => /hubs/.test(l)).flatMap(([, v]) => v.urls);
ok(!vinUrls.some(u => /WP0BID/.test(u)), "the VIN sitemap lists no page with no sale behind it (a bid-only car is left out)");
ok(vinUrls.some(u => /WP0AAA00000000001/.test(u)) && vinUrls.some(u => /WP0OLD/.test(u)), "the VIN sitemap keeps a page with a sale (and a row an older nightly wrote, which carries no count)");
ok(hubUrls.length >= 3 && hubUrls.some(u => /\/history\/porsche-911$/.test(u)), "the hub file lists the model pages (" + hubUrls.length + ")");
console.log(`sitemap counts on the stub table: hubs ${hubUrls.length}, VIN pages ${vinUrls.length} (the table holds ${ROLLOUT.vins.length} cars, one with no sale)`);
globalThis.fetch = realFetch;

// ---- 3. real pages: no other host in a canonical, og:url or structured data; no link to an address that redirects
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
process.env.SELL_NEXT_ON = "1";
const HANDLER = { "/": "api/home.js", "/sell": "api/sellNext.js", "/find": "api/buy.js", "/tasks": "api/tasksPage.js", "/market-check": "api/marketCheck.js", "/how-sam-decides": "api/howSamDecides.js", "/about": "api/about.js", "/whats-new": "api/whatsNew.js", "/privacy": "api/legal.js", "/terms": "api/legal.js", "/business": "api/business.js" };
const LEGAL = { "/privacy": "/privacy?page=privacy", "/terms": "/terms?page=terms" };
async function render(mod, url) { const m = await import("../" + mod); const res = mkres(); const u = new URL(SITE + url); await Promise.race([m.default({ url, method: "GET", query: Object.fromEntries(u.searchParams), headers: { "user-agent": UA, host: "goasksam.com" } }, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 25000))]); return res; }
// the Googlebot log: one line per request whose user agent names Googlebot (path, status, ms), none for any other agent; no address, no agent text, no query
const logged = []; const realLog = console.log; console.log = (...a) => { const t = String(a[0]); if (/^\{"tag":"googlebot"/.test(t)) logged.push(JSON.parse(t)); else realLog(...a); };
const pages = [...locs((await render("api/sitemapPages.js", "/sitemap-pages.xml")).body).map(l => new URL(l).pathname)];
let hrefsSeen = 0;
for (const loc of pages) {
  let html = ""; try { html = loc === "/mcp" ? read("public/mcp.html") : loc === "/powersellers" ? read("public/powersellers.html") : (await render(HANDLER[loc], LEGAL[loc] || loc)).body; } catch (e) { ok(false, loc + ": rendering threw " + String(e.message).slice(0, 80)); continue; }
  const noScript = html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "");
  const bad = (noScript.match(BAD) || []); ok(!bad.length, `${loc}: no www or vercel.app address in the page (${bad.length})`);
  const can = [...noScript.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/gi)].map(m => m[1]);
  ok(can.length === 1 && can[0].startsWith(SITE), `${loc}: one canonical, on the bare host (${JSON.stringify(can)})`);
  for (const m of noScript.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) { hrefsSeen++; let p; try { p = new URL(m[1], SITE + loc); } catch { continue; } if (p.origin !== SITE) continue; ok(!redirectsHere(p.pathname), `${loc}: links to ${p.pathname}, an address that redirects`); }
}
{ const bot = await import("../lib/botLog.js").catch(() => null); ok(!!bot, "lib/botLog.js exists (the Googlebot log)"); const h = (bot ? bot.withGooglebotLog : f => f)((req, res) => { res.status(404); res.send("x"); });
  const n0 = logged.length;
  await h({ url: "/history/1995-bmw-m3/WBSBF9327SEH06974?utm=x", headers: { "user-agent": UA, "x-forwarded-for": "203.0.113.9" } }, mkres());
  await h({ url: "/history/1995-bmw-m3/WBSBF9327SEH06974", headers: { "user-agent": "Mozilla/5.0 (Macintosh)" } }, mkres());
  ok(logged.length === n0 + 1, "a Googlebot request logs one line and another agent logs none");
  const l = logged[logged.length - 1] || {};
  ok(l.path === "/history/1995-bmw-m3/WBSBF9327SEH06974" && l.status === 404 && Number.isFinite(l.ms) && l.kind === "vin", "the line carries the path (no query), the status and the milliseconds: " + JSON.stringify(l));
  ok(!/203\.0\.113|Googlebot|utm/.test(JSON.stringify(l)), "the line holds no address, no agent text and no query");
  ok(logged.length >= 12, "every public page handler logs a Googlebot request (" + logged.length + " lines for " + (pages.length + 1) + " page reads)");
}
console.log = realLog;
console.log(`pages read: ${pages.length}, internal links read: ${hrefsSeen}`);

// ---- 4. the sources the pages build their addresses from (the sweep a render cannot reach: hubs, cards and emails need the archive)
const src = f => read(f);
ok(!/\$\{SITE\}\/vin\//.test(src("api/history.js")), "api/history.js: no structured-data url is a /vin/ address (it redirects); the ItemList names the page's own addresses");
ok(!/findUrlFor = title => "\/buy\?q="/.test(src("lib/live/featuredHistory.js")), "the Find example card's address is /find?q=, not /buy?q= (it redirects)");
ok(!/href="\/buy"/.test(src("api/tasks.js")), "the Tasks tap page links /find, not /buy (it redirects)");
ok(/soldCount >= 1/.test(src("api/history.js")) && /kind === "car" && sold < 1/.test(src("api/history.js")), "a VIN page is indexable, and listed, only with a sale behind it (page gate and sitemap gate agree)");

// ---- 5. LIVE
if (LIVE) {
  const get = async (u, ua) => { const r = await fetch(u, { redirect: "manual", headers: { "user-agent": ua || "Mozilla/5.0" } }); return { code: r.status, loc: r.headers.get("location") || "", body: r.status === 200 ? await r.text() : "" }; };
  for (const p of ["/robots.txt", "/sitemap.xml", "/sitemap-index.xml", "/sitemap-pages.xml"]) { const r = await get("https://www.goasksam.com" + p); ok([301, 308].includes(r.code) && r.loc === SITE + p, `live www ${p}: ${r.code} ${r.loc}`); }
  const ix = await get(SITE + "/sitemap-index.xml"); ok(ix.code === 200 && locs(ix.body).every(l => l.startsWith(SITE + "/")), "live: the sitemap index is 200 on the bare host, every file bare");
  for (const l of locs(ix.body)) { const r = await get(l); ok(r.code === 200, `live ${l.replace(SITE, "")}: ${r.code}`); }
}
console.log(`bareHostCheck${LIVE ? " (live)" : ""}: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
