// clock: real-ok the 36 hour window is an offset from the real now and the rows it reads are the real log
// TASKS RUN TIME CHECK (Lane S, Nov 5 2026). Nightly: reads the last 36 hours of the matcher's own log rows (app_usage_events, event_type tasks_run, written by api/tasks.js on every run with ms, tasks, deferred and limit_ms) and FAILS when
// any run took more than 60% of the function limit (lib/tasks/runBudget.js ALARM_FRACTION), or when runs are deferring Tasks (the budget is already biting). It also prints the real numbers: runs, Tasks per run, slowest run, deferred.
//   node scripts/tasksRunTimeCheck.mjs            needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the nightly job has them); prints a summary line that says SKIP, never a pass, without
//   node scripts/tasksRunTimeCheck.mjs --selftest the pass/fail logic on fixed rows, no network (prePush runs this)
import { TASKS_MAX_DURATION_S, ALARM_FRACTION } from "../lib/tasks/runBudget.js";

export function evaluate(rows, limitS = TASKS_MAX_DURATION_S) {
  const runs = rows.filter(r => r && r.status === "ok" && r.metadata && Number(r.metadata.ms) >= 0);
  const limitMs = limitS * 1000, alarm = limitMs * ALARM_FRACTION;
  const slowest = runs.reduce((m, r) => Math.max(m, Number(r.metadata.ms)), 0), deferred = runs.reduce((k, r) => k + (Number(r.metadata.deferred) || 0), 0);
  const maxTasks = runs.reduce((m, r) => Math.max(m, Number(r.metadata.tasks) || Number(r.metadata.ran) || 0), 0);
  const problems = [];
  if (slowest > alarm) problems.push(`the slowest run took ${Math.round(slowest / 1000)} s, over ${Math.round(ALARM_FRACTION * 100)}% of the ${limitS} s limit (${Math.round(alarm / 1000)} s)`);
  if (deferred > 0) problems.push(`${deferred} Task checks were deferred by the time budget in these runs`);
  const errors = rows.filter(r => r && r.status === "error").length; if (errors) problems.push(`${errors} runs failed`);
  return { runs: runs.length, slowestMs: slowest, maxTasks, deferred, errors, limitS, alarmMs: alarm, problems };
}
async function main() {
  if (process.argv.includes("--selftest")) {
    const mk = (ms, extra = {}) => ({ status: "ok", metadata: { ms, tasks: 400, ran: 400, deferred: 0, ...extra } });
    let bad = 0; const t = (c, m) => { if (!c) { bad++; console.log("FAIL " + m); } };
    t(evaluate([mk(20000), mk(90000)]).problems.length === 0, "runs at 30% of the limit pass");
    t(evaluate([mk(20000), mk(200000)]).problems.length === 1, "a run at 67% of the limit fails");
    t(evaluate([mk(180000)]).problems.length === 0 && evaluate([mk(180001)]).problems.length === 1, "the line is exactly 60%");
    t(evaluate([mk(1000, { deferred: 12 })]).problems.length === 1, "a run that deferred Tasks fails");
    t(evaluate([{ status: "error", metadata: { ms: 1 } }]).problems.length === 1, "a failed run fails");
    t(evaluate([]).problems.length === 0 && evaluate([]).runs === 0, "no runs is reported as zero runs, not a pass of anything else");
    console.log(`tasksRunTimeCheck selftest: ${bad ? bad + " FAIL" : "ok"}`); process.exit(bad ? 1 : 0);
  }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("tasksRunTimeCheck: SKIP, no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, so no run was read (this is NOT a pass)"); process.exit(0); }
  const since = new Date(Date.now() - 36 * 3600e3).toISOString();
  const res = await fetch(`${url}/rest/v1/app_usage_events?event_type=eq.tasks_run&created_at=gte.${encodeURIComponent(since)}&select=status,metadata,created_at&order=created_at.desc&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.log(`FAIL could not read the run log (${res.status})`); process.exit(1); }
  const e = evaluate(await res.json());
  console.log(`tasksRunTimeCheck: ${e.runs} runs in 36 h, up to ${e.maxTasks} Tasks a run, slowest ${Math.round(e.slowestMs / 1000)} s of ${e.limitS} s (alarm at ${Math.round(e.alarmMs / 1000)} s), ${e.deferred} deferred, ${e.errors} failed`);
  for (const p of e.problems) console.log("FAIL " + p);
  process.exit(e.problems.length ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
