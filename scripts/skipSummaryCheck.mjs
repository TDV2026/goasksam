// clock: real-ok Date.now() is only a module cache buster, no date is compared
// skipSummaryCheck (Lane S, Nov 5 2026). Cause it guards: tasksRunTimeCheck, run with no Supabase, printed "SKIP tasksRunTimeCheck: ..." and exited 0. prePush finds a check's result by
// its summary line "<checkName>: ...", found none, and counted a skip as a FAIL. Class: any check that can skip as a whole (no key, no Chrome, no database) must print its own summary line
// that starts with its name and says SKIP, and exit 0, so prePush can report it as a SKIP and never as a pass or a fail.
// 1) scan: every script that logs a whole-script SKIP and exits on the same line must start that line with "<scriptName>: ". 2) run: tasksRunTimeCheck with no Supabase prints such a line and exits 0, and its live mode still fails a 60% run.
// 3) mutants: the old line is caught by the scan and by the run. No network.
import fs from "node:fs"; import path from "node:path"; import { execFileSync, spawnSync } from "node:child_process";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const root = path.resolve(process.argv[2] || "."), dir = path.join(root, "scripts");
const scan = (name, src) => {
  const base = name.replace(/\.mjs$/, "");
  return src.split("\n").filter(l => /console\.log\(\s*[`"'][^`"']*SKIP/.test(l) && /process\.exit\(0\)/.test(l)).filter(l => !new RegExp("console\\.log\\(\\s*[`\"']" + base + ": [^`\"']*SKIP").test(l));
};
const bad = []; for (const n of fs.readdirSync(dir).filter(f => /\.mjs$/.test(f) && f !== "skipSummaryCheck.mjs")) { const o = scan(n, fs.readFileSync(path.join(dir, n), "utf8")); if (o.length) bad.push(n); }
ok(bad.length === 0, "every whole-script SKIP prints '<script>: ... SKIP' before exiting" + (bad.length ? ": " + bad.join(", ") : ""));

const target = path.join(dir, "tasksRunTimeCheck.mjs"), src = fs.readFileSync(target, "utf8");
const env = { PATH: process.env.PATH };   // no Supabase
const offline = spawnSync(process.execPath, [target], { env, encoding: "utf8" });
const line = (offline.stdout.match(/^tasksRunTimeCheck: .*$/m) || [""])[0];
ok(offline.status === 0 && /SKIP/.test(line) && /NOT a pass/.test(line), "offline, tasksRunTimeCheck prints 'tasksRunTimeCheck: ... SKIP' and exits 0 (" + (line || "no summary line") + ")");
ok(!/\bpass(ed)?\b/i.test(line.replace(/NOT a pass/, "")), "the offline line never says pass");
ok(spawnSync(process.execPath, [target, "--selftest"], { env, encoding: "utf8" }).status === 0, "the selftest still passes");

// live mode and the 60% rule unchanged: same function, same numbers
const { evaluate } = await import(target + "?v=" + Date.now());
const mk = ms => ({ status: "ok", metadata: { ms, tasks: 400, ran: 400, deferred: 0 } });
ok(evaluate([mk(180000)]).problems.length === 0 && evaluate([mk(180001)]).problems.length === 1, "live mode: the line is still exactly 60% of the limit");
ok(/ALARM_FRACTION\s*=\s*0\.6\b/.test(fs.readFileSync(path.join(root, "lib/tasks/runBudget.js"), "utf8")), "the 60% constant is unchanged");

// mutant: the old line (SKIP first, no name prefix) is caught by the scan and by the run
const old = src.replace('console.log("tasksRunTimeCheck: SKIP, no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, so no run was read (this is NOT a pass)")', 'console.log("SKIP tasksRunTimeCheck: no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (this is NOT a pass)")');
ok(old !== src, "mutant built");
ok(scan("tasksRunTimeCheck.mjs", old).length === 1, "MUTANT old SKIP line: the scan catches it");
const tmp = path.join(dir, "_skipMutant.tmp.mjs"); fs.writeFileSync(tmp, old.replace('"../lib/tasks/runBudget.js"', '"../lib/tasks/runBudget.js"'));
try { const r = spawnSync(process.execPath, [tmp], { env, encoding: "utf8" }); ok(!/^tasksRunTimeCheck: /m.test(r.stdout), "MUTANT old SKIP line: the run has no summary line, which is what prePush counted as a FAIL"); } finally { fs.unlinkSync(tmp); }
console.log(`skipSummaryCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
