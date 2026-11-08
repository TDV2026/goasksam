// Screenshots of /preview/desk (Lane E, Nov 5 2026) at 1440, 1024, 768 and 390 into docs/design/preview. Offline: the page is lib/preview/deskPreview.js, answered in-process by the real sheet actions; no network.
//   node scripts/deskPreviewShots.mjs [outdir]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { renderDeskPreview, previewDeskApi, resetPreviewStore } = await import(pathToFileURL(path.join(ROOT, "lib/preview/deskPreview.js")).href);
const OUT = path.resolve(process.argv[2] || "docs/design/preview"); fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function open(width, mode) {
  const page = await b.newPage(); await page.setViewport({ width, height: 900, deviceScaleFactor: 1 }); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.evaluateOnNewDocument(m => { try { sessionStorage.setItem("desk_mode", m); } catch (e) {} }, mode);
  await page.setRequestInterception(true);
  page.on("request", async r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: renderDeskPreview() });
    const m = /^\/dsk\.[^/]+\/([\w.-]+\.js)$/.exec(u.pathname); if (u.host === "goasksam.com" && m) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, "public/js", m[1]), "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/preview/desk/api" && r.method() === "POST") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(await previewDeskApi(body)) }); }
    return r.respond({ status: 204, body: "" }); });
  await page.goto("https://goasksam.com/preview/desk-valuations", { waitUntil: "networkidle2" }).catch(() => {}); await wait(500); page._errs = errs; return page;
}
const click = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
const typeIn = async (p, sel, text) => { await p.evaluate(s => { const e = document.querySelector(s); e.focus(); e.select(); }, sel); await p.keyboard.type(text); await wait(350); };
const settle = p => p.evaluate(() => window.__deskVals.settled());
// the page scrolls inside its own panes, so the viewport is made as tall as the content: the sticky top bar and rail then sit where they do on screen
const shot = async (p, name, w) => { await wait(300); const h = await p.evaluate(() => Math.max(innerHeight, ...[...document.querySelectorAll(".vals,.body,.rail,.main")].map(e => e.scrollHeight)) + 60); await p.setViewport({ width: w, height: Math.min(h, 7000), deviceScaleFactor: 1 }); await wait(250); await p.screenshot({ path: path.join(OUT, `desk-${name}-${w}.png`) }); };
const SCREENS = {
  async queue(p) { /* the rail and the empty state */ },
  async sheet(p) {   // the M3: tier 3, a range inside the market range, photos, checks, ready to finalise
    await click(p, '[data-open="pv_m3"]'); await wait(700); await click(p, "[data-confirm]"); await settle(p); await click(p, '[data-tier="3"]'); await settle(p); await wait(300);
    await click(p, '[data-photo="p1"]'); await settle(p); await click(p, '[data-hero="p1"]'); await settle(p);
    for (const k of ["[data-chk][data-state=\"Seen\"]"]) { const n = await p.evaluate(s => document.querySelectorAll(s).length, k); for (let i = 0; i < Math.min(n, 3); i++) { await p.evaluate((s, i) => document.querySelectorAll(s)[i].click(), k, i); await settle(p); } }
    await click(p, '[data-dmode="range"]'); await settle(p); await typeIn(p, '[data-k="d-low"]', "25000"); await typeIn(p, '[data-k="d-high"]', "27500"); await settle(p);
    await typeIn(p, '[data-k="d-note"]', "Thank you for sending the car. The range follows the sales of cars in the same condition."); await settle(p);
  },
  async thin(p) {   // the M3 at Tier 1: too few sales, no starting figure, a figure outside the range asks for reasons
    await click(p, '[data-open="pv_m3"]'); await wait(700); await click(p, '[data-tier="1"]'); await settle(p); await wait(300);
    await click(p, '[data-dmode="reserve"]'); await settle(p); await typeIn(p, '[data-k="d-reserve"]', "52000"); await settle(p);
  },
  async finalised(p) { await click(p, '[data-open="pv_fin"]'); await wait(900); },
  async unread(p) { await click(p, '[data-open="pv_none"]'); await wait(700); },
};
for (const w of [1440, 1024, 768, 390]) {
  for (const [name, fn] of Object.entries(SCREENS)) { resetPreviewStore(); const p = await open(w, "vals"); await fn(p); await shot(p, name, w); if (p._errs.length) console.log("PAGE ERRORS", name, w, p._errs.join(" | ")); await p.close(); }
  resetPreviewStore(); let p = await open(w, "analyst"); await shot(p, "analyst-empty", w);
  await p.evaluate(() => { document.getElementById("q").value = "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"; document.getElementById("go").click(); });
  await p.waitForFunction(() => { const o = document.getElementById("out"); return o && (o.querySelector("table.answer") || o.querySelector(".msg")); }, { timeout: 20000 }).catch(() => {}); await wait(900);
  await shot(p, "analyst-answer", w); if (p._errs.length) console.log("PAGE ERRORS analyst", w, p._errs.join(" | ")); await p.close();
}
await b.close(); console.log("shots in", OUT);
