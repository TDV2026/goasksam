// FOR SALE: THE RULES (Lane D, lane-d-forsale, Nov 2026). Dealer cars and classifieds beside Find's live auctions, engine side, US only.
// Every rule lives here, in one place, and every one is enforced in the engine: a page never decides what is served.
//   US only; a listing is served only if the vendor calls it active, it is not in the STALE SET (hidden: the vendor's last_seen_at is more than 24 hours old at a stale poll, lib/forsale/sync.js) and it is not gone; held sources never;
//   one card per car (a VIN under two sources: the dealer's own page wins); every listing goes through the resolver and one the resolver cannot place is not served (and is counted).
//   Presence rechecks no longer reach us (the sync takes only changes), so a row's own last_seen is NOT a freshness test any more: the stale poll is, and a source whose polls have lapsed is not served (serve.js).
// Pure: no reads, no clock of its own (the caller passes `now`), so the check can exercise each rule on its own.
import SOURCES from "../../data/forsaleSources.json" with { type: "json" };
import { statedMiles } from "../placeholderMiles.js";

export const FRESH_MS = 24 * 3600e3;           // the stale cutoff: a listing the vendor last saw more than this long ago is hidden (stale poll) and not served until it is seen again
export const SOURCE_TABLE = SOURCES.sources;   // { source: { type, hold, reason? } }, data/forsaleSources.json

export const typeOf = source => { const s = SOURCE_TABLE[String(source || "")]; return s && (s.type === "dealer" || s.type === "classified") ? s.type : null; };
export const isHeld = source => { const s = SOURCE_TABLE[String(source || "")]; return !!(s && s.hold === true); };
// THE ORDER THE PULL WALKS AND WHAT IT ASKS FOR: the dealers' own pages first (small, and the ones a dealer stands behind), then the classifieds, with autotraderclassics LAST and switched on its own
// (it is nearly half the volume, largely copies of dealers' own pages, and keeps stamping gone cars as seen). groups: { dealers, classifieds, autotraderclassics } (data/forsaleBudget.json "pull"); a held source is never in it.
export const SEPARATE_LAST = "autotraderclassics";
// groups: { dealers, classifieds, autotraderclassics } and, for any one source, its own switch by name (a boolean under the source's name wins over its group: dupontregistry: false takes that one classified out and leaves the others).
export function pulledSources(groups = { dealers: true, classifieds: true, autotraderclassics: true }) {
  const all = Object.keys(SOURCE_TABLE).filter(k => typeOf(k) && !isHeld(k));
  const on = k => typeof groups[k] === "boolean" ? groups[k] : typeOf(k) === "dealer" ? !!groups.dealers : !!groups.classifieds;
  const dealers = all.filter(k => typeOf(k) === "dealer" && on(k));
  const classifieds = all.filter(k => typeOf(k) === "classified" && k !== SEPARATE_LAST && on(k));
  const last = all.includes(SEPARATE_LAST) && on(SEPARATE_LAST) && groups[SEPARATE_LAST] === true ? [SEPARATE_LAST] : [];
  return [...dealers, ...classifieds, ...last];
}

export const typeWord = type => (type === "dealer" ? "Dealer" : type === "classified" ? "Classified" : null);

const txt = v => (v == null ? "" : String(v)).trim();
export const normVin = v => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
// a VIN that can be matched across sources: the 17 character form (no I, O or Q). A short or placeholder chassis number is never matched across sources: a match is not guessed.
export const isFullVin = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(normVin(v));

// US ONLY: the vendor's country is US AND the price is in dollars (the census SET RULE). A listing coded US but priced in euros or pounds, or with no country, is not US.
export function isUs(rec) { return txt(rec && rec.country_code).toUpperCase() === "US" && txt(rec && rec.currency).toUpperCase() === "USD"; }

