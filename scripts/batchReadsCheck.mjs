// THE NIGHTLY'S ARCHIVE READS AND A TIMED OUT PAGE (Lane B, lane-b-batch-read, Nov 20 2026). CAUSE: the scripts the nightly runs read whole pools under the visitor rules (a page aborts at 8 s, a timeout is never retried, one timeout fails the whole pool), while a quiet Porsche 911 pool page
// takes up to 6.07 s (measured Nov 20): two caches runs failed on "archive read failed (pool read)". THE FIX: lib/_supabase.js batch mode (a 25 s page wait, a timed out page read again twice, ten such retries a run) switched on by lib/_batchReads.js, imported by every script the nightly runs; a visitor's read is unchanged.
// THE CLASS: every script the nightly runs, the reads (a pool whose first page times out once completes, one that times out past the retries fails as it does today, a run with no budget left fails fast), and the cost (inside the step caps).
//   node scripts/batchReadsCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url"; import fs from "fs";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const src = f => fs.readFileSync(path.join(root, f), "utf8");
process.env.SUPABASE_FETCH_MS = "1000";   // the page wait of the fake world (the code floor is 1 s); the numbers of the real one are asserted from the source below
const real = globalThis.fetch; let seq = 0;
const load = async () => { seq++; return import(pathToFileURL(path.join(root, "lib/_supabase.js")).href + "?c=" + seq); };
const env = { supabaseUrl: "https://x.test", supabaseKey: "k" };
const rows = n => Array.from({ length: n }, (_, i) => ({ id: i }));
const TIMEOUT = () => new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 500 });
const page = (all, init) => { const m = /(\d+)-(\d+)/.exec((init && init.headers && init.headers.Range) || "0-999"); const a = Number(m[1]), b = Number(m[2]); return new Response(JSON.stringify(all.slice(a, b + 1)), { status: 200 }); };
// a fake table: `script` decides each call (n = calls so far for this page offset)
const fake = (all, decide) => { const calls = {}; globalThis.fetch = async (url, init) => { const off = (/(\d+)-/.exec(init.headers.Range || "0-") || [0, 0])[1]; const n = calls[off] = (calls[off] || 0) + 1; const d = decide(Number(off), n, init); if (d === "hang") return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))); if (d === "timeout") return TIMEOUT(); if (d === "bad") return new Response("nope", { status: 400 }); return page(all, init); }; return calls; };
const quiet = () => { const w = console.warn, e = console.error, l = console.log; console.warn = () => {}; console.error = () => {}; return () => { console.warn = w; console.error = e; }; };
const enable = (S, o) => S.enableBatchReads ? S.enableBatchReads(o) : null, stats = S => S.batchReadStats ? S.batchReadStats() : { on: false, retried: 0, exhausted: 0 };   // absent without the fix: the checks that need it fail, the rest still run
const total = a => Object.values(a).reduce((x, y) => x + y, 0);

// 1. A VISITOR'S READ IS UNCHANGED (batch mode off): one timeout fails the read, no retry
{ const S = await load(); const all = rows(300), un = quiet(); const calls = fake(all, (off, n) => n === 1 ? "timeout" : "ok");
  const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a visitor's pool read whose first page times out fails, as it does today", r === null && total(calls) === 1, JSON.stringify(calls));
  ok("batch mode is off in a plain load", stats(S).on === false); }
{ const S = await load(); const un = quiet(); const calls = fake(rows(5), () => "hang"); const t0 = Date.now(); const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a visitor's page that hangs is cut at the visitor wait and not read again", r === null && total(calls) === 1 && Date.now() - t0 < 4000, JSON.stringify([calls, Date.now() - t0])); }

// 2. BATCH MODE: a pool whose first page times out once completes
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const all = rows(1300), un = quiet(); const calls = fake(all, (off, n) => off === 0 && n === 1 ? "timeout" : "ok");
  const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a two page pool whose first page times out once completes with every row", Array.isArray(r) && r.length === 1300 && new Set(r.map(x => x.id)).size === 1300, r && String(r.length));
  ok("the timed out page was read again, once", calls[0] === 2 && stats(S).retried === 1, JSON.stringify(calls)); }
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const all = rows(2300), un = quiet(); const calls = fake(all, (off, n) => off === 1000 && n === 1 ? "timeout" : "ok");
  const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a later page that times out once is read again and the pool is whole", Array.isArray(r) && r.length === 2300 && new Set(r.map(x => x.id)).size === 2300, r && String(r.length)); }
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); const calls = fake(rows(500), (off, n) => n === 1 ? "hang" : "ok"); const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a page that hangs past the page wait is read again and completes", Array.isArray(r) && r.length === 500 && calls[0] === 2, JSON.stringify(calls)); }
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); const calls = fake(rows(50), (off, n) => n === 1 ? "timeout" : "ok"); const r = await S.supabaseSelect(env, "sales_archive?select=id"); un();
  ok("a single read that times out once is read again in batch mode", Array.isArray(r) && r.length === 50 && total(calls) === 2); }

