// A VIN THAT IS LIVE IS KNOWN FROM ITS OWN LISTING (Lane B, Nov 11 2026). Market Check asked "is it a 2016 Porsche 911 coupe" for VIN WP0AF2A92GS187171, a 2016 Porsche 911 GT3 RS live on Sotheby's Motorsport (ends Nov 12): the question came from the DECODE
// (vPIC named the trim "RS", the resolver could not keep it, so the car read as a plain 911 coupe, $63,000 to $85,500 on 9 sales, where the GT3 RS reads $194,000 to $248,000 on 19), while the car's own live listing, in the live pool with this VIN, named it.
// CAUSE: the exact-car match first (findVinArchiveMatch) reads the ARCHIVE only (sales and unsold attempts); a car at auction right now with no sale on record matched nothing, so api/vehicleIdentity went to the decode question. The listing is the stronger evidence:
// it names the car in its own title. ORDER NOW: the archive match (a recorded sale), then THIS live match, then the decode question. The live match names the car from the listing title (year, make, model, trim), asks nothing, and carries the listing
// (title, venue, link, photo, time left in the engine's own line) as vinLiveMatch for the page to show. Evidence, never ranking; a listing that has ended, or names no car, is no match.
import { supabaseSelect } from "./_supabase.js";
import { humanTitle } from "./carTitle.js";
import { bodyFromText } from "./bodyWords.js";
import { reasonLine } from "./reasonWords.js";
import { houseName } from "../api/_historyData.js";
const norm = s => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const deaccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const COLS = "id,source,url,listing_title,year,make,model,vin_norm,mileage,mileage_unit,body,end_time,photo_url,status,current_bid_usd,location";   // the bid that is judged against the range is current_bid_usd, the same figure the comparable rows use
// the listing's headline as the car's name: no mileage prefix ("6k-Mile"), no trailing generic body word, the year in front when the title has none
export function liveNameOf(row) {
  const t = String(row && row.listing_title || "").trim(); if (!t) return null;
  let dn = deaccent(t).replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\b(coupe|convertible|cabriolet|sedan|hatchback|wagon)\b\s*$/i, "").replace(/\s+/g, " ").trim();
  if (dn && Number(row.year) && !new RegExp(`\\b${Number(row.year)}\\b`).test(dn)) dn = `${Number(row.year)} ${dn}`;
  return dn ? humanTitle(dn) : null;
}
// PURE: one live row -> the match, or null (not live now, no end in the future, no name)
export function liveMatchOf(row, nowMs = Date.now()) {
  if (!row || String(row.status || "") !== "live" || !(Date.parse(row.end_time) > nowMs)) return null;
  const displayName = liveNameOf(row); if (!displayName || !Number(row.year) || !String(row.make || "").trim()) return null;
  const miles = Number(row.mileage) > 0 ? Math.round(Number(row.mileage)) : null;
  return { kind: "live", vin: norm(row.vin_norm), displayName, year: Number(row.year), make: String(row.make).trim(), bodyStyle: bodyFromText(row.listing_title || "") || (row.body ? String(row.body).toLowerCase() : null),
    listing: { title: String(row.listing_title).trim(), venue: houseName(row.source), url: row.url || null, photo: row.photo_url || null, endsAt: new Date(row.end_time).toISOString(), endsLine: reasonLine("pick.ends", { endsAt: Date.parse(row.end_time), now: nowMs }),
      mileage: miles, mileageLine: miles ? reasonLine("history.miles", { miles }) : null, bidLine: Number(row.current_bid_usd) > 0 ? reasonLine("tasks.demo_current_bid", { price: Math.round(Number(row.current_bid_usd)) }) : null, mileageUnit: row.mileage_unit || null, currentBidUsd: Number(row.current_bid_usd) > 0 ? Math.round(Number(row.current_bid_usd)) : null, location: row.location || null } };
}
export async function findVinLiveMatch(env, { vin, nowMs = Date.now(), select = supabaseSelect } = {}) {
  const want = norm(vin); if (want.length !== 17 || !env) return null;
  try { const rows = await select(env, `live_listings?vin_norm=eq.${encodeURIComponent(want)}&status=eq.live&end_time=gt.${encodeURIComponent(new Date(nowMs).toISOString())}&select=${COLS}&order=end_time.desc&limit=1`); return Array.isArray(rows) && rows[0] ? liveMatchOf(rows[0], nowMs) : null; } catch { return null; }
}

// ONE VIN IDENTITY FOR EVERY DOOR (Lane B, Nov 11 2026). Market Check's page asks api/sellerDecision with the VIN as typed (never api/vehicleIdentity), Desk's sheet reads the VIN through lib/sheetRead.js, Sell asks vehicleIdentity and then sellerDecision: three doors, and only
// vehicleIdentity named the car from its live listing, so the others read the VIN's own live listing as "one comparable car" and could not say "This car is live now". These two functions are the whole of that step; every door calls them and nothing else names a live VIN's car.
// the car a live listing names, resolved the way a typed search of its title is (null when the resolver asks a question or names no model); the decode's own facts it was found beside (body, market spec) ride on it
export async function liveVehicleOf(live, decoded, resolve) {
  if (!live || !live.displayName || typeof resolve !== "function") return null;
  const canon = await resolve(live.displayName).catch(() => null), cv = canon && canon.status === "valid" && !canon.clarification && canon.vehicle && canon.vehicle.make && canon.vehicle.model ? canon.vehicle : null;
  if (!cv) return null;
  const dv = decoded || {};
  return { ...cv, vin: live.vin || dv.vin || null, bodyStyle: cv.bodyStyle || live.bodyStyle || dv.bodyStyle || null, ...(dv.marketSpec && !cv.marketSpec ? { marketSpec: dv.marketSpec, marketSpecLabel: dv.marketSpecLabel, marketSpecShort: dv.marketSpecShort } : {}) };
}
// the listing's own words as the typed search's "live" facts (lib/vinAsTyped.js vinFactsOf): its title and the mileage the closest sales are matched at
export const liveFactsOf = live => live && live.listing ? { title: live.listing.title || null, mileage: live.listing.mileage || null } : null;
// the engine's own sentence for a VIN whose listing is live now, and the listing it speaks of (a page prints both as sent)
// placing: where the listing's bid sits against the range the answer shows, from the engine's own comparison (placingFor in lib/onebox.js, the one the comparable rows use), or null when the answer has no range or the listing no bid; the line is the same reason line the comparable rows carry
export function ownLiveOf(live, nowMs = Date.now(), placing = null) {
  if (!live || !live.listing) return null;
  const end = Date.parse(live.listing.endsAt); if (!(end > nowMs)) return null;
  const vs = placing ? { placing, vsRangeLine: reasonLine("live.vs_range", { placing }) } : {};
  return { line: reasonLine("vin.live_now"), endsLine: reasonLine("pick.ends", { endsAt: end, now: nowMs }), listing: { ...live.listing, ...vs } };
}
