// BATCH READS ON (Lane B, lane-b-batch-read, Nov 20 2026). A script that runs without a visitor (the nightly) imports this FIRST: its archive page reads wait longer and a timed out page is read again (lib/_supabase.js enableBatchReads, the cause and the numbers are there).
// A Vercel function never imports it, so a visitor's read is unchanged: 8 s, no retry of a timeout. scripts/batchReadsCheck.mjs fails when a script the nightly runs does not import this file.
import { enableBatchReads, batchReadStats } from "./_supabase.js";
enableBatchReads();
// the run's tally, printed once at the end of the process: a night that retried says so, a night that gave up says so
process.on("exit", () => { const s = batchReadStats(); if (s.retried || s.exhausted) console.log(`batch reads: ${s.retried} timed out reads were read again, ${s.exhausted} gave up (page wait ${s.fetchMs} ms, ${s.timeoutRetries} retries a read, ${s.budget} a run)`); });
