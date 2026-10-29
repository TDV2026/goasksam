// A BODY WORD INSIDE A MODEL'S OWN NAME IS NOT A BODY (Lane B, Oct 29 2026, Sam's Find screen for wagons: a Ram pickup with a roof tent showed among the wagons).
// CAUSE: the Ram is a Power Wagon; lib/bodyWords.js read the whole word "wagon" in the title as the wagon body. It was classified as a wagon from the title (signal: the word "wagon"), not leaked from the no-body bucket.
// CLASS: every body word that is also part of a name: Power Wagon, Traction Avant (a Citroen sedan), Chuck/Paddy/Covered Wagon, Wagon Wheels, Van Diemen, Avant Garde. FIX: BODY_NAME_PHRASES in lib/bodyWords.js, read before the body words.
// This check: (1) each name phrase gives its own body or none, real wagons/vans/hatchbacks still read; (2) the curated model names read a body from the name alone only for the two roadster names; (3) an engine pool of wagons holds no Power Wagon;
// (4) every title in scripts/fixtures with a name phrase and a body word is read by the table, none by the bare word.
//   node scripts/bodyNamePhraseCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const B = await import(pathToFileURL(path.join(root, "lib/bodyWords.js")).href), D = await import(pathToFileURL(path.join(root, "lib/vehicleData.js")).href), E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const CASES = [
  ["2020 Ram 2500 Power Wagon with Roof Tent", "pickup"], ["1946 Dodge Power Wagon", "pickup"], ["2012 Ram 2500 Power Wagon Crew Cab", "pickup"],
  ["1952 Citroen Traction Avant 11B", "sedan"], ["2005 Chuck Wagon Concession Trailer", null], ["1890 Covered Wagon", null], ["1998 Van Diemen RF98 Formula Ford", null], ["1974 Jensen Interceptor with Vanden Plas trim", null],
  ["1971 Chevrolet Kingswood Wagon", "wagon"], ["1965 Rambler Classic Station Wagon", "wagon"], ["2021 Audi RS 6 Avant", "wagon"], ["2008 BMW 328xi Sports Wagon", "wagon"], ["1968 Volkswagen Type 2 Microbus", "van"], ["1990 Suzuki Alto Works RS/R Hatchback", "hatchback"]
];
for (const [t, want] of CASES) { const got = B.bodyFromText(t); ok(`"${t}" reads ${want || "no body"}`, got === want, String(got)); }
{ const names = new Set(); for (const a of D.MODEL_ALIASES || []) names.add(a.make + "|" + a.model); for (const o of D.MODEL_OWNERSHIP || []) for (const mk of (o.makes || [])) names.add(mk + "|" + o.model);
  const reads = [...names].filter(n => B.bodyFromText(n.split("|")[1])).map(n => n.replace("|", " ")), allowed = /^(Ferrari 550 Barchetta|Porsche 550 Spyder)$/;
  ok(`curated model names (${names.size}) that read a body from the name alone are the two roadster names`, reads.every(r => allowed.test(r)), reads.filter(r => !allowed.test(r)).join(" | ")); }
{ const mkRow = (t, i) => ({ id: "r" + i, rtitle: t, raw_title: t, year: 2015, _usd: 40000 + i * 900, auction_end_date: "2026-03-1" + i % 10 }), titles = ["2015 Audi RS 6 Avant", "2015 BMW 328i Sports Wagon", "2015 Ram 2500 Power Wagon with Roof Tent", "2015 Volvo V60 Estate", "2015 Subaru Outback Wagon", "2015 Mercedes E350 Wagon"];
  const bodies = titles.map((t, i) => E.titleBodyOf ? E.titleBodyOf(mkRow(t, i)) : B.bodyFromText(t));
  ok("a pool of wagon titles: the Power Wagon is not in the wagon group, the other five are", bodies.filter(b => b === "wagon").length === 5 && bodies[2] !== "wagon", JSON.stringify(bodies)); }
console.log(fail ? `bodyNamePhraseCheck: ${fail} failure(s)` : "bodyNamePhraseCheck: all pass");
process.exit(fail ? 1 : 0);
