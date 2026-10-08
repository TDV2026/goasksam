#!/usr/bin/env node
// Refresh spec_market_cache (Lane C, Oct 2026; made INCREMENTAL Oct 2026 after run #98 - a full
// refresh of ~1,670 specs took 1,708s and the nightly's 40-minute ceiling then killed the job before
// "Build spec_pages" ever ran). Refreshes only specs that are NEW (never cached) or whose cache is
// older than --stale-days (default 7), never-cached first, then oldest-cached first. Concurrency 5
// (--concurrency), one retry per spec on failure. A --budget-min (default 15) time budget stops
// STARTING new specs - nothing already running is killed mid-flight - writes what finished, and
// exits 0: whatever is left is picked up the next night. Archive only, ZERO OldCarsData.
//
// Oct 2026 incident: one spec queued that night - ["Chevrolet","Corvette",null,null,"roadster",
// "manual"], a live listing with no year at all - ran 624s, failed, and "1 of 1 attempted failed"
// (100% > 50%) redded the job. Three fixes below: (1) a spec with no resolved year is never queued
// (it has no single generation to answer for - the same reason a no-year, multi-generation query now
// asks instead of guessing, lib/onebox.js), logged by name as skipped, never as failed; (2) a 60s
// per-spec clock so one slow spec can no longer hold the whole budget hostage; (3) the red rule now
// requires at least 5 ATTEMPTED specs before "more than half failed" means anything.
import { liveRows, listingFacts, specOf, refreshSpec } from "../lib/live/search.js";
import { supabaseSelectAll } from "../lib/_supabase.js";

// --dry fixture: the exact no-year shape that caused the incident (a live listing whose title and
// OCD record both carry no year - lib/live/feed.js falls back OCD's year/model_year field, then a
// 4-digit year regex on the title; this fails both) plus one normal, fast, generation-bound spec, so
// `--dry` always demonstrates the skip rule and the normal path together without depending on
// whatever happens to be live right now (today's actual culprit listing has almost certainly ended).
const DRY_ROWS = [
  { id: -1, listing_title: "Chevrolet Corvette Roadster 4-Speed", year: null },
  { id: -2, listing_title: "2008 Porsche 911 Carrera S Coupe", year: 2008 }
];

