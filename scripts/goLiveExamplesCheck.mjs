// goLiveExamplesCheck (Lane E, Nov 10 2026, go live Stage 3): THE LANDING PAGES READ LANE B'S EXAMPLE FIELDS WITHOUT EVER BLOCKING THE SEARCH BOX.
//   For Home, Find, Market Check, Sell and Tasks served by the new design on a public address:
//   - a field that is null, a read that throws, a read that says "could not read" and a read that never answers all give the SAME page: the section is hidden, nothing is printed in its place, the search box is in the page;
//   - a hanging read is cut off at PUBLIC_READ_MS (never waits on an example); the crew preview still prints its visible could-not-read line (unchanged);
//   - the Tasks page prints the live limit (three), never the crew limit.
//   CLASS: a value or line meant for the crew reaching a public response (a could-not-read line, the crew Tasks limit). Mutants: public mode off, no time box, a failure line printed, the crew limit.
//   node scripts/goLiveExamplesCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["public mode off (a failed read prints its line)", "api/crewPage.js", "const safe = async (f, what = \"field\") => { if (PUBLIC_CTX.getStore()) return boxed(f, what);", "const safe = async (f, what = \"field\") => { if (false) return boxed(f, what);"],
    ["no time box (a hanging read holds the page)", "api/crewPage.js", "setTimeout(() => r(null), PUBLIC_READ_MS)", "setTimeout(() => r(null), 1e9)"],
    ["a could-not-read marker passes through", "api/crewPage.js", "return r && typeof r === \"object\" && r.couldNotRead === true ? null : r; }", "return r; }"],
    ["the crew Tasks limit on the public copy", "lib/preview/tasksPreview.js", "const f = limitFacts(0, FREE_TASK_LIMIT).max,", "const f = limitFacts(0, CREW_TASK_LIMIT).max,"]
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe", timeout: 120000 }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveExamplesCheck mutants: " + bad + " not caught" : "goLiveExamplesCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.PUBLIC_READ_MS = "400"; process.env.NEW_DESIGN = "all"; delete process.env.CURTAIN_SEALED;
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]", headers: { get: () => null } });
const origLog = console.log, origErr = console.error; const quiet = async fn => { console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = origLog; console.error = origErr; } };
const CP = await import(pathToFileURL(path.join(ROOT, "api/crewPage.js")).href);
const mod = async f => (await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href)).default;
async function get(h, url) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); const t0 = Date.now(); await quiet(() => h({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com" }, socket: {} }, res).catch(() => {})); res.ms = Date.now() - t0; return res; }
const PAGES = [["home", "/", "home", [CP.FEATURED]], ["find", "/find", "buy", [CP.FIND_EXAMPLES]], ["market-check", "/market-check", "marketCheck", [CP.MC_CARD, CP.MC_EXAMPLES]], ["sell", "/sell", "sell", [CP.SELL_CARD, CP.SELL_EXAMPLE]], ["tasks", "/tasks", "tasksPage", [CP.TASKS_EMAIL_EXAMPLE]]];
const MODES = { null: () => null, throws: () => { throw new Error("the read failed"); }, "could not read": () => ({ couldNotRead: true, what: "x" }), hangs: () => new Promise(() => {}) };
for (const [name, url, f, seams] of PAGES) {
  const h = await mod(f), saved = seams.map(s => s.read); const out = {};
  for (const [mode, fn] of Object.entries(MODES)) { for (const s of seams) s.read = async () => fn(); out[mode] = await get(h, url); }
  seams.forEach((s, i) => { s.read = saved[i]; });
  const base = out.null;
  ok(base.code === 200 && base.h["x-design"] === "new", `${name}: the new page is served with every example null`);
  ok(/<(textarea|input)\b[^>]*(placeholder|id="[^"]*(q|input|inp)[^"]*")/i.test(base.body.replace(/<script\b[\s\S]*?<\/script>/gi, "")) || name === "tasks", `${name}: the search box is in the page with every example null`);
  for (const mode of ["throws", "could not read", "hangs"]) {
    ok(out[mode].code === 200 && out[mode].body === base.body, `${name}: a read that ${mode} gives the same page as null (section hidden, nothing in its place)`);
    ok(!/could not read/i.test(out[mode].body), `${name}: a read that ${mode} prints no could-not-read line on a public page`);
  }
  ok(out.hangs.ms < 400 + 2500, `${name}: a read that never answers is cut off (${out.hangs.ms} ms)`);
}
// the crew preview is unchanged: a failed read still prints its visible line there
{
  const saved = CP.FIND_EXAMPLES.read; CP.FIND_EXAMPLES.read = async () => { throw new Error("x"); };
  const res = { h: {}, code: 0, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; } };
  const crewMod = await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href); process.env.CURTAIN_CREW_CODE = "go-live-examples"; const cookie = "gas_crew=" + crewMod.mintCrewCookieValue();
  await quiet(() => CP.default({ method: "GET", url: "/preview/find", query: { page: "preview-find" }, headers: { host: "goasksam.com", cookie }, socket: {} }, res)); CP.FIND_EXAMPLES.read = saved;
  ok(res.code === 200 && /Could not read the Find examples/.test(res.body), "the crew preview still prints its visible could-not-read line");
}
// the Tasks limit on a public page
{
  const h = await mod("tasksPage"), r = await get(h, "/tasks"), text = r.body.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  const { FREE_TASK_LIMIT, taskLimitFor } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/limit.js")).href), CREW_LIMIT = taskLimitFor(true), { freeTasksWords } = await import(pathToFileURL(path.join(ROOT, "lib/tasks/limit.js")).href);
  ok(r.h["x-design"] === "new", "Tasks: the new page is served");
  ok(new RegExp(freeTasksWords(CREW_LIMIT).replace(/\s+/g, "\\s+"), "i").test(text) === false, `Tasks: the public page never prints the crew limit (${freeTasksWords(CREW_LIMIT)})`);
  ok(new RegExp("\\b(" + FREE_TASK_LIMIT + "|" + freeTasksWords(FREE_TASK_LIMIT).split(" ")[0] + ") active Tasks", "i").test(text), `Tasks: the public page prints the live limit (${FREE_TASK_LIMIT}), read from lib/tasks/limit.js`);
}
console.log(`goLiveExamplesCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
