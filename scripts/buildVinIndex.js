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
import { classifyRoad } from "../lib/_roadType.js";

const normVin = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toNum = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const day = d => (d ? String(d).slice(0, 10) : null);
const isUnknown = s => !s || /^unknown$/i.test(String(s).trim());

// OFFSET pagination (the old readAll) had two compounding bugs that silently truncated the read:
// (1) `order=sale_date.asc.nullslast` has no tiebreaker on a unique column, so Postgres does not
//     guarantee the SAME relative order for tied rows across two separate paginated requests - a row
//     can land on neither page (or both) as the offset window shifts.
// (2) OFFSET cost grows with the offset (Postgres must scan and discard every preceding row), so late
//     pages over a ~305k-row table get slower and slower; a page that times out or 5xx's just hit
//     `if (!res.ok) break`, which read as "no more data" instead of a failure - the walk silently
//     stopped wherever the server happened to give up, which varies run to run (observed counts:
//     60971 / 59179 / 67319 / 69068 against the same ~321k-row source).
// Fixed with KEYSET pagination on a genuinely unique, indexed column: every page's query is a cheap
// `col > last_cursor LIMIT n` (no growing offset to scan past), and a unique cursor makes the row order
// deterministic, so no row can be skipped or duplicated between pages. A failed page RETRIES (3
// attempts, backoff) and THROWS if still failing - a short/truncated read is now an ERROR, never a
// silent partial result.
async function readAllKeyset(env, table, filter, cursorCol, selectCols, pageSize = 1000) {
  const out = [];
  let cursor = null, pages = 0;
  for (;;) {
    const cursorQ = cursor != null ? `&${cursorCol}=gt.${encodeURIComponent(cursor)}` : "";
    const url = `${table}?${filter}&select=${selectCols}${cursorQ}&order=${cursorCol}.asc&limit=${pageSize}`;
    let page = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && page === null; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
      try {
        const res = await fetch(`${env.supabaseUrl}/rest/v1/${url}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
        if (res.ok) { page = await res.json(); break; }
        lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`;
      } catch (e) { lastErr = e.message; }
    }
    if (page === null) throw new Error(`readAllKeyset(${table}): page fetch failed after 3 attempts at cursor=${cursor}, page ${pages + 1}: ${lastErr}`);
    pages++;
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
    cursor = page[page.length - 1][cursorCol];
  }
  return { rows: out, pages };
}
// Compound keyset for a table with NO single unique column (auction_attempts: composite PK
// source_slug + source_record_id, no serial id). orderCols are compared lexicographically; the cursor
// condition is the standard "greater than the last row" OR-of-ANDs PostgREST needs for a multi-column
// keyset. Same retry-then-throw behavior as readAllKeyset.
async function readAllCompoundKeyset(env, table, filter, orderCols, selectCols, pageSize = 1000) {
  const out = [];
  let cursor = null, pages = 0;
  for (;;) {
    let cursorQ = "";
    if (cursor) {
      const parts = orderCols.map((col, i) => {
        const eqs = orderCols.slice(0, i).map((c, j) => `${c}.eq.${encodeURIComponent(cursor[j])}`);
        const gt = `${col}.gt.${encodeURIComponent(cursor[i])}`;
        return eqs.length ? `and(${eqs.concat(gt).join(",")})` : gt;
      });
      cursorQ = `&or=(${parts.join(",")})`;
    }
    const orderQ = orderCols.map(c => `${c}.asc`).join(",");
    const url = `${table}?${filter}&select=${selectCols}${cursorQ}&order=${orderQ}&limit=${pageSize}`;
    let page = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && page === null; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
      try {
        const res = await fetch(`${env.supabaseUrl}/rest/v1/${url}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
        if (res.ok) { page = await res.json(); break; }
        lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`;
      } catch (e) { lastErr = e.message; }
    }
    if (page === null) throw new Error(`readAllCompoundKeyset(${table}): page fetch failed after 3 attempts at cursor=${JSON.stringify(cursor)}, page ${pages + 1}: ${lastErr}`);
    pages++;
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    cursor = orderCols.map(c => last[c]);
  }
  return { rows: out, pages };
}
// Authoritative exact count (same filter) to cross-check the keyset read actually got everything. A
// mismatch is an ERROR (thrown), never a silently accepted partial read.
async function exactCount(env, table, filter, selCol) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${table}?${filter}&select=${selCol}&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact" } });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  return m ? Number(m[1]) : null;
}

