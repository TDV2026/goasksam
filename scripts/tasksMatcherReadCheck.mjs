// TASKS MATCHER READ CHECK (Lane S, Nov 5 2026). The matcher used to read at most 500 Tasks, unordered ("tasks?state=in.(running,needs_you,paused)&select=*&limit=500"), so past 500 running or paused Tasks
// some were silently never matched (50 full accounts at ten each is 500). Now: an ordered, paged read with no cap, a run that stops STARTING Tasks at 80% of the function limit and defers the rest, and a fair order
// (least recently looked at first) so deferred Tasks head the next run. This check uses more than 500 fixtures:
//   1. the paged read returns every one of 1,300 Tasks, once each, in id order, over a fake PostgREST that serves at most 500 rows a request (as the old URL would have been cut);
//   2. a run with a time budget that fits only part of them defers the rest and says how many; three runs later EVERY running Task has been matched at least once (fair rotation);
//   3. a read that fails on a later page throws, never working from a partial list;
//   4. the function limit in vercel.json for api/tasks.js is the number lib/tasks/runBudget.js uses;
//   5. a run's log row carries the duration, the Task count, the deferred count and the limit.
// MUTANTS (each must fail): the old capped read; an unordered rotation; no budget; a partial read that swallows a failed page.
//   node scripts/tasksMatcherReadCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), LIB = path.join(ROOT, "lib/tasks");
let seq = 0;
async function load(mut = {}) {
  const mine = [], rd = f => fs.readFileSync(path.join(LIB, f), "utf8"), put = (n, src) => { const p = path.join(LIB, n); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  try {
    const tag = `__matchmut${++seq}_`;
    put(`${tag}runBudget.js`, mut.budget ? mut.budget(rd("runBudget.js")) : rd("runBudget.js"));
    const T = await import(put(`${tag}tasks.js`, (mut.tasks ? mut.tasks(rd("tasks.js")) : rd("tasks.js")).replace('"./runBudget.js"', `"./${tag}runBudget.js"`)));
    return T;
  } finally { for (const p of mine) fs.rmSync(p, { force: true }); }
}
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const N = 1300;
const rowsAll = Array.from({ length: N }, (_, i) => ({ id: uuid(i + 1), user_id: uuid(100000 + (i % 130)), kind: "hunt", state: i % 13 === 0 ? "paused" : "running", filters: { make: "Porsche", model: "911" }, summary: "Sam is looking for Porsche 911s.", checkpoint: new Date(Date.now() - (N - i) * 3600e3).toISOString(), last_interaction_at: new Date().toISOString() }));

function fakeRest({ failPage = null } = {}) {
  const calls = []; let page = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); calls.push(u.search);
    if (!u.pathname.endsWith("/rest/v1/tasks")) return new Response("[]", { status: 200 });
    if ((init.method || "GET") !== "GET") return new Response("[]", { status: 200 });
    page++; if (failPage && page === failPage) return new Response("boom", { status: 500 });
    const after = (u.searchParams.get("id") || "").replace("gt.", ""), limit = Math.min(500, Number(u.searchParams.get("limit")) || 500);   // the server serves at most 500 rows
    let rows = rowsAll.slice().sort((a, b) => a.id.localeCompare(b.id)); if (after) rows = rows.filter(r => r.id > after);
    return new Response(JSON.stringify(rows.slice(0, limit)), { status: 200 });
  };
  return calls;
}
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };

