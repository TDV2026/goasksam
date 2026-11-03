// FIND SORTS (Lane E, Nov 2 2026; a dealer group buyer's two asks): "Furthest below the range" and "Closest to me". The ENGINE orders (lib/live/samChat.js orderMatches with the rank api/buySearch.js rankByBid gives from the same bid-against-range
// judgement the card prints; the distance from the place the search carries); the page draws the order it is given and sorts nothing. The class: every sort the menu offers returns the engine's order across Show more batches, at 1440 and 390;
// the below-range order puts the deepest gap first, then cars within the range, then above it, then no range, no bid or still being read, last; Closest to me with no ZIP kept for the visit shows the ZIP box (asked once; nothing is searched until it is given) and with one orders at once and shows the miles; the ZIP is kept for the session and rides with every search and every Show more. The oracle for each order is written here from the fixture numbers, not read from the engine.   node scripts/findSortsCheck.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { reasonLine: RL } = await imp("lib/reasonWords.js"); const sm = await imp("lib/live/samChat.js"), bs = await imp("api/buySearch.js"), geo = await imp("lib/live/geo.js");
ok(typeof sm.orderMatches === "function" && typeof bs.rankByBid === "function", "the engine exports orderMatches and rankByBid (the one place the orders are made)");
const SHOW_BATCH = sm.SHOW_BATCH || 24;
// ---- fixtures: 60 live cars, deterministic; the engine-side object ({ r, facts, unknown, market }) of each, and the page card made from it
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const now = Date.now(), iso = h => new Date(now + h * 3600e3).toISOString();
const CITIES = ["Atlanta, GA", "Birmingham, AL", "Savannah, GA", "Charlotte, NC", "Jacksonville, FL", "Chicago, IL", "Dallas, TX", "Los Angeles, CA", "Seattle, WA", "Miami, FL"];   // five within 500 miles of 30303 (Atlanta 2, Birmingham 139, Savannah 220, Charlotte 226, Jacksonville 285), four within 250, one within 100
const N = 60, FIX = [];
for (let i = 1; i <= N; i++) {
  const kind = i % 6 === 1 ? "below" : i % 6 === 2 ? "within" : i % 6 === 3 ? "above" : i % 6 === 4 ? "none" : i % 6 === 5 ? "pending" : "nobid";
  const low = 40000 + Math.floor(rnd() * 60) * 1000, high = low + 20000 + Math.floor(rnd() * 10) * 1000;
  const bid = kind === "below" ? low - 1000 * (1 + (i * 7) % 37) : kind === "within" ? low + 1000 + i * 100 : kind === "above" ? high + 500 + i * 37 : kind === "nobid" ? null : 30000 + i * 211;
  const market = kind === "none" ? { kind: "none", query: "x" } : kind === "pending" ? { kind: "pending", line: "Sam is still reading the sales for this one." } : { kind: "range", low, high, count: 20, query: "1995 Porsche 911", basisLine: "Based on 20 sales, the latest in October 2026." };
  const r = { id: i, listing_title: "1995 Porsche 911 lot " + i, make: "Porsche", model: "911", year: 1995, source: "bringatrailer", url: "https://auction.test/" + i, photo_url: "https://img.test/" + i + ".jpg", end_time: iso(2 + i * 0.37), first_seen: iso(-1 - ((i * 7) % N) * 0.5), current_bid_usd: bid, bid_count: bid ? 1 : 0, location: CITIES[i % CITIES.length], country: "US", has_reserve: false, status: "live" };
  FIX.push({ r, facts: { priceUsd: bid, priceState: bid ? "usd" : "none", miles: 20000 + i, gearboxLabel: "Manual" }, unknown: [], market, kind, low, high, bid });
}
// ORACLE (written here, from the numbers): below the range, deepest gap first; within, lowest in the range first; above, nearest the top first; then every car with no range, no bid or still being read, ending soonest first
const endsAt = f => Date.parse(f.r.end_time);
const oracleBelow = FIX.slice().sort((a, b) => { const g = f => f.kind === "below" ? 0 : f.kind === "within" ? 1 : f.kind === "above" ? 2 : 3; const k = f => f.kind === "below" || f.kind === "within" ? f.bid - f.low : f.kind === "above" ? f.bid - f.high : 0; return g(a) - g(b) || k(a) - k(b) || endsAt(a) - endsAt(b); }).map(f => f.r.id);
const distOf = (zip, f) => { const c = geo.zipCoord(zip), l = geo.listingCoord(f.r); return c && l ? geo.milesBetween(c, l) : null; };
const oracleNear = zip => FIX.slice().sort((a, b) => { const da = distOf(zip, a), db = distOf(zip, b); return (da == null ? 1e9 : da) - (db == null ? 1e9 : db) || endsAt(a) - endsAt(b); }).map(f => f.r.id);
const oracleEnding = FIX.slice().sort((a, b) => endsAt(a) - endsAt(b)).map(f => f.r.id);
const oracleNewest = FIX.slice().sort((a, b) => Date.parse(b.r.first_seen) - Date.parse(a.r.first_seen) || endsAt(a) - endsAt(b)).map(f => f.r.id);
// the engine, in-process: the same functions the route uses, over the fixtures (stored markets preset, so nothing is read)
async function engineAnswer(filters, offset, sessionZip, radius) {
  let list = FIX.map(f => ({ r: f.r, facts: f.facts, unknown: [], market: f.market })), zip = (/\d{5}/.exec(String(filters.location || "")) || [])[0] || ((filters.sort === "nearest" || radius) && /^\d{5}$/.test(String(sessionZip || "")) ? sessionZip : null), center = zip ? geo.zipCoord(zip) : null;
  if (center) for (const x of list) { const c = geo.listingCoord(x.r); x.distance = c ? geo.milesBetween(center, c) : null; }
  const within = radius && center ? `within ${radius} miles of ${sessionZip}` : null;
  if (within) list = list.filter(x => x.distance != null && x.distance <= radius);   // the stand-in for the engine's radius: membership is decided here, never on the page
  const key = filters.sort === "nearest" && !center ? "ending_soon" : filters.sort || "ending_soon";
  if (key === "below_range" && typeof bs.rankByBid === "function") await bs.rankByBid(null, list);
  if (typeof sm.orderMatches === "function") sm.orderMatches(list, key);   // a tree without the engine's orders leaves the list as it came, and the assertions below fail on it
  const batch = list.slice(offset, offset + SHOW_BATCH);
  const cards = batch.map(x => { const c = { ...bs.cardOf(x), market: x.market, seen_before: null, timeline: [], name: null }; if (x.distance != null) c.distance = x.distance; return { ...c, sam_lines: bs.samLines(c) }; });
  return { cards, meta: { live: list.length, asks: [], sort: key, located: !!center, zipUnplaced: filters.sort === "nearest" && !center && /^\d{5}$/.test(String(sessionZip || "")) ? RL("find.zip_unplaced") : null, place: center ? "Atlanta, GA" : null, ...sm.pageMeta(list.length, offset, batch.length, within), radiusChoices: sm.RADIUS_CHOICES || null, within, keepPatch: within ? { location: sessionZip, radius_miles: radius } : null }, order: list.map(x => x.r.id) };
}
// ---- the engine, as the route uses it
for (const [name, key, want] of [["below_range", "below_range", oracleBelow], ["nearest with a place", "nearest", oracleNear("30303")], ["ending_soon", "ending_soon", oracleEnding], ["newest", "newest", oracleNewest]]) {
  const e = await engineAnswer({ make: "Porsche", sort: key, ...(key === "nearest" ? { location: "30303" } : {}) }, 0);
  ok(JSON.stringify(e.order) === JSON.stringify(want), `the engine's ${name} order is the oracle's (${e.order.slice(0, 6)} against ${want.slice(0, 6)})`);
}
{
  const e = await engineAnswer({ make: "Porsche", sort: "below_range" }, 0), by = id => FIX.find(f => f.r.id === id);
  const kinds = e.order.map(id => by(id).kind), firstNone = kinds.findIndex(k => k === "none" || k === "pending" || k === "nobid");
  ok(kinds.slice(0, firstNone).every(k => k === "below" || k === "within" || k === "above") && kinds.slice(firstNone).every(k => k === "none" || k === "pending" || k === "nobid"), "below-range: every car with a place against its range comes before every car with no range, no bid or still being read");
  const gaps = e.order.filter(id => by(id).kind === "below").map(id => by(id).low - by(id).bid);
  ok(gaps.length > 5 && gaps.every((g, i) => i === 0 || gaps[i - 1] >= g), `below-range: the deepest gap first, then shallower (${gaps.slice(0, 4)})`);
  const g1 = kinds.indexOf("within"), g2 = kinds.indexOf("above");
  ok(kinds.lastIndexOf("below") < g1 && kinds.lastIndexOf("within") < g2, "below-range: below the range, then within it, then above it");
  const unplaced = e.order.slice(firstNone);
  ok(unplaced.every(id => by(id).kind === "pending" || by(id).kind === "none" || by(id).kind === "nobid") && unplaced.length === FIX.filter(f => ["none", "pending", "nobid"].includes(f.kind)).length, "below-range: the cars with no range, no bid or still being read are last, none dropped");
}
// ---- the REAL engine (runFilters over fake live rows): Closest to me orders by distance from the kept ZIP and hides nothing for being far; no ZIP, or a ZIP it cannot place, leaves the order as it was and says so
{
  const PLACES = ["Atlanta, GA", "Chicago, IL", "Dallas, TX", "Los Angeles, CA", "Seattle, WA", "Miami, FL", "Boston, MA", "Denver, CO"];
  const rows = PLACES.map((loc, i) => ({ id: 5000 + i, source: "bringatrailer", make: "Porsche", model: "911", year: 1995, listing_title: "1995 Porsche 911 Carrera " + i, current_bid_usd: 30000 + i * 1000, end_time: new Date(now + (8 - i) * 36e5 * 5).toISOString(), country: "US", location: loc, photo_url: "https://x/i.jpg", status: "live", mileage: 50000 + i, exterior_color: "Red", first_seen: iso(-i), vin_norm: "RV" + i }));
  rows.push({ ...rows[0], id: 5099, location: "", listing_title: "1995 Porsche 911 Carrera nowhere", end_time: new Date(now + 3600e3).toISOString(), vin_norm: "RVX" });   // a listing that does not say where it is
  for (const [k, loc] of ["Birmingham, AL", "Savannah, GA", "Charlotte, NC", "Jacksonville, FL"].entries()) rows.push({ ...rows[0], id: 5100 + k, location: loc, listing_title: "1995 Porsche 911 Carrera near " + k, first_seen: iso(-3 - k * 5), current_bid_usd: 47000 - k * 3000, end_time: new Date(now + (30 + k * 7) * 36e5).toISOString(), vin_norm: "RVN" + k });   // inside 250 miles of 30303 (and Jacksonville inside 500)
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const u = new URL(String(url)); if (!/fake\.supabase/.test(u.hostname)) return new Response("", { status: 500 }); if (u.pathname.endsWith("/live_listings")) { const rg = String((init && init.headers && (init.headers.Range || init.headers.range)) || ""), off = Number((/^(\d+)-/.exec(rg) || [])[1] || u.searchParams.get("offset") || 0); return new Response(JSON.stringify(off > 0 ? [] : rows), { status: 200 }); } if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: "2026-11-01T00:00:00Z" }]), { status: 200 }); return new Response("[]", { status: 200 }); };
  process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const quiet = console.log; console.log = () => {};
  const run = async (filters, zip, radius) => { try { return await sm.runFilters(env, filters, { zip, radius }); } catch (e) { return { error: e }; } };
  const near = await run({ make: "Porsche", model: "911", sort: "nearest" }, "30303"), none = await run({ make: "Porsche", model: "911", sort: "nearest" }, null), bad = await run({ make: "Porsche", model: "911", sort: "nearest" }, "30301");
  const base = { make: "Porsche", model: "911" }, RS = {};   // the distance filter: every sort at every radius, and Anywhere
  for (const r of [100, 250, 500, null]) for (const so of ["ending_soon", "nearest", "below_range", "newest"]) RS[r + "/" + so] = await run({ ...base, sort: so }, "30303", r);
  const afterNear = await run({ ...base, ...(near.state ? { ...near.state.filters } : {}), sort: "ending_soon" }, "30303", null);   // the sort changed after Closest to me: no place may be left behind
  const taskRun = await (async () => { try { return await sm.runSearch(env, { ...base, location: "30303", radius_miles: 250 }, {}); } catch (e) { return { error: e }; } })();   // what Tasks runs for a saved search that carries the zip and radius
  const unplacedR = await run({ ...base, sort: "ending_soon" }, "30301", 250);
  console.log = quiet;
  globalThis.fetch = realFetch;
  const ids = o => (o.cards || []).map(c => c.r.id), miles = o => (o.cards || []).map(c => c.distance);
  ok(!near.error && ids(near).length >= 8, `the real engine answers a nearest search with a kept ZIP (${near.error ? near.error.message : ids(near).length + " cars"})`);
  if (!near.error) {
    const d = miles(near).filter(x => x != null);
    ok(d.length >= 8 && d.every((x, i) => i === 0 || d[i - 1] <= x), `Closest to me: the engine orders by distance from the kept ZIP, nearest first, the miles on each car (${d.join(",")})`);
    ok(ids(near)[0] === 5000 && near.meta.located === true && near.meta.zipUnplaced == null, `Closest to me: Atlanta first for 30303, the search is located, no ZIP complaint (${ids(near)[0]})`);
    ok(near.meta.radius == null, "Closest to me hides no car for being far (no radius)");
    ok(!ids(near).includes(5099) || ids(near).indexOf(5099) === ids(near).length - 1, "Closest to me: a car with no place is last, or set aside and counted by the engine's quiet line, never in the middle");
  }
  ok(!none.error && none.meta.located === false && none.meta.zipUnplaced == null && ids(none)[0] !== 5000, "nearest with no ZIP: the order stays ending soonest (the page asks for the ZIP before it asks the engine)");
  ok(!bad.error && bad.meta.located === false && /could not be placed/.test(String(bad.meta.zipUnplaced || "")), `a ZIP the engine has no place for (30301): the order stays and the engine says why (${bad.error ? bad.error.message : bad.meta.zipUnplaced})`);
  {
    const live = rows, dOf = r => { const c = geo.listingCoord(r), z = geo.zipCoord("30303"); return c && z ? geo.milesBetween(z, c) : null; };
    const inside = r => live.filter(x => { const d = dOf(x); return d != null && d <= r; }).map(x => x.id).sort((a, b) => a - b);
    const ord = { ending_soon: (a, b) => Date.parse(a.end_time) - Date.parse(b.end_time), nearest: (a, b) => dOf(a) - dOf(b), below_range: (a, b) => Date.parse(a.end_time) - Date.parse(b.end_time),   /* no stored market in this fixture: no car has a range, so the engine's below-range order ends where ending soonest does */
     newest: (a, b) => Date.parse(b.first_seen) - Date.parse(a.first_seen) };
    for (const r of [100, 250, 500]) for (const so of Object.keys(ord)) {
      const o = RS[r + "/" + so], tag = `radius ${r} with ${so}`;
      ok(!o.error, `${tag}: the engine answers (${o.error ? o.error.message : "ok"})`); if (o.error) continue;
      const want = live.filter(x => inside(r).includes(x.id)).sort(ord[so]).map(x => x.id);
      ok(JSON.stringify(ids(o)) === JSON.stringify(want), `${tag}: the engine returns the cars inside ${r} miles, in this sort's order (${ids(o)} against ${want})`);
      ok(!ids(o).includes(5099), `${tag}: a car whose listing gives no place is left out of a radius`);
      ok((o.cards || []).every(c => c.distance != null && c.distance <= r), `${tag}: every car carries its miles from the zip, none past ${r}`);
      ok(o.meta.within === `within ${r} miles of 30303` && o.meta.liveLine === `${want.length} live ${want.length === 1 ? "match" : "matches"} within ${r} miles of 30303`, `${tag}: the engine's count line (${o.meta.liveLine})`);
      ok(JSON.stringify(o.meta.keepPatch) === JSON.stringify({ location: "30303", radius_miles: r }), `${tag}: the keep-looking patch carries the zip and radius (${JSON.stringify(o.meta.keepPatch)})`);
      ok(!("location" in o.state.filters) && !("radius_miles" in o.state.filters) && !("zip_label" in o.state.filters), `${tag}: the zip and radius are not left in the search's own filters (${Object.keys(o.state.filters)})`);
    }
    for (const so of Object.keys(ord)) { const o = RS["null/" + so]; ok(!o.error && (so === "nearest" || ids(o).includes(5099)) && o.meta.within == null && o.meta.keepPatch == null && ids(o).length === live.length - (so === "nearest" ? 1 : 0), `Anywhere with ${so}: every live car, the no-place car included except under Closest to me, which counts it in its quiet line, no radius phrase, nothing to keep (${o.error ? o.error.message : ids(o).length + " of " + live.length})`); }
    ok(inside(100).length < inside(250).length && inside(250).length < inside(500).length, `the fixture rows give three different radius sets (${inside(100).length}, ${inside(250).length}, ${inside(500).length})`);
    ok(!afterNear.error && afterNear.meta.live === live.length && afterNear.meta.radius == null && afterNear.meta.within == null, `a sort change after Closest to me: all ${live.length} cars again, no 150 mile radius left behind (${afterNear.error ? afterNear.error.message : afterNear.meta.live + ", radius " + afterNear.meta.radius})`);
    ok(!taskRun.error && JSON.stringify((taskRun.matches || []).map(x => x.r.id).sort((a, b) => a - b)) === JSON.stringify(inside(250)), `Tasks: a saved search carrying the zip and radius (keep looking) matches only cars inside it, so the email sends nothing outside (${taskRun.error ? taskRun.error.message : (taskRun.matches || []).map(x => x.r.id).sort()} against ${inside(250)})`);
    ok(!unplacedR.error && unplacedR.meta.located === false && /could not be placed/.test(String(unplacedR.meta.zipUnplaced || "")) && unplacedR.meta.live === live.length, `a radius from a zip the engine cannot place (30301): every car stays and the engine says why`);
  }
}
// ---- the page
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(width, url, opts = {}) {
  const asks = [], locates = []; const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  await p.evaluateOnNewDocument(z0 => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 })); window.__geo = 0; navigator.geolocation.getCurrentPosition = (ok) => { window.__geo++; setTimeout(() => ok({ coords: { latitude: 33.749, longitude: -84.388 } }), 10); };  if (z0 && z0[0]) sessionStorage.setItem("gas_buy_zip", z0[0]); if (z0 && z0[1]) sessionStorage.setItem("gas_buy_radius", z0[1]); }, [opts.zip || null, opts.radius || null]);
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: findHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {}
      const J = o => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (body.action === "more") { asks.push(body); return engineAnswer(body.filters || {}, Number(body.offset) || 0, body.zip, body.radius).then(e => J({ cards: e.cards, meta: e.meta })); }
      if (body.action === "chat" || body.action === "rerun") { asks.push(body); return engineAnswer(body.filters || {}, 0, body.zip, body.radius).then(e => J({ reply: "", suggest: [], state: { filters: body.filters || {} }, turns: 1, cards: e.cards, meta: e.meta })); }
      if (body.action === "enrich") return J({ cards: [] });
      return J(body.action === "list" ? { items: [] } : {}); }
    if ((u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname))) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com" + url, { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 1200));
  return { p, asks, locates, errs };
}
const read = p => p.evaluate(() => ({ ids: [...document.querySelectorAll("article.car")].map(a => Number(a.getAttribute("data-id"))), opts: [...document.querySelectorAll("select[data-sort] option")].map(o => [o.value, o.textContent]), cur: (document.querySelector("select[data-sort]") || {}).value || null, boxShown: !!document.querySelector("[data-sortloc]:not([hidden])"), boxZip: !!document.querySelector("[data-sortloc] input[name=zip]"), boxLoc: !!document.querySelector("[data-sortloc] [data-uselocation]"), page: !!document.querySelector("[data-page]"), more: !!document.querySelector("[data-more]"), away: [...document.querySelectorAll("article.car")].slice(0, 6).map(a => /miles away/.test(a.textContent)), sideways: document.documentElement.scrollWidth > window.innerWidth + 1, geo: window.__geo, chips: [...document.querySelectorAll(".fchip")].map(c => c.textContent.replace(/×/g, "").trim()) }));
const settle = async (p, want) => { for (let i = 0; i < 50; i++) { const s = await read(p); if (want(s)) return s; await new Promise(r => setTimeout(r, 150)); } return await read(p); };
const revealAll = async p => { for (let i = 0; i < 20; i++) { const more = await p.evaluate(() => { const a = document.querySelector("[data-more]"); if (a) { a.click(); return "more"; } const g = document.querySelector("[data-page]"); if (g) { g.click(); return "page"; } return null; }); if (!more) break; await new Promise(r => setTimeout(r, 350)); } await new Promise(r => setTimeout(r, 500)); return await read(p); };
const pick = (p, v) => p.evaluate(v => { const s = document.querySelector("select[data-sort]"); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, v);
try {
  for (const width of [1440, 390]) {
    // the menu: the four, in order, the default kept
    { const { p, errs } = await open(width, "/find?make=Porsche&model=911"); const s = await settle(p, s => s.ids.length > 0);
      ok(JSON.stringify(s.opts.slice(0, 4)) === JSON.stringify([["ending_soon", "Ending soonest"], ["below_range", "Furthest below the range"], ["nearest", "Closest to me"], ["newest", "Newest"]]), `${width} menu: Ending soonest, Furthest below the range, Closest to me, Newest, in that order (${JSON.stringify(s.opts.slice(0, 4))})`);
      ok(s.cur === "ending_soon", `${width} menu: the default stays Ending soonest (${s.cur})`);
      ok(JSON.stringify(s.ids.slice(0, SHOW_BATCH)) === JSON.stringify(oracleEnding.slice(0, SHOW_BATCH)), `${width} default order is the engine's ending-soonest order`);
      ok(!s.boxShown, `${width} the ZIP box is not showing before Closest to me is chosen`); ok(errs.length === 0, `${width} no page error (${errs[0] || ""})`); await p.close(); }
    // every sort, across every batch, in the engine's order
    for (const [val, oracle, extra, url, oo] of [["below_range", oracleBelow, "", "/find?make=Porsche&model=911"], ["newest", oracleNewest, "", "/find?make=Porsche&model=911"], ["nearest", oracleNear("30303"), "30303", "/find?make=Porsche&model=911", { zip: "30303" }], ["ending_soon", oracleEnding, "", "/find?make=Porsche&model=911&sort=newest"]]) {
      const tag = `${width} ${val}`, { p, asks, errs } = await open(width, url, oo || {});
      await settle(p, s => s.ids.length > 0); await pick(p, val); await settle(p, s => s.cur === val && s.ids.length > 0 && s.ids[0] === oracle[0]);
      const ask = asks.filter(a => a.action === "rerun" || a.action === "chat").pop();
      ok(ask && ask.filters && ask.filters.sort === val, `${tag}: the search asks the engine for the order (${ask && ask.filters && ask.filters.sort})`);
      const s = await revealAll(p);
      ok(JSON.stringify(s.ids) === JSON.stringify(oracle), `${tag}: every batch, in the engine's order, none dropped or repeated (${s.ids.length} cars; first ${s.ids.slice(0, 5)} against ${oracle.slice(0, 5)})`);
      const more = asks.filter(a => a.action === "more");
      ok(more.length === 2 && more.every(m => m.filters.sort === val && (!extra || m.zip === extra)), `${tag}: Show more asks with the same sort${extra ? " and the ZIP" : ""} (${more.length} asks)`);
      if (val === "nearest") { ok(s.away.every(Boolean), `${tag}: each card shows the miles the engine gave it`); }
      ok(!s.sideways, `${tag}: no sideways scroll`); ok(errs.length === 0, `${tag}: no page error (${errs[0] || ""})`);
      if (val === "below_range") { ok(s.chips.length > 0, `${tag}: the chips stay (${s.chips.join(", ")})`); }
      await p.close();
    }
    // Closest to me with no ZIP kept: the box, asked once, nothing searched until it is given; then the ZIP is kept for the session
    { const tag = `${width} closest to me, no ZIP`, { p, asks } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0);
      const before = asks.length; await pick(p, "nearest"); await new Promise(r => setTimeout(r, 600)); const s0 = await read(p);
      ok(s0.boxShown && s0.boxZip && !s0.boxLoc, `${tag}: the box beside the menu offers a ZIP field and nothing else (${s0.boxShown}, ${s0.boxZip}, ${s0.boxLoc})`);
      ok(asks.length === before && s0.geo === 0, `${tag}: nothing is searched and the browser's position is never read (searches ${asks.length - before}, position reads ${s0.geo})`);
      await p.evaluate(() => { const i = document.querySelector("[data-sortloc] input[name=zip]"); i.value = "30303"; i.form.requestSubmit(); });
      await settle(p, s => s.ids[0] === oracleNear("30303")[0] && s.ids.length > 0);
      const z = asks.filter(a => a.action === "rerun" || a.action === "chat").pop(), s1 = await read(p);
      ok(z && z.zip === "30303" && z.filters.sort === "nearest", `${tag}: the ZIP runs the search again, closest first (${z && JSON.stringify({ zip: z.zip, s: z.filters.sort })})`);
      ok(s1.ids.slice(0, 6).join() === oracleNear("30303").slice(0, 6).join() && s1.away.every(Boolean) && !s1.boxShown, `${tag}: the cars come closest first, each with the miles the engine gave it, and the box is gone`);
      const keep = await p.evaluate(() => { try { return [sessionStorage.getItem("gas_buy_zip"), localStorage.getItem("gas_buy_zip")]; } catch (e) { return ["x", "x"]; } });
      ok(keep[0] === "30303" && !keep[1], `${tag}: the ZIP is kept for the session, not for the next visit (${JSON.stringify(keep)})`);
      // another sort and back: no second question, the search runs at once with the kept ZIP
      await pick(p, "ending_soon"); await settle(p, s => s.cur === "ending_soon" && s.ids[0] === oracleEnding[0]);
      const n0 = asks.length; await pick(p, "nearest"); await settle(p, s => s.cur === "nearest" && s.ids[0] === oracleNear("30303")[0]); const s2 = await read(p);
      ok(!s2.boxShown && asks.length > n0 && asks[asks.length - 1].zip === "30303", `${tag}: asked once: choosing it again orders at once with the kept ZIP, no box (${asks.length - n0} searches)`);
      // Show more after the ZIP: the same sort, the same ZIP
      await revealAll(p); const mo = asks.filter(a => a.action === "more");
      ok(mo.length >= 2 && mo.every(m => m.filters.sort === "nearest" && m.zip === "30303"), `${tag}: each Show more asks with the sort and the kept ZIP (${mo.length} asks)`);
      await p.close(); }
    // a ZIP the engine has no place for: the engine's line shows in the box, the ZIP is not kept, the order stays
    { const tag = `${width} closest to me, a ZIP the engine cannot place`, { p } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0);
      await pick(p, "nearest"); await new Promise(r => setTimeout(r, 300));
      await p.evaluate(() => { const i = document.querySelector("[data-sortloc] input[name=zip]"); i.value = "30301"; i.form.requestSubmit(); }); await new Promise(r => setTimeout(r, 900));
      const st = await p.evaluate(() => ({ box: !!document.querySelector("[data-sortloc]:not([hidden])"), note: (document.querySelector("[data-sortloc-note]") || {}).textContent || "", kept: sessionStorage.getItem("gas_buy_zip") }));
      ok(st.box && /could not be placed/.test(st.note) && !st.kept, `${tag}: the box stays with the engine's line and the ZIP is not kept (${JSON.stringify(st)})`); await p.close(); }
    // THE DISTANCE FILTER on the page (Nov 3 2026): no radius row before a zip is set; with one, 100 / 250 / 500 / Anywhere (Anywhere on); a chip asks the engine again with the zip and radius, the engine's count line and cars are drawn, Show more and a sort change carry zip, radius and sort, the pair is kept for the session, and Have Sam keep looking carries it
    {
      const inR = (r, ord) => FIX.filter(f => { const d = distOf("30303", f); return d != null && d <= r; }).sort(ord).map(f => f.r.id);
      const byEnd = (a, b) => endsAt(a) - endsAt(b), byNew = (a, b) => Date.parse(b.r.first_seen) - Date.parse(a.r.first_seen) || endsAt(a) - endsAt(b);
      const rows2 = p => p.evaluate(() => ({ row: !!document.querySelector(".radrow"), chips: [...document.querySelectorAll(".radrow [data-radius]")].map(c => c.textContent.trim()), on: [...document.querySelectorAll(".radrow [data-radius].on")].map(c => c.textContent.trim()), count: ((document.querySelector(".scount .sc-1") || {}).textContent || "").trim(), kept: [sessionStorage.getItem("gas_buy_zip"), sessionStorage.getItem("gas_buy_radius"), localStorage.getItem("gas_buy_radius")], keep: (document.querySelector("a[data-keep]") || {}).href || "", sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      const clickR = (p, r) => p.evaluate(r => document.querySelector(`.radrow [data-radius="${r}"]`).click(), r);
      { const tag = `${width} radius, no ZIP kept`, { p } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0); const r0 = await rows2(p);
        ok(!r0.row, `${tag}: no radius row until a zip is set`); await p.close(); }
      { const tag = `${width} radius`, { p, asks, errs } = await open(width, "/find?make=Porsche&model=911", { zip: "30303" }); await settle(p, s => s.ids.length > 0); const r0 = await rows2(p);
        ok(r0.row && JSON.stringify(r0.chips) === JSON.stringify(["100 miles", "250 miles", "500 miles", "Anywhere"]) && JSON.stringify(r0.on) === JSON.stringify(["Anywhere"]), `${tag}: with a zip kept the row offers 100, 250, 500 miles and Anywhere, Anywhere on (${JSON.stringify(r0.chips)} on ${JSON.stringify(r0.on)})`);
        ok(!/within/.test(r0.count), `${tag}: Anywhere prints no distance in the count line (${r0.count})`);
        await clickR(p, 250); const want = inR(250, byEnd); await settle(p, s => s.ids.length === want.length && s.ids[0] === want[0]);
        const a1 = asks.filter(a => a.action === "rerun" || a.action === "chat").pop(), r1 = await rows2(p), s1 = await read(p);
        ok(a1 && a1.zip === "30303" && a1.radius === 250 && a1.filters && !("radius_miles" in a1.filters) && !("location" in a1.filters), `${tag}: 250 asks the engine with the zip and radius, not as a filter of the page's own (${a1 && JSON.stringify({ zip: a1.zip, radius: a1.radius })})`);
        ok(JSON.stringify(s1.ids) === JSON.stringify(want) && want.length === 24, `${tag}: the cars are the engine's ${want.length} inside 250 miles, in its order (${s1.ids.length})`);
        ok(r1.count === `${want.length} live matches within 250 miles of 30303`, `${tag}: the count line is the engine's (${r1.count})`);
        ok(JSON.stringify(r1.on) === JSON.stringify(["250 miles"]) && r1.kept[0] === "30303" && r1.kept[1] === "250" && !r1.kept[2], `${tag}: the chip is on and the zip and radius are kept for the session, not the next visit (${JSON.stringify(r1.kept)})`);
        ok(/radius_miles/.test(decodeURIComponent(r1.keep)) && /"location":"30303"/.test(decodeURIComponent(r1.keep)), `${tag}: Have Sam keep looking carries the zip and the radius, so the email sends cars inside it (${decodeURIComponent(r1.keep).slice(-90)})`);
        // a sort inside the radius, all the batches, then a zip change that keeps the sort
        await clickR(p, 500); await settle(p, s => s.ids.length > 0 && s.ids.length <= SHOW_BATCH && inR(500, byEnd).length > SHOW_BATCH);
        await pick(p, "newest"); const want5 = inR(500, byNew); await settle(p, s => s.cur === "newest" && s.ids[0] === want5[0]);
        const sAll = await revealAll(p), mo = asks.filter(a => a.action === "more");
        ok(JSON.stringify(sAll.ids) === JSON.stringify(want5) && want5.length > SHOW_BATCH, `${tag}: 500 miles with Newest, every batch, in the engine's order (${sAll.ids.length} of ${want5.length})`);
        ok(mo.length >= 1 && mo.every(m => m.zip === "30303" && m.radius === 500 && m.filters.sort === "newest"), `${tag}: each Show more carries the zip, the radius and the sort (${JSON.stringify(mo.map(m => [m.zip, m.radius, m.filters.sort]))})`);
        const r5 = await rows2(p); ok(r5.count.startsWith(`${want5.length} live matches within 500 miles of 30303`), `${tag}: the count line reads the engine's (${r5.count})`);
        await p.evaluate(() => { const b = document.querySelector("[data-radzip]"); b.click(); const i = document.querySelector("[data-radloc] input[name=zip]"); i.value = "30303"; i.form.requestSubmit(); });
        await new Promise(r => setTimeout(r, 900)); const a2 = asks.filter(a => a.action === "rerun" || a.action === "chat").pop();
        ok(a2 && a2.zip === "30303" && a2.radius === 500 && a2.filters.sort === "newest", `${tag}: changing the zip keeps the sort and the radius (${a2 && JSON.stringify({ z: a2.zip, r: a2.radius, s: a2.filters.sort })})`);
        await clickR(p, 0); const wantA = FIX.slice().sort(byNew).map(f => f.r.id); await settle(p, s => s.ids[0] === wantA[0] && s.ids.length === SHOW_BATCH);
        const a3 = asks.filter(a => a.action === "rerun" || a.action === "chat").pop(), r3 = await rows2(p);
        ok(a3 && a3.radius == null && a3.zip === "30303" && JSON.stringify(r3.on) === JSON.stringify(["Anywhere"]) && !/within/.test(r3.count) && r3.kept[1] === "", `${tag}: Anywhere asks with no radius, every car again (${JSON.stringify({ r: a3 && a3.radius, on: r3.on, count: r3.count })})`);
        ok(!/radius_miles/.test(decodeURIComponent((await rows2(p)).keep)), `${tag}: Anywhere keeps no radius in the saved search`);
        ok(!r3.sideways && errs.length === 0, `${tag}: no sideways scroll, no page error (${errs[0] || ""})`); await p.close(); }
    }
    // a bad ZIP is refused on the page and nothing is searched
    { const tag = `${width} closest to me, a bad ZIP`, { p, asks } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0);
      await pick(p, "nearest"); await new Promise(r => setTimeout(r, 300)); const n0 = asks.length;
      await p.evaluate(() => { const i = document.querySelector("[data-sortloc] input[name=zip]"); i.removeAttribute("pattern"); i.value = "123"; i.form.requestSubmit(); }); await new Promise(r => setTimeout(r, 400));
      const note = await p.evaluate(() => (document.querySelector("[data-sortloc-note]") || {}).textContent || "");
      ok(asks.length === n0 && /5 digit/.test(note), `${tag}: nothing is searched and the box says why (${asks.length - n0} searches, "${note}")`); await p.close(); }
  }
} catch (e) { ok(false, "threw " + e.message); }
{
  const rd = x => fs.readFileSync(new URL("../" + x, import.meta.url), "utf8"), buy = rd("api/buy.js"), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
  ok(!/\.sort\([^)]*(rank|gap|distance|below_range)/.test(client), "the page holds no sort of its own by rank, gap or distance");
  ok(!/sessionStorage\.setItem\("gas_buy_zip"/.test(client.replace(/function setZip[^}]*}/, "")) && !/localStorage\.setItem\([^)]*zip/i.test(client), "the ZIP is written in one place (setZip, session storage) and never to local storage");
  ok(!/distance\s*[<>]=?\s*r(adius)?\b|miles\s*[<>]=?\s*r(adius)?\b/.test(client) && !/\.filter\([^)]*radius/.test(client), "the page holds no radius test of its own (the engine decides who is inside)");
  ok(!/getCurrentPosition|navigator\.geolocation/.test(client) && !/action: "locate"/.test(client), "the page never reads the browser's position");
}
await b.close();
console.log(`findSortsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
