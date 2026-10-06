// Date-parameterised sales_archive ingest (7D). Replaces the June-hardcoded
// juneReport.js. Targets any day or range, or runs a nightly delta.
//
// Modes:
//   node scripts/ingest.js --date=2026-07-15          one day
//   node scripts/ingest.js --from=2026-07-01 --to=2026-07-29   a range (backfill)
//   node scripts/ingest.js --delta                    nightly: fetch newest, STOP
//                                                      at the first record already held
//   flags: --sources=bringatrailer,carsandbids,...  (default: all tracked)
//          --zero-streak=3   archive-based health: flag a normally-selling source on N+ zero-sale days
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLDCARSDATA_API_KEY (GitHub
// Actions provides them as secrets; secrets are not pullable to a laptop).
import { callOldCarsData, configureOcdUsage, flushOcdUsage, getOcdRunMetered } from "../lib/_ocd.js";
import { supabaseEnv, supabaseInsert, supabaseSelect, supabaseSelectAll } from "../lib/_supabase.js";
import { isPartsListing, projectFlagReason } from "../lib/_classify.js";
import { deltaShouldStop, earliestGapDay, typicalByWeekday, recentDayList, zeroStreakFlag, requestCapReached, isFutureSale } from "../lib/_ingestHealth.js";
import { resolveIngestIdentity } from "../lib/_unknownClassify.js";
import { computeDescFacts } from "../lib/_descFacts.js";
import { loadFxRates } from "../lib/_fx.js";
import { hammerUsd, setFxRates } from "../lib/_houseComps.js";

// All 19 OCD live sources (Sep 2026). Slugs are OCD's own /auctions?source= values,
// verified live. The four live-auction houses (barrettjackson, mecum, bonhams, broadarrow)
// already have premium schedules in lib/_houseComps.js. NOTE (launch blocker, reported
// separately): One Box keys house premium back-out on the source SLUG, but sales_archive
// stores the DISPLAY LABEL in `platform`, so isHouseSource never matches "RM Sotheby's" /
// "Gooding & Co" etc. The houses must NOT be relied on in comp pools until that
// label/slug mismatch is fixed, or their premium-inclusive prices distort the pool.
const DISPLAY = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty",
  pcarmarket: "PCARMarket", acc: "All Collector Cars", gooding: "Gooding & Co",
  rmsothebys: "RM Sotheby's", hemmings: "Hemmings", sothebysmotorsport: "Sotheby's Motorsport",
  mbmarket: "MB Market", autohunter: "AutoHunter",
  barrettjackson: "Barrett-Jackson", mecum: "Mecum Auctions", bonhams: "Bonhams",
  broadarrow: "Broad Arrow", carandclassic: "Car & Classic", collectingcars: "Collecting Cars",
  themarket: "The Market", pistonheads: "PistonHeads"
};
// AutoHunter went out of business (Aug 2026) and no longer publishes sales, so it is dropped from the
// default FETCH list (no run should spend a request trying to ingest a dead source). Its DISPLAY label
// and historical archive rows are kept so old data still resolves. An explicit --sources=autohunter
// override would still fetch it (a deliberate choice); the default simply never touches it.
const DEFUNCT_SOURCES = new Set(["autohunter"]);
const ALL_SOURCES = Object.keys(DISPLAY).filter(s => !DEFUNCT_SOURCES.has(s));

const args = process.argv.slice(2);
const flag = name => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const has = name => args.includes(`--${name}`);
const DATE = flag("date");
const FROM = flag("from") || DATE;
const TO = flag("to") || DATE;
const DELTA = has("delta") || (!FROM && !TO);
const SOURCES = (flag("sources") ? flag("sources").split(",") : ALL_SOURCES).map(s => s.trim()).filter(Boolean);
// Hard total-OCD-request ceiling for THIS run. Default UNLIMITED (null) so the nightly delta is
// unchanged; a dispatch sets it (e.g. --max-requests=20) as a deliberate safety stop. Enforced from
// the OCD client's own HTTP counter (every request incl 429 retries), so it is a true total cap.
const MAX_REQUESTS = flag("max-requests") != null ? Math.max(1, Number(flag("max-requests")))
  : (process.env.OCD_MAX_REQUESTS ? Math.max(1, Number(process.env.OCD_MAX_REQUESTS)) : null);

