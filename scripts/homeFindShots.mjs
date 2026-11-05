// Screenshots and layout measures of /preview/home and /preview/find at 1440, 1024, 768 and 390 (Lane E, Nov 5 2026): offline, the pages as lib/preview/previewPages.js renders them (the fixture history only for the history shots).
//   node scripts/homeFindShots.mjs [outdir]        prints, per page and width: horizontal scroll, text clipped by its own box, overlaps, search/pill/footer alignment facts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { homeHtml, findHtml } = await import(pathToFileURL(path.join(ROOT, "lib/preview/previewPages.js")).href);
const { soldFixture, listedFixture, noTrimFixture, noMileageWordsFixture, NOW } = await import(pathToFileURL(path.join(ROOT, "scripts/featuredHistoryFixture.mjs")).href);
const OUT = path.resolve(process.argv[2] || "docs/design/preview"); fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
import { MEASURE } from "./homeFindMeasure.mjs";
const PAGES = [["home", () => homeHtml(), [1440, 1024, 768, 390]], ["home-history", () => homeHtml({ featuredHistory: soldFixture(), allowData: true, now: NOW }), [1440, 1024, 768, 390]], ["home-history-listed", () => homeHtml({ featuredHistory: listedFixture(), allowData: true, now: NOW }), [1440, 390]], ["home-history-notrim", () => homeHtml({ featuredHistory: noTrimFixture(), allowData: true, now: NOW }), [1440, 390]], ["home-history-nomileage", () => homeHtml({ featuredHistory: noMileageWordsFixture(), allowData: true, now: NOW }), [1440, 390]], ["find", () => findHtml(), [1440, 1024, 768, 390]]];
for (const [name, html, widths] of PAGES) for (const w of widths) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 }); await p.setRequestInterception(true); const body = html();
  p.on("request", r => { const u = new URL(r.url()); if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body }); return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 300));
  const m = await p.evaluate(MEASURE); console.log(name, w, JSON.stringify(m));
  const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewport({ width: w, height: Math.min(h, 6000), deviceScaleFactor: 1 });
  await p.screenshot({ path: path.join(OUT, `${name}-${w}.png`) }); await p.close();
}
await b.close();
