// Live feed mapping + persistence (Lane C, Oct 2026). OCD /auctions/live record -> live_listings row.
// Make/model fall back to Lane A's title/VIN classifier (lib/_unknownClassify.js, read-only) when
// OCD's structured fields are empty. USD conversion uses the shared fx_rates table (lib/_fx.js).
import { specialFlag } from "./specialFlag.js";
import { USD_ONLY_SOURCES } from "./liveTrust.js";
import { classifyUnknown } from "../_unknownClassify.js";
import { loadFxRates } from "../_fx.js";
import { supabaseSelect } from "../_supabase.js";

const normVin = s => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const txt = v => (v == null ? "" : String(v)).trim();
// A number that may be zero (a bid of $0 is not the same as no bid): null only when absent.
const num0 = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : null; };
const numOf = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const pick = (o, ...ks) => { for (const k of ks) { const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o); if (v != null && v !== "") return v; } return null; };
const unknown = s => !s || /^unknown$/i.test(String(s).trim());
const titleCase = s => String(s || "").replace(/\b([a-z])/g, c => c.toUpperCase());

// Family key for matching: the model in lower case, accent-free, spaces collapsed ("911", "f12berlinetta" -> "f12berlinetta").
export function familyKey(model) { return String(model || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || null; }

let fxPromise = null;
export function mapLiveRecord(rec, seenAt) {
  const source = txt(pick(rec, "source_slug", "source", "platform_slug", "platform")).toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = txt(pick(rec, "source_record_id", "source_listing_id", "listing_id", "external_id", "id", "url"));
  if (!source || !id) return null;
  const title = txt(pick(rec, "title", "listing_title", "name"));
  let make = txt(pick(rec, "ocd_make_name", "listing_make", "make", "make_name"));
  let model = txt(pick(rec, "ocd_model_name", "model", "model_name"));
  const vin = txt(pick(rec, "vin", "chassis", "chassis_number"));
  if (unknown(make) || unknown(model)) {
    const c = classifyUnknown({ listing_title: title, vin });
    if (c.vehicle_type && c.vehicle_type !== "car") return null;   // motorcycles, tractors, automobilia: not on /buy
    if (unknown(make) && c.make) make = c.make;
    if (unknown(model) && c.model) model = c.model;
  }
  const year = Number(pick(rec, "year", "model_year")) || Number((title.match(/\b(18|19|20)\d{2}\b/) || [])[0]) || null;
  // v4 (Oct 2026): a $0 bid stays 0 (distinct from no bid), with the feed's bid count beside it.
  const bid = num0(pick(rec, "current_bid", "high_bid", "price", "bid", "current_price"));
  const bidCount = num0(pick(rec, "stats.bids", "bid_count", "bids", "num_bids"));
  // The feed's own mileage unit, normalised; kilometres also named in the title or description count.
  const unitRaw = txt(rec.mileage_unit).toLowerCase();
  const textKm = /\d[\d,.]*\s*k?-?\s*(kilomet(er|re)s?|kms?)\b/i.test(title);
  const mileageUnit = /^km|kilomet/.test(unitRaw) || textKm ? "km" : /^mi/.test(unitRaw) ? "mi" : null;
  return {
    source, source_listing_id: id,
    url: txt(pick(rec, "url", "source_url", "listing_url")) || null,
    listing_title: title || null,
    make: unknown(make) ? null : titleCase(make), model: unknown(model) ? null : model, model_family: unknown(model) ? null : familyKey(model),
    year, vin: vin || null, vin_norm: normVin(vin) || null,
    // Stored in miles: converted when the unit is kilometres (the feed's unit, or the title saying km).
    mileage: (() => { const m = numOf(pick(rec, "mileage", "odometer", "miles")); if (!m) return null; return Math.round(mileageUnit === "km" ? m * 0.621371 : m); })(),
    mileage_unit: mileageUnit,
    body: txt(pick(rec, "body_style", "body")) || null,
    transmission: txt(pick(rec, "transmission", "gearbox")) || null,
    location: [txt(rec.city), txt(rec.state)].filter(Boolean).join(", ") || txt(pick(rec, "location", "seller_location")) || null,
    country: txt(pick(rec, "country", "country_code", "location_country")) || null,
    // v4: empty when the feed does not say (no more "USD" by default).
    currency: txt(pick(rec, "currency", "currency_code")).toUpperCase() || null,
    current_bid: bid, current_bid_usd: null, bid_count: bidCount,
    special_flag: specialFlag(title, make),
    end_time: (() => { const e = txt(pick(rec, "auction_end_at", "end_time", "ends_at")); if (e) return /[zZ]|[+-]\d\d:?\d\d$/.test(e) ? e : e.replace(" ", "T") + "Z"; const d = txt(rec.auction_end_date); return d ? d + "T23:59:00Z" : null; })(),
    status: "live", last_seen: seenAt,
    exterior_color: txt(pick(rec, "exterior_color")) || null,
    std_color: txt(pick(rec, "standard_exterior_color")) || null,
    has_reserve: rec.has_reserve === true || rec.has_reserve === "true" ? true : (rec.has_reserve === false || rec.has_reserve === "false" ? false : null),
    description: txt(pick(rec, "description")).slice(0, 1500) || null,
    bid_at: (() => { const u = txt(pick(rec, "updated_at")); if (!u) return null; const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(u) ? u : u.replace(" ", "T") + "Z"; return isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString(); })(),
    photo_url: txt(pick(rec, "featured_image_url", "image_url", "photo_url", "image", "thumbnail_url")) || null
  };
}

async function post(env, path, body, prefer) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: prefer },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`live_listings write ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
}
async function patch(env, path, body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`live_listings patch ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.json().catch(() => []);
}

