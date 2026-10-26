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
await b.close();
console.log(`sellCutoffCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
