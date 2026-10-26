// MARKET CHECK'S WAITING STATE (Lane C, Oct 26 2026): lines that advance while the answer is out ("Pulling the real sales for the {car}", "Sorting out which
// ones count", "Nearly there"), "This one is taking longer than usual" after 20 seconds, and a failed answer says so in place. The page is rendered in this
// process; the engine call is answered by this script so the timing is known (the clock runs at one tenth speed). Phone and desktop. No PROBE_KEY: SKIP.
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const KEY = process.env.PROBE_KEY || "";
if (!KEY) { console.log("marketWaitCheck: SKIP (no PROBE_KEY)"); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const handler = (await import("../api/marketCheck.js")).default;
const html = await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return this; }, send: b => resolve(String(b)), end: () => resolve(""), json: o => resolve(JSON.stringify(o)), writeHead() { return this; }, write() {} };
  Promise.resolve(handler({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => resolve("")); setTimeout(() => resolve(""), 20000); });
ok(html.length > 5000, "the Market Check page renders in this process");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
for (const [W, H] of [[1440, 900], [390, 844]]) for (const mode of ["wait", "fail"]) {
  const tag = `${W}x${H} ${mode}`;
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  await p.evaluateOnNewDocument(() => { window.GAS_WAIT_SCALE = 0.1; });
  await p.setRequestInterception(true);
  p.on("request", async r => {
    const u = r.url(), pth = u.replace("https://goasksam.com", "").split("?")[0];
    { const om = /^\/obx\.[^/]+\/(.+)$/.exec(pth); if (om) { try { return r.respond({ status: 200, contentType: "application/javascript; charset=utf-8", body: (await import("node:fs")).readFileSync(new URL("../public/js/" + om[1], import.meta.url), "utf8") }); } catch {} } }   // the script token in this page may not be deployed yet: serve the code being pushed
    if (r.resourceType() === "document" && pth === "/market-check") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    if (pth === "/api/sellerDecision" && r.method() === "POST") { await sleep(mode === "wait" ? 4000 : 1500); return r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) }); }
    if (u.startsWith("https://goasksam.com/")) return r.continue({ headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } });
    return r.continue();
  });
  await p.goto("https://goasksam.com/market-check?q=" + encodeURIComponent("2006 Porsche 911"), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const snap = () => p.evaluate(() => ({ line: (document.querySelector(".loader .ltext") || {}).textContent || null, dots: !!document.querySelector(".loader .ldots"), slow: !!document.querySelector(".lslow:not([hidden])"), text: document.body.innerText }));
  let t = null; const seen = new Set();
  for (let i = 0; i < 40; i++) { t = await snap(); if (t.line) seen.add(t.line); if (t.slow) seen.add("<slow>"); await sleep(150); if (mode === "fail" && i > 14) break; if (mode === "wait" && i > 25) break; }
  ok([...seen].some(l => /^Pulling the real sales for the 2006 Porsche 911$/.test(l)), `${tag}: the first line names the car (${[...seen].join(" | ")})`);
  if (mode === "wait") {
    ok(seen.has("Sorting out which ones count") && seen.has("Nearly there"), `${tag}: the lines advance (${[...seen].join(" | ")})`);
    ok(seen.has("<slow>"), `${tag}: after the 20 second mark (scaled) the slow line is added and the wait goes on`);
  } else {
    await sleep(800); t = await snap();
    ok(!t.dots && /Sam .*(busy|trouble|couldn.t|try again)|try again|moment/i.test(t.text), `${tag}: a failed answer says so in place, no dots left (${t.line})`);
  }
  await p.close();
}
await b.close();
console.log(`marketWaitCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
