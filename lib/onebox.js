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

// Body-style buckets (targa/cabriolet/convertible/roadster checked before coupe so a
// "Targa Coupe" title reads as Targa). Chips offered dynamically from what's present.
const BODY_BUCKETS = [
  { style: "targa", label: "Targa", words: ["targa"] },
  { style: "cabriolet", label: "Cabriolet", words: ["cabriolet", "cabrio"] },
  { style: "convertible", label: "Convertible", words: ["convertible", "drophead", "dhc"] },
  { style: "roadster", label: "Roadster", words: ["roadster", "spyder", "spider"] },
  { style: "coupe", label: "Coupe", words: ["coupe", "coupé", "berlinetta", "fastback", "hardtop", "notchback"] }
];
function classifyBody(row) {
  const t = (String(row.body || "") + " " + String(row.rtitle || row.raw_title || "")).toLowerCase();
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  return null;
}
// Statistical outlier guard: a rare high-value variant (L88, Shelby, big-block) must
// not anchor a card. Drop candidates a gross multiple off the median; if the core is
// still implausibly spread, the query is underspecified (there is no clean discrete
// choice to offer, so a threshold is the mechanism).
const OUTLIER_HIGH = 4, OUTLIER_LOW = 0.2, IMPLAUSIBLE_SPREAD = 6;
function medianPrice(sortedAsc) {
  const p = sortedAsc.map(r => Number(r.price));
  const n = p.length;
  return n % 2 ? p[(n - 1) / 2] : (p[n / 2 - 1] + p[n / 2]) / 2;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function joinList(a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function bodyPrompt(labels) { return `These sold as ${joinList(labels)}, and they price differently. Which one is yours?`; }

// (Re)compute the display labels from the current scope + resolved bodyStyle.
function relabel(spec) {
  const subject = [spec.trim || spec.model, spec.bodyStyle ? cap(spec.bodyStyle) : ""].filter(Boolean).join(" ");
  spec.subject = subject;
  spec.cardSpec = [subject, spec.genCode].filter(Boolean).join(", ");
  const youText = [spec.year, spec.trim || spec.model].filter(Boolean).join(" ");
  if (spec.yearMin && spec.yearMax && spec.genCode) spec.resolvedSpec = `Comparing your ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${spec.genCode} ${subject}s.`;
  else if (spec.yearMin && spec.yearMax) spec.resolvedSpec = `Comparing your ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${subject} sales.`;
  else spec.resolvedSpec = `Comparing your ${youText} with equivalent ${subject} sales.`;
  return spec;
}

// Resolve the comparison scope from the resolved vehicle and generation.
function buildSpec(vehicle, generation, searchText) {
  const spec = {
    make: vehicle.make || "", model: vehicle.model || "", trim: vehicle.trim || "", year: Number(vehicle.year) || null,
    bodyStyle: detectBodyStyle(searchText) || detectBodyStyle(vehicle.raw) || detectBodyStyle(vehicle.canonicalLabel) || null
  };
  // base-variant exclusions: if the seller did NOT ask for a Turbo/GT car, a Turbo in
  // the same years is a different market (the outlier guard catches the rest).
  const wantTurbo = /turbo/i.test(searchText || "") || /turbo/i.test(spec.trim);
  spec.excludeVariants = wantTurbo ? [] : ["turbo", " gt2", " gt3", "gt3", "gt2", "speedster", "anniversary", " rs "];
  if (generation && generation.yearStart && generation.yearEnd) { spec.yearMin = generation.yearStart; spec.yearMax = generation.yearEnd; spec.genCode = generation.code || null; }
  else if (spec.year) { spec.yearMin = spec.year - 2; spec.yearMax = spec.year + 2; spec.genCode = null; }
  else { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  return relabel(spec);
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
  zero: "I do not have enough comparable sales to show you an honest spread here. Results like this sit scattered across the record, and a range would invent a pattern that is not there.",
  underspecified: "The sold examples here vary too much to show you an honest spread. Add the trim or engine, like the exact edition, and I'll compare like for like."
};

export async function runOneBox(vehicle, generation, searchText, env, debug) {
  const spec = buildSpec(vehicle, generation, searchText);
  const now = Date.now();
  const iso = days => new Date(now - days * DAY).toISOString();

  // Body-style resolution FIRST (never call results "equivalent" across body styles):
  // if the seller did not name a body and this spec sold as more than one, ask with
  // one-tap chips for the body styles actually present. A single body scopes silently.
  if (!spec.bodyStyle) {
    const wide = await fetchQualifying(spec, iso(730), env); // body-agnostic (bodyStyle null)
    const counts = {};
    for (const r of wide) { const b = classifyBody(r); if (b) counts[b] = (counts[b] || 0) + 1; }
    const present = BODY_BUCKETS.filter(b => counts[b.style]).map(b => ({ label: b.label, style: b.style, n: counts[b.style] }));
    if (present.length >= 2) {
      present.sort((a, z) => z.n - a.n);
      return { tier: "body_choice", resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label), ...(debug ? { debug: { bodyCounts: counts } } : {}) };
    }
    if (present.length === 1) { spec.bodyStyle = present[0].style; relabel(spec); }
  }

  // Hard deterministic ceiling: 12 months, then a single expansion to 24 months.
  let pool = await fetchQualifying(spec, iso(365), env);
  let windowLabel = "last 12 months";
  if (pool.length < 3) { pool = await fetchQualifying(spec, iso(730), env); windowLabel = "past 2 years"; }
  pool.sort((a, b) => Number(a.price) - Number(b.price)); // ascending by price

  // Outlier guard: drop candidates a gross multiple off the median so a rare variant
  // never anchors a card; if the comparable core is still implausibly spread, treat the
  // query as underspecified instead of forcing three cards.
  let underspecified = false;
  if (pool.length >= 3) {
    const med = medianPrice(pool);
    const core = pool.filter(r => { const p = Number(r.price); return p <= med * OUTLIER_HIGH && p >= med * OUTLIER_LOW; });
    if (core.length >= 3 && Number(core[core.length - 1].price) / Number(core[0].price) > IMPLAUSIBLE_SPREAD) underspecified = true;
    else pool = core;
  }
  const n = pool.length;
  const base = { resolvedSpec: spec.resolvedSpec, count: n, windowLabel, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year } };
  if (debug) base.debug = { specBodyStyle: spec.bodyStyle, poolSize: n, underspecified, bodyCounts: pool.reduce((a, r) => { const b = classifyBody(r) || "unstated"; a[b] = (a[b] || 0) + 1; return a; }, {}), pool: pool.map(r => ({ price: Math.round(Number(r.price)), body: classifyBody(r) || "unstated", title: r.rtitle || r.raw_title })) };

  if (underspecified) return { ...base, count: undefined, tier: "underspecified", samLine: SAM_LINE.underspecified, cards: [] };
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
