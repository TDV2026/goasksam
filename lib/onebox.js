// One Box: "what have cars like yours actually sold for" from our own archive.
// Archive-only (never a live OldCarsData call), read-only, no persistence. Given a
// resolved vehicle + optional generation, it selects a single honest result tier
// (3+/2/1/0) from genuinely comparable STOCK sales and returns the display facts.
//
// Locked product invariants encoded here:
// - Comp candidates are filtered to stock + same variant BEFORE selection, never
//   sorted-then-shown (a modified/backdated car never stands in for a stock one).
// - Time window is a hard deterministic ceiling: 12 months first; if fewer than 3
//   qualifying sales, expand ONCE to 24 months; stop. Never widen further.
// - The larger qualifying set is used ONLY to choose the result. At most three
//   cards are ever returned; the dataset is never exposed (no see-more of any kind).
// - Outliers/specials are filtered out and returned nowhere.
// - No valuation number, no counts beyond the single scoped stat (count + window).
import { supabaseSelect } from "./_supabase.js";

const DAY = 864e5;

// Title markers that mean "not a stock, standard example."
const MOD_MARKERS = [
  "backdate", "backdated", "outlaw", "restomod", "resto-mod", "hot rod", "hotrod",
  "custom", "widebody", "wide-body", "tribute", "recreation", "replica", "singer",
  "rwb", "safari", "turbo-look", "turbo look", "slantnose", "slant nose", "swap",
  "project", "race car", "competition", "continuation", "kit car", "tool room",
  "toolroom", "gasser", "chopped", "rat rod", "parts car"
];

// Body-style vocabulary, so a Coupe query never draws in a Targa or Cabriolet.
const BODY_SYNONYMS = {
  coupe: ["coupe", "coupé", "berlinetta", "fastback", "hardtop", "notchback"],
  targa: ["targa"],
  cabriolet: ["cabriolet", "cabrio", "convertible", "spyder", "spider", "roadster", "drophead", "dhc"],
  convertible: ["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead", "dhc"],
  roadster: ["roadster", "spyder", "spider", "convertible", "cabriolet"],
  sedan: ["sedan", "saloon", "berlina"],
  wagon: ["wagon", "estate", "avant", "touring", "shooting brake"]
};

const PLATFORM_NAMES = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket",
  hagerty: "Hagerty", hemmings: "Hemmings", rmsothebys: "RM Sotheby's", gooding: "Gooding & Co",
  sothebysmotorsport: "Sotheby's Motorsport", autohunter: "AutoHunter", mbmarket: "MB Market",
  allcollectorcars: "AllCollectorCars", acc: "AllCollectorCars", bonhams: "Bonhams",
  barrettjackson: "Barrett-Jackson", mecum: "Mecum", carandclassic: "Car & Classic",
  collectingcars: "Collecting Cars"
};
const platformName = s => PLATFORM_NAMES[String(s || "").toLowerCase()] || (s ? String(s) : "");

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function soldLabel(dateStr) {
  if (!dateStr) return "Sold recently";
  const p = String(dateStr).slice(0, 10).split("-");
  if (p.length < 2) return "Sold recently";
  return `Sold ${MONTHS[Number(p[1])] || ""} ${p[0]}`.replace(/\s+/g, " ").trim();
}

// Body style the seller actually typed (never inferred). Null = unspecified.
export function detectBodyStyle(text) {
  const t = String(text || "").toLowerCase();
  for (const canonical of ["targa", "coupe", "cabriolet", "convertible", "roadster", "wagon", "sedan"]) {
    if (t.includes(canonical)) return canonical;
  }
  return null;
}

