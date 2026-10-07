#!/usr/bin/env node
// Refresh spec_market_cache (Lane C, Oct 2026): what each exact spec of every live listing sells for,
// so /buy's search and card lines never run the One Box engine live. Runs in the nightly GitHub
// Action right after buildVinIndex. Archive only, ZERO OldCarsData. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Options: --limit=N (specs), --stale-hours=H (skip keys refreshed within H
// hours; default 0 = refresh all).
import { liveRows, listingFacts, specOf, refreshSpec } from "../lib/live/search.js";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
if (!env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
const LIMIT = Number(arg("limit", 0)) || Infinity, STALE_H = Number(arg("stale-hours", 0)) || 0;

const t0 = Date.now();
const rows = await liveRows(env, "id=gt.0");
console.log(`live listings: ${rows.length}`);
// One spec per key (the same key the budget rule and the card lines use).
const specs = new Map();
for (const r of rows) {
  const sp = await specOf(env, r, listingFacts(r)).catch(() => null);
  if (sp && !specs.has(sp.key)) specs.set(sp.key, sp);
}
let keys = [...specs.keys()];
if (STALE_H > 0) {
  const fresh = new Set();
  const since = new Date(Date.now() - STALE_H * 3600e3).toISOString();
  for (let i = 0; i < keys.length; i += 60) {
    const list = keys.slice(i, i + 60).map(k => '"' + k.replace(/"/g, '\\"') + '"').join(",");
    const r = await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?spec_key=in.(${encodeURIComponent(list)})&computed_at=gte.${since}&select=spec_key`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (r.ok) (await r.json()).forEach(x => fresh.add(x.spec_key));
  }
  keys = keys.filter(k => !fresh.has(k));
}
keys = keys.slice(0, LIMIT);
console.log(`unique specs: ${specs.size}, to refresh: ${keys.length}`);
const counts = { range: 0, count: 0, none: 0, failed: 0 };
let next = 0;
// refreshSpec runs through the engine's own throttle (8 at once), so 8 workers keep it full.
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < keys.length) {
    const sp = specs.get(keys[next++]);
    const core = await refreshSpec(env, sp).catch(() => undefined);
    if (core === undefined) counts.failed++; else if (!core) counts.none++; else counts[core.kind === "range" ? "range" : "count"]++;
    if ((next % 50) === 0) console.log(`  ${next}/${keys.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s:`, JSON.stringify(counts));
if (counts.failed > keys.length / 2) { console.error("::error::more than half the specs failed to compute"); process.exit(1); }
