// SAME WORDS, SAME CAR, WHETHER OR NOT A LIVE READ ANSWERS (Lane B2, Oct 2026). The resolver reads a make's model list from
// OldCarsData when the taxonomy table is empty or unreachable. A failed read used to be cached as an empty list, so "Honda S 2000"
// resolved with a model on one request and with none on the next. Every outside read here fails; the curated data alone must
// give the same car, twice in a row. No network, no vendor request.
//   node scripts/resolverOfflineCheck.mjs     exit 1 on any failure. Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
globalThis.fetch = async () => { throw new Error("network down (resolverOfflineCheck)"); };
const { resolveVehicle } = await import("../lib/vehicle.js");
let bad = 0;
const CASES = [
  ["Honda S 2000", { make: "Honda", model: "S2000" }],
  ["2002 Honda S 2000", { year: 2002, make: "Honda", model: "S2000" }],
  ["Mercedes-Benz 240 D", { make: "Mercedes-Benz", model: "240D" }],
  ["2010 BMW M 3", { year: 2010, make: "BMW", model: "M3" }],
];
for (let pass = 1; pass <= 2; pass++) for (const [words, want] of CASES) {
  const r = await resolveVehicle(words, {}); const v = r && r.vehicle;
  for (const k of Object.keys(want)) if (!v || v[k] !== want[k]) { bad++; console.log(`FAIL pass ${pass}: ${words}: ${k} = ${JSON.stringify(v && v[k])}, wanted ${JSON.stringify(want[k])}`); }
}
console.log(bad ? `resolverOfflineCheck: ${bad} failure(s)` : `resolverOfflineCheck: ${CASES.length} names, same car on both passes with every outside read failing`);
process.exit(bad ? 1 : 0);
