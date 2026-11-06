// clock: real-ok cookie expiry is built from the real now in the same process, so the hour of the day changes nothing
// TASKS CREW LIMIT CHECK (Lane S, Nov 5 2026; NOT live). Ten active Tasks for the signed crew cookie only; three for everyone else. It tries a 4th Task on every door that must stay at three and requires refusal with max 3,
// and proves the crew door gets ten (11th refused, status line "of 10"):
//   free (max 3): no cookie, a forged crew cookie, an expired one (valid signature), a tester cookie, a seat cookie, a shape-only "gas_crew=ok", a ?crew=<code> query, an x-crew header, a user object carrying a made-up taskMax,
//                 the email one-tap resume, the email "keep looking" tap (a crew account's 4th to 10th Tasks cannot be resumed by an email tap: that is deliberate, the gate is not widened).
//   crew (max 10): the valid signed crew cookie.
// Each rule also runs against MUTANTS: the gate swapped for a query parameter; the crew limit read outside isCrewRequest (a cookie shape test); the email tap inheriting the crew limit; taskMaxOf trusting any number;
// keep_looking skipping the slot check (the hole this check found). Every mutant must fail.
//   node scripts/tasksCrewLimitCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.CURTAIN_CREW_CODE = "crew-limit-check-secret";
globalThis.fetch = async () => new Response("[]", { status: 200 });
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), LIB = path.join(ROOT, "lib/tasks");
let seq = 0;
async function load(mut = {}) {
  const mine = [], rd = f => fs.readFileSync(path.join(LIB, f), "utf8"), put = (n, src) => { const p = path.join(LIB, n); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  try {
    const n = ++seq, tag = `__crewmut${n}_`;
    const lim = put(`${tag}limit.js`, mut.limit ? mut.limit(rd("limit.js")) : rd("limit.js"));
    const gate = put(`${tag}crewGate.js`, (mut.gate ? mut.gate(rd("crewGate.js")) : rd("crewGate.js")).replace('"./limit.js"', `"./${tag}limit.js"`));
    const tasks = put(`${tag}tasks.js`, (mut.tasks ? mut.tasks(rd("tasks.js")) : rd("tasks.js")).replace('"./limit.js"', `"./${tag}limit.js"`));
    return { L: await import(lim), G: await import(gate), T: await import(tasks) };
  } finally { for (const p of mine) fs.rmSync(p, { force: true }); }
}
const { mintCrewCookieValue, CREW_MAX_AGE_S } = await import("../lib/_crew.js");
const { mintTesterCookieValue } = await import("../lib/_tester.js");
const { mintSeatCookieValue } = await import("../lib/desk/seatCookie.js");
// FREE and CREW are READ from lib/tasks/limit.js, never written here (scripts/taskLimitLiteralCheck.mjs).
const { FREE_TASK_LIMIT: FREE, CREW_TASK_LIMIT: CREW } = await import("../lib/tasks/limit.js");
const NAMES = [["Porsche", "911"], ["Ford", "Mustang"], ["Chevrolet", "Camaro"], ["BMW", "M3"], ["Toyota", "Supra"], ["Dodge", "Charger"], ["Jaguar", "E-Type"], ["Mazda", "Miata"], ["Nissan", "Skyline"], ["Honda", "NSX"], ["Ferrari", "308"], ["Lotus", "Esprit"], ["Audi", "Quattro"]];
const draftOf = (make, model) => ({ kind: "hunt", filters: { make, model }, words: `${make} ${model}`, summary: `Sam is looking for ${make} ${model}s.` });
const opts = { rows: [], testDrafts: [] };
const reqOf = ({ cookie = "", query = {}, headers = {} } = {}) => ({ method: "POST", headers: { cookie, ...headers }, query });
const uid = () => "bbbbbbbb-0000-4000-8000-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");

