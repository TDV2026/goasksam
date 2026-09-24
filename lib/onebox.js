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
import { driversForVehicle, driverByKey } from "./driverDict.js";
import { modelChipsForMakeYear } from "./vehicle.js";
import { familyFor } from "./modelFamilies.js";
import { generationsForModel, generationModelToken } from "./generations.js";
import { dedupBySaleIdentity, hammerUsd, priceDisplay, nativePrices, mileageInfo, isHouseSource, toUsd, sourceSlugOf } from "./_houseComps.js";
import { isPartsListing, isMemorabilia, extractMarkers, markerLabel } from "./_classify.js";

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
function performanceBadge(make, model, trim, context) {
  const hay = ((model || "") + " " + (trim || "")).trim();
  // Fix (a) Sep 2026: the BADGE is detected from the resolved model/trim (never from stray title
  // text), but the VARIANT is captured from a WIDER string - the matched listing title / search
  // text - so a bare-decoded "M4" whose title says "Competition Package", or a "C63" whose title
  // says "Black Series", routes to the exact-trim rung instead of dropping to the family/base step.
  const vhay = (hay + " " + (context || "")).trim();
  if (/^bmw$/i.test(make)) {
    const m = hay.match(/\bM([2345678])\b/i);
    if (m) { const v = (vhay.match(/\b(Competition|CSL|CS|GTS|GT4)\b/i) || [])[1]; const b = "M" + m[1]; return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: v ? (v.toUpperCase() === "CS" || v.toUpperCase() === "CSL" || v.toUpperCase() === "GTS" || v.toUpperCase() === "GT4" ? v.toUpperCase() : "Competition") : null }; }
  }
  if (/mercedes|benz/i.test(make)) {
    const m = hay.match(/\b((?:AMG\s)?[A-Z]{1,3})[\s-]?(63|65|45|43|55)\b/i);
    if (m) {
      const b = (m[1].replace(/AMG\s*/i, "") + m[2]).toUpperCase();
      // The "S" variant (a C63 S) is detected from the TRIM only, badge + AMG stripped - NEVER from
      // the family in `hay`, or the "S" in "S-Class" false-matches and an S65 becomes trim "S".
      const trimClean = String(trim || "").replace(new RegExp(b, "ig"), "").replace(/\bAMG\b/ig, "").trim();
      const v = /black\s?series/i.test(vhay) ? "Black Series" : (/\bS\b/.test(trimClean) ? "S" : null);
      return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: v };
    }
    if (/\bAMG\s?GT\b/i.test(hay)) return { badge: "AMG GT", re: /\bAMG\s?GT\b/i, variant: (hay.match(/\b(63|43|53|R|Black Series)\b/i) || [])[1] || null };
  }
  if (/audi/i.test(make)) { const m = hay.match(/\bRS\s?(3|4|5|6|7|Q3|Q8|e-tron)\b/i); if (m) { const b = "RS" + m[1].replace(/\s/g, ""); return { badge: b, re: new RegExp(`\\b${b}\\b`, "i"), variant: null }; } }
  return null;
}
export function archiveScope(spec) {
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
// Item 9: OBSERVABLE listing facts (mined from the pool's own title / modifications / title-status
// / known-flaws / description) - never a condition GRADE, never a price adjustment. Offered as the
// post-answer "Anything I should know?" refinement only when the pool actually contains such cars;
// tapping one holds those cars OUT of the main band and reports THEIR range as an aside sentence.
const OBSERVE_FLAGS = {
  needs_work: { label: "needing work", re: /\bproject\b|needs?\s?work|not\s?runn|non[-\s]?runn|barn find|recommission|for restoration|\bas[-\s]?is\b|running when parked|parts car|unfinished|incomplete/i },
  modified: { label: "modified", re: SUBSTANTIAL_MOD },
  salvage: { label: "having a salvage or rebuilt title", re: /salvage|rebuilt title|branded title|reconstruct|flood|lemon\s?law|prior damage/i }
};
const OBSERVE_ORDER = ["needs_work", "modified", "salvage"];
// The observable text for a record: everything a mined flag can honestly read (all fetched fields
// plus the description when the bounded second fetch has attached it).
function obText(r) { return [titleOf(r), r.mods, r.ts, r.flaws, r._descText].filter(Boolean).join(" "); }
// Title markers that mean "not a stock, standard example."
const MOD_MARKERS = [
  "backdate", "backdated", "outlaw", "restomod", "resto-mod", "hot rod", "hotrod",
  "custom", "widebody", "wide-body", "tribute", "recreation", "replica", "singer",
  "rwb", "safari", "turbo-look", "turbo look", "slantnose", "slant nose", "swap",
  // "competition" removed (Sep 2026): it is a FACTORY trim/package (BMW M3/M4/M5 Competition,
  // and others), not a modification - it was rejecting every M Competition as "non-stock" and
  // gutting the pool. Genuine race cars are still caught by "race car" + SUBSTANTIAL_MOD (race
  // prep / roll cage). A factory trim name must never live in a modification-marker list.
  "project", "race car", "continuation", "kit car", "tool room",
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
  collectingcars: "Collecting Cars", broadarrow: "Broad Arrow"
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
// Reason a row is NOT a qualifying comp for the spec, or null when it qualifies. isQualifying
// is the boolean wrapper (unchanged behavior); Sam Desk uses the reason so an excluded row can
// be SHOWN with why (no silent drops), matching how One Box drops it.
export function qualifyReason(row, spec) {
  if (!(Number(row.price) > 0)) return "no sale price";
  // House-tier receipts are named sales, not photo cards (product RULE 1): a $48M 250 GTO house
  // sale is evidence even when OCD carries no featured image. Volume mode still requires a photo.
  if (!row.image && !spec.houseTier) return "no photo";
  // Parts / automobilia guard. See lib/_classify.js.
  if (isPartsListing(row.raw_title || row.rtitle, row.mileage)) return "part or automobilia";
  // Memorabilia / replica / tribute / scale-model guard.
  if (isMemorabilia(row.raw_title || row.rtitle)) return "memorabilia or replica";
  const title = String(row.rtitle || row.raw_title || "").toLowerCase();
  // Performance-badge word boundary.
  if (spec.badgeRe && !spec.badgeRe.test(row.raw_title || row.rtitle || "")) return "wrong performance badge";
  // stock: reject a SUBSTANTIAL modification, plus egregious title markers.
  const mods = row.mods == null ? "" : String(row.mods);
  if (SUBSTANTIAL_MOD.test(mods)) return "substantially modified";
  if (MOD_MARKERS.some(w => title.includes(w))) return "modified or non-stock";
  // variant/body discipline.
  if (spec.perfInclude) {
    if (!spec.perfInclude(title)) return "different variant (trim scope)";
  } else {
    if (spec.perfExclude && spec.perfExclude(title)) return "halo or other variant of the base car";
    if (spec.excludeVariants && spec.excludeVariants.some(w => title.includes(w))) return "halo or other variant of the base car";
  }
  // Body discipline.
  if (spec.bodyStyle) {
    const rowBody = classifyBody(row);
    if (rowBody && bodyFamily(rowBody) !== bodyFamily(spec.bodyStyle)) return "different body style";
  }
  return null;
}
export function isQualifying(row, spec) { return qualifyReason(row, spec) === null; }

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

// !!! DEAD CODE (round-4 card model: relevanceLabels / analyzeSameSpec / labelCards / toCard).
// `labelCards` has NO caller - superseded by the round-7 pickRepresentative + shapeCards path. It
// carries a KNOWN UNFIXED divergence blind spot: it anchors "closest" on the subject's mileage
// with NO divergence check, so for an atypical (e.g. high-mileage) subject the closest comp lands
// OUTSIDE the cluster band - exactly the headline-vs-receipts bug fixed in pickRepresentative
// (Sep 2026). If you ever rewire a caller to this block, port that divergence guard FIRST.
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
function bodyPrompt(labels) { return `These sold as ${joinList(labels)}, and they price differently. Which one is it?`; }

// (Re)compute the display labels from the current scope + resolved bodyStyle. The
// nameplate ALWAYS carries the model (never a bare trim like "M").
function relabel(spec) {
  const name = nameplate(spec.model, spec.trim);
  const subject = [name, spec.bodyStyle ? cap(spec.bodyStyle) : ""].filter(Boolean).join(" ");
  spec.subject = subject;
  spec.cardSpec = [subject, spec.genCode].filter(Boolean).join(", ");
  const youText = [spec.year, name].filter(Boolean).join(" ");
  if (spec.yearMin && spec.yearMax && spec.genCode) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${spec.genCode} ${subject}s.`;
  else if (spec.yearMin && spec.yearMax) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${subject} sales.`;
  else spec.resolvedSpec = `Comparing the ${youText} with equivalent ${subject} sales.`;
  return spec;
}

// Resolve the comparison scope from the resolved vehicle and generation.
export function buildSpec(vehicle, generation, searchText) {
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
      // Do NOT strip the halo token from a model whose NAME intrinsically carries it: an
      // "SLS AMG" (or "SLR ...") IS the AMG, so a baseExclude of /\bamg\b/ empties its own
      // pool (every SLS AMG title has "AMG"), which surfaced as a false "no sales" refusal.
      // The model ILIKE already scopes the pool to this car; the exclusion is only meant to
      // drop halo variants from a TRUE base query (SL-Class, C-Class) whose model name lacks
      // the token. BMW already guards this (baseExclude null for M-cars); Mercedes did not.
      if (bx && !bx.test(spec.model || "")) spec.perfExclude = title => bx.test(title);
    }
  }
  // A badged family's generation map is family-level (all SLs), so it mismatches a
  // specific badge's own production years (a Pagoda 280SL is not the R107 window). For
  // those, anchor on the seller's year (+/-2) instead of the family generation.
  const badgedFamily = !!familyFor(spec.make, spec.model);
  // SPLIT-YEAR guard (Sep 2026): a handover year that falls in >=2 curated generations (a 1994 911
  // is both 964 and 993 by the deliberate overlap) must NOT auto-bind - leave genCode/year bounds
  // UNSET so the generation clarify fires and the seller disambiguates. The passed `generation`
  // (findGeneration = first match) and the badged re-bind below would both otherwise silently pick
  // one; this takes precedence over both.
  const splitYear = !!(spec.year && generationsForModel(spec.make, spec.model).filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd).length >= 2);
  if (splitYear) { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  else if (!badgedFamily && generation && generation.yearStart && generation.yearEnd) { spec.yearMin = generation.yearStart; spec.yearMax = generation.yearEnd; spec.genCode = generation.code || null; }
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
  const pb = performanceBadge(spec.make, spec.model, spec.trim, [searchText, vehicle.raw, vehicle.canonicalLabel, vehicle.displayName, vehicle.matchTitle].filter(Boolean).join(" "));
  if (pb) { spec.badge = pb.badge; spec.badgeRe = pb.re; spec.model = pb.badge; spec.trim = pb.variant; spec.perfInclude = null; spec.perfExclude = null; spec.excludeVariants = []; }
  // GENERATION RE-BIND on the normalized badge model (Sep 2026 fix): a performance badge (M4,
  // M3, M5) has its OWN curated generations, and the seller's year selects one. findGeneration
  // ran on the FILED model upstream (often "4-Series"/"3-Series"), so it can miss the badge
  // model's mapping and leave a year+/-2 window that STRADDLES a generation boundary - a 2019 M4
  // +/-2 pulls in 2021 G82s as "closest match". Re-bind here, on spec.model=badge, so the pool
  // stays within the seller's actual generation. Only fires when a curated generation fits the
  // year; otherwise the earlier window stands.
  if (spec.year) {
    // A Mercedes AMG badge ("S65", "C63") is scoped by the badge but its GENERATIONS are curated at
    // the family level ("S-Class"), so look those up under the family (badge alpha-prefix + "-Class")
    // when the badge itself has none - otherwise a 2006 S65 (W220) falls to year+/-2 and pools 2008
    // W221 cars. Non-Mercedes and non-badge models use the model directly.
    let genModel = spec.model;
    if (/mercedes|benz/i.test(spec.make) && !generationsForModel(spec.make, spec.model).length) {
      const pfx = String(spec.model || "").match(/^([A-Za-z]{1,3})\s?\d{2}\b/);
      if (pfx) genModel = pfx[1].toUpperCase() + "-Class";
    }
    const matching = generationsForModel(spec.make, genModel).filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd);
    // Auto-bind ONLY when the year lands in exactly ONE generation. A split/handover year (a 1994
    // 911 is both 964 and 993 by the deliberate overlap in generations.js) leaves genCode UNSET so
    // the generation clarify fires and the seller disambiguates, instead of silently binding 964.
    if (matching.length === 1) { const bg = matching[0]; spec.yearMin = bg.yearStart; spec.yearMax = bg.yearEnd; spec.genCode = bg.code; }
  }
  return relabel(spec);
}

