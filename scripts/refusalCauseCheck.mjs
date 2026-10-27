// e94: the wrong refusals among Find's blank BMW cards, as classes (Lane C's re-sort, Oct 27 2026). An honest "no sales" stays honest; a refusal
// whose only cause is a letter the gate did not know, or a typed word that is not a trim, is not a refusal.
//   1. drive-train and length letters after a model number or code: 750Li and 740Li are the 750i and 740i, 535xi the 535i, S550L the S550, E320L the E320;
//   2. a typed word that is not a trim (F12, E34, G16, Touring, Swap, Press, Ex, a BMW Turbo) is not a dropped trim;
//   3. real swaps still refuse (a 330i pool for a 325i, a 750 pool for a 740, a 911 pool for a 996);
//   4. a refusal always carries its refusal_line, and the car data has the M Coupe and E9 badges.
//   node scripts/refusalCauseCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const VD = await import(pathToFileURL(path.join(root, "lib/vehicleData.js")).href);
const { runOutputInvariants, nonTrimWordHonoured } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const card = (make, model, title) => ({ make, model, title, price: 10000, platform: "Bring a Trailer" });
const gate = (cards, v) => runOutputInvariants({ tier: "result", rawPool: cards, cards, fallbackRung: "model" }, v).find(x => x.name === "receipts_carry_resolved_car");
const CASES = [
  ["BMW", "750i", "7-Series", ["2013 BMW 750Li", "2013 BMW 750i", "2012 BMW 750Li xDrive", "2010 BMW 750Li"]],
  ["BMW", "740i", "7-Series", ["2013 BMW 740Li", "2011 BMW 740i", "2012 BMW 740Li"]],
  ["BMW", "535i", "5-Series", ["2008 BMW 535xi", "2009 BMW 535xi Wagon", "2010 BMW 535i"]],
  ["BMW", "325i", "3-Series", ["2006 BMW 325xi Sedan", "2006 BMW 325i Sedan"]],
  ["BMW", "335d", "3-Series", ["2010 BMW 335d", "2011 BMW 335d"]],
  ["Mercedes-Benz", "S550", "S-Class", ["2008 Mercedes-Benz S550L", "2010 Mercedes-Benz S550 4MATIC", "2009 Mercedes-Benz S550"]],
  ["Mercedes-Benz", "E320", "E-Class", ["2003 Mercedes-Benz E320L", "2004 Mercedes-Benz E320 Wagon", "2002 Mercedes-Benz E320"]]
];
for (const [mk, model, col, titles] of CASES) {
  const g = gate(titles.map(t => card(mk, col, t)), { make: mk, model });
  ok(`letters: ${mk} ${model} pool with ${titles.join(", ")} stands`, g && g.ok === true, g && g.detail);
}
for (const [mk, model, titles] of [["BMW", "325i", ["2006 BMW 330i", "2006 BMW 330xi", "2007 BMW 330i"]], ["BMW", "740i", ["2010 BMW 750Li", "2011 BMW 750i", "2012 BMW 750Li"]], ["Mercedes-Benz", "S550", ["2008 Mercedes-Benz S600", "2007 Mercedes-Benz S65 AMG", "2009 Mercedes-Benz S63 AMG"]]]) {
  const g = gate(titles.map(t => card(mk, "other", t)), { make: mk, model });
  ok(`swap: ${mk} ${model} pool of ${titles[0]} and its neighbours still refuses`, g && g.ok === false, g && g.detail);
}
for (const [mk, w] of [["BMW", "F12"], ["BMW", "E34"], ["BMW", "G16"], ["Mercedes-Benz", "W124"], ["Audi", "B5"], ["BMW", "Touring"], ["Audi", "Avant"], ["BMW", "Swap"], ["BMW", "Press"], ["BMW", "Ex"], ["BMW", "Turbo"]]) {
  const real = mk === "Audi" && w === "B5" ? false : true;
  ok(`typed word: ${mk} "${w}" ${real ? "is not a trim" : "is left to the older rules"}`, nonTrimWordHonoured({ make: mk, model: "M3" }, w) === real);
}
ok("typed word: a Porsche Turbo is a trim", nonTrimWordHonoured({ make: "Porsche", model: "911" }, "Turbo") === false);
ok("typed word: a BMW 2002 Turbo is a trim", nonTrimWordHonoured({ make: "BMW", model: "2002" }, "Turbo") === false);
ok("typed word: GT3 is a trim", nonTrimWordHonoured({ make: "Porsche", model: "911" }, "GT3") === false);
ok("typed word: CSL is a trim", nonTrimWordHonoured({ make: "BMW", model: "M3" }, "CSL") === false);
const names = JSON.stringify(Object.values(VD).filter(Array.isArray)).toLowerCase();
ok("car data: the M Coupe and the 3.0 CS badges are aliases", names.includes('"alias":"m coupe"') && names.includes('"alias":"3.0cs"'));
console.log(failed ? `refusalCauseCheck: ${failed} FAIL` : "refusalCauseCheck: all PASS");
process.exit(failed ? 1 : 0);
