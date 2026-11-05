// Renders the two crew previews (/preview/home, /preview/find) through the real crew page handler and saves screenshots at 1440, 1024, 768 and 390 under docs/design/preview/.
// Offline: the handler runs in process, fonts come from public/fonts, every other request is dropped. Usage: node scripts/previewShots.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";   // the fixture secret hiddenCrewCheck mints its cookie with
const { default: handler } = await import("../api/crewPage.js");
const { mintCrewCookieValue } = await import("../lib/_crew.js");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), OUT = path.resolve(process.argv[2] || path.join(ROOT, "docs/design/preview"));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function pageOf(name) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader(k) { delete this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; } };
  await handler({ url: "/api/crewPage?page=" + name, method: "GET", query: { page: name }, headers: { host: "goasksam.com", accept: "text/html", cookie: "gas_crew=" + mintCrewCookieValue() } }, res);
  return res;
}
export async function render(browser, name, width, { full = true } = {}) {
  const r = await pageOf(name); const page = await browser.newPage(); await page.setViewport({ width, height: width > 800 ? 1024 : 844 });
  await page.setRequestInterception(true);
  page.on("request", q => { const u = new URL(q.url()); if (u.host !== "goasksam.com") return q.abort();
    if (q.isNavigationRequest()) return q.respond({ status: 200, contentType: "text/html", body: r.body });
    const f = path.join(ROOT, "public", decodeURIComponent(u.pathname)); if (u.pathname.startsWith("/fonts/") && fs.existsSync(f)) return q.respond({ status: 200, contentType: "font/woff2", body: fs.readFileSync(f) }); return q.respond({ status: 204, body: "" }); });
  await page.goto("https://goasksam.com/" + name.replace("preview-", "preview/"), { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(x => setTimeout(x, 300));
  return { page, html: r.body };
}
if (import.meta.url === "file://" + process.argv[1]) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  for (const name of ["preview-home", "preview-find"]) for (const w of [1440, 1024, 768, 390]) {
    const { page } = await render(browser, name, w); const f = path.join(OUT, `${name.replace("preview-", "")}-${w}.png`);
    await page.screenshot({ path: f, fullPage: true }); const m = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })); console.log(f.replace(ROOT + "/", ""), m.w + "x" + m.h); await page.close();
  }
  await browser.close();
}
