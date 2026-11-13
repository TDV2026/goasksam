// clock: real-ok no date is asserted; the workflow files are read as text
// A NIGHTLY STEP NEVER HIDES A FAILURE AND NEVER OUTRUNS ITS OWN TIMEOUT (Lane B, Nov 13 2026, from Lane C's note e78590ec). CAUSE: the nightly "Market Check bare-nameplate warm cache" step had timeout-minutes 3 and a 29 nameplate list
// (about 3 min 13 s killed it partway, every night, #134 to #139), and the warm JOB carried continue-on-error: true, so the run read green: the head of the list was warmed, the tail never was, and nothing reported it.
// CLASS: any workflow step (a) whose timeout is shorter than its own work, (b) that runs under continue-on-error with no later step that fails the run when it failed, (c) in a job under continue-on-error (the whole job's failure hidden), or (d) in a job whose step
// timeouts add up to more than the job's own cap (the job is cancelled mid step). Every file under .github/workflows is held to (b), (c) and (d); the nightly is held to (a) with the longest run read from the public run record (#137 to #140); a warm that works through a list
// is held to a last step that fails loudly when warmed plus refused is below the list length; each docs copy of record equals the file it copies.
//   node scripts/workflowStepsCheck.mjs [repo root]   (a tree without the fix fails: run it against origin/main)    node scripts/workflowStepsCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const rd = f => fs.readFileSync(path.join(root, f), "utf8");

