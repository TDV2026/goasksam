// Live feed mapping + persistence (Lane C, Oct 2026). OCD /auctions/live record -> live_listings row.
// Make/model fall back to Lane A's title/VIN classifier (lib/_unknownClassify.js, read-only) when
// OCD's structured fields are empty. USD conversion uses the shared fx_rates table (lib/_fx.js).
import { classifyUnknown } from "../_unknownClassify.js";
import { loadFxRates } from "../_fx.js";
import { supabaseSelect } from "../_supabase.js";

const normVin = s => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const txt = v => (v == null ? "" : String(v)).trim();
const numOf = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const pick = (o, ...ks) => { for (const k of ks) { const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o); if (v != null && v !== "") return v; } return null; };
const unknown = s => !s || /^unknown$/i.test(String(s).trim());
const titleCase = s => String(s || "").replace(/\b([a-z])/g, c => c.toUpperCase());

// Family key for matching: the model in lower case, accent-free, spaces collapsed ("911", "f12berlinetta" -> "f12berlinetta").
export function familyKey(model) { return String(model || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || null; }

let fxPromise = null;
export function mapLiveRecord(rec, seenAt) {
  const source = txt(pick(rec, "source_slug", "source", "platform_slug", "platform")).toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = txt(pick(rec, "source_record_id", "source_listing_id", "listing_id", "external_id", "id"));
  if (!source || !id) return null;
  const title = txt(pick(rec, "title", "listing_title", "name"));
  let make = txt(pick(rec, "make", "make_name", "ocd_make_name"));
  let model = txt(pick(rec, "model", "model_name", "ocd_model_name"));
  const vin = txt(pick(rec, "vin", "chassis", "chassis_number"));
  if (unknown(make) || unknown(model)) {
    const c = classifyUnknown({ listing_title: title, vin });
    if (c.vehicle_type && c.vehicle_type !== "car") return null;   // motorcycles, tractors, automobilia: not on /buy
    if (unknown(make) && c.make) make = c.make;
    if (unknown(model) && c.model) model = c.model;
  }
  const year = Number(pick(rec, "year", "model_year")) || Number((title.match(/\b(18|19|20)\d{2}\b/) || [])[0]) || null;
  const bid = numOf(pick(rec, "current_bid", "high_bid", "price", "bid", "current_price"));
  return {
    source, source_listing_id: id,
    url: txt(pick(rec, "url", "source_url", "listing_url")) || null,
    listing_title: title || null,
    make: unknown(make) ? null : titleCase(make), model: unknown(model) ? null : model, model_family: unknown(model) ? null : familyKey(model),
    year, vin: vin || null, vin_norm: normVin(vin) || null,
    mileage: Math.round(numOf(pick(rec, "mileage", "odometer", "miles")) || 0) || null,
    body: txt(pick(rec, "body_style", "body")) || null,
    transmission: txt(pick(rec, "transmission", "gearbox")) || null,
    location: txt(pick(rec, "location", "city", "seller_location")) || null,
    country: txt(pick(rec, "country", "country_code", "location_country")) || null,
    currency: txt(pick(rec, "currency", "currency_code")).toUpperCase() || "USD",
    current_bid: bid, current_bid_usd: null,
    end_time: pick(rec, "auction_end_at", "end_time", "ends_at", "auction_end_date", "end_date") || null,
    status: "live", last_seen: seenAt,
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
    r.current_bid_usd = r.current_bid == null ? null : (r.currency === "USD" ? r.current_bid : (fx ? Math.round(fx.toUsd(r.current_bid, r.currency, today) || 0) || null : null));
    dedup.set(r.source + "|" + r.source_listing_id, r);
  }
  const all = [...dedup.values()];
  for (let i = 0; i < all.length; i += 200) await post(env, "live_listings?on_conflict=source,source_listing_id", all.slice(i, i + 200), "resolution=merge-duplicates,return=minimal");
  return all.length;
}

// Live rows the complete walk did not see are no longer live: mark them ended (unsold until the
// archive shows a sale, which fillFinalPrices then records).
export async function markVanished(env, seenAt) {
  const out = await patch(env, `live_listings?status=eq.live&last_seen=lt.${encodeURIComponent(seenAt)}&select=id`, { status: "ended_unsold" });
  return { ended: Array.isArray(out) ? out.length : 0 };
}

// Ended rows without a final price: look the sale up in sales_archive (vin_norm first, then the
// listing URL) and record it, flipping the row to ended_sold. Bounded per run.
export async function fillFinalPrices(env) {
  const since = new Date(Date.now() - 45 * 864e5).toISOString();
  const rows = (await supabaseSelect(env, `live_listings?status=neq.live&final_price=is.null&last_seen=gte.${since}&select=id,vin_norm,url,end_time,last_seen&order=last_seen.desc&limit=150`)) || [];
  let filled = 0;
  for (const r of rows) {
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
  return { checked: rows.length, filled };
}

// Report for the run: how many fetched rows carry a VIN, and how many of those VINs already appear
// in sales_archive (vin_norm) or auction_attempts (chassis_vin_norm).
export async function liveStats(env, rows) {
  const vins = [...new Set(rows.map(r => r.vin_norm).filter(v => v && v.length >= 6))];
  const inSales = new Set(), inAtt = new Set();
  for (let i = 0; i < vins.length; i += 80) {
    const list = vins.slice(i, i + 80).map(v => `"${v}"`).join(",");
    const s = (await supabaseSelect(env, `sales_archive?vin_norm=in.(${encodeURIComponent(list)})&select=vin_norm&limit=1000`)) || [];
    s.forEach(x => inSales.add(x.vin_norm));
    const a = (await supabaseSelect(env, `auction_attempts?chassis_vin_norm=in.(${encodeURIComponent(list)})&select=chassis_vin_norm&limit=1000`)) || [];
    a.forEach(x => inAtt.add(x.chassis_vin_norm));
  }
  const either = vins.filter(v => inSales.has(v) || inAtt.has(v));
  return { withVin: vins.length, vinInSalesArchive: inSales.size, vinInAuctionAttempts: inAtt.size, vinInEither: either.length, vinsWithHistorySample: either.slice(0, 10) };
}
