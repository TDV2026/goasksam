// June 2026 sales report from OldCarsData (Cars & Bids + Bring a Trailer),
// cached in Supabase with the FULL source record (raw_record jsonb + promoted
// typed columns). Pulled from the metered API only once.
//
// Principle: never store partial data. Every /auctions record is kept whole in
// raw_record; high-value fields are promoted for fast querying. See
// docs/supabase-sales-archive-v2.sql for the schema.
//
// Flow: check Supabase for month 2026-06.
//   - full cache hit (rows carry raw_record) -> report from Supabase, 0 requests
//   - empty OR old-schema rows (raw_record null) -> pull once, replace, backfill
//
// Usage (keys are sensitive; run where you have them):
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. OLDCARSDATA_API_KEY=.. node scripts/juneReport.js
//   ... node scripts/juneReport.js --refresh    # force re-pull + replace
//   OLDCARSDATA_API_KEY=.. node scripts/juneReport.js --probe    # cheap API check
//   OLDCARSDATA_API_KEY=.. node scripts/juneReport.js --export    # raw -> JSON+CSV, no Supabase

import { callOldCarsData } from "../lib/_ocd.js";
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const PROBE = has("--probe");
const REFRESH = has("--refresh");
const EXPORT = has("--export");
const EXPORT_PATH = opt("--export") && !opt("--export").startsWith("--") ? opt("--export") : "june-2026-sales";
const MAX_PAGES = Number(opt("--max-pages")) || 250;
const LIMIT = 50;

const MONTH_KEY = "2026-06";
const MONTH = { year: 2026, month: 6 };
const PLATFORMS = { carsandbids: "Cars & Bids", bringatrailer: "Bring a Trailer" };

const normKey = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const usd = n => n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`;
const toMoney = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toBool = v => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const inMonth = d => d && d.getUTCFullYear() === MONTH.year && d.getUTCMonth() + 1 === MONTH.month;
const ymd = d => d.toISOString().slice(0, 10);

// Normalized record for the report, carrying the full raw record for storage.
function fromApi(r) {
  const key = normKey(r.platform || r.source || r.auction_platform || r.listing_source);
  const d = toDate(r.auction_end_date || r.sold_date || r.end_date || r.date);
  return {
    sourceId: String(r.id ?? r.source_record_id ?? ""),
    date: d, saleDate: d ? ymd(d) : null,
    platformKey: key, platformLabel: PLATFORMS[key] || key,
    make: (r.ocd_make_name || r.listing_make || r.make || "Unknown").toString().trim(),
    model: (r.ocd_model_name || r.listing_model || r.model || "Unknown").toString().trim(),
    price: toMoney(r.price ?? r.sold_price ?? r.final_price ?? r.current_bid),
    raw: r
  };
}
function fromCache(row) {
  const key = normKey(row.platform);
  const d = toDate(row.sale_date);
  return {
    date: d, platformKey: key, platformLabel: PLATFORMS[key] || row.platform,
    make: (row.make || "Unknown").trim(), model: (row.model || "Unknown").trim(), price: toMoney(row.sale_price)
  };
}

// Full DB row: promoted typed columns + the entire original record in raw_record.
function toFullRow(rec) {
  const r = rec.raw || {};
  return {
    source_id: rec.sourceId, sale_date: rec.saleDate, platform: rec.platformLabel,
    make: rec.make, model: rec.model, sale_price: rec.price, month: MONTH_KEY,
    raw_record: r,
    year: toInt(r.year), mileage: toInt(r.mileage),
    body_style: r.body_style ?? null, title_status: r.title_status ?? null, vin: r.vin ?? null,
    transmission: r.transmission ?? null, drivetrain: r.drivetrain ?? null,
    exterior_color: r.exterior_color ?? null, interior_color: r.interior_color ?? null,
    seller_type: r.seller_type ?? null, listing_title: r.title ?? null, description: r.description ?? null,
    has_reserve: toBool(r.has_reserve),
    views: toInt(r.stats?.views), bids: toInt(r.stats?.bids),
    known_flaws: r.known_flaws ?? null, recent_service_history: r.recent_service_history ?? null,
    modifications: r.modifications ?? null
  };
}

let metered = 0;
async function page(params, p) {
  metered++;
  return callOldCarsData("/auctions", { status: "sold", sort: "date", direction: "desc", page: p, limit: LIMIT, ...params }, process.env.OLDCARSDATA_API_KEY);
}

async function probe() {
  if (!process.env.OLDCARSDATA_API_KEY) { console.error("Missing OLDCARSDATA_API_KEY for --probe."); process.exit(1); }
  const a = await page({}, 1); const rows = a.data || [];
  console.log(`PROBE: records=${rows.length} total_pages=${a.meta?.total_pages ?? "?"} total=${a.meta?.total ?? "?"} | fields=${rows[0] ? Object.keys(rows[0]).length : 0}`);
  console.log(`Metered requests: ${metered}`);
}

async function pullMonth() {
  const june1 = new Date(Date.UTC(MONTH.year, MONTH.month - 1, 1));
  const kept = [];
  for (const source of Object.keys(PLATFORMS)) {
    for (let p = 1; p <= MAX_PAGES; p++) {
      const res = await page({ source }, p);
      const rows = res.data || [];
      if (!rows.length) break;
      let newest = null;
      for (const r of rows) {
        const rec = fromApi(r);
        if (rec.date && (!newest || rec.date > newest)) newest = rec.date;
        if (inMonth(rec.date) && rec.platformKey === source) kept.push(rec);
      }
      process.stderr.write(`\r${source} page ${p}/${res.meta?.total_pages ?? "?"} | kept ${kept.length} | reqs ${metered}   `);
      if (newest && newest < june1) break;
      if (p >= (res.meta?.total_pages || 1)) break;
    }
    process.stderr.write("\n");
  }
  return kept;
}

// Is the v2 schema present? true=yes, false=column missing (needs DDL), null=unreachable.
async function schemaReady(env) {
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?select=raw_record&limit=1`,
      { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (res.ok) return true;
    const t = await res.text();
    return /does not exist|column|schema cache/i.test(t) ? false : null;
  } catch { return null; }
}

