// FIND SHOW MORE (Lane E, Nov 2 2026): a dealer group buyer searched "all live sales this week"; Find said 1,669 live matches and drew 24 cards with no way to the rest. The engine answers
// one batch (SHOW_BATCH cars) with the counts in meta (shown, remaining, nextN, countLine, lib/live/samChat.js pageMeta); the page draws them, and past the batch keeps ONE "Show N more" at the
// foot that asks the same search for the next batch (buySearch action "more"), in the engine's order, until the engine says nothing remains, when the button goes. The class: ANY search with more
// matches than one batch, at 1440 and 390, whatever the count (one over a batch, several batches, thousands): the button appears, the shown and remaining counts are the engine's own, the filters
// (sort and chips) go back with every ask, the cars arrive in the engine's order, a car still being read says so in the engine's words, and the last batch removes the button.
// No network (the engine is a stub that makes its numbers with the engine's own pageMeta).   node scripts/findShowMoreCheck.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const eng = await import(pathToFileURL(path.join(ROOT, "lib/live/samChat.js")).href);
const SHOW_BATCH = eng.SHOW_BATCH || 24;
ok(typeof eng.pageMeta === "function" && Number.isFinite(eng.SHOW_BATCH), "the engine exports SHOW_BATCH and pageMeta (the one place the shown and remaining counts are made)");
const pageMeta = eng.pageMeta || ((live, offset, len) => ({ shown: Math.min(live, offset + len), remaining: Math.max(0, live - offset - len), nextN: 0, offset, countLine: null }));
// pageMeta itself: every boundary
for (const [live, off, len, shown, rem] of [[0, 0, 0, 0, 0], [1, 0, 1, 1, 0], [SHOW_BATCH, 0, SHOW_BATCH, SHOW_BATCH, 0], [SHOW_BATCH + 1, 0, SHOW_BATCH, SHOW_BATCH, 1], [SHOW_BATCH + 1, SHOW_BATCH, 1, SHOW_BATCH + 1, 0], [1669, 0, SHOW_BATCH, SHOW_BATCH, 1669 - SHOW_BATCH], [1669, 1656, 13, 1669, 0]]) {
  const m = pageMeta(live, off, len);
  ok(m.shown === shown && m.remaining === rem && m.nextN === Math.min(SHOW_BATCH, rem) && (rem > 0 ? m.countLine === `${live.toLocaleString("en-US")} live matches, ${shown.toLocaleString("en-US")} shown, ${rem.toLocaleString("en-US")} more.` : m.countLine === null), `pageMeta(${live}, ${off}, ${len}): shown ${shown}, remaining ${rem}, got ${JSON.stringify(m)}`);
}
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString(), ago = h => new Date(now - h * 3600e3).toISOString();
const PENDING = "Sam is still reading the sales for this one.";
const mk = (id, extra) => Object.assign({ id, title: "Porsche 911 lot " + id, make: "Porsche", url: "https://auction.test/" + id, source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: "https://img.test/" + id + ".jpg", end_time: soon(5.5 + id / 100), current_bid_usd: 40000 + id * 10, bid_at: ago(0.4), miles: 30000 + id, location: "King of Prussia, PA", country: "US", chips: ["Manual"], market: { kind: "range", low: 55000, high: 78000, count: 24, query: "1995 Porsche 911", basisLine: "Based on 24 sales, the latest in October 2026." }, sam_lines: [{ kind: "range", rung: [], placing: "below the range", text: "The middle half of 911 sales landed at $55,000 to $78,000 since December 2025. The bid is below the range." }], timeline: [], seen_before: { n: 0 }, year: 1995 }, extra || {});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const FILTERS = { make: "Porsche", model: "911", colour: "red", sort: "lowest_bid" };
const SCEN = [
  { name: "10 matches (under one batch)", n: 10 },
  { name: `${SHOW_BATCH} matches (exactly one batch)`, n: SHOW_BATCH },
  { name: `${SHOW_BATCH + 1} matches (one over)`, n: SHOW_BATCH + 1 },
  { name: "60 matches (three batches)", n: 60 },
  { name: "60 matches, the second batch still being read", n: 60, pendingFrom: SHOW_BATCH },
  { name: "1,669 matches (the dealer's search)", n: 1669, clicks: 2 }
];
async function run(width, sc) {
  const all = Array.from({ length: sc.n }, (_, i) => mk(i + 1, sc.pendingFrom != null && i >= sc.pendingFrom ? { market: { kind: "pending", line: PENDING, retryAfterMs: 3600000, waitMaxMs: 3600000 } } : {}));
  const asks = [];
  const batch = off => { const cards = all.slice(off, off + SHOW_BATCH); return { cards, meta: { live: sc.n, asks: [], sort: "lowest_bid", ...pageMeta(sc.n, off, cards.length) } }; };
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 }))); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: findHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {}
      const J = o => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (body.action === "more") { asks.push(body); return J(batch(Number(body.offset) || 0)); }
      if (body.action === "chat" || body.action === "rerun") { const f = batch(0); return J({ reply: "", suggest: [], state: { filters: FILTERS }, turns: 1, cards: f.cards, meta: f.meta }); }
      if (body.action === "enrich") return J({ cards: [] });
      return J(body.action === "list" ? { items: [] } : {}); }
    if ((u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname))) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/find?q=" + encodeURIComponent("all live sales this week") + "&make=Porsche&model=911", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 1200));
  const read = () => p.evaluate(() => ({ visible: [...document.querySelectorAll("article.car")].filter(a => !a.hidden).length, ids: [...document.querySelectorAll("article.car")].map(a => Number(a.getAttribute("data-id"))), count: (document.querySelector("[data-count]") || {}).textContent || null, everything: !!document.querySelector("[data-everything]:not([hidden])"), page: (document.querySelector("[data-page]") || {}).textContent || null, more: !!document.querySelector("[data-more]"), morerow: !!document.querySelector(".morerow"), reading: [...document.querySelectorAll("article.car .reading")].map(e => e.textContent.trim()), sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }));
  const settle = async (want) => { for (let i = 0; i < 40; i++) { const s = await read(); if (want(s)) return s; await new Promise(r => setTimeout(r, 150)); } return await read(); };
  const first = await read();
  // the local reveal, six at a time, until nothing is hidden
  for (let i = 0; i < 12; i++) { const had = await p.evaluate(() => { const a = document.querySelector("[data-more]"); if (a) { a.click(); return true; } return false; }); if (!had) break; }
  const afterReveal = await settle(s => !s.more);
  const out = { first, afterReveal, steps: [], asks, errs };
  const clicks = sc.clicks != null ? sc.clicks : 99;
  for (let i = 0; i < clicks; i++) {
    const had = await p.evaluate(() => { const a = document.querySelector("[data-page]"); if (a) { a.click(); return true; } return false; });
    if (!had) break;
    const want = Math.min(sc.n, SHOW_BATCH * (i + 2));
    out.steps.push(await settle(s => s.ids.length >= want));
  }
  out.end = await read(); await p.close(); return out;
}
try {
  for (const width of [1440, 390]) for (const sc of SCEN) {
    const r = await run(width, sc), tag = `${width} ${sc.name}`, n = sc.n, B = SHOW_BATCH, more = n > B;
    ok(r.first.visible === Math.min(6, n), `${tag}: ${Math.min(6, n)} cars show at first (${r.first.visible})`);
    ok(r.afterReveal.visible === Math.min(B, n), `${tag}: the first batch (${Math.min(B, n)} cars) is drawn once the six-at-a-time reveal runs out (${r.afterReveal.visible})`);
    if (!more) {
      ok(r.afterReveal.page === null && !r.afterReveal.morerow, `${tag}: no Show more button when everything is drawn`);
      ok(r.afterReveal.count === `${n} live matches` && r.afterReveal.everything, `${tag}: the count line is "${n} live matches" with the everything line (${r.afterReveal.count})`);
      ok(r.asks.length === 0, `${tag}: no ask for more`);
      continue;
    }
    const m0 = pageMeta(n, 0, B);
    ok(r.afterReveal.page === `Show ${m0.nextN.toLocaleString("en-US")} more`, `${tag}: Show more appears at the foot, saying the engine's next batch: "${r.afterReveal.page}"`);
    ok(r.afterReveal.count === m0.countLine, `${tag}: the count line is the engine's own, "${m0.countLine}" (${r.afterReveal.count})`);
    ok(!r.afterReveal.everything, `${tag}: the page does not say "everything" while cars remain`);
    let drawn = B, off = B;
    r.steps.forEach((s, i) => {
      const ask = r.asks[i], len = Math.min(B, n - off), exp = pageMeta(n, off, len), last = exp.remaining === 0;
      ok(ask && ask.action === "more" && ask.offset === off, `${tag} click ${i + 1}: asks the engine for the cars after the ${off} drawn (${ask && ask.offset})`);
      ok(ask && JSON.stringify(ask.filters) === JSON.stringify(FILTERS), `${tag} click ${i + 1}: the search's own filters, sort and chips included, go back (${ask && JSON.stringify(ask.filters)})`);
      drawn += len; off += len;
      ok(s.ids.length === drawn && new Set(s.ids).size === drawn, `${tag} click ${i + 1}: ${drawn} cars are drawn, none twice (${s.ids.length})`);
      ok(s.ids.every((id, k) => id === k + 1), `${tag} click ${i + 1}: the cars are in the engine's order`);
      ok(s.visible === drawn, `${tag} click ${i + 1}: every car of the new batch is visible (${s.visible})`);
      if (last) { ok(s.page === null && !s.morerow, `${tag} click ${i + 1}: the last batch removes the button`); ok(s.count === `${n} live matches` && s.everything, `${tag} click ${i + 1}: the count line goes back to "${n} live matches" with the everything line (${s.count})`); }
      else { ok(s.page === `Show ${exp.nextN.toLocaleString("en-US")} more`, `${tag} click ${i + 1}: the button names the engine's next batch ("${s.page}")`); ok(s.count === exp.countLine && !s.everything, `${tag} click ${i + 1}: the count line is the engine's "${exp.countLine}" (${s.count})`); }
    });
    if (sc.pendingFrom != null) { const last = r.steps[0] || r.end; ok(last.reading.length >= 1 && last.reading.every(x => x === PENDING), `${tag}: a car whose sales are not read yet shows the engine's own line (${JSON.stringify(last.reading.slice(0, 2))})`); }
    ok(!r.end.sideways, `${tag}: no sideways scroll`);
    ok(r.errs.length === 0, `${tag}: no page error (${r.errs[0] || ""})`);
  }
} catch (e) { ok(false, "threw " + e.message); }
{
  const rd = x => fs.readFileSync(new URL("../" + x, import.meta.url), "utf8");
  const bs = rd("api/buySearch.js"), sm = rd("lib/live/samChat.js");
  ok(/b\.action === "more"[\s\S]{0,900}runFilters\(env, b\.filters \|\| \{\}, [^\n]*\boffset \}\)/.test(bs), "the engine answers action more: the same search from the filters, from the offset");
  ok(/matches\.slice\(offset, offset \+ SHOW_BATCH\)/.test(sm), "the engine's batch is the matches from the offset on, in the engine's own order");
  ok(/Object\.assign\(ctx\.searchMeta, pageMeta\(/.test(sm), "the counts in meta come from pageMeta");
  const buy = rd("api/buy.js"), client = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
  ok(!/\bSHOW_BATCH\b|slice\(0, ?24\)/.test(client), "the page holds no batch size of its own");
  ok(/action: "more"/.test(client) && /m0\.countLine/.test(client), "the page asks for the next batch and prints the engine's countLine");
}
await b.close();
console.log(`findShowMoreCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
