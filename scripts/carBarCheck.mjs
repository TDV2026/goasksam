// carBarCheck (Lane S, Nov 2026; joined to Lane B's real token, Nov 17): the car bar (lib/carBar.js), CREW ONLY, under the header on Find results, Market Check results, Sell results, the Tasks composer and the VIN page.
//   1 THE SL500 TOKEN (VIN WDBSK75F83F044627, 38,400 miles, Automatic) in the address of Find, Market Check, Sell and Tasks: the bar shows with the car's line, the four pills carry the SAME token, the current tool is marked; the tool is opened already run
//     (the tool's own address carries the car's words, no 302); its FIRST API call carries ?car=<token> and replayed into the real handlers the resolver is asked 0 times (resolverStats; 1 without the token)
//   2 a typed search with no token: the bar appears from car.token in the engine's answer; the first call carried no token
//   3 mileage, transmission or VIN changed in a tool: the next answer's car.token is the pills' token; calls after an answer no longer carry the old one
//   4 a tampered or cut v1 token: no bar and the tool's normal empty input; Sell opened with ?car=plain words behaves as on main
//   5 Change (landing, car filled, session cleared), Back to your car on Home and the rail, 390 px nothing overflows, a visitor and the old plain cookie get the page untouched
// MUTANTS (each must fail): see the list below.
//   node scripts/carBarCheck.mjs [--mutants]     offline; Chrome
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("carBarCheck: SKIP no Chrome"); process.exit(0); }
if (process.argv.includes("--mutants")) {
  const f = "lib/carBar.js";
  const MUT = [
    ["a pill without the token", 'a.href=href(t.path,car.token);', 'a.href=(C.base||"")+t.path;'],
    ["the bar on an empty page", " else slot.hidden=true;\n var rail", ' else{slot.hidden=false;slot.appendChild(el("div","gcb-in","x"))}\n var rail'],
    ["the car retyped into the target's input", 'else if(C.tool==="tasks"&&C.boot&&C.boot.label)fillInto(C.boot.label,"#tkq",true)}', 'else if(C.boot&&C.boot.label)fillInto(C.boot.label,"#pq,#q,#ob-input,#tkq",true)}'],
    ["the bar for a visitor", "isCrewRequest(req) !== true || ", ""],
    ["the Tasks focus dropped", 'if(focus){i.focus();', 'if(false){i.focus();'],
    ["Change that keeps the session car", 'ch.addEventListener("click",function(){save(null)});', ''],
    ["the line not truncated", ".gcb-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", ".gcb-line{min-width:0;white-space:nowrap;"],
    ["the pills on the line's own row", "@media (max-width:640px){.gcb-in{padding:8px 16px}.gcb-l{flex:1 1 100%}", "@media (max-width:640px){.gcb-in{padding:8px 16px;flex-wrap:nowrap}.gcb-l{flex:1 1 auto}"],
    ["the token not handed to the tool's first API call", "if(pending&&typeof input===", "if(false&&typeof input==="],
    ["the bar not taking car.token from the answer", "function take(c){if(!c||!c.token||", "function take(c){if(true||"],
    ["the old token still sent after an answer has its own", "function take(c){if(!c||!c.token||(car&&car.token===c.token))return;pending=null;", "function take(c){if(!c||!c.token||(car&&car.token===c.token))return;"],
    ["a tampered token accepted", "const info = tool === \"vin\" ? null : carInfo(v);", "const info = tool === \"vin\" ? null : { token: v, line: v, short: v, label: v };"],
    ["Sell's plain words treated as a token", 'export const isCarToken = v => typeof v === "string" && v.startsWith(TOKEN_VERSION + ".");', 'export const isCarToken = v => typeof v === "string" && v.length > 0;'],
    ["the pills keeping the old token after the car changes", "function take(c){if(!c||!c.token||(car&&car.token===c.token))return;", "function take(c){if(!c||!c.token||car)return;"],
    ["a car line built on the page from the token", "car={token:c.token,line:c.line,short:c.short||\"\"}", "car={token:c.token,line:\"\"+c.token,short:\"\"}"]
  ];
  let bad = 0;
  for (const [name, from, to] of MUT) {
    const P = path.join(ROOT, f), orig = fs.readFileSync(P, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0; try { fs.writeFileSync(P, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe", timeout: 240000 }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(P, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "carBarCheck mutants: " + bad + " not caught" : "carBarCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
process.chdir(ROOT); process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; delete process.env.NEW_DESIGN;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { mintCrewCookieValue } = await imp("lib/_crew.js"), CREW = "gas_crew=" + mintCrewCookieValue();
const CP = (await imp("api/crewPage.js")).default, CT = await imp("lib/carToken.js"), CB = await imp("lib/carBar.js"), V = await imp("lib/vehicle.js");
const SL = { raw: "2003 mercedes sl500", year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500", vin: "WDBSK75F83F044627", mileage: 38400, transmission: "Automatic", confidence: "high" };
const TOKEN = CT.encodeCar(SL), TOKEN2 = CT.encodeCar({ ...SL, mileage: 41000, transmission: "Manual" }), TAMPERED = TOKEN.slice(0, 30) + (TOKEN[30] === "A" ? "B" : "A") + TOKEN.slice(31), CUT = TOKEN.slice(0, TOKEN.length - 14);
const STAMP = CT.carStamp(SL), STAMP2 = CT.carStamp({ ...SL, mileage: 41000, transmission: "Manual" });   // the engine's own car.token, car.line and car.short (lib/carToken.js carStamp): the answers below carry what the engine sends
const LINE = "2003 Mercedes-Benz SL-Class SL500 · 38,400 miles · VIN ...4627", LABEL = "2003 Mercedes-Benz SL-Class SL500", LINE2 = "2003 Mercedes-Benz SL-Class SL500 · 41,000 miles · VIN ...4627";
const LONGCAR = { year: 1967, make: "Mercedes-Benz", model: "300 SL Gullwing Coupe Alloy Body Competition Package", trim: "Special Order Build", vin: "WDB1980405500AAAA", mileage: 120400 }, LONG = CT.encodeCar(LONGCAR);
const enc = encodeURIComponent;
async function call(handler, url, opts = {}) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, json(o) { this.body = JSON.stringify(o); return this; }, send(b) { this.body = String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; } };
  const u = new URL(url, "https://goasksam.com"), log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await handler({ method: opts.method || "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: opts.crew === false ? "" : CREW, host: "goasksam.com", "content-type": "application/json" }, socket: {}, body: opts.body || null }, res); } finally { console.log = log; console.error = err; }
  return res;
}
const PAGE_OF = { "/preview/find": "preview-find", "/preview/market-check": "preview-market-check", "/preview/sell": "preview-sell", "/preview/tasks/mine": "preview-tasks-mine", "/preview/tasks": "preview-tasks", "/preview/home": "preview-home", "/preview/market-check/onebox.js": "preview-onebox-js" };
const pageOf = async (url, crew = true) => { const u = new URL(url, "https://goasksam.com"), P = PAGE_OF[u.pathname]; if (!P) return null; const q = new URLSearchParams(u.search); q.set("page", P); return call(CP, u.pathname + "?" + q.toString(), { crew }); };
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
// answers: [[regex over "METHOD url", json]] the engine's answer for a matching call (default {}); p._api records every API call the page makes
async function open(url, width = 1440, { crew = true, html = null, signed = /^\/preview\/tasks\/mine/.test(url), answers = [] } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = []; p._api = [];
  await p.evaluateOnNewDocument(si => { try { if (si && !localStorage.getItem("gas_auth_session")) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); } catch (e) {} }, signed);
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="6"/>' });
    if (r.isNavigationRequest()) { if (html != null) return r.respond({ status: 200, contentType: "text/html", body: html }); const o = await pageOf(u.pathname + u.search, crew); if (o) return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body }); return r.respond({ status: 404, body: "" }); }
    if (u.pathname === "/preview/tasks/api") { p._api.push({ m: r.method(), u: u.pathname + u.search, b: r.postData() || "" }); const o = await call(CP, "/api/crewPage?page=preview-tasks-api", { method: "POST", body: r.postData() || "{}" }); return r.respond({ status: o.code, contentType: "application/json", body: o.body || "{}" }); }
    if (u.pathname === "/preview/market-check/onebox.js") { const o = await pageOf(u.pathname); return r.respond({ status: 200, contentType: "application/javascript", body: o ? o.body : "" }); }
    if (u.pathname === "/api/crewPage") { const o = await call(CP, u.pathname + u.search, { crew }); return r.respond({ status: o.code, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: o.body || "{}" }); }
    if (/^\/api\//.test(u.pathname)) { const key = r.method() + " " + u.pathname + u.search; if (!/\/api\/(track|funnel|gaConsent|watch)/.test(u.pathname)) p._api.push({ m: r.method(), u: u.pathname + u.search, b: r.postData() || "" });
      const hit = answers.find(([re]) => re.test(key)); return r.respond({ status: 200, contentType: hit && hit[2] ? hit[2] : "application/json", headers: { "access-control-allow-origin": "*" }, body: hit ? (typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1])) : "{}" }); }
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\/onebox\.js$/, "/js/onebox.js"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1500)); return p;
}
const BAR = `(() => { const s = document.getElementById("gas-carbar"); if (!s) return { present: false }; const cs = getComputedStyle(s), r = s.getBoundingClientRect(), line = s.querySelector(".gcb-line"), pills = [...s.querySelectorAll(".gcb-pill")], ch = s.querySelector(".gcb-change"), hdr = document.querySelector("header.gh");
  return { present: true, shown: !s.hidden && cs.display !== "none" && r.height > 0, line: line ? line.textContent : null, trunc: line ? line.scrollWidth > line.clientWidth : false, change: ch ? ch.getAttribute("href") : null, pills: pills.map(x => ({ t: x.textContent, h: x.getAttribute("href"), on: x.classList.contains("on"), cur: x.getAttribute("aria-current"), bg: getComputedStyle(x).backgroundColor, top: Math.round(x.getBoundingClientRect().top) })), lineBottom: line ? Math.round(line.getBoundingClientRect().bottom) : 0, below: hdr ? r.top >= hdr.getBoundingClientRect().bottom - 1 : true, overflowX: document.documentElement.scrollWidth - innerWidth, back: !!document.getElementById("gcb-railback") || !!s.querySelector(".gcb-back"), carfill: !!document.querySelector("[data-carfill]"), loc: location.pathname + location.search, inputs: [...document.querySelectorAll("input,textarea")].map(i => i.value).filter(Boolean), h1: (document.getElementById("gas-h1") || {}).textContent || "", active: document.activeElement && document.activeElement.id }; })()`;
