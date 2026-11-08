// RECORD THE ENGINE'S ANSWERS FOR THE REGRESSION CARS (Lane E, Nov 8 2026): opens each named car on the LIVE page once, sends the page's own engine calls to production with the probe key (Keychain, x-ops-key header, never printed or written) and stores the answers in scripts/fixtures/mcSell/<name>.json, so before and after are read from the same answers and the check runs offline.
//   node scripts/mcSellRecord.mjs mc-1995-porsche-911 [more names]      (one production read each; do not run during another lane's push lock)
import { open, launch, probeKey, bypassKey, saveFixtures, loadFixtures } from "./mcSellHarness.mjs";
const CARS = { "mc-1995-porsche-911": "/market-check?q=1995%20Porsche%20911", "mc-2020-bmw-m3": "/market-check?q=2020%20BMW%20M3", "mc-2006-ford-gt": "/market-check?q=2006%20Ford%20GT" };
const key = probeKey(); if (!key) { console.log("no probe key in the Keychain"); process.exit(1); }
const b = await launch();
for (const name of process.argv.slice(2)) { const fx = loadFixtures(name), p = await open(b, CARS[name], { fixtures: fx, record: { key, bypass: bypassKey() }, settle: 14000 });
  const n = Object.keys(fx).length, t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ").slice(0, 160)); console.log(name, "calls stored:", n, "|", t); saveFixtures(name, fx); await p.close(); }
await b.close();
