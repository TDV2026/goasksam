// NO ORPHAN HISTORY PAGES (Lane E, Nov 7 2026; Lane F's SEO audit: the VIN history pages and the model hubs had no inbound link from any
// crawlable page, /history was a 404, and Google had 11,569 pages discovered and crawled none of them).
// THE CLASS: a page type that is in a sitemap but that no crawlable page links to. This check crawls the HTML the way a crawler does (plain
// <a href>, no script run, no cookie) and asserts the reachability rule: every model hub within THREE link hops of the home page and a sample
// of 50 VIN pages within FOUR. It fails when the links are missing, which is how it was shown to fail on the live site before this change.
//
//   node scripts/historyReachCheck.mjs                    OFFLINE (prePush): the real handlers run on a stubbed database; the footers are the real code.
//   node scripts/historyReachCheck.mjs --live [BASE]       LIVE crawl of BASE (default https://goasksam.com), from "/", plain HTTP.
//   node scripts/historyReachCheck.mjs --mutants           OFFLINE, then each mutant (a link taken out) must make it fail.
// Exit 1 on any failure. Crew previews are noindex and nofollow and are never part of the crawl (the crawl sends no cookie).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const BASE = (args.find(a => /^https?:/.test(a)) || "https://goasksam.com").replace(/\/$/, "");
if (args.includes("--mutants")) {
  // Each mutant takes ONE link out of the source; the check must then fail. The file is always put back.
  const { execFileSync } = await import("node:child_process");
  const MUT = [
    ["the footer link", "lib/appShell.js", 'a("history", "/history", copyText("rail.FOOT_HISTORY")) + ', ""],
    ["the preview footer link", "lib/preview/previewPages.js", '<a href="/history">${copyText("rail.FOOT_HISTORY")}</a>', ""],
    ["the index's make sections", "api/history.js", '<h2><a href="/history/${esc(m.slug)}">${esc(m.name)} auction results</a></h2><ul class="hx">${m.hubs.map(h => `<li><a href="/history/${esc(h.slug)}">${esc(h.name)}</a></li>`).join("")}</ul>', ""],
    ["the make page's hub list", "api/history.js", '<ul class="hx">${m.hubs.map(h => `<li><a href="/history/${esc(h.slug)}">${esc(h.name)}</a></li>`).join("")}</ul></section>\n<nav class="vlinks" aria-label="More"><a href="/history">All makes</a>', '</section>\n<nav class="vlinks" aria-label="More"><a href="/history">All makes</a>'],
    ["the sibling hubs", "lib/historyLinks.js", "siblings: sibs.slice(0, cap)", "siblings: []"],
    ["the nearby VINs", "lib/historyLinks.js", ".slice(0, n).map(o => o.x);", ".slice(0, 0).map(o => o.x);"],
    ["the Market Check receipt link", "public/js/onebox.js", "extra: marks, vinNorm: rc.vinNorm });", "extra: marks });"],
    ["the Find card link", "api/buy.js", "(l.history_url ? '<a class=\\\"hplain\\\"", "(false ? '<a class=\\\"hplain\\\""]
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    try { fs.writeFileSync(f, orig.replace(from, () => to)); let code = 0; try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++; }
    finally { fs.writeFileSync(f, orig); }
  }
  console.log(bad ? "historyReachCheck mutants: " + bad + " not caught" : "historyReachCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const hrefsOf = html => [...String(html).matchAll(/<a\b[^>]*?\bhref="([^"#]+)(?:#[^"]*)?"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const localPath = (h, base) => {
  if (/^(mailto:|tel:|javascript:)/i.test(h)) return null;
  try { const u = new URL(h, base); const b = new URL(base); return u.host === b.host ? u.pathname.replace(/\/$/, "") || "/" : null; } catch { return null; }
};
const isHub = p => /^\/history\/[a-z0-9]+(?:-[a-z0-9]+)+$/.test(p) && !/^\/history\/(?:18|19|20)\d{2}-/.test(p);
const isVinPage = p => /^\/history\/[a-z0-9-]+\/[A-Z0-9]{5,17}$/.test(p);

// The crawler: breadth first from "/", following same-host anchors. `get(path)` returns { status, html, location }. It follows a redirect as part of the
// SAME hop (a 301 is not a page a person clicks through). Expands only the pages under /history and the home page itself (the footer link is the point).
async function crawl(get, maxDepth) {
  const depth = new Map([["/", 0]]), html = new Map();
  let frontier = ["/"];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const p of frontier) {
      if (!(p === "/" || p === "/history" || /^\/history\/[a-z0-9-]+$/.test(p))) continue;   // expand the home page, the index, make and hub pages
      let r = await get(p), hops = 0;
      while (r && r.status >= 300 && r.status < 400 && r.location && hops++ < 4) { const lp = localPath(r.location, "http://x"); r = lp ? await get(lp) : null; }
      if (!r || r.status !== 200) continue;
      html.set(p, r.html);
      for (const h of hrefsOf(r.html)) { const lp = localPath(h, "http://x"); if (lp && !depth.has(lp)) { depth.set(lp, d + 1); next.push(lp); } }
    }
    frontier = next;
  }
  return { depth, html };
}