// A candidate row (flattened select) qualifies when it is a real sold price, has a
// usable photo, is stock (empty modifications + no modified-title marker), and,
// when the seller named a body style, matches it and is not a different variant.
function isQualifying(row, spec) {
  if (!(Number(row.price) > 0)) return false;
  if (!row.image) return false;
  const title = String(row.rtitle || row.raw_title || "").toLowerCase();
  // stock: modifications is a jsonb array; "[]"/empty/null is stock.
  const mods = row.mods == null ? "" : String(row.mods).trim();
  if (mods && mods !== "[]" && mods.toLowerCase() !== "null") return false;
  if (MOD_MARKERS.some(w => title.includes(w))) return false;
  // variant/body discipline. When a body style was named, require it and exclude
  // the others; always exclude a clearly different performance variant of the base.
  if (spec.excludeVariants && spec.excludeVariants.some(w => title.includes(w))) return false;
  if (spec.bodyStyle) {
    const want = BODY_SYNONYMS[spec.bodyStyle] || [spec.bodyStyle];
    const bodyField = String(row.body || "").toLowerCase();
    const bodyHit = want.some(w => bodyField.includes(w) || title.includes(w));
    if (!bodyHit) return false;
    // exclude the wrong bodies explicitly (a Coupe query must drop Targa/Cabriolet)
    for (const [canon, syn] of Object.entries(BODY_SYNONYMS)) {
      if (canon === spec.bodyStyle) continue;
      if (syn.includes(spec.bodyStyle)) continue; // overlapping family (convertible/roadster)
      const otherHit = syn.some(w => bodyField.includes(w) || title.includes(w));
      const alsoWanted = want.some(w => bodyField.includes(w) || title.includes(w));
      if (otherHit && !alsoWanted) return false;
    }
  }
  return true;
}

function toCard(row, rank, spec) {
  const mi = Number(row.mileage);
  return {
    rank,
    price: Math.round(Number(row.price)),
    mileage: Number.isFinite(mi) && mi > 0 ? Math.round(mi) : null, // null renders TMU
    spec: spec.cardSpec,
    soldLabel: soldLabel(row.auction_end_date),
    platform: platformName(row.source),
    image: row.image
  };
}

// Resolve the comparison window + labels from the resolved vehicle and generation.
function buildSpec(vehicle, generation, searchText) {
  const make = vehicle.make || "";
  const model = vehicle.model || "";
  const trim = vehicle.trim || "";
  const year = Number(vehicle.year) || null;
  const bodyStyle = detectBodyStyle(searchText) || detectBodyStyle(vehicle.raw) || detectBodyStyle(vehicle.canonicalLabel);
  // base-variant exclusions: if the seller did NOT ask for a Turbo/GT car, a Turbo
  // in the same years is a different market and must not stand in as a comp.
  const wantTurbo = /turbo/i.test(searchText || "") || /turbo/i.test(trim);
  const excludeVariants = wantTurbo ? [] : ["turbo", " gt2", " gt3", "gt3", "gt2", "speedster", "anniversary", " rs "];
  let yearMin = null, yearMax = null, genCode = null;
  if (generation && generation.yearStart && generation.yearEnd) {
    yearMin = generation.yearStart; yearMax = generation.yearEnd; genCode = generation.code || null;
  } else if (year) {
    yearMin = year - 2; yearMax = year + 2;
  }
  const subject = [trim || model, bodyStyle ? bodyStyle.charAt(0).toUpperCase() + bodyStyle.slice(1) : ""].filter(Boolean).join(" ");
  const cardSpec = [subject, genCode].filter(Boolean).join(", ");
  const youText = [year, trim || model].filter(Boolean).join(" ");
  let windowDesc;
  if (yearMin && yearMax && genCode) windowDesc = `${yearMin} to ${yearMax} ${genCode} ${subject}s`;
  else if (yearMin && yearMax) windowDesc = `${yearMin} to ${yearMax} ${subject} sales`;
  else windowDesc = `${subject} sales`;
  const resolvedSpec = `Comparing your ${youText} with equivalent ${windowDesc}.`;
  return { make, model, trim, year, bodyStyle, excludeVariants, yearMin, yearMax, genCode, subject, cardSpec, resolvedSpec };
}

