// ONE CAR FOR ONE NAME ON EVERY LANE (Lane B2, Oct 2026). The shared resolver (lib/vehicle.js resolveVehicle) is what
// Market Check and Sell call; Buy, Tasks and the Buy chat reach it through resolveForBuy (lib/live/search.js, with a
// parseQuery pass first). The same words must come out as the same car on both paths, and the name must keep its
// casing and hyphens ("CLK DTM", "SRT-10", "CCXR"; never "Dtm", "Ccxr").
//   node scripts/resolverLanesCheck.mjs     exit 1 on any failure. No vendor request (vPIC/taxonomy reads only).
// Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9";   // nothing listens here: the resolver uses its curated data
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
const { resolveVehicle } = await import("../lib/vehicle.js");
const { resolveForBuy, parseQuery, parseQueryResolved } = await import("../lib/live/search.js");
const { sanitizeResolvedVehicle } = await import("../lib/vehicle.js");
let bad = 0, gaps = 0;
let slowest = { ms: 0, words: "" };   // the longest single resolveVehicle across the names (printed at the end)
const fail = m => { bad++; console.log("FAIL " + m); };
// [typed words, expected {year, make, model, trim}] (a key left out is not checked)
const CASES = [
  ["2005 Mercedes-Benz CLK DTM", { year: 2005, make: "Mercedes-Benz", model: "CLK DTM" }],
  ["1987 Buick Regal Grand National", { year: 1987, make: "Buick", model: "Regal", trim: "Grand National" }],   // "National" was dropped as a stray word and the car read as a Regal "Grand"
  ["Buick Regal Grand National", { make: "Buick", model: "Regal", trim: "Grand National" }],
  ["1987 Buick Grand National", { year: 1987, make: "Buick", model: "Regal", trim: "Grand National" }],
  ["Buick Grand National", { make: "Buick", model: "Regal", trim: "Grand National" }],
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
  ["1998 Land Rover Defender 90", { year: 1998, make: "Land Rover", model: "Defender", wheelbase: "90" }],   // vPIC lists no 1998 Defender; the curated 1983 to 2016 range keeps it valid
  ["2004 Land Rover Defender 110", { year: 2004, make: "Land Rover", model: "Defender", wheelbase: "110" }],
  ["2012 Toyota Land Cruiser 200", { year: 2012, model: "Land Cruiser", series: "200" }],
  ["Toyota Land Cruiser 200", { model: "Land Cruiser", series: "200" }],
  ["Toyota Land Cruiser 80 Series", { make: "Toyota", model: "Land Cruiser", series: "80" }],   // no year: the 80 is the series, not 1980, and the ask keeps it
  ["Land Cruiser 60", { model: "Land Cruiser", series: "60" }],
  // A power-adder word the factory never sold on that car is a modification, not a trim (it narrowed the pool to nothing); where the factory sold it, it stays a trim.
  ["Supercharged Dart 363-Powered 1965 Ford Mustang Fastback", { year: 1965, make: "Ford", model: "Mustang", trim: "Fastback" }],
  ["1967 Chevrolet Camaro Supercharged", { year: 1967, model: "Camaro", trim: null }],
  ["2013 Ford Mustang Shelby GT500 Supercharged", { year: 2013, model: "Mustang", trim: "Shelby GT500 Supercharged" }],
  ["2016 Jaguar F-Type Supercharged", { year: 2016, model: "F-TYPE", trim: "Supercharged" }],
  ["2005 Land Rover Range Rover LWB", { year: 2005, model: "Range Rover", variant: "LWB" }],
  ["2015 Jeep Wrangler Unlimited", { year: 2015, model: "Wrangler", variant: "Unlimited" }],
  ["2008 Porsche 911 Carrera 4S", { year: 2008, model: "911", trim: "Carrera 4S" }],
  // Special editions are carried on `edition` (Lane B2). Lane B job (Oct 2026): parseQuery (lib/live/search.js)
  // used to strip "Black" (in "Black Series") as a paint colour and "Speedster" as a body filter BEFORE the words
  // ever reached resolveForBuy, so Buy/Tasks searched a different car than Market Check. Fixed by protecting both
  // phrases before colour/body stripping runs; no buyGap entries remain below.
  ["2008 Mercedes-Benz CLK 63 AMG Black Series", { year: 2008, model: "CLK-Class", trim: "CLK63 AMG", edition: "Black Series" }],
  ["2013 Mercedes-Benz SLS AMG Black Series", { year: 2013, model: "SLS AMG", trim: null, edition: "Black Series" }],
  ["Mercedes-Benz SLS AMG Black Series", { model: "SLS AMG", trim: null, edition: "Black Series" }],
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
  ["2011 Porsche 911 Speedster", { year: 2011, model: "911", trim: "Speedster", edition: "Speedster" }],
  ["2018 Porsche 911 Heritage Edition", { year: 2018, model: "911", trim: "Heritage Edition", edition: "Heritage" }],
  ["2020 Lincoln Navigator Signature", { year: 2020, model: "Navigator", trim: null, edition: "Signature" }],
  // Code-style nameplates (Lane B2, Oct 2026): chassis-style names resolve to the make the archive stores, on both paths.
  ["1970 Datsun 240Z", { year: 1970, make: "Datsun", model: "240Z" }],
  ["1972 Datsun 240Z", { year: 1972, make: "Datsun", model: "240Z" }],
  ["240Z", { make: "Datsun", model: "240Z" }],
  ["1972 Nissan 240Z", { year: 1972, make: "Datsun", model: "240Z", trim: null }],   // the archive files the early Z cars under Datsun
  ["1974 Datsun 260Z", { year: 1974, make: "Datsun", model: "260Z" }],
  ["1977 Datsun 280Z", { year: 1977, make: "Datsun", model: "280Z" }],
  ["1982 Datsun 280ZX", { year: 1982, make: "Datsun", model: "280ZX" }],
  ["1982 Nissan 280ZX", { year: 1982, make: "Datsun", model: "280ZX" }],
  ["1990 Nissan 300ZX", { year: 1990, make: "Nissan", model: "300ZX" }],
  ["300ZX", { make: "Nissan", model: "300ZX" }],
  ["1967 Toyota 2000GT", { year: 1967, make: "Toyota", model: "2000GT", trim: null }],
  ["1985 Mazda RX-7", { year: 1985, make: "Mazda", model: "RX-7", trim: null }],
  ["2004 Mazda RX-8", { year: 2004, make: "Mazda", model: "RX-8", trim: null }],
  ["1991 Toyota MR2", { year: 1991, make: "Toyota", model: "MR2", trim: null }],
  ["1991 Acura NSX", { year: 1991, make: "Acura", model: "NSX", trim: null }],
  ["2002 Honda S2000", { year: 2002, make: "Honda", model: "S2000", trim: null }],
  ["2010 Nissan GT-R", { year: 2010, make: "Nissan", model: "GT-R", trim: null }],
  ["2005 Nissan 350Z", { year: 2005, make: "Nissan", model: "350Z", trim: null }],
  ["2010 Nissan 370Z", { year: 2010, make: "Nissan", model: "370Z", trim: null }],
  ["1994 Toyota Supra", { year: 1994, make: "Toyota", model: "Supra", trim: null }],
  ["2004 Mitsubishi Evo", { year: 2004, make: "Mitsubishi", model: "Lancer Evolution", trim: null }],
  ["2015 Subaru WRX STI", { year: 2015, make: "Subaru", model: "WRX", trim: "STI" }],
  ["1966 Jaguar E-Type", { year: 1966, make: "Jaguar", model: "E-Type", trim: null }],
  ["1953 Jaguar XK120", { year: 1953, make: "Jaguar", model: "XK120", trim: null }],
  ["1974 Triumph TR6", { year: 1974, make: "Triumph", model: "TR6", trim: null }],
  ["1972 MG MGB", { year: 1972, make: "MG", model: "MGB", trim: null }],
  ["MGB", { make: "MG", model: "MGB", trim: null }],
  ["1999 Lotus Esprit", { year: 1999, make: "Lotus", model: "Esprit", trim: null }],
  ["2005 Lotus Elise", { year: 2005, make: "Lotus", model: "Elise", trim: null }],
  ["1964 Aston Martin DB5", { year: 1964, make: "Aston Martin", model: "DB5", trim: null }],
  ["1988 Ferrari Testarossa", { year: 1988, make: "Ferrari", model: "Testarossa", trim: null }],
  ["1993 Ferrari F40", { year: 1993, make: "Ferrari", model: "F40", trim: null }],
  ["1977 Ferrari 308 GTB", { year: 1977, make: "Ferrari", model: "308", trim: "GTB" }],
  ["1988 Lamborghini Countach", { year: 1988, make: "Lamborghini", model: "Countach", trim: null }],
  ["1998 Lamborghini Diablo", { year: 1998, make: "Lamborghini", model: "Diablo", trim: null }],
  ["1968 Lamborghini Miura", { year: 1968, make: "Lamborghini", model: "Miura", trim: null }],
  ["2012 Mercedes-Benz SLS AMG", { year: 2012, make: "Mercedes-Benz", model: "SLS AMG", trim: null }],
  ["1999 BMW Z3 M Coupe", { year: 1999, make: "BMW", model: "Z3", trim: "M" }],
  ["2003 BMW Z4 M", { year: 2003, make: "BMW", model: "Z4", trim: "M" }],
  ["2011 BMW 1M", { year: 2011, make: "BMW", model: "1M", trim: null }],
  ["2008 Alfa Romeo 8C", { year: 2008, make: "Alfa Romeo", model: "8C", trim: null }],
  ["2018 Alfa Romeo Giulia Quadrifoglio", { year: 2018, make: "Alfa Romeo", model: "Giulia", trim: "Quadrifoglio" }],
  ["1971 Datsun 240Z Series 1", { year: 1971, make: "Datsun", model: "240Z", trim: null, edition: "Series 1" }],
  ["1965 Jaguar E-Type Series I", { year: 1965, make: "Jaguar", model: "E-Type", edition: "Series I" }],
  // Bulk audit fixes (Lane B2, Oct 2026, scripts/resolverAudit.mjs): each was a typed form the resolver read wrongly.
  ["Ferrari LaFerrari", { make: "Ferrari", model: "LaFerrari" }],   // the make word inside a model name is not stripped
  ["Mazda Mazda3", { make: "Mazda", model: "Mazda3" }],
  ["2010 BMW M 3", { year: 2010, make: "BMW", model: "M3" }],   // a spaced model is joined: M 3, S 2000, 4 Runner, 300 ZX, 240 D
  ["Mercedes-Benz 240 D", { make: "Mercedes-Benz", model: "240D", trim: null }],
  ["Toyota 4 Runner", { make: "Toyota", model: "4Runner" }],
  ["1995 Nissan 300 ZX", { year: 1995, make: "Nissan", model: "300ZX" }],
  ["Datsun 240 Z", { make: "Datsun", model: "240Z" }],
  ["Honda S 2000", { make: "Honda", model: "S2000", trim: null }, ["model"]],   // Buy: enrichForBuy reads "2000" as a year and "S" as a possessive
  ["Land Rover Defender 110", { make: "Land Rover", model: "Defender", wheelbase: "110" }],   // wheelbase survives with no year
  ["Bentley 4.5 Litre", { make: "Bentley", model: "4\u00bd Litre", trim: null }],
  ["1928 Bentley 4.5-litre", { year: 1928, make: "Bentley", model: "4\u00bd Litre" }],
  ["Dodge Viper SRT 10", { make: "Dodge", model: "Viper", trim: "SRT-10" }],
  ["2001 Chevrolet Corvette ZR 1", { year: 2001, make: "Chevrolet", model: "Corvette", trim: "ZR1" }],
  ["Ford Mustang GT 350", { make: "Ford", model: "Mustang", trim: "GT350" }],
  ["2001 Chevrolet Camaro Z 28", { year: 2001, make: "Chevrolet", model: "Camaro", trim: "Z28" }],
  ["2002 Porsche 911 GT 3 RS", { year: 2002, make: "Porsche", model: "911", trim: "GT3 RS" }],
  ["2002 Porsche 911 Carrera4S", { year: 2002, make: "Porsche", model: "911", trim: "Carrera 4S" }],
  ["2002 Porsche 911 Carrera RS2.7", { year: 2002, make: "Porsche", model: "911", trim: "Carrera RS 2.7" }],
  ["1970 Ford F-100", { year: 1970, make: "Ford", model: "F-100", trim: null }],   // the glued F100 is not left behind as a trim
  ["1973 Jaguar E-Type Series1", { year: 1973, make: "Jaguar", model: "E-Type", trim: null, edition: "Series 1" }],
  // Body lines (Lane B2, lib/vehicleData.js BODY_LINES): a body phrase is not a model or a trim; it sets the body on every path.
  ["1995 Acura NSX-T", { year: 1995, make: "Acura", model: "NSX", trim: null, bodyStyle: "targa" }],
  ["1995 Acura NSX Targa", { year: 1995, make: "Acura", model: "NSX", trim: null, bodyStyle: "targa" }],
  ["Acura NSX T", { make: "Acura", model: "NSX", bodyStyle: "targa" }],
  ["1963 Chevrolet Corvette Split Window", { year: 1963, make: "Chevrolet", model: "Corvette", trim: null, bodyStyle: "coupe" }],
  ["Corvette Split Window", { make: "Chevrolet", model: "Corvette", bodyStyle: "coupe" }],
  // "Type R" keeps its Type (Oct 15 2026): the trim whitelist dropped "Type" and the Integra Type R read as a trim "R", then as the whole Integra line.
  ["2001 Acura Integra Type R", { year: 2001, make: "Acura", model: "Integra", trim: "Type R" }],
  ["1999 Acura Integra Type-R", { year: 1999, make: "Acura", model: "Integra", trim: "Type R" }],
  ["1989 Porsche 911 Carrera Speedster", { year: 1989, make: "Porsche", model: "911", trim: "Carrera", bodyStyle: "speedster" }],   // a factory year stays a Speedster
  ["1994 Porsche 911 Speedster", { year: 1994, make: "Porsche", model: "911", trim: "Speedster" }],
  ["M5", { make: "BMW", model: "M5" }],   // bare model codes only one make uses
  ["Z4", { make: "BMW", model: "Z4" }],
  ["X5 M", { make: "BMW" }],
  ["1M", { make: "BMW", model: "1M" }],
  ["A4", { make: "Audi", model: "A4" }],
  ["RX-7", { make: "Mazda", model: "RX-7" }],
  ["S2000", { make: "Honda", model: "S2000" }],
  ["DMC-12", { make: "DeLorean", model: "DMC-12" }],
  ["8C", { make: "Alfa Romeo", model: "8C" }],
  ["SV-1", { make: "Bricklin", model: "SV-1" }],
  ["67 corvette", { year: 1967, make: "Chevrolet", model: "Corvette" }],   // a real two-digit year still reads as one
  ["sell my porsche", { make: "Porsche", model: null }],   // conversation is never a model
];
const norm = v => v ? { year: v.year || null, make: v.make || null, model: v.model || null, trim: v.trim || null, trimNumber: v.trimNumber || null, bodyStyle: v.bodyStyle || null, edition: v.edition || null, wheelbase: v.wheelbase || null, variant: v.variant || null, series: v.series || null } : null;
for (const [words, want, buyGap = []] of CASES) {
  let mc = null, buy = null;
  try { const t0 = Date.now(); const r = await resolveVehicle(words, {}); if (Date.now() - t0 > slowest.ms) slowest = { ms: Date.now() - t0, words }; mc = r && r.vehicle ? norm(r.vehicle) : null; } catch (e) { fail(`${words}: resolveVehicle threw ${e.message}`); continue; }
  try { const r = await parseQueryResolved(words, {}); buy = norm(r.vehicle); } catch (e) { fail(`${words}: resolveForBuy threw ${e.message}`); continue; }
  for (const k of Object.keys(want)) {
    if (!mc || mc[k] !== want[k]) fail(`${words}: Market Check ${k} = ${JSON.stringify(mc && mc[k])}, wanted ${JSON.stringify(want[k])}`);
    // Buy never asks, so a year it does not state stays null; the car (make/model/trim) must be the same.
    if (k !== "year" && buyGap.includes(k)) { if (buy && buy[k] === want[k]) fail(`${words}: Buy/Tasks now carries ${k}; remove it from this case's buyGap list`); else gaps++; }
    else if (k !== "year" && (!buy || buy[k] !== want[k])) fail(`${words}: Buy/Tasks ${k} = ${JSON.stringify(buy && buy[k])}, wanted ${JSON.stringify(want[k])}`);
  }
  // Same car on both paths: make, model and trim equal wherever Market Check has them.
  if (mc && buy && mc.make) for (const k of ["make", "model", "trim", "trimNumber", "bodyStyle", "wheelbase", "variant", "series", "edition"].filter(k => !buyGap.includes(k))) if ((mc[k] || null) !== (buy[k] || null)) fail(`${words}: lanes differ on ${k}: Market Check ${JSON.stringify(mc[k])} vs Buy/Tasks ${JSON.stringify(buy[k])}`);
  // Copy rules in what the resolver emits.
  for (const s of [mc && mc.model, mc && mc.trim, buy && buy.model, buy && buy.trim].filter(Boolean)) {
    if (/–|—/.test(s)) fail(`${words}: dash in "${s}"`);
    if (/\bDtm\b|\bCcxr\b/.test(s)) fail(`${words}: casing lost in "${s}"`);
  }
  if (buy && buy.make && buy.model && new RegExp(`^${buy.make}\\b`, "i").test(buy.model) && buy.model.toLowerCase() !== buy.make.toLowerCase()) fail(`${words}: model repeats the make: "${buy.model}"`);
}
// A trim field that carries a colour or the model name (Lane B2, Oct 14 2026; the archive's own trim for VIN WP0AB2A94MS223093 is
// "Brewster Green 911 Carrera S"). Every product receives the resolved vehicle through sanitizeResolvedVehicle, so the cut is made once.
for (const [make, model, trim, want] of [
  ["Porsche", "911", "Brewster Green 911 Carrera S", "Carrera S"],
  ["Porsche", "911", "Guards Red Carrera 4S", "Carrera 4S"],
  ["BMW", "M3", "Racing Yellow M3 Competition", "Competition"],
  ["Mercedes-Benz", "CLK-Class", "Black Series", "Black Series"],
  ["Buick", "Regal", "Grand National", "Grand National"],
  ["Porsche", "911", "Carrera S", "Carrera S"],
]) { const v = sanitizeResolvedVehicle({ year: 2021, make, model, trim }); if (!v || v.trim !== want) fail(`trim "${trim}" on the ${make} ${model} came out as ${JSON.stringify(v && v.trim)}, wanted ${JSON.stringify(want)}`); }
// A Speedster for a 911 year that never had one (1986) is a confirmation on the shared resolver, not a Speedster pool of Cabriolets; a
// conversion keeps its word; the label never prints the body twice ("Speedster Speedster").
{
  const r = await resolveVehicle("1986 Porsche 911 Carrera Speedster", {});
  if (!r || r.status !== "needs_confirmation" || !/1986 Porsche 911 Cabriolet/.test(String(r.clarification && r.clarification.suggestion))) fail(`1986 911 Carrera Speedster: wanted a confirmation of the 1986 Cabriolet, got ${JSON.stringify(r && r.status)} ${JSON.stringify(r && r.clarification && r.clarification.suggestion)}`);
  for (const form of ["1986 Porsche Speedster", "86 911 Speedster", "86 porsche speedster"]) {
    const x = await resolveVehicle(form, {});
    if (!x || x.status !== "needs_confirmation" || !/1986 Porsche 911 Cabriolet/.test(String(x.clarification && x.clarification.suggestion))) fail(`${form}: wanted a confirmation of the 1986 Cabriolet, got ${JSON.stringify(x && x.status)}`);
  }
  for (const form of ["1957 Porsche Speedster", "1989 Porsche Speedster"]) {
    const x = await resolveVehicle(form, {});
    if (!x || x.status !== "valid") fail(`${form}: a factory Speedster year stays valid, got ${JSON.stringify(x && x.status)}`);
  }
  const lc = await resolveVehicle("Toyota Land Cruiser 80 Series", {});
  if (!lc || lc.status !== "needs_clarification" || !/Land Cruiser 80\. What year is it\?/.test(String(lc.clarification && lc.clarification.question))) fail(`Toyota Land Cruiser 80 Series: wanted the year ask to keep the 80, got ${JSON.stringify(lc && lc.clarification && lc.clarification.question)}`);
  const c = await resolveVehicle("1979 Porsche 911 SC Speedster", {});
  if (!c || c.status !== "needs_confirmation" || !/1979 Porsche 911 Targa/.test(String(c.clarification && c.clarification.suggestion))) fail(`1979 911 SC Speedster: wanted a confirmation of the 1979 Targa`);
  const k = await resolveVehicle("1986 Porsche 911 Carrera Speedster Conversion", {});
  if (!k || k.status !== "valid") fail(`1986 911 Carrera Speedster Conversion: a conversion keeps its word, got ${JSON.stringify(k && k.status)}`);
  const f = await resolveVehicle("1989 Porsche 911 Carrera Speedster", {});
  if (!f || !f.vehicle || /Speedster\s+Speedster/i.test(String(f.vehicle.canonicalLabel))) fail(`1989 911 Carrera Speedster: label prints the body twice: ${JSON.stringify(f && f.vehicle && f.vehicle.canonicalLabel)}`);
}
console.log(bad ? `resolverLanesCheck: ${bad} failure(s)` : `resolverLanesCheck: ${CASES.length} names, one car on every lane` + (gaps ? ` (${gaps} known Buy parseQuery gaps listed for Lane B)` : ""));
console.log(`resolverLanesCheck: longest single resolve ${(slowest.ms / 1000).toFixed(2)} s ("${slowest.words}")`);
process.exit(bad ? 1 : 0);
