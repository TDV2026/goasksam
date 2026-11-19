// clock: real-ok no date is asserted; the database is a fetch that fails
// A READ THAT FAILED IS "NOT READ", NEVER A RESULT (Lane B, Nov 12 2026, from Lane F's nightly finding). CAUSE: scripts/crossProductCheck.js had no handling for a failed read. An answer of tier unavailable (readFailed, stillReading: what oneEngineAnswer
// makes of the engine's read_failed), a resolver that answered lookup_timeout, or a lane that threw a database fault was counted: the resolver as "ERROR: unresolved", a lane as a read that disagreed with the others (a zero count against a real one).
// A night when the database blipped could turn the nightly checks step red for a fault, not a finding. NOW the spec is listed as NOT READ: one ::warning:: line naming it, no mismatch, no error, and the exit status is the one the run has with that
// spec left out; with no key the script still exits 2. CLASS (every reader of this script that turns a failed read into a figure): the spec reader (resolver step and each of the four lanes) is held here; the case checks catch a throw as row.error and
// are named in the report, not changed.
//   node scripts/crossProductNotReadCheck.mjs [repo root]    (a tree without the fix fails: run it against origin/main)    node scripts/crossProductNotReadCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.ANTHROPIC_API_KEY = "unused"; process.env.OLDCARSDATA_API_KEY = "unused";
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const realFetch = globalThis.fetch; let DOWN = true;
globalThis.fetch = async (url, init) => DOWN ? new Response("database did not answer", { status: 503 }) : realFetch(url, init);
const mod = await import(pathToFileURL(path.join(root, "scripts/crossProductCheck.js")).href).catch(e => ({ loadError: String(e && e.message || e) }));
ok("the script loads", !mod.loadError, mod.loadError);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const SPECS = ["1990 Porsche 911 Carrera 4", "1967 Chevrolet Corvette Coupe", "2009 Nissan GT-R"];
const logs = []; const origLog = console.log, origErr = console.error;
const quiet = async fn => { console.log = (...a) => logs.push(a.join(" ")); console.error = () => {}; try { return await fn(); } finally { console.log = origLog; console.error = origErr; } };

// (1) the answer shapes: every failed-read shape is "read failed", every real answer is not
if (mod.readFailedOf) {
  for (const [n, a] of [["tier read_failed", { tier: "read_failed" }], ["tier unavailable, readFailed", { tier: "unavailable", readFailed: true, stillReading: true }], ["unavailable, still reading", { tier: "unavailable", stillReading: true }], ["not_tracked with a query error", { tier: "not_tracked", dedup: { queryError: "57014" } }]]) ok(`a failed read: ${n}`, mod.readFailedOf(a) === true);
  for (const [n, a] of [["result", { tier: "result", poolN: 12 }], ["thin", { tier: "thin" }], ["refusal", { tier: "refusal" }], ["a genuine not_tracked", { tier: "not_tracked" }], ["a question", { tier: "generation_choice" }], ["nothing", null]]) ok(`a real answer is not a failed read: ${n}`, mod.readFailedOf(a) === false);
} else ok("readFailedOf exists", false);

// (2) the resolver step and the Market Check lane, with the database not answering
const lane = mod.marketCheckLane ? await quiet(() => mod.marketCheckLane({ year: 1990, make: "Porsche", model: "911", trim: "Carrera 4", bodyStyle: null }, null, SPECS[0], env).catch(e => ({ threw: String(e && e.message || e) }))) : { missing: true };
ok("Market Check lane: a failed read is listed as not read", lane && lane.notRead === true && lane.ok === false, lane);
const row = await quiet(() => mod.checkOneSpec(SPECS[0], env));
ok("spec reader: the spec is not read", row.notRead === true, { notRead: row.notRead, error: row.error });
ok("spec reader: no error", !row.error, row.error);
ok("spec reader: no mismatch", !row.anyMismatch && !(row.compare || []).some(c => c.status === "MISMATCH") && !(row.countsCompare || []).some(c => c.status === "MISMATCH"));