// ---------------------------------------------------------------- the world: live, or stubbed
let world;
if (LIVE) {
  const fetchPage = async p => { const r = await fetch(BASE + p, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; GoAskSamReachCheck)" } }); return { status: r.status, html: r.status === 200 ? await r.text() : "", location: r.headers.get("location") }; };
  const sitemapLocs = async p => { const r = await fetch(BASE + p); const t = await r.text(); return [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname); };
  world = { get: fetchPage, hubs: (await sitemapLocs("/sitemap-vins-hubs.xml")).filter(isHub), vins: (await sitemapLocs("/sitemap-vins-1.xml")).filter(isVinPage), sitemapLocs };
} else {
  world = await stubbedWorld();
}

async function stubbedWorld() {
  // A rollout like the nightly one: hubs (no year), VIN pages with their stored identity. Enough makes to test grouping, a multi-word make, a hub in a
  // make with one hub, and a make whose name differs from its slug's title case.
  const mk = (make, family, year, n) => ({ vin: `${make.replace(/\W/g, "").slice(0, 3).toUpperCase()}${family.replace(/\W/g, "").slice(0, 3).toUpperCase()}${year}${String(n).padStart(4, "0")}`, ident: { year, make, model: family, family, slug: `${year}-${make.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` } });
  const specs = [["Porsche", "911", [1987, 1988, 1995, 2004, 2011]], ["Porsche", "356", [1958, 1962]], ["Porsche", "Boxster", [2001]], ["Mercedes-Benz", "300SL", [1955, 1956]], ["Mercedes-Benz", "SL500", [2003]],
    ["Ford", "Mustang", [1965, 1966, 1967, 1969, 1970]], ["Aston Martin", "DB5", [1964, 1965]], ["De Tomaso", "Pantera", [1972]], ["Shelby", "GT500", [1968]]];
  const vins = [];
  for (const [make, fam, years] of specs) years.forEach((y, i) => { const v = mk(make, fam, y, i + 1); vins.push({ vin: v.vin, loc: `https://goasksam.com/history/${v.ident.slug}/${v.vin}`, lastmod: `2026-0${(i % 9) + 1}-1${i % 9}`, ident: v.ident }); });
  const hubs = [...new Set(specs.map(([m, f]) => m.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + f.toLowerCase().replace(/[^a-z0-9]+/g, "-")))].sort();
  const roll = { counts: {}, hubs, hubPhotos: {}, hubLast: Object.fromEntries(hubs.map((h, i) => [h, `2026-10-${String(10 + i).padStart(2, "0")}`])), vins, motos: [], others: [], fallback: [], merged: [] };
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
  globalThis.fetch = async u => {
    u = String(u);
    const body = /vin_rollout_cache/.test(u) ? [{ data: roll, computed_at: "2026-11-07T07:00:00Z" }] : [];
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } };
  };
  const handlerMod = await import("../api/history.js");
  const handler = handlerMod.default;
  const run = async (url, headers = {}) => {
    const q = {}; const u = new URL(url, "http://x");
    const m = /^\/history(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(u.pathname);
    if (u.pathname === "/history") q.index = "1"; else if (m) { q.slug = m[1]; if (m[2]) q.vin = m[2]; }
    const res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
    await handler({ method: "GET", query: q, headers: { host: "goasksam.com", ...headers }, url, socket: {} }, res);
    return res;
  };
  return {
    get: async p => { const r = await run(p); return { status: r.code, html: r.body, location: r.h.location || null, headers: r.h }; },
    run, roll, hubs: hubs.map(h => "/history/" + h), vins: vins.map(v => new URL(v.loc).pathname), sitemapLocs: null
  };
}

