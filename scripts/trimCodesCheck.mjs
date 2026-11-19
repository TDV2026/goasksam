// A SHORT TRIM CODE IS READ AS THE TRIM'S FULL NAME, ON THE CAR IT BELONGS TO ONLY (Lane B, Oct 30 2026, the Unmet demand table: "2016 Porsche 911 C4S" read "No sale of a Porsche 911 C4S has been tracked yet." though the archive has 13 Carrera 4S sales of 2015 to 2016;
// "2007 BMW Z4 3.0" asked "M, Roadster or 30si"). CAUSE: the sales are filed under the full name and the resolver kept the typed code as the trim, which no title carries. FIX: lib/trimCodes.js, one table applied to the typed text before the resolver reads it.
// CLASS (table driven): every code in the table on its car, in a sentence and bare, and the same letters on another car are left alone. Fails without the fix.
//   node scripts/trimCodesCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname.includes("nhtsa")) return new Response(JSON.stringify({ Results: [] }), { status: 200 }); return new Response("[]", { status: 200 }); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
// [typed text, the trim the resolver must keep (null: none), the model]
const ON = [
  ["2016 Porsche 911 C4S", "Carrera 4S", "911"], ["2008 Porsche 911 C4S cabriolet", "Carrera 4S", "911"], ["2005 Porsche 911 C2S", "Carrera S", "911"], ["2003 Porsche 911 C4", "Carrera 4", "911"],
  ["2003 Porsche 911 Carrera C4S", "Carrera 4S", "911"], ["2007 BMW Z4 3.0", "3.0si", "Z4"], ["2004 BMW Z4 3.0", "3.0i", "Z4"], ["2004 BMW Z4 2.5", "2.5i", "Z4"]
];
for (const [q, trim, model] of ON) { const r = await V.resolveVehicle(q, {}), v = r.vehicle || {}; ok(`${q}: the trim is ${trim}`, v.trim === trim && v.model === model, JSON.stringify([v.model, v.trim])); }
// the same letters on another car are left alone
const OFF = [["1990 Chevrolet Corvette C4", "C4"], ["2016 Audi C4S", null], ["2006 BMW Z4 3.0", null]];
for (const [q, trim] of OFF) { const r = await V.resolveVehicle(q, {}), v = r.vehicle || {}; ok(`${q}: left alone (${trim})`, (v.trim || null) === trim && !/carrera|3\.0si|3\.0i/i.test(String(v.trim || "")), JSON.stringify([v.model, v.trim])); }
const T = await import(pathToFileURL(path.join(root, "lib/trimCodes.js")).href).catch(() => null);
ok("lib/trimCodes.js exists with its table", !!T && Array.isArray(T.TRIM_CODE_RULES) && T.TRIM_CODE_RULES.length >= 2);
console.log(fail ? `trimCodesCheck: ${fail} failure(s)` : "trimCodesCheck: all pass");
process.exit(fail ? 1 : 0);
