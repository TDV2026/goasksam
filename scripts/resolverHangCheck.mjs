// A resolver lookup that never answers must not hold a resolve (Lane B2, Oct 2026). Every lookup (taxonomy store, vPIC, the VIN decoder)
// gives up after RESOLVER_LOOKUP_MS (4 s) and the car resolves from the typed words and the curated data. Here every fetch hangs forever
// and ignores the abort signal; the first resolve must come back inside the timeout plus a margin with the right car, and the next ones fast.
//   node scripts/resolverHangCheck.mjs     exit 1 on any failure. No network.
process.env.SUPABASE_URL = "http://127.0.0.1:9"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
process.env.RESOLVER_LOOKUP_MS = "1500";
globalThis.fetch = () => new Promise(() => {});
const { resolveVehicle } = await import("../lib/vehicle.js");
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); };
const WANT = [["2012 Toyota Land Cruiser 200", "Land Cruiser"], ["2001 Acura Integra Type R", "Integra"], ["2008 Porsche 997 Carrera S", "997"]];
let first = true, longest = 0;
for (const [words, model] of WANT) {
  const t = Date.now(); const r = await resolveVehicle(words, {}); const ms = Date.now() - t; longest = Math.max(longest, ms);
  if (!r || r.status !== "valid" || !r.vehicle || r.vehicle.model !== model) fail(`${words}: with every lookup hanging wanted model ${model}, got ${JSON.stringify(r && r.vehicle && r.vehicle.model)} (${r && r.status})`);
  if (ms > (first ? 3000 : 500)) fail(`${words}: took ${ms} ms with every lookup hanging (limit ${first ? 3000 : 500})`);
  first = false;
}
console.log(bad ? `resolverHangCheck: ${bad} failure(s)` : `resolverHangCheck: lookups hang forever, ${WANT.length} names resolved, longest ${(longest / 1000).toFixed(2)} s`);
process.exit(bad ? 1 : 0);
