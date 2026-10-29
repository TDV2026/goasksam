// PNGs of the 1986 Porsche 911 Carrera "All comparable sales" after "Show more sales" is clicked, desktop and phone. node scripts/showMoreShots.mjs <before|after>
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
const tag = process.argv[2] || "after", b = await startBrowser();
for (const w of [1440, 390]) { const p = await openMC(b, MC["1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"], w);
  await p.evaluate(() => { const x = document.querySelector(".allsales-showall"); if (x) x.click(); });
  await p.evaluate(() => { const e = document.querySelector(".allsales-table"); const t = [...document.querySelectorAll(".allsales-table tbody")].pop(); const r = t && t.lastElementChild; (r || e).scrollIntoView({ block: "end" }); }); await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: `docs/screens/launch/show-more-${tag}-${w}.png` }); await p.close(); }
await b.close();
