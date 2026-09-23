// Sam Desk — non-sold outcomes (auction_attempts) + velocity (same-chassis repeats).
// auction_attempts holds ONLY the five online platforms that report a result (BaT, Cars & Bids,
// Hagerty, Sotheby's Motorsport, MB Market). Houses never report no-sales, so sell-through /
// reserve / withdrawn are ONLINE-ONLY by construction; the coverage line must say so.
import { supabaseSelect } from "../_supabase.js";
import { toUsd, hammerUsd, isHouseSource, sourceSlugOf } from "../_houseComps.js";
import { isPartsListing, isMemorabilia } from "../_classify.js";

export const ATTEMPT_PLATFORMS = ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"];

// Car-less market pool: all sold rows for a venue/channel + date window (a cross-market question
// like "sell-through on Bring a Trailer"). Basic hygiene (parts/memorabilia out, house data-error
// floor); value is USD implied hammer so houses and online compare on the same basis.
export async function fetchBroadSales(win, env, filters = {}) {
  // Slim columns (one JSONB extract) so a market-wide fetch stays fast; receipts are a sample.
  const cols = "id,price:sale_price,auction_end_date:sale_date,source:platform,source_slug,raw_title:listing_title,year,vin_norm,currency:raw_record->>currency";
  const SLUG_LABEL = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty", pcarmarket: "PCARMarket", rmsothebys: "RM Sotheby's", gooding: "Gooding & Co", bonhams: "Bonhams", broadarrow: "Broad Arrow", barrettjackson: "Barrett-Jackson", mecum: "Mecum Auctions" };
  let base = `sales_archive?select=${cols}&sale_price=not.is.null&sale_date=gte.${win.fromIso}&sale_date=lte.${win.toIso}`;
  // Scope by the DISPLAY LABEL so the (platform, sale_date) index is used (an or() on source_slug
  // would defeat it). Venue is required for the car-less path to stay bounded.
  if (filters.venue) { const v = String([].concat(filters.venue)[0]).toLowerCase(); const label = SLUG_LABEL[v] || v; base += `&platform=eq.${encodeURIComponent(label)}`; }
  base += `&order=sale_date.desc&limit=1000`;
  const rows = []; let off = 0;
  for (let i = 0; i < 20; i++) {
    const got = await supabaseSelect(env, `${base}&offset=${off}`) || [];
    for (const r of got) rows.push(r);
    if (got.length < 1000) break; off += 1000;
  }
  const clean = [];
  for (const r of rows) {
    if (isPartsListing(r.raw_title, r.mileage) || isMemorabilia(r.raw_title)) continue;
    r.value = hammerUsd(r);
    if (!Number.isFinite(r.value)) continue;
    if (isHouseSource(r) && r.value < 2500) continue;    // house data-error floor
    clean.push(r);
  }
  return clean;
}

// Fetch non-sold attempts for the same car scope (make + model family token + gen year windows
// + attempt_date window). Deduped by (source_slug, source_record_id).
export async function fetchAttempts(vehicle, genList, win, env, filters = {}) {
  const make = vehicle && vehicle.make;
  const token = vehicle ? String(vehicle.model || "").split(/\s+/)[0] : null;
  const cols = "source_slug,source_record_id,chassis_vin_norm,make,model,year,attempt_date,auction_status,high_bid,currency,has_reserve,bids";
  const gens = (genList && genList.length && genList[0]) ? genList : [null];
  const seen = new Set(); const rows = [];
  for (const gen of gens) {
    let base = `auction_attempts?select=${cols}`;
    if (make) base += `&make=ilike.${encodeURIComponent(make)}`;
    if (token) base += `&model=ilike.${encodeURIComponent("*" + token + "*")}`;
    if (filters.venue) base += `&source_slug=eq.${encodeURIComponent(String([].concat(filters.venue)[0]).toLowerCase())}`;
    const yMin = gen ? gen.yearStart : (filters.year_min != null ? Number(filters.year_min) : null);
    const yMax = gen ? gen.yearEnd : (filters.year_max != null ? Number(filters.year_max) : null);
    if (yMin != null) base += `&year=gte.${yMin}`;
    if (yMax != null) base += `&year=lte.${yMax}`;
    base += `&attempt_date=gte.${win.fromIso}&attempt_date=lte.${win.toIso}&order=attempt_date.desc&limit=1000`;
    let off = 0;
    for (let i = 0; i < 20; i++) {
      const got = await supabaseSelect(env, `${base}&offset=${off}`) || [];
      for (const r of got) { const k = `${r.source_slug}|${r.source_record_id}`; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
      if (got.length < 1000) break; off += 1000;
    }
  }
  // normalize a USD comparable of the high bid (the bid-to figure)
  for (const r of rows) r._bidUsd = r.high_bid != null ? toUsd(Number(r.high_bid), (r.currency || "USD").toUpperCase()) : null;
  return rows;
}

// Velocity: same-chassis rows that appear 2+ times (a car resold). Returns the repeat pairs with
// time-between and price change. `rows` are qualified pool rows carrying vin_norm, date, value.
export function computeVelocity(rows) {
  const byVin = new Map();
  for (const r of rows) {
    const vin = String(r.vin_norm || r.vin || "").trim();
    if (!vin || vin.length < 6) continue;
    (byVin.get(vin) || byVin.set(vin, []).get(vin)).push(r);
  }
  const chains = [];
  for (const [vin, rs] of byVin) {
    if (rs.length < 2) continue;
    rs.sort((a, b) => String(a.auction_end_date || a.date).localeCompare(String(b.auction_end_date || b.date)));
    const pairs = [];
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1], b = rs[i];
      const da = new Date(a.auction_end_date || a.date), db = new Date(b.auction_end_date || b.date);
      const months = Math.round((db - da) / (30.44 * 864e5));
      const pa = Number(a.value), pb = Number(b.value);
      pairs.push({
        from_date: String(a.auction_end_date || a.date).slice(0, 10), to_date: String(b.auction_end_date || b.date).slice(0, 10),
        months_between: months,
        from_price: Number.isFinite(pa) ? Math.round(pa) : null, to_price: Number.isFinite(pb) ? Math.round(pb) : null,
        price_change: (Number.isFinite(pa) && Number.isFinite(pb)) ? Math.round(pb - pa) : null,
        pct_change: (Number.isFinite(pa) && Number.isFinite(pb) && pa > 0) ? +(((pb - pa) / pa) * 100).toFixed(1) : null
      });
    }
    chains.push({ chassis: vin, sales: rs.length, title: rs[rs.length - 1].raw_title || rs[rs.length - 1].title || null, pairs });
  }
  chains.sort((a, b) => b.sales - a.sales || (b.pairs[0] ? b.pairs[0].months_between : 0) - (a.pairs[0] ? a.pairs[0].months_between : 0));
  return chains;
}
