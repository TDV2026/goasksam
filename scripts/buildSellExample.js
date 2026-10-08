#!/usr/bin/env node
// Nightly precompute of the new Sell landing's "An example" band into spec_market_cache (Lane C, Oct 2026),
// so the landing reads one stored row instead of building the example inside a visitor's request (a cold
// build took 9.5s, past the page's 8s wait). Calls the SAME function the page uses (lib/sell/sellExample.js
// sellExample, which runs the visitor's own result: lib/sell/sellFlow.js buildResult), forcing a fresh run.
// Archive reads only, zero OldCarsData. Run after the archive is freshest (after the ingest steps).
//
//   node scripts/buildSellExample.js
import { sellExample } from "../lib/sell/sellExample.js";
import { supabaseEnv } from "../lib/_supabase.js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const t0 = Date.now();
const d = await sellExample(supabaseEnv(), 0, { fresh: true });
const secs = Math.round((Date.now() - t0) / 1000);
const tried = ((d && d.tried) || []).map(t => `${t.car}: ${t.platform || t.error || "no pick"}`).join("; ");

if (!d || !d.example) {
  console.error(`::warning::Sell landing example built in ${secs}s but no candidate car returned a pick (${tried || "nothing tried"}). The landing hides the example band until the next successful run.`);
  process.exit(0);
}
const ex = d.example;
console.log(`Sell landing example built in ${secs}s: ${ex.car} -> ${ex.platform.name}, ${ex.tiles.length} reasons, ${ex.recent.length} recent sales, band photo ${ex.bandPhoto ? "yes" : "no"}. Tried: ${tried}. DONE.`);
