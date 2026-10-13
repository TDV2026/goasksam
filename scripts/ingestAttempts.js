// Non-sold auction-attempt ingest. Writes auction_attempts (reserve-not-met + withdrawn) for
// the FIVE platforms that report non-sold cleanly. STRICTLY SEPARATE from sales_archive.
// Sep 2026 (Drew/OCD): non-sold IS filterable - `status=unsold` returns the reserve-not-met +
// withdrawn union in ONE query and each row KEEPS its auction_status, so we split the two
// client-side by that field (verified live: BaT unsold 54,219 = 53,280 reserve-not-met + 930
// withdrawn). This replaces the old unfiltered full-corpus paging (which walked all ~245k BaT
// records to extract ~54k non-sold); the direct filter is ~4.5x cheaper. The exact token is
// "reserve not met" WITH SPACES ("reserve_not_met" 400s); OCD accepts the space as %20 or +,
// and our URLSearchParams client (which sends +) works as-is. Run in GitHub Actions (paced).
//
//   node scripts/ingestAttempts.js                 last 12 months (default), all 5 clean sources
//   node scripts/ingestAttempts.js --months=12 --sources=carsandbids,hagerty,sothebysmotorsport,mbmarket
//   node scripts/ingestAttempts.js --dry-run       page and count only: no database writes (it still spends vendor requests)
//   node scripts/ingestAttempts.js --full          ignore the known-page stop and re-read the whole --months window
//
// STOP RULE (Oct 2026): each source is paged newest first and stops once a whole page is already held (primary key
// source_slug + source_record_id), the same early stop scripts/ingest.js --delta uses; --months stays the outer bound, so
// a manual catch-up (--months=2) still reaches back. lib/_attemptsWalk.js holds the rule; scripts/attemptsWalkCheck.mjs
// proves it on a recorded page set. A failed read of the held ids falls back to the whole window, never to an empty set.
//
// Excluded BY RULE (never written here): PCARMarket, Collecting Cars, ACC, PistonHeads
// (result-unavailable/opaque) and all auction houses (RM/Gooding/Bonhams/BJ/Broad Arrow/
// Mecum). Only the five below report non-sold outcomes we can trust.
import { callOldCarsData, configureOcdUsage, flushOcdUsage, getOcdRunMetered } from "../lib/_ocd.js";
import { supabaseEnv, supabaseInsert, supabaseSelect, supabaseSelectAll } from "../lib/_supabase.js";
import { validVin, normChassis } from "../lib/_canonical.js";
import { loadFxRates } from "../lib/_fx.js";
import { normalizeListingUrl } from "../lib/_urlNorm.js";
import { walkAttemptsSource } from "../lib/_attemptsWalk.js";

