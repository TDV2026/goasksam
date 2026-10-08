#!/usr/bin/env node
// Nightly precompute of the Market Check landing's "An example" band into spec_market_cache, so the
// public landing page is a single cheap table read rather than a live engine call (lib/onebox.js
// runOneBox) on every signed-out visit. Calls the SAME builder the live landing falls back to on a
// cold/missing row - never a second implementation - forcing a fresh run (opts.fresh) so this one
// nightly job always recomputes, even inside the 24h TTL. Run AFTER the archive/VIN index are
// freshest (after scripts/buildVinIndex.js) so the example reflects last night's ingest.
//
//   node scripts/buildMarketCheckExample.js
import { marketCheckExample } from "../lib/live/marketCheckExample.js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const t0 = Date.now();
const d = await marketCheckExample(0, { fresh: true });
const secs = Math.round((Date.now() - t0) / 1000);

if (!d) {
  console.error(`::warning::Market Check landing example built in ${secs}s but did not qualify (no cluster, or fewer than 5 matching sales) - the landing will hide the example band until the next successful run.`);
  process.exit(0);
}
console.log(`Market Check landing example built in ${secs}s: ${d.name}, range ${d.cluster[0]}-${d.cluster[1]}, ${d.cards.length} sales cached. DONE.`);
