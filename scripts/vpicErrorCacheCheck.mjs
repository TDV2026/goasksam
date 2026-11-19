// A vPIC ERROR IS NEVER KEPT AS AN EMPTY LIST (Lane B, Nov 1 2026). CAUSE: lib/vehicle.js getVpicModelsForMakeYear and getVpicModelsForMake turned a failed call (a thrown error, an HTTP error, a body with no Results list) into [] and cached it for the life of the instance,
// so one vPIC hiccup made every car of that make and year resolve without the outside list until the instance was replaced (a year-exact model match lost, the catalog fallback skipped).
// FIX: a failed ask returns [] once, is not cached, and is not asked again for a 30 second retry window (no hammering); after it the call is made again. A real empty list (Results: [] with a good answer) is still cached.
// WHO: every make and year (year list) and every make (catalog list) on every instance. Fails without the fix.
//   node scripts/vpicErrorCacheCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let calls = 0, mode = "ok"; let off = 0; const realNow = Date.now; Date.now = () => realNow() + off;
globalThis.fetch = async (url) => { const u = String(url); if (!/vpic\.nhtsa/.test(u)) return new Response("{}", { status: 200 }); calls++;
  const make = decodeURIComponent((/make\/([^/?]+)|GetModelsForMake\/([^/?]+)/.exec(u) || [])[1] || (/GetModelsForMake\/([^/?]+)/.exec(u) || [])[1] || "");
  if (mode === "throw") throw new Error("network down");
  if (mode === "500") return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
  if (mode === "noresults") return new Response("<html>gateway</html>", { status: 200 });
  if (mode === "empty") return new Response(JSON.stringify({ Count: 0, Results: [] }), { status: 200 });
  return new Response(JSON.stringify({ Results: [{ Make_Name: make.toUpperCase(), Model_Name: "Mustang" }] }), { status: 200 }); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
ok("the two vPIC readers are exported for the check", typeof V.getVpicModelsForMakeYear === "function" && typeof V.getVpicModelsForMake === "function");
const cases = [["year list", (m, y) => V.getVpicModelsForMakeYear(m, y)], ["catalog list", (m) => V.getVpicModelsForMake(m)]];
let n = 0;
for (const [label, ask] of cases) for (const bad of ["throw", "500", "noresults"]) {
  const make = "Ford" + (++n), year = 1966; mode = bad; calls = 0;
  const a = await ask(make, year); const c1 = calls;
  const b = await ask(make, year);
  ok(`${label}, ${bad}: an error returns an empty list and is not asked again inside the retry window`, a.length === 0 && b.length === 0 && c1 === 1 && calls === 1, `calls ${calls}`);
  off += 31e3; mode = "ok";
  const c = await ask(make, year);
  ok(`${label}, ${bad}: after the window it asks again and the models come back (the error was not kept)`, calls === 2 && c.length === 1, `calls ${calls}, ${c.length} models`);
  const d = await ask(make, year);
  ok(`${label}, ${bad}: the good answer is cached`, calls === 2 && d.length === 1);
}
for (const [label, ask] of cases) { const make = "Edsel" + (++n); mode = "empty"; calls = 0; const a = await ask(make, 1958), b = await ask(make, 1958); ok(`${label}: a real empty list (a good answer with no models) is still cached`, a.length === 0 && b.length === 0 && calls === 1, `calls ${calls}`); }
Date.now = realNow;
console.log(fail ? `vpicErrorCacheCheck: ${fail} failure(s)` : "vpicErrorCacheCheck: all pass");
process.exit(fail ? 1 : 0);
