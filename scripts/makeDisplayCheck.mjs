// Make display names, the body page basis line, and the make-join leftover word (Oct 25 2026, the LOOK pass). No database, no network.
//   node scripts/makeDisplayCheck.mjs
import { finalStamp, buildPool, buildResult } from "../lib/onebox.js";
import { unusedWordsOf } from "../lib/live/unusedWords.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ctx = (make, model) => ({ spec: { year: 1973, make, model }, resolvedCar: { make, model }, asked: 0, askCapped: false, mark: () => {}, refine: null, env: {} });
const row = { tier: "result", cards: [{ title: "x" }], rawPool: [{ year: 1973 }], resolvedCar: { year: 1973, make: "DeTomaso", model: "Pantera", nameModel: "Pantera", trim: null, bodyStyle: null } };
const a = finalStamp({ ...row }, ctx("DeTomaso", "Pantera"));
ok("a make with a display name prints in the maker's spelling", a.resolvedCar.canonicalLabel === "1973 De Tomaso Pantera", a.resolvedCar.canonicalLabel);
ok("the pool key is unchanged", a.resolvedCar.make === "DeTomaso");
const b = finalStamp({ ...row, resolvedCar: { year: 1969, make: "Chevrolet", model: "Camaro", nameModel: "Camaro" } }, ctx("Chevrolet", "Camaro"));
ok("a make without one gets no label of its own", b.resolvedCar.canonicalLabel === undefined);
const c = finalStamp({ ...row, resolvedCar: { ...row.resolvedCar, canonicalLabel: "kept" } }, ctx("DeTomaso", "Pantera"));
ok("an existing label is kept", c.resolvedCar.canonicalLabel === "kept");
const v = { make: "DeTomaso", model: "Pantera", year: 1973 };
for (const t of ["1973 De Tomaso Pantera", "1973 DE TOMASO PANTERA", "1973 DeTomaso Pantera"]) ok(`no 'de' leftover line for "${t}"`, unusedWordsOf(t, v, []).line === null);
ok("a real leftover is still named", /sunroof/.test(unusedWordsOf("1973 De Tomaso Pantera sunroof", v, []).line || ""));
ok("a stray 'de' that is not part of the make is still named", /'de'/.test(unusedWordsOf("1973 De Pantera", v, []).line || ""));
// body page basis line
const body = { tier: "result", rawPool: new Array(8).fill({ year: 2012 }), cards: [{}], basisLine: "Based on eight sales since April 2024.", windowMonthsChosen: 36, dedup: { bodyShare: { share: 6, months: 24 } } };
const d = finalStamp({ ...body }, { ...ctx("Mercedes-Benz", "C63"), refine: { body: "coupe" } });
ok("a body page that reads more sales over a longer window carries the engine's note", d.basisLine === "Based on eight sales over the last 36 months." && d.windowNote === d.basisLine && d.windowLonger === true, d.basisLine);
const e = finalStamp({ ...body, dedup: { bodyShare: { share: 8, months: 36 } } }, { ...ctx("Mercedes-Benz", "C63"), refine: { body: "coupe" } });
ok("a body page with the chip's own count keeps the engine's own basis line (no note)", !e.windowNote && !e.windowLonger && e.basisLine !== "Based on eight sales over the last 36 months.");
const f = finalStamp({ ...body }, ctx("Mercedes-Benz", "C63"));
ok("a page with no body chosen is untouched", !f.windowNote && !f.windowLonger);
process.exit(failed ? 1 : 0);
