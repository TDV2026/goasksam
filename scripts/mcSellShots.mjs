// BEFORE AND AFTER SCREENSHOTS of the four regression results at 1440, 1024 and 390 (Lane E, Nov 8 2026): the live page, and the same page inside the shared shell, from the same recorded engine answers. Saved in proofs/mcsell/ (full page).
//   node scripts/mcSellShots.mjs
import { open, launch, loadFixtures } from "./mcSellHarness.mjs";
import fs from "node:fs";
const CASES = [["mc-1995-porsche-911", "/market-check?q=1995%20Porsche%20911", "/preview/market-check?q=1995%20Porsche%20911"], ["mc-2020-bmw-m3", "/market-check?q=2020%20BMW%20M3", "/preview/market-check?q=2020%20BMW%20M3"], ["mc-2006-ford-gt", "/market-check?q=2006%20Ford%20GT", "/preview/market-check?q=2006%20Ford%20GT"], ["sell-2004-porsche-911-carrera", "/sell?car=2004%20Porsche%20911%20Carrera&state=California&how=unsure&rush=none", "/preview/sell?car=2004%20Porsche%20911%20Carrera&state=California&how=unsure&rush=none"]];
fs.mkdirSync("proofs/mcsell", { recursive: true }); const b = await launch();
for (const [n, live, prev] of CASES) for (const w of [1440, 1024, 390]) for (const [tag, url] of [["before", live], ["after", prev]]) {
  const p = await open(b, url, { width: w, fixtures: loadFixtures(n), settle: 3000, images: "net" }); await p.waitForFunction(() => !document.querySelector(".stage-pending"), { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: `proofs/mcsell/${n}-${w}-${tag}.png`, fullPage: true }); await p.close(); }
for (const [n, u] of [["entry-mc", "/preview/market-check"], ["entry-sell", "/preview/sell"]]) for (const w of [1440, 1024, 390]) { const p = await open(b, u, { width: w, settle: 1200, images: "net" }); await p.screenshot({ path: `proofs/mcsell/${n}-${w}.png`, fullPage: true }); await p.close(); }
await b.close(); console.log("saved", fs.readdirSync("proofs/mcsell").length);
