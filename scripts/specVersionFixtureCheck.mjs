// A STORED-CORE FIXTURE USES THE ENGINE'S SPEC_V, NEVER A NUMBER OF ITS OWN (Oct 28 2026). Cause: staleMarkCheck and liveScopeCheck built a stored row with a literal `v: 11`; when the Find card work moved SPEC_V to 12 the
// engine rightly treated the fixture as an old shape, read the car as cold ("pending") and both checks failed on the merged tree though each passed on its own branch. Class: every scripts/*.mjs that writes a stored core
// (market: { v: <number>, engineVersion: ... }). This check fails on any literal version beside engineVersion.   node scripts/specVersionFixtureCheck.mjs
import fs from "node:fs";
import { SPEC_V } from "../lib/live/search.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(Number.isInteger(SPEC_V) && SPEC_V > 0, `the engine exports SPEC_V (${SPEC_V})`);
for (const f of fs.readdirSync("scripts").filter(x => /\.mjs$/.test(x) && x !== "specVersionFixtureCheck.mjs")) {
  const t = fs.readFileSync("scripts/" + f, "utf8");
  for (const m of t.matchAll(/\{\s*v:\s*(\d+)\s*,\s*engineVersion/g)) ok(false, `scripts/${f} stores a core with a literal version (v: ${m[1]}); use SPEC_V from lib/live/search.js`);
}
console.log(`specVersionFixtureCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
