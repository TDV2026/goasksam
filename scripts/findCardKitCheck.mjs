// TASKS SHOW FIND'S OWN CARD (Sam, Oct 23 2026): ONE card component. OFFLINE: (1) the kit lifts every name it needs from Find's client (a rename
// there fails here); (2) the same engine card, drawn on Find's real page and on the Tasks page, is the SAME markup; (3) on the Tasks page the
// Market Check button opens the drawer, Sold before opens the history popup, only the photo and View auction link to the auction, and the
// model-written paragraph above the cars is gone (the engine's one-line count stands); (4) the server step reads each listing again, keeps
// order, falls back to the thin line for a car it cannot read, and caps the cars read; (5) place names ("King of Prussia").  No network.
//   node scripts/findCardKitCheck.mjs   (from the repo root; needs Chrome)
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const kit = await import(pathToFileURL(path.join(ROOT, "lib/findCardKit.js")).href);
const fc = await import(pathToFileURL(path.join(ROOT, "lib/tasks/fullCards.js")).href);
// 1
let built = null; try { built = kit.buildKitSource(); } catch (e) { console.log("kit error: " + e.message); }
ok(built && built.names.length === kit.KIT_NAMES.length, "every kit name is declared in Find's client (" + (built ? built.names.length : 0) + ")");
ok(/function card\(l/.test(built ? built.code : "") && /function drawerHtml/.test(built.code) && !/alertSwitchHtml\(l\)\s*\{/.test(built.code), "the kit carries Find's card and drawer, and leaves out the alert switch and the car watch");
// 4 (server step, injected reads)
{ const rows = { 1: { id: 1 }, 2: { id: 2 }, 4: { id: 4 } }; let reads = 0;
  const deps = { select: async (_e, q) => { reads++; return Object.keys(rows).filter(k => new RegExp("[(,]" + k + "[,)]").test(q)).map(k => rows[k]); }, facts: r => ({ f: r.id }), enrich: async (_e, x) => ({ id: x.r.id, enriched: true }) };
  const out = await fc.fullCardsFor({}, [{ id: 1 }, { id: 3 }, { id: 2 }], deps);
  ok(JSON.stringify(out) === JSON.stringify([{ id: 1, enriched: true }, null, { id: 2, enriched: true }]), "the server step keeps the order and leaves a car it cannot read as null (its thin line stays): " + JSON.stringify(out));
  const tasks = [{ updates: [{ role: "sam", created_at: "2026-10-23T10:00:00Z", data: { cards: [{ id: 1 }, { id: 2 }] } }, { role: "sam", created_at: "2026-10-22T10:00:00Z", data: { cards: [{ id: 4 }] } }, { role: "user", data: { cards: [{ id: 9 }] } }] }];
  await fc.attachFullCards({}, tasks, deps);
  ok(tasks[0].updates[0].data.full.length === 2 && tasks[0].updates[0].data.full[0].id === 1 && tasks[0].updates[1].data.full[0].id === 4 && !tasks[0].updates[2].data.full, "the cars of each update get their full cards, newest update first; a user turn is left alone");
  const many = [{ updates: [{ role: "sam", created_at: "2026-10-23T10:00:00Z", data: { cards: Array.from({ length: 40 }, (_, i) => ({ id: i + 100 })) } }] }];
  await fc.attachFullCards({}, many, { select: async () => [], facts: r => r, enrich: async () => null });
  ok(many[0].updates[0].data.full.length === fc.FULL_CAP, "no more than " + fc.FULL_CAP + " cars are read per request");
  ok(fc.updateLine({ data: { opening: true, total: 12, cards: [{}] } }) === "12 live cars match." && fc.updateLine({ data: { total: 1, cards: [{}] } }) === "1 new car matches." && fc.updateLine({ data: { cards: [{}, {}] } }) === "2 new cars match.", "the engine's one-line count"); }
// 5
{ const { placeCase } = await import(pathToFileURL(path.join(ROOT, "lib/placeCase.js")).href); ok(placeCase("King Of Prussia, PA") === "King of Prussia, PA", "King of Prussia"); }
// 2 and 3 (browser)
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString(), ago = h => new Date(now - h * 3600e3).toISOString();
const card = (id, t, extra) => Object.assign({ id, title: t, make: "Porsche", url: "https://auction.test/" + id, source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: "https://img.test/" + id + ".jpg", end_time: soon(5.5), current_bid_usd: 40000 + id * 1000, bid_at: ago(0.4), miles: 30000 + id * 1000, location: "King of Prussia, PA", country: "US", chips: ["Manual", "Guards Red"], market: { kind: "range", low: 55000, high: 78000, count: 24, query: "1995 Porsche 911", basisLine: "Based on 24 sales, the latest in October 2026." }, sam_lines: [{ kind: "range", rung: [], placing: "below the range", text: "The middle half of 911 sales landed at $55,000 to $78,000 since December 2025. The bid is below the range." }], timeline: [{ date: "2024-03-12", result: "sold", price: 61000, miles: 29000, house: "Bring a Trailer", url: null }], seen_before: { n: 1 }, history_url: "/vin/ABC", year: 1995 }, extra || {});
const FIX = [card(1, "1995 Porsche 911 Carrera"), card(2, "1996 Porsche 911 Carrera 4", { photo_url: null }), card(3, "1994 Porsche 964 Carrera RS", { market: { kind: "none", query: "x", cardListsSales: true, rows: [{ price: 25500, date: "2026-05-14", mi: 4000, title: "t", image: null }] }, sam_lines: [{ kind: "range", rung: ["964 models"], text: "Not enough sales of this exact car to give a reliable range." }] })];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url, q) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: q || {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find"), tasksHtml = await mod("tasksPage", "/tasks/mine?app=1", { app: "1" });
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function page(html, url, api) { const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120))); p._errs = errs;
  await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 }))); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} if (body.action === "panel") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ market: FIX[0].market, engineAnswer: { cards: [{ price: 61000, date: "2025-07-02", mi: 29000, title: "1995 Porsche 911 Carrera" }] } }) }); return api(r, body); }
    if (u.host === "goasksam.com" && u.pathname === "/api/tasks") return api(r, {}); if (u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname)) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" }); if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com" + url, { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 1500)); return p; }
