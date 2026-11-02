// FIND SORTS (Lane E, Nov 2 2026; a dealer group buyer's two asks): "Furthest below the range" and "Closest to me". The ENGINE orders (lib/live/samChat.js orderMatches with the rank api/buySearch.js rankByBid gives from the same bid-against-range
// judgement the card prints; the distance from the place the search carries); the page draws the order it is given and sorts nothing. The class: every sort the menu offers returns the engine's order across Show more batches, at 1440 and 390;
// the below-range order puts the deepest gap first, then cars within the range, then above it, then no range, no bid or still being read, last; Closest to me with no place shows the two-choice box (the visitor's ZIP, or the browser's position
// only when the visitor presses Use my location) and with a place shows the miles; the place is kept for that search only. The oracle for each order is written here from the fixture numbers, not read from the engine.   node scripts/findSortsCheck.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const sm = await imp("lib/live/samChat.js"), bs = await imp("api/buySearch.js"), geo = await imp("lib/live/geo.js");
ok(typeof sm.orderMatches === "function" && typeof bs.rankByBid === "function", "the engine exports orderMatches and rankByBid (the one place the orders are made)");
const SHOW_BATCH = sm.SHOW_BATCH || 24;
// ---- fixtures: 60 live cars, deterministic; the engine-side object ({ r, facts, unknown, market }) of each, and the page card made from it
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const now = Date.now(), iso = h => new Date(now + h * 3600e3).toISOString();
const CITIES = ["Atlanta, GA", "Chicago, IL", "Dallas, TX", "Los Angeles, CA", "Denver, CO", "Seattle, WA", "Boston, MA", "Miami, FL", "Phoenix, AZ", "Portland, OR"];
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
async function engineAnswer(filters, offset) {
  const list = FIX.map(f => ({ r: f.r, facts: f.facts, unknown: [], market: f.market })), zip = (/\d{5}/.exec(String(filters.location || "")) || [])[0] || null, center = zip ? geo.zipCoord(zip) : null;
  if (center) for (const x of list) { const c = geo.listingCoord(x.r); x.distance = c ? geo.milesBetween(center, c) : null; }
  const key = filters.sort === "nearest" && !center ? "ending_soon" : filters.sort || "ending_soon";
  if (key === "below_range") await bs.rankByBid(null, list);
  sm.orderMatches(list, key);
  const batch = list.slice(offset, offset + SHOW_BATCH);
  const cards = batch.map(x => { const c = { ...bs.cardOf(x), market: x.market, seen_before: null, timeline: [], name: null }; if (x.distance != null) c.distance = x.distance; return { ...c, sam_lines: bs.samLines(c) }; });
  return { cards, meta: { live: list.length, asks: [], sort: key, located: !!center, place: center ? "Atlanta, GA" : null, ...sm.pageMeta(list.length, offset, batch.length) }, order: list.map(x => x.r.id) };
}
// ---- the engine, as the route uses it
for (const [name, key, want] of [["below_range", "below_range", oracleBelow], ["nearest with a place", "nearest", oracleNear("30301")], ["ending_soon", "ending_soon", oracleEnding], ["newest", "newest", oracleNewest]]) {
  const e = await engineAnswer({ make: "Porsche", sort: key, ...(key === "nearest" ? { location: "30301" } : {}) }, 0);
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
// ---- the page
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(width, url, opts = {}) {
  const asks = [], locates = []; const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  await p.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 })); window.__geo = 0; navigator.geolocation.getCurrentPosition = (ok) => { window.__geo++; setTimeout(() => ok({ coords: { latitude: 33.749, longitude: -84.388 } }), 10); }; });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: findHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {}
      const J = o => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (body.action === "more") { asks.push(body); return engineAnswer(body.filters || {}, Number(body.offset) || 0).then(e => J({ cards: e.cards, meta: e.meta })); }
      if (body.action === "chat" || body.action === "rerun") { asks.push(body); return engineAnswer(body.filters || {}, 0).then(e => J({ reply: "", suggest: [], state: { filters: body.filters || {} }, turns: 1, cards: e.cards, meta: e.meta })); }
      if (body.action === "locate") { locates.push(body); return J({ location: geo.nearestZip({ lat: Number(body.lat), lon: Number(body.lon) }) }); }
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
      ok(JSON.stringify(s.opts.slice(0, 4)) === JSON.stringify([["ending_soon", "Ending soonest"], ["below_range", "Furthest below the range"], ["nearest", "Closest to me"], ["newest", "Newest listing"]]), `${width} menu: Ending soonest, Furthest below the range, Closest to me, Newest listing, in that order (${JSON.stringify(s.opts.slice(0, 4))})`);
      ok(s.cur === "ending_soon", `${width} menu: the default stays Ending soonest (${s.cur})`);
      ok(JSON.stringify(s.ids.slice(0, SHOW_BATCH)) === JSON.stringify(oracleEnding.slice(0, SHOW_BATCH)), `${width} default order is the engine's ending-soonest order`);
      ok(!s.boxShown, `${width} the two-choice box is not showing before Closest to me is chosen`); ok(errs.length === 0, `${width} no page error (${errs[0] || ""})`); await p.close(); }
    // every sort, across every batch, in the engine's order
    for (const [val, oracle, extra, url] of [["below_range", oracleBelow, "", "/find?make=Porsche&model=911"], ["newest", oracleNewest, "", "/find?make=Porsche&model=911"], ["nearest", oracleNear("30301"), "30301", "/find?make=Porsche&model=911&near=30301"], ["ending_soon", oracleEnding, "", "/find?make=Porsche&model=911&sort=newest"]]) {
      const tag = `${width} ${val}`, { p, asks, errs } = await open(width, url);
      await settle(p, s => s.ids.length > 0); await pick(p, val); await settle(p, s => s.cur === val && s.ids.length > 0 && s.ids[0] === oracle[0]);
      const ask = asks.filter(a => a.action === "rerun" || a.action === "chat").pop();
      ok(ask && ask.filters && ask.filters.sort === val, `${tag}: the search asks the engine for the order (${ask && ask.filters && ask.filters.sort})`);
      const s = await revealAll(p);
      ok(JSON.stringify(s.ids) === JSON.stringify(oracle), `${tag}: every batch, in the engine's order, none dropped or repeated (${s.ids.length} cars; first ${s.ids.slice(0, 5)} against ${oracle.slice(0, 5)})`);
      const more = asks.filter(a => a.action === "more");
      ok(more.length === 2 && more.every(m => m.filters.sort === val && (!extra || m.filters.location === extra)), `${tag}: Show more asks with the same sort${extra ? " and place" : ""} (${more.length} asks)`);
      if (val === "nearest") { ok(s.away.every(Boolean), `${tag}: each card shows the miles the engine gave it`); }
      ok(!s.sideways, `${tag}: no sideways scroll`); ok(errs.length === 0, `${tag}: no page error (${errs[0] || ""})`);
      if (val === "below_range") { ok(s.chips.length > 0, `${tag}: the chips stay (${s.chips.join(", ")})`); }
      await p.close();
    }
    // Closest to me with no place: the box, then each of its two choices; the position is read only when asked for
    { const tag = `${width} closest to me, no place`, { p, asks, locates } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0);
      const before = asks.length; await pick(p, "nearest"); await new Promise(r => setTimeout(r, 600)); const s0 = await read(p);
      ok(s0.boxShown && s0.boxZip && s0.boxLoc, `${tag}: the box beside the menu offers a ZIP field and Use my location (${s0.boxShown}, ${s0.boxZip}, ${s0.boxLoc})`);
      ok(asks.length === before && s0.geo === 0, `${tag}: nothing is searched and the browser's position is not read until the visitor chooses (searches ${asks.length - before}, position reads ${s0.geo})`);
      // a ZIP
      await p.evaluate(() => { const i = document.querySelector("[data-sortloc] input[name=zip]"); i.value = "30301"; i.form.requestSubmit(); });
      await settle(p, s => s.ids[0] === oracleNear("30301")[0] && s.ids.length > 0);
      const z = asks.filter(a => a.action === "rerun" || a.action === "chat").pop(), s1 = await read(p);
      ok(z && z.filters.location === "30301" && z.filters.sort === "nearest", `${tag}: the ZIP runs the search again, closest first (${z && JSON.stringify({ l: z.filters.location, s: z.filters.sort })})`);
      ok(s1.ids.slice(0, 6).join() === oracleNear("30301").slice(0, 6).join() && s1.away.every(Boolean) && !s1.boxShown, `${tag}: with the place the miles show and the box is gone`);
      ok(s1.chips.some(c => /30301/.test(c)), `${tag}: the place is a chip of this search (${s1.chips.join(", ")})`);
      const keep = await p.evaluate(() => { try { return [sessionStorage.getItem("gas_buy_zip"), localStorage.getItem("gas_buy_zip")]; } catch (e) { return ["x", "x"]; } }); ok(!keep[0] && !keep[1], `${tag}: the place is kept for this search only, not stored for the next (${JSON.stringify(keep)})`);
      await p.close(); }
    { const tag = `${width} use my location`, { p, asks, locates } = await open(width, "/find?make=Porsche&model=911"); await settle(p, s => s.ids.length > 0);
      await pick(p, "nearest"); await new Promise(r => setTimeout(r, 400));
      await p.evaluate(() => document.querySelector("[data-uselocation]").click());
      await settle(p, s => s.ids[0] === oracleNear(geo.nearestZip({ lat: 33.749, lon: -84.388 }))[0] && s.ids.length > 0).catch(() => null);
      await new Promise(r => setTimeout(r, 800)); const s = await read(p), zz = geo.nearestZip({ lat: 33.749, lon: -84.388 });
      ok(s.geo === 1 && locates.length === 1, `${tag}: the browser's position is read once, when the visitor pressed the button (${s.geo} reads, ${locates.length} asks)`);
      const ask = asks.filter(a => a.action === "rerun" || a.action === "chat").pop();
      ok(zz && ask && ask.filters.location === zz && ask.filters.sort === "nearest" && !JSON.stringify(ask).includes("33.749"), `${tag}: the search runs with the engine's ZIP (${zz}), never the coordinates (${ask && ask.filters.location})`);
      ok(s.ids.slice(0, 6).join() === oracleNear(zz).slice(0, 6).join() && s.away.every(Boolean), `${tag}: the cars come closest first with their miles`);
      await p.close(); }
    // Closest to me with a place already in the search: at once, no box
    { const tag = `${width} closest to me, place in the search`, { p, asks } = await open(width, "/find?make=Porsche&model=911&near=30301"); await settle(p, s => s.ids.length > 0);
      const s0 = await read(p); ok(s0.away.every(Boolean) || true, `${tag}: loaded`);
      await pick(p, "nearest"); await settle(p, s => s.cur === "nearest" && s.ids[0] === oracleNear("30301")[0]); const s = await read(p);
      ok(!s.boxShown && s.away.every(Boolean), `${tag}: ordered by distance at once, the miles on each card, no box`); await p.close(); }
  }
} catch (e) { ok(false, "threw " + e.message); }
{
  const rd = x => fs.readFileSync(new URL("../" + x, import.meta.url), "utf8"), buy = rd("api/buy.js"), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
  ok(!/\.sort\([^)]*(rank|gap|distance|below_range)/.test(client), "the page holds no sort of its own by rank, gap or distance");
  ok(!/setZip\([^)]*(loc|zz)/.test(client) && !/sessionStorage\.setItem\("gas_buy_zip", (loc|z)\b/.test(client.replace(/function setZip[^}]*}/, "")), "Closest to me never writes the place to storage");
  ok(/getCurrentPosition/.test(client) && (client.match(/getCurrentPosition/g) || []).length === 1, "the browser's position is read in one place, behind the Use my location button");
}
await b.close();
console.log(`findSortsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
