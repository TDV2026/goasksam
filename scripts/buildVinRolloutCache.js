#!/usr/bin/env node
// Nightly precompute of rollout() (api/history.js) into vin_rollout_cache, so sitemap-vins.xml,
// sitemap-motorcycles.xml, sitemap-other.xml and sitemap-vins-hubs.xml are a single cheap table read
// instead of a live scan + per-VIN carIdentity()/vinAppearances() validation on every request (the
// confirmed live 504-at-300s fix, Oct 2026). Calls the SAME rollout() the live sitemap endpoints fall
// back to when the table has no row yet - never a second implementation - with a large budget (no
// serverless ceiling in a GitHub Actions job) so this ONE nightly run computes the complete, uncut set.
// Run AFTER scripts/buildVinIndex.js so it reads the freshest vin_index.
//
//   node scripts/buildVinRolloutCache.js
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
console.log(`rollout() computed in ${secs}s: ${r.vins.length} vins, ${r.motos.length} motorcycles, ${r.others.length} other, ${r.hubs.length} hubs.`);
if (r.counts.rollout_budget_cut) console.error(`::warning::rollout() hit its ${Math.round(BUDGET_MS / 1000)}s budget even on the nightly run - vin_index has grown enough that this budget needs raising.`);

const row = { key: "current", data: r, computed_at: new Date().toISOString() };
const res = await supabaseInsert("vin_rollout_cache", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key");
if (res.error) { console.error("vin_rollout_cache write failed:", res.error); process.exit(1); }
console.log("vin_rollout_cache written. DONE.");