export async function findings(mut = {}) {
  const fails = [], T = await load(mut), BM = await import("../lib/tasks/runBudget.js");
  // 1. the paged read
  {
    fakeRest(); const got = await T.__forRunForCheck(env);
    if (got.length !== N) fails.push(`the matcher read returned ${got.length} of ${N} Tasks`);
    else if (new Set(got.map(t => t.id)).size !== N) fails.push("the matcher read returned a Task twice");
    else if (got.some((t, i) => i && got[i - 1].id > t.id)) fails.push("the matcher read is not in id order");
  }
  // 3. a failed later page throws
  { fakeRest({ failPage: 2 }); let threw = false; try { await T.__forRunForCheck(env); } catch { threw = true; } if (!threw) fails.push("a failed second page did not stop the read (the run would work from a partial list)"); }
  // 2. the budgeted rotation on the in-memory store (1,300 running Tasks, a budget that fits ~500 per run)
  {
    const mem = T.memStore(); for (const r of rowsAll) mem.tasks.push({ ...r, state: "running", reported_ids: [] });
    const e = { mem }, seen = new Set(), now = new Date();
    for (let run = 0; run < 3; run++) {
      let ticks = 0; const clock = () => (ticks++) * 10;   // 10 ms per Task; the budget is 5,000 ms: about 500 Tasks a run
      const before = new Map(mem.tasks.map(t => [t.id, t.checkpoint]));
      const out = await T.runTasks(e, { now, rows: [], budgetMs: 5000, clock });
      for (const t of mem.tasks) if (t.checkpoint !== before.get(t.id)) seen.add(t.id);
      if (run === 0 && !(out.deferred > 0 && out.deferred < N)) fails.push(`run 1 with a short budget deferred ${out.deferred} (expected some, not all)`);
      if (run === 0 && out.ran !== N) fails.push(`run 1 read ${out.ran} Tasks, expected ${N}`);
    }
    if (seen.size !== N) fails.push(`after three budgeted runs only ${seen.size} of ${N} running Tasks were matched (some are starved)`);
    const mem2 = T.memStore(); for (const r of rowsAll.slice(0, 50)) mem2.tasks.push({ ...r, state: "running", reported_ids: [] });
    const out2 = await T.runTasks({ mem: mem2 }, { now: new Date(), rows: [], budgetMs: 5000 }); if (out2.deferred !== 0) fails.push(`a run that fits its budget deferred ${out2.deferred}`);
  }
  // 4. the limit in vercel.json is the limit the budget is computed from
  { const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")); const d = vj.functions && vj.functions["api/tasks.js"] && vj.functions["api/tasks.js"].maxDuration; if (d !== BM.TASKS_MAX_DURATION_S) fails.push(`vercel.json api/tasks.js maxDuration is ${d}, lib/tasks/runBudget.js says ${BM.TASKS_MAX_DURATION_S}`); if (BM.budgetMs() >= BM.TASKS_MAX_DURATION_S * 1000 || BM.alarmMs() >= BM.budgetMs()) fails.push("the budget and alarm fractions are not alarm < budget < limit"); }
  // 5. the run's log row
  { const api = fs.readFileSync(path.join(ROOT, "api/tasks.js"), "utf8"); if (!/ms: Date\.now\(\) - t0, bytesRead, tasks: out\.read, deferred: out\.deferred \|\| 0, limit_ms: TASKS_MAX_DURATION_S \* 1000/.test(api)) fails.push("the tasks_run log row does not carry ms, tasks, deferred and limit_ms"); if (!/budgetMs: budgetMs\(\)/.test(api)) fails.push("the cron run is not given the time budget"); }
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["the old capped, unordered read", { tasks: s => rep(s, "if (taskId) return rest(env, `tasks?id=eq.${taskId}&select=*`);\n    const out = []; let after = null;", "if (taskId) return rest(env, `tasks?id=eq.${taskId}&select=*`);\n    return rest(env, \"tasks?state=in.(running,needs_you,paused)&select=*&limit=500\");\n    const out = []; let after = null;") }],
  ["the rotation is not ordered by least recently looked at", { budget: s => rep(s, "return [...run.sort(cmp), ...rest];", "return [...run.sort((a, b) => String(a.id).localeCompare(String(b.id))), ...rest];") }],
  ["no time budget", { tasks: s => rep(s, "if (clock() - t0 > budget && task.state === \"running\")", "if (false)") }],
  ["a failed page is swallowed", { tasks: s => rep(s, "if (!Array.isArray(rows)) throw new Error(\"tasks forRun: a page did not come back\");", "if (!Array.isArray(rows)) return out;").replace("const rows = await rest(env, `tasks?state=in.(running,needs_you,paused)&select=*&order=id.asc&limit=${RUN_PAGE}${after ? `&id=gt.${after}` : \"\"}`);", "const rows = await rest(env, `tasks?state=in.(running,needs_you,paused)&select=*&order=id.asc&limit=${RUN_PAGE}${after ? `&id=gt.${after}` : \"\"}`).catch(() => null);") }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 130)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksMatcherReadCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
