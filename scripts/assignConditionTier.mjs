// NIGHTLY CONDITION TIER JOB (Lane B, Nov 2026, Desk Valuations spec item 1). Assigns every sale in sales_archive a tier 1 to 4 (or Untiered) from its own listing text
// and fields (lib/conditionTier.js) and stores the tier and its evidence lines (docs/supabase-condition-tier.sql). ZERO OldCarsData. Runs only through a GitHub Actions
// workflow_dispatch / schedule (docs/condition-tier-workflow.yml), never from a terminal.
//   Walks the rows not yet assigned at the current TIER_VERSION MODEL BY MODEL (the Desk's models, the most searched, then every other model), BATCH rows at a time, writes each batch through set_condition_tiers (ONE plain UPDATE, so a batch is
//   written whole or not at all), then PAUSES. Safe against the live site (Nov 5 2026, after 500-row batches took 40 to 66 s):
//     small batches (default 100)            a batch is one keyed read, at most BAND_READS model reads and one write, each request aborted after REQUEST_MS
//     model bands read ONCE per model         a model's mileage quartiles are read once, when its sales are reached, at most BAND_READS new models per batch (docs/supabase-condition-tier-order.sql adds the index)
//                                             (never written with the mileage left out: a failed or deferred band read is NOT "no band")
//     the DATABASE watched                    a batch whose longest single request (a row read, a model read, the write) is over --slow doubles the pause (up to MAX_PAUSE_MS); STRIKES such batches in a row, or one request over HARD_MS, STOP the run
//     hard bounds on every run                --max rows (default 5000, whole numbers only), --minutes (default 60); a value that is not a whole number FAILS, it never means "all"
//     loud failures                           a failed read or write throws (exit 1, the Actions run goes red); a stop for slowness exits 0 with a warning and the rerun resumes
//   Resumable: a rerun only touches rows not at this version. A cancelled run leaves no half written row (one UPDATE per batch, nothing else is written).
//   node scripts/assignConditionTier.mjs [--batch=100] [--pause=2000] [--slow=3000] [--max=5000] [--minutes=60] [--strikes=3] [--dry]
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { assignTier, modelMileBands, TIER_VERSION } from "../lib/conditionTier.js";
import { poolOf, poolKeyOf, poolFilter } from "../lib/tierPool.js";

export const COLS = "id,year,make,model,listing_title,description,mileage_text,stated_mileage,title_status,modifications::text,project_flag";
export const LIMITS = { batch: [25, 500, 100], pause: [0, 60000, 2000], slow: [500, 60000, 2500], max: [1, 2000000, 5000], minutes: [1, 300, 60], strikes: [1, 20, 3] };
export const BAND_READS = 20, REQUEST_MS = 6000, HARD_MS = 15000, MAX_PAUSE_MS = 60000, MAX_PASSES = 6;
const ZERO = "00000000-0000-0000-0000-000000000000";

