// PUSH CHECK (Lane C, Oct 2026): before every push, load one Market Check result, one Buy result, one spec page
// and the Sell first step in a real browser, and fail on any 5xx response (page or API call) or any console
// error or uncaught page error, or a page that shows a failure line instead of its result. Production went
// down on Oct 11 from two lane pushes; this is the gate.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/pushCheck.mjs [--base https://goasksam.com]
//
// Market Check and Buy sit behind the launch stage (lib/_launchStage.js), so those two pages send the test stage
// header with the server credential, and only to goasksam's own address (never to fonts or any other host).
// Without PROBE_KEY the gated pages load as the public sees them (a redirect to Sell), which still proves no
// 5xx or console error but not the result itself; the script says so. Exit 0 = all clear, 1 = a failure.
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const HOST = new URL(BASE).host;
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGES = [
  { name: "Market Check result", path: "/market-check?q=" + encodeURIComponent("1995 Porsche 911 Carrera"), gated: true, freshVisitor: true, waitFor: 20000 },
  { name: "Buy result", path: "/buy?q=" + encodeURIComponent("Porsche 911"), gated: true, waitFor: 20000 },
  { name: "Spec page", path: "/cars/porsche/911", gated: false, waitFor: 3000 },
  { name: "Sell first step", path: "/sell", gated: false, waitFor: 3000 }
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let failed = 0;
try {
  for (const pg of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], fivexx = [];
    if (pg.gated && KEY) {
      await page.setRequestInterception(true);
      page.on("request", r => {
        let own = false; try { own = new URL(r.url()).host === HOST; } catch (e) {}
        r.continue(own ? { headers: { ...r.headers(), "x-probe-key": KEY, "x-launch-stage-test": "2" } } : undefined);
      });
    }
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push("page error: " + String(e && e.message || e).slice(0, 200)));
    page.on("response", r => { if (r.status() >= 500) fivexx.push(r.status() + " " + r.url().replace(/[?#].*$/, "")); });
    // Market Check counts distinct cars per visitor per day; open the home page first so this run is its own
    // visitor (the page's first visit beacon issues the visitor id), and one car is one count.
    if (pg.freshVisitor) { await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 2000)); }
    const resp = await page.goto(BASE + pg.path, { waitUntil: "networkidle2", timeout: 60000 }).catch(e => { errors.push("load: " + e.message.slice(0, 200)); return null; });
    await new Promise(r => setTimeout(r, pg.waitFor));
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {});
    const status = resp ? resp.status() : 0, final = page.url().replace(BASE, "");
    const shown = await page.evaluate(() => { const t = s => String(s || "").replace(/\s+/g, " ").trim(); const h = document.querySelector("h1"); return { h1: t(h && h.textContent).slice(0, 70), text: t(document.body && document.body.innerText).length, money: (t(document.body && document.body.innerText).match(/\$\d[\d,]{2,}/g) || []).length }; }).catch(() => ({}));
    // A page that loads but shows a failure line instead of a result is a failure too (Oct 11: Market Check showed
    // "Sam's catching his breath" with no console error and passed).
    const failLine = await page.evaluate(() => { const t = document.body ? document.body.innerText : ""; const m = /catching his breath|having trouble answering|Connection issue|couldn.t finish that one|couldn.t read that just now/i.exec(t); return m ? m[0] : null; }).catch(() => null);
    if (failLine) errors.push(`shows a failure line instead of a result: "${failLine}"`);
    const ok = status > 0 && status < 500 && !fivexx.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${pg.name}  HTTP ${status}  ${final}  h1 "${shown.h1 || ""}", ${shown.text || 0} chars, ${shown.money || 0} dollar figures` + (pg.gated && !KEY ? "  (no PROBE_KEY: public view)" : ""));
    for (const x of fivexx) console.log("      5xx " + x);
    for (const x of errors) console.log("      " + x);
    await page.close();
  }
} finally { await browser.close(); }
console.log(failed ? `${failed} page(s) failed.` : "All four pages clear: no 5xx, no console error.");
process.exit(failed ? 1 : 0);
