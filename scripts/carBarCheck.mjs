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
    ["the car retyped into the target's input", 'else if(C.tool==="tasks"&&C.boot&&C.boot.label)fillInto(C.boot.label,"#tkq,#pq",true)}', 'else if(C.boot&&C.boot.label)fillInto(C.boot.label,"#pq,#q,#ob-input,#tkq",true)}'],
    ["the Tasks landing's request box not filled (only the app's)", 'fillInto(C.boot.label,"#tkq,#pq",true)}', 'fillInto(C.boot.label,"#tkq",true)}'],
    ["a Change on Tasks not filling the landing's box", 'C.tool==="tasks"?"#tkq,#pq":', 'C.tool==="tasks"?"#tkq":'],
    ["the bar not on the live Tasks pages", 'tasks: "tasks", "tasks-mine": "tasks",', 'tasks: "", "tasks-mine": "",'],
    ["the signed in hop to the app dropping the car", 'location.replace(MINE + "?car=', 'location.replace(MINE + "?x='],
    ["the typed request's sign in way back dropping the car", "'return MINE + \"?start=1&car=' + ENC + '\"'", "'return MINE + \"?start=1\"'"],
    ["the token stripped from the Tasks address (the sign in way back loses it)", 'if(C.tool!=="tasks")u.searchParams.delete("car");', 'u.searchParams.delete("car");'],
    ["a sign in redirect not read as an arrival with the car", 'if (!touched && tool === "tasks") {', 'if (false) {'],
    ["the bar for a visitor", "isCrewRequest(req) !== true || ", ""],
    ["the Tasks focus dropped", 'if(focus){i.focus();', 'if(false){i.focus();'],
    ["Change that keeps the session car", 'ch.addEventListener("click",function(){save(null)});', ''],
    ["the line not truncated", ".gcb-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", ".gcb-line{min-width:0;white-space:nowrap;"],
    ["the pills on the line's own row", "@media (max-width:640px){.gcb-in{padding:8px 16px}.gcb-l{flex:1 1 100%}", "@media (max-width:640px){.gcb-in{padding:8px 16px;flex-wrap:nowrap}.gcb-l{flex:1 1 auto}"],
    ["the token not handed to the tool's first API call", "if(pending&&typeof input===", "if(false&&typeof input==="],
    ["the bar not taking car.token from the answer", "function take(c){if(!c||!c.token||", "function take(c){if(true||"],
    ["the old token still sent after an answer has its own", "function take(c){if(!c||!c.token||(car&&car.token===c.token))return;pending=null;", "function take(c){if(!c||!c.token||(car&&car.token===c.token))return;"],
    ["Find's door not knowing ?car= (the rollback page)", "if (!req || !q || isCrewRequest(req) !== true) return null;\n  const car", "return null;\n  const car"],
    ["Find's door open to a visitor", "if (!req || !q || isCrewRequest(req) !== true) return null;\n  const car", "if (!req || !q) return null;\n  const car"],
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
async function open(url, width = 1440, { crew = true, html = null, signed = /^\/preview\/tasks\/mine/.test(url), answers = [], live = null } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = []; p._api = [];
  await p.evaluateOnNewDocument(si => { try { if (!si && !sessionStorage.getItem("__cb_clr")) { localStorage.removeItem("gas_auth_session"); localStorage.removeItem("gas_signin_return"); sessionStorage.setItem("__cb_clr", "1"); } } catch (e) {} try { if (si && !localStorage.getItem("gas_auth_session")) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); } catch (e) {} }, signed);
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="6"/>' });
    if (r.isNavigationRequest()) { if (live && live[u.pathname]) { const o = await call(live[u.pathname], u.pathname + u.search + (u.pathname === "/tasks/mine" && !u.searchParams.get("app") ? (u.search ? "&" : "?") + "app=1" : ""), { crew }); (p._nav = p._nav || []).push(u.pathname + u.search); return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body, headers: o.h["x-design"] ? { "x-design": o.h["x-design"] } : {} }); } if (html != null) return r.respond({ status: 200, contentType: "text/html", body: html }); const o = await pageOf(u.pathname + u.search, crew); if (o) return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body }); return r.respond({ status: 404, body: "" }); }
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
// THE ANSWERS ARE THE REAL HANDLERS' (lane-b-typed-through, Nov 17 2026): the answer for the typed SL500 is read through api/sellerDecision.js (Market Check), api/buySearch.js (Find) and lib/sell/sellFlow.js (Sell) on the test world of scripts/typedThroughCheck.mjs
// (a fake PostgREST with the archive AND the stored answer rows, a stored row included), so an answer that carries no token (the fault found live: a stored row served as written) hides the bar here and turns this red. Before, the answers were recorded STAMPs, which carry a token whatever the handler does.
const REAL = await (async () => {
  const WLD = await import(pathToFileURL(path.join(ROOT, "scripts/_typedThroughWorld.mjs")).href), fetch0 = globalThis.fetch, log0 = console.log, err0 = console.error, envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "OLDCARSDATA_API_KEY"];
  WLD.setEnv(); WLD.install([{ make: "Mercedes-Benz", model: "SL-Class", title: "SL500", year: 2003, price: 22000, n: 40 }]); console.log = () => {}; console.error = () => {};
  const out = {};
  try {
    const mcCall = WLD.caller((await imp("api/sellerDecision.js")).default), buyCall = WLD.caller((await imp("api/buySearch.js")).default), SF = await imp("lib/sell/sellFlow.js");
    await mcCall({ oneBox: true, search: "2003 mercedes sl500" });   // the stored row is there before the car is asked for: the stored path is the one served
    out.mc = (await mcCall({ oneBox: true, search: "2003 mercedes sl500" })).car; out.find = (await buyCall({ q: "2003 mercedes sl500" })).car;
    out.sell = (await SF.buildRange({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, { carText: "2003 mercedes sl500", state: "California", how: "unsure", rush: "none" })).car;
  } catch (e) { out.error = String(e && e.message); } finally { globalThis.fetch = fetch0; console.log = log0; console.error = err0; for (const k of envKeys) delete process.env[k]; }
  return out;
})();
for (const k of ["mc", "find", "sell"]) ok(!!(REAL[k] && REAL[k].token && REAL[k].line && REAL[k].short && CT.decodeCar(REAL[k].token)), k + ": the REAL handler's answer for a typed car carries car.token, car.line and car.short " + JSON.stringify(REAL[k] || REAL.error));
for (const [tool, p0, idx, apiRe] of TOOLS.slice(0, 3)) {
  const q = tool === "sell" ? "?car=" + enc("2003 mercedes sl500") + "&state=California&how=unsure&rush=none" : "?q=" + enc("2003 mercedes sl500"), RC = REAL[tool === "mc" ? "mc" : tool], ans = [[new RegExp(apiRe.source), { raw: { car: RC }, car: RC }]];
  const p = await open(p0 + q, 1440, { answers: ans }), r = await p.evaluate(BAR);
  ok(RC && r.present && r.shown && r.line === RC.line && r.pills.length === 4 && r.pills.every((x, i) => x.h === "/preview" + PATHS[i] + "?car=" + enc(RC.token)) && r.pills[idx].on, tool + ": a typed search shows the bar from car.token in the REAL handler's answer, the pills carry it " + JSON.stringify([r.present, r.line]));
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
  // THE CAR BAR IS PUBLIC (Sam, Nov 17 2026; lib/carBar.js CAR_BAR_PUBLIC): a visitor (no cookie, the old plain cookie) gets the bar on the VIN page with the car's own line and the token
  { const vis = [{ cookie: "" }, { cookie: "gas_crew=ok" }].map(h => CB.carBarFinish(vinHtml, { method: "GET", url: "/", headers: h, __car: vc }, "vin"));
    ok(CB.CAR_BAR_PUBLIC === true && vis.every(h => h !== vinHtml && h.includes('id="gas-carbar"') && h.includes(vc.token) && !/vrs-mod|variantSplit/.test(h)), "a visitor (no cookie, the old plain cookie): the VIN page gets the bar with the car and its token, and no variant rows"); }
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
// 6 THE PAGES AS SERVED LIVE (Lane S, Nov 17 2026). Everything above opens the preview addresses or the rollback handlers (NEW_DESIGN unset). The live site runs NEW_DESIGN=1: the door in each api file picks the page file, and
// /find?car=<token> got the rollback page (the door's route key read ?car= as an unknown query): the empty "What car are you looking for?", no bar. So the five pages are opened here through THEIR OWN live handlers
// (api/buy.js, marketCheck.js, sell.js, tasksPage.js, history.js) with the new design on and the crew cookie, in Chrome: the page is the new design's (X-Design: new), the bar is there with the car's line and four pills carrying the token,
// the page's first API call carries ?car=<token>, and Find ran its search rather than showing the empty page. The VIN page is read from the stubbed archive (scripts/_historyStub.mjs).
{
  process.env.NEW_DESIGN = "1"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const HS = await import(pathToFileURL(path.join(ROOT, "scripts/_historyStub.mjs")).href), realFetch = globalThis.fetch;
  HS.vins.push({ vin: SL.vin, ident: { year: 2003, make: "Mercedes-Benz", model: "SL-Class", family: "SL-Class", slug: "2003-mercedes-benz-sl-class" } });
  globalThis.fetch = async u => /fake\.supabase\.test/.test(String(u)) ? new Response(JSON.stringify(HS.historyRows(String(u)) || []), { status: 200, headers: { "content-type": "application/json" } }) : realFetch(u);
  const LH = { find: (await imp("api/buy.js")).default, mc: (await imp("api/marketCheck.js")).default, sell: (await imp("api/sell.js")).default, tasks: (await imp("api/tasksPage.js")).default, vin: (await imp("api/history.js")).default };
  const VINURL = "/history/2003-mercedes-benz-sl-class/" + SL.vin + "?slug=2003-mercedes-benz-sl-class&vin=" + SL.vin;
  const LIVE_PAGES = [["Find", "find", "/find?car=" + enc(TOKEN), /\/api\/buySearch/, false], ["Market Check", "mc", "/market-check?car=" + enc(TOKEN), /\/api\/sellerDecision/, false],
    ["Sell", "sell", "/sell?car=" + enc(TOKEN) + SELLQ, /\/api\/sellChat/, false], ["Tasks", "tasks", "/tasks/mine?app=1&car=" + enc(TOKEN), /\/api\/tasks/, true], ["VIN page", "vin", VINURL, null, false]];
  for (const [name, k, url, apiRe, signed] of LIVE_PAGES) {
    const served = await call(LH[k], url);
    ok(served.code === 200 && served.h["x-design"] === "new", "live " + name + ": the page as served is the new design's (X-Design: new), not the rollback page :: " + served.code + " " + (served.h["x-design"] || "none"));
    const p = await open(url, 1440, { html: served.body, signed }); const r = await p.evaluate(BAR);
    ok(r.present && r.shown, "live " + name + ": the car bar is on the page");
    if (k === "vin") ok(r.present && /^20\d\d|^2003 Mercedes-Benz SL-Class/.test(r.line || "") && r.pills.length === 4 && r.pills.every(x => /\?car=v1\./.test(x.h)), "live VIN page: the bar shows the page's own car with four pills carrying a token :: " + (r.line || ""));
    else ok(r.present && r.line === LINE && r.pills.length === 4 && r.pills.every(x => x.h.endsWith("?car=" + enc(TOKEN))), "live " + name + ": the bar shows the car's line and the four pills carry the token :: " + (r.line || ""));
    if (apiRe) { const first = p._api.find(c => apiRe.test(c.u)); ok(!!first && hasToken(first), "live " + name + ": the page's first API call carries ?car=<token> :: " + (first ? first.u : "no call made")); }
    await p.close();
  }
  { const served = await call(LH.find, "/find?change=" + enc(TOKEN)); ok(served.h["x-design"] === "new", "live Find: ?change=<token> is the new Find's landing, not the rollback page"); }
  for (const bad of [TAMPERED, CUT]) for (const [name, k, url, apiRe, signed] of LIVE_PAGES.slice(0, 4)) {
    const u = url.replace(enc(TOKEN), enc(bad)), served = await call(LH[k], u), p = await open(u, 1440, { html: served.body, signed }), r = await p.evaluate(BAR), sent = p._api.some(c => /car=v1\./.test(c.u));
    ok(served.h["x-design"] === "new" && (!r.present || !r.shown) && !r.loc.includes("v1.") && !sent, "live " + name + ": a " + (bad === CUT ? "cut" : "tampered") + " token is the new page with no bar, nothing sent and no token left in the address :: " + (served.h["x-design"] || "none") + " " + r.loc); await p.close();
  }
  { const pub = await (async () => { const res = await call(LH.find, "/find?car=" + enc(TOKEN), { crew: false }); return res; })(); ok(pub.h["x-design"] === "new", "live Find: a visitor's ?car= is the new page (the car bar is public)"); ok(/gas-carbar/.test(pub.body) && !/vrs-mod/.test(pub.body), "live Find: a visitor's page has the car bar (and no variant rows module)"); }
  // 7 EVERY PAGE A PILL LANDS ON, AS SERVED LIVE (Lane S, Nov 17 2026). Sam: from Market Check the Tasks pill opened Tasks with the car not in the request box and no bar. The pill opens /tasks?car=<token>, the PUBLIC Tasks page (the new design's request box is #pq, not the app's #tkq,
  // and for a signed in person with Tasks it sends them on to /tasks/mine and dropped the car), while section 6 only opened the app address /tasks/mine?app=1&car= signed in. Here the Tasks pill's own address is opened through the live handler (signed out, signed in with no Tasks, signed in with Tasks,
  // a typed request carried through sign in, the app's own sign in redirect), every step of Sell's flow, and a visitor.
  const LIVEMAP = { "/tasks": LH.tasks, "/tasks/mine": LH.tasks, "/find": LH.find, "/market-check": LH.mc, "/sell": LH.sell };
  const TS = `(() => { const s = document.getElementById("gas-carbar"), v = id => (document.getElementById(id) || {}).value, pills = [...document.querySelectorAll(".gcb-pill")]; return { loc: location.pathname + location.search, bar: !!s && !s.hidden && s.getBoundingClientRect().height > 0, line: (document.querySelector(".gcb-line") || {}).textContent || null, pills: pills.map(x => x.getAttribute("href")), on: pills.filter(x => x.classList.contains("on")).map(x => x.textContent), pq: v("pq"), tkq: v("tkq"), active: document.activeElement && document.activeElement.id }; })()`;
  const settle = ms => new Promise(r => setTimeout(r, ms));
  const barOk = (r, tool) => r.bar && r.line === LINE && r.pills.length === 4 && r.pills.every(h => h.endsWith("?car=" + enc(TOKEN))) && r.on.join() === tool;
  const SUMMARY_NONE = [[/GET \/api\/tasks\?summary=1/, { signedIn: true, count: 0, active: 0 }]], SUMMARY_HAS = [[/GET \/api\/tasks\?summary=1/, { signedIn: true, count: 1, active: 1 }]];
  const T0 = "/tasks?car=" + enc(TOKEN);
  { const p = await open(T0, 1440, { live: LIVEMAP, signed: false }), r = await p.evaluate(TS);
    ok(barOk(r, "Tasks"), "Tasks pill, signed out: the Tasks page shows the car bar with the Tasks pill on and the other three leading back with the same token :: " + JSON.stringify([r.bar, r.line, r.on]));
    ok(r.pq.startsWith(LABEL) && r.active === "pq", "Tasks pill, signed out: the request box holds the car's words and the cursor is in it :: " + JSON.stringify([r.pq, r.active])); ok(!p._err.length, "Tasks pill, signed out: no page error " + p._err.join("|")); await p.close(); }
  { const p = await open(T0, 1440, { live: LIVEMAP, signed: true, answers: SUMMARY_NONE }), r = await p.evaluate(TS);
    ok(barOk(r, "Tasks") && r.pq.startsWith(LABEL) && r.active === "pq", "Tasks pill, signed in with no Tasks: the bar, the car in the request box, the cursor in it :: " + JSON.stringify([r.bar, r.pq, r.active])); await p.close(); }
  { const p = await open(T0, 1440, { live: LIVEMAP, signed: true, answers: SUMMARY_HAS }); await settle(1200); const r = await p.evaluate(TS);
    ok(/^\/tasks\/mine/.test(r.loc) && r.loc.includes("car=" + enc(TOKEN)), "Tasks pill, signed in with Tasks: the person is sent on to the app and the car goes with them :: " + r.loc);
    ok(barOk(r, "Tasks") && r.tkq.startsWith(LABEL) && r.active === "tkq", "Tasks pill, signed in with Tasks: the app shows the bar above the composer, the car in its request box, the cursor in it :: " + JSON.stringify([r.bar, r.tkq, r.active])); await p.close(); }
  { const p = await open(T0, 1440, { live: LIVEMAP, signed: false }); await p.evaluate(LAB => { const i = document.getElementById("pq"); i.value = LAB + " under 40,000 miles"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); }, LABEL); await settle(600);
    const mem = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("gas_signin_return") || "null"); } catch (e) { return null; } });
    ok(!!mem && /car=v1\./.test(mem.path || ""), "Tasks pill, signed out, a typed request: the page remembers where sign in goes back to and it carries the car :: " + JSON.stringify(mem && mem.path && mem.path.slice(0, 90)));
    await p.evaluate(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); authLandAfterSignIn(); }); await settle(1800);
    const r = await p.evaluate(TS);
    ok(/^\/tasks\/mine/.test(r.loc) && barOk(r, "Tasks"), "after sign in the person lands back on the Tasks composer with the car bar still there :: " + JSON.stringify([r.loc.slice(0, 60), r.bar, r.on]));
    ok(r.tkq.startsWith(LABEL) && r.active === "tkq", "after sign in the composer still holds the car and the cursor is in it :: " + JSON.stringify([r.tkq, r.active])); await p.close(); }
  { const p = await open("/tasks/mine?app=1&car=" + enc(TOKEN), 1440, { live: LIVEMAP, signed: false, answers: SUMMARY_HAS }); await settle(900); const r0 = await p.evaluate(TS);
    ok(/^\/tasks\?signin=1/.test(r0.loc) && decodeURIComponent(r0.loc).includes("car=v1."), "Tasks app signed out: sent to sign in with the car in the way back :: " + r0.loc.slice(0, 120));
    ok(barOk(r0, "Tasks") && r0.pq.startsWith(LABEL), "Tasks app signed out: the sign in page the person is sent to shows the bar and the car in its request box :: " + JSON.stringify([r0.bar, r0.pq]));
    await p.click("#acct"); await settle(300); await p.evaluate(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); }); await p.reload({ waitUntil: "domcontentloaded" }); await settle(1800);
    const r = await p.evaluate(TS); ok(/^\/tasks\/mine/.test(r.loc) && barOk(r, "Tasks") && r.tkq.startsWith(LABEL), "Tasks app signed out then signed in (Account button): the person ends on the app with the car bar and the car in the composer :: " + JSON.stringify([r.loc.slice(0, 70), r.bar, r.tkq])); await p.close(); }
  // Change on a Tasks page (the bar's Change link, /tasks?change=<token>): the landing's request box and the app's get the car's words and the cursor
  { const p = await open("/tasks?change=" + enc(TOKEN), 1440, { live: LIVEMAP, signed: false }), r = await p.evaluate(TS);
    ok(r.pq.startsWith(LABEL) && r.active === "pq", "Tasks Change, signed out: the landing's request box holds the car's words and the cursor is in it :: " + JSON.stringify([r.pq, r.active])); await p.close(); }
  { const p = await open("/tasks/mine?app=1&change=" + enc(TOKEN), 1440, { live: LIVEMAP, signed: true }), r = await p.evaluate(TS);
    ok(r.tkq.startsWith(LABEL) && r.active === "tkq", "Tasks Change, in the app: the composer holds the car's words and the cursor is in it :: " + JSON.stringify([r.tkq, r.active])); await p.close(); }
  // the other pages a pill lands on: every step of Sell's flow keeps the bar and the car (the steps are in one document; the address grows)
  { const p = await open("/sell?car=" + enc(TOKEN), 1440, { live: LIVEMAP, signed: false }), seen = [];
    for (let i = 0; i < 4; i++) { seen.push(await p.evaluate(TS)); const c = await p.$(".chip"); if (!c || i === 3) break; await c.click(); await settle(1100); }
    ok(seen.length === 4 && seen.every(s => barOk(s, "Sell")) && new Set(seen.map(s => s.loc)).size === 4, "Sell: the bar and the four pills with the token on every step of the flow (state, how, rush, result) :: " + JSON.stringify(seen.map(s => [s.bar, s.loc.length])));
    ok(p._api.filter(a => /sellChat/.test(a.u)).every(a => /car=v1\./.test(a.u)) && p._api.some(a => /sellChat/.test(a.u)), "Sell: the engine call at the end of the flow carries ?car=<token> :: " + JSON.stringify(p._api.map(a => a.u.slice(0, 40)))); await p.close(); }
  for (const [name, url, tool] of [["Find", "/find?car=" + enc(TOKEN), "Find"], ["Market Check", "/market-check?car=" + enc(TOKEN), "Market Check"]]) { const p = await open(url, 1440, { live: LIVEMAP, signed: false }), r = await p.evaluate(TS); ok(barOk(r, tool), name + " (pill address): the bar with four pills carrying the token :: " + JSON.stringify([r.bar, r.on])); await p.close(); }
  { const pub = await call(LH.tasks, T0, { crew: false }), pub0 = await call(LH.tasks, "/tasks?car=plain", { crew: false });
    ok(/gas-carbar/.test(pub.body) && /GAS_CAR_BAR/.test(pub.body) && /v1\.[A-Za-z0-9_-]{20,}/.test(pub.body) && !/v1\.[A-Za-z0-9_-]{20,}/.test(pub0.body) && !/vrs-mod/.test(pub.body), "a visitor's /tasks?car=<token> carries the bar and the car (the car bar is public); /tasks?car=<anything> carries no car"); }
  { const pub = await call(LH.tasks, "/tasks/mine?app=1&car=" + enc(TOKEN), { crew: false }), pub0 = await call(LH.tasks, "/tasks/mine?app=1", { crew: false }); ok(!/vrs-mod/.test(pub.body) && (pub.body === pub0.body || /gas-carbar/.test(pub.body)), "a visitor's /tasks/mine?app=1&car= is the page without it or the page with the bar, never rows"); }
  globalThis.fetch = realFetch; delete process.env.NEW_DESIGN; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
await b.close();
console.log(out.join("\n")); console.log("carBarCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
