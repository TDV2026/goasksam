// THE VIN'S OWN CAR IS NEVER RE-REFUSED BY A RE-READ OF ITS WORDS (Lane B, Oct 29 2026, vintypedlive on the live build: the 1985 Jaguar XJ12 Vanden Plas and the 2002 Ferrari 550 Maranello VINs read "This VIN does not name a car whose sales can be read, so no figures are shown.").
// WHY: the real VIN flow resolves the VIN first (a partial decode asks the model, vinConfirm chips) and only then runs vinSearchPlan, which re-read the car's words (year, make, model) and gave up unless that came back "valid". A re-read can ask a question (which XJ) or object to a year
// the VIN proves exists (a 550 Maranello registered as a 2002, which the curated production years end at 2001), so a car the flow had already accepted was refused with a line that says the VIN names no car. So typed (a question or an invalid-year answer) and VIN (a dead end) differed.
// FIX (lib/vinAsTyped.js vinSearchPlan): when the re-read is not valid the VIN's own year, make and model stand and the typed path runs on them. A VIN with no year, make or model still says so. CLASS: every VIN whose car's words the resolver does not return as "valid"; this check covers
// needs_clarification, invalid_vehicle, a timeout (null) and a valid re-read (which wins), the two live cars through the real resolver, and the missing-model case.
//   node scripts/vinPlanCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async (u) => { const x = new URL(String(u)); if (x.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const A = await import(pathToFileURL(path.join(root, "lib/vinAsTyped.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const xj = { year: 1985, make: "Jaguar", model: "XJ", nameModel: "XJ", trim: "Vanden Plas", vin: "SAJAV1345FC123456" };
const stub = r => ({ resolveVehicle: async () => r });
for (const [name, r] of [["a question (needs_clarification)", { status: "needs_clarification", vehicle: { year: 1985, make: "Jaguar", model: "XJ" }, clarification: { kind: "model" } }], ["an invalid year (invalid_vehicle)", { status: "invalid_vehicle", vehicle: { year: 1985, make: "Jaguar", model: "XJ" } }], ["a timeout (null)", null], ["no vehicle at all", { status: "lookup_timeout" }]]) {
  const p = await A.vinSearchPlan(xj, stub(r));
  ok(`re-read gives ${name}: the plan runs on the VIN's own car`, p && !p.unresolved && p.vehicle && p.vehicle.model === "XJ" && p.vehicle.year === 1985 && !p.vehicle.vin && !p.vehicle.chassis, JSON.stringify(p && (p.unresolved ? "unresolved" : p.vehicle)));
}
{ const p = await A.vinSearchPlan(xj, stub({ status: "valid", vehicle: { year: 1985, make: "Jaguar", model: "XJ12" } })); ok("a valid re-read still wins", p && p.vehicle.model === "XJ12", p && JSON.stringify(p.vehicle)); }
{ const p = await A.vinSearchPlan({ year: 1985, make: "Jaguar", vin: "SAJAV1345FC123456" }, stub(null)); ok("a VIN with no model still says so and shows no numbers", p && p.unresolved === true && /VIN does not name a car/.test(p.line || ""), p && p.line); }
{ const p = await A.vinSearchPlan({ year: 2002, make: "Ferrari", model: "550", nameModel: "550 Maranello", vin: "ZFFZR49C000123456" }, { resolveVehicle: V.resolveVehicle }); ok("the 2002 Ferrari 550 Maranello through the real resolver: a plan, not a dead end", p && !p.unresolved && p.vehicle.make === "Ferrari", p && JSON.stringify(p.unresolved ? "unresolved" : [p.vehicle.year, p.vehicle.model])); }
console.log(fail ? `vinPlanCheck: ${fail} failure(s)` : "vinPlanCheck: all pass");
process.exit(fail ? 1 : 0);
