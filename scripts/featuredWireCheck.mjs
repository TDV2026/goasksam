// clock: real-ok every moment is built from the real hour (NOW) and the fixtures' dates are offsets from it; the one literal dates are past sales, which cannot expire (Lane E, Nov 5 2026)
// THE FEATURED HISTORY, WIRED TO LANE B'S FIELD (Lane E, Nov 5 2026; crew only, NOT LIVE). A local run, no network and no production data: Lane B's own refresh (lib/live/featuredHistory.js refreshFeaturedHistory) fills a fake store from one live car and its earlier
// record, readFeaturedHistory serves it, and the real crew route api/crewPage.js (page=preview-home, crew cookie) prints it. What it proves, each with a mutant that must fail without the fix:
//   1 SOLD, LISTED, HIDDEN: a stored sold pick prints the sold layout; a stored listed pick prints "No completed sale confirmed" and no price; no pick, a stale pick, an ended auction, a listing no longer live, an unreadable store or a reader that throws prints NO section.
//   2 CREW ONLY: GET /api/featuredHistory is a bare 404 without the crew cookie and the field with it; the preview is the platform's own 404 without it. Nothing served carries a stand-in image (data:image).
//   3 IMAGES: a failed or blocked image hides the whole section (never a broken box); each image has its own alt text; every outward link opens in a new tab with noopener; the small earlier photo stays small beside its details and the current photo large at 1440, 1024, 768, 390.
//   node scripts/featuredWireCheck.mjs [--shots dir]      (--shots writes the screenshots)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "wire-check-secret"; process.env.LAUNCH_STAGE = "2"; delete process.env.FEATURED_HISTORY; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const F = await imp("lib/live/featuredHistory.js"), { mintCrewCookieValue } = await imp("lib/_crew.js"), crewMod = await imp("api/crewPage.js"), crewPage = crewMod.default, FEATURED = crewMod.FEATURED, routeFH = (await imp("api/featuredHistory.js")).default;
const { MEASURE } = await imp("scripts/homeFindMeasure.mjs");
const SHOTS = process.argv.includes("--shots") ? path.resolve(process.argv[process.argv.indexOf("--shots") + 1] || "docs/design/preview") : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const NOW = Math.floor(Date.now() / 3600e3) * 3600e3, DAY = 86400000, VIN = "WP0AB29988S783456", crew = "gas_crew=" + mintCrewCookieValue();
const live = (o = {}) => ({ id: "L1", source: "bringatrailer", url: "https://bringatrailer.com/listing/2008-porsche-911-1/", listing_title: "2008 Porsche 911 Carrera", year: 2008, make: "Porsche", model: "911", vin_norm: VIN, mileage: 34000, mileage_unit: "miles", end_time: new Date(NOW + 2 * DAY).toISOString(), photo_url: "https://img.example.com/cur-1.jpg", status: "live", ...o });
const sale = (o = {}) => ({ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/2008-porsche-911-0/", mileage: 30000, priceUsd: 61000, image: "https://img.example.com/prev-0.jpg", year: 2008, make: "Porsche", model: "911", vinNorm: VIN, ...o });
const attempt = (o = {}) => ({ kind: "attempt", date: "2021-03-02", house: "Cars & Bids", url: "https://carsandbids.com/auctions/abc/", mileage: 29000, bidUsd: 52000, status: "not_sold", image: "https://img.example.com/prev-a.jpg", year: 2008, make: "Porsche", model: "911", vinNorm: VIN, ...o });
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
function store(apps, liveRows = [live()]) { const db = { cfg: new Map(), live: liveRows, apps: { [VIN]: apps }, now: NOW, fail: false };
  const d = { now: () => db.now, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), select: async (e, q) => { if (db.fail) return null; if (q.startsWith("app_config?")) { const k = /key=eq\.([^&]+)/.exec(q)[1]; return db.cfg.has(k) ? [{ value: db.cfg.get(k) }] : []; }
      if (q.startsWith("live_listings?id=eq.")) { const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(q)[1]); const r = db.live.find(x => x.id === id); return r ? [r] : []; }
      if (q.startsWith("live_listings?status=eq.live")) return db.live.filter(r => r.status === "live" && Date.parse(r.end_time) > db.now);
      if (q.startsWith("vin_index?") || q.startsWith("sales_archive?")) { const want = decodeURIComponent(/in\.\((.*)\)&/.exec(q)[1]).replace(/"/g, "").split(","); return want.filter(v => db.apps[v]).map(v => ({ vin_norm: v })); } return []; },
    write: async (e, row) => { db.cfg.set(row.key, row.value); }, clear: async () => { db.cfg.delete(F.STORE_KEY); }, appearances: async (e, vin) => (db.apps[vin] ? { ok: true, vinNorm: vin, appearances: db.apps[vin] } : { ok: false, appearances: [] }), urlStatus: async () => 200 };
  return { db, d }; }
async function servedWith(st, { cookie = crew, read } = {}) {   // the real crew route, its reader bound to the local store
  FEATURED.read = read || (async req => F.readFeaturedHistory(env, req, st.d)); FEATURED.now = () => NOW;
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  await crewPage({ url: "/api/crewPage?page=preview-home", method: "GET", query: { page: "preview-home" }, body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) } }, res); return res; }
const SECTION = /<section class="fh[\s\S]*?<\/section>/;
const textOf = h => h.replace(/<[^>]*>/g, " ").replace(/&middot;/g, "·").replace(/&#8599;/g, "↗").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

// ---------- 1 sold, listed, hidden ----------
const sold = store([sale()]); await F.refreshFeaturedHistory(env, sold.d);
const soldRes = await servedWith(sold), SOLD = soldRes.body;
ok(soldRes.code === 200 && /data-featured-history="sold"/.test(SOLD), "1 a stored sold pick prints the sold layout through the real crew route");
{ const t = textOf((SOLD.match(SECTION) || [""])[0]); ok(/SOLD BEFORE/.test(t) && !/Would you have known/.test(t) && /Sold for \$61,000/.test(t) && /May 2022 · Bring a Trailer/.test(t) && /30,000 miles/.test(t) && /Now 34,000 miles \(4,000 more miles\)/.test(t) && /2008 Porsche 911 Carrera/.test(t) && /Back after selling in May 2022, now with 4,000 more miles\./.test(t) && /View this auction/.test(t) && /See this car's auction history/.test(t), "1 the sold section prints SOLD BEFORE, date, platform, mileage then and now with the engine's mileageWords, the car's name with its trim, the price, the take and both links, as given (" + t.slice(0, 200) + ")"); }
const listed = store([attempt()]); await F.refreshFeaturedHistory(env, listed.d);
const LISTED = (await servedWith(listed)).body;
{ const sec = (LISTED.match(SECTION) || [""])[0], t = textOf(sec); ok(/data-featured-history="listed"/.test(sec) && /LISTED BEFORE/.test(t) && /No completed sale confirmed/.test(t) && !/Sold for|\$\d/.test(t) && !/\bsold\b/i.test(t) && /Listed March 2021 · Cars & Bids/.test(t), "1 a stored listed pick prints 'No completed sale confirmed', no price and no sale wording (" + t.slice(0, 200) + ")"); }
const hiddenCases = [["no stored pick", store([sale()])],
  ["a stale pick (not re-checked in 90 minutes)", (() => { const s = store([sale()]); return { ...s, prep: async () => { await F.refreshFeaturedHistory(env, s.d); s.db.now = NOW + 100 * 60000; } }; })()],
  ["an auction that has ended", (() => { const s = store([sale()]); return { ...s, prep: async () => { await F.refreshFeaturedHistory(env, s.d); s.db.now = NOW + 3 * DAY; } }; })()],
  ["a listing that is no longer live", (() => { const s = store([sale()]); return { ...s, prep: async () => { await F.refreshFeaturedHistory(env, s.d); s.db.live[0].status = "ended_unsold"; } }; })()],
  ["an unreadable store", (() => { const s = store([sale()]); return { ...s, prep: async () => { await F.refreshFeaturedHistory(env, s.d); s.db.fail = true; } }; })()]];
for (const [name, s] of hiddenCases) { if (s.prep) await s.prep(); const h = await servedWith(s); ok(h.code === 200 && !/data-featured-history|class="fh/.test(h.body) && /How Sam decides/.test(h.body), `1 ${name}: no section, and the rest of the page is served`); }
{ const h = await servedWith(sold, { read: async () => { throw new Error("boom"); } }); ok(h.code === 200 && !/data-featured-history/.test(h.body), "1 a reader that throws hides the section and the page is still served"); }
{ const s = store([sale()]); await F.refreshFeaturedHistory(env, s.d); const v = s.db.cfg.get(F.STORE_KEY); v.featured.current.photo = ""; s.db.cfg.set(F.STORE_KEY, v); ok(!/data-featured-history/.test((await servedWith(s)).body), "1 a stored pick that lost its photo fails the page's own gate and is hidden"); }
{ const s = store([sale()]); await F.refreshFeaturedHistory(env, s.d); const v = s.db.cfg.get(F.STORE_KEY); v.featured.findUrl = "https://elsewhere.test/buy"; s.db.cfg.set(F.STORE_KEY, v); ok(!/data-featured-history/.test((await servedWith(s)).body), "1 a find link that leaves the site is hidden"); }
{ const g = JSON.parse(JSON.stringify((await (async () => F.readFeaturedHistory(env, { headers: { cookie: crew } }, sold.d))()))); ok(g.findUrl === "/buy?q=" + encodeURIComponent(g.current.title) && g.previous.historyUrl === "/vin/" + VIN && g.mileageWords === "4,000 more miles" && g.current.title === "2008 Porsche 911 Carrera", "1 the field carries the title with its trim, findUrl for that title, mileageWords and previous.historyUrl (" + g.findUrl + " | " + g.previous.historyUrl + ")"); }

// a car with no trim in its name, and a car whose reading went down (no mileageWords): both through Lane B's own refresh
{ const nt = store([sale()], [live({ listing_title: "2008 Porsche 911", model: "911" })]); await F.refreshFeaturedHistory(env, nt.d); const h = (await servedWith(nt)).body, t = textOf((h.match(SECTION) || [""])[0]);
  ok(/data-featured-history/.test(h) && /Live auction 2008 Porsche 911 Bring a Trailer/.test(t) && !/Carrera/.test(t), "1 a car with no trim prints year, make and model as the engine gave it, no invented trim (" + t.slice(0, 80) + ")");
  const lo = store([sale({ mileage: 40000 })], [live({ mileage: 34000 })]); await F.refreshFeaturedHistory(env, lo.d); const h2 = (await servedWith(lo)).body, t2 = textOf((h2.match(SECTION) || [""])[0]);
  ok(/data-featured-history/.test(h2) && !/Now [\d,]+ miles/.test(t2) && !/fewer|less miles/i.test(t2) && /40,000 miles/.test(t2), "1 a lower reading gets no mileage comparison line and no direction (" + t2.slice(0, 120) + ")"); }
// ---------- 2 crew only ----------
{ const noCookie = await servedWith(sold, { cookie: null }), forged = await servedWith(sold, { cookie: "gas_crew=v1.9999999999999.forged" });
  ok(noCookie.code === 404 && !/data-featured-history|GoAskSam/.test(noCookie.body) && forged.code === 404, "2 the preview is the platform's own 404 without the crew cookie and with a forged one");
  async function routeBad(handler) { const bad = []; const call = async cookie => { const res = { h: {}, code: 200, body: "", statusCode: 200, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, status(c) { this.code = c; this.statusCode = c; return this; }, json(o) { this.body = JSON.stringify(o); return this; }, end(x) { this.body = String(x || ""); return this; }, send(x) { this.body = String(x); return this; } }; await handler({ method: "GET", url: "/api/featuredHistory", query: {}, headers: { host: "goasksam.com", ...(cookie ? { cookie } : {}) } }, res); return { code: res.statusCode !== 200 ? res.statusCode : res.code, body: res.body }; };
    const a = await call(null), b = await call(crew); if (a.code !== 404 || a.body !== "") bad.push(`no cookie got ${a.code} with a body of ${a.body.length}`); if (b.code !== 200 || !/"featuredHistory"/.test(b.body)) bad.push("the crew cookie did not get the field"); return bad; }
  const rb = await routeBad(routeFH); ok(rb.length === 0, "2 GET /api/featuredHistory is a bare 404 without the crew cookie and the field with it: " + (rb.join("; ") || "ok"));
  const leakyRoute = async (req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ featuredHistory: await F.readFeaturedHistory(env, { headers: { cookie: crew } }, sold.d) }); };
  const rb2 = await routeBad(leakyRoute); ok(rb2.length > 0, `2 mutant: a route that answers without the cookie gate is caught (${rb2[0] || "NOT CAUGHT"})`);
  const leakyPage = async (req, res) => { FEATURED.read = async () => F.readFeaturedHistory(env, { headers: { cookie: crew } }, sold.d); const m = await imp("lib/preview/previewPages.js"); res.setHeader("Content-Type", "text/html"); return res.status(200).send(await m.homeHtmlFor(req, { read: FEATURED.read, now: NOW })); };
  const lp = await (async () => { const res = { h: {}, code: 200, body: "", setHeader() { return this; }, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; } }; await leakyPage({ headers: { host: "goasksam.com" }, query: {} }, res); return res; })(); ok(lp.code === 200 && /data-featured-history/.test(lp.body), "2 mutant: a page served with no cookie gate shows the pick to a stranger (the real route's 404 above is what prevents it)"); }
for (const [n, html] of [["sold", SOLD], ["listed", LISTED]]) ok(!/data:image\/svg/.test((html.match(SECTION) || [""])[0]) && !/data:image/.test((html.match(SECTION) || [""])[0]), `2 the served ${n} section carries no stand-in image (no data image inside it); its photos are the engine's https links`);
{ const imgs = [...SOLD.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]); ok(imgs.length === 2 && imgs.every(u => /^https:\/\//.test(u)), "2 the two photos are the engine's https links (" + imgs.join(", ") + ")"); }

// ---------- 3 images, links, sizes ----------
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const stand = label => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#6d8aa3"/><text x="30" y="560" font-size="34" fill="#fff" font-family="Georgia">${label}</text></svg>`;
async function load(html, width, imgMode = "ok") { const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const seen = new Set(); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "img.example.com") { seen.add(u.host); if (imgMode === "404" && /prev/.test(u.pathname)) return r.respond({ status: 404, body: "" }); if (imgMode === "abort" && /cur/.test(u.pathname)) return r.abort("blockedbyclient"); return r.respond({ status: 200, contentType: "image/svg+xml", body: stand(/cur/.test(u.pathname) ? "stand-in, current" : "stand-in, earlier") }); }
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 400)); p._seen = seen; return p; }
const W = [1440, 1024, 768, 390]; const bad = [];
for (const w of W) { const p = await load(SOLD, w), m = await p.evaluate(MEASURE); await p.close(); if (m.fhH == null) { bad.push(`@${w}: no featured band measured`); continue; }
  if (m.fhH > (w >= 1440 ? 230 : 380)) bad.push(`@${w}: the band is not compact (${m.fhH}px)`); if (!m.fhPhotos) bad.push(`@${w}: no photo shown`); if (w >= 1024 && m.fhPhotos < 2) bad.push(`@${w}: the earlier photo is missing`); if (m.hscroll) bad.push(`@${w}: horizontal scroll`); if (m.clipped.length) bad.push(`@${w}: clipped ${m.clipped[0]}`); }
ok(bad.length === 0, `3 the featured history is one compact band with the current photo and the earlier one small at ${W.join(", ")}: ${bad.join("; ") || "ok"}`);
{ const p = await load(SOLD, 1440), r = await p.evaluate(() => { const s = document.querySelector(".fh"), alts = [...s.querySelectorAll("img")].map(i => i.alt), ext = [...s.querySelectorAll("a")].filter(a => /^https?:/.test(a.getAttribute("href"))); return { alts, ext: ext.map(a => [a.target, a.rel]), inner: [...s.querySelectorAll("a")].filter(a => !/^https?:/.test(a.getAttribute("href"))).map(a => a.getAttribute("href")), ref: [...s.querySelectorAll("img")].map(i => i.referrerPolicy) }; });
  ok(r.alts.length === 2 && r.alts.every(a => a.length > 12) && new Set(r.alts).size === 2 && /live at auction/.test(r.alts[0]) && /earlier sale in May 2022/.test(r.alts[1]), "3 each photo has its own useful alt text (" + r.alts.join(" | ") + ")");
  ok(r.ext.length === 4 && r.ext.every(([t, rel]) => t === "_blank" && /noopener/.test(rel)), "3 every link to a source opens in a new tab with noopener (" + r.ext.length + " links)"); ok(r.inner.length === 1 && r.inner[0] === "/vin/" + VIN, "3 the history link goes to the car's history page on the site (previous.historyUrl)"); ok(r.ref.every(x => x === "no-referrer"), "3 the photos are asked for without a referrer");
  ok([...p._seen].join() === "img.example.com", "3 the image hosts the page asked for: " + [...p._seen].join(", ")); await p.close(); }
for (const mode of ["404", "abort"]) { const p = await load(SOLD, 1440, mode), has = await p.evaluate(() => !!document.querySelector(".fh")); await p.close(); ok(!has, `3 an image that ${mode === "404" ? "answers 404" : "is blocked"} hides the whole section (no broken box)`); }
{ const p = await load(SOLD, 1440, "404"), has = await p.evaluate(() => !!document.querySelector(".fh")); await p.close();   // the mutant: the same page without the hide script keeps a broken box
  const noHide = SOLD.replace(/\(function\(\)\{var fh=document\.querySelector\("\.fh"\)[\s\S]*?\}\)\(\);/, ""); const p2 = await load(noHide, 1440, "404"), has2 = await p2.evaluate(() => !!document.querySelector(".fh")); await p2.close(); ok(!has && has2 && noHide !== SOLD, "3 mutant: without the hide script a failed image leaves a broken box (caught: " + (has2 ? "box stays" : "NOT CAUGHT") + ")"); }
if (SHOTS) for (const [name, html] of [["featured-sold", SOLD], ["featured-listed", LISTED], ["featured-hidden", (await servedWith(store([sale()]))).body]]) for (const w of [1440, 390]) { const p = await load(html, w); const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewport({ width: w, height: Math.min(h, 6000) }); await p.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`) }); await p.close(); }
await b.close();
out.forEach(l => console.log(l)); console.log(`featuredWireCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
