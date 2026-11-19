// Renders the real Find page (api/buy.js with its client) in Chrome with the live cars fixed: each card carries the engine's answer built through the real Find path (specOf, coreOf, marketFromCore, samLines). No network.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, pageHtml, crewCookie } from "./e98Render.mjs";
import { base } from "./e98Fixtures.mjs";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
export async function buildCards(defs, extraPerCard = {}) {
  const S = await imp("lib/live/search.js"), { samLines } = await imp("api/buySearch.js"), { slimNearPool } = await imp("lib/onebox.js");
  let id = 100;
  return defs.map(c => {
    const row = { id: ++id, listing_title: c.title, year: c.year, make: c.make, model: c.model, source: "bringatrailer", current_bid: c.bid, current_bid_usd: c.bid, end_time: new Date(Date.now() + 4 * 864e5).toISOString() };
    const spec = { v: { year: c.year, make: c.make, model: c.model, ...(c.trim ? { trim: c.trim } : {}), ...(c.body ? { bodyStyle: c.body } : {}) }, title: c.title };
    const d = { ...base, ...c.d }; const core = S.coreOf(d, spec);
    if (core && c.d.nearPool) core.nearPool = slimNearPool(c.d.nearPool.map(x => ({ _usd: x.p, mileage: x.m })));
    const market = core ? S.marketFromCore(core, row, { miles: c.miles || null, priceUsd: c.bid }, spec) : { kind: "pending" };
    if (c.findAnswer) market.findAnswer = c.findAnswer;
    const l = { id: row.id, title: c.title, make: c.make, model: c.model, year: c.year, url: "https://bringatrailer.com/listing/" + row.id, image: PHOTO, platform: "Bring a Trailer", source: "Bring a Trailer", current_bid_usd: c.bid, end_time: row.end_time, bid_at: new Date(Date.now() - 3 * 3600e3).toISOString(), photo_url: c.photo === false ? null : PHOTO, market, sam_lines: [], ...(c.extra || {}), ...extraPerCard };
    l.sam_lines = samLines(l, Date.now());
    return l;
  });
}
const PHOTO = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d9d4c7"/></svg>');
const htmls = {};
async function buyHtml(crew) { const k = crew ? "crew" : "pub"; return htmls[k] || (htmls[k] = await pageHtml("api/buy.js", "/buy", crew)); }
export async function openFind(browser, cards, width, typed = "black BMW", opts = {}) {
  const page = await buyHtml(opts.crew), p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; });
  if (opts.crew) await p.setCookie({ name: "gas_crew", value: (await crewCookie()).split("=")[1], domain: "goasksam.com", path: "/" });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: page });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {}
      if (b.action === "chat") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "Here is what is for sale.", turns: 1, state: { filters: { make: "BMW", color: "black" } }, meta: { count: cards.length, total: cards.length, narrow: "none" }, cards }) });
      if (b.action === "enrich") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: [] }) });
      return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/buy", { waitUntil: "networkidle2" }).catch(() => {});
  await p.evaluate(() => { if (!window.GAS_UPDATED) window.GAS_UPDATED = "Oct 28, 2026"; });
  const sel = await p.evaluate(() => [...document.querySelectorAll("textarea,input")].map(e => e.id || e.name).join(","));
  await p.waitForSelector("#hq", { timeout: 5000 }).catch(() => {});
  await p.type("#hq", typed); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 2500));
  p._inputs = sel; return p;
}
