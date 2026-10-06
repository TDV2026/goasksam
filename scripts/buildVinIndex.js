// VIN index builder (Fix 5, Lane A). Rebuilds vin_index (one row per appearance) and vin_summary
// (one row per vin_norm) from sales_archive (sold) + auction_attempts (not_sold/withdrawn), using the
// SAME normalisation as findVinArchiveMatch (strip non-alphanumeric, uppercase - sales_archive.vin_norm
// and auction_attempts.chassis_vin_norm are already generated that way). It EXCLUDES non_vehicle rows
// and any VIN seen on more than one UNRELATED lot (inconsistent make/model = a shared/polluted VIN),
// while keeping a VIN on multiple lots of the SAME car (real repeat sales).
//
// Run (GitHub Actions, like ingest; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/buildVinIndex.js            # full rebuild + print the appearance distribution
//   node scripts/buildVinIndex.js --report   # distribution only, no writes
// Schedule nightly AFTER the ingest + non-sold jobs (so it reflects the freshest sales/attempts).
import { supabaseEnv, supabaseSelectAll, supabaseInsert } from "../lib/_supabase.js";
import { typeByMake } from "../lib/_unknownClassify.js";

const args = process.argv.slice(2);
const REPORT_ONLY = args.includes("--report");
const env = supabaseEnv();
if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };

const normVin = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toNum = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const day = d => (d ? String(d).slice(0, 10) : null);
const isUnknown = s => !s || /^unknown$/i.test(String(s).trim());

// ---- gather appearances ----
async function loadSales() {
  const sel = "source_id,vin_norm,sale_date,source_slug,make,model,model_family,vehicle_type,year,mileage,sale_price_usd," +
    "currency:raw_record->>currency,url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,country:raw_record->>country,title:listing_title";
  // Exclude ONLY actual non_vehicle rows. `vehicle_type=not.eq.non_vehicle` drops NULL rows too (SQL
  // NULL <> x is unknown), which would filter make-Unknown cars out of the VIN index - a VIN exact-match
  // must never be filtered by vehicle_type or make. Keep null / car / motorcycle / other.
  const rows = await supabaseSelectAll(env, `sales_archive?vin_norm=not.is.null&or=(vehicle_type.is.null,vehicle_type.neq.non_vehicle)&select=${sel}&order=sale_date.asc.nullslast`) || [];
  return rows.map(r => ({
    vin: normVin(r.vin_norm), date: day(r.sale_date), source: r.source_slug || null, url: r.url || r.surl || null,
    title: r.title || null, make: r.make || null, model: r.model || null, model_family: r.model_family || null,
    vehicle_type: r.vehicle_type || typeByMake(r.make) || null, year: toInt(r.year), mileage: toInt(r.mileage),
    result: "sold", price_usd: toNum(r.sale_price_usd), currency: r.currency || null, country: r.country || null,
    photo_url: r.photo || null, src_table: "sales_archive", src_row_id: String(r.source_id || "")
  }));
}
async function loadAttempts() {
  const sel = "id,chassis_vin_norm,attempt_date,source_slug,make,model,year,high_bid,auction_status," +
    "url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,title:raw_record->>title";
  const rows = await supabaseSelectAll(env, `auction_attempts?chassis_vin_norm=not.is.null&select=${sel}&order=attempt_date.asc.nullslast`) || [];
  return rows.map(r => {
    const st = String(r.auction_status || "").toLowerCase();
    const result = /withdraw/.test(st) ? "withdrawn" : "not_sold";
    return {
      vin: normVin(r.chassis_vin_norm), date: day(r.attempt_date), source: r.source_slug || null, url: r.url || r.surl || null,
      title: r.title || null, make: r.make || null, model: r.model || null, model_family: null,
      vehicle_type: typeByMake(r.make) || null, year: toInt(r.year), mileage: null,
      result, price_usd: null, currency: null, country: null,   // unsold: no sale price
      photo_url: r.photo || null, src_table: "auction_attempts", src_row_id: String(r.id || "")
    };
  });
}

function identity(a) { return (isUnknown(a.make) ? "" : a.make.toLowerCase().trim()) + "|" + (isUnknown(a.model) ? "" : a.model.toLowerCase().trim()); }

async function deleteAll(table) {
  // Rebuild: clear the derived table (vin_index has a numeric id; vin_summary keys on vin_norm).
  const key = table === "vin_index" ? "id=gt.0" : "vin_norm=not.is.null";
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${table}?${key}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  if (!r.ok && r.status !== 404) console.error(`clear ${table} -> ${r.status}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
}

(async () => {
  const [sales, attempts] = [await loadSales(), await loadAttempts()];
  const all = [...sales, ...attempts].filter(a => a.vin && a.vin.length >= 6);
  // Group by vin; drop polluted vins (more than one distinct NON-Unknown identity = unrelated lots).
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
  // Appearance distribution (report) over KEPT vins.
  const counts = keptVins.map(v => byVin.get(v).length);
  const d1 = counts.filter(n => n === 1).length, d2 = counts.filter(n => n >= 2).length, d3 = counts.filter(n => n >= 3).length;
  const top10 = keptVins.map(v => ({ vin: v, n: byVin.get(v).length, car: (byVin.get(v).find(a => !isUnknown(a.make)) || {}) }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
  console.log(`VIN index: ${all.length} appearances across ${byVin.size} VINs; ${polluted} polluted (multi-identity) dropped; ${keptVins.length} VINs kept.`);
  console.log(`Appearances: 1 -> ${d1} VINs | 2+ -> ${d2} VINs | 3+ -> ${d3} VINs`);
  console.log("10 most-seen VINs:");
  for (const t of top10) console.log(`  ${t.vin}  x${t.n}  ${[t.car.year, t.car.make, t.car.model].filter(Boolean).join(" ")}`);
  if (REPORT_ONLY) { console.log("\n--report: no writes."); process.exit(0); }

  // ---- write vin_index (per appearance) ----
  await deleteAll("vin_index");
  const idxRows = [];
  for (const v of keptVins) for (const a of byVin.get(v)) idxRows.push({
    vin_norm: v, appearance_date: a.date, source: a.source, url: a.url, listing_title: a.title,
    make: isUnknown(a.make) ? null : a.make, model: isUnknown(a.model) ? null : a.model, model_family: a.model_family,
    vehicle_type: a.vehicle_type, year: a.year, mileage: a.mileage, result: a.result,
    price_usd: a.price_usd, currency: a.currency, country: a.country, photo_url: a.photo_url,
    src_table: a.src_table, src_row_id: a.src_row_id
  });
  let ins = 0;
  for (let i = 0; i < idxRows.length; i += 500) { const r = await supabaseInsert("vin_index", idxRows.slice(i, i + 500), env.supabaseUrl, env.supabaseKey); if (!r.error) ins += Math.min(500, idxRows.length - i); else console.error("vin_index insert error:", r.error); }

  // ---- write vin_summary (per vin) ----
  await deleteAll("vin_summary");
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
  let sins = 0;
  for (let i = 0; i < sumRows.length; i += 500) { const r = await supabaseInsert("vin_summary", sumRows.slice(i, i + 500), env.supabaseUrl, env.supabaseKey); if (!r.error) sins += Math.min(500, sumRows.length - i); else console.error("vin_summary insert error:", r.error); }

  console.log(`\nWrote vin_index: ${ins}/${idxRows.length} appearance rows; vin_summary: ${sins}/${sumRows.length} VIN rows.`);
  console.log("DONE.");
})().catch(e => { console.error("buildVinIndex failed:", e && e.message); process.exit(1); });
