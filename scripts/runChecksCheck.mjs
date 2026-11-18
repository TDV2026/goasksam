// RUNCHECKS CHECK (Lane C, Nov 17 2026): the check runner (scripts/runChecks.mjs) does what it says.
//   a change to a file selects the checks mapped to it (the file itself, a file under a mapped directory, a file a mapped file imports one step down);
//   an engine file selects every offline check; an ignored file selects none and is not a gap; an unmapped file prints UNCOVERED and fails the run;
//   a failing check fails the run and its first failing assertion is printed; checks run side by side, a check marked serial runs alone;
//   the map covers every check on disk, and the counts are read from what a check prints.
// Offline, in a temporary repo of two tiny checks. Mutants (each must make this check fail), run in a copy of the runner:
//   node scripts/runChecksCheck.mjs [--mutants]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), RUNNER_DIR = process.env.RUNNER_DIR || HERE;
const RUNNER = path.join(RUNNER_DIR, "runChecks.mjs");

if (process.argv.includes("--mutants")) {
  const MUT = [
    ["a covered file no longer selects its check", "if (own || direct || deep) {", "if (own || deep) {"],
    ["the engine no longer runs the full set", "if (all || engineHit) {", "if (all) {"],
    ["an unmapped file is not reported", "else uncovered.push(f); }", "else { } }"],
    ["a failing check does not fail the run", "process.exit(failed.length || sel.uncovered.length ? 1 : 0);", "process.exit(sel.uncovered.length ? 1 : 0);"],
    ["the ignore list is not applied", "if (ignoredBy(f, map.ignore)) { ignored.push(f); continue; }", ""],
    ["a file one import step down is not followed", "closure.set(n, reachDepth(graph, roots, depth));", "closure.set(n, reachDepth(graph, roots, 0));"],
    ["a serial check runs beside the others", "par = names.filter(n => !serialAll && !map.checks[n].serial)", "par = names.filter(n => !serialAll)"],
    ["a check's fail count is not read", "if (m) return { pass: +m[1], fail: +m[2] };", "if (m) return { pass: +m[1], fail: 0 };"],
    ["the checks run one at a time", "Array.from({ length: Math.min(workers, par.length) || 0 }, lane)", "Array.from({ length: Math.min(1, par.length) || 0 }, lane)"],
    ["a live check is run without --live", "const names = Object.keys(map.checks), runnable = n => map.checks[n].kind === \"offline\" || (live && map.checks[n].kind === \"live\");", "const names = Object.keys(map.checks), runnable = n => true;"],
  ];
  let bad = 0;
  for (const [what, a, b] of MUT) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcmut-")); fs.mkdirSync(path.join(tmp, "scripts"));
    for (const f of ["_checkGraph.mjs", "runChecks.mjs", "runChecksCheck.mjs"]) fs.copyFileSync(path.join(HERE, f), path.join(tmp, "scripts", f));
    const rc = path.join(tmp, "scripts", "runChecks.mjs"), src = fs.readFileSync(rc, "utf8");
    if (!src.includes(a)) { console.log("MUTANT NOT APPLIED: " + what); bad++; continue; }
    fs.writeFileSync(rc, src.replace(a, b));
    const r = spawnSync(process.execPath, [path.join(tmp, "scripts", "runChecksCheck.mjs")], { env: { ...process.env, RUNNER_DIR: path.join(tmp, "scripts") }, encoding: "utf8" });
    const caught = r.status !== 0; console.log((caught ? "caught   " : "SURVIVED ") + what); if (!caught) bad++;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad ? `runChecksCheck mutants: ${bad} not caught` : `runChecksCheck mutants: all ${MUT.length} caught`); process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const R = await import(pathToFileURL(RUNNER).href);
const { selectChecks, parseCounts } = R;