// ---------------------------------------------------------------- 1. the footers carry the link
{
  const { shellFoot } = await import("../lib/appShell.js");
  const foot = shellFoot("", {});
  ok(/<a class="[^"]*" href="\/history"[^>]*>Auction history<\/a>/.test(foot), "the rail's quiet links (every live page's footer: Home, Find, Market Check, Tasks, Sell, About) carry an Auction history link to /history");
  const prev = await import("../lib/preview/previewPages.js");
  const pages = { home: prev.homeHtml() };
  for (const k of ["findHtml", "marketCheckHtml", "tasksHtml"]) if (typeof prev[k] === "function") { try { pages[k] = prev[k](); } catch { /* a preview that needs input is skipped */ } }
  for (const [k, h] of Object.entries(pages)) ok(/<footer class="ft">[\s\S]*href="\/history"[^>]*>Auction history</.test(h), `the crew preview footer (${k}) links Auction history`);
  ok(Object.keys(pages).length >= 1, "at least the home preview rendered");
}

// ---------------------------------------------------------------- 2. the crawl
{
  // The home page of a plain crawler: the live "/" bounces to /sell; the offline world serves "/" from the real footer function.
  if (!LIVE) {
    const { shellFoot } = await import("../lib/appShell.js");
    const get0 = world.get;
    world.get = async p => p === "/" ? { status: 200, html: `<html><body><nav>${shellFoot("", {})}</nav></body></html>`, headers: {} } : get0(p);
  }
  const { depth } = await crawl(world.get, 3);
  const hubs = world.hubs;
  ok(hubs.length > 0, "the world has hubs to reach");
  const unreached = hubs.filter(h => !(depth.has(h) && depth.get(h) <= 3));
  ok(unreached.length === 0, `every model hub is reachable from the home page within 3 link hops (${hubs.length - unreached.length} of ${hubs.length}; first unreached: ${unreached.slice(0, 5).join(", ")})`);
  ok(depth.has("/history") && depth.get("/history") === 1, "the history index is ONE hop from the home page (the footer link)");
  // Make pages exist, are reachable in 2 hops, and every hub has a make parent that links it.
  const makes = [...depth.keys()].filter(p => /^\/history\/[a-z0-9-]+$/.test(p) && !isHub(p));
  ok(makes.length > 0 && makes.every(p => depth.get(p) <= 2), `the make hubs are reachable within 2 hops (${makes.length} found)`);
}