export async function fetchQualifying(spec, sinceIso, env, diag) {
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
  const cols = "id,price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,vin_norm," +
    "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style," +
    "mods:raw_record->>modifications,rtitle:raw_record->>title,currency:raw_record->>currency," +
    "transmission:raw_record->>transmission,color:raw_record->>exterior_color,ts:raw_record->>title_status,flaws:raw_record->>known_flaws,srcurl:raw_record->>url,srcurl2:raw_record->>source_url," +
    "city:raw_record->>city,precision:raw_record->>auction_end_precision";
  const scope = archiveScope(spec);
  const base = `sales_archive?select=${cols}` +
    // RECORD path: make=eq AND no sale_date filter, so the (make, sale_price DESC) composite index
    // serves the query index-ORDERED (no sort) with early termination at the limit. make ILIKE or a
    // sale_date filter both prevent that index from ordering the scan, forcing a slow sort that hits
    // the statement timeout. Non-record keeps ILIKE + the (selective, index-backed) date filter.
    (spec.recordSort ? `&make=eq.${encodeURIComponent(spec.make)}` : `&make=ilike.${encodeURIComponent(spec.make)}`) +
    `&sale_price=not.is.null` +
    // Omit the date filter ONLY on the primary all-time record scan (so the (make,sale_price) index
    // orders it). The BOUNDED fallback (recordFallback) re-adds the date filter to genuinely shrink
    // the set when the all-time scan timed out. Non-record always keeps it.
    ((spec.recordSort && !spec.recordFallback) ? "" : `&sale_date=gte.${sinceIso.slice(0, 10)}`) +
    (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") +
    (spec.yearMax ? `&year=lte.${spec.yearMax}` : "") +
    // Exact-trim DB scope: when the ladder wants only a named trim, filter the TITLE at the
    // database so a common nameplate pulls the ~dozens of trim rows, not the whole family.
    (spec.titleContains ? `&listing_title=ilike.${encodeURIComponent("*" + spec.titleContains + "*")}` : "") +
    // RECORD path (Desk): order by PRICE desc with a tight limit, so an all-time "highest sale"
    // finds the real top even for a high-volume model whose record is older than the recent 1000.
    // The DB sorts the model-scoped subset and returns the top rows fast (no wide date scan).
    (spec.recordSort ? `&order=sale_price.desc&limit=200` : `&order=sale_date.desc&limit=1000`);
  // Filter order matches the index plan: model/title trgm -> year -> sale_date; photo in app code.
  // Badged families search the archive TITLE for the badge; everything else the model.
  // Space/hyphen normalization (Part 3): the archive stores alnum model codes BOTH ways, split by
  // platform - online titles a Mercedes "300SL" (62 sales), the houses title it "300 SL" (50), two
  // DISJOINT sets, so a single literal ILIKE returns whichever spelling the seller typed and misses
  // the other half. Fix with ONE ilike that inserts a `*` wildcard at the digit<->letter boundary
  // of a DISTINCTIVE code (a 3+ digit run touching letters): "300SL"/"300 SL"/"300-SL" all become
  // the pattern *300*SL* and match the full union. A single top-level filter, so the proven %2A
  // wildcard decoding works (unlike or=, where PostgREST does not decode it). Guarded to distinctive
  // codes: short badges (M3, A6, GT3) and pure-digit models (275, 911, 997) are left exact.
  const flexPattern = t => {
    const s = String(t || "").trim();
    if (/\d{3}[\s-]?[A-Za-z]/.test(s) || /[A-Za-z][\s-]?\d{3}/.test(s)) {
      return s.replace(/[\s-]+/g, "").replace(/(\d{3,})([A-Za-z])/g, "$1*$2").replace(/([A-Za-z])(\d{3,})/g, "$1*$2");
    }
    return s;
  };
  const modelQ = t => `${base}&model=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  const titleQ = t => `${base}&listing_title=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  const t0 = Date.now();
  let rawRows;
  // supabaseSelect returns null on a FAILED query (non-ok/timeout) and [] on a genuine empty
  // result. Surface the failure via diag.queryError so a caller (the Desk executor) can retry and
  // fail loudly instead of rendering a swallowed [] as an honest "thin"/empty pool. One Box ignores
  // the flag (its thin/refusal path is unchanged); only the Desk consumes it.
  if (scope.byTitle) { const got = await supabaseSelect(env, titleQ(scope.byTitle)); if (got === null && diag) diag.queryError = true; rawRows = got || []; }
  else {
    const got = await supabaseSelect(env, modelQ(scope.byModel)); if (got === null && diag) diag.queryError = true;
    rawRows = got || [];
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
  // FLAG A fix (Sep 2026): UK/EU/AU-only marketplaces are held out of a US car's comp pool, the
  // same gate /sell applies via evidenceCapable:false - Car & Classic (EUR), Collecting Cars
  // (AUD), The Market (GBP), PistonHeads (GBP) do not enter One Box comps until UK evidence-
  // routing is formally approved. Matched on the platform LABEL (what sales_archive stores).
  const rows = dedupBySaleIdentity(rawRows).filter(r => !OB_REGION_EXCLUDED(r.source));
  if (diag) { diag.fetchedRaw = (diag.fetchedRaw || 0) + rawRows.length; diag.fetchedDeduped = (diag.fetchedDeduped || 0) + rows.length; }
  const qualified = rows.filter(r => isQualifying(r, spec));
  // No silent drops (Sam Desk): when asked, record every deduped row the qualifier rejected,
  // WITH the reason, so the Desk can show it excluded instead of it vanishing. Same logic as
  // isQualifying (qualifyReason is its reason-returning form), so One Box and the Desk agree.
  if (diag && diag.collectExcluded) {
    diag.excluded = diag.excluded || [];
    for (const r of rows) { const reason = qualifyReason(r, spec); if (reason) diag.excluded.push({ row: r, reason }); }
  }
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

// Freshness (S2-2): the pipeline's newest ONLINE sale is the real "is ingest current?" signal.
// BaT/C&B close daily, so a successful nightly ingest always leaves a sale dated yesterday. When
// the freshest online sale is >2 days stale, ingest did not run - so the line states the real
// date instead of "last night". Cached ~30 min per instance (one cheap read, never metered).
let _obIngestDate = null, _obIngestAt = 0;
async function oneBoxIngestDate(env) {
  if (_obIngestDate !== null && (Date.now() - _obIngestAt) < 30 * 60 * 1000) return _obIngestDate;
  try {
    // sales_archive stores the DISPLAY LABEL in `platform` and the slug in `source_slug` (ingest.js);
    // recent rows always carry source_slug, so key the "freshest online sale" read on the slug.
    const rows = await supabaseSelect(env, `sales_archive?select=sale_date&source_slug=in.(bringatrailer,carsandbids)&order=sale_date.desc&limit=1`);
    _obIngestDate = (rows && rows[0] && String(rows[0].sale_date || "").slice(0, 10)) || "";
  } catch (e) { _obIngestDate = ""; }
  _obIngestAt = Date.now();
  return _obIngestDate;
}
// Pool-aware freshness fact (rendered by the frontend, never asserted as data freshness beyond
// what is true). Online pools ride the ingest signal; house pools state the newest house result
// actually in the pool, since house feeds report on their own cadence (rule: never "last night"
// for a house-led read a high-end owner may already know a fresher sale we do not have).
function obFreshness(houseLed, newestPoolDate, ingestDate, now) {
  const newest = String(newestPoolDate || "").slice(0, 10) || null;
  if (houseLed) return { mode: "house", through: newest };
  const twoAgo = new Date(now - 2 * DAY).toISOString().slice(0, 10);
  const fresh = String(ingestDate || "").slice(0, 10);
  if (fresh && fresh >= twoAgo) return { mode: "online", lastNight: true, through: fresh };
  return { mode: "online", lastNight: false, through: fresh || newest };
}
function obNewestDate(rows) {
  return (rows || []).map(r => String(r.date || r.auction_end_date || r.sale_date || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
}
function miText(row) { const n = Number(String(row.mileage == null ? "" : row.mileage).replace(/[^\d]/g, "")); return n ? n.toLocaleString("en-US") + " mi" : "mileage n/a"; }
// Platform naming for the strip/cards: a NAMED allowlist only. Live auction houses (RM
// Sotheby's, Gooding, Bonhams, Mecum) are NEVER named on this surface (product invariant);
// they fold into "others". A platform stands alone only at 3+ sales.
const OB_NAMED = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty" };
// Resolve via sourceSlugOf (exact label->slug map), NOT a naive strip-non-alpha: the latter turned
// the stored label "Cars & Bids" into "carsbids" (not "carsandbids"), so it missed OB_NAMED and
// rendered "others". sourceSlugOf maps "cars & bids" -> "carsandbids" and passes real slugs through.
const platSlug = s => sourceSlugOf(s);
const platNamed = s => OB_NAMED[sourceSlugOf(s)] || "others";
// UK/EU/AU-only marketplaces held out of One Box comps until UK evidence-routing is approved
// (mirrors /sell's evidenceCapable:false). Matched on the platform LABEL sales_archive stores.
const OB_REGION_EXCLUDE_RE = /car\s*&\s*classic|carandclassic|collecting\s*cars|collectingcars|\bthe\s+market\b|themarket|pistonheads/i;
const OB_REGION_EXCLUDED = s => OB_REGION_EXCLUDE_RE.test(String(s || ""));
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
  // "competition" removed (Sep 2026): it is the MAINSTREAM M-car variant (audit: 29% of M4,
  // 15% of M3 sales), not a rare halo - setting it aside gutted the M-car pool. CSL/CS/GTS/
  // Sport Evolution/Cecotto stay: genuine limited specials that sit above the base M-car.
  // M-car homologation/limited specials that sit ABOVE the base M-car (so a base pool sets them
  // aside, and a record never returns one as the "max"). Sep 2026: added CRT, Lightweight, Lime
  // Rock Park and the M-car GT/GTR (the M3 GT/GTR that the /amg-style base pattern missed - the
  // same gap the leak audit flagged on E36 M3 GT). "Evolution" (mainstream E36) is NOT matched
  // (\bevo\b needs a boundary, absent in "Evolution"); only "Sport Evolution" is.
  { make: /^bmw$/i, re: /(\bcsl\b|\bcs\b|sport\s?evolution|\bevo\b|cecotto|\bgts\b|\bcrt\b|lightweight|lime\s?rock|\bm[2-8]\s?gtr?\b)/i },
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
export { haloMatcherFor };

// Race cars and restomods: never a "stock market" comp, and never the record/max unless asked.
// Shared by One Box and the Sam Desk (one rule, not a Desk copy).
const RACE_TITLE_RE = /\bdtm\b|\bfia\b|\bimsa\b|\bnascar\b|\bgt3\s?cup\b|\bgt4\s?clubsport\b|clubsport\b|\bcup\s?car\b|group\s?[abc45]\b|\brace\s?car\b|\bracing\b|works\s?rally|rally\s?car|\bgrp\.?\s?[abc45]\b|competition\s?(saloon|coupe|car)/i;
const RESTOMOD_TITLE_RE = /restomod|resto-?mod|reimagined|enhanced\s?&\s?evolved|coyote-?power|\bls[0-9]-?(swap|power|powered)|by\s?(singer|redux|kaege|g[uü]nther\s?werks|guntherwerks|emory|icon|ringbrothers|ring\s?brothers|speedkore|ecd|velocity|vintage\s?broncos|heritage|gateway\s?bronco|legacy)\b/i;
// Period TUNER / conversion houses: a converted car, not a stock example, so set aside on both
// surfaces. These MODIFY a base car. Separate MANUFACTURERS with their own VIN/type approval
// (Alpina, RUF) are their OWN cars, NOT conversions, so they are deliberately excluded here.
const TUNER_TITLE_RE = /\b(ac\s?schnitzer|schnitzer|hartge|hamann|dinan|brabus|renntech|lorinser|techart|gemballa|koenig\s?special|\bmtm\b|g[-\s]?power|manhart|hennessey|lingenfelter|roush|saleen|callaway)\b/i;
// Reason a title should be SET ASIDE from a stock answer (record, max, medians, the whole band):
// a make halo, a race car, a restomod, or a period tuner conversion. Returns the reason or null.
// Accepts a row (preferred: carries year for generation-aware calls) or a bare title string.
// wantHalo (the query names the halo/generation/trim) keeps halos in but still drops race cars,
// restomods and tuners. Generation-aware: on the BMW M3, "Evolution"/"Evo"/"Evo II" is a homolog-
// ation special on the E30 (<=1991) but the MAINSTREAM road car on the E36+ (1992+).
export function recordExcludeReason(rowOrTitle, make, opts = {}) {
  const t = typeof rowOrTitle === "string" ? rowOrTitle : String((rowOrTitle && (rowOrTitle.raw_title || rowOrTitle.title)) || "");
  const yr = (typeof rowOrTitle === "object" && rowOrTitle && Number(rowOrTitle.year)) ||
    (t.match(/\b(19|20)\d\d\b/) ? Number(t.match(/\b(19|20)\d\d\b/)[0]) : null);
  if (RACE_TITLE_RE.test(t)) return "race car";
  if (RESTOMOD_TITLE_RE.test(t)) return "restomod";
  if (TUNER_TITLE_RE.test(t)) return "period tuner";
  if (!opts.wantHalo) {
    // Generation-aware E30 M3 Evolution (homologation special); E36+ Evolution is mainstream.
    if (/bmw/i.test(make) && /\bm3\b/i.test(t) && yr && yr >= 1986 && yr <= 1991 && /\bevo(lution)?\b|\bevo\s?ii\b/i.test(t)) return "halo";
    const h = haloMatcherFor(make); if (h && h.test(t)) return "halo";
  }
  return null;
}
// Nameplates where DROPPING the trim to "read other {model}s" blends genuinely DISTINCT models,
// not trims of one car (#2, Sep 2026). Ferrari's per-cylinder-displacement series each name
// several coachbuilt-distinct cars sharing one number (365 GTB/4 Daytona vs 365 GT 2+2 vs
// 365 GTC/4; 250 GTO vs 250 GT 2+2; etc.), and the Viper's RT/10 roadster, GTS coupe and ACR
// track special span too far to pool as one. A title/model-token family pool has NO clean
// sub-model fence for these, so a thin TRIM pool must NOT widen into the family - it routes to
// the honest span-without-cluster (or refusal) state on the trim's own sales instead of blending.
// Leading-number match (not anchored end) so the archive's "250 GT" / "330 GT" model-token
// forms are caught as well as a bare "365". No single-model Ferrari nameplate starts with any
// of these displacement numbers, so the leading-\b match cannot mis-fence a legitimate model.
const NO_FAMILY_WIDEN = [
  { make: /ferrari/i, model: /^(250|275|330|365|512)\b/i },
  { make: /dodge/i, model: /^viper$/i }
];
function blendsAcrossModels(spec) {
  return NO_FAMILY_WIDEN.some(g => g.make.test(spec.make || "") && g.model.test(String(spec.model || "").trim()));
}
// Title matcher for a NAMED trim (scope the pool to it). Tokens must appear contiguous with
// word boundaries so "Carrera S" never matches "Carrera 4S" and "GT3" never matches "GT3 RS"
// unless the query WAS "GT3 RS". Digits stay literal ("Z06", "GT500").
function trimTitleRe(trim) {
  const toks = String(trim || "").trim().toLowerCase().split(/\s+/).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!toks.length) return null;
  return new RegExp(`(^|[^a-z0-9])${toks.join("[\\s-]+")}([^a-z0-9]|$)`, "i");
}
const titleOf = r => String(r.raw_title || r.rtitle || "");
function familyWideningSentence(trimLabel, model, isHalo) {
  const m = model || "car";
  return isHalo
    ? `No recent ${trimLabel} sales, so this reads other ${m}s. The ${trimLabel} has sat above these when they trade.`
    : `Too few recent ${trimLabel} sales on their own, so this reads other ${m}s.`;
}
// The trim label a widening sentence names: prefix the model when the trim alone is ambiguous
// ("Competition" -> "M4 Competition"), leave it when it already carries the model.
function wideningTrimLabel(model, trim) {
  const t = String(trim || "").trim(), m = String(model || "").trim();
  if (!t) return m;
  return t.toLowerCase().indexOf(m.toLowerCase()) === 0 ? t : (m + " " + t);
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
// Span outlier trim (Sep 2026, method review #1): on a DENSE pool (>=20 sales), drop a LONE
// LOW endpoint whose gap to the next sale exceeds 3x the pool's median inter-sale gap - a
// single damaged/non-running/mispriced car that misrepresents the floor. Highs are NEVER
// trimmed (a lone high is a genuine ceiling). Thin pools (<20) are not trimmed here - they
// land on the span-without-cluster state instead. Groups of low sales (gap <= 3x median)
// are genuine spread and stay.
// "Everything from X to Y has sold" must literally contain EVERY sale the card shows. Round the low
// DOWN and the high UP (never nearest, which put $18,888 above a stated $19,000 low and $93,700 above
// a stated $93,500 high), and DO NOT trim - "everything" means the true min to the true max of the
// pool the card summarizes. The typical band (r4Cluster, p25-p75) carries the "sold between" read.
const floor500 = n => Math.floor(n / 500) * 500;
const ceil500 = n => Math.ceil(n / 500) * 500;
const r4Span = a => {
  const v = a.map(r => r._usd).filter(x => x > 0).sort((x, y) => x - y);
  if (!v.length) return [0, 0];
  return [floor500(v[0]), ceil500(v[v.length - 1])];
};
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
  // gap = |median manual price - median auto price|, for the earned-question priority (#3).
  const gap = Math.abs(percentile(man.map(r => r._usd), 0.5) - percentile(aut.map(r => r._usd), 0.5));
  return { manual: "manual", auto, gap };
}
// Median-price gap between the low-mileage and high-mileage halves of the pool (#3): the
// size of the mileage split, to compare against the transmission split.
function r4MileageGap(solid) {
  const withMi = solid.filter(r => miOf(r) > 0);
  if (withMi.length < 10) return null;
  const miMed = percentile(withMi.map(miOf), 0.5);
  const lo = withMi.filter(r => miOf(r) <= miMed).map(r => r._usd), hi = withMi.filter(r => miOf(r) > miMed).map(r => r._usd);
  if (lo.length < 5 || hi.length < 5) return null;
  return Math.abs(percentile(lo, 0.5) - percentile(hi, 0.5));
}
// Item 7: the driver search. The band is "wide" when the q25-q75 cluster spans > 40% of the
// median. On a wide band, test each candidate FACT (mileage split at the median, gearbox, and any
// dictionary title-flag for this model family) by splitting the pool and measuring how much the
// cluster band tightens; the winner (5+ on each side) becomes the second question. If nothing
// clears 5+/5+, no question renders and the block gets one honest sentence. On a TIGHT band the
// caller asks mileage as before. Never forces a driver question for a model with no dictionary
// entry, and never crashes on a model outside the five families.
const OB_BAND_WIDE = 0.40;
// Text a dictionary flag is mined from: the short title always, plus the listing description WHEN
// it has been attached (the item-7 bounded second fetch). Provenance phrases ("matching numbers",
// "Classiche", "documented") live in the description, not the short online title.
function dtext(r) { return String(titleOf(r) || "") + " " + String((r && r._descText) || ""); }
// Fetch descriptions for JUST this pool's records and attach them, so the dictionary can mine
// title+description. Bounded (the landed pool, ~8-30 rows), one query, id-keyed. Returns the ms
// spent (for the latency budget) or null on failure - the caller keeps the title-only result.
async function obEnrichDescriptions(chosen, env, diag) {
  const ids = [...new Set((chosen.rows || []).map(r => r.id).filter(v => v != null))];
  if (!ids.length) return null;
  const t0 = Date.now();
  try {
    const rows = (await supabaseSelect(env, `sales_archive?id=in.(${ids.join(",")})&select=id,d:raw_record->>description`)) || [];
    const byId = {}; for (const dr of rows) byId[dr.id] = String(dr.d || "");
    let n = 0; for (const r of chosen.rows) { if (byId[r.id] != null) { r._descText = byId[r.id]; n++; } }
    const ms = Date.now() - t0; if (diag) { diag.descFetchMs = ms; diag.descEnriched = n; diag.descPoolSize = ids.length; }
    return ms;
  } catch (e) { return null; }
}
function bandWidthOf(rows) {
  if (!rows || rows.length < 5) return null;
  const us = rows.map(r => r._usd);
  const m = percentile(us, 0.5);
  return m > 0 ? (percentile(us, 0.75) - percentile(us, 0.25)) / m : null;
}
function r4DriverSearch(solid, cluster, vehicle) {
  const med = percentile(solid.map(r => r._usd), 0.5);
  if (!(med > 0) || !cluster) return { wideBand: false, candidates: [] };
  const fullBand = (cluster[1] - cluster[0]) / med;
  if (fullBand <= OB_BAND_WIDE) return { wideBand: false, candidates: [] };
  // tightening = how much the average of the two sides' band widths falls below the full band.
  const tighten = (a, b) => { const wa = bandWidthOf(a), wb = bandWidthOf(b); return (wa == null || wb == null) ? null : (fullBand - (wa + wb) / 2); };
  const candidates = [];
  const withMi = solid.filter(r => miOf(r) > 0);
  if (withMi.length >= 10) {
    const miMed = percentile(withMi.map(miOf), 0.5);
    const lo = withMi.filter(r => miOf(r) <= miMed), hi = withMi.filter(r => miOf(r) > miMed);
    if (lo.length >= 5 && hi.length >= 5) { const t = tighten(lo, hi); if (t != null) candidates.push({ kind: "mileage", tighten: t }); }
  }
  const man = solid.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = solid.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length >= 5 && aut.length >= 5) { const t = tighten(man, aut); if (t != null) candidates.push({ kind: "transmission", tighten: t }); }
  const dictDiag = [];
  for (const drv of driversForVehicle(vehicle)) {
    const yes = solid.filter(r => drv.re.test(dtext(r))), no = solid.filter(r => !drv.re.test(dtext(r)));
    dictDiag.push({ key: drv.key, yes: yes.length, no: no.length });
    if (yes.length >= 5 && no.length >= 5) { const t = tighten(yes, no); if (t != null) candidates.push({ kind: "driver", driverKey: drv.key, tighten: t }); }
  }
  candidates.sort((a, z) => z.tighten - a.tighten);
  return { wideBand: true, candidates, best: candidates[0] || null, fullBand, dictDiag };
}

// The ROUND-4 result model: today-first window, folded Sam's-take facts, the earned question,
// inline refinement. Counts are never returned as rendered facts. Returns a result or refusal.
// #1 DIVERGENCE RULE (Sep 2026, locked rule set 17-19): when the exact car's OWN completed
// in-window sale falls materially (>10% beyond the nearer cluster edge) outside the displayed
// cluster, the result must never show the cluster as if that sale didn't exist. Classify:
//   a = a known attribute (mileage) explains the gap in the right direction -> state it as fact
//   b = we know it diverges but the explaining fact is missing (mileage null) -> ask for it
//   c = nothing in the data explains it -> caller loosens/withholds the Live Take
// Threshold locked at 10% (validated Sep 2026: ~25% fire on clean scoped pools = genuine tails).
function computeDivergence(exactSale, cluster, solid, winIsoDate) {
  if (!exactSale || !cluster) return null;
  const price = Number(exactSale.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const d = String(exactSale.soldDate || "").slice(0, 10);
  if (!d || d < winIsoDate) return null;                 // rule 1 applies to in-window sales only
  const lo = cluster[0], hi = cluster[1];
  const below = price < lo * 0.90, above = price > hi * 1.10;
  if (!below && !above) return null;                     // inside/near the cluster: no divergence
  const mi = Number(String(exactSale.mileage == null ? "" : exactSale.mileage).replace(/[^\d]/g, ""));
  const dir = below ? "below" : "above";
  const out = { price, soldDate: d, direction: dir, attr: "mileage" };
  if (!(mi > 0)) return { ...out, mileage: null, kase: "b" };   // missing the explaining fact
  out.mileage = mi;
  const poolMi = solid.map(r => miOf(r)).filter(n => n > 0).sort((a, b) => a - b);
  const medMi = poolMi.length ? poolMi[Math.floor(poolMi.length / 2)] : null;
  const explains = medMi != null && ((below && mi > medMi * 1.15) || (above && mi < medMi * 0.85));
  return explains ? { ...out, kase: "a", poolMedianMileage: medMi } : { ...out, kase: "c", attr: null, poolMedianMileage: medMi };
}
// The subject's own prior sale must never appear as a comp card (it lives in the exact-car
// block). Match by rounded price + sale date, the same identity the archive dedup uses.
function sameAsSubject(r, exactSale) {
  if (!exactSale) return false;
  const sp = Math.round(Number(exactSale.price) || 0); if (!(sp > 0)) return false;
  const sd = String(exactSale.soldDate || "").slice(0, 10), d = String(r.auction_end_date || "").slice(0, 10);
  return Math.round(r._usd) === sp && (!sd || !d || sd === d);
}
// Three REPRESENTATIVE sales for the render port (round 7): a closest match plus a high and a
// low bracket that GENUINELY bracket it - one meaningfully above its price, one meaningfully
// below. "Meaningfully" is data-derived (the pool's median inter-sale price gap, same basis as
// the span-outlier trim), never a guessed percentage: a bracket must sit at least one typical
// price step from the closest match, so a near-duplicate price ($30,480 next to $30,000) is
// NEVER surfaced as a "lower" sale. When no comp sits meaningfully below (the closest is already
// near the pool floor), only the high bracket renders - a single card, not a mislabelled one.
// Labels lead with the ATTRIBUTE that explains the gap (mileage, transmission, an older sale);
// a bare price-direction token (higher/lower) is only the fallback when nothing else does.
// Backend returns facts + delta TOKENS only; the render turns tokens into prose (rule 3).
// Two-sided robust price fence for pool contamination (Sep 2026). Halo highs (a $600k 964 Turbo
// bracketing a $126k base Carrera) and data-error lows (a $513 mis-priced 250F flooring a class
// band) are BOTH real records with real titles that the title/percentile filters miss - the gap
// is that nothing checks a record's price is PLAUSIBLE for its pool. This fences records whose
// price is an extreme multiple of the pool MEDIAN in either direction, applied to BOTH the bracket
// pool (pickRepresentative) and the class-era band (assessClassEra).
// Ratios locked from the before/after (Sam-approved, Sep 2026). BRACKETS use a SYMMETRIC 4x fence
// (median $116k 964 pool -> $29k/$464k: drops the $600k Turbo halo and the $9 data error, keeps
// ~91%). The CLASS band uses a LOW-SIDE-ONLY fence (OB_CLASS_LO) because it is legitimately $M-wide
// at the top - a high fence would trim genuine race cars, so only data-error lows are removed and
// the p10-p90 handles the top honestly.
const OB_OUTLIER_HI = 4;    // brackets: exclude a record priced > median * HI
const OB_OUTLIER_LO = 4;    // brackets: exclude a record priced < median / LO
const OB_CLASS_LO = 6;      // class band: LOW-SIDE only - exclude a record priced < median / OB_CLASS_LO
function _obMedian(nums) { const s = nums.filter(n => n > 0).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; }
function priceOutlierBounds(prices) { const m = _obMedian(prices); return m > 0 ? { med: m, hi: m * OB_OUTLIER_HI, lo: m / OB_OUTLIER_LO } : null; }

function pickRepresentative(solid, exactSale, center, driver, divergence) {
  const comps = solid.filter(r => !sameAsSubject(r, exactSale));
  if (!comps.length) return null;
  // Bracket pool with extreme price outliers fenced out (halo highs / data-error lows). closest
  // stays the subject/middle anchor computed over all comps; only high/low draw from the fenced set.
  const _ob = priceOutlierBounds(comps.map(r => r._usd));
  const bpool = _ob ? comps.filter(r => r._usd <= _ob.hi && r._usd >= _ob.lo) : comps;
  const byPrice = [...comps].sort((a, b) => a._usd - b._usd);
  // Coherence fix (Sep 2026): normally "closest" anchors on the subject's mileage. But when the
  // subject DIVERGES from the cluster (it is atypical - here high-mileage), its nearest-mileage comp
  // is a pool EXTREME that lands OUTSIDE the headline band, so "CLOSEST MATCH" would contradict the
  // Live Take. In the divergence case, anchor "closest" on the cluster MIDDLE so the closest card
  // traces to the band; the subject's own atypical sale is carried by the divergence beat + refine.
  const subjMi = (exactSale && !divergence) ? (Number(String(exactSale.mileage == null ? "" : exactSale.mileage).replace(/[^\d]/g, "")) || 0) : 0;
  // The non-subject anchor is the MEDIAN of the qualifying sale prices - the genuinely typical
  // transaction - NOT the arithmetic midpoint of the displayed band. This is what lets the label
  // read "TYPICAL SALE" honestly (a label must describe exactly what the software did): the card is
  // the real sale nearest the median of what actually sold, and it still lands inside the headline
  // band (the median is central), so it never contradicts the Live Take.
  const medUsd = byPrice[Math.floor((byPrice.length - 1) / 2)]._usd;
  let closest;
  if (subjMi > 0) { const wm = comps.filter(r => miOf(r) > 0); closest = (wm.length ? wm : comps).slice().sort((a, b) => Math.abs(miOf(a) - subjMi) - Math.abs(miOf(b) - subjMi))[0]; }
  else closest = byPrice.slice().sort((a, b) => Math.abs(a._usd - medUsd) - Math.abs(b._usd - medUsd))[0];
  const cMi = miOf(closest), cUsd = closest._usd, cManual = R4_MANUAL(String(closest.transmission || "")), cDate = String(closest.auction_end_date || "").slice(0, 10);
  // Data-derived "meaningful" price step: the median gap between adjacent sale prices in the pool.
  const prices = byPrice.map(r => r._usd), gaps = [];
  for (let i = 1; i < prices.length; i++) gaps.push(prices[i] - prices[i - 1]);
  const step = gaps.length ? Math.max(1, [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 1;
  // High = the pool ceiling among comps meaningfully ABOVE the closest; low = the floor among
  // comps meaningfully BELOW it. Either may be absent (closest sits at that extreme).
  const above = bpool.filter(r => r !== closest && r._usd > cUsd + step);
  const below = bpool.filter(r => r !== closest && r._usd < cUsd - step);
  const high = above.length ? above.reduce((m, r) => (r._usd > m._usd ? r : m)) : null;
  const low = below.length ? below.reduce((m, r) => (r._usd < m._usd ? r : m)) : null;
  const delta = (r, hi) => {
    if (!r) return null;
    const mi = miOf(r), man = R4_MANUAL(String(r.transmission || "")), aut = R4_AUTO(String(r.transmission || ""));
    if (hi) {                                             // pricier than closest - what earns it
      if (cMi > 0 && mi > 0 && mi < cMi * 0.85) return "fewer_miles";
      if (man && !cManual) return "manual";
      return "higher";
    }
    if (cMi > 0 && mi > 0 && mi > cMi * 1.15) return "more_miles";   // cheaper - what explains it
    if (cManual && aut) return "automatic";
    const rd = String(r.auction_end_date || "").slice(0, 10);
    if (rd && cDate && rd < cDate && (new Date(cDate) - new Date(rd)) / 864e5 > 180) return "earlier";
    return "lower";
  };
  const shape = (r, role, dl, basis) => {
    if (!r) return null;
    const c = shapeCards([r])[0];
    const disp = priceDisplay(r), isH = isHouseSource(r.source);
    c.isHouse = isH;
    c.allIn = (isH && disp && disp.premiumInclusive && disp.amount) ? Math.round(disp.currency === "USD" ? disp.amount : toUsd(disp.amount, disp.currency)) : null;
    c.role = role; c.delta = dl || null; c.basis = basis || null;
    return c;
  };
  return {
    closest: shape(closest, "closest", null, subjMi > 0 ? "subject" : "middle"),
    high: high ? shape(high, "high", delta(high, true), null) : null,
    low: low ? shape(low, "low", delta(low, false), null) : null,
    count: comps.length
  };
}
// ---- THIN MODE + HOUSE STEER assessment (Sep 2026) ------------------------------------
// Two decoupled concerns (revised design):
//  1. THIN MODE (render): fires when the VOLUME-capable online count over the 36-month model pool
//     is < HT_ONLINE_MIN, REGARDLESS of house presence. Replaces the span-only "too few to mark a
//     band" state. Sale-anchored hero, ask-first intake ONLY from splits that fork THIS car's price
//     (config markers for vintage, mileage/transmission for modern), receipts with hammer + all-in.
//  2. HOUSE STEER (layer): only when house share >= 2/3 of the pool. Then "these mostly trade at
//     the houses" and /sell goes house-first. Below 2/3, venue-neutral: receipts still show house
//     sales, but no house-first recommendation.
// Facts only (product rule 3): the client composes every intake question and chip label.
const HT_ONLINE_MIN = 15;
const HT_WINDOW_DAYS = 1095; // 36 months
const HT_STEER_SHARE = 2 / 3;
const htVenue = r => platformName(sourceSlugOf(r)) || String(r.source || "");
// Item 4: chassis for house/class receipts. Full where the listing states it in the title
// ("Chassis no. 2147", "s/n 076"); else the last digits of the normalized VIN/chassis field.
function chassisFromTitle(title) {
  const m = String(title || "").match(/\b(?:chassis|s\/n|serial)\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9.\-\/]{2,22})/i);
  return m && m[1] ? m[1].replace(/[.\-\/]+$/, "").trim() : null;
}
function chassisTail(vinNorm) {
  const v = String(vinNorm || "").replace(/[^A-Z0-9]/gi, "");
  return v.length >= 4 ? v.slice(-6) : null;
}
function htReceipt(r) {
  const isHouse = isHouseSource(r.source);
  const title = String(r.raw_title || r.rtitle || "");
  const cur = String(r.currency || "USD").toUpperCase();
  // Native-currency figures (item 5): only when a house sale settled in a non-USD currency, so
  // a EUR/GBP result leads with its own figure and shows the USD computed beside it.
  const np = (isHouse && cur !== "USD") ? nativePrices(r) : null;
  return {
    venue: htVenue(r),
    slug: sourceSlugOf(r),
    isHouse,
    date: String(r.auction_end_date || "").slice(0, 10),
    soldLabel: soldLabel(r.auction_end_date),
    hammer: r._hammer,
    allIn: isHouse ? r._allin : null,
    currency: cur,
    nativeCur: np ? np.currency : null,
    nativeHammer: np ? np.hammer : null,
    nativeAllIn: np ? np.total : null,
    year: r.year || null,
    mileage: miOf(r) || null,
    transmission: r.transmission ? String(r.transmission) : null,
    title,
    // Tier-aware fields (item 4): chassis + colour surface on house/class receipts, mileage secondary.
    chassis: isHouse ? chassisFromTitle(title) : null,
    chassisTail: isHouse ? chassisTail(r.vin_norm) : null,
    color: (isHouse && r.color && String(r.color).trim() && !/^null$/i.test(String(r.color))) ? String(r.color).trim() : null,
    markers: extractMarkers(r).map(k => ({ key: k, label: markerLabel(k) })),
    vinNorm: r.vin_norm ? String(r.vin_norm) : null,
    image: r.image || null,   // thumbnail for the compact receipt row (hard rule: every row keeps one)
    url: r.srcurl || r.srcurl2 || r.url || null,
    // House-comparison (Sep 2026): the auction location the record carries. RM populates city with
    // the sale city (Monterey); used by eventFromRecord to state the room as a data fact. Others null.
    city: isHouse && r.city && String(r.city).trim() && !/^null$/i.test(String(r.city)) ? String(r.city).trim() : null
  };
}
const htMedOf = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2); };
const htFork = (a, b) => (a && b) ? Math.max(a, b) / Math.min(a, b) : 1;
// The ONE split whose answer most forks this car's price. Candidates: config markers (vintage),
// a mileage band (modern), or transmission. Each qualifies only with >=2 receipts each side AND a
// >=1.4x median-price fork. Returns FACTS; the client composes the question + chip labels. Null =
// no split, so the render skips the intake line entirely (never an empty intake).
function pickThinIntake(receipts) {
  const N = receipts.length, cands = [];
  const counts = {};
  for (const rc of receipts) for (const m of rc.markers) counts[m.key] = (counts[m.key] || 0) + 1;
  for (const [k, c] of Object.entries(counts)) {
    if (c < 2 || N - c < 2) continue;
    const wM = htMedOf(receipts.filter(r => r.markers.some(m => m.key === k)).map(r => r.hammer));
    const oM = htMedOf(receipts.filter(r => !r.markers.some(m => m.key === k)).map(r => r.hammer));
    const sep = htFork(wM, oM);
    if (sep >= 1.4) cands.push({ kind: "marker", markerKey: k, markerLabel: markerLabel(k), withN: c, withoutN: N - c, sep });
  }
  const withMi = receipts.filter(r => Number(r.mileage) > 0);
  if (withMi.length >= 4) {
    const thr = htMedOf(withMi.map(r => Number(r.mileage)));
    const lo = withMi.filter(r => Number(r.mileage) <= thr), hi = withMi.filter(r => Number(r.mileage) > thr);
    if (lo.length >= 2 && hi.length >= 2) {
      const sep = htFork(htMedOf(lo.map(r => r.hammer)), htMedOf(hi.map(r => r.hammer)));
      if (sep >= 1.4) cands.push({ kind: "mileage", threshold: thr, thresholdK: Math.max(1, Math.round(thr / 1000)), lowN: lo.length, highN: hi.length, sep });
    }
  }
  const man = receipts.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = receipts.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length >= 2 && aut.length >= 2) {
    const sep = htFork(htMedOf(man.map(r => r.hammer)), htMedOf(aut.map(r => r.hammer)));
    if (sep >= 1.4) cands.push({ kind: "transmission", manN: man.length, autN: aut.length, sep });
  }
  cands.sort((a, z) => z.sep - a.sep);
  return cands[0] || null;
}
async function assessThin(famSpec, trimName, trimRe, iso, env, diag) {
  // Fetch the model family WITHOUT a DB title pre-filter: a titleContains of the resolved trim
  // ("GTB Daytona") would ilike *GTB Daytona* at the database and return zero, because the archive
  // writes "365 GTB/4 Daytona" (the /4 breaks the phrase). Scope the trim in-memory below instead.
  const raw = await fetchQualifying({ ...famSpec, houseTier: true }, iso(HT_WINDOW_DAYS), env, diag);
  const ttl = r => String(r.raw_title || r.rtitle || "");
  // Trim scope: the precise resolved trim first. When that is too thin (< 2), fall back to the
  // LEADING trim token, the body/designation code that defines the sub-model (275 "GTB", 250
  // "GTO"). This is what fixes the Daytona: the resolver yields trim "GTB Daytona" but the archive
  // writes "365 GTB/4 Daytona", so the adjacent-phrase match finds nothing while "GTB" isolates
  // the Daytona out of the blended 365 family (GTC / GT 2+2 / GTC/4 / California) cleanly.
  let scoped = trimRe ? raw.filter(r => trimRe.test(ttl(r))) : raw;
  if (trimName && trimRe && scoped.length < 2) {
    const firstTok = String(trimName).trim().split(/\s+/)[0];
    const ftRe = firstTok ? trimTitleRe(firstTok) : null;
    if (ftRe) { const alt = raw.filter(r => ftRe.test(ttl(r))); if (alt.length >= scoped.length) scoped = alt; }
  }
  const pool = scoped
    .map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
    .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
  const house = pool.filter(r => isHouseSource(r.source));
  const online = pool.filter(r => !isHouseSource(r.source));
  // THIN trigger: the VOLUME-capable online count (photo-gated, like volume mode) is too small to
  // stand a cluster. House presence is NOT required (that is the steer, below).
  const onlineVolumeN = online.filter(r => r.image).length;
  const isThin = onlineVolumeN < HT_ONLINE_MIN && pool.length >= 1;
  // HOUSE STEER: house share of the receipt pool >= two-thirds. This, and only this, licenses the
  // "these mostly trade at the houses" read and the /sell house-first recommendation.
  const denom = house.length + online.length;
  const houseSteer = denom > 0 && (house.length / denom) >= HT_STEER_SHARE;
  const meta = { isThin, houseSteer, onlineN: onlineVolumeN, onlineReceiptsN: online.length, houseN: house.length, totalN: pool.length, windowMonths: 36 };
  if (!isThin) return meta;

  const receipts = pool.map(htReceipt).sort((a, z) => z.hammer - a.hammer);

  // Paired sales: same chassis (vin_norm) sold both online AND at a house. The stated % stays
  // DORMANT until a model clears 3 such pairs; below that we surface the two receipts only.
  const byVin = new Map();
  for (const rc of receipts) {
    if (!rc.vinNorm) continue;
    if (!byVin.has(rc.vinNorm)) byVin.set(rc.vinNorm, []);
    byVin.get(rc.vinNorm).push(rc);
  }
  const pairs = [...byVin.values()]
    .filter(g => g.some(x => x.isHouse) && g.some(x => !x.isHouse))
    .map(g => [...g].sort((a, z) => String(a.date).localeCompare(String(z.date))));

  const intake = pickThinIntake(receipts);
  const medianHammer = htMedOf(receipts.map(r => r.hammer));
  return { ...meta, receipts, pairs, pairsCount: pairs.length, pairPctEligible: pairs.length >= 3, intake, medianHammer };
}

// Reusable thin/steer assessment for a resolved vehicle, so /sell can render the same THIN MODE
// and HOUSE STEER as One Box. Reads the ARCHIVE only (sales_archive) - ZERO OldCarsData spend,
// so it never adds a metered fetch to the /sell path. Returns the assessThin object (isThin,
// houseSteer, receipts, intake, ...) or {isThin:false} when it cannot scope.
export async function assessThinForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make) return { isThin: false };
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return { isThin: false };
    const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
    const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
    const trimRe = trimName ? trimTitleRe(trimName) : null;
    const now = Date.now();
    const iso = days => new Date(now - days * 864e5).toISOString();
    return await assessThin(famSpec, trimName, trimRe, iso, env, {});
  } catch (e) { return { isThin: false, error: String((e && e.message) || e) }; }
}