async function readCache(env) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await supabaseSelect(env, `sales_archive?month=eq.${MONTH_KEY}&select=sale_date,platform,make,model,sale_price&order=sale_date.asc&limit=1000&offset=${offset}`);
    if (rows === null) return null;
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

async function hasStaleRows(env) {
  const rows = await supabaseSelect(env, `sales_archive?month=eq.${MONTH_KEY}&raw_record=is.null&select=source_id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function deleteMonth(env) {
  await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?month=eq.${MONTH_KEY}`, {
    method: "DELETE", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=minimal" }
  });
}

async function writeCache(env, records) {
  const rows = records.filter(r => r.sourceId).map(toFullRow);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const batch = rows.slice(i, i + 250);
    const res = await supabaseInsert("sales_archive", batch, env.supabaseUrl, env.supabaseKey,
      "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id");
    if (res.error) { console.error("\nSupabase insert error:", res.error); break; }
    inserted += batch.length;
    process.stderr.write(`\rupserted ${inserted}/${rows.length}   `);
  }
  process.stderr.write("\n");
  return inserted;
}

// Round-trip verification: read one stored row back and show the promoted fields.
async function printSample(env) {
  const rows = await supabaseSelect(env, `sales_archive?month=eq.${MONTH_KEY}&order=sale_price.desc&limit=1&select=year,make,model,mileage,title_status,seller_type,exterior_color,transmission,has_reserve,views,bids,sale_price,listing_title,description,raw_record`);
  if (!rows?.length) return;
  const r = rows[0];
  console.log("\nSAMPLE STORED ROW (verifies full schema):");
  for (const k of ["year", "make", "model", "mileage", "title_status", "seller_type", "exterior_color", "transmission", "has_reserve", "views", "bids", "sale_price", "listing_title"]) console.log(`  ${k}: ${r[k]}`);
  console.log(`  description: ${String(r.description || "").slice(0, 100)}…`);
  console.log(`  raw_record: ${r.raw_record ? `present (${Object.keys(r.raw_record).length} keys)` : "MISSING"}`);
}

