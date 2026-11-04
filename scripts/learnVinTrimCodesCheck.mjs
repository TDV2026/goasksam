// learnVinTrimCodes builds its table from sales and applies nothing (lane-b-vinpool). No database: rows in, table out.
//   node scripts/learnVinTrimCodesCheck.mjs
import fs from "node:fs";
import { learnTable, printTable, prefixOf } from "../lib/vinTrimLearn.js";
import { VIN_TRIM_RULES } from "../lib/vinTrimCodes.js";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const sale = (vin, t) => ({ make: "Porsche", model: "911", year: 2005, vin_norm: vin, listing_title: `2005 Porsche 911 ${t} Coupe 6-Speed` });
const rows = [...Array.from({ length: 4 }, (_, i) => sale("WP0AA29985S71613" + i, "Carrera")), ...Array.from({ length: 3 }, (_, i) => sale("WP0AA29985S71614" + i, "Carrera 4")),
  ...Array.from({ length: 5 }, (_, i) => sale("WP0AB29985S71615" + i, "Carrera S")), ...Array.from({ length: 3 }, (_, i) => sale("WP0AC29985S71616" + i, i ? "GT3" : "Turbo")), sale("WP0AD29985S716170", "Carrera")];
const t = learnTable(rows, { min: 3 }), by = p => t.find(x => x.prefix === p);
ok("a prefix is positions 4 to 8 of a 17 character VIN", prefixOf("WP0AA29985S716137") === "AA299" && prefixOf("short") === null);
ok("AA299 (Carrera and Carrera 4) is one trim family with 7 sales", by("AA299") && by("AA299").kind === "family" && by("AA299").n === 7, JSON.stringify(by("AA299")));
ok("AB299 (Carrera S) is a single trim with 5 sales", by("AB299") && by("AB299").kind === "single" && by("AB299").n === 5);
ok("AC299 (GT3 and Turbo) splits across trims", by("AC299") && by("AC299").kind === "split");
ok("a prefix under the minimum is left out", !by("AD299"));
const text = printTable(t);
ok("the table prints make by make with the trims and their sales", /== Porsche/.test(text) && /carrera s \(5\)/.test(text) && /FAMILY/.test(text) && /SPLIT/.test(text));
ok("it applies nothing: the live table still holds only the two 997 rows", VIN_TRIM_RULES.length === 2 && VIN_TRIM_RULES.every(r => /^Sam/.test(r.source)));
{ const src = fs.readFileSync(new URL("./learnVinTrimCodes.mjs", import.meta.url), "utf8"), lib = fs.readFileSync(new URL("../lib/vinTrimLearn.js", import.meta.url), "utf8");
  ok("the script and its library never write: no file write, no insert, no PATCH", !/writeFileSync|appendFileSync|method:\s*"(POST|PATCH|PUT|DELETE)"|vinTrimCodes/.test((src + lib).replace(/\/\/.*$/gm, ""))); }
console.log(fail ? `learnVinTrimCodesCheck: ${fail} failure(s)` : "learnVinTrimCodesCheck: all pass");
process.exit(fail ? 1 : 0);
