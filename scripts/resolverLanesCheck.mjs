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
let bad = 0, gaps = 0;
const fail = m => { bad++; console.log("FAIL " + m); };
// [typed words, expected {year, make, model, trim}] (a key left out is not checked)
const CASES = [
  ["2005 Mercedes-Benz CLK DTM", { year: 2005, make: "Mercedes-Benz", model: "CLK DTM" }],
  ["CLK DTM", { make: "Mercedes-Benz", model: "CLK DTM" }],
  ["Mercedes-Benz CLK DTM", { make: "Mercedes-Benz", model: "CLK DTM" }],   // how Tasks joins make + model + trim
  ["CLK 55 AMG", { year: null, make: "Mercedes-Benz", model: "CLK-Class", trim: "CLK55 AMG", trimNumber: "55" }],   // 55 is a model number, never 1955, and it is kept
  ["2004 Dodge Viper SRT-10", { year: 2004, make: "Dodge", model: "Viper", trim: "SRT-10" }],
  ["2017 Ford Mustang GT350", { year: 2017, make: "Ford", model: "Mustang", trim: "GT350" }],
  ["2004 BMW M3", { year: 2004, make: "BMW", model: "M3" }],
  ["1956 Mercedes-Benz 300SL", { year: 1956, make: "Mercedes-Benz", model: "300SL" }],
  ["1991 Mercedes-Benz 560SL", { year: 1991, make: "Mercedes-Benz", model: "SL-Class", trim: "560SL" }],
  ["2021 Land Rover Defender 110", { year: 2021, make: "Land Rover", model: "Defender" }],
  ["1993 Porsche 911 Carrera RS Targa", { year: 1993, make: "Porsche", model: "911", trim: "Carrera RS" }],
  ["2009 Koenigsegg CCXR", { year: 2009, make: "Koenigsegg", model: "CCXR" }],
  ["Koenigsegg CCXR", { make: "Koenigsegg", model: "CCXR" }],   // no year: still the CCXR, not the whole make
  // Stated numbers and variants are carried, never dropped (Lane B2, Oct 2026). Same shape as the curated c63/e63 badges.
  ["2005 Mercedes-Benz SL 55 AMG", { year: 2005, model: "SL-Class", trim: "SL55 AMG", trimNumber: "55" }],
  ["2010 Mercedes-Benz SL 63 AMG", { year: 2010, model: "SL-Class", trim: "SL63 AMG", trimNumber: "63" }],
  ["2005 Mercedes-Benz E 55 AMG", { year: 2005, model: "E-Class", trim: "E55 AMG", trimNumber: "55" }],
  ["2010 Mercedes-Benz C 63 AMG", { year: 2010, model: "C-Class", trim: "C63 AMG", trimNumber: "63" }],
  ["2015 Mercedes-Benz G 63 AMG", { year: 2015, model: "G-Class", trim: "G63 AMG", trimNumber: "63" }],
  ["2021 Land Rover Defender 90", { year: 2021, model: "Defender", wheelbase: "90" }],
  ["2021 Land Rover Defender 110", { year: 2021, model: "Defender", wheelbase: "110" }],
  ["2021 Land Rover Defender 130", { year: 2021, model: "Defender", wheelbase: "130" }],
  ["2012 Toyota Land Cruiser 200", { year: 2012, model: "Land Cruiser", series: "200" }],
  ["Toyota Land Cruiser 200", { model: "Land Cruiser", series: "200" }],
  ["2005 Land Rover Range Rover LWB", { year: 2005, model: "Range Rover", variant: "LWB" }],
  ["2015 Jeep Wrangler Unlimited", { year: 2015, model: "Wrangler", variant: "Unlimited" }],
  ["2008 Porsche 911 Carrera 4S", { year: 2008, model: "911", trim: "Carrera 4S" }],
  // Special editions are carried on `edition` (Lane B2). `buyGap` names fields Buy/Tasks lose BEFORE the resolver, in
  // lib/live/search.js parseQuery (Lane B's file: "Black" read as a paint colour, "Speedster" as a body filter, so the
  // words never reach resolveForBuy). Known and listed for Lane B; the check fails if a gap closes so the entry is removed.
  ["2008 Mercedes-Benz CLK 63 AMG Black Series", { year: 2008, model: "CLK-Class", trim: "CLK63 AMG", edition: "Black Series" }, ["edition"]],
  ["2013 Mercedes-Benz SLS AMG Black Series", { year: 2013, model: "SLS AMG", trim: null, edition: "Black Series" }, ["edition"]],
  ["Mercedes-Benz SLS AMG Black Series", { model: "SLS AMG", trim: null, edition: "Black Series" }, ["edition", "trim"]],
  ["2022 Subaru WRX Launch Edition", { year: 2022, model: "WRX", trim: null, edition: "Launch Edition" }],
  ["2010 Nissan GT-R Edition 1", { year: 2010, model: "GT-R", trim: null, edition: "Edition 1" }],
  ["2021 Porsche 911 Turbo S Final Edition", { year: 2021, model: "911", trim: "Turbo S", edition: "Final Edition" }],
  ["2023 Chevrolet Corvette Z06 Anniversary", { year: 2023, model: "Corvette", trim: "Z06 Anniversary", edition: "Anniversary" }],
  ["2022 BMW M3 Competition", { year: 2022, model: "M3", trim: "Competition", edition: "Competition" }],
  ["2018 BMW M4 CS", { year: 2018, model: "M4", trim: "CS", edition: "CS" }],
  ["2003 BMW M3 CSL", { year: 2003, model: "M3", trim: "CSL", edition: "CSL" }],
  ["2012 Porsche 911 Carrera GTS", { year: 2012, model: "911", trim: "Carrera GTS", edition: "GTS" }],
  ["2019 Porsche 911 GT3 Touring", { year: 2019, model: "911", trim: "GT3", edition: "Touring" }],
  ["2019 Porsche 911 Sport Classic", { year: 2019, model: "911", trim: "Sport Classic", edition: "Sport Classic" }],
  ["2011 Porsche 911 Speedster", { year: 2011, model: "911", trim: "Speedster", edition: "Speedster" }, ["edition", "trim"]],
  ["2018 Porsche 911 Heritage Edition", { year: 2018, model: "911", trim: "Heritage Edition", edition: "Heritage" }],
  ["2020 Lincoln Navigator Signature", { year: 2020, model: "Navigator", trim: null, edition: "Signature" }],
  ["67 corvette", { year: 1967, make: "Chevrolet", model: "Corvette" }],   // a real two-digit year still reads as one
  ["sell my porsche", { make: "Porsche", model: null }],   // conversation is never a model
];
const norm = v => v ? { year: v.year || null, make: v.make || null, model: v.model || null, trim: v.trim || null, trimNumber: v.trimNumber || null, edition: v.edition || null, wheelbase: v.wheelbase || null, variant: v.variant || null, series: v.series || null } : null;
for (const [words, want, buyGap = []] of CASES) {
  let mc = null, buy = null;
  try { const r = await resolveVehicle(words, {}); mc = r && r.vehicle ? norm(r.vehicle) : null; } catch (e) { fail(`${words}: resolveVehicle threw ${e.message}`); continue; }
  try { const pq = parseQuery(words); buy = norm(await resolveForBuy(pq.text || words, {})); } catch (e) { fail(`${words}: resolveForBuy threw ${e.message}`); continue; }
  for (const k of Object.keys(want)) {
    if (!mc || mc[k] !== want[k]) fail(`${words}: Market Check ${k} = ${JSON.stringify(mc && mc[k])}, wanted ${JSON.stringify(want[k])}`);
    // Buy never asks, so a year it does not state stays null; the car (make/model/trim) must be the same.
    if (k !== "year" && buyGap.includes(k)) { if (buy && buy[k] === want[k]) fail(`${words}: Buy/Tasks now carries ${k}; remove it from this case's buyGap list`); else gaps++; }
    else if (k !== "year" && (!buy || buy[k] !== want[k])) fail(`${words}: Buy/Tasks ${k} = ${JSON.stringify(buy && buy[k])}, wanted ${JSON.stringify(want[k])}`);
  }
  // Same car on both paths: make, model and trim equal wherever Market Check has them.
  if (mc && buy && mc.make) for (const k of ["make", "model", "trim", "trimNumber", "wheelbase", "variant", "series", "edition"].filter(k => !buyGap.includes(k))) if ((mc[k] || null) !== (buy[k] || null)) fail(`${words}: lanes differ on ${k}: Market Check ${JSON.stringify(mc[k])} vs Buy/Tasks ${JSON.stringify(buy[k])}`);
  // Copy rules in what the resolver emits.
  for (const s of [mc && mc.model, mc && mc.trim, buy && buy.model, buy && buy.trim].filter(Boolean)) {
    if (/–|—/.test(s)) fail(`${words}: dash in "${s}"`);
    if (/\bDtm\b|\bCcxr\b/.test(s)) fail(`${words}: casing lost in "${s}"`);
  }
  if (buy && buy.make && buy.model && new RegExp(`^${buy.make}\\b`, "i").test(buy.model) && buy.model.toLowerCase() !== buy.make.toLowerCase()) fail(`${words}: model repeats the make: "${buy.model}"`);
}
console.log(bad ? `resolverLanesCheck: ${bad} failure(s)` : `resolverLanesCheck: ${CASES.length} names, one car on every lane` + (gaps ? ` (${gaps} known Buy parseQuery gaps listed for Lane B)` : ""));
process.exit(bad ? 1 : 0);
