import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "https://goasksam.com";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const OUT = "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad";
const cars = [{ q: "1966 Ferrari 275 GTB", tag: "275" }, { q: "1972 Ferrari 365 GTB/4 Daytona coupe", tag: "day" }, { q: "458 Speciale coupe", tag: "spec" }];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  for (const car of cars) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1600 });
    const errs = [];
    page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    page.on("pageerror", e => errs.push("PAGEERR " + e.message));
    await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
    await page.goto(BASE + "/onebox?lint=1", { waitUntil: "networkidle2" });
    await page.waitForSelector("#ob-input", { timeout: 15000 });
    await page.type("#ob-input", car.q);
    await page.click("#ob-go");
    await page.waitForFunction(() => document.querySelector(".livetake") || document.querySelector(".chips.htintake"), { timeout: 40000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    // if intake present (Daytona), skip to see result
    if (await page.$(".chips.htintake [data-htskip]")) { await page.click(".chips.htintake [data-htskip]"); await new Promise(r => setTimeout(r, 1300)); }
    const s = await page.evaluate(() => {
      const g = x => { const e = document.querySelector(x); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
      const a = document.querySelector(".htc-cta");
      return { kick: g(".htc-kick"), name: g(".htc-name"), why: g(".htc-why"), ctaText: a ? a.textContent.trim() : null, ctaHref: a ? a.getAttribute("href") : null, sub: g(".htc-sub") };
    });
    console.log("\n===== " + car.q + " =====");
    if (errs.length) console.log("ERRORS:", errs);
    if (!s.name) { console.log("  (no consign door rendered)"); }
    else {
      console.log("  " + s.kick + " -> " + s.name);
      console.log("  why:", (s.why || "").slice(0, 140));
      console.log("  CTA:", s.ctaText, "->", s.ctaHref);
      console.log("  sub:", (s.sub || "").slice(0, 120));
    }
    await page.screenshot({ path: `${OUT}/obconsign_${car.tag}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
