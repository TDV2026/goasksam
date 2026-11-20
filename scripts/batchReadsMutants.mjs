// MUTANTS OF batchReadsCheck (Lane B, lane-b-batch-read, Nov 20 2026). Run in a COPY of the repo, never on the branch; each mutant breaks one rule and the check must fail.
import path from "path"; import { fileURLToPath } from "url"; import fs from "fs"; import os from "os"; import { execSync, spawnSync } from "child_process";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const copy = fs.mkdtempSync(path.join(os.tmpdir(), "batchmut-"));
execSync(`rsync -a --exclude node_modules --exclude .git --exclude proofs --exclude docs/screens "${root}/" "${copy}/"`);
fs.symlinkSync(fs.realpathSync(path.join(root, "node_modules")), path.join(copy, "node_modules"));
const edit = (f, a, b) => ({ f, fn: s => s.includes(a) ? s.replace(a, b) : s });
const MUT = [
  ["a timed out page is never read again", edit("lib/_supabase.js", "  if (!batch.on) return false;\n  if (tried >=", "  return false;\n  if (tried >=")],
  ["the run's budget is ignored", edit("lib/_supabase.js", "|| batch.used >= batch.budget) {", ") {")],
  ["a read is retried without a limit per read", edit("lib/_supabase.js", "if (tried >= batch.timeoutRetries ||", "if (false ||")],
  ["the batch page wait is the visitor's 8 s", edit("lib/_supabase.js", "fetchMs ?? process.env.BATCH_FETCH_MS, 25000)", "fetchMs ?? process.env.BATCH_FETCH_MS, 8000)")],
  ["the default batch wait is 8 s in the state too", edit("lib/_supabase.js", "const batch = { on: false, fetchMs: 25000,", "const batch = { on: false, fetchMs: 8000,")],
  ["the batch module never turns batch mode on", edit("lib/_batchReads.js", "\nenableBatchReads();", "\n")],
  ["a visitor's read is retried too (batch mode always on)", edit("lib/_supabase.js", "if (!batch.on) return false;", "")],
  ["a script of the nightly drops the import (ingest)", edit("scripts/ingest.js", 'import "../lib/_batchReads.js";', "// ")],
  ["a script of the nightly drops the import (buildSpecPagesCache)", edit("scripts/buildSpecPagesCache.js", 'import "../lib/_batchReads.js";', "// ")],
  ["the retry budget is larger than the step cap allows", edit("lib/_supabase.js", "timeoutRetries: 2, budget: 10,", "timeoutRetries: 2, budget: 40,")],
  ["a retry storm: the pause is a minute", edit("lib/_supabase.js", "budget: 10, pauseMs: 2000", "budget: 10, pauseMs: 60000")],
  ["a function a visitor reaches imports the batch module", { f: "api/sellerDecision.js", fn: s => 'import "../lib/_batchReads.js";\n' + s }],
  ["a single read is not read again", edit("lib/_supabase.js", "|| !batch.on || (env && env.signal", "|| true || (env && env.signal")],
  ["a caller that gave up is read for again", edit("lib/_supabase.js", "e.reason === \"timeout\" && !(signal && signal.aborted) && mayRetryTimeout", "e.reason === \"timeout\" && mayRetryTimeout")],
  ["a timeout past the retries returns the rows so far", edit("lib/_supabase.js", "if (attempt >= retries) throw e;", "if (attempt >= retries) return { rows: [], total: null };")],
];
let killed = 0; const survivors = [];
for (const [name, m] of MUT) {
  const F = path.join(copy, m.f), orig = fs.readFileSync(F, "utf8"), next = m.fn(orig);
  if (next === orig) { console.log(`NOOP     ${name}`); survivors.push(name + " (no change)"); continue; }
  fs.writeFileSync(F, next);
  const r = spawnSync("node", ["scripts/batchReadsCheck.mjs", copy], { cwd: copy, encoding: "utf8", timeout: 240000 });
  fs.writeFileSync(F, orig);
  const dead = r.status !== 0; if (dead) killed++; else survivors.push(name);
  console.log(`${dead ? "KILLED  " : "SURVIVED"} ${name}`);
}
console.log(`\nbatchReadsMutants: ${killed} of ${MUT.length} killed${survivors.length ? "; SURVIVORS: " + survivors.join("; ") : ""}`);
fs.rmSync(copy, { recursive: true, force: true }); process.exit(survivors.length ? 1 : 0);
