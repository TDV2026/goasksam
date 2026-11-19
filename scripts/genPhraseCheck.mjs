// A GENERATION PHRASE IS THE GENERATION TABLE'S ROW, NEVER A TRIM AND NEVER YEARS THE CHAT MADE UP (Lane B, Nov 1 2026; reader report: "first gen Ford Capri" searched trim RS, 1968 to 1974).
// CAUSE: the resolver kept "1st" and "Mk1" as the trim and dropped "first gen", "gen 1" and "Mk I" without scoping anything; the chat's search tool, told nothing about a car with no generation row, filled a trim and years from memory.
// FIX: lib/genPhrase.js is the one reading (resolveVehicle and the chat tool use it). WHO ELSE: every car and every surface that resolves text (Find, Market Check, Sell, Tasks, Desk) and the chat tool.
// This check runs EVERY car that has a generation table through every phrase form, plus the Capri (no table) and the chat tool's filters. It fails without the fix.
//   node scripts/genPhraseCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { const u = String(url); if (/supabase|oldcarsdata|vpic|nhtsa|anthropic/i.test(u)) return new Response("[]", { status: 200 }); return realFetch(url, init); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { resolveVehicle } = await imp("lib/vehicle.js");
const G = await imp("lib/generations.js");
const GP = await imp("lib/genPhrase.js").catch(() => null);
const PHRASE_TRIM = /^(?:\d{1,2}(?:st|nd|rd|th)|mk\d{1,2}|mark\d{1,2}|gen\d{1,2})$/i, HAS_BIT = /(?:^|\s)(?:\d{1,2}(?:st|nd|rd|th)|mk\.?\d{1,2}|gen\d{1,2})(?:\s|$)/i;
const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"], ORDS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const forms = n => [`${ORD[n - 1]} gen`, `${ORDS[n - 1]} gen`, `${ORD[n - 1]} generation`, `gen ${n}`, `mk${n}`, `mk ${["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n - 1]}`];

// 1. THE CAPRI (reader report): no generation table. Nothing is a trim, nothing is a year range.
for (const t of ["first gen Ford Capri", "1st gen Ford Capri", "Ford Capri Mk1", "Ford Capri Mk I", "first generation Ford Capri", "Ford Capri gen 1"]) {
  const v = (await resolveVehicle(t)).vehicle || {};
  ok(`"${t}" has no trim (a Capri when the taxonomy answers)`, (!v.model || v.model === "Capri") && (!v.trim || /^mk\d$/i.test(v.trim)), `model=${v.model} trim=${JSON.stringify(v.trim)}`);   // the Capri has a generation table now (Mk1): the trim may be the row's own code, the typed search turns it into the generation
  ok(`"${t}" has no years of its own`, !v.year && !v.yearRange);
}
// 2. EVERY CAR WITH A GENERATION TABLE, EVERY PHRASE FORM: never a phrase-shaped trim; a car whose table is the maker's own count lands on the nth row's code (the engine binds that code to the generation and its years)
const models = [...new Set(G.CURATED_GENERATIONS.map(g => g.make + "|" + g.model))];
let n = 0, rowsHit = 0, unverified = 0;
for (const key of models) {
  const [make, model] = key.split("|");
  const rows = GP ? GP.generationRows(make, model) : [...new Map(G.generationsForModel(make, model).map(r => [r.code.split(".")[0], r])).values()];
  const safe = GP ? GP.ORDINAL_SAFE.has(key.toLowerCase()) : false;
  for (let k = 1; k <= Math.min(rows.length, 3); k++) for (const f of forms(k)) {
    const text = `${f} ${make} ${model}`;
    const v = (await resolveVehicle(text)).vehicle;
    if (!v || !v.model || sq(v.model) !== sq(model)) continue;   // a car the resolver cannot read at all is not this check's question
    n++;
    ok(`${text}: the trim is not the phrase`, (!PHRASE_TRIM.test(sq(v.trim)) && !HAS_BIT.test(String(v.trim || ''))) || rows.some(r => sq(r.code) === sq(v.trim)), `trim=${JSON.stringify(v.trim)}`);   // a model whose own generation code is shaped like the phrase (Capri and Rabbit: Mk1) carries that code, which the typed search turns into the generation
    if (safe && !/^mk\d$/.test(f.replace(/\s/g, "").toLowerCase().slice(0, 3)) || safe && rows.some(r => sq(r.code) === sq(f))) {
      const want = rows.find(r => sq(r.code) === sq(f)) || rows[k - 1];
      if (want) { rowsHit++; ok(`${text}: the generation row is ${want.code}`, sq(v.trim) === sq(want.code), `trim=${JSON.stringify(v.trim)}`); }
    } else if (!safe && !rows.some(r => sq(r.code) === sq(f))) { unverified++; ok(`${text}: a table that is not the maker's count scopes nothing`, !v.trim || !rows.some(r => sq(r.code) === sq(v.trim)), `trim=${JSON.stringify(v.trim)}`); }
  }
}
ok(`swept ${models.length} cars with a generation table`, models.length >= 50 && n > 400 && rowsHit > 100, `${n} reads, ${rowsHit} landed on a row, ${unverified} left to the engine's own question`);
// 3. A REAL TRIM THE BUYER NAMED STAYS
{ const v = (await resolveVehicle("first gen Mustang Boss 302")).vehicle || {}; ok("a trim the buyer typed stays beside the phrase", /boss/i.test(String(v.trim)), `trim=${JSON.stringify(v.trim)}`); }
// 4. THE CHAT TOOL: the model's own trim and years are dropped; a row sets the generation's years; years the buyer said win
ok("lib/genPhrase.js exists", !!GP);
if (GP) {
  const cap = GP.guardGenPhraseFilters({ make: "Ford", model: "Capri", trim: "RS", year_min: 1968, year_max: 1974 }, "first gen Ford Capri", false);
  ok("Capri: the chat's RS and 1968 are gone; the years are the generation table's own row (Mk1, 1969 to 1974, added with the Mercury Capri alias)", !cap.trim && cap.generation === "Mk1" && cap.year_min === 1969 && cap.year_max === 1974, JSON.stringify(cap));
  const mu = GP.guardGenPhraseFilters({ make: "Ford", model: "Mustang", trim: "GT", year_min: 1964, year_max: 1970 }, "first gen Mustang", false);
  ok("Mustang: the table's years, no trim", mu.year_min === 1965 && mu.year_max === 1973 && !mu.trim && mu.generation === "first", JSON.stringify(mu));
  const mb = GP.guardGenPhraseFilters({ make: "Ford", model: "Mustang", trim: "Boss 302", year_min: 1965, year_max: 1973 }, "first gen Mustang Boss 302", false);
  ok("Mustang Boss 302: the buyer's trim stays", mb.trim === "Boss 302", JSON.stringify(mb));
  const my = GP.guardGenPhraseFilters({ make: "Ford", model: "Mustang", year_min: 1966, year_max: 1967 }, "first gen Mustang 1966 to 1967", true);
  ok("years the buyer said are kept", my.year_min === 1966 && my.year_max === 1967, JSON.stringify(my));
  const p911 = GP.guardGenPhraseFilters({ make: "Porsche", model: "911", trim: "Carrera", year_min: 1964, year_max: 1973 }, "first gen 911", false);
  ok("911: a table that is not the maker's count scopes nothing the buyer did not say", !p911.trim && !p911.year_min, JSON.stringify(p911));
  const none = GP.guardGenPhraseFilters({ make: "Ford", model: "Capri", trim: "RS" }, "a Ford Capri RS", false);
  ok("no phrase, no change", none.trim === "RS");
}
// 5. WIRED, so no surface reads it differently
const vsrc = fs.readFileSync("lib/vehicle.js", "utf8"), csrc = fs.readFileSync("lib/live/samChat.js", "utf8");
ok("resolveVehicle applies the phrase", /applyGenPhrase\(r\.vehicle/.test(vsrc));
ok("the chat tool applies it before it searches", /guardGenPhraseFilters\(p, ctx\.lastUser/.test(csrc));
console.log(fail ? `genPhraseCheck: ${fail} failure(s)` : "genPhraseCheck: all pass");
process.exit(fail ? 1 : 0);
