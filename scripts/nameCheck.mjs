// NAME CHECK (Lane B, Oct 24 2026), offline: a Porsche 911 generation code is the pool's key, never the car's printed name.
// "Porsche 996 Carrera" prints "Porsche 911 Carrera"; "996 911" and "996/986 Carrera" are never printed. Other makes are untouched.
import { nameModelOf, relabel, yearGapNote } from "../lib/onebox.js";
let failed = 0;
const eq = (what, got, want) => { if (got !== want) { failed++; console.log(`FAIL  ${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`); } else console.log(`PASS  ${what}`); };
for (const c of ["930", "964", "993", "996", "997", "991", "992"]) eq(`Porsche ${c} prints 911`, nameModelOf("Porsche", c), "911");
eq("Porsche 911 stays 911", nameModelOf("Porsche", "911"), "911");
eq("Porsche 912 stays 912", nameModelOf("Porsche", "912"), "912");
eq("Porsche Boxster stays", nameModelOf("Porsche", "Boxster"), "Boxster");
eq("a non-Porsche 996 is untouched", nameModelOf("Acme", "996"), "996");
const s1 = relabel({ make: "Porsche", model: "996", trim: "Carrera", genCode: "996", bodyStyle: null, year: null });
eq("996 Carrera subject", s1.subject, "911 Carrera");
eq("996 Carrera spec line has no 996 in front of 911", /996\s+911/.test(s1.resolvedSpec), false);
const s2 = relabel({ make: "Porsche", model: "911", trim: "Carrera", genCode: "997", bodyStyle: null, year: 2008, yearMin: 2005, yearMax: 2012 });
eq("997 Carrera spec line has no 997 in front of 911", /997\s+911/.test(s2.resolvedSpec), false);
eq("pool without the asked year says so", yearGapNote(1967, [{ year: 1972 }, { year: 1973 }]), "None of these sales is a 1967; they are 1972 to 1973 cars. ");
eq("pool holding the asked year says nothing", yearGapNote(1967, [{ year: 1967 }, { year: 1973 }]), "");
eq("no asked year says nothing", yearGapNote(null, [{ year: 1972 }]), "");
if (failed) { console.log(`nameCheck: ${failed} failed`); process.exit(1); }
console.log("nameCheck: no printed name puts a generation code in front of 911.");
