// FIND SHOW MORE READS UNDER ITS OWN CLOCK (Lane E, Nov 2 2026; Sam's live click on "Show 24 more" that took very long with no sign of work, so he pressed it about five times). The class: ANY Show more batch, whatever its cards' reads are doing.
// The engine (api/buySearch.js moreBatch) returns within the engine's batch time (lib/live/samChat.js BATCH_BUDGET_MS): a card whose read is back comes whole, a card whose read is not comes at once with the engine's being-read line and no range
// (never blank, never held for the slowest card); the page says Reading... from the first press, ignores a second press, sends one request at a time, never repeats a card, fills the being-read cards as the engine reads them, and when an ask fails
// says so and gives the button back. At 1440 and 390. No network.   node scripts/findMoreReadingCheck.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const sm = await imp("lib/live/samChat.js"), bs = await imp("api/buySearch.js"), se = await imp("lib/live/search.js");
const BATCH = sm.SHOW_BATCH || 24, BUDGET = sm.BATCH_BUDGET_MS;
ok(typeof bs.moreBatch === "function" && Number(BUDGET) > 0, "the engine exports moreBatch and BATCH_BUDGET_MS (the batch's own clock)");
const pendingOf = x => ({ id: x.id, market: se.stillReadingMarket(), name: null });
const range = { kind: "range", low: 55000, high: 78000, count: 20, query: "q" };
// ---- the engine: cold cards never hold the batch
{
  const items = Array.from({ length: BATCH }, (_, i) => ({ id: i + 1, cold: i % 3 !== 0 }));
  const t0 = Date.now(); let out = [];
  if (bs.moreBatch) out = await bs.moreBatch(items, { enrichOne: x => x.cold ? new Promise(() => {}) : Promise.resolve({ id: x.id, market: range }), pendingOf, budgetMs: BUDGET });
  const took = Date.now() - t0;
  ok(took <= BUDGET + 700, `a batch with cold cards returns within the engine's batch time (${took} ms against ${BUDGET})`);
  ok(out.length === BATCH && out.map(c => c.id).join() === items.map(x => x.id).join(), "every car is in the batch, in the engine's order");
  ok(out.every(c => (c.market && c.market.kind === "range" && c.market.low > 0 && c.market.high > 0) || (c.market && c.market.kind === "pending" && typeof c.market.line === "string" && c.market.line.length > 3)), "every card has either a range or the engine's being-read line");
  ok(out.filter((c, i) => items[i].cold).every(c => c.market.kind === "pending" && !c.market.low) && out.filter((c, i) => !items[i].cold).every(c => c.market.kind === "range"), "the cold cards are being read and the stored ones carry their range");
  ok(new Set(out.map(c => c.id)).size === out.length, "no card twice in a batch");
  const t1 = Date.now(), slow = bs.moreBatch ? await bs.moreBatch([{ id: 1 }, { id: 2 }], { enrichOne: x => x.id === 1 ? new Promise(r => setTimeout(() => r({ id: 1, market: range }), 60000)) : Promise.reject(new Error("boom")), pendingOf, budgetMs: 400 }) : [];
  ok(Date.now() - t1 < 1500 && slow.every(c => c.market && c.market.kind === "pending"), "a card that takes a minute, and one that fails, are both drawn being read at once (never an error, never held)");
}
{
  const rd = x => fs.readFileSync(new URL("../" + x, import.meta.url), "utf8"), bsrc = rd("api/buySearch.js"), ssrc = rd("lib/live/samChat.js");
  ok(/b\.action === "more"[\s\S]{0,1400}batchOnly: true[\s\S]{0,900}moreBatch\(/.test(bsrc), "the more action reads the cars alone (no questions, widenings or era counts) and gives them to moreBatch");
  ok(/if \(!ctx\.batchOnly\) \{[\s\S]{0,400}ONE STORED-ROW READ FOR THE SHOWN CARDS/.test(ssrc), "the search leaves the cards' markets to the batch's own clock when it is a batch");
}
// ---- the page
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString();
const mk = (id, market) => ({ id, title: "Porsche 911 lot " + id, make: "Porsche", url: "https://auction.test/" + id, source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: "https://img.test/" + id + ".jpg", end_time: soon(5 + id / 100), current_bid_usd: 40000 + id * 10, bid_at: new Date(now - 1440e3).toISOString(), miles: 30000 + id, location: "King of Prussia, PA", country: "US", chips: ["Manual"], market, sam_lines: [], timeline: [], seen_before: { n: 0 }, year: 1995 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const FILTERS = { make: "Porsche", model: "911" }, TOTAL = 60;
async function run(width, mode) {
  const cold = id => id > BATCH && id % 2 === 0, mkr = id => mk(id, cold(id) ? se.stillReadingMarket() : { ...range });
  const meta = off => ({ live: TOTAL, asks: [], ...sm.pageMeta(TOTAL, off, Math.min(BATCH, TOTAL - off)) });
  const asks = [], enriches = []; let failNext = mode === "fail";
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 }))); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: findHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {}
      const J = o => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (body.action === "more") { asks.push(body); if (failNext) { failNext = false; return r.respond({ status: 504, contentType: "text/plain", body: "timeout" }); }
        const off = Number(body.offset) || 0, cards = Array.from({ length: Math.min(BATCH, TOTAL - off) }, (_, i) => mkr(off + i + 1)); return setTimeout(() => J({ cards, meta: meta(off) }), 1500); }
      if (body.action === "chat" || body.action === "rerun") return J({ reply: "", suggest: [], state: { filters: FILTERS }, turns: 1, cards: Array.from({ length: BATCH }, (_, i) => mkr(i + 1)), meta: meta(0) });
      if (body.action === "enrich") { enriches.push(body.ids); return setTimeout(() => J({ cards: (body.ids || []).map(id => ({ ...mk(id, { ...range }), id })) }), 2500);  }
      return J(body.action === "list" ? { items: [] } : {}); }
    if ((u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname))) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/find?make=Porsche&model=911", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 1000));
  for (let i = 0; i < 12; i++) { const had = await p.evaluate(() => { const a = document.querySelector("[data-more]"); if (a) { a.click(); return true; } return false; }); if (!had) break; }
  const read = () => p.evaluate(() => { const a = document.querySelector("[data-page]"); return { text: a ? a.textContent : null, disabled: a ? a.getAttribute("aria-disabled") : null, ids: [...document.querySelectorAll("article.car")].map(x => Number(x.getAttribute("data-id"))), reading: document.querySelectorAll("article.car .reading").length, note: (document.querySelector(".morenote") || {}).textContent || null, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
  const out = { before: await read(), errs, asks, enriches };
  const click = () => p.evaluate(() => { const a = document.querySelector("[data-page]"); if (a) a.click(); return !!a; });
  await click(); await new Promise(r => setTimeout(r, 200)); out.during = await read();
  if (mode !== "fail") { await click(); await click(); await click(); } await new Promise(r => setTimeout(r, 300)); out.afterRepeat = await read(); out.asksAfterRepeat = asks.length;
  await new Promise(r => setTimeout(r, 1700)); out.after = await read();
  await new Promise(r => setTimeout(r, 4200)); out.filled = await read();
  if (mode === "fail") { await click(); await new Promise(r => setTimeout(r, 2200)); out.retried = await read(); }
  await p.close(); return out;
}
try {
  for (const width of [1440, 390]) {
    const r = await run(width, "ok"), tag = `${width}`;
    ok(r.before.text === "Show 24 more", `${tag}: the button reads Show 24 more before the press (${r.before.text})`);
    ok(r.during.text === "Reading…" && r.during.disabled === "true", `${tag}: from the first press the button says Reading... and is disabled (${r.during.text}, ${r.during.disabled})`);
    ok(r.afterRepeat.text === "Reading…", `${tag}: still Reading... after more presses`);
    ok(r.asksAfterRepeat === 1 && r.asks.length === 1, `${tag}: three more presses while reading send no request (${r.asksAfterRepeat} ask)`);
    ok(r.after.ids.length === BATCH * 2 && new Set(r.after.ids).size === r.after.ids.length && r.after.ids.every((id, i) => id === i + 1), `${tag}: the batch is drawn once, in order, no card twice (${r.after.ids.length} cars)`);
    ok(r.after.text === "Show 12 more" && r.after.disabled === null, `${tag}: the button is back with the engine's next batch (${r.after.text})`);
    ok(r.after.reading > 0, `${tag}: the cards the engine is still reading are drawn at once with its being-read line (${r.after.reading})`);
    ok(r.filled.reading === 0 && r.enriches.flat().length > 0, `${tag}: the being-read cards fill in as the engine reads them, card by card (${r.filled.reading} left, ${r.enriches.flat().length} asked)`);
    ok(!r.filled.sideways && r.errs.length === 0, `${tag}: no sideways scroll, no page error (${r.errs[0] || ""})`);
    const f = await run(width, "fail");
    ok(f.after.text === "Show 24 more" && f.after.disabled === null && /Could not load more/.test(f.after.note || ""), `${tag}: a failed ask gives the button back and says so (${f.after.text}, ${f.after.note})`);
    ok(f.retried.ids.length === BATCH * 2 && f.retried.note === null, `${tag}: the next press works (${f.retried.ids.length} cars, the note gone)`);
  }
} catch (e) { ok(false, "threw " + e.message); }
{
  const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8"), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
  ok(/Reading\\u2026/.test(client) && /aria-disabled/.test(client), "the page's Show more has a Reading state");
}
await b.close();
console.log(`findMoreReadingCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
