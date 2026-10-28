// before/after PNGs of the palette removal: the Market Check page as the crew with nothing stored (the bar showed), and with palette H stored (a browser that had clicked it). E98_ROOT picks the tree (the old head for "before").   node scripts/e98PaletteShots.mjs <outdir> <prefix>
import { MC } from "./e98Fixtures.mjs";
import { startBrowser, openMC } from "./e98Render.mjs";
const out = process.argv[2], pre = process.argv[3], b = await startBrowser(), fx = MC["2001 BMW M3 (alike with options)"];
for (const [name, opts] of [["crew-nothing-stored", { crew: true }], ["crew-palette-H-stored", { crew: true, storage: { "gas-pal": "h" } }], ["public-palette-H-stored", { storage: { "gas-pal": "h" } }]]) for (const w of [390, 1440]) {
  const p = await openMC(b, fx, w, opts); await p.screenshot({ path: `${out}/${pre}-${name}-${w}.png` }); console.log(`${out}/${pre}-${name}-${w}.png`); await p.close(); }
await b.close();