try {
  const fp = await page(findHtml, "/find?q=porsche+911&make=Porsche&model=911", (r, body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body.action === "chat" || body.action === "rerun" ? { reply: "", suggest: [], state: { filters: { make: "Porsche", model: "911" } }, turns: 1, meta: { count: 3, live: 3, asks: [] }, cards: FIX, searchNote: "" } : body.action === "list" ? { items: [] } : {}) }));
  const TASK = { id: "11111111-1111-1111-1111-111111111111", state: "running", kind: "hunt", summary: "Sam is looking for Porsche 911s", filters: {}, updates: [{ id: "u2", role: "sam", kind: "match", created_at: ago(2), text: "MODEL PARAGRAPH that must not show", data: { total: 3, cards: FIX.map(c => ({ id: c.id, title: c.title, url: c.url })), full: FIX, line: "3 new cars match." } }] };
  const tp = await page(tasksHtml, "/tasks/mine?app=1", r => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: [TASK], suggestions: [], notify: { on: false } }) }));
  const grab = p => p.evaluate(() => [...document.querySelectorAll("article.car")].map(a => a.outerHTML.replace(/ loading="lazy"/g, "").replace(/ hidden=""/g, "").replace(/ style="min-height: [0-9.]+px;"/g, "").replace(/\s+/g, " ")));
  const a = await grab(fp), c = await grab(tp);
  ok(a.length === 3 && c.length === 3, `three cards on each page (Find ${a.length}, Tasks ${c.length})`);
  ok(a.length && a.every((h, i) => h === c[i]), "each card is byte-identical on Find and on Tasks (the row aligner's heights, which follow each page's own column width, aside)" + (a.every((h, i) => h === c[i]) ? "" : ": first difference at " + (() => { const i = a.findIndex((h, k) => h !== c[k]); const x = a[i] || "", y = c[i] || ""; let n = 0; while (n < x.length && x[n] === y[n]) n++; return `card ${i} char ${n}: Find "${x.slice(Math.max(0, n - 40), n + 60)}" / Tasks "${y.slice(Math.max(0, n - 40), n + 60)}"`; })()));
  const t = await tp.evaluate(() => ({ model: /MODEL PARAGRAPH/.test(document.body.innerText), line: (document.querySelector(".ut.line") || {}).innerText, links: [...document.querySelectorAll("article.car:first-of-type a")].map(a => a.className + "|" + (a.getAttribute("href") || "").slice(0, 30)), range: /The typical range for cars like this\./.test(document.body.innerText), lastbid: /LAST BID SEEN/.test(document.body.innerText) }));
  ok(!t.model && t.line === "3 new cars match.", "the model-written paragraph is gone and the engine's one-line count stands (" + t.line + ")");
  ok(t.range && t.lastbid, "the SAM range panel and the LAST BID SEEN strip are on the Tasks card");
  ok(t.links.filter(l => /^ph\|https:\/\/auction/.test(l)).length === 1 && t.links.filter(l => /vauc/.test(l)).length === 1, "only the photo and View auction link to the auction on a Tasks card: " + t.links.join(" ; "));
  await tp.click("article.car [data-mc]"); await new Promise(r => setTimeout(r, 900));
  ok(await tp.evaluate(() => !!document.querySelector(".mcdrawer") && /Open full Market Check/.test(document.querySelector(".mcdrawer").innerText)), "Market Check opens its drawer on a Tasks card");
  await tp.click(".hchip"); await new Promise(r => setTimeout(r, 500));
  ok(await tp.evaluate(() => !!document.querySelector(".hpop") && /sold before/i.test(document.querySelector(".hpop").innerText)), "Sold before opens the history popup on a Tasks card");
  ok(tp._errs.length === 0 && fp._errs.length === 0, "no page errors on either page " + JSON.stringify(tp._errs.concat(fp._errs)));
} finally { await b.close(); }
console.log(`findCardKitCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
