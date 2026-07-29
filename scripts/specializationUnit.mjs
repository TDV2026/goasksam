// Unit tests for the specialization share metric (pure computation).
import { computeSpecializationCells, findSpecializationContext, scopeKeysForRow, SPECIALIZATION_MIN_COUNT, SPECIALIZATION_MIN_LIFT } from "../lib/specializationShare.js";

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`); if (!ok) failures++; };

// Row builders. Every row is a SOLD record.
const rows = (platform, make, model, n, year = 1967) => Array.from({ length: n }, () => ({ platform, make, model, year, sale_price: 50000 }));

// --- Scenario: plat_a is a Camaro specialist; plat_b is not ---
const dataset = [
  ...rows("plat_a", "Chevrolet", "Camaro", 8),      // 8 Camaros
  ...rows("plat_a", "Ford", "Mustang", 6),          // 6 Mustangs (low-lift control)
  ...rows("plat_a", "Mazda", "Miata", 4),           // 4 Miatas (thin control, <5)
  ...rows("plat_a", "Filler", "Sedan", 82),         // filler to 100 total
  ...rows("plat_b", "Chevrolet", "Camaro", 1),      // 1 Camaro
  ...rows("plat_b", "Ford", "Mustang", 5),          // 5 Mustangs
  ...rows("plat_b", "Filler", "Sedan", 94),         // filler to 100 total
];
const cells = computeSpecializationCells(dataset, { dataMonth: "2026-07" });

const camaroA = cells.find(c => c.platform === "plat_a" && c.scope_key === "model|chevrolet|camaro");
check("basic: plat_a Camaro cell exists with correct count", !!camaroA && camaroA.platform_count === 8, JSON.stringify(camaroA));
// plat_a share 8/100=0.08 ; rest (plat_b) share 1/100=0.01 ; lift = 8
check("basic: lift = platform_share / rest_share, rounded to whole", camaroA && camaroA.lift_rounded === 8, `lift_rounded=${camaroA && camaroA.lift_rounded}`);
check("basic: cell carries scope label, rung, window", camaroA && camaroA.scope_label === "Camaros" && camaroA.rung === "model" && camaroA.window === 180, JSON.stringify(camaroA));

check("gate: thin scope (<5 sold) produces no cell (Miatas, count 4)", !cells.some(c => c.scope_key === "model|mazda|miata"), JSON.stringify(cells.filter(c => /miata/.test(c.scope_key))));
// Mustangs: plat_a 6/100=0.06 vs plat_b 5/100=0.05 -> lift 1.2 < 2.0
check("gate: low-lift scope (< 2.0) produces no cell (Mustangs, lift 1.2)", !cells.some(c => c.scope_key === "model|ford|mustang"), JSON.stringify(cells.filter(c => /mustang/.test(c.scope_key))));
check("gate: the non-specialist platform earns no Camaro cell", !cells.some(c => c.platform === "plat_b" && /camaro/.test(c.scope_key)), "plat_b should have no camaro cell");

// --- Rounding: fractional lift rounds to nearest whole ---
const roundingSet = [
  ...rows("plat_a", "Nissan", "GT-R", 5), ...rows("plat_a", "Filler", "Sedan", 95),   // 5/100 = 0.05
  ...rows("plat_b", "Nissan", "GT-R", 2), ...rows("plat_b", "Filler", "Sedan", 298),  // 2/300 = 0.006667
];
const gtr = computeSpecializationCells(roundingSet, { dataMonth: "2026-07" }).find(c => c.platform === "plat_a" && /gt-?r|gtr/.test(c.scope_key));
// lift = 0.05 / (2/300) = 0.05 / 0.0066667 = 7.5 -> rounds to 8
check("rounding: lift 7.5 rounds to 8 (never a decimal)", gtr && gtr.lift_rounded === 8 && Number.isInteger(gtr.lift_rounded), `lift_rounded=${gtr && gtr.lift_rounded}`);

// --- Generation + segment scopes via injected mappers ---
const generationOf = (make, model, year) => (/porsche/i.test(make) && /911/.test(model) && year >= 1995 && year <= 1998) ? { code: "993", label: "993-generation 911s" } : null;
const segmentOf = (make, model) => (/porsche/i.test(make) && /911/.test(model)) ? { key: "air_cooled_911", label: "air-cooled 911s" } : null;
const genSet = [
  ...rows("plat_a", "Porsche", "911", 7, 1996), ...rows("plat_a", "Filler", "Sedan", 93),
  ...rows("plat_b", "Porsche", "911", 1, 1996), ...rows("plat_b", "Filler", "Sedan", 199),
];
const genCells = computeSpecializationCells(genSet, { dataMonth: "2026-07", generationOf, segmentOf });
check("generation scope: a 993-generation cell computes", genCells.some(c => c.platform === "plat_a" && c.scope === "generation" && /993/.test(c.scope_key)), JSON.stringify(genCells.map(c => c.scope_key)));
check("segment scope: an air-cooled-911 cell computes", genCells.some(c => c.platform === "plat_a" && c.scope === "segment" && /aircooled911/.test(c.scope_key)), JSON.stringify(genCells.map(c => c.scope_key)));

// --- findSpecializationContext ---
const found = findSpecializationContext("plat_a", { rung: "model", make: "Chevrolet", model: "Camaro" }, cells);
check("lookup: findSpecializationContext returns the model cell", !!found && found.platform_count === 8, JSON.stringify(found));
check("lookup: a generation query falls back to the model cell when no gen cell exists", !!findSpecializationContext("plat_a", { rung: "generation", make: "Chevrolet", model: "Camaro", generationCode: "x" }, cells), "expected model fallback");
check("lookup: no cell for an unknown platform", findSpecializationContext("plat_zzz", { rung: "model", make: "Chevrolet", model: "Camaro" }, cells) === null, "should be null");

console.log(`\nGates: min count ${SPECIALIZATION_MIN_COUNT}, min lift ${SPECIALIZATION_MIN_LIFT}`);
console.log(failures ? `\n${failures} FAILURE(S)` : "\nSPECIALIZATION-UNIT ALL PASS");
process.exit(failures ? 1 : 0);
