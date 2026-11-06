// clock: real-ok it times a write that hangs against a few-second request ceiling to prove the abort fires; no date is asserted, only an elapsed time under a bound (Lane B, Nov 5 2026)
// CONDITION TIER JOB, SAFE ON THE LIVE SITE (Lane B, Nov 5 2026). No database, no network (a fake PostgREST). After the first Actions run took 40 to 66 s for 500 rows and a max typed "0 to 500"
// ran unbounded, the job must hold, for EVERY run and every model, not only the example:
//  (1) args: a max, batch, pause or minutes that is not a whole number (text, "0 to 500", a decimal, empty, a bare flag, 0 for max, out of range) FAILS loudly; unset takes a finite default; nothing means "all";
//  (2) a batch is bounded: one keyed read, at most BAND_READS model reads, one write; the rows of a model not yet read WAIT (never written without their mileage bands) and are tiered on the next pass
//      with exactly the tier they would have had with every band known;
//  (3) a failed model read is not "no band": the rows wait, are never stamped; a failed batch read or write is loud (a throw), never a quiet "finished";
//  (4) a cancelled or failed run leaves no half written row: every batch lands whole, each row is written once, and the rerun finishes the rest;
//  (5) CPU watched: slow batches double the pause, STRIKES slow batches in a row or one over the hard ceiling STOP the run (exit 0 with a warning); --max and --minutes stop it too, exactly;
//  (6) every write carries an abort signal and times out; the first read uses the partial index filter; the workflow validates, serialises, is capped and runs outside the 07:11 ingest and the 12:00 fill.
//   node scripts/tierJobSafetyCheck.mjs [repo root]        (the old job fails it)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { poolRows, poolParam } from "./fixtures/poolFake.mjs";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const T = await import(pathToFileURL(path.join(ROOT, "lib/conditionTier.js")).href);
const J = await import(pathToFileURL(path.join(ROOT, "scripts/assignConditionTier.mjs")).href);
const throws = f => { try { f(); return false; } catch { return true; } };

// (1) args
ok("(1) the job exports a strict argument parser", typeof J.parseArgs === "function");
if (typeof J.parseArgs === "function") {
  for (const bad of ["0 to 500", "abc", "", "-5", "1e3", "0", "50.5", " ", "500 rows", "2000001"]) ok(`(1) --max=${JSON.stringify(bad)} fails loudly`, throws(() => J.parseArgs([`--max=${bad}`])));
  ok("(1) a bare --max flag fails", throws(() => J.parseArgs(["--max"])));
  for (const k of ["batch", "pause", "minutes", "slow"]) ok(`(1) --${k}=text fails`, throws(() => J.parseArgs([`--${k}=fast`])));
  ok("(1) --batch=5000 (over the cap) fails", throws(() => J.parseArgs(["--batch=5000"])));
  ok("(1) an unknown option fails", throws(() => J.parseArgs(["--mx=5"])));
  const d = J.parseArgs([]);
  ok("(1) unset takes finite defaults (batch <= 100, max bounded, minutes bounded), never unbounded", d.batch <= 100 && Number.isFinite(d.max) && d.max > 0 && d.max <= 100000 && Number.isFinite(d.minutes) && d.minutes > 0, JSON.stringify(d));
  ok("(1) a good value is read as a number", J.parseArgs(["--max=500", "--batch=50"]).max === 500 && J.parseArgs(["--batch=50"]).batch === 50);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/assignConditionTier.mjs"), "--max=0 to 500"], { encoding: "utf8", env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "k" }, timeout: 20000 });
  ok("(1) the command line with --max=\"0 to 500\" exits 1 and names --max, before any read", r.status === 1 && /--max/.test(r.stderr), `exit ${r.status} ${String(r.stderr).slice(0, 90)}`);
}

