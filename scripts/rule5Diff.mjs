// RULE 5 POOL DIFF (checkpoint, no deploy). For each scenario: resolve live, build the spec locally,
// fetch the current pool via the read-only archiveQuery API, apply rule5PoolGuard, and print the diff:
// before/after counts, removed-by-reason, top-5 removed by price, replica split, no-year kept, added.
import puppeteer from "puppeteer-core";
import { buildSpec, archiveScope, rule5PoolGuard } from "../lib/onebox.js";
import { findGeneration } from "../lib/generations.js";
import { resolveVehicle } from "../lib/vehicle.js";

const BASE = process.env.BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SINCE36 = new Date(Date.now() - 1095 * 864e5).toISOString().slice(0, 10);

// query, and (for uncovered tests) expectNoop:true
const SCEN = [
  ["S65"], ["S65 AMG 2010"], ["2003 Mercedes-Benz S-Class"], ["300SL Roadster"],
  ["E46 M3"], ["E46 M3 CSL"], ["BMW M3 Coupe"], ["2016 BMW M3"],
  ["Ford GT"], ["2006 Ford GT"], ["GT40"], ["F355"], ["F355 GTS"], ["F355 Spider"], ["d50"],
  ["2015 Chevrolet Corvette Z06"], ["Jaguar E-Type"], ["1969 Porsche 911"],
  ["Buick Grand National", true], ["1967 Chevrolet Corvette", true], ["1972 Datsun 240Z", true],
  ["AMC Eagle", true], ["Eagle Talon", true], ["Singer Gazelle", true]
];

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 120000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE, { waitUntil: "domcontentloaded" });

const api = (path, body) => p.evaluate(async (path, body) => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return await r.json();
}, BASE + path, body);

const usd = n => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

for (const [q, expectNoop] of SCEN) {
  try {
    // Resolve LOCALLY first (picks up the undeployed GT40/D50/E-Type aliases + collision fixes);
    // fall back to the live resolver for DB-backed models the local curated path can't resolve.
    let v = {};
    try { const lr = await Promise.race([resolveVehicle(q, {}), new Promise(r => setTimeout(() => r(null), 4000))]); if (lr && lr.vehicle && lr.vehicle.make && lr.vehicle.model) v = lr.vehicle; } catch (e) {}
    if (!v.make || !v.model) { const vi = await api("/api/vehicleIdentity", { text: q }); v = vi.vehicle || v; }
    const vehicle = { make: v.make, model: v.model, trim: v.trim, year: v.year, bodyStyle: v.bodyStyle, raw: q };
    let gen = null;
    try { gen = await Promise.race([findGeneration(vehicle, {}), new Promise(r => setTimeout(() => r(null), 1500))]); } catch (e) {}
    const spec = buildSpec(vehicle, gen, q);
    const scope = archiveScope(spec);
    const term = scope.byTitle || scope.byModel || spec.model;
    const poolBody = { archiveQuery: "pool", term, make: spec.make, dateFrom: SINCE36 };
    if (spec.yearMin) poolBody.yearMin = spec.yearMin;
    if (spec.yearMax) poolBody.yearMax = spec.yearMax;
    const pool = await api("/api/sellerDecision", poolBody);
    const rows = (pool.rows || []).map(r => ({ ...r, raw_title: r.title }));
    const g = rule5PoolGuard(rows, spec);

    const byReason = {};
    for (const x of g.removed) byReason[x.reason] = (byReason[x.reason] || 0) + 1;
    const top5 = g.removed.map(x => x.row).filter(r => Number(r.price) > 0).sort((a, z) => z.price - a.price).slice(0, 5);

    console.log("\n================= " + q + (expectNoop ? "  [uncovered: expect no-op]" : "") + " =================");
    console.log(`resolved: ${spec.make} ${spec.model}${spec.trim ? " " + spec.trim : ""}${spec.genCode ? " [" + spec.genCode + "]" : ""}  year=${spec.year || "-"}  window=${spec.yearMin || "-"}..${spec.yearMax || "-"}  term="${term}"`);
    console.log(`guard applied: ${g.applied}`);
    console.log(`pool BEFORE: ${rows.length}   AFTER: ${g.kept.length}   removed: ${g.removed.length}   replica-pool: ${g.replica.length}   no-year kept: ${g.noYearKept}   added: 0`);
    console.log(`removed by reason: ${JSON.stringify(byReason)}`);
    if (top5.length) { console.log("top removed (by price):"); for (const r of top5) console.log("   " + usd(r.price) + "  " + String(r.title || "").slice(0, 70)); }
    if (g.replica.length) { console.log("replica pool sample:"); for (const r of g.replica.slice(0, 4)) console.log("   " + usd(r.price) + "  " + String(r.title || "").slice(0, 70)); }
    if (expectNoop && (g.applied || g.removed.length)) console.log("  *** WARNING: expected no-op but guard acted ***");
  } catch (e) {
    console.log("\n================= " + q + " =====  ERROR: " + e.message);
  }
}
// SYNTHETIC deny demonstration: the real S-Class / S65 pools are model-column + family-defrag
// based (titles say "S550", "CLS500"), invisible to a title-only probe, so show the guard's deny
// on hand-written titles instead.
console.log("\n================= SYNTHETIC deny check (S-Class / S65) =================");
const synth = (spec, titles) => {
  const rows = titles.map((t, i) => ({ id: "x" + i, title: t, raw_title: t, year: (t.match(/\b(19|20)\d\d\b/) || [])[0] || null, price: 50000 }));
  const g = rule5PoolGuard(rows, spec);
  console.log(`  spec ${spec.make} ${spec.model}: kept ${g.kept.length}/${rows.length}`);
  for (const x of g.removed) console.log(`    REMOVED [${x.reason}] ${x.row.title}`);
  for (const r of g.kept) console.log(`    kept         ${r.title}`);
};
synth({ make: "Mercedes-Benz", model: "S-Class", genCode: "W220", yearMin: 2000, yearMax: 2006 },
  ["2003 Mercedes-Benz S500", "2004 Mercedes-Benz S600", "2004 Mercedes-Benz CLS500", "2005 Mercedes-Benz SL550", "2006 Mercedes-Benz CL600", "2003 Mercedes-Benz S55 AMG"]);
synth({ make: "Mercedes-Benz", model: "S65", badge: "S65", genCode: "W221", yearMin: 2007, yearMax: 2013 },
  ["2008 Mercedes-Benz S65 AMG", "2010 Mercedes-Benz SL65 AMG", "2011 Mercedes-Benz CL65 AMG", "2009 Mercedes-Benz CLS63 AMG"]);

await b.close();
