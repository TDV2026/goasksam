// Platform-agnosticism guard: no platform identifier may appear in RANKING
// LOGIC, GATE CONDITIONS, or EVIDENCE COMPUTATION. Platform names are permitted
// ONLY in the copy library (audience/speed labels) and in stored data arrays
// (computed cells whose `platform` field is data, not logic). This test greps
// the delimited ranking ladder and the pure computation functions and fails if
// any platform name leaks into logic.
import fs from "node:fs";

const BANNED = /\b(bring\s*a\s*trailer|bringatrailer|cars\s*&\s*bids|carsandbids|pcar\s*market|pcarmarket|hagerty|hemmings|collecting\s*cars|collectingcars|car\s*&\s*classic|carandclassic|gooding|sotheby)\b/i;

let failures = 0;
const fail = (where, line, text) => { console.log(`FAIL  ${where}:${line}  ->  ${text.trim().slice(0, 120)}`); failures++; };

// Strip stored data arrays (export const X_CELLS = [ ... ];) so their `platform`
// field values are not mistaken for logic.
function stripDataArrays(src) {
  return src.replace(/export const [A-Z_]+ = \[[\s\S]*?\n\];/g, "/* data array elided */");
}

// 1) The delimited ranking ladder in the ranking module.
function checkRegion(file, startMark, endMark) {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf(startMark), end = src.indexOf(endMark);
  if (start < 0 || end < 0) { console.log(`FAIL  ${file}: could not find ${startMark}/${endMark} markers`); failures++; return; }
  const region = src.slice(start, end);
  region.split("\n").forEach((ln, i) => {
    const bare = ln.replace(/\/\/.*$/, ""); // ignore trailing line comments
    if (BANNED.test(bare)) fail(`${file} [ranking ladder]`, i + 1, ln);
  });
  console.log(`checked ${file} ranking ladder (${region.split("\n").length} lines)`);
}
checkRegion("js/result.js", "RANKING-LADDER-START", "RANKING-LADDER-END");

// 2) Pure evidence-computation modules (functions only; stored data arrays elided).
for (const file of ["lib/reserveContext.js", "lib/specializationShare.js"]) {
  if (!fs.existsSync(file)) { console.log(`skip ${file} (not present yet)`); continue; }
  const src = stripDataArrays(fs.readFileSync(file, "utf8"));
  src.split("\n").forEach((ln, i) => {
    const bare = ln.replace(/\/\/.*$/, "");
    if (BANNED.test(bare)) fail(`${file} [computation]`, i + 1, ln);
  });
  console.log(`checked ${file} computation (data arrays elided)`);
}

console.log(failures ? `\n${failures} AGNOSTICISM VIOLATION(S)` : "\nAGNOSTICISM-GUARD ALL PASS");
process.exit(failures ? 1 : 0);