export async function buildSpecMarketCache(env, opts = {}) {
  const LIMIT = Number(opts.limit) > 0 ? Number(opts.limit) : Infinity;
  const STALE_DAYS = Number(opts.staleDays) > 0 ? Number(opts.staleDays) : 7;
  const CONCURRENCY = Math.max(1, Number(opts.concurrency) || 5);
  const BUDGET_MS = (Number(opts.budgetMin) > 0 ? Number(opts.budgetMin) : 15) * 60000;
  const dry = !!opts.dry;

  const t0 = Date.now();
  const log = [];
  const say = (...a) => { const line = a.join(" "); console.log(line); log.push(line); };

  const rows = dry ? DRY_ROWS : await liveRows(env, "id=gt.0");
  say(dry ? `DRY RUN: ${rows.length} fixture rows` : `live listings: ${rows.length}`);

  // NO-YEAR GUARD (item 1): one spec per key (the same key the budget rule and the card lines use),
  // but a spec with no resolved year is skipped before it is ever queued - it has no single answer to
  // cache (the engine either asks a generation question or, once past its own ask-cap, falls into an
  // unbounded whole-model fetch across every generation ever made - the 624s hang).
  const specs = new Map();
  const skippedNoYear = [];
  for (const r of rows) {
    const sp = await specOf(env, r, listingFacts(r)).catch(() => null);
    if (!sp) continue;
    if (!sp.v.year) { if (!skippedNoYear.includes(sp.key)) skippedNoYear.push(sp.key); continue; }
    if (!specs.has(sp.key)) specs.set(sp.key, sp);
  }
  const allKeys = [...specs.keys()];
  say(`unique specs: ${allKeys.length}, skipped (no year): ${skippedNoYear.length}`);
  if (skippedNoYear.length) say("SKIPPED specs (no year):", JSON.stringify(skippedNoYear));

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
  say(`never cached: ${neverCached.length}, stale (>${STALE_DAYS}d): ${stale.length}, fresh (skipped): ${fresh.length}, queued: ${queue.length}`);

  const counts = { refreshed: 0, range: 0, count: 0, none: 0, failed: 0 };
  const failedKeys = [];
  let next = 0, budgetHit = false;
  // PER-SPEC TIME LIMIT (item 2): race the real work against a 60s clock. The loser (a hung
  // refreshSpec call) is abandoned, not cancelled - Node has no cheap way to abort a Supabase fetch
  // already in flight through this many layers - but the WORKER SLOT moves on immediately either
  // way, which is the actual fix: one slow spec can no longer hold the budget hostage. A spec that
  // hits the clock counts as failed and is logged by name, same as any other failure.
  const SPEC_TIMEOUT_MS = 60000;
  async function refreshOne(key) {
    const sp = specs.get(key);
    const attempts = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const core = await refreshSpec(env, sp).catch(() => undefined);
        if (core !== undefined) return { done: true, core };
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
      return { done: false };
    })();
    const timeout = new Promise(resolve => setTimeout(() => resolve({ done: false, timedOut: true }), SPEC_TIMEOUT_MS));
    const result = await Promise.race([attempts, timeout]);
    if (result.done) { counts.refreshed++; if (!result.core) counts.none++; else counts[result.core.kind === "range" ? "range" : "count"]++; return; }
    counts.failed++; failedKeys.push(result.timedOut ? `${key} (timed out >60s)` : key);
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < queue.length) {
      // Checked BEFORE claiming a key, so `next` only ever advances past specs actually started -
      // "deferred by budget" below is exact, never an estimate.
      if (Date.now() - t0 > BUDGET_MS) { budgetHit = true; break; }
      const key = queue[next++];
      await refreshOne(key);
      if ((next % 50) === 0) say(`  ${next}/${queue.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }));
  const deferred = queue.length - next;
  say(`done in ${Math.round((Date.now() - t0) / 1000)}s: refreshed ${counts.refreshed} (range ${counts.range}, count ${counts.count}, none ${counts.none}), failed ${counts.failed}, deferred-by-budget ${deferred}, skipped-fresh ${fresh.length}, skipped-no-year ${skippedNoYear.length}`);
  if (failedKeys.length) say("FAILED specs:", JSON.stringify(failedKeys));
  if (budgetHit) say(`::notice::stopped starting new specs at the ${Math.round(BUDGET_MS / 60000)}-minute budget; ${deferred} left for the next run`);

  // RED RULE (item 3): running out of time is NEVER a failure. A genuine systemic problem still
  // errors loudly, but only once there is a real sample to judge it on - the incident above queued
  // exactly ONE spec, it failed, and "1 of 1 failed" (100% > 50%) redded the whole job. Require at
  // least 5 ATTEMPTED specs before "more than half failed" means anything; fewer than 5 logs the
  // failures (above) and still exits clean.
  const attempted = next;
  const redLine = attempted >= 5 && counts.failed > attempted / 2;
  if (redLine) { console.error("::error::more than half the ATTEMPTED specs failed to compute"); log.push("::error::more than half the ATTEMPTED specs failed to compute"); }
  return { ok: !redLine, log: log.join("\n"), counts, failedKeys, skippedNoYear, attempted, redLine, deferred };
}

// CLI entry (only when run directly, not on import by the ops endpoint or a test harness).
if (process.argv[1] && /buildSpecMarketCache\.js$/.test(process.argv[1])) {
  const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
  const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
  if (!env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
  buildSpecMarketCache(env, {
    limit: arg("limit", 0), staleDays: arg("stale-days", 7), concurrency: arg("concurrency", 5), budgetMin: arg("budget-min", 15),
    dry: process.argv.includes("--dry")
  }).then(r => process.exit(r.ok ? 0 : 1)).catch(e => { console.error("buildSpecMarketCache failed:", e && e.message); process.exit(1); });
}
