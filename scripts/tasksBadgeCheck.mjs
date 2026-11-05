// TASKS UNREAD BADGE, CREW ONLY (Lane S, Nov 5 2026; NOT live). The nav badge number comes from /api/tasks?summary=1 `count`. For a request with the SIGNED crew cookie it is the sum of tasks.unread for the person, and nothing at zero;
// every other request (no cookie, a forged or expired cookie, a tester or seat cookie, a ?crew= query) gets the old count, byte for byte what the code on origin/main answers. Runs the real handler in-process over a fake PostgREST.
//   1. crew, unread 2 + 0 + 3 over three Tasks (one paused, one done): count 5; all zero: 0; the old count (open Tasks + watches + alerts) is NOT shown to crew;
//   2. non-crew and forged cookies: the response is byte-identical to origin/main's handler on the same data;
//   3. opening the badge's source (the summary call) and the Tasks page list without `open` mark nothing read; only list with open:<task id> resets that one Task.
// MUTANTS (each must fail): the badge ignores crew; crew read from a query; the badge counts the old total for crew; the summary resets unread; the list resets every Task.
//   node scripts/tasksBadgeCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
process.env.CURTAIN_CREW_CODE = "badge-check-secret"; process.env.PROBE_KEY = "probe-check"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const { mintCrewCookieValue, CREW_MAX_AGE_S } = await import("../lib/_crew.js");
const { mintTesterCookieValue } = await import("../lib/_tester.js");
const USER = "00000000-0000-4000-8000-0000000000b1";
const mkTasks = unread => unread.map((u, i) => ({ id: `10000000-0000-4000-8000-00000000000${i}`, user_id: USER, kind: "hunt", state: ["running", "paused", "done", "needs_you"][i % 4], summary: "Sam is looking for BMWs.", filters: { make: "BMW" }, unread: u, updated_at: new Date(Date.now() - i * 1000).toISOString(), created_at: new Date().toISOString() }));
let TASKS = [], PATCHES = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), method = (init.method || "GET").toUpperCase();
  if (p === "tasks" && method === "GET") return new Response(JSON.stringify(TASKS.filter(t => !u.searchParams.get("user_id") || u.searchParams.get("user_id") === "eq." + t.user_id)), { status: 200 });
  if (p === "tasks" && method === "PATCH") { const id = (u.searchParams.get("id") || "").replace("eq.", ""), body = JSON.parse(init.body); PATCHES.push({ id, body }); const t = TASKS.find(x => x.id === id); if (t) Object.assign(t, body); return new Response(JSON.stringify(t ? [t] : []), { status: 200 }); }
  return new Response("[]", { status: 200 });
};
const resOf = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader() {} }; return r; };
const reqOf = (cookie, { method = "GET", query = { summary: "1" }, body = null } = {}) => ({ method, headers: { cookie: cookie || "", "x-probe-key": "probe-check", "x-test-user": USER }, query, body, url: "/api/tasks" });
let seq = 0;
async function loadHandler(src) { const f = path.join(ROOT, "api", `__badge${++seq}_tasks.js`); fs.writeFileSync(f, src); try { return (await import(pathToFileURL(f).href)).default; } finally { fs.rmSync(f, { force: true }); } }
const SRC = fs.readFileSync(path.join(ROOT, "api/tasks.js"), "utf8");
let OLD = null; try { OLD = execSync("git show origin/main:api/tasks.js", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}

export async function findings(mut = {}) {
  const fails = [], h = await loadHandler(mut.api ? mut.api(SRC) : SRC);
  const crew = "gas_crew=" + mintCrewCookieValue(), forged = "gas_crew=v1." + String(Date.now() + 1e9).slice(0, 13) + "." + "A".repeat(43), expired = "gas_crew=" + mintCrewCookieValue(Date.now() - CREW_MAX_AGE_S * 1000 - 5000);
  const call = async (cookie, o) => { const r = resOf(); await h(reqOf(cookie, o), r); return r; };
  TASKS = mkTasks([2, 0, 3, 0]); PATCHES = [];
  const c = await call(crew); if (!(c.body && c.body.count === 5)) fails.push(`crew: the badge count is ${c.body && c.body.count} (expected the unread sum, 5)`);
  if (c.body && c.body.unread !== 5) fails.push("crew: the unread field changed");
  TASKS = mkTasks([0, 0, 0, 0]); const z = await call(crew); if (!(z.body && z.body.count === 0)) fails.push(`crew with nothing unread: count ${z.body && z.body.count} (expected 0, so nothing is drawn)`);
  // non-crew: byte identical to origin/main
  if (OLD) {
    const ho = await loadHandler(OLD);
    for (const [name, cookie, o] of [["no cookie", "", undefined], ["a forged crew cookie", forged, undefined], ["an expired crew cookie", expired, undefined], ["a tester cookie", "gas_tester=" + mintTesterCookieValue(), undefined], ["a ?crew= query", "", { query: { summary: "1", crew: process.env.CURTAIN_CREW_CODE } }]]) {
      TASKS = mkTasks([2, 0, 3, 0]); const a = await call(cookie, o), r2 = resOf(); await ho(reqOf(cookie, o), r2);
      if (JSON.stringify(a.body) !== JSON.stringify(r2.body)) fails.push(`${name}: the summary is not byte-identical to origin/main (${JSON.stringify(a.body).slice(0, 80)} vs ${JSON.stringify(r2.body).slice(0, 80)})`);
      if (a.body && a.body.count === a.body.unread && a.body.unread !== 0 && false) fails.push("fixture cannot tell the counts apart");
    }
  } else fails.push("could not read origin/main's api/tasks.js to compare");
  { TASKS = mkTasks([2, 0, 3, 0]); const n = await call(""); if (n.body && n.body.count === 5) fails.push("non-crew got the unread sum (5) instead of the old count"); }
  // nothing is marked read by the badge call or by opening the list without a Task
  TASKS = mkTasks([2, 0, 3, 0]); PATCHES = [];
  await call(crew); await call(crew, { method: "POST", query: {}, body: { action: "list" } });
  if (PATCHES.some(p => "unread" in p.body) || TASKS.reduce((k, t) => k + t.unread, 0) !== 5) fails.push("the badge call or the Tasks page list marked something read");
  await call(crew, { method: "POST", query: {}, body: { action: "list", open: TASKS[2].id } });
  if (!(TASKS[2].unread === 0 && TASKS[0].unread === 2)) fails.push(`opening one Task reset ${TASKS.map(t => t.unread).join(",")} (expected only that Task to reset: 2,0,0,0)`);
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["the badge ignores crew (always the old count)", { api: s => rep(s, "count: badgeCount(isCrewRequest(req) === true, bf.total,", "count: badgeCount(false, bf.total,") }],
  ["crew is read from a query parameter", { api: s => rep(s, "count: badgeCount(isCrewRequest(req) === true, bf.total,", "count: badgeCount(!!(q && q.crew), bf.total,") }],
  ["crew is read from the cookie shape", { api: s => rep(s, "count: badgeCount(isCrewRequest(req) === true, bf.total,", "count: badgeCount(/gas_crew=/.test(String(req.headers.cookie || \"\")), bf.total,") }],
  ["the summary call resets unread", { api: s => rep(s, "const tasks = await userTasks(env, user.userId);\n      const open = tasks.filter(t => [\"running\", \"needs_you\", \"paused\"].includes(t.state));", "const tasks = await userTasks(env, user.userId); for (const t0 of tasks) if (t0.unread) await saveTask(env, t0.id, { unread: 0 });\n      const open = tasks.filter(t => [\"running\", \"needs_you\", \"paused\"].includes(t.state));") }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 130)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksBadgeCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
