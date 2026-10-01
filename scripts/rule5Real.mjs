// RULE 5 REAL-PIPELINE DIFF (checkpoint, no deploy). Pulls the ACTUAL engine pool via the live
// listSales path (real fetchQualifying: model-column, flexPattern, accent/chassis union, year window,
// qualifyReason), applies the restructured rule5PoolGuard, and prints REMOVED vs TAGGED separately.
import puppeteer from "puppeteer-core";
import { buildSpec, rule5PoolGuard } from "../lib/onebox.js";
import { findGeneration } from "../lib/generations.js";

const BASE = process.env.BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// [label, vehicle, {uncovered?, listAllYearGate?}]
const S = [
  ["S65", { make: "Mercedes-Benz", model: "S65" }],
  ["S65 AMG 2010", { make: "Mercedes-Benz", model: "S65", year: 2010 }],
  ["2003 Mercedes-Benz S-Class", { make: "Mercedes-Benz", model: "S-Class", year: 2003 }],
  ["S-Class Coupe (CLS leak test)", { make: "Mercedes-Benz", model: "S-Class", bodyStyle: "coupe" }],
  ["300SL Roadster", { make: "Mercedes-Benz", model: "300SL", trim: "Roadster" }],
  ["E46 M3", { make: "BMW", model: "M3", trim: "E46" }],
  ["E46 M3 CSL", { make: "BMW", model: "M3", trim: "E46 CSL" }],
  ["2016 BMW M3", { make: "BMW", model: "M3", year: 2016 }],
  ["BMW M3 Coupe", { make: "BMW", model: "M3", bodyStyle: "coupe" }],
  ["Ford GT", { make: "Ford", model: "GT" }, { listAllYearGate: true }],
  ["2006 Ford GT", { make: "Ford", model: "GT", year: 2006 }, { yearHisto: true }],
  ["GT40", { make: "Ford", model: "GT40" }],
  ["F355", { make: "Ferrari", model: "355" }, { gearbox: true }],
  ["F355 GTS", { make: "Ferrari", model: "355", trim: "GTS" }],
  ["F355 Spider", { make: "Ferrari", model: "355", trim: "Spider" }],
  ["d50", { make: "Dodge", model: "D50" }],
  ["ram 50", { make: "Dodge", model: "D50" }],
  ["1969 Porsche 911", { make: "Porsche", model: "911", year: 1969 }],
  ["360", { make: "Ferrari", model: "360" }],
  ["F430", { make: "Ferrari", model: "F430" }],
  ["Gallardo", { make: "Lamborghini", model: "Gallardo" }],
  ["V8 Vantage", { make: "Aston Martin", model: "V8 Vantage" }],
  ["Buick Grand National", { make: "Buick", model: "Grand National" }, { uncovered: true }],
  ["1967 Chevrolet Corvette", { make: "Chevrolet", model: "Corvette", year: 1967 }, { uncovered: true }],
  ["1972 Datsun 240Z", { make: "Datsun", model: "240Z", year: 1972 }, { uncovered: true }],
  ["AMC Eagle", { make: "AMC", model: "Eagle" }, { uncovered: true }],
  ["Eagle Talon", { make: "Eagle", model: "Talon" }, { uncovered: true }],
  ["Singer Gazelle", { make: "Singer", model: "Gazelle" }, { uncovered: true }]
];

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE, { waitUntil: "domcontentloaded" });
const usd = n => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

function gbox(title, trans) {
  const t = ((title || "") + " " + (trans || "")).toLowerCase();
  if (/\bf1\b|paddle|automated manual|e-gear|egear|\bsmg\b|\bpdk\b|\bdct\b|tiptronic|sportshift/.test(t)) return "auto/paddle";
  if (/manual|6-?speed|5-?speed|\bgated\b|\bstick\b/.test(t)) return "manual";
  return "unknown";
}

for (const [label, vehicle, opts = {}] of S) {
  try {
    let gen = null;
    try { gen = await Promise.race([findGeneration(vehicle, {}), new Promise(r => setTimeout(() => r(null), 1500))]); } catch (e) {}
    const spec = buildSpec({ ...vehicle, raw: label }, gen, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "));
    const resp = await p.evaluate(async (base, car) => {
      const r = await fetch(base + "/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ priceProbe: true, listSales: true, sinceDays: 1095, car }) });
      return await r.json();
    }, BASE, { vehicle });
    const sales = (resp.listing && resp.listing.sales) || [];
    const rows = sales.map(s => ({ title: s.title, raw_title: s.title, year: s.year, price: s.priceUsd, transmission: s.transmission }));
    const g = rule5PoolGuard(rows, spec);
    const byReason = {}; for (const x of g.removed) byReason[x.reason] = (byReason[x.reason] || 0) + 1;
    const byTag = {}; for (const x of g.tagged) byTag[x.token || x.reason] = (byTag[x.token || x.reason] || 0) + 1;
    const headlinePool = g.kept.filter(r => !r._tag).length;

    console.log("\n================= " + label + (opts.uncovered ? "  [uncovered: expect no-op]" : "") + " =================");
    console.log(`spec: ${spec.make} ${spec.model}${spec.trim ? " " + spec.trim : ""}${spec.genCode ? " [" + spec.genCode + "]" : ""}  win=${spec.yearMin || "-"}..${spec.yearMax || "-"}  | guard applied=${g.applied}`);
    console.log(`REAL pool: ${rows.length}  -> headline-range pool: ${headlinePool}  | REMOVED: ${g.removed.length} ${JSON.stringify(byReason)}  | TAGGED(kept,separate): ${g.tagged.length} ${JSON.stringify(byTag)}  | replica(separate): ${g.replica.length}  | no-year kept: ${g.noYearKept}`);
    if (g.removed.length) { console.log("  removed top5:"); for (const x of g.removed.map(x => x.row).filter(r => r.price > 0).sort((a, z) => z.price - a.price).slice(0, 5)) console.log("    " + usd(x.price) + "  " + String(x.title).slice(0, 66)); }
    if (g.tagged.length) { console.log("  tagged top5:"); for (const x of g.tagged.map(x => x.row).filter(r => r.price > 0).sort((a, z) => z.price - a.price).slice(0, 5)) console.log("    " + usd(x.price) + "  [" + (x._tag) + "]  " + String(x.title).slice(0, 56)); }
    if (opts.uncovered && (g.applied || g.removed.length || g.tagged.length)) console.log("  *** WARNING: expected no-op ***");
    if (opts.yearHisto) { const h = {}; for (const r of g.kept) h[r.year || "?"] = (h[r.year || "?"] || 0) + 1; console.log("  kept by model year: " + JSON.stringify(h)); }
    if (opts.listAllYearGate) { const yg = g.removed.filter(x => x.reason === "year-gate").map(x => x.row).sort((a, z) => (a.year || 0) - (z.year || 0)); console.log("  ALL " + yg.length + " year-gated removed:"); for (const r of yg) console.log("    " + (r.year || "?") + "  " + usd(r.price) + "  " + String(r.title).slice(0, 62)); }
    if (opts.gearbox) { const gb = {}; for (const r of g.kept) { const k = gbox(r.title, r.transmission); gb[k] = (gb[k] || 0) + 1; } console.log("  gearbox split (engine pool, kept): " + JSON.stringify(gb)); }
  } catch (e) { console.log("\n================= " + label + " =====  ERROR: " + e.message); }
}
await b.close();
