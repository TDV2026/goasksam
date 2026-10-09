#!/usr/bin/env node
// Nightly precompute of the Sam Desk page's (/business) worked example into spec_market_cache, so the
// public page is a cheap table read rather than three live engine calls (lib/onebox.js runOneBox, via
// api/_historyData.js oneBoxFor) on every signed-out visit. Calls the SAME builder the live page falls
// back to on a cold/missing row - never a second implementation - forcing a fresh run (opts.fresh) so
// this nightly job always recomputes, even inside the 24h TTL. Run AFTER the archive is freshest.
//
//   node scripts/buildDeskExample.js
import { deskExample } from "../lib/live/deskExample.js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const t0 = Date.now();
const d = await deskExample(0, { fresh: true });
const secs = Math.round((Date.now() - t0) / 1000);

if (!d) {
  console.error(`::warning::Sam Desk example built in ${secs}s but fewer than 2 of the 3 Porsche 911 generations qualified - the page will hide the worked example until the next successful run.`);
  process.exit(0);
}
console.log(`Sam Desk example built in ${secs}s: ${d.gens.map(g => g.code + "=" + g.soldCount).join(", ")}, total ${d.totalSoldCount}. DONE.`);
