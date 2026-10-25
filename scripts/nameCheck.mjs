// NAME CHECK (Lane B, Oct 24 2026), offline: a Porsche 911 generation code is the pool's key, never the car's printed name.
// "Porsche 996 Carrera" prints "Porsche 911 Carrera"; "996 911" and "996/986 Carrera" are never printed. Other makes are untouched.
import { nameModelOf, relabel, yearGapNote } from "../lib/onebox.js";
import { resolveVehicle } from "../lib/vehicle.js";
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
// EVENT NAMES (Oct 25 2026): a race or rally name in a title is not a trim; a stated 911S wins; Targa stays a body; models named like an event stay.
const read = async t => { const r = await resolveVehicle(t, {}); const v = r && r.vehicle; return v ? `${v.model}|${v.trim || ""}|${v.bodyStyle || ""}` : null; };
eq("La Carrera Panamericana 911S title reads trim S", await read("La Carrera Panamericana Class-Winning 1967 Porsche 911S Coupe"), "911|S|coupe");
eq("1967 911 Carrera Coupe still reads Carrera", await read("1967 Porsche 911 Carrera Coupe"), "911|Carrera|coupe");
eq("1973 911 Carrera RS unchanged", await read("1973 Porsche 911 Carrera RS"), "911|Carrera RS|");
eq("1988 911 Carrera Targa keeps the Targa body", await read("1988 Porsche 911 Carrera Targa"), "911|Carrera|targa");
eq("2003 911 Targa unchanged", await read("2003 Porsche 911 Targa"), "911|Targa|");
eq("1979 911 SC Targa unchanged", await read("1979 Porsche 911 SC Targa"), "911|SC|targa");
eq("Mille Miglia tribute 911L reads L", (await read("1968 Porsche 911L Mille Miglia Tribute")).split("|")[1], "L Tribute");
eq("Chevrolet Monte Carlo stays the model", (await read("1971 Chevrolet Monte Carlo")).split("|")[0], "Monte Carlo");
eq("Pontiac Le Mans GTO unchanged", await read("1964 Pontiac Le Mans GTO"), "GTO||");
eq("Ferrari 250 GT Tour de France keeps its model", (await read("1961 Ferrari 250 GT Tour de France")).split("|")[0], "250 GT");
if (failed) { console.log(`nameCheck: ${failed} failed`); process.exit(1); }
console.log("nameCheck: no printed name puts a generation code in front of 911.");
