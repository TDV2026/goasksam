// THE NO-RANGE CARD KEEPS ITS EVIDENCE, AND SAYS WHY (Lane E, Nov 5 2026; engine fields from lane-b-thincard nr1 and pwb4). THE CLASS: any card or page that shows a sales count and no range must
//   (1) print the engine's noRangeLine / findAnswer.noRange.line exactly as given (behind lib/noRangeFlag.js while the wording is WAITING ON SAM), computing nothing on the page;
//   (2) carry a working "See the sales" button next to that line, and the button opens EVERY sale the engine counted for that card (the close matches and the rest), in the engine's order, each with its price and date;
//   (3) on a pre-war car whose bodies price apart (pooledApart.test prewar_any_size): one block per body (its optionLine, its own sales behind its own See the sales), the "Body not stated" line with its sales, and NO pooled headline.
// Surfaces: the Find card (both Sam-box paths), its popup, the shared result card (lib/sellsForCard.js: Sell, Market Check, Tasks), Market Check's thin and refusal pages, the Desk sheet. Real code in a real browser, no network.
//   node scripts/noRangeCardsCheck.mjs      (needs Chrome)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const kit = await import(pathToFileURL(path.join(ROOT, "lib/findCardKit.js")).href);
const kitJs = kit.findCardKitJs();
const LINE = "9 sales since May 2025. 3 are close matches, too few for a range.";
const sale = (id, price, date, title) => ({ id, price, date, mi: 20000 + id * 100, title: title || "1990 Porsche 911 Carrera", image: null, venue: "Bring a Trailer", url: "https://x.test/" + id });
// nine sales the engine counted, newest first; three are close matches, six are not (older, other trim): the popup must list all nine
const NINE = [11, 10, 9, 8, 7, 6, 5, 4, 3].map((id, i) => sale(id, 40000 + id * 500, `2026-0${9 - Math.floor(i / 2)}-1${i % 9}`, i < 3 ? "1990 Porsche 911 Carrera" : "1986 Porsche 911 Carrera 3.2"));
const base = (extra, fa) => ({ id: 7, title: "1990 Porsche 911 Carrera 2", make: "Porsche", url: "https://auction.test/7", source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: null, miles: 30000, country: "US", chips: [], year: 1990,
  market: { kind: "count", count: 9, query: "1990 Porsche 911", countLine: "9 sales since May 2025.", findAnswer: { state: "few", range: null, n: 9, lines: ["9 sales, too few for a range."], pointer: null, noRange: { total: 9, close: 3, floor: 8, code: "few_comparable", line: LINE }, ...(fa || {}) } }, ...(extra || {}) });
