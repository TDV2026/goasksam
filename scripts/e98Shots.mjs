import { MC } from "./e98Fixtures.mjs";
import { startBrowser, openMC } from "./e98Render.mjs";
const out = process.argv[2] || "docs/screens/e98", only = process.argv[3];
const b = await startBrowser();
for (const [name, fx] of Object.entries(MC)) { if (only && !name.includes(only)) continue; for (const w of [1440, 390]) {
  const p = await openMC(b, fx, w), f = `${out}/mc-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${w}.png`;
  await p.screenshot({ path: f, fullPage: true }); console.log(f); await p.close(); } }
await b.close();
