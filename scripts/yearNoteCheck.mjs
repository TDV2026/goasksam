// e96: a range whose sales do not include the typed year says so (the 2010 Murcielago read the 2008 to 2009 cars and printed "2008 to 2009" without saying no 2010 sale was in it).
// Fake archive, no database.   node scripts/yearNoteCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const note = (poolYears, typed, tier = "result") => { const d = { tier, poolYears }; return E.yearNoteOf(d, typed); };
ok("typed 2010, pool 2008 to 2009: the note says no 2010 sales and names the cars", note([2008, 2009], 2010) === "No 2010 sales here, only 2008 to 2009 cars.", String(note([2008, 2009], 2010)));
ok("typed 2010, pool 2009 only: single year", note([2009, 2009], 2010) === "No 2010 sales here, only 2009 cars.");
ok("typed year inside the pool: no note", note([2008, 2010], 2010) === null);
ok("no pool years: no note", note(null, 2010) === null);
console.log(failed ? `yearNoteCheck: ${failed} FAIL` : "yearNoteCheck: all PASS");
process.exit(failed ? 1 : 0);
