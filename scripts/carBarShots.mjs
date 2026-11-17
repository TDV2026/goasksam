// SCREENSHOTS OF THE CAR BAR (Lane S, Nov 2026) on Find, Market Check and Sell results at 1440 and 390, from the recorded engine answers, no network: docs/demo-run/car-bar-{find,market-check,sell}-{1440,390}.png
//   node scripts/carBarShots.mjs     (the stub token: lib/carToken.js, until Lane B's car.token contract posts)
import fs from "node:fs"; import path from "node:path";
import { open as hopen, launch, loadFixtures, ROOT, puppeteer, CHROME, CREW } from "./mcSellHarness.mjs";
import { stubTokenFor } from "../lib/carToken.js";
const OUT = path.join(ROOT, "docs/demo-run"); fs.mkdirSync(OUT, { recursive: true });
const b = await launch();
const MC = stubTokenFor({ year: 2020, make: "BMW", model: "M3", miles: 21500, vin: "WBS8M9C50L5R12345" }), SELL = stubTokenFor({ year: 2004, make: "Porsche", model: "911 Carrera", miles: 48200, vin: "WP0AA2995XS626785" });
const shots = [
  ["market-check", "mc-2020-bmw-m3", "/preview/market-check?q=" + encodeURIComponent("2020 BMW M3") + "&ct=" + encodeURIComponent(MC)],
  ["sell", "sell-2004-porsche-911-carrera", "/preview/sell?car=" + encodeURIComponent("2004 Porsche 911 Carrera") + "&state=California&how=unsure&rush=none&ct=" + encodeURIComponent(SELL)]
];
for (const [name, fx, url] of shots) for (const w of [1440, 390]) {
  const p = await hopen(b, url, { width: w, fixtures: loadFixtures(fx), settle: 3000, images: "net" }); await p.waitForFunction(() => !document.querySelector(".stage-pending"), { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: path.join(OUT, `car-bar-${name}-${w}.png`) }); await p.close();
}
// Find: the stored Find answer (the 2005 SL65 AMG search) streamed back the way findResultsCheck does
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/findSl65Search.json"), "utf8")), { freshenEndTimes } = await import("./_pinEndTimes.mjs"); freshenEndTimes(FIX, Date.now());
const DONE = JSON.stringify({ reply: "", turns: 1, state: { filters: { year_min: 2005, year_max: 2005, make: "Mercedes-Benz", model: "SL-Class", trim: "SL65 AMG" } }, meta: Object.fromEntries(Object.entries(FIX).filter(([k]) => k !== "cards")), cards: FIX.cards }), SSE = "event: done\ndata: " + DONE + "\n\n";
const FD = stubTokenFor({ year: 2005, make: "Mercedes-Benz", model: "SL65 AMG", miles: 31200 });
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>', STATIC = { ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const CP = (await import("../api/crewPage.js")).default;
async function html(url) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, json(o) { this.body = JSON.stringify(o); return this; }, end() {} }; const u = new URL(url, "https://goasksam.com"), q = new URLSearchParams(u.search); q.set("page", "preview-find"); const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await CP({ method: "GET", url: u.pathname + "?" + q, query: Object.fromEntries(q), headers: { cookie: CREW, host: "goasksam.com" }, socket: {} }, res); } finally { console.log = log; console.error = err; } return res.body; }
const FURL = "/preview/find?q=" + encodeURIComponent("2005 mercedes-benz sl65 amg") + "&ct=" + encodeURIComponent(FD), page = await html(FURL);
for (const w of [1440, 390]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (u.host !== "goasksam.com") return r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.respond({ status: 200, body: "" });
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: page });
    if (m === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (/buySearch$/.test(u.pathname) && m === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {} if (a.action === "parse") return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ label: "2005 Mercedes-Benz SL65 AMG", chips: [] }) }); if (a.action === "chat" || a.action === "rerun") return r.respond({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: SSE }); return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: [] }) }); }
    if (/^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + FURL, { waitUntil: "domcontentloaded" }); await p.waitForSelector("article.car", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: path.join(OUT, `car-bar-find-${w}.png`) }); await p.close();
}
await b.close(); console.log("saved", fs.readdirSync(OUT).filter(f => /^car-bar/.test(f)).join(" "));
