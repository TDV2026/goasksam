// A COLD INSTANCE LOADS THE RESOLVER'S TABLES ONCE, TOGETHER, AND NEVER MAKES A CAR WAIT FOR A REFRESH (Lane B, Oct 31 2026; Lane C measured resolveMs 249 to 745 ms on the first read of each car after a deploy, 11 to 19 ms on the second).
// WHAT THE RESOLVER READS: the make list and the alias table (first call on an instance), the model list of the car's make (first call per make), the generation table (first call, in findGeneration), and every 10 minutes each of them again.
// CAUSE: (1) the make list and the alias table were read one after the other; (2) two first calls at once each read them; (3) a make's model list and the generation table, once ten minutes old, were read again ON the request path
// (only the make list had the serve-stale rule); (4) the generation table was read only after the resolve finished. Every car on a fresh instance pays (1) and (4); every make's first car pays the model read; every ten minutes one car pays (3).
// FIX: lib/vehicle.js reads the two name tables together and shares one load among callers; a model list or generation table past its window is served and read again behind the request; primeResolver starts the name and generation tables together at the top of a One Box request.
// This check runs a fake database that takes 60 ms a read. It fails without the fix.
//   node scripts/coldResolverCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const DELAY = 60, reads = []; let inflight = 0, maxInflight = 0;
const MODELS = { porsche: ["911", "356", "944", "Cayman"], chevrolet: ["Corvette", "Camaro", "Chevelle"], ford: ["Mustang", "Bronco", "GT"], bmw: ["M3", "M5", "2002"], toyota: ["Land Cruiser", "Supra", "MR2"] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://fake.supabase.test/")) return new Response("[]", { status: 200 });
  const table = u.split("/rest/v1/")[1].split("?")[0]; reads.push(table); inflight++; maxInflight = Math.max(maxInflight, inflight);
  await new Promise(r => setTimeout(r, DELAY)); inflight--;
  let rows = [];
  if (table === "taxonomy_makes") rows = Object.keys(MODELS).map(m => ({ name: m[0].toUpperCase() + m.slice(1) }));
  else if (table === "taxonomy_models") { const slug = decodeURIComponent((/make_slug=eq\.([^&]+)/.exec(u) || [])[1] || ""); rows = (MODELS[slug] || []).map(name => ({ name, year_ranges: null })); }
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
};
const PHASE = process.env.COLD_PHASE || "";
if (!PHASE) {
  // each phase is a fresh process: a fresh instance (nothing loaded)
  const run = ph => { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), root], { env: { ...process.env, COLD_PHASE: ph }, encoding: "utf8" }); return JSON.parse(r.stdout.trim().split("\n").pop()); };
  const A = run("plain"), B = run("primed"), C = run("stale"), P = run("single");
  ok("two first calls at once read the make list once and the alias table once", A.makes === 1 && A.aliases === 1, JSON.stringify(A.reads));
  ok("the make list and the alias table are read together", A.maxInflight >= 2, "max in flight " + A.maxInflight);
  ok("two first calls at once read the generation table once", A.gens === 1, JSON.stringify(A.reads));
  ok("primeResolver: the first car on a fresh instance is at least one read round faster than without it", B.ms[0] <= P.ms[0] - DELAY * 0.5, `${B.ms[0]} ms against ${P.ms[0]} ms`);
  ok("primeResolver reads each table once", B.makes === 1 && B.gens === 1 && B.aliases === 1, JSON.stringify(B.reads));
  ok("a second car of a known make does not wait on a read", B.second === 0, B.second + " reads");
  ok("past the ten-minute window a car waits for no table read", C.ms < DELAY * 0.95, C.ms + " ms");
  ok("the tables past their window are read again behind the request, once each", C.makes === 1 && C.models === 1 && C.gens === 1, JSON.stringify(C.reads));
  ok("the answer is the same before and after the window", C.same === true);
  console.log(fail ? `coldResolverCheck: ${fail} failure(s)` : "coldResolverCheck: all pass");
  process.exit(fail ? 1 : 0);
}
let offset = 0; const realNow = Date.now; Date.now = () => realNow() + offset;
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" };
const count = t => reads.filter(x => x === t).length;
const first = async text => { const t = realNow(); const r = await V.resolveVehicle(text, {}); const v = r && (r.vehicle || r.resolved); await G.findGeneration(v || {}, env); return [realNow() - t, r]; };
const out = o => { console.log(JSON.stringify({ reads, maxInflight, makes: count("taxonomy_makes"), aliases: count("taxonomy_aliases"), models: count("taxonomy_models"), gens: count("taxonomy_generations"), ...o })); process.exit(0); };
if (PHASE === "plain") { await Promise.all([first("1995 Porsche 911 Carrera"), first("1969 Chevrolet Camaro")]); out({}); }
if (PHASE === "single") { const a = await first("1995 Porsche 911 Carrera"); out({ ms: [a[0]] }); }
if (PHASE === "primed") { if (V.primeResolver) V.primeResolver(env); const a = await first("1995 Porsche 911 Carrera"), n = reads.length, b = await first("1996 Porsche 911 Carrera"); out({ ms: [a[0], b[0]], second: reads.length - n }); }
if (PHASE === "stale") {
  const before = await first("1995 Porsche 911 Carrera"); offset += 11 * 60e3; reads.length = 0;
  const after = await first("1995 Porsche 911 Carrera"); await new Promise(r => setTimeout(r, DELAY * 3));
  out({ ms: after[0], same: JSON.stringify(before[1]) === JSON.stringify(after[1]) });
}
