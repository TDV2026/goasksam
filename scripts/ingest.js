// Date-parameterised sales_archive ingest (7D). Replaces the June-hardcoded
// juneReport.js. Targets any day or range, or runs a nightly delta.
//
// Modes:
//   node scripts/ingest.js --date=2026-07-15          one day
//   node scripts/ingest.js --from=2026-07-01 --to=2026-07-29   a range (backfill)
//   node scripts/ingest.js --delta                    nightly: fetch newest, STOP
//                                                      at the first record already held
//   flags: --sources=bringatrailer,carsandbids,...  (default: all tracked)
//          --floor=30   per-day health floor (or env INGEST_DAILY_FLOOR)
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLDCARSDATA_API_KEY (GitHub
// Actions provides them as secrets; secrets are not pullable to a laptop).
import { callOldCarsData } from "../lib/_ocd.js";
import { supabaseEnv, supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { isPartsListing } from "../lib/_classify.js";

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
const ALL_SOURCES = Object.keys(DISPLAY);

const args = process.argv.slice(2);
const flag = name => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const has = name => args.includes(`--${name}`);
const DATE = flag("date");
const FROM = flag("from") || DATE;
const TO = flag("to") || DATE;
const DELTA = has("delta") || (!FROM && !TO);
const SOURCES = (flag("sources") ? flag("sources").split(",") : ALL_SOURCES).map(s => s.trim()).filter(Boolean);
const FLOOR = Number(flag("floor") || process.env.INGEST_DAILY_FLOOR || 30);

const env = supabaseEnv();
const apiKey = process.env.OLDCARSDATA_API_KEY;
if (!env || !apiKey) { console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OLDCARSDATA_API_KEY."); process.exit(1); }

const toMoney = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
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

function toFullRow(r, label, source) {
  const d = toDate(r.auction_end_date);
  return {
    source_id: String(r.id ?? ""), sale_date: dayKey(d), platform: label, source_slug: source,
    make: (r.ocd_make_name || r.listing_make || "Unknown").toString().trim(),
    model: (r.ocd_model_name || r.listing_model || "Unknown").toString().trim(),
    sale_price: toMoney(r.price), month: d ? d.toISOString().slice(0, 7) : null, raw_record: r,
    year: toInt(r.year), mileage: toInt(r.mileage), body_style: r.body_style ?? null,
    title_status: r.title_status ?? null, vin: r.vin ?? null, transmission: r.transmission ?? null,
    drivetrain: r.drivetrain ?? null, exterior_color: r.exterior_color ?? null, interior_color: r.interior_color ?? null,
    seller_type: r.seller_type ?? null, listing_title: r.title ?? null, description: r.description ?? null,
    has_reserve: toBool(r.has_reserve), views: toInt(r.stats?.views), bids: toInt(r.stats?.bids),
    known_flaws: r.known_flaws ?? null, recent_service_history: r.recent_service_history ?? null, modifications: r.modifications ?? null
  };
}

// Delta mode: the newest source_ids we already hold, so we can stop paginating
// the moment a page is fully known.
async function heldIds(source, label) {
  const rows = await supabaseSelect(env, `sales_archive?platform=eq.${encodeURIComponent(label)}&select=source_id&order=sale_date.desc&limit=2000`);
  return new Set((rows || []).map(r => String(r.source_id)));
}

let metered = 0;
const perDay = {};
const kept = [];
const failedSources = [];   // sources that ended in an UNRESOLVED error -> red the run at exit
const inRange = d => {
  if (!d) return false;
  const k = dayKey(d);
  if (FROM && k < FROM) return false;
  if (TO && k > TO) return false;
  return true;
};

for (const source of SOURCES) {
  const label = DISPLAY[source] || source;
  const held = DELTA ? await heldIds(source, label) : null;
  const before = kept.length;
  let partsSkipped = 0, marketplaceSkipped = 0, unpricedSkipped = 0, sourceError = null;
  // PCarMarket "MarketPlace:" rows are fixed-price CLASSIFIEDS (asking price / for-sale), not
  // completed auctions, so they carry an asking/scheduled date (some future-dated) and must never
  // enter this completed-sales-only archive. Verified Sep 2026: 4 such rows had leaked in.
  const isMarketplace = t => /^\s*marketplace:/i.test(String(t || ""));
  // PistonHeads is a CLASSIFIEDS marketplace: ~22% of its "sold" rows carry no hammer price
  // (asking-price / ended-unsold listings). A completed-sales-only archive needs a real sale
  // price, so screen unpriced rows for PistonHeads at ingest (verified Sep 2026: 33/150).
  const isUnpriced = r => !(Number(String(r.price ?? "").replace(/[^0-9.]/g, "")) > 0);
  for (let p = 1; p <= 2000; p++) {
    metered++;
    let res;
    try { res = await ocdFetch({ source, status: "sold", sort: "date", direction: "desc", page: p, limit: 50 }); }
    catch (e) { console.error(`\n${label} p${p} FAILED after retries: ${e.message}`); sourceError = `p${p}: ${e.message}`; break; }
    const rows = res.data || [];
    if (!rows.length) break;
    let oldest = null, pageAllKnown = DELTA;
    for (const r of rows) {
      const d = toDate(r.auction_end_date);
      if (d && (!oldest || d < oldest)) oldest = d;
      const id = String(r.id ?? "");
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
    // Stop conditions: delta -> a fully-known page (we have caught up); range ->
    // paged past the window (oldest older than FROM).
    if (DELTA && pageAllKnown) break;
    if (!DELTA && FROM && oldest && dayKey(oldest) < FROM) break;
    if (p >= (res.meta?.total_pages || 1)) break;
  }
  process.stderr.write("\n");
  console.log(`${label}: ${kept.length - before} record(s) this source${partsSkipped ? ` (${partsSkipped} parts/automobilia skipped)` : ""}${marketplaceSkipped ? ` (${marketplaceSkipped} marketplace/asking-price skipped)` : ""}${unpricedSkipped ? ` (${unpricedSkipped} unpriced/classified skipped)` : ""}${sourceError ? `  [UNRESOLVED ERROR: ${sourceError}]` : ""}.`);
  if (sourceError) failedSources.push(`${label} (${sourceError})`);
}

// Dedupe by source_id and upsert.
const uniq = [...new Map(kept.filter(r => r.source_id).map(r => [r.source_id, r])).values()];
let inserted = 0;
for (let i = 0; i < uniq.length; i += 250) {
  const r = await supabaseInsert("sales_archive", uniq.slice(i, i + 250), env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id");
  if (r.error) { console.error("insert error:", r.error); failedSources.push(`insert: ${r.error}`); break; }
  inserted += uniq.slice(i, i + 250).length;
}

// 7D.4 health check: any targeted day below the floor is surfaced loudly and
// logged to app_usage_events, never silent.
const days = Object.keys(perDay).sort();
console.log(`\n=== ingest report (${DELTA ? "delta" : `${FROM}..${TO}`}) ===`);
const belowFloor = [];
for (const d of days) {
  const n = perDay[d];
  const flagged = n < FLOOR;
  if (flagged) belowFloor.push({ day: d, count: n });
  console.log(`  ${d}: ${n}${flagged ? `  BELOW FLOOR (${FLOOR})` : ""}`);
}
console.log(`upserted ${inserted} record(s) across ${days.length} day(s); metered ${metered} OCD request(s).`);
if (belowFloor.length) {
  console.error(`INGEST HEALTH: ${belowFloor.length} day(s) below the ${FLOOR}/day floor: ${belowFloor.map(b => `${b.day}(${b.count})`).join(", ")}`);
  // Best-effort visible record; import lazily so a missing table never breaks ingest.
  try {
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({ event_type: "ingest_health_below_floor", route: "scripts/ingest.js", status: "warning", oldcarsdata_metered_requests: metered, metadata: { belowFloor, floor: FLOOR, mode: DELTA ? "delta" : `${FROM}..${TO}` } }, env.supabaseUrl, env.supabaseKey);
  } catch (e) { /* never block ingest on logging */ }
}
console.log(belowFloor.length ? "\nDONE (with health warnings above)." : "\nDONE.");

// Fail loud, per source: any source that ended in an UNRESOLVED error (429 still failing
// after all retries, or a non-429 error, or an insert failure) reds the run so a partial
// or empty backfill can never report green again. A source that recovered via retry after
// a 429 is NOT here, so a healthy paced run still exits 0.
if (failedSources.length) {
  console.error(`\n::error::INGEST FAILED: ${failedSources.length} source(s)/step(s) ended in an unresolved error:`);
  for (const f of failedSources) console.error(`  - ${f}`);
  process.exit(1);
}