export async function findings(mut = {}) {
  const fails = [], { L, G, T } = await load(mut);
  const crewVal = mintCrewCookieValue();
  const forged = "v1." + String(Date.now() + 1e9).padEnd(13, "0").slice(0, 13) + "." + "A".repeat(43);
  const expired = mintCrewCookieValue(Date.now() - CREW_MAX_AGE_S * 1000 - 5000);
  const free = {
    "no cookie": reqOf(), "a forged crew cookie": reqOf({ cookie: "gas_crew=" + forged }), "an expired crew cookie (valid signature)": reqOf({ cookie: "gas_crew=" + expired }),
    "a tester cookie": reqOf({ cookie: "gas_tester=" + mintTesterCookieValue() }), "a seat cookie": reqOf({ cookie: "gas_seat=" + mintSeatCookieValue(2) }),
    "the old plain gas_crew=ok": reqOf({ cookie: "gas_crew=ok" }), "a ?crew=<code> query": reqOf({ query: { crew: process.env.CURTAIN_CREW_CODE, code: process.env.CURTAIN_CREW_CODE } }),
    "an x-crew header": reqOf({ headers: { "x-crew": "1", "x-crew-code": process.env.CURTAIN_CREW_CODE } })
  };
  const tryN = async (user, n) => { const env = { mem: T.memStore() }, out = []; for (let i = 0; i < n; i++) out.push(await T.startDraft(env, user, draftOf(...NAMES[i]), opts)); return { env, out }; };
  // free doors: three start, the 4th is refused with max 3
  for (const [name, req] of Object.entries(free)) {
    const user = G.taskUserFor(req, { userId: uid(), email: null }), { out } = await tryN(user, FREE + 1);
    if (!out.slice(0, FREE).every(r => r.task && !r.blocked)) fails.push(`${name}: the Tasks up to the free limit did not all start`);
    if (!(out[FREE].blocked && out[FREE].blocked.max === FREE && !out[FREE].task)) fails.push(`${name}: a Task past the free limit was not refused with the free max (${out[FREE].task ? "it STARTED" : JSON.stringify(out[FREE].blocked && out[FREE].blocked.max)})`);
  }
  for (const [name, taskMax] of [["a made-up taskMax of 99", 99], ["a string \"10\"", "10"], ["true", true]]) {
    const user = { userId: uid(), email: null, taskMax }, { out } = await tryN(user, FREE + 1);
    if (!(out[FREE].blocked && out[FREE].blocked.max === FREE)) fails.push(`a user object carrying ${name}: the Task past the free limit was not refused with the free max`);
  }
  // the crew door: ten start, the 11th is refused with max 10, the status line reads of 10
  {
    const user = G.taskUserFor(reqOf({ cookie: "gas_crew=" + crewVal }), { userId: uid(), email: null }), { env, out } = await tryN(user, CREW + 1);
    if (!out.slice(0, CREW).every(r => r.task && !r.blocked)) fails.push(`the signed crew cookie: Tasks up to the crew limit did not all start (${out.slice(0, CREW).filter(r => !r.task).length} refused)`);
    if (!(out[CREW].blocked && out[CREW].blocked.max === CREW && !out[CREW].task)) fails.push("the signed crew cookie: the Task past the crew limit was not refused with the crew max");
    const f7 = L.limitFacts(7, L.taskMaxOf(user)); if (f7.statusLine !== `You have 7 of ${CREW} Tasks running. ${CREW - 7} Tasks left.`) fails.push(`the crew status line reads "${f7.statusLine}"`);
    const f3 = L.limitFacts(2, L.taskMaxOf(G.taskUserFor(reqOf(), { userId: "x" }))); if (f3.statusLine !== `You have 2 of ${FREE} Tasks running. ${FREE - 2} ${FREE - 2 === 1 ? "Task" : "Tasks"} left.`) fails.push(`the free status line reads "${f3.statusLine}"`);
    // the crew account's setup turn is not blocked at 5 and is blocked at 10
    // ---- the email tap: a crew account with 5 working Tasks and a paused one. The tap resumes nothing (free limit), keep_looking neither.
    const env2 = { mem: T.memStore() }, crewUser = G.taskUserFor(reqOf({ cookie: "gas_crew=" + crewVal }), { userId: uid(), email: null });
    for (let i = 0; i < 6; i++) await T.startDraft(env2, crewUser, draftOf(...NAMES[i]), opts);
    const all = await T.userTasks(env2, crewUser.userId); await T.controlTask(env2, crewUser, all[0].id, "pause");
    for (const act of ["resume", "keep_looking"]) {
      const tapped = await T.controlTask(env2, G.tapUser({ user_id: crewUser.userId }), all[0].id, act, { via: "email_link" });
      const st = (await T.getTask(env2, all[0].id)).state;
      if (!(tapped.blocked && tapped.blocked.max === FREE) || st !== "paused") fails.push(`the email ${act} tap on a crew account with 5 Tasks working: not refused with max 3 (state ${st}, max ${tapped.blocked && tapped.blocked.max})`);
    }
    const viaPage = await T.controlTask(env2, crewUser, all[0].id, "resume"); if (!(viaPage.task && viaPage.task.state === "running")) fails.push("the crew account could not resume its paused Task from the Tasks page (5 working, limit 10)");
  }
  // a non-crew account under the limit: the tap still works, and a paused Task over the limit is held by keep_looking too
  {
    const env = { mem: T.memStore() }, u = { userId: uid(), email: null };
    for (let i = 0; i < 3; i++) await T.startDraft(env, u, draftOf(...NAMES[i]), opts);
    const t0 = (await T.userTasks(env, u.userId))[0]; await T.controlTask(env, u, t0.id, "pause"); await T.startDraft(env, u, draftOf(...NAMES[3]), opts);
    const kl = await T.controlTask(env, G.tapUser({ user_id: u.userId }), t0.id, "keep_looking", { via: "email_link" });
    if (!(kl.blocked && (await T.getTask(env, t0.id)).state === "paused")) fails.push("the email keep_looking tap on a paused Task at three working Tasks started a 4th Task");
    const other = (await T.workingTasks(env, u.userId))[0]; await T.controlTask(env, u, other.id, "stop");
    const ok = await T.controlTask(env, G.tapUser({ user_id: u.userId }), t0.id, "keep_looking", { via: "email_link" }); if (!(ok.task && ok.task.state === "running")) fails.push("the email keep_looking tap does not work once a slot is free");
  }
  // static: the crew number is chosen in exactly one place, behind isCrewRequest, and nothing else assigns taskMax
  {
    const tracked = [];
    for (const d of ["api", "lib"]) { const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.js$/.test(e.name) && !/__crewmut/.test(e.name) && !/^lib[\\/](preview|crewPages)[\\/]/.test(path.relative(ROOT, f))) tracked.push(f); } }; walk(path.join(ROOT, d)); }   // the crew only previews (lib/preview, lib/crewPages) read the limit to print it; scripts/tasksCrewExportCheck.mjs proves they are crew gated and never under public/
    const uses = tracked.filter(f => /CREW_TASK_LIMIT|taskMax\s*[:=]/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""))).map(f => path.relative(ROOT, f)).sort();
    if (JSON.stringify(uses) !== JSON.stringify(["lib/tasks/crewGate.js", "lib/tasks/limit.js"])) fails.push(`the crew limit is referenced outside limit.js and crewGate.js: ${uses.join(", ")}`);
    const gateSrc = fs.readFileSync(path.join(LIB, "crewGate.js"), "utf8"), api = fs.readFileSync(path.join(ROOT, "api/tasks.js"), "utf8");
    if (!/taskLimitFor\(isCrewRequest\(req\) === true\)/.test(gateSrc)) fails.push("crewGate.js does not choose the limit with isCrewRequest(req) === true");
    if (!/return taskUserFor\(req, u\)/.test(api) || !/controlTask\(env, tapUser\(task\)/.test(api)) fails.push("api/tasks.js does not build its user with taskUserFor and the email tap with tapUser");
  }
  return fails;
}