// a small reader for the shape these files use: jobs at 2 spaces, job keys at 4, steps "      - " with keys at 8
export function parseWorkflow(text) {
  const jobs = []; let job = null, step = null, inJobs = false, runIndent = -1;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    if (runIndent >= 0) { if (line === "" || line.length - line.trimStart().length > runIndent) { if (step) step.run += line + "\n"; continue; } runIndent = -1; }
    let m;
    if ((m = line.match(/^  ([A-Za-z0-9_-]+):\s*$/))) { job = { name: m[1], timeout: null, continueOnError: false, steps: [] }; jobs.push(job); step = null; continue; }
    if (!job) continue;
    if ((m = line.match(/^    timeout-minutes:\s*(\d+)/))) { job.timeout = +m[1]; continue; }
    if (/^    continue-on-error:\s*true/.test(line)) { job.continueOnError = true; continue; }
    if ((m = line.match(/^      - (?:name:\s*(.*)|uses:\s*(.*))$/))) { step = { name: (m[1] || m[2] || "").replace(/^["']|["']$/g, ""), id: null, timeout: null, continueOnError: false, if: "", run: "" }; job.steps.push(step); continue; }
    if (!step) continue;
    if ((m = line.match(/^        name:\s*(.*)$/))) { step.name = m[1].replace(/^["']|["']$/g, ""); continue; }
    if ((m = line.match(/^        id:\s*(\S+)/))) { step.id = m[1]; continue; }
    if ((m = line.match(/^        timeout-minutes:\s*(\d+)/))) { step.timeout = +m[1]; continue; }
    if (/^        continue-on-error:\s*true/.test(line)) { step.continueOnError = true; continue; }
    if ((m = line.match(/^        if:\s*(.*)$/))) { step.if = m[1]; continue; }
    if (/^        run:\s*[|>]/.test(line)) { runIndent = 8; continue; }
    if ((m = line.match(/^        run:\s*(.+)$/))) { step.run += m[1] + "\n"; continue; }
  }
  return jobs;
}
// The step that fails the run when step `id` failed: a later step of the job whose `if` names the outcome and whose script exits 1
export const failsLoudlyFor = (job, idx) => { const id = job.steps[idx].id; return !!id && job.steps.slice(idx + 1).some(s => new RegExp("steps\\." + id + "\\.outcome\\s*==\\s*'failure'").test(s.if) && /exit 1|process\.exit\(1\)/.test(s.run)); };
// Steps that are advisory ON PURPOSE, each with its reason (a warning line replaces the red)
const ADVISORY = {
  "checks/searchcheck": "advisory by design: the step after it prints a ::warning:: line (it was advisory in nightly.yml too)",
  "caches/Download invalidated specs list (if any)": "ingest uploads the list only on a night it invalidated rows; no artifact means nothing to recompute, and the recompute step has its own fail step"
};
// The longest each nightly step ran in the public run record (#138 to #140, Nov 11 to 13 2026), in minutes. The timeout must be at least this and a tenth over.
const OBSERVED = [[/Rebuild VIN index/, 7.8], [/Refresh spec market cache/, 15.3], [/Recompute invalidated spec cache rows/, 4.2], [/Build spec_pages/, 3.4], [/Precompute VIN rollout cache/, 19.1], [/Rebuild the Desk aggregates cube/, 2.9], [/Ingest \(backfill range/, 1.8]];
const WARMMC_SEC_PER_NAMEPLATE = 0;   // filled from the measured run (the slowest nameplate, seconds)

const files = fs.readdirSync(path.join(root, ".github/workflows")).filter(f => /\.ya?ml$/.test(f));
for (const f of files) {
  const jobs = parseWorkflow(rd(".github/workflows/" + f));
  ok(`${f}: the reader finds jobs`, jobs.length > 0);
  for (const job of jobs) {
    const tag = `${f} job ${job.name}`;
    ok(`${tag}: no job-level continue-on-error (it hides every step in the job)`, !job.continueOnError);
    const sum = job.steps.reduce((n, s) => n + (s.timeout || 0), 0);
    if (job.timeout) ok(`${tag}: the step timeouts (${sum}) fit the job cap (${job.timeout})`, sum <= job.timeout, { sum, cap: job.timeout });
    job.steps.forEach((s, i) => {
      if (!s.continueOnError) return;
      const key = `${job.name}/${s.id || s.name}`;
      ok(`${tag}: step "${s.name}" runs under continue-on-error, so a later step fails the run when it failed (or it is listed as advisory)`, failsLoudlyFor(job, i) || !!ADVISORY[key], { id: s.id });
    });
  }
}
// (a) the nightly: a timeout shorter than the step's own work
{
  const jobs = parseWorkflow(rd(".github/workflows/nightly.yml")), steps = jobs.flatMap(j => j.steps.map(s => ({ ...s, job: j.name })));
  for (const [re, min] of OBSERVED) { const s = steps.find(x => re.test(x.name)); ok(`nightly: a step matching ${re} exists`, !!s); if (s) ok(`nightly: "${s.name}" has a timeout (${s.timeout}) over its longest run (${min} min) by a tenth`, s.timeout >= min * 1.1, { timeout: s.timeout, min }); }
  const wm = steps.find(s => /Market Check bare-nameplate warm cache/.test(s.name)), wj = jobs.find(j => j.name === "warm");
  const lw = rd("scripts/warmMarketCheck.js"), listLen = (lw.match(/export const WARM_LIST = \[([\s\S]*?)\n\];/)[1].match(/"[^"]+"/g) || []).length;
  ok("nightly: the warm list is read (29 or more nameplates)", listLen >= 29, listLen);
  ok("nightly: the Market Check warm has a timeout that covers the list (12 minutes or more)", !!wm && wm.timeout >= 12, wm && wm.timeout);
  if (WARMMC_SEC_PER_NAMEPLATE) ok(`nightly: the Market Check warm timeout covers ${listLen} nameplates at ${WARMMC_SEC_PER_NAMEPLATE} s each`, !!wm && wm.timeout * 60 >= listLen * WARMMC_SEC_PER_NAMEPLATE, { timeout: wm && wm.timeout });
  ok("nightly: the Market Check warm step is not under continue-on-error", !!wm && !wm.continueOnError);
  ok("nightly: the warm job is not under continue-on-error", !!wj && !wj.continueOnError);
  const wi = wj ? wj.steps.findIndex(s => /Market Check bare-nameplate warm cache/.test(s.name)) : -1;
  const last = wj ? wj.steps[wj.steps.length - 1] : null;
  ok("nightly: the warm job ends with a step that fails loudly when warmed plus refused is below the list length", !!last && /warmMarketCheck\.js --verify=/.test(last.run) && /!cancelled\(\)|always\(\)/.test(last.if) && wi >= 0 && wi < wj.steps.length - 1, last && { name: last.name, run: last.run, if: last.if });
  ok("nightly: the warm step writes the log the last step reads", !!wm && /tee warmmc\.log/.test(wm.run) && /pipefail/.test(wm.run));
  ok("nightly: the last warm step runs even when the step before it failed", !!last && /!cancelled\(\)|always\(\)/.test(last.if));
}
// the verifier itself: a log with no DONE line, a short list and a full list
{
  const m = await import(pathToFileURL(path.join(root, "scripts/warmMarketCheck.js")).href).catch(e => ({ err: String(e.message) }));
  ok("warmMarketCheck.js exports verifyWarmLog", typeof m.verifyWarmLog === "function", m.err);
  if (m.verifyWarmLog) {
    const n = m.WARM_LIST.length, done = (w, r, f, of = n) => `OK  x\n\nDONE. warmed=${w} refused=${r} failed=${f} of ${of}.\n`;
    ok("verify: a log killed at the timeout (no DONE line) fails", m.verifyWarmLog("OK  1991 BMW M3  tier=result  9000ms\nOK  1969 Chevrolet Camaro  tier=result", n).ok === false);
    ok("verify: an empty log fails", m.verifyWarmLog("", n).ok === false);
    ok("verify: warmed plus refused below the list length fails", m.verifyWarmLog(done(20, 1, 8), n).ok === false);
    ok("verify: every nameplate warmed passes", m.verifyWarmLog(done(n, 0, 0), n).ok === true);
    ok("verify: warmed plus refused equal to the list passes", m.verifyWarmLog(done(n - 2, 2, 0), n).ok === true);
    ok("verify: a different list length fails", m.verifyWarmLog(done(5, 0, 0, 5), n).ok === false);
  }
  const s = rd("scripts/warmMarketCheck.js");
  ok("warmMarketCheck.js exits 1 when warmed plus refused is below the list", /result\.warmed \+ result\.refused < list\.length \? 1 : 0/.test(s));
}
// the docs copies of record equal the files they copy
for (const [a, b] of [[".github/workflows/nightly.yml", "docs/nightly-workflow.yml"], [".github/workflows/nightly-checks.yml", "docs/nightly-checks-workflow.yml"]]) ok(`${b} equals ${a}`, rd(a) === rd(b));

for (const f of fails.slice(0, 40)) console.log("FAIL " + f);
console.log(`workflowStepsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const N = ".github/workflows/nightly.yml", D = "docs/nightly-workflow.yml", W = "scripts/warmMarketCheck.js";
  const both = fn => [[N, fn], [D, fn]];
  const M = [
    ["the Market Check warm goes back to 3 minutes", both(s => s.replace("        timeout-minutes: 12\n        # runs even", "        timeout-minutes: 3\n        # runs even"))],
    ["the warm job is under continue-on-error again", both(s => s.replace("    if: github.event_name == 'schedule' && vars.OCD_SKIP_WARM != '1'\n", "    if: github.event_name == 'schedule' && vars.OCD_SKIP_WARM != '1'\n    continue-on-error: true\n"))],
    ["the Market Check warm step is under continue-on-error", both(s => s.replace("        id: warmmc\n", "        id: warmmc\n        continue-on-error: true\n"))],
    ["the last warm step is removed", both(s => s.replace("      - name: Fail loudly when warmed plus refused is below the list length\n        timeout-minutes: 1\n        if: ${{ !cancelled() }}\n        run: node scripts/warmMarketCheck.js --verify=warmmc.log\n", ""))],
    ["the last warm step only runs after a green step", both(s => s.replace("      - name: Fail loudly when warmed plus refused is below the list length\n        timeout-minutes: 1\n        if: ${{ !cancelled() }}", "      - name: Fail loudly when warmed plus refused is below the list length\n        timeout-minutes: 1"))],
    ["the warm step writes no log", both(s => s.replace("node scripts/warmMarketCheck.js | tee warmmc.log", "node scripts/warmMarketCheck.js"))],
    ["the warm job cap is under its steps", both(s => s.replace("    timeout-minutes: 25   # the steps below", "    timeout-minutes: 15   # the steps below"))],
    ["a caches step hides its failure (its fail step is removed)", both(s => s.replace("      - name: Fail the job if the spec market cache step failed\n        timeout-minutes: 1\n        if: steps.", "      - name: Fail the job if the spec market cache step failed\n        timeout-minutes: 1\n        if: steps.NOPE."))],
    ["the spec market cache step is cut to 12 minutes", both(s => s.replace(/(Refresh spec market cache[^\n]*\n\s+timeout-minutes: )17/, "$112"))],
    ["the verifier accepts a log with no DONE line", [[W, s => s.replace("if (!m) return { ok: false,", "if (!m) return { ok: true,")]]],
    ["the verifier accepts a short list", [[W, s => s.replace("if (warmed + refused < listLength) return { ok: false,", "if (false) return { ok: false,")]]],
    ["the script exits 0 on a short list", [[W, s => s.replace("result.failed > 0 || result.warmed + result.refused < list.length ? 1 : 0", "result.failed > 0 ? 1 : 0")]]],
    ["the docs copy drifts from the workflow", [[D, s => s.replace("timeout-minutes: 12\n", "timeout-minutes: 11\n")]]]
  ];
  let survived = 0;
  for (const [name, edits] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "wsc-")); try {
      spawnSync("cp", ["-R", ...fs.readdirSync(R).filter(x => x !== "node_modules" && x !== ".git").map(x => path.join(R, x)), tmp]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      let changed = true;
      for (const [file, fn] of edits) { const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) changed = false; fs.writeFileSync(f, after); }
      if (!changed) { console.log("SKIP (no change) " + name); survived++; continue; }
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
