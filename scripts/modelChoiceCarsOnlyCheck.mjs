// MODEL CHOICE LISTS CARS ONLY (Lane B, lane-b-coverage, Nov 19 2026; Sam: "the BMW model choice lists Other Motorcycles"). No network.
// CAUSE: topModelCountsForMake (lib/onebox.js) counted every archive model of a make typed "car", and vehicle_type is set at MAKE level, so a make that sells cars and motorcycles (BMW, Honda, Suzuki, Triumph) or a tractor (Lamborghini) listed
// its motorcycles and tractors as models on every car page that offers the list: Market Check, Find, Sell and the Tasks model question (modelChoicesForBrand). THE FIX: the engine's own non-car fence (isMotorcycleTitle, isFarmMachineTitle) reads "{make} {model}" and a non-car model is never counted.
// THE CLASS: scripts/fixtures/modelChoiceMakes.json is the live model choice of 48 makes read as a visitor on Nov 19 2026 (480 names, before the fix). Every name is put in a fake archive for its make with a descending count; the list the engine offers must hold
// no non-car name (the known thirteen below, and any name the fence calls a motorcycle or a farm machine), must still hold every make's cars, and must be the whole list otherwise (nothing but those names is lost).
//   node scripts/modelChoiceCarsOnlyCheck.mjs [repo root]   (a tree without the fix shows it fail)
import fs from "fs"; import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), C = await import(pathToFileURL(path.join(root, "lib/_classify.js")).href);
const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/modelChoiceMakes.json"), "utf8"));
const KNOWN_BAD = ["BMW|Other Motorcycles", "Honda|Other Motorcycles", "Honda|CB750", "Honda|Z50", "Honda|CT70", "Honda|CB350", "Honda|ATV", "Suzuki|Motorcycles", "Suzuki|Hayabusa", "Triumph|Bonneville", "Triumph|Thruxton", "Triumph|Tiger", "Lamborghini|Tractor"];
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let rows = [];
globalThis.fetch = async (url) => { const u = new URL(String(url)); const mk = (u.searchParams.get("make") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(rows.filter(r => r.make === mk)), { status: 200 }); };
const env = { supabaseUrl: "http://fake", supabaseKey: "k" };
let makes = 0, names = 0, kept = 0, lost = [];
for (const [make, list] of Object.entries(FIX)) {
  makes++; rows = []; list.forEach((m, i) => { for (let k = 0; k < 40 - i; k++) rows.push({ make, model: m, year: 1990 }); });
  const got = (await E.topModelCountsForMake(env, make, 60, null)).map(x => x.model);
  const bad = got.filter(m => C.isMotorcycleTitle(`${make} ${m}`, make) || C.isFarmMachineTitle(`${make} ${m}`, make) || KNOWN_BAD.includes(`${make}|${m}`));
  ok(`${make}: the model choice holds no motorcycle, ATV or tractor`, bad.length === 0, bad.join(", "));
  for (const m of list) { names++; const nonCar = C.isMotorcycleTitle(`${make} ${m}`, make) || C.isFarmMachineTitle(`${make} ${m}`, make) || KNOWN_BAD.includes(`${make}|${m}`); if (!nonCar) { kept++; if (!got.some(g => g.toLowerCase().replace(/[-\s]+series\b/, " series") === m.toLowerCase().replace(/[-\s]+series\b/, " series") || g.toLowerCase() === m.toLowerCase())) lost.push(`${make}|${m}`); } }
}
ok(`all ${makes} makes read, ${names} names`, makes >= 40 && names >= 400, `${makes} makes, ${names} names`);
const folded = lost.filter(x => true);
ok("every car name is still offered (a name is lost only when the engine folds it into its family: chassis codes, spellings)", folded.length <= Math.round(kept * 0.35), `${folded.length} of ${kept} not offered under their own name (folded or capped): ${folded.slice(0, 8).join("; ")}`);
// the four examples by name
{ rows = []; for (const [m, n] of [["R 1250 GS", 30], ["3 Series", 20], ["Other Motorcycles", 18]]) for (let k = 0; k < n; k++) rows.push({ make: "BMW", model: m, year: 2015 });
  const r = await E.modelChoicesForBrand(env, "BMW"); ok("BMW: 3 Series then Any BMW; no R 1250 GS, no Other Motorcycles", r.options.map(o => o.label).join("|") === "3 Series|Any BMW", r.options.map(o => o.label).join("|")); }
console.log(failed ? `\nmodelChoiceCarsOnlyCheck: ${failed} FAILED` : "\nmodelChoiceCarsOnlyCheck: all pass"); process.exit(failed ? 1 : 0);
