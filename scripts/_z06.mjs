import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "https://goasksam.com";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const OUT = "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1500 });
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERR " + e.message));
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500)); // let the security checkpoint settle
  await page.waitForFunction(() => typeof renderDecision === "function" && document.getElementById("msgs"), { timeout: 25000 }).catch(() => {});
  const out = await page.evaluate(async () => {
    const veh = { year: 2016, make: "Chevrolet", model: "Corvette", trim: "Z06", bodyStyle: "coupe" };
    const res = await fetch("/api/sellerDecision", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ car: { raw: "2016 Chevrolet Corvette Z06 coupe", vehicle: veh, region: "US", state: "California" } }) });
    if (!res.ok) return { httpErr: res.status };
    const d = await res.json();
    window.sellState = window.sellState || {};
    sellState.resolvedVehicle = veh; sellState.region = "US"; sellState.state = "California"; sellState.carName = "2016 Chevrolet Corvette Z06";
    sellState.sellDecision = d;
    renderDecision(d);
    const dec = d.decision || {};
    const rows = [...document.querySelectorAll("#msgs .pcard-mrow")].map(r => (r.textContent || "").replace(/\s+/g, " ").trim());
    return {
      httpOk: true, status: d.status, tier: dec.tier, evidenceBasis: dec.evidenceBasis,
      landed: (d.evidence && d.evidence.ladder && d.evidence.ladder.landed) || null,
      windowDays: d.evidence && d.evidence.windowDays,
      thin: !!dec.thin, classEra: !!dec.classEra,
      cardV2: (typeof cardV2Active === "function") ? cardV2Active() : null,
      metaRows: rows.filter(r => /Analysis|scope|window/i.test(r) || /Corvette/i.test(r))
    };
  });
  console.log("errs:", errs.slice(0, 5));
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: `${OUT}/z06_sell.png`, fullPage: true });
} finally { await browser.close(); }
