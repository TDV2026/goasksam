// clock: real-ok every date is built from the real now in the same process (cookie expiry and row times are offsets from it), so the hour of the day changes nothing
// TASKS CREW EXPORT AND BADGE CHECK (Lane S, Nov 5 2026; crew only, NOT live). Two things Lane E's Tasks preview reads, and the proof a non crew request can never read them.
//   crewTaskLimit() / CREW_TASK_LIMIT (lib/tasks/limit.js): page code reads the crew number there and never types it. The number is code, not a grant, so:
//     - the API door tells a crew request ten (limit.max, limit.statusLine, counts.tasks.max, counts.line) and EVERY other request three, in the summary and in the list;
//     - only crew-gated files may import it (the allow-list below); nothing under public/ (served to everyone) ever names it.
//   badge: { unread: N } in the LIST answer (action "list"): the sum of tasks.unread for a request with the signed crew cookie; the key is ABSENT at zero and for every other request, whose answer is byte for byte what origin/main's handler gives
//     (a forged cookie included). Only opening one Task (list with open) resets that Task, which then leaves the sum; the list call and the summary call mark nothing read.
// Runs the real handler in-process over a fake PostgREST. MUTANTS (each must fail): badge for everyone; crew read from a query, from a cookie shape; the badge key at zero; the list marks read; the facts take the crew limit for everyone; a public file imports the crew number.
//   node scripts/tasksCrewExportCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
process.env.CURTAIN_CREW_CODE = "export-check-secret"; process.env.PROBE_KEY = "probe-check"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SUPABASE_ANON_KEY = "anon";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const { mintCrewCookieValue, CREW_MAX_AGE_S } = await import("../lib/_crew.js");
const { mintTesterCookieValue } = await import("../lib/_tester.js");
const { mintSeatCookieValue } = await import("../lib/desk/seatCookie.js");
const LIMIT = await import("../lib/tasks/limit.js"), FREE = LIMIT.FREE_TASK_LIMIT, CREW = LIMIT.CREW_TASK_LIMIT;   // read, never typed
const USER = "00000000-0000-4000-8000-0000000000c1";
const mkTasks = unread => unread.map((u, i) => ({ id: `20000000-0000-4000-8000-00000000000${i}`, user_id: USER, kind: "hunt", state: ["running", "paused", "done", "needs_you"][i % 4], summary: "Sam is looking for BMWs.", filters: { make: "BMW" }, unread: u, updated_at: new Date(Date.now() - i * 1000).toISOString(), created_at: new Date().toISOString() }));
let TASKS = [], PATCHES = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), method = (init.method || "GET").toUpperCase();
  if (u.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: USER, email: "p@example.com" }), { status: 200 });   // the real sign-in path: a three-part token of an unknown alg defers to GoTrue, which this answers
  if (p === "tasks" && method === "GET") return new Response(JSON.stringify(TASKS.filter(t => !u.searchParams.get("user_id") || u.searchParams.get("user_id") === "eq." + t.user_id)), { status: 200 });
  if (p === "tasks" && method === "PATCH") { const id = (u.searchParams.get("id") || "").replace("eq.", ""), body = JSON.parse(init.body); PATCHES.push({ id, body }); const t = TASKS.find(x => x.id === id); if (t) Object.assign(t, body); return new Response(JSON.stringify(t ? [t] : []), { status: 200 }); }
  return new Response("[]", { status: 200 });
};
const resOf = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader() {} }; return r; };
const reqOf = (cookie, { method = "GET", query = { summary: "1" }, body = null } = {}) => ({ method, headers: { cookie: cookie || "", authorization: "Bearer eyJhbGciOiJub25lIn0.e30.sig" }, query, body, url: "/api/tasks" });
let seq = 0;
async function loadHandler(apiSrc, gateSrc) {
  const mine = [], put = (n, src) => { const f = path.join(ROOT, n); fs.writeFileSync(f, src); mine.push(f); return pathToFileURL(f).href; };
  try {
    const tag = `__expmut${++seq}_`;
    let api = apiSrc; if (gateSrc) { put(`lib/tasks/${tag}crewGate.js`, gateSrc); api = api.replace('"../lib/tasks/crewGate.js"', `"../lib/tasks/${tag}crewGate.js"`); }
    return (await import(put(`api/${tag}tasks.js`, api))).default;
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
const API = fs.readFileSync(path.join(ROOT, "api/tasks.js"), "utf8"), GATE = fs.readFileSync(path.join(ROOT, "lib/tasks/crewGate.js"), "utf8");
let OLD = null; try { OLD = execSync("git show origin/main:api/tasks.js", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
const ALLOWED = /^(lib\/tasks\/limit\.js|lib\/tasks\/crewGate\.js|scripts\/tasks(Crew(Limit|Export)|Left)Check\.mjs|scripts\/taskLimitLiteralCheck\.mjs|scripts\/tasksPreviewCheck\.mjs|scripts\/prePush\.mjs|lib\/preview\/|lib\/crewPages\/)/;
export function importers(files) { return Object.entries(files).filter(([f, t]) => /\b(crewTaskLimit|CREW_TASK_LIMIT)\b/.test(t) && !ALLOWED.test(f)).map(([f]) => f); }
function readAll() { const out = {}, walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); } else if (/\.(m?js|html)$/.test(e.name) && !/^__/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8"); } }; for (const d of ["api", "lib", "public", "scripts"]) walk(d); return out; }

export async function findings(mut = {}) {
  const fails = [], h = await loadHandler(mut.api ? mut.api(API) : API, mut.gate ? mut.gate(GATE) : null);
  const crew = "gas_crew=" + mintCrewCookieValue(), forged = "gas_crew=v1." + String(Date.now() + 1e9).slice(0, 13) + "." + "A".repeat(43), expired = "gas_crew=" + mintCrewCookieValue(Date.now() - CREW_MAX_AGE_S * 1000 - 5000);
  const nonCrew = { "no cookie": ["", undefined], "a forged crew cookie": [forged, undefined], "an expired crew cookie": [expired, undefined], "a tester cookie": ["gas_tester=" + mintTesterCookieValue(), undefined], "a seat cookie": ["gas_seat=" + mintSeatCookieValue(2), undefined], "a ?crew= query": ["", { query: { summary: "1", crew: process.env.CURTAIN_CREW_CODE } }] };
  const call = async (cookie, o) => { const r = resOf(); await h(reqOf(cookie, o), r); return r; };
  const LIST = { method: "POST", query: {}, body: { action: "list", fast: true } };
  // 1. the facts: crew ten, everyone else three, summary and list
  TASKS = mkTasks([2, 0, 3, 0]);
  for (const [where, o] of [["summary", undefined], ["list", LIST]]) {
    const c = await call(crew, o), b = c.body || {};
    if (!(b.limit && b.limit.max === CREW && b.counts && b.counts.tasks.max === CREW && String(b.limit.statusLine || "").includes(`of ${CREW} `))) fails.push(`crew ${where}: the facts do not carry ${CREW} (limit.max ${b.limit && b.limit.max}, line "${b.limit && b.limit.statusLine}")`);
    for (const [name, [cookie, q]] of Object.entries(nonCrew)) {
      const n = await call(cookie, where === "list" ? LIST : q), nb = n.body || {};
      if (!(nb.limit && nb.limit.max === FREE && nb.counts && nb.counts.tasks.max === FREE)) fails.push(`${name} ${where}: the facts carry ${nb.limit && nb.limit.max}, expected ${FREE}`);
      if (JSON.stringify(nb).includes(`of ${CREW} `) || JSON.stringify(nb.limit || {}).includes(String(CREW)) || JSON.stringify(nb.counts || {}).includes(`"max":${CREW}`)) fails.push(`${name} ${where}: the answer names the crew number ${CREW}`);
    }
  }
  // 2. the export is the one source, and only crew-gated code may import it
  if (LIMIT.crewTaskLimit() !== CREW || !(CREW > FREE)) fails.push("crewTaskLimit() is not CREW_TASK_LIMIT above the free limit");
  { const bad = importers({ ...readAll(), ...(mut.extraFiles || {}) }); if (bad.length) fails.push(`files outside the crew-gated allow-list name the crew number: ${bad.join(", ")}`); }
  // 3. badge in the list answer
  TASKS = mkTasks([2, 0, 3, 0]); PATCHES = [];
  { const c = await call(crew, LIST); if (!(c.body && c.body.badge && c.body.badge.unread === 5 && Object.keys(c.body.badge).join() === "unread")) fails.push(`crew list: badge is ${JSON.stringify(c.body && c.body.badge)} (expected { unread: 5 })`); }
  TASKS = mkTasks([0, 0, 0, 0]); { const z = await call(crew, LIST); if (z.body && "badge" in z.body) fails.push(`crew list at zero unread: the badge key is present (${JSON.stringify(z.body.badge)}), it must be absent`); }
  if (OLD) {
    const ho = await loadHandler(OLD);
    for (const [name, [cookie]] of Object.entries(nonCrew)) {
      TASKS = mkTasks([2, 0, 3, 0]); const a = await call(cookie, LIST), r2 = resOf(); await ho(reqOf(cookie, LIST), r2);
      if ("badge" in (a.body || {})) fails.push(`${name}: the list answer carries a badge`);
      if (JSON.stringify(a.body) !== JSON.stringify(r2.body)) fails.push(`${name}: the list answer is not byte-identical to origin/main (${JSON.stringify(a.body).slice(0, 70)} vs ${JSON.stringify(r2.body).slice(0, 70)})`);
    }
  } else fails.push("could not read origin/main's api/tasks.js to compare");
  // 4. the reset rule: the list and the summary mark nothing; opening one Task resets only that Task and it leaves the sum
  TASKS = mkTasks([2, 0, 3, 0]); PATCHES = [];
  await call(crew, LIST); await call(crew); await call(crew, { method: "POST", query: {}, body: { action: "list" } });
  if (PATCHES.some(p => "unread" in p.body) || TASKS.reduce((k, t) => k + t.unread, 0) !== 5) fails.push("the list or the summary call marked something read");
  { const open = await call(crew, { method: "POST", query: {}, body: { action: "list", fast: true, open: TASKS[2].id } });
    if (!(TASKS[2].unread === 0 && TASKS[0].unread === 2)) fails.push(`opening one Task left unread ${TASKS.map(t => t.unread).join(",")} (expected 2,0,0,0)`);
    if (!(open.body && open.body.badge && open.body.badge.unread === 2)) fails.push(`the list that opens a Task says badge ${JSON.stringify(open.body && open.body.badge)} (expected { unread: 2 }, the Task it just read left out)`); }
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["the badge goes to everyone", { gate: g => rep(g, "if (isCrew !== true) return null;", "") }],
  ["crew for the badge read from a query parameter", { api: a => rep(a, "badgeFor(isCrewRequest(req) === true, tasks,", "badgeFor(!!(q && q.crew) || isCrewRequest(req) === true && false || (req.body && req.body.crew) === true, tasks,").replace("badgeFor(!!(q && q.crew) || isCrewRequest(req) === true && false || (req.body && req.body.crew) === true, tasks,", "badgeFor(!!(req.query && req.query.crew), tasks,") }],
  ["crew for the badge read from the cookie shape", { api: a => rep(a, "badgeFor(isCrewRequest(req) === true, tasks,", "badgeFor(/gas_crew=/.test(String(req.headers.cookie || \"\")), tasks,") }],
  ["the badge key is present at zero", { gate: g => rep(g, "return n > 0 ? { unread: n } : null;", "return { unread: n };") }],
  ["the list marks every Task read", { api: a => rep(a, "      const working = tasks.filter(t => [\"running\", \"needs_you\"].includes(t.state)).length;\n      const { standingCounts, badgeFacts } = await import(\"../lib/live/looking.js\");\n      const bf = badgeFacts(working, tasks.filter(", "      for (const t0 of tasks) if (t0.unread) await saveTask(env, t0.id, { unread: 0 });\n      const working = tasks.filter(t => [\"running\", \"needs_you\"].includes(t.state)).length;\n      const { standingCounts, badgeFacts } = await import(\"../lib/live/looking.js\");\n      const bf = badgeFacts(working, tasks.filter(") }],
  ["every request gets the crew limit in its facts", { gate: g => rep(g, "taskLimitFor(isCrewRequest(req) === true)", "taskLimitFor(true)") }],
  ["a public file imports the crew number", { extraFiles: { "public/js/__fixture.js": "import { crewTaskLimit } from '../lib/tasks/limit.js';" } }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 130)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksCrewExportCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
