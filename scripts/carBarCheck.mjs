// carBarCheck (Lane S, Nov 2026): the car bar (lib/carBar.js), CREW ONLY, under the header on Find results, Market Check results, Sell results, the Tasks composer and the VIN page.
//   1 the bar renders on the five pages when a car is in the address (the stub token, lib/carToken.js until Lane B's contract posts) and on none without; its line is the car's one line, mileage and VIN only when known
//   2 four pills Find, Market Check, Sell, Tasks, every href carrying the SAME token, the current tool marked (aria-current, filled), the others outlined
//   3 a target opens already run: the car's words reached the tool's own query (the page's heading is the car), nothing is typed into its input; Tasks lands with the car text filled and the focus in the job field
//   4 Change returns to the tool's input with the car filled and clears the session car; the car is kept for the session and Home and the rail show Back to your {car} while it is live
//   5 not crew: the pages are byte for byte what they were; no car: no bar
//   6 at 390 nothing overflows sideways, the long car line truncates, the pills wrap to a second row
// MUTANTS (each must fail): a pill without the token, the bar on an empty page, the car retyped into the target's input, the bar for a visitor, the Tasks focus dropped, Change that keeps the session car, the line not truncated.
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
    ["the car retyped into the target's input", 'else if(C.tool==="tasks"&&C.car&&C.car.text)fillInto(C.car.text,"#tkq",true);', 'else if(C.car&&C.car.text)fillInto(C.car.text,"#pq,#q,#ob-input,#tkq",true);'],
    ["the bar for a visitor", "isCrewRequest(req) !== true || ", ""],
    ["the Tasks focus dropped", 'if(focus){i.focus();', 'if(false){i.focus();'],
    ["Change that keeps the session car", 'ch.addEventListener("click",function(){save(null)});', ''],
    ["the line not truncated", ".gcb-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", ".gcb-line{min-width:0;white-space:nowrap;"],
    ["the pills on the line's own row", "@media (max-width:640px){.gcb-in{padding:8px 16px}.gcb-l{flex:1 1 100%}", "@media (max-width:640px){.gcb-in{padding:8px 16px;flex-wrap:nowrap}.gcb-l{flex:1 1 auto}"]
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
const CP = (await imp("api/crewPage.js")).default, CT = await imp("lib/carToken.js"), CB = await imp("lib/carBar.js");
const CAR = { year: 2003, make: "Mercedes-Benz", model: "SL500", miles: 38400, vin: "WDBSK75F43F014627" }, TOKEN = CT.stubTokenFor(CAR), LINE = "2003 Mercedes-Benz SL500 · 38,400 miles · VIN ...4627", TEXT = "2003 Mercedes-Benz SL500 38,400 miles";
const LONG = CT.stubTokenFor({ year: 1967, make: "Mercedes-Benz", model: "300 SL Gullwing Coupe Alloy Body Competition Package", trim: "Special Order Build", miles: 120400, vin: "198040" + "5500" + "0001" });
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
async function open(url, width = 1440, { crew = true, html = null, signed = /^\/preview\/tasks\/mine/.test(url) } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = [];
  await p.evaluateOnNewDocument(si => { try { if (si && !localStorage.getItem("gas_auth_session")) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); } catch (e) {} }, signed);
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="6"/>' });
    if (r.isNavigationRequest()) { if (html != null) return r.respond({ status: 200, contentType: "text/html", body: html }); const o = await pageOf(u.pathname + u.search, crew); if (o) return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", headers: o.h.location ? { location: o.h.location } : {}, body: o.body }); return r.respond({ status: 404, body: "" }); }
    if (u.pathname === "/preview/tasks/api") { const o = await call(CP, "/api/crewPage?page=preview-tasks-api", { method: "POST", body: r.postData() || "{}" }); return r.respond({ status: o.code, contentType: "application/json", body: o.body || "{}" }); }
    if (u.pathname === "/preview/market-check/onebox.js") { const o = await pageOf(u.pathname); return r.respond({ status: 200, contentType: "application/javascript", body: o ? o.body : "" }); }
    if (/^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\/onebox\.js$/, "/js/onebox.js"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1400)); return p;
}
const BAR = `(() => { const s = document.getElementById("gas-carbar"); if (!s) return { present: false }; const cs = getComputedStyle(s), r = s.getBoundingClientRect(), line = s.querySelector(".gcb-line"), pills = [...s.querySelectorAll(".gcb-pill")], ch = s.querySelector(".gcb-change"), hdr = document.querySelector("header.gh");
  return { present: true, shown: !s.hidden && cs.display !== "none" && r.height > 0, line: line ? line.textContent : null, trunc: line ? line.scrollWidth > line.clientWidth : false, change: ch ? ch.getAttribute("href") : null, pills: pills.map(x => ({ t: x.textContent, h: x.getAttribute("href"), on: x.classList.contains("on"), cur: x.getAttribute("aria-current"), bg: getComputedStyle(x).backgroundColor, top: Math.round(x.getBoundingClientRect().top) })), lineBottom: line ? Math.round(line.getBoundingClientRect().bottom) : 0, below: hdr ? r.top >= hdr.getBoundingClientRect().bottom - 1 : true, overflowX: document.documentElement.scrollWidth - innerWidth, back: !!document.getElementById("gcb-railback") || !!s.querySelector(".gcb-back"), carfill: !!document.querySelector("[data-carfill]"), inputs: [...document.querySelectorAll("input,textarea")].map(i => i.value).filter(Boolean), h1: (document.getElementById("gas-h1") || {}).textContent || "", active: document.activeElement && document.activeElement.id }; })()`;
