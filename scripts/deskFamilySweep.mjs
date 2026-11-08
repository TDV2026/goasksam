// DESK V3 FAMILY SWEEP (Lane B, Nov 8 2026). Offline, reads lib/modelRules.js only (no production read). For every curated family, 911 and Corvette first, says where Desk comparables or factors FALL BACK to a generic rule:
//   comparables: a family with no generation list lists NO comparables (relevance needs a verified generation); a generation with no body list matches on the sale's own body only; year gaps between generations drop those years.
//   factors: transmission, mileage band and market movement read from the family's own sales for any car (data, not a rule); service_ims has a family rule for the 996 family only; a family with no gearbox list has no curated gearbox truth behind its transmission factor.
//   node scripts/deskFamilySweep.mjs [--json]
import { MODEL_RULES, factorFamilyFor, FACTOR_FAMILIES } from "../lib/modelRules.js";
import { CURATED_GENERATIONS } from "../lib/generations.js";
const first = r => (/porsche/i.test(r.make) && /^911$/i.test(r.model) ? 0 : /chevrolet/i.test(r.make) && /corvette/i.test(r.model) ? 1 : 2);
const rows = MODEL_RULES.slice().sort((a, b) => first(a) - first(b)).map(r => {
  const gens = r.generations || [], noBodies = gens.filter(g => !(g.bodies || []).length).map(g => g.code), noGear = gens.filter(g => !(g.gearbox || []).length).map(g => g.code);
  const spans = gens.map(g => g.prodYears || g.years).filter(Boolean).sort((a, b) => a[0] - b[0]), gaps = [];
  for (let i = 1; i < spans.length; i++) if (spans[i][0] > spans[i - 1][1] + 1) gaps.push(`${spans[i - 1][1] + 1} to ${spans[i][0] - 1}`);
  const ims = gens.some(g => factorFamilyFor("service_ims", r.make, r.model, (g.years || [])[0], g.code));
  return { family: `${r.make} ${r.model}`, generations: gens.length, comparablesFallback: gens.length === 0, noBodyList: noBodies, noGearboxList: noGear, yearGaps: gaps, serviceImsRule: ims };
});
const bad = rows.filter(r => r.comparablesFallback || r.noBodyList.length || r.noGearboxList.length || r.yearGaps.length);
if (process.argv.includes("--json")) { console.log(JSON.stringify({ families: rows.length, withGaps: bad.length, rows: bad }, null, 1)); process.exit(0); }
console.log(`${rows.length} curated families; service_ims has a family rule for: ${rows.filter(r => r.serviceImsRule).map(r => r.family).join(", ") || "none"} (FACTOR_FAMILIES: ${Object.keys(FACTOR_FAMILIES).join(", ")}).`);
console.log(`${rows.filter(r => r.comparablesFallback).length} families have no generation list (Desk lists no comparables for them):`);
for (const r of rows.filter(r => r.comparablesFallback)) console.log("  " + r.family);
console.log(`${rows.filter(r => r.noBodyList.length).length} families have a generation with no body list:`); for (const r of rows.filter(r => r.noBodyList.length)) console.log(`  ${r.family}: ${r.noBodyList.join(", ")}`);
console.log(`${rows.filter(r => r.noGearboxList.length).length} families have a generation with no gearbox list (transmission factor reads the sales only):`); for (const r of rows.filter(r => r.noGearboxList.length)) console.log(`  ${r.family}: ${r.noGearboxList.join(", ")}`);
console.log(`${rows.filter(r => r.yearGaps.length).length} families have year gaps between generations:`); for (const r of rows.filter(r => r.yearGaps.length)) console.log(`  ${r.family}: ${r.yearGaps.join("; ")}`);

// the second source of generations (lib/generations.js CURATED_GENERATIONS): families that are not in the model rules but have a generation list, so Desk lists their comparables
const ruled = new Set(MODEL_RULES.map(r => (r.make + "|" + r.model).toLowerCase())), only = new Map();
for (const g of CURATED_GENERATIONS) { const k = (g.make + "|" + g.model).toLowerCase(); if (!ruled.has(k)) only.set(k, (only.get(k) || 0) + 1); }
console.log(`${only.size} more families have generations only in lib/generations.js (comparables listed; no body or gearbox lists, so the sale's own body and gearbox words are used): ${[...only.keys()].slice(0, 12).join(", ")}${only.size > 12 ? ", ..." : ""}`);
const vette = [...only.keys()].filter(k => /corvette/.test(k)); console.log("Corvette: " + (vette.length ? "generations from lib/generations.js (" + only.get(vette[0]) + ")" : "NO generation list: no comparables"));
console.log("Every other make and model in the archive has no generation list in either file: Desk lists no comparables for it and the factors read its sales without a family rule. The list of tiered families to check against is a production read (sales_archive condition_tier by make and model), not run here.");