// WHAT THE PULL KEEPS, ONE REASON WHEN IT DOES NOT (the counts the pull reports). rec is a vendor record (fields and values; no description is ever read).
// opts.anyStatus: the change poll asks for every status (a sale, a withdrawal or a gone advert is a CHANGE we apply), so a non-active record is kept here and the caller decides (a listing never stored is not stored as sold).
export function pullVerdict(rec, opts = {}) {
  const source = txt(rec && rec.source).toLowerCase();
  if (!typeOf(source)) return { keep: false, why: "unknown_source" };
  if (isHeld(source)) return { keep: false, why: "held_source" };
  if (!isUs(rec)) return { keep: false, why: "not_us" };
  if (!opts.anyStatus && txt(rec.status).toLowerCase() !== "active") return { keep: false, why: "not_active" };
  if (!txt(rec.source_listing_id) && rec.id == null) return { keep: false, why: "no_id" };
  return { keep: true, why: null };
}

// THE ROW A PULLED RECORD BECOMES (no seller name, no description, no zip): only what a card needs.
export const STATUSES = ["active", "sold", "withdrawn", "gone", "unknown"];
// THE VENDOR'S ASKING PRICE HISTORY AS OUR OWN DATED PRICE FACTS: [{ price, observed_at }], oldest first, whole dollars, only entries with a price and a date, no text. The vendor dates when it OBSERVED a price, not when the seller changed it.
export function priceFacts(list) {
  const out = []; const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const price = Number(e && e.price), at = e && e.observed_at, t = Date.parse(at);
    if (!(price > 0) || !Number.isFinite(t)) continue;
    const k = Math.round(price) + "|" + new Date(t).toISOString(); if (seen.has(k)) continue; seen.add(k);
    out.push({ price: Math.round(price), observed_at: new Date(t).toISOString() });
  }
  out.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  return out.slice(-40);
}
// what we kept before plus what the vendor sends now: one list, oldest first (a fact once dated stays, even when the vendor's own list is shorter)
export const mergeFacts = (kept, sent) => priceFacts([...(Array.isArray(kept) ? kept : []), ...(Array.isArray(sent) ? sent : [])]);
// A LISTING THE VENDOR LAST SAW MORE THAN 24 HOURS BEFORE `nowMs` is stale (equal is not; an unknown time is not in the stale set, the vendor's own rule) and is stored hidden
export const isStaleSeen = (lastSeenIso, nowMs) => { const t = Date.parse(lastSeenIso); return Number.isFinite(t) && nowMs - t > FRESH_MS; };

export function rowOf(rec, pulledAtIso) {
  const source = txt(rec.source).toLowerCase();
  const id = txt(rec.source_listing_id) || txt(rec.id);
  const num = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
  const unit = txt(rec.mileage_unit).toLowerCase();
  const mi = statedMiles(num(rec.mileage));   // a filler mileage is stored as none (lib/placeholderMiles.js)
  const place = [txt(rec.city), txt(rec.state)].filter(Boolean).join(", ") || txt(rec.location).slice(0, 80) || null;
  const seen = txt(rec.last_seen_at);
  const status = STATUSES.includes(txt(rec.status).toLowerCase()) ? txt(rec.status).toLowerCase() : "unknown";
  const asking = num(rec.asking_price) ? Math.round(num(rec.asking_price)) : null;
  const lastSeen = seen && !Number.isNaN(Date.parse(seen)) ? new Date(seen).toISOString() : null;
  let facts = priceFacts(rec.asking_price_history);
  if (asking && (!facts.length || facts[facts.length - 1].price !== asking)) facts = priceFacts([...facts, { price: asking, observed_at: txt(rec.last_asking_price_observed_at) || pulledAtIso }]);   // a price the vendor lists but has not yet put in its history is still dated, by when it was observed
  return {
    source, source_listing_id: id, source_type: typeOf(source), vendor_id: Number(rec.id) > 0 ? Number(rec.id) : null,
    title: txt(rec.title).slice(0, 200) || null,
    url: txt(rec.url) || null, image_url: txt(rec.featured_image_url) || null,
    asking_price_usd: asking, price_history: facts,
    mileage: mi == null ? null : statedMiles(Math.round(/^km|kilomet/.test(unit) ? mi * 0.621371 : mi)),
    location: place, state: txt(rec.state) || null, country_code: "US",
    vin: txt(rec.vin) || null, vin_norm: normVin(rec.vin) || null,
    year: Number(rec.year) > 1800 ? Number(rec.year) : null,
    body: txt(rec.body_style).slice(0, 40) || null, transmission: txt(rec.transmission).slice(0, 60) || null, exterior_color: txt(rec.exterior_color).slice(0, 40) || null,
    make: txt(rec.ocd_make_name) || txt(rec.listing_make) || null,
    model: txt(rec.ocd_model_name) || txt(rec.listing_model) || null,
    status, changed_at: txt(rec.changed_at) && !Number.isNaN(Date.parse(txt(rec.changed_at))) ? new Date(rec.changed_at).toISOString() : null,
    last_seen: lastSeen,
    hidden: isStaleSeen(lastSeen, Date.parse(pulledAtIso)), hidden_at: isStaleSeen(lastSeen, Date.parse(pulledAtIso)) ? pulledAtIso : null,   // seen again (or seen within 24 hours): not hidden; older than 24 hours: hidden, as the stale poll would have it
    pulled_at: pulledAtIso, gone: status !== "active", gone_at: status !== "active" ? pulledAtIso : null, updated_at: pulledAtIso
  };
}

