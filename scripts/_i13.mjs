import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "https://goasksam.com";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const OUT = "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1600 });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERR " + e.message));
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500));
  await page.waitForFunction(() => typeof renderDecision === "function" && typeof escapeHtml === "function", { timeout: 25000 }).catch(() => {});

  // ITEM 1: full deployed path - resolve then decide then render
  const item1 = await page.evaluate(async () => {
    const vi = await fetch("/api/vehicleIdentity", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ text: "2014 Ferrari 458 Speciale" }) });
    const vid = await vi.json();
    const veh = vid.vehicle || {};
    const res = await fetch("/api/sellerDecision", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ car: { raw: "2014 Ferrari 458 Speciale", vehicle: veh, region: "US", state: "California" } }) });
    if (!res.ok) return { httpErr: res.status };
    const d = await res.json();
    window.sellState = window.sellState || {}; sellState.resolvedVehicle = veh; sellState.region = "US"; sellState.state = "California"; sellState.carName = "2014 Ferrari 458 Speciale";
    document.getElementById("msgs").innerHTML = "";
    renderDecision(d);
    const dec = d.decision || {};
    const cards = [...document.querySelectorAll("#msgs .pcard")].map(c => ({ badge: (c.querySelector(".pcard-badge") || {}).textContent || "", name: (c.querySelector(".pcard-name") || {}).textContent || "", cta: ((c.querySelector(".pcard-cta") || {}).getAttribute ? c.querySelector(".pcard-cta").getAttribute("onclick") : "") || "" }));
    return { resolvedTrim: veh.trim, thin: !!dec.thin, houseSteer: dec.thin && dec.thin.houseSteer, partnerReferralShown: !!(dec.partnerReferral && (dec.partnerReferral.eligible || dec.partnerReferral.secondary)), cards };
  });
  console.log("=== ITEM 1: 2014 Ferrari 458 Speciale ===");
  console.log(JSON.stringify(item1, null, 1));

  // ITEM 3: class-era 450S shell
  const item3 = await page.evaluate(async () => {
    const veh = { year: 1957, make: "Maserati", model: "450S", bodyStyle: "coupe" };
    const res = await fetch("/api/sellerDecision", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ car: { raw: "1957 Maserati 450S", vehicle: veh, region: "US", state: "California" } }) });
    if (!res.ok) return { httpErr: res.status };
    const d = await res.json();
    window.sellState = window.sellState || {}; sellState.resolvedVehicle = veh; sellState.region = "US"; sellState.state = "California"; sellState.carName = "1957 Maserati 450S";
    document.getElementById("msgs").innerHTML = "";
    renderDecision(d);
    const dec = d.decision || {};
    const h1 = document.querySelector("#msgs .pcard-name");
    const h1txt = h1 ? h1.textContent.trim() : null;
    return { classEra: !!dec.classEra, h1: h1txt, h1IsPrice: /^\$/.test(h1txt || ""), script: (document.querySelector("#msgs .pcard-script") || {}).textContent || "", leads: [...document.querySelectorAll("#msgs .pcard-lead")].map(p => p.textContent.trim().slice(0, 90)) };
  });
  console.log("\n=== ITEM 3: 1957 Maserati 450S class-era shell ===");
  console.log(JSON.stringify(item3, null, 1));
  console.log("\npageerrors:", errs.slice(0, 5));
  await page.screenshot({ path: `${OUT}/i13.png`, fullPage: true });
} finally { await browser.close(); }