const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["the gate swapped for a query parameter", { gate: s => rep(s, "taskLimitFor(isCrewRequest(req) === true)", "taskLimitFor(!!(req.query && req.query.crew))") }],
  ["the crew limit read outside isCrewRequest (a cookie shape test)", { gate: s => rep(s, "taskLimitFor(isCrewRequest(req) === true)", "taskLimitFor(/gas_crew=/.test(String((req.headers || {}).cookie || \"\")))") }],
  ["the crew limit read from a header", { gate: s => rep(s, "taskLimitFor(isCrewRequest(req) === true)", "taskLimitFor(!!(req.headers && req.headers[\"x-crew\"]))") }],
  ["the email tap inherits the crew limit", { gate: s => rep(s, "export const tapUser = task => ({ userId: task.user_id });", "export const tapUser = task => ({ userId: task.user_id, taskMax: 10 });") }],
  ["taskMaxOf trusts any number", { limit: s => rep(s, "user && user.taskMax === CREW_TASK_LIMIT ? CREW_TASK_LIMIT : FREE_TASK_LIMIT", "user && user.taskMax > 0 ? user.taskMax : FREE_TASK_LIMIT") }],
  ["keep_looking skips the slot check (the hole)", { tasks: s => rep(s, 'if (task.state === "paused") { const held = await slotTask(env, user.userId, task.id, taskMaxOf(user)); if (held) return { ...blockedOf(held, taskMaxOf(user)), task }; }\n', "") }],
  ["the crew limit ignored by the slot check", { tasks: s => rep(s, "const held = await slotTask(env, user.userId, task.id, taskMaxOf(user)); if (held) return { ...blockedOf(held, taskMaxOf(user)), task };\n    task = await saveTask(env, task.id, { state: \"running\"", "const held = await slotTask(env, user.userId, task.id); if (held) return { ...blockedOf(held), task };\n    task = await saveTask(env, task.id, { state: \"running\"") }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 130)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksCrewLimitCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