// WHY A STORED ROW IS NOT SERVED (one reason, in order), or null when it is. now: ms. ctx.live: the set of sources whose sync is current (serve.js: loaded, and a change poll and a stale poll within the lapse window); when given, any other source is "sync_lapsed".
export function heldBack(row, now, engineVersion, ctx) {
  if (!row) return "no_row";
  if (!typeOf(row.source)) return "unknown_source";
  if (isHeld(row.source)) return "held_source";
  if (row.country_code && String(row.country_code).toUpperCase() !== "US") return "not_us";
  if (row.gone === true) return "gone";
  if (row.status && row.status !== "active") return "not_active";          // sold, withdrawn, gone or unknown at the vendor
  if (row.hidden === true) return "stale";                                  // in the stale set: not seen at its source for more than 24 hours; back when a later change or stale poll shows it seen again
  if (!Number.isFinite(Date.parse(row.last_seen))) return "no_presence";    // the vendor has never said when it saw it
  if (ctx && ctx.live && !ctx.live.has(row.source)) return "sync_lapsed";   // the polls that keep this source honest have not run lately: it is not served
  if (row.resolve_state !== "resolved" || !row.car || !row.car.key) return row.resolve_state === "unresolved" ? "unresolved" : "resolve_pending";
  if (!(Number(row.asking_price_usd) > 0)) return "no_price";
  // A LISTING WHOSE READ HAS NOT LANDED IS SERVED, with its asking line and the holding line in the Sam box (lib/forsale/serve.js cardOf, "forsale.holding"): no range and no number until the engine's read is stored (Lane D, Nov 19 2026; before this a card with no read was held back and the crew's count of cars for sale stayed at the cars read so far).
  return null;
}

