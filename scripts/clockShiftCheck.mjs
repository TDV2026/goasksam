// A PINNED DATE MEETS THE REAL CLOCK (Lane B, Nov 6 2026). Cause it guards: tasksDemoCheck wrote its fixture moments from a date in the file (Nov 5 12:00Z) and ran the REAL Task matcher, which drops an auction whose end time has
// passed by the real clock. The car ended 30 hours after the pinned date, so the check passed at 06:00 UTC on Nov 6 and was red on clean main from 18:00 UTC. scripts/clockCheck.mjs scans for a check that READS the clock; this one is the dynamic
// half it cannot be: a check that pins a calendar date while the code under it reads the real clock gives no hint in its own text. Rule: every prePush check that names a calendar date (Date.parse / new Date / Date.UTC of a "20YY-MM-DD" text)
// and does not import scripts/_fakeClock.mjs is run with the clock at +0, +3 and +60 days (scripts/_clockShift.mjs) and must pass at all three (or carry "// clock: shift-ok <reason>" saying why a date is harmless there).
// The runs are the checks' own, offline, three at a time. Usage: node scripts/clockShiftCheck.mjs [rootDir]      --mutants proves it fails on the old tasksDemoCheck.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url"; import { spawn, spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
const SHIFTS = [0, 3, 60];
// red at +0 for a reason of its own, identical on clean origin/main (listed, not hidden): the shift must still not change its answer
const RED_AT_ZERO = new Set(["buyCardAskCheck.mjs"]);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
function pinned(rootDir) {
  const pre = fs.readFileSync(path.join(rootDir, "scripts/prePush.mjs"), "utf8");
  const names = [...new Set([...pre.matchAll(/node scripts\/([A-Za-z0-9_.-]+\.m?js)/g)].map(m => m[1]))].filter(n => fs.existsSync(path.join(rootDir, "scripts", n)));
  const out = [];
  for (const n of names) { const src = fs.readFileSync(path.join(rootDir, "scripts", n), "utf8"); if (/_fakeClock\.mjs/.test(src) || /\/\/\s*clock:\s*shift-ok\b/.test(src) || n === "clockShiftCheck.mjs") continue; if (/(Date\.parse|new Date|Date\.UTC)\(\s*["`]20\d\d-\d\d-\d\d/.test(strip(src))) out.push(n); }
  return { names, out };
}
const runOne = (rootDir, n, days) => new Promise(done => { const c = spawn(process.execPath, ["--import", path.join(rootDir, "scripts/_clockShift.mjs"), path.join(rootDir, "scripts", n)], { cwd: rootDir, env: { ...process.env, CLOCK_SHIFT_DAYS: String(days) }, stdio: ["ignore", "pipe", "pipe"] }); let o = ""; c.stdout.on("data", d => o += d); c.stderr.on("data", d => o += d); const to = setTimeout(() => c.kill("SIGKILL"), 170000); c.on("close", code => { clearTimeout(to); done({ n, days, code, fails: o.split("\n").filter(l => /^FAIL/.test(l)).slice(0, 2) }); }); });
async function runAll(rootDir, list) {
  const jobs = list.flatMap(n => SHIFTS.map(d => [n, d])), res = []; let i = 0;
  await Promise.all([0, 1, 2].map(async () => { while (i < jobs.length) { const [n, d] = jobs[i++]; res.push(await runOne(rootDir, n, d)); } }));
  // a clock dependence is deterministic; a timing hiccup from three runs at once is not: a non-zero run is repeated once on its own and that answer stands
  for (let k = 0; k < res.length; k++) if (res[k].code !== 0) res[k] = await runOne(rootDir, res[k].n, res[k].days);
  return res;
}
if (args.includes("--mutants")) {
  // the old tasksDemoCheck: its fixture moments from a date written in the file
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clockshift-"));
  spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const fp = path.join(dir, "scripts/tasksDemoCheck.mjs"), src = fs.readFileSync(fp, "utf8"), m = src.replace("const NOW = Math.floor(Date.now() / 3600e3) * 3600e3, IN", "const NOW = Date.parse(\"2026-11-05T12:00:00Z\"), IN");
  if (m === src) { console.log("MUTANT NOT APPLIED"); process.exit(1); }
  fs.writeFileSync(fp, m);
  const r = spawnSync(process.execPath, [path.join(dir, "scripts/clockShiftCheck.mjs"), dir], { encoding: "utf8", timeout: 590000 }), killed = r.status !== 0 && /^FAIL .*tasksDemoCheck/m.test(r.stdout || "");
  console.log(`${killed ? "killed  " : "SURVIVED"}  a fixture moment written from a pinned date meets the real matcher`);
  fs.rmSync(dir, { recursive: true, force: true }); console.log(killed ? "\nall mutants killed" : "\n1 mutant(s) survived"); process.exit(killed ? 0 : 1);
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { names, out } = pinned(root);
ok(names.length > 100 && out.length >= 5, `found the prePush checks (${names.length}) and those that pin a date (${out.length})`);
const res = await runAll(root, out);
for (const n of out) {
  const rs = SHIFTS.map(d => res.find(r => r.n === n && r.days === d)), codes = rs.map(r => r.code);
  const good = RED_AT_ZERO.has(n) ? codes.every(c => c === codes[0]) : codes.every(c => c === 0);
  ok(good, `${n} gives the same passing answer with the clock at +${SHIFTS.join(", +")} days (exit ${codes.join(", ")}) ${rs.flatMap(r => r.fails).slice(0, 1).join("")}`);
}
console.log(`\nclockShiftCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