// Comp price RANGE for a resolved vehicle, archive-only (sales_archive), ZERO OldCarsData spend.
// Powers the /sell price-step transparency affordance (#68): when a seller DEFERS the asking
// price, Sam shows THE RECORD - the real range cars like this sold for over the standard window -
// and NEVER a single number. NO median, NO midpoint EVER: a lone figure a seller is invited to
// adopt is a valuation whatever the sentence around it says (locked house rule). Uses the SAME
// 36-month window (HT_WINDOW_DAYS) and qualifying gates as the thin/class-era result band, and
// NEVER widens the window to manufacture a spread - too thin returns ok:false so the caller says
// so honestly. Edges mirror the class-era band (p10-p90 bulk at n>=8, min-max for a small pool) so
// a raw outlier never over-claims. Returns only {ok,count,low,high,windowMonths,currency,poolLabel}
// - deliberately NO median field, so a midpoint can never leak into copy.
const PRICE_RANGE_MIN = 5; // below this there is no honest spread; say so, never widen to fake one
export async function priceBandForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false, reason: "unscopable" };
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return { ok: false, reason: "unscopable" };
    // Scope the pool to the seller's ACTUAL config. A named trim not already scoped by a
    // performance badge filters the archive TITLE, so a "250 GT Lusso" reads Lussos (and
    // honestly thins when there are too few) instead of pooling the whole 250 GT family
    // (a Lusso priced next to a GTO) - pooling the family to manufacture a spread is exactly
    // the "widen to fake a range" the price-record rule forbids.
    const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
    if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
    const sinceIso = new Date(Date.now() - HT_WINDOW_DAYS * 864e5).toISOString();
    const rows = await fetchQualifying(spec, sinceIso, env, {});
    // Chassis-code union: the archive files modern 911s under "991"/"997", not the "911"
    // nameplate, so a bare-nameplate scope reads thin. When the generation names a chassis
    // code, also pull that code's pool (SAME year + trim scope) and union by id, so a "2018
    // 911 Carrera GTS" reads the 991 GTS sales. NOT a window-widen (same 36 months, same
    // trim) - just the archive's other spelling of the same car.
    const codeTok = generationModelToken(generation);
    if (rows.length < 8 && codeTok && codeTok.toLowerCase() !== String(spec.model || "").toLowerCase()) {
      const more = await fetchQualifying({ ...spec, model: codeTok }, sinceIso, env, {});
      const seen = new Set(rows.map(r => r.id));
      for (const r of more) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    const values = rows.map(r => Number(r.value)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const windowMonths = Math.round(HT_WINDOW_DAYS / 30.4);
    if (values.length < PRICE_RANGE_MIN) return { ok: false, reason: "thin", count: values.length, windowMonths };
    const round = n => { const step = n >= 100000 ? 5000 : n >= 25000 ? 1000 : 500; return Math.round(n / step) * step; };
    const low = round(values.length >= 8 ? percentile(values, 0.1) : values[0]);
    const high = round(values.length >= 8 ? percentile(values, 0.9) : values[values.length - 1]);
    if (!(high > low)) return { ok: false, reason: "thin", count: values.length, windowMonths }; // no degenerate single-point "range"
    return { ok: true, count: values.length, low, high, windowMonths, currency: "USD",
      poolLabel: nameplate(spec.model, spec.trim) || [vehicle.make, vehicle.model].filter(Boolean).join(" ") };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Per-transaction listing for a resolved vehicle, archive-only (sales_archive), ZERO OldCarsData.
// Returns every qualifying SOLD transaction (the archive is sold-only by construction) over a
// caller-chosen window, with the raw fields for manual verification: date, price (USD hammer +
// native), mileage, platform, title, transmission, url. Trim-scoped like priceBandForVehicle
// (never widened to the family) plus the chassis-code union. The CALLER applies any finer spec
// filter (engine/variant/market) from the titles - this only scopes to make/model/trim/year.
export async function listSalesForVehicle(vehicle, generation, env, sinceDays) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false, reason: "unscopable", sales: [] };
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return { ok: false, reason: "unscopable", sales: [] };
    const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
    if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
    const days = Number(sinceDays) > 0 ? Number(sinceDays) : HT_WINDOW_DAYS;
    const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
    const rows = await fetchQualifying(spec, sinceIso, env, {});
    const codeTok = generationModelToken(generation);
    if (codeTok && codeTok.toLowerCase() !== String(spec.model || "").toLowerCase()) {
      const more = await fetchQualifying({ ...spec, model: codeTok }, sinceIso, env, {});
      const seen = new Set(rows.map(r => r.id));
      for (const r of more) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    const sales = rows.map(r => ({
      date: r.auction_end_date || null,
      priceUsd: Number(r.value) || null,
      priceNative: Number(r.price) || null,
      currency: r.currency || "USD",
      mileage: r.mileage != null ? Number(String(r.mileage).replace(/[^\d.]/g, "")) || null : null,
      platform: r.source || null,
      title: r.raw_title || r.rtitle || null,
      transmission: r.transmission || null,
      year: r.year || null,
      url: r.srcurl || r.srcurl2 || null
    })).filter(s => s.priceUsd > 0).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { ok: true, windowDays: days, count: sales.length,
      poolLabel: nameplate(spec.model, spec.trim) || [vehicle.make, vehicle.model].filter(Boolean).join(" "), sales };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e), sales: [] }; }
}

