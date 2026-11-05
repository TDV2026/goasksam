// NIGHTLY CONDITION TIER JOB (Lane B, Nov 2026, Desk Valuations spec item 1). Assigns every sale in sales_archive a tier 1 to 4 (or Untiered) from its own listing text
// and fields (lib/conditionTier.js) and stores the tier and its evidence lines (docs/supabase-condition-tier.sql). ZERO OldCarsData. Runs only through a GitHub Actions
// workflow_dispatch / schedule (docs/condition-tier-workflow.yml), never from a terminal.
//   Walks the rows not yet assigned at the current TIER_VERSION in id order, BATCH rows at a time, writes each batch through set_condition_tiers (one plain UPDATE), then PAUSES.
//   CPU is watched through the round trip: a batch slower than SLOW_MS doubles the pause (up to MAX_PAUSE_MS); a fast batch halves it again. Resumable: a rerun only touches rows not at this version.
//   node scripts/assignConditionTier.mjs [--batch=500] [--pause=1500] [--slow=4000] [--max=0 (rows, 0 = all)] [--dry]
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { assignTier, modelMileBands, TIER_VERSION } from "../lib/conditionTier.js";

export const COLS = "id,year,make,model,listing_title,description,mileage_text,stated_mileage,title_status,modifications::text,project_flag";
// Pure: rows + a bands lookup -> the payload set_condition_tiers takes.
export function payloadFor(rows, bandsFor) {
  return rows.map(r => { const a = assignTier(r, bandsFor(r)); return { id: r.id, tier: a.tier, evidence: a.evidence, version: a.version }; });
}
export async function runJob({ env, batch = 500, pause = 1500, slow = 4000, max = 0, dry = false, log = console.log, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, fetchImpl = fetch }) {
  const H = { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  const bandMemo = new Map();
  const bandsOf = async r => {
    const k = `${r.make}|${r.model}`; if (bandMemo.has(k)) return bandMemo.get(k);
    let b = null;
    try { const got = await supabaseSelect(env, `sales_archive?make=eq.${encodeURIComponent(r.make)}&model=eq.${encodeURIComponent(r.model)}&mileage_text=not.is.null&select=mileage_text&limit=3000`); b = modelMileBands((Array.isArray(got) ? got : []).map(x => x.mileage_text)); } catch (e) { b = null; }
    bandMemo.set(k, b); return b;
  };
  let last = "00000000-0000-0000-0000-000000000000", done = 0, wait = pause, assigned = [0, 0, 0, 0], untiered = 0;
  for (;;) {
    const t0 = now();
    const rows = await supabaseSelect(env, `sales_archive?id=gt.${last}&or=(condition_version.is.null,condition_version.neq.${TIER_VERSION})&select=${COLS}&order=id&limit=${batch}`);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) await bandsOf(r);   // fills the memo, one read per new model
    const payload = payloadFor(rows, r => bandMemo.get(`${r.make}|${r.model}`) || null);
    if (!dry) {
      const res = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/set_condition_tiers`, { method: "POST", headers: H, body: JSON.stringify({ p: payload }) });
      if (!res.ok) throw new Error(`set_condition_tiers ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    for (const p of payload) { if (p.tier == null) untiered++; else assigned[p.tier - 1]++; }
    last = rows[rows.length - 1].id; done += rows.length;
    const ms = now() - t0;
    wait = ms > slow ? Math.min(wait * 2, 60000) : Math.max(pause, Math.floor(wait / 2));
    log(`condition tier: ${done} rows, tiers 1-4 ${assigned.join("/")}, untiered ${untiered}, batch ${ms} ms, pause ${wait} ms${ms > slow ? " (slow: pause doubled)" : ""}`);
    if (max && done >= max) break;
    if (rows.length < batch) break;
    await sleep(wait);
  }
  return { done, assigned, untiered };
}

if (process.argv[1] && process.argv[1].endsWith("assignConditionTier.mjs")) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
  const env = supabaseEnv();
  if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
  const out = await runJob({ env, batch: Math.max(100, Number(args.batch) || 500), pause: Math.max(0, Number(args.pause) || 1500), slow: Number(args.slow) || 4000, max: Number(args.max) || 0, dry: !!args.dry });
  console.log(`condition tier: finished, ${out.done} rows (${TIER_VERSION})`);
}