async function fetchQualifying(spec, sinceIso, env) {
  const cols = "price,auction_status,auction_end_date,source,raw_title,year,image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style,mods:raw_record->>modifications,rtitle:raw_record->>title";
  let q = `vehicle_market_records?select=${cols}` +
    `&make=ilike.${encodeURIComponent(spec.make)}` +
    `&model=ilike.${encodeURIComponent("*" + spec.model + "*")}` +
    `&auction_status=ilike.sold` +
    `&price=not.is.null` +
    `&raw_record->>featured_image_url=not.is.null` +
    `&auction_end_date=gte.${sinceIso.slice(0, 10)}` +
    `&order=price.desc&limit=1000`;
  if (spec.yearMin) q += `&year=gte.${spec.yearMin}`;
  if (spec.yearMax) q += `&year=lte.${spec.yearMax}`;
  const rows = (await supabaseSelect(env, q)) || [];
  return rows.filter(r => isQualifying(r, spec));
}

const SAM_LINE = {
  three: "Most of what actually sells sits around that middle car.",
  two: "There aren't enough comparable sales to call this a market range yet, so I'm showing you the two relevant sales I have.",
  one: "There isn't enough recent comparable activity here to show you an honest market range, but this is one relevant sale.",
  zero: "I do not have enough comparable sales to show you an honest spread here. Results like this sit scattered across the record, and a range would invent a pattern that is not there."
};

// TEMP diagnostic (removed with the underspecified-scope fix): classify a row's body.
function _dbgBody(r) {
  const t = (String(r.body || "") + " " + String(r.rtitle || r.raw_title || "")).toLowerCase();
  for (const b of ["targa", "cabriolet", "convertible", "roadster", "spyder", "spider", "coupe"]) if (t.includes(b)) return b;
  return "unstated";
}

export async function runOneBox(vehicle, generation, searchText, env, debug) {
  const spec = buildSpec(vehicle, generation, searchText);
  const now = Date.now();
  // Hard deterministic ceiling: 12 months, then a single expansion to 24 months.
  const iso12 = new Date(now - 365 * DAY).toISOString();
  let pool = await fetchQualifying(spec, iso12, env);
  let windowLabel = "last 12 months";
  if (pool.length < 3) {
    const iso24 = new Date(now - 730 * DAY).toISOString();
    pool = await fetchQualifying(spec, iso24, env);
    windowLabel = "past 2 years";
  }
  pool.sort((a, b) => Number(a.price) - Number(b.price)); // ascending by price
  const n = pool.length;
  const base = { resolvedSpec: spec.resolvedSpec, count: n, windowLabel, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year } };
  if (debug) {
    const counts = {}; pool.forEach(r => { const b = _dbgBody(r); counts[b] = (counts[b] || 0) + 1; });
    base.debug = { specBodyStyle: spec.bodyStyle, specTrim: spec.trim, excludeVariants: spec.excludeVariants, yearMin: spec.yearMin, yearMax: spec.yearMax, poolSize: n, bodyCounts: counts, pool: pool.map(r => ({ price: Math.round(Number(r.price)), body: _dbgBody(r), title: r.rtitle || r.raw_title })) };
  }

  if (n >= 3) {
    const midIdx = Math.ceil(n / 2) - 1; // lower-middle for even counts
    return { ...base, tier: "three", samLine: SAM_LINE.three, cards: [
      toCard(pool[n - 1], "HIGH SALE", spec),
      toCard(pool[midIdx], "MIDDLE OF THE MARKET", spec),
      toCard(pool[0], "LOW SALE", spec)
    ] };
  }
  if (n === 2) {
    return { ...base, tier: "two", samLine: SAM_LINE.two, cards: [
      toCard(pool[1], "RECENT SALE", spec), toCard(pool[0], "RECENT SALE", spec)
    ] };
  }
  if (n === 1) {
    return { ...base, tier: "one", samLine: SAM_LINE.one, cards: [toCard(pool[0], "ONE RECENT COMPARABLE SALE", spec)] };
  }
  return { ...base, tier: "zero", samLine: SAM_LINE.zero, cards: [] };
}
