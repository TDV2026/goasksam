// THE FIND EXAMPLES' PICK IS VARIED (Lane B, Nov 8 2026, crew only, not live): when the three cars are chosen, the engine prefers three different PLATFORMS, then different decades, colours and bodies; always different makes; a sold-before car first.
// A preference, not a rule: with only two platforms among the eligible cars it still fills three. (lib/live/findExamples.js chooseNext)
//   node scripts/findPickVarietyCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js";
  const muts = [
    [FE, "(used.plat.has(norm(houseName(c.row.source))) ? 0 : 20) + ", "", "(1) the platform is not preferred"],
    [FE, "(used.plat.has(norm(houseName(c.row.source))) ? 0 : 20)", "(used.plat.has(norm(houseName(c.row.source))) ? 20 : 0)", "(1) the same platform is preferred"],
    [FE, "return cands.filter(c => !makes.has(norm(c.row.make))).sort(", "return cands.filter(c => !makes.has(norm(c.row.make)) && !used.plat.has(norm(houseName(c.row.source)))).sort(", "(2) a platform already used is refused, so fewer than three are chosen"],
    [FE, "(used.dec.has(Math.floor((Number(c.row.year) || 0) / 10)) ? 0 : 10)", "0", "(3) decades are not varied"],
    [FE, "return cands.filter(c => !makes.has(norm(c.row.make))).sort(", "return cands.sort(", "(4) two cars of one make"],
    [FE, "(!haveSold && c.sold ? 1000 : 0) + ", "0 + ", "(5) a sold-before car is not first"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fpv-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/findPickVarietyCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const FE = await import(pathToFileURL(path.join(ROOT, "lib/live/findExamples.js")).href);
let id = 0;
const cand = (make, year, source, o = {}) => ({ row: { id: ++id, make, model: "X", year, source, end_time: new Date(Date.now() + (id + 5) * 36e5).toISOString() }, facts: { colour: o.colour || null, body: o.body || null }, sold: !!o.sold });
const pick = cands => { const chosen = []; for (;;) { const next = FE.chooseNext(cands.filter(c => !chosen.includes(c)), chosen); if (!next || chosen.length >= 3) break; chosen.push(next); } return chosen; };
const plats = ch => new Set(ch.map(c => c.row.source)).size, decs = ch => new Set(ch.map(c => Math.floor(c.row.year / 10))).size, makes = ch => new Set(ch.map(c => c.row.make)).size;
{ // many platforms available
  const cands = [cand("Porsche", 1995, "bringatrailer"), cand("Ferrari", 1996, "bringatrailer"), cand("BMW", 1997, "bringatrailer"), cand("Audi", 2005, "carsandbids"), cand("Lotus", 2015, "pcarmarket"), cand("Honda", 1996, "carsandbids")];
  const ch = pick(cands);
  ok("(1) three cars of three different platforms when the pool has them", ch.length === 3 && plats(ch) === 3, JSON.stringify(ch.map(c => [c.row.make, c.row.source])));
  ok("(3) and spread across decades where the pool allows it", decs(ch) >= 2, JSON.stringify(ch.map(c => c.row.year)));
  ok("(4) always three different makes", makes(ch) === 3);
}
{ // two Porsches and a Ferrari: never two of a make
  const ch = pick([cand("Porsche", 1995, "bringatrailer"), cand("Porsche", 1996, "carsandbids"), cand("Ferrari", 1997, "pcarmarket")]);
  ok("(4) never two cars of one make: the pool has two makes, so two cars", ch.length === 2 && makes(ch) === 2, JSON.stringify(ch.map(c => c.row.make)));
}
{ // only two platforms: still three cars
  const cands = [cand("Porsche", 1995, "bringatrailer"), cand("Ferrari", 1996, "bringatrailer"), cand("BMW", 1997, "carsandbids"), cand("Audi", 2005, "carsandbids")];
  const ch = pick(cands);
  ok("(2) a preference, not a rule: two platforms in the pool still fill three cars", ch.length === 3 && plats(ch) === 2 && makes(ch) === 3, JSON.stringify(ch.map(c => [c.row.make, c.row.source])));
}
{ // a sold-before car first, even on a repeated platform
  const cands = [cand("BMW", 1997, "bringatrailer", { sold: true }), cand("Porsche", 1995, "carsandbids"), cand("Ferrari", 1996, "pcarmarket")];
  const ch = pick(cands);
  ok("(5) a car sold before is chosen first, and the rest still differ by platform", ch[0].row.make === "BMW" && plats(ch) === 3, JSON.stringify(ch.map(c => c.row.make)));
}
{ // decades and colours break a platform tie; deterministic
  const cands = [cand("Porsche", 1995, "bringatrailer"), cand("Ferrari", 1996, "carsandbids"), cand("BMW", 2006, "pcarmarket"), cand("Audi", 1997, "pcarmarket")];
  const a = pick(cands), b = pick(cands.slice().reverse());
  ok("(3) the same pool gives the same three whatever order it is read in", JSON.stringify(a.map(c => c.row.id).sort()) === JSON.stringify(b.map(c => c.row.id).sort()), JSON.stringify([a.map(c => c.row.make), b.map(c => c.row.make)]));
  const have = [cand("Porsche", 1995, "bringatrailer"), cand("Ferrari", 1996, "carsandbids")], bmw = cand("BMW", 2006, "pcarmarket"), next = FE.chooseNext([bmw, cand("Audi", 1997, "pcarmarket")], have);
  ok("(3) on a platform tie the other decade is chosen (the 2006 BMW over the 1997 Audi)", next && next.row.make === "BMW", next && next.row.make);
}
console.log("\nfindPickVarietyCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