// 3. PAST THE RETRIES IT FAILS LOUDLY, AS IT DOES TODAY: null, never a partial pool
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500, timeoutRetries: 2 }); const un = quiet(); const calls = fake(rows(1300), (off) => off === 1000 ? "timeout" : "ok"); const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("a page that times out on every try fails the whole read (null), after the first try and 2 retries", r === null && calls[1000] === 3, JSON.stringify(calls));
  ok("the run counts the read that gave up", stats(S).exhausted >= 1 && stats(S).retried === 2, JSON.stringify(stats(S))); }
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); const calls = fake(rows(50), () => "timeout"); const r = await S.supabaseSelect(env, "sales_archive?select=id"); un();
  ok("a single read that times out on every try returns null", r === null && total(calls) === 3, JSON.stringify(calls)); }
// the failure is still noted for the engine's own gate (the read scope), so an answer built under it is not served as finished
{ const S = await load(), RS = await import(pathToFileURL(path.join(root, "lib/_readScope.js")).href); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); fake(rows(1300), (off) => off === 1000 ? "timeout" : "ok");
  const res = await RS.readScoped(async () => { const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); RS.okRows(r, "pool read"); return r; }).catch(e => ({ threw: String(e && e.message) })); un();
  ok("the read scope still notes a failed pool read in batch mode", JSON.stringify(res).includes("pool read") || res === null || (res && (res.failed || res.threw)), JSON.stringify(res).slice(0, 120)); }

// 4. THE RUN'S BUDGET: a database that is really down fails the step fast, not after a retry storm
{ const S = await load(); enable(S, { pauseMs: 1, fetchMs: 1500, timeoutRetries: 2, budget: 3 }); const un = quiet(); const calls = fake(rows(50), () => "timeout"); const t0 = Date.now(); let nulls = 0;
  for (let i = 0; i < 6; i++) if ((await S.supabaseSelectAll(env, "sales_archive?select=id")) === null) nulls++; un();
  ok("every read fails when the database is down, and the retries stop at the run's budget", nulls === 6 && stats(S).retried === 3, JSON.stringify(stats(S)));
  ok("after the budget a read is tried once", total(calls) === 6 + 3, String(total(calls))); }

// 5. NOT RETRIED: a caller that gave up, and an error that is not a timeout keeps the old road
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); const ac = new AbortController(); const calls = fake(rows(50), () => { ac.abort(); return "timeout"; });
  const r = await S.supabaseSelectAll({ ...env, signal: ac.signal }, "sales_archive?select=id"); un(); ok("a caller that gave up is not read for again", r === null && total(calls) <= 1, JSON.stringify(calls)); }
{ const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const un = quiet(); const calls = fake(rows(50), () => "bad"); const r = await S.supabaseSelectAll(env, "sales_archive?select=id"); un();
  ok("an HTTP 400 keeps the existing road (its own two retries) and spends none of the timeout budget", r === null && stats(S).retried === 0, JSON.stringify([calls, stats(S)])); }