const env = supabaseEnv();
const apiKey = process.env.OLDCARSDATA_API_KEY;
if (!env || !apiKey) { console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLDCARSDATA_API_KEY."); process.exit(1); }
// Attribute this run's OCD usage (periodic + final rows) to the ingest job so a crash still leaves a record.
configureOcdUsage({ supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey, job: DELTA ? "ingest_delta" : "ingest_backfill" });
// A delta never legitimately needs many pages per source; exceeding this means the stop logic failed
// (e.g. a blind held-set), so abort that source loudly rather than walk it to exhaustion.
const DELTA_MAX_PAGES_PER_SOURCE = Number(process.env.OCD_DELTA_MAX_PAGES_PER_SOURCE || 60);

const toMoney = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
// Zero is not a mileage: a source that writes 0 for "unknown" (Barrett-Jackson, Mecum, the houses, ...)
// must store null, not 0, so the engine never reads a phantom 0-mile car. Any positive value passes.
const milesOrNull = v => { const n = toInt(v); return n != null && n > 0 ? n : null; };
const toBool = v => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const dayKey = d => d ? d.toISOString().slice(0, 10) : null;

// --- Rate-limit-aware OCD fetch (Sep 2026). OCD enforces a HARD 250 requests/minute; a
// flat-out backfill hit it at Collecting Cars p251 and the old catch-and-skip silently
// dropped the next two sources while the run stayed green. Two protections:
//  1. PACING: a sliding 60s window capped at 240 (margin under 250; the OCD quota is
//     account-wide, so live searches also count - the retry below absorbs any overflow).
//  2. RETRY-WITH-BACKOFF on 429: wait for the minute window to clear, then retry the SAME
//     page, up to MAX_RETRIES. A page that succeeds on retry is NOT a failure. Only a
//     non-429 error, or 429 still failing after all retries, propagates and reds the run.
const RL_MAX_PER_MIN = 240;
const RL_WINDOW_MS = 60000;
const RL_MAX_RETRIES = 5;
const reqTimes = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function paceBeforeRequest() {
  const now = Date.now();
  while (reqTimes.length && now - reqTimes[0] > RL_WINDOW_MS) reqTimes.shift();
  if (reqTimes.length >= RL_MAX_PER_MIN) {
    await sleep(RL_WINDOW_MS - (now - reqTimes[0]) + 100);
    return paceBeforeRequest();
  }
  reqTimes.push(Date.now());
}
function retryAfterMs(e) {
  const n = Number(e && e.rateLimit && e.rateLimit.reset);
  if (Number.isFinite(n)) {
    if (n > 1e9) return Math.max(1000, n * 1000 - Date.now()) + 500;   // epoch seconds
    if (n > 0 && n <= 300) return n * 1000 + 500;                       // delta seconds
  }
  return RL_WINDOW_MS + 1000;   // default: clear the full 1-minute window
}
async function ocdFetch(params) {
  for (let attempt = 0; ; attempt++) {
    await paceBeforeRequest();
    try {
      return await callOldCarsData("/auctions", params, apiKey);
    } catch (e) {
      if (e.rateLimited && attempt < RL_MAX_RETRIES) {
        const waitMs = retryAfterMs(e);
        process.stderr.write(`\n  429 rate limit; waiting ${Math.round(waitMs / 1000)}s then retrying (attempt ${attempt + 1}/${RL_MAX_RETRIES})...\n`);
        reqTimes.length = 0;   // window is over per the server; reset our tracker
        await sleep(waitMs);
        continue;
      }
      throw e;   // non-429, or 429 after all retries -> propagate (fail the source)
    }
  }
}

// Natural dedup key (item 7), matching the UNIQUE PARTIAL EXPRESSION INDEX in
// docs/supabase-sales-archive-dedupe-key.sql EXACTLY: lower(source_slug) | ident | sale_date |
// round(sale_price), where ident = 17-char cleaned VIN when present, else the whitespace-normalised
// lowercased listing_title. Returns null for a blank title AND no-VIN, or a non-positive price (the
// index is partial and excludes those, so they must NEVER be collapsed) - the caller falls back to
// source_id so those rows stay distinct. Used only for the in-memory batch dedup; NOT a stored column.
function dedupeKeyFor(source, vinRaw, saleDate, salePrice, title) {
  const price = Math.round(Number(salePrice) || 0);
  if (!(price > 0)) return null;                                   // partial-index: excluded, never dedup
  const vin = String(vinRaw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const date = String(saleDate || "").slice(0, 10);
  const slug = String(source || "").toLowerCase();
  const ident = vin.length === 17 ? vin : String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!ident) return null;                                         // blank title + no VIN -> excluded
  return `${slug}|${ident}|${date}|${price}`;
}
// HAMMER USD of a sale by sale month (item 1, currency bug fix). sale_price_usd is the implied HAMMER
// in USD: house prices are premium-inclusive, so hammerUsd backs out each house's published schedule
// BEFORE converting; online prices are already hammer. Conversion keys on the sale MONTH via fx_rates
// (armed through setFxRates). USD passes through; a non-USD currency with no FX loaded is left null so
// a later run / backfillUsd.js fills it rather than guessing a rate.
let fx = null;
function usdOf(amount, currency, dateISO, source, label) {
  const n = Number(amount);
  if (!(n > 0)) return null;
  const c = String(currency || "").toUpperCase();
  if (c && c !== "USD" && !fx) return null;   // non-USD, no FX table: leave null for a later fill
  const v = hammerUsd({ source_slug: source, source: label, price: n, currency: c || "USD", date: dateISO });
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}
function toFullRow(r, label, source) {
  const d = toDate(r.auction_end_date);
  const saleDate = dayKey(d), salePrice = toMoney(r.price);
  // Project/incomplete/shell flag computed AT INGEST (item 1) from title + description, stamped into
  // raw_record (no schema migration) so a flagged car carries its reason forward. The read path also
  // re-derives it live from the description, so existing rows are covered without a backfill.
  const projFlag = projectFlagReason(r.title, r.description);
  // Fix 5 item 5: when OCD's structured make/model are empty, classify make/model + vehicle_type from
  // the title (and VIN) BEFORE writing "Unknown" (OCD ships no structured make/model for BaT). An
  // already-identified row keeps its OCD values and is typed by make.
  const ident = resolveIngestIdentity(r);
  // Descriptions resilience: stamp the description-derived facts into their own columns at ingest
  // (while we still receive the text), so the readers keep working if the description later stops.
  const df = computeDescFacts({ title: r.title, description: r.description, listingDetails: r.listing_details, mileageStructured: toInt(r.mileage) });
  return {
    source_id: String(r.id ?? ""), sale_date: saleDate, platform: label, source_slug: source,
    make: ident.make, model: ident.model, vehicle_type: ident.vehicle_type,
    stated_mileage: df.stated_mileage, project_flag: df.project_flag, desc_facts: df.desc_facts,
    sale_price: toMoney(r.price), sale_price_usd: usdOf(salePrice, r.currency, saleDate, source, label),
    month: d ? d.toISOString().slice(0, 7) : null, raw_record: projFlag ? { ...r, _project_flag: projFlag } : r,
    year: toInt(r.year), mileage: milesOrNull(r.mileage), body_style: r.body_style ?? null,
    title_status: r.title_status ?? null, vin: r.vin ?? null, transmission: r.transmission ?? null,
    drivetrain: r.drivetrain ?? null, exterior_color: r.exterior_color ?? null, interior_color: r.interior_color ?? null,
    seller_type: r.seller_type ?? null, listing_title: r.title ?? null, description: r.description ?? null,
    has_reserve: toBool(r.has_reserve), views: toInt(r.stats?.views), bids: toInt(r.stats?.bids),
    known_flaws: r.known_flaws ?? null, recent_service_history: r.recent_service_history ?? null, modifications: r.modifications ?? null
  };
}

// Delta mode: the newest source_ids we already hold, so we can stop paginating
// the moment a page is fully known.
// Returns a Set of held source_ids, or NULL when the DB read FAILED. A failed read must NEVER be
// treated as an empty set: an empty set makes every record look new, defeating the delta early-stop
// and re-ingesting the whole source. supabaseSelect returns null on a failed/timed-out read and []
// on a genuinely empty table, so the two are distinguishable.
async function heldIds(source, label) {
  const rows = await supabaseSelect(env, `sales_archive?platform=eq.${encodeURIComponent(label)}&select=source_id&order=sale_date.desc&limit=2000`);
  if (rows === null) return null;   // failed read -> caller aborts
  return new Set(rows.map(r => String(r.source_id)));
}

// Archive daily sale counts for one source since `sinceISO` ({YYYY-MM-DD: count}), from the archive
// ITSELF (not this run's yield). Reads source_slug (every recent row carries it) and paginates past
// the 1000-row cap. Empty object on a failed/empty read so the caller degrades (no gap, no flag).
async function archiveDailyCounts(source, sinceISO) {
  const rows = await supabaseSelectAll(env, `sales_archive?source_slug=eq.${encodeURIComponent(source)}&sale_date=gte.${sinceISO}&select=sale_date&order=sale_date.desc`);
  const counts = {};
  if (rows) for (const r of rows) { const d = String(r.sale_date || "").slice(0, 10); if (d) counts[d] = (counts[d] || 0) + 1; }
  return counts;
}

const RUN_DAY = dayKey(new Date());   // a completed sale can never be dated after today (item 2 guard)
let metered = 0;
const perDay = {};
const kept = [];
const failedSources = [];   // sources that ended in an UNRESOLVED error -> red the run at exit
let capReached = false;     // set once --max-requests is hit; stops all further fetching (run is incomplete, not failed)
const inRange = d => {
  if (!d) return false;
  const k = dayKey(d);
  if (FROM && k < FROM) return false;
  if (TO && k > TO) return false;
  return true;
};

// FX for sale_price_usd on the way in. Best-effort: if fx_rates is missing, non-USD rows get a null
// sale_price_usd (backfillUsd.js fills them later) rather than blocking ingest or guessing a rate.
try { fx = await loadFxRates(env); setFxRates(fx); if (!fx.has("GBP")) console.error("::warning:: fx_rates has no GBP; non-USD sale_price_usd will be null until loaded"); }
catch (e) { console.error("::warning:: fx_rates load failed; non-USD sale_price_usd left null:", e.message); }

for (const source of SOURCES) {
  if (capReached) break;   // --max-requests hit on a prior source; do not start another
  const label = DISPLAY[source] || source;
  const held = DELTA ? await heldIds(source, label) : null;
  // A failed held-set read (DB blind) is the exact condition that turned Nightly #83 into a full
  // re-ingest. Abort the run loudly with a non-zero exit; never proceed with an empty set.
  if (DELTA && held === null) {
    console.error(`::error:: ingest ABORT: could not read held ids for ${label} (DB unreadable). Refusing delta to avoid a full re-ingest.`);
    await flushOcdUsage();
    process.exit(1);
  }
  // GAP-AWARE DELTA (item 2): before relying on the stop-at-known-page shortcut, check the last 7
  // days of THIS source in the archive against its own per-weekday typical. Any day below half its
  // typical is a thin day the delta would normally skip right over (the page covering it is already
  // "known"), so compute the oldest such day and keep the walk going back far enough to re-scan it
  // for records we are missing. A source that genuinely did not sell that weekday (typical 0) is
  // never treated as a gap, so a quiet source is not needlessly re-walked. Degrades to no-gap on a
  // failed/empty archive read. Range backfills already cover their whole window, so this is DELTA-only.
  let catchUpFrom = null;
  if (DELTA) {
    const asOf = dayKey(new Date());
    const sinceISO = recentDayList(asOf, 43)[0];   // 42-day window + today, oldest first
    const daily = await archiveDailyCounts(source, sinceISO);
    const typical = typicalByWeekday(daily, { asOf, windowDays: 42 });
    catchUpFrom = earliestGapDay(daily, typical, { asOf, days: 7, fraction: 0.5 });
    if (catchUpFrom) process.stderr.write(`  ${label}: thin recent day detected; walking delta back to ${catchUpFrom} to backfill it\n`);
  }
  const before = kept.length;
  let partsSkipped = 0, marketplaceSkipped = 0, unpricedSkipped = 0, futureSkipped = 0, sourceError = null;
  // PCarMarket "MarketPlace:" rows are fixed-price CLASSIFIEDS (asking price / for-sale), not
  // completed auctions, so they carry an asking/scheduled date (some future-dated) and must never
  // enter this completed-sales-only archive. Verified Sep 2026: 4 such rows had leaked in.
  const isMarketplace = t => /^\s*marketplace:/i.test(String(t || ""));
  // PistonHeads is a CLASSIFIEDS marketplace: ~22% of its "sold" rows carry no hammer price
  // (asking-price / ended-unsold listings). A completed-sales-only archive needs a real sale
  // price, so screen unpriced rows for PistonHeads at ingest (verified Sep 2026: 33/150).
  const isUnpriced = r => !(Number(String(r.price ?? "").replace(/[^0-9.]/g, "")) > 0);
  // Page ceiling is a safety stop, not the real limit: DELTA stops on a fully-known page and a
  // RANGE backfill stops the moment a page's oldest date passes FROM (below). The old 2000 cap
  // silently truncated a deep backfill (a 2023-01-01 BaT range needs ~2,497 pages), so raise it
  // well past OCD's deepest source (BaT ~3,825 pages) - the FROM/known stops still end it early.
  for (let p = 1; p <= 6000; p++) {
    // Delta page ceiling: a delta that walks past this many pages is not catching up, it is
    // re-ingesting. Abort THIS source loudly and mark the run failed.
    if (DELTA && p > DELTA_MAX_PAGES_PER_SOURCE) {
      console.error(`\n::error:: ${label} exceeded ${DELTA_MAX_PAGES_PER_SOURCE} delta pages without catching up; aborting source (stop logic failed).`);
      sourceError = `delta page ceiling ${DELTA_MAX_PAGES_PER_SOURCE} exceeded`;
      break;
    }
    // Hard --max-requests ceiling: stop BEFORE a fetch that would exceed the run's total OCD budget.
    // Counted from the client's own HTTP counter so 429 retries count too. Incomplete, not a failure.
    if (requestCapReached(getOcdRunMetered(), MAX_REQUESTS)) {
      process.stderr.write(`\n::warning:: --max-requests cap (${MAX_REQUESTS}) reached after ${getOcdRunMetered()} OCD request(s); stopping before ${label} p${p}. Run is INCOMPLETE by design.\n`);
      capReached = true;
      break;
    }
    metered++;
    let res;
    try { res = await ocdFetch({ source, status: "sold", sort: "date", direction: "desc", page: p, limit: 50 }); }
    catch (e) {
      if (e.ocdHardCap) { console.error(`\n::error:: ${e.message}`); await flushOcdUsage(); process.exit(1); }
      console.error(`\n${label} p${p} FAILED after retries: ${e.message}`); sourceError = `p${p}: ${e.message}`; break;
    }
    const rows = res.data || [];
    if (!rows.length) break;
    let oldest = null, pageAllKnown = DELTA;
    for (const r of rows) {
      const d = toDate(r.auction_end_date);
      if (d && (!oldest || d < oldest)) oldest = d;
      const id = String(r.id ?? "");
      // A completed sale cannot be dated after the run day. Upcoming/scheduled auctions that leak in
      // with a future end date (verified: C&B rows dated 2026-10-06 and 2026-12-09) are rejected here
      // in BOTH modes so they never enter this completed-sales-only archive.
      if (d && isFutureSale(dayKey(d), RUN_DAY)) { futureSkipped++; continue; }
      // Parts / automobilia never enter the archive (OCD has no category field; these
      // list under a car's make/model and would poison the pool). Skipped in both modes.
      if (isPartsListing(r.title, r.mileage)) { partsSkipped++; continue; }
      if (isMarketplace(r.title)) { marketplaceSkipped++; continue; }
      if (source === "pistonheads" && isUnpriced(r)) { unpricedSkipped++; continue; }
      if (DELTA) {
        if (held.has(id)) continue;      // already held: skip
        pageAllKnown = false;            // a new record on this page
        kept.push(toFullRow(r, label, source));
        if (d) perDay[dayKey(d)] = (perDay[dayKey(d)] || 0) + 1;
      } else if (inRange(d)) {
        kept.push(toFullRow(r, label, source));
        perDay[dayKey(d)] = (perDay[dayKey(d)] || 0) + 1;
      }
    }
    process.stderr.write(`\r${label} p${p}/${res.meta?.total_pages ?? "?"} kept ${kept.length} reqs ${metered}   `);
    // Stop conditions: delta -> a fully-known page (we have caught up) AND no thin-day gap left to
    // cover (gap-aware, item 2); range -> paged past the window (oldest older than FROM).
    if (DELTA && deltaShouldStop({ pageAllKnown, oldestDay: oldest ? dayKey(oldest) : null, catchUpFrom })) break;
    if (!DELTA && FROM && oldest && dayKey(oldest) < FROM) break;
    if (p >= (res.meta?.total_pages || 1)) break;
  }
  process.stderr.write("\n");
  console.log(`${label}: ${kept.length - before} record(s) this source${partsSkipped ? ` (${partsSkipped} parts/automobilia skipped)` : ""}${marketplaceSkipped ? ` (${marketplaceSkipped} marketplace/asking-price skipped)` : ""}${unpricedSkipped ? ` (${unpricedSkipped} unpriced/classified skipped)` : ""}${futureSkipped ? ` (${futureSkipped} future-dated/scheduled skipped)` : ""}${sourceError ? `  [UNRESOLVED ERROR: ${sourceError}]` : ""}.`);
  if (sourceError) failedSources.push(`${label} (${sourceError})`);
}

// Dedupe by source_id and upsert. Adaptive chunking (Sep 2026): an upsert with
// on_conflict=source_id becomes a heavy DO UPDATE when many rows already exist (large
// raw_record JSONB + index maintenance), and a 250-row chunk hit Supabase's statement
// timeout (57014) on the Collecting Cars re-ingest. So start SMALL and HALVE on any write
// error down to a floor; only a chunk that fails even at the floor is a genuine failure.
// Progress advances only on a committed chunk, so nothing is skipped or double-lost.
// --chunk overrides the base size.
//
// SKIP-DON'T-ABORT (Sep 2026, post 2023-2025 backfill): a chunk that fails even at the
// floor no longer BREAKS the whole upsert. Aborting on the first floor-failure once
// discarded ~63k already-fetched (already-metered) rows because one pathological chunk
// timed out. Now the run records the bad chunk, advances past it, and keeps writing; the
// skipped source_ids are reported so a targeted re-run can recover only them. One bad
// chunk costs its own rows, never the remainder.
//
// --ignore-dupes (Sep 2026): backfills are almost entirely NEW rows, so the expensive
// on-conflict DO UPDATE (JSONB rewrite) buys nothing and is what trips the statement
// timeout. This flag switches to resolution=ignore-duplicates (DO NOTHING), a far lighter
// write path. Use it for historical backfills; the nightly delta keeps merge semantics.
// Dedup the batch by the NATURAL key (item 7), keeping the first row, so two OCD source_record_ids for
// the same physical sale never both insert within one run. Rows the key excludes (blank title + no VIN,
// or non-positive price) fall back to source_id so they stay distinct.
const uniq = [...new Map(kept.filter(r => r.source_id).map(r => [dedupeKeyFor(r.source_slug, r.vin, r.sale_date, r.sale_price, r.listing_title) || r.source_id, r])).values()];
const BASE_CHUNK = Math.max(1, Number(flag("chunk") || 100));
const MIN_CHUNK = 25;
const IGNORE_DUPES = flag("ignore-dupes") != null;
const UPSERT_RES = IGNORE_DUPES ? "resolution=ignore-duplicates,return=minimal" : "resolution=merge-duplicates,return=minimal";
let inserted = 0, insertError = null, chunk = BASE_CHUNK, i = 0, sinceGrow = 0, dupSkipped = 0;
const skipped = [];   // source_ids of chunks that failed at the floor for a NON-duplicate reason
// Upsert on source_id (merge) so a re-fetch of the SAME sale updates in place (photo/field refresh).
// Cross-run DUPLICATES - a re-ingest of the same sale under a NEW source_id - are caught by the unique
// natural-key index (docs/supabase-sales-archive-dedupe-key.sql) which rejects the INSERT (Postgres
// 23505); those rows are isolated by halving the chunk down to a single row and skipped as EXPECTED
// (never counted as an error). Before the index exists no 23505 fires, so ingest behaves as before. The
// batch is already deduped in memory by the natural key, so a 23505 only ever means a prior-run dup.
const UNIQUE_VIOLATION = e => /23505|duplicate key|unique constraint|already exists/i.test(String(e || ""));
while (i < uniq.length) {
  const slice = uniq.slice(i, i + chunk);
  const r = await supabaseInsert("sales_archive", slice, env.supabaseUrl, env.supabaseKey, UPSERT_RES, "?on_conflict=source_id");
  if (r.error) {
    const uniqViol = UNIQUE_VIOLATION(r.error);
    // Isolate: a unique-violation halves all the way to a single row (to skip only the dup); any other
    // error stops at MIN_CHUNK (a heavy/timing chunk).
    const floor = uniqViol ? 1 : MIN_CHUNK;
    if (chunk > floor) {
      chunk = Math.max(floor, Math.floor(chunk / 2)); sinceGrow = 0;
      if (!uniqViol) process.stderr.write(`\n  insert error, retrying same rows at chunk ${chunk}: ${r.error}\n`);
      continue;   // retry the SAME offset at a smaller size
    }
    if (uniqViol && slice.length === 1) {
      // This single row is a cross-run duplicate the natural-key index correctly rejected. Skip it
      // silently (this is the point of the index), advance, and keep the small chunk to isolate more.
      dupSkipped += 1; i += 1; chunk = 1; continue;
    }
    // Non-duplicate failure even at the floor: record this chunk's source_ids, advance, keep going.
    insertError = r.error;
    for (const row of slice) if (row.source_id) skipped.push(row.source_id);
    process.stderr.write(`\n  insert SKIPPED ${slice.length} row(s) at offset ${i} (failed at floor chunk ${chunk}): ${r.error}\n`);
    i += slice.length; sinceGrow = 0; chunk = MIN_CHUNK;   // stay small after a floor failure
    continue;
  }
  inserted += slice.length; i += slice.length;
  // Ease the size back up after sustained success so a one-off heavy chunk doesn't pin us at the floor.
  if (chunk < BASE_CHUNK && ++sinceGrow >= 5) { chunk = Math.min(BASE_CHUNK, chunk * 2); sinceGrow = 0; }
}
if (skipped.length) {
  console.error(`insert: ${skipped.length} row(s) SKIPPED across ${Math.ceil(skipped.length / MIN_CHUNK)} floor-failed chunk(s); last error: ${insertError}`);
  console.error(`SKIPPED source_ids (first 50): ${skipped.slice(0, 50).join(",")}`);
  failedSources.push(`insert: ${skipped.length} row(s) skipped (statement timeout at floor chunk); re-run to recover`);
}

// Per-day YIELD of this run (what it added per day), informational only. Pipeline HEALTH is NOT
// judged here any more: a healthy delta that correctly finds nothing new would always trip a per-run
// floor. The authoritative, archive-based health check runs below (item 3).
const days = Object.keys(perDay).sort();
console.log(`\n=== ingest report (${DELTA ? "delta" : `${FROM}..${TO}`}) ===`);
for (const d of days) console.log(`  ${d}: ${perDay[d]}`);
// The AUTHORITATIVE OCD count is the client's per-run counter (every HTTP request, incl 429 retries),
// recorded to app_usage_events by _ocd (periodic every 100 + the final flush below). The descriptive
// events here carry 0 metered so the daily SUM is not double-counted.
const ocdHttp = getOcdRunMetered();
console.log(`upserted ${inserted} record(s) across ${days.length} day(s); OCD: ${ocdHttp} HTTP request(s) incl retries (${metered} page-fetches attempted).${dupSkipped ? ` ${dupSkipped} duplicate(s) rejected by the natural-key index.` : ""}${MAX_REQUESTS != null ? ` [--max-requests=${MAX_REQUESTS}]` : ""}`);
if (capReached) console.error(`::warning:: run stopped at the --max-requests cap (${MAX_REQUESTS}) after ${ocdHttp} OCD request(s); it is INCOMPLETE. Re-run (optionally with a higher --max-requests) to finish.`);
try {
  const { recordUsageEvent } = await import("../api/_usage.js");
  await recordUsageEvent({ event_type: "job_ingest", route: "scripts/ingest.js", status: "ok", oldcarsdata_metered_requests: 0, metadata: { job: "ingest", mode: DELTA ? "delta" : `${FROM}..${TO}`, days: days.length, upserted: inserted, ocd_http_requests: ocdHttp, page_fetches: metered } }, env.supabaseUrl, env.supabaseKey);
} catch (e) { /* never block ingest on logging */ }

// Item 3 health: judge each source by the ARCHIVE's own per-day totals, not by what THIS run added.
// The per-day yield above measures what a run added; a healthy delta that correctly finds nothing new
// would show zeros, so it cannot judge pipeline health. This does: for each processed source it reads
// the archive's last ~4 weeks of daily counts and flags any source sitting on >= ZERO_STREAK_MIN
// consecutive zero-sale days WHILE it normally sells (continuous sources only; monthly auction houses
// are not flagged for a quiet patch). Loud warning + a queryable ingest_health_zero_streak event.
const ZERO_STREAK_MIN = Number(flag("zero-streak") || process.env.INGEST_ZERO_STREAK_MIN || 3);
const asOfHealth = dayKey(new Date());
const healthSinceISO = recentDayList(asOfHealth, 29)[0];   // 28-day window + today, oldest first
const zeroStreaks = [];
for (const source of SOURCES) {
  const label = DISPLAY[source] || source;
  const daily = await archiveDailyCounts(source, healthSinceISO);
  const z = zeroStreakFlag(daily, { asOf: asOfHealth, window: 14, minRun: ZERO_STREAK_MIN, salesWindow: 28 });
  if (z) zeroStreaks.push({ source, label, zeroRun: z.zeroRun, endedOn: z.endedOn });
}
if (zeroStreaks.length) {
  console.error(`::warning::INGEST HEALTH: ${zeroStreaks.length} normally-selling source(s) on a >=${ZERO_STREAK_MIN}-day zero-sale streak (archive-based): ${zeroStreaks.map(z => `${z.label} (${z.zeroRun}d, last gap day ${z.endedOn})`).join(", ")}`);
  try {
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({ event_type: "ingest_health_zero_streak", route: "scripts/ingest.js", status: "warning", oldcarsdata_metered_requests: 0, metadata: { zeroStreaks, minRun: ZERO_STREAK_MIN, mode: DELTA ? "delta" : `${FROM}..${TO}` } }, env.supabaseUrl, env.supabaseKey);
  } catch (e) { /* never block ingest on logging */ }
} else {
  console.log(`health: no normally-selling source on a >=${ZERO_STREAK_MIN}-day zero-sale streak (archive-based).`);
}

await flushOcdUsage();   // write the tail of this run's OCD usage (the every-100 rows already cover a crash/timeout)
console.log(capReached ? "\nDONE (INCOMPLETE: --max-requests cap reached; see warning above)." : (zeroStreaks.length ? "\nDONE (with health warnings above)." : "\nDONE."));

// Fail loud, per source: any source that ended in an UNRESOLVED error (429 still failing
// after all retries, or a non-429 error, or an insert failure) reds the run so a partial
// or empty backfill can never report green again. A source that recovered via retry after
// a 429 is NOT here, so a healthy paced run still exits 0.
if (failedSources.length) {
  console.error(`\n::error::INGEST FAILED: ${failedSources.length} source(s)/step(s) ended in an unresolved error:`);
  for (const f of failedSources) console.error(`  - ${f}`);
  process.exit(1);
}
