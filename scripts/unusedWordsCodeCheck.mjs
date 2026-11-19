// THE FIND PAGE NEVER NAMES A PIECE OF THE CAR'S OWN NAME AS A WORD "SAM DIDN'T USE" (Lane B, Oct 29 2026, Sam's live check on 84c54259: Find "Audi RS 6 Avant" printed "Sam didn't use 'rs' in this search.").
// WHERE IT COMES FROM: lib/live/unusedWords.js (Sam's Oct 23 order: a typed word the search did not use is named back plainly). The engine compares each typed word with the words of the resolved car's name. The car resolved to the model RS6 (the spaced typing "RS 6" read as one code),
// so the typed word "RS" matched no word of the car ("rs6"), and the line named it: a leak of how the search was parsed, for a word that IS the car. WHAT IT MEANS: nothing for the buyer; the search used "RS 6" in full.
// FIX: typed words that only differ from a word of the car's name by spaces or hyphens are the car's own words (two or three typed words are joined and tried). The line stays for words that really are left over (sunroof, a misspelling), as Sam ordered.
// CLASS: every spaced code of every make (Audi RS/S/A/Q/R, BMW M/X/Z, Mazda RX/MX, Mercedes SL/C/E, Porsche GT, De Tomaso, Rolls Royce); this check runs a table through unusedWordsOf and shows real leftovers still named.
//   node scripts/unusedWordsCodeCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const U = await import(pathToFileURL(path.join(root, "lib/live/unusedWords.js")).href);
const T = [["Audi RS 6 Avant", { make: "Audi", model: "RS6", trim: "Avant" }], ["2022 Audi RS 6 Avant", { make: "Audi", model: "RS6", trim: "Avant", year: 2022 }], ["2018 Audi RS 3", { make: "Audi", model: "RS3", year: 2018 }], ["Audi R 8", { make: "Audi", model: "R8" }],
  ["Audi S 4 Avant", { make: "Audi", model: "S4", trim: "Avant" }], ["Audi Q 7", { make: "Audi", model: "Q7" }], ["BMW M 3 Coupe", { make: "BMW", model: "M3", bodyStyle: "coupe" }], ["BMW X 5", { make: "BMW", model: "X5" }], ["BMW Z 4", { make: "BMW", model: "Z4" }],
  ["Mazda RX 7", { make: "Mazda", model: "RX-7" }], ["Mazda MX 5 Miata", { make: "Mazda", model: "MX-5", trim: "Miata" }], ["Mercedes SL 500", { make: "Mercedes-Benz", model: "SL500" }], ["Mercedes C 63 AMG", { make: "Mercedes-Benz", model: "C63", trim: "AMG" }],
  ["Porsche 911 GT 3", { make: "Porsche", model: "911", trim: "GT3" }], ["Rolls Royce Silver Shadow", { make: "Rolls-Royce", model: "Silver Shadow" }]];
for (const [typed, veh] of T) { const u = U.unusedWordsOf(typed, veh, null); ok(`"${typed}": no leftover word is named`, u.unused.length === 0 && !u.line, JSON.stringify(u.unused)); }
{ const u = U.unusedWordsOf("Audi RS 6 Avant sunroof", { make: "Audi", model: "RS6", trim: "Avant" }, null); ok("a real leftover word is still named (sunroof)", JSON.stringify(u.unused) === '["sunroof"]' && u.line === "Sam didn't use 'sunroof' in this search.", JSON.stringify(u)); }
{ const u = U.unusedWordsOf("Audi RS 7 Avant", { make: "Audi", model: "RS6", trim: "Avant" }, null); ok("a code that is not the car's (RS 7 against RS6) is not hidden", u.unused.length > 0, JSON.stringify(u.unused)); }
console.log(fail ? `unusedWordsCodeCheck: ${fail} failure(s)` : "unusedWordsCodeCheck: all pass");
process.exit(fail ? 1 : 0);