// Raw title search of sales_archive (archive-only, ZERO OldCarsData) for verification/diagnosis:
// distinguishes a RESOLVER gap (the sales exist under a title we failed to scope) from a real DATA
// gap. Matches the listing_title verbatim (ILIKE *term*), no make/model/trim scoping at all.
export async function rawTitleSearch(term, env, sinceDays, limit) {
  try {
    if (!term || !env) return { ok: false, term, count: 0, rows: [] };
    const days = Number(sinceDays) > 0 ? Number(sinceDays) : 1096;
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const cols = "price:sale_price,date:sale_date,platform,title:listing_title,year,vin_norm," +
      "transmission:raw_record->>transmission,mileage:raw_record->>mileage,currency:raw_record->>currency," +
      "url:raw_record->>url,url2:raw_record->>source_url";
    const q = `sales_archive?select=${cols}&listing_title=ilike.${encodeURIComponent("*" + term + "*")}` +
      `&sale_price=not.is.null&sale_date=gte.${since}&order=sale_date.desc&limit=${Number(limit) || 300}`;
    const rows = (await supabaseSelect(env, q)) || [];
    return { ok: true, term, windowDays: days, count: rows.length,
      rows: rows.map(r => ({ date: r.date, price: Number(r.price) || null, platform: r.platform || null,
        title: r.title || null, year: r.year || null, transmission: r.transmission || null,
        mileage: r.mileage != null ? Number(String(r.mileage).replace(/[^\d.]/g, "")) || null : null,
        url: r.url || r.url2 || null })) };
  } catch (e) { return { ok: false, term, error: String((e && e.message) || e), rows: [] }; }
}

