// unusedWordsCheck (Lane B, Oct 23 2026, Sam's leftover-words order): offline, no network. A word in the typed search that Sam did not use
// is named back plainly ("Sam didn't use 'xyz' in this search."), never dropped; filler, the car's own words, recognised filters and the
// group-term words never trigger it; nothing is named while the car itself is still being asked.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveVehicle } = await import("../lib/vehicle.js");
const { unusedWordsOf, unusedWordsLine } = await import("../lib/live/unusedWords.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const run = async t => { const r = await resolveVehicle(t, {}); return unusedWordsOf(t, r.vehicle, r.corrections); };
const named = async (t, want) => { const u = await run(t); ok(JSON.stringify(u.unused) === JSON.stringify(want), `${JSON.stringify(t)} -> ${JSON.stringify(u.unused)}${u.line ? " : " + u.line : ""}`); };
await named("2019 porsche 911 carrera s coupe for sale", []);
await named("i want a cheap 1995 mazda miata with low miles under 15k manual please", []);
await named("vw bug 1969 restored nice runs great", ["restored", "runs", "great"]);
await named("1963 jaguar e-type roadster 36,000 miles survivor garage kept", ["survivor", "garage", "kept"]);
await named("2008 BMW M3 sedan red automatic zzgood", ["zzgood"]);
await named("1995 mazda miata wirh low miles", ["wirh"]);
await named("air cooled 911 1980 sunroof targa", ["sunroof"]);
await named("air cooled porsche under 100k manual red", []);          // the car is still being asked: nothing named
await named("", []);
ok(unusedWordsLine(["xyz"]) === "Sam didn't use 'xyz' in this search.", "one word: the plain sentence");
ok(unusedWordsLine(["a1", "b2", "c3"]) === "Sam didn't use 'a1', 'b2' or 'c3' in this search." && unusedWordsLine([]) === null, "several words and none");
console.log(bad ? `unusedWordsCheck: ${bad} failed` : "unusedWordsCheck: all passed");
process.exit(bad ? 1 : 0);