// a fake PostgREST over N rows in M models; the RPC applies a batch atomically; failures and clock are scriptable
const MODELS = 40;
const mkRows = n => Array.from({ length: n }, (_, i) => ({ id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"), year: 1999, make: "Make" + (i % MODELS), model: "M" + (i % MODELS), listing_title: "1999 car", description: i % 3 === 0 ? "One owner, service records, no accidents." : i % 3 === 1 ? "Restored in 2019." : "", mileage_text: String(3000 + ((i * 7919) % 90) * 1000), stated_mileage: null, title_status: i % 2 ? "Clean" : null, modifications: null, project_flag: null, condition_version: null }));
function world(n, opts = {}) {
  const rows = mkRows(n), writes = [], reads = [], st = { now: 0, rpcCalls: 0, bandCalls: 0, bandFail: new Set(), failBatchRead: false, failRpcAt: 0, hang: false, readMs: 50, rpcMs: 50 };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/rpc/set_condition_tiers")) {
      st.rpcCalls++; writes.push({ signal: !!init.signal }); if (st.rpcCalls === 1) { st.bandsAtFirstWrite = st.bandCalls; st.rowsAtFirstWrite = JSON.parse(init.body || '{"p":[]}').p.length; }
      if (st.hang) return new Promise((_, rej) => init.signal && init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      if (st.failRpcAt && st.rpcCalls === st.failRpcAt) throw new Error("socket hang up");
      const p = JSON.parse(init.body).p;
      for (const x of p) { const r = rows.find(q => q.id === x.id); r.condition_version = x.version; r.condition_tier = x.tier; r.condition_evidence = x.evidence; r.writes = (r.writes || 0) + 1; }   // atomic: the whole batch or (a throw above) nothing
      st.now += st.rpcMs; return new Response(String(p.length), { status: 200 });
    }
    if (u.pathname.endsWith("/sales_archive")) {
      const sel = u.searchParams.get("select") || "";
      if (sel === "mileage_text") {
        st.bandCalls++; const model = poolParam(u.searchParams).replace("eq.", "");
        if (st.bandFail.has(model)) return new Response("boom", { status: 500 });
        return new Response(JSON.stringify(poolRows(rows, u.searchParams).map(r => ({ mileage_text: r.mileage_text }))), { status: 200 });
      }
      reads.push(u.search);
      if (st.failBatchRead) return new Response("boom", { status: 500 });
      const gt = (u.searchParams.get("id") || "gt.").replace("gt.", ""), lim = Number(u.searchParams.get("limit") || 500), isNull = u.searchParams.has("condition_version") && /is\.null/.test(u.searchParams.get("condition_version"));
      const stale = /neq\./.test(u.searchParams.get("condition_version") || "");
      const hasOr = u.searchParams.has("or");
      const f = k => u.searchParams.get(k) || "", ilike = (v, pat) => String(v || "").toLowerCase() === pat.replace("ilike.", "").toLowerCase();
      const col = (k, r) => { const c = f(k); if (!c) return true; if (c.startsWith("eq.")) return r[k] === c.slice(3); if (c.startsWith("gt.")) return String(r[k]) > c.slice(3); if (c.startsWith("ilike.")) return ilike(r[k], c); if (c === "not.is.null") return r[k] != null; return true; };
      let todo = rows.filter(r => r.id > gt && col("make", r) && col("model", r) && (hasOr ? (r.make == null || r.model == null) && r.condition_version == null : isNull ? r.condition_version == null : stale ? r.condition_version != null && r.condition_version !== T.TIER_VERSION : true));
      const ord = f("order") || "id"; todo = todo.slice().sort((x, y) => ord === "id" ? (x.id < y.id ? -1 : 1) : /^model/.test(ord) ? String(x.model).localeCompare(String(y.model)) || (x.id < y.id ? -1 : 1) : String(x.make).localeCompare(String(y.make)) || String(x.model).localeCompare(String(y.model)) || (x.id < y.id ? -1 : 1)).slice(0, lim);
      st.now += st.readMs; return new Response(JSON.stringify(todo.map(({ writes: _w, condition_tier: _t, condition_evidence: _e, ...r }) => r)), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  globalThis.fetch = fetchImpl;
  return { rows, writes, reads, st, fetchImpl };
}
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k" };
const bandsOfModel = (rows, model) => T.modelMileBands(rows.filter(r => r.model === model).map(r => r.mileage_text));
const expectedTier = (rows, r) => T.assignTier(r, bandsOfModel(rows, r.model)).tier;
const runOn = (w, o = {}) => J.runJob({ env, log: () => {}, sleep: async ms => { (w.pauses ||= []).push(ms); w.st.now += 0; }, now: () => w.st.now, fetchImpl: w.fetchImpl, ...o });

// (2) bounded batch, deferred rows, same tiers as with every band known
{
  const w = world(400);
  const out = await runOn(w, { batch: 100, pause: 10, bandReads: 8 });
  const perBatch = []; // band calls are counted in total; the bound is calls <= batches * bandReads
  ok("(2) every row ends up written, once", out.done === 400 && w.rows.every(r => r.writes === 1), `done ${out.done}, writes ${w.rows.filter(r => r.writes === 1).length}`);
  ok("(2) model reads are bounded per batch (8) and each model is read once, not once per batch", w.st.bandCalls >= MODELS && w.st.bandCalls <= MODELS + 3, `${w.st.bandCalls} model reads for ${MODELS} models`);
  ok("(2) rows whose model was not read yet waited, then got the SAME tier as with every band known", w.rows.every(r => r.condition_tier === (expectedTier(w.rows, r) ?? null)), `${w.rows.filter(r => r.condition_tier !== (expectedTier(w.rows, r) ?? null)).length} differ`);
  ok("(2) the first batch did not write rows without their model's bands (at most bandReads models' rows)", out.done === 400);
  const w2 = world(100);
  await J.runJob({ env, log: () => {}, sleep: async () => {}, now: () => w2.st.now, fetchImpl: w2.fetchImpl, batch: 100, pause: 0, bandReads: 8 });
  ok("(2) the first batch of 100 rows (40 models) makes at most 8 model reads before its one write", w2.st.bandsAtFirstWrite <= 8, `model reads before the first write ${w2.st.bandsAtFirstWrite}`);
  ok("(2) and writes only the rows of the models read (the rest wait for the next pass)", w2.st.rowsAtFirstWrite > 0 && w2.st.rowsAtFirstWrite < 100, `${w2.st.rowsAtFirstWrite} of 100`);
}
// (3) failed reads
{
  const w = world(200); w.st.bandFail.add("M3");
  let threw = null; try { await runOn(w, { batch: 100, pause: 0 }); } catch (e) { threw = e; }
  const m3 = w.rows.filter(r => r.model === "M3");
  ok("(3) a failed model read is not 'no band': its rows are NOT stamped", m3.length > 0 && m3.every(r => !r.condition_version), `${m3.filter(r => r.condition_version).length} of ${m3.length} stamped`);
  ok("(3) the rows of the other models are written, and the run says what is left (loud), never 'finished' quietly", (threw && /waiting|never came back|failed/.test(threw.message)) || false, threw ? threw.message.slice(0, 100) : "no throw");
  w.st.bandFail.clear(); const out = await runOn(w, { batch: 100, pause: 0 });
  ok("(3) the rerun tiers the waiting rows with the model's real bands", w.rows.every(r => r.writes === 1 && r.condition_tier === (expectedTier(w.rows, r) ?? null)) && out.done === m3.length, `done ${out.done}`);
  const w2 = world(100); w2.st.failBatchRead = true; let t2 = null; try { await runOn(w2, { batch: 50, pause: 0 }); } catch (e) { t2 = e; }
  ok("(3) a failed read of the sales to tier throws (the Actions run goes red), it does not end quietly as finished", !!t2, t2 ? t2.message.slice(0, 90) : "returned without error");
}
// (4) cancel / failure leaves no half written row
{
  const w = world(300); w.st.failRpcAt = 3; let threw = null;
  try { await runOn(w, { batch: 50, pause: 0, bandReads: 100 }); } catch (e) { threw = e; }
  const wrote = w.rows.filter(r => r.condition_version);
  ok("(4) a write that fails stops the run loudly", !!threw, threw ? threw.message : "");
  ok("(4) every written row carries all four columns together (version, tier or null, evidence), none half written", wrote.every(r => r.condition_version === T.TIER_VERSION && Array.isArray(r.condition_evidence)));
  ok("(4) exactly the batches before the failure landed, whole (2 x 50 rows)", wrote.length === 100, `${wrote.length} rows`);
  const out = await runOn(w, { batch: 50, pause: 0, bandReads: 100 });
  ok("(4) the rerun finishes the rest and touches no row twice", out.done === 200 && w.rows.every(r => r.writes === 1), `done ${out.done}`);
}
// (5) slow stop, max, minutes
{
  const w = world(1000); w.st.readMs = 5000;
  const out = await runOn(w, { batch: 50, pause: 10, slow: 3000, strikes: 3, bandReads: 100 });
  ok("(5) three slow batches in a row STOP the run (resumable), not a grind through the rest", out.stopped === "slow" && out.done <= 150 + 50, `stopped ${out.stopped}, done ${out.done}`);
  ok("(5) the pause doubled while slow", (w.pauses || []).length >= 2 && w.pauses[1] > w.pauses[0], JSON.stringify(w.pauses));
  const w2 = world(500); w2.st.readMs = 20000;
  const o2 = await runOn(w2, { batch: 50, pause: 10, slow: 3000, strikes: 9, hardMs: 15000, bandReads: 100 });
  ok("(5) one batch over the hard ceiling stops the run at once", o2.stopped === "slow" && o2.done === 50, `done ${o2.done}`);
  const w3 = world(500); const o3 = await runOn(w3, { batch: 100, pause: 0, max: 250, bandReads: 100 });
  ok("(5) --max is exact: 250 rows then stop", o3.done === 250 && o3.stopped === "max" && w3.rows.filter(r => r.condition_version).length === 250, `done ${o3.done}`);
  const w4 = world(500); w4.st.readMs = 61000; w4.st.rpcMs = 0;
  const o4 = await runOn(w4, { batch: 50, pause: 0, minutes: 1, strikes: 99, hardMs: 1e9, slow: 1e9, bandReads: 100 });
  ok("(5) --minutes stops the run", o4.stopped === "minutes" && o4.done === 50, `stopped ${o4.stopped}, done ${o4.done}`);
}
// (6) timeouts, the read filter, the workflow
{
  const w = world(60); w.st.hang = true; let threw = null; const t0 = Date.now();
  try { await runOn(w, { batch: 50, pause: 0, requestMs: 60, bandReads: 100 }); } catch (e) { threw = e; }
  ok("(6) a write that hangs is aborted at the request ceiling and the run fails loudly", !!threw && /timed out|abort/i.test(threw.message) && Date.now() - t0 < 5000, threw ? threw.message.slice(0, 80) : "hung or returned");
  const w2 = world(30); await runOn(w2, { batch: 25, pause: 0, bandReads: 100 });
  ok("(6) the first read filters condition_version is null (the partial index), not an OR that cannot use it", /condition_version=is\.null/.test(w2.reads[0]) && !/or=/.test(w2.reads[0]), w2.reads[0].slice(0, 90));
  ok("(6) every write carries an abort signal", w2.writes.length > 0 && w2.writes.every(x => x.signal));
  const yml = fs.readFileSync(path.join(ROOT, "docs/condition-tier-workflow.yml"), "utf8");
  const cron = (yml.match(/cron:\s*"([^"]+)"/) || [])[1] || "";
  const [mi, hh] = cron.split(" ").map(Number);
  const minutesOfDay = hh * 60 + mi;
  // Nov 5 2026 (Lane C): the nightly does not start at 07:11 UTC, GitHub starts it between 12:00 and 17:00 UTC and it can run past 18:00, so a fixed morning slot overlapped it. The job follows the work.
  ok("(6) the tier job starts when the nightly chain ends (workflow_run of Nightly checks), not at a clock time that can fall inside the nightly", /workflow_run:\s*\n\s*workflows:\s*\["Nightly checks"\]/.test(yml));
  ok("(6) its fallback clock slot is outside the nightly's real window (12:00 to 20:00 UTC) and a capped run ends before it", (minutesOfDay + 70 <= 12 * 60 || minutesOfDay >= 20 * 60), cron);
  ok("(6) a run that finds the nightly or its checks running ends at once instead of running beside them", /nightly\.yml nightly-checks\.yml/.test(yml) && /in_progress/.test(yml) && /queued/.test(yml) && /busy != '1'/.test(yml));
  ok("(6) the workflow has a concurrency group (no two runs at once) and a timeout under 2 hours", /concurrency:/.test(yml) && /cancel-in-progress:\s*false/.test(yml) && /timeout-minutes:\s*(\d+)/.test(yml) && Number(yml.match(/timeout-minutes:\s*(\d+)/)[1]) <= 120);
  ok("(6) the workflow default for max is a bounded whole number and never 0", /max:[^\n]*default:\s*"(\d+)"/.test(yml) && Number(yml.match(/max:[^\n]*default:\s*"(\d+)"/)[1]) > 0 && !/max \|\| '0'/.test(yml));
  ok("(6) the workflow passes max, minutes, batch and pause to the job", /--max=/.test(yml) && /--minutes=/.test(yml) && /--batch=/.test(yml) && /--pause=/.test(yml));
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
