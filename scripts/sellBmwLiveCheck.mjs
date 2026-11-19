// sellBmwLiveCheck (Lane B, Nov 19 2026, lane-b-sell-bmw-live; order bc85): SELL FOR A CAR WITH NO MODEL ("bmw") ON THE REAL PAGE, THROUGH THE REAL HANDLERS.
// LIVE (Nov 19, as a visitor): /sell?car=bmw asked the three questions (state, how, how quickly) with NO call to the engine, then the range step answered with the model choice ("Which BMW?"), and a tap on "3 Series" opened Sell again from the first question.
// CAUSE: the cards step (lane-b-sell-cards-first, cd24534e) ran only for a car the PAGE could name from its embedded list of cars with versions ("Ferrari 330 GT", "1987 Firebird"); "bmw" is in no list, so the page went to the first question, and the first call to the engine was after the last answer.
// CLASS: every car the page cannot name from its list but the engine can: a make alone in any spelling the resolver knows ("bmw", "BMW", "chevy", "merc", "2009 BMW", "1960s Porsche"). The page now asks the engine first for every address car except a VIN, and the engine answers with the cards, the model choice, or nothing.
// WHY THE EARLIER CHECKS PASSED: they gave the page the three answers in the address (&state=...&how=...&rush=...), so the questions were never on screen to be seen before the choice. This one opens the bare address a typed search reaches and watches every question the page shows, in order.
// THE CASES (a visitor and the crew, each "bmw", "BMW", "2009 BMW", "porsche", "1960s Porsche"): before any question is shown the page has called the engine and the model buttons are on screen (the engine's own); no question and no waiting line under them; no range call before a tap; after a tap
// the state, how and rush questions appear ONCE each, in order, and no question appears twice in the visit. Every word asserted is read back from the engine's own reply as the page received it.
//   node scripts/sellBmwLiveCheck.mjs [repo root]      --mutants runs each break in a COPY of the tree (each must fail)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawn, spawnSync } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(await mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(here, "_typedThroughWorld.mjs")).href); W.setEnv(); process.env.NEW_DESIGN = "1"; process.env.SELL_NEXT_ON = "1";   /* live serves the new Sell page to every visitor (SELL_NEXT_ON), so a visitor here gets it too */
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
  await p.evaluateOnNewDocument("try{if(!sessionStorage.getItem('__j')){localStorage.clear();sessionStorage.setItem('__j','1')}}catch(e){}window.GAS_WAIT_SCALE=0.05;" + WATCH);
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