const NAMES = ["Find", "Market Check", "Sell", "Tasks"], TOOLS = [["find", "/preview/find", 0], ["mc", "/preview/market-check", 1], ["sell", "/preview/sell", 2], ["tasks", "/preview/tasks/mine", 3]];
// 1 to 3: each of the four tools with a car in the address (the pill), none without
for (const [tool, p0, idx] of TOOLS) {
  const p = await open(p0 + "?car=" + encodeURIComponent(TOKEN)), r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.below && r.line === LINE, tool + ": the bar shows under the header with the car's one line (" + JSON.stringify(r.line) + ")");
  ok(r.pills.length === 4 && r.pills.map(x => x.t).join() === NAMES.join(), tool + ": the four pills are the rail's tool names " + JSON.stringify(r.pills.map(x => x.t)));
  ok(r.pills.every(x => x.h === "/preview" + ["/find", "/market-check", "/sell", "/tasks"][r.pills.indexOf(x)] + "?car=" + encodeURIComponent(TOKEN)), tool + ": every pill href is a plain link carrying the same token " + JSON.stringify(r.pills.map(x => x.h)));
  ok(r.pills.filter(x => x.on).length === 1 && r.pills[idx].on && r.pills[idx].cur === "page" && r.pills.every((x, i) => i === idx || (!x.on && x.cur === null)) && r.pills[idx].bg !== r.pills[(idx + 1) % 4].bg, tool + ": the current tool is the one filled pill and marked");
  ok(r.change === "/preview" + ["/find", "/market-check", "/sell", "/tasks"][idx] + "?change=" + encodeURIComponent(TOKEN), tool + ": Change goes back to this tool's input with the car");
  if (tool !== "tasks") { const loc = await p.evaluate(() => location.pathname + location.search), want = tool === "sell" ? "car=" : "q="; ok(loc.startsWith(p0 + "?" + want + encodeURIComponent(TEXT).replace(/%20/g, "+")) && r.h1.replace(/\s+/g, " ") === TEXT.replace(/-/g, " ") && !r.carfill, tool + ": the target opened already run (its own address carries the car's words) and nothing was typed into its input " + JSON.stringify([loc, r.h1, r.inputs])); }
  else ok(r.inputs.some(v => v.startsWith(TEXT)) && r.active === "tkq", "tasks: the composer opens with the car text filled and the focus in the job field " + JSON.stringify([r.inputs, r.active]));
  ok(!p._err.length, tool + ": no page error " + p._err.join("|")); await p.close();
  const e = await open(tool === "tasks" ? p0 : p0 + "?" + (tool === "sell" ? "car" : "q") + "=" + encodeURIComponent("2003 mercedes sl500")), q = await e.evaluate(BAR);
  ok(!q.present || !q.shown, tool + ": no car, no bar"); await e.close();
}
// the VIN page: the live page's JSON-LD vehicle, the stub token made from it, the same bar
{ const LD = '<script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@type": "Vehicle", name: "2003 Mercedes-Benz SL500", vehicleIdentificationNumber: CAR.vin, mileageFromOdometer: { "@type": "QuantitativeValue", value: 38400 }, brand: { "@type": "Brand", name: "Mercedes-Benz" }, model: "SL500", vehicleModelDate: "2003" }) + "</script>";
  const vinHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif}.gh{background:#0B3126;color:#fff;height:60px}</style></head><body><header class="gh"><div class="wrap">GoAskSam</div></header><main><h1>2003 Mercedes-Benz SL500</h1></main>' + LD + "</body></html>";
  const vc = CB.vinCarOf(vinHtml), req = { method: "GET", url: "/preview/history/mercedes-benz-sl500/" + CAR.vin, headers: { cookie: CREW } }; req.__car = vc;
  const page = CB.carBarFinish(vinHtml, req, "vin");
  ok(vc && vc.line === LINE, "vin: the car is read from the page's own vehicle data (" + (vc && vc.line) + ")");
  const p = await open("/x", 1440, { html: page }), r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.line === LINE && r.pills.length === 4 && r.pills.every(x => !x.on) && r.pills.every(x => x.h.endsWith("?car=" + encodeURIComponent(vc.token))) && r.change.startsWith("/preview/find?change="), "vin: the bar shows with the car, four outlined pills carrying the same token, Change to Find " + JSON.stringify([r.present, r.shown, r.line === LINE, r.pills && r.pills.length, r.pills && r.pills.map(x => x.on), r.change && r.change.slice(0, 20), r.pills && r.pills[0].h.slice(-12), vc.token.slice(-12)]));
  await p.close();
  ok(CB.carBarFinish(vinHtml, { method: "GET", url: "/", headers: { cookie: "" }, __car: vc }, "vin") === vinHtml && CB.carBarFinish(vinHtml, { method: "GET", url: "/", headers: { cookie: "gas_crew=ok" }, __car: vc }, "vin") === vinHtml, "not crew (no cookie, the old plain cookie): the VIN page is byte for byte what it was");
}
// 5 not crew: every page answers a visitor the page it always did; with the crew look removed the bar is not in the text
for (const [tool, p0] of TOOLS.slice(0, 3)) { const o = await pageOf(p0 + "?car=" + encodeURIComponent(TOKEN), false); ok(o.code === 404 || !/gas-carbar|GAS_CAR_BAR/.test(o.body), tool + ": a visitor's request has no car bar in the page"); }
// 4 Change fills the input and clears the session car; the car is kept and Home and the rail say Back to your car
{ const p = await open("/preview/find?car=" + encodeURIComponent(TOKEN)); const kept = await p.evaluate(() => sessionStorage.getItem("gas_car_bar")); ok(!!kept && JSON.parse(kept).token === TOKEN, "the car is kept for the session");
  await p.goto("https://goasksam.com/preview/market-check?q=" + encodeURIComponent("2003 mercedes sl500"), { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1400)); let r = await p.evaluate(BAR);
  const backText = await p.evaluate(() => (document.getElementById("gcb-railback") || {}).textContent || ""), backHref = await p.evaluate(() => (document.getElementById("gcb-railback") || { getAttribute() { return null; } }).getAttribute("href"));
  ok(backText === "Back to your 2003 SL500" && backHref === "/preview/find?car=" + encodeURIComponent(TOKEN) && !r.shown, "the rail shows Back to your 2003 SL500 while a car is live and no bar on a page without a car");
  await p.goto("https://goasksam.com/preview/home", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1200)); r = await p.evaluate(BAR);
  ok(r.present && r.shown && r.back && r.pills.length === 0, "Home shows the Back link and no pills");
  await p.goto("https://goasksam.com/preview/find?car=" + encodeURIComponent(TOKEN), { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1200));
  await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded" }), p.click(".gcb-change")]); await new Promise(r => setTimeout(r, 1400));
  const after = await p.evaluate(() => ({ url: location.pathname + location.search, ss: sessionStorage.getItem("gas_car_bar"), inputs: [...document.querySelectorAll("input,textarea")].map(i => i.value).filter(Boolean), active: document.activeElement && document.activeElement.id, bar: (() => { const s = document.getElementById("gas-carbar"); return !!s && !s.hidden; })(), back: !!document.getElementById("gcb-railback") }));
  ok(after.url === "/preview/find?change=" + encodeURIComponent(TOKEN) && after.ss === null && after.inputs.some(v => v.startsWith(TEXT)) && !after.bar && !after.back, "Change returns to the tool's input with the car filled, the session car cleared, no bar and no Back link " + JSON.stringify(after));
  await p.close(); }
// 6 at 390: nothing overflows sideways, the long line truncates, the pills wrap to a second row
for (const [tool, p0] of TOOLS) { const p = await open(p0 + "?car=" + encodeURIComponent(LONG), 390), r = await p.evaluate(BAR);
  ok(r.shown && r.overflowX <= 0 && r.trunc && r.pills.length === 4 && r.pills[0].top > r.lineBottom, tool + " at 390: no sideways scroll, the car line truncates, the pills sit on their own row " + JSON.stringify([r.overflowX, r.trunc, r.pills[0] && r.pills[0].top, r.lineBottom])); await p.close(); }
{ const p = await open("/preview/find?car=" + encodeURIComponent(TOKEN), 1440), r = await p.evaluate(BAR); ok(r.overflowX <= 0, "at 1440 nothing overflows sideways"); await p.close(); }
await b.close();
console.log(out.join("\n")); console.log("carBarCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
