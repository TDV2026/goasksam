// clock: real-ok row times are offsets from the real now in the same process, so the hour of the day changes nothing
// TASKS LEFT CHECK (Lane S, Nov 6 2026; crew only for ten, NOT live). Cause: the Tasks answer carried max and working but no number for "how many more may start", so a page that wanted to say
// "2 active Tasks. 1 of 3 remaining." had to subtract, and a page that subtracts can disagree with the engine (a different count of what is active, a hard coded 3 on a crew page, a negative number).
// Fix: limit.left (limitFacts) and counts.tasks.left (countsOf) both come from ONE function, leftOf in lib/tasks/limit.js: max minus working, never below zero. Working = running or needs_you; paused
// and stopped (done) Tasks are not counted. Same for crew (ten) and everyone else (three).
// Class: every place that carries a limit and a count (the limit facts, the counts, the status line) and every page that shows them. This check proves:
//   1. leftOf, limitFacts and countsOf agree with max minus working for working 0 to max plus 3, at the free limit and the crew limit, never below zero, and the status line says the same number;
//   2. through the real handler (summary and list, fake PostgREST, real sign-in path): Tasks in every state, crew (ten) and no cookie (three): left is max minus the running and needs_you Tasks, in limit AND counts.tasks;
//   3. no page (public/, lib/preview, lib/crewPages) types a subtraction of the limit from the count.
// MUTANTS (each must fail): no left field; left not clamped; left counts paused Tasks; left uses the free limit for crew; counts.tasks has no left; a page that types max minus working.
//   node scripts/tasksLeftCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
process.env.CURTAIN_CREW_CODE = "left-check-secret"; process.env.PROBE_KEY = "probe-check"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SUPABASE_ANON_KEY = "anon";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const { mintCrewCookieValue } = await import("../lib/_crew.js");
const LIMIT = await import("../lib/tasks/limit.js"), FREE = LIMIT.FREE_TASK_LIMIT, CREW = LIMIT.CREW_TASK_LIMIT;   // read, never typed
const USER = "00000000-0000-4000-8000-0000000000d1";
const mk = states => states.map((state, i) => ({ id: `40000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, user_id: USER, kind: "hunt", state, summary: "Sam is looking for BMWs.", filters: { make: "BMW" }, unread: 0, updated_at: new Date(Date.now() - i * 1000).toISOString(), created_at: new Date().toISOString() }));
let TASKS = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname.replace("/rest/v1/", ""), method = (init.method || "GET").toUpperCase();
  if (u.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: USER, email: "p@example.com" }), { status: 200 });
  if (p === "tasks" && method === "GET") return new Response(JSON.stringify(TASKS), { status: 200 });
  return new Response("[]", { status: 200 });
};
const resOf = () => { const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, getHeader(k) { return r.headers[k.toLowerCase()]; }, removeHeader() {} }; return r; };
const reqOf = (cookie, { method = "GET", query = { summary: "1" }, body = null } = {}) => ({ method, headers: { cookie: cookie || "", authorization: "Bearer eyJhbGciOiJub25lIn0.e30.sig" }, query, body, url: "/api/tasks" });
let seq = 0;
async function load(mut = {}) {
  const mine = [], put = (f, src) => { const p = path.join(ROOT, f); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  const tag = `__leftmut${++seq}_`, rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  {
    const lim = put(`lib/tasks/${tag}limit.js`, mut.limit ? mut.limit(rd("lib/tasks/limit.js")) : rd("lib/tasks/limit.js"));
    const look = put(`lib/live/${tag}looking.js`, rd("lib/live/looking.js").replace('"../tasks/limit.js"', `"../tasks/${tag}limit.js"`));
    const api = rd("api/tasks.js").replace('"../lib/tasks/limit.js"', `"../lib/tasks/${tag}limit.js"`).split('"../lib/live/looking.js"').join(`"../lib/live/${tag}looking.js"`);
    const h = (await import(put(`api/${tag}tasks.js`, api))).default;
    return { L: await import(lim), look: await import(look), h, done: () => { for (const p of mine) fs.rmSync(p, { force: true }); } };
  }
}
// a page file that types the subtraction: the scan
const RE = [/\b[\w$.]*\bmax\w*\s*-\s*[\w$.]*\b(working|active|open)\w*/i, /\b[\w$.]*\b(working|active)\w*\s*\)?\s*-\s*\(?[\w$.]*\bmax\w*/i];
export function pageSubtractions(files) { return Object.entries(files).filter(([, t]) => t.split("\n").some(l => RE.some(r => r.test(l)))).map(([f]) => f); }
function pageFiles() { const out = {}, walk = d => { const dir = path.join(ROOT, d); if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); } else if (/\.(m?js|html)$/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8"); } }; for (const d of ["public", "lib/preview", "lib/crewPages"]) walk(d); return out; }

export async function findings(mut = {}) {
  const ld = await load(mut);
  try { return await run(mut, ld); } finally { ld.done(); }
}
async function run(mut, { L, look, h }) {
  const fails = [];
  const WORKING = ["running", "needs_you"];
  // 1. the arithmetic, every path
  for (const max of [FREE, CREW]) for (let w = 0; w <= max + 3; w++) {
    const want = Math.max(0, max - w), f = L.limitFacts(w, max), c = look.countsOf(w, 0, 0, w, max);
    if (f.left !== want) fails.push(`limitFacts(${w}, ${max}).left is ${f.left}, expected ${want}`);
    if (c.tasks.left !== want) fails.push(`countsOf(${w}, ..., ${max}).tasks.left is ${c.tasks.left}, expected ${want}`);
    if (L.leftOf(w, max) !== want) fails.push(`leftOf(${w}, ${max}) is ${L.leftOf(w, max)}, expected ${want}`);
    if (f.left < 0) fails.push(`left went below zero at working ${w} of ${max}`);
    if (want > 0 && w > 0 && !String(f.statusLine || "").includes(`${want} `)) fails.push(`the status line does not say ${want} left at working ${w} of ${max}: "${f.statusLine}"`);
  }
  // 2. through the real handler: paused and stopped Tasks are not counted
  const crew = "gas_crew=" + mintCrewCookieValue();
  const SETS = [["running", "paused", "done"], ["running", "needs_you", "paused", "paused", "done", "done"], ["paused", "done"], WORKING.concat(WORKING, ["running"]), Array(FREE + 2).fill("running"), Array(CREW + 1).fill("running"), []];
  for (const states of SETS) {
    TASKS = mk(states); const working = states.filter(s => WORKING.includes(s)).length;
    for (const [who, cookie, max] of [["crew", crew, CREW], ["no cookie", "", FREE]]) for (const [where, o] of [["summary", undefined], ["list", { method: "POST", query: {}, body: { action: "list", fast: true } }]]) {
      const r = resOf(); await h(reqOf(cookie, o), r); const b = r.body || {}, want = Math.max(0, max - working);
      if (!(b.limit && b.limit.working === working && b.limit.max === max)) { fails.push(`${who} ${where} [${states.join(",")}]: limit says working ${b.limit && b.limit.working} max ${b.limit && b.limit.max}, expected ${working} of ${max}`); continue; }
      if (b.limit.left !== want) fails.push(`${who} ${where} [${states.join(",")}]: limit.left is ${b.limit.left}, expected ${want}`);
      if (!(b.counts && b.counts.tasks && b.counts.tasks.left === want)) fails.push(`${who} ${where} [${states.join(",")}]: counts.tasks.left is ${b.counts && b.counts.tasks && b.counts.tasks.left}, expected ${want}`);
    }
  }
  // 3. no page subtracts
  { const bad = pageSubtractions({ ...pageFiles(), ...(mut.extraFiles || {}) }); if (bad.length) fails.push(`a page types a subtraction of the limit from the count: ${bad.join(", ")}`); }
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["limitFacts has no left", { limit: s => rep(s, "max, working: w, left,", "max, working: w,") }],
  ["left is not clamped at zero", { limit: s => rep(s, "Math.max(0, max - Math.max(0, Number(working) || 0))", "max - (Number(working) || 0)") }],
  ["left counts paused Tasks as active (one too few)", { limit: s => rep(s, "Math.max(0, max - Math.max(0, Number(working) || 0))", "Math.max(0, max - Math.max(0, Number(working) || 0) - 1)") }],
  ["left uses the free limit for crew", { limit: s => rep(s, "Math.max(0, max - Math.max(0, Number(working) || 0))", "Math.max(0, FREE_TASK_LIMIT - Math.max(0, Number(working) || 0))") }],
  ["counts.tasks has no left", { limit: s => s, api: null, counts: true }],
  ["a page types max minus working", { extraFiles: { "public/js/__fixture.js": "el.textContent = (limit.max - limit.working) + ' of ' + limit.max + ' remaining';" } }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.slice(0, 6).forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g;
    if (mut.counts) {   // looking.js without left: swap the file the handler imports
      const p = path.join(ROOT, "lib/live/looking.js"), orig = fs.readFileSync(p, "utf8");
      fs.writeFileSync(p, rep(orig, ", max, left: leftOf(tasksWorking, max) }", ", max }"));
      try { g = await findings({}); } finally { fs.writeFileSync(p, orig); }
    } else { try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; } }
    if (g.length) pass++; else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksLeftCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
