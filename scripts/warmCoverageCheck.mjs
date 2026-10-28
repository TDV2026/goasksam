// e100: every spec the nightly cross-product check reads, and every article test car, has a warm list to be in.
// Cause (run 127, Oct 28): the cross-product check computed specs that had no stored row (2 with no row, 7 stored under an older engine stamp) because no warm list names them; a visitor who typed one got the cold path.
// The class: a spec the checks or the articles name must be in the named list or the golden table (the union warm adds the live listings' specs; nothing else names a typed car). Read once by warmHits after the warm: no row, no stamp mismatch.
//   node scripts/warmCoverageCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const named = JSON.parse(fs.readFileSync(path.join(root, "scripts/warm-named.json"), "utf8")).named;
const gm = /```json golden\n([\s\S]*?)```/.exec(fs.readFileSync(path.join(root, "docs/golden-rules.md"), "utf8")), gold = gm ? JSON.parse(gm[1]).map(g => g.q).filter(Boolean) : [];
let cross = []; try { cross = JSON.parse(fs.readFileSync(path.join(root, "scripts/warm-crosscheck.json"), "utf8")).crosscheck || []; } catch {}
const listed = new Set([...named, ...gold, ...cross]);
// read on Oct 28 21:30Z (ops task warmHits over the 88 cross-product specs): no stored answer under the live stamp
const COLD = ["1965 Shelby Cobra", "1967 Shelby Cobra Roadster", "2023 Porsche 911 GT3 RS", "1986 Porsche 911 Carrera Speedster", "1991 Porsche 911 Carrera 4 Targa", "2015 Porsche 911 Carrera GTS Cabriolet", "2022 Ford Bronco", "2023 Mercedes-Benz SL-Class", "2025 Porsche 911"];
ok("the nine cross-product specs that had no stored answer are in a warm list", COLD.every(c => listed.has(c)), COLD.filter(c => !listed.has(c)).join(" | "));
// the article test cars (Sam's list)
const ARTICLE = ["2001 BMW M3", "2004 BMW M3", "1994 Porsche 911 Carrera Cabriolet", "1957 Porsche 356 Speedster", "2001 Lamborghini Diablo SE Coupe", "2020 McLaren Speedtail", "2023 Porsche 911 Carrera", "1969 Chevrolet Nova", "1972 Chevrolet K5 Blazer", "2010 Lamborghini Murcielago", "2023 Mercedes-AMG C63", "1985 Land Rover Defender 110", "1991 Acura NSX", "2005 Ford GT"];
ok("every article test car is in a warm list", ARTICLE.every(c => listed.has(c)), ARTICLE.filter(c => !listed.has(c)).join(" | "));
// the rest of the cross-product specs are reached by the top 50 and the live listings; counted, not judged (no threshold of mine)
const X = await import(pathToFileURL(path.join(root, "scripts/crossProductCheck.js")).href);
console.log(`NOTE  ${X.DEFAULT_SPECS.filter(s => !listed.has(s)).length} of ${X.DEFAULT_SPECS.length} cross-product specs are in no list (reached by the top 50 or a live listing)`);
process.exit(fail ? 1 : 0);
