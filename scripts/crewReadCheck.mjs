// A CREW PREVIEW READ THAT FAILS IS NEVER SILENT, AND ITS MODULE IS IN THE BUNDLE (Lane E, Nov 8 2026, Lane C's standing order after a94djqku4: /preview/find and /preview/tasks lost their sections, returned 200 and no error, because api/crewPage.js reads its engine fields by a VARIABLE import path inside a try that
// answered null on any error, and vercel.json did not bundle lib/live/** for that function, so every read threw and the catch hid both sections without a word).
// CLASS: every variable path dynamic import in api/, and every engine read a preview makes. This check covers it three ways: (a) STATIC: every module a variable path import in api/ can load (the literal paths handed to readField, and the literal paths of every import(<identifier>) site's callers) is under that function's includeFiles in vercel.json;
// (b) RUNTIME: readField with a missing module, a missing export or a throwing reader answers the could-not-read marker and LOGS (module, function, message), while a reader that answers null stays null (absent); (c) THE PAGE: a failed read prints a visible line where the section would be ("Could not read the Find examples." /
// "Could not read the Tasks email."), a null prints nothing, a good field prints its section, and the three are told apart. Mutants: includeFiles without lib/live/**, a readField that swallows errors to null, and a page that prints nothing for a failure, are each caught. Offline.
//   node scripts/crewReadCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const imp = (f, q = "") => import(pathToFileURL(path.join(ROOT, f)).href + q);
// ---------- (a) static: every module a variable path import can reach is in that function's includeFiles ----------
const globRe = g => { const braces = /^\{(.*)\}$/.exec(g); const alts = braces ? braces[1].split(",") : [g]; return alts.map(a => new RegExp("^" + a.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$")); };
function variableImportTargets(file, src) {
  const lits = new Set(), code = src.replace(/\/\/.*$/gm, "");
  for (const m of code.matchAll(/readField\(\s*["']([^"']+)["']/g)) lits.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
  const variable = /\bimport\(\s*(?!["'`])[A-Za-z_$][\w$.]*\s*\)/.test(code);
  return { lits: [...lits], variable };
}
function staticAssertions(vercel, apiSources) {
  const bad = [];
  for (const [file, src] of Object.entries(apiSources)) { const { lits, variable } = variableImportTargets(file, src); if (!variable && !lits.length) continue;
    const inc = vercel.functions && vercel.functions[file] && vercel.functions[file].includeFiles; if (!inc) { if (lits.length) bad.push(`${file}: reads ${lits.join(", ")} by a variable path but vercel.json has no includeFiles for it`); continue; }
    const res = globRe(inc); for (const t of lits) if (!res.some(r => r.test(t))) bad.push(`${file}: ${t} is not under includeFiles (${inc})`); }
  return bad;
}
const apiFiles = fs.readdirSync("api").filter(f => /\.js$/.test(f)).map(f => "api/" + f), sources = Object.fromEntries(apiFiles.map(f => [f, fs.readFileSync(f, "utf8")])), vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const bad1 = staticAssertions(vercel, sources); ok(bad1.length === 0, `a every module a variable path import in api/ can reach is under that function's includeFiles in vercel.json: ${bad1.join("; ") || "ok"}`);
ok(variableImportTargets("api/crewPage.js", sources["api/crewPage.js"]).lits.length >= 2, "a the scan sees api/crewPage.js's readField targets (the check is not blind)");
{ const v2 = JSON.parse(JSON.stringify(vercel)); v2.functions["api/crewPage.js"].includeFiles = v2.functions["api/crewPage.js"].includeFiles.replace(",lib/live/**", ""); ok(JSON.stringify(v2) !== JSON.stringify(vercel), "a mutant applies"); const b = staticAssertions(v2, sources); ok(b.length > 0, `a mutant: includeFiles without lib/live/** (the a94djqku4 vercel.json) is caught (${b[0] || "NOT CAUGHT"})`); }
// ---------- (b) runtime: a failed read says so, a null stays null ----------
const { mintCrewCookieValue } = await imp("lib/_crew.js"); function crewCookie() { return "gas_crew=" + mintCrewCookieValue(); }
async function call(handler, url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: cookie ? { cookie } : {}, body: null }, res); return res; }
const logs = []; const realErr = console.error; console.error = (...a) => { logs.push(a.join(" ")); };
const CP = await imp("api/crewPage.js"), { readField, couldNotRead, COULD_NOT_READ } = CP;
{ const hist = await imp("api/_historyData.js"); void hist; }
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
{ logs.length = 0; const r = await readField("../lib/live/__no_such_module__.js", "x", {}); ok(couldNotRead(r) && logs.some(l => /crew_read_failed/.test(l) && /__no_such_module__/.test(l)), `b a missing module answers the could-not-read marker and logs (module, message): ${JSON.stringify(r)} ${logs[0] || "no log"}`); }
{ logs.length = 0; const r = await readField("../lib/live/tasksDemo.js", "__no_such_export__", {}); ok(couldNotRead(r) && logs.some(l => /crew_read_failed/.test(l)), "b a module with no such export answers the marker and logs"); }
{ logs.length = 0; const m = CP.TASKS_EMAIL_EXAMPLE; const real = m.read; m.read = async () => { throw new Error("boom"); }; const f = await call(CP.default, "/api/crewPage?page=preview-tasks", crewCookie()); m.read = real; ok(/Could not read the Tasks email\./.test(f.body) && logs.some(l => /crew_read_failed/.test(l) && /boom/.test(l)), "b a reader that throws is logged with its message and the page says so"); }
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
console.error = realErr;
// ---------- (c) the page tells the three apart ----------
const EX = await imp("scripts/findExamplesFixture.mjs"), FX = await imp("scripts/tasksFixture.mjs");
async function pages(modPath, set) {
  const m = await imp(modPath, "?v=" + Math.random()); const rd = v => async () => { if (v instanceof Error) throw v; return v === undefined ? null : v; };
  m.FIND_EXAMPLES.read = rd(set.find); m.FIND_EXAMPLES.now = () => EX.NOW; m.TASKS_EMAIL_EXAMPLE.read = rd(set.email);
  const f = await call(m.default, "/api/crewPage?page=preview-find", crewCookie()), t = await call(m.default, "/api/crewPage?page=preview-tasks", crewCookie()); return { f: f.body, t: t.body };
}
const good = { find: EX.examplesFixture().map(i => ({ card: { ...i.card, photo_url: "https://example.test/p.jpg" } })), email: FX.tasksEmailFixture() };
const pg = await pages("api/crewPage.js", good), pn = await pages("api/crewPage.js", {}), pf = await pages("api/crewPage.js", { find: new Error("boom"), email: new Error("boom") });
const state = h => /data-could-not-read/.test(h) ? "failed" : /data-find-examples|data-task-email/.test(h) ? "section" : "absent";
ok(state(pg.f) === "section" && state(pg.t) === "section", "c a good field prints its section");
ok(state(pn.f) === "absent" && state(pn.t) === "absent", "c a null from the engine prints nothing (absent)");
ok(state(pf.f) === "failed" && state(pf.t) === "failed" && /Could not read the Find examples\./.test(pf.f) && /Could not read the Tasks email\./.test(pf.t), "c a failed read prints a visible line where the section would be, for Find and for Tasks");
ok(!/data-could-not-read/.test(pg.f + pg.t + pn.f + pn.t), "c the failure line appears only on a failure, never on a good or a null field");
// MUTANTS: a readField that swallows to null, and a handler that prints nothing for a failure
const SRC = fs.readFileSync("api/crewPage.js", "utf8"), TMP = "api/_crewPageMut.mjs";
async function mutantPages(from, to, set) { const mut = SRC.replace(from, to); if (mut === SRC) return null; fs.writeFileSync(TMP, mut); try { return await pages(TMP, set); } finally { fs.unlinkSync(TMP); } }
{ const swallow = SRC.replace(/return failed\(file \+ " " \+ fn, e\); \} \};/, "return null; } };"); ok(swallow !== SRC, "c mutant: a readField that answers null on any error applies"); fs.writeFileSync(TMP, swallow);
  try { const m = await imp(TMP, "?v=" + Math.random()); const r = await m.readField("../lib/live/__no_such_module__.js", "x", {}); ok(!m.couldNotRead(r), "c mutant: a readField that swallows the error to null is caught by the runtime assertion (it answers " + JSON.stringify(r) + ", not the marker)"); } finally { fs.unlinkSync(TMP); } }
{ const r = await mutantPages('couldNotRead(ex) ? findHtml({ examples: null, readError: "Could not read the Find examples.", now: FIND_EXAMPLES.now() })', 'couldNotRead(ex) ? findHtml({ examples: null, now: FIND_EXAMPLES.now() })', { find: new Error("boom"), email: good.email }); ok(r && state(r.f) !== "failed", "c mutant: a page that prints nothing for a failed read is caught (it reads as " + (r && state(r.f)) + ")"); }
console.log(out.join("\n")); console.log(`crewReadCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
