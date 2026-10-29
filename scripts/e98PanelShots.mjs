import { startBrowser } from "./e98Render.mjs";
import { openPanel } from "./e98PanelRender.mjs";
const out = process.argv[2], b = await startBrowser();
for (const w of [390, 1440]) { const p = await openPanel(b, w), el = await p.$(".mcdrawer"); if (el) { await el.screenshot({ path: `${out}/find-see-the-sales-panel-${w}.png` }); console.log(`${out}/find-see-the-sales-panel-${w}.png`); } await p.close(); }
await b.close();
