#!/usr/bin/env node
// Refresh spec_market_cache (Lane C, Oct 2026; made INCREMENTAL Oct 2026 after run #98 - a full
// refresh of ~1,670 specs took 1,708s and the nightly's 40-minute ceiling then killed the job before
// "Build spec_pages" ever ran). Refreshes only specs that are NEW (never cached) or whose cache is
// older than --stale-days (default 7), never-cached first, then oldest-cached first. Concurrency 5
// (--concurrency), one retry per spec on failure. A --budget-min (default 15) time budget stops
// STARTING new specs - nothing already running is killed mid-flight - writes what finished, and
// exits 0: whatever is left is picked up the next night. Archive only, ZERO OldCarsData.
import { liveRows, listingFacts, specOf, refreshSpec } from "../lib/live/search.js";
import { supabaseSelectAll } from "../lib/_supabase.js";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
if (!env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
const LIMIT = Number(arg("limit", 0)) || Infinity;
const STALE_DAYS = Number(arg("stale-days", 7)) || 7;
const CONCURRENCY = Math.max(1, Number(arg("concurrency", 5)) || 5);
const BUDGET_MS = (Number(arg("budget-min", 15)) || 15) * 60000;

const t0 = Date.now();
const rows = await liveRows(env, "id=gt.0");
console.log(`live listings: ${rows.length}`);
// One spec per key (the same key the budget rule and the card lines use).
const specs = new Map();
for (const r of rows) {
  const sp = await specOf(env, r, listingFacts(r)).catch(() => null);
  if (sp && !specs.has(sp.key)) specs.set(sp.key, sp);
}
const allKeys = [...specs.keys()];
console.log(`unique specs: ${allKeys.length}`);

// Existing cache ages, fully paged - a bare select= caps at 1000 rows on this project (db-max-rows),
// and there can be more specs than that; a non-paged read would silently treat specs past row 1000 as
// "never cached" and re-refresh them needlessly every night.
const cacheRows = (await supabaseSelectAll(env, "spec_market_cache?select=spec_key,computed_at")) || [];
const cachedAt = new Map(cacheRows.map(r => [r.spec_key, r.computed_at]));

const staleCutoffMs = Date.now() - STALE_DAYS * 864e5;
const neverCached = [], stale = [], fresh = [];
for (const k of allKeys) {
  const at = cachedAt.get(k);
  if (!at) neverCached.push(k);
  else if (new Date(at).getTime() < staleCutoffMs) stale.push({ k, at });
  else fresh.push(k);
}
stale.sort((a, b) => new Date(a.at) - new Date(b.at));   // oldest cached first within the stale group
// Never-cached specs on live listings go first (a reader searching one right now gets a real answer
// soonest), then stale ones oldest-first.
let queue = [...neverCached, ...stale.map(s => s.k)];
if (LIMIT < Infinity) queue = queue.slice(0, LIMIT);
console.log(`never cached: ${neverCached.length}, stale (>${STALE_DAYS}d): ${stale.length}, fresh (skipped): ${fresh.length}, queued: ${queue.length}`);

const counts = { refreshed: 0, range: 0, count: 0, none: 0, failed: 0 };
const failedKeys = [];
let next = 0, budgetHit = false;
async function refreshOne(key) {
  const sp = specs.get(key);
  for (let attempt = 0; attempt < 2; attempt++) {
    const core = await refreshSpec(env, sp).catch(() => undefined);
    if (core !== undefined) { counts.refreshed++; if (!core) counts.none++; else counts[core.kind === "range" ? "range" : "count"]++; return; }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }
  counts.failed++; failedKeys.push(key);
}
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < queue.length) {
    // Checked BEFORE claiming a key, so `next` only ever advances past specs actually started -
    // "deferred by budget" below is exact, never an estimate.
    if (Date.now() - t0 > BUDGET_MS) { budgetHit = true; break; }
    const key = queue[next++];
    await refreshOne(key);
    if ((next % 50) === 0) console.log(`  ${next}/${queue.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
const deferred = queue.length - next;
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s: refreshed ${counts.refreshed} (range ${counts.range}, count ${counts.count}, none ${counts.none}), failed ${counts.failed}, deferred-by-budget ${deferred}, skipped-fresh ${fresh.length}`);
if (failedKeys.length) console.log("FAILED specs:", JSON.stringify(failedKeys));
if (budgetHit) console.log(`::notice::stopped starting new specs at the ${Math.round(BUDGET_MS / 60000)}-minute budget; ${deferred} left for the next run`);
// Running out of time is NEVER a failure (exits 0 either way). A genuine systemic problem - most of
// what was actually ATTEMPTED failed - still errors loudly.
if (counts.failed > 0 && counts.failed > next / 2) { console.error("::error::more than half the ATTEMPTED specs failed to compute"); process.exit(1); }
process.exit(0);
