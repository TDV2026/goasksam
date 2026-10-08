// What a live listing's numbers can be trusted for (Lane C, Oct 2026). Tasks matching and update copy
// read a listing only through this: a price that may not be dollars, a mileage that may be kilometres or
// has no stated unit, a $0 bid (no evidence of the real bid), and specials (race cars, replicas, Singer)
// are never matched on or shown as if they were plain facts. The pull itself is not changed here.

// Places where a lot may be priced in euros or pounds (Canada is not here: its lots run in dollars).
const FOREIGN_PLACES = /^(germany|deutschland|united kingdom|uk|england|scotland|wales|northern ireland|ireland|france|italy|spain|portugal|netherlands|the netherlands|belgium|luxembourg|switzerland|austria|sweden|norway|denmark|finland|monaco|czech republic|czechia|poland|hungary|greece|japan|australia|new zealand|united arab emirates|uae|south africa|hong kong|singapore)$/i;
const US_COUNTRY = /^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i;
// Specials: never a plain example of the car. Kept out of matches unless the buyer's task names them.
const SPECIALS = [
  [/\bsinger\b/i, "Singer"], [/\bruf\b/i, "RUF"], [/\b(rwb|rauh[\s-]?welt)\b/i, "RWB"],
  [/\b(gt3\s*cup|cup\s*car|supercup|carrera\s*cup|gt3\s?r\b|rsr\b)/i, "race car"], [/\brace[\s-]?(car|prepared|prepped|spec)\b|\bracecar\b/i, "race car"],
  [/\breplica\b/i, "replica"], [/\btribute\b/i, "tribute"], [/\brecreation\b/i, "recreation"], [/\bclone\b/i, "clone"],
  [/\bcontinuation\b/i, "continuation"], [/\b(re-?imagined|backdate[d]?|outlaw|restomod)\b/i, "restomod"], [/\bkit\s*car\b/i, "kit car"]
];

export function liveTrust(r) {
  const title = String(r.listing_title || ""), desc = String(r.description || ""), loc = String(r.location || "");
  const cur = String(r.currency || "USD").toUpperCase();
  // Foreign-price signals on a lot stored as USD: a non-US country, a non-US location, or the listing
  // quoting euros or pounds.
  let foreignSignal = null;
  if (r.country && !US_COUNTRY.test(String(r.country).trim())) foreignSignal = "country " + r.country;
  else if (loc) { const tail = loc.split(",").pop().trim(); if (FOREIGN_PLACES.test(tail)) foreignSignal = "location " + loc; }
  if (!foreignSignal && /(€|£)\s?\d|\d\s?(€|£)|\b(eur|gbp|chf)\s?\d/i.test(title + " " + desc)) foreignSignal = "price quoted in euros or pounds";
  const bid = Number(r.current_bid), usd = Number(r.current_bid_usd);
  let priceState, priceUsd = null;
  if (!(bid > 0)) priceState = r.current_bid == null ? "none" : "zero";          // $0: no evidence of the real bid
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
  let special = null;
  for (const [re, why] of SPECIALS) if (re.test(title)) { special = why; break; }
  return { priceState, priceUsd, foreignSignal, unit, miles: unit === "miles" && Number(r.mileage) > 0 ? Number(r.mileage) : null, special };
}

// Is a special asked for by the task itself ("find me a Singer", "a GT3 Cup car")?
export function specialAsked(special, task) {
  if (!special) return true;
  const words = `${task.words || ""} ${JSON.stringify(task.filters || {})}`.toLowerCase();
  const key = { Singer: /singer/, RUF: /\bruf\b/, RWB: /rwb|rauh/, "race car": /\b(cup|race|rsr|gt\d?\s*r)\b/, replica: /replica/, tribute: /tribute/, recreation: /recreation/, clone: /clone/, continuation: /continuation/, restomod: /restomod|backdate|outlaw|reimagined/, "kit car": /kit/ }[special];
  return !!(key && key.test(words));
}
