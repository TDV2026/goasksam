// Deferred, capped recompute of the spec_market_cache rows scripts/ingest.js invalidated this
// run (Oct 2026, nightly-timing follow-up). Reads ./invalidated-specs.json (written by ingest.js
// right after it deletes the stale rows; absent or empty = nothing to do, clean no-op), ranks the
// list by real search volume (lib/_specRecompute.js rankSpecKeysByViews - the same app_usage_events
// signal scripts/warm.js already uses for its own priority list), recomputes the top N (RECOMPUTE_CAP,
// default 60), and leaves the rest for the ordinary cold-read-on-next-visit path (unchanged, already
// correct - see lib/live/search.js specCore).
//
// BACKLOG (Nov 5 2026): the invalidated list used to live only in a one day artifact, so on a night ingest invalidated 1,661 specs and
// this step recomputed the top 60, the other 1,601 were forgotten and every one of them was a cold read for a visitor. The unfinished
// keys now persist in app_config (key spec_recompute_backlog, a JSON array); each night's run merges tonight's list with the backlog,
// ranks it, recomputes what the cap and the time budget allow, and writes the rest back. A key whose row a real read rebuilt in the
// meantime is dropped, not redone. The step is resumable: stopping at the time budget loses nothing. Runs from its OWN job in nightly.yml, AFTER ingest but
// NEVER blocking warm/attempts/premium/cube (all four `needs: ingest` only, not this job).
//
//   node scripts/recomputeSpecCache.js [--cap=60]
import fs from "node:fs";
import { supabaseEnv, supabaseSelect, supabasePatch, supabaseInsert } from "../lib/_supabase.js";
import { recomputeOneSpecKey, rankSpecKeysByViews, mergeBacklog, BACKLOG_KEY } from "../lib/_specRecompute.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const CAP = Number(flag("cap", process.env.RECOMPUTE_CAP || 400));
const FILE = new URL("../invalidated-specs.json", import.meta.url);

let keys = [];
try { keys = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* nothing deferred this run */ }

const env = supabaseEnv();
if (!env) { if (Array.isArray(keys) && keys.length) { console.error("::error::Supabase env not set."); process.exit(1); } console.log("recomputeSpecCache: nothing deferred and no database - clean no-op."); process.exit(0); }

// the backlog earlier nights left (app_config spec_recompute_backlog); unreadable = start from tonight's list alone, never fail on it
let backlog = [], backlogRow = false;
try { const r = await supabaseSelect(env, `app_config?key=eq.${BACKLOG_KEY}&select=value&limit=1`); if (r && r[0]) { backlogRow = true; backlog = JSON.parse(r[0].value); } } catch { /* none yet */ }
// rows a real read rebuilt since: drop them, never redo them
const rebuilt = new Set();
try {
  const all = mergeBacklog(keys, backlog);
  for (let i = 0; i < all.length; i += 100) {
    const part = all.slice(i, i + 100);
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=in.(${part.map(k => '"' + k.replace(/"/g, '\\"') + '"').map(encodeURIComponent).join(",")})&select=spec_key&limit=200`);
    for (const r of rows || []) rebuilt.add(r.spec_key);
  }
} catch { /* unreadable: keep them all */ }
const merged = mergeBacklog(keys, backlog, rebuilt);
if (!merged.length) {
  console.log("recomputeSpecCache: nothing deferred (no list tonight, no backlog) - clean no-op.");
  process.exit(0);
}

const ranked = await rankSpecKeysByViews(env, merged, supabaseSelect);
const startedAt = Date.now(), BUDGET_MS = Number(flag("minutes", process.env.RECOMPUTE_MINUTES || 4)) * 60e3;
// plan as we go: stop starting work once the budget is spent
let recomputed = 0, thin = 0, failed = 0; const doneKeys = [];
for (const key of ranked) {
  if (doneKeys.length >= CAP || Date.now() - startedAt >= BUDGET_MS) break;
  const outcome = await recomputeOneSpecKey(env, key);
  doneKeys.push(key);
  if (outcome === "recomputed") recomputed++;
  else if (outcome === "thin") thin++;
  else failed++;
}
const left = ranked.filter(k => !doneKeys.includes(k));
// write the unfinished keys back so tomorrow resumes where this stopped
try {
  const value = JSON.stringify(left);
  const res = backlogRow
    ? await supabasePatch(env, `app_config?key=eq.${BACKLOG_KEY}`, { value })
    : await supabaseInsert("app_config", [{ key: BACKLOG_KEY, value }], env.supabaseUrl, env.supabaseKey);
  if (res && (res.error || res.ok === false)) console.log(`::warning::recomputeSpecCache could not save the backlog (${left.length} keys): ${String(res.error || res.status || "").slice(0, 120)}`);
} catch (e) { console.log(`::warning::recomputeSpecCache could not save the backlog: ${String(e.message || e).slice(0, 120)}`); }
console.log(`recomputeSpecCache: ${recomputed} recomputed, ${thin} thin/no-range, ${failed} failed, ${doneKeys.length} done of ${ranked.length} (ranked by search volume) in ${Math.round((Date.now() - startedAt) / 1000)} s - ${left.length} kept in the backlog for the next run (${backlog.length} came from earlier nights, ${rebuilt.size} dropped because a real read rebuilt them).`);

// Clean up so a re-run of this step (or a stale artifact) never double-processes the same list.
try { fs.unlinkSync(FILE); } catch {}
