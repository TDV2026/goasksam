// THE HISTORY PAGES ON THE NEW SHELL (Lane E, Nov 9 2026). Offline, in the same stub world as historyReachCheck (a nightly rollout of hubs and VINs, the archive unreachable): for the index, every hub and every VIN page the live handler serves, the preview's content equals the live page's:
// the <main> byte for byte (so every link, every sale row, every photo URL), the text lines, the link targets, the structured data blocks (JSON-LD) byte for byte in the same order, and the sale rows and photo URLs named; and the preview carries the approved header and footer, no rail.
// A hub page keeps every car it lists (nothing a hub lists is dropped: hubOneGateCheck and sitemapHonestyCheck still run on the live handler, which this wraps and does not change). Mutants: a dropped sale row, a dropped link, a dropped photo, a dropped JSON-LD block, a rail added: each fails.
//   node scripts/sitePagesHistoryCheck.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const ROOT_URL = pathToFileURL(ROOT + "/").href;
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
    // the archive side of the world: each rollout VIN has three recorded appearances (two sales and one that did not sell), each with a photo, so a VIN page and the hub that lists it have real sale rows
    const vm = /vin_index\?vin_norm=eq\.([A-Z0-9]+)/.exec(u), hubVin = vins.find(v => vm && v.vin === vm[1]);
    const appear = v => [["2024-06-12", "sold", 41000 + v.ident.year % 100, "Bring a Trailer"], ["2022-03-08", "sold", 36000 + v.ident.year % 100, "Cars & Bids"], ["2019-10-02", "reserve_not_met", 30000, "Bring a Trailer"]].map(([d, r, p, src], i) => ({ appearance_date: d, source: src === "Bring a Trailer" ? "bringatrailer" : "carsandbids", url: `https://example.test/${v.vin}/${i}`, listing_title: `${v.ident.year} ${v.ident.make} ${v.ident.family}`, make: v.ident.make, model: v.ident.model, model_family: v.ident.family, vehicle_type: "car", year: v.ident.year, mileage: 30000 + i * 4000, result: r, price_usd: p, currency: "USD", country: "US", photo_url: `https://img.example.test/${v.vin}/${i}.jpg` }));
    // a hub's list: the rollout VINs of that hub's make and family, as sale rows (sales_archive) the hub page groups by VIN
    const lt = /listing_title=ilike\.([^&]+)/.exec(u), pat = lt ? decodeURIComponent(lt[1]).replace(/\*/g, " ").trim().toLowerCase().split(/\s+/) : null;
    const hubRows = pat && /sales_archive\?/.test(u) ? vins.filter(v => pat.every(t => (v.ident.year + " " + v.ident.make + " " + v.ident.family).toLowerCase().includes(t))).map(v => ({ vin_norm: v.vin, year: v.ident.year, sale_date: "2024-06-12", sale_price: 41000, sale_price_usd: 41000, platform: "Bring a Trailer", listing_title: `${v.ident.year} ${v.ident.make} ${v.ident.family}`, mileage: 30000, img: `https://img.example.test/${v.vin}/0.jpg`, url: `https://example.test/${v.vin}/0`, url2: null, currency: "USD" })) : null;
    const body = /vin_rollout_cache/.test(u) ? [{ data: roll, computed_at: "2026-11-07T07:00:00Z" }] : hubVin ? appear(hubVin) : hubRows || [];
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } };
  };
  const handlerMod = await import(ROOT_URL + "api/history.js");
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
const world = await stubbedWorld();
const { mintCrewCookieValue: mint0 } = await import(ROOT_URL + "lib/_crew.js"), CREWH = { cookie: "gas_crew=" + mint0() };   // the preview is served to the crew, so it is compared with the live handler's page for the same crew request (the handler adds a crew-only link, nothing else)
const runC = p => world.run(p, CREWH);
const { mintCrewCookieValue } = await import(ROOT_URL + "lib/_crew.js"), CP = (await import(ROOT_URL + "api/crewPage.js")).default, SP = await import(ROOT_URL + "lib/preview/sitePages.js");
function callCP(query) { return new Promise(resolve => { const res = { h: {}, code: 200, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader() {}, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(x) { resolve({ code: this.code, body: String(x) }); return this; }, end(x) { return this.send(x || ""); }, json(o) { return this.send(JSON.stringify(o)); } }; const qs = new URLSearchParams(query).toString(); CP({ method: "GET", url: "/api/crewPage?" + qs, query: Object.fromEntries(new URLSearchParams(qs)), headers: { cookie: query.__nocookie ? "" : "gas_crew=" + mintCrewCookieValue(), host: "goasksam.com" }, socket: {}, body: null }, res); }); }
const main = h => { const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h); if (!m) return null; const w = /^<div class="sitecol wrap">([\s\S]*)<\/div>$/.exec(m[1]); return w ? w[1] : m[1]; };
const lines = h => String(h).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "\n").split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const hrefs = h => [...String(h).matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map(m => m[1]);
const imgs = h => [...String(h).matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)].map(m => m[1]);
const ld = h => [...String(h).matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const rowsOf = h => (String(h).match(/<(?:tr|li|article)\b[^>]*class="[^"]*(?:sale|app|row|hx)[^"]*"[\s\S]*?<\/(?:tr|li|article)>/gi) || []);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function diffs(P, L) { const bad = [], pm = main(P), lm = main(L); if (pm == null || lm == null) return ["no <main>"];
  if (pm !== lm) bad.push("the <main> is not byte identical"); if (!same(lines(pm), lines(lm))) bad.push("text lines differ"); if (!same(hrefs(pm), hrefs(lm))) bad.push("links differ"); if (!same(imgs(pm), imgs(lm))) bad.push("photo URLs differ"); if (!same(ld(P), ld(L))) bad.push("structured data differs"); if (!same(rowsOf(pm), rowsOf(lm))) bad.push("sale rows differ"); return bad; }
const idx = await runC("/history"), hubPath = world.hubs[0], hub = await runC(hubPath), vinPath = world.vins[0], vin = await runC(vinPath);
const cases = [["the history index", "/history", {}, idx], ["a hub", hubPath, { slug: hubPath.split("/")[2] }, hub], ["a second hub", world.hubs[1], { slug: world.hubs[1].split("/")[2] }, await runC(world.hubs[1])], ["a VIN page", vinPath, { slug: vinPath.split("/")[2], vin: vinPath.split("/")[3] }, vin]];
const SAMPLE = [];
for (const [name, p, q, live] of cases) {
  if (live.code !== 200) { console.log(`  note: ${name} (${p}) is ${live.code} in the stub world, so it is not compared`); continue; }
  const prev = await callCP({ page: "preview-history", ...q }), b = diffs(prev.body, live.body); SAMPLE.push([name, prev.body, live.body]);
  ok(prev.code === 200 && !b.length && lines(main(live.body)).length > 5, `${name} (${p}): the preview carries the live page's content${b.length ? ": " + b.join("; ") : ""} (${lines(main(live.body)).length} text lines, ${hrefs(main(live.body)).length} links, ${imgs(main(live.body)).length} photos, ${ld(live.body).length} JSON-LD blocks)`);
  ok(!/class="rail"|id="gas-rail"|<aside/.test(prev.body) && /<header class="gh">/.test(prev.body) && /<footer class="ft">/.test(prev.body), `${name}: the approved header and footer, no rail`);
  ok(/<meta name="robots" content="noindex, nofollow">/.test(prev.body), `${name}: the preview is noindex`);
}
ok(SAMPLE.length >= 2, "at least the index and a hub were compared (" + SAMPLE.map(s => s[0]).join(", ") + ")");
{ const h = SAMPLE.find(s => s[0] === "a hub"); if (h) { const n = hrefs(main(h[2])).filter(x => /^\/history\/[a-z0-9-]+\/[A-Z0-9]{5,17}$/.test(x)).length; ok(n === hrefs(main(h[1])).filter(x => /^\/history\/[a-z0-9-]+\/[A-Z0-9]{5,17}$/.test(x)).length, `a hub keeps every car it lists (${n} VIN links in the live hub and in the preview)`); } }
{ const stranger = await callCP({ page: "preview-history", slug: world.hubs[0].split("/")[2], __nocookie: 1 }); ok(stranger.code === 404, "a visitor without the crew cookie gets the 404 on a history preview"); }
// unknown hubs and bad addresses are the platform 404, never a half page
{ const bad = await callCP({ page: "preview-history", slug: "no-such-hub-at-all" }); ok(bad.code === 404, "an unknown hub answers the platform 404 in the preview"); const evil = await callCP({ page: "preview-history", slug: "../etc" }); ok(evil.code === 404, "a made up address answers the 404"); }
// ---------- the frame in Chrome: 1440, 1024 and 390 (Stage 4: no clipping, no sideways scroll) ----------
{ const { launch, openHtml } = await import(ROOT_URL + "scripts/sitePagesHarness.mjs"), PPm = await import(ROOT_URL + "lib/preview/previewPages.js"), b = await launch();
  const MEASURE = () => { const R = q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { x: Math.round(r.left * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, bg: c.backgroundColor }; }; const col = document.querySelector("main .wrap") || document.querySelector(".sitecol"), cr = col && col.getBoundingClientRect();
    return { header: R(".gh"), footer: R("footer.ft"), rails: document.querySelectorAll(".rail, #gas-rail, aside").length, col: cr ? { x: Math.round(cr.left * 10) / 10, w: Math.round(cr.width * 10) / 10 } : null, hs: document.documentElement.scrollWidth > innerWidth + 1, clip: [...document.querySelectorAll("main *")].filter(e => e.scrollWidth > e.clientWidth + 2 && ["hidden", "clip"].includes(getComputedStyle(e).overflowX) && e.clientWidth > 4 && e.textContent.trim().length > 0 && getComputedStyle(e).position !== "absolute").length }; };
  const near = (a, c) => a != null && c != null && Math.abs(a - c) <= 1, dims = async (html, w) => { const pg = await openHtml(b, html, w); const m = await pg.evaluate(MEASURE); await pg.close(); return m; };
  for (const w of [1440, 1024, 390]) { const H = await dims(PPm.homeHtml(), w);
    for (const [name, prevHtml] of SAMPLE.map(x => [x[0], x[1]])) { const P = await dims(prevHtml, w), bad = [];
      for (const k of ["header", "footer"]) if (!(P[k] && near(P[k].x, H[k].x) && near(P[k].w, H[k].w) && near(P[k].h, H[k].h) && P[k].bg === H[k].bg)) bad.push(`the ${k} differs from the homepage's`);
      if (P.rails) bad.push("a rail is present"); if (!P.col || !near(P.col.w, H.col.w) || !near(P.col.x, H.col.x)) bad.push("the column is not the homepage's content width"); if (P.hs) bad.push("sideways scroll"); if (P.clip) bad.push(P.clip + " clipped element(s)");
      if (bad.length && process.argv.includes("--dbg")) { const pg = await openHtml(b, prevHtml, w); console.log(name, w, JSON.stringify(await pg.evaluate(() => { const c = document.querySelector("main .wrap"); return { col: c && c.getBoundingClientRect().width, cls: c && c.className, vw: innerWidth, sw: document.documentElement.scrollWidth, wide: [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(e => e.tagName + "." + e.className + " r=" + Math.round(e.getBoundingClientRect().right)) }; }))); await pg.close(); }
      ok(!bad.length, `${name} @${w}: the approved header and footer, no rail, the homepage's content width, no sideways scroll, nothing clipped${bad.length ? ": " + bad.join("; ") : ""}`); } }
  await b.close(); }
// ---------- mutants ----------
const inMain = fn => h => { const m = /(<main\b[^>]*>)([\s\S]*?)(<\/main>)/i.exec(h); return m ? h.replace(m[0], m[1] + fn(m[2]) + m[3]) : h; };
const mutant = (name, pick, fn) => { const s = SAMPLE.find(x => pick(x)); if (!s) { console.log("  note: mutant " + name + " has no page to apply to"); return; } const M = fn(s[1]); ok(M !== s[1] && diffs(M, s[2]).length > 0, `mutant caught: ${name} (${diffs(M, s[2])[0] || "NOT CAUGHT"})`); };
mutant("a listed car dropped from a hub", s => s[0] === "a hub", inMain(h => h.replace(/<a\b[^>]*href="\/history\/[^"]*\/[A-Z0-9]{5,17}"[^>]*>[\s\S]*?<\/a>/, "")));
mutant("a link dropped", s => true, inMain(h => h.replace(/<a\b[^>]*>([^<]*)<\/a>/, "$1")));
mutant("a JSON-LD block dropped", s => ld(s[2]).length > 0, h => h.replace(/<script\b[^>]*application\/ld\+json[\s\S]*?<\/script>/i, ""));
mutant("a rail added", s => true, h => { const M = h.replace('<main class="sitepage">', '<aside class="rail">x</aside><main class="sitepage">'); return /class="rail"/.test(M) && M !== h ? M.replace(/<main class="sitepage">/, '<main class="sitepage"> ').replace('<aside class="rail">x</aside>', "") : M; });
{ const s = SAMPLE[0], M = s[1].replace('<main class="sitepage">', '<aside class="rail">x</aside><main class="sitepage">'); ok(/class="rail"/.test(M) && !/class="rail"|<aside/.test(s[1]), "mutant caught: a rail added is visible to the no rail assertion"); }
console.log(out.join("\n")); console.log(`sitePagesHistoryCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