// Upsert on (source, source_listing_id). first_seen is NOT in the payload, so the column default
// sets it on insert and a re-run never moves it; everything else refreshes.
export async function upsertLive(env, rows) {
  if (!rows.length) return 0;
  fxPromise = fxPromise || loadFxRates(env).catch(() => null);
  const fx = await fxPromise;
  const today = new Date().toISOString().slice(0, 10);
  const dedup = new Map();
  for (const r of rows) {
    // Dollars only when the currency is dollars (stated, or a dollars-only platform); a $0 bid has no
    // dollar figure; an unknown currency has none either.
    const cur = r.currency || (USD_ONLY_SOURCES.has(r.source) ? "USD" : null);
    r.current_bid_usd = !(Number(r.current_bid) > 0) || !cur ? null : (cur === "USD" ? r.current_bid : (fx ? Math.round(fx.toUsd(r.current_bid, cur, today) || 0) || null : null));
    dedup.set(r.source + "|" + r.source_listing_id, r);
  }
  const all = [...dedup.values()];
  // The colour/description/bid-time columns arrive with docs/supabase-live-listings.sql (Oct 2026 v2);
  // until they exist the upsert drops them (one DB retry, never an OCD request).
  // has_reserve arrives with v3 (docs/supabase-live-listings.sql); a missing has_reserve column drops
  // ONLY that field, so colour/description keep writing.
  const EXTRA = ["exterior_color", "std_color", "description", "bid_at", "has_reserve"];
  // v4 columns (docs/supabase-live-listings-v4.sql): until they exist they are dropped (one DB retry) and
  // the currency keeps the old "USD" default, so the pull, /buy and Tasks work the same before the SQL.
  const V4 = ["mileage_unit", "bid_count", "special_flag"];
  let batch = all, dropped = false, droppedReserve = false, droppedV4 = false;
  for (let i = 0; i < batch.length; i += 200) {
    try { await post(env, "live_listings?on_conflict=source,source_listing_id", batch.slice(i, i + 200), "resolution=merge-duplicates,return=minimal"); }
    catch (e) {
      const msg = String(e && e.message);
      if (!/column|PGRST204|schema cache/i.test(msg)) throw e;
      if (!droppedV4 && /mileage_unit|bid_count|special_flag/i.test(msg)) { droppedV4 = true; batch = batch.map(r => { const o = { ...r }; V4.forEach(k => delete o[k]); if (!o.currency) o.currency = "USD"; return o; }); i -= 200; continue; }
      if (!droppedReserve && /has_reserve/i.test(msg)) { droppedReserve = true; batch = batch.map(r => { const o = { ...r }; delete o.has_reserve; return o; }); i -= 200; continue; }
      if (dropped) throw e;
      dropped = true; batch = batch.map(r => { const o = { ...r }; EXTRA.forEach(k => delete o[k]); return o; }); i -= 200;
    }
  }
  if (droppedV4) console.error("live_listings: mileage_unit/bid_count/special_flag columns missing; run docs/supabase-live-listings-v4.sql");
  if (droppedReserve) console.error("live_listings: has_reserve column missing; run docs/supabase-live-listings.sql v3");
  if (dropped) console.error("live_listings: colour/description/bid_at columns missing; run docs/supabase-live-listings.sql v2");
  return all.length;
}

