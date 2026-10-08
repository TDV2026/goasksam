// What a live listing's numbers can be trusted for (Lane C, Oct 2026). /buy (lib/live/search.js
// listingFacts + searchLive) and Tasks read a listing only through this: a price that may not be dollars,
// a mileage that may be kilometres, a $0 bid (no evidence of the real bid), and specials (race cars,
// replicas, Singer) are never matched on or shown as if they were plain facts. Reads the pull's own
// columns when they exist (mileage_unit, special_flag, docs/supabase-live-listings-v4.sql) and works
// from the title and description when they do not.

// Places where a lot may be priced in euros or pounds (Canada is not here: its lots run in dollars).
const FOREIGN_PLACES = /^(germany|deutschland|united kingdom|uk|england|scotland|wales|northern ireland|ireland|france|italy|spain|portugal|netherlands|the netherlands|belgium|luxembourg|switzerland|austria|sweden|norway|denmark|finland|monaco|czech republic|czechia|poland|hungary|greece|japan|australia|new zealand|united arab emirates|uae|south africa|hong kong|singapore)$/i;
// Platforms that only ever run auctions in US dollars: a lot with no currency stated is in dollars.
// Anywhere else a missing currency stays empty and the lot carries no dollar figure.
export const USD_ONLY_SOURCES = new Set(["bringatrailer", "carsandbids", "pcarmarket", "hagerty", "hemmings", "mecum", "barrettjackson", "acc", "autohunter"]);
const US_COUNTRY = /^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i;
const US_STATE = /^(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)(\s+\d{5})?$/i;
// Located in the United States: the country says so, or (no country) the location ends in a US state.
export function inUS(r) {
  const c = String(r.country || "").trim();
  if (c) return US_COUNTRY.test(c);
  const tail = String(r.location || "").split(",").pop().trim();
  return !!tail && US_STATE.test(tail);
}
// Specials: one shared list (lib/live/specialFlag.js), also written by the pull as special_flag.
import { specialFlag } from "./specialFlag.js";

export function liveTrust(r) {
  const title = String(r.listing_title || ""), desc = String(r.description || ""), loc = String(r.location || "");
  const cur = r.currency ? String(r.currency).toUpperCase() : (USD_ONLY_SOURCES.has(String(r.source || "")) ? "USD" : null);
  // Foreign-price signals on a lot stored as USD: a non-US country, a non-US location, or the listing
  // quoting euros or pounds.
  let foreignSignal = null;
  // Canada is North American dollars territory for these auctions (Bring a Trailer and Cars & Bids run
  // Canadian lots in USD), so it is not a foreign-price signal.
  if (r.country && !US_COUNTRY.test(String(r.country).trim()) && !/^(ca|can|canada)$/i.test(String(r.country).trim())) foreignSignal = "country " + r.country;
  else if (loc) { const tail = loc.split(",").pop().trim(); if (FOREIGN_PLACES.test(tail)) foreignSignal = "location " + loc; }
  if (!foreignSignal && /(€|£)\s?\d|\d\s?(€|£)|\b(eur|gbp|chf)\s?\d/i.test(title + " " + desc)) foreignSignal = "price quoted in euros or pounds";
  const bid = Number(r.current_bid), usd = Number(r.current_bid_usd);
  let priceState, priceUsd = null;
  if (!(bid > 0)) priceState = r.current_bid == null ? "none" : "zero";          // $0: no evidence of the real bid
  else if (!cur) priceState = "unconverted";                                       // currency unknown: no dollar figure
  else if (cur !== "USD") { priceState = usd > 0 ? "converted" : "unconverted"; priceUsd = usd > 0 ? Math.round(usd) : null; }
  else if (foreignSignal) priceState = "suspect";                                 // stored as dollars, may not be
  else { priceState = "usd"; priceUsd = Math.round(usd > 0 ? usd : bid); }
  // Mileage unit, from the listing's own words: the title first ("45k-Mile", "36k-Kilometer"), then the
  // description. Only "miles" is trusted against a miles limit or shown as miles.
  let unit = "unknown";
  if (/\bk?-?(kilomet(er|re)s?|kms?)\b/i.test(title) && /\d/.test(title)) unit = "km";
  else if (/\d[\d,.]*k?-?\s?miles?\b/i.test(title)) unit = "miles";
  else {
    const km = /\d[\d,.]*\s*k?\s*(kilomet(er|re)s?|kms?)\b/i.test(desc), mi = /\d[\d,.]*\s*k?\s*miles?\b/i.test(desc);
    unit = km && !mi ? "km" : mi && !km ? "miles" : "unknown";
  }
  // A title that states kilometres ("22k-Kilometer", "2,200-Kilometer"): the kilometres as stated, and
  // miles computed from them (never the stored number read as miles).
  let km = null, kmMiles = null;
  if (unit === "km") { const m = /(\d[\d,.]*)\s*(k)?-?\s*(kilomet|km)/i.exec(title); if (m) { km = Math.round(parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)); if (km > 0) kmMiles = Math.round(km * 0.621371); } }
  // The pull's own unit, when it recorded one (it converts kilometres to miles before storing).
  const pullUnit = String(r.mileage_unit || "").toLowerCase();
  if (pullUnit === "mi" && unit === "unknown") unit = "miles";
  if (pullUnit === "km" && unit !== "km") { unit = "km"; if (!km && Number(r.mileage) > 0) { kmMiles = Number(r.mileage); km = Math.round(kmMiles / 0.621371); } }
  // The number: the mileage field, else the title ("45k-Mile"), else the description ("shows 12,345 miles").
  let stated = Number(r.mileage) > 0 ? Number(r.mileage) : null;
  if (!stated) { const m = /\b([\d][\d,.]*)\s*(k)?[- ]mile/i.exec(title); if (m) stated = Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)); }
  if (!stated && desc) { const m = /\b(?:shows|showing|indicates|displays|reads|has covered|covered)\s+(?:just\s+|only\s+|approximately\s+|roughly\s+|under\s+)?([\d][\d,]{1,7})\s*(?:miles|mi)\b/i.exec(desc); if (m) stated = Number(m[1].replace(/,/g, "")); }
  // No unit stated: a US lot reads as miles (marked assumed); anywhere else it stays unknown, never
  // compared with a miles limit and never shown as miles.
  let milesAssumed = false;
  if (unit === "unknown" && stated && inUS(r)) { unit = "miles"; milesAssumed = true; }
  const special = r.special_flag || specialFlag(title, r.make);
  return { priceState, priceUsd, foreignSignal, unit, km, miles: unit === "miles" ? stated : (kmMiles || null), milesAssumed, special };
}

// Is a special asked for by the task itself ("find me a Singer", "a GT3 Cup car")?
export function specialAsked(special, task) {
  if (!special) return true;
  const words = `${task.words || ""} ${JSON.stringify(task.filters || {})}`.toLowerCase();
  const key = { Singer: /singer/, RUF: /\bruf\b/, RWB: /rwb|rauh/, "race car": /\b(cup|race|racing|rsr|gt\d?\s*r|rally|track)\b/, replica: /replica|look.?a.?like/, tribute: /tribute/, recreation: /recreation/, clone: /clone/, continuation: /continuation/, homage: /homage/, restomod: /restomod|backdate|outlaw|reimagined|singer/, "period tuner": /tuner|amg hammer|alpina|ruf|koenig|gemballa|brabus/, "kit car": /kit/ }[special];
  return !!(key && key.test(words));
}