const CLEAN_SOURCES = ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"];
const env = supabaseEnv();
const apiKey = process.env.OLDCARSDATA_API_KEY;
if (!env || !apiKey) { console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLDCARSDATA_API_KEY."); process.exit(1); }
// Attribute this run's OCD usage to the attempts job (periodic every-100 + final flush) so a crash or
// timeout still leaves a record - previously this script recorded nothing to app_usage_events.
configureOcdUsage({ supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, job: "ingest_attempts" });

const args = process.argv.slice(2);
const flag = n => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const MONTHS = Number(flag("months") || 12);
const SOURCES = (flag("sources") ? flag("sources").split(",") : CLEAN_SOURCES).map(s => s.trim()).filter(s => CLEAN_SOURCES.includes(s));
const DRY = args.includes("--dry-run"), FULL = args.includes("--full");
const cutoff = new Date(Date.now() - MONTHS * 30.44 * 864e5).toISOString().slice(0, 10);

const toMoney = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toBool = v => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const dayKey = d => d ? d.toISOString().slice(0, 10) : null;
const normStatus = st => /reserve.*not.*met/i.test(st) ? "reserve_not_met" : /withdrawn/i.test(st) ? "withdrawn" : null;
// USD equivalent of high_bid by attempt month (currency bug fix). USD/missing passes through; a known
// non-USD currency uses fx_rates; unknown (or fx not loaded) is left null for backfillUsd.js to fill.
let fx = null;
const usdOf = (amount, currency, dateISO) => { const n = Number(amount); if (!(n > 0)) return null; const c = String(currency || "").toUpperCase(); if (!c || c === "USD") return Math.round(n); if (!fx) return null; const v = fx.toUsd(n, c, dateISO); return v == null ? null : Math.round(v); };

// paced OCD fetch: <=240 req/min + retry-with-backoff on 429 (same discipline as ingest.js)
const reqTimes = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pace() { const now = Date.now(); while (reqTimes.length && now - reqTimes[0] > 60000) reqTimes.shift(); if (reqTimes.length >= 240) { await sleep(60000 - (now - reqTimes[0]) + 100); return pace(); } reqTimes.push(Date.now()); }
async function ocd(params) { for (let a = 0; ; a++) { await pace(); try { return await callOldCarsData("/auctions", params, apiKey); } catch (e) { if (e.rateLimited && a < 5) { reqTimes.length = 0; await sleep(61000); continue; } throw e; } } }

const attempts = []; const perSource = {}; let metered = 0; const failed = [];
// FX for high_bid_usd on the way in (best-effort; non-USD left null if fx_rates missing).
try { fx = await loadFxRates(env); } catch (e) { console.error("::warning:: fx_rates load failed; non-USD high_bid_usd left null:", e.message); }
const walkStats = {};
for (const source of SOURCES) {
  let kept = 0, sourceErr = null;
  // The attempts we already hold inside the window (primary key source_slug + source_record_id). null = the read
  // failed: the walk then covers the whole window (never treated as an empty table).
  let held = null;
  if (!FULL) {
    const hr = await supabaseSelectAll(env, `auction_attempts?source_slug=eq.${source}&attempt_date=gte.${cutoff}&select=source_record_id`);
    if (hr) held = new Set(hr.map(x => String(x.source_record_id)));
    else console.error(`::warning:: ${source}: could not read held attempts; walking the whole ${MONTHS}-month window`);
  }
  const fetchPage = async p => {
    metered++;
    // status=unsold: the reserve-not-met + withdrawn union in one filtered query (Drew, Sep 2026).
    // Each row still carries its own auction_status, so normStatus below splits the two cleanly.
    let r; try { r = await ocd({ source, status: "unsold", sort: "date", direction: "desc", page: p, limit: 100 }); }
    catch (e) { if (e.ocdHardCap) { console.error(`\n::error:: ${e.message}`); await flushOcdUsage(); process.exit(1); } console.error(`\n${source} p${p} FAILED: ${e.message}`); sourceErr = `p${p}: ${e.message}`; return { rows: [] }; }
    return { rows: r.data || [], totalPages: r.meta?.total_pages || 1 };
  };
  // A row with no storable status is nothing to hold, so it counts as known.
  const isHeld = held ? (rec => !normStatus(String(rec.auction_status || "")) || held.has(String(rec.id ?? ""))) : null;
  const walk = await walkAttemptsSource({ fetchPage, isHeld, dayOf: rec => dayKey(toDate(rec.auction_end_date)), cutoffDay: cutoff, full: FULL });
  walkStats[source] = { pages: walk.pages, stop: walk.stop, held: held ? held.size : null };
  for (const rec of walk.rows) {
    const d = toDate(rec.auction_end_date);
    const status = normStatus(String(rec.auction_status || "")); if (!status) continue;   // reserve_not_met / withdrawn (safety net; the filter already excludes sold)
    if (d && dayKey(d) < cutoff) continue;
    attempts.push({
      source_slug: source, source_record_id: String(rec.id ?? ""),
      chassis_vin_norm: validVin(rec.vin) ? normChassis(rec.vin) : null,
      make: (rec.ocd_make_name || rec.listing_make || null), model: (rec.ocd_model_name || rec.listing_model || null), year: toInt(rec.year),
      attempt_date: dayKey(d), auction_status: status, high_bid: toMoney(rec.price), high_bid_usd: usdOf(toMoney(rec.price), rec.currency, dayKey(d)), currency: rec.currency || "USD",
      has_reserve: toBool(rec.has_reserve), bids: toInt(rec.stats?.bids), url_norm: normalizeListingUrl(rec.url || rec.source_url),
      views: toInt(rec.stats?.views), watches: toInt(rec.stats?.watches), raw_record: rec,
      canonical_id: null
    });
    kept++;
  }
  process.stderr.write(`\r${source}: ${walk.pages} page(s), stopped on ${walk.stop}${held ? "" : " (no held set)"}\n`); console.log(`${source}: ${kept} non-sold attempt(s) in ${walk.pages} page(s), stop=${walk.stop}${sourceErr ? `  [ERROR: ${sourceErr}]` : ""}.`);
  perSource[source] = kept; if (sourceErr) failed.push(`${source} (${sourceErr})`);
}

// Link to canonical_sales via chassis_vin_norm (the same car's later SALE, where one exists).
const vins = [...new Set(attempts.map(a => a.chassis_vin_norm).filter(Boolean))];
const vinToCanon = new Map();
for (let i = 0; i < vins.length; i += 100) {
  const batch = vins.slice(i, i + 100);
  const rows = await supabaseSelect(env, `canonical_sales?chassis_vin_norm=in.(${batch.map(v => `"${v}"`).join(",")})&select=id,chassis_vin_norm&limit=1000`);
  for (const r of (rows || [])) if (!vinToCanon.has(r.chassis_vin_norm)) vinToCanon.set(r.chassis_vin_norm, r.id);
}
let linked = 0;
for (const a of attempts) if (a.chassis_vin_norm && vinToCanon.has(a.chassis_vin_norm)) { a.canonical_id = vinToCanon.get(a.chassis_vin_norm); linked++; }

// Adaptive-chunked upsert (halve on statement timeout).
const uniq = [...new Map(attempts.filter(a => a.source_record_id).map(a => [`${a.source_slug}|${a.source_record_id}`, a])).values()];
let inserted = 0, chunk = 200, ins = 0, insErr = null;
while (!DRY && ins < uniq.length) {
  const slice = uniq.slice(ins, ins + chunk);
  const r = await supabaseInsert("auction_attempts", slice, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_slug,source_record_id");
  if (r.error) { if (chunk > 25) { chunk = Math.max(25, Math.floor(chunk / 2)); continue; } insErr = r.error; break; }
  inserted += slice.length; ins += slice.length;
}
if (insErr) failed.push(`insert: ${insErr}`);

await flushOcdUsage();   // write the tail of this run's OCD usage (every-100 rows already cover a crash/timeout)
console.log(`\n=== auction_attempts ingest${DRY ? " DRY RUN, nothing written" : ""} (last ${MONTHS}mo, cutoff ${cutoff}${FULL ? ", full re-read" : ", stop at first known page"}) ===`);
console.log(`pages and stop per source: ${JSON.stringify(walkStats)}`);
console.log(`per source: ${JSON.stringify(perSource)}`);
console.log(`total attempts: ${uniq.length} | upserted: ${DRY ? `0 (dry run, would upsert ${uniq.length})` : inserted} | linked to a canonical sale: ${linked} | OCD: ${getOcdRunMetered()} HTTP request(s) incl retries (${metered} page-fetches attempted)`);
if (failed.length) { console.error(`::error::attempts ingest FAILED: ${failed.join("; ")}`); process.exit(1); }
console.log("\nDONE.");
