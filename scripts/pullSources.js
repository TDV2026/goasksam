// Incremental pull of additional OldCarsData sources for a month into
// sales_archive (full v2 schema). Cheap: uses the source filter and stops once
// past the month. Does not touch platforms already cached.
//
// Usage:
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. OLDCARSDATA_API_KEY=.. \
//     node scripts/pullSources.js hagerty pcarmarket

import { callOldCarsData } from "../lib/_ocd.js";
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";

const DISPLAY = { hagerty: "Hagerty", pcarmarket: "PCARMarket", acc: "All Collector Cars", gooding: "Gooding & Co", rmsothebys: "RM Sotheby's", bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids" };
const args = process.argv.slice(2);
const sources = args.filter(a => !a.startsWith("--"));
const daysArg = args.find(a => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.slice(7)) : 30;
const monthArg = args.find(a => a.startsWith("--month=")); // optional: restrict to one YYYY-MM
const ONLY_MONTH = monthArg ? monthArg.slice(8) : null;
if (!sources.length) { console.error("Give source slugs, e.g. hagerty pcarmarket [--days=180]"); process.exit(1); }
const cutoff = new Date(Date.now() - DAYS * 86400000);

const env = supabaseEnv();
if (!env || !process.env.OLDCARSDATA_API_KEY) { console.error("Need SUPABASE + OLDCARSDATA env."); process.exit(1); }

const toMoney = v => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const toInt = v => { const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10); return Number.isFinite(n) ? n : null; };
const toBool = v => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const inWindow = d => d && d >= cutoff && (!ONLY_MONTH || d.toISOString().slice(0, 7) === ONLY_MONTH);

function toFullRow(r, label) {
  const d = toDate(r.auction_end_date);
  return {
    source_id: String(r.id ?? ""), sale_date: d ? d.toISOString().slice(0, 10) : null, platform: label,
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

let metered = 0;
for (const source of sources) {
  const label = DISPLAY[source] || source;
  const kept = [];
  for (let p = 1; p <= 2000; p++) {
    metered++;
    const res = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: p, limit: 50 }, process.env.OLDCARSDATA_API_KEY);
    const rows = res.data || [];
    if (!rows.length) break;
    let oldest = null;
    for (const r of rows) { const d = toDate(r.auction_end_date); if (d && (!oldest || d < oldest)) oldest = d; if (inWindow(d)) kept.push(toFullRow(r, label)); }
    process.stderr.write(`\r${source} p${p}/${res.meta?.total_pages ?? "?"} kept ${kept.length} reqs ${metered}   `);
    if (oldest && oldest < cutoff) break;
    if (p >= (res.meta?.total_pages || 1)) break;
  }
  process.stderr.write("\n");
  // Dedupe by source_id: a source can repeat an id across pages, and an upsert
  // batch cannot touch the same conflict key twice.
  const uniq = [...new Map(kept.filter(r => r.source_id).map(r => [r.source_id, r])).values()];
  for (let i = 0; i < uniq.length; i += 250) {
    const r = await supabaseInsert("sales_archive", uniq.slice(i, i + 250), env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id");
    if (r.error) { console.error("insert error:", r.error); break; }
  }
  console.log(`${label}: upserted ${uniq.length} unique June records (${kept.length - uniq.length} dupes dropped).`);
}
console.log(`Metered requests: ${metered}`);
