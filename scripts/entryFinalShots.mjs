// Screenshots of the three final entry pages at 1440, 1024 and 390 from the fixture fields: node scripts/entryFinalShots.mjs  (writes proofs/entryfinal/)
import { launch, imp } from "./deskV3Harness.mjs";
import fs from "node:fs";
const PP = await imp("lib/preview/previewPages.js"), MS = await imp("lib/preview/mcSellPreview.js"), F = await imp("scripts/entryFinalFixture.mjs");
const pages = { find: PP.findHtml({ examples: F.findField(), now: Date.parse("2026-11-09T12:00:00Z"), allowData: true }), "market-check": MS.entryHtml("mc", { mcCard: F.mcField() }), sell: MS.entryHtml("sell", { sellCard: F.sellField() }) };
const b = await launch(); fs.mkdirSync("proofs/entryfinal", { recursive: true });
for (const [n, h] of Object.entries(pages)) for (const w of [1440, 1024, 390]) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setContent(h, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 300)); await p.screenshot({ path: `proofs/entryfinal/${n}-${w}.png`, fullPage: true }); await p.close(); }
await b.close(); console.log("done");
