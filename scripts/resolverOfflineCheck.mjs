// SAME WORDS, SAME ANSWER, WHETHER OR NOT A LIVE READ ANSWERS (Lane B2, Oct 2026; e60 contract, Lane B, Oct 2026).
// Mode 1 (a database is configured but unreachable): every resolve returns the ONE status "lookup_timeout" ("Sam is still
// reading"), on both passes; it never falls to the curated universe, which lacks Saab, Bugatti and Merkur and files a
// Cobra under Ford (a different car). Mode 2 (no database configured, local runs): the curated data alone gives the same
// car twice. No network, no vendor request.
//   node scripts/resolverOfflineCheck.mjs     exit 1 on any failure. Run by scripts/prePush.mjs.
globalThis.fetch = async () => { throw new Error("network down (resolverOfflineCheck)"); };
let bad = 0;
// ---- mode 1: database configured, unreachable -> lookup_timeout, twice ----
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
process.env.RESOLVER_LOOKUP_MS = "1500";
{
  const { resolveVehicle } = await import("../lib/vehicle.js?mode=db");
  const WORDS = ["2005 Saab 9-2X", "1931 Bugatti Type 41", "1987 Merkur XR4Ti", "Lamborghini Huracan LP610-4", "1967 Shelby Cobra 427", "2012 Mercedes-Benz C63 AMG Black Series"];
  for (let pass = 1; pass <= 2; pass++) for (const words of WORDS) {
    const r = await resolveVehicle(words, {});
    if (!r || r.status !== "lookup_timeout" || (r.vehicle && r.vehicle.make)) { bad++; console.log(`FAIL mode 1 pass ${pass}: ${words}: status ${r && r.status}, make ${JSON.stringify(r && r.vehicle && r.vehicle.make)}, wanted lookup_timeout and no car`); }
  }
  console.log(bad ? `resolverOfflineCheck mode 1: ${bad} failure(s)` : `resolverOfflineCheck mode 1: ${WORDS.length} names, "still reading" on both passes with the database unreachable, never a different car`);
}
// ---- mode 2: no database configured -> the curated data gives the same car twice ----
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveVehicle } = await import("../lib/vehicle.js?mode=nodb");
const CASES = [
  ["Honda S 2000", { make: "Honda", model: "S2000" }],
  ["2002 Honda S 2000", { year: 2002, make: "Honda", model: "S2000" }],
  ["Mercedes-Benz 240 D", { make: "Mercedes-Benz", model: "240D" }],
  ["2010 BMW M 3", { year: 2010, make: "BMW", model: "M3" }],
  ["1980 Porsche 911 SC", { make: "Porsche", model: "911", trim: "SC" }],
  ["2001 BMW Z3 2.5i", { make: "BMW", model: "Z3", trim: "2.5i" }],
  ["Mercedes 280SE 3.5", { make: "Mercedes-Benz", model: "280SE 3.5", trim: null }],   // its own model since Oct 20 2026 (the W111 3.5 coupe and cabriolet)
  ["Mercedes 220SE", { make: "Mercedes-Benz", model: "220SE" }],
  ["Mercedes 300SL", { make: "Mercedes-Benz", model: "300SL" }],
  ["Find me a black manual 997 under $70k", { make: "Porsche", model: "997", trim: null }],
];
let bad2 = 0;
for (let pass = 1; pass <= 2; pass++) for (const [words, want] of CASES) {
  const r = await resolveVehicle(words, {}); const v = r && r.vehicle;
  for (const k of Object.keys(want)) if (!v || v[k] !== want[k]) { bad2++; console.log(`FAIL mode 2 pass ${pass}: ${words}: ${k} = ${JSON.stringify(v && v[k])}, wanted ${JSON.stringify(want[k])}`); }
}
console.log(bad2 ? `resolverOfflineCheck mode 2: ${bad2} failure(s)` : `resolverOfflineCheck mode 2: ${CASES.length} names, same car on both passes with every outside read failing`);
console.log((bad + bad2) ? `resolverOfflineCheck: ${bad + bad2} failure(s)` : `resolverOfflineCheck: ${WORDS_N(CASES)} names clean in both modes`);
process.exit((bad + bad2) ? 1 : 0);
function WORDS_N(c) { return c.length + 6; }
