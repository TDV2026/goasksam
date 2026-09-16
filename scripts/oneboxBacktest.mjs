// One Box structural backtest (Sep 2026). ARCHIVE-ONLY, ZERO OCD: samples ~400 real cars from
// canonical_sales and runs the LIVE runOneBox against each (matched VIN + typed), checking
// structural invariants (I1-I6) on the actual result. Grouped failure report by invariant AND
// stratum. Run weekly in Actions + on-demand after any engine change (the golden discipline).
//
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. node scripts/oneboxBacktest.mjs [--size=400] [--seed=42]
//
// Writes scripts/onebox-backtest-report.json and prints the grouped summary. Exit 1 if any
// invariant broke (so a scheduled run fails loudly), 0 if clean.
import fs from "node:fs";
import { buildSample, runSubject, summarize } from "../lib/ops/backtestCore.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const size = Number(flag("size", 400)), seed = Number(flag("seed", 42));
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
if (!env.supabaseUrl || !env.supabaseKey) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(2); }

const sample = await buildSample(env, { size, seed });
console.error(`Sampled ${sample.length} cars (seed ${seed}). Running matched + typed for each...`);
const results = [];
for (let i = 0; i < sample.length; i++) {
  results.push(...await runSubject(env, sample[i]));
  if ((i + 1) % 25 === 0) process.stderr.write(`\r  ${i + 1}/${sample.length}`);
}
process.stderr.write("\n");
const sum = summarize(results);

fs.writeFileSync("scripts/onebox-backtest-report.json", JSON.stringify({ generatedAt: new Date().toISOString(), seed, size, ...sum }, null, 2) + "\n");
console.log(`\n=== One Box backtest (seed ${seed}) ===`);
console.log(`runs: ${sum.totalRuns} | result-state runs: ${sum.resultRuns} | runs with a failure: ${sum.runsWithFailures}`);
console.log(`\nby invariant:`, JSON.stringify(sum.byInvariant));
console.log(`\nby stratum (invariant -> count):`);
for (const dim of ["marque", "tier", "genMapped", "path"]) { console.log(` ${dim}:`); for (const [k, v] of Object.entries(sum.byStratum[dim])) console.log(`   ${k}: ${JSON.stringify(v)}`); }
console.log(`\nfailures (${sum.failures.length}):`);
for (const f of sum.failures) console.log(`  [${f.inv}] ${f.subject} (${f.path}, ${f.marque}, ${f.tier}, mapped=${f.genMapped}): ${f.detail}`);
process.exit(sum.failures.length ? 1 : 0);