// ONE CARD PER CAR. rows: the servable rows. A VIN of 17 characters listed under more than one source is one car: the dealer's own page wins over a marketplace copy; between two of the same
// type the source seen most recently wins, then the source name (so the choice never depends on the order the rows came in). A row with no full VIN is never matched to another source's: a match is not
// guessed, so a car listed without a VIN under two sources shows twice (counted by the caller as no_vin_twins_possible). The same source listing the same VIN twice keeps the one seen last.
// ONE CARD PER CAR (Lane D, Nov 20 2026; Lane F's launch census found the same car as two cards in 3.0% of its sample). The dealer's own page wins, then the most recently seen, then the source name, then the row.
// Two ways to know it is one car. (1) A full VIN (17 characters). (2) NO VIN to go by (a dealer's page without it, a marketplace copy without it, a short chassis number): the same year, make, model, stated mileage AND asking price, in the same state when both name one. The table keeps no dealer name, so the place stands for the dealer.
// A mileage nobody stated (lib/placeholderMiles.js) never matches on the mileage: two cars with no stated mileage match only on the same city and state as well (a listing with a mileage never matches one without), and two rows with two different full VINs are two cars whatever else they share. The class: any pair of sources that list one car, found by the key and not by the source pair.
const matchKey = r => {
  const mi = statedMiles(r.mileage), p = Number(r.asking_price_usd), norm = v => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!(p > 0) || !(Number(r.year) > 1800) || !norm(r.make) || !norm(r.model)) return null;
  if (mi > 0) return [Number(r.year), norm(r.make), norm(r.model), mi, Math.round(p)].join("|");
  const place = norm(r.location); return place ? ["nomiles", Number(r.year), norm(r.make), norm(r.model), Math.round(p), place].join("|") : null;   // no mileage on either side: the same city and state stands in for it
};
const stateOf = r => String(r.state || "").toUpperCase().trim() || null;
export function onePerCar(rows) {
  const rank = r => [r.source_type === "dealer" ? 0 : 1, -(Date.parse(r.last_seen) || 0), String(r.source), -(Number(r.id) || 0)];
  const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return true; if (x[i] > y[i]) return false; } return false; };
  const keep = new Map(), out = [], dropped = [], pairs = [];
  const drop = (loser, winner, by) => { dropped.push(loser); pairs.push({ dropped: loser, kept: winner, by }); };
  for (const r of rows) {
    if (!isFullVin(r.vin_norm || r.vin)) { out.push(r); continue; }
    const k = normVin(r.vin_norm || r.vin), cur = keep.get(k);
    if (!cur) { keep.set(k, r); continue; }
    if (better(r, cur)) { drop(cur, r, "vin"); keep.set(k, r); } else drop(r, cur, "vin");
  }
  const pool = out.concat([...keep.values()]), groups = new Map(), result = [];
  for (const r of pool) { const k = matchKey(r); if (k == null) { result.push(r); continue; } if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const vinOf = r => isFullVin(r.vin_norm || r.vin) ? normVin(r.vin_norm || r.vin) : null;
  for (const g of groups.values()) {
    const kept = [];
    for (const r of g.slice().sort((a, b) => better(a, b) ? -1 : better(b, a) ? 1 : 0)) {
      const twin = kept.find(k => !(vinOf(k) && vinOf(r) && vinOf(k) !== vinOf(r)) && !(stateOf(k) && stateOf(r) && stateOf(k) !== stateOf(r)));
      if (twin) drop(r, twin, "match"); else kept.push(r);
    }
    result.push(...kept);
  }
  return { rows: result, droppedAsTwin: dropped.length, pairs };
}

// THE ROW IN THE SHAPE FIND'S MATCHING READS (the shape a live auction row has), so a dealer car or a classified is matched by the SAME search code as an auction: searchLive over these rows.
// withPrice false (the read is made without a price: an asking price is never a bid, and no bid line is ever built from it).
export function liveShape(row, withPrice = true) {
  const p = Number(row.asking_price_usd) > 0 ? Number(row.asking_price_usd) : null;
  return {
    id: row.id, source: row.source, listing_title: row.title, make: row.make, model: row.model, year: row.year, mileage: statedMiles(row.mileage), mileage_unit: "mi",
    body: row.body || null, transmission: row.transmission || null, exterior_color: row.exterior_color || null, location: row.location || null, country: "US", currency: "USD",
    current_bid: withPrice ? p : null, current_bid_usd: withPrice ? p : null, bid_count: 0, end_time: null, status: "classified", has_reserve: null, description: null, special_flag: null,
    vin_norm: row.vin_norm || null, photo_url: row.image_url || null, url: row.url || null, _fs: row
  };
}
