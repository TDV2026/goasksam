// The crew pill counts on live Find for the given searches (Lane C's method, Nov 20 2026: the crew page's four pills): Chrome, the crew cookie (Keychain goasksam-crew) and the protection bypass header
// (Keychain goasksam-bypass), both in process and never printed. Prints counts only; no card, seller or listing text is read or printed.
//   node scripts/crewPillCounts.mjs "1987 Porsche 911" "1965 Ford Mustang"
import { execFileSync } from "node:child_process"; import fs from "node:fs"; import { createRequire } from "node:module"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = n => execFileSync("security", ["find-generic-password", "-s", n, "-w"], { encoding: "utf8" }).trim();
const crew = key("goasksam-crew").replace(/^gas_crew=/, "").split(";")[0], bypass = key("goasksam-bypass");
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  for (const q of process.argv.slice(2)) {
    const p = await b.newPage(); await p.setExtraHTTPHeaders({ "x-vercel-protection-bypass": bypass }); await p.setCookie({ name: "gas_crew", value: crew, domain: "goasksam.com", path: "/", secure: true });
    await p.goto("https://goasksam.com/find?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded" });
    try { await p.waitForSelector(".msg.results[data-done]", { timeout: 40000 }); await p.waitForSelector(".fs-pill", { timeout: 10000 }); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    const o = await p.evaluate(() => { const pills = [...document.querySelectorAll(".fs-pill")].map(x => x.textContent.replace(/\s+/g, " ").trim()); const cards = n => document.querySelectorAll('.fs-sec[data-fs="' + n + '"] article.car').length; return { pills, firstBatch: { dealers: (window.__x = 0, cards("dealers")), classifieds: cards("classifieds") }, showMore: !!document.querySelector("[data-fs-more]") }; });
    fs.writeSync(1, q + ": " + o.pills.join(" | ") + " (Show more on the page now: " + o.showMore + ")\n"); await p.close();
  }
} finally { await b.close(); }
