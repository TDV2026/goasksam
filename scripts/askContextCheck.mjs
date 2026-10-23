// WHEN SAM ASKS A QUESTION THAT NEEDS TYPING (Sam, Oct 23 2026; Lane C). OFFLINE: Market Check's real page is rendered in-process and loaded in
// Chrome with the engine's answers stubbed (a VIN that does not decode, then a car). Proves: Sam's question clears and focuses the box, the
// placeholder says what the question wants (the engine's answerHint), what was typed first shows as a chip above the box; submitting sends
// the ANSWER as car.raw and the original as car.context (the engine reads both; the page computes nothing); Escape and the chip's close mark
// put the original text back and the next submit is a plain search with no context; voice fills the answer box; a long answer goes through
// whole; a plain new search carries no context. Checked at 1440 and 390.   node scripts/askContextCheck.mjs   (from the repo root; needs Chrome)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
const VIN = "WP0CA2982YU621095", LONG = "It is a 1967 Porsche 911 S coupe in Irish Green with the original engine, a five speed gearbox, restored in 2019, and I would like it read as a coupe and not as a targa please";
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(w) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900, deviceScaleFactor: w < 600 ? 2 : 1, isMobile: w < 600 }); p._posts = [];
  await p.evaluateOnNewDocument(() => { function F() {} F.prototype.start = function () { var t = this; setTimeout(function () { t.onstart && t.onstart(); }, 10); setTimeout(function () { var res = [[{ transcript: "1969 Ford Bronco" }]]; res[0].isFinal = true; t.onresult && t.onresult({ results: res }); setTimeout(function () { t.onend && t.onend(); }, 10); }, 40); }; F.prototype.stop = F.prototype.abort = function () {}; window.SpeechRecognition = window.webkitSpeechRecognition = F; });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
    if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/api/vehicleIdentity") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "needs_clarification", vehicle: { raw: VIN }, clarification: { kind: "vin_decode_failed", question: "That VIN doesn't decode, which usually means a car that wasn't sold new in the US. Tell me the car instead, year, make and model.", answerHint: "Year, make and model", chips: ["Not sure"] } }) });
    if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {} p._posts.push(b.car || {}); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "needs_clarification", clarification: { kind: "missing", question: "What year, make and model are we talking about?", answerHint: "Year, make and model" } }) }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 800)); return p;
}
const state = p => p.evaluate(() => { const i = document.getElementById("ob-input"), c = document.querySelector("[data-ob-ctx] .ob-ctx-t"), m = document.getElementById("ob-mic"); return { v: i ? i.value : null, ph: i ? i.getAttribute("placeholder") : null, focus: !!i && document.activeElement === i, chip: c ? c.textContent : null, mic: !!m && !m.hidden }; });
async function ask(p) { await p.type("#ob-input", VIN); await p.keyboard.press("Enter"); await p.waitForSelector("[data-ob-ctx]", { timeout: 8000 }).catch(() => {}); await new Promise(r => setTimeout(r, 400)); }
try { for (const w of [1440, 390]) {
  { const p = await open(w); await ask(p); const s = await state(p);
    ok(s.v === "" && s.focus && s.ph === "Year, make and model" && s.chip === VIN, `${w}: Sam's question clears and focuses the box, the placeholder says what it wants, the chip shows what was entered (${JSON.stringify(s)})`);
    ok(s.mic, `${w}: the answer box has the microphone`);
    if (process.env.SHOT_DIR) await p.screenshot({ path: `${process.env.SHOT_DIR}/ask-after-${w}.png` });
    await p.type("#ob-input", "2000 Porsche Boxster"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 700));
    const last = p._posts[p._posts.length - 1] || {};
    ok(last.raw === "2000 Porsche Boxster" && last.context === VIN, `${w}: the answer goes with its context (car.raw "${last.raw}", car.context "${last.context}")`);
    await p.close(); }
  { const p = await open(w); await ask(p); await p.keyboard.press("Escape"); await new Promise(r => setTimeout(r, 200)); const s = await state(p);
    ok(s.v === VIN && s.chip === null, `${w}: Escape puts the original text back and drops the chip (${JSON.stringify(s)})`);
    await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 700)); const last = p._posts[p._posts.length - 1];
    ok(!last || last.context === undefined, `${w}: after Escape the next submit is a plain search (no context)`); await p.close(); }
  { const p = await open(w); await ask(p); await p.click("#ob-ctx-x"); await new Promise(r => setTimeout(r, 200)); const s = await state(p);
    ok(s.v === VIN && s.chip === null, `${w}: the chip's close mark restores the original text`); await p.close(); }
  { const p = await open(w); await ask(p); await p.click("#ob-mic"); await new Promise(r => setTimeout(r, 400)); const s = await state(p);
    ok(s.v === "1969 Ford Bronco" && s.chip === VIN, `${w}: voice fills the answer box and the context stays (${s.v})`);
    await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 700)); const last = p._posts[p._posts.length - 1] || {};
    ok(last.raw === "1969 Ford Bronco" && last.context === VIN, `${w}: a voice answer is sent with its context`); await p.close(); }
  { const p = await open(w); await ask(p); await p.type("#ob-input", LONG, { delay: 0 }); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 700)); const last = p._posts[p._posts.length - 1] || {};
    ok(last.raw === LONG && last.context === VIN, `${w}: a long typed answer goes through whole with its context (${(last.raw || "").length} characters)`); await p.close(); }
  { const p = await open(w); await p.type("#ob-input", "1969 Ford Bronco"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 700)); const last = p._posts[p._posts.length - 1] || {};
    ok(last.raw === "1969 Ford Bronco" && last.context === undefined, `${w}: a plain new search carries no context`); await p.close(); }
} } finally { await b.close(); }
console.log(`askContextCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
