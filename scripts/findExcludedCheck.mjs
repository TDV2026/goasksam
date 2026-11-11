// FIND PRINTS WHAT IT LEFT OUT (Lane E, Nov 1 2026; Lane B's lane-b-exclude): "ND Miata not RF", "911 without sunroof", "Mustang non-GT" remove cars, and the engine returns
// excluded[] with its own sentence for each (Left out 3 listings that say RF. / ... though listings often stay silent on it.). The page prints each sentence exactly as sent under the
// header, above the cards, and prints nothing when excluded[] is empty or absent. The class: every Find answer path that carries excluded[] (chat and rerun through meta.excluded, the
// search box through the answer's excluded) prints it, at 1440 and 390, never a count the page made. No network.   node scripts/findExcludedCheck.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString(), ago = h => new Date(now - h * 3600e3).toISOString();
const card = (id, t, extra) => Object.assign({ id, title: t, make: "Porsche", url: "https://auction.test/" + id, source: "Bring a Trailer", sourceSlug: "bringatrailer", photo_url: "https://img.test/" + id + ".jpg", end_time: soon(5.5), current_bid_usd: 40000 + id * 1000, bid_at: ago(0.4), miles: 30000 + id * 1000, location: "King of Prussia, PA", country: "US", chips: ["Manual", "Guards Red"], market: { kind: "range", low: 55000, high: 78000, count: 24, query: "1995 Porsche 911", basisLine: "Based on 24 sales, the latest in October 2026." }, sam_lines: [{ kind: "range", rung: [], placing: "below the range", text: "The middle half of 911 sales landed at $55,000 to $78,000 since December 2025. The bid is below the range." }], timeline: [{ date: "2024-03-12", result: "sold", price: 61000, miles: 29000, house: "Bring a Trailer", url: null }], seen_before: { n: 1 }, history_url: "/vin/ABC", year: 1995 }, extra || {});
const FIX = [card(1, "1995 Porsche 911 Carrera"), card(2, "1996 Porsche 911 Carrera 4", { photo_url: null }), card(3, "1994 Porsche 964 Carrera RS", { market: { kind: "none", query: "x", cardListsSales: true, rows: [{ price: 25500, date: "2026-05-14", mi: 4000, title: "t", image: null }] }, sam_lines: [{ kind: "range", rung: ["964 models"], text: "Not enough sales of this exact car to give a reliable range." }] })];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="432"><rect width="100%" height="100%" fill="#8ab"/></svg>`;
const mod = async (f, url, q) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href); return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; h({ method: "GET", url, query: q || {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); }); };
const findHtml = await mod("buy", "/find");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const L_RF = "Left out 3 listings that say RF.", L_ONE = "Left out 1 listing that says sunroof, though listings often stay silent on it.", L_NONE = "No listing here says RF, so none was left out.";
const EX = (line, key) => ({ key, label: key, removed: 3, partial: false, line });
const SCEN = [
  { name: "one exclusion (chat)", via: "chat", excluded: [EX(L_RF, "not:rf")], say: [L_RF] },
  { name: "two exclusions, one partial (chat)", via: "chat", excluded: [EX(L_RF, "not:rf"), { key: "not:sunroof", label: "sunroof", removed: 1, partial: true, line: L_ONE }], say: [L_RF, L_ONE] },
  { name: "none left out says so (chat)", via: "chat", excluded: [EX(L_NONE, "not:rf")], say: [L_NONE] },
  { name: "empty excluded (chat)", via: "chat", excluded: [], say: [] },
  { name: "no excluded field (chat)", via: "chat", excluded: undefined, say: [] },
];
async function run(width, sc) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 }))); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: findHtml });
    if (u.host === "img.test") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {}
      const J = o => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (body.action === "panel") return J({ market: FIX[0].market, engineAnswer: { cards: [] } });
      if (body.action === "chat" || body.action === "rerun") return J({ reply: "", suggest: [], state: { filters: { make: "Mazda", model: "Miata" } }, turns: 1, meta: { count: 3, live: 3, asks: [], ...(sc.excluded !== undefined ? { excluded: sc.excluded } : {}) }, cards: FIX, searchNote: "" });
      return J(body.action === "list" ? { items: [] } : {}); }
    if ((u.host === "goasksam.com" && /^\/(api|js)/.test(u.pathname))) return r.respond({ status: 200, contentType: /\.js$/.test(u.pathname) ? "application/javascript" : "application/json", body: /\.js$/.test(u.pathname) ? "" : "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/find?q=" + encodeURIComponent("ND Miata not RF") + "&make=Mazda&model=Miata", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
  const out = await p.evaluate(() => ({ lines: [...document.querySelectorAll(".exclm")].map(e => e.innerText.replace(/\s+/g, " ").trim()), cars: document.querySelectorAll("article.car").length, sideways: document.documentElement.scrollWidth > window.innerWidth + 1, order: (() => { const x = document.querySelector(".exclm"), c = document.querySelector("article.car"); return !x || !c ? null : !!(x.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); })() }));
  await p.close(); return { ...out, errs };
}
try {
  for (const width of [1440, 390]) for (const sc of SCEN) {
    const r = await run(width, sc), tag = `${width} ${sc.name}`;
    ok(r.cars > 0, `${tag}: the cars are drawn (${r.cars})`);
    ok(sc.say.length ? sc.say.every(s => r.lines.join(" | ").includes(s)) && r.lines.length === 1 : r.lines.length === 0, `${tag}: ${sc.say.length ? "prints " + JSON.stringify(sc.say) : "prints nothing"}, got ${JSON.stringify(r.lines)}`);
    if (sc.say.length) ok(r.order === true, `${tag}: the line sits above the cards`);
    ok(!r.sideways, `${tag}: no sideways scroll`);
    ok(r.errs.length === 0, `${tag}: no page error (${r.errs[0] || ""})`);
  }
  const fs2 = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
  ok(!/Left out/.test(fs2), "the page never words the line itself: every sentence is the engine's own");
} catch (e) { ok(false, "threw " + e.message); }
{
  const rd = x => fs.readFileSync(new URL("../" + x, import.meta.url), "utf8");
  ok(/excluded: res\.excluded \|\| \[\] \}/.test(rd("lib/live/samChat.js")) && /excluded: \(sr\.excluded \|\| \[\]\)\.map/.test(rd("lib/live/samChat.js")), "the chat path carries the search's excluded[] into meta.excluded");
}
await b.close();
console.log(`findExcludedCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
