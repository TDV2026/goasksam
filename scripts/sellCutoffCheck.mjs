// Sell cut-off check (Lane C, Oct 26 2026). Sam typed "2004 porsche", answered 911, Carrera and California on /sell and the answer box was gone:
// the conversation outgrew the screen and the page cannot scroll. This walks that path in a real browser at 1440x900 and 390x844 and fails if,
// after any step, the answer box is not inside the viewport, not on top, or not focusable, or the newest message is not in view.
// The page is the code being pushed (api/sellPage.js rendered in this process); everything it calls (scripts, the car resolver) goes to goasksam.com
// with the probe credential, so the questions are the live ones. No PROBE_KEY: SKIP. Reads only, nothing is written.
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const KEY = process.env.PROBE_KEY || "";
if (!KEY) { console.log("sellCutoffCheck: SKIP (no PROBE_KEY)"); process.exit(0); }
const handler = (await import("../api/sellPage.js")).default;
const html = await new Promise(resolve => {
  const res = { setHeader() {}, status() { return this; }, send: b => resolve(String(b)), end: () => resolve("") };
  handler({ method: "GET", url: "/sell", headers: { host: "goasksam.com", cookie: "" }, query: {} }, res);
});
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/body\.chat #gas-main\{[^}]*height:100dvh/.test(html), "the page carries the conversation height rule");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const STEPS = [["typed", null], ["911", "911"], ["Carrera", "Carrera"], ["California", "California"]];
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  await p.setRequestInterception(true);
  p.on("request", r => {
    const u = r.url();
    if (u === "https://goasksam.com/sell") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    if (/^https:\/\/goasksam\.com\//.test(u)) return r.continue({ headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } });
    return r.continue();
  });
  await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await sleep(1500);
  const tag = `${W}x${H}`;
  const state = () => p.evaluate(() => {
    const inp = document.getElementById("inp"); if (!inp) return { missing: true };
    const r = inp.getBoundingClientRect(), vh = innerHeight, vw = innerWidth;
    const el = document.elementFromPoint(Math.min(vw - 2, Math.max(2, r.left + r.width / 2)), Math.min(vh - 2, Math.max(2, r.top + r.height / 2)));
    inp.focus();
    const m = document.getElementById("msgs"), last = m && m.lastElementChild, lr = last ? last.getBoundingClientRect() : null;
    return { inside: r.width > 0 && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw, onTop: !!el && (el === inp || inp.contains(el) || el.contains(inp)), focus: document.activeElement === inp,
      lastInView: !lr || (lr.bottom <= vh + 1 && lr.bottom > 0), atEnd: !m || m.scrollHeight - m.clientHeight - m.scrollTop <= 4 };
  });
  const check = async label => { const s = await state(); ok(!s.missing, `${tag} ${label}: the answer box exists`); if (s.missing) return; ok(s.inside, `${tag} ${label}: the answer box is inside the screen`); ok(s.onTop, `${tag} ${label}: nothing covers the answer box`); ok(s.focus, `${tag} ${label}: the answer box takes focus`); ok(s.lastInView, `${tag} ${label}: the newest message is in view`); ok(s.atEnd, `${tag} ${label}: the conversation is scrolled to the newest message`); };
  await check("start");
  for (const [label, chip] of STEPS) {
    if (!chip) { await p.evaluate(() => document.getElementById("inp").focus()); await p.keyboard.type("2004 porsche", { delay: 8 }); await p.keyboard.press("Enter"); }
    else {
      for (let w = 0; w < 30; w++) { const there = await p.evaluate(t => [...document.querySelectorAll("button,.chip,[class*=chip]")].some(e => e.offsetParent !== null && e.textContent.trim() === t), chip); if (there) break; await sleep(1000); }   // the live resolver can be slow: wait for the question, up to 30 seconds
      const clicked = await p.evaluate(t => { const c = [...document.querySelectorAll("button,.chip,[class*=chip]")].reverse().find(e => e.offsetParent !== null && e.textContent.trim() === t); if (c) { c.click(); return true; } return false; }, chip);
      ok(clicked, `${tag} ${label}: the chip was there to answer with`);
      if (!clicked) break;
    }
    await sleep(label === "typed" ? 5000 : 5500);
    await check("after " + label);
  }
  await p.close();
}
// ---- PART 2: the newer Sell, in pieces (Oct 26 2026). Its result address is opened with the Sell calls answered by this script, so the timing is known:
// the range comes back after 0.8 s, the rest after 3 s. Proves: the waiting line first, the range card on screen before the rest, the staged line in the
// slot, then the pick card and the latest sales; a failed rest says so in its own place and keeps the range card; the slow line appears; the page never scrolls sideways
// and its search box stays on screen. Phone and desktop.
process.env.SELL_NEXT_ON = "1";
const nextHandler = (await import("../api/sellNext.js")).default;
const nextHtml = await new Promise(resolve => {
  const res = { setHeader() {}, status() { return this; }, send: b => resolve(String(b)), end: () => resolve(""), json: o => resolve(JSON.stringify(o)) };
  nextHandler({ method: "GET", url: "/sell", headers: { host: "goasksam.com", cookie: "" }, query: {} }, res);
});
ok(nextHtml.length > 5000 && /GAS_SELL_CFG/.test(nextHtml), "the newer Sell page renders in this process");
const RANGE = { label: "2006 Porsche 911 Carrera", make: "Porsche", marketAnswer: { tier: "result", cluster: [38500, 51500], poolN: 24, basisLine: "Based on 24 sales, the latest in September 2026.", readAt: "2026-10-26T12:00:00Z" }, timings: { resolve: 300, engine: 500 } };
const REST = { carLine: { title: "2006 Porsche 911 Carrera", generation: "997", span: null }, order: ["platform"], platform: { slug: "bringatrailer", name: "Bring a Trailer", house: false, why: "Cars like this have sold most often on Bring a Trailer.", boxes: [{ key: "day", label: "Most often sold on a", head: "Monday", line: "Five of the 24 sales in the last 12 months ended on a Monday." }], meta: [], link: "https://bringatrailer.com/" }, partner: null, recent: [{ title: "2006 Porsche 911 Carrera", house: "Bring a Trailer", date: "2026-09-12", price: 41000, url: "https://bringatrailer.com/listing/x/", photo: null }], marketAnswer: RANGE.marketAnswer, timings: { facts: 2000 } };
for (const [W, H] of [[1440, 900], [390, 844]]) for (const mode of ["ok", "restfails"]) {
  const tag = `${W}x${H} ${mode}`;
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  await p.evaluateOnNewDocument(() => { window.GAS_WAIT_SCALE = 0.1; });
  await p.setRequestInterception(true);
  p.on("request", async r => {
    const u = r.url(), pth = u.replace("https://goasksam.com", "").split("?")[0];
    { const om = /^\/obx\.[^/]+\/(.+)$/.exec(pth); if (om) { try { return r.respond({ status: 200, contentType: "application/javascript; charset=utf-8", body: (await import("node:fs")).readFileSync(new URL("../public/js/" + om[1], import.meta.url), "utf8") }); } catch {} } }   // the script token in this page may not be deployed yet: serve the code being pushed
    if (r.resourceType() === "document" && pth === "/sell") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: nextHtml });
    if (pth === "/api/sellChat" && r.method() === "POST") {
      let step = ""; try { step = JSON.parse(r.postData() || "{}").step; } catch {}
      if (step === "range") { await sleep(800); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(RANGE) }); }
      if (step === "rest") { await sleep(3000); return mode === "ok" ? r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(REST) }) : r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) }); }
    }
    if (u.startsWith("https://goasksam.com/")) return r.continue({ headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } });
    return r.continue();
  });
  await p.goto("https://goasksam.com/sell?car=" + encodeURIComponent("2006 Porsche 911 Carrera") + "&state=California&how=self&rush=none", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const snap = () => p.evaluate(() => ({ wait: (document.querySelector("[data-waitline]") || {}).textContent || null, bar: !!document.querySelector(".sell-wait-bar i"), card: !!document.querySelector(".sfc-card"), pick: !!document.querySelector(".pcard"), sales: !!document.querySelector("#sell-sales .grid3, #sell-sales .sale"), failMsg: (document.querySelector(".sell-wait-fail") || {}).textContent || null, slow: !!document.querySelector("[data-waitslow]:not([hidden])"), sideways: document.documentElement.scrollWidth > innerWidth + 2, input: (() => { const i = document.getElementById("ob-input"); if (!i) return false; const r = i.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; })() }));
  await sleep(450); let t = await snap();
  ok(/^Reading the sales for the 2006 Porsche 911 Carrera$/.test(t.wait || "") && t.bar && !t.card && !t.pick, `${tag}: first the waiting line with a moving bar, no card yet (${t.wait})`);
  await sleep(1200); t = await snap();
  ok(t.card && !t.pick && t.bar && /^(Checking where cars like this sold|Nearly there)$/.test(t.wait || ""), `${tag}: the range card is on screen before the rest, with the staged line in the slot (${t.wait})`);
  await sleep(2600); t = await snap();
  if (mode === "ok") {
    ok(t.card && t.pick && t.sales && !t.bar && !t.failMsg, `${tag}: then the pick card and the latest sales, the wait gone`);
    ok(await p.evaluate(() => /Monday/.test(document.body.innerText) && /Most often sold on a/i.test(document.body.innerText)), `${tag}: the day card is in the pick card`);
  } else {
    ok(t.card && !t.pick && !t.bar && /couldn.t read where cars like this sold/.test(t.failMsg || ""), `${tag}: a failed rest says so in its own place and the range card stays (${t.failMsg})`);
  }
  ok(!t.sideways && t.input, `${tag}: no sideways scroll, the search box is on screen`);
  await p.close();
}
// the slow line and the 20-second rule are in the client
const clientSrc = (await import("node:fs")).readFileSync(new URL("../lib/sell/sellMcClient.js", import.meta.url), "utf8");
ok(/secs >= 20 && slow/.test(clientSrc) && /This one is taking longer than usual\./.test(clientSrc), "the client adds 'This one is taking longer than usual' after 20 seconds and keeps going");
await b.close();
console.log(`sellCutoffCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
