// holdZeroCheck (Lane G, Oct 28 2026): the launch holding page in a REAL browser, before, at and after zero. Class: every state of the holding page
// (lib/_hold.js holdingHtml, the one page every held route answers) must show a calm line, never a negative number, a blank, or a dead clock, and a reader who
// arrived before the seal lifted must reach the open site without reloading. A local server stands in for goasksam.com: "/" answers the real holding page with
// 503 while sealed, then the "open" answer once the test lifts the seal. The browser clock is moved past zero with a Date override; the poll delay is
// shortened (the page's own 15 to 25 seconds) so the check does not wait. No network, no key. Screenshots go to proofs/ at 390 and 1440.
import http from "node:http"; import fs from "node:fs"; import puppeteer from "puppeteer-core";
const hold = await import("../lib/_hold.js"), launchT = await import("../lib/launchTime.js");
import { FAKE_NOW, FAKE_LAUNCH_ISO } from "./_fakeClock.mjs";
// A fixed fake clock, never the real one: the server side passes explicit times to holdingHtml and the browser clock is set with a Date override, so this check gives the
// same answer at 5 AM, at 9 AM and next week. LAUNCH_AT is a made-up value (two hours after the fake now); no real launch date is written here.
process.env.LAUNCH_AT = FAKE_LAUNCH_ISO;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const AT = launchT.launchAtMs();
// static: the time, the words, the after-zero page
ok(AT === FAKE_NOW + 2 * 3600000, "LAUNCH_AT reads as the exact moment it names (two hours after the fake now)");
const late = hold.holdingHtml(AT + 5000);
ok(/Opening now/.test(late) && !/id="clock"/.test(late) && /Something big is coming/.test(late), "rendered after zero: the same headline and 'Opening now', no clock");
ok(/location\.replace\("\/"\)/.test(late) && /redirect:"manual"/.test(late), "the page asks the home page and goes there once it is not held (every state carries the poll)");
let sealed = true, hits = 0;
const srv = http.createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/") { hits++; if (sealed) { res.writeHead(503, { "content-type": "text/html" }); return res.end(hold.holdingHtml(AT - 5 * 60 * 1000)); } res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>Home</title><h1 id=home>Open site</h1>"); }
  if (u === "/zero") { res.writeHead(503, { "content-type": "text/html" }); return res.end(hold.holdingHtml(AT + 5000)); }
  if (u === "/unset") { res.writeHead(503, { "content-type": "text/html" }); return res.end(hold.holdingHtml(AT - 5 * 60 * 1000, 0)); }
  if (u === "/sell") { res.writeHead(503, { "content-type": "text/html" }); return res.end(hold.holdingHtml(AT - 5 * 60 * 1000)); }
  res.writeHead(404).end();
});
await new Promise(r => srv.listen(0, r)); const base = "http://127.0.0.1:" + srv.address().port;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
fs.mkdirSync("proofs", { recursive: true });
const text = p => p.evaluate(() => document.body.innerText);
async function open(url, width, nowMs) {
  const p = await b.newPage(); await p.setViewport({ width, height: width < 500 ? 844 : 900 });
  await p.evaluateOnNewDocument((n) => { const real = Date.now.bind(Date), off = n - real(); Date.now = () => real() + off;
    const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms >= 15000 ? 150 : ms, ...a); }, nowMs ?? null);
  await p.goto(base + url, { waitUntil: "domcontentloaded" }); return p;
}
for (const w of [390, 1440]) {
  // before zero (6:55 AM): the clock counts down, nothing negative, no overflow
  let p = await open("/sell", w, AT - 5 * 60 * 1000); await new Promise(r => setTimeout(r, 1300));
  let t = await text(p); ok(/04\s*\n?\s*MINUTES|MINUTES/i.test(t) && !/-\d/.test(t), w + ": before zero the countdown shows and no number is negative");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), w + ": no horizontal overflow before zero");
  await p.screenshot({ path: `proofs/hold-before-${w}.png` }); await p.close();
  // clock moved past zero on a sealed page: a calm line, same look, no clock, no negative, not blank
  p = await open("/sell", w, AT + 7000); await new Promise(r => setTimeout(r, 1300));
  t = await text(p);
  ok(/Opening now/.test(t) && /Something big is coming/.test(t), w + ": past zero (clock moved) it says 'Opening now' under the same headline");
  ok(!/-\d/.test(t) && !(await p.$("#clock")) && t.trim().length > 20, w + ": past zero no negative number, no leftover clock, not blank");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), w + ": no horizontal overflow past zero");
  await p.screenshot({ path: `proofs/hold-zero-${w}.png` });
  // still sealed: it keeps asking quietly and stays put
  const before = hits; await new Promise(r => setTimeout(r, 900));
  ok(hits > before && new URL(p.url()).pathname === "/sell", w + ": while sealed it keeps asking the home page and does not move");
  // the seal is lifted: the reader reaches the home page with no reload from the test
  sealed = false; await p.waitForSelector("#home", { timeout: 5000 }).catch(() => {});
  ok(new URL(p.url()).pathname === "/" && !!(await p.$("#home")), w + ": once the seal is lifted the open page is reached without a reload");
  sealed = true; await p.close();
}
// the server-rendered after-zero page (a reader who arrives at 7:01)
{ const p = await open("/zero", 390, AT + 5000); await new Promise(r => setTimeout(r, 400)); const t = await text(p); ok(/Opening now/.test(t) && !(await p.$("#clock")), "arriving after zero: 'Opening now', no clock"); sealed = false; await p.waitForSelector("#home", { timeout: 5000 }).catch(() => {}); ok(!!(await p.$("#home")), "arriving after zero: reaches the open site when the seal is lifted"); sealed = true; await p.close(); }
// NO TIME SET, in a real browser: it says opening soon, shows no time and no clock, never 'Opening now' (not at the old zero, not with the clock far in the future), and still goes home once the seal lifts
for (const w of [390, 1440]) for (const at of [FAKE_NOW, AT + 7000, AT + 400 * 86400000]) {
  const p = await open("/unset", w, at); await new Promise(r => setTimeout(r, 1300)); const t = await text(p);
  ok(/GoAskSam is opening soon/.test(t) && /Something big is coming/.test(t) && !/Opening now|AM|PM|Pacific|October|Thursday|\d{2}:\d{2}/.test(t) && !(await p.$("#clock")), w + ": no time set (clock " + (at === FAKE_NOW ? "now" : at > AT + 86400000 ? "far ahead" : "past the old zero") + "): opening soon, no time, no clock, no 'Opening now'");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), w + ": no time set: no horizontal overflow");
  if (at === FAKE_NOW) await p.screenshot({ path: `proofs/hold-soon-${w}.png` });
  if (at === FAKE_NOW) { sealed = false; await p.waitForSelector("#home", { timeout: 5000 }).catch(() => {}); ok(new URL(p.url()).pathname === "/" && !!(await p.$("#home")), w + ": no time set: once the seal is lifted it still reaches the open page"); sealed = true; }
  await p.close();
}
await b.close(); srv.close();
console.log(`holdZeroCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
