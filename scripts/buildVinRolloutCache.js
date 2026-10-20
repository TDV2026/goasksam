#!/usr/bin/env node
// Nightly precompute of rollout() (api/history.js) into vin_rollout_cache, so sitemap-vins.xml,
// sitemap-motorcycles.xml, sitemap-other.xml and sitemap-vins-hubs.xml are a single cheap table read
// instead of a live scan + per-VIN carIdentity()/vinAppearances() validation on every request (the
// confirmed live 504-at-300s fix, Oct 2026). Calls the SAME rollout() the live sitemap endpoints fall
// back to when the table has no row yet - never a second implementation - with a large budget (no
// serverless ceiling in a GitHub Actions job) so this ONE nightly run computes the complete, uncut set.
// Run AFTER scripts/buildVinIndex.js so it reads the freshest vin_index.
//
//   node scripts/buildVinRolloutCache.js             compute and write vin_rollout_cache
//   node scripts/buildVinRolloutCache.js --dry-run   compute and print the counts, write nothing
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { rollout } from "../api/history.js";

const env = supabaseEnv();
if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

const t0 = Date.now();
// 20 minutes: generous for a nightly job with no serverless ceiling. The live path's 180s stopgap
// budget (api/history.js rollout()) stays the safety net on any request this table doesn't cover yet.
const BUDGET_MS = 20 * 60 * 1000;
const r = await rollout(env, { budgetMs: BUDGET_MS });
const secs = Math.round((Date.now() - t0) / 1000);
const DRY = process.argv.includes("--dry-run");
// What the scan covered (Oct 2026): rollout() reports rows_scanned / scan_pages / scan_complete once its scan is uncapped
// (FOR LANE A in docs/lane-notes.md). Until then these print as "not reported" and the cache is written as before.
const c = r.counts || {};
console.log(`scan: vin_index rows scanned ${c.rows_scanned ?? "(not reported by rollout yet)"}, pages ${c.scan_pages ?? "(not reported)"}, distinct VINs seen ${c.vins}, scan complete ${c.scan_complete ?? "(not reported)"}`);
if (c.scan_complete === false) { console.error("::error::rollout() scan did not reach the end of vin_index (time budget or a failed page). Refusing to overwrite vin_rollout_cache with a partial set."); process.exit(1); }
console.log(`rollout() computed in ${secs}s: ${r.vins.length} vins, ${r.motos.length} motorcycles, ${r.others.length} other, ${r.hubs.length} hubs.`);
if (r.counts.rollout_budget_cut) console.error(`::warning::rollout() hit its ${Math.round(BUDGET_MS / 1000)}s budget even on the nightly run - vin_index has grown enough that this budget needs raising.`);

if (DRY) { console.log("DRY RUN: nothing written."); process.exit(0); }
const row = { key: "current", data: r, computed_at: new Date().toISOString() };
const res = await supabaseInsert("vin_rollout_cache", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key");
if (res.error) { console.error("vin_rollout_cache write failed:", res.error); process.exit(1); }
console.log("vin_rollout_cache written. DONE.");
// VIN DECODE STEP (Lane B, Oct 20 2026, the decode-first identity rule's index-time decodes; lib/_vinDecodeStore.js): behind
// VIN_DECODE_NIGHTLY, OFF. With it off this job does exactly what it did before (nothing is called, nothing printed). With it on:
// up to 40 paced vPIC batch calls (2,000 VINs) a night, the cursor kept, a stop on any HTTP error; a failure here never fails
// the job (the rollout cache above is already written).
const { VIN_DECODE_NIGHTLY, runNightlyDecode } = await import("../lib/_vinDecodeStore.js");
if (VIN_DECODE_NIGHTLY) {
  try { await runNightlyDecode(env); } catch (e) { console.error("::warning::vin decode step failed: " + String((e && e.message) || e).slice(0, 200)); }
}