// ---- 1. selection, on a map and an import graph written here --------------------------------------------------------------------------------------------------------------------------------------
const graph = (() => { const files = new Set(["lib/a.js", "lib/b.js", "lib/c.js", "lib/d.js", "lib/engine.js", "lib/solo.js", "scripts/aCheck.mjs"]); const imports = new Map([["lib/a.js", new Set(["lib/b.js"])], ["lib/b.js", new Set(["lib/c.js"])], ["lib/c.js", new Set()], ["lib/d.js", new Set()], ["lib/engine.js", new Set()], ["lib/solo.js", new Set()]]); return { files, imports, data: new Map(), reverse: new Map() }; })();
const map = { engine: ["lib/engine.js", "data/e.json"], ignore: ["docs/", "*.md"], checks: {
  aCheck: { file: "scripts/aCheck.mjs", kind: "offline", covers: ["lib/a.js"] },
  dirCheck: { file: "scripts/dirCheck.mjs", kind: "offline", covers: ["lib/sub/"] },
  dataCheck: { file: "scripts/dataCheck.mjs", kind: "offline", covers: ["data/x.json"] },
  liveCheck: { file: "scripts/liveCheck.mjs", kind: "live", covers: ["lib/solo.js"] },
} };
const S = (files, o) => selectChecks(files, map, graph, o);
ok(S(["lib/a.js"]).selected.join() === "aCheck", "a file a check names selects that check and no other");
ok(S(["lib/b.js"]).selected.includes("aCheck") && !S(["lib/c.js"]).selected.includes("aCheck"), "a file one import step below a named file selects the check; two steps down does not (depth 1)");
ok(S(["lib/c.js"], { depth: 2 }).selected.includes("aCheck"), "with depth 2 the file two steps down selects it");
ok(S(["lib/sub/x.js"]).selected.join() === "dirCheck", "a file directly under a mapped directory selects the check");
ok(S(["data/x.json"]).selected.join() === "dataCheck", "a data file a check names selects it");
ok(S(["scripts/aCheck.mjs"]).selected.join() === "aCheck", "a changed check file selects itself");
{ const s = S(["lib/engine.js"]); ok(s.full && s.selected.join() === "aCheck,dirCheck,dataCheck", "an engine file selects every offline check (the live one is left out)"); }
ok(S(["data/e.json"]).full === true, "an engine data file selects the full set");
ok(S(["lib/engine.js"], { live: true }).selected.includes("liveCheck"), "with --live the full set includes the live checks");
{ const s = S(["docs/notes.md", "README.md"]); ok(s.selected.length === 0 && s.uncovered.length === 0 && s.ignored.length === 2, "an ignored file selects nothing and is not a gap"); }
{ const s = S(["lib/never.js"]); ok(s.uncovered.join() === "lib/never.js" && s.selected.length === 0, "a file no check covers is UNCOVERED"); }
{ const s = S(["lib/solo.js"]); ok(s.uncovered.length === 0 && s.liveOnly.length === 1 && s.selected.length === 0, "a file covered only by a live check is reported as live only, not run, not a gap"); }
ok(S([], { all: true }).selected.length === 3, "--all selects every offline check");
// ---- 2. counts -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
ok(JSON.stringify(parseCounts("x\ncheck: 12 pass, 3 FAIL\n", 1)) === '{"pass":12,"fail":3}', "counts: '12 pass, 3 FAIL'");
ok(JSON.stringify(parseCounts("check: 40 passed, 0 failed (3 views)\n", 0)) === '{"pass":40,"fail":0}', "counts: '40 passed, 0 failed'");
ok(JSON.stringify(parseCounts("PASS a\nPASS b\nFAIL c\n", 1)) === '{"pass":2,"fail":1}', "counts: PASS and FAIL lines");
ok(parseCounts("boom", 1).fail === 1 && parseCounts("fine", 0).fail === 0, "counts: no summary line, the exit status decides");
// ---- 3. the command, in a temporary repo ------------------------------------------------------------------------------------------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-")); fs.mkdirSync(path.join(tmp, "scripts")); fs.mkdirSync(path.join(tmp, "lib")); fs.mkdirSync(path.join(tmp, "docs"));
const W = (f, t) => fs.writeFileSync(path.join(tmp, f), t);
W("lib/a.js", "export const a = 1;\n"); W("lib/b.js", "export const b = 1;\n"); W("lib/engine.js", "export const e = 1;\n"); W("docs/n.md", "x\n");
const sleeper = (name, ok2) => `await new Promise(r => setTimeout(r, 1500)); console.log("${ok2 ? "" : "FAIL the first broken assertion of " + name + "\\n"}${name}: ${ok2 ? 3 : 1} pass, ${ok2 ? 0 : 1} FAIL"); process.exit(${ok2 ? 0 : 1});\n`;
W("scripts/aCheck.mjs", sleeper("aCheck", true)); W("scripts/bCheck.mjs", sleeper("bCheck", false)); W("scripts/cCheck.mjs", sleeper("cCheck", true)); W("scripts/dCheck.mjs", sleeper("dCheck", true)); W("scripts/sCheck.mjs", sleeper("sCheck", true));
W("scripts/checkMap.json", JSON.stringify({ engine: ["lib/engine.js"], ignore: ["docs/", "*.md"], checks: {
  aCheck: { file: "scripts/aCheck.mjs", kind: "offline", covers: ["lib/a.js"] }, bCheck: { file: "scripts/bCheck.mjs", kind: "offline", covers: ["lib/b.js"] },
  cCheck: { file: "scripts/cCheck.mjs", kind: "offline", covers: ["lib/a.js"] }, dCheck: { file: "scripts/dCheck.mjs", kind: "offline", covers: ["lib/a.js"] },
  sCheck: { file: "scripts/sCheck.mjs", kind: "offline", serial: "writes the shared fixture", covers: ["lib/a.js"] } } }));
