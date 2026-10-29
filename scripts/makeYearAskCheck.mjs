// WHICH MAKE? ASKS FIRST, WITH THE MODELS THAT EXISTED THAT YEAR (Lane B, Oct 29 2026, Sam's make plus year test on live Market Check).
// FAULT 1: the chips were the make's models over all years: 1969 chevrolet offered Silverado, 1967 ford Model A, 1972 datsun 280ZX and both Z and 240Z, 1998 toyota FJ Cruiser, 2010 lamborghini Huracan, Aventador and Diablo,
//   2020 mclaren MP4-12C and 650S. CAUSE: modelSuggestionChips ranked the make's archive models by recent sales with no production years behind them (the year filter was a short curated list of production rules).
//   FIX (lib/vehicle.js askModelsForMakeYear): a model is offered when its make, model and year are in the taxonomy (year_ranges), a curated rule, or, where the taxonomy has no years, the Daily Vroom import calculator's list
//   (lib/calculatorYears.js); a model in production with few sales still appears; one with unknown years appears only on sales in the window; sales count orders them; a family and its model are one chip.
// FAULT 2: "1995 porsche" answered the 911 and "1985 land rover" answered the Range Rover (8 sales, none in 1985) while the Defender 110 had 17 in 1985. CAUSE: "A make with exactly one known model resolves silently" took vPIC's
//   list of models for the year when it had one name; vPIC's year list is incomplete (it names only the 911 for a 1995 Porsche). FIX: two or more models with ASK_MODEL_MIN (8) sales in the year's window ask first.
// The live sweep (task makeyearsweep) showed the same car as two chips ("928" and "928 GTS", "SL-Class" and "SL55", "Z" and "240Z", an accent) and a motorcycle as a model; the mock now carries each.
// The queries below, the exact chip set each must offer (in order), against a taxonomy and an archive built for them, a vPIC that names one model, and a make with one model that still resolves silently.
//   node scripts/makeYearAskCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const R = (a, b) => [a, b];
// taxonomy_models: [name, year_ranges or null (a curated rule or the calculator fills it)]
const TAX = {
  porsche: [["911", null], ["928", [R(1978, 1995)]], ["928 GTS", null], ["968", [R(1992, 1995)]], ["968 Club Sport", null], ["968 Sport", null], ["944", [R(1982, 1991)]], ["356", [R(1950, 1965)]]],
  bmw: [["Other Motorcycles", null], ["3-Series", null], ["M3", [R(1986, 2026)]], ["5-Series", null], ["Z4", [R(2003, 2026)]]],
  chevrolet: [["Corvette", null], ["Camaro", null], ["Chevelle", [R(1964, 1977)]], ["Nova", [R(1962, 1979)]], ["Impala", null], ["Silverado", null]],
  "mercedes-benz": [["SL-Class", [R(1954, 2026)]], ["SL55", null], ["E-Class", null], ["S-Class", null], ["CLK-Class", [R(1997, 2009)]]],
  ford: [["Mustang", null], ["Fairlane", [R(1955, 1970)]], ["Thunderbird", [R(1955, 1997)]], ["Model A", null]],
  datsun: [["Z", null], ["240Z", [R(1970, 1973)]], ["280ZX", [R(1979, 1983)]], ["510", [R(1968, 1973)]]],
  toyota: [["Corolla", null], ["Camry", null], ["Land Cruiser", [R(1951, 2026)]], ["Supra", null], ["4Runner", [R(1984, 2026)]], ["FJ Cruiser", null]],
  lamborghini: [["Gallardo", null], ["Murcielago", null], ["Murcielago LP640", null], ["Huracan", null], ["Aventador", null], ["Diablo", null]],
  mclaren: [["720S", null], ["570S", null], ["GT", [R(2019, 2026)]], ["MP4-12C", null], ["650S", null], ["Senna", null]],
  "land-rover": [["Defender 110", null], ["Range Rover", null], ["Discovery", null]],
  lotus: [["Esprit", [R(1976, 2004)]]]
};
// sales_archive: [year, model, model_family, count]
const S = {
  porsche: [[1995, "928 GTS", "928 GTS", 9], [1995, "968 Sport", "968 Sport", 9], [1995, "968 Club Sport", "968 Club Sport", 9], [1995, "911", "911", 22], [1994, "911", "911", 8], [1995, "928", "928", 12], [1995, "968", "968", 9], [1995, "944", "944", 6]],
  bmw: [[1990, "Other Motorcycles", "Other Motorcycles", 30], [1990, "3-Series", "3-Series", 20], [1990, "M3", "M3", 12], [1990, "5-Series", "5-Series", 9], [1990, "Z4", "Z4", 2]],
  chevrolet: [[1969, "Corvette", "Corvette", 80], [1969, "Camaro", "Camaro", 60], [1969, "Chevelle", "Chevelle", 40], [1969, "Impala", "Impala", 15], [1969, "Nova", "Nova", 12], [1969, "Silverado", "Silverado", 9]],
  "mercedes-benz": [[2005, "SL55", "SL55", 9], [2005, "SL-Class", "SL-Class", 12], [2005, "E-Class", "E-Class", 10], [2005, "S-Class", "S-Class", 9], [2005, "CLK-Class", "CLK-Class", 8]],
  ford: [[1967, "Mustang", "Mustang", 50], [1967, "Fairlane", "Fairlane", 14], [1967, "Thunderbird", "Thunderbird", 10], [1967, "Model A", "Model A", 9]],
  datsun: [[1972, "240Z", "Z", 25], [1972, "510", "510", 12], [1972, "280ZX", "280ZX", 2]],
  toyota: [[1998, "Corolla", "Corolla", 40], [1998, "Camry", "Camry", 30], [1998, "Land Cruiser", "Land Cruiser", 20], [1998, "Supra", "Supra", 15], [1998, "4Runner", "4Runner", 12], [1998, "FJ Cruiser", "FJ Cruiser", 9]],
  lamborghini: [[2010, "Murcielago LP640", "Murcielago LP640", 9], [2010, "Gallardo", "Gallardo", 30], [2010, "Murcielago", "Murcielago", 18], [2011, "Aventador", "Aventador", 9], [2010, "Diablo", "Diablo", 9], [2010, "Huracan", "Huracan", 8]],
  mclaren: [[2020, "720S", "720S", 20], [2020, "570S", "570S", 14], [2020, "GT", "GT", 9], [2020, "MP4-12C", "MP4-12C", 9], [2020, "650S", "650S", 9]],
  "land-rover": [[1985, "Defender 110", "Defender 110", 17], [1984, "Range Rover", "Range Rover", 8], [1985, "Discovery", "Discovery", 9]],
  lotus: [[1995, "Esprit", "Esprit", 9]]
};
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
globalThis.fetch = async (url) => {
  const u = new URL(String(url)), p = u.pathname;
  if (u.hostname.includes("nhtsa")) {
    const m = /getmodelsformakeyear\/make\/([^/]+)\/modelyear/i.exec(p), mk = m && slug(decodeURIComponent(m[1]));
    const t = mk && (TAX[mk] || TAX[mk === "mercedes" ? "mercedes-benz" : mk]);
    return new Response(JSON.stringify({ Results: t ? [{ Model_Name: t[0][0], Make_Name: mk }] : [] }), { status: 200 });   // vPIC names ONE model
  }
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["Porsche", "BMW", "Chevrolet", "Mercedes-Benz", "Ford", "Datsun", "Toyota", "Lamborghini", "McLaren", "Land Rover", "Lotus"].map(name => ({ name }))), { status: 200 });
  if (p.endsWith("/taxonomy_models")) { const mk = (u.searchParams.get("make_slug") || "").replace(/^eq\./, ""); return new Response(JSON.stringify((TAX[mk] || []).map(([name, yr]) => ({ name, year_ranges: yr }))), { status: 200 }); }
  if (p.endsWith("/sales_archive")) {
    const mk = slug((u.searchParams.get("make") || "").replace(/^ilike\./, "")), key = mk === "mercedes" ? "mercedes-benz" : mk;
    const ys = u.searchParams.getAll("year"), lo = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), hi = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const rows = (S[key] || []).filter(([y]) => y >= lo && y <= hi).flatMap(([year, model, model_family, n]) => Array.from({ length: n }, () => ({ year, model, model_family })));
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const NS = "Not sure";
const CASES = [
  ["1995 porsche", ["911", "968", "928"]],                                   // fault 2: the 911 no longer answers alone; the 944 (ended 1991) is not offered
  ["1990 bmw", ["3-Series", "M3", "5-Series"]],                              // the Z4 (2003 on) is not offered
  ["1969 chevrolet", ["Corvette", "Camaro", "Chevelle", "Impala", "Nova"]],  // never Silverado
  ["2005 mercedes", ["SL-Class", "E-Class", "S-Class", "CLK-Class"]],
  ["1967 ford", ["Mustang", "Fairlane", "Thunderbird"]],                     // never Model A
  ["1972 datsun", ["Z", "510"]],                                             // one chip for the family and its 240Z, never the 280ZX
  ["1998 toyota", ["Corolla", "Camry", "Land Cruiser", "Supra", "4Runner"]], // never FJ Cruiser
  ["2010 lamborghini", ["Gallardo", "Murcielago"]],                          // never Huracan, Aventador or Diablo
  ["2020 mclaren", ["720S", "570S", "GT"]],                                  // never MP4-12C or 650S
  ["1985 land rover", ["Defender 110", "Range Rover"]]                       // fault 2: the Range Rover (8 sales, none in 1985) no longer answers alone; no Discovery (1989 on)
];
for (const [q, want] of CASES) {
  const r = await V.resolveVehicle(q, {});
  const chips = (r.clarification && r.clarification.chips) || [];
  ok(`"${q}" asks which model before any range`, r.status === "needs_clarification" && !(r.vehicle && r.vehicle.model), `${r.status} ${r.vehicle && r.vehicle.model}`);
  ok(`"${q}": exactly ${want.join(", ")}, then Not sure`, JSON.stringify(chips) === JSON.stringify([...want, NS]), chips.join(" | "));
}
{ const r = await V.resolveVehicle("1995 porsche 968", {}); ok("1995 porsche 968 answers without asking", r.status === "valid" && r.vehicle && r.vehicle.model === "968", `${r.status} ${r.vehicle && r.vehicle.model}`); }
{ const r = await V.resolveVehicle("1995 lotus", {}); ok("a make with one model that year still resolves silently", r.status === "valid" && r.vehicle && r.vehicle.model === "Esprit", `${r.status} ${r.vehicle && r.vehicle.model}`); }
// the production year rule on its own
{
  const C = await import(pathToFileURL(path.join(root, "lib/calculatorYears.js")).href).catch(() => null);
  ok("the calculator fills a model the taxonomy has no years for (Huracan 2014 to 2024)", !!C && JSON.stringify(C.calculatorYearsFor("Lamborghini", "Huracan")) === "[[2014,2024]]");
  ok("a family takes the spans of its variants (Corvette C1 to C8, 1983 a gap)", !!C && JSON.stringify(C.calculatorYearsFor("Chevrolet", "Corvette")) === "[[1953,1982],[1984,2026]]");
  ok("a gap stays a gap (Supra 1981 to 2002 and 2019 on, Ford GT 2005 to 2006 and 2017 to 2022)", !!C && JSON.stringify(C.calculatorYearsFor("Toyota", "Supra")) === "[[1981,2002],[2019,2026]]" && JSON.stringify(C.calculatorYearsFor("Ford", "GT")) === "[[2005,2006],[2017,2022]]");
  ok("the Dodge Daytona is 1984 to 1993 for the question (the calculator says 1992 to 2005)", !!C && JSON.stringify(C.chipYearOverride("Dodge", "Daytona")) === "[[1984,1993]]");
  ok("Silverado starts in 1999 for the question (the calculator's own span starts at the 1960 C10)", !!C && JSON.stringify(C.chipYearOverride("Chevrolet", "Silverado")) === "[[1999,2026]]");
}
console.log(fail ? `makeYearAskCheck: ${fail} failure(s)` : "makeYearAskCheck: all pass");
process.exit(fail ? 1 : 0);