const NAMES = ["Find", "Market Check", "Sell", "Tasks"], PATHS = ["/find", "/market-check", "/sell", "/tasks"];
const TOOLS = [["find", "/preview/find", 0, /\/api\/buySearch/], ["mc", "/preview/market-check", 1, /\/api\/sellerDecision/], ["sell", "/preview/sell", 2, /\/api\/sellChat/], ["tasks", "/preview/tasks/mine", 3, /\/preview\/tasks\/api|\/api\/tasks/]];
const SELLQ = "&state=California&how=unsure&rush=none", qOf = (tool, tok) => (tool === "sell" ? "?car=" + enc(tok) + SELLQ : "?car=" + enc(tok));
const hasToken = (call, t = TOKEN) => call && new URL(call.u, "https://x").searchParams.get("car") === t;
// 1 the SL500 token in the address
for (const [tool, p0, idx, apiRe] of TOOLS) {
  const p = await open(p0 + qOf(tool, TOKEN)), r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.below && r.line === LINE, tool + ": the bar shows under the header with the car's line " + JSON.stringify(r.line));
  ok(r.pills.length === 4 && r.pills.map(x => x.t).join() === NAMES.join(), tool + ": the four pills are the rail's tool names");
  ok(r.pills.every((x, i) => x.h === "/preview" + PATHS[i] + "?car=" + enc(TOKEN)), tool + ": every pill is a plain link carrying the same token " + JSON.stringify(r.pills.map(x => x.h.slice(-12))));
  ok(r.pills.filter(x => x.on).length === 1 && r.pills[idx].on && r.pills[idx].cur === "page" && r.pills.every((x, i) => i === idx || (!x.on && x.cur === null)) && r.pills[idx].bg !== r.pills[(idx + 1) % 4].bg, tool + ": the current tool is the one filled pill and marked");
  ok(r.change === "/preview" + PATHS[idx] + "?change=" + enc(TOKEN), tool + ": Change goes back to this tool's input with the car");
  if (tool !== "tasks") { const want = tool === "sell" ? "car=" : "q="; ok(r.loc.replace(/\+/g, "%20").startsWith(p0 + "?" + want + enc(LABEL)) && !r.loc.includes("v1.") && !r.carfill, tool + ": opened already run: the tool's own address carries the car's words (no 302, no ct) " + r.loc); }
  else ok(r.inputs.some(v => v.startsWith(LABEL)) && r.active === "tkq", "tasks: the composer opens with the car filled and the focus in the job field " + JSON.stringify([r.inputs, r.active]));
  const first = p._api.find(c => apiRe.test(c.u));
  ok(hasToken(first), tool + ": the tool's FIRST engine call carries ?car=<the token> " + JSON.stringify(first && first.u.slice(0, 90)));
  ok(!p._err.length, tool + ": no page error " + p._err.join("|")); await p.close();
}
// the resolver is asked 0 times when the tool runs on the token (resolverStats), 1 without it: the real handlers given what the page sent
{ const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("[]", { status: 200 });
  const calls = async fn => { const n0 = V.resolverStats.calls; let out, err = null; try { out = await fn(); } catch (e) { err = e; } return { n: V.resolverStats.calls - n0, out, err }; };
  try {
    const H = (await imp("api/sellerDecision.js")).default, S = await imp("lib/live/search.js");
    const run = async (body, query) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(x) { out = x; return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "" }, query: query || {}, body, socket: { remoteAddress: "1.1.1.1" } }, res); return out; };
    for (const [tool, p0, , apiRe] of TOOLS.slice(0, 3)) {
      const p = await open(p0 + qOf(tool, TOKEN)), first = p._api.find(c => apiRe.test(c.u)); await p.close();
      const tok = first && new URL(first.u, "https://x").searchParams.get("car");
      if (tool === "find") { const w = await calls(() => S.parseQueryResolved("2003 mercedes sl500", { car: CT.decodeCar(tok) })), wo = await calls(() => S.parseQueryResolved("2003 mercedes sl500", {})); ok("find: the call the page made, given to the engine, resolves 0 times (1 without the token)", tok === TOKEN && w.n === 0 && wo.n === 1, JSON.stringify([tok === TOKEN, w.n, wo.n])); }
      else if (tool === "mc") { const w = await calls(() => run({ ladderPreview: true, oneBox: true }, { car: tok })), wo = await calls(() => run({ ladderPreview: true, oneBox: true, search: "2003 Mercedes SL500" }, {})); ok("market check: the call the page made, given to sellerDecision, resolves 0 times (1 without the token)", tok === TOKEN && w.n === 0 && wo.n === 1, JSON.stringify([tok === TOKEN, w.n, wo.n, w.err && String(w.err).slice(0, 80)])); }
      else { const w = await calls(() => run({ ladderPreview: true }, { car: tok })), wo = await calls(() => run({ ladderPreview: true, search: "2003 Mercedes SL500" }, {})); ok("sell: the token the page sent, given to sellerDecision, resolves 0 times (1 without it); the page's own first call is api/sellChat, which Lane B did not wire (said in docs/lane-notes.md)", tok === TOKEN && w.n === 0 && wo.n === 1, JSON.stringify([tok === TOKEN, w.n, wo.n, w.err && String(w.err).slice(0, 80)])); }
    }
  } finally { globalThis.fetch = realFetch; } }
