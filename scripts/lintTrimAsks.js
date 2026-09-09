// Guard: every multi-generation nameplate in CURATED_TRIM_ASKS (js/wizard.js) MUST be
// year/generation-scoped (yearMin/yearMax), or it offers anachronistic trims across
// generations (the 1971 Corvette showing Z06/ZR1/Grand Sport bug). This is the structural
// half of the general fix: it FAILS the moment someone adds an un-gated entry for a nameplate
// whose trims changed across generations, so the class of bug can't silently come back.
//
// Run: node scripts/lintTrimAsks.js   (wired as `npm run lint:trim-asks`).
import fs from "node:fs";

// Nameplates whose trim NAMES differ across generations, so an un-scoped list is wrong.
// (911 is deliberately NOT here: its trim families - Carrera/Turbo/GT3 - are era-stable.)
const MULTI_GEN = ["corvette", "camaro", "chevelle", "mustang", "gto", "firebird", "trans am", "charger", "challenger"];

function extractEntries(src) {
  const m = src.match(/const CURATED_TRIM_ASKS\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("could not locate the CURATED_TRIM_ASKS array in js/wizard.js");
  const TRIM_911_ASK = { ask: "", chips: [] };            // stub the one external reference
  // eslint-disable-next-line no-eval
  return eval(m[1]);                                       // array of {make,model,yearMin?,yearMax?,trimRe?,chips}
}

// Returns the list of entries that are multi-generation but NOT year-scoped (the failures).
function findUngated(entries) {
  const fails = [];
  for (const e of entries) {
    if (!e || !e.model) continue;
    const isMultiGen = MULTI_GEN.some(n => { try { return e.model.test(n); } catch { return false; } });
    if (!isMultiGen) continue;
    if (e.trimRe) continue;                                // a trim-family disambiguation, not a generation ask
    const gated = typeof e.yearMin === "number" || typeof e.yearMax === "number";
    if (!gated) fails.push(String(e.model));
  }
  return fails;
}

const src = fs.readFileSync(new URL("../js/wizard.js", import.meta.url), "utf8");
let entries;
try { entries = extractEntries(src); }
catch (e) { console.error("lint:trim-asks FAIL - " + e.message); process.exit(1); }

// Self-test: the guard MUST flag a deliberately un-gated multi-generation entry, else the
// check is vacuous and would pass anything.
const selfTest = findUngated([{ make: /chevrolet/i, model: /^corvette$/i, chips: ["Base"] }]);
if (selfTest.length !== 1) {
  console.error("lint:trim-asks FAIL - guard self-test did not flag an un-gated Corvette entry; the check is not working.");
  process.exit(1);
}

const fails = findUngated(entries);
if (fails.length) {
  console.error("lint:trim-asks FAIL - multi-generation nameplate(s) not year-scoped (add yearMin/yearMax per generation):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log(`lint:trim-asks PASS - ${entries.length} entries checked, all multi-generation nameplates year-scoped, guard self-test OK.`);
