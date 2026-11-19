// prePushParallel.mjs - the parallel pre-push (Lane C, Nov 2026). Same checks, same output, same exit code as scripts/prePush.mjs, in minutes.
//   node scripts/prePushParallel.mjs [--tier full|fast] [--base <url>] [--tier-only]     (any prePush.mjs argument is passed through)
//   PREPUSH_WORKERS=4          how many checks run at the same time (default 4)
//   PREPUSH_DEFAULT_TIMEOUT_MS=900000   Node-side kill time for a check whose prePush call sets none (no shell `timeout`; macOS has none)
// How it stays identical: scripts/prePush.mjs is not changed and not re-implemented. Phase 1 runs it once with every check command
// recorded instead of run (scripts/prePushHook.mjs, PREPUSH_DISCOVER_FILE), so the list is exactly the checks it would run for these
// arguments. Phase 2 runs those commands at the same time, WORKERS at once, longest first, each with its own Node-side timeout, and stores
// stdout, stderr and exit status per command. Phase 3 runs prePush.mjs for real; its execSync calls are answered from phase 2 and throw
// exactly what execSync throws for a non-zero exit, so prePush prints its own lines, its own SUMMARY and exits with its own code.
// Everything this runner says itself goes to stderr; stdout is prePush's, byte for byte.
// A check that exits 0 but prints no "<name>: ..." summary line is a FAIL here (PREPUSH_STRICT=1), never a pass.
// A command missing from the phase 2 store (a check the discovery pass could not see) is run in phase 3, one at a time, as prePush would.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdKey } from "./prePushHook.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "scripts", "prePushHook.mjs");
const args = process.argv.slice(2);
const WORKERS = Math.max(1, parseInt(process.env.PREPUSH_WORKERS || "4", 10) || 4);
const DEFAULT_TIMEOUT = parseInt(process.env.PREPUSH_DEFAULT_TIMEOUT_MS || "900000", 10);
const err = (...a) => console.error(...a);
const t0 = Date.now();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "prepushpar-"));
const cacheDir = path.join(work, "cache"); fs.mkdirSync(cacheDir);
const discoverFile = path.join(work, "discover.jsonl");
const baseEnv = { ...process.env }; delete baseEnv.PREPUSH_TIMING_FILE; delete baseEnv.PREPUSH_CACHE_DIR; delete baseEnv.PREPUSH_DISCOVER_FILE;

// ---- phase 1: which commands will prePush run? ----
const d = spawnSync(process.execPath, ["--import", HOOK, path.join(ROOT, "scripts", "prePush.mjs"), ...args], { cwd: ROOT, env: { ...baseEnv, PREPUSH_DISCOVER_FILE: discoverFile }, encoding: "utf8", maxBuffer: 1 << 28 });
let cmds = [];
try {
  const seen = new Set();
  for (const l of fs.readFileSync(discoverFile, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l); if (!seen.has(r.cmd)) { seen.add(r.cmd); cmds.push(r); } }
} catch {}
err(`[prePushParallel] phase 1: ${cmds.length} check commands found (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// ---- weights: longest first, so the slow ones start at once and the short ones fill the gaps ----
let weights = {};
try { weights = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "prePushWeights.json"), "utf8")); } catch {}
const weight = c => weights[cmdKey(c)] || 0;   // milliseconds from the last serial run, keyed by the command's sha1 (a repo-scanning check must not find script names in it)
cmds.sort((a, b) => weight(b.cmd) - weight(a.cmd));

// ---- phase 2: run them, WORKERS at a time ----
function runOne(c) {
  return new Promise(resolve => {
    const start = Date.now();
    const timeoutMs = c.timeout || DEFAULT_TIMEOUT;
    const p = spawn("/bin/sh", ["-c", c.cmd], { cwd: ROOT, env: baseEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", er = "", timedOut = false, done = false;
    p.stdout.on("data", b => { out += b; }); p.stderr.on("data", b => { er += b; });
    const kill = sig => { try { process.kill(-p.pid, sig); } catch { try { p.kill(sig); } catch {} } };   // the whole group, so a browser a check opened dies with it
    const timer = setTimeout(() => { timedOut = true; kill("SIGTERM"); setTimeout(() => kill("SIGKILL"), 5000).unref(); }, timeoutMs);
    const finish = (status, signal) => {
      if (done) return; done = true; clearTimeout(timer);
      const rec = { status: status == null ? 1 : status, signal: signal || null, stdout: out, stderr: er, ms: Date.now() - start, timedOut };
      try { fs.writeFileSync(path.join(cacheDir, cmdKey(c.cmd) + ".json"), JSON.stringify(rec)); } catch {}
      resolve({ cmd: c.cmd, ...rec });
    };
    p.on("error", e => { er += String(e); finish(1, null); });
    p.on("close", (code, signal) => finish(code, signal));
  });
}
const done = [];
let next = 0, running = 0, finished = 0;
await new Promise(resolve => {
  const pump = () => {
    while (running < WORKERS && next < cmds.length) {
      const c = cmds[next++]; running++;
      runOne(c).then(r => { running--; finished++; done.push(r); if (finished % 25 === 0 || finished === cmds.length) err(`[prePushParallel] phase 2: ${finished}/${cmds.length} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`); pump(); });
    }
    if (finished === cmds.length && running === 0) resolve();
  };
  if (!cmds.length) resolve(); else pump();
});
const p2 = Date.now();
err(`[prePushParallel] phase 2 done: ${done.length} checks, ${WORKERS} workers, ${((p2 - t0) / 1000).toFixed(0)}s; ${done.filter(r => r.timedOut).length} timed out`);
const slow = [...done].sort((a, b) => b.ms - a.ms).slice(0, 5).map(r => `${(r.ms / 1000).toFixed(0)}s ${r.cmd.replace(/^node scripts\//, "")}`);
err(`[prePushParallel] slowest: ${slow.join(" | ")}`);
if (process.env.PREPUSH_TIMES_OUT) fs.writeFileSync(process.env.PREPUSH_TIMES_OUT, JSON.stringify(Object.fromEntries(done.map(r => [r.cmd, { ms: r.ms, status: r.status }])), null, 1));

// ---- phase 3: prePush itself, its checks answered from the store; its stdout and exit code are ours ----
const r = spawnSync(process.execPath, ["--import", HOOK, path.join(ROOT, "scripts", "prePush.mjs"), ...args], { cwd: ROOT, env: { ...baseEnv, PREPUSH_CACHE_DIR: cacheDir, PREPUSH_STRICT: "1" }, stdio: "inherit" });
err(`[prePushParallel] total ${((Date.now() - t0) / 1000).toFixed(0)}s wall (workers ${WORKERS})`);
try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
process.exit(r.status == null ? 1 : r.status);