function summarize(records) {
  const dates = records.map(r => r.date).filter(Boolean).sort((a, b) => a - b);
  console.log("\n" + "=".repeat(80));
  console.log(`DATE COVERAGE: ${dates[0] ? ymd(dates[0]) : "?"} .. ${dates.at(-1) ? ymd(dates.at(-1)) : "?"} (${records.length} June 2026 sales across the two platforms)`);
  console.log("=".repeat(80));
  const byPlatform = {}; for (const k of Object.keys(PLATFORMS)) byPlatform[k] = records.filter(r => r.platformKey === k);
  console.log("\nOVERALL METRICS (BY PLATFORM)\n");
  for (const [k, lab] of Object.entries(PLATFORMS)) {
    const rows = byPlatform[k]; const prices = rows.map(r => r.price).filter(Boolean);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    console.log(`${lab}:`);
    console.log(`  - Total cars sold (June 2026): ${rows.length}`);
    console.log(`  - Average sale price: ${usd(avg)}  (from ${prices.length} priced records)`);
    console.log(`  - Price range: ${usd(prices.length ? Math.min(...prices) : null)} / ${usd(prices.length ? Math.max(...prices) : null)}\n`);
  }
  console.log("=".repeat(80) + "\nTOP 5 MAKES/MODELS (BY VOLUME)\n" + "=".repeat(80));
  for (const [k, lab] of Object.entries(PLATFORMS)) {
    console.log(`\n${lab}:  Rank | Make | Model | Units | Avg`);
    const groups = {}; for (const r of byPlatform[k]) { const key = `${r.make}||${r.model}`; (groups[key] = groups[key] || []).push(r); }
    Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 5).forEach(([key, rows], i) => {
      const [mk, md] = key.split("||"); const prices = rows.map(r => r.price).filter(Boolean);
      const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
      console.log(`  ${i + 1}. | ${mk} | ${md} | ${rows.length} | ${usd(avg)}`);
    });
  }
  console.log("\n" + "=".repeat(80) + "\nPRICE BRACKET BREAKDOWN (both platforms combined)\n" + "=".repeat(80));
  const brackets = [["$0-5k", 0, 5000], ["$5-10k", 5000, 10000], ["$10-25k", 10000, 25000], ["$25-50k", 25000, 50000], ["$50-100k", 50000, 100000], ["$100k+", 100000, Infinity]];
  const priced = records.map(r => r.price).filter(Boolean);
  for (const [lab, lo, hi] of brackets) {
    const n = priced.filter(p => p >= lo && p < hi).length;
    console.log(`  ${lab.padEnd(9)} | ${String(n).padStart(4)} cars | ${(priced.length ? n / priced.length * 100 : 0).toFixed(1)}%`);
  }
  console.log(`  (based on ${priced.length} priced records of ${records.length} total)`);
}

async function exportFiles(records, base) {
  const { writeFileSync } = await import("node:fs");
  const rows = records.map(toFullRow);
  writeFileSync(`${base}.json`, JSON.stringify(rows, null, 0));
  const cols = ["source_id", "sale_date", "platform", "make", "model", "sale_price", "year", "mileage", "title_status", "seller_type", "month"];
  const esc = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  writeFileSync(`${base}.csv`, [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n"));
  console.log(`Exported ${rows.length} records to ${base}.json and ${base}.csv`);
}

// --- main ---
if (PROBE) { await probe(); process.exit(0); }

if (EXPORT) {
  if (!process.env.OLDCARSDATA_API_KEY) { console.error("Missing OLDCARSDATA_API_KEY for --export."); process.exit(1); }
  const fresh = await pullMonth();
  if (!fresh.length) { console.error("No June 2026 records pulled."); process.exit(1); }
  await exportFiles(fresh, EXPORT_PATH);
  console.log(`This run used ${metered} metered requests.`);
  process.exit(0);
}

const env = supabaseEnv();
if (!env) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --probe for an API-only check."); process.exit(1); }

const schema = await schemaReady(env);
if (schema === false) { console.error("sales_archive is missing the v2 columns (raw_record etc.). Apply docs/supabase-sales-archive-v2.sql in the SQL editor first. Aborting — no API spend."); process.exit(1); }
if (schema === null) { console.error("Could not reach Supabase. Aborting — no API spend."); process.exit(1); }

const stale = REFRESH ? false : await hasStaleRows(env);
if (!REFRESH && !stale) {
  const cached = await readCache(env);
  if (cached === null) { console.error("Could not reach Supabase (cache read). Aborting."); process.exit(1); }
  if (cached.length) {
    summarize(cached.map(fromCache));
    await printSample(env);
    console.log(`\n0 API requests (cached data). ${cached.length} full records from sales_archive.`);
    process.exit(0);
  }
}

// Empty, stale (old-schema), or --refresh: pull once and store full records.
if (!process.env.OLDCARSDATA_API_KEY) { console.error("Need a pull but no OLDCARSDATA_API_KEY."); process.exit(1); }
console.error(stale ? "Old-schema rows detected: re-pulling June with full records..." : REFRESH ? "Refreshing 2026-06..." : "Cache miss: pulling June...");
const fresh = await pullMonth();
if (!fresh.length) { console.error("No June 2026 records pulled. Run --probe to check the query shape."); process.exit(1); }
await deleteMonth(env);              // replace any old-schema/prior rows
const inserted = await writeCache(env, fresh);
summarize(fresh);
await printSample(env);
console.log(`\n${inserted} records backfilled with full schema (year, mileage, description, etc.). This run used ${metered} metered requests. Future queries cost 0.`);
