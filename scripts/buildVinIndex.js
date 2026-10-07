// VIN index builder (Fix 5, Lane A). Rebuilds vin_index (one row per appearance) and vin_summary
// (one row per vin_norm) from sales_archive (sold) + auction_attempts (not_sold/withdrawn), using the
// SAME normalisation as findVinArchiveMatch (strip non-alphanumeric, uppercase - sales_archive.vin_norm
// and auction_attempts.chassis_vin_norm are already generated that way). It EXCLUDES only actual
// non_vehicle rows and any VIN seen on more than one UNRELATED lot (inconsistent make/model = a
// shared/polluted VIN); a make-Unknown car IS kept (VIN exact-match must never be filtered by make).
//
// The core is exported as buildVinIndex(env, {reportOnly}) so BOTH the CLI and the ops endpoint
// (api/usageDashboard task=buildvinindex, DB-only, no OCD) run ONE source of truth. CLI:
//   node scripts/buildVinIndex.js            # full rebuild + print the appearance distribution
//   node scripts/buildVinIndex.js --report   # distribution only, no writes
// Schedule nightly AFTER the ingest + non-sold jobs (so it reflects the freshest sales/attempts).
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { typeByMake } from "../lib/_unknownClassify.js";

const normVin = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toNum = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const day = d => (d ? String(d).slice(0, 10) : null);
const isUnknown = s => !s || /^unknown$/i.test(String(s).trim());

// Uncapped paginator: lib/_supabase.js supabaseSelectAll stops at a 200k-row safety ceiling (fine for
// engine pools, but it TRUNCATED the ~305k sales_archive read and undersized the VIN index). This walks
// every page via Range until a short page, with no ceiling. Returns all rows (what it read on a mid-walk
// failure, same graceful degrade as the shared helper).
async function readAll(env, pathAndQuery, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    let page = null;
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
        headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Range-Unit": "items", Range: `${offset}-${offset + pageSize - 1}` }
      });
      if (!res.ok) break;
      page = await res.json();
    } catch { break; }
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

// ---- gather appearances ----
async function loadSales(env) {
  const sel = "source_id,vin_norm,sale_date,source_slug,make,model,model_family,vehicle_type,year,mileage,sale_price_usd," +
    "currency:raw_record->>currency,url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,country:raw_record->>country,title:listing_title";
  // Exclude ONLY actual non_vehicle rows. `vehicle_type=not.eq.non_vehicle` drops NULL rows too (SQL
  // NULL <> x is unknown), which would filter make-Unknown cars out of the VIN index - a VIN exact-match
  // must never be filtered by vehicle_type or make. Keep null / car / motorcycle / other.
  const rows = await readAll(env, `sales_archive?vin_norm=not.is.null&or=(vehicle_type.is.null,vehicle_type.neq.non_vehicle)&select=${sel}&order=sale_date.asc.nullslast`);
  return rows.map(r => ({
    vin: normVin(r.vin_norm), date: day(r.sale_date), source: r.source_slug || null, url: r.url || r.surl || null,
    title: r.title || null, make: r.make || null, model: r.model || null, model_family: r.model_family || null,
    vehicle_type: r.vehicle_type || typeByMake(r.make) || null, year: toInt(r.year), mileage: toInt(r.mileage),
    result: "sold", price_usd: toNum(r.sale_price_usd), currency: r.currency || null, country: r.country || null,
    photo_url: r.photo || null, src_table: "sales_archive", src_row_id: String(r.source_id || "")
  }));
}
async function loadAttempts(env) {
  // auction_attempts has NO id column (PK = source_slug + source_record_id). The attempt's bid in USD
  // is high_bid_usd (backfilled), carried as price_usd so vinAppearances renders "bid to $X, not sold".
  const sel = "source_slug,source_record_id,chassis_vin_norm,attempt_date,make,model,year,high_bid,high_bid_usd,auction_status,currency," +
    "url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,title:raw_record->>title";
  const rows = await readAll(env, `auction_attempts?chassis_vin_norm=not.is.null&select=${sel}&order=attempt_date.asc.nullslast`);
  return rows.map(r => {
    const st = String(r.auction_status || "").toLowerCase();
    const result = /withdraw/.test(st) ? "withdrawn" : "not_sold";
    return {
      vin: normVin(r.chassis_vin_norm), date: day(r.attempt_date), source: r.source_slug || null, url: r.url || r.surl || null,
      title: r.title || null, make: r.make || null, model: r.model || null, model_family: null,
      vehicle_type: typeByMake(r.make) || null, year: toInt(r.year), mileage: null,
      result, price_usd: toNum(r.high_bid_usd), currency: r.currency || null, country: null,
      photo_url: r.photo || null, src_table: "auction_attempts", src_row_id: String(r.source_record_id || "")
    };
  });
}

