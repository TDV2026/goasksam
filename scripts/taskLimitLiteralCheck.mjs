// TASK LIMIT LITERAL CHECK (Lane S, Nov 5 2026; the class from Lane F's audit of origin/main 27fbf471). The free Tasks limit lives in ONE place, lib/tasks/limit.js (FREE_TASK_LIMIT), and everything else READS it. A check or a page that
// writes the number (a "3" or "three" tied to Tasks) passes today and breaks the day the number changes (or a crew-only 10 is added). This check:
//   1. SCAN: no file under api, lib, public or scripts holds a literal limit (patterns below) except lib/tasks/limit.js; a line may carry `// literal-ok` with a reason (none do);
//   2. PIN: with the repo as it is, FREE_TASK_LIMIT is 3 (the live allowance stays three until Sam says otherwise in writing) and CREW_TASK_LIMIT is larger;
//   3. BOTH VALUES: every check that depends on the limit is run with the constant at 3 AND at 10 (scripts/_limitLoader.mjs rewrites the constant when it is loaded) and must pass both ways. The fast set runs always; the browser
//      checks run with --full (prePush runs the fast set);
//   4. IT FAILS ON A LITERAL: a scratch copy of a limit check with the constant replaced by 3 is run at 10 and must fail, and a fixture file holding a literal must be found by the scan.
//   node scripts/taskLimitLiteralCheck.mjs [--full] [--ref=<git ref to scan instead of the working tree>]
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SCAN_ONLY = process.argv.includes("--scan-only"), FULL = process.argv.includes("--full"), REF = (process.argv.find(a => a.startsWith("--ref=")) || "").slice(6);
export const LITERAL = /max: ?3\b|limitLine\(3\)|limitFacts\(3\)|limitEntryLine\(3\)|FREE_TASK_LIMIT ?=== ?3|three active Tasks|\b3 Tasks running|\b[0-3] of 3 Tasks|Tasks \d of 3\b|(?:working|limit|max|atLimit)\w*\s*(?:===|>=|>)\s*3\b|\bof 3 \(searches|MAX_TASKS ?= ?3|workingCount ?>= ?3|"the limit is three"|lookingCounts\(3\b/;
export function scan(files) {   // files: { path: text } -> [ "path:line: text" ]
  const hits = [];
  for (const [f, text] of Object.entries(files)) {
    if (f === "lib/tasks/limit.js" || f === "scripts/taskLimitLiteralCheck.mjs") continue;
    text.split("\n").forEach((l, i) => { if (LITERAL.test(l) && !/\/\/ literal-ok\b/.test(l)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  }
  return hits;
}
function read(ref) {
  const out = {}, dirs = ["api", "lib", "public", "scripts"];
  if (ref) {
    const names = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", ...dirs], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(f => /\.(m?js|html)$/.test(f));
    for (const f of names) { try { out[f] = execFileSync("git", ["show", `${ref}:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }); } catch {} }
    return out;
  }
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); } else if (/\.(m?js|html)$/.test(e.name) && !/^__/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8"); } };
  for (const d of dirs) if (fs.existsSync(path.join(ROOT, d))) walk(d);
  return out;
}
// The checks that depend on the limit (pendingCardFillCheck reads limitFacts only as a mock and never finishes without a network, so it is covered by the scan, not by a run). fast: no browser. tasksCrewLimitCheck is not in this list: it asserts the crew number against the free one, which the override at 10 would make equal.
export const LIMIT_CHECKS = [
  { name: "tasksLimitCheck", fast: true }, { name: "slotLimitCheck", fast: true }, { name: "standingControlsCheck", fast: true }, { name: "findWatchCheck", fast: true },
  { name: "standingNoticesCheck", fast: true }, { name: "taskCountsCheck", fast: true }, { name: "taskFiltersCheck", fast: true },
  { name: "tasksDismissCountCheck", fast: false }, { name: "tasksPageShots", fast: false }
];
function run(script, limit) {
  const env = { ...process.env }; if (limit) env.TASK_LIMIT_OVERRIDE = String(limit); else delete env.TASK_LIMIT_OVERRIDE;
  const r = spawnSync(process.execPath, [...(limit ? ["--import", "./scripts/_limitRegister.mjs"] : []), script], { cwd: ROOT, env, encoding: "utf8", timeout: 600000 });
  const out = (r.stdout || "") + (r.stderr || "");
  return { code: r.status, last: out.trim().split("\n").pop().slice(0, 120), fails: out.split("\n").filter(l => /^FAIL/.test(l)).slice(0, 2) };
}
async function main() {
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
  // 1. the scan
  const hits = scan(read(REF));
  ok(hits.length === 0, `${hits.length} hard coded limit literal(s)${REF ? " at " + REF : ""}:\n  ` + hits.slice(0, 20).join("\n  "));
  // 2. the pin
  if (SCAN_ONLY) { console.log(`taskLimitLiteralCheck (scan only): ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); }
  if (!REF) { const L = await import("../lib/tasks/limit.js"); ok(L.FREE_TASK_LIMIT === 3, "the live free limit is 3 (it changes only when Sam says so in writing)"); ok(L.CREW_TASK_LIMIT > L.FREE_TASK_LIMIT, "the crew limit is above the free limit"); }
  if (!REF) {
    // 3. both values
    for (const c of LIMIT_CHECKS.filter(c => FULL || c.fast)) {
      const f = `scripts/${c.name}.mjs`; if (!fs.existsSync(path.join(ROOT, f))) { ok(false, `${f} is listed but missing`); continue; }
      for (const lim of [0, 10]) { const r = run(f, lim); ok(r.code === 0, `${c.name} with the constant at ${lim || 3} fails (exit ${r.code}): ${r.fails.join(" | ") || r.last}`); }
    }
    // 4. it fails on a literal
    const fx = scan({ "scripts/__fixture.mjs": 'ok(s.limit.statusLine === "You have 2 of 3 Tasks running. 1 Task left.", "x");' }); ok(fx.length === 1, "the scan did not find a literal in a fixture line");
    const fx2 = scan({ "scripts/__fixture.mjs": "if (working >= 3) return blocked;" }); ok(fx2.length === 1, "the scan did not find `working >= 3`");
    const src = fs.readFileSync(path.join(ROOT, "scripts/tasksLimitCheck.mjs"), "utf8"), mut = path.join(ROOT, "scripts/__litmut_tasksLimitCheck.mjs");
    if (!/const L = FREE_TASK_LIMIT,/.test(src)) ok(false, "tasksLimitCheck no longer reads the constant into L"); else {
      fs.writeFileSync(mut, src.replace("const L = FREE_TASK_LIMIT,", "const L = 3,").replace(/from "\.\//g, 'from "./').replace(/import\("\.\.\//g, 'import("../'));
      try { const r = run("scripts/__litmut_tasksLimitCheck.mjs", 10); ok(r.code !== 0, "a limit check with the number hard coded to 3 PASSED with the constant at 10 (the check cannot see the literal)"); } finally { fs.rmSync(mut, { force: true }); }
    }
  }
  console.log(`taskLimitLiteralCheck: ${pass} pass, ${fail} FAIL${FULL ? " (full)" : ""}`); process.exit(fail ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