const PANEL = { market: { kind: "count", count: 9, query: "1990 Porsche 911" }, engineAnswer: { tier: "thin", cards: NINE, noRangeTotal: 9, noRangeLine: LINE, thinLine: "Too few of these sales match closely enough to show a range.", cluster: null } };
// PRE-WAR: a 1936 car, six sales over three bodies and one that names no body; the pooled thin line must not show
const PW = [21, 22, 23, 24, 25, 26, 27].map((id, i) => sale(id, 120000 + i * 1000, `2026-0${7 - Math.floor(i / 2)}-0${i + 1}`, "1936 Delahaye 135 " + ["Cabriolet", "Cabriolet", "Coupe", "Coupe", "Coupe", "Roadster", ""][i]));
const PWPANEL = { market: { kind: "count", count: 7, query: "1936 Delahaye 135" }, engineAnswer: { tier: "thin", cards: PW, cluster: null, noRangeTotal: 7, noRangeLine: "7 sales since May 2025, sold as different cars, so no one range.", thinLine: "POOLED HEADLINE 7 sales", optionsState: "apart", headlineDimension: "body",
  options: [{ label: "Cabriolet", n: 2, low: null, high: null, saleIds: [21, 22] }, { label: "Coupe", n: 3, low: 118000, high: 124000, saleIds: [23, 24, 25] }, { label: "Roadster", n: 1, low: null, high: null, saleIds: [26] }],
  optionLines: ["Cabriolet, 2 sales, too few for a range", "Coupe, 3 sales, $118,000 to $124,000", "Roadster, 1 sale, too few for a range"], headlineLines: ["Cabriolet, 2 sales, too few for a range", "Coupe, 3 sales, $118,000 to $124,000", "Roadster, 1 sale, too few for a range"],
  bodyNotStated: { n: 1, line: "Body not stated, 1 sale", saleIds: [27] }, pooledApart: { test: "prewar_any_size", state: "apart", options: [] } } };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function run(flag, cardL, panel) {
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  await p.setRequestInterception(true); p.on("request", r => { if (/\/api\/buySearch/.test(r.url())) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(panel) }); r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><div class='cgrid n1' id='g'></div></body></html>" }); });
  await p.goto("https://goasksam.com/x", { waitUntil: "domcontentloaded" });
  await p.evaluate((flag, L) => { window.GAS_REL = { mc: true }; window.GAS_NORANGE = flag; window.__L = L; }, flag, cardL);
  await p.addScriptTag({ content: kitJs });
  const card = await p.evaluate(() => { document.getElementById("g").innerHTML = window.GASCARD.card(window.__L); window.GASCARD.bind(); const a = document.querySelector("article.car"); return { html: a.outerHTML, text: a.innerText, btn: !!a.querySelector("[data-mc]") }; });
  let drawer = null;
  if (card.btn) { await p.click("[data-mc]"); await new Promise(r => setTimeout(r, 700)); drawer = await p.evaluate(() => { const d = document.querySelector(".mcdrawer"); return d ? { text: d.innerText, rows: [...d.querySelectorAll(".md-row")].map(r => ({ hidden: r.hidden || !!r.closest("[hidden]"), t: r.innerText.replace(/\s+/g, " ") })), bodies: [...d.querySelectorAll(".md-body")].map(x => ({ line: x.querySelector(".md-s").innerText, btn: !!x.querySelector("[data-mdbody]") })), more: !!d.querySelector("[data-mdmore]") } : null; }); }
  return { p, card, drawer, errs };
}
try {
  // ---- the Find card, findAnswer path (no card slots), flag on and off
  for (const flag of [true, false]) {
    const r = await run(flag, base(), PANEL);
    ok(r.card.btn, `no range, flag ${flag}: the card shows See the sales (never hidden because there is no range)`);
    ok(flag ? r.card.text.includes(LINE) : !r.card.text.includes(LINE), `no range, flag ${flag}: the engine's noRange line ${flag ? "is printed exactly as given" : "is not printed while the wording waits on Sam"}`);
    ok(r.drawer && r.drawer.rows.length === 9 && r.drawer.rows.every(x => !x.hidden), `no range, flag ${flag}: the popup lists all nine sales the engine counted, none behind Show more (${r.drawer ? r.drawer.rows.length : "no popup"})`);
    ok(r.drawer && !r.drawer.more, `no range, flag ${flag}: no Show more on a no-range list`);
    const prices = r.drawer ? r.drawer.rows.map(x => (/\$([\d,]+)/.exec(x.t) || [])[1]) : [];
    ok(prices.length === 9 && prices.every(Boolean) && NINE.every((c, i) => prices[i] === c.price.toLocaleString("en-US")), `no range, flag ${flag}: engine order kept (newest first as sent), every row with its price`);
    ok(r.drawer && r.drawer.rows.every(x => /20\d\d/.test(x.t) || /(January|February|March|April|May|June|July|August|September|October|November|December)/.test(x.t)), `no range, flag ${flag}: every row carries its date`);
    ok(r.drawer && (flag ? r.drawer.text.includes(LINE) : true), `no range, flag ${flag}: the popup opens with the engine's line when the wording is on`);
    ok(r.errs.length === 0, "no page errors " + JSON.stringify(r.errs)); await r.p.close();
  }
  // ---- the card-slots path (the engine's three slots): the line still shows, the bid line stays
  { const r = await run(true, base({ cardLabel: "9 sales since May 2025", cardHeadline: "Too few for a range", cardLine: "No bids yet." }), PANEL);
    ok(r.card.text.includes(LINE) && /No bids yet\./.test(r.card.text) && r.card.btn, "card slots: the noRange line, the existing bid line and See the sales are all there"); await r.p.close(); }
  // ---- a card WITH a range is untouched
  { const r = await run(true, base({ market: { kind: "range", low: 50000, high: 70000, count: 24, query: "1990 Porsche 911", countLine: "24 sales.", findAnswer: { state: "range", range: { low: 50000, high: 70000 }, lines: ["24 sales since May 2025."], noRange: null } } }), PANEL);
    ok(!r.card.text.includes(LINE) && /50,000/.test(r.card.text), "a card with a range prints the range and no no-range line " + JSON.stringify(r.card.text.slice(0, 200))); await r.p.close(); }
  // ---- pre-war bodies apart
  { const r = await run(false, base({ title: "1936 Delahaye 135", year: 1936, market: { kind: "count", count: 7, query: "1936 Delahaye 135", countLine: "7 sales", findAnswer: { state: "few", range: null, n: 7, lines: ["7 sales"], noRange: { total: 7, close: 7, floor: 8, code: "options_apart", line: "x" } } } }), PWPANEL);
    ok(r.drawer && !/POOLED HEADLINE/.test(r.drawer.text), "pre-war: no pooled headline in the popup");
    ok(r.drawer && r.drawer.bodies.length === 4 && r.drawer.bodies.every(x => x.btn), `pre-war: one block per body plus Body not stated, each with its own See the sales (${r.drawer ? r.drawer.bodies.length : 0})`);
    ok(r.drawer && JSON.stringify(r.drawer.bodies.map(x => x.line)) === JSON.stringify([...PWPANEL.engineAnswer.optionLines, PWPANEL.engineAnswer.bodyNotStated.line]), "pre-war: the engine's optionLines and bodyNotStated line, as given and in its order");
    await r.p.evaluate(() => document.querySelectorAll("[data-mdbody]").forEach(x => x.click())); await new Promise(x => setTimeout(x, 200));
    const per = await r.p.evaluate(() => [...document.querySelectorAll(".md-body")].map(x => x.querySelectorAll(".md-row").length));
    ok(JSON.stringify(per) === JSON.stringify([2, 3, 1, 1]), "pre-war: each body's See the sales opens exactly its own sales, together the whole pool (" + per + ")"); await r.p.close(); }
  // ---- the shared result card (Sell, Market Check, Tasks): line + button + the whole list
  { const { sellsForCardHtml } = await import(pathToFileURL(path.join(ROOT, "lib/sellsForCard.js")).href).then(m => ({ sellsForCardHtml: m.sellsForCardHtml || (globalThis.window && globalThis.window.sellsForCardHtml) }));
    ok(typeof sellsForCardHtml === "function", "the shared card exports sellsForCardHtml");
    if (typeof sellsForCardHtml === "function") {
      const d = { tier: "thin", cluster: null, thinLine: "Too few.", noRangeTotal: 9, noRangeLine: LINE, cards: NINE, windowLine: "9 sales since May 2025." };
      globalThis.window = { GAS_NORANGE: true }; const on = sellsForCardHtml(d, {}); globalThis.window = { GAS_NORANGE: false }; const off = sellsForCardHtml(d, {}); delete globalThis.window;
      ok(on.includes(LINE) && !off.includes(LINE) && off.includes("Too few."), "result card: the noRange line only behind the flag, the thin line otherwise");
      ok(/data-sfc-see/.test(on) && /data-sfc-see/.test(off) && (on.match(/class="sfc-row"/g) || []).length === 9, "result card: See the sales beside the line, flag or not, and all nine sales listed");
      const hosted = sellsForCardHtml(d, { rows: false, salesHref: "#ob-sales" });
      ok(/href="#ob-sales"/.test(hosted) && !/sfc-rows/.test(hosted), "result card with its list elsewhere (Market Check): the button goes to that list");
      ok(!/data-sfc-see/.test(sellsForCardHtml({ tier: "result", cluster: [50000, 70000], cards: NINE }, {})), "a result card with a range gets no no-range button"); } }
} finally { await b.close(); }
// ---- THE CLASS, in the source: every host that draws the shared card without its own rows must point the button at its list; the Desk and the Market Check pages carry the wiring
{ const onebox = fs.readFileSync("public/js/onebox.js", "utf8"), calls = onebox.match(/sellsForCardHtml\(d, \{[^}]*rows: false[^}]*\}/g) || [];
  ok(calls.length >= 3 && calls.every(c => /salesHref/.test(c) || /1303/.test(c)) || calls.filter(c => !/salesHref/.test(c)).length <= 1, `Market Check: the thin, refusal and thin-hero cards pass salesHref (${calls.filter(c => /salesHref/.test(c)).length} of ${calls.length}; the clustered hero keeps its own list)`);
  ok(/id="ob-sales"/.test(onebox), "Market Check: the list the button goes to exists");
  const desk = fs.readFileSync("public/js/deskvals.js", "utf8"); ok(/m\.noRangeLine/.test(desk) && /GAS_NORANGE/.test(desk), "Desk sheet: prints the read's noRangeLine behind the flag; its comparables list every sale");
  const near = fs.readFileSync("api/buy.js", "utf8"); ok(/nr\.line === 'string'/.test(near) || /nr\.line === \\"string\\"/.test(near), "Find: meta.near.line is the opener when the engine sends it");
}
// ---- A RETRY ANSWER IS NOT A FAILURE (Lane E, Nov 5 2026): readSheet() answers { retry: true, retryAfterMs, line } while the engine is still reading. The sheet shows the engine's line, never "cannot be read" or "not available", never stores the retry as the sheet's read, never replaces a read it already has, and asks again after retryAfterMs.
{ const { startDesk, seed, wait } = await import("./deskValsRender.mjs"), { useSheetEngine } = await import(pathToFileURL(path.join(ROOT, "lib/desk/sheetRead.js")).href), { handleSheetAction } = await import(pathToFileURL(path.join(ROOT, "lib/desk/sheetActions.js")).href);
  const RLINE = "Sam is still reading this car. It fills in here when the read lands.";
  const D = await startDesk({ calls: [] }); const sh = await seed(D.store, { vin: "WP0AB29918S745123" }); await D.store.put("sam", { ...sh, read: null, car_label: "A car" }); const good = await seed(D.store, { vin: "WP0AB29918S745123" });
  let asked = 0, mode = "retry"; useSheetEngine(async () => { asked++; return mode === "retry" ? { retry: true, retryAfterMs: 1200, line: RLINE } : null; });
  const p = await D.open(1440); await p.click(`[data-open="${sh.id}"]`); await wait(700);
  const t1 = await p.evaluate(() => (document.querySelector(".sheet") || {}).innerText || "");
  ok(t1.includes(RLINE) && !/not available|cannot be read|could not be read/i.test(t1), "retry: the sheet shows the engine's line and no failure wording");
  const stored = (await D.store.list("sam")).find(x => x.id === sh.id);
  ok(stored && !stored.read, "retry: the retry answer is not stored as the sheet's read");
  const before = asked; await wait(1900);
  ok(asked > before, "retry: the page asks again after the engine's own wait (" + before + " then " + asked + ")");
  // a sheet that already has a read keeps it when a re-read answers retry
  const had = JSON.stringify((await D.store.list("sam")).find(x => x.id === good.id).read);
  const r2 = await handleSheetAction("sheet_save", { id: good.id, patch: { mileage: "41000" } }, D.ctxOf("crew"));
  const after = JSON.stringify((await D.store.list("sam")).find(x => x.id === good.id).read);
  ok(r2 && r2.ok && r2.retry && r2.retry.line === RLINE && had === after, "retry: a re-read that answers retry leaves the read the sheet already has, and tells the page to ask again");
  const r3 = await handleSheetAction("sheet_new", { text: "WP0AB29918S745123" }, D.ctxOf("crew"));
  ok(r3 && r3.ok && r3.retry && r3.retry.line === RLINE, "retry: a new sheet typed while the engine is reading is made, with the line, not refused");
  mode = "none"; useSheetEngine(null); await p.close(); await D.close();
  const src = fs.readFileSync("lib/desk/intake/engineRead.js", "utf8"); ok(/sr\.retry === true/.test(src) && /engine_status: "reading"/.test(src), "intake: a retry from the sheet read marks the sheet reading, not done and not failed"); }
console.log(`noRangeCardsCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
