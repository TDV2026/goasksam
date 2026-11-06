// clock: real-ok row times are offsets from the real now in the same process, so the hour of the day changes nothing
// TASKS EMAIL TAP PAGE (Lane S, Nov 5 2026). The page a person lands on after tapping Start it again or Keep looking in a Task email, read as a person would hear it, for the case the tap cannot start the Task because the account is at its limit
// (a paused Task now takes a slot like any resume). Runs the real handler over a fake PostgREST.
//   at the limit:   "Still paused." / the Task's words / "Sam can't start it yet. the engine's limit sentence (limitLine)" / a link to the Tasks page. The Task stays paused and nothing is written.
//   a slot free:    "Searching again." (resume) or "Sam keeps looking." (keep looking), the Task running.
//   no dashes anywhere on the page; the limit sentence is the engine's (lib/tasks/limit.js), not typed here.
//   node scripts/tasksTapPageCheck.mjs
process.env.TASK_LINK_SECRET = "tap-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
const { oneTap } = await import("../lib/tasks/tasks.js");
const { FREE_TASK_LIMIT: FREE, limitLine } = await import("../lib/tasks/limit.js");
const { default: handler } = await import("../api/tasks.js");
const USER = "00000000-0000-4000-8000-0000000000d1";
const mk = (n, state) => ({ id: `30000000-0000-4000-8000-00000000000${n}`, user_id: USER, kind: "hunt", state, summary: `Sam is looking for car number ${n}.`, filters: { make: "BMW" }, unread: 0, created_at: new Date(Date.now() - n * 1000).toISOString(), updated_at: new Date().toISOString(), last_interaction_at: new Date().toISOString() });
let TASKS = [], WRITES = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), method = (init.method || "GET").toUpperCase(), q = k => u.searchParams.get(k) || "";
  if (p === "tasks" && method === "GET") {
    let rows = TASKS.slice();
    if (q("id").startsWith("eq.")) rows = rows.filter(t => t.id === q("id").slice(3)); if (q("id").startsWith("neq.")) rows = rows.filter(t => t.id !== q("id").slice(4));
    if (q("user_id").startsWith("eq.")) rows = rows.filter(t => t.user_id === q("user_id").slice(3));
    const st = /^in\.\((.*)\)$/.exec(q("state")); if (st) rows = rows.filter(t => st[1].split(",").includes(t.state));
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (method !== "GET" && p === "tasks") { WRITES.push({ p, method, body: init.body }); const id = q("id").replace("eq.", ""), t = TASKS.find(x => x.id === id); if (t && init.body) Object.assign(t, JSON.parse(init.body)); return new Response(JSON.stringify(t ? [t] : []), { status: 200 }); }
  if (method !== "GET") { WRITES.push({ p, method }); return new Response("[]", { status: 201 }); }
  return new Response("[]", { status: 200 });
};
const resOf = () => { const r = { code: 0, body: "", headers: {}, status(c) { r.code = c; return r; }, send(b) { r.body = String(b); return r; }, json(b) { r.body = JSON.stringify(b); return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader() {} }; return r; };
const tapUrl = (id, act) => new URL(oneTap(id, act, "https://goasksam.com"));
async function tap(id, act, method) { const u = tapUrl(id, act), r = resOf(); await handler({ method, headers: {}, query: { a: act, t: u.searchParams.get("t") }, body: {}, url: u.pathname + u.search }, r); return r; }
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const text = r => r.body.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
for (const act of ["resume", "keep_looking"]) {
  // at the limit: FREE working Tasks and one paused
  TASKS = [...Array.from({ length: FREE }, (_, i) => mk(i + 1, "running")), mk(FREE + 1, "paused")]; WRITES = [];
  const paused = TASKS[FREE], r = await tap(paused.id, act, "POST"), t = text(r);
  ok(/Still paused\./.test(t) && t.includes(paused.summary) && t.includes("Sam can't start it yet.") && t.includes(limitLine(FREE)), `${act} at the limit: the page reads "${t.slice(0, 200)}"`);
  ok(!/Searching again|Sam keeps looking/.test(t), `${act} at the limit: the page does not claim it started`);
  ok(paused.state === "paused" && !WRITES.some(w => w.p === "tasks"), `${act} at the limit: the Task stays paused and nothing is written`);
  ok(/href="\/tasks\/mine"/.test(r.body), `${act} at the limit: the link goes to the Tasks page, where the person can stop one`);
  ok(!/[–—]/.test(r.body) && !/ - /.test(t), `${act} at the limit: no dashes`);
  // a slot free
  TASKS = [...Array.from({ length: FREE - 1 }, (_, i) => mk(i + 1, "running")), mk(FREE, "paused")]; WRITES = [];
  const r2 = await tap(TASKS[FREE - 1].id, act, "POST"), t2 = text(r2);
  ok((act === "resume" ? /Searching again\./ : /Sam keeps looking\./).test(t2) && TASKS[FREE - 1].state === "running", `${act} with a slot free: it starts ("${t2.slice(0, 80)}")`);
}
console.log(`tasksTapPageCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
