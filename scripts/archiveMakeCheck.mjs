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
process.exit(failed ? 1 : 0);