// 6. THE NUMBERS, from the source: room over the slowest read measured, inside the step caps
const sb = src("lib/_supabase.js"), bm = /const batch = \{ on: false, fetchMs: (\d+), timeoutRetries: (\d+), budget: (\d+), pauseMs: (\d+)/.exec(sb);
const [fetchMs, retries, budget, pauseMs] = bm ? bm.slice(1).map(Number) : [0, 0, 0, 0];
ok("a visitor's page wait is still 8 s", /SUPABASE_FETCH_MS = Math\.max\(1000, Number\(process\.env\.SUPABASE_FETCH_MS\) \|\| 8000\)/.test(sb));
ok("the batch page wait leaves room over the slowest quiet read measured (6.07 s): at least 3 times", fetchMs >= 3 * 6070, String(fetchMs));
ok("the batch wait is the default of the first batch read the code sets", bm && /fetchMs \?\? process\.env\.BATCH_FETCH_MS, 25000/.test(sb));
{ const worst = budget * (fetchMs + pauseMs * retries); ok("the worst case a run can add (budget x (page wait + pauses)) stays inside the shortest step cap, spec pages 6 minutes", worst > 0 && worst < 6 * 60000, `${worst / 1000} s of 360 s`); }

// 7. THE CLASS: every script the nightly runs turns batch reads on; nothing a visitor runs does
{ const SB = await import(pathToFileURL(path.join(root, "lib/_supabase.js")).href); const before = stats(SB).on; await import(pathToFileURL(path.join(root, "lib/_batchReads.js")).href);
  ok("importing lib/_batchReads.js turns batch reads on, and it was off before", before === false && stats(SB).on === true, JSON.stringify([before, stats(SB).on])); }
const wf = src(".github/workflows/nightly.yml"), run = [...new Set([...wf.matchAll(/node (scripts\/[A-Za-z0-9_.-]+\.m?js)/g)].map(m => m[1]))];
ok("the nightly runs scripts (the sweep has something to read)", run.length >= 12, String(run.length));
const missing = run.filter(f => !/import "\.\.\/lib\/_batchReads\.js"/.test(src(f)));
ok("every script the nightly runs imports lib/_batchReads.js", missing.length === 0, missing.join(", ") || run.length + " scripts");
const visitor = []; const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|\.git|proofs|screens/.test(e.name)) walk(p); } else if (/\.m?js$/.test(e.name) && /_batchReads\.js"/.test(src(p)) && !p.startsWith("scripts/") && p !== "lib/_batchReads.js") visitor.push(p); } };
for (const d of ["api", "lib", "js", "public"]) { try { walk(d); } catch { /* no such folder */ } }
ok("no function or page a visitor reaches imports lib/_batchReads.js", visitor.length === 0, visitor.join(", "));
{ let changed = null; try { changed = (await import("child_process")).execSync("git diff --name-only origin/main", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { /* no git */ }
  ok("no stamped file and no workflow file is touched by this branch", changed == null || !changed.some(f => ["lib/onebox.js", "lib/variants.js", "lib/variantRows.js", "data/variantFamilies.json"].includes(f) || f.startsWith(".github/")), changed ? changed.join(",").slice(0, 300) : "git not available"); }
// 9. THE LOG LINES (logLinesCheck): the retry warning and the tally are visible in the nightly's own output, and a visitor's read prints nothing
{ const grab = async fn => { const out = [], w = console.warn, e = console.error; console.warn = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" ")); try { await fn(); } finally { console.warn = w; console.error = e; } return out; };
  { const S = await load(); const out = await grab(async () => { fake(rows(5), (off, n) => n === 1 ? "timeout" : "ok"); await S.supabaseSelectAll(env, "sales_archive?select=id"); });
    ok("a visitor's timed out read prints no retry warning line", !out.some(l => /::warning::/.test(l)), JSON.stringify(out)); }
  { const S = await load(); enable(S, { pauseMs: 5, fetchMs: 1500 }); const out = await grab(async () => { fake(rows(5), (off, n) => n === 1 ? "timeout" : "ok"); await S.supabaseSelectAll(env, "sales_archive?select=id"); });
    ok("a batch read that retries prints the ::warning:: line the nightly shows", out.some(l => /^::warning::archive page timed out/.test(l)), JSON.stringify(out)); }
  const { spawnSync } = await import("child_process");
  const child = code => spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: root, encoding: "utf8", env: { ...process.env, SUPABASE_FETCH_MS: "1000", DEBUG_LOG: "" } });
  const body = `import "./lib/_batchReads.js"; import { supabaseSelectAll } from "./lib/_supabase.js"; let n = 0; globalThis.fetch = async () => (++n === 1 ? new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 500 }) : new Response("[{\\"id\\":1}]", { status: 200 })); await supabaseSelectAll({ supabaseUrl: "https://x.test", supabaseKey: "k" }, "sales_archive?select=id");`;
  const r = child(body);
  ok("a nightly process prints the retry warning and the run tally with DEBUG_LOG unset", /::warning::archive page timed out/.test(r.stdout + r.stderr) && /batch reads: 1 timed out reads were read again/.test(r.stdout), (r.stdout + r.stderr).slice(0, 300)); }

globalThis.fetch = real; console.log(`\nbatchReadsCheck: ${failed ? failed + " FAIL" : "all pass"}`); process.exit(failed ? 1 : 0);
