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
import { modelChipsForMakeYear } from "./vehicle.js";
import { familyFor } from "./modelFamilies.js";
import { generationsForModel } from "./generations.js";
import { dedupBySaleIdentity, hammerUsd, priceDisplay, mileageInfo, isHouseSource, toUsd } from "./_houseComps.js";
import { isPartsListing } from "./_classify.js";

const DAY = 864e5;
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = v => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Model-chip family key (WS1.3): collapse same-family duplicate model names the archive
// carries ("430" and "F430"; "MX-5" and "MX5 Miata"; "3-Series" and "3 Series") to ONE
// chip. Strip separators, drop a Ferrari F-prefix on a number, drop a redundant trailing
// nameplate nickname, so same-family variants share a key and merge.
function chipFamilyKey(name) {
  let k = String(name || "").toLowerCase().replace(/[\s-]+/g, "");
  k = k.replace(/^f(\d)/, "$1");     // Ferrari F-number: f430 -> 430
  k = k.replace(/miata$/, "");        // MX5 Miata -> MX5
  return k;
}
// Pick the canonical display name for a merged family: prefer the Ferrari F-form (F430
// over 430), else the cleanest short name (MX-5 over MX5 Miata).
function pickChipDisplay(names) {
  const ferrari = names.find(n => /^f\d/i.test(n));
  if (ferrari) return ferrari;
  const clean = names.filter(n => !/miata$/i.test(String(n).replace(/\s+/g, "")));
  const pool = clean.length ? clean : names;
  return pool.slice().sort((a, b) => String(a).length - String(b).length || a.localeCompare(b))[0];
}
function mergeModelChips(counts) {
  const groups = new Map(); // familyKey -> { names: Map(name->count), total }
  for (const [name, count] of counts) {
    const key = chipFamilyKey(name);
    if (!groups.has(key)) groups.set(key, { names: new Map(), total: 0 });
    const g = groups.get(key); g.names.set(name, (g.names.get(name) || 0) + count); g.total += count;
  }
  return [...groups.values()].map(g => [pickChipDisplay([...g.names.keys()]), g.total]);
}

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
// Performance-badge detection (Sep 2026). BMW M-cars, Mercedes-AMG and Audi RS are TITLED by
// the badge ("M4 Coupe Competition Package") but FILED under the base series ("4-Series",
// "F Series") - so scoping by the model field pools the base car (430i/440i) or finds nothing.
// Return the badge to scope on (in the TITLE) + a word-boundary matcher (so "M4" never catches
// "M440i") + the variant that further scopes the exact-trim rung (Competition / CS / GTS).
function performanceBadge(make, model, trim) {
  const hay = ((model || "") + " " + (trim || "")).trim();
  if (/^bmw$/i.test(make)) {
    const m = hay.match(/\bM([2345678])\b/i);
    if (m) { const v = (hay.match(/\b(Competition|CSL|CS|GTS|GT4)\b/i) || [])[1]; const b = "M" + m[1]; return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: v ? (v.toUpperCase() === "CS" || v.toUpperCase() === "CSL" || v.toUpperCase() === "GTS" || v.toUpperCase() === "GT4" ? v.toUpperCase() : "Competition") : null }; }
  }
  if (/mercedes|benz/i.test(make)) {
    const m = hay.match(/\b((?:AMG\s)?[A-Z]{1,3})[\s-]?(63|65|45|43|55)\b/i);
    if (m) { const b = (m[1].replace(/AMG\s*/i, "") + m[2]).toUpperCase(); const v = /black\s?series/i.test(hay) ? "Black Series" : (/\bS\b/.test(hay.replace(new RegExp(b, "i"), "")) ? "S" : null); return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: v }; }
    if (/\bAMG\s?GT\b/i.test(hay)) return { badge: "AMG GT", re: /\bAMG\s?GT\b/i, variant: (hay.match(/\b(63|43|53|R|Black Series)\b/i) || [])[1] || null };
  }
  if (/audi/i.test(make)) { const m = hay.match(/\bRS\s?(3|4|5|6|7|Q3|Q8|e-tron)\b/i); if (m) { const b = "RS" + m[1].replace(/\s/g, ""); return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: null }; } }
  return null;
}
function archiveScope(spec) {
  if (spec.badge) return { byTitle: spec.badge };
  if (familyFor(spec.make, spec.model) && spec.trim) return { byTitle: spec.trim };
  // Scope the model ILIKE by the FAMILY, not a chassis-prefixed field value: the archive stores
  // an E30 M3 as "E30 M3", "M3", "M3 Sport Evolution" etc., so "*E30 M3*" catches only the
  // literal ones (1 of 52). Strip a leading chassis-code token (letter + 2-3 digits + space, e.g.
  // "E30 ", "W124 ") so it queries "*M3*"; the generation/year range keeps it E30-specific. Real
  // models never match (M3/X5/A6 are 1 digit; 993/997 are pure digits; badged makes go byTitle).
  var byModel = String(spec.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || spec.model;
  return { byModel: byModel };
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
function monthName(dateStr) {
  const p = String(dateStr || "").slice(0, 10).split("-");
  return p.length >= 2 ? (MONTHS[Number(p[1])] || null) : null;
}
// The OUTCOME of a sale in USD: what the buyer actually paid (premium-INCLUSIVE display),
// converted to USD so a single answer-line range never mixes currencies. Distinct from the
// engine's `value` (USD implied HAMMER, premium backed out) which is the ranking/compute
// basis only. The answer line is about what cars BROUGHT, so it uses the outcome.
function outcomeUsd(row) {
  const d = priceDisplay(row);
  if (d.amount == null) return null;
  return d.currency === "USD" ? Math.round(d.amount) : Math.round(toUsd(d.amount, d.currency));
}
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
  // Parts / automobilia guard (Sep 2026): the archive holds parts listed under a car's
  // make/model (a $7,500 seat, a $16,500 engine) with a real model field, so they leak into
  // the pool and drag the span/cluster. Drop them at read time too (belt-and-suspenders with
  // the ingest-level skip, so rows already in the archive never surface). See lib/_classify.js.
  if (isPartsListing(row.raw_title || row.rtitle, row.mileage)) return false;
  const title = String(row.rtitle || row.raw_title || "").toLowerCase();
  // Performance-badge word boundary: the pool is title-scoped to the badge ("M4"), which as a
  // substring would also catch "M440i" - require the badge as a whole word so the base car is
  // never folded into an M-car pool (same idea for AMG "C63" vs a stray "63", Audi "RS4").
  if (spec.badgeRe && !spec.badgeRe.test(row.raw_title || row.rtitle || "")) return false;
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
function explainComp(row, subject, spec, sameSpec) {
  // Lead honestly: claim "Same spec" ONLY when the shown comps are the same variant. When
  // the variant within the resolved model is unknown/mixed, say what IS known and never
  // assert spec equality the match did not verify.
  const parts = [sameSpec ? "Same spec" : `${spec.subject || spec.model}, variant not stated`];
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

// ---- Relevance-based card labels (STEP 1) ----
// Replace price-position labels (High/Middle/Low) with WHY each comp was selected
// relative to the subject, derived from the SAME comparison signals as the explanation:
// the closest spec+mileage match is "Closest match"; each other card is named by its
// actual differentiator (the mileage axis when both sides have a usable odometer, else
// recency). Rule-based, distinct labels, no freeform text.
function med(nums) { const a = nums.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
function recencyLabel(c, anchor) {
  const cd = String(c.date || "").slice(0, 10), ad = String(anchor.date || "").slice(0, 10);
  if (cd && ad && cd > ad) return "More recent";
  if (cd && ad && cd < ad) return "Earlier sale";
  return "Comparable sale";
}
function relevanceLabels(cards, subject) {
  const subjMiles = subject && Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Number(subject.mileage) : null;
  const capable = cards.filter(c => Number.isFinite(c.mileage));
  // Reference for "closest": the subject's mileage if given, else the median mileage of
  // the mileage-capable cards. When neither exists (e.g. all house records without a
  // usable odometer), fall back to the median-VALUE card as the anchor.
  const ref = subjMiles != null ? subjMiles : (capable.length ? med(capable.map(c => c.mileage)) : null);
  const labels = new Array(cards.length).fill(null);
  let anchorIdx;
  if (ref != null && capable.length >= 1) {
    anchorIdx = cards.reduce((best, c, i) =>
      (Number.isFinite(c.mileage) && (best < 0 || Math.abs(c.mileage - ref) < Math.abs(cards[best].mileage - ref)) ? i : best), -1);
  } else {
    const byVal = cards.map((c, i) => [Number(c.value), i]).sort((a, b) => a[0] - b[0]);
    anchorIdx = byVal[Math.floor((byVal.length - 1) / 2)][1];
  }
  labels[anchorIdx] = "Closest match";
  const anchor = cards[anchorIdx];
  const base = subjMiles != null ? subjMiles : (Number.isFinite(anchor.mileage) ? anchor.mileage : null);
  for (let i = 0; i < cards.length; i++) {
    if (i === anchorIdx) continue;
    const c = cards[i];
    if (Number.isFinite(c.mileage) && base != null) {
      const d = c.mileage - base;
      labels[i] = Math.abs(d) < 1500 ? "Similar mileage" : (d < 0 ? "Lower mileage" : "Higher mileage");
    } else {
      labels[i] = recencyLabel(c, anchor);   // not mileage-driven -> recency axis
    }
  }
  return labels;
}
// Same-spec establishment (WS1.1). We can't verify sub-variant equality from the archive
// deterministically (titles are noisy), so the normalized-value SPREAD of the shown comps
// is the confidence signal for a "same spec" claim: a wide spread among one nameplate is
// almost always variant mixing (base F430 vs a likely-Scuderia) or a market too loose to
// call one spec. Tight -> claim same-spec; medium -> render but never assert equality
// ("variant not stated"); wide -> REFUSE and ask for the trim. Computed on USD hammer, so
// mixed currency never distorts it.
const SAME_SPEC_TIGHT = 1.8;    // <=1.8x normalized spread -> confidently same-spec
const REFUSE_SPREAD = 2.5;      // >2.5x -> not one market; ask for the trim/engine
function analyzeSameSpec(cards) {
  const vals = cards.map(c => Number(c.value)).filter(Number.isFinite);
  const spread = vals.length ? Math.max(...vals) / Math.max(1, Math.min(...vals)) : 1;
  return { sameSpec: spread <= SAME_SPEC_TIGHT, spread, refuse: spread > REFUSE_SPREAD };
}
// Build the selected cards, then stamp relevance labels + the "closest" flag (drives the
// card highlight) and the same-spec-aware explanation. Returns { cards, refuse }.
function labelCards(rows, spec, subject) {
  const cards = rows.map(r => toCard(r, "", spec, subject));
  const { sameSpec, refuse } = analyzeSameSpec(cards);
  const labels = relevanceLabels(cards, subject);
  cards.forEach((c, i) => {
    c.rank = labels[i];
    c.closest = labels[i] === "Closest match";
    c.explanation = explainComp(rows[i], subject, spec, sameSpec);
  });
  return { cards, refuse };
}

function toCard(row, rank, spec, subject) {
  const mi = row.mi || mileageInfo(row);
  const disp = priceDisplay(row);
  // USD-equivalent of the DISPLAYED native price (WS1.2): a small "≈ $X" anchor so a
  // mixed-currency result is readable at a glance. Only for non-USD cards.
  const usdApprox = disp.currency !== "USD" && disp.amount != null ? Math.round(toUsd(disp.amount, disp.currency)) : null;
  return {
    rank,
    display: disp,                              // { amount, currency, premiumInclusive } - shown as-is
    usdApprox,                                  // number | null -> renders "≈ $X" under a non-USD price
    value: Math.round(Number(row.value)),       // USD implied hammer - the COMPUTE basis, never the headline
    spec: spec.cardSpec,
    soldLabel: soldLabel(row.auction_end_date),
    date: row.auction_end_date || null,
    platform: platformName(row.source),
    isHouse: isHouseSource(row.source),
    image: row.image || null,
    year: spec.year || null, make: spec.make, subjectName: spec.subject, // photo-fallback plate
    mileage: mi.structured,                      // structured odometer (null renders TMU)
    mileageStated: mi.structured == null ? mi.stated : null, // catalog-stated, labeled
    mileageCapable: !!mi.capable,
    explanation: ""                              // set after the same-spec decision (see labelCards)
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
    bodyStyle: detectBodyStyle(searchText) || detectBodyStyle(vehicle.bodyStyle) || detectBodyStyle(vehicle.raw) || detectBodyStyle(vehicle.canonicalLabel) || null
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
  // Chassis-code model with no year ("991 GT3 RS", "997 Carrera S"): the CODE names the
  // generation, so bound the pool to that generation's production years even without a year.
  // Only for a model whose curated generations are tight (<=3), so a bare multi-generation
  // nameplate (911, M3) is untouched (it clarifies generation or refuses instead).
  if (!spec.yearMin && !spec.yearMax) {
    const gens = generationsForModel(spec.make, spec.model);
    if (gens.length && gens.length <= 3) { spec.yearMin = Math.min(...gens.map(g => g.yearStart)); spec.yearMax = Math.max(...gens.map(g => g.yearEnd)); }
  }
  // Performance-badge normalization (M/AMG/RS): scope on the badge in the TITLE, and make the
  // MODEL the badge so the label + ladder read "M4 Competition", never the filed "4-Series".
  // The generation/year window computed above still applies (an F82 M4 stays 2015-2020 range).
  const pb = performanceBadge(spec.make, spec.model, spec.trim);
  if (pb) { spec.badge = pb.badge; spec.badgeRe = pb.re; spec.model = pb.badge; spec.trim = pb.variant; spec.perfInclude = null; spec.perfExclude = null; spec.excludeVariants = []; }
  return relabel(spec);
}

async function fetchQualifying(spec, sinceIso, env, diag) {
  // Reads sales_archive (Sep 2026): the COMPREHENSIVE nightly-ingest sales store (~200k rows,
  // E30 M3: 52 vs 4 in vmr), now index-backed (trigram GIN on model/title/make + btrees on
  // year/sale_date, docs/supabase-sales-archive-indexes.sql) so the leading-wildcard ILIKE
  // comp scope is index-scannable instead of a full seq scan. sales_archive is SOLD-ONLY by
  // construction (ingest fetches OCD with status:"sold"), so there is no sold filter to apply.
  //
  // PHOTO FILTER IS APPLICATION-CODE, NOT IN THE QUERY. Combining a JSONB photo filter
  // (raw_record->>featured_image_url) with the sale_date filter in ONE PostgREST request
  // returned 0 rows in preview pulls (a PostgREST quirk, not an index issue). isQualifying
  // already drops photoless rows (row.image guard), so we omit the photo predicate from the
  // request and let application code enforce it. Never ships a silently-empty pool.
  //
  // Columns aliased to the historical field names so every downstream compute helper
  // (dedupBySaleIdentity, hammerUsd, priceDisplay, mileageInfo) is unchanged. Archive
  // top-level cols: sale_price/sale_date/platform/listing_title/make/model/year; the rest
  // come off raw_record (the full OCD record) exactly as before.
  // LEAN select (Sep 2026): One Box round-3 reads only price/date/source/title/year/image/
  // mileage/mods/body. The heavy raw_record TEXT blobs (description, listing_details,
  // ownership/service history) were 1000x per fetch and made a common-nameplate pull take
  // 10-27s; dropped here. mileageInfo degrades to the structured field without them.
  const cols = "price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year," +
    "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style," +
    "mods:raw_record->>modifications,rtitle:raw_record->>title,currency:raw_record->>currency," +
    "transmission:raw_record->>transmission,srcurl:raw_record->>url,srcurl2:raw_record->>source_url";
  const scope = archiveScope(spec);
  const base = `sales_archive?select=${cols}` +
    `&make=ilike.${encodeURIComponent(spec.make)}` +
    `&sale_price=not.is.null` +
    `&sale_date=gte.${sinceIso.slice(0, 10)}` +
    (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") +
    (spec.yearMax ? `&year=lte.${spec.yearMax}` : "") +
    // Exact-trim DB scope: when the ladder wants only a named trim, filter the TITLE at the
    // database so a common nameplate pulls the ~dozens of trim rows, not the whole family.
    (spec.titleContains ? `&listing_title=ilike.${encodeURIComponent("*" + spec.titleContains + "*")}` : "") +
    `&order=sale_date.desc&limit=1000`;
  // Filter order matches the index plan: model/title trgm -> year -> sale_date; photo in app code.
  // Badged families search the archive TITLE for the badge; everything else the model.
  const modelQ = t => `${base}&model=ilike.${encodeURIComponent("*" + t + "*")}`;
  const titleQ = t => `${base}&listing_title=ilike.${encodeURIComponent("*" + t + "*")}`;
  const t0 = Date.now();
  let rawRows;
  if (scope.byTitle) { rawRows = (await supabaseSelect(env, titleQ(scope.byTitle))) || []; }
  else {
    rawRows = (await supabaseSelect(env, modelQ(scope.byModel))) || [];
    // ACCENT FALLBACK (Sep 2026): the archive stores accented model names ("Murciélago")
    // while the resolver deaccents them ("Murcielago"), so the model ILIKE matches zero and
    // the pool looks empty (the Gallardo n=0 bug). The listing TITLE reliably carries the
    // deaccented name, so on an empty model scope retry by title before giving up.
    if (!rawRows.length && scope.byModel) {
      const retry = (await supabaseSelect(env, titleQ(scope.byModel))) || [];
      if (retry.length) { rawRows = retry; if (diag) diag.accentRetry = true; }
    }
  }
  if (diag) { diag.ms = (diag.ms || 0) + (Date.now() - t0); diag.queries = (diag.queries || 0) + 1; }
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
  // Full-pool grounded (STEP 3): "closest match" is the comp nearest yours on spec+mileage;
  // the spread claim is about the whole qualified set, never read off the three shown cards.
  three: "I'd anchor on the closest match. Across the full set of comparable sales, the differences come down to spec, mileage and condition.",
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

// ---- Round-3 result-model helpers (mirror /onebox-preview, the locked design of record) ----
const r500 = n => Math.round(n / 500) * 500;
function percentile(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const MON3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(d) { const p = String(d || "").slice(0, 10).split("-"); return p.length >= 2 ? `${MON3[Number(p[1])] || ""} ${p[0]}`.trim() : ""; }
function miText(row) { const n = Number(String(row.mileage == null ? "" : row.mileage).replace(/[^\d]/g, "")); return n ? n.toLocaleString("en-US") + " mi" : "mileage n/a"; }
// Platform naming for the strip/cards: a NAMED allowlist only. Live auction houses (RM
// Sotheby's, Gooding, Bonhams, Mecum) are NEVER named on this surface (product invariant);
// they fold into "others". A platform stands alone only at 3+ sales.
const OB_NAMED = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty" };
const platSlug = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const platNamed = s => OB_NAMED[platSlug(s)] || "others";
function foldPlatforms(rows) {
  const named = {}; let others = 0;
  for (const r of rows) { const nm = OB_NAMED[platSlug(r.source)]; if (nm) named[nm] = (named[nm] || 0) + 1; else others++; }
  const out = [];
  for (const [nm, c] of Object.entries(named)) { if (c >= 3) out.push([nm, c]); else others += c; }
  out.sort((a, b) => b[1] - a[1]);
  if (others) out.push(["others", others]);
  return out;
}
// Short descriptors for the set-aside outliers, folded into the mono meta line.
const ASIDE_CATS = [["Sport Evolution", /sport\s?evolution|\bevo\b/i], ["Cecotto", /cecotto/i], ["lowest-mileage", /\b\d+k[-\s]?miles?\b|delivery[-\s]?mile/i], ["Cabriolet", /cabriolet|convertible/i], ["special edition", /anniversary|clubsport|lightweight|\bcsl\b|\bcs\b/i]];
function outlierTags(hollow) {
  return ASIDE_CATS.filter(([, re]) => hollow.some(r => re.test(String(r.raw_title || r.rtitle || "")))).map(([n]) => n).slice(0, 3);
}
// Distinct variant tokens for the refusal template (best-effort; degrades to the no-variant form).
const VARIANT_RE = /\b(S[1-4]|SE|V8|V12|Turbo\s?S?|Spyder|Speedster|GTS|GT[234]|GTB|GTC|RS|Evolution|Cabriolet|Roadster|Competition)\b/gi;
function variantTokens(rows) {
  const seen = new Map();
  for (const r of rows) { const t = String(r.raw_title || r.rtitle || ""); let m; VARIANT_RE.lastIndex = 0; while ((m = VARIANT_RE.exec(t))) { const k = m[1].replace(/\s+/g, " ").trim(), key = k.toLowerCase(); if (!seen.has(key)) seen.set(key, k); } }
  return [...seen.values()];
}

// ---- Halo vocabulary for the trim-to-family ladder (Sep 2026) ----
// Per make, a title matcher for the PERFORMANCE/SPECIAL halo over a common family. Used two
// ways: (1) a base/unspecified query ALWAYS sets these aside (direction rule: never widen a
// base pool up into the halo), and (2) a halo-trim query that widens to the family labels them
// "set aside" so the seller sees his car sits above the family market. Extends the fetch-time
// PERF_TRIMS with the collector-special variants a range should never fold in.
const HALO_PATTERNS = [
  { make: /^bmw$/i, re: /\b(csl|\bcs\b|sport\s?evolution|\bevo\b|cecotto|\bgts\b|competition)\b/i },
  { make: /porsche/i, re: /\b(gt3\s?rs|gt3|gt2\s?rs|gt2|turbo\s?s|\bgts\b|gt4\s?rs|gt4|speedster|sport\s?classic|\br\b|\bs\/t\b|sc\/rs)\b/i },
  { make: /ferrari/i, re: /\b(speciale|scuderia|pista|competizione|\btdf\b|stradale|\bsv\b|\bcs\b|xx|\bm\b\s|challenge)\b/i },
  { make: /lamborghini/i, re: /\b(sv|superveloce|svj|performante|\bsto\b|tecnica|jota)\b/i },
  { make: /chevrolet/i, re: /\b(z06|zr1|zl1|\bz28\b|grand\s?sport|\biroc\b|callaway)\b/i },
  { make: /ford/i, re: /\b(shelby|gt500|gt350|\bboss\b|svt|mach\s?1|cobra\s?jet|\bkr\b)\b/i },
  { make: /mercedes|benz/i, re: /\b(amg|\b63\b|\b65\b|\b55\b|black\s?series)\b/i },
  { make: /dodge/i, re: /\b(hellcat|demon|redeye|\bacr\b|scat\s?pack|\bsrt\b)\b/i },
  { make: /nissan/i, re: /\b(nismo|\br32\b|\br33\b|\br34\b|\bz\s?tune\b)\b/i },
  { make: /toyota/i, re: /\b(trd\s?pro)\b/i },
  { make: /honda|acura/i, re: /\b(type\s?r|type\s?s)\b/i }
];
function haloMatcherFor(make) { const h = HALO_PATTERNS.find(p => p.make.test(make || "")); return h ? h.re : null; }
// Title matcher for a NAMED trim (scope the pool to it). Tokens must appear contiguous with
// word boundaries so "Carrera S" never matches "Carrera 4S" and "GT3" never matches "GT3 RS"
// unless the query WAS "GT3 RS". Digits stay literal ("Z06", "GT500").
function trimTitleRe(trim) {
  const toks = String(trim || "").trim().toLowerCase().split(/\s+/).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!toks.length) return null;
  return new RegExp(`(^|[^a-z0-9])${toks.join("[\\s-]+")}([^a-z0-9]|$)`, "i");
}
const titleOf = r => String(r.raw_title || r.rtitle || "");
function familyWideningSentence(trim, model, isHalo) {
  const m = model || "car";
  return isHalo
    ? `No recent ${trim} sales, so this reads other ${m}s. ${trim}s have sat above these when they have traded.`
    : `No recent ${trim} sales in this window, so this reads other ${m}s.`;
}
// A pool can carry an honest range: enough sales, and not two genuinely different markets
// (extreme robust ratio, or a wide-year multi-variant nameplate). Mirrors buildResult's gates.
function presentable(rows, min) {
  if (!rows || rows.length < (min || 4)) return false;
  const u = rows.map(r => r._usd);
  const p75 = percentile(u, 0.75), p25 = percentile(u, 0.25);
  const solid = rows.filter(r => !(r._usd > p75 * 1.5 || r._usd < p25 * 0.4));
  if (solid.length < 4) return false;
  const su = solid.map(r => r._usd);
  const ratio = solid.length >= 6 ? percentile(su, 0.9) / Math.max(1, percentile(su, 0.1)) : Math.max(...su) / Math.max(1, Math.min(...su));
  if (ratio > 6) return false;
  const yrs = solid.map(r => Number(r.year)).filter(Boolean), yspan = yrs.length ? Math.max(...yrs) - Math.min(...yrs) : 0;
  if (yspan >= 15 && variantTokens(solid).length >= 2 && ratio > 2.5) return false;
  return true;
}
const miOf = r => Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\d]/g, "")) || 0;
function shapeCards(rows) {
  return rows.map(r => ({
    price: r._usd, mi: miOf(r), mileageText: miText(r), platform: platNamed(r.source), platformSlug: platSlug(r.source),
    date: r.auction_end_date || null, month: monthYear(r.auction_end_date), transmission: r.transmission || null,
    title: titleOf(r).replace(/[–—]/g, "-").replace(/\s+/g, " ").trim(), image: r.image || null, url: r.srcurl || r.srcurl2 || null, hollow: !!r._hollow
  }));
}
// ---- Round-4 statistics: today-first windows, direction, spread driver, pool-relative
// mileage buckets, transmission gate. Counts never leave here as rendered facts. ----
const R4_SPECIAL = /sport\s?evolution|cecotto|ravaglia|europameister|\bevo\b|\bcsl\b|clubsport|black\s?series|speciale|superveloce|\bsvj?\b|scuderia|pista|\btdf\b|z06|zr1|zl1|\bcs\b|shelby|gt500|gt350|gt3\s?rs|gt2\s?rs|hellcat|demon/i;
function r4Split(rows, keepAll) {
  // Two-pass: drop named collector specials, fence the remaining driver market at p75*1.35.
  // keepAll = the pool IS the special (an exact-trim GT3 RS / Z06 / Shelby query), so the title
  // set-aside must NOT fire (it would set aside the very cars being priced); price fence only.
  const noSpecial = keepAll ? rows : rows.filter(r => !R4_SPECIAL.test(titleOf(r)));
  const p75 = percentile(noSpecial.map(r => r._usd), 0.75);
  const off = r => (!keepAll && R4_SPECIAL.test(titleOf(r))) || r._usd > p75 * 1.35;
  return { solid: rows.filter(r => !off(r)), aside: rows.filter(off) };
}
const r4Span = a => [r500(Math.min(...a.map(r => r._usd))), r500(Math.max(...a.map(r => r._usd)))];
const r4Cluster = a => a.length ? [r500(percentile(a.map(r => r._usd), 0.25)), r500(percentile(a.map(r => r._usd), 0.75))] : null;
function r4Driver(solid) {
  const tp = percentile(solid.map(r => r._usd), 0.75), bp = percentile(solid.map(r => r._usd), 0.25);
  const top = solid.filter(r => r._usd >= tp && miOf(r) > 0), bot = solid.filter(r => r._usd <= bp && miOf(r) > 0);
  const avg = a => a.length ? a.reduce((s, r) => s + miOf(r), 0) / a.length : 0;
  return (top.length >= 5 && bot.length >= 5 && avg(top) < avg(bot) * 0.75) ? "mileage" : null;
}
function r4Direction(recent, prior, keepAll) {
  const rs = r4Split(recent, keepAll).solid, ps = r4Split(prior, keepAll).solid;
  if (rs.length < 8 || ps.length < 8) return null;
  const rc = r4Cluster(rs), pc = r4Cluster(ps), rm = (rc[0] + rc[1]) / 2, pm = (pc[0] + pc[1]) / 2, diff = (rm - pm) / pm;
  return { word: diff > 0.04 ? "a touch firmer" : diff < -0.04 ? "a touch softer" : "about level", prior: pc };
}
function r4Buckets(solid) {
  const mi = solid.map(miOf).filter(v => v > 0).sort((a, b) => a - b);
  if (mi.length < 8) return null;
  const step = (percentile(mi, 0.9) - percentile(mi, 0.1)) > 120000 ? 20000 : 10000;
  const rnd = n => Math.max(step, Math.round(n / step) * step);
  const cuts = [rnd(percentile(mi, 0.25)), rnd(percentile(mi, 0.5)), rnd(percentile(mi, 0.75))].filter((v, i, a) => a.indexOf(v) === i);
  const kf = n => (n % 1000 === 0 ? (n / 1000) : (n / 1000).toFixed(1)) + "k";
  const out = [{ label: "under " + kf(cuts[0]), min: 0, max: cuts[0] }];
  for (let i = 1; i < cuts.length; i++) out.push({ label: kf(cuts[i - 1]) + " to " + kf(cuts[i]), min: cuts[i - 1], max: cuts[i] });
  out.push({ label: "over " + kf(cuts[cuts.length - 1]), min: cuts[cuts.length - 1], max: null });
  return out.filter(bk => { const n = solid.filter(r => { const m = miOf(r); return m > 0 && m >= bk.min && (bk.max == null || m < bk.max); }).length; return n > 0 && n < mi.length; });
}
const R4_MANUAL = t => /manual|\d[- ]?speed(?!\s*auto)|\bmt\b|\bstick\b/i.test(t) && !/automatic|pdk|dct|tiptronic|dsg/i.test(t);
const R4_AUTO = t => /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle/i.test(t);
function r4Transmission(solid, make) {
  const man = solid.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = solid.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length < 5 || aut.length < 5) return null;
  const auto = /porsche/i.test(make || "") ? (aut.filter(r => /pdk/i.test(String(r.transmission || ""))).length >= aut.length / 2 ? "PDK" : "Tiptronic") : "automatic";
  return { manual: "manual", auto };
}
// The ROUND-4 result model: today-first window, folded Sam's-take facts, the earned question,
// inline refinement. Counts are never returned as rendered facts. Returns a result or refusal.
function buildResult(chosen, base, iso, spec, refine) {
  let rows = [...chosen.rows].filter(r => Number.isFinite(r._usd) && r._usd > 0);
  // Inline refinement (the earned question answered): narrow by mileage band and/or transmission.
  const refined = !!(refine && (refine.miMin != null || refine.tx));
  if (refined) {
    if (refine.miMin != null) rows = rows.filter(r => { const m = miOf(r); return m > 0 && m >= refine.miMin && (refine.miMax == null || m < refine.miMax); });
    if (refine.tx === "manual") rows = rows.filter(r => R4_MANUAL(String(r.transmission || "")));
    if (refine.tx === "auto") rows = rows.filter(r => R4_AUTO(String(r.transmission || "")));
  }
  rows.sort((a, b2) => String(b2.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  // An exact-trim pool IS the special (GT3 RS / Z06 / Shelby / M4 Competition), so the collector
  // set-aside must not fire on it - the whole pool would vanish. Family/base pools set halos aside.
  const exactStep = chosen.step === "exact_trim" || chosen.step === "exact_trim_wide";
  const keepAll = exactStep;

  // TODAY-FIRST window: the last twelve months if it clears 8+ solid, else the ladder window.
  const winIso = iso(365).slice(0, 10), win2 = iso(730).slice(0, 10);
  const recent = rows.filter(r => String(r.auction_end_date || "").slice(0, 10) >= winIso);
  const prior = rows.filter(r => { const d = String(r.auction_end_date || "").slice(0, 10); return d < winIso && d >= win2; });
  const useRecent = r4Split(recent, keepAll).solid.length >= 8;
  const window = useRecent ? recent : rows;
  const windowLabel = useRecent ? "last twelve months" : chosen.windowLabel;
  const b = { ...base, windowLabel };
  const { solid, aside } = r4Split(window, keepAll);
  const THIN = 4;
  if (chosen.step === "thin" || solid.length < THIN) {
    return { ...b, tier: "refusal", ladderStep: "thin", refusal: { kind: "thin", model: spec.subject }, cards: shapeCards(rows) };
  }
  const su = solid.map(r => r._usd);
  const ratio = solid.length >= 6 ? percentile(su, 0.9) / Math.max(1, percentile(su, 0.1)) : (su.length ? Math.max(...su) / Math.max(1, Math.min(...su)) : 1);
  const yrs = solid.map(r => Number(r.year)).filter(Boolean), yspan = yrs.length ? Math.max(...yrs) - Math.min(...yrs) : 0;
  if (!refined && (ratio > 6 || (yspan >= 15 && variantTokens(solid).length >= 2 && ratio > 2.5))) {
    const yearSpanPhrase = yspan >= 20 ? "more than twenty years" : yspan >= 10 ? "more than a decade" : yspan > 0 ? `${yspan} years` : null;
    return { ...b, tier: "refusal", ladderStep: "varied", refusal: { kind: "varied", model: spec.subject, variants: variantTokens(rows).slice(0, 6), yearSpanPhrase }, cards: shapeCards(rows) };
  }
  const span = r4Span(solid);
  const cluster = solid.length >= 8 ? r4Cluster(solid) : null;
  const direction = (!refined && useRecent) ? r4Direction(recent, prior, keepAll) : null;
  const driver = r4Driver(solid);
  const platforms = foldPlatforms(solid).map(p => p[0]);          // NAMES only, no counts
  const named = platforms.filter(n => n !== "others");
  const poolYrs = solid.map(r => Number(r.year)).filter(Boolean);

  // The earned question: mileage buckets first (unless already answered/given), then transmission.
  // Never asks a field the input already gave (typed/decoded transmission).
  let earned = null;
  const txGiven = !!(base.vehicle && base.vehicle.transmission);
  const buckets = r4Buckets(solid);
  const txGate = r4Transmission(solid, spec.make);
  if (!(refined && refine.miMin != null) && buckets && buckets.length >= 2) earned = { kind: "mileage", buckets };
  else if (!txGiven && !(refined && refine.tx) && txGate) earned = { kind: "transmission", labels: txGate };

  return {
    ...b, tier: "result", ladderStep: chosen.step, widening: chosen.widening || null,
    poolTrim: exactStep ? (spec.trim || null) : null,
    poolYears: poolYrs.length ? [Math.min(...poolYrs), Math.max(...poolYrs)] : null,
    span, cluster, direction, driver,
    setAsideTags: outlierTags(aside),
    platforms, topPlatform: named[0] || null, singlePlatform: named.length <= 1,
    earned, refined: refined ? { label: refine.label || null, mileage: refine.miMin != null, tx: refine.tx || null } : null,
    cards: shapeCards(solid), asideCards: shapeCards(aside)
  };
}

export async function runOneBox(vehicle, generation, searchText, env, refine) {
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

  // GENERATION clarification FIRST (#4): a bare, year-less, trim-less multi-generation nameplate
  // ("911", "Corvette", "Mustang") is genuinely several markets - ASK which generation with
  // year-resolvable chips rather than pooling 1965-2024 into one refusal. Runs before the body
  // ask (generation is the bigger axis) and spares the whole-nameplate fetch. A chassis-code
  // model ("997"), or any year/trim query, skips this and scopes normally.
  if (!spec.trim && !spec.year && !spec.yearRange && !spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    if (gens.length >= 2) {
      const options = gens.map(g => ({ label: `${g.code} (${g.yearStart}-${g.yearEnd})`, query: `${Math.floor((g.yearStart + g.yearEnd) / 2)} ${spec.make} ${spec.model}` }));
      return { tier: "generation_choice", resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: `The ${spec.model} spans generations that price very differently. Which is yours?`, generationOptions: options };
    }
  }

  // Body-style resolution FIRST (never call results "equivalent" across body styles):
  // if the seller did not name a body and this spec sold as more than one, ask with
  // one-tap chips for the body styles actually present. A single body scopes silently.
  if (!spec.bodyStyle) {
    const wide = await fetchQualifying(spec, iso(730), env, diag); // body-agnostic (bodyStyle null)
    const counts = {};
    for (const r of wide) { const b = classifyBody(r); if (b) counts[b] = (counts[b] || 0) + 1; }
    // A body only counts as a real split when it is a MEANINGFUL share of the pool - a car that
    // is 95% coupe with a handful of rare convertibles (E30 M3, F82 M4) should NOT trigger a
    // body ask, it should proceed as the dominant body. A genuine coupe/convertible split
    // (911, Corvette, Mustang) keeps both above the threshold and still asks.
    const bodyTotal = Object.values(counts).reduce((a, c) => a + c, 0);
    const present = BODY_BUCKETS.filter(b => counts[b.style] >= Math.max(3, bodyTotal * 0.18)).map(b => ({ label: b.label, style: b.style, n: counts[b.style] }));
    if (present.length >= 2) {
      present.sort((a, z) => z.n - a.n);
      return { tier: "body_choice", resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label) };
    }
    // A single (or zero) known body: proceed body-agnostic. Do NOT silently scope+label
    // to that body, or one anomalous record (a lone "M3 convertible") would mislabel the
    // whole result. The label then carries no body, which is correct when it is unknown.
  }

  // ---- Trim-to-family widening ladder (Sep 2026; resolver-level trim, so both surfaces) ----
  // A named trim scopes the pool (rule 3.8); when it is thin, widen HALO-DOWN-TO-FAMILY only,
  // never base-up-into-the-halo. Steps, each stated to the user: (a) exact trim past 2 years,
  // (b) exact trim past 5 years, (c) family (drop trim) past 2 years with the halo set aside and
  // labelled, (d) family past 5 years, (e) honest thin state showing what there is. A base or
  // unspecified query always sets the halo aside and never widens up.
  const haloRe = haloMatcherFor(spec.make);
  const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
  const trimRe = trimName ? trimTitleRe(trimName) : null;
  const trimIsHalo = !!(trimName && haloRe && haloRe.test(trimName));
  const base = { resolvedCar, resolvedSpec: spec.resolvedSpec, dedup: diag, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year } };

  // Direction rule: never widen a base pool up into the halo; a named halo trim widens
  // halo-DOWN-to-family with the halo set aside + labelled. Fetches are DB-scoped: the exact
  // trim filters the TITLE at the database (a common nameplate pulls the dozens of trim rows,
  // not the whole family); the family fetch (only on widening / base) is bounded by year/gen.
  const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
  const online = rows => { const o = rows.filter(r => !isHouseSource(r.source)); return o.length >= 3 ? o : rows; };
  const priceUp = rows => rows.filter(r => { r._usd = outcomeUsd(r); return Number.isFinite(r._usd) && r._usd > 0; });
  const fetchPool = async (extra, days) => priceUp(online(await fetchQualifying({ ...famSpec, ...extra }, iso(days), env, diag)));
  const part = rows => ({
    halo: haloRe ? rows.filter(r => haloRe.test(titleOf(r))) : [],
    exHalo: haloRe ? rows.filter(r => !haloRe.test(titleOf(r))) : rows
  });
  const EXACT_MIN = 5;
  let chosen;
  if (trimName) {
    const trim24 = (await fetchPool({ titleContains: trimName }, 730)).filter(r => trimRe.test(titleOf(r)));
    if (presentable(trim24, EXACT_MIN)) chosen = { rows: trim24, step: "exact_trim", windowLabel: "past 2 years", widening: null };
    else {
      const trim5 = (await fetchPool({ titleContains: trimName }, 1825)).filter(r => trimRe.test(titleOf(r)));
      if (presentable(trim5, EXACT_MIN)) chosen = { rows: trim5, step: "exact_trim_wide", windowLabel: "past 5 years", widening: `Only a few ${trimName} sold in the last two years, so this reads the past five.` };
      else {
        const p24 = part(await fetchPool({}, 730));
        if (presentable(p24.exHalo, 4)) chosen = { rows: p24.exHalo, step: "family", windowLabel: "past 2 years", aside: trimIsHalo ? p24.halo : null, widening: familyWideningSentence(trimName, spec.model, trimIsHalo) };
        else {
          const p5 = part(await fetchPool({}, 1825));
          if (presentable(p5.exHalo, 4)) chosen = { rows: p5.exHalo, step: "family_wide", windowLabel: "past 5 years", aside: trimIsHalo ? p5.halo : null, widening: familyWideningSentence(trimName, spec.model, trimIsHalo) };
          else chosen = { rows: (trim5.length ? trim5 : (p5.exHalo.length ? p5.exHalo : [])), step: "thin", windowLabel: "past 5 years", widening: null };
        }
      }
    }
  } else {
    const p24 = part(await fetchPool({}, 730));
    chosen = { rows: p24.exHalo, step: "base", windowLabel: "past 2 years", aside: (p24.halo && p24.halo.length) ? p24.halo : null, widening: null };
  }
  base.platformsCount = new Set(chosen.rows.map(r => platformName(r.source)).filter(Boolean)).size;
  return buildResult(chosen, base, iso, spec, refine);
}

// STEP 4: a make-only or otherwise model-ambiguous input ("1989 Porsche") ASKS which
// model, with real model chips from the archive (mirrors the body-style disambiguation),
// instead of a flat rejection. Chips are the make's highest-volume real models for the
// era, so every chip leads to actual comps. Returns null (fall through to the normal
// re-ask) only when the make has no usable archive models at all.
export async function runOneBoxModelChoice(vehicle, env) {
  const make = (vehicle && vehicle.make) || "";
  if (!make) return null;
  const year = Number(vehicle && vehicle.year) || null;
  // Use the SAME chip builder the resolver's clarification path uses, so One Box and /sell
  // never diverge on the model list. The old One Box path ranked ALL archive models by raw
  // count over a wide year window, which let mainstream nameplates crowd the M3 out of the
  // top 6 for a 2020 BMW VIN; the shared builder ranks a curated model set by recent sales,
  // so enthusiast models like M3 surface. A missing chip is still recoverable via free text.
  const chips = await modelChipsForMakeYear(env, make, year);
  const models = (chips || []).filter(c => c && !/^not sure$/i.test(c) && !isBodyStyleEnumModelName(c));
  if (!models.length) return null;
  const resolvedCar = { year: year || null, make, model: null, trim: null, bodyStyle: null, transmission: null };
  return {
    tier: "model_choice", resolvedCar,
    prompt: `Which ${make} model?`,
    modelOptions: models.slice(0, 6)
  };
}
// Empty-state proof line (One Box storefront): a few genuinely recent REAL online sales
// with photos, for the rotating "A 1988 BMW 325i brought $18,500 on Bring a Trailer
// [when]" line. Online-only (no house premium ambiguity in a one-line proof), photo
// required (so the storefront thumbnails are real), newest first. Read-only, no writes.
export async function runOneBoxProof(env, limit = 8) {
  const cols = "price,auction_end_date,source,year,make,model,raw_title," +
    "image:raw_record->>featured_image_url,currency:raw_record->>currency," +
    "url:raw_record->>source_url,url2:raw_record->>url,url3:raw_record->>listing_url";
  const sinceIso = new Date(Date.now() - 21 * DAY).toISOString().slice(0, 10);
  const q = `vehicle_market_records?select=${cols}` +
    `&auction_status=ilike.sold&price=not.is.null&year=not.is.null&make=not.is.null` +
    `&raw_record->>featured_image_url=not.is.null` +
    `&source=in.(bringatrailer,carsandbids)` +
    `&auction_end_date=gte.${sinceIso}&order=auction_end_date.desc&limit=200`;
  const rows = dedupBySaleIdentity((await supabaseSelect(env, q)) || []);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const price = Number(r.price);
    if (!(price > 0) || !r.image) continue;
    const key = `${r.year} ${r.make} ${r.model}`.toLowerCase();
    if (seen.has(key)) continue;                 // one per nameplate so the rotation varies
    seen.add(key);
    out.push({
      year: Number(r.year) || null, make: String(r.make || "").trim(),
      model: String(r.model || "").trim(), price: Math.round(price),
      platform: platformName(r.source), date: r.auction_end_date || null, image: r.image || null,
      url: r.url || r.url2 || r.url3 || null   // receipt link for the JUST SOLD line
    });
    if (out.length >= limit) break;
  }
  return { proof: out };
}

// Guard the model chips against a junk enum "model" ("Sedan, Convertible, & Wagon").
function isBodyStyleEnumModelName(name) {
  const toks = String(name || "").toLowerCase().replace(/[^a-z]+/g, " ").split(/\s+/).filter(Boolean);
  const words = new Set(["sedan", "saloon", "convertible", "cabriolet", "cabrio", "coupe", "coup", "wagon", "estate", "hatchback", "fastback", "hardtop", "and", "or"]);
  return toks.length >= 2 && toks.every(t => words.has(t));
}