// Live rows the complete walk did not see are no longer live: mark them ended (unsold until the
// archive shows a sale, which fillFinalPrices then records).
export async function markVanished(env, seenAt) {
  const out = await patch(env, `live_listings?status=eq.live&last_seen=lt.${encodeURIComponent(seenAt)}&select=id`, { status: "ended_unsold" });
  return { ended: Array.isArray(out) ? out.length : 0 };
}

// Ended rows without a final price: look the sale up in sales_archive (vin_norm first, then the
// listing URL, indexed by sales_archive_raw_url_idx) and record it, flipping the row to ended_sold.
// Bounded per run: 150 rows, and a wall-clock budget (opts.budgetMs) so the pull always returns its
// summary; a budget stop says how many rows were handled and how many are left.
export async function fillFinalPrices(env, opts = {}) {
  const t0 = Date.now(), budgetMs = Number(opts.budgetMs) || Infinity;
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const filter = `status=neq.live&final_price=is.null&last_seen=gte.${since}`;
  const rows = (await supabaseSelect(env, `live_listings?${filter}&select=id,vin_norm,url,end_time,last_seen&order=last_seen.desc&limit=150`)) || [];
  let filled = 0, checked = 0, budgetHit = false;
  for (const r of rows) {
    if (Date.now() - t0 >= budgetMs) { budgetHit = true; break; }
    checked++;
    const day = String(r.end_time || r.last_seen || "").slice(0, 10);
    let hit = null;
    if (r.vin_norm && r.vin_norm.length >= 6) {
      const s = await supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(r.vin_norm)}&sale_date=gte.${day ? new Date(Date.parse(day) - 7 * 864e5).toISOString().slice(0, 10) : since.slice(0, 10)}&select=sale_price,sale_price_usd,sale_date&order=sale_date.desc&limit=1`);
      hit = s && s[0];
    }
    if (!hit && r.url) {
      const s = await supabaseSelect(env, `sales_archive?raw_record->>url=eq.${encodeURIComponent(r.url)}&select=sale_price,sale_price_usd,sale_date&limit=1`);
      hit = s && s[0];
    }
    if (hit && (hit.sale_price_usd || hit.sale_price)) {
      await patch(env, `live_listings?id=eq.${r.id}`, { status: "ended_sold", final_price: Number(hit.sale_price_usd || hit.sale_price) });
      filled++;
    }
  }
  // The whole backlog after this run (rows still ended with no final price in the 45-day window).
  const backlog = await countRows(env, `live_listings?${filter}`).catch(() => null);
  return { picked: rows.length, checked, filled, notReached: rows.length - checked, budgetHit, budgetMs: Number.isFinite(budgetMs) ? budgetMs : null, ms: Date.now() - t0, backlogLeft: backlog };
}
async function countRows(env, path) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null;
}

// Report for the run: how many fetched rows carry a VIN, and how many of those VINs already appear
// in sales_archive (vin_norm) or auction_attempts (chassis_vin_norm).
// Wall-clock budget (opts.budgetMs): stops cleanly between batches and reports the VINs left unchecked.
export async function liveStats(env, rows, opts = {}) {
  const t0 = Date.now(), budgetMs = Number(opts.budgetMs) || Infinity;
  const vins = [...new Set(rows.map(r => r.vin_norm).filter(v => v && v.length >= 6))];
  const inSales = new Set(), inAtt = new Set();
  let checkedVins = 0, budgetHit = false;
  for (let i = 0; i < vins.length; i += 80) {
    if (Date.now() - t0 >= budgetMs) { budgetHit = true; break; }
    checkedVins = Math.min(vins.length, i + 80);
    const list = vins.slice(i, i + 80).map(v => `"${v}"`).join(",");
    const s = (await supabaseSelect(env, `sales_archive?vin_norm=in.(${encodeURIComponent(list)})&select=vin_norm&limit=1000`)) || [];
    s.forEach(x => inSales.add(x.vin_norm));
    const a = (await supabaseSelect(env, `auction_attempts?chassis_vin_norm=in.(${encodeURIComponent(list)})&select=chassis_vin_norm&limit=1000`)) || [];
    a.forEach(x => inAtt.add(x.chassis_vin_norm));
  }
  const either = vins.filter(v => inSales.has(v) || inAtt.has(v));
  return { withVin: vins.length, vinsChecked: checkedVins, vinsLeft: vins.length - checkedVins, budgetHit, statsMs: Date.now() - t0, vinInSalesArchive: inSales.size, vinInAuctionAttempts: inAtt.size, vinInEither: either.length, vinsWithHistorySample: either.slice(0, 10) };
}
