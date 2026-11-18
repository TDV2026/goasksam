// partialCarJoinCheck (Lane D, Nov 17 2026, lane-d-car-bar-partial-2; order 2318): THE JOIN between the engine and the page for a PARTIAL car (a make, with whichever of year, years and typed mileage were given, no model).
// CAUSE this guards: the engine served the partial car inside modelChoice.partial, never as the car field the bar reads (car.token, car.line, car.short); the Find page renders the CHAT road (rerun, more, chat), which served no car at all;
// Market Check drew the engine's model choice AND the shared page's older "Which BMW?" question (the engine's own tier model_choice reply); and the shared page drew its fallback line under a reply that was a choice, not an answer.
// Every page check before this fed the page a HAND WRITTEN sample of an engine answer, so each side was green and the join was red. CLASS: a page check may not use a hand written sample of an engine answer. HERE nothing is written by hand:
// every API call the page makes goes to the REAL handler (api/buySearch.js, sellerDecision.js, sellChat.js, tasks.js) over a fake archive and a fake live board; the real page modules (api/buy.js, marketCheck.js, sell.js, tasksPage.js, public/js/onebox.js,
// lib/carBar.js, lib/modelChoicePage.js, lib/sell/sellMcClient.js) run in Chrome on that output; every word asserted on the page is read back from the engine's own reply, captured as the page received it.
// THE CASES, for "2009 BMW", "BMW", "1960s Porsche", "BMW 38,400 miles": the bar shows with the engine's words on Find, Market Check, Sell and Tasks; the four pills carry the engine's token; the model buttons show ONCE with no older block and no busy line;
// tapping a model runs the tool for the FULL car and the bar carries it; a visitor gets none of it.
//   node scripts/partialCarJoinCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn, spawnSync } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(await mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(here, "_typedThroughWorld.mjs")).href); W.setEnv(); process.env.NEW_DESIGN = "1";
process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.ANTHROPIC_API_KEY = "fixture-key";   // the model is a fixture (below): the chat road runs; the engine behind it is the real one
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; if (fails.length < 80) fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String((e && e.stack) || e).slice(0, 400)); } };
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const CT = await imp("lib/carToken.js"), { mintCrewCookieValue } = await imp("lib/_crew.js"), CREW = "gas_crew=" + mintCrewCookieValue();
const H = { find: (await imp("api/buy.js")).default, mc: (await imp("api/marketCheck.js")).default, sell: (await imp("api/sell.js")).default, tasks: (await imp("api/tasksPage.js")).default };
const API = { "/api/buySearch": (await imp("api/buySearch.js")).default, "/api/sellerDecision": (await imp("api/sellerDecision.js")).default, "/api/sellChat": (await imp("api/sellChat.js")).default, "/api/tasks": (await imp("api/tasks.js")).default };
const PAGE = { "/find": H.find, "/market-check": H.mc, "/sell": H.sell, "/tasks": H.tasks, "/tasks/mine": H.tasks };

// ---- the world: an archive that sold these cars, and a live board that holds some of them (a plain PostgREST: every filter the engine sends is applied) ----
const BMW = ["M3", "X5", "128i", "135i", "M5", "M6", "Z4", "X3", "X1", "X6", "M2", "i8", "Z3", "X4"];
const CARS = [
  ...BMW.map((m, i) => ({ name: "2009 BMW " + m, make: "BMW", model: m, title: m, year: 2009, price: 30000, n: 30 - i * 2, lowMiles: 20000, spanMiles: 60000, body: "Coupe" })),
  { name: "1962 Porsche 356", make: "Porsche", model: "356", title: "356", year: 1962, price: 90000, n: 10, lowMiles: 40000, spanMiles: 40000 },
  { name: "1967 Porsche 911", make: "Porsche", model: "911", title: "911", year: 1967, price: 110000, n: 8, lowMiles: 40000, spanMiles: 40000 }
];
const world = W.install(CARS, {}), baseFetch = globalThis.fetch, FUT = h => new Date(Date.now() + h * 36e5).toISOString();
const LIVE = []; let LID = 1;
const live = (year, make, model, miles, extra = {}) => LIVE.push({ id: LID++, source: "bringatrailer", source_listing_id: "L" + LID, url: "https://bringatrailer.com/listing/l" + LID, listing_title: `${year} ${make} ${model}`, make, model, year, vin_norm: null, mileage: miles, body: "Coupe", transmission: "Manual", location: "Houston, TX", country: "US", currency: "USD", current_bid: 30000 + LID * 500, current_bid_usd: 30000 + LID * 500, end_time: FUT(10 + LID), photo_url: "https://img.example/l" + LID + ".jpg", last_seen: new Date().toISOString(), first_seen: new Date(Date.now() - 864e5).toISOString(), status: "live", exterior_color: "Black", std_color: "black", description: "A listing.", bid_at: new Date().toISOString(), has_reserve: false, mileage_unit: "mi", special_flag: null, bid_count: 12, ...extra });
for (const [m, mi] of [["M3", 38400], ["X5", 61000], ["128i", 44000], ["135i", 52000], ["Z4", 30000], ["M5", 80000]]) live(2009, "BMW", m, mi);
for (const [y, m, mi] of [[2006, "M3", 90000], [2007, "X5", 70000], [2010, "128i", 41000], [2010, "M5", 29000], [2013, "Z4", 22000], [2015, "X5", 31000], [2016, "M2", 12000], [2011, "M3", 20000], [2012, "X5", 40000], [2014, "M5", 33000], [2008, "M3", 70000]]) live(y, "BMW", m, mi);
for (const [y, m, mi] of [[1962, "356", 50000], [1965, "911", 70000], [1967, "911", 60000]]) live(y, "Porsche", m, mi);
const sales = ["BMW", "Porsche"];

