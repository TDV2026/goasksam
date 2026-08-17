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
import { familyFor } from "./modelFamilies.js";

const DAY = 864e5;
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Curated distinct-market performance trims (Aug 2026). When a seller names one,
// the comp pool is scoped TO it (title match) instead of pooling the whole model and
// letting the outlier guard discard the real comps. Cosmetic packages ("M Sport",
// "AMG Line") are explicitly excluded so they never read as the performance car.
const COSMETIC_TRIM = /m[\s-]?sport|m[\s-]?package|m[\s-]?pkg|m[\s-]?performance|amg[\s-]?line|s[\s-]?line|r[\s-]?line|sport\s?line|shadow\s?line/i;
const PERF_TRIMS = [
  { make: /^bmw$/i, activate: /^m( competition)?$/i, token: (m) => new RegExp(`\\b${escRe(m)}\\s*m\\b|\\bm\\s*competition\\b`, "i") },
  { make: /porsche/i, activate: /gt3|gt2|turbo\s*s|\bgts\b|\bgt4\b/i, token: (m, tr) => new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i") },
  { make: /chevrolet/i, activate: /z06|zr1|zl1|\bz28\b/i, token: (m, tr) => new RegExp(`\\b${escRe(tr)}\\b`, "i") },
  { make: /ford/i, activate: /shelby|gt500|gt350|\bboss\b|svt|mach\s*1/i, token: (m, tr) => new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i") },
  { make: /mercedes|benz/i, activate: /amg|\b\d?63\b|\b55\b|\b65\b|black series/i, token: () => /\bamg\b|\b63\b|\b65\b|\b55\b|black series/i }
];

// The meaningful nameplate for labels: a Mercedes family head ("SL-Class") defers to
// its badge trim ("500SL"); otherwise model + trim ("X5 M", "911 Carrera").
function nameplate(model, trim) {
  model = model || ""; trim = trim || "";
  if (/-class$/i.test(model) && trim) return trim;
  if (trim && trim.toLowerCase() !== model.toLowerCase() && !model.toLowerCase().includes(trim.toLowerCase())) return `${model} ${trim}`.trim();
  return model || trim;
}

// How to search the archive: badged families (Mercedes -Class) lump every variant
// into one model field and even mislabel unrelated cars, but every listing carries
// the badge in its TITLE, so we search make+year and filter the badge title token.
// Everything else searches the model field directly.
function archiveScope(spec) {
  if (familyFor(spec.make, spec.model) && spec.trim) return { byTitle: spec.trim };
  return { byModel: spec.model };
}

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
  // Trim scoping: if the seller named a distinct-market performance trim, keep ONLY
  // its cars (title match, cosmetic packages excluded). Otherwise apply the base-query
  // variant exclusions (turbo/GT/etc.) so a base pool does not fold in the halo car.
  if (spec.perfInclude) {
    if (!spec.perfInclude(title)) return false;
  } else if (spec.excludeVariants && spec.excludeVariants.some(w => title.includes(w))) {
    return false;
  }
  // Body discipline: when a body style is resolved, exclude only rows that EXPLICITLY
  // state a different body family. Unstated-body rows (many titles omit it) are kept,
  // so we never drop a genuine comp just because its listing did not spell out "coupe".
  if (spec.bodyStyle) {
    const rowBody = classifyBody(row);
    if (rowBody && bodyFamily(rowBody) !== bodyFamily(spec.bodyStyle)) return false;
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
// cabriolet / convertible / roadster are one open-top family; coupe and targa stand alone.
function bodyFamily(style) { return style === "targa" ? "targa" : style === "coupe" ? "coupe" : "open"; }
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

// (Re)compute the display labels from the current scope + resolved bodyStyle. The
// nameplate ALWAYS carries the model (never a bare trim like "M").
function relabel(spec) {
  const name = nameplate(spec.model, spec.trim);
  const subject = [name, spec.bodyStyle ? cap(spec.bodyStyle) : ""].filter(Boolean).join(" ");
  spec.subject = subject;
  spec.cardSpec = [subject, spec.genCode].filter(Boolean).join(", ");
  const youText = [spec.year, name].filter(Boolean).join(" ");
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
  // Performance-trim scoping (curated list). When the seller named a distinct-market
  // trim, build the title matcher that keeps only those cars; base queries leave it null.
  const perf = PERF_TRIMS.find(p => p.make.test(spec.make) && p.activate.test(spec.trim || ""));
  if (perf) { const re = perf.token(spec.model, spec.trim || ""); spec.perfInclude = title => re.test(title) && !COSMETIC_TRIM.test(title); }
  else spec.perfInclude = null;
  // A badged family's generation map is family-level (all SLs), so it mismatches a
  // specific badge's own production years (a Pagoda 280SL is not the R107 window). For
  // those, anchor on the seller's year (+/-2) instead of the family generation.
  const badgedFamily = !!familyFor(spec.make, spec.model);
  if (!badgedFamily && generation && generation.yearStart && generation.yearEnd) { spec.yearMin = generation.yearStart; spec.yearMax = generation.yearEnd; spec.genCode = generation.code || null; }
  else if (spec.year) { spec.yearMin = spec.year - 2; spec.yearMax = spec.year + 2; spec.genCode = null; }
  else { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  return relabel(spec);
}

async function fetchQualifying(spec, sinceIso, env) {
  const cols = "price,auction_status,auction_end_date,source,raw_title,year,image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style,mods:raw_record->>modifications,rtitle:raw_record->>title";
  const scope = archiveScope(spec);
  let q = `vehicle_market_records?select=${cols}` +
    `&make=ilike.${encodeURIComponent(spec.make)}` +
    `&auction_status=ilike.sold` +
    `&price=not.is.null` +
    `&raw_record->>featured_image_url=not.is.null` +
    `&auction_end_date=gte.${sinceIso.slice(0, 10)}` +
    `&order=price.desc&limit=1000`;
  // Badged families search the archive TITLE for the badge; everything else the model.
  if (scope.byTitle) q += `&raw_title=ilike.${encodeURIComponent("*" + scope.byTitle + "*")}`;
  else q += `&model=ilike.${encodeURIComponent("*" + scope.byModel + "*")}`;
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
      return { tier: "body_choice", resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label) };
    }
    // A single (or zero) known body: proceed body-agnostic. Do NOT silently scope+label
    // to that body, or one anomalous record (a lone "M3 convertible") would mislabel the
    // whole result. The label then carries no body, which is correct when it is unknown.
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
  if (debug) {
    const sc = archiveScope(spec), enc = encodeURIComponent;
    let dq = `vehicle_market_records?select=price,raw_title,year,auction_status,img:raw_record->>featured_image_url,mods:raw_record->>modifications,body:raw_record->>body_style&make=ilike.${enc(spec.make)}&auction_end_date=gte.${iso(730).slice(0, 10)}&order=price.desc&limit=40`;
    dq += sc.byTitle ? `&raw_title=ilike.${enc("*" + sc.byTitle + "*")}` : `&model=ilike.${enc("*" + sc.byModel + "*")}`;
    const raw = (await supabaseSelect(env, dq)) || [];
    base.debug = { model: spec.model, trim: spec.trim, bodyStyle: spec.bodyStyle, yearMin: spec.yearMin, yearMax: spec.yearMax, byTitle: sc.byTitle || null, poolSize: n, rawFetch24mo: raw.length,
      rawSample: raw.slice(0, 8).map(r => ({ price: Math.round(+r.price), yr: r.year, status: r.auction_status, img: !!r.img, mods: r.mods, title: (r.raw_title || "").slice(0, 38), qualifies: isQualifying({ price: r.price, image: r.img, rtitle: r.raw_title, raw_title: r.raw_title, mileage: null, body: r.body, mods: r.mods }, spec) })) };
  }

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