// (3) the whole run: listed as not read, no mismatch, same exit inputs as with the specs left out
const run = await quiet(() => mod.runEngineCheck(env, SPECS, { singlePick: false, buyPaths: false, liveFences: false, representative: false, splitPools: false, overTime: false, liveListing: false, urgentOct2026: false, cacheConsistency: false, refineIsolation: false, formPairs: false, identityCounts: false }));
ok("run: every spec is listed as not read", JSON.stringify((run.notRead || []).slice().sort()) === JSON.stringify(SPECS.slice().sort()), run.notRead);
ok("run: no mismatch spec", run.mismatchSpecs === 0, run.mismatchSpecs);
ok("run: no row carries an error", run.rows.every(r => !r.error), run.rows.map(r => r.error));
const empty = await quiet(() => mod.runEngineCheck(env, [], { singlePick: false, buyPaths: false, liveFences: false, representative: false, splitPools: false, overTime: false, liveListing: false, urgentOct2026: false, cacheConsistency: false, refineIsolation: false, formPairs: false, identityCounts: false }));
ok("run: the exit inputs equal a run with those specs left out", run.mismatchSpecs === empty.mismatchSpecs, [run.mismatchSpecs, empty.mismatchSpecs]);

// (4) the printed table: one warning line naming each spec, no ERROR line, no mismatch marker
logs.length = 0; if (mod.printTable) await quiet(() => mod.printTable(run));
const warn = logs.filter(l => /^::warning::not read, the database did not answer: /.test(l));
ok("table: one warning line per spec, naming it", warn.length === SPECS.length && SPECS.every(q => warn.some(w => w.includes(q))), warn);
ok("table: no ERROR line and no mismatch marker", !logs.some(l => /ERROR:|<<<<|::error::/.test(l)), logs.filter(l => /ERROR:|<<<<|::error::/.test(l)));
ok("table: the total names the not read count", logs.some(l => /TOTAL: 0\/3 specs had at least one field mismatch, 3 not read/.test(l)), logs.filter(l => /TOTAL/.test(l)));

// (5) a real answer is still compared: a lane that answered is no longer excluded (the fix never hides a real mismatch)
const src = fs.readFileSync(path.join(root, "scripts/crossProductCheck.js"), "utf8");
ok("source: no lane catch turns a thrown fault into a plain reason", !/\.catch\(e => \(\{ ok: false, reason: String\(e && e\.message \|\| e\) \}\)\)/.test(src.split("export async function checkOneSpec")[1].split("row.lanes = ")[0]));
ok("source: the spec reader asks markNotRead of its four lanes before it compares anything", /if \(markNotRead\(row, \{ marketCheck, buy, sell, tasks \}\)\) return row;/.test(src) && src.indexOf("markNotRead(row, { marketCheck") < src.indexOf("row.compare = fields.map("));
ok("source: the spec reader marks a mismatch only outside a not-read spec", /rows\.filter\(r => r\.anyMismatch && !r\.notRead\)/.test(src));

// (5b) a lane that THREW a database fault is not read, a lane that threw anything else is a plain failure; the not-read lane keeps the others from being compared
if (mod.laneFault && mod.markNotRead) {
  for (const m of ["fetch failed", "statement timeout 57014", "archive read failed: pool read", "request timed out", "ETIMEDOUT"]) ok(`a thrown fault is not read: ${m}`, mod.laneFault(new Error(m)).notRead === true);
  for (const m of ["Cannot read properties of undefined (reading 'x')", "no spec"]) ok(`a thrown bug is a plain failure: ${m}`, !mod.laneFault(new Error(m)).notRead && mod.laneFault(new Error(m)).ok === false);
  const ans = (n, low) => ({ ok: true, count: n, low, high: low + 1000 });
  const r1 = { q: "x", anyMismatch: true }; const hit = mod.markNotRead(r1, { marketCheck: ans(12, 30000), buy: ans(0, 1), sell: mod.laneFault(new Error("fetch failed")), tasks: ans(0, 1) });
  ok("a lane not read: the spec is marked not read, nothing compared", hit === true && r1.notRead === true && r1.anyMismatch === false && r1.compare.length === 0 && /fetch failed/.test(r1.notReadWhy), r1);
  const r2 = { q: "y" }; ok("every lane read: the spec is left to the comparison", mod.markNotRead(r2, { marketCheck: ans(1, 1), buy: ans(1, 1), sell: { ok: false, reason: "empty pool" }, tasks: ans(1, 1) }) === false && !r2.notRead);
} else ok("laneFault and markNotRead exist", false);