// THE MODEL IS THE ONLY FIXTURE ON THE ENGINE'S SIDE: a stand-in for api.anthropic.com that does what Sam's model does on a first turn (it calls search_live with the filters the real words parser reads from the typed words), then says one line. The tool's answer, the cards, the meta
// and the car are the engine's own. (A hand written ENGINE answer is what this check refuses; the model's tool call is a model output, and is built from the app's own parser, not typed here.)
const SP = await imp("lib/live/samChat.js");
const sse = evts => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const x of evts) c.enqueue(e.encode("data: " + JSON.stringify(x) + "\n\n")); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
const fakeModel = async init => {
  const body = JSON.parse(init.body), msgs = body.messages || [], last = msgs[msgs.length - 1], hasResult = last && Array.isArray(last.content) && last.content.some(c => c.type === "tool_result");
  if (hasResult) return sse([{ type: "message_start", message: { usage: { input_tokens: 10 } } }, { type: "content_block_start", index: 0, content_block: { type: "text" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here they are." } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }, { type: "message_stop" }]);
  const text = String((typeof last.content === "string" ? last.content : (last.content || []).map(c => c.text || "").join(" ")) || ""), f = await SP.filtersFromText({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, text);
  return sse([{ type: "message_start", message: { usage: { input_tokens: 10 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "search_live" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(f || {}) } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }, { type: "message_stop" }]);
};
globalThis.fetch = async (url, init) => {
  if (/api\.anthropic\.com/.test(String(url))) return fakeModel(init);
  const u = new URL(String(url)), p = u.pathname;
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["BMW", "Porsche", "Audi"].map(name => ({ name }))), { status: 200 });
  if (p.endsWith("/live_listings")) { const make = (u.searchParams.get("make") || "").replace(/^ilike\./, "").replace(/\*/g, "").toLowerCase(); return new Response(JSON.stringify(LIVE.filter(r => (!make || r.make.toLowerCase().includes(make)) && r.status === "live")), { status: 200 }); }
  if (p.endsWith("/sales_archive") && u.searchParams.get("select") === "model" && /^eq\./.test(u.searchParams.get("make") || "")) {
    const make = u.searchParams.get("make").slice(3); let lo = null, hi = null; for (const v of u.searchParams.getAll("year")) { const m = /^(gte|lte)\.(\d+)$/.exec(v); if (m) { if (m[1] === "gte") lo = Number(m[2]); else hi = Number(m[2]); } }
    const since = ((u.searchParams.getAll("sale_date").find(v => v.startsWith("gte.")) || "").slice(4)) || "0000";
    return new Response(JSON.stringify(world.rows.filter(r => r.make === make && (lo == null || r.year >= lo) && (hi == null || r.year <= hi) && String(r.sale_date) >= since).map(r => ({ model: r.model }))), { status: 200 });
  }
  return baseFetch(url, init);
};

// ---- the handlers, called as the page calls them ----
async function call(handler, url, { method = "GET", body = null, crew = true, headers = {} } = {}) {
  const chunks = []; const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c, hh) { this.code = c; if (hh) for (const k of Object.keys(hh)) this.h[k.toLowerCase()] = hh[k]; return this; },
    status(c) { this.code = c; return this; }, json(o) { this.h["content-type"] = "application/json"; this.body = JSON.stringify(o); return this; }, send(s) { this.body = typeof s === "string" ? s : JSON.stringify(s); return this; }, write(c) { chunks.push(String(c)); return true; }, flush() {}, flushHeaders() {}, on() {}, end(s) { if (s) chunks.push(String(s)); if (chunks.length) this.body = (this.body || "") + chunks.join(""); this.ended = true; return this; } };
  const u = new URL(url, "https://goasksam.com"), ol = console.log, oe = console.error; console.log = () => {}; console.error = () => {};
  try { await handler({ method, url, query: Object.fromEntries(u.searchParams), headers: { cookie: crew ? CREW : "", host: "goasksam.com", origin: "https://goasksam.com", "content-type": "application/json", ...headers }, socket: {}, body: body ? (typeof body === "string" ? JSON.parse(body) : body) : null, on() {} }, res); } finally { console.log = ol; console.error = oe; }
  return res;
}
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
// open: the real page handler's own HTML; every /api call goes to the real handler and is recorded as the page received it (p._api: path, query, request body, the engine's reply as text and, when JSON, parsed)
async function open(url, { crew = true, width = 1440, settle = 2800 } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = []; p._api = []; p._nav = [];
  await p.evaluateOnNewDocument("try{if(!sessionStorage.getItem('__j')){localStorage.clear();sessionStorage.setItem('__j','1')}}catch(e){}window.GAS_WAIT_SCALE=0.05;");
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="6"/>' });
    if (r.isNavigationRequest() && PAGE[u.pathname]) { p._nav.push(u.pathname + u.search); const o = await call(PAGE[u.pathname], u.pathname + u.search + (u.pathname === "/tasks/mine" && !u.searchParams.get("app") ? (u.search ? "&" : "?") + "app=1" : ""), { crew }); return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html; charset=utf-8", body: o.body || "" }); }
    if (/^\/api\//.test(u.pathname)) {
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
      const H2 = API[u.pathname]; if (!H2) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
      const o = await call(H2, u.pathname + u.search, { method: r.method(), body: r.postData() || null, crew }), ct = o.h["content-type"] || "application/json";
      if (!/\/api\/(track|funnel|gaConsent|watch)/.test(u.pathname)) { let j = null; if (/json/.test(ct)) { try { j = JSON.parse(o.body); } catch {} } else if (/event-stream/.test(ct)) { const ev = String(o.body || "").split("\n").filter(x => x.startsWith("data:")).map(x => { try { return JSON.parse(x.slice(5)); } catch { return null; } }).filter(x => x && typeof x === "object"); j = ev.filter(x => x.cards || x.car || x.reply).pop() || null; } p._api.push({ path: u.pathname, search: u.search, req: r.postData() || "", status: o.code, ct, text: o.body, json: j }); }
      return r.respond({ status: o.code, contentType: ct, headers: { "access-control-allow-origin": "*" }, body: o.body || "{}" }); }
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\/onebox\.js$/, "/js/onebox.js"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, settle)); return p;
}
const BAR = `(() => { const s = document.getElementById("gas-carbar"); if (!s) return { present: false }; const r = s.getBoundingClientRect(), line = s.querySelector(".gcb-line"), pills = [...s.querySelectorAll(".gcb-pill")]; return { present: true, shown: !s.hidden && getComputedStyle(s).display !== "none" && r.height > 0, line: line ? line.textContent : null, pills: pills.map(x => ({ t: x.textContent, h: x.getAttribute("href") })), loc: location.pathname + location.search }; })()`;
const GMC = `(() => { const g = document.getElementById("gmc"); const all = document.querySelectorAll("#gmc"); return { n: all.length, line: g ? (g.querySelector("p,.gmc-line,div") || g).textContent : null, buttons: g ? [...g.querySelectorAll("a.gmc-btn")].map(a => ({ t: a.textContent.trim(), h: a.getAttribute("href") })) : [], text: g ? g.innerText.replace(/\\s+/g, " ").trim() : "" }; })()`;
const PAGETEXT = `document.body.innerText.replace(/\\s+/g, " ")`;
const enc = encodeURIComponent;
const LABEL = { "2009 BMW": "2009 BMW", BMW: "BMW", "1960s Porsche": "1960s Porsche", "BMW 38,400 miles": "BMW 38,400 miles" }, SELLQ = "&state=California&how=unsure&rush=none";
// two tokens are the same car when they decode to the same make, years and mileage (a token may also carry the typed words, which differ by road)
const carKey = t => { const d = t ? CT.decodeCar(t) : null; if (!d) return null; const { raw, ...r } = d; return JSON.stringify(r); };
const tokenOfHref = h => { try { return new URL(h, "https://x").searchParams.get("car"); } catch { return null; } };
const lastJson = (p, re, pick = j => j) => { const xs = p._api.filter(c => re.test(c.path) && c.json && pick(c.json)); return xs.length ? pick(xs[xs.length - 1].json) : null; };
const carOf = j => (j && j.car && j.car.token) ? j.car : null;
const SEARCHES = [["2009 BMW", "2009 BMW", { make: "BMW", year: 2009 }], ["BMW", "BMW", { make: "BMW" }], ["1960s Porsche", "1960s Porsche", { make: "Porsche", yearRange: { start: 1960, end: 1969 } }], ["BMW 38,400 miles", "BMW · 38,400 miles", { make: "BMW", mileage: 38400 }]];

// ===== 1 FIND: the bar on the road the page renders =====
await section("find", async () => {
  for (const [typed, words] of SEARCHES) {
    const p = await open("/find?q=" + enc(typed)); const bar = await p.evaluate(BAR);
    const calls = p._api.filter(c => c.path === "/api/buySearch"), withCar = calls.filter(c => c.json && c.json.car && c.json.car.token), a = withCar[withCar.length - 1], car = a && a.json.car;
    ok(`find "${typed}": the page took the chat road (the streamed answer), not the direct one`, calls.some(c => /event-stream/.test(c.ct)), calls.map(c => c.ct));
    ok(`find "${typed}": the engine's answer on the page's own road carries car { token, line, short }`, !!car && car.line === words, car);
    ok(`find "${typed}": the bar shows with the engine's words`, bar.present && bar.shown && !!car && bar.line === car.line, bar.line);
    ok(`find "${typed}": the four pills carry the engine's token`, !!car && bar.pills.length === 4 && bar.pills.every(x => x.h.endsWith("?car=" + enc(car.token))), bar.pills);
    const d = car ? CT.decodeCar(car.token) : null; ok(`find "${typed}": the token is a partial car (no model) of the typed words`, !!d && !("model" in d) && d.make === SEARCHES.find(s => s[0] === typed)[2].make, d);
    await p.close();
  }
});

// ===== 2 MARKET CHECK: the bar, the engine's model choice ONCE, no older block, no busy line; a tap runs the full car =====
const OLDER = /The range changes with the answer|Another model|Sam is busy|busy right now/i;
await section("market check", async () => {
  for (const [typed, words] of SEARCHES) {
    const p = await open("/market-check?q=" + enc(typed)); const bar = await p.evaluate(BAR), g = await p.evaluate(GMC), text = await p.evaluate(PAGETEXT);
    const reply = lastJson(p, /sellerDecision/, j => j.modelChoice ? j : null), mcx = reply && reply.modelChoice, car = carOf(reply);
    ok(`mc "${typed}": the engine serves a model choice, as a complete reply, with the partial car as the car field`, !!mcx && reply.complete === true && mcx.complete === true && !!car && car.token === mcx.partial.token && car.line === mcx.partial.line, reply && Object.keys(reply));
    ok(`mc "${typed}": the bar shows with the engine's words and four pills carrying its token`, bar.present && bar.shown && !!car && bar.line === car.line && bar.pills.length === 4 && bar.pills.every(x => x.h.endsWith("?car=" + enc(car.token))), [bar.line, car && car.line]);
    ok(`mc "${typed}": the model buttons show ONCE (one choice block), each choice the engine's own`, g.n === 1 && !!mcx && g.buttons.length === mcx.choices.length && g.buttons.every((x, i) => x.t === mcx.choices[i].label), [g.n, g.buttons.length, mcx && mcx.choices.length]);
    ok(`mc "${typed}": no older "Which BMW?" block and no busy line anywhere on the page`, !OLDER.test(text) && !/Which (?:BMW|Porsche)\?/.test(text.replace(mcx ? mcx.line : "", "")), text.slice(0, 400));
    ok(`mc "${typed}": the engine's line and its line about typing the model are on the page`, !!mcx && text.includes(mcx.line) && (!mcx.typeLine || text.includes(mcx.typeLine)), mcx && mcx.typeLine);
    // tapping a model: the tool runs for the FULL car and the bar carries it
    if (mcx && mcx.choices.length) {
      const pick = mcx.choices[0], p2 = p; await p2.evaluate(href => { const a = [...document.querySelectorAll("#gmc a.gmc-btn")].find(x => x.getAttribute("href") === href); a.click(); }, pick.address); await new Promise(r => setTimeout(r, 5000));
      const bar2 = await p2.evaluate(BAR), full = lastJson(p2, /sellerDecision/, j => carOf(j) && !j.modelChoice ? j : null), c2 = carOf(full), d2 = c2 ? CT.decodeCar(c2.token) : null, g2 = await p2.evaluate(GMC);
      const dp = CT.decodeCar(pick.token), same = !!d2 && !!dp && d2.make === dp.make && d2.model === dp.model && (dp.year == null || d2.year === dp.year) && (dp.mileage == null || d2.mileage === dp.mileage);
      ok(`mc "${typed}": tapping ${pick.label} runs Market Check for the full car (the engine's answer carries the car of the choice, with its model)`, !!d2 && !!d2.model && same, [c2 && c2.line, dp, d2]);
      ok(`mc "${typed}": after the tap the bar carries the full car and the choices are gone`, bar2.present && !!c2 && bar2.line === c2.line && bar2.pills.length === 4 && bar2.pills.every(x => x.h.endsWith("?car=" + enc(c2.token))) && g2.n === 0, [bar2.line, g2.n]);
    }
    await p.close();
  }
});

// ===== 2b FIND'S QUESTION (fault 4): a partial car with the bar present still gets Find's narrowing question over the live cars; it speaks in the car's own words ("Which BMW?"), as the model choice does, never the bare "Which model?" =====
await section("find question", async () => {
  for (const [typed] of SEARCHES) {
    const p = await open("/find?q=" + enc(typed)); const a = lastJson(p, /buySearch/, j => j.meta && j.meta.asks && j.meta.asks.length ? j : null), car = carOf(a), ask = a && a.meta.asks.find(x => x.dim === "model"), text = await p.evaluate(PAGETEXT);
    const noun = car ? car.short : ""; 
    if (ask) { ok(`find question "${typed}": the model question is in the car's own words ("Which ${noun}?"), not "Which model?"`, ask.q === `Which ${noun}?`, ask.q); ok(`find question "${typed}": the page never prints the bare "Which model?"`, !/Which model\?/.test(text), text.slice(0, 200)); if (a.meta.narrow !== "quiet" && a.meta.narrow !== "none") ok(`find question "${typed}": the page prints the engine's question (narrow ${a.meta.narrow})`, text.includes(ask.q), text.slice(0, 200)); }
    else ok(`find question "${typed}": no model question was asked for this search (nothing to word)`, true);
    if (ask && a.meta.narrow === "quiet") ok(`find question "${typed}": the page keeps a quiet question off the page, as before`, !text.includes(ask.q));
    await p.close();
  }
  const p = await open("/find?q=" + enc("BMW 38,400 miles")), a = lastJson(p, /buySearch/, j => j.meta && j.meta.asks && j.meta.asks.length ? j : null); ok("find question: BMW 38,400 miles asks which BMW (the case Lane C found)", !!a && a.meta.asks.some(x => x.dim === "model" && x.q === "Which BMW?"), a && a.meta.asks.map(x => x.q)); await p.close();
});

// ===== 3 SELL: the same =====
await section("sell", async () => {
  for (const [typed] of SEARCHES) {
    const f = await open("/find?q=" + enc(typed)), fb = await f.evaluate(BAR), sellHref = fb.pills.find(x => x.t === "Sell").h; await f.close();
    const p = await open(sellHref + SELLQ, { settle: 5000 }); const bar = await p.evaluate(BAR), g = await p.evaluate(GMC), text = await p.evaluate(PAGETEXT);
    const reply = lastJson(p, /sellChat/, j => j.modelChoice ? j : null), mcx = reply && reply.modelChoice, car = carOf(reply);
    ok(`sell "${typed}": the engine serves the model choice as a complete reply with the partial car as the car field`, !!mcx && reply.complete === true && !!car && car.token === mcx.partial.token, reply && Object.keys(reply));
    ok(`sell "${typed}": the bar shows with the engine's words and four pills carrying its token`, bar.present && bar.shown && !!car && bar.line === car.line && bar.pills.length === 4 && bar.pills.every(x => x.h.endsWith("?car=" + enc(car.token))), [bar.line, car && car.line]);
    ok(`sell "${typed}": the model buttons show once, each the engine's own, and the engine's line is on the page`, g.n === 1 && !!mcx && g.buttons.length === mcx.choices.length && text.includes(mcx.line) && (!mcx.typeLine || text.includes(mcx.typeLine)), [g.n, g.buttons.length]);
    ok(`sell "${typed}": no fallback line ("could not be read yet", "Have Sam keep looking", busy) under the choices`, !/could not be read yet|keep looking|busy right now|couldn.t read/i.test(text), text.slice(0, 300));
    if (mcx && mcx.choices.length) {
      const pick = mcx.choices[0]; await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null), p.evaluate(href => [...document.querySelectorAll("#gmc a.gmc-btn")].find(x => x.getAttribute("href") === href).click(), pick.address)]); await new Promise(r => setTimeout(r, 3500));
      const bar2 = await p.evaluate(BAR), dp = CT.decodeCar(pick.token), w = CT.carWords(dp);
      ok(`sell "${typed}": tapping ${pick.label} opens Sell for the full car and the bar carries it`, bar2.present && bar2.shown && bar2.loc.startsWith("/sell") && bar2.line === w.line && bar2.pills.length === 4 && bar2.pills.every(x => x.h.endsWith("?car=" + enc(pick.token))), [bar2.line, w.line, bar2.loc.slice(0, 40)]);
    }
    await p.close();
  }
});

