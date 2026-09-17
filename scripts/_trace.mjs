import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "https://goasksam.com";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500));
  const out = await page.evaluate(async () => {
    const trace = async (raw) => {
      const vi = await (await fetch("/api/vehicleIdentity", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ text: raw }) })).json();
      const veh = vi.vehicle || {};
      const res = await fetch("/api/sellerDecision", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ car: { raw, vehicle: veh, region: "US", state: "California" } }) });
      if (!res.ok) return { raw, httpErr: res.status };
      const d = await res.json(); const dec = d.decision || {};
      return { raw, resolved: { model: veh.model, trim: veh.trim, body: veh.bodyStyle },
        tier: dec.tier, evidenceBasis: dec.evidenceBasis,
        thin: dec.thin ? { isThin: dec.thin.isThin, houseSteer: dec.thin.houseSteer, onlineN: dec.thin.onlineN, onlineReceiptsN: dec.thin.onlineReceiptsN, houseN: dec.thin.houseN, totalN: dec.thin.totalN } : null,
        classEra: dec.classEra ? { era: dec.classEra.era, totalN: dec.classEra.totalN } : null };
    };
    return { speciale: await trace("2014 Ferrari 458 Speciale"), maserati: await trace("1957 Maserati 450S") };
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); }