// ---------------------------------------------------------------- 3. VIN pages within four hops
{
  const sample = (() => { const a = world.vins.slice(); const out = []; const step = Math.max(1, Math.floor(a.length / 50)); for (let i = 0; i < a.length && out.length < 50; i += step) out.push(a[i]); return out; })();
  ok(sample.length > 0, "the world has VIN pages to sample");
  // A VIN page is reached in 4 hops when a hub page (3 hops) links it. Fetch only the hubs the sample's VINs belong to (their slug minus the year).
  // Offline the stubbed database holds no archive rows, so a hub page cannot draw its VIN table here; that hop is asserted LIVE (and by the unit checks below).
  if (LIVE) {
  const hubOf = v => { const s = v.split("/")[2].replace(/^(?:18|19|20)\d{2}-/, ""); return "/history/" + s; };
  const hubHtml = new Map();
  let got = 0;
  for (const h of [...new Set(sample.map(hubOf))]) {
    let r = await world.get(h), hops = 0;
    while (r && r.status >= 300 && r.status < 400 && r.location && hops++ < 3) r = await world.get(localPath(r.location, "http://x"));
    if (r && r.status === 200) { hubHtml.set(h, r.html); got++; }
  }
  const linked = sample.filter(v => { const h = hubHtml.get(hubOf(v)); return h && hrefsOf(h).some(x => localPath(x, "http://x") === v || (localPath(x, "http://x") || "").toLowerCase() === v.toLowerCase() || (localPath(x, "http://x") || "").endsWith("/" + v.split("/")[3])); });
  ok(got > 0, "the sampled VINs' hub pages answered 200");
  ok(linked.length === sample.length, `a sample of ${sample.length} VIN pages is each linked from its hub page (reachable in 4 hops): ${linked.length} of ${sample.length}`);
  }
  // A VIN page links back up and sideways: its hub, the make hub, three nearby pages (offline: the pure functions on the same rollout).
  if (!LIVE) {
    const { historyGraph, nearbyVins, hubNav, makeOf } = await import("../lib/historyLinks.js");
    const g = historyGraph(world.roll);
    const v = world.roll.vins.find(x => x.ident.family === "911" && x.ident.year === 1995), near = nearbyVins(g, v.ident.make, v.ident.family, v.ident.year, v.vin);
    ok(near.length === 3 && near.every(x => x.vin !== v.vin), "a VIN page gets three nearby VIN pages of the same spec, never itself");
    ok(near.map(x => x.year).join() === "1987,1988,2004" || near.map(x => x.year).join() === "1988,1987,2004", "the nearby pages are the nearest years of the same spec: " + near.map(x => x.year).join());
    ok(nearbyVins(g, "Porsche", "Boxster", 2001, world.roll.vins.find(x => x.ident.family === "Boxster").vin).length === 0, "a spec with one VIN page has no nearby page to name (nothing invented)");
    const nav = hubNav(g, "porsche-911", new Set());
    ok(nav && nav.make.slug === "porsche" && nav.siblings.map(s => s.slug).sort().join() === "porsche-356,porsche-boxster", "a hub links its sibling hubs of the same make (and not itself) and its make hub");
    ok(makeOf(g, "mercedes-benz") && makeOf(g, "mercedes-benz").hubs.length === 2 && makeOf(g, "aston-martin") && makeOf(g, "de-tomaso"), "multi-word makes get a make hub page");
    ok(makeOf(g, "porsche", new Set(["porsche-356", "porsche-boxster", "porsche-911"])) === null, "a make whose every hub is dead-photo noindex has no make page (no link to a page that is not served)");
    // The real handlers: the index, a make page and a hub nav; noindex for crew; the dated lead; unknown make 404.
    const idx = await world.run("/history");
    ok(idx.code === 200 && /<meta name="robots" content="index, follow">/.test(idx.body) && /<link rel="canonical" href="https:\/\/goasksam\.com\/history">/.test(idx.body), "/history is a real, indexable page with its canonical");
    ok(/<h1[^>]*>Collector car auction history by make and model<\/h1>/.test(idx.body) && /as of [A-Z][a-z]+ \d{1,2}, 20\d\d\./.test(idx.body), "/history: server rendered H1 and a dated lead sentence (search rules 1 and 3)");
    ok(!/[–—]/.test(idx.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")), "/history prints no dash");
    const grouped = [...idx.body.matchAll(/<section class="sec hxs" id="([a-z0-9-]+)">([\s\S]*?)<\/section>/g)].map(m => [m[1], [...m[2].matchAll(/href="\/history\/([a-z0-9-]+)"/g)].map(x => x[1])]);
    ok(grouped.length >= 6 && grouped.every(([mk, hs]) => hs[0] === mk && hs.slice(1).every(h => h.startsWith(mk + "-"))), "/history groups the hubs by make: each section links its make page, then only that make's hubs");
    const crewIdx = await world.run("/history", { cookie: "gas_crew=v1.0.bad" });
    ok(/noindex/.test(crewIdx.h["x-robots-tag"] || "") || !/content="index, follow"/.test(crewIdx.body) || crewIdx.h["cache-control"] === "private, no-store", "a request with a crew cookie is never cached or shared");
    const mp = await world.run("/history/porsche");
    ok(mp.code === 200 && /Porsche auction results/.test(mp.body) && /href="\/history\/porsche-911"/.test(mp.body) && /href="\/history"/.test(mp.body) && /as of [A-Z][a-z]+ \d{1,2}, 20\d\d\./.test(mp.body), "a make page lists its model hubs, links back to /history, and carries a dated lead");
    ok((await world.run("/history/notamake")).code === 404, "an unknown make is a 404, not a thin page");
    ok((await world.run("/history/mercedes-benz")).code === 200, "a multi-word make page is served");
  }
}

// ---------------------------------------------------------------- 4. the result pages print the plain link
if (!LIVE) {
  const mc = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8");
  ok(/function histPlainHtml\(vin, cls\)/.test(mc) && /histPlainHtml\(o\.vinNorm\)/.test(mc), "Market Check: one builder prints the plain history link, and the shared sale-card builder calls it");
  ok(/vinNorm: rc\.vinNorm/.test(mc), "Market Check: every receipt card (thin, house, class) passes its VIN to the card builder");
  ok(/vinNorm: \(c\.hasHistoryPage && c\.vinNorm && c\.soldBefore/.test(mc), "Market Check: a result card beside its Sold before line prints the plain link");
  ok(/histPlainHtml\(c\.vinNorm, "inrow"\)/.test(mc), "Market Check: each row of All comparable sales prints the plain link");
  const buy = fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8");
  ok(/\(l\.history_url \? '<a class=\\"hplain\\" href=\\"' \+ esc\(l\.history_url\)/.test(buy), "Find: the live card prints a plain link to l.history_url beside the Sold before chip");
  ok(/hp-hist/.test(buy), "Find: a sale's modal carries the plain history link");
}

console.log(`historyReachCheck: ${pass} passed, ${fail} failed${LIVE ? " (LIVE " + BASE + ")" : ""}`);
process.exit(fail ? 1 : 0);
