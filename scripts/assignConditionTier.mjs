// NIGHTLY CONDITION TIER JOB (Lane B, Nov 2026, Desk Valuations spec item 1). Assigns every sale in sales_archive a tier 1 to 4 (or Untiered) from its own listing text
// and fields (lib/conditionTier.js) and stores the tier and its evidence lines (docs/supabase-condition-tier.sql). ZERO OldCarsData. Runs only through a GitHub Actions
// workflow_dispatch / schedule (docs/condition-tier-workflow.yml), never from a terminal.
//   Walks the rows not yet assigned at the current TIER_VERSION in id order, BATCH rows at a time, writes each batch through set_condition_tiers (ONE plain UPDATE, so a batch is
//   written whole or not at all), then PAUSES. Safe against the live site (Nov 5 2026, after 500-row batches took 40 to 66 s):
//     small batches (default 100)            a batch is one keyed read, at most BAND_READS model reads and one write, each request aborted after REQUEST_MS
//     model bands read ONCE per model         a model's mileage quartiles are read at most BAND_READS new models per batch; rows of a model not yet read wait for the next pass
//                                             (never written with the mileage left out: a failed or deferred band read is NOT "no band")
//     CPU watched through the round trip      a batch slower than SLOW_MS doubles the pause (up to MAX_PAUSE_MS); STRIKES slow batches in a row, or one over HARD_MS, STOP the run
//     hard bounds on every run                --max rows (default 5000, whole numbers only), --minutes (default 60); a value that is not a whole number FAILS, it never means "all"
//     loud failures                           a failed read or write throws (exit 1, the Actions run goes red); a stop for slowness exits 0 with a warning and the rerun resumes
//   Resumable: a rerun only touches rows not at this version. A cancelled run leaves no half written row (one UPDATE per batch, nothing else is written).
//   node scripts/assignConditionTier.mjs [--batch=100] [--pause=2000] [--slow=3000] [--max=5000] [--minutes=60] [--strikes=3] [--dry]
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { assignTier, modelMileBands, TIER_VERSION } from "../lib/conditionTier.js";

export const COLS = "id,year,make,model,listing_title,description,mileage_text,stated_mileage,title_status,modifications::text,project_flag";
export const LIMITS = { batch: [25, 500, 100], pause: [0, 60000, 2000], slow: [500, 60000, 3000], max: [1, 2000000, 5000], minutes: [1, 300, 60], strikes: [1, 20, 3] };
export const BAND_READS = 8, REQUEST_MS = 6000, HARD_MS = 15000, MAX_PAUSE_MS = 60000, MAX_PASSES = 6;
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
const keyOf = r => `${r.make}|${r.model}`;

