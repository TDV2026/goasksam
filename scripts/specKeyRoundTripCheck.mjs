// A SPEC KEY IS READ BACK AS THE CAR IT NAMES (Lane B, Nov 5 2026, nightly #132: the same 1963 Chevrolet Corvette read 45 sales in Market Check and Sell and 16 convertibles in Buy and Tasks, which read the stored spec row).
// FOUND while tracing the stored row: lib/_specRecompute.js recomputeOneSpecKey (the ingest recompute and scripts/recomputeSpecCache.js) read a key as [make, model, trim, genCode, bodyStyle, gearbox],
// the layout from before the year joined the key (specKeyFor writes [make, model, trim, year, genCode, bodyStyle, edition, variant, wheelbase, tx, ...]). Every position after the trim was one off, so a
// row was recomputed for a different car than its key names (no year, the generation as the body, the body as the gearbox) and written under the right key. Affects EVERY spec row the recompute touches
// (Buy, Tasks, Find cards, the landing example): a key with a body or gearbox read a gearbox of "convertible". Whether that wrote the 1963 row is shown by the first recompute after the push (enginecheck on the spec).
// Class check: for each of many cars and refines, specKeyFor then parseSpecKey gives back the same make, model, trim, year, generation, body, edition, variant, wheelbase, gearbox, and the refine's body, trim and variant.
//   node scripts/specKeyRoundTripCheck.mjs [repo root]      --mutants proves it by breaking the reader in a copy
import path from "node:path"; import fs from "node:fs"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["the old layout: the generation read as the year", s => s.replace("const [make, model, trim, year, genCode, bodyStyle, edition, variant, wheelbase, tx, rbody, rtrim, rvariant, ...rest] = p;", "const [make, model, trim, genCode, bodyStyle, tx, edition, variant, wheelbase, year, rbody, rtrim, rvariant, ...rest] = p;"), /\(1\)|\(2\)/],
    ["the gearbox is dropped", s => s.replace("if (tx) { refine.tx = tx; refine.label = tx; }", ""), /\(2\)/],
    ["a refine body is dropped", s => s.replace("if (rbody) refine.body = rbody;", ""), /\(3\)/],
    ["a mileage refine is rebuilt from a guess", s => s.replace("unsupported: extra.length > 0", "unsupported: false"), /\(4\)/],
    ["the recompute no longer reads the key through the parser", s => s.replace("const parsed = parseSpecKey(key);", "const parsed = (() => { const [make, model, trim, genCode, bodyStyle, gearbox] = JSON.parse(key); return { vehicle: { make, model, trim, year: null, bodyStyle }, genCode: null, refine: gearbox ? { tx: gearbox } : null, unsupported: false }; })();"), /\(5\)/]
  ];
  let survivors = 0;
  for (const [name, f, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skrt-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, "lib/_specRecompute.js"), src = fs.readFileSync(fp, "utf8"), m = f(src);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${name}`); survivors++; continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/specKeyRoundTripCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => /^FAIL/.test(l) && want.test(l));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const S = await imp("lib/live/search.js"), R = await imp("lib/_specRecompute.js");
const gens = (await imp("lib/generations.js")).CURATED_GENERATIONS;
const g63 = gens.find(g => /corvette/i.test(g.model) && g.yearStart <= 1963 && g.yearEnd >= 1963), g911 = gens.find(g => /911/.test(g.model) && g.yearStart <= 2005 && g.yearEnd >= 2005);
const cars = [
  { v: { make: "Chevrolet", model: "Corvette", year: 1963 }, g: g63 },
  { v: { make: "Chevrolet", model: "Corvette", year: 1963, bodyStyle: "convertible" }, g: g63 },
  { v: { make: "Porsche", model: "911", trim: "Carrera S", year: 2005, bodyStyle: "coupe" }, g: g911 },
  { v: { make: "Datsun", model: "240Z", year: 1970 }, g: null },
  { v: { make: "Land Rover", model: "Defender", year: 1990, wheelbase: "110" }, g: null },
  { v: { make: "Ford", model: "Mustang", trim: "Mach 1", year: 1969, edition: "Mach 1", variant: "428 Cobra Jet" }, g: null }
];
const refines = [null, { tx: "manual", label: "manual" }, { body: "coupe" }, { trim: "Carrera S" }, { variant: "428 Cobra Jet" }];
let n = 0, bad = [];
for (const c of cars) for (const rf of refines) {
  n++;
  const key = S.specKeyFor(c.v, c.g, rf), p = R.parseSpecKey(key);
  const want = { make: c.v.make, model: c.v.model, trim: c.v.trim || null, year: c.v.year, bodyStyle: c.v.bodyStyle || null, edition: c.v.edition || null, variant: c.v.variant || null, wheelbase: c.v.wheelbase || null };
  const same = p && Object.keys(want).every(k => p.vehicle[k] === want[k]);
  const genOk = p && (!c.g || String(p.genCode).toLowerCase() === String(c.g.code).toLowerCase() || /^\d{3}(\.\d)?$/.test(String(p.genCode)));
  const txOk = p && ((rf && rf.tx) ? p.refine && p.refine.tx === rf.tx : !(p.refine && p.refine.tx));
  const bodyOk = p && ((rf && rf.body) ? p.refine && p.refine.body === rf.body : !(p.refine && p.refine.body));
  const trimOk = p && ((rf && rf.trim) ? p.refine && p.refine.trim === rf.trim : !(p.refine && p.refine.trim));
  const varOk = p && ((rf && rf.variant) ? p.refine && p.refine.variant === rf.variant : !(p.refine && p.refine.variant));
  if (!(same && genOk && txOk && bodyOk && trimOk && varOk)) bad.push({ car: `${c.v.year} ${c.v.make} ${c.v.model}`, refine: rf, key, got: p });
}
ok(`(1) ${n} cars x refines: specKeyFor then parseSpecKey gives back the car (make, model, trim, year, body, edition, variant, wheelbase) and its generation`, bad.filter(b => true).length === 0 || false, bad.length ? JSON.stringify(bad[0]).slice(0, 400) : "");
{ const p = R.parseSpecKey(S.specKeyFor({ make: "Chevrolet", model: "Corvette", year: 1963 }, g63, null));
  ok("(1) the 1963 Corvette key is read as year 1963, no body, no gearbox", p && p.vehicle.year === 1963 && p.vehicle.bodyStyle === null && p.refine === null, JSON.stringify(p)); }
{ const p = R.parseSpecKey(S.specKeyFor({ make: "Porsche", model: "911", year: 2005 }, g911, { tx: "manual", label: "manual" }));
  ok("(2) a manual refine is read as the gearbox, not the body", p && p.refine && p.refine.tx === "manual" && !p.vehicle.bodyStyle); }
{ const p = R.parseSpecKey(S.specKeyFor({ make: "Porsche", model: "911", year: 2005 }, g911, { body: "coupe" }));
  ok("(3) a body refine is read as the body refine, not the gearbox", p && p.refine && p.refine.body === "coupe" && !p.refine.tx); }
{ const p = R.parseSpecKey(S.specKeyFor({ make: "Porsche", model: "911", year: 2005 }, g911, { miMin: 20000, miMax: 40000 }));
  ok("(4) a mileage refine is flagged unsupported, so it is left for its next real read, never rebuilt from a guess", p && p.unsupported === true); }
{ const p = R.parseSpecKey(S.specKeyFor({ make: "Porsche", model: "911", year: 2005 }, g911, null));
  ok("(4) a plain key is supported", p && p.unsupported === false); }
const src = fs.readFileSync(path.join(root, "lib/_specRecompute.js"), "utf8"), body = src.slice(src.indexOf("export async function recomputeOneSpecKey"), src.indexOf("// Ranks spec_keys"));
ok("(5) the recompute reads the key through parseSpecKey and not the old six-field destructure", /parseSpecKey\(key\)/.test(body) && !/\[make, model, trim, genCode, bodyStyle, gearbox\]/.test(body));
ok("(5) a key that cannot be rebuilt returns thin (the next read handles it), not recomputed", /unsupported\) return "thin"/.test(body));
console.log(failed ? `\nspecKeyRoundTripCheck: ${failed} FAILED` : "\nspecKeyRoundTripCheck: all passed");
process.exit(failed ? 1 : 0);
