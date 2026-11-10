// clock: real-ok every date is built from the real now in the same process; the hour of the day changes nothing
// TASKS CRITERIA CHECK (Lane B, Nov 10 2026). The new Tasks page prints each Task's criteria (the filters in words: "manual", "from 1984 to 1998", "under $70,000") next to its "Sam is looking for" summary. The words come from ONE function,
// lib/tasks/tasks.js criteriaOf (matchReasonList, the source the match email's "Matches your Task" line uses), and ride on the list answer of api/tasks.js for the signed in owner's own Tasks, on a public address as on the crew preview door.
//   (1) the public list carries `criteria` for every Task, equal to the engine's words for that Task's filters, and equal to what the crew preview door answers for the same Task
//   (2) a Task with no filters, and a research Task, carry an empty list: the summary stands alone, the sentence is the Task's own, unchanged
//   (3) nobody reads another user's line: a second user's list holds none of the first user's Tasks or words, and a task_id in the request does not widen the read
//   (4) no page file types or builds the words: the live app and the preview page print `criteria` as sent
// Runs the real handler in-process over a fake PostgREST. MUTANTS (each must fail): the list carries no criteria; the criteria is the summary typed; a research Task gets criteria; the list is not scoped to the signed in user; the criteria drops its first word.
//   node scripts/tasksCriteriaCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.CURTAIN_CREW_CODE = "criteria-check-secret"; process.env.PROBE_KEY = "probe-check"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SUPABASE_ANON_KEY = "anon";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const TK = await import("../lib/tasks/tasks.js");
const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
const FILT = [{ make: "BMW", model: "M3", year_min: 1995, year_max: 1995, gearbox: "manual", colour: "black", budget_max: 70000, location: "Zzyzx", radius_miles: 123 }, { make: "Porsche", model: "911", year_min: 1984, year_max: 1998 }];
const mk = (n, user, kind, filters, summary) => ({ id: `3000000${n}-0000-4000-8000-00000000000${n}`, user_id: user, kind, state: "running", summary, filters, unread: 0, created_at: new Date().toISOString(), last_interaction_at: new Date().toISOString() });
const TASKS = [mk(1, A, "hunt", FILT[0], "Sam is looking for black manual BMW M3s from 1995."), mk(2, A, "hunt", FILT[1], "Sam is looking for Porsche 911s from 1984 to 1998."), mk(3, A, "hunt", null, "Sam is looking for a Ferrari."), mk(4, A, "research", FILT[1], "Sam is researching the Porsche 911: its auction history."), mk(5, B, "hunt", { make: "Mazda", model: "MX-5", colour: "red" }, "Sam is looking for red Mazda MX-5s.")];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), method = (init.method || "GET").toUpperCase();
  if (u.pathname === "/auth/v1/user") { const tok = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || ""); return new Response(JSON.stringify({ id: /\.bbb$/.test(tok) ? B : A, email: "p@example.com" }), { status: 200 }); }
  if (p === "tasks" && method === "GET") return new Response(JSON.stringify(TASKS.filter(t => !u.searchParams.get("user_id") || u.searchParams.get("user_id") === "eq." + t.user_id)), { status: 200 });
  return new Response("[]", { status: 200 });
};
const resOf = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader() {} }; return r; };
const reqOf = (tok, body) => ({ method: "POST", headers: { cookie: "", authorization: "Bearer eyJhbGciOiJub25lIn0.e30." + tok }, query: {}, body, url: "/api/tasks" });
let seq = 0;
async function load(rewrite) {
  const mine = [], put = (n, src) => { const f = path.join(ROOT, n); fs.writeFileSync(f, src); mine.push(f); return pathToFileURL(f).href; };
  try {
    const tag = `__crmut${++seq}_`; let api = fs.readFileSync(path.join(ROOT, "api/tasks.js"), "utf8"), tasks = null;
    const m = rewrite || {}; if (m.api) api = m.api(api);
    if (m.tasks) { tasks = m.tasks(fs.readFileSync(path.join(ROOT, "lib/tasks/tasks.js"), "utf8")); put(`lib/tasks/${tag}tasks.js`, tasks); api = api.replace('"../lib/tasks/tasks.js"', `"../lib/tasks/${tag}tasks.js"`); }
    return (await import(put(`api/${tag}tasks.js`, api))).default;
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
const words = f => TK.matchReasonList(f);
export async function findings(mut = {}) {
  const fails = [], h = await load(mut), call = async (tok, body, handler = h) => { const r = resOf(); await handler(reqOf(tok, body), r); return r.body || {}; };
  const LIST = { action: "list", fast: true };
  const a = await call("aaa", LIST), byId = Object.fromEntries((a.tasks || []).map(t => [t.id, t]));
  // (1) public list = the engine's words for the Task's filters
  for (const t of TASKS.filter(t => t.user_id === A && t.kind !== "research" && t.filters)) {
    const got = byId[t.id] && byId[t.id].criteria;
    if (!(Array.isArray(got) && got.length > 0 && JSON.stringify(got) === JSON.stringify(words(t.filters)))) fails.push(`public list: Task ${t.id.slice(0, 8)} carries ${JSON.stringify(got)}, expected ${JSON.stringify(words(t.filters))}`);
  }
  if (!/black/.test(JSON.stringify(byId[TASKS[0].id] && byId[TASKS[0].id].criteria)) || !/manual/.test(JSON.stringify(byId[TASKS[0].id] && byId[TASKS[0].id].criteria))) fails.push("public list: the BMW Task's criteria do not name black and manual");
  // the crew preview door answers the same line for the same Task
  const { previewTasksApi } = await import("../lib/preview/tasksMine.js");
  const prev = await (async () => { const r = { code: 200, body: "", h: {}, setHeader(k, v) { this.h[k] = v; }, end(x) { this.body = x; }, set statusCode(c) { this.code = c; }, get statusCode() { return this.code; } }; await previewTasksApi(reqOf("aaa", LIST), r, { realHandler: h }); return JSON.parse(r.body); })();
  for (const t of prev.tasks || []) if (JSON.stringify(t.criteria) !== JSON.stringify(byId[t.id] && byId[t.id].criteria)) fails.push(`preview door: Task ${t.id.slice(0, 8)} reads ${JSON.stringify(t.criteria)}, the public list ${JSON.stringify(byId[t.id] && byId[t.id].criteria)}`);
  if (!(prev.tasks || []).length) fails.push("preview door: no Tasks answered");
  // (2) no filters and research: empty, the summary unchanged
  for (const t of TASKS.filter(t => t.user_id === A && (!t.filters || t.kind === "research"))) {
    const g = byId[t.id]; if (!(g && Array.isArray(g.criteria) && g.criteria.length === 0 && g.summary === t.summary)) fails.push(`Task ${t.id.slice(0, 8)} (${t.kind}, filters ${t.filters ? "yes" : "none"}): criteria ${JSON.stringify(g && g.criteria)}, summary "${g && g.summary}"`);
  }
  // (3) nobody reads another user's line
  const b = await call("bbb", LIST), bt = b.tasks || [];
  if (bt.length !== 1 || bt[0].id !== TASKS[4].id) fails.push(`second user's list holds ${bt.length} Tasks, expected only their own`);
  if (/Zzyzx|BMW|black|manual|1984/.test(JSON.stringify(b))) fails.push("second user's list holds words of the first user's Tasks");
  const b2 = await call("bbb", { ...LIST, task_id: TASKS[0].id, open: TASKS[0].id, user_id: A });
  if (/Zzyzx|BMW|manual/.test(JSON.stringify(b2))) fails.push("a task_id, open or user_id in the request widened the read to the first user's Task");
  // (4) no page types or builds the words: the live app and the preview page print the field as sent
  const files = ["public/js/tasks.js", "public/tasks.html", "lib/preview/tasksApp.js", "lib/preview/tasksMine.js"].filter(f => fs.existsSync(path.join(ROOT, f)));
  for (const f of files) { const s = fs.readFileSync(path.join(ROOT, f), "utf8"); if (/matchReasonList|matchReasons\(/.test(s) && !/criteriaOf/.test(s)) fails.push(`${f} builds the words itself`); if (/criteria\s*=\s*\[[^\]]*`/.test(s) || /\.criteria\s*=\s*[^;]*split\(/.test(s)) fails.push(`${f} composes the criteria on the page`); }
  return fails;
}
if (process.argv[1] && process.argv[1].endsWith("tasksCriteriaCheck.mjs")) {
  const MUTS = [
    ["the list carries no criteria", { api: s => s.replace("for (const t of withThreads) t.criteria = criteriaOf(t);", "") }],
    ["the criteria is the summary typed", { api: s => s.replace("t.criteria = criteriaOf(t);", "t.criteria = [t.summary];") }],
    ["a research Task gets criteria", { tasks: s => s.replace('f && task.kind !== "research" ? matchReasonList(f) : []', "f ? matchReasonList(f) : []") }],
    ["a Task with no filters gets the summary as criteria", { tasks: s => s.replace('f && task.kind !== "research" ? matchReasonList(f) : []', 'f && task.kind !== "research" ? matchReasonList(f) : [task.summary]') }],
    ["the list is not scoped to the signed in user", { api: s => s.replace('const tasks = await userTasks(env, user.userId);\n      const withThreads', 'const tasks = await userTasks(env, "");\n      const withThreads') }],
    ["the criteria drops its first word", { api: s => s.replace("for (const t of withThreads) t.criteria = criteriaOf(t);", "for (const t of withThreads) t.criteria = criteriaOf(t).slice(1);") }]
  ];
  const base = await findings(); for (const f of base) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  the public list carries the engine's criteria, equal to the preview door; no filters or research: none; nobody reads another user's line`);
  let survivors = 0;
  if (process.argv.includes("--mutants")) for (const [name, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } const killed = f.length > 0; console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`); if (!killed) survivors++; }
  console.log(`\ntasksCriteriaCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (survivors ? `, ${survivors} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || survivors ? 1 : 0);
}
