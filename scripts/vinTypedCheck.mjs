// e99: typed equals VIN, a go or no-go gate. The identity a VIN page hands the engine and the car's name typed into Market Check name the same stored answer (lib/vinTyped.js). Offline: the real resolver and
// generation table, fake stored rows.
//   node scripts/vinTypedCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
globalThis.fetch = async () => new Response("[]", { status: 200 });
const VT = await import(pathToFileURL(path.join(root, "lib/vinTyped.js")).href).catch(() => null);
ok("lib/vinTyped.js exists", !!VT);
if (!VT) process.exit(1);
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const stored = new Map();
const deps = { resolveVehicle: V.resolveVehicle, sanitize: V.sanitizeResolvedVehicle, findGeneration: G.findGeneration, keyFor: (v, g) => S.warmAnswerKeyFor(v, g, null), readAnswer: async (e, k) => stored.get(k) || null };
// real identities, as the nightly rollout stores them
const IDS = [
  { vin: "WP0AB2965SS000001", year: 1995, make: "Porsche", model: "911", family: "911", trim: "Carrera", genCode: "993", bodyStyle: null },
  { vin: "WP0AA29972S000002", year: 2002, make: "Porsche", model: "911", family: "911", trim: "Carrera", genCode: "996", bodyStyle: null },
  { vin: "WP0CA29984S000003", year: 2004, make: "Porsche", model: "996", family: "911", trim: "Carrera", genCode: "996", bodyStyle: null },
  { vin: "WBSBL93405JR12345", year: 2005, make: "BMW", model: "M3", family: "M3", trim: null, genCode: "E46", bodyStyle: null },
  { vin: "1G1YY22G2X5100001", year: 1999, make: "Chevrolet", model: "Corvette", family: "Corvette", trim: null, genCode: "C5", bodyStyle: null }
];
const out = await VT.compareVinTyped(env, IDS, deps);
for (const r of out.rows) console.log("  ", r.text, "| vin", (r.vinKey || "").slice(0, 60), "| typed", (r.typedKey || "").slice(0, 60), "| identical", r.identical, r.diff ? JSON.stringify(r.diff) : (r.why || ""));
ok("the compare returns one row per identity with both keys", out.rows.length === IDS.length && out.rows.every(r => r.vinKey && r.typedKey));
ok("the 996 is in the set", out.rows.some(r => /996/.test(r.text)));
const altDeps = () => { let n = 0; return { ...deps, keyFor: () => (n++ % 2 === 0 ? "A|" : "B|") + "Porsche" }; };
// the gate: a difference between the two readings is reported and means no-go
const bad = await VT.compareVinTyped(env, [IDS[0]], altDeps());
ok("different keys with no stored answers is a difference and no-go", bad.go === false && bad.differ === 1, JSON.stringify(bad.differing[0] && bad.differing[0].diff));
stored.set("A|Porsche", { tier: "result", poolN: 9, cluster: [1, 2], fallbackRung: "exact", rungLabel: "x", optionsState: "none" }); stored.set("B|Porsche", { tier: "result", poolN: 9, cluster: [1, 2], fallbackRung: "exact", rungLabel: "x", optionsState: "none" });
const eq = await VT.compareVinTyped(env, [IDS[0]], altDeps());
ok("different keys with the same stored answer is identical and go", eq.go === true && eq.identical === 1);
stored.set("B|Porsche", { tier: "result", poolN: 7, cluster: [1, 2], fallbackRung: "exact", rungLabel: "x", optionsState: "none" });
const ne = await VT.compareVinTyped(env, [IDS[0]], altDeps());
ok("different keys with a different count is no-go and names the field", ne.go === false && JSON.stringify(ne.differing[0].diff) === JSON.stringify(["poolN"]));
// the real pairs: every stored-identity car reads the same key typed and by identity
const diff = out.rows.filter(r => !r.sameKey);
ok("every real identity above names the same key typed and by VIN (list the ones that do not)", diff.length === 0, diff.map(r => r.text + ": vin " + r.vinKey + " typed " + r.typedKey).join(" || "));
process.exit(failed ? 1 : 0);