// ---- gather appearances ----
async function loadSales(env) {
  const sel = "source_id,vin_norm,sale_date,source_slug,make,model,model_family,vehicle_type,year,mileage,sale_price_usd," +
    "currency:raw_record->>currency,url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,country:raw_record->>country,title:listing_title";
  // Exclude ONLY actual non_vehicle rows. `vehicle_type=not.eq.non_vehicle` drops NULL rows too (SQL
  // NULL <> x is unknown), which would filter make-Unknown cars out of the VIN index - a VIN exact-match
  // must never be filtered by vehicle_type or make. Keep null / car / motorcycle / other.
  const filter = "vin_norm=not.is.null&or=(vehicle_type.is.null,vehicle_type.neq.non_vehicle)";
  // Keyset on source_id (text, UNIQUE per the DDL) - deterministic order, O(page) cost per page
  // regardless of how deep the walk goes (unlike OFFSET, which gets slower and slower).
  const { rows, pages } = await readAllKeyset(env, "sales_archive", filter, "source_id", sel);
  const expected = await exactCount(env, "sales_archive", filter, "source_id");
  console.log(`sales_archive read: ${rows.length} rows over ${pages} pages (expected ${expected})`);
  if (expected != null && rows.length !== expected) throw new Error(`sales_archive read mismatch: got ${rows.length}, direct count says ${expected} - treating a short read as an error, not a partial result.`);
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
  const sel = "source_slug,source_record_id,chassis_vin_norm,attempt_date,make,model,year,high_bid,high_bid_usd,auction_status,currency,created_at," +
    "url:raw_record->>url,surl:raw_record->>source_url,photo:raw_record->>featured_image_url,title:raw_record->>title";
  const filter = "chassis_vin_norm=not.is.null";
  // Compound keyset (created_at, source_slug, source_record_id): no single column is globally unique,
  // but the three together are (the composite PK plus a monotonic insert timestamp as the primary sort
  // breaks ties deterministically across pages).
  const { rows, pages } = await readAllCompoundKeyset(env, "auction_attempts", filter, ["created_at", "source_slug", "source_record_id"], sel);
  const expected = await exactCount(env, "auction_attempts", filter, "source_record_id");
  console.log(`auction_attempts read: ${rows.length} rows over ${pages} pages (expected ${expected})`);
  if (expected != null && rows.length !== expected) throw new Error(`auction_attempts read mismatch: got ${rows.length}, direct count says ${expected} - treating a short read as an error, not a partial result.`);
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
  let polluted = 0, shortSplit = 0, nonRoad = 0;
  const keptVins = [];
  const vinBucket = new Map();   // vin -> "car" | "motorcycle" | "other" (nonroad is excluded)
  const yearsOf = apps => apps.map(a => Number(a.year)).filter(y => y > 1800);
  const famsOf = apps => new Set(apps.map(a => String(a.model_family || a.model || "").toLowerCase().trim()).filter(Boolean));
  // Road-type of the VIN from its newest-titled appearance (title + any stored type + known make).
  const repOf = apps => {
    const newest = apps.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || {};
    const titled = apps.find(a => a.title) || newest;
    const made = apps.find(a => !isUnknown(a.make)) || {};
    const typed = apps.find(a => a.vehicle_type) || {};
    return { title: titled.title || "", make: made.make || null, vehicleType: typed.vehicle_type || null };
  };
  for (const [vin, apps] of byVin) {
    const makes = new Set(apps.map(identity).filter(Boolean));
    if (makes.size > 1) { polluted++; continue; }           // different MAKE across lots = shared/unrelated
    // SHORT-CHASSIS GUARD: a 17-char VIN is globally unique, so same-make is the same car. But a
    // pre-1981 chassis number (<17 chars) can repeat WITHIN a make, so merge only when the appearances
    // cohere on model family OR a year within 2; otherwise it is a shared number and is excluded.
    if (vin.length < 17) {
      const ys = yearsOf(apps);
      const yearOk = ys.length < 2 || (Math.max(...ys) - Math.min(...ys)) <= 2;
      const famOk = famsOf(apps).size <= 1;
      if (!(famOk || yearOk)) { polluted++; shortSplit++; continue; }
    }
    // makes.size <= 1 (same make, or all make-Unknown) is KEPT: a VIN exact-match must resolve a
    // make-Unknown car too; make/model are written null for it. Only polluted/shared VINs drop.
    // ROAD-TYPE: non-road lots (boat, aircraft, standalone trailer/caravan, memorabilia, parts, loose
    // engine) leave the indexable set and every sitemap; self-propelled vehicles stay, bucketed for
    // their sitemap (car / motorcycle / other). The VIN exact-match reads sales_archive, not this
    // table, so excluding here never breaks a VIN lookup.
    const bucket = classifyRoad(repOf(apps));
    if (bucket === "nonroad") { nonRoad++; continue; }
    vinBucket.set(vin, bucket);
    keptVins.push(vin);
  }
  const counts = keptVins.map(v => byVin.get(v).length);
  const d1 = counts.filter(n => n === 1).length, d2 = counts.filter(n => n >= 2).length, d3 = counts.filter(n => n >= 3).length;
  const top10 = keptVins.map(v => ({ vin: v, n: byVin.get(v).length, car: (byVin.get(v).find(a => !isUnknown(a.make)) || {}) }))
    .sort((a, b) => b.n - a.n).slice(0, 10).map(t => ({ vin: t.vin, appearances: t.n, car: [t.car.year, t.car.make, t.car.model].filter(Boolean).join(" ") }));
  const bucketCounts = { car: 0, motorcycle: 0, other: 0 };
  for (const b of vinBucket.values()) bucketCounts[b] = (bucketCounts[b] || 0) + 1;
  const stats = { appearances: all.length, distinctVins: byVin.size, polluted, shortChassisSplit: shortSplit, nonRoadExcluded: nonRoad, buckets: bucketCounts, keptVins: keptVins.length, dist: { exactly_1: d1, two_plus: d2, three_plus: d3 }, top10 };
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
    vehicle_type: vinBucket.get(v) || a.vehicle_type, year: a.year, mileage: a.mileage, result: a.result,
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
      model_family: id.model_family || null, vehicle_type: vinBucket.get(v) || id.vehicle_type || mostRecent.vehicle_type || null
    };
  });
  let sins = 0, sumErr = 0;
  for (let i = 0; i < sumRows.length; i += 500) { const r = await supabaseInsert("vin_summary", sumRows.slice(i, i + 500), env.supabaseUrl, env.supabaseKey); if (!r.error) sins += Math.min(500, sumRows.length - i); else { sumErr++; console.error("vin_summary insert error:", r.error); } }

  // Record the build stats to app_usage_events so shortChassisSplit / polluted / counts are queryable
  // from the DB (not only the Actions stdout log). Best-effort; never fails the build.
  try {
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({ event_type: "vin_index_build", route: "scripts/buildVinIndex.js", status: "ok", oldcarsdata_metered_requests: 0, metadata: { appearances: all.length, distinctVins: byVin.size, polluted, shortChassisSplit: shortSplit, nonRoadExcluded: nonRoad, buckets: bucketCounts, keptVins: keptVins.length, vin_index_written: ins, vin_summary_written: sins, insertErrors: insErr + sumErr, dist: stats.dist } }, env.supabaseUrl, env.supabaseKey);
  } catch { /* best-effort */ }
  return { ...stats, wrote: true, vin_index_written: ins, vin_summary_written: sins, insertErrors: insErr + sumErr };
}