export async function runJob({ env, batch = LIMITS.batch[2], pause = LIMITS.pause[2], slow = LIMITS.slow[2], max = LIMITS.max[2], minutes = LIMITS.minutes[2], strikes = LIMITS.strikes[2],
  bandReads = BAND_READS, requestMs = REQUEST_MS, hardMs = HARD_MS, dry = false, log = console.log, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, fetchImpl = fetch }) {
  const H = { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  const bandMemo = new Map();                       // "make|model" -> bands or null (null = READ, fewer than 20 odometers). A FAILED read is never put here.
  const started = now();
  let done = 0, wait = pause, assigned = [0, 0, 0, 0], untiered = 0, deferredLeft = 0, slowRun = 0, stopped = null, bandFailsInARow = 0;

  // One model's quartiles. { bands } on a read, { failed:true } when the read did not come back (timeout, 5xx): the caller must NOT treat that as "no band".
  const readBands = async r => {
    const got = await supabaseSelect(env, `sales_archive?make=eq.${encodeURIComponent(r.make)}&model=eq.${encodeURIComponent(r.model)}&mileage_text=not.is.null&select=mileage_text&limit=1000`);
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
  const readRows = async (filter, last, limit) => {
    for (let tryN = 0; ; tryN++) {
      const rows = await supabaseSelect(env, `sales_archive?id=gt.${last}&${filter}&select=${COLS}&order=id&limit=${limit}`);
      if (Array.isArray(rows)) return rows;
      if (tryN >= 2) throw new Error("the read of the sales still to tier failed three times; stopped (nothing half written, rerun to resume)");
      await sleep(Math.max(wait, 2000));
    }
  };
  // The two phases keep the first read on the partial index (condition_version is null); the second only finds rows left by an OLDER tier version.
  const phases = [`condition_version=is.null`, `condition_version=neq.${TIER_VERSION}`];

  passes: for (let pass = 1; pass <= MAX_PASSES; pass++) {
    let wrote = 0, deferredThisPass = 0;
    for (const filter of phases) {
      let last = ZERO;
      for (;;) {
        const limit = Math.min(batch, max - done);
        if (limit <= 0) { stopped = "max"; break passes; }
        const t0 = now();
        const rows = await readRows(filter, last, limit);
        if (!rows.length) break;
        const tRead = now();
        // model bands: at most `bandReads` new models this batch; the rest wait
        let bandMs = 0, bandN = 0;
        const need = [...new Map(rows.filter(r => !bandMemo.has(keyOf(r))).map(r => [keyOf(r), r])).values()];
        for (const r of need.slice(0, bandReads)) {
          const b0 = now(), got = await readBands(r); bandMs += now() - b0; bandN++;
          if (got.failed) { if (++bandFailsInARow >= 5) throw new Error("five model reads in a row failed; stopped (nothing was written without its model's bands, rerun to resume)"); continue; }
          bandFailsInARow = 0; bandMemo.set(keyOf(r), got.bands);
        }
        const ready = rows.filter(r => bandMemo.has(keyOf(r))), waiting = rows.length - ready.length;
        deferredThisPass += waiting;
        const payload = payloadFor(ready, r => bandMemo.get(keyOf(r)) || null);
        const w0 = now();
        if (!dry && payload.length) await write(payload);
        const writeMs = now() - w0;
        for (const p of payload) { if (p.tier == null) untiered++; else assigned[p.tier - 1]++; }
        last = rows[rows.length - 1].id; done += payload.length; wrote += payload.length;
        const ms = now() - t0;
        wait = ms > slow ? Math.min(wait * 2, MAX_PAUSE_MS) : Math.max(pause, Math.floor(wait / 2));
        slowRun = ms > slow ? slowRun + 1 : 0;
        log(`condition tier: ${done} rows, tiers 1-4 ${assigned.join("/")}, untiered ${untiered}, batch ${ms} ms (read ${tRead - t0}, models ${bandN} in ${bandMs}, write ${writeMs}), waiting for a model read ${waiting}, pause ${wait} ms${ms > slow ? " (slow: pause doubled)" : ""}`);
        if (ms > hardMs) { stopped = "slow"; log(`condition tier: STOPPED, one batch took ${ms} ms (over ${hardMs}); the database is struggling. Resumable.`); break passes; }
        if (slowRun >= strikes) { stopped = "slow"; log(`condition tier: STOPPED, ${slowRun} slow batches in a row (over ${slow} ms). Resumable, rerun later.`); break passes; }
        if (done >= max) { stopped = "max"; break passes; }
        if (now() - started > minutes * 60000) { stopped = "minutes"; log(`condition tier: STOPPED at the ${minutes} minute limit. Resumable.`); break passes; }
        if (rows.length < limit) break;
        await sleep(wait);
      }
    }
    deferredLeft = deferredThisPass;
    if (!deferredThisPass) break;                 // nothing waited for a model read: everything left is done
    if (!wrote) throw new Error(`${deferredThisPass} sales are waiting for a model read that never came back; stopped (rerun to resume)`);
  }
  return { done, assigned, untiered, deferredLeft, stopped };
}

if (process.argv[1] && process.argv[1].endsWith("assignConditionTier.mjs")) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`condition tier: ${e.message}`); process.exit(1); }
  const env = supabaseEnv();
  if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
  try {
    const out = await runJob({ env, ...opts });
    if (out.stopped === "slow") console.log("::warning::condition tier stopped early because batches stayed slow; the rerun resumes where it stopped");
    console.log(`condition tier: finished, ${out.done} rows (${TIER_VERSION})${out.stopped ? `, stopped by ${out.stopped}` : ""}${out.deferredLeft ? `, ${out.deferredLeft} still waiting for a model read` : ""}`);
  } catch (e) { console.error(`condition tier: FAILED, ${e.message}`); process.exit(1); }
}
