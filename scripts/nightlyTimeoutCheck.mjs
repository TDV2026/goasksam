// e100: every step of the nightly workflow has its own timeout, and a job's steps cannot add up past the job's own limit.
// Cause (run 127, Oct 28): the caches job had a job limit (80 minutes) and no step limit; one step (the cross-product check) ran 35 minutes after 44 minutes of others and the job limit cancelled the whole run, which marked it Cancelled.
// Reads the copy of record (docs/nightly-workflow.yml) hard; reads .github/workflows/nightly.yml too and says when it is behind (the CI token cannot edit workflow files, Sam copies the doc over).
//   node scripts/nightlyTimeoutCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
// the workflow's shape is regular (jobs at 2 spaces, job keys at 4, steps at 6, step keys at 8): read it by indentation, no YAML library
function jobsOf(text) {
  const L = text.split("\n"), jobs = []; let job = null, step = null, inJobs = false, inSteps = false;
  for (const l of L) {
    if (/^jobs:/.test(l)) { inJobs = true; continue; }
    if (!inJobs) continue;
    let m;
    if ((m = /^  ([a-z][\w-]*):\s*$/.exec(l))) { job = { name: m[1], timeout: null, steps: [] }; jobs.push(job); inSteps = false; step = null; continue; }
    if (!job) continue;
    if ((m = /^    timeout-minutes:\s*(\d+(?:\.\d+)?)/.exec(l))) { job.timeout = Number(m[1]); continue; }
    if (/^    steps:\s*$/.test(l)) { inSteps = true; continue; }
    if (inSteps && (m = /^      - (name|uses):\s*(.*)$/.exec(l))) { step = { label: m[2].trim().slice(0, 70), timeout: null }; job.steps.push(step); continue; }
    if (inSteps && step && (m = /^        timeout-minutes:\s*(\d+(?:\.\d+)?)/.exec(l))) step.timeout = Number(m[1]);
  }
  return jobs;
}
function judge(label, file, hard) {
  if (!fs.existsSync(file)) { console.log(`SKIP  ${label}: no file`); return; }
  const jobs = jobsOf(fs.readFileSync(file, "utf8")); const bad = [];
  for (const j of jobs) {
    if (j.timeout == null) bad.push(`job ${j.name} has no timeout`);
    for (const s of j.steps) if (s.timeout == null) bad.push(`${j.name}: step "${s.label}" has no timeout`);
    const sum = j.steps.reduce((t, s) => t + (s.timeout || 0), 0);
    if (j.timeout != null && j.steps.every(s => s.timeout != null) && sum > j.timeout) bad.push(`${j.name}: steps add up to ${sum} minutes, over the job's ${j.timeout}`);
  }
  const line = `${label}: ${jobs.length} jobs, ${jobs.reduce((t, j) => t + j.steps.length, 0)} steps${bad.length ? " | " + bad.slice(0, 5).join(" | ") + (bad.length > 5 ? ` | and ${bad.length - 5} more` : "") : ""}`;
  if (hard) ok(`every step has a timeout and no job's steps add up past its limit (${label})`, bad.length === 0, line);
  else console.log(`${bad.length ? "NOTE" : "PASS"}  ${line}${bad.length ? "  (Sam copies docs/nightly-workflow.yml over it)" : ""}`);
}
judge("docs/nightly-workflow.yml", path.join(root, "docs/nightly-workflow.yml"), true);
judge(".github/workflows/nightly.yml", path.join(root, ".github/workflows/nightly.yml"), false);
process.exit(fail ? 1 : 0);
