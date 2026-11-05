// CONDITION TIER, NO COMMON WORD FLIPS A TIER ON ITS OWN (Lane B, Nov 5 2026, Sam's approval of the wording fix, ct2). No database, no network. Must hold, for the CLASS and for every rule in lib/conditionTier.js:
//  (1) each fixture is a listing where a common word (project, custom, incomplete, crash, collision, struck, receipts, numbers matching, factory paint, tuned, lowered, swapped, upgraded, modified,
//      salvage, rebuilt, a modifications field that says "none") used to flip the score; the signal must NOT fire (or must be the right one);
//  (2) the real cases still fire: a project car, a barn find, needs restoration, sold incomplete, custom wheels, an aftermarket exhaust, a crashed car, a salvage title, a real modifications field;
//  (3) a negated phrase counts for nothing (no aftermarket parts, never modified, not a project, free of damage, not salvage) and a tier 1 car still needs a score of 4 and 3 signals;
//  (4) the version is ct2 and the engine reads only tiers of the current version (a row left at ct1 is not assigned).
//   node scripts/tierWordsCheck.mjs [repo root]        (the ct1 rules fail it)
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const T = await import(pathToFileURL(path.join(ROOT, "lib/conditionTier.js")).href);
const bands = { n: 400, q25: 21000, q75: 64000 };
const row = (description, over = {}) => ({ listing_title: "1999 Porsche 911 Carrera", description, mileage_text: "40,000", title_status: "Clean", modifications: null, project_flag: null, ...over });
const A = (d, o) => T.assignTier(row(d, o), bands), codes = a => a.evidence.map(e => e.code);
const OWN = " One owner, service records.";   // mileage mid 0 + clean title 1 + owner 1 + service 1 = score 3, tier 2, before the sentence under test

