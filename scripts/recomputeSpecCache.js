// Deferred, capped recompute of the spec_market_cache rows scripts/ingest.js invalidated this
// run (Oct 2026, nightly-timing follow-up). Reads ./invalidated-specs.json (written by ingest.js
// right after it deletes the stale rows; absent or empty = nothing to do, clean no-op), ranks the
// list by real search volume (lib/_specRecompute.js rankSpecKeysByViews - the same app_usage_events
// signal scripts/warm.js already uses for its own priority list), recomputes the top N (RECOMPUTE_CAP,
// default 60), and leaves the rest for the ordinary cold-read-on-next-visit path (unchanged, already
// correct - see lib/live/search.js specCore). Runs from its OWN job in nightly.yml, AFTER ingest but
// NEVER blocking warm/attempts/premium/cube (all four `needs: ingest` only, not this job).
//
//   node scripts/recomputeSpecCache.js [--cap=60]
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { recomputeOneSpecKey, rankSpecKeysByViews } from "../lib/_specRecompute.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const CAP = Number(flag("cap", process.env.RECOMPUTE_CAP || 60));
const FILE = new URL("../invalidated-specs.json", import.meta.url);

let keys = [];
try { keys = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* nothing deferred this run */ }
if (!Array.isArray(keys) || !keys.length) {
  console.log("recomputeSpecCache: nothing deferred (invalidated-specs.json absent or empty) - clean no-op.");
  process.exit(0);
}

const env = supabaseEnv();
if (!env) { console.error("::error::Supabase env not set."); process.exit(1); }

const ranked = await rankSpecKeysByViews(env, keys, supabaseSelect);
const chosen = ranked.slice(0, CAP);
const deferred = ranked.length - chosen.length;

let recomputed = 0, thin = 0, failed = 0;
for (const key of chosen) {
  const outcome = await recomputeOneSpecKey(env, key);
  if (outcome === "recomputed") recomputed++;
  else if (outcome === "thin") thin++;
  else failed++;
}
console.log(`recomputeSpecCache: ${recomputed} recomputed, ${thin} thin/no-range, ${failed} failed, out of ${chosen.length} chosen (ranked by search volume) - ${deferred} left for the next real read (cap=${CAP}, ${keys.length} total invalidated this run).`);

// Clean up so a re-run of this step (or a stale artifact) never double-processes the same list.
try { fs.unlinkSync(FILE); } catch {}
