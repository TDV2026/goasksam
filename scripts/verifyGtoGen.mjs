// Golden guard for the GTO generation fix (e1 leak). Deterministic, offline (reads CURATED
// generations + buildSpec, no network): a 1968 Pontiac GTO must bind to the 1968-1972 generation
// and must NOT pool 1966-1967 (the prior generation). Guards lib/generations.js from a regression
// that drops or widens the GTO map back to calendar year +/- 2.
import { generationsForModel } from "../lib/generations.js";
import { buildSpec } from "../lib/onebox.js";
let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`); if (!ok) fails++; };

const gens = generationsForModel("Pontiac", "GTO");
check("GTO has curated generations", gens.length >= 2, JSON.stringify(gens));
const g68 = gens.find(g => 1968 >= g.yearStart && 1968 <= g.yearEnd);
check("1968 lands in a single generation", !!g68, JSON.stringify(gens));
check("1968 generation is 1968-1972 (2nd gen)", g68 && g68.yearStart === 1968 && g68.yearEnd === 1972, JSON.stringify(g68));
check("1966 is NOT in the 1968 generation", g68 && 1966 < g68.yearStart, JSON.stringify(g68));
check("1967 is NOT in the 1968 generation", g68 && 1967 < g68.yearStart, JSON.stringify(g68));
const g66 = gens.find(g => 1966 >= g.yearStart && 1966 <= g.yearEnd);
check("1966 lands in the FIRST generation 1964-1967", g66 && g66.yearStart === 1964 && g66.yearEnd === 1967, JSON.stringify(g66));

// End-to-end: buildSpec must bind the pool window to 1968-1972 for a 1968 GTO.
const spec = buildSpec({ make: "Pontiac", model: "GTO", year: 1968 }, g68, "1968 Pontiac GTO");
check("buildSpec yearMin === 1968", spec.yearMin === 1968, "yearMin=" + spec.yearMin);
check("buildSpec yearMax === 1972 (no 1966-67, no calendar 1970 cap)", spec.yearMax === 1972, "yearMax=" + spec.yearMax);

// PROD WORST CASE: taxonomy_generations is seeded but lacks GTO, so findGeneration returns null.
// buildSpec must STILL re-bind to 1968-1972 via generationsForModel (CURATED), so the fix ships
// without a DB re-seed. Guards against a regression that only binds when findGeneration hits.
const specNull = buildSpec({ make: "Pontiac", model: "GTO", year: 1968 }, null, "1968 Pontiac GTO");
check("buildSpec re-binds 1968-1972 even when generation=null (DB-only prod)", specNull.yearMin === 1968 && specNull.yearMax === 1972, `yearMin=${specNull.yearMin} yearMax=${specNull.yearMax}`);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nAll GTO generation checks passed.");
process.exit(fails ? 1 : 0);