// 2 a typed search with no token: the bar comes from car.token in the answer; the first call carried none
for (const [tool, p0, idx, apiRe] of TOOLS.slice(0, 3)) {
  const q = tool === "sell" ? "?car=" + enc("2003 mercedes sl500") + "&state=California&how=unsure&rush=none" : "?q=" + enc("2003 mercedes sl500"), ans = [[new RegExp(apiRe.source), { raw: { car: STAMP }, car: STAMP }]];
  const p = await open(p0 + q, 1440, { answers: ans }), r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.line === LINE && r.pills.length === 4 && r.pills.every((x, i) => x.h === "/preview" + PATHS[i] + "?car=" + enc(TOKEN)) && r.pills[idx].on, tool + ": a typed search shows the bar from car.token in the engine's answer, the pills carry it " + JSON.stringify([r.present, r.line]));
  const first = p._api.find(c => apiRe.test(c.u)); ok(first && !new URL(first.u, "https://x").searchParams.get("car"), tool + ": a typed search sends no token"); await p.close();
}
// 3 the car changes in a tool (mileage, transmission): the next answer's token is the pills' token; calls after an answer carry no old token
{ const p = await open("/preview/find?car=" + enc(TOKEN), 1440, { answers: [[/\/api\/buySearch/, { car: STAMP2 }]] });
  await p.evaluate(() => fetch("/api/buySearch", { method: "POST", body: "{}" }).then(r => r.json())); await new Promise(r => setTimeout(r, 900)); const r = await p.evaluate(BAR);
  ok(r.line === LINE2 && r.pills.every((x, i) => x.h === "/preview" + PATHS[i] + "?car=" + enc(TOKEN2)) && r.change === "/preview/find?change=" + enc(TOKEN2), "a changed car: the bar and every pill take the new car.token from the next answer " + JSON.stringify([r.line, r.pills[0] && r.pills[0].h.slice(-12)]));
  await p.evaluate(() => fetch("/api/buySearch", { method: "POST", body: "{}" })); await new Promise(r => setTimeout(r, 300));
  const last = p._api[p._api.length - 1]; ok(last && !new URL(last.u, "https://x").searchParams.get("car"), "after an answer carries its own token the old one is no longer sent " + JSON.stringify(last && last.u)); await p.close(); }
