// A "WHICH MODEL" LIST HAS NO CUT NAME, NO DUPLICATE, NO VARIANT BESIDE ITS MODEL (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6). 1969 Chevrolet offered a chip "El" (El Camino cut at a space); 1985 Land Rover offered Defender, Series,
// Range Rover, 110, Series III and Series 3: Series, Series III and Series 3 are one thing, and 110 is a variant of Defender.
// CAUSE (lib/vehicle.js buildAskModels): (1) the archive's model_family for El Camino is the first word, "El", and the family replaced the model as the chip; and the sales-only path took the family key as the chip name; (2) "Series" compacted to an empty string,
// so "Series 3" never folded under it, and a roman numeral was not read as its digit; (3) a variant such as 110 had no parent link, so it stood beside Defender. FIX: a family that is only the first word of a longer name (letters, no digits) never replaces the name;
// the sales-only path uses the model as the record writes it; a roman numeral ending a name reads as its digit; a bare "Series"/"Class" suffix is dropped only when something is left; a curated variant table (Land Rover 90, 110, 130 are Defenders) folds a variant under its model.
// This check runs the real list on both of Lane F's cars and on cars built from the same shapes, and asks askChipFaults (cut, duplicate, variant) about every list: it fails on all three kinds.
//   node scripts/whichChipsCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const rep = (model, family, n) => Array.from({ length: n }, () => ({ model, model_family: family }));
const lists = [
  { name: "1969 Chevrolet", make: "Chevrolet", year: 1969, tax: ["Camaro", "Corvette", "Chevelle", "El Camino", "Impala"].map(name => ({ name, yearRanges: null })),
    rows: [...rep("Camaro", "Camaro", 60), ...rep("Corvette", "Corvette", 80), ...rep("Chevelle", "Chevelle", 40), ...rep("El Camino", "El", 25), ...rep("Impala", "Impala", 30)], full: ["Camaro", "Corvette", "Chevelle", "El Camino", "Impala"] },
  { name: "1985 Land Rover", make: "Land Rover", year: 1985, tax: ["Defender", "Series", "Range Rover", "110", "Series III", "Series 3"].map(name => ({ name, yearRanges: null })),
    rows: [...rep("Defender", "Defender", 40), ...rep("Series", "Series", 12), ...rep("Range Rover", "Range Rover", 30), ...rep("110", "110", 14), ...rep("Series III", "Series III", 10), ...rep("Series 3", "Series 3", 9)], full: ["Defender", "Series", "Range Rover", "110", "Series III", "Series 3"] },
  { name: "1972 Datsun (sales-only El-style)", make: "Datsun", year: 1972, tax: [], rows: [...rep("Fairlady Z", "Fairlady", 20), ...rep("510", "510", 30), ...rep("240Z", "240Z", 25)], full: ["Fairlady Z", "510", "240Z"] },
  { name: "1975 Toyota (sales-only Land Cruiser)", make: "Toyota", year: 1975, tax: [], rows: [...rep("Land Cruiser", "Land", 30), ...rep("Corolla", "Corolla", 20), ...rep("Celica", "Celica", 18)], full: ["Land Cruiser", "Corolla", "Celica"] }
];
for (const L of lists) {
  const r = V.buildAskModels(L.tax, L.rows, L.make, L.year), chips = r.models.map(m => m.model), f = V.askChipFaults(chips, L.full, L.make);
  ok(`${L.name}: no chip cut at a space`, f.cut.length === 0, `${JSON.stringify(chips)} cut ${JSON.stringify(f.cut)}`);
  ok(`${L.name}: no two chips that are one thing`, f.duplicate.length === 0, JSON.stringify(f.duplicate));
  ok(`${L.name}: no variant listed beside its model`, f.variant.length === 0, JSON.stringify(f.variant));
}
{ const r = V.buildAskModels(lists[0].tax, lists[0].rows, "Chevrolet", 1969); ok("1969 Chevrolet: El Camino is one chip, whole", r.models.some(m => m.model === "El Camino") && !r.models.some(m => m.model === "El")); }
{ const r = V.buildAskModels(lists[1].tax, lists[1].rows, "Land Rover", 1985), names = r.models.map(m => m.model);
  ok("1985 Land Rover: Defender (with the 110), Series (one chip for Series, Series 3 and Series III) and Range Rover", names.includes("Defender") && names.includes("Range Rover") && names.filter(x => /^series/i.test(x)).length === 1 && !names.includes("110"), JSON.stringify(names));
  const def = r.models.find(m => m.model === "Defender"), ser = r.models.find(m => /^series/i.test(m.model)); ok("their sales are carried into the model they fold under", def && def.n >= 54 && ser && ser.n >= 31, JSON.stringify([def && def.n, ser && ser.n])); }
// the detector itself catches all three kinds (so a regression cannot pass in silence)
{ const f = V.askChipFaults(["Defender", "110", "El", "Series 3", "Series III"], ["Defender", "El Camino", "Series 3"], "Land Rover");
  ok("askChipFaults names a cut chip", f.cut.includes("El"), JSON.stringify(f.cut));
  ok("askChipFaults names two chips that are one", f.duplicate.length === 1, JSON.stringify(f.duplicate));
  ok("askChipFaults names a variant beside its model", f.variant.some(v => v.startsWith("110")), JSON.stringify(f.variant)); }
console.log(fail ? `whichChipsCheck: ${fail} failure(s)` : "whichChipsCheck: all pass");
process.exit(fail ? 1 : 0);
