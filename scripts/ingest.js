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

const DISPLAY = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty", pcarmarket: "PCARMarket", acc: "All Collector Cars", gooding: "Gooding & Co", rmsothebys: "RM Sotheby's" };
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

function toFullRow(r, label) {
  const d = toDate(r.auction_end_date);
  return {
    source_id: String(r.id ?? ""), sale_date: dayKey(d), platform: label,
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
  for (let p = 1; p <= 2000; p++) {
    metered++;
    let res;
    try { res = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: p, limit: 50 }, apiKey); }
    catch (e) { console.error(`\n${label} p${p} error: ${e.message}`); break; }
    const rows = res.data || [];
    if (!rows.length) break;
    let oldest = null, pageAllKnown = DELTA;
    for (const r of rows) {
      const d = toDate(r.auction_end_date);
      if (d && (!oldest || d < oldest)) oldest = d;
      const id = String(r.id ?? "");
      if (DELTA) {
        if (held.has(id)) continue;      // already held: skip
        pageAllKnown = false;            // a new record on this page
        kept.push(toFullRow(r, label));
        if (d) perDay[dayKey(d)] = (perDay[dayKey(d)] || 0) + 1;
      } else if (inRange(d)) {
        kept.push(toFullRow(r, label));
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
  console.log(`${label}: ${kept.length - before} record(s) this source.`);
}

// Dedupe by source_id and upsert.
const uniq = [...new Map(kept.filter(r => r.source_id).map(r => [r.source_id, r])).values()];
let inserted = 0;
for (let i = 0; i < uniq.length; i += 250) {
  const r = await supabaseInsert("sales_archive", uniq.slice(i, i + 250), env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id");
  if (r.error) { console.error("insert error:", r.error); break; }
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