// 4 a tampered or cut token: no bar, the tool's normal empty input, nothing sent; Sell's plain words work as on main
for (const bad of [TAMPERED, CUT]) for (const [tool, p0, , apiRe] of TOOLS.slice(0, 3)) {
  const p = await open(p0 + qOf(tool, bad)), r = await p.evaluate(BAR), sent = p._api.some(c => /car=v1\./.test(c.u));
  ok((!r.present || !r.shown) && !r.loc.includes("v1.") && !/[?&]q=/.test(r.loc) && !/[?&]car=/.test(r.loc) && !r.inputs.some(v => /sl-?500|mercedes/i.test(v)) && !sent, tool + ": a " + (bad === CUT ? "cut" : "tampered") + " token shows no bar, no search and the normal empty input " + JSON.stringify([r.loc, r.inputs])); await p.close();
}
{ const p = await open("/preview/sell?car=" + enc("2003 mercedes sl500") + "&state=California&how=unsure&rush=none"), r = await p.evaluate(BAR), cfg = await p.evaluate(() => JSON.stringify(window.GAS_CAR_BAR));
  ok(!r.shown && r.loc.startsWith("/preview/sell?car=2003+mercedes+sl500") && JSON.parse(cfg).boot === null && r.h1.replace(/\s+/g, " ") === "2003 mercedes sl500", "Sell opened with ?car=plain words behaves as on main: the words stay in the address, no token, no bar " + JSON.stringify([r.loc, r.h1])); await p.close(); }