// (1) a common word that used to flip a tier: [what, text, row override, code that must NOT appear, expected tier]
const NOT = [
  ["a finished restoration called a project", "A three-year restoration project completed in 2019." + OWN, {}, "project", 2],
  ["a project the owner finished", "The owner finished a two year project to restore it." + OWN, {}, "project", 2],
  ["not a project car", "Not a project car." + OWN, {}, "project", 2],
  ["incomplete service history", "Incomplete service history, but a clean car." + OWN, {}, "project", 2],
  ["custom paint to sample", "Custom paint to sample from the factory." + OWN, {}, "modified", 2],
  ["custom order", "A custom order from the original dealer." + OWN, {}, "modified", 2],
  ["numbers matching on a restored car", "Restored in 2018, numbers matching." + OWN, {}, "original", 2],
  ["numbers matching alone", "Numbers matching." + OWN, {}, "original", 2],
  ["a respray in factory paint colour", "Repainted in its factory paint colour." + OWN, {}, "original", 2],
  ["purchase and toll receipts", "Sold with the window sticker, a purchase receipt and toll receipts.", {}, "service", null],
  ["crash bar, crash box, collision warning", "Fitted with a crash bar and a crash box and forward collision warning." + OWN, {}, "accident", 2],
  ["a design that struck me", "The styling struck me as the best of the era." + OWN, {}, "accident", 2],
  ["by accident", "Found by accident at a small dealer." + OWN, {}, "accident", 2],
  ["free of accidents and damage", "Free of accidents and damage." + OWN, {}, "accident", 1],
  ["no aftermarket parts, never modified", "No aftermarket parts, never modified." + OWN, {}, "modified", 2],
  ["professionally tuned and serviced", "Professionally tuned and serviced by the dealer." + OWN, {}, "modified", 2],
  ["lowered the price", "The seller lowered the price after the first bid." + OWN, {}, "modified", 2],
  ["seats swapped under warranty", "The seats were swapped under warranty." + OWN, {}, "modified", 2],
  ["upgraded to the Turbo S by the factory", "Upgraded to the Turbo S specification by the factory." + OWN, {}, "modified", 2],
  ["a modifications field that says No modifications", OWN, { modifications: "No modifications" }, "modified", 2],
  ["a modifications field that says Stock", OWN, { modifications: "Stock" }, "modified", 2],
  ["a modifications field that says None noted", OWN, { modifications: "None noted." }, "modified", 2],
  ["a modifications list of none", OWN, { modifications: '["none"]' }, "modified", 2],
  ["a title status of Not salvage", OWN, { title_status: "Not salvage" }, "title_branded", 2],
  ["a title status of Clean, never rebuilt", OWN, { title_status: "Clean, never rebuilt" }, "title_branded", 2],
];
for (const [what, text, over, code, tier] of NOT) {
  const a = A(text, over);
  ok(`(1) ${what}: no ${code}`, !codes(a).includes(code) && (tier == null || a.tier === tier), `codes ${codes(a).join(",")}, tier ${a.tier}${tier != null ? ` (right: ${tier})` : ""}`);
}
ok("(1) a title status of Not clean is not a clean title +1", !codes(A(OWN, { title_status: "Not clean" })).includes("title_clean"));
// (2) the real cases still fire
const YES = [
  ["a project car", "A project car in need of work.", {}, "project", 4], ["a project", "Sold as a project.", {}, "project", 4], ["needs restoration", "Needs restoration.", {}, "project", 4],
  ["a barn find", "A genuine barn find." + OWN, {}, "project", 4], ["sold incomplete", "Sold incomplete, missing the engine.", {}, "project", 4], ["not running", "Currently not running." + OWN, {}, "project", 4],
  ["the engine project flag", OWN, { project_flag: "incomplete car" }, "project", 4],
  ["custom wheels", "Custom wheels fitted." + OWN, {}, "modified", null], ["an aftermarket exhaust", "An aftermarket exhaust." + OWN, {}, "modified", null], ["ECU tuned", "ECU tuned to 450 hp." + OWN, {}, "modified", null],
  ["lowered suspension", "Lowered suspension on coilovers." + OWN, {}, "modified", null], ["an LS engine swap", "An LS engine swap." + OWN, {}, "modified", null], ["upgraded wheels", "Upgraded wheels." + OWN, {}, "modified", null],
  ["modified", "Modified for track use." + OWN, {}, "modified", null], ["a real modifications field", OWN, { modifications: "aftermarket exhaust, coilovers" }, "modified", null],
  ["a modifications object with content", OWN, { modifications: { exhaust: "aftermarket" } }, "modified", null],
  ["crashed", "The car was crashed in 2014." + OWN, {}, "accident", null], ["struck by a deer", "It was struck by a deer in 2012." + OWN, {}, "accident", null], ["in a collision", "Involved in a collision in 2010." + OWN, {}, "accident", null],
  ["damage", "Rear damage from a claim." + OWN, {}, "accident", null], ["an accident", "It had an accident in 2009." + OWN, {}, "accident", null],
  ["service receipts", "A folder of service receipts.", {}, "service", null],
  ["unrestored", "Unrestored." + OWN, {}, "original", null], ["original paint", "Original paint." + OWN, {}, "original", null], ["never restored", "Never restored, original paint." + OWN, {}, "original", null],
  ["a salvage title", OWN, { title_status: "Salvage" }, "title_branded", 4], ["a rebuilt title", OWN, { title_status: "Rebuilt" }, "title_branded", 4],
  ["a restoration shown and not scored", "Restored in 2019." + OWN, {}, "restored", null],
];
for (const [what, text, over, code, tier] of YES) {
  const a = A(text, over);
  ok(`(2) ${what}: ${code} fires`, codes(a).includes(code) && (tier == null || a.tier === tier), `codes ${codes(a).join(",")}, tier ${a.tier}`);
}
// (3) the bar and the minimum are unchanged
let a = A("One owner, service records, no accidents, original paint, unmodified.", { mileage_text: "9,800" }); ok("(3) tier 1 still needs score 4: low miles, one owner, records, no accidents, original, stock, clean title is tier 1", a.tier === 1 && a.score >= 4);
a = A(OWN); ok("(3) score 3 is tier 2, not tier 1", a.tier === 2 && a.score === 3);
a = A("Nice car.", { mileage_text: "30,000" }); ok("(3) two signals (mileage, clean title) stay Untiered", a.tier === null && a.observed === 2);
ok("(3) MIN_SIGNALS is still 3", T.MIN_SIGNALS === 3);
// (4) version
ok("(4) the version is ct2", /^ct2-/.test(T.TIER_VERSION), T.TIER_VERSION);
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