// CLI entry (only when run directly, not on import by the ops endpoint).
if (process.argv[1] && /buildVinIndex\.js$/.test(process.argv[1])) {
  const env = supabaseEnv();
  if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
  buildVinIndex(env, { reportOnly: process.argv.slice(2).includes("--report") }).then(s => {
    console.log(`VIN index: ${s.appearances} appearances across ${s.distinctVins} VINs; ${s.polluted} polluted dropped; ${s.nonRoadExcluded} non-road dropped; ${s.keptVins} kept (car ${s.buckets.car}, motorcycle ${s.buckets.motorcycle}, other ${s.buckets.other}).`);
    console.log(`Appearances: 1 -> ${s.dist.exactly_1} | 2+ -> ${s.dist.two_plus} | 3+ -> ${s.dist.three_plus}`);
    console.log("10 most-seen:"); for (const t of s.top10) console.log(`  ${t.vin}  x${t.appearances}  ${t.car}`);
    if (s.wrote) console.log(`\nWrote vin_index ${s.vin_index_written}, vin_summary ${s.vin_summary_written}, insertErrors ${s.insertErrors}. DONE.`);
    process.exit(0);
  }).catch(e => { console.error("buildVinIndex failed:", e && e.message); process.exit(1); });
}

export const __vinIndexInternals = { readAllKeyset, readAllCompoundKeyset, exactCount };
