// Local screenshots of /whats-new (the seeded file) at 1440 and 390, no network. PNGs go to proofs/whats-new/.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const { whatsNewPageHtml } = await import("../api/whatsNew.js");
fs.mkdirSync("proofs/whats-new", { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
for (const w of [1440, 390]) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 });
  await p.setRequestInterception(true); p.on("request", r => /fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? r.continue() : r.abort());
  await p.setContent(whatsNewPageHtml({ headers: { host: "goasksam.com", cookie: "" } }), { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: "proofs/whats-new/whats-new-" + w + ".png", fullPage: true }); await p.close(); }
await b.close();
