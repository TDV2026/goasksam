// Failure C repro: the resolver must never record an unrecognized model as
// verified/high-confidence. Runs the REAL resolver (free vPIC/OCD calls).
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";

const cases = ["2018 bmw 854g", "2018 bmw 850i", "2018 bmw m3", "2018 bmw 840i", "2018 bmw zx99q"];
for (const t of cases) {
  const r = await resolveVehicle(t);
  const v = r.vehicle || {};
  console.log(`"${t}"`);
  console.log(`   status=${r.status} model=${JSON.stringify(v.model)} confidence=${v.confidence} unverified=${v.unverified ?? false}`);
  if (r.clarification) console.log(`   clarification: ${JSON.stringify(r.clarification.question || r.clarification).slice(0, 90)}`);
  const san = sanitizeResolvedVehicle(v);
  if (san) console.log(`   sanitized.unverified=${san.unverified ?? false}`);
}