// ===== 4 TASKS: the bar with the engine's words, the box filled =====
await section("tasks", async () => {
  const TK = await imp("lib/tasks/tasks.js");
  for (const [typed] of SEARCHES) {
    const f = await open("/find?q=" + enc(typed)), fb = await f.evaluate(BAR), tasksHref = fb.pills.find(x => x.t === "Tasks").h; await f.close();
    const eng = await CT.withPartialCar({ headers: { cookie: CREW } }, () => TK.emailPreview({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" }, typed)).catch(e => ({ threw: String(e.message) })), car = eng && eng.car;
    const p = await open(tasksHref); const bar = await p.evaluate(BAR), val = await p.evaluate(() => [...document.querySelectorAll("textarea,input")].map(i => i.value).filter(Boolean));
    ok(`tasks "${typed}": the engine's own Tasks answer carries the partial car`, !!car && !!car.token && CT.isPartialCar(CT.decodeCar(car.token)), eng && (eng.threw || eng.error));
    ok(`tasks "${typed}": the bar shows with the engine's words and four pills carrying the token`, bar.present && bar.shown && !!car && bar.line === car.line && bar.pills.length === 4 && bar.pills.every(x => carKey(tokenOfHref(x.h)) === carKey(car.token)), [bar.line, car && car.line]);
    ok(`tasks "${typed}": the request box holds the car in words`, val.some(v => v.startsWith(LABEL[typed])), val);
    await p.close();
  }
});

// ===== 5 EVERY OTHER FIND ROAD, through the real handler: rerun, more, the direct answer =====
await section("roads", async () => {
  const BSH = API["/api/buySearch"];
  for (const [typed] of SEARCHES) {
    const r = await call(BSH, "/api/buySearch", { method: "POST", body: { action: "rerun", text: typed, turns: 0 } }), j = JSON.parse(r.body), more = await call(BSH, "/api/buySearch", { method: "POST", body: { action: "more", filters: j.state && j.state.filters || {}, offset: 6 } }), jm = JSON.parse(more.body);
    ok(`roads "${typed}": the rerun answer carries the partial car`, !!j.car && CT.isPartialCar(CT.decodeCar(j.car.token)), j.car);
    ok(`roads "${typed}": the more answer carries the same car`, !!jm.car && !!j.car && carKey(jm.car.token) === carKey(j.car.token), jm.car);
    const direct = JSON.parse((await call(BSH, "/api/buySearch", { method: "POST", body: { q: typed } })).body);
    ok(`roads "${typed}": the direct answer carries the same partial car`, !!direct.car && !!j.car && carKey(direct.car.token) === carKey(j.car.token), direct.car);
  }
  // the class: every buySearch answer that carries cards and a search's meta carries the car field (a Find road added later with no car fails here)
  const src = fs.readFileSync(path.join(ROOT, "api/buySearch.js"), "utf8").split("\n");
  const roads = src.filter(l => /res\.status\(200\)\.json\(/.test(l) && /meta: \{ live: m\.live|meta: out\.meta|withSuggest\(out/.test(l) || /shape: async out => withSuggest/.test(l));
  ok("roads: every buySearch answer that returns a search's cards and meta spells the car field (" + roads.length + " found)", roads.length >= 3 && roads.every(l => /out\.car|car:|withServedCar/.test(l)), roads.map(l => l.trim().slice(0, 80)));
});

// ===== 6 A VISITOR GETS ALL OF IT (the partial car is public, Sam's word, Nov 17 2026), AND NO VARIANT ROWS =====
await section("visitor", async () => {
  const labelsOf = a => JSON.stringify(a && a.modelChoice && a.modelChoice.choices && a.modelChoice.choices.map(c => c.label));
  for (const [typed] of SEARCHES) {
    const f = await open("/find?q=" + enc(typed), { crew: false }), fa = lastJson(f, /buySearch/, j => j.cards || j.reply ? j : null), fb = await f.evaluate(BAR); await f.close();
    const fcp = await open("/find?q=" + enc(typed)), fca = lastJson(fcp, /buySearch/, j => j.cards || j.reply ? j : null), fcb = await fcp.evaluate(BAR); await fcp.close();
    ok(`visitor "${typed}": Find's answer carries the partial car and the bar is drawn with the engine's words, as the crew's`, !!fa && !!fa.car && CT.isPartialCar(CT.decodeCar(fa.car.token)) && fb.present && fb.shown && fb.line === fa.car.line && !!fcb && fb.line === fcb.line && fb.pills.length === 4, [fa && fa.car, fb.line, fcb && fcb.line]);
    { const q = fa && fa.meta && fa.meta.asks && fa.meta.asks.find(x => x.dim === "model"), qc = fca && fca.meta && fca.meta.asks && fca.meta.asks.find(x => x.dim === "model"); ok(`visitor "${typed}": Find's model question reads as the crew's`, (q && q.q) === (qc && qc.q), [q && q.q, qc && qc.q]); }
    const m = await open("/market-check?q=" + enc(typed), { crew: false }), ma = lastJson(m, /sellerDecision/, j => j.status ? j : null), mg = await m.evaluate(GMC), mb = await m.evaluate(BAR), rows = await m.evaluate(() => !!document.getElementById("vrs-mod") || !!document.getElementById("vrs")); await m.close();
    const mc = await open("/market-check?q=" + enc(typed)), mca = lastJson(mc, /sellerDecision/, j => j.status ? j : null), mcg = await mc.evaluate(GMC); await mc.close();
    log("DBGM", typed, JSON.stringify({ mc: !!(ma && ma.modelChoice), car: !!(ma && ma.car), eq: labelsOf(ma) === labelsOf(mca), mgn: mg.n, mcgn: mcg.n, blocks: mg.blocks, bar: [mb.present, mb.shown] }));
    ok(`visitor "${typed}": Market Check serves the modelChoice and the car, draws the choice block once and the bar, as the crew's`, !!ma && !!ma.modelChoice && !!ma.car && labelsOf(ma) === labelsOf(mca) && mg.n === mcg.n && mg.n > 0 && mg.blocks === 1 && mb.present && mb.shown, ma && Object.keys(ma));
    ok(`visitor "${typed}": Market Check has no variant rows module (the rows stay crew only)`, rows === false, rows);
    const s = await open("/sell?car=" + enc(LABEL[typed]) + SELLQ, { crew: false }), sa = lastJson(s, /sellChat/, j => j.error || j.marketAnswer || j.modelChoice ? j : null), sg = await s.evaluate(GMC); await s.close();
    const sc = await open("/sell?car=" + enc(LABEL[typed]) + SELLQ), sca = lastJson(sc, /sellChat/, j => j.error || j.marketAnswer || j.modelChoice ? j : null), scg = await sc.evaluate(GMC); await sc.close();
    ok(`visitor "${typed}": Sell serves the modelChoice and draws it, as the crew's`, !!(sa && sa.modelChoice) && labelsOf(sa) === labelsOf(sca) && sg.n === scg.n && sg.n > 0, sa && Object.keys(sa));
  }
  const tok = CT.encodeCar({ make: "BMW", year: 2009 }, { partial: true }), t = await open("/tasks?car=" + enc(tok), { crew: false }), tb = await t.evaluate(BAR), tbox = await t.evaluate(() => [...document.querySelectorAll("textarea,input")].map(i => i.value).filter(Boolean)); await t.close();
  ok("visitor: a partial token in a Tasks address gives the bar '2009 BMW' and fills the request box", tb.present && tb.shown && tb.line === "2009 BMW" && tbox.some(v => v.startsWith("2009 BMW")), [tb.line, tbox]);
});
await b.close(); console.log = log; console.error = err;
console.log(`partialCarJoinCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f); process.exit(fail ? 1 : 0);
// ---- MUTANTS, in a COPY of the worktree (never on the branch): each breaks one rule of the join and the check must go red ----
async function mutants() {
  const sub = (file, from, to, want) => ({ file, from, to, want });
  const M = [
    sub("lib/live/samChat.js", "ctx.car = partialSearchCar(v, f, p);", "ctx.car = null;", "the chat road stamps no car"),
    sub("lib/live/samChat.js", "{ ...out, car: ctx.car || null, reply, searchNote,", "{ ...out, reply, searchNote,", "runTurn drops the car it read"),
    sub("lib/live/samChat.js", "return { car: ctx.car || null, reply: ctx.searchLine", "return { reply: ctx.searchLine", "runFilters drops the car it read"),
    sub("lib/live/samChat.js", "if (!partialCarActive() || !v || !v.make", "if (!v || !v.make", "a visitor's Find answer carries the partial car"),
    sub("lib/live/samChat.js", "if (f && Number(f.milesNear) > 0) car.mileage = Number(f.milesNear);", "", "the typed mileage is dropped from the Find car"),
    sub("api/buySearch.js", "shape: async out => withSuggest(out, { ...(out.car ? { car: out.car } : {}), cards:", "shape: async out => withSuggest(out, { cards:", "the chat answer drops the car"),
    sub("api/buySearch.js", "return res.status(200).json({ ...(out.car ? { car: out.car } : {}), reply: out.reply,", "return res.status(200).json({ reply: out.reply,", "the rerun answer drops the car"),
    sub("api/buySearch.js", "return res.status(200).json({ ...(out.car ? { car: out.car } : {}), cards, meta: { live: m.live,", "return res.status(200).json({ cards, meta: { live: m.live,", "the more answer drops the car"),
    sub("lib/carChoice.js", "{ ...reply, ...(mc.partial ? { car: mc.partial } : {}), complete: true, modelChoice: mc }", "{ ...reply, complete: true, modelChoice: mc }", "a model choice reply carries no car field"),
    sub("lib/carChoice.js", "{ ...reply, ...(mc.partial ? { car: mc.partial } : {}), complete: true, modelChoice: mc }", "{ ...reply, ...(mc.partial ? { car: mc.partial } : {}), modelChoice: mc }", "a model choice reply is not marked complete"),
    sub("lib/carChoice.js", "typeLine: TYPE_LINE, box: true, empty: false, complete: true }", "typeLine: TYPE_LINE, box: true, empty: false }", "the choice itself is not marked complete"),
    sub("api/sellerDecision.js", "return res.status(200).json(choiceReply({ status: \"one_box\",", "return res.status(200).json(((r, m) => ({ ...r, modelChoice: m }))({ status: \"one_box\",", "Market Check serves the old shape (no car, no complete)"),
    sub("lib/sell/sellFlow.js", "return done(choiceReply({ error: \"car\", couldNotLine: reasonLine(\"cold.missed\") }, await partialChoiceAnswer(sc.partial, env, \"sell\")));", "return done({ modelChoice: await partialChoiceAnswer(sc.partial, env, \"sell\") || undefined, error: \"car\", couldNotLine: reasonLine(\"cold.missed\") });", "Sell serves the old shape (no car, no complete)"),
    sub("public/js/onebox.js", "if (d && d.complete === true && d.modelChoice) { obAsk = null;", "if (false) { obAsk = null;", "the shared page draws the older block for a complete choice"),
    sub("lib/sell/sellMcClient.js", "if (j && j.complete === true && j.modelChoice) {", "if (false) {", "the Sell shell draws its fallback line for a complete choice"),
    sub("lib/modelChoicePage.js", "typeof c.address === \"string\" && c.address.charAt(0) === \"/\" ? c.address : \"\"", "c && c.car && typeof c.car.address === \"string\" ? c.car.address : \"\"", "the page reads a choice shape the engine does not send (no links)"),
    sub("lib/modelChoicePage.js", "if (text(mc.typeLine))", "if (false)", "the engine's line about typing the model is not printed"),
    sub("lib/live/narrow.js", "if (!partialCarActive() || !make) return QWORDS.model;", "return QWORDS.model;", "Find asks the bare Which model?"),
    sub("lib/live/narrow.js", "if (!partialCarActive() || !make) return QWORDS.model;", "if (!make) return QWORDS.model;", "a visitor's question is reworded"),
    sub("lib/carBar.js", "const barFor = req => CAR_BAR_PUBLIC || isCrewRequest(req) === true;", "const barFor = req => false;", "the bar is never drawn")
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pcj-")), results = [];
  const prep = i => { const d = path.join(tmp, "m" + i); spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", ROOT + "/", d + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(d, "node_modules")); return d; };
  const run = (m, i) => new Promise(res => {
    const d = prep(i), f = path.join(d, m.file); let t = fs.readFileSync(f, "utf8");
    if (!t.includes(m.from)) return res({ m, stale: true });
    fs.writeFileSync(f, t.replace(m.from, () => m.to));
    const c = spawn("node", [path.join(d, "scripts/partialCarJoinCheck.mjs")], { cwd: d }); let out = ""; c.stdout.on("data", x => out += x); c.stderr.on("data", x => out += x);
    c.on("close", code => res({ m, killed: code !== 0, line: (out.split("\n").find(l => /FAIL/.test(l) && !/pass/.test(l)) || out.split("\n").find(l => /pass/.test(l)) || "").slice(0, 150) }));
  });
  const queue = M.map((m, i) => [m, i]); const workers = Array.from({ length: 4 }, async () => { while (queue.length) { const [m, i] = queue.shift(); results.push(await run(m, i)); } }); await Promise.all(workers);
  let survived = 0; for (const r of results) { const bad = r.stale || !r.killed; if (bad) survived++; console.log((r.stale ? "STALE    " : r.killed ? "killed   " : "SURVIVED ") + r.m.want + (r.killed ? "  <- " + r.line : "")); }
  console.log(`partialCarJoinCheck mutants: ${results.length - survived} of ${results.length} killed`); fs.rmSync(tmp, { recursive: true, force: true }); return survived ? 1 : 0;
}
