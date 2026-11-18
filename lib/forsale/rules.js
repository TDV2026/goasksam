// FOR SALE: THE RULES (Lane D, lane-d-forsale, Nov 2026). Dealer cars and classifieds beside Find's live auctions, engine side, US only.
// Every rule lives here, in one place, and every one is enforced in the engine: a page never decides what is served.
//   US only; a listing is served only if last seen within 24 hours and not gone; held sources never; one card per car (a VIN under two sources: the dealer's own page wins);
//   every listing goes through the resolver and one the resolver cannot place is not served (and is counted).
// Pure: no reads, no clock of its own (the caller passes `now`), so the check can exercise each rule on its own.
import SOURCES from "../../data/forsaleSources.json" with { type: "json" };

export const FRESH_MS = 24 * 3600e3;           // served only if last seen at its source within 24 hours
export const SOURCE_TABLE = SOURCES.sources;   // { source: { type, hold, reason? } }, data/forsaleSources.json

export const typeOf = source => { const s = SOURCE_TABLE[String(source || "")]; return s && (s.type === "dealer" || s.type === "classified") ? s.type : null; };
export const isHeld = source => { const s = SOURCE_TABLE[String(source || "")]; return !!(s && s.hold === true); };
// the sources the pull asks the vendor for: every source in the file that is not held
export const pulledSources = () => Object.keys(SOURCE_TABLE).filter(k => typeOf(k) && !isHeld(k));
export const typeWord = type => (type === "dealer" ? "Dealer" : type === "classified" ? "Classified" : null);

const txt = v => (v == null ? "" : String(v)).trim();
export const normVin = v => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
// a VIN that can be matched across sources: the 17 character form (no I, O or Q). A short or placeholder chassis number is never matched across sources: a match is not guessed.
export const isFullVin = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(normVin(v));

// US ONLY: the vendor's country is US AND the price is in dollars (the census SET RULE). A listing coded US but priced in euros or pounds, or with no country, is not US.
export function isUs(rec) { return txt(rec && rec.country_code).toUpperCase() === "US" && txt(rec && rec.currency).toUpperCase() === "USD"; }

// WHAT THE PULL KEEPS, ONE REASON WHEN IT DOES NOT (the counts the pull reports). rec is a vendor record (fields and values; no description is ever read).
export function pullVerdict(rec) {
  const source = txt(rec && rec.source).toLowerCase();
  if (!typeOf(source)) return { keep: false, why: "unknown_source" };
  if (isHeld(source)) return { keep: false, why: "held_source" };
  if (!isUs(rec)) return { keep: false, why: "not_us" };
  if (txt(rec.status).toLowerCase() !== "active") return { keep: false, why: "not_active" };
  if (!txt(rec.source_listing_id) && rec.id == null) return { keep: false, why: "no_id" };
  return { keep: true, why: null };
}

// THE ROW A PULLED RECORD BECOMES (no seller name, no description, no zip): only what a card needs.
export function rowOf(rec, pulledAtIso) {
  const source = txt(rec.source).toLowerCase();
  const id = txt(rec.source_listing_id) || txt(rec.id);
  const num = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
  const unit = txt(rec.mileage_unit).toLowerCase();
  const mi = num(rec.mileage);
  const place = [txt(rec.city), txt(rec.state)].filter(Boolean).join(", ") || txt(rec.location).slice(0, 80) || null;
  const seen = txt(rec.last_seen_at);
  return {
    source, source_listing_id: id, source_type: typeOf(source),
    title: txt(rec.title).slice(0, 200) || null,
    url: txt(rec.url) || null, image_url: txt(rec.featured_image_url) || null,
    asking_price_usd: num(rec.asking_price) ? Math.round(num(rec.asking_price)) : null,
    mileage: mi == null ? null : Math.round(/^km|kilomet/.test(unit) ? mi * 0.621371 : mi),
    location: place, state: txt(rec.state) || null, country_code: "US",
    vin: txt(rec.vin) || null, vin_norm: normVin(rec.vin) || null,
    year: Number(rec.year) > 1800 ? Number(rec.year) : null,
    body: txt(rec.body_style).slice(0, 40) || null, transmission: txt(rec.transmission).slice(0, 60) || null, exterior_color: txt(rec.exterior_color).slice(0, 40) || null,
    make: txt(rec.ocd_make_name) || txt(rec.listing_make) || null,
    model: txt(rec.ocd_model_name) || txt(rec.listing_model) || null,
    last_seen: seen && !Number.isNaN(Date.parse(seen)) ? new Date(seen).toISOString() : null,
    pulled_at: pulledAtIso, gone: false, gone_at: null, updated_at: pulledAtIso
  };
}

