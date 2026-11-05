// The matcher's time budget (Nov 5 2026). api/tasks.js (the match run, the email run, every Tasks call) runs under ONE function limit, set in vercel.json "functions" and read here by the checks.
// A run stops STARTING new Tasks after BUDGET_FRACTION of the limit (a Task already in flight can take up to ~25 s for its model turn, which the remaining fifth covers), defers the rest (they go first next run, see
// orderForRun), and says so. The nightly check (scripts/tasksRunTimeCheck.mjs) fails when a real run took more than ALARM_FRACTION of the limit, so the cap is seen long before it bites.
export const TASKS_MAX_DURATION_S = 300;
export const BUDGET_FRACTION = 0.8;
export const ALARM_FRACTION = 0.6;
export const budgetMs = (limitS = TASKS_MAX_DURATION_S) => Math.floor(limitS * 1000 * BUDGET_FRACTION);
export const alarmMs = (limitS = TASKS_MAX_DURATION_S) => Math.floor(limitS * 1000 * ALARM_FRACTION);
// Fair order: the running Tasks that were looked at LEAST recently first (a Task never checked first of all), the rest after. A run cut short by the budget therefore leaves the Tasks it skipped at the head of the next
// run's queue (the ones it did run have a newer checkpoint), so no Task is starved however many accounts hold Tasks. Ties break on id so the order is stable.
export function orderForRun(tasks) {
  const t = x => (x.checkpoint ? Date.parse(x.checkpoint) || 0 : 0);
  const run = tasks.filter(x => x.state === "running" && x.kind === "hunt"), rest = tasks.filter(x => !(x.state === "running" && x.kind === "hunt"));
  const cmp = (a, b) => t(a) - t(b) || String(a.id).localeCompare(String(b.id));
  return [...run.sort(cmp), ...rest];
}
