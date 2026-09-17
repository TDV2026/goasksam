import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "https://goasksam.com";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const OUT = "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad";
// Real-shaped thin decisions with slug'd receipts.
const daytona = { isThin: true, houseSteer: true, houseN: 4, onlineReceiptsN: 1, onlineN: 1, houseVenues: ["Gooding & Co", "RM Sotheby's", "Broad Arrow"], consignPartner: null,
  receipts: [
    { year: 1973, venue: "Gooding & Co", slug: "gooding", isHouse: true, hammer: 7400000, allIn: 8145000, date: "2024-08-01" },
    { year: 1972, venue: "RM Sotheby's", slug: "rmsothebys", isHouse: true, hammer: 960000, allIn: 1061000, date: "2025-03-01" },
    { year: 1972, venue: "RM Sotheby's", slug: "rmsothebys", isHouse: true, hammer: 780000, allIn: 858000, date: "2024-11-01" },
    { year: 1972, venue: "RM Sotheby's", slug: "rmsothebys", isHouse: true, hammer: 720000, allIn: 792000, date: "2024-05-01" },
    { year: 1970, venue: "Broad Arrow", slug: "broadarrow", isHouse: true, hammer: 789600, allIn: 893700, date: "2025-10-01" },
    { year: 1971, venue: "Bring a Trailer", slug: "bringatrailer", isHouse: false, hammer: 865000, allIn: null, date: "2026-08-08" }
  ] };
const speciale = { isThin: true, houseSteer: false, houseN: 2, onlineReceiptsN: 4, onlineN: 4, houseVenues: ["RM Sotheby's", "Gooding & Co"], consignPartner: null,
  receipts: [
    { year: 2015, venue: "Bring a Trailer", slug: "bringatrailer", isHouse: false, hammer: 1129000, allIn: null, date: "2026-06-01", mileage: 4100 },
    { year: 2015, venue: "Bring a Trailer", slug: "bringatrailer", isHouse: false, hammer: 925000, allIn: null, date: "2025-09-01", mileage: 6200 },
    { year: 2015, venue: "Bring a Trailer", slug: "bringatrailer", isHouse: false, hammer: 752000, allIn: null, date: "2025-03-01", mileage: 945 },
    { year: 2014, venue: "Cars & Bids", slug: "carsandbids", isHouse: false, hammer: 700000, allIn: null, date: "2024-12-01", mileage: 12000 },
    { year: 2015, venue: "RM Sotheby's", slug: "rmsothebys", isHouse: true, hammer: 1350000, allIn: 1490000, date: "2025-08-01" },
    { year: 2015, venue: "Gooding & Co", slug: "gooding", isHouse: true, hammer: 925000, allIn: 1022500, date: "2024-08-01" }
  ] };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const run = async (tag, vehicle, thin) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1600 });
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERR " + e.message));
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
  await page.waitForFunction(() => typeof renderDecision === "function" && document.getElementById("msgs"), { timeout: 20000 }).catch(() => {});
  const res = await page.evaluate((v, t) => {
    try {
      window.sellState = window.sellState || {};
      sellState.resolvedVehicle = v; sellState.region = "US"; sellState.state = "California"; sellState.carName = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
      renderDecision({ decision: { thin: t, routeFit: { routes: [] } }, vehicle: v });
      const cards = [...document.querySelectorAll("#msgs .pcard")].map(c => ({
        badge: (c.querySelector(".pcard-badge") || {}).textContent || "",
        name: (c.querySelector(".pcard-name") || {}).textContent || "",
        script: (c.querySelector(".pcard-script") || {}).textContent || "",
        why: (c.querySelector(".pcard-lead") || {}).textContent || "",
        cta: (c.querySelector(".pcard-cta") || {}).textContent || "",
        ctaOnclick: (c.querySelector(".pcard-cta") || {}).getAttribute ? (c.querySelector(".pcard-cta").getAttribute("onclick") || "") : "",
        reassure: (c.querySelector(".pcard-reassure span") || {}).textContent || ""
      }));
      const bridges = [...document.querySelectorAll("#msgs .pv2-bridge")].map(b => b.textContent);
      return { cards, bridges };
    } catch (e) { return { err: String(e && e.message || e) }; }
  }, vehicle, thin);
  console.log("\n===== /SELL " + tag + " =====");
  if (errs.length) console.log("ERRORS:", errs);
  if (res.err) console.log("RENDER ERR:", res.err);
  (res.cards || []).forEach((c, i) => {
    console.log(` CARD ${i + 1}: [${c.badge.trim()}] ${c.script.trim()} ${c.name.trim()}`);
    console.log(`   why: ${c.why.trim().slice(0, 150)}`);
    console.log(`   cta: "${c.cta.trim()}" -> ${c.ctaOnclick}`);
    if (c.reassure) console.log(`   sub: ${c.reassure.trim().slice(0, 120)}`);
  });
  (res.bridges || []).forEach(b => console.log(" bridge:", b.trim()));
  await page.screenshot({ path: `${OUT}/consign_${tag}.png`, fullPage: true });
  await page.close();
};
try { await run("daytona", { year: 1972, make: "Ferrari", model: "365", trim: "GTB Daytona" }, daytona);
      await run("speciale", { year: 2015, make: "Ferrari", model: "458", trim: "Speciale" }, speciale); }
finally { await browser.close(); }