// A whole number inside [min, max]; anything else (text, "0 to 500", a decimal, empty, a bare flag, out of range) THROWS. Unset takes the default. No value ever means "unbounded".
export function wholeNumber(name, raw, [min, max, dflt]) {
  if (raw === undefined) return dflt;
  const s = String(raw).trim();
  if (raw === true || !/^\d+$/.test(s)) throw new Error(`--${name} must be a whole number from ${min} to ${max}, got "${raw === true ? "" : s}"`);
  const n = Number(s);
  if (n < min || n > max) throw new Error(`--${name} must be a whole number from ${min} to ${max}, got ${n}`);
  return n;
}
export function parseArgs(argv) {
  const a = Object.fromEntries(argv.map(x => { const m = String(x).match(/^--([^=]+?)(=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[3]] : [String(x), true]; }));
  const known = new Set([...Object.keys(LIMITS), "dry"]);
  for (const k of Object.keys(a)) if (!known.has(k)) throw new Error(`unknown option ${k.startsWith("-") ? k : "--" + k}`);
  const o = {}; for (const k of Object.keys(LIMITS)) o[k] = wholeNumber(k, a[k], LIMITS[k]);
  o.dry = a.dry === true || a.dry === "1" || a.dry === "true";
  return o;
}
// Pure: rows + a bands lookup -> the payload set_condition_tiers takes.
export function payloadFor(rows, bandsFor) {
  return rows.map(r => { const a = assignTier(r, bandsFor(r)); return { id: r.id, tier: a.tier, evidence: a.evidence, version: a.version }; });
}
const keyOf = poolKeyOf;   // ct3: a sale is banded against its Desk family and generation (lib/tierPool.js), not its raw model value

// THE ORDER AND THE CLOCK (Lane B, Nov 5 2026, Condition tier run #2: "models 8" in 1.9 to 3.0 s on every batch, stopped after 3 slow batches, 100 rows in a minute).
// CAUSE: rows were read in id order, and an id is a random uuid, so the 100 rows of a batch belonged to about 100 different models. A model's mileage quartiles need one read of up to 1,000 of its
// sales; only 8 new models were read per batch, so a batch wrote the few rows whose model it had just read and left the rest to wait, and the next batch again met mostly unread models. The same
// 8 reads were repeated for every batch until the models ran out. The slow judgement then added the 8 model reads, the row read and the write into one total and compared THAT with 3 s.
// FIX: rows are taken MODEL BY MODEL. A model's rows are read together, its quartiles are read once (memo) and every one of its rows is tiered on them; the rows of several models are written
// in one batch. The models come in this order: the Desk's own pools, then the most searched specs (lib/tierPriority.js), then every other model in make and model order, so a stopped backfill
// always leaves the important pools complete. Slowness is judged on the DATABASE: the longest single request (a row read, a model read, the write) against --slow, not on the total.
// The tier rules are untouched: a tier depends on the sale and its model's quartiles only, so the order cannot change one.
export async function runJob({ env, batch = LIMITS.batch[2], pause = LIMITS.pause[2], slow = LIMITS.slow[2], max = LIMITS.max[2], minutes = LIMITS.minutes[2], strikes = LIMITS.strikes[2],
  bandReads = BAND_READS, requestMs = REQUEST_MS, hardMs = HARD_MS, dry = false, priority = [], log = console.log, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, fetchImpl = fetch }) {
  const H = { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  const bandMemo = new Map();                       // "make|model" -> bands or null (null = READ, fewer than 20 odometers). A FAILED read is never put here.
  const started = now();
  let done = 0, wait = pause, assigned = [0, 0, 0, 0], untiered = 0, deferredLeft = 0, slowRun = 0, stopped = null, bandFailsInARow = 0, modelsRead = 0, flushes = 0;
  const q = v => encodeURIComponent(v);
  // timed database requests: the longest of each kind in the batch being built is what the slow judgement reads
  let dbReadMax = 0, dbBandMax = 0, bandsThisBatch = 0, dbReadMs = 0, dbBandMs = 0;

  // One model's quartiles. { bands } on a read, { failed:true } when the read did not come back (timeout, 5xx): the caller must NOT treat that as "no band".
  const readBands = async r => {
    const pool = poolOf(r);
    if (!pool) return { bands: null };   // a sale with no model has no pool to take quartiles of
    const t0 = now();
    const got = await supabaseSelect(env, `sales_archive?${poolFilter(pool, q)}&mileage_text=not.is.null&select=mileage_text&limit=1000`);
    const ms = now() - t0; dbBandMs += ms; dbBandMax = Math.max(dbBandMax, ms); bandsThisBatch++; modelsRead++;
    if (!Array.isArray(got)) return { failed: true };
    return { bands: modelMileBands(got.map(x => x.mileage_text)) };
  };
  const write = async payload => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), requestMs);
    try {
      const res = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/set_condition_tiers`, { method: "POST", headers: H, body: JSON.stringify({ p: payload }), signal: c.signal });
      if (!res.ok) throw new Error(`set_condition_tiers ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error(`set_condition_tiers timed out after ${requestMs} ms (the batch is one statement, so it is written whole or not at all; rerun to resume)`);
      throw e;
    } finally { clearTimeout(t); }
  };
  // a keyed read of untiered rows; every read is timed and a failed read is retried twice, then thrown
  const readRows = async (qs, limit, ord = "id") => {
    for (let tryN = 0; ; tryN++) {
      const t0 = now();
      const rows = await supabaseSelect(env, `sales_archive?${qs}&select=${COLS}&order=${ord}&limit=${limit}`);
      const ms = now() - t0; dbReadMs += ms; dbReadMax = Math.max(dbReadMax, ms);
      if (Array.isArray(rows)) return rows;
      if (tryN >= 2) throw new Error("the read of the sales still to tier failed three times; stopped (nothing half written, rerun to resume)");
      await sleep(Math.max(wait, 2000));
    }
  };
  const probe = async qs => {
    for (let tryN = 0; ; tryN++) {
      const t0 = now(); const rows = await supabaseSelect(env, `sales_archive?${qs}&select=make,model&limit=1`);
      const ms = now() - t0; dbReadMs += ms; dbReadMax = Math.max(dbReadMax, ms);
      if (Array.isArray(rows)) return rows[0] || null;
      if (tryN >= 2) throw new Error("the read of the next model to tier failed three times; stopped (nothing half written, rerun to resume)");
      await sleep(Math.max(wait, 2000));
    }
  };

  // rows with their bands, waiting to be written as one batch
  let acc = [];
  let wrote = 0, deferredThisPass = 0;
  const resetBatchClock = () => { dbReadMax = 0; dbBandMax = 0; bandsThisBatch = 0; dbReadMs = 0; dbBandMs = 0; };
  // Write what is gathered, judge the DATABASE (the longest single request against `slow`, one over `hardMs` stops at once), then pause.
  const flush = async (final = false) => {
    if (!acc.length) return;
    const payload = payloadFor(acc, r => bandMemo.get(keyOf(r)) || null);
    const n = acc.length; acc = [];
    const w0 = now();
    if (!dry) await write(payload);
    const writeMs = now() - w0;
    for (const p of payload) { if (p.tier == null) untiered++; else assigned[p.tier - 1]++; }
    done += n; wrote += n; flushes++;
    const dbMax = Math.max(dbReadMax, dbBandMax, writeMs), isSlow = dbMax > slow;
    wait = isSlow ? Math.min(wait * 2, MAX_PAUSE_MS) : Math.max(pause, Math.floor(wait / 2));
    slowRun = isSlow ? slowRun + 1 : 0;
    log(`condition tier: ${done} rows, tiers 1-4 ${assigned.join("/")}, untiered ${untiered}, batch ${n} rows from ${bandsThisBatch} new models; database: row reads ${dbReadMs} ms (longest ${dbReadMax}), model reads ${dbBandMs} ms (longest ${dbBandMax}), write ${writeMs} ms; pause ${wait} ms${isSlow ? " (database slow: pause doubled)" : ""}`);
    const hard = dbMax > hardMs;
    resetBatchClock();
    if (hard) { stopped = "slow"; log(`condition tier: STOPPED, one database request took ${dbMax} ms (over ${hardMs}); the database is struggling. Resumable.`); return; }
    if (slowRun >= strikes) { stopped = "slow"; log(`condition tier: STOPPED, ${slowRun} batches in a row with a database request over ${slow} ms. Resumable, rerun later.`); return; }
    if (done >= max) { stopped = "max"; return; }
    if (now() - started > minutes * 60000) { stopped = "minutes"; log(`condition tier: STOPPED at the ${minutes} minute limit. Resumable.`); return; }
    if (!final) await sleep(wait);   // never a pause after the last batch
  };
  // Put rows on the batch, reading each new model's quartiles once (a failed read leaves that model's rows for the next pass, never stamped).
  const take = async rows => {
    const byKey = new Map(); for (const r of rows) { const k = keyOf(r); (byKey.get(k) || byKey.set(k, []).get(k)).push(r); }
    for (const [k, list] of byKey) {
      if (!bandMemo.has(k)) {
        if (bandsThisBatch >= bandReads) { await flush(); if (stopped) return; }   // at most `bandReads` model reads per batch
        const got = await readBands(list[0]);
        if (got.failed) { deferredThisPass += list.length; if (++bandFailsInARow >= 5) throw new Error("five model reads in a row failed; stopped (nothing was written without its model's bands, rerun to resume)"); continue; }
        bandFailsInARow = 0; bandMemo.set(k, got.bands);
      }
      acc.push(...list);
    }
  };
  const roomLeft = () => Math.min(batch - acc.length, max - done - acc.length);
  // All the untiered rows of ONE named model (the priority models), read together, tiered on one read of the model's quartiles.
  const drain = async qs => {
    let last = ZERO;
    for (;;) {
      if (stopped) return;
      const room = roomLeft();
      if (room <= 0) { if (acc.length) { await flush(); continue; } stopped = "max"; return; }
      const rows = await readRows(`id=gt.${last}&${qs}&condition_version=is.null`, room);
      if (!rows.length) return;
      last = rows[rows.length - 1].id;
      await take(rows);
      if (rows.length < room) return;
    }
  };
  // Every other model, in make and model order. One read returns a full batch of rows over SEVERAL models (order=model,id inside a make), so a model costs one quartile read and a share of a
  // row read; only the model a read cut off is continued by id. Plain keyed filters only (no OR), so the partial index (make, model, id) where condition_version is null serves every read.
  const scanRest = async () => {
    let make = null, model = null, last = ZERO, cut = false;
    for (;;) {
      if (stopped) return;
      if (make == null) { const nx = await probe(`condition_version=is.null&make=not.is.null&order=make`); if (!nx) return; make = nx.make; model = null; last = ZERO; cut = false; }
      const room = roomLeft();
      if (room <= 0) { if (acc.length) { await flush(); continue; } stopped = "max"; return; }
      let rows, wasCut = cut;
      if (cut) rows = await readRows(`make=eq.${q(make)}&model=eq.${q(model)}&id=gt.${last}&condition_version=is.null`, room);
      else if (model == null) rows = await readRows(`make=eq.${q(make)}&model=not.is.null&condition_version=is.null`, room, "model,id");
      else rows = await readRows(`make=eq.${q(make)}&model=gt.${q(model)}&condition_version=is.null`, room, "model,id");
      if (rows.length) { await take(rows); if (stopped) return; model = rows[rows.length - 1].model; last = rows[rows.length - 1].id; }
      if (wasCut) { cut = rows.length === room; if (!cut && !rows.length) { /* the cut model is finished: go on to the next models of the make */ } continue; }
      if (rows.length === room) { cut = true; continue; }
      // fewer rows than asked: the make has no more models; go to the next make
      const nx = await probe(`make=gt.${q(make)}&condition_version=is.null&order=make`);
      if (!nx) return;
      make = nx.make; model = null; last = ZERO; cut = false;
    }
  };

  passes: for (let pass = 1; pass <= MAX_PASSES; pass++) {
    wrote = 0; deferredThisPass = 0;
    // 1. the priority models, in order, each by its own exact make and model (no case)
    for (const u of priority) { if (stopped) break; await drain(`make=ilike.${q(u.make)}&model=ilike.${q(u.model)}`); }
    // 2. every other model, in make and model order
    await scanRest();
    // 3. sales with no make or no model (they have no model quartiles)
    if (!stopped) await drain(`or=(make.is.null,model.is.null)`);
    if (!stopped) await flush(true);
    if (stopped) break passes;
    // 4. rows left by an OLDER tier version, in id order (only after a version change; nothing here is new)
    if (!stopped) {
      let last = ZERO;
      for (;;) {
        const limit = Math.min(batch, max - done);
        if (limit <= 0) { stopped = "max"; break passes; }
        const rows = await readRows(`id=gt.${last}&condition_version=neq.${TIER_VERSION}`, limit);
        if (!rows.length) break;
        const need = [...new Map(rows.filter(r => !bandMemo.has(keyOf(r))).map(r => [keyOf(r), r])).values()];
        for (const r of need.slice(0, bandReads)) { const got = await readBands(r); if (got.failed) { if (++bandFailsInARow >= 5) throw new Error("five model reads in a row failed; stopped (nothing was written without its model's bands, rerun to resume)"); continue; } bandFailsInARow = 0; bandMemo.set(keyOf(r), got.bands); }
        const ready = rows.filter(r => bandMemo.has(keyOf(r))); deferredThisPass += rows.length - ready.length;
        acc.push(...ready); last = rows[rows.length - 1].id;
        await flush(); if (stopped) break passes;
        if (rows.length < limit) break;
      }
    }
    deferredLeft = deferredThisPass;
    if (!deferredThisPass) break;                 // nothing waited for a model read: everything left is done
    if (!wrote) throw new Error(`${deferredThisPass} sales are waiting for a model read that never came back; stopped (rerun to resume)`);
  }
  return { done, assigned, untiered, deferredLeft, stopped, modelsRead, flushes };
}

if (process.argv[1] && process.argv[1].endsWith("assignConditionTier.mjs")) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`condition tier: ${e.message}`); process.exit(1); }
  const env = supabaseEnv();
  if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
  try {
    const { buildPriority } = await import("../lib/tierPriority.js");
    const pr = await buildPriority(env).catch(() => ({ units: [], desk: 0, searched: 0, searchedRead: false }));
    console.log(`condition tier: priority order: ${pr.desk} Desk models, then ${pr.searched} most searched${pr.searchedRead ? "" : " (the search ranking could not be read; Desk models only)"}, then every other model`);
    const out = await runJob({ env, ...opts, priority: pr.units });
    if (out.stopped === "slow") console.log("::warning::condition tier stopped early because batches stayed slow; the rerun resumes where it stopped");
    console.log(`condition tier: finished, ${out.done} rows (${TIER_VERSION})${out.stopped ? `, stopped by ${out.stopped}` : ""}${out.deferredLeft ? `, ${out.deferredLeft} still waiting for a model read` : ""}`);
  } catch (e) { console.error(`condition tier: FAILED, ${e.message}`); process.exit(1); }
}