// the VIN page: the live page's JSON-LD vehicle, Lane B's encodeCar from it, the same bar
{ const LD = '<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@type": "Vehicle", name: "2003 Mercedes-Benz SL500", vehicleIdentificationNumber: SL.vin, mileageFromOdometer: { "@type": "QuantitativeValue", value: 38400 }, brand: { "@type": "Brand", name: "Mercedes-Benz" }, model: "SL500", vehicleModelDate: "2003" }) + "</script>";
  const vinHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif}.gh{background:#0B3126;color:#fff;height:60px}</style></head><body><header class="gh"><div class="wrap">GoAskSam</div></header><main><h1>2003 Mercedes-Benz SL500</h1></main>' + LD + "</body></html>";
  const vc = CB.vinCarOf(vinHtml), req = { method: "GET", url: "/preview/history/mercedes-benz-sl500/" + SL.vin, headers: { cookie: CREW } }; req.__car = vc;
  const page = CB.carBarFinish(vinHtml, req, "vin");
  ok(vc && vc.line === "2003 Mercedes-Benz SL500 · 38,400 miles · VIN ...4627" && CT.decodeCar(vc.token).vin === SL.vin, "vin: the car is read from the page's own vehicle data and the token is Lane B's (" + (vc && vc.line) + ")");
  const p = await open("/x", 1440, { html: page }), r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.line === vc.line && r.pills.length === 4 && r.pills.every(x => !x.on) && r.pills.every(x => x.h.endsWith("?car=" + enc(vc.token))) && r.change.startsWith("/preview/find?change="), "vin: the bar shows with the car, four outlined pills carrying the same token, Change to Find");
  await p.close();
  ok(CB.carBarFinish(vinHtml, { method: "GET", url: "/", headers: { cookie: "" }, __car: vc }, "vin") === vinHtml && CB.carBarFinish(vinHtml, { method: "GET", url: "/", headers: { cookie: "gas_crew=ok" }, __car: vc }, "vin") === vinHtml, "not crew (no cookie, the old plain cookie): the VIN page is byte for byte what it was");
}
// 5 a visitor: the preview pages are the platform 404 and the bar's script is in no visitor page
for (const [tool, p0] of TOOLS.slice(0, 3)) { const o = await pageOf(p0 + "?car=" + enc(TOKEN), false); ok(o.code === 404 || !/gas-carbar|GAS_CAR_BAR/.test(o.body), tool + ": a visitor's request has no car bar in the page"); }
for (const crew of [false, true]) { const o = await call(CP, "/api/crewPage?page=preview-car-line&car=" + enc(TOKEN), { crew }); ok(o.code === 404 && !/miles/.test(String(o.body)), "the car line door is gone (" + (crew ? "crew" : "visitor") + "): the bar's words come from the answer's car.line, nothing builds them from decoded fields on the page side"); }
ok(STAMP && STAMP.line === LINE && STAMP.short === "2003 SL500" && STAMP2.line === LINE2, "the engine's car.line and car.short are the bar's words: " + JSON.stringify(STAMP && [STAMP.line, STAMP.short]));
// Change fills the landing and clears the session car; the car is kept and Home and the rail say Back to your car
{ const p = await open("/preview/find?car=" + enc(TOKEN)); const kept = await p.evaluate(() => sessionStorage.getItem("gas_car_bar")); ok(!!kept && JSON.parse(kept).token === TOKEN, "the car is kept for the session");
  await p.goto("https://goasksam.com/preview/market-check?q=" + enc("2003 mercedes sl500"), { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1400)); let r = await p.evaluate(BAR);
  const backText = await p.evaluate(() => (document.getElementById("gcb-railback") || {}).textContent || ""), backHref = await p.evaluate(() => (document.getElementById("gcb-railback") || { getAttribute() { return null; } }).getAttribute("href"));
  ok(backText === "Back to your 2003 SL500" && backHref === "/preview/find?car=" + enc(TOKEN) && !r.shown, "the rail shows Back to your 2003 SL500 while a car is live and no bar on a page without a car " + JSON.stringify([backText, backHref && backHref.slice(0, 20)]));
  await p.goto("https://goasksam.com/preview/home", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1200)); r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.back && r.pills.length === 0, "Home shows the Back link and no pills");
  await p.goto("https://goasksam.com/preview/find?car=" + enc(TOKEN), { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1200));
  await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded" }), p.click(".gcb-change")]); await new Promise(r => setTimeout(r, 1500));
  const after = await p.evaluate(() => ({ url: location.pathname + location.search, ss: sessionStorage.getItem("gas_car_bar"), inputs: [...document.querySelectorAll("input,textarea")].map(i => i.value).filter(Boolean), bar: (() => { const s = document.getElementById("gas-carbar"); return !!s && !s.hidden; })(), back: !!document.getElementById("gcb-railback") }));
  ok(after.url === "/preview/find?change=" + enc(TOKEN) && after.ss === null && after.inputs.some(v => v.startsWith(LABEL)) && !after.bar && !after.back, "Change returns to the tool's input with the car filled, the session car cleared, no bar and no Back link " + JSON.stringify(after));
  await p.close(); }
// 6 at 390: nothing overflows sideways, the long line truncates, the pills wrap to their own row
for (const [tool, p0] of TOOLS) { const p = await open(p0 + "?car=" + enc(LONG), 390), r = await p.evaluate(BAR);
  ok(r.shown && r.overflowX <= 0 && r.trunc && r.pills.length === 4 && r.pills[0].top > r.lineBottom, tool + " at 390: no sideways scroll, the car line truncates, the pills sit on their own row " + JSON.stringify([r.overflowX, r.trunc, r.pills[0] && r.pills[0].top, r.lineBottom])); await p.close(); }
{ const p = await open("/preview/find?car=" + enc(TOKEN), 1440), r = await p.evaluate(BAR); ok(r.overflowX <= 0, "at 1440 nothing overflows sideways"); await p.close(); }
await b.close();
console.log(out.join("\n")); console.log("carBarCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
