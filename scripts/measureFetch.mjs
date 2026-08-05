// 7A.3 / 7C.3 fetch-efficiency measurement. Runs the same 20 cars COLD
// (bypassCache) so the metered-call count reflects the fetch strategy, not the
// 24h cache. Usage: node scripts/measureFetch.mjs before|after
// Writes scratchpad/fetch-<label>.json for the before/after diff.
const BASE = process.env.FLOW_BASE || "https://goasksam.vercel.app";
const label = process.argv[2] || "before";
const OUT = `/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/fetch-${label}.json`;
import fs from "node:fs";

// Mix: dense/common, thin/low-volume, and oddly-named/unmapped.
const CARS = [
  ["dense", "Chevrolet", "Camaro", 1967, "SS"],
  ["dense", "Porsche", "911", 2018, "Carrera"],
  ["dense", "Mazda", "MX-5 Miata", 1994, null],
  ["dense", "BMW", "M3", 2015, null],
  ["dense", "Chevrolet", "Chevelle", 1970, "SS"],
  ["dense", "Ford", "Mustang", 1967, null],
  ["mid", "Nissan", "GT-R", 2010, null],
  ["mid", "Porsche", "911", 1973, "Carrera RS"],
  ["mid", "Ferrari", "F355", 1995, null],
  ["mid", "Subaru", "Impreza", 2004, "WRX STI"],
  ["mid", "Toyota", "Land Cruiser", 1985, "FJ60"],
  ["mid", "Mazda", "RX-7", 1993, null],
  ["mid", "Acura", "NSX", 2002, null],
  ["mid", "Datsun", "240Z", 1972, null],
  ["thin", "Lancia", "Delta", 1987, "HF Integrale"],
  ["thin", "Alfa Romeo", "155", 1995, null],
  ["thin", "Citroen", "SM", 1972, null],
  ["thin", "Fiat", "600", 1958, "Multipla"],
  ["thin", "Maserati", "Bora", 1974, null],
  ["thin", "Lancia", "Beta", 1983, "Montecarlo"]
];

async function run(cls, make, model, year, trim) {
  const body = { bypassCache: true, debug: true, car: { vehicle: { raw: `${year} ${make} ${model}${trim ? " " + trim : ""}`, make, model, year, trim, confidence: "high" }, region: "US", state: "California" } };
  const res = await fetch(`${BASE}/api/sellerDecision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  const ev = j.evidence || {};
  const fs2 = ev.fetchStrategy || {};
  return {
    label: `${year} ${make} ${model}${trim ? " " + trim : ""}`, cls,
    metered: fs2.meteredRequests ?? null,
    cache: fs2.marketFetchCache ?? null,
    landed: ev.ladder?.landed?.key ?? null,
    passes: (ev.fetchPasses || []).length,
    stop: fs2.stopReason ?? null
  };
}

const rows = [];
for (const [cls, make, model, year, trim] of CARS) {
  try { rows.push(await run(cls, make, model, year, trim)); }
  catch (e) { rows.push({ label: `${year} ${make} ${model}`, cls, metered: null, error: e.message }); }
  process.stdout.write(".");
}
console.log("");

fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
const metered = rows.map(r => r.metered).filter(n => Number.isFinite(n));
const mean = metered.reduce((a, b) => a + b, 0) / (metered.length || 1);
console.log(`\n=== 7A.3 fetch measurement (${label}, COLD/bypassCache) ===`);
for (const r of rows) console.log(`  ${String(r.metered).padStart(2)} calls | ${r.cls.padEnd(5)} | ${r.landed || "?"} | passes=${r.passes} | ${r.label}`);
console.log(`\n  mean=${mean.toFixed(2)}  worst=${Math.max(...metered)}  zero(warm)=${metered.filter(n => n === 0).length}/${metered.length}`);
console.log(`  by class: dense mean=${cmean(rows, "dense")}  mid mean=${cmean(rows, "mid")}  thin mean=${cmean(rows, "thin")}`);
function cmean(rows, cls) { const m = rows.filter(r => r.cls === cls && Number.isFinite(r.metered)).map(r => r.metered); return (m.reduce((a, b) => a + b, 0) / (m.length || 1)).toFixed(2); }
