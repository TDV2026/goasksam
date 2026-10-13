// ONE CAR FOR ONE NAME ON EVERY LANE (Lane B2, Oct 2026). The shared resolver (lib/vehicle.js resolveVehicle) is what
// Market Check and Sell call; Buy, Tasks and the Buy chat reach it through resolveForBuy (lib/live/search.js, with a
// parseQuery pass first). The same words must come out as the same car on both paths, and the name must keep its
// casing and hyphens ("CLK DTM", "SRT-10", "CCXR"; never "Dtm", "Ccxr").
//   node scripts/resolverLanesCheck.mjs     exit 1 on any failure. No vendor request (vPIC/taxonomy reads only).
// Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9";   // nothing listens here: the resolver uses its curated data
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
const { resolveVehicle } = await import("../lib/vehicle.js");
const { resolveForBuy, parseQuery } = await import("../lib/live/search.js");
let bad = 0;
const fail = m => { bad++; console.log("FAIL " + m); };
// [typed words, expected {year, make, model, trim}] (a key left out is not checked)
const CASES = [
  ["2005 Mercedes-Benz CLK DTM", { year: 2005, make: "Mercedes-Benz", model: "CLK DTM" }],
  ["CLK DTM", { make: "Mercedes-Benz", model: "CLK DTM" }],
  ["Mercedes-Benz CLK DTM", { make: "Mercedes-Benz", model: "CLK DTM" }],   // how Tasks joins make + model + trim
  ["CLK 55 AMG", { year: null, make: "Mercedes-Benz", model: "CLK-Class" }],   // 55 is a model number, never 1955
  ["2004 Dodge Viper SRT-10", { year: 2004, make: "Dodge", model: "Viper", trim: "SRT-10" }],
  ["2017 Ford Mustang GT350", { year: 2017, make: "Ford", model: "Mustang", trim: "GT350" }],
  ["2004 BMW M3", { year: 2004, make: "BMW", model: "M3" }],
  ["1956 Mercedes-Benz 300SL", { year: 1956, make: "Mercedes-Benz", model: "300SL" }],
  ["1991 Mercedes-Benz 560SL", { year: 1991, make: "Mercedes-Benz", model: "SL-Class", trim: "560SL" }],
  ["2021 Land Rover Defender 110", { year: 2021, make: "Land Rover", model: "Defender" }],
  ["1993 Porsche 911 Carrera RS Targa", { year: 1993, make: "Porsche", model: "911", trim: "Carrera RS" }],
  ["2009 Koenigsegg CCXR", { year: 2009, make: "Koenigsegg", model: "CCXR" }],
  ["Koenigsegg CCXR", { make: "Koenigsegg", model: "CCXR" }],   // no year: still the CCXR, not the whole make
  ["67 corvette", { year: 1967, make: "Chevrolet", model: "Corvette" }],   // a real two-digit year still reads as one
  ["sell my porsche", { make: "Porsche", model: null }],   // conversation is never a model
];
const norm = v => v ? { year: v.year || null, make: v.make || null, model: v.model || null, trim: v.trim || null } : null;
for (const [words, want] of CASES) {
  let mc = null, buy = null;
  try { const r = await resolveVehicle(words, {}); mc = r && r.vehicle ? norm(r.vehicle) : null; } catch (e) { fail(`${words}: resolveVehicle threw ${e.message}`); continue; }
  try { const pq = parseQuery(words); buy = norm(await resolveForBuy(pq.text || words, {})); } catch (e) { fail(`${words}: resolveForBuy threw ${e.message}`); continue; }
  for (const k of Object.keys(want)) {
    if (!mc || mc[k] !== want[k]) fail(`${words}: Market Check ${k} = ${JSON.stringify(mc && mc[k])}, wanted ${JSON.stringify(want[k])}`);
    // Buy never asks, so a year it does not state stays null; the car (make/model/trim) must be the same.
    if (k !== "year" && (!buy || buy[k] !== want[k])) fail(`${words}: Buy/Tasks ${k} = ${JSON.stringify(buy && buy[k])}, wanted ${JSON.stringify(want[k])}`);
  }
  // Same car on both paths: make, model and trim equal wherever Market Check has them.
  if (mc && buy && mc.make) for (const k of ["make", "model", "trim"]) if ((mc[k] || null) !== (buy[k] || null)) fail(`${words}: lanes differ on ${k}: Market Check ${JSON.stringify(mc[k])} vs Buy/Tasks ${JSON.stringify(buy[k])}`);
  // Copy rules in what the resolver emits.
  for (const s of [mc && mc.model, mc && mc.trim, buy && buy.model, buy && buy.trim].filter(Boolean)) {
    if (/–|—/.test(s)) fail(`${words}: dash in "${s}"`);
    if (/\bDtm\b|\bCcxr\b/.test(s)) fail(`${words}: casing lost in "${s}"`);
  }
  if (buy && buy.make && buy.model && new RegExp(`^${buy.make}\\b`, "i").test(buy.model) && buy.model.toLowerCase() !== buy.make.toLowerCase()) fail(`${words}: model repeats the make: "${buy.model}"`);
}
console.log(bad ? `resolverLanesCheck: ${bad} failure(s)` : `resolverLanesCheck: ${CASES.length} names, one car on every lane`);
process.exit(bad ? 1 : 0);