// ---- CLASS-ERA rung (Part 1, Sep 2026) ------------------------------------------------
// The rung BENEATH thin mode: fires only when the exact-model pool is EMPTY over 36 months (a
// genuine one-off / near-one-off). Widens to the SAME MARQUE within the car's decade era band -
// no cross-marque grouping, no hand-curated class map. A coarse, honestly-labelled fallback: it
// states plainly it is the wider era-marque market, not the exact car. Same receipt discipline as
// thin mode (memorabilia/parts/UK excluded, hammer + all-in). Archive-only, zero OldCarsData.
function eraBand(year) {
  const y = Number(year);
  if (!(y >= 1900 && y <= 2100)) return null;
  const dec = Math.floor(y / 10) * 10;
  return { start: dec, end: dec + 9, label: dec + "s" };
}
const CLASS_COLS = "price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,vin_norm," +
  "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,mods:raw_record->>modifications," +
  "rtitle:raw_record->>title,currency:raw_record->>currency,transmission:raw_record->>transmission," +
  "color:raw_record->>exterior_color,srcurl:raw_record->>url,srcurl2:raw_record->>source_url";
async function assessClassEra(spec, env, diag) {
  const era = eraBand(spec && spec.year);
  if (!era || !spec.make || !env) return null;
  const since = new Date(Date.now() - HT_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const q = `sales_archive?select=${CLASS_COLS}&make=ilike.${encodeURIComponent(spec.make)}` +
    `&sale_price=not.is.null&year=gte.${era.start}&year=lte.${era.end}&sale_date=gte.${since}` +
    `&order=sale_date.desc&limit=1000`;
  let rows = (await supabaseSelect(env, q)) || [];
  if (diag) { diag.classQueries = (diag.classQueries || 0) + 1; }
  rows = dedupBySaleIdentity(rows).filter(r => !OB_REGION_EXCLUDED(r.source));
  const pool = rows
    .filter(r => !isMemorabilia(r.raw_title || r.rtitle) && !isPartsListing(r.raw_title || r.rtitle, r.mileage))
    .map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
    .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
  if (!pool.length) return { isClass: false, era: era.label, make: spec.make };
  // Fence data-error LOWS out of the class band (a $513 mis-priced 250F, a $15,750 "child's car",
  // a $16,741 ciclocarro) before the p10-p90. LOW-SIDE ONLY (median/OB_CLASS_LO): the class pool is
  // legitimately $M-wide at the top, so a high fence would trim genuine race cars - the p10-p90
  // already handles the top honestly. Sam-approved (Sep 2026); before/after lifted trueLow $513->$38k.
  const _cmed = _obMedian(pool.map(r => r._hammer));
  const _cfloor = _cmed > 0 ? _cmed / OB_CLASS_LO : 0;
  const fenced = _cfloor ? pool.filter(r => r._hammer >= _cfloor) : pool;
  const usePool = fenced.length ? fenced : pool;
  const receipts = usePool.map(htReceipt).sort((a, z) => z.hammer - a.hammer);
  const hs = receipts.map(r => r.hammer);
  // A class pool is intentionally heterogeneous (a cheap project next to a race car), so a raw
  // min-max over-claims ("a 1950s Maserati from $1,747"). Show the p10-p90 BULK band when there
  // are enough sales; keep min/max as facts. This is coarser and more honest, not stronger.
  const band = hs.length >= 8 ? [Math.round(percentile(hs, 0.1)), Math.round(percentile(hs, 0.9))] : [Math.min(...hs), Math.max(...hs)];
  return { isClass: true, era: era.label, make: spec.make, model: spec.model || null, receipts, totalN: usePool.length, medianHammer: htMedOf(hs), lowHammer: band[0], highHammer: band[1], trueLow: Math.min(...hs), trueHigh: Math.max(...hs) };
}
// Reusable class-era assessment for /sell (archive-only, zero OldCarsData).
export async function assessClassEraForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.year) return null;
    const spec = buildSpec(vehicle, generation, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "));
    if (!spec || !spec.make) return null;
    return await assessClassEra(spec, env, {});
  } catch (e) { return null; }
}