// WHY A STORED ROW IS NOT SERVED (one reason, in order), or null when it is. now: ms.
export function heldBack(row, now, engineVersion) {
  if (!row) return "no_row";
  if (!typeOf(row.source)) return "unknown_source";
  if (isHeld(row.source)) return "held_source";
  if (row.country_code && String(row.country_code).toUpperCase() !== "US") return "not_us";
  if (row.gone === true) return "gone";
  const seen = Date.parse(row.last_seen);
  if (!Number.isFinite(seen) || now - seen > FRESH_MS) return "not_fresh";
  if (row.resolve_state !== "resolved" || !row.car || !row.car.key) return row.resolve_state === "unresolved" ? "unresolved" : "resolve_pending";
  if (!(Number(row.asking_price_usd) > 0)) return "no_price";
  if (!(row.read && row.read.sold_line && row.read.engine_version === engineVersion)) return "read_pending";
  return null;
}

// ONE CARD PER CAR. rows: the servable rows. A VIN of 17 characters listed under more than one source is one car: the dealer's own page wins over a marketplace copy; between two of the same
// type the source seen most recently wins, then the source name (so the choice never depends on the order the rows came in). A row with no full VIN is never matched to another source's: a match is not
// guessed, so a car listed without a VIN under two sources shows twice (counted by the caller as no_vin_twins_possible). The same source listing the same VIN twice keeps the one seen last.
export function onePerCar(rows) {
  const rank = r => [r.source_type === "dealer" ? 0 : 1, -(Date.parse(r.last_seen) || 0), String(r.source), -(Number(r.id) || 0)];
  const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return true; if (x[i] > y[i]) return false; } return false; };
  const keep = new Map(), out = [], dropped = [];
  for (const r of rows) {
    if (!isFullVin(r.vin_norm || r.vin)) { out.push(r); continue; }
    const k = normVin(r.vin_norm || r.vin), cur = keep.get(k);
    if (!cur) { keep.set(k, r); continue; }
    if (better(r, cur)) { dropped.push(cur); keep.set(k, r); } else dropped.push(r);
  }
  const winners = [...keep.values()];
  return { rows: out.concat(winners), droppedAsTwin: dropped.length };
}

// THE ROW IN THE SHAPE FIND'S MATCHING READS (the shape a live auction row has), so a dealer car or a classified is matched by the SAME search code as an auction: searchLive over these rows.
// withPrice false (the read is made without a price: an asking price is never a bid, and no bid line is ever built from it).
export function liveShape(row, withPrice = true) {
  const p = Number(row.asking_price_usd) > 0 ? Number(row.asking_price_usd) : null;
  return {
    id: row.id, source: row.source, listing_title: row.title, make: row.make, model: row.model, year: row.year, mileage: row.mileage, mileage_unit: "mi",
    body: row.body || null, transmission: row.transmission || null, exterior_color: row.exterior_color || null, location: row.location || null, country: "US", currency: "USD",
    current_bid: withPrice ? p : null, current_bid_usd: withPrice ? p : null, bid_count: 0, end_time: null, status: "classified", has_reserve: null, description: null, special_flag: null,
    vin_norm: row.vin_norm || null, photo_url: row.image_url || null, url: row.url || null, _fs: row
  };
}