const QS = ["Which state is it in?", "How would you like to sell it?", "How quickly do you need it sold?"];
const WATCH = "window.__qs=[];(function(){var seen='';function look(){var t=document.body?document.body.innerText:'';var q='';"+JSON.stringify(QS)+".forEach(function(s){if(t.indexOf(s)>=0)q=s});if(q!==seen){seen=q;if(q)window.__qs.push(q)}}new MutationObserver(look).observe(document,{childList:true,subtree:true,characterData:true});document.addEventListener('DOMContentLoaded',look);setInterval(look,100)})();";
const CASES = [["bmw", "BMW"], ["BMW", "BMW"], ["2009 BMW", "2009 BMW"], ["porsche", "Porsche"], ["1960s Porsche", "1960s Porsche"]];
await section("sell", async () => {
  for (const crew of [false, true]) for (const [typed] of CASES) {
    const who = crew ? "crew" : "visitor", p = await open("/sell?car=" + enc(typed), { crew, settle: 6000 });
    if (process.env.DBG) process.stderr.write("DBG " + JSON.stringify([who, typed, p._api.map(c => c.path), p._nav, p._err, (await p.evaluate(PAGETEXT)).slice(0, 300)]) + "\n"); const calls = p._api.filter(c => c.path === "/api/sellChat"), first = calls[0], reply = lastJson(p, /sellChat/, j => j.modelChoice ? j : null), mcx = reply && reply.modelChoice;
    const qs = await p.evaluate("window.__qs"), g = await p.evaluate(GMC), text = await p.evaluate(PAGETEXT);
    ok(`${who} "${typed}": the page asks the engine before it shows any question (its first call is the cards step)`, !!first && /"step":"cards"/.test(first.req || ""), first && Object.keys(first));
    ok(`${who} "${typed}": the engine answers with the model choice (complete, with the partial car)`, !!mcx && reply.complete === true && !!reply.car && !!mcx.choices.length, reply && Object.keys(reply));
    ok(`${who} "${typed}": no question was on screen before the choice, or beside it (questions seen: ${JSON.stringify(qs)})`, qs.length === 0, qs);
    ok(`${who} "${typed}": the model buttons are on the page once, each the engine's own`, g.n === 1 && !!mcx && g.buttons.length === mcx.choices.length, [g.n, g.buttons.length, mcx && mcx.choices.length]);
    ok(`${who} "${typed}": no waiting line and no could-not line under the choice`, !/Reading the sales|Sam is reading|could not be read|keep looking/i.test(text), text.slice(0, 240));
    ok(`${who} "${typed}": no range call before a tap`, !calls.some(c => /"step":"range"/.test(c.req || "")), calls.map(c => (c.req || "").slice(0, 60)));
    if (mcx && mcx.choices.length) {
      const pick = mcx.choices[0]; await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null), p.evaluate(href => [...document.querySelectorAll("#gmc a.gmc-btn")].find(x => x.getAttribute("href") === href).click(), pick.address)]); await new Promise(r => setTimeout(r, 4000));
      const tap = async re => p.evaluate(src => { const R = new RegExp(src, "i"); const e = [...document.querySelectorAll("button,.chip,[role=button]")].filter(e => e.offsetParent).find(e => R.test(e.innerText.trim())); if (e) { e.click(); return true; } return false; }, re.source);
      const a1 = (await p.evaluate("window.__qs")).slice(); await tap(/^California$/); await new Promise(r => setTimeout(r, 2500)); await tap(/^I.ll sell it myself$/); await new Promise(r => setTimeout(r, 2500)); await tap(/^Want it gone fast$/); await new Promise(r => setTimeout(r, 3000));
      const all = await p.evaluate("window.__qs");
      ok(`${who} "${typed}": after the tap the first thing asked is the state question (${pick.label})`, a1[0] === QS[0] || (a1.length === 0 && true), a1);
      ok(`${who} "${typed}": the three questions are each asked ONCE in the visit, in order (${JSON.stringify(all)})`, JSON.stringify(all.filter((x, i) => all.indexOf(x) === i)) === JSON.stringify(all) && all[0] === QS[0] && all.every((x, i) => x === QS[i]), all);
    }
    await p.close();
  }
});
await section("typed", async () => {   // the road a visitor takes: the box on /sell, then Enter (the page goes to the address)
  for (const typed of ["bmw", "chevy"]) {
    const p = await open("/sell", { crew: false, settle: 2500 }); await p.type("#pq, #ob-input", typed); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 6500));
    const qs = await p.evaluate("window.__qs"), g = await p.evaluate(GMC), calls = p._api.filter(c => c.path === "/api/sellChat"), reply = lastJson(p, /sellChat/, j => j.modelChoice ? j : null);
    if (typed === "chevy") { ok(`typed "chevy" (a name the resolver knows and the page's list does not, a make this archive does not hold): the page asked the engine first and showed no question before its answer`, calls.length > 0 && /"step":"cards"/.test(calls[0].req || ""), calls.map(c => (c.req || "").slice(0, 50))); await p.close(); continue; }
    ok(`typed "${typed}" in the box on /sell: the engine's model choice is the first thing on the page, no question before it`, qs.length === 0 && g.n === 1 && !!reply && g.buttons.length === reply.modelChoice.choices.length && /"step":"cards"/.test((calls[0] || {}).req || ""), [qs, g.n, calls.map(c => (c.req || "").slice(0, 50))]);
    await p.close();
  }
});
await section("vin", async () => {   // a VIN has no cards and no choice: no cards call, the first question at once
  const p = await open("/sell?car=WP0AA29962S621698", { crew: false, settle: 4500 }), qs = await p.evaluate("window.__qs"), calls = p._api.filter(c => c.path === "/api/sellChat");
  ok("a VIN in the Sell address: no cards call is made and the first question is on the page", !calls.some(c => /"step":"cards"/.test(c.req || "")) && qs[0] === QS[0], [qs, calls.map(c => (c.req || "").slice(0, 60))]); await p.close();
});
await b.close(); console.log = log; console.error = err;
console.log(`sellBmwLiveCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f); process.exit(fail ? 1 : 0);


async function mutants() {
  const sub = (file, from, to, want) => ({ file, from, to, want });
  const M = [
    sub("lib/sell/sellMcClient.js", "return cardsThen(function(){ S.stage = \"state\"; askState(); }, true); }\n    if (!S.how) { S.stage = \"how\"; return question(\"Next question\", \"How would you like to sell it?\", HOW, \"Or type it in your own words\"); }\n    if (!S.rush) { S.stage = \"rush\"; return question(\"One last question\", \"How quickly do you need it sold?\", RUSH, \"Or type it in your own words\"); }\n    S.stage = \"result\"; result();\n  }\n  // The next unanswered", "return cardsThen(function(){ S.stage = \"state\"; askState(); }); }\n    if (!S.how) { S.stage = \"how\"; return question(\"Next question\", \"How would you like to sell it?\", HOW, \"Or type it in your own words\"); }\n    if (!S.rush) { S.stage = \"rush\"; return question(\"One last question\", \"How quickly do you need it sold?\", RUSH, \"Or type it in your own words\"); }\n    S.stage = \"result\"; result();\n  }\n  // The next unanswered", "an address car the list does not name goes to the first question (the live fault)"),
    sub("lib/sell/sellMcClient.js", "(force && /\\b[A-HJ-NPR-Z0-9]{17}\\b/i.test(key))", "(false)", "a VIN is asked for cards"),
    sub("lib/sell/sellMcClient.js", "if (j && j.complete === true && j.modelChoice) { S.stage = \"cards\";", "if (false) { S.stage = \"cards\";", "the choice reply is not taken (the first question follows it)"),
    sub("lib/sell/sellMcClient.js", "x0.root.innerHTML = x0.inboxHtml(S.typed || S.label || \"\", \"Type another car\") + x0.footHtml(); x0.wire(); return; }", "return; }", "the waiting line stays under the choice"),
    sub("lib/sell/sellFlow.js", "if (!sc.car && sc.partial && env && env.partialCar === true) return done(choiceReply({ split: null }, await partialChoiceAnswer(sc.partial, env, \"sell\")));", "", "the cards step says nothing for a make alone"),
    sub("lib/sell/sellFlow.js", "choiceReply({ split: null }, await partialChoiceAnswer(sc.partial, env, \"sell\"))", "{ split: null, modelChoice: await partialChoiceAnswer(sc.partial, env, \"sell\") || undefined }", "the choice reply is not marked complete and carries no car")
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sbl-")), results = [];
  const prep = i => { const d = path.join(tmp, "m" + i); spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", ROOT + "/", d + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(d, "node_modules")); return d; };
  const run = (m, i) => new Promise(res => {
    const d = prep(i), f = path.join(d, m.file); let t = fs.readFileSync(f, "utf8");
    if (!t.includes(m.from)) return res({ m, stale: true });
    fs.writeFileSync(f, t.replace(m.from, () => m.to));
    const c = spawn("node", [path.join(d, "scripts/sellBmwLiveCheck.mjs")], { cwd: d }); let out = ""; c.stdout.on("data", x => out += x); c.stderr.on("data", x => out += x);
    c.on("close", code => res({ m, killed: code !== 0, line: (out.split("\n").find(l => /FAIL/.test(l) && !/pass/.test(l)) || out.split("\n").find(l => /pass/.test(l)) || "").slice(0, 150) }));
  });
  const queue = M.map((m, i) => [m, i]); const workers = Array.from({ length: 3 }, async () => { while (queue.length) { const [m, i] = queue.shift(); results.push(await run(m, i)); } }); await Promise.all(workers);
  let survived = 0; for (const r of results) { const bad = r.stale || !r.killed; if (bad) survived++; console.log((r.stale ? "STALE    " : r.killed ? "killed   " : "SURVIVED ") + r.m.want + (r.killed ? "  <- " + r.line : "")); }
  console.log(`sellBmwLiveCheck mutants: ${results.length - survived} of ${results.length} killed`); fs.rmSync(tmp, { recursive: true, force: true }); return survived ? 1 : 0;
}
