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
import { dedupBySaleIdentity, hammerUsd, priceDisplay, mileageInfo, isHouseSource } from "./_houseComps.js";

const DAY = 864e5;
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Curated distinct-market performance trims (Aug 2026). When a seller names one,
// the comp pool is scoped TO it (title match) instead of pooling the whole model and
// letting the outlier guard discard the real comps. Cosmetic packages ("M Sport",
// "AMG Line") are explicitly excluded so they never read as the performance car.
const COSMETIC_TRIM = /m[\s-]?sport|m[\s-]?package|m[\s-]?pkg|m[\s-]?performance|amg[\s-]?line|s[\s-]?line|r[\s-]?line|sport\s?line|shadow\s?line/i;
// Each make: activate (does the seller's trim name the performance car), include
// (title matcher to scope the pool TO it), and baseExclude (title matcher to drop the
// halo from a BASE query so it never pools in). baseExclude is null when the model IS
// the M-car (a base "M3" keeps its Competition; only "X5 M" is dropped from base X5).
const PERF_TRIMS = [
  { make: /^bmw$/i, activate: /^m( competition)?$/i,
    include: (m) => new RegExp(`\\b${escRe(m)}\\s*m\\b|\\bm\\s*competition\\b`, "i"),
    baseExclude: (m) => /^m\d/i.test(m) ? null : new RegExp(`\\b${escRe(m)}\\s*m\\b`, "i") },
  { make: /porsche/i, activate: /gt3|gt2|turbo\s*s|\bgts\b|\bgt4\b/i,
    include: (m, tr) => new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i"), baseExclude: () => null },
  { make: /chevrolet/i, activate: /z06|zr1|zl1|\bz28\b/i,
    include: (m, tr) => new RegExp(`\\b${escRe(tr)}\\b`, "i"), baseExclude: () => /\bz06\b|\bzr1\b|\bzl1\b|\bz28\b/i },
  { make: /ford/i, activate: /shelby|gt500|gt350|\bboss\b|svt|mach\s*1/i,
    include: (m, tr) => new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i"), baseExclude: () => /shelby|gt500|gt350|\bboss\b|svt/i },
  { make: /mercedes|benz/i, activate: /amg|\b\d?63\b|\b55\b|\b65\b|black series/i,
    include: () => /\bamg\b|\b63\b|\b65\b|\b55\b|black series/i, baseExclude: () => /\bamg\b|\b63\b|\b65\b|black series/i }
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

// SUBSTANTIAL modifications that move a car to a different market. BaT lists EVERY
// aftermarket item in `modifications` (radar detector, stereo, wheels), so rejecting
// any non-empty list wrongly excludes nearly every older car; only these matter.
const SUBSTANTIAL_MOD = /engine swap|motor swap|\bswap(ped)?\b|supercharg|turbocharg|widebody|wide-body|body\s?kit|\bbagged\b|air ride|coilover|lowering|lift kit|lifted|backdat|restomod|resto-mod|stroker|forced induction|\bls[0-9]\b|big block|different engine|rebuilt engine|\bcammed\b|standalone ecu|roll cage|race prep/i;
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
  // stock: reject a SUBSTANTIAL modification (engine/forced-induction/suspension/
  // widebody/backdate), plus egregious title markers. Trivial aftermarket items
  // (stereo, wheels, radar detector) do not change the market and are kept.
  const mods = row.mods == null ? "" : String(row.mods);
  if (SUBSTANTIAL_MOD.test(mods)) return false;
  if (MOD_MARKERS.some(w => title.includes(w))) return false;
  // variant/body discipline. When a body style was named, require it and exclude
  // the others; always exclude a clearly different performance variant of the base.
  // Trim scoping: if the seller named a distinct-market performance trim, keep ONLY
  // its cars (title match, cosmetic packages excluded). Otherwise apply the base-query
  // variant exclusions (turbo/GT/etc.) so a base pool does not fold in the halo car.
  if (spec.perfInclude) {
    if (!spec.perfInclude(title)) return false;
  } else {
    if (spec.perfExclude && spec.perfExclude(title)) return false;
    if (spec.excludeVariants && spec.excludeVariants.some(w => title.includes(w))) return false;
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

// ---- Deterministic comp-explanation engine (STEP 2) ----
// Rule-based, template-assembled from VERIFIED structured differences. Zero LLM calls,
// zero freeform inference. The pool is already variant/body/stock matched (isQualifying),
// so every comp is "same spec"; the explanation adds the honest differentiators.
function fmtMiles(n) { return Number(n).toLocaleString() + " miles"; }
function hasSignal(v) { const s = String(v == null ? "" : v).trim(); return !!s && s !== "[]" && s.toLowerCase() !== "null"; }
// Provenance signal from fields already present on house records. Never invents specifics:
// reports only the PRESENCE of documented history, not its contents.
function provenanceSignal(row) {
  if (hasSignal(row.ownership)) return "documented ownership history";
  if (hasSignal(row.service)) return "service history on file";
  return null;
}
function explainComp(row, subject, spec) {
  const parts = ["Same spec"];
  const subjMiles = subject && Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Math.round(Number(subject.mileage)) : null;
  const mi = row.mi || {};
  if (subjMiles != null && mi.capable) {
    // Mileage delta ONLY when BOTH subject and comp have a usable odometer figure.
    const compMiles = mi.structured != null ? mi.structured : mi.stated;
    const d = compMiles - subjMiles;
    parts.push(Math.abs(d) < 1500 ? "similar mileage" : `${Math.abs(d).toLocaleString()} ${d < 0 ? "fewer" : "more"} miles`);
  } else if (mi.structured != null && subjMiles == null) {
    // Comp has real mileage but we can't compare (no subject mileage): state it plainly.
    parts.push(fmtMiles(mi.structured));
  } else if (mi.structured == null && mi.stated != null) {
    // Text-mined odometer: ALWAYS labeled as catalog-stated, never a bare structured fact.
    parts.push(`listed as approximately ${fmtMiles(mi.stated)}`);
  } else if (mi.structured == null) {
    // Mileage-blind comp (house record without usable mileage): NEVER imply a mileage
    // comparison; lean on provenance where the record carries it.
    const prov = provenanceSignal(row);
    if (prov) parts.push(prov);
  }
  parts.push(soldLabel(row.auction_end_date).replace(/^Sold /, "sold "));
  return parts.filter(Boolean).join(", ");
}

function toCard(row, rank, spec, subject) {
  const mi = row.mi || mileageInfo(row);
  return {
    rank,
    display: priceDisplay(row),                 // { amount, currency, premiumInclusive } - shown as-is
    value: Math.round(Number(row.value)),       // USD implied hammer - the COMPUTE basis, never the headline
    spec: spec.cardSpec,
    soldLabel: soldLabel(row.auction_end_date),
    platform: platformName(row.source),
    isHouse: isHouseSource(row.source),
    image: row.image,
    mileage: mi.structured,                      // structured odometer (null renders TMU)
    mileageStated: mi.structured == null ? mi.stated : null, // catalog-stated, labeled
    mileageCapable: !!mi.capable,
    explanation: explainComp(row, subject, spec)
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
// Median of the NORMALIZED compute value (USD implied hammer), never raw display price,
// so a premium-inclusive house price never distorts the guard or the pooled midpoint.
function medianPrice(sortedAsc) {
  const p = sortedAsc.map(r => Number(r.value));
  const n = p.length;
  return n % 2 ? p[(n - 1) / 2] : (p[n / 2 - 1] + p[n / 2]) / 2;
}
// Comparison-field richness for the tie-break: at equal value, the record with more
// populated comparison fields (usable mileage first) wins the slot, so a mileage-blind
// comp never beats a mileage-matched one on equal footing.
function compRich(r) {
  const mi = r.mi || {};
  return (mi.capable ? 4 : 0) + (mi.structured != null ? 2 : 0) + (hasSignal(r.ownership) || hasSignal(r.service) ? 1 : 0);
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
  // Performance-trim scoping. If the seller named the trim, scope the pool TO it; if
  // not, exclude the make's halo from the base pool so it never mixes in (an RS guard
  // keeps a plain "GT3" query from pulling in the GT3 RS).
  spec.perfInclude = null; spec.perfExclude = null;
  const perf = PERF_TRIMS.find(p => p.make.test(spec.make));
  if (perf) {
    if (perf.activate.test(spec.trim || "")) {
      const re = perf.include(spec.model, spec.trim || "");
      const rsGuard = /\brs\b/i.test(spec.trim || "") ? null : /\brs\b/i;
      spec.perfInclude = title => re.test(title) && !COSMETIC_TRIM.test(title) && !(rsGuard && rsGuard.test(title));
    } else {
      const bx = perf.baseExclude(spec.model);
      if (bx) spec.perfExclude = title => bx.test(title);
    }
  }
  // A badged family's generation map is family-level (all SLs), so it mismatches a
  // specific badge's own production years (a Pagoda 280SL is not the R107 window). For
  // those, anchor on the seller's year (+/-2) instead of the family generation.
  const badgedFamily = !!familyFor(spec.make, spec.model);
  if (!badgedFamily && generation && generation.yearStart && generation.yearEnd) { spec.yearMin = generation.yearStart; spec.yearMax = generation.yearEnd; spec.genCode = generation.code || null; }
  else if (spec.year) { spec.yearMin = spec.year - 2; spec.yearMax = spec.year + 2; spec.genCode = null; }
  else { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  return relabel(spec);
}

async function fetchQualifying(spec, sinceIso, env, diag) {
  const cols = "price,auction_status,auction_end_date,source,raw_title,year," +
    "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style," +
    "mods:raw_record->>modifications,rtitle:raw_record->>title,currency:raw_record->>currency," +
    "ownership:raw_record->>ownership_history,service:raw_record->>recent_service_history," +
    "description:raw_record->>description,ldetails:raw_record->>listing_details,transmission:raw_record->>transmission";
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
  const rawRows = (await supabaseSelect(env, q)) || [];
  // PREREQUISITE: content-based dedup BEFORE anything counts or pools (OCD assigns two
  // source_record_ids to one house sale; the DB key cannot catch it).
  const rows = dedupBySaleIdentity(rawRows);
  if (diag) { diag.fetchedRaw = (diag.fetchedRaw || 0) + rawRows.length; diag.fetchedDeduped = (diag.fetchedDeduped || 0) + rows.length; }
  const qualified = rows.filter(r => isQualifying(r, spec));
  // Normalize the COMPUTE basis: USD implied hammer (house premium backed out) + mileage
  // capability. Display facts stay native and are attached at card time. Drop rows with no
  // usable computed value so ranking never mixes bases or trips on a bad price.
  for (const r of qualified) { r.value = hammerUsd(r); r.mi = mileageInfo(r); }
  return qualified.filter(r => Number.isFinite(r.value));
}

const SAM_LINE = {
  three: "Most of what actually sells sits around that middle car.",
  two: "There aren't enough comparable sales to call this a market range yet, so I'm showing you the two relevant sales I have.",
  one: "There isn't enough recent comparable activity here to show you an honest market range, but this is one relevant sale.",
  zero: "I do not have enough comparable sales to show you an honest spread here. Results like this sit scattered across the record, and a range would invent a pattern that is not there.",
  underspecified: "The sold examples here vary too much to show you an honest spread. Add the trim or engine, like the exact edition, and I'll compare like for like."
};

// Trust line (STEP 4): N = the real post-dedup, post-filter, post-outlier qualified
// count. Small-pool honest variants for N=1 / N=2. Null for zero (samLine carries it).
function trustLine(n) {
  if (n >= 3) return `I found ${n} relevant sales. Here are the three I'd pay most attention to.`;
  if (n === 2) return "I found two comparable sales I'd actually use.";
  if (n === 1) return "I found one sale I'd actually use.";
  return null;
}

export async function runOneBox(vehicle, generation, searchText, env) {
  const spec = buildSpec(vehicle, generation, searchText);
  const now = Date.now();
  const iso = days => new Date(now - days * DAY).toISOString();
  const subject = { mileage: vehicle.mileage };   // seller-provided subject mileage (usually absent)
  // Resolved-car confirmation line (STEP 3): plain restatement, first thing rendered on
  // EVERY path, so "did it understand my car" is answered before any price appears.
  const resolvedCar = {
    year: spec.year, make: spec.make, model: spec.model, trim: spec.trim,
    bodyStyle: spec.bodyStyle || null, transmission: vehicle.transmission || null
  };
  const diag = {};

  // Body-style resolution FIRST (never call results "equivalent" across body styles):
  // if the seller did not name a body and this spec sold as more than one, ask with
  // one-tap chips for the body styles actually present. A single body scopes silently.
  if (!spec.bodyStyle) {
    const wide = await fetchQualifying(spec, iso(730), env, diag); // body-agnostic (bodyStyle null)
    const counts = {};
    for (const r of wide) { const b = classifyBody(r); if (b) counts[b] = (counts[b] || 0) + 1; }
    const present = BODY_BUCKETS.filter(b => counts[b.style]).map(b => ({ label: b.label, style: b.style, n: counts[b.style] }));
    if (present.length >= 2) {
      present.sort((a, z) => z.n - a.n);
      return { tier: "body_choice", resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label) };
    }
    // A single (or zero) known body: proceed body-agnostic. Do NOT silently scope+label
    // to that body, or one anomalous record (a lone "M3 convertible") would mislabel the
    // whole result. The label then carries no body, which is correct when it is unknown.
  }

  // Hard deterministic ceiling: 12 months, then a single expansion to 24 months.
  let pool = await fetchQualifying(spec, iso(365), env, diag);
  let windowLabel = "last 12 months";
  if (pool.length < 3) { pool = await fetchQualifying(spec, iso(730), env, diag); windowLabel = "past 2 years"; }
  // Online-preferred selection: the live-auction houses SUPPLEMENT thin online data, they
  // never compete with it. When online records alone can fill the three-card tier, house
  // records are excluded, so a dense-online car (an F80 M3) never surfaces a house comp;
  // only when online is thin (a high-end car with little online representation) do the
  // houses enter the pool. Dedup / premium-normalization already applied above.
  const onlineOnly = pool.filter(r => !isHouseSource(r.source));
  if (onlineOnly.length >= 3) pool = onlineOnly;
  if (diag) { diag.online = onlineOnly.length; diag.house = pool.length - pool.filter(r => !isHouseSource(r.source)).length; diag.houseSurfaced = pool.some(r => isHouseSource(r.source)); }
  // Ascending by NORMALIZED value (USD implied hammer); tie-break by comparison-field
  // richness so a mileage-matched comp is preferred over a mileage-blind one at equal footing.
  pool.sort((a, b) => (Number(a.value) - Number(b.value)) || (compRich(b) - compRich(a)));

  // Outlier guard: drop candidates a gross multiple off the median so a rare variant
  // never anchors a card; if the comparable core is still implausibly spread, treat the
  // query as underspecified instead of forcing three cards. Computed on normalized value.
  let underspecified = false;
  if (pool.length >= 3) {
    const med = medianPrice(pool);
    const core = pool.filter(r => { const p = Number(r.value); return p <= med * OUTLIER_HIGH && p >= med * OUTLIER_LOW; });
    // "Implausible" means genuinely different markets, not a wide condition spread of
    // one variant. Use a robust p90/p10 ratio (min/max for tiny pools) so a beater-to-
    // creampuff single-variant range shows, while a two-variant pool still trips.
    const p = f => Number(core[Math.min(core.length - 1, Math.floor(core.length * f))].value);
    const ratio = core.length >= 6 ? p(0.9) / p(0.1) : (core.length ? Number(core[core.length - 1].value) / Number(core[0].value) : 1);
    if (core.length >= 3 && ratio > IMPLAUSIBLE_SPREAD) underspecified = true;
    else pool = core;
  }
  const n = pool.length;
  const base = { resolvedCar, resolvedSpec: spec.resolvedSpec, count: n, windowLabel, dedup: diag, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year } };

  if (underspecified) return { ...base, count: undefined, tier: "underspecified", samLine: SAM_LINE.underspecified, trustLine: null, cards: [] };
  if (n >= 3) {
    const midIdx = Math.ceil(n / 2) - 1; // lower-middle for even counts
    return { ...base, tier: "three", trustLine: trustLine(n), samLine: SAM_LINE.three, cards: [
      toCard(pool[n - 1], "HIGH SALE", spec, subject),
      toCard(pool[midIdx], "MIDDLE OF THE MARKET", spec, subject),
      toCard(pool[0], "LOW SALE", spec, subject)
    ] };
  }
  if (n === 2) {
    return { ...base, tier: "two", trustLine: trustLine(n), samLine: SAM_LINE.two, cards: [
      toCard(pool[1], "RECENT SALE", spec, subject), toCard(pool[0], "RECENT SALE", spec, subject)
    ] };
  }
  if (n === 1) {
    return { ...base, tier: "one", trustLine: trustLine(n), samLine: SAM_LINE.one, cards: [toCard(pool[0], "ONE RECENT COMPARABLE SALE", spec, subject)] };
  }
  return { ...base, tier: "zero", trustLine: null, samLine: SAM_LINE.zero, cards: [] };
}