function buildResult(chosen, base, iso, spec, refine) {
  let rows = [...chosen.rows].filter(r => Number.isFinite(r._usd) && r._usd > 0);
  // Inline refinement (the earned question answered): narrow by mileage band and/or transmission.
  const refined = !!(refine && (refine.miMin != null || refine.tx || refine.driver || refine.observe));
  let observeAside = null;
  if (refined) {
    if (refine.miMin != null) rows = rows.filter(r => { const m = miOf(r); return m > 0 && m >= refine.miMin && (refine.miMax == null || m < refine.miMax); });
    if (refine.tx === "manual") rows = rows.filter(r => R4_MANUAL(String(r.transmission || "")));
    if (refine.tx === "auto") rows = rows.filter(r => R4_AUTO(String(r.transmission || "")));
    // Dictionary driver (item 7/8): narrow to the listings that carry (or do not carry) the mined
    // title flag. Framed "listed as" in the copy since it is read off the title, not inspected.
    if (refine.driver) { const drv = driverByKey(base.vehicle, refine.driver); if (drv) rows = rows.filter(r => refine.driverVal === "no" ? !drv.re.test(dtext(r)) : drv.re.test(dtext(r))); }
    // Observable-fact refinement (item 9): hold the flagged cars OUT of the main band and report
    // THEIR own range as an aside. Never adjusts a price; the main band becomes "cars that didn't".
    if (refine.observe && OBSERVE_FLAGS[refine.observe]) {
      const det = OBSERVE_FLAGS[refine.observe];
      const fu = rows.filter(r => det.re.test(obText(r))).map(r => r._usd).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      if (fu.length) observeAside = { key: refine.observe, label: det.label, lo: r500(fu[0]), hi: r500(fu[fu.length - 1]), n: fu.length };
      rows = rows.filter(r => !det.re.test(obText(r)));
    }
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
  // Varied refusal: genuinely different markets pooled under one name. chosen.forceVaried is the
  // base (no-trim) arm of the #2 fence - a bare blend-nameplate ("250 GT") whose one token names
  // distinct models must NEVER render a computed span or cluster, even when a body-scoped subset
  // happens to look low-ratio. It routes here (varied), exactly as the trim-path fence routes a
  // thin trim pool to span-without-cluster instead of widening into the family.
  if (chosen.forceVaried || (!refined && (ratio > 6 || (yspan >= 15 && variantTokens(solid).length >= 2 && ratio > 2.5)))) {
    const yearSpanPhrase = yspan >= 20 ? "more than twenty years" : yspan >= 10 ? "more than a decade" : yspan >= 2 ? `${yspan} years` : null;
    return { ...b, tier: "refusal", ladderStep: "varied", refusal: { kind: "varied", model: spec.subject, variants: variantTokens(rows).slice(0, 6), yearSpanPhrase }, cards: shapeCards(rows) };
  }
  const span = r4Span(solid);
  const cluster = solid.length >= 8 ? r4Cluster(solid) : null;
  const divergence = computeDivergence(base.exactSale, cluster, solid, winIso);
  const direction = (!refined && useRecent) ? r4Direction(recent, prior, keepAll) : null;
  const driver = r4Driver(solid);
  const platforms = foldPlatforms(solid).map(p => p[0]);          // NAMES only, no counts
  const named = platforms.filter(n => n !== "others");
  const poolYrs = solid.map(r => Number(r.year)).filter(Boolean);

  // The earned question (item 7): DATA-PICKED. On a tight band, mileage as before (transmission
  // outranks it only when its median-price gap is larger). On a WIDE band (> 40% of median), the
  // driver search picks the fact that tightens the band most among mileage / gearbox / dictionary
  // title-flags (5+ on each side); if nothing clears, no question renders and one honest sentence
  // is added. Never asks a field the input already gave, never forces a dictionary question that
  // does not split, and models with no dictionary entry simply fall through to mileage/gearbox.
  let earned = null, driverSentence = null;
  const txGiven = !!(base.vehicle && base.vehicle.transmission);
  const buckets = r4Buckets(solid);
  const txGate = r4Transmission(solid, spec.make);
  const mileageGap = r4MileageGap(solid);
  const mileageOK = !(refined && refine.miMin != null) && !(Number(base.subjectMileage) > 0) && buckets && buckets.length >= 2;
  const txOK = !txGiven && !(refined && refine.tx) && txGate;
  const pickMileageOrTx = () => {
    if (txOK && txGate.gap != null && (mileageGap == null || txGate.gap > mileageGap)) return { kind: "transmission", labels: txGate };
    if (mileageOK) return { kind: "mileage", buckets };
    if (txOK) return { kind: "transmission", labels: txGate };
    return null;
  };
  const ds = r4DriverSearch(solid, cluster, base.vehicle);
  // Selection (items 7+8 reconciled): on a WIDE band, a curated dictionary flag that genuinely
  // splits the pool 5+/5+ is PREFERRED as the second question - it is a model-specific price-mover,
  // more informative than generic mileage/gearbox (item 8: "only asks a dictionary question when the
  // pool splits on it 5+/5+"). Band-tightening orders MULTIPLE qualifying dictionary flags. When no
  // dictionary flag qualifies, fall to the most-tightening of mileage/gearbox (item 7). A tight band
  // asks mileage as before. Nothing at all clears -> the honest sentence.
  const bestDriver = (ds.candidates || []).filter(c => c.kind === "driver").sort((a, z) => z.tighten - a.tighten)[0];
  if (!ds.wideBand) {
    earned = pickMileageOrTx();                       // tight band: mileage as today
  } else if (bestDriver && !(refined && refine.driver)) {
    const drv = driverByKey(base.vehicle, bestDriver.driverKey);
    earned = drv ? { kind: "driver", driverKey: drv.key, q: drv.q, yes: drv.yes, no: drv.no, family: drv.family } : pickMileageOrTx();
  } else {
    earned = pickMileageOrTx();                       // wide band, no qualifying dictionary flag -> mileage/gearbox
    // Wide band and truly nothing splits 5+/5+ (no dictionary, no mileage, no gearbox): one honest sentence.
    if (!earned) driverSentence = "These vary for reasons the sales record can't fully see, provenance and originality mostly. The titles below say which is which.";
  }

  return {
    ...b, tier: "result", ladderStep: chosen.step, widening: chosen.widening || null,
    poolTrim: exactStep ? (spec.trim || null) : null,
    poolYears: poolYrs.length ? [Math.min(...poolYrs), Math.max(...poolYrs)] : null,
    span, cluster, direction, driver, divergence,
    // Freshness inputs (S2-2): the newest sale in the pool + whether this pool is house-led, so
    // runOneBox can stamp the pool-aware freshness line. House-led = houses are half or more.
    newestSale: obNewestDate(solid), houseLed: solid.filter(r => isHouseSource(r.source)).length >= solid.length / 2,
    // Span-without-cluster state (#4): a real result with too few sales (<8) to mark a
    // typical band. The render shows the full range + every sale, honestly caveated.
    spanOnly: !cluster, poolN: solid.length,
    setAsideTags: outlierTags(aside),
    platforms, topPlatform: named[0] || null, singlePlatform: named.length <= 1,
    earned, driverSentence,
    // Item 9: the observable-fact refinement OFFER - only the flags the pool actually contains
    // (>=3 cars, from title/mods/title-status/known-flaws). Suppressed once a refinement is active.
    observeOffer: refined ? [] : (function () { const pool = solid.concat(aside); return OBSERVE_ORDER.map(k => ({ key: k, label: OBSERVE_FLAGS[k].label, n: pool.filter(r => OBSERVE_FLAGS[k].re.test(obText(r))).length })).filter(o => o.n >= 3); })(),
    observeAside,
    // Telemetry only (never rendered): the driver-search candidates + dictionary split counts, so
    // the selection can be audited (why mileage/gearbox/dictionary won).
    driverDiag: { wideBand: ds.wideBand, band: ds.fullBand != null ? Math.round(ds.fullBand * 100) : null, candidates: (ds.candidates || []).map(c => ({ k: c.kind === "driver" ? c.driverKey : c.kind, t: Math.round((c.tighten || 0) * 100) })), dict: ds.dictDiag || [] },
    refined: refined ? { label: refine.label || null, mileage: refine.miMin != null, tx: refine.tx || null, driver: refine.driver || null } : null,
    // Render-port (round 7): three representative sales, subject-excluded, for the cards3 layout.
    representative: pickRepresentative(solid, base.exactSale, cluster || span, driver, divergence),
    cards: shapeCards(solid), asideCards: shapeCards(aside)
  };
}

export async function runOneBox(vehicle, generation, searchText, env, refine) {
  const spec = buildSpec(vehicle, generation, searchText);
  const now = Date.now();
  const iso = days => new Date(now - days * DAY).toISOString();
  const subject = { mileage: vehicle.mileage };   // seller-provided subject mileage (usually absent)
  const ingestDate = await oneBoxIngestDate(env);  // S2-2: freshest online sale, the "ingest current?" signal
  // Resolved-car confirmation line (STEP 3): plain restatement, first thing rendered on
  // EVERY path, so "did it understand my car" is answered before any price appears.
  const resolvedCar = {
    year: spec.year, make: spec.make, model: spec.model, trim: spec.trim,
    genCode: spec.genCode || null,   // so the cluster/since lead can name the generation ("E30 M3")
    badge: spec.badge || null,       // a performance badge (S65, M4) names the car itself; the body is redundant ("Most S65s", not "Most S65 sedans")
    // spec.bodyStyle drives pool SCOPING (the detectBodyStyle vocabulary). For DISPLAY (the resolved-car
    // line, the headline, the recent-search chip) fall back to the resolver's Sportbrake so the word a
    // buyer named is not silently dropped from the label ("XF Sportbrake", not "XF"). Scoped to
    // Sportbrake on purpose: it is a distinct model variant the model keyword already scopes the fetch
    // to, so the label and pool agree. A generic body word (hardtop) is NOT surfaced this way - it
    // would not scope the pool and the label would then over-claim.
    bodyStyle: spec.bodyStyle || (/sportbrake/i.test(vehicle.bodyStyle || "") ? "sportbrake" : null),
    transmission: vehicle.transmission || null
  };
  const diag = {};

  // GENERATION clarification FIRST (#4): a bare, year-less, trim-less multi-generation nameplate
  // ("911", "Corvette", "Mustang") is genuinely several markets - ASK which generation with
  // year-resolvable chips rather than pooling 1965-2024 into one refusal. Runs before the body
  // ask (generation is the bigger axis) and spares the whole-nameplate fetch. A chassis-code
  // model ("997"), or any year/trim query, skips this and scopes normally.
  if (!spec.trim && !spec.yearRange && !spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    // Ask when the model is multi-generation AND either no year was given (bare "911") OR the typed
    // year straddles >=2 generations (a split/handover year like a 1994 911 = 964 and 993). In both
    // cases buildSpec left genCode unset. Chips re-query with the generation's midpoint year, which
    // lands uniquely in that generation (breaks the loop; pool = the chosen generation).
    const matching = spec.year ? gens.filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd) : gens;
    if (matching.length >= 2) {
      const options = matching.map(g => ({ label: `${g.code} (${g.yearStart}-${g.yearEnd})`, query: `${Math.floor((g.yearStart + g.yearEnd) / 2)} ${spec.make} ${spec.model}` }));
      const prompt = spec.year
        ? `A ${spec.year} ${spec.model} lands right on a generation change - the ${matching.map(g => g.code).join(" and ")} both claim it, and they price very differently. Which is it?`
        : `The ${spec.model} spans generations that price very differently. Which is it?`;
      return { tier: "generation_choice", resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
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
  // Halo matcher. For a performance-BADGE car (M-car / AMG / RS) the pool is ALREADY the
  // performance car, so the aside must NOT strip the badge's OWN mainstream: an "amg" token
  // matches 100% of a C63 pool (audit) and would empty it. Only variants genuinely ABOVE the
  // badge are set aside - Black Series for AMG; the BMW list (now competition-free) already only
  // holds genuine M-specials. A BASE (non-badge) query keeps the full marque list, so a base
  // Mercedes still sets aside its AMGs and a base Mustang its Shelbys.
  // Intrinsic-AMG (Sep 2026): a model whose NAME already carries the AMG token ("SLS AMG",
  // "AMG GT") IS the AMG, exactly like a resolved badge - the broad /amg/ matcher would shove
  // its ENTIRE pool into the aside and empty exHalo, which surfaced as a false coupe refusal
  // (an SLS AMG with enough online sales to skip thin mode fell through to this base-arm split).
  // Treat it like the badge case: only the genuinely-higher Black Series is the halo.
  const intrinsicAmg = /mercedes|benz/i.test(spec.make) && /\bamg\b/i.test(spec.model || "");
  const haloRe = ((spec.badge || intrinsicAmg) && /mercedes|benz/i.test(spec.make))
    ? /\bblack\s?series\b/i
    : haloMatcherFor(spec.make);
  const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
  const trimRe = trimName ? trimTitleRe(trimName) : null;
  const trimIsHalo = !!(trimName && haloRe && haloRe.test(trimName));
  const base = { resolvedCar, resolvedSpec: spec.resolvedSpec, dedup: diag, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year }, exactSale: (env && env.exactSale) || null,
    // Subject mileage the input already gave (e.g. "964 cabriolet 45k miles"): never re-ask it as
    // the earned question - the "don't ask a field the input already provided" rule (verify case c).
    subjectMileage: Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Number(subject.mileage) : null };

  // Direction rule: never widen a base pool up into the halo; a named halo trim widens
  // halo-DOWN-to-family with the halo set aside + labelled. Fetches are DB-scoped: the exact
  // trim filters the TITLE at the database (a common nameplate pulls the dozens of trim rows,
  // not the whole family); the family fetch (only on widening / base) is bounded by year/gen.
  const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
  const online = rows => { const o = rows.filter(r => !isHouseSource(r.source)); return o.length >= 3 ? o : rows; };
  const priceUp = rows => rows.filter(r => { r._usd = outcomeUsd(r); return Number.isFinite(r._usd) && r._usd > 0; });
  const fetchPool = async (extra, days) => priceUp(online(await fetchQualifying({ ...famSpec, ...extra }, iso(days), env, diag)));

  // ---- THIN MODE branch: too few online sales for a volume cluster. Fires on data (online <
  // 15 / 36mo), house presence NOT required. A HOUSE STEER layers on when house share >= 2/3.
  // Uses the exact resolved trim scope; houses admitted as evidence. See assessThin.
  const thin = await assessThin(famSpec, trimName, trimRe, iso, env, diag);
  base.htMeta = thin; // diagnostics: carried on the non-firing result/refusal too
  if (thin && thin.isThin) {
    return { tier: "thin", ...base, thin, refine, freshness: obFreshness(!!thin.houseSteer, obNewestDate(thin.receipts), ingestDate, now) };
  }
  // CLASS-ERA rung: the exact-model pool is EMPTY over 36 months (a genuine one-off). Widen to the
  // same marque within the car's decade era band, clearly labelled as the wider market. Only when a
  // year is known (era band needs it); otherwise fall through to the normal ladder/refusal.
  if (thin && thin.totalN === 0 && spec.year) {
    const classEra = await assessClassEra(spec, env, diag);
    if (classEra && classEra.isClass && classEra.receipts.length) {
      return { tier: "class_era", ...base, classEra, refine, freshness: obFreshness(true, obNewestDate(classEra.receipts), ingestDate, now) };
    }
  }

  // Aside = the make halo (haloRe, badge-aware) OR a non-stock car (race/restomod/period tuner) via
  // the SHARED rule with wantHalo:true, so the tuner/race/restomod categories are added on BOTH
  // surfaces (change #4) WITHOUT re-applying the broad make-halo (which would re-break the
  // intrinsic-AMG/badge scoping). A named-halo query keeps its own halo (trimIsHalo) but still sets
  // aside race/restomod/tuner.
  const isAside = r => (haloRe && haloRe.test(titleOf(r))) || !!recordExcludeReason(r, spec.make, { wantHalo: true });
  const part = rows => ({
    halo: rows.filter(isAside),
    exHalo: rows.filter(r => !isAside(r))
  });
  const EXACT_MIN = 5;
  let chosen;
  if (trimName) {
    const trim24 = (await fetchPool({ titleContains: trimName }, 730)).filter(r => trimRe.test(titleOf(r)));
    if (presentable(trim24, EXACT_MIN)) chosen = { rows: trim24, step: "exact_trim", windowLabel: "past 2 years", widening: null };
    else {
      const trim5 = (await fetchPool({ titleContains: trimName }, 1825)).filter(r => trimRe.test(titleOf(r)));
      if (presentable(trim5, EXACT_MIN)) chosen = { rows: trim5, step: "exact_trim_wide", windowLabel: "past 5 years", widening: `Only a few ${trimName} sold in the last two years, so this reads the past five.` };
      else if (blendsAcrossModels(spec)) {
        // Fence (#2): dropping the trim here would blend distinct models sharing this nameplate.
        // Stay on the trim's own sales - buildResult renders span-without-cluster if 4+, else refuses.
        chosen = { rows: trim5.length ? trim5 : trim24, step: "exact_trim_wide", windowLabel: "past 5 years", widening: null };
      }
      else {
        const p24 = part(await fetchPool({}, 730));
        if (presentable(p24.exHalo, 4)) chosen = { rows: p24.exHalo, step: "family", windowLabel: "past 2 years", aside: trimIsHalo ? p24.halo : null, widening: familyWideningSentence(wideningTrimLabel(spec.model, trimName), spec.model, trimIsHalo) };
        else {
          const p5 = part(await fetchPool({}, 1825));
          if (presentable(p5.exHalo, 4)) chosen = { rows: p5.exHalo, step: "family_wide", windowLabel: "past 5 years", aside: trimIsHalo ? p5.halo : null, widening: familyWideningSentence(wideningTrimLabel(spec.model, trimName), spec.model, trimIsHalo) };
          else chosen = { rows: (trim5.length ? trim5 : (p5.exHalo.length ? p5.exHalo : [])), step: "thin", windowLabel: "past 5 years", widening: null };
        }
      }
    }
  } else {
    const p24 = part(await fetchPool({}, 730));
    // Base (no-trim) arm of the #2 fence: a bare blend-nameplate ("250 GT", "Viper") names
    // distinct models under one token, so it must never render a computed span/cluster - route
    // to the varied refusal even if a body-scoped subset reads low-ratio. Distinct from the
    // ratio-based varied guard, which only fires when the pool happens to be wide enough.
    chosen = { rows: p24.exHalo, step: "base", windowLabel: "past 2 years", aside: (p24.halo && p24.halo.length) ? p24.halo : null, widening: null, forceVaried: blendsAcrossModels(spec) };
  }
  base.platformsCount = new Set(chosen.rows.map(r => platformName(r.source)).filter(Boolean)).size;
  // A driver refine filters on a mined flag that lives in the description, so enrich BEFORE building
  // or the filter would match nothing on the short titles.
  if (refine && (refine.driver || refine.observe)) await obEnrichDescriptions(chosen, env, diag);
  let result = buildResult(chosen, base, iso, spec, refine);
  if (result.tier === "result") {
    result.freshness = obFreshness(result.houseLed, result.newestSale, ingestDate, now);
    // Item 7 BOUNDED SECOND FETCH: wide band + a dictionary family for this car, but the title-only
    // mining produced no dictionary candidate (the flag lives in the description). Fetch just this
    // pool's descriptions and re-run so the dictionary can mine title+description. Only descriptions
    // path, only on wide-band results, one bounded id-keyed query; on any failure keep the first result.
    const fam = driversForVehicle(base.vehicle);
    const dd = result.driverDiag;
    if (!(refine && refine.driver) && fam.length && dd && dd.wideBand && !(dd.candidates || []).some(c => fam.some(f => f.key === c.k))) {
      const ms = await obEnrichDescriptions(chosen, env, diag);
      const r2 = (ms != null) ? buildResult(chosen, base, iso, spec, refine) : null;
      // Always record the second-fetch telemetry on whichever result we keep, so the selection is auditable.
      const stamp = { descFetchMs: diag.descFetchMs != null ? diag.descFetchMs : (ms != null ? ms : "fetch_failed"), descEnriched: diag.descEnriched, descPoolSize: diag.descPoolSize, postDict: r2 && r2.driverDiag ? r2.driverDiag.dict : null };
      if (dd) Object.assign(dd, stamp);
      if (r2 && r2.tier === "result" && r2.earned && r2.earned.kind === "driver") {
        r2.freshness = result.freshness;
        if (r2.driverDiag) Object.assign(r2.driverDiag, stamp);
        result = r2;   // the dictionary question now fires from description mining
      }
    }
  }
  return result;
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
