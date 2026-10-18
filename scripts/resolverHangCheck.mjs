// A RESOLVER LOOKUP THAT NEVER ANSWERS MUST NOT HOLD A RESOLVE, AND MUST NEVER CHANGE THE CAR (Lane B2, Oct 2026; the e60 contract,
// Lane B, Oct 2026). Every lookup gives up after RESOLVER_LOOKUP_MS and the resolve answers ONE status, "lookup_timeout" ("Sam is
// still reading"), never a car resolved from the curated universe (which lacks makes and files a Cobra under Ford). Here every fetch
// hangs forever and ignores the abort signal: the first resolve must come back inside the timeout plus a margin as lookup_timeout, and
// the next ones at once (the cooldown), also lookup_timeout, with no car on any of them.
//   node scripts/resolverHangCheck.mjs     exit 1 on any failure. No network.
process.env.SUPABASE_URL = "http://127.0.0.1:9"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
process.env.RESOLVER_LOOKUP_MS = "1500";
globalThis.fetch = () => new Promise(() => {});
const { resolveVehicle } = await import("../lib/vehicle.js");
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); };
const WORDS = ["2012 Toyota Land Cruiser 200", "2001 Acura Integra Type R", "2008 Porsche 997 Carrera S"];
let first = true, longest = 0;
for (const words of WORDS) {
  const t0 = Date.now(); const r = await resolveVehicle(words, {}); const ms = Date.now() - t0; longest = Math.max(longest, ms);
  if (!r || r.status !== "lookup_timeout") fail(`${words}: with every lookup hanging wanted status lookup_timeout, got ${r && r.status}`);
  if (r && r.vehicle && r.vehicle.make) fail(`${words}: with every lookup hanging a car came back (${r.vehicle.make} ${r.vehicle.model}); the contract is no car`);
  const limit = first ? 1500 + 1200 : 500;
  if (ms > limit) fail(`${words}: took ${ms} ms with every lookup hanging (limit ${limit})`);
  first = false;
}
console.log(bad ? `resolverHangCheck: ${bad} failure(s)` : `resolverHangCheck: ${WORDS.length} names, "still reading" within the timeout, the next at once, never a car (longest ${longest} ms)`);
process.exit(bad ? 1 : 0);
