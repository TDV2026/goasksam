// Sales-data epoch (Round 5 Job 1, Oct 2026): the single, cheap, globally-readable signal every
// in-process engine cache (rangeCache, specMem - lib/live/search.js) checks before serving a hit.
//
// THE PROBLEM this replaces. Market Check calls runOneBox fresh on every request (no cache at
// that layer). Buy/Sell/Tasks read in-process Maps that only expired on a TTL (1h for the spec
// layer, matching rangeCache's hardcoded 1h). A warm serverless instance could keep serving a
// pre-ingest answer for up to that TTL after fresh sales landed in sales_archive, even though
// scripts/ingest.js already deletes the matching spec_market_cache TABLE rows the moment it
// upserts new sales for a make/model - that table-level fix never reached a warm instance's own
// Maps, which never re-check the table while their own hit is still inside TTL. Documented,
// unclosed, explicitly left for Sam's call (see lib/live/search.js SPEC_TTL's own comment).
//
// THE FIX. One row in app_config (key "sales_epoch", value an ISO timestamp string) that
// scripts/ingest.js bumps at the end of every run that actually inserted new rows. Every
// in-process cache entry is stamped with the epoch that was current when it was computed; a read
// whose stamped epoch no longer matches the CURRENT epoch is treated exactly like an expired TTL
// entry - a miss, triggering a recompute (which naturally reads the already-fresh table/engine).
// A no-op delta run (inserted === 0) never bumps the epoch, so a quiet night never thrashes caches
// for no reason.
//
// COST. Checking freshness must not itself become a bottleneck (this is why Job 3's whole point -
// cache speed - would be undone by a DB round trip per cache hit). This module holds its OWN
// short-lived, per-instance cache OF the epoch value, polled at most once every POLL_MS; every
// cache check in between reads a local variable, not Supabase. An in-flight read is shared (never
// two concurrent callers double-fetch the same poll).
import { supabaseSelect, supabaseInsert } from "./_supabase.js";

const EPOCH_KEY = "sales_epoch";
const POLL_MS = 5000;   // how often a warm instance re-checks app_config for a bump

let cached = { value: null, at: 0 };
let inflight = null;

// Current sales epoch, per-instance-cached for POLL_MS. FAIL-SAFE ON A READ ERROR: returns the
// last known value (or null pre-bootstrap) rather than treating a transient Supabase hiccup as
// "the epoch changed" - that would turn every momentary blip into a forced stampede of live
// engine re-reads across every cache entry at once, the opposite of what this module exists to
// avoid. A null return (no epoch ever bumped, or env missing) is handled by callers as "epoch
// checking is unavailable" - they fall back to serving the cache on its existing TTL alone,
// never to a hard miss, so a missing/unseeded row can never blank every cache in production.
// Logs ONLY on an actual fresh poll (never on the fast per-instance-cache return, to avoid spam) -
// Lane B job, Oct 2026, Part 2's diagnostic question: what currentEpoch returns in production and
// whether the app_config row exists at all. Never a secret - this row's value is a plain timestamp.
function logEpochPoll(outcome, value) {
  try { console.log(JSON.stringify({ tag: "epoch_poll", outcome, value })); } catch {}
}
export async function currentEpoch(env) {
  if (cached.value != null && Date.now() - cached.at < POLL_MS) return cached.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (!env?.supabaseUrl || !env?.supabaseKey) { logEpochPoll("no_env", cached.value); return cached.value; }
      const rows = await supabaseSelect(env, `app_config?key=eq.${EPOCH_KEY}&select=value&limit=1`);
      const v = rows && rows[0] && rows[0].value;
      if (v != null && String(v).trim()) { cached = { value: String(v), at: Date.now() }; logEpochPoll("row_found", cached.value); return cached.value; }
      cached = { ...cached, at: Date.now() };   // row not seeded yet: keep whatever we had (null pre-bootstrap)
      logEpochPoll(rows == null ? "read_returned_null" : "row_not_found", cached.value);
      return cached.value;
    } catch (e) {
      cached = { ...cached, at: Date.now() };   // read failed: keep the last known value, re-poll in POLL_MS
      logEpochPoll("read_error:" + String(e && e.message || e).slice(0, 60), cached.value);
      return cached.value;
    } finally { inflight = null; }
  })();
  return inflight;
}

// Called by scripts/ingest.js once, at the end of a run that actually inserted new rows. A plain
// timestamp write (no read-then-increment): ingest is a single nightly/delta job, never run
// concurrently with itself, so there is no race to guard against, and a timestamp is sufficient
// for equality-based staleness checks (every consumer only ever compares "did this change", never
// orders two epochs against each other).
export async function bumpEpoch(env) {
  const at = new Date().toISOString();
  await supabaseInsert("app_config", [{ key: EPOCH_KEY, value: at }],
    env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key");
  cached = { value: at, at: Date.now() };   // this instance's own poll cache reflects the bump immediately
  return at;
}