// Pollution key = MAKE only. A VIN is polluted (shared across UNRELATED lots) only when its MAKE
// differs; the SAME car is often listed with different model wording (a 2003 BMW M5 filed as both
// "M5" and "5-Series"), which must NOT split or drop it. Genuinely shared VINs (BMW on one lot,
// Ferrari on another) still differ by make and are dropped.
function identity(a) { return isUnknown(a.make) ? "" : a.make.toLowerCase().trim(); }

async function deleteAll(env, H, table) {
  // Rebuild: clear the derived table (vin_index has a numeric id; vin_summary keys on vin_norm).
  const key = table === "vin_index" ? "id=gt.0" : "vin_norm=not.is.null";
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${table}?${key}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  if (!r.ok && r.status !== 404) console.error(`clear ${table} -> ${r.status}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
}

// Core: one source of truth for the CLI and the ops endpoint. Returns a stats object (never process.exit).
export async function buildVinIndex(env, { reportOnly = false } = {}) {
  const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  const [sales, attempts] = [await loadSales(env), await loadAttempts(env)];
  const all = [...sales, ...attempts].filter(a => a.vin && a.vin.length >= 6);
  const byVin = new Map();
  for (const a of all) { if (!byVin.has(a.vin)) byVin.set(a.vin, []); byVin.get(a.vin).push(a); }
  let polluted = 0;
  const keptVins = [];
  for (const [vin, apps] of byVin) {
    const idents = new Set(apps.map(identity).filter(id => id !== "|"));
    if (idents.size > 1) { polluted++; continue; }          // shared/polluted VIN across unrelated lots
    // idents.size === 0 (all appearances make-Unknown) is KEPT: a VIN exact-match must resolve a
    // make-Unknown car too. make/model are written null for it; only genuinely polluted VINs drop.
    keptVins.push(vin);
  }
  const counts = keptVins.map(v => byVin.get(v).length);
  const d1 = counts.filter(n => n === 1).length, d2 = counts.filter(n => n >= 2).length, d3 = counts.filter(n => n >= 3).length;
  const top10 = keptVins.map(v => ({ vin: v, n: byVin.get(v).length, car: (byVin.get(v).find(a => !isUnknown(a.make)) || {}) }))
    .sort((a, b) => b.n - a.n).slice(0, 10).map(t => ({ vin: t.vin, appearances: t.n, car: [t.car.year, t.car.make, t.car.model].filter(Boolean).join(" ") }));
  const stats = { appearances: all.length, distinctVins: byVin.size, polluted, keptVins: keptVins.length, dist: { exactly_1: d1, two_plus: d2, three_plus: d3 }, top10 };
  if (reportOnly) return { ...stats, wrote: false };

  // ---- SHRINK GUARD: never overwrite the live tables with a short build ----
  // A truncated read (e.g. a serverless function timing out mid-walk) would otherwise delete the good
  // tables and replace them with a partial set. Count the existing vin_index rows first; if the new
  // build is under 95% of them, refuse to overwrite - log the counts and THROW so the nightly fails
  // loudly (CLI exits non-zero). The first build (existing 0) is always allowed.
  const idxRows = [];
  for (const v of keptVins) for (const a of byVin.get(v)) idxRows.push({
    vin_norm: v, appearance_date: a.date, source: a.source, url: a.url, listing_title: a.title,
    make: isUnknown(a.make) ? null : a.make, model: isUnknown(a.model) ? null : a.model, model_family: a.model_family,
    vehicle_type: a.vehicle_type, year: a.year, mileage: a.mileage, result: a.result,
    price_usd: a.price_usd, currency: a.currency, country: a.country, photo_url: a.photo_url,
    src_table: a.src_table, src_row_id: a.src_row_id
  });
  let existingIdx = 0;
  try { const cr = await fetch(`${env.supabaseUrl}/rest/v1/vin_index?select=id&limit=1`, { headers: { ...H, Prefer: "count=exact" } }); const m = /\/(\d+)$/.exec(cr.headers.get("content-range") || ""); existingIdx = m ? Number(m[1]) : 0; } catch { existingIdx = 0; }
  if (existingIdx > 0 && idxRows.length < 0.95 * existingIdx) {
    const msg = `VIN index shrink guard: new build ${idxRows.length} appearance rows < 95% of existing ${existingIdx} (read likely truncated). Refusing to overwrite; tables left intact.`;
    console.error(msg);
    throw new Error(msg);
  }

  // ---- write vin_index (per appearance) ----
  await deleteAll(env, H, "vin_index");
  let ins = 0, insErr = 0;
  for (let i = 0; i < idxRows.length; i += 500) { const r = await supabaseInsert("vin_index", idxRows.slice(i, i + 500), env.supabaseUrl, env.supabaseKey); if (!r.error) ins += Math.min(500, idxRows.length - i); else { insErr++; console.error("vin_index insert error:", r.error); } }

  // ---- write vin_summary (per vin) ----
  await deleteAll(env, H, "vin_summary");
  const today = new Date();
  const sumRows = keptVins.map(v => {
    const apps = byVin.get(v).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const dates = apps.map(a => a.date).filter(Boolean);
    const sold = apps.filter(a => a.result === "sold");
    const lastSold = sold.length ? sold[sold.length - 1] : null;
    const mostRecent = apps[apps.length - 1];
    const id = apps.find(a => !isUnknown(a.make)) || {};
    const milesDelta = (lastSold && mostRecent && lastSold !== mostRecent && mostRecent.mileage != null && lastSold.mileage != null && String(mostRecent.date) >= String(lastSold.date)) ? (mostRecent.mileage - lastSold.mileage) : null;
    const daysSince = lastSold && lastSold.date ? Math.round((today - new Date(lastSold.date + "T00:00:00Z")) / 86400000) : null;
    return {
      vin_norm: v, appearances: apps.length, first_seen: dates[0] || null, last_seen: dates[dates.length - 1] || null,
      last_sold_price_usd: lastSold ? lastSold.price_usd : null, last_sold_date: lastSold ? lastSold.date : null,
      miles_delta_since_last_sale: milesDelta, days_since_last_sale: daysSince,
      make: isUnknown(id.make) ? null : id.make, model: isUnknown(id.model) ? null : id.model,
      model_family: id.model_family || null, vehicle_type: id.vehicle_type || mostRecent.vehicle_type || null
    };
  });
  let sins = 0, sumErr = 0;
  for (let i = 0; i < sumRows.length; i += 500) { const r = await supabaseInsert("vin_summary", sumRows.slice(i, i + 500), env.supabaseUrl, env.supabaseKey); if (!r.error) sins += Math.min(500, sumRows.length - i); else { sumErr++; console.error("vin_summary insert error:", r.error); } }

  return { ...stats, wrote: true, vin_index_written: ins, vin_summary_written: sins, insertErrors: insErr + sumErr };
}

// CLI entry (only when run directly, not on import by the ops endpoint).
if (process.argv[1] && /buildVinIndex\.js$/.test(process.argv[1])) {
  const env = supabaseEnv();
  if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
  buildVinIndex(env, { reportOnly: process.argv.slice(2).includes("--report") }).then(s => {
    console.log(`VIN index: ${s.appearances} appearances across ${s.distinctVins} VINs; ${s.polluted} polluted dropped; ${s.keptVins} kept.`);
    console.log(`Appearances: 1 -> ${s.dist.exactly_1} | 2+ -> ${s.dist.two_plus} | 3+ -> ${s.dist.three_plus}`);
    console.log("10 most-seen:"); for (const t of s.top10) console.log(`  ${t.vin}  x${t.appearances}  ${t.car}`);
    if (s.wrote) console.log(`\nWrote vin_index ${s.vin_index_written}, vin_summary ${s.vin_summary_written}, insertErrors ${s.insertErrors}. DONE.`);
    process.exit(0);
  }).catch(e => { console.error("buildVinIndex failed:", e && e.message); process.exit(1); });
}