// (6) with no key the script still exits 2, with its one line
const env2 = { ...process.env }; delete env2.SUPABASE_URL; delete env2.SUPABASE_SERVICE_ROLE_KEY; delete env2.SUPABASE_KEY; delete env2.SUPABASE_ANON_KEY;
const nk = spawnSync(process.execPath, ["scripts/crossProductCheck.js", "--specs=" + SPECS[0]], { cwd: root, env: env2, encoding: "utf8", timeout: 60000 });
ok("no key: exit status 2", nk.status === 2, { status: nk.status, err: String(nk.stderr).slice(0, 200) });
ok("no key: the one line, no table", /SUPABASE_URL \/ SUPABASE_SERVICE_ROLE_KEY not set\./.test(nk.stderr) && !/===|::warning::|TOTAL/.test(nk.stdout), { out: String(nk.stdout).slice(0, 120) });

for (const f of fails.slice(0, 30)) console.log("FAIL " + f);
console.log(`crossProductNotReadCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const F = "scripts/crossProductCheck.js";
  const M = [
    ["a failed engine answer is a result (readFailedOf never true)", F, s => s.replace("export const readFailedOf = a => !!a && typeof a === \"object\" && (", "export const readFailedOf = a => false && (")],
    ["unavailable with readFailed is not recognised", F, s => s.replace("a.readFailed === true || (a.tier === \"unavailable\" && a.stillReading === true) || ", "")],
    ["the Market Check lane does not mark a failed read", F, s => s.replace("  if (readFailedOf(d)) return { ok: false, notRead: true,", "  if (false) return { ok: false, notRead: true,")],
    ["a thrown database fault is a plain reason", F, s => s.replace("return DB_FAULT_RE.test(m) ? {", "return false ? {")],
    ["the resolver timeout is an error", F, s => s.replace("if ((rv && rv.status === \"lookup_timeout\") || DB_FAULT_RE.test(String(why))) {", "if (false) {")],
    ["the spec is compared although a lane was not read", F, s => s.replace("  if (markNotRead(row, { marketCheck, buy, sell, tasks })) return row;", "")],
    ["markNotRead leaves the mismatch flag standing", F, s => s.replace("row.compare = []; row.countsCompare = []; row.anyMismatch = false;\n  return true;", "row.compare = []; row.countsCompare = [];\n  return true;")],
    ["a not-read spec still counts as a mismatch spec", F, s => s.replace("rows.filter(r => r.anyMismatch && !r.notRead)", "rows.filter(r => r.anyMismatch || r.notRead)")],
    ["the warning line is not printed", F, s => s.replace("console.log(`::warning::not read, the database did not answer: ${row.q}", "void (`::warning::not read, the database did not answer: ${row.q}")],
    ["the not read specs are not listed", F, s => s.replace("const notRead = rows.filter(r => r.notRead).map(r => r.q);", "const notRead = [];")],
    ["no key exits 1", F, s => s.replace("not set.\"); process.exit(2); }", "not set.\"); process.exit(1); }")],
    ["a not-read row prints as an error", F, s => s.replace("    if (row.notRead) { console.log(`::warning::", "    if (row.notRead) { console.log(\"  ERROR: read failed\"); console.log(`::warning::")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "cpn-")); try {
      spawnSync("cp", ["-R", ...fs.readdirSync(R).filter(x => x !== "node_modules" && x !== ".git").map(x => path.join(R, x)), tmp]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 180000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
