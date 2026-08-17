// Deployed-page verification for One Box. Drives the REAL gated /onebox page in a
// headless browser against production: the tier layouts (3+/2/1/0), the single-result
// invariant (no see-more/pagination), and the sell handoff. Requires a local Chrome
// and the crew cookie. Usage: node scripts/oneboxVerify.js [https://goasksam.com]
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.argv[2] || process.env.OB_BASE || "https://goasksam.com";
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/chromium-browser"
].filter(Boolean).find(p => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome found. Set CHROME_PATH."); process.exit(2); }

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };
const host = new URL(BASE).hostname;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setCookie({ name: "gas_crew", value: "ok", domain: host, path: "/" });

  await page.goto(BASE + "/onebox", { waitUntil: "networkidle2" });
  ok(page.url().endsWith("/onebox"), "gate: crew device stays on /onebox");

  async function search(text) {
    await page.evaluate(() => { document.getElementById("ob-result").innerHTML = ""; document.getElementById("ob-input").value = ""; });
    await page.focus("#ob-input");
    await page.type("#ob-input", text);
    await page.click("#ob-go");
    await page.waitForFunction(() => { const r = document.getElementById("ob-result"); return r && (r.querySelector(".ob-tile") || r.querySelector(".ob-note") || r.querySelector(".ob-read")); }, { timeout: 20000 });
    return page.evaluate(() => {
      const q = s => document.querySelector(s);
      const tiles = [...document.querySelectorAll(".ob-tile")].map(t => ({ rank: t.querySelector(".ob-rank")?.textContent, price: t.querySelector(".ob-price")?.textContent, miles: t.querySelector(".ob-miles")?.textContent }));
      return { n: tiles.length, tiles, stat: q(".ob-stat")?.textContent, sam: q(".ob-read p")?.textContent, cta: !!q(".ob-cta .ob-btn"), chips: [...document.querySelectorAll(".ob-chip")].map(c => c.textContent) };
    });
  }

  let r = await search("1989 911 Carrera Coupe");
  ok(r.n === 3, "3-tier: exactly 3 cards");
  ok(r.tiles.map(t => t.rank).join("|") === "HIGH SALE|MIDDLE OF THE MARKET|LOW SALE", "3-tier: all three labeled");
  ok(/Based on \d+ relevant sales/.test(r.stat || ""), "3-tier: stat line present");
  ok(r.cta && r.tiles.every(t => /\$/.test(t.price) && t.miles), "3-tier: CTA + price/mileage on every card");

  r = await search("1995 Lotus Esprit");
  ok(r.n === 2 && r.tiles.every(t => t.rank === "RECENT SALE"), "2-tier: 2 cards, both RECENT SALE");

  r = await search("1979 AMC Pacer");
  ok(r.n === 0 && /enough comparable sales/.test(r.sam || "") && r.cta, "0-tier: fallback line + CTA, no cards");

  // body follow-up: underspecified body must ask, not mix coupe/targa/cabriolet
  r = await search("1989 porsche 911");
  ok(r.n === 0 && r.chips.length >= 2 && r.chips.some(c => /coupe/i.test(c)) && r.chips.some(c => /targa|cabriolet/i.test(c)), "body follow-up: chips (not mixed cards) for underspecified body");
  await page.evaluate(() => { const b = [...document.querySelectorAll(".ob-chip")].find(x => /coupe/i.test(x.textContent)); if (b) b.click(); });
  await page.waitForFunction(() => document.querySelector(".ob-tile"), { timeout: 20000 });
  const picked = await page.evaluate(() => ({ n: document.querySelectorAll(".ob-tile").length, resolved: document.querySelector(".ob-resolved")?.textContent }));
  ok(picked.n === 3 && /Coupe/.test(picked.resolved || ""), "body follow-up: tapping Coupe yields 3 coupe cards");

  // outlier/underspecified: a trim-varied single-body query does not force three cards
  r = await search("1970 Corvette Coupe");
  ok(r.n === 0 && /vary too much|too varied|honest spread/i.test(r.sam || ""), "outlier guard: L88-class query returns underspecified, not a fake spread");

  await search("1989 911 Carrera Coupe");
  const body = await page.evaluate(() => document.body.innerText.toLowerCase());
  ok(!/see more|show more|see all|view all|load more|see notable/.test(body), "single-result invariant: no see-more anywhere");

  await page.evaluate(() => localStorage.setItem("gas_onebox_prefill", "1972 Datsun 240Z"));
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
  await new Promise(res => setTimeout(res, 3500));
  const handoff = await page.evaluate(() => ({ consumed: localStorage.getItem("gas_onebox_prefill") === null, msgs: (document.getElementById("msgs")?.textContent || "").slice(0, 160) }));
  ok(handoff.consumed && handoff.msgs.length > 0, "handoff: /sell consumed the prefill and advanced");

  console.log(fails === 0 ? "\nALL ONE BOX CHECKS PASSED" : "\n" + fails + " FAILURES");
} finally { await browser.close(); }
process.exit(fails ? 1 : 0);