const run = (...a) => { const t0 = Date.now(), r = spawnSync(process.execPath, [RUNNER, "--root", tmp, ...a], { encoding: "utf8" }); return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), secs: (Date.now() - t0) / 1000 }; };
{ const r = run("--files", "lib/a.js"); ok(r.code === 0 && /PASS  aCheck/.test(r.out) && /PASS  cCheck/.test(r.out) && /TOTAL  4 checks/.test(r.out) && !/bCheck/.test(r.out), "a change to lib/a.js runs the checks mapped to it, passes, and runs no other"); }
{ const r = run("--files", "lib/a.js", "--workers", "4"); ok(r.out.includes("(serial: sCheck: writes the shared fixture)"), "a check marked serial says so and runs alone"); ok(r.secs < 1.5 * 3 + 2.5, "the three side by side checks take about one check's time, not three (" + r.secs.toFixed(1) + " s in all, with the serial one after)"); }
{ const r = run("--files", "lib/a.js", "--serial"); ok(r.secs > 1.5 * 4 - 0.5, "with --serial the four checks run one after another (" + r.secs.toFixed(1) + " s)"); }
{ const r = run("--files", "lib/b.js"); ok(r.code === 1 && /FAIL  bCheck/.test(r.out) && /FAILURES/.test(r.out) && /bCheck: FAIL the first broken assertion of bCheck/.test(r.out), "a failing check fails the run and its first failing assertion is printed"); }
{ const r = run("--files", "lib/engine.js"); ok(/TOTAL  5 checks/.test(r.out) && r.code === 1, "an engine file runs every check (and the failing one fails the run)"); }
{ const r = run("--files", "lib/never.js"); ok(r.code === 1 && /UNCOVERED  lib\/never\.js/.test(r.out), "an unmapped file prints UNCOVERED and fails the run"); }
{ const r = run("--files", "docs/n.md"); ok(r.code === 0 && /checks selected: 0/.test(r.out) && !/UNCOVERED/.test(r.out), "an ignored file runs nothing and passes"); }
{ const r = run("--files", "lib/a.js,lib/b.js", "--list"); ok(r.code === 0 && /aCheck/.test(r.out) && /bCheck/.test(r.out) && !/PASS  /.test(r.out), "--list says what would run and runs nothing"); }
fs.rmSync(tmp, { recursive: true, force: true });
// ---- 4. the real map ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const repo = path.resolve(HERE, ".."), realMap = JSON.parse(fs.readFileSync(path.join(repo, "scripts", "checkMap.json"), "utf8"));
  const onDisk = fs.readdirSync(path.join(repo, "scripts")).filter(f => /Check\.(mjs|js)$/.test(f) && !f.startsWith("_")).map(f => f.replace(/\.(mjs|js)$/, ""));
  const missing = onDisk.filter(n => !realMap.checks[n]), stale = Object.keys(realMap.checks).filter(n => !onDisk.includes(n));
  ok(missing.length === 0, "every check on disk is in scripts/checkMap.json (run node scripts/buildCheckMap.mjs): " + missing.slice(0, 5).join(", "));
  ok(stale.length === 0, "the map names no check that is gone: " + stale.slice(0, 5).join(", "));
  ok(Object.entries(realMap.checks).filter(([, c]) => c.serial).every(([, c]) => typeof c.serial === "string" && c.serial.length > 15), "every serial check says why");
  ok(["lib/onebox.js", "lib/vehicle.js", "lib/bareModel.js", "lib/numberPhrases.js", "lib/live/search.js"].every(f => selectChecks([f], realMap, { files: new Set(), imports: new Map(), data: new Map(), reverse: new Map() }).full), "the engine files (onebox, vehicle, bareModel, numberPhrases, lib/live) each run the full set");
}
console.log(`runChecksCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
