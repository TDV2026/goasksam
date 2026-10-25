// A make name is never silently turned into a different make (Sam's resolver block, Oct 25 2026). Offline resolver (no database).
//   node scripts/archiveMakeCheck.mjs
import { resolveVehicle } from "../lib/vehicle.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const read = async q => { const r = await resolveVehicle(q, {}); return { st: r && r.status, v: (r && r.vehicle) || {} }; };
for (const [q, make, model] of [
  ["1973 De Tomaso Pantera", "DeTomaso", "Pantera"], ["1973 DE TOMASO PANTERA", "DeTomaso", "Pantera"], ["1973 DeTomaso Pantera", "DeTomaso", "Pantera"],
  ["1965 Rolls Royce Silver Cloud", "Rolls-Royce", "Silver Cloud"], ["1949 Autocar C-50", "Autocar", null], ["1961 Wolseley 1500", "Wolseley", null],
  ["1935 Scott 596cc Flying Squirrel", "Scott", null], ["1950 Kurtis Sports Car", "Kurtis", null], ["1992 Porsche 911 Carrera 4 by Singer", "Porsche", "911"],
  ["2005 Suzuki Swift", "Suzuki", "Swift"], ["1969 Chevrolet Camaro", "Chevrolet", "Camaro"]
]) {
  const { st, v } = await read(q);
  ok(`${q} reads as ${make}${model ? " " + model : ""}`, v.make === make && (!model || v.model === model) && st !== "needs_confirmation", `${st} ${v.make}/${v.model}`);
}

// UNKNOWN MAKE GUARD: a make the list does not hold is asked about, never replaced by another make through a model word
for (const q of ["1970 Zorblax Camaro", "1966 Quentrix Mustang"]) {
  const { st, v } = await read(q);
  ok(`${q} asks and carries no make`, st === "needs_confirmation" && !v.make, `${st} ${v.make}`);
}
for (const q of ["1969 Camaro", "1990 Cabriolet 911", "1973 Targa 911", "1969 Camaro Z28", "2018 911 Carrera GTS", "1967 Fastback Mustang", "1987 Grand National Regal"]) {
  const { st, v } = await read(q);
  ok(`${q} still resolves without a question`, st === "valid" && !!v.make, `${st} ${v.make}/${v.model}`);
}
process.exit(failed ? 1 : 0);
