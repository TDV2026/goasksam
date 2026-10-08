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
import { supabaseSelect, supabaseSelectAll } from "./_supabase.js";
import { driversForVehicle, driverByKey } from "./driverDict.js";
import { modelChipsForMakeYear } from "./vehicle.js";
import { familyFor } from "./modelFamilies.js";
import { generationsForModel, generationModelToken, bodyGenCode as mrBodyGenCode } from "./generations.js";
import { deskModelFamily as mrModelFamily } from "./desk/familyKey.js";
import { rulesFor as mrRulesFor, yearInRuleGenerations, denyFor as mrDenyFor, restomodReason, specialEditionRes as mrSpecialEditionRes, askableVariant as mrAskableVariant, generationsForRules as mrGensFor, bodiesForGeneration as mrBodiesForGen, bodiesForTrim as mrBodiesForTrim, bodyLabelFor as mrBodyLabel, canonicalName as mrCanonical, defaultBodyFor as mrDefaultBody, gearboxForGeneration as mrGearboxFor, generationForTrimYear as mrGenForTrimYear, bodyFamilyEq as mrBodyEq, _norm as mrNorm, trimFamilyFence, modelFamilyGroup, familyForText } from "./modelRules.js";

// Cobra replica / kit builders that carry a genuine displacement in the title (so the family include
// would otherwise keep them) but are NOT originals or official continuations - dropped from any Cobra
// family pool (item 2). The generic replica/kit/-style flag (isMemorabilia) catches the "...Replica"
// and "...kit" titles; this adds the builder NAMES that a title may carry without the word "replica".
const COBRA_REPLICA_RE = /\b(superformance|factory\s?five|\bffr\b|backdraft|kirkham|\bCAV\b|\bRCR\b|safir|shell\s?valley|everett[-\s]?morrison|unique\s?motorcars|classic\s?roadsters?|contemporary\s?classic|west\s?coast\s?cobra|midstates?)\b/i;

// Normalize a garbled auction title enough for trim-family matching (item 2 fix): strip the id clauses
// a house tacks on and DE-GLUE a doubled token ("...Turbo GT2 RGT2 R VIN..." -> "...Turbo GT2 R"),
// mirroring the display cleanup. Without this the fence runs on the raw title, where the glued "RGT2 R"
// defeats /\bgt2\s*r\b/ and a GT2 R leaks into a road GT2 pool. Server-side so the fence sees the same
// clean token the card shows.
function normalizeTitleForTrim(t) {
  let s = String(t == null ? "" : t);
  s = s.replace(/\s*\b(?:vin|chassis|engine|transmission|gearbox|body)\b\.?\s*(?:no\.?|number|#)?\s*:?\s*\*?[A-Za-z0-9][A-Za-z0-9*/\-]{4,}\*?/ig, "");
  s = s.replace(/\s*["'‘’“”]\s*type\s+[A-Za-z0-9.\/-]+\s*["'‘’“”]/ig, "");
  s = s.replace(/\b([A-Za-z])([A-Za-z]*\d[A-Za-z0-9]*)\s+\1\b/g, "$2 $1");                                   // de-glue "RGT2 R" -> "GT2 R"
  s = s.replace(/\b((?:[A-Za-z0-9][A-Za-z0-9/.\-]*\s+){0,2}[A-Za-z0-9][A-Za-z0-9/.\-]*)(?:\s+\1\b)+/ig, "$1"); // collapse doubled token
  return s.replace(/\s{2,}/g, " ").trim();
}
// Apply the race/road trim-family fence (item 2) to an already-trim-scoped list. A race trim pools
// ONLY its family (GT2 R + GT2 Evo); a road badge drops its race siblings. raw is the unscoped pool
// (used when a race family's onlyRe needs to pull siblings the trim-title scope excluded), scoped is
// the trim-title-scoped pool. Titles are normalized first so a glued/garbled raw title cannot defeat
// the fence. Returns the fenced list, or scoped unchanged when no fence applies.
function applyTrimFamilyFence(make, model, trimName, raw, scoped, titleOf) {
  const fence = trimName ? trimFamilyFence(make, model, trimName) : null;
  if (!fence) return scoped;
  const norm = r => normalizeTitleForTrim(titleOf(r));
  if (fence.onlyRe) return raw.filter(r => fence.onlyRe.test(norm(r)));
  if (fence.excludeRe) return scoped.filter(r => !fence.excludeRe.test(norm(r)));
  return scoped;
}

// Gearbox TYPE from the title + transmission field (Part 1 Rule 2): the manual-vs-paddle split that
// the gearbox question is built on. "F1"/SMG/PDK/DCT/E-gear/Sportshift/Tiptronic/paddle/automatic ->
// auto; manual/gated/stick (and a bare "6-speed" with no paddle marker, since the F1 cars are titled
// "F1") -> manual; nothing recognizable -> null (excluded from a gearbox-filtered pool, never guessed).
function gearboxType(row) {
  const t = (titleOf(row) + " " + String(row.transmission || "")).toLowerCase();
  if (/\bf1\b|\bsmg\b|\bpdk\b|\bdct\b|e-?gear|sportshift|paddle|automated|dual[-\s]?clutch|tiptronic|\bauto(matic)?\b|\bdsg\b|\btct\b|\bf1[-\s]?matic\b/.test(t)) return "auto";
  if (/\bmanual\b|\bgated\b|\bstick\b|\d-?speed\s?manual\b/.test(t)) return "manual";
  // A BARE "N-speed" is UNKNOWN for a MODERN car (a dual-clutch 458 lists "7-Speed" with no paddle
  // word and must never be read as a stick). But before the dual-clutch/automated-manual era a
  // traditional automatic was ALWAYS named ("automatic"/"Tiptronic"/"Steptronic", caught above), so a
  // bare "4/5/6-speed" on a PRE-2005 car is a manual. This recovers the pre-997 911 manuals (964/993/
  // 3.2 Carrera, etc.) whose structured transmission field is blank and whose titles read "5-Speed" -
  // without this they were dropped from a manual-filtered pool (a "1992 Carrera 2 manual" read 0).
  const yr = Number(row.year) || Number((String(titleOf(row)).match(/\b(19|20)\d{2}\b/) || [])[0]) || 0;
  if (yr && yr < 2005 && /\b[1-6][-\s]?speed\b/.test(t)) return "manual";
  return null;
}
// The maker's own name for the non-manual box, for the chip ("Manual or F1?").
function autoGearboxLabel(rule, genCode) {
  const mk = mrNorm(rule && rule.make);
  if (mk === "ferrari") return "F1";
  if (mk === "lamborghini") return "E-Gear";
  if (mk === "astonmartin") return "Sportshift";
  if (mk === "porsche") return "PDK";
  if (mk === "bmw") return mrNorm(genCode) === "e46" ? "SMG" : "DCT";
  return "Automatic";
}
import { dedupBySaleIdentity, hammerUsd, priceDisplay, nativePrices, mileageInfo, isHouseSource, toUsd, sourceSlugOf, ensureFxReady } from "./_houseComps.js";
import { isPartsListing, isMemorabilia, extractMarkers, markerLabel, projectFlagReason, titleKeywordPool } from "./_classify.js";

// ENGINE_VERSION (Step 0): bumped on any change to how the engine resolves, scopes, widens, excludes
// halos, picks tiers, or computes a read. It is mixed into every persistent cache key (market fetch
// cache + any decision cache) so an engine change can never serve a pre-change answer from cache.
// Bump this whenever Engine A behaviour changes. 2026-10-01: tier-gate + Fix-7 + Pierce consolidation.
export const ENGINE_VERSION = "e3-20261005-rangeladder";

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
// Separator-flexible, word-boundary badge matcher: "S65" also matches "S 65"/"S-65" (the houses
// title AMG cars with a space, online titles them closed-up), "M3" matches "M 3". A general fix
// (item 1, Sep 2026): insert an optional [\s-] at every letter<->digit boundary of the code. Still
// word-boundary anchored, so "S65" never matches "SL65"/"CLS65" and "M3" never matches "M340i".
function badgeFlexRe(code) {
  const esc = String(code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pat = esc.replace(/([A-Za-z])(\d)/g, "$1[\\s-]?$2").replace(/(\d)([A-Za-z])/g, "$1[\\s-]?$2");
  return new RegExp(`\\b${pat}\\b`, "i");
}
export function performanceBadge(make, model, trim, context) {
  const hay = ((model || "") + " " + (trim || "")).trim();
  // Fix (a) Sep 2026: the BADGE is detected from the resolved model/trim (never from stray title
  // text), but the VARIANT is captured from a WIDER string - the matched listing title / search
  // text - so a bare-decoded "M4" whose title says "Competition Package", or a "C63" whose title
  // says "Black Series", routes to the exact-trim rung instead of dropping to the family/base step.
  const vhay = (hay + " " + (context || "")).trim();
  if (/^bmw$/i.test(make)) {
    const m = hay.match(/\bM([2345678])\b/i);
    if (m) { const v = (vhay.match(/\b(Competition|CSL|CS|GTS|GT4)\b/i) || [])[1]; const b = "M" + m[1]; return { badge: b, re: badgeFlexRe(b), variant: v ? (v.toUpperCase() === "CS" || v.toUpperCase() === "CSL" || v.toUpperCase() === "GTS" || v.toUpperCase() === "GT4" ? v.toUpperCase() : "Competition") : null }; }
  }
  if (/mercedes|benz/i.test(make)) {
    // Detect the AMG badge from the FULL context (vhay = model + trim + raw search), not just the
    // resolved model/trim: a bare "S65" is forced to model "S-Class" by the seeded DB alias, so the
    // "65" only survives in the raw text. vhay recovers it -> badge S65 (Part 1 scenario 1).
    const m = vhay.match(/\b((?:AMG\s)?[A-Z]{1,3})[\s-]?(63|65|45|43|55)\b/i);
    if (m) {
      const b = (m[1].replace(/AMG\s*/i, "") + m[2]).toUpperCase();
      // The "S" variant (a C63 S) is detected from the TRIM only, badge + AMG stripped - NEVER from
      // the family in `hay`, or the "S" in "S-Class" false-matches and an S65 becomes trim "S".
      const trimClean = String(trim || "").replace(new RegExp(b, "ig"), "").replace(/\bAMG\b/ig, "").trim();
      const v = /black\s?series/i.test(vhay) ? "Black Series" : (/\bS\b/.test(trimClean) ? "S" : null);
      return { badge: b, re: badgeFlexRe(b), variant: v };
    }
    if (/\bAMG\s?GT\b/i.test(hay)) return { badge: "AMG GT", re: /\bAMG\s?GT\b/i, variant: (hay.match(/\b(63|43|53|R|Black Series)\b/i) || [])[1] || null };
  }
  if (/audi/i.test(make)) { const m = hay.match(/\bRS\s?(3|4|5|6|7|Q3|Q8|e-tron)\b/i); if (m) { const b = "RS" + m[1].replace(/\s/g, ""); return { badge: b, re: badgeFlexRe(b), variant: null }; } }
  return null;
}
export function archiveScope(spec) {
  if (spec.badge) return { byTitle: spec.badge };
  // Chevrolet Blazer family (K5 / S-10 / crossover): fetch ALL "Blazer" titles broadly, then let
  // qualifyReason keep only the matching kind (the 2nd-gen S-10 and some full-size are titled just
  // "Blazer", so a narrow per-kind fetch would run thin).
  if (spec.blazerKind) return { byModel: "Blazer" };
  // Variants OCD files under the PARENT nameplate's model column but names only in the TITLE: the
  // Ferrari 550/575 Barchetta sits under the "Maranello" model, so a model-column fetch for "550
  // Barchetta" finds nothing (51 real Barchetta sales exist, title-only). Scope by title instead.
  if (/^(550|575)\s*barchetta$/i.test(String(spec.model || "").trim())) return { byTitle: String(spec.model).trim() };
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
  const dateISO = row.date || row.sale_date || row.auction_end_date || null;   // item 1: dated FX
  return d.currency === "USD" ? Math.round(d.amount) : Math.round(toUsd(d.amount, d.currency, dateISO));
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
  // "Gullwing" is the 300SL COUPE by name (bug 6), so it scopes to the coupe and never asks body.
  if (/\bgullwing\b/.test(t)) return "coupe";
  for (const canonical of ["targa", "coupe", "cabriolet", "convertible", "roadster", "wagon", "sedan"]) {
    if (t.includes(canonical)) return canonical;
  }
  return null;
}

// The $2,500 collector-car floor (Part 3). A displayed price never falls below it; a
// sub-floor record is a part/memorabilia/data error, not a car, and is dropped from the pool.
const DISPLAY_FLOOR = 2500;
// VEHICLE-TYPE filter (Lane A classifier, Fix 5): sales_archive.vehicle_type is car|motorcycle|
// other|non_vehicle. The engine car pools read ONLY cars - so a part/memorabilia/automobilia row
// (non_vehicle), a motorcycle, or an off-highway "other" never counts, even when its hammer clears
// the $2,500 floor (a $40k engine would slip the price floor; vehicle_type catches it). STRICT now
// (vehicle_type=eq.car): Lane A has typed every make-known row (292,440 cars), so the NULL-as-car
// bridge is retired - a NULL row is genuinely unclassified and stays out of a car pool. Appended to
// every car-pool fetch. (Earlier interim form: or=(vehicle_type.is.null,vehicle_type.eq.car).)
const VT_CAR = "&vehicle_type=eq.car";

// SUB-TRIM FENCE (Part 3 bug 2): within one generation a NAMED base/sub trim pools ONLY itself - a
// "911 Carrera" never mixes in a Carrera S / T / GTS, and vice versa. Title-based (the archive carries
// the sub-trim only in the title). Extensible to any family whose trims are named in the title.
// `noManual` marks the base trims a generation offered PDK-only, so a manual request widens to the
// manual-capable trims (S/T) instead of an empty base pool, and trimsCovered names them.
const SUBTRIM_FENCES = [
  { make: /porsche/i, model: /^911$/i, noManual: /^carrera(\s*[24])?$/i, fences: [
    // Carrera (rear-drive, "Carrera 2" on the 964) EXCLUDES the all-wheel-drive Carrera 4 / 4S: they
    // are a different market. "Carrera 2" and bare "Carrera" both land here; "Carrera 4" has its own
    // fence below.
    { trim: /^carrera(\s*2)?$/i, name: "Carrera", include: /\bcarrera\b/i, exclude: /\bcarrera\s*4\b|\bcarrera\s*4?\s*s\b|\bcarrera\s*t\b|\bgts\b|\bturbo\b|\bgt\s?[0-9]|speedster|sport\s?classic|\bs\/t\b|dakar/i },
    { trim: /^carrera\s*4$/i, name: "Carrera 4", include: /\bcarrera\s*4\b/i, exclude: /\bcarrera\s*4\s*s\b|\bcarrera\s*t\b|\bgts\b|\bturbo\b|\bgt\s?[0-9]|speedster|sport\s?classic/i },
    // Carrera S (rear-drive) and Carrera 4S (AWD) are SEPARATE objects, split like Carrera 2/4.
    { trim: /^carrera\s*s$/i, name: "Carrera S", include: /\bcarrera\s*s\b/i, exclude: /\bcarrera\s*4\s*s\b|\bcarrera\s*4\b|\bgts\b|\bcarrera\s*t\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /^carrera\s*4\s*s$/i, name: "Carrera 4S", include: /\bcarrera\s*4\s*s\b/i, exclude: /\bgts\b|\bcarrera\s*t\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /^carrera\s*t$/i, name: "Carrera T", include: /\bcarrera\s*t\b/i, exclude: /\bgts\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /(carrera\s*4?\s*)?gts$/i, name: "GTS", include: /\bgts\b/i, exclude: /\bturbo\b|\bgt\s?[0-9]|gt3|gt2/i },
    // A TURBO is only the Turbo TRIM. Exclude turbo-LOOK / turbo-body / Turbo Twist wheels / WTL (a
    // Carrera dressed as a Turbo), the Carrera it rides on, the separate Turbo S, and the GT2.
    { trim: /^turbo$/i, name: "Turbo", include: /\bturbo\b/i, exclude: /turbo[\s-]?(look|style|body|twist|optik)|\bwtl\b|\bcarrera\b|\bgt2\b|\bturbo\s*s\b|speedster/i },
    { trim: /^turbo\s*s$/i, name: "Turbo S", include: /\bturbo\s*s\b/i, exclude: /turbo[\s-]?(look|style|body|twist|optik)|\bwtl\b|\bcarrera\b|\bgt2\b/i },
    // The 911 R (991, 2016, manual-only) is titled "911 R"; bare trim "R" had no fence and pooled the
    // whole Carrera manual set. Scope to the "911 R" title; exclude Carrera / GT / RS / Turbo.
    { trim: /^r$/i, name: "911 R", include: /\b911\s*r\b/i, exclude: /\bcarrera\b|\bgt\s?[0-9]|\brs\b|\brsr\b|\bturbo\b|\bgt3\s*r\b/i },
    // GT3 Touring (wingless) is its own object, split from the winged GT3 (like Carrera S / 4S). Plain
    // GT3 excludes Touring and RS; GT3 Touring requires the Touring word.
    { trim: /^gt3\s*touring$/i, name: "GT3 Touring", include: /\btouring\b/i, exclude: /gt3\s*rs|\brs\b|\bturbo\b|gt2/i },
    { trim: /^gt3$/i, name: "GT3", include: /\bgt3\b/i, exclude: /gt3\s*rs|\brs\b|\btouring\b|gt2|\bturbo\b/i }
  ] },
  // Dodge Charger R/T: a distinct, well-known Mopar performance trim, titled "Charger R/T" (slash) in
  // the archive. Without this fence, a trim of "R/T" carried no pool-scoping effect at all (label only)
  // and a bare "Charger" query's full model-wide pool answered the R/T ask. Daytona/Superbird/Super Bee/
  // SRT/Hellcat are excluded (separate halos, already set aside elsewhere by HALO_PATTERNS; redundant
  // here but harmless).
  { make: /dodge/i, model: /^charger$/i, fences: [
    { trim: /^r\s*\/?\s*t$/i, name: "R/T", include: /\br\s?\/?\s?t\b/i, exclude: /\bdaytona\b|\bsuperbird\b|\bsuper\s?bee\b|\bsrt\b|\bhellcat\b/i }
  ] }
];
function subTrimFenceFor(make, model, trim) {
  const t = String(trim || "").trim(); if (!t) return null;
  for (const g of SUBTRIM_FENCES) {
    if (!g.make.test(make || "") || !g.model.test(String(model || "").trim())) continue;
    const f = g.fences.find(x => x.trim.test(t));
    if (f) return { ...f, noManualBase: !!(g.noManual && g.noManual.test(t)) };
  }
  return null;
}
// Distinct sub-trims present in a 911 pool, for resolvedCar.trimsCovered (Lane C eyebrow). Ordered
// base -> S -> T -> GTS. Only computed for the 911 Carrera family today.
function detectSubTrims(rows, make, model) {
  if (!/porsche/i.test(make || "") || String(model || "").trim() !== "911") return [];
  const has = { "Carrera": false, "Carrera S": false, "Carrera T": false, "GTS": false };
  for (const r of rows || []) {
    const t = titleOf(r);
    if (/\bcarrera\s*4?\s*gts\b|\b911\s*gts\b|\bgts\b/i.test(t)) has["GTS"] = true;
    else if (/\bcarrera\s*t\b/i.test(t)) has["Carrera T"] = true;
    else if (/\bcarrera\s*4?\s*s\b/i.test(t)) has["Carrera S"] = true;
    else if (/\bcarrera\b/i.test(t)) has["Carrera"] = true;
  }
  return Object.keys(has).filter(k => has[k]);
}

// BADGE-TWIN SIBLINGS (thin-result helper): genuinely the SAME car sold under another marque (shared
// platform / badge engineering), so when a thin result has too few sales of the queried car, its twin
// may carry a deeper record worth pointing at. High-confidence, collector-relevant twins only; a twin
// is NOT a mere platform cousin. Bidirectional; each entry lists every co-twin. The suggestion is
// additive (thin.sibling) and never changes the queried car's own pool. relation names the tie.
// Each member is [make, modelToken, displayLabel].
const SIBLING_FAMILIES = [
  { members: [["eagle", "talon", "Eagle Talon"], ["mitsubishi", "eclipse", "Mitsubishi Eclipse"], ["plymouth", "laser", "Plymouth Laser"]], relation: "Diamond Star Motors twin" },
  { members: [["dodge", "stealth", "Dodge Stealth"], ["mitsubishi", "3000gt", "Mitsubishi 3000GT"]], relation: "badge-engineered twin" },
  { members: [["ford", "probe", "Ford Probe"], ["mazda", "mx-6", "Mazda MX-6"]], relation: "shared platform" },
  { members: [["toyota", "gr86", "Toyota GR86"], ["toyota", "86", "Toyota 86"], ["scion", "fr-s", "Scion FR-S"], ["subaru", "brz", "Subaru BRZ"]], relation: "co-developed twin" },
  { members: [["chevrolet", "camaro", "Chevrolet Camaro"], ["pontiac", "firebird", "Pontiac Firebird"]], relation: "F-body twin" },
  { members: [["pontiac", "gto", "Pontiac GTO"], ["holden", "monaro", "Holden Monaro"]], relation: "rebadged Holden Monaro" },
  { members: [["chevrolet", "ss", "Chevrolet SS"], ["holden", "commodore", "Holden Commodore"]], relation: "rebadged Holden Commodore" },
  { members: [["saab", "9-2x", "Saab 9-2X"], ["subaru", "impreza", "Subaru Impreza"]], relation: "shared Subaru platform" },
  { members: [["toyota", "supra", "Toyota Supra"], ["bmw", "z4", "BMW Z4"]], relation: "co-developed twin (A90/G29)" }
];
const sibNorm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// The single best sibling for a resolved spec: the first co-twin of a matched family. Twin-matching is
// token-based (sibNorm), so "3000GT"/"3000 gt" and "MX-6"/"mx6" both hit.
function siblingFor(spec) {
  if (!spec || !spec.make || !spec.model) return null;
  const mk = sibNorm(spec.make), md = sibNorm(spec.model);
  for (const fam of SIBLING_FAMILIES) {
    if (!fam.members.some(([a, b]) => sibNorm(a) === mk && sibNorm(b) === md)) continue;
    const other = fam.members.find(([a, b]) => !(sibNorm(a) === mk && sibNorm(b) === md));
    if (other) return { make: other[0], model: other[1], label: other[2], relation: fam.relation };
  }
  return null;
}
// Bounded, archive-only count of a sibling's recent sales (zero OldCarsData). Cars only, above the
// $2,500 floor, last 36 months, scoped to the subject's year window when present. Returns the count
// (capped at the fetch limit) or 0. Best-effort: a failed/empty read yields 0 (the sibling is simply
// not surfaced), never throws into the thin result.
async function siblingSaleCount(sib, spec, env) {
  try {
    if (!sib || !env) return 0;
    const since = new Date(Date.now() - 1096 * 864e5).toISOString().slice(0, 10);
    const yq = (spec.yearMin ? `&year=gte.${spec.yearMin}` : (spec.year ? `&year=gte.${spec.year - 2}` : "")) +
               (spec.yearMax ? `&year=lte.${spec.yearMax}` : (spec.year ? `&year=lte.${spec.year + 2}` : ""));
    const q = `sales_archive?select=id&make=ilike.${encodeURIComponent("*" + sib.make + "*")}` +
      `&model=ilike.${encodeURIComponent("*" + sib.model + "*")}&sale_price=not.is.null${VT_CAR}` +
      `&sale_date=gte.${since}${yq}&limit=500`;
    const rows = (await supabaseSelect(env, q)) || [];
    return rows.length;
  } catch (e) { return 0; }
}
// Attach a sibling suggestion to a thin object when a real twin exists and carries enough of its own
// record (>=3 recent sales) to be worth pointing at. Mutates and returns the thin object; a no-op when
// there is no twin or the twin is itself thin. The queried car's own pool is never touched.
async function attachSibling(thin, spec, env) {
  if (!thin) return thin;
  const sib = siblingFor(spec);
  if (!sib) return thin;
  const count = await siblingSaleCount(sib, spec, env);
  if (count >= 3) {
    const yr = spec.year ? spec.year + " " : "";
    thin.sibling = { label: sib.label, count, query: `${yr}${sib.make} ${sib.model}`, relation: sib.relation };
  }
  return thin;
}
// Chevrolet Blazer kind signals (shared by buildSpec routing and qualifyReason filtering). Full-size
// = K5 and its truck-code/engine/trim tells; compact = S-10 and its tells. TrailBlazer is excluded
// separately (a different model). LS/LT are deliberately NOT a compact signal here (both lines used
// them), so they never force a cross-kind call.
const BLAZER_FULL_RE = /k-?5\b|\bk10\b|\bk20\b|\bk1500\b|\bk2500\b|\bc10\b|\bd10\b|full[-\s]?size|\b5\.7\b|\b350\b|\b6\.[25]\b|diesel|silverado|cucv|m1009/i;
const BLAZER_COMPACT_RE = /s-?10\b|\b4\.3\b|\b2\.8\b|4[-\s]?door|\bzr2\b|xtreme/i;
// A candidate row (flattened select) qualifies when it is a real sold price, has a
// usable photo, is stock (empty modifications + no modified-title marker), and,
// when the seller named a body style, matches it and is not a different variant.
// Reason a row is NOT a qualifying comp for the spec, or null when it qualifies. isQualifying
// is the boolean wrapper (unchanged behavior); Sam Desk uses the reason so an excluded row can
// be SHOWN with why (no silent drops), matching how One Box drops it.
export function qualifyReason(row, spec) {
  if (!(Number(row.price) > 0)) return "no sale price";
  // $2,500 CAR FLOOR (Part 3): no real collector car sells for under $2,500. A sub-floor USD
  // figure is a part, a memorabilia lot, or a data error (a $600 belly pan, a $1,000 workshop
  // manual, a $265 oddment) leaking into the nameplate pool and surfacing as the displayed low.
  // Drop it from the pool entirely - counts, medians, span and cards all read above the floor.
  // Scoped to the USD compute value so a mixed-currency price never falsely trips it.
  if (hammerUsd(row) < DISPLAY_FLOOR) return "below the $2,500 car floor (part, memorabilia or data error, not a car)";
  // House-tier receipts are named sales, not photo cards (product RULE 1): a $48M 250 GTO house
  // sale is evidence even when OCD carries no featured image. Volume mode still requires a photo.
  if (!row.image && !spec.houseTier) return "no photo";
  // Parts / automobilia guard. See lib/_classify.js.
  if (isPartsListing(row.raw_title || row.rtitle, row.mileage)) return "part or automobilia";
  // Memorabilia / replica / tribute / scale-model guard.
  if (isMemorabilia(row.raw_title || row.rtitle)) return "memorabilia or replica";
  // RACE CAR guard: a Cup/RSR/GT3 R/GT3 Cup/Supercup/race-car/track-car title is never a road-car comp
  // (same principle as the 911 R fence) - UNLESS the query itself names that race trim (so a "GT3 Cup"
  // or "RSR" query still pools its own car; rule 16's self-guard).
  { const t2 = stripRaceNoise(row.raw_title || row.rtitle || ""); if (RACE_TITLE_RE.test(t2) && !RACE_TITLE_RE.test(String(spec.trim || "") + " " + String(spec.model || ""))) return "race car"; }
  // Project / incomplete / shell / non-original car (item 1): a shell, roller, parts car, no-engine
  // project, salvage car or replica is never a comp for a complete running car. Title-level here is
  // cheap and applies on EVERY pool; the house/thin pool also reads the description (where the "shell"
  // detail usually lives) via a bounded enrich + filterProjectRows pass.
  { const pf = row.project_flag || projectFlagReason(row.raw_title || row.rtitle, row._descText || null); if (pf) return "project or incomplete car (" + pf + ")"; }
  // MODEL FAMILY scope (item 2): a Shelby Cobra family query pools ONLY its family. A 289 can never
  // sit in a 427 pool, the Daytona (halo) sits in neither original pool, and a replica/kit builder car
  // is out of every family (the official continuation is CSX4000+, not a Superformance/Factory Five).
  if (spec.familyInclude) {
    const rawTtl = row.raw_title || row.rtitle || "";
    if (!spec.familyInclude.test(rawTtl)) return "different Cobra family";
    if (spec.familyExclude && spec.familyExclude.test(rawTtl)) return "other Cobra family";
    if (COBRA_REPLICA_RE.test(rawTtl) || /\bERA\b/.test(rawTtl)) return "replica or kit car";
  }
  // SUB-TRIM FENCE (bug 2): a named base/sub trim pools only itself ("911 Carrera" excludes S/T/GTS).
  if (spec.subTrimInclude) {
    const stt = row.raw_title || row.rtitle || "";
    if (!spec.subTrimInclude.test(stt)) return "different sub-trim of the model";
    if (spec.subTrimExclude && spec.subTrimExclude.test(stt)) return "higher sub-trim set aside";
  }
  const title = String(row.rtitle || row.raw_title || "").toLowerCase();
  // Truck series-code match must be EXACT on the series letter (item 1): a "D350" query is a one-ton
  // D-series pickup - it matches D350 (and its 4x4 twin W350), NEVER a B350 van or any other letter's
  // 350. The loose comp fetch (D->"D*350"->%D%350%) pulls "Dodge ... 350" strings, so gate it here.
  // Only for truck makes + a single-letter+3-digit model, so a Mercedes "E350" etc. is untouched.
  if (spec.make && /^(dodge|ram|ford|chevrolet|chevy|gmc)$/i.test(String(spec.make).trim())) {
    const sc = /^([a-z])(\d{2,3})$/i.exec(String(spec.model || "").trim());
    if (sc) {
      // A rebadged family sibling (change 4a: Ram 50, Plymouth Arrow Truck, Mitsubishi Mighty Max for
      // a D50 query) is pooled by poolTerms and bypasses the truck-series number check.
      const familySibling = spec._poolTerms && spec._poolTerms.some(t => title.includes(String(t).toLowerCase()));
      if (!familySibling) {
        const letter = sc[1].toUpperCase(), num = sc[2];
        const fam = /^[DW]$/.test(letter) ? "[DW]" : letter;   // Dodge pickups: D and its 4x4 twin W
        // Separator-flexible (item 1): the loose "D*50" fetch pulls "D 50"/"D-50" AND "D350"; accept
        // the series with an optional separator, reject the wrong-number series (D350 for a D50 query).
        if (!new RegExp(`\\b${fam}[\\s-]?${num}\\b`, "i").test(title)) return "different truck series";
      }
    }
  }
  // Ford GT standalone supercar (item 3, Sep 2026): the model "GT" is a generic token that the loose
  // comp fetch pulls GT40 / GT350 / GT500 / Mustang GT into. Scope to the standalone car - reject any
  // title carrying another model name or a different GT badge. The year window (year +/-2) splits the
  // two Ford GT generations (2005-06 vs 2017+) on its own, so no extra generation handling is needed.
  if (spec.make && /^ford$/i.test(String(spec.make).trim()) && /^gt$/i.test(String(spec.model || "").trim())) {
    if (/mustang|shelby|gt\s?-?\s?40|gt\s?-?\s?350|gt\s?-?\s?500|\bgt3\b|\bgt4\b/i.test(title)) return "different Ford GT variant";
    if (!/\bgt\b/i.test(title)) return "not a Ford GT";
  }
  // Land Rover Range Rover sub-model identity: the full-size "Range Rover" is a different car and
  // market from the Range Rover Sport / Evoque / Velar, each its own model. The base model's loose
  // title match ("range rover") pulls the sub-models in, so gate on the sub-model token. A base
  // full-size query rejects any Sport / Evoque / Velar title; a sub-model query requires its own token.
  if (spec.make && /^land[\s-]?rover$/i.test(String(spec.make).trim()) && /^range\s*rover/i.test(String(spec.model || "").trim())) {
    const m = String(spec.model).toLowerCase();
    const sub = /\bsport\b/.test(m) ? "sport" : /\bevoque\b/.test(m) ? "evoque" : /\bvelar\b/.test(m) ? "velar" : null;
    if (!sub) { if (/\b(sport|evoque|velar)\b/i.test(title)) return "Range Rover sub-model, not the full-size"; }
    else if (!new RegExp("\\b" + sub + "\\b", "i").test(title)) return "different Range Rover model";
  }
  // SIBLING-MODEL guard: a DIFFERENT, separately-named vehicle that merely borrows or contains the
  // queried model's own name must never pool as that model. Two distinct failure shapes, same fix:
  // (a) a SUBSTRING with no word boundary - the archive model-column ILIKE "*charger*" also matches
  // "Ramcharger" (a different truck; a regex \bcharger\b correctly fails to match inside "Ramcharger"
  // since there is no boundary there, but the raw SQL ILIKE has no such concept, so the guard must
  // reject explicitly); (b) a SEPARATE model that borrows the nameplate as its own sub-brand with a
  // real word boundary ("Mustang Mach-E" is an unrelated EV crossover, not a Mustang trim - unlike
  // "Mustang Mach 1", a genuine trim of the base Mustang, which must stay IN the pool). Curated per
  // make|model; checked unconditionally (these are different cars under every scoping mode).
  const SIBLING_MODEL_EXCLUDE = {
    "dodge|charger": /\bramcharger\b/i,
    "ford|mustang": /\bmach-?e\b/i,
    "ford|bronco": /\bbronco\s*sport\b/i
  };
  { const sibEx = SIBLING_MODEL_EXCLUDE[`${String(spec.make || "").toLowerCase().trim()}|${String(spec.model || "").toLowerCase().trim()}`]; if (sibEx && sibEx.test(title)) return "different model (sibling nameplate)"; }
  // Chevrolet Blazer family kind-filter: the broad "Blazer" fetch pulls K5 (full-size), S-10 (compact)
  // and the 2019+ crossover; keep only the kind the query resolved to. TrailBlazer is a DIFFERENT
  // model and is always excluded. A no-clue bare "Blazer" title stays out of both the K5 and S-10 pool
  // (it is unidentifiable), so the pools never cross-contaminate.
  if (spec.blazerKind) {
    if (/trail\s?blazer/i.test(title)) return "TrailBlazer, a different model";
    const full = BLAZER_FULL_RE.test(title), compact = BLAZER_COMPACT_RE.test(title);
    const y = Number(row.year) || Number((String(row.rtitle || row.raw_title || "").match(/\b(19|20)\d{2}\b/) || [])[0]) || 0;
    if (spec.blazerKind === "k5") {
      if (compact && !full) return "S-10 (compact), not the full-size K5";
      if (!(full || (y && y <= 1982))) return "not identifiably a full-size K5 Blazer";
    } else if (spec.blazerKind === "s10") {
      if (full && !compact) return "full-size, not the S-10 Blazer";
      if (!(compact || (y >= 1995 && y <= 2005))) return "not identifiably an S-10 Blazer";
    } else if (spec.blazerKind === "crossover") {
      if (!(y >= 2019)) return "not the 2019-on crossover Blazer";
    }
  }
  // Fix 4: a named TRIM must be the trim itself, not a PARTS or STYLE mention ("CSL wheels", "CSL
  // airbox", "CSL-style", "CSL replica"). A match where the trim token is immediately followed by a
  // part/style word (or tagged a replica/clone of it) is not that car.
  // The wider DB title pattern (trimIlike) is re-checked here: a row the old literal ILIKE matched
  // still passes; any other must match the code with real boundaries (no "XJ6 ... Sedan" for "XJ*S").
  if (spec.titleContains) {
    const tc = String(spec.titleContains).toLowerCase();
    const both = `${row.raw_title || ""} ${row.rtitle || ""}`;
    if (!both.toLowerCase().includes(tc)) { const tre = trimTitleRe(spec.titleContains); if (tre && !tre.test(both)) return "different variant (trim scope)"; }
  }
  const trimTok = spec.trim && String(spec.trim).trim().length >= 2 ? String(spec.trim).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  if (trimTok && new RegExp(`\\b${trimTok}[\\s-]*(wheels?|airbox|air\\s?box|trunk|boot|lip|spoiler|seats?|\\bkit\\b|bumper|badge|emblem|intake|exhaust|grille|style|look|replica|tribute|clone|wrap|decal|steering\\s?wheel|shift\\s?knob)\\b`, "i").test(title)) return "trim named as a part or style, not the car";
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
  // Body discipline. A sale that names no body counts as the car's DEFAULT body for a COVERED model
  // (fix 3): a plain "S550" is a sedan, so it must not pass a Coupe filter - without this the S-Class
  // Coupe pool was 54/55 sedans. Covered models also read the maker's own body name (Ferrari GTS ->
  // targa) so a GTS can't sit in a Berlinetta(coupe) query.
  // When a TITLE-split family governs membership (familyInclude set: 812 Superfast/GTS/Competizione/
  // Competizione A, Cobra 289/427, ...), the variant already decides the pool and the stored body_style
  // (unreliable on BaT) is IGNORED for filtering - the family's body only sets the display label. The
  // body filter still applies to non-family cars where the variant does not determine the body
  // (911 coupe vs cabriolet, S-Class sedan vs coupe, Ferrari Berlinetta vs GTS/Spider).
  if (spec.bodyStyle && !spec.familyInclude) {
    let rowBody = classifyBody(row);
    if (!rowBody) {
      const rule = mrRulesFor(spec.make, spec.model);
      if (rule) {
        if (rule.bodyNames) { for (const [fam, label] of Object.entries(rule.bodyNames)) { if (new RegExp("\\b" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(title)) { rowBody = fam; break; } } }
        if (!rowBody) rowBody = mrDefaultBody(rule, spec.genCode);
      }
    }
    if (rowBody && bodyFamily(rowBody) !== bodyFamily(spec.bodyStyle)) return "different body style";
  }
  return null;
}
export function isQualifying(row, spec) { return qualifyReason(row, spec) === null; }

// Drop PROJECT / incomplete / shell / non-original cars (item 1) from a bounded pool, reading the
// listing DESCRIPTION where the shell detail usually lives (an RM lot "unfinished ... engine of
// uncertain provenance") - the lean pool read does not carry it. Title-level is checked for free; only
// the survivors need a description, fetched in ONE id-keyed query (the house/thin pool is small). A
// flagged sale then never enters the pool, the range, the house ranking or the ask comparison.
async function filterProjectRows(rows, env) {
  if (!rows || !rows.length) return rows || [];
  const ttl = r => String(r.raw_title || r.rtitle || "");
  // Prefer the stored project_flag column: a row the column already flags is dropped without a
  // description fetch, and only rows with no column flag and no title flag need the live description.
  const flagged = r => r.project_flag || projectFlagReason(ttl(r), r._descText || null);
  const needDesc = rows.filter(r => r.project_flag == null && !projectFlagReason(ttl(r), null) && r.id != null && r._descText == null);
  const ids = [...new Set(needDesc.map(r => r.id))];
  if (ids.length) {
    try {
      const drows = (await supabaseSelect(env, `sales_archive?id=in.(${ids.join(",")})&select=id,d:raw_record->>description`)) || [];
      const byId = {}; for (const dr of drows) byId[dr.id] = String(dr.d || "");
      for (const r of needDesc) if (byId[r.id] != null) r._descText = byId[r.id];
    } catch (e) { /* keep the title-only result on a desc-fetch failure */ }
  }
  return rows.filter(r => !flagged(r));
}

// ---- FIX 7: ARCHIVE TITLE-TOKEN RESOLUTION (Oct 2026) -----------------------------------------
// Resolve a typed nameplate that the resolver could not, by what the SALE TITLES say - but ONLY when
// the engine is about to show a clarification (never on a search that already resolves). Tries the
// full phrase first, then individual tokens; resolves ONLY when one make dominates the whole-word
// title matches (>=70% and >=5 sales) - otherwise returns null and the ask stands (condition 5: never
// guess). Cached per phrase (module map) so it never re-queries. Returns {make, model, ms, cached}.
const _tokCache = new Map();
const _reEsc = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function archiveResolveToken(phrases, env, queryTokens) {
  const qmakes = (queryTokens || []).map(mrNorm).filter(Boolean);
  for (const ph of (phrases || [])) {
    const key = mrNorm(ph);
    if (!key || key.length < 3) continue;
    if (_tokCache.has(key)) { const c = _tokCache.get(key); if (c) return { ...c, cached: true }; else continue; }
    const t0 = Date.now();
    let rows = null;
    try { rows = await supabaseSelect(env, `sales_archive?listing_title=ilike.${encodeURIComponent("*" + ph + "*")}&make=not.is.null&select=make,model,listing_title&limit=120`); } catch (e) { rows = null; }
    const ms = Date.now() - t0;
    if (rows === null) continue;   // query error: do not cache, do not resolve (keep the ask)
    const ww = new RegExp("\\b" + _reEsc(ph).replace(/\\?\s+/g, "\\s+") + "\\b", "i");
    // Exclude restomod/replica titles: "Singer" in a Porsche title is a restomod BUILDER, not the
    // car's identity, so a bare "Singer" must not resolve to Porsche-by-Singer cars (issue 2 guard).
    const hits = rows.filter(r => ww.test(String(r.listing_title || "")) && !/^unknown$/i.test(String(r.make || "")) && !/^reserve$/i.test(String(r.make || "")) && !restomodReason(String(r.listing_title || ""), r.make, r.model));
    const total = hits.length;
    if (total < 5) { _tokCache.set(key, null); continue; }
    const byMake = {}; for (const r of hits) { const mk = String(r.make).trim(); byMake[mk] = (byMake[mk] || 0) + 1; }
    const makeEntries = Object.entries(byMake).sort((a, b) => b[1] - a[1]);
    // Issue 1: when the user TYPED a make, scope to it FIRST and judge agreement within that make
    // ("Eagle Talon" -> make Eagle's titles agree on Talon, even though "Talon" is globally shared
    // with the Mitsubishi Galant). Otherwise require one make to dominate the whole set (>=70%).
    const typedMake = makeEntries.find(([mk]) => qmakes.includes(mrNorm(mk)));
    const chosen = typedMake || (makeEntries[0] && makeEntries[0][1] / total >= 0.7 ? makeEntries[0] : null);
    if (!chosen) { _tokCache.set(key, null); continue; }   // no clear agreement -> keep the ask
    const make = chosen[0];
    const makeHits = hits.filter(r => String(r.make).trim() === make);
    if (makeHits.length < 3) { _tokCache.set(key, null); continue; }
    // Within the chosen make, one model must clearly agree (>=60% of that make's hits), else keep ask.
    // Model: prefer the typed phrase if it is itself a model value among the hits, else the dominant
    // model-family for that make (never "Unknown").
    const models = {}; for (const r of hits) if (String(r.make).trim() === make) { const mo = String(r.model || "").trim(); if (mo && !/^unknown$/i.test(mo)) models[mo] = (models[mo] || 0) + 1; }
    // Prefer a model value that matches a distinctive TOKEN of the query ("240Z" over the dominant
    // "Z"), so the specific nameplate the seller typed wins over the broad family.
    const phToks = String(ph).split(/\s+/).filter(Boolean);
    const typed = Object.keys(models).find(m => phToks.some(t => mrNorm(t) === mrNorm(m))) || Object.keys(models).find(m => mrNorm(m) === mrNorm(ph));
    const topMo = Object.entries(models).sort((a, b) => b[1] - a[1])[0];
    // Condition 5 within the chosen make: resolve only when the seller's own token is a model value,
    // or one model clearly dominates that make's titles (>=60%). Else keep the ask (never guess).
    if (!typed && !(topMo && topMo[1] / makeHits.length >= 0.6)) { _tokCache.set(key, null); continue; }
    const model = typed || (topMo ? topMo[0] : null);
    if (!model) { _tokCache.set(key, null); continue; }
    const res = { make, model, ms };
    _tokCache.set(key, res);
    return { ...res, cached: false };
  }
  return null;
}

// ---- RULE 5 POOL GUARD (Part 1, Oct 2026) -----------------------------------------------------
// Model-boundary + year-gate + deny + restomod/replica guard, driven by lib/modelRules.js. A no-op
// for any model NOT in the rules table (fallback = today's behaviour, never a block). Returns the
// kept rows plus a classified removal/replica/no-year breakdown so the pool can be diffed and audited.
// This is the single highest-impact fix (Torino GT out of Ford GT, CL/CLS/SL out of S-Class, out-of-
// generation years out of every covered model) and runs BEFORE the pool is counted or ranged.
const _rowTitle = r => String((r && (r.raw_title || r.rtitle || r.title)) || "");
// TWO kinds of exclusion (Part 1 review, condition 1):
//  - REMOVED: a different car entirely (deny list = wrong model, year-gate = wrong era, no-year +
//    title mismatch). Gone from the page.
//  - TAGGED: the RIGHT model but a distorting variant (restomod/replica/tribute/continuation, and
//    the model's special editions: Heritage, Competition, CSL, track/race cars). KEPT on the page
//    and flagged (row._tag), shown under a "Shown separately" group, excluded from the headline
//    range. Never deleted. (GT40-style replicaSeparate routes replicas to their own `replica` pool,
//    which is the same "kept, shown separately, out of the range" treatment for a replica-heavy
//    nameplate.) The headline-range exclusion is applied downstream from the row._tag flag.
export function rule5PoolGuard(rows, spec) {
  const rule = mrRulesFor(spec && spec.make, spec && spec.model);
  if (!rule) return { kept: rows || [], removed: [], tagged: [], replica: [], noYearKept: 0, applied: false };
  const deny = mrDenyFor(spec.make, spec.model, { generationNamed: !!spec.genCode });
  const special = mrSpecialEditionRes(rule);   // the model's own special-edition regexes
  // When the QUERY asks for a special-edition trim (Turbo S, GT3 RS), THAT special is the pool - never
  // set it aside (bug 2: a "2005 911 Turbo S" emptied because "turbo s" is in specialEditions). Keep the
  // specials the resolved trim itself matches; OTHER specials (a GT3 in a Turbo S pool) still set aside.
  const asideSpecials = (spec && spec.trim) ? special.filter(re => !re.test(String(spec.trim))) : special;
  const modelTok = mrNorm(spec.model), famTok = mrNorm(rule.family);
  const poolTerms = (rule.poolTerms || []).map(mrNorm);
  const titleMatchesModel = nt => nt.includes(modelTok) || (famTok && nt.includes(famTok)) || poolTerms.some(t => t && nt.includes(t));
  // make-model adjacency ("Ford GT", not "Ford Ranchero GT"): used to tell a wrong-YEAR example of
  // THIS model (shown separately, year-mismatch note) from a different model that merely contains the
  // token (removed). Change 3.
  const esc = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const makeModelAdj = (spec.make && spec.model) ? new RegExp("\\b" + esc(spec.make).replace(/\\?-/g, "[\\s-]?") + "\\s+" + esc(spec.model) + "\\b", "i") : null;
  const kept = [], removed = [], tagged = [], replica = [], askable = [], yearMismatch = [];
  let noYearKept = 0;
  const tagRow = (r, reason, token) => { r._tag = token || reason; kept.push(r); tagged.push({ row: r, reason, token: token || reason }); };
  for (const r of (rows || [])) {
    const title = _rowTitle(r), nt = mrNorm(title);
    const yr = Number(r.year);
    // GT40-style: originals vs continuations/replicas are SEPARATE pools (kept, shown separately).
    if (rule.replicaSeparate) {
      const isRep = !!restomodReason(title, spec.make, spec.model)
        || (rule.replicaExtra || []).some(re => re.test(title))
        || (Number.isFinite(yr) && yr > 1969);
      if (isRep) { replica.push(r); continue; }
      if (Number.isFinite(yr) && !yearInRuleGenerations(rule, yr)) { removed.push({ row: r, reason: "year-gate" }); continue; }
      if (!Number.isFinite(yr) && !titleMatchesModel(nt)) { removed.push({ row: r, reason: "no-year" }); continue; }
      kept.push(r); if (!Number.isFinite(yr)) noYearKept++;
      continue;
    }
    // (1) DENY = a different model. Runs first so a cross-model edition collision ("GT40 Mk IV" in a
    //     Ford GT pool) is removed, not tagged as the Ford GT's own Mk IV.
    if (deny.some(re => re.test(title))) { removed.push({ row: r, reason: "deny" }); continue; }
    // (2) TAGGED = right model, distorting variant -> kept + flagged (restomod/replica/special edn).
    //     Checked BEFORE the year-gate so a track variant built outside the standard generations
    //     (Ford GT Mk II/Mk IV, 2023-24) is kept-and-tagged, never year-gated away.
    const rm = restomodReason(title, spec.make, spec.model);
    if (rm) { tagRow(r, "restomod", rm); continue; }
    // ASKABLE variant (Competition / ZCP, change 1): do NOT hard-tag. Keep it, flag r._askable, and
    // let the question gate decide - ask it when it is >25% of the pool and both sides have >=3,
    // else tag it out there. Marked here; the share test + ask/tag decision lives in the gate.
    const av = mrAskableVariant(title);
    if (av) { r._askable = av.label; kept.push(r); askable.push({ row: r, label: av.label }); continue; }
    if (asideSpecials.some(re => re.test(title))) { tagRow(r, "special-edition"); continue; }
    // (3) YEAR-GATE. A year outside the generations is either a wrong-YEAR example of THIS model
    //     (title names make+model adjacently -> shown SEPARATELY with a year-mismatch note, change 3)
    //     or a different model entirely (removed).
    if (Number.isFinite(yr)) {
      if (!yearInRuleGenerations(rule, yr)) {
        if (makeModelAdj && makeModelAdj.test(title)) { r._yearMismatch = yr; yearMismatch.push({ row: r, year: yr }); }
        else removed.push({ row: r, reason: "year-gate" });
        continue;
      }
    } else {
      // (4) no year: never a silent drop - keep only if the title clearly matches the model, count it.
      if (!titleMatchesModel(nt)) { removed.push({ row: r, reason: "no-year" }); continue; }
      noYearKept++;
    }
    kept.push(r);
  }
  return { kept, removed, tagged, replica, askable, yearMismatch, noYearKept, applied: true };
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
  const usdApprox = disp.currency !== "USD" && disp.amount != null ? Math.round(toUsd(disp.amount, disp.currency, row.date || row.sale_date || row.auction_end_date || null)) : null;
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
  { style: "coupe", label: "Coupe", words: ["coupe", "coupé", "berlinetta", "fastback", "hardtop", "notchback"] },
  { style: "sedan", label: "Sedan", words: ["sedan", "saloon", "berlina"] }
];
function classifyBody(row) {
  const t = (String(row.body || "") + " " + String(row.rtitle || row.raw_title || "")).toLowerCase();
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  return null;
}
// cabriolet / convertible / roadster are one open-top family; coupe and targa stand alone.
function bodyFamily(style) { return style === "targa" ? "targa" : style === "coupe" ? "coupe" : style === "sedan" ? "sedan" : "open"; }
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
  // Dedupe the generation token when the subject ALREADY carries it: a chassis-code model ("997",
  // "991", "964") IS its own generation code, so "997 997 Carrera S Coupes" / "997 Carrera S, 997"
  // read the code twice. Only prepend/append genCode when the subject does not already start with it
  // (a nameplate query like "911" with genCode "997" still reads "997 911 Carrera S", informative).
  const genTok = spec.genCode ? String(spec.genCode) : "";
  const subjHasGen = !!genTok && new RegExp("^" + genTok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(subject);
  const genPfx = genTok && !subjHasGen ? genTok + " " : "";
  spec.cardSpec = [subject, subjHasGen ? "" : spec.genCode].filter(Boolean).join(", ");
  const youText = [spec.year, name].filter(Boolean).join(" ");
  if (spec.yearMin && spec.yearMax && spec.genCode) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${genPfx}${subject}s.`;
  else if (spec.yearMin && spec.yearMax) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${subject} sales.`;
  else spec.resolvedSpec = `Comparing the ${youText} with equivalent ${subject} sales.`;
  return spec;
}

// Resolve the comparison scope from the resolved vehicle and generation.
// Buyer-spoken generation nicknames that are not the archive's own chassis-code text (unlike NA/NB/NC/
// ND, C1-C8, FD, S13/S14/S15, R32/R33/R34, which already bind because the nickname IS the curated code).
// Mapped to the real code here, early, so the SAME code-equals-trim mechanism (below) picks them up.
const GEN_NICKNAME_TO_CODE = {
  "toyota|supra": { mk1: "A40", mk2: "A60", mk3: "A70", mk4: "A80", mk5: "A90" }
};
export function buildSpec(vehicle, generation, searchText) {
  const spec = {
    make: vehicle.make || "", model: vehicle.model || "", trim: vehicle.trim || "", year: Number(vehicle.year) || null,
    bodyStyle: detectBodyStyle(searchText) || detectBodyStyle(vehicle.bodyStyle) || detectBodyStyle(vehicle.raw) || detectBodyStyle(vehicle.canonicalLabel) || null
  };
  { const nm = GEN_NICKNAME_TO_CODE[`${spec.make.toLowerCase().trim()}|${spec.model.toLowerCase().trim()}`]; const code = nm && nm[spec.trim.toLowerCase().trim()]; if (code) spec.trim = code; }
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
  // CHEVROLET BLAZER family routing: three different vehicles under one nameplate - full-size K5
  // (1969-1994), compact S-10 (1983-2005), 2019+ crossover. Route by typed model, then year, then
  // title clues; set spec.blazerKind so archiveScope fetches all "Blazer" titles broadly and
  // qualifyReason keeps only this kind. A trim-less bare "Blazer" in the 1983-1994 overlap with no
  // clue is genuinely ambiguous -> spec.blazerAsk (runOneBox asks K5 vs S-10, never guesses).
  if (/^chevrolet$/i.test(String(spec.make || "").trim()) && /^(k5\s+blazer|s-?10\s+blazer|blazer)$/i.test(String(spec.model || "").trim())) {
    const mdl = String(spec.model).toLowerCase();
    const txt = [searchText, vehicle.raw, vehicle.canonicalLabel].filter(Boolean).join(" ");
    const y = spec.year;
    let kind = /k5/.test(mdl) ? "k5" : /s-?10/.test(mdl) ? "s10" : null;
    if (!kind) {
      if (y && y >= 2019) kind = "crossover";
      else if (y && y < 1983) kind = "k5";
      else if (y && y >= 1995 && y <= 2005) kind = "s10";
      else if (BLAZER_FULL_RE.test(txt) && !BLAZER_COMPACT_RE.test(txt)) kind = "k5";
      else if (BLAZER_COMPACT_RE.test(txt) && !BLAZER_FULL_RE.test(txt)) kind = "s10";
      else kind = "ask";
    }
    if (kind === "ask") { spec.blazerAsk = true; }
    else {
      spec.blazerKind = kind;
      spec.model = kind === "k5" ? "K5 Blazer" : kind === "s10" ? "S-10 Blazer" : "Blazer";
      spec.excludeVariants = [];   // kind-filter governs membership, not the generic halo list
      // A truck code the resolver parsed as a trim (D10/K10/K1500/C20) is a KIND signal, not a trim;
      // leaving it on would over-scope the pool to that one code (a "Blazer D10" query -> 0 cards).
      if (/^[cdk]-?\d{2,4}$/i.test(String(spec.trim || "").trim())) spec.trim = "";
      if (kind === "k5") {
        const kg = generationsForModel("Chevrolet", "K5 Blazer");
        const g = spec.year ? kg.find(x => spec.year >= x.yearStart && spec.year <= x.yearEnd) : null;
        if (g) { spec.yearMin = g.yearStart; spec.yearMax = g.yearEnd; spec.genCode = g.code; spec.genBound = true; spec.genPinnedByYear = !!spec.year; }
        else if (!spec.year) { spec.yearMin = 1969; spec.yearMax = 1991; }
      } else if (kind === "crossover") { spec.yearMin = Math.max(2019, spec.yearMin || 0) || 2019; spec.yearMax = spec.yearMax && spec.yearMax >= 2019 ? spec.yearMax : null; }
    }
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
  // BARE GENERATION/CHASSIS CODE in the query (item 4, Sep 2026): "E46 M3", "964 Carrera", "W220 S65"
  // name the generation directly, so bind that generation's production window + genCode even with no
  // typed year - and, because genCode is now set, the generation clarify is skipped and the pool
  // scopes to the code's years. Only when EXACTLY ONE curated generation code for this model appears
  // in the query text (an ambiguous or absent code leaves the earlier window untouched).
  if (!spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    if (gens.length) {
      const hay = [searchText, vehicle.raw, vehicle.canonicalLabel, spec.trim].filter(Boolean).join(" ");
      const hit = gens.filter(g => new RegExp(`\\b${String(g.code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay));
      if (hit.length === 1) { spec.yearMin = hit[0].yearStart; spec.yearMax = hit[0].yearEnd; spec.genCode = hit[0].code; }
    }
  }
  // Race/road trim-family fence (item 2) on the general result path: a named race trim (GT2 R) scopes
  // the perf-include to its family (GT2 R + GT2 Evo); a road badge (GT2) drops its race siblings. The
  // fence AUGMENTS perfInclude (it never relaxes it): a road GT2's perfInclude still requires "GT2".
  spec.trimFence = trimFamilyFence(spec.make, spec.model, spec.trim) || null;
  if (spec.trimFence) {
    const base = spec.perfInclude;
    if (spec.trimFence.onlyRe) spec.perfInclude = t => (base ? base(t) : true) && spec.trimFence.onlyRe.test(normalizeTitleForTrim(t));
    else if (spec.trimFence.excludeRe) spec.perfInclude = t => (base ? base(t) : true) && !spec.trimFence.excludeRe.test(normalizeTitleForTrim(t));
  }
  // MODEL FAMILIES (item 2/3): a nameplate split by displacement/series (Shelby Cobra 289 / 427 /
  // Daytona / continuation) that are never one market. Scope the pool to the family the query names;
  // when none is named the query is AMBIGUOUS and runOneBox asks (never pools every family).
  const famGroup = modelFamilyGroup(spec.make, spec.model);
  if (famGroup) {
    // Scope byModel to the family BASE ("812") so every variant pools the whole family (BaT files
    // all 812s as model "812"); the family title filter then isolates the variant. Without this a
    // variant whose resolver produced a variant-specific model ("812 Superfast") under-fetched.
    if (famGroup.base) spec.model = famGroup.base;
    const fr = familyForText(spec.make, spec.model, [searchText, vehicle.raw, vehicle.canonicalLabel, vehicle.displayName, vehicle.matchTitle, spec.trim].filter(Boolean).join(" "));
    if (fr && fr.family) {
      spec.familyInclude = fr.family.include;
      spec.familyExclude = fr.family.exclude || null;
      spec.familyName = fr.family.name;
      spec.familyLabel = fr.family.label;
      if (!spec.trim || !fr.family.include.test(spec.trim)) spec.trim = fr.family.chip;   // label reads "Shelby Cobra 427"
      // Body from the variant (Fix 3): a family may carry its body (812 GTS/Competizione A are
      // convertibles, Superfast/Competizione coupes). Apply only when the query did not state a body
      // itself, so the pool scopes to the variant's real body instead of the model's default coupe.
      if (fr.family.body && !spec.bodyStyle) spec.bodyStyle = fr.family.body;
    } else if (fr && fr.ambiguous) {
      spec.familyAmbiguous = true;
    }
  }
  // SUB-TRIM FENCE (bug 2): a named base/sub trim scopes the pool to itself (title-based), so a base
  // "911 Carrera" never pools a Carrera S/T/GTS. Applied as a title include/exclude in qualifyReason.
  const stf = subTrimFenceFor(spec.make, spec.model, spec.trim);
  if (stf) { spec.subTrimInclude = stf.include; spec.subTrimExclude = stf.exclude || null; spec.subTrimName = stf.name; spec.subTrimNoManualBase = stf.noManualBase; }
  // GENERATION NICKNAME, not a literal trim word (MK4, NA/NB/NC/ND, C1-C8, FD, S13/S14/S15, R32/R33/
  // R34): once it has done its job binding spec.genCode (and the year window with it), the nickname
  // text itself is never printed in a listing title ("1958 Chevrolet Corvette" never says "C1"). Left
  // in spec.trim, it becomes a literal title-match requirement downstream (assessThin's trimRe) that
  // zeroes the pool even though the year window alone already scopes it correctly. Clear it whenever
  // the final genCode equals the trim text (case-insensitive) - the signal that the trim slot is
  // carrying the generation code, not a real trim.
  if (spec.genCode && spec.trim && String(spec.genCode).toLowerCase().trim() === String(spec.trim).toLowerCase().trim()) spec.trim = "";
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
  // LEAN cols for the RECORD path: each raw_record->> JSONB extraction costs ~40ms/row, so the full
  // 13-extract select over 120 rows was ~5.8s (over the <3s bar). The record only needs price/date/
  // venue/title/year/vin + the fields its receipt + hammer back-out + set-aside read (image, currency,
  // url, mileage). ~4 extracts -> ~1.5s. Non-record keeps the full select (it renders rich receipts).
  // stated_mileage / project_flag / desc_facts are the description-derived columns (descriptions
  // resilience). They are cheap top-level columns (no raw_record JSONB extract); the readers prefer
  // them and fall back to a live description parse only when they are null.
  const cols = spec.recordSort
    ? "id,price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,vin_norm," +
      "image:raw_record->>featured_image_url,currency:raw_record->>currency,srcurl:raw_record->>url,mileage:raw_record->>mileage," +
      "stated_mileage,project_flag,desc_facts"
    : "id,price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,vin_norm," +
      "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style," +
      "mods:raw_record->>modifications,rtitle:raw_record->>title,currency:raw_record->>currency," +
      "transmission:raw_record->>transmission,color:raw_record->>exterior_color,ts:raw_record->>title_status,flaws:raw_record->>known_flaws,srcurl:raw_record->>url,srcurl2:raw_record->>source_url," +
      "svc:raw_record->>recent_service_history," +
      "city:raw_record->>city,precision:raw_record->>auction_end_precision," +
      "stated_mileage,project_flag,desc_facts";
  const scope = archiveScope(spec);
  const base = `sales_archive?select=${cols}` +
    // RECORD path: make=eq AND no sale_date filter, so the (make, sale_price DESC) composite index
    // serves the query index-ORDERED (no sort) with early termination at the limit. make ILIKE or a
    // sale_date filter both prevent that index from ordering the scan, forcing a slow sort that hits
    // the statement timeout. Non-record keeps ILIKE + the (selective, index-backed) date filter.
    (spec.recordSort ? `&make=eq.${encodeURIComponent(spec.make)}` : `&make=ilike.${encodeURIComponent(spec.make)}`) +
    `&sale_price=not.is.null` + VT_CAR +
    // Omit the date filter ONLY on the primary all-time record scan (so the (make,sale_price) index
    // orders it). The BOUNDED fallback (recordFallback) re-adds the date filter to genuinely shrink
    // the set when the all-time scan timed out. Non-record always keeps it.
    ((spec.recordSort && !spec.recordFallback) ? "" : `&sale_date=gte.${sinceIso.slice(0, 10)}`) +
    (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") +
    (spec.yearMax ? `&year=lte.${spec.yearMax}` : "") +
    // Exact-trim DB scope: when the ladder wants only a named trim, filter the TITLE at the
    // database so a common nameplate pulls the ~dozens of trim rows, not the whole family.
    (spec.titleContains ? `&listing_title=ilike.${encodeURIComponent("*" + trimIlike(spec.titleContains) + "*")}` : "") +
    // RECORD path (Desk): order by PRICE desc with a tight limit, so an all-time "highest sale"
    // finds the real top even for a high-volume model whose record is older than the recent 1000.
    // The DB sorts the model-scoped subset and returns the top rows fast (no wide date scan).
    // Record: 300 top-by-price rows of the MARQUE (make=eq, NO per-row filter during the walk, so the
    // (make, sale_price DESC) composite index range-scans index-ordered and terminates early ~1s). The
    // badge is filtered IN CODE afterwards; 300 is deep enough that a high-volume badge's top-5 standard
    // sales are always present even after the marque's other high-priced cars (507, M1, Z8) take slots.
    // NON-RECORD: NO limit here - the non-record reads page the FULL window via supabaseSelectAll
    // (Supabase caps a bare limit= at db-max-rows=1000, so a popular car's 36-month pool silently
    // topped out near 1000 and the range/count were computed on a partial, recency-biased sample).
    (spec.recordSort ? `&order=sale_price.desc&limit=300` : `&order=sale_date.desc`);
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
    // A DISTINCTIVE alnum code (a 2+ digit run touching letters) is stored BOTH ways across
    // platforms ("300SL"/"300 SL", "S65"/"S 65", "D50"/"D-50"): insert a `*` wildcard at the
    // digit<->letter boundary so one ILIKE matches the union. Broadened from 3+ to 2+ digits
    // (item 1, Sep 2026) so a 2-digit badge/series (S65, C63, D50) matches its spaced twin too;
    // the in-code badge word-boundary + truck-series guards re-filter the wider DB match, and a
    // 1-digit code (M3, A6, GT3) or a pure-digit model (911, 997) is left EXACT (no over-match).
    if (/\d{2,}[\s-]?[A-Za-z]/.test(s) || /[A-Za-z][\s-]?\d{2,}/.test(s)) {
      return s.replace(/[\s-]+/g, "").replace(/(\d{2,})([A-Za-z])/g, "$1*$2").replace(/([A-Za-z])(\d{2,})/g, "$1*$2");
    }
    return s;
  };
  const modelQ = t => `${base}&model=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  const titleQ = t => `${base}&listing_title=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  // RECORD scope (Desk, Sep 2026 fix): scope the record on the MODEL column, not the title, so the
  // price-sorted scan does not walk past non-badge high-price cars (507, M1, Z8) the way the title
  // ILIKE did (that timed out ~9s). Fetch with a plain trigram ILIKE (reliably index-served, ~0.3s;
  // the \y word-boundary regex was only INTERMITTENTLY index-served -> occasional 8s seq-scan +
  // retry), then apply the WHOLE-WORD filter IN CODE so "M3" catches "(E46) M3"/"M3 CSL" but never
  // "M340i". The shared set-aside then drops the DTM race car / CSL halo so the record is the top
  // STANDARD sale.
  // The record uses `base` AS-IS (make=eq + order price + limit 300, NO model/title filter) so the
  // (make, sale_price DESC) composite index range-scans index-ordered and terminates at 300 (~1s,
  // stable). Applying ANY leading-wildcard filter DURING that walk (title or model ILIKE) forced a
  // per-row recheck / weak-trigram sort that intermittently hit the 8s timeout. The badge is filtered
  // IN CODE (whole word, so "M3" never matches "M340i"). Title fallback only if the marque top-300 is
  // thin for this badge (low-volume badge on a high-volume marque).
  const recordWholeWord = t => { const esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i"); };
  const t0 = Date.now();
  let rawRows;
  // supabaseSelect returns null on a FAILED query (non-ok/timeout) and [] on a genuine empty
  // result. Surface the failure via diag.queryError so a caller (the Desk executor) can retry and
  // fail loudly instead of rendering a swallowed [] as an honest "thin"/empty pool. One Box ignores
  // the flag (its thin/refusal path is unchanged); only the Desk consumes it.
  // RECORD scope decision: a generic performance TRIM mis-set as a badge ("944 Turbo" -> badge "Turbo",
  // "911 Carrera" -> "Carrera") must scope by the MODEL (944) with the trim in the title, NOT the whole
  // marque's "Turbo" cars (which returned a 911 TAG Turbo for a 944 Turbo record). A true model-badge
  // (M3, where model === badge) keeps the fast top-of-marque badge scope.
  let recVia = null, recModelToken = null, recTitleTrim = null;
  if (spec.recordSort) {
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (scope.byTitle && spec.model && norm(spec.model) !== norm(scope.byTitle)) { recVia = "model"; recModelToken = String(spec.model).replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || spec.model; recTitleTrim = scope.byTitle; }
    else if (scope.byTitle) recVia = "title";
    else if (scope.byModel) { recVia = "model"; recModelToken = scope.byModel; recTitleTrim = spec.titleContains || null; }
  }
  if (recVia === "title") {
    // True model-badge (M3): pull the marque's top-300 by price (base, index-ordered, ~1s), filter the
    // badge whole-word IN CODE. Title fallback only if the marque top-300 is thin for this badge.
    const got = await supabaseSelect(env, base); if (got === null && diag) diag.queryError = true;
    const ww = recordWholeWord(scope.byTitle);
    rawRows = (got || []).filter(r => ww.test(String(r.model || "")) || ww.test(String(r.raw_title || "")));
    if (rawRows.length < 5) { const more = (await supabaseSelect(env, titleQ(scope.byTitle))) || []; const seen = new Set(rawRows.map(r => r.id)); for (const r of more) if (!seen.has(r.id)) rawRows.push(r); }
  }
  else if (recVia === "model") {
    // Model record (944 Turbo, 2002tii, 190E 2.3-16, 240Z): scope by the MODEL trigram + the named trim
    // in the title, and do NOT ask the DB to sort by price (a leading-wildcard ILIKE + ORDER BY sale_price
    // is planner-unstable and timed out for a higher-volume model like 944). PAGE the model's rows
    // unordered (trigram filter, index-served, cheap per page) to completion; the record output sorts by
    // price + applies the set-aside in code. make ILIKE (not the marque price-walk that never reaches a
    // cheaper model on a marque full of pricier cars).
    const trimQ = recTitleTrim ? `&listing_title=ilike.${encodeURIComponent("*" + recTitleTrim + "*")}` : "";
    const rqBase = `sales_archive?select=${cols}&make=ilike.${encodeURIComponent("*" + spec.make + "*")}&model=ilike.${encodeURIComponent("*" + flexPattern(recModelToken) + "*")}&sale_price=not.is.null${VT_CAR}${trimQ}`;
    const all = [];
    for (let off = 0; off < 4000; off += 1000) {
      const pageRows = await supabaseSelect(env, `${rqBase}&order=id.asc&limit=1000&offset=${off}`);
      if (pageRows === null) { if (diag) diag.queryError = true; break; }
      for (const r of pageRows) all.push(r);
      if (pageRows.length < 1000) break;
    }
    const ww = recordWholeWord(recModelToken);
    rawRows = all.filter(r => ww.test(String(r.model || "")) || ww.test(String(r.raw_title || "")));
    // Title fallback if the model column is thin for this nameplate (mislabels): match the title, paged.
    if (rawRows.length < 5) {
      for (let off = 0; off < 2000; off += 1000) {
        const pr = await supabaseSelect(env, `sales_archive?select=${cols}&make=ilike.${encodeURIComponent("*" + spec.make + "*")}&listing_title=ilike.${encodeURIComponent("*" + flexPattern(recModelToken) + "*")}&sale_price=not.is.null${VT_CAR}${trimQ}&order=id.asc&limit=1000&offset=${off}`) || [];
        const seen = new Set(rawRows.map(r => r.id)); for (const r of pr) if (!seen.has(r.id)) rawRows.push(r);
        if (pr.length < 1000) break;
      }
    }
  }
  else if (scope.byTitle) { const got = await supabaseSelectAll(env, titleQ(scope.byTitle)); if (got === null && diag) diag.queryError = true; rawRows = got || []; }
  else {
    const got = await supabaseSelectAll(env, modelQ(scope.byModel)); if (got === null && diag) diag.queryError = true;
    rawRows = got || [];
    // ACCENT UNION (Sep 2026, was a fallback): the archive INCONSISTENTLY accents the MODEL column
    // ("Murciélago" on the BaT rows, "Murcielago" on a Barrett-Jackson row) while the listing TITLE
    // reliably carries the deaccented name. Matching only the model column drops the accented rows,
    // and an empty-only retry never fired when a single deaccented row existed (typed "Murcielago
    // LP640" saw 1 sale while the VIN class-era pool saw 9). ALWAYS union the title match so both
    // spellings come in and typed + VIN read the SAME pool. base is make/date-scoped, so bounded.
    if (scope.byModel) {
      const byTitle = (await supabaseSelectAll(env, titleQ(scope.byModel))) || [];
      if (byTitle.length) { const seen = new Set(rawRows.map(r => r.id)); for (const r of byTitle) if (!seen.has(r.id)) rawRows.push(r); if (diag) diag.accentUnion = true; }
    }
  }
  // POOL-TERM UNION (change 4a): a model whose family spans rebadged siblings under DIFFERENT makes
  // (Dodge D50 = Ram 50 = Plymouth Arrow Truck = Mitsubishi Mighty Max) pools them together, each
  // card labelled by its own title (Rule 25). Make-AGNOSTIC title search, year/date-scoped. The
  // qualifyReason truck-series guard is told to accept these siblings via spec._poolTerms (below).
  const _mrRule = mrRulesFor(spec.make, spec.model);
  if (_mrRule && _mrRule.poolTerms && _mrRule.poolTerms.length) {
    spec._poolTerms = _mrRule.poolTerms;
    const dateClause = (spec.recordSort && !spec.recordFallback) ? "" : `&sale_date=gte.${sinceIso.slice(0, 10)}`;
    const yClause = (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") + (spec.yearMax ? `&year=lte.${spec.yearMax}` : "");
    const seen = new Set((rawRows || []).map(r => r.id));
    rawRows = rawRows || [];
    for (const term of _mrRule.poolTerms) {
      const q = `sales_archive?select=${cols}&sale_price=not.is.null${VT_CAR}${dateClause}${yClause}&listing_title=ilike.${encodeURIComponent("*" + term + "*")}&order=sale_date.desc`;
      const got = (await supabaseSelectAll(env, q)) || [];
      for (const r of got) if (!seen.has(r.id)) { seen.add(r.id); rawRows.push(r); }
    }
    if (diag) diag.poolTermsUnion = true;
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
  const priced = qualified.filter(r => Number.isFinite(r.value));
  // RULE 5 POOL GUARD (Part 1, Oct 2026): model-boundary + worldwide year-gate + deny, plus the
  // tag-don't-delete split for same-model distorting variants. DROPS a different car (deny / wrong
  // era / no-year title-mismatch) and a replicaSeparate replica from this pool; KEEPS a same-model
  // special edition / restomod, marked r._tag, so a downstream step can show it "separately" and
  // exclude it from the headline range. A no-op for any model not in modelRules (fallback = today).
  // spec.suppressGuard opts a caller out (e.g. a diagnostic that wants the raw pool).
  if (spec && spec.suppressGuard) return priced;
  const guard = rule5PoolGuard(priced, spec);
  if (!guard.applied) return priced;
  if (diag) { diag.rule5 = { removed: guard.removed.length, tagged: guard.tagged.length, replica: guard.replica.length, noYearKept: guard.noYearKept }; }
  return guard.kept;
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
// ROUNDING LADDER (Part 3): a RANGE END rounds to a step that scales with magnitude - nearest
// $500 under $100,000, nearest $1,000 from $100,000 through $1,000,000, nearest $5,000 above.
// Individual sale prices are NEVER rounded (cards read raw _usd; prose reads usd() of the real
// hammer). `roundNearest` is for a typical-band edge; `roundFloor`/`roundCeil` keep a containment
// span ("everything from X to Y has sold") bracketing every real sale - low floors, high ceils.
const roundStep = n => { const a = Math.abs(Number(n) || 0); return a < 100000 ? 500 : a <= 1000000 ? 1000 : 5000; };
const roundNearest = n => { const s = roundStep(n); return Math.round(n / s) * s; };
const roundFloor = n => { const s = roundStep(n); return Math.floor(n / s) * s; };
const roundCeil = n => { const s = roundStep(n); return Math.ceil(n / s) * s; };
// RANGE LADDER by qualified pool size (Part 3): 16+ cluster band + Sam's Take; 8-15 the middle-half
// (p25-p75) band with a count-forward headline; 3-7 the sales themselves, NO range; 1-2 a single
// sale; 0 not tracked. One name for the bucket so every surface reads it the same way.
function rangeTierForCount(n) {
  if (n >= 16) return "cluster";
  if (n >= 8) return "band";
  if (n >= 3) return "thin";
  if (n >= 1) return "single";
  return "none";
}
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
  // archiveThrough = the archive's freshest online sale (the ingest currency). Carried on every
  // freshness object (item 7c) so the frontend can state two facts when the in-scope newest sale is
  // older than the archive's newest ("Sales through last night." + "Latest {model} sale: {month year}").
  const fresh = String(ingestDate || "").slice(0, 10) || null;
  if (houseLed) return { mode: "house", through: newest, archiveThrough: fresh };
  // Item 6: the freshness line describes THIS answer, so `through` reads the newest sale IN SCOPE,
  // never the global BaT/C&B ingest date (which can be fresher than anything in this pool and would
  // over-claim the scope's recency). The "last night" phrasing fires only when the newest in-scope
  // sale IS from the last two days AND ingest is current, so it never claims a freshness the scope
  // does not actually have. ingestDate is now only a currency corroborator, never the stated date.
  const twoAgo = new Date(now - 2 * DAY).toISOString().slice(0, 10);
  if (newest && newest >= twoAgo && fresh && fresh >= twoAgo) return { mode: "online", lastNight: true, through: newest, archiveThrough: fresh };
  return { mode: "online", lastNight: false, through: newest, archiveThrough: fresh };
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
  // Ferrari: the track/limited specials above a base model, PLUS the flagship hypercars and
  // limited specials that must never read as a comp for a regular model (the 550 house-flow leak
  // surfaced an Enzo at $8.5m and a Superamerica in a "wider Ferrari market" band). Bare "gto"
  // is NOT matched (it would catch the 250 GTO handling elsewhere); the specific 288/599 GTO are.
  { make: /ferrari/i, re: /\b(speciale|scuderia|pista|competizione|\btdf\b|stradale|\bsv\b|\bcs\b|xx|\bm\b\s|challenge|enzo|la\s?ferrari|f40|f50|superamerica|barchetta|aperta|\b16m\b|monza\s?sp\d?|daytona\s?sp\d?|sesto\s?elemento|288\s?gto|599\s?gto|250\s?gto)\b/i },
  { make: /lamborghini/i, re: /\b(sv|superveloce|svj|svr|performante|\bsto\b|tecnica|jota|versace|revent[oó]n|anniversario|40th\s+anniversary|centenario|veneno|sesto\s+elemento|diablo\s+gtr?)\b/i },
  { make: /chevrolet/i, re: /\b(z06|zr1|zl1|z[-\/]?28|grand\s?sport|\biroc\b|callaway|\bcopo\b|\bl88\b|yenko)\b/i },
  { make: /ford/i, re: /\b(shelby|gt500|gt350|\bboss\b|svt|mach\s?1|cobra\s?jet|\bkr\b)\b/i },
  { make: /mercedes|benz/i, re: /\b(amg|\b63\b|\b65\b|\b55\b|black\s?series|\bdtm\b)\b/i },
  { make: /dodge/i, re: /\b(hellcat|demon|redeye|\bacr\b|scat\s?pack|\bsrt\b|daytona|superbird|super\s?bee|\bt\/a\b)\b/i },
  // Aston Martin + Jaguar (batch 1): named limited / race / homologation specials that sit above the
  // base model - Zagato, GT8/GT12, DB4 GT, One-77, Vulcan, Valkyrie, Vantage GT3; Jaguar Lightweight
  // E-Type, Low Drag, Project 7, XKR-S, F-Type SVR. Auto-approved halos (named limited/race cars).
  { make: /aston/i, re: /\b(zagato|\bgt8\b|\bgt12\b|\bgt3\b|db4\s?gt|one-?77|vulcan|valkyrie|valour|\bv600\b|vantage\s?gt)\b/i },
  { make: /jaguar/i, re: /\b(lightweight|low\s?drag|project\s?7|project\s?8|xkr-?s|\bsvr\b|\bsvo\b)\b/i },
  { make: /nissan/i, re: /\b(nismo|\br32\b|\br33\b|\br34\b|\bz\s?tune\b)\b/i },
  { make: /toyota/i, re: /\b(trd\s?pro)\b/i },
  { make: /honda|acura/i, re: /\b(type\s?r|type\s?s)\b/i },
  // McLaren: within a base pool (e.g. Senna) the track-only / ultra-limited variants are their OWN
  // cars and must be set aside so they never mix into the base range: Senna GTR (track-only), Senna
  // LM / "LM 25" (ultra-rare), and MSO (McLaren Special Operations bespoke). Keeps the base road-car
  // pool honest (Sam: Senna, Senna GTR, Senna LM, LM 25 and MSO are different cars).
  { make: /mclaren/i, re: /\b(gtr|lm\s?25|\blm\b|mso|\bhs\b|can-?am)\b/i }
];
function haloMatcherFor(make) { const h = HALO_PATTERNS.find(p => p.make.test(make || "")); return h ? h.re : null; }
export { haloMatcherFor };

// Race cars and restomods: never a "stock market" comp, and never the record/max unless asked.
// Shared by One Box and the Sam Desk (one rule, not a Desk copy).
// "Clubsport" bare (no "GT4" prefix) is NOT a race signal: a 964-era "Carrera RS Clubsport"/"RS Club
// Sport" is a genuine FACTORY ROAD car (a lightweight RS variant), not the FIA GT4 Clubsport race car.
const RACE_TITLE_RE = /\bdtm\b|\bfia\b|\bimsa\b|\bnascar\b|\bgt3\s?cup\b|\bgt3[\s-]?r\b|\bgt4\s?clubsport\b|\bcup\s?car\b|\bsupercup\b|\b(turbo|carrera)\s?cup\b|\brsr\b|group\s?[abc45]\b|\brace\s?car\b|\btrack\s?car\b|\bracing\b|works\s?rally|rally\s?car|\bgrp\.?\s?[abc45]\b|competition\s?(saloon|coupe|car)/i;
// An RSR-SPEC ENGINE SWAP ("RSR 3.8-Powered ... Carrera RS Clubsport") describes a part, not the car's
// own designation - strip it before testing RACE_TITLE_RE so the host car (a real road-car trim) is
// not misread as an RSR race car.
const RSR_POWERED_RE = /\brsr\b[\s\d.]*-?\s*powered\b/ig;
const stripRaceNoise = t => String(t || "").replace(RSR_POWERED_RE, "");
const RESTOMOD_TITLE_RE = /restomod|resto-?mod|reimagined|enhanced\s?&\s?evolved|coyote-?power|\bls[0-9]-?(swap|power|powered)|by\s?(singer|redux|kaege|g[uü]nther\s?werks|guntherwerks|emory|icon|ringbrothers|ring\s?brothers|speedkore|ecd|velocity|vintage\s?broncos|heritage|gateway\s?bronco|legacy)\b/i;
// Period TUNER / conversion houses: a converted car, not a stock example, so set aside on both
// surfaces. These MODIFY a base car. Separate MANUFACTURERS with their own VIN/type approval
// (Alpina, RUF) are their OWN cars, NOT conversions, so they are deliberately excluded here.
const TUNER_TITLE_RE = /\b(ac\s?schnitzer|schnitzer|hartge|hamann|dinan|brabus|renntech|lorinser|techart|gemballa|koenig\s?special|\bmtm\b|g[-\s]?power|manhart|hennessey|lingenfelter|roush|saleen|callaway)\b/i;
// MODIFIED / engine-swapped cars: not a stock comp for a base-market read. Conservative set catches
// clear aftermarket work in the TITLE (twin-turbo/supercharger swaps, engine swaps, pro-touring,
// widebody, "modified"/"custom-built") without matching a factory-turbo model name or a trim called
// "Custom" (e.g. "Ramcharger Custom" is a trim, not a mod, so \bcustom\b alone is NOT matched).
const MODIFIED_TITLE_RE = /\btwin[-\s]?turbo(charged)?\b|\b(v6|v8|v10|v12|ls\d|hemi|coyote|barra|2jz|rb2[56])[-\s]?swap(ped)?\b|\bengine[-\s]?swap(ped)?\b|\bpro[-\s]?touring\b|\bwide[-\s]?body\b|\brestomod(ded)?\b|\bmodified\b|\bcustom[-\s]?built\b|\bbagged\b|\bslammed\b/i;
// Coarse body CLASS (truck/utility vs car) for the class-era wider-market read: a pickup query must
// not pool passenger cars (a Shelby CSX, an Omni GLH-S) and vice versa. Returns "truck" for
// pickups/SUVs/vans (body-on-frame utility), else "car". Keyword-based on the title/model text.
const TRUCK_CLASS_RE = /\bpick[-\s]?up\b|\btruck\b|\b[dwf][-\s]?[1-5]50\b|\bc\/?k[-\s]?[0-9]{3,4}\b|\bram\b|ramcharger|power\s?wagon|dakota|\bd50\b|\bd350\b|silverado|sierra|blazer|bronco|suburban|tahoe|yukon|wagoneer|cherokee|\bscout\b|land\s?cruiser|4[-\s]?runner|tacoma|tundra|\bk5\b|sport\s?utility|\bsuv\b|\bvan\b|econoline|\bg[-\s]?wagen\b|defender|\bfj\d/i;
function bodyClassOf(text) { return TRUCK_CLASS_RE.test(String(text || "")) ? "truck" : "car"; }
export { bodyClassOf };
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
  if (RACE_TITLE_RE.test(stripRaceNoise(t))) return "race car";
  if (RESTOMOD_TITLE_RE.test(t)) return "restomod";
  if (TUNER_TITLE_RE.test(t)) return "period tuner";
  if (!opts.wantHalo) {
    // Generation-aware E30 M3 Evolution (homologation special); E36+ Evolution is mainstream.
    if (/bmw/i.test(make) && /\bm3\b/i.test(t) && yr && yr >= 1986 && yr <= 1991 && /\bevo(lution)?\b|\bevo\s?ii\b/i.test(t)) return "halo";
    const h = haloMatcherFor(make);
    // When the QUERIED car's own name matches the halo pattern (a "550 Barchetta" query, a "GT3" query),
    // the row is the queried car itself, not a halo variant to set aside - suppressing would otherwise
    // gut the pool (rule 16). opts.self carries the queried model+trim.
    if (h && h.test(t) && !(opts.self && h.test(String(opts.self).toLowerCase()))) return "halo";
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
// HYPHEN/SPACE-NEUTRAL TRIM CODES (Oct 2026): a trim code reads the same whether a title writes it
// "ZR1", "ZR-1" or "ZR 1" ("Z28"/"Z-28"/"Z/28", "SS396"/"SS 396", "GT350"/"GT-350", "XJS"/"XJ-S"). A
// separator is optional only where letters meet digits inside a code (and between a letter word and a
// digit word), plus the curated letter codes below; ordinary words still need a separator. XJR-S, XJ220,
// E-Type, F-Type and Rolls-Royce never merge: no rule joins across extra letters or digits.
const LETTER_CODE_SPLITS = { xjs: ["xj", "s"], xke: ["xk", "e"] };
function codeRuns(word) {
  const w = String(word || "").toLowerCase();
  if (LETTER_CODE_SPLITS[w]) return LETTER_CODE_SPLITS[w];
  return w.match(/[a-z]+|\d+|[^a-z\d]+/g) || [];
}
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function trimCodePattern(trim) {
  const words = String(trim || "").trim().split(/[\s/-]+/).filter(Boolean);
  if (!words.length) return null;
  let out = "";
  words.forEach((w, i) => {
    if (i) { const prev = words[i - 1]; out += (/^[a-z]+$/i.test(prev) && /^\d/.test(w)) || (/\d$/.test(prev) && /^[a-z]/i.test(w)) ? "[\\s/-]*" : "[\\s/-]+"; }
    out += codeRuns(w).map(reEsc).join("[\\s/-]*");
  });
  return out;
}
function trimTitleRe(trim) {
  const pat = trimCodePattern(trim);
  if (!pat) return null;
  return new RegExp(`(^|[^a-z0-9])${pat}([^a-z0-9]|$)`, "i");
}
// The DB pre-filter for a trim: one ILIKE with a `*` wildcard where a separator may sit ("ZR*1",
// "SS*396", "XJ*S"), so every spelling reaches the app; qualifyReason then keeps only real matches.
export function trimIlike(trim) {
  const words = String(trim || "").trim().split(/[\s/-]+/).filter(Boolean);
  return words.map(w => codeRuns(w).join("*")).join("*");
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
// PROVENANCE SET-ASIDE (Part 3 bug 3): a car whose VALUE is driven by WHO owned it or WHAT it did
// (ex-celebrity, works/team car, period press or show car) is a halo - it never belongs in the
// typical range or the side cards. Curated famous names + unambiguous phrases only, so an ordinary
// listing is never swept in. Matched on the title (the lean pool fetch carries no description).
const PROVENANCE_RE = /\bex[-\s–—]?works\b|\bworks\s+(car|racer|race\s?car|entry|team\s+car|prototype)\b|\bteam\s+car\b|\bpress\s+car\b|\bshow\s+car\b|\bfactory\s+(press|demonstrator|show)\b|\bformerly\s+owned\s+by\b|\bowned\s+by\s+[A-Z]/i;
// Distinctive famous-owner NAMES that mark provenance on their own (no "ex-" required): "Jerry
// Seinfeld's 911S", "Ex–Jerry Seinfeld Beetle" (en-dash), "the McQueen Ferrari" all qualify. Curated to
// names that only ever appear as provenance in a sale title, so an ordinary listing is never swept in.
const PROVENANCE_NAME_RE = /\b(seinfeld|mcqueen|paul\s?newman|ralph\s?lauren|nick\s?mason|jay\s?leno|james\s?dean|james\s?hunt|clark\s?gable|elvis\s?presley|steve\s?mcqueen|jerry\s?seinfeld)\b/i;
// Provenance from the title OR the DESCRIPTION (bug 3 completion): the ex-owner / works-car line
// usually lives in the description, which filterProjectRows already fetches into _descText on the same
// bounded pass as the project flag. So a description-only "ex-Steve McQueen" is now caught too.
const _provText = r => titleOf(r) + " " + String(r.rtitle || "") + " " + String(r._descText || "");
const isProvenance = r => { const t = _provText(r); return PROVENANCE_RE.test(t) || PROVENANCE_NAME_RE.test(t); };
// ENGINE SWAP (set aside like a restomod, mirrors lib/modelRules.js RESTOMOD_TAGS): a non-factory
// engine named in the title/description. Covers the uncovered-model (r4Split) and thin paths, where
// restomodReason is not consulted; covered models are already tagged via rule5PoolGuard.
const ENGINE_SWAP_RE = /\bengine[-\s]?swap(?:ped)?\b|\bswapped\b|\bre-?powered\b|\brepower\b|\b(?:ls[0-9]?x?|lsx|coyote|[12]jz|rb2[0-9]|rb3[0-9]|hemi|godzilla|k-?series|k2[04])[-\s]?(?:swap(?:ped)?|powered|conversion)\b|\b(?:v8|v10|v12)[-\s]?(?:powered|swapped)\b|\b\d(?:\.\d)?\s?l(?:iter)?\s*v\d+[-\s]?(?:powered|swapped)\b/i;
const isEngineSwap = r => ENGINE_SWAP_RE.test(_provText(r));
// MODEL-SPECIFIC HALOS (Part 3 bug 6): a pricier sub-variant that is NOT a named trim and would blow
// out an otherwise-coherent range. 300SL: the alloy-body Gullwings (29 built, $5M+) and the race cars
// (W194 / Rennsport / SLR) are halos, so the steel Gullwing pool reads as one market. Make+model
// scoped so "alloy"/"competition" never over-match another car.
const MODEL_HALOS = [
  { make: /mercedes|benz/i, model: /300\s?sl/i, re: /\balloy\b|alumin[iu]um|\bnsl\b|rennsport|\bw194\b|\bslr\b|competition/i }
];
function modelHaloReFor(make, model) { const h = MODEL_HALOS.find(x => x.make.test(make || "") && x.model.test(model || "")); return h ? h.re : null; }
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
  return [roundFloor(v[0]), roundCeil(v[v.length - 1])];
};
const r4Cluster = a => a.length ? [roundNearest(percentile(a.map(r => r._usd), 0.25)), roundNearest(percentile(a.map(r => r._usd), 0.75))] : null;
// Capped-third-split range (Part 3 question cap): each side's $500-rounded TYPICAL band (p25-p75),
// the same "sold between" basis as the main result so a lone outlier never inflates it (a single
// $541k manual F355 must not read as "Manuals sold between $70,500 and $541,000"). Returns null if
// either side is too thin (<3) to state. Renders "Manuals sold between X and Y. F1s between X and Y."
function inlineSplitRange(rows, classify, aKey, aLabel, bKey, bLabel) {
  const vals = key => rows.filter(r => classify(r) === key).map(r => r._usd).filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
  const a = vals(aKey), b = vals(bKey);
  if (a.length < 3 || b.length < 3) return null;
  const band = v => [roundNearest(percentile(v, 0.25)), roundNearest(percentile(v, 0.75))];
  const [alo, ahi] = band(a), [blo, bhi] = band(b);
  return [{ label: aLabel, lo: alo, hi: ahi, n: a.length },
          { label: bLabel, lo: blo, hi: bhi, n: b.length }];
}
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
// Paddle/automated boxes are AUTO, never manual. The list mirrors gearboxType (Part 1) so a
// dual-clutch / F1 / E-Gear / SMG / Sportshift / PDK / DCT car is never mistaken for a manual.
// (Bug: a "7-Speed Dual-Clutch" / "7-Speed F1" 458 Speciale matched the bare-N-speed manual rule and
// its old exclusion list missed those spelled-out tokens, inventing >=5 phantom "manuals" and firing
// a Manual/Automatic question for a car that has no manual at all.)
const R4_AUTO = t => /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle|dual[-\s]?clutch|twin[-\s]?clutch|\bf1\b|e-?gear|\bsmg\b|sportshift|automated|s[-\s]?tronic|\btct\b|f1[-\s]?matic|semi-?auto/i.test(t);
// Manual needs a manual marker (explicit, or a bare N-speed for the F1-era cars titled only "6-Speed")
// AND no auto marker. The !R4_AUTO guard is what keeps paddle boxes out of the manual bucket.
// Manual requires a POSITIVE marker (manual / stick / gated / MT / "N-speed manual"); a BARE "N-speed"
// is UNKNOWN, never manual (a 458's "7-Speed" is a dual-clutch, not a stick). Unknown rows count on
// NEITHER side of a transmission split or question. (Rule, Oct 2026: applies everywhere transmission
// splits a pool - r4Transmission, the driver search, the inline split, the gearbox question.)
const R4_MANUAL = t => /\bmanual\b|\bgated\b|\bstick\b|\bmt\b/i.test(t) && !R4_AUTO(t);
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
  // SIDE CARDS (Part 3 item 2): BOTH drawn from INSIDE the displayed range, never a car priced
  // outside it (no $293k card beside a $132k-$161k band). `center` is the cluster band (or the span
  // for a no-cluster result). Within that band, prefer a FEWER-miles and a MORE-miles example vs the
  // closest; if a side has no in-band mileage example, fall back to the MORE-RECENT / EARLIER in-band
  // sale. Falling back stays strictly inside the band - an empty side renders one card, never an
  // out-of-range one.
  const band = (Array.isArray(center) && center.length === 2 && center[0] != null && center[1] != null)
    ? [Math.min(center[0], center[1]), Math.max(center[0], center[1])] : null;
  const inBand = (band ? bpool.filter(r => r._usd >= band[0] && r._usd <= band[1]) : bpool).filter(r => r !== closest);
  let high = null, hiDelta = null, low = null, loDelta = null;
  if (cMi > 0) {
    const fewer = inBand.filter(r => miOf(r) > 0 && miOf(r) < cMi).sort((a, b) => miOf(a) - miOf(b));   // lowest miles in band
    const more = inBand.filter(r => miOf(r) > 0 && miOf(r) > cMi).sort((a, b) => miOf(b) - miOf(a));    // highest miles in band
    if (fewer.length) { high = fewer[0]; hiDelta = "fewer_miles"; }
    if (more.length) { low = more[0]; loDelta = "more_miles"; }
  }
  // Recency fallback, strictly WITHIN the band, for any empty side (never a car outside the band).
  if (!high) { const d = inBand.filter(r => r !== low).sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || ""))); if (d.length) { high = d[0]; hiDelta = "more_recent"; } }
  if (!low) { const d = inBand.filter(r => r !== high).sort((a, b) => String(a.auction_end_date || "").localeCompare(String(b.auction_end_date || ""))); if (d.length) { low = d[0]; loDelta = "earlier"; } }
  const shape = (r, role, dl, basis) => {
    if (!r) return null;
    const c = shapeCards([r])[0];
    const disp = priceDisplay(r), isH = isHouseSource(r.source);
    c.isHouse = isH;
    c.allIn = (isH && disp && disp.premiumInclusive && disp.amount) ? Math.round(disp.currency === "USD" ? disp.amount : toUsd(disp.amount, disp.currency, r.date || r.sale_date || r.auction_end_date || null)) : null;
    c.role = role; c.delta = dl || null; c.basis = basis || null;
    return c;
  };
  return {
    closest: shape(closest, "closest", null, subjMi > 0 ? "subject" : "middle"),
    high: high ? shape(high, "high", hiDelta, null) : null,
    low: low ? shape(low, "low", loDelta, null) : null,
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
// Aligned to the RANGE LADDER (Part 3, bug 2): the ladder gives a band at 8+ sales, so THIN MODE must
// only fire BELOW the band floor (< 8 online). At 15 it stole the 8-14 band - a 14-sale 996 Turbo S
// Cabriolet pool refused as "thin" instead of showing the 8-15 middle-half band. Now <8 online is thin
// (sales listed, house steer); 8-15 lands on buildResult's band; 16+ on the cluster.
const HT_ONLINE_MIN = 8;
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
    markers: ((Array.isArray(r.desc_facts && r.desc_facts.markers) ? r.desc_facts.markers : extractMarkers(r))).map(k => ({ key: k, label: markerLabel(k) })),
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
async function assessThin(famSpec, trimName, trimRe, iso, env, diag, opts = {}) {
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
  // Race/road trim-family fence (item 2): a named race trim (GT2 R) pools ONLY its family (GT2 R +
  // GT2 Evo); a road badge (GT2) drops its race siblings. Comparables must match the trim family.
  scoped = applyTrimFamilyFence(famSpec.make, famSpec.model, trimName, raw, scoped, ttl);
  let pool = scoped
    .map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
    .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
  // MODEL-SPECIFIC HALOS (bug 6): drop alloy-body / race 300SLs from the thin pool too, so a house-led
  // Gullwing read is the steel-car market, not blown out by a $5M alloy car. Make+model scoped.
  { const mhRe = modelHaloReFor(famSpec.make, famSpec.model); if (mhRe) pool = pool.filter(r => !(mhRe.test(ttl(r)))); }
  // PROVENANCE (bug 3) + ENGINE SWAP: an ex-celebrity / works / press / show car OR an engine-swapped
  // car is a halo in thin mode too, so it never sits in the receipts that stand in for the range.
  pool = pool.filter(r => !isProvenance(r) && !isEngineSwap(r));
  // Base/model rung (opts.setAsideHalo): dropping the trim to read the whole model must NOT pull
  // the halos/special editions up into the base pool (direction rule). Set them aside via the
  // SHARED rule so "all Murcielagos" excludes the SV / 40th Anniversary / Reventon.
  let thinSetAsideN = 0;
  if (opts.setAsideHalo) {
    // BADGE-AWARE halo set-aside (rule 16 intrinsic-AMG trap, Sep 2026): a performance-BADGE or
    // intrinsic-AMG pool ("S65", "SLS AMG") IS the AMG, so the generic make-halo would set aside
    // the badge's OWN cars (every S65 title carries "AMG") and empty the pool - which surfaced as a
    // false class_era for the S65. For a badge/intrinsic-AMG query set aside only variants genuinely
    // ABOVE the badge (Black Series), mirroring the trim ladder's haloRe; a BASE query keeps the
    // full make-halo. Race cars / restomods / tuners are always set aside either way.
    const intrinsicAmg = /mercedes|benz/i.test(famSpec.make) && /\bamg\b/i.test(famSpec.model || "");
    const badgeAware = !!(famSpec.badge || intrinsicAmg);
    const badgeHaloRe = /mercedes|benz/i.test(famSpec.make) ? /\bblack\s?series\b/i : haloMatcherFor(famSpec.make);
    const before = pool.length;
    pool = pool.filter(r => {
      const t = String(r.raw_title || r.rtitle || "");
      if (badgeAware) {
        if (recordExcludeReason(r, famSpec.make, { wantHalo: true })) return false; // race/restomod/tuner always
        if (badgeHaloRe && badgeHaloRe.test(t)) return false;                        // only variants ABOVE the badge
      } else {
        if (recordExcludeReason(r, famSpec.make, { wantHalo: false, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return false; // full make-halo for a base query
      }
      // A car TITLED "Modified" is not a clean comp (item 4) - set it aside. A "6-Speed Conversion"
      // is NOT set aside: it stays in the pool, labelled a conversion (never a factory manual).
      if (/\bmodified\b/i.test(t) && !/conversion|converted/i.test(t)) return false;
      return true;
    });
    thinSetAsideN = before - pool.length;
  }
  // Drop project/incomplete/shell/non-original cars (item 1) via title + description, so an unfinished
  // shell is never a comp, a range member, a house ranking entry or an ask comparison for a running car.
  pool = await filterProjectRows(pool, env);
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
  const meta = { isThin, houseSteer, onlineN: onlineVolumeN, onlineReceiptsN: online.length, houseN: house.length, totalN: pool.length, windowMonths: 36, setAsideN: thinSetAsideN };
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
  // The RECORD RANGE (rule 23, "the RANGE is the record"): the real min-to-max of the thin pool's
  // hammer prices. This is EXACTLY what the thin hero already renders ("The recorded sales ran from
  // $X to $Y"); exposing it as `span` lets a house-dominated but well-populated car (a 300SL
  // Roadster, 27 sales) carry an honest range, not only individual receipts. 2+ sales with a real
  // spread only (a single sale is a receipt, not a range).
  const hammers = receipts.map(r => r.hammer).filter(h => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
  const span = (hammers.length >= 2 && hammers[hammers.length - 1] > hammers[0]) ? [roundFloor(hammers[0]), roundCeil(hammers[hammers.length - 1])] : null;
  return { ...meta, receipts, pairs, pairsCount: pairs.length, pairPctEligible: pairs.length >= 3, intake, medianHammer, span };
}

// RESERVE INSIGHT (item 2b, Oct 2026): reserve vs no-reserve within the SAME model + trim + model-year
// window (generation if the trim is thin), the fair comparison Sam's newsletter uses - NOT "997 across
// Carrera to GT3". Counts UNSOLD reserve-not-met cars at their high bid (auction_attempts) on the
// generation fallback, where the attempts table (which carries no title) can be matched model+year.
// Archive-only, zero OldCarsData. Returns { ok, deltaPct, nReserve, nNoReserve, scopeLabel, unsold, window }.
const RESERVE_INSIGHT_MIN = 8;   // per side; below this the tile is hidden (too thin to read honestly)
const _riMed = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export async function reserveInsightForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false };
    const make = vehicle.make;
    const trim = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : null;
    const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
    const yr = Number(vehicle.year) || null;
    const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);   // 12 months (item 2c)
    const trimRe = trim ? trimTitleRe(trim) : null;
    // Chassis-code union: the archive files modern 911s under "997"/"991", not the "911" nameplate,
    // so a bare model-column scope reads thin. When the generation names a chassis code, match either
    // the nameplate token OR the code (SAME year/date scope) - the archive's other spelling of the car.
    const codeTok = generationModelToken(generation);
    const modelFilter = (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase())
      ? `&or=(model.ilike.${encodeURIComponent("*" + modelTok + "*")},model.ilike.${encodeURIComponent("*" + codeTok + "*")})`
      : `&model=ilike.${encodeURIComponent("*" + modelTok + "*")}`;
    // Sold rows carrying a reserve flag (online platforms). Scope make+model+year; trim filtered in code.
    const soldRows = async (yMin, yMax) => {
      let q = `sales_archive?select=sale_price,has_reserve,listing_title&make=ilike.${encodeURIComponent("*" + make + "*")}${modelFilter}&sale_price=not.is.null&has_reserve=not.is.null&sale_date=gte.${since}`;
      if (yMin != null) q += `&year=gte.${yMin}`; if (yMax != null) q += `&year=lte.${yMax}`;
      return (await supabaseSelectAll(env, q)) || [];
    };
    const splitSold = (rows, applyTrim) => {
      const res = [], no = [];
      for (const r of rows) { const v = Number(r.sale_price); if (!(v > 0)) continue; if (applyTrim && trimRe && !trimRe.test(String(r.listing_title || ""))) continue; (r.has_reserve === true || String(r.has_reserve) === "true" ? res : no).push(v); }
      return { res, no };
    };
    const build = (res, no, label, unsold) => {
      if (res.length < RESERVE_INSIGHT_MIN || no.length < RESERVE_INSIGHT_MIN) return null;
      const mRes = _riMed(res), mNo = _riMed(no);
      const deltaPct = mNo > 0 ? Math.round(((mRes - mNo) / mNo) * 100) : 0;
      return { ok: true, deltaPct, nReserve: res.length, nNoReserve: no.length, n: res.length + no.length, scopeLabel: label, unsold: unsold || 0, windowMonths: 12 };
    };
    // 1) Trim + model-year (+/-2): the fair, trim-clean comparison. Sold-only (attempts carry no title).
    if (trim && yr) {
      const rows = await soldRows(yr - 2, yr + 2);
      const { res, no } = splitSold(rows, true);
      const hit = build(res, no, nameplate(vehicle.model, trim) || [make, vehicle.model, trim].filter(Boolean).join(" "), 0);
      if (hit) return hit;
    }
    // 2) Generation fallback (thin trim): the generation's year range, ALL trims, PLUS unsold
    // reserve-not-met at high bid (auction_attempts, matched model+year - no title, so generation only).
    const gMin = generation && generation.yearStart ? generation.yearStart : (yr ? yr - 2 : null);
    const gMax = generation && generation.yearEnd ? generation.yearEnd : (yr ? yr + 2 : null);
    const grows = await soldRows(gMin, gMax);
    const { res, no } = splitSold(grows, false);
    let qa = `auction_attempts?select=high_bid&make=ilike.${encodeURIComponent("*" + make + "*")}${modelFilter}&auction_status=eq.reserve_not_met&high_bid=not.is.null&attempt_date=gte.${since}`;
    if (gMin != null) qa += `&year=gte.${gMin}`; if (gMax != null) qa += `&year=lte.${gMax}`;
    const unsold = (await supabaseSelectAll(env, qa)) || [];
    for (const a of unsold) { const v = Number(a.high_bid); if (v > 0) res.push(v); }   // unsold reserve at high bid
    const genLabel = (generation && generation.code ? `${String(generation.code).toUpperCase()}-generation ${vehicle.model}` : [make, vehicle.model].filter(Boolean).join(" "));
    return build(res, no, genLabel, unsold.length) || { ok: false, nReserve: res.length, nNoReserve: no.length };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Model+generation scope filters shared by the reserve-day + venue-count archive reads. Uses the
// chassis-code union (911 OR 997/991) so code-filed cars are not missed, and the generation year range.
function _archiveScopeFilters(vehicle, generation) {
  const make = vehicle.make;
  const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
  const codeTok = generationModelToken(generation);
  const modelFilter = (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase())
    ? `&or=(model.ilike.${encodeURIComponent("*" + modelTok + "*")},model.ilike.${encodeURIComponent("*" + codeTok + "*")})`
    : `&model=ilike.${encodeURIComponent("*" + modelTok + "*")}`;
  const gMin = generation && generation.yearStart ? generation.yearStart : (vehicle.year ? vehicle.year - 2 : null);
  const gMax = generation && generation.yearEnd ? generation.yearEnd : (vehicle.year ? vehicle.year + 2 : null);
  return { mk: encodeURIComponent("*" + make + "*"), modelFilter, gMin, gMax };
}

// Reserve-car DAY insight (Sep 2026; buckets Oct 2026): the real weekday effect for reserve auctions
// is SELL-THROUGH, not price (matched same make/model/year, weekend vs weekday prices are within ~1%).
// Picking the single best of seven days over 20-40 auctions mostly finds chance, so it is split into
// TWO buckets: weekend (Sat/Sun) vs midweek (Mon-Fri). Needs BOTH sides: SOLD reserve cars
// (sales_archive, has_reserve) + reserve-not-met (auction_attempts), scoped to BRING A TRAILER (the
// platform that reports both). Shown only when EACH bucket has >=30 auctions AND the two sell-through
// rates differ by >=5 points; otherwise hidden. Counts only (no price). Generation-scoped.
const RESERVE_DAY_BUCKET_MIN = 30;   // auctions per bucket (weekend / midweek)
const RESERVE_DAY_MIN_GAP = 5;       // sell-through points between the buckets
const _isWeekendIso = iso => { const d = new Date(String(iso || "")); if (isNaN(d.getTime())) return null; const g = d.getUTCDay(); return g === 0 || g === 6; };
export async function reserveDayInsightForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false };
    const { mk, modelFilter, gMin, gMax } = _archiveScopeFilters(vehicle, generation);
    const yq = (gMin != null ? `&year=gte.${gMin}` : "") + (gMax != null ? `&year=lte.${gMax}` : "");
    const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);   // 24 months
    const sold = (await supabaseSelectAll(env, `sales_archive?select=sale_date&source_slug=eq.bringatrailer&has_reserve=eq.true&sale_price=not.is.null&sale_date=gte.${since}&make=ilike.${mk}${modelFilter}${yq}`)) || [];
    const unsold = (await supabaseSelectAll(env, `auction_attempts?select=attempt_date&source_slug=eq.bringatrailer&auction_status=eq.reserve_not_met&attempt_date=gte.${since}&make=ilike.${mk}${modelFilter}${yq}`)) || [];
    // sold[w]/tot[w] per bucket: 0 = weekend, 1 = midweek.
    const sold2 = [0, 0], tot2 = [0, 0];
    for (const r of sold) { const w = _isWeekendIso(r.sale_date); if (w == null) continue; const b = w ? 0 : 1; sold2[b]++; tot2[b]++; }
    for (const r of unsold) { const w = _isWeekendIso(r.attempt_date); if (w == null) continue; const b = w ? 0 : 1; tot2[b]++; }
    if (tot2[0] < RESERVE_DAY_BUCKET_MIN || tot2[1] < RESERVE_DAY_BUCKET_MIN) return { ok: false, reason: "bucket<30", weekendN: tot2[0], weekdayN: tot2[1] };
    const weekendPct = Math.round(sold2[0] / tot2[0] * 100);
    const weekdayPct = Math.round(sold2[1] / tot2[1] * 100);
    if (Math.abs(weekendPct - weekdayPct) < RESERVE_DAY_MIN_GAP) return { ok: false, reason: "gap<5", weekendPct, weekdayPct, weekendN: tot2[0], weekdayN: tot2[1] };
    const scopeLabel = (generation && generation.code ? `${String(generation.code).toUpperCase()} ${vehicle.model}` : [vehicle.make, vehicle.model].filter(Boolean).join(" "));
    return { ok: true, weekendPct, weekdayPct, weekendN: tot2[0], weekdayN: tot2[1], sample: tot2[0] + tot2[1], winner: weekendPct >= weekdayPct ? "weekend" : "weekday", scopeLabel, windowMonths: 24 };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Accurate venue sales COUNT + recency for a scope (item 1 fix): the matched-premium thin fallback used
// to count from the bounded sell-flow evidence pool (limit-1000, ladder/evidence-filtered, exact-year),
// which drastically undercounted ("5 2004 M3s", "9 997s"). This counts EVERY matching SOLD row on the
// venue in sales_archive over the window, scoped to match the displayed label: exact year for a
// year-scoped read, the generation year range for a generation read. Archive-only, zero OldCarsData.
export async function venueScopedSalesForVehicle(vehicle, generation, platform, yearScope, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !platform || !env) return { count: 0, recencyDate: null };
    const { mk, gMin, gMax } = _archiveScopeFilters(vehicle, generation);
    // Count by MODEL column OR listing TITLE: many rows carry the nameplate in the title but a generic
    // model column, so a model-only scope undercounts the venue's true sales (31 vs 53 real 2004 M3s).
    const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
    const codeTok = generationModelToken(generation);
    const toks = [modelTok]; if (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase()) toks.push(codeTok);
    const orParts = [];
    for (const t of toks) { const enc = encodeURIComponent("*" + t + "*"); orParts.push(`model.ilike.${enc}`, `listing_title.ilike.${enc}`); }
    const modelFilter = `&or=(${orParts.join(",")})`;
    // Item 2: when the landed rung kept the trim, scope the count to the trim via the listing title so
    // the venue count describes the SAME car as the range (29 Carrera S, not 144 year-only 911s). A trim
    // that matches nothing leaves count 0, and the caller keeps the already trim-scoped matched count.
    const trimTok = env && env.trim ? String(env.trim).trim() : "";
    const trimFilter = trimTok ? `&listing_title=ilike.${encodeURIComponent("*" + trimTok + "*")}` : "";
    let yq = "";
    if (yearScope === "exact_year" && vehicle.year) yq = `&year=eq.${Number(vehicle.year)}`;
    else if (yearScope === "generation") yq = (gMin != null ? `&year=gte.${gMin}` : "") + (gMax != null ? `&year=lte.${gMax}` : "");
    else if (yearScope === "near_years" && vehicle.year) yq = `&year=gte.${Number(vehicle.year) - 2}&year=lte.${Number(vehicle.year) + 2}`;
    // year_range / any_year / make -> no year filter (matches the "any year" label)
    const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);   // 24 months
    const base = `sales_archive?source_slug=eq.${encodeURIComponent(platform)}&sale_price=not.is.null&sale_date=gte.${since}&make=ilike.${mk}${modelFilter}${trimFilter}${yq}`;
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${base}&select=id&limit=1`, {
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }
    });
    const cr = res.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
    const count = m ? Number(m[1]) : 0;
    let recencyDate = null;
    if (count > 0) { const newest = await supabaseSelect(env, `${base}&select=sale_date&order=sale_date.desc&limit=1`); recencyDate = (newest && newest[0] && newest[0].sale_date) ? String(newest[0].sale_date).slice(0, 10) : null; }
    return { count, recencyDate };
  } catch (e) { return { count: 0, recencyDate: null }; }
}

// Reusable thin/steer assessment for a resolved vehicle, so /sell can render the same THIN MODE
// and HOUSE STEER as One Box. Reads the ARCHIVE only (sales_archive) - ZERO OldCarsData spend,
// so it never adds a metered fetch to the /sell path. Returns the assessThin object (isThin,
// houseSteer, receipts, intake, ...) or {isThin:false} when it cannot scope.
export async function assessThinForVehicle(vehicle, generation, env) {
  if (!vehicle || !vehicle.make) return { isThin: false };
  const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const spec = buildSpec(vehicle, generation, searchText);
  if (!spec || !spec.make) return { isThin: false };
  const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
  const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
  const trimRe = trimName ? trimTitleRe(trimName) : null;
  const now = Date.now();
  const iso = days => new Date(now - days * 864e5).toISOString();
  // Retry once on a transient fetch error (a broad marque like Ferrari can time out the archive read
  // under load). A thrown read must surface as null so the caller keeps the normal decision and never
  // widens to the wider-make class band; only a genuine empty pool reads as zero sales.
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await assessThin(famSpec, trimName, trimRe, iso, env, {}); }
    catch (e) { lastErr = e; }
  }
  return null;   // signal ERROR (not "zero sales") so the decision never falls to the wider make
}

// A resolved model's own HOUSE sales (last 36 months) as buildHouseComparison-ready receipts, with
// halos/specials/race/restomod/modified set aside, returned REGARDLESS of whether the car is thin.
// Powers the auction-house door for a DENSE car that genuinely sells at the houses (the 550 Maranello:
// 30 in 36 months) so it shows the car's OWN house record, not the "these trade mostly online" bridge.
// Also reports onlineN so the "no online sales, here are the houses" state can be stated honestly.
export async function houseReceiptsForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !env) return null;
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return null;
    const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
    const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
    const trimRe = trimName ? trimTitleRe(trimName) : null;
    const isoD = days => new Date(Date.now() - days * 864e5).toISOString();
    const raw = await fetchQualifying({ ...famSpec, houseTier: true }, isoD(HT_WINDOW_DAYS), env, {});
    const ttl = r => String(r.raw_title || r.rtitle || "");
    let scoped = trimRe ? raw.filter(r => trimRe.test(ttl(r))) : raw;
    if (trimName && trimRe && scoped.length < 2) {
      const firstTok = String(trimName).trim().split(/\s+/)[0];
      const ftRe = firstTok ? trimTitleRe(firstTok) : null;
      if (ftRe) { const alt = raw.filter(r => ftRe.test(ttl(r))); if (alt.length >= scoped.length) scoped = alt; }
    }
    // Race/road trim-family fence (item 2): the house pool for a named race trim (GT2 R) carries ONLY
    // that family (GT2 R + GT2 Evo); a road badge (GT2) drops its race siblings.
    scoped = applyTrimFamilyFence(famSpec.make, famSpec.model, trimName, raw, scoped, ttl);
    // Set aside halos / specials / race / restomod / modified via the SHARED rule (same as assessThin's
    // base rung), so the house record reads the base car (no Enzo in a 550 house list).
    const intrinsicAmg = /mercedes|benz/i.test(famSpec.make) && /\bamg\b/i.test(famSpec.model || "");
    const badgeAware = !!(famSpec.badge || intrinsicAmg);
    const badgeHaloRe = /mercedes|benz/i.test(famSpec.make) ? /\bblack\s?series\b/i : haloMatcherFor(famSpec.make);
    const base = scoped.filter(r => {
      const t = ttl(r);
      if (badgeAware) { if (recordExcludeReason(r, famSpec.make, { wantHalo: true })) return false; if (badgeHaloRe && badgeHaloRe.test(t)) return false; }
      else if (recordExcludeReason(r, famSpec.make, { wantHalo: false, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return false;
      if (/\bmodified\b/i.test(t) && !/conversion|converted/i.test(t)) return false;
      return true;
    });
    // Drop project/incomplete/shell/non-original cars (item 1) via title + description before ranking,
    // so an unfinished shell never leads the house record or enters the ask comparison.
    const complete = await filterProjectRows(base, env);
    const priced = complete.map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
      .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
    const houseReceipts = priced.map(htReceipt).filter(r => r.isHouse);
    const onlineN = priced.filter(r => !isHouseSource(r.source) && r.image).length;
    return { houseReceipts, houseN: houseReceipts.length, onlineN, totalN: priced.length };
  } catch (e) { return null; }
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
    // Drop project/incomplete/shell cars (item 1) so a shell never sets a range edge for a running car.
    const complete = await filterProjectRows(rows, env);
    const values = complete.map(r => Number(r.value)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
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
// A short human label for an outlier card in the class-era call-out ("one sold higher, at $X, a
// Roadster"). Pulls a body/variant word from the title, else falls back to the model name.
function shortVariantLabel(title, model) {
  const m = String(title || "").match(/\b(Roadster|Spyder|Spider|Superveloce|\bSV\b|40th Anniversary|Anniversary|Reventon|Reventón|Barchetta|Speedster|Cabriolet|Convertible|Targa|Coupe|GT)\b/i);
  return m ? ("a " + m[1]) : (model ? ("a " + model) : "one");
}
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
    `&sale_price=not.is.null${VT_CAR}&year=gte.${era.start}&year=lte.${era.end}&sale_date=gte.${since}` +
    `&order=sale_date.desc`;   // NO limit: page the full marque-decade pool (can exceed 1000 for a broad marque)
  let rows = (await supabaseSelectAll(env, q)) || [];
  if (diag) { diag.classQueries = (diag.classQueries || 0) + 1; }
  rows = dedupBySaleIdentity(rows).filter(r => !OB_REGION_EXCLUDED(r.source));
  // Item 3 (same body class): a truck/pickup query must not pool passenger cars from the same
  // decade+marque (a Shelby CSX, an Omni GLH-S in a Dodge-pickup band), and vice versa. Classify the
  // SUBJECT from its resolved nameplate, then keep only same-class rows. Skip the filter if it can't
  // be determined or would empty the pool (never dead-end).
  // Classify the subject's body class from the nameplate AND the raw text, so a make-level read (model
  // dropped after a "not sure") still reads the truck signal from the original "D50 D350" input.
  const subjClass = bodyClassOf([spec.year, spec.make, spec.model, spec.trim, spec.subjectText, spec.raw].filter(Boolean).join(" "));
  const classMatch = r => bodyClassOf(r.raw_title || r.rtitle || "") === subjClass;
  const pool = rows
    .filter(r => !isMemorabilia(r.raw_title || r.rtitle) && !isPartsListing(r.raw_title || r.rtitle, r.mileage))
    .map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
    .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
  const classPool = pool.filter(classMatch);
  const scoped = classPool.length >= 3 ? classPool : pool;   // keep the class; never empty the band
  if (!scoped.length) return { isClass: false, era: era.label, make: spec.make };
  // Fence data-error LOWS out of the class band (a $513 mis-priced 250F, a $15,750 "child's car",
  // a $16,741 ciclocarro) before the p10-p90. LOW-SIDE ONLY (median/OB_CLASS_LO): the class pool is
  // legitimately $M-wide at the top, so a high fence would trim genuine race cars - the p10-p90
  // already handles the top honestly. Sam-approved (Sep 2026); before/after lifted trueLow $513->$38k.
  const _cmed = _obMedian(scoped.map(r => r._hammer));
  const _cfloor = _cmed > 0 ? _cmed / OB_CLASS_LO : 0;
  const fenced = _cfloor ? scoped.filter(r => r._hammer >= _cfloor) : scoped;
  const usePool = fenced.length ? fenced : scoped;
  // Set aside halos / special editions / race / restomod / tuner via the SHARED rule, so the band
  // and the shown cards read the BASE market (a Diablo GT, a 40th Anniversary sit aside, not in it).
  const setAsideRows = [], basePool = [];
  for (const r of usePool) {
    const t = String(r.raw_title || r.rtitle || "");
    // Item 4: set aside MODIFIED / engine-swapped cars alongside race/restomod/tuner/halo, so the base
    // market read is stock examples only (a "Twin-Turbocharged 1983 Dodge Ram" is not a stock comp).
    if (recordExcludeReason(r, spec.make, { wantHalo: false, self: `${spec.model || ""} ${spec.trim || ""}` }) || MODIFIED_TITLE_RE.test(t)) setAsideRows.push(r);
    else basePool.push(r);
  }
  const bandPool = basePool.length >= 3 ? basePool : usePool;   // never empty the band out entirely
  // Typical band from the base pool: p10-p90 BULK when rich (coarser + honest for a heterogeneous
  // class pool), min-max otherwise. Cards are NOT selected by this band (that would hide sales).
  const bhs = bandPool.map(r => r._hammer).slice().sort((a, z) => a - z);
  const band = bhs.length >= 8 ? [Math.round(percentile(bhs, 0.1)), Math.round(percentile(bhs, 0.9))] : [bhs[0], bhs[bhs.length - 1]];
  // Shown cards BY RELEVANCE, never by price: same model as the subject first, then era (year)
  // proximity, then recency. So the cards a reader sees are the closest comparables, not the
  // priciest. (This is the class fallback; the model rung above shows the model itself when it exists.)
  const subjModel = String(spec.model || "").toLowerCase();
  const subjYear = Number(spec.year);
  const relKey = r => {
    const t = String(r.raw_title || r.rtitle || "").toLowerCase();
    const sameModel = (subjModel && t.indexOf(subjModel) >= 0) ? 0 : 1;
    const yearGap = (Number.isFinite(subjYear) && r.year) ? Math.abs(r.year - subjYear) : 99;
    return sameModel * 1000 + Math.min(99, yearGap);
  };
  const ranked = bandPool.slice().sort((a, z) => relKey(a) - relKey(z) || String(z.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  const receipts = ranked.map(htReceipt);
  // Any SHOWN card (top 8) outside the stated band is called out in words by the frontend, so the
  // golden's rule holds: no shown card sits outside the stated range unless explicitly named.
  const [lo, hi] = band;
  const outliers = receipts.slice(0, 8).filter(r => r.hammer < lo || r.hammer > hi)
    .map(r => ({ hammer: r.hammer, above: r.hammer > hi, label: shortVariantLabel(r.title, spec.model) }));
  const allH = usePool.map(r => r._hammer);
  return { isClass: true, era: era.label, make: spec.make, model: spec.model || null, receipts, totalN: usePool.length, setAsideN: setAsideRows.length, medianHammer: htMedOf(bhs), lowHammer: lo, highHammer: hi, outliers, trueLow: Math.min(...allH), trueHigh: Math.max(...allH) };
}
// Reusable class-era assessment for /sell (archive-only, zero OldCarsData).
export async function assessClassEraForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.year) return null;
    const spec = buildSpec(vehicle, generation, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "));
    if (!spec || !spec.make) return null;
    // Carry the original typed text so a make-level read (model dropped after "not sure") can still
    // classify the body from the codes the seller typed (e.g. "D50 D350" -> truck).
    spec.subjectText = vehicle.raw || null;
    return await assessClassEra(spec, env, {});
  } catch (e) { return null; }
}

// ---- Sam's Take (v1, Sep 2026): a pattern read of the STRONGER half vs the WEAKER half of the
// sales behind a One Box range, on DATED listing snapshots. Pattern never cause, and never a figure
// for the user's own car. Every attribute here is "as listed at the time of sale". No extraction
// pipeline: the values already ride on the qualifying rows (raw_record->> extractions on the
// non-record fetchQualifying select). Returns a structured result + a first-person sentence, or null
// when the pool is too thin to compare honestly.
const ST_MIN_PER_SIDE = 8;   // each half needs >=8 sales WITH the attribute present, else skip it
const ST_MILEAGE_REL = 0.25; // mileage medians must be >=25% apart to count as separated
const ST_SHARE_PTS = 20;     // shares must be >=20 points apart
const ST_FLAW_ABS = 2;       // known-flaw median counts must be >=2 apart
const ST_MOD_HEADER = /^(notable\s+)?modifications?\b[^.]*\b(include|reported|according)\b|reported by the seller|according to the seller|^\s*modifications?\s*:?\s*$|^\s*mods?\s*:?\s*$/i;
const ST_CONVERSION = /\bconversion\b|\bconverted\b|\bswap(ped)?\b|\bretrofit(ted)?\b/i;
// FACTORY OPTIONS / PERSONALISATION are NOT modifications (bug: 7 in 10 812 GTS read as "modified").
// A car ordered with Tailor Made / Special Projects / Paint-to-Sample / Manufaktur / designo /
// Individual / Exclusive, or carrying a factory livery / stripes / optional wheels, is a FACTORY-spec
// car, not a modified one. These list items are dropped from the real-mods count.
const ST_FACTORY_OPTION = /\btailor[-\s]?made\b|\bspecial\s?projects?\b|\batelier\b|\bpaint[\s-]?to[\s-]?sample\b|\bPTS\b|\bmanufaktur\b|\bdesigno\b|\bindividual\b|porsche\s?exclusive|\bexclusive\s+(?:manufaktur|interior|leather|program\w*)\b|\blivery\b|\bstripe[sd]?\b|\bdecals?\b|\bfactory\s+option|\b(?:wheel\s+options?|option(?:al)?\s+wheels?)\b|\bpts\s|\bspec(?:ial)?\s?order\b/i;
// PROTECTIVE / CONVENIENCE add-ons are not modifications for comparison purposes: paint protection
// film (PPF / clear bra / Xpel), ceramic coating, window tint, radar/laser detector, dash cam,
// alarm/tracker, the factory front-axle (nose) lift, plate frames, floor mats, battery tender. Note the
// lift pattern is scoped to front-axle/nose lifts (the supercar factory option) so a genuine off-road
// "suspension lift kit" is never swept up.
const ST_CONVENIENCE = /paint[\s-]?protection|\bppf\b|clear\s?bra|\bxpel\b|ceramic\s?coat|tinted?\s?windows?|window\s?tint|radar\s?detector|laser\s?detector|dash\s?cam|\balarm\b|\btracker\b|tracking\s?(?:device|system)|gps\s?track|front[\s-]?axle(?:\s+suspension)?\s+lift|nose\s?lift|hydraulic\s+(?:nose\s+)?lift|plate\s?frames?|license\s?plate|floor\s?mats?|battery\s?(?:tender|maintainer|conditioner)|trickle\s?charger/i;
// FACTORY EQUIPMENT that upstream feeds often lump into the "modifications" list but which ships from
// the factory: adaptive/magnetorheological suspension, rear-wheel steering, adaptive headlights,
// surround/parking/back-up cameras, heated or power-adjustable seats, the GTS retractable hardtop, the
// factory fender shields. None of these is an aftermarket modification.
const ST_FACTORY_EQUIP = /magnetorheolog|magne[\s-]?ride|adaptive\s?(?:suspension|dampers?|headlights?)|rear[\s-]?wheel\s?steer\w*|four[\s-]?wheel\s?steer\w*|\b4ws\b|\bsbl\b|surround[\s-]?view|parking\s?camera|back[\s-]?up\s?camera|rear[\s-]?view\s?camera|360[\s-]?(?:degree\s?)?camera|heated\s[\w\s-]*seats?|power[\s-]?adjustable|electronically\s?operated\s?hardtop|retractable\s?hardtop|power\s?hardtop|fender\s?shields?/i;
// REVERSIBLE COSMETIC that returns the car to stock and is not a permanent modification: a vinyl wrap
// (peels off), and recolouring of the EXISTING wheels/calipers (refinished / repainted / powder-coated).
// A genuine aftermarket WHEEL SWAP is NOT matched here (it is a real mod unless the originals are kept,
// which the mods field alone cannot tell us) - only recolouring of the car's own wheels is swept up.
const ST_REVERSIBLE = /\bwrap(?:ped|s)?\b|vinyl\s?wrap|(?:wheels?|rims?)\s+(?:have\s+been\s+|were\s+|been\s+)?(?:re)?(?:finished|painted|powder[\s-]?coated|refurbished)|calipers?\s+(?:have\s+been\s+|were\s+)?painted|refinished\s+in\b/i;
function stMedian(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
// A raw_record->> jsonb array comes back as JSON TEXT; parse to an array of item strings. Handles a
// plain string (newline/semicolon list), an array of strings, or an array of objects.
function stParseList(v) {
  if (v == null) return null;
  let arr = v;
  if (typeof v === "string") { const t = v.trim(); if (!t || t === "[]" || t === "null") return t === "[]" ? [] : null; try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : [p]; } catch (_) { arr = t.split(/\r?\n|;/); } }
  if (!Array.isArray(arr)) arr = [arr];
  return arr.map(it => {
    if (it == null) return "";
    if (typeof it === "object") return String(it.item || it.text || it.description || it.detail || it.name || it.value || it.service || JSON.stringify(it));
    return String(it);
  }).map(s => s.trim()).filter(Boolean);
}
// A genuine MODIFICATION only: drop the header line, factory options, protective/convenience add-ons
// (PPF, ceramic, tint, radar detector, dash cam, alarm, nose lift, floor mats, battery tender) and
// factory equipment (magneride, rear-wheel steering, cameras, power seats, hardtop). What remains is
// real: engine, exhaust, tune, suspension, aftermarket wheels, body kits, appearance wraps, swaps.
function stRealMods(v) { const a = stParseList(v); if (a == null) return null; return a.filter(s => !ST_MOD_HEADER.test(s) && !ST_FACTORY_OPTION.test(s) && !ST_CONVENIENCE.test(s) && !ST_FACTORY_EQUIP.test(s) && !ST_REVERSIBLE.test(s)); }
function stTxClass(txText, mods) {
  const t = String(txText || "").toLowerCase();
  if (ST_CONVERSION.test(t) || (mods && mods.some(s => ST_CONVERSION.test(s)))) return "conversion";
  const man = /\bmanual\b|\bstick\b|\bmt\b|\bm\/t\b|\bmanuel\b/.test(t);
  const auto = /\bautomatic\b|\bauto\b|\ba\/t\b|\bpdk\b|\bdct\b|\bdsg\b|tiptronic|sequential|paddle|\bslushbox\b|dual[- ]?clutch/.test(t);
  if (man && !auto) return "manual";
  if (auto && !man) return "automatic";
  return "unknown";
}
// Most recent 4-digit year mentioned in a service item (items are usually free text like
// "Serviced in 2023: ..."). Used only to test "within 2 years of the sale".
function stItemYear(s) { const m = String(s).match(/\b(19|20)\d{2}\b/g); if (!m) return null; return Math.max(...m.map(Number)); }
// Years found across a recent_service_history value, robust to string OR object items (an object may
// carry the date in date/service_date/performed_at/year and the year may also be embedded in text).
function stServiceYears(v) {
  if (v == null) return [];
  let arr = v;
  if (typeof v === "string") { const t = v.trim(); if (!t || t === "null") return []; try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : [p]; } catch (_) { arr = t.split(/\r?\n|;/); } }
  if (!Array.isArray(arr)) arr = [arr];
  const yrs = [];
  for (const it of arr) {
    if (it == null) continue;
    let text = typeof it === "object" ? [it.date, it.service_date, it.performed_at, it.year, it.item, it.text, it.description, it.detail, it.service].filter(x => x != null).join(" ") : String(it);
    const y = stItemYear(text); if (y) yrs.push(y);
  }
  return yrs;
}
export function samsTake(solid) {
  try {
    const rows = (solid || []).filter(r => Number.isFinite(r._usd) && r._usd > 0);
    // Attribute presence per row (as-listed snapshot fields).
    const attr = r => {
      const mileage = Number(r.mileage) > 0 ? Number(r.mileage) : null;
      const mods = stRealMods(r.mods);                       // null = no modifications field at all
      const tx = stTxClass(r.transmission, mods);           // manual | automatic | conversion | unknown
      const flaws = stParseList(r.flaws);                   // null = no known_flaws field
      const svc = stParseList(r.svc);                       // null = no recent_service_history field
      const has = mileage != null || tx !== "unknown" || flaws != null || svc != null || mods != null;
      return { mileage, tx, mods, flaws, svc, has };
    };
    const tagged = rows.map(r => ({ r, a: attr(r) }));
    // (d) Sales with NO listing detail (house sales, mostly) stay in the range but are left out of
    // the comparison. Count them and, if they are all houses, say so.
    const noData = tagged.filter(t => !t.a.has);
    const excluded = noData.length;
    const excludedAllHouse = excluded > 0 && noData.every(t => isHouseSource(t.r.source));
    const comparable = tagged.filter(t => t.a.has);
    if (comparable.length < ST_MIN_PER_SIDE * 2) return null;   // too thin to split into two real halves
    // (a) Split by hammer price into a weaker (lower) and a stronger (upper) half. Odd count drops
    // the single median sale so both halves are clean and equal.
    comparable.sort((x, y) => x.r._usd - y.r._usd);
    const n = comparable.length, mid = Math.floor(n / 2);
    const weaker = comparable.slice(0, mid), stronger = comparable.slice(n - mid);
    const S = stronger.map(t => t.a), W = weaker.map(t => t.a);

    const out = { ok: true, poolN: n, excluded, excludedLabel: excludedAllHouse ? "house sales" : "sales", strongerN: stronger.length, weakerN: weaker.length, attributes: {}, separated: [], notSeparated: [], conversions: { stronger: S.filter(a => a.tx === "conversion").length, weaker: W.filter(a => a.tx === "conversion").length } };

    // (b) mileage: median of present values (ignore 0 and null). (c) >=25% apart.
    {
      const sv = S.map(a => a.mileage).filter(v => v > 0), wv = W.map(a => a.mileage).filter(v => v > 0);
      if (sv.length >= ST_MIN_PER_SIDE && wv.length >= ST_MIN_PER_SIDE) {
        const ms = stMedian(sv), mw = stMedian(wv);
        const sep = Math.abs(ms - mw) / Math.max(1, Math.min(ms, mw)) >= ST_MILEAGE_REL;
        out.attributes.mileage = { compared: true, present: { stronger: sv.length, weaker: wv.length }, strongerMedian: Math.round(ms), weakerMedian: Math.round(mw), separated: sep };
        if (sep) out.separated.push("mileage");
        else out.notSeparated.push("mileage");
      } else out.attributes.mileage = { compared: false };
    }
    // (b) transmission: share manual among {manual, automatic} (conversions excluded, labelled). (c) >=20 pts.
    {
      const sBase = S.filter(a => a.tx === "manual" || a.tx === "automatic"), wBase = W.filter(a => a.tx === "manual" || a.tx === "automatic");
      if (sBase.length >= ST_MIN_PER_SIDE && wBase.length >= ST_MIN_PER_SIDE) {
        const ss = sBase.filter(a => a.tx === "manual").length / sBase.length, ws = wBase.filter(a => a.tx === "manual").length / wBase.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.transmission = { compared: true, present: { stronger: sBase.length, weaker: wBase.length }, strongerManualShare: Math.round(ss * 100), weakerManualShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("transmission");
        else out.notSeparated.push("transmission");
      } else out.attributes.transmission = { compared: false };
    }
    // (b) known_flaws: median item count. (c) >=2 apart.
    {
      const sc = S.filter(a => a.flaws != null).map(a => a.flaws.length), wc = W.filter(a => a.flaws != null).map(a => a.flaws.length);
      if (sc.length >= ST_MIN_PER_SIDE && wc.length >= ST_MIN_PER_SIDE) {
        const ms = stMedian(sc), mw = stMedian(wc);
        const sep = Math.abs(ms - mw) >= ST_FLAW_ABS;
        out.attributes.flaws = { compared: true, present: { stronger: sc.length, weaker: wc.length }, strongerMedian: ms, weakerMedian: mw, separated: sep };
        if (sep) out.separated.push("flaws");
        else out.notSeparated.push("flaws");
      } else out.attributes.flaws = { compared: false };
    }
    // (b) recent_service_history: share with an item dated within 2 years of the sale. (c) >=20 pts.
    {
      const withYear = t => { const yrs = stServiceYears(t.r.svc); if (!yrs.length) return null; const saleYr = Number(String(t.r.auction_end_date || "").slice(0, 4)); if (!saleYr) return null; const mostRecent = Math.max(...yrs); return (saleYr - mostRecent) <= 2 && mostRecent <= saleYr; };
      const sVals = stronger.map(withYear).filter(v => v !== null), wVals = weaker.map(withYear).filter(v => v !== null);
      if (sVals.length >= ST_MIN_PER_SIDE && wVals.length >= ST_MIN_PER_SIDE) {
        const ss = sVals.filter(Boolean).length / sVals.length, ws = wVals.filter(Boolean).length / wVals.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.service = { compared: true, present: { stronger: sVals.length, weaker: wVals.length }, strongerShare: Math.round(ss * 100), weakerShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("service");
        else out.notSeparated.push("service");
      } else out.attributes.service = { compared: false };
    }
    // (b) modifications: share with any real modification (header lines stripped). (c) >=20 pts.
    {
      const sBase = S.filter(a => a.mods != null), wBase = W.filter(a => a.mods != null);
      if (sBase.length >= ST_MIN_PER_SIDE && wBase.length >= ST_MIN_PER_SIDE) {
        const ss = sBase.filter(a => a.mods.length > 0).length / sBase.length, ws = wBase.filter(a => a.mods.length > 0).length / wBase.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.modifications = { compared: true, present: { stronger: sBase.length, weaker: wBase.length }, strongerShare: Math.round(ss * 100), weakerShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("modifications");
        else out.notSeparated.push("modifications");
      } else out.attributes.modifications = { compared: false };
    }

    const anyCompared = Object.values(out.attributes).some(a => a.compared);
    if (!anyCompared) return null;   // (e) too thin to compare on anything -> return nothing

    // (e) PLAIN pattern sentence(s): the top one or two separating attributes, each a self-contained
    // "higher half ... lower half" clause (pattern, never cause). At most two, so the hard <=2 sentence
    // / <=30 word cap in enforceSamsTake is met without compaction; a third would be dropped there. No
    // "what separated the stronger sales" framing (it read awkwardly and doubled "stronger"/"sales").
    let sentence;
    if (out.separated.length) {
      const plain = out.separated.map(k => stPlainClause(k, out.attributes)).filter(Boolean);
      sentence = (plain.slice(0, 2).join(" ") || "").trim();
    } else {
      sentence = "Nothing cleanly separated the higher and lower halves of sales on the listing details.";
    }
    out.sentence = sentence;
    return out;
  } catch (e) { return null; }
}

// Sam's Take copy discipline (Part 3 item 6), enforced in CODE, never trusted to the writer:
//  - at most TWO sentences and THIRTY words;
//  - a banned-word lint (valuation / causal / predictive language);
//  - a compact rebuild from the strongest SEPARATING clause so the sentence fits the cap instead of
//    being dropped for length.
// Returns { ok, sentence, reason }. On any failure the caller drops the Take and logs the reason.
const ST_BANNED = /\b(because|due to|drives?|will|should|expect(?:s|ed)?|likely|worth)\b/i;
function stWordCount(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
function stSentenceCount(s) { return (String(s || "").match(/[.!?]+(?=\s|$)/g) || []).length; }
// PLAIN Take clause per attribute (Part 3 copy fix): one self-contained sentence comparing the HIGHER
// half of sales (by price) with the LOWER half, stated as a pattern, never a cause. Reads off the
// attributes object (shares are 0-100 integers; medians already rounded). The old "the stronger half
// showed X against Y" wording repeated "stronger"/"sales" and read awkwardly; this is the one source
// of truth for every Take template, used by both the full sentence and the compact rebuild so they
// can never diverge again.
const ST_NUMWORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const stNum = n => (n >= 0 && n <= 10 ? ST_NUMWORD[n] : String(n));
function stPlainClause(key, a) {
  if (!a) return null;
  const r1k = v => Math.round(v / 1000) * 1000;
  const inTen = share => Math.round(share / 10);     // shares arrive as 0-100 integers
  if (key === "mileage" && a.mileage) return `The higher half of sales had around ${r1k(a.mileage.strongerMedian).toLocaleString("en-US")} miles; the lower half around ${r1k(a.mileage.weakerMedian).toLocaleString("en-US")}.`;
  if (key === "transmission" && a.transmission) return `The higher half were ${inTen(a.transmission.strongerManualShare)} in 10 manual; the lower half ${inTen(a.transmission.weakerManualShare)} in 10.`;
  // Flaws must keep their NOUN: "averaged one" alone drops it. The noun ("reported issue(s)") is named
  // once, on whichever side carries a count; a zero side reads "had no reported issues" / "had none".
  if (key === "flaws" && a.flaws) {
    const s = a.flaws.strongerMedian, w = a.flaws.weakerMedian;
    const noun = n => `reported issue${n === 1 ? "" : "s"}`;
    if (s === 0 && w === 0) return null;
    if (s === 0) return `The higher half had no reported issues; the lower half averaged ${stNum(w)} ${noun(w)}.`;
    if (w === 0) return `The higher half averaged ${stNum(s)} ${noun(s)}; the lower half had none.`;
    return `The higher half averaged ${stNum(s)} ${noun(s)}; the lower half ${stNum(w)}.`;
  }
  if (key === "service" && a.service) return `The higher half had a recent service record ${inTen(a.service.strongerShare)} in 10; the lower half ${inTen(a.service.weakerShare)} in 10.`;
  // Modifications in PLAIN words (bug 2), never "0 in 10": lead with the side that was modified more.
  // "Most of the lower sales had been modified; none of the higher ones had." Shares are 0-100.
  if (key === "modifications" && a.modifications) {
    const desc = p => p >= 88 ? "all" : p >= 55 ? "most" : p >= 33 ? "about half" : p >= 12 ? "some" : "none";
    const hi = a.modifications.strongerShare, lo = a.modifications.weakerShare;
    const hiMore = hi >= lo;
    const s1 = hiMore ? "higher" : "lower", d1 = desc(hiMore ? hi : lo);
    const s2 = hiMore ? "lower" : "higher", d2 = desc(hiMore ? lo : hi);
    return `${d1.charAt(0).toUpperCase() + d1.slice(1)} of the ${s1} sales had been modified; ${d2} of the ${s2} ones had.`;
  }
  return null;
}
function enforceSamsTake(raw) {
  if (!raw || !raw.sentence) return { ok: false, reason: "no take produced" };
  // Prefer the already-assembled sentence; if it blows the cap, rebuild to the strongest clause.
  let sentence = String(raw.sentence).trim();
  if (stWordCount(sentence) > 30 || stSentenceCount(sentence) > 2) {
    const clause = stPlainClause((raw.separated || [])[0], raw.attributes || {});
    if (!clause) return { ok: false, reason: "no separating pattern to compact to" };
    sentence = clause;
  }
  if (stWordCount(sentence) > 30) return { ok: false, reason: "take exceeds 30 words" };
  if (stSentenceCount(sentence) > 2) return { ok: false, reason: "take exceeds two sentences" };
  const m = sentence.match(ST_BANNED);
  if (m) return { ok: false, reason: `banned word "${m[0].toLowerCase()}"` };
  return { ok: true, sentence };
}

function buildResult(chosen, base, iso, spec, refine) {
  // $2,500 CAR FLOOR (Part 3), enforced here too as a hard backstop: a sub-floor hammer is a part,
  // memorabilia or data error, never a car, so it is dropped from the pool, the range and the cards
  // regardless of whether upstream classification already excluded it (a $265 "300SL" can never
  // reach a surface). Individual CARD prices above the floor are still shown raw, never rounded.
  let rows = [...chosen.rows].filter(r => Number.isFinite(r._usd) && r._usd >= DISPLAY_FLOOR);
  // Inline refinement (the earned question answered): narrow by mileage band and/or transmission.
  const refined = !!(refine && (refine.miMin != null || refine.tx || refine.variant || refine.driver || refine.observe));
  let observeAside = null;
  if (refined) {
    if (refine.miMin != null) {
      const inBand = rows.filter(r => { const m = miOf(r); return m > 0 && m >= refine.miMin && (refine.miMax == null || m < refine.miMax); });
      // MILEAGE NEAREST-SALES FALLBACK (Part 3): a mileage band too thin to stand on its own never
      // dead-ends. Instead of an empty pool, show the real sales NEAREST that mileage - this changes
      // WHICH sales are shown, never a number. The honest flag drives the copy ("the closest sales by
      // mileage"), so it never reads as an exact-band match it isn't.
      // Part 3 item 4: FEWER THAN 3 sales in the given mileage band -> show the 3 NEAREST in mileage,
      // labelled "Nearest in miles". 3+ in band stand on their own. This changes WHICH sales are
      // shown, never a number.
      const MILE_BAND_MIN = 3;
      if (inBand.length >= MILE_BAND_MIN) {
        rows = inBand;
      } else {
        const target = refine.miTarget != null ? refine.miTarget
          : (refine.miMax != null ? Math.round((refine.miMin + refine.miMax) / 2) : refine.miMin);
        const withMi = rows.filter(r => miOf(r) > 0).sort((a, b) => Math.abs(miOf(a) - target) - Math.abs(miOf(b) - target));
        rows = withMi.slice(0, Math.max(MILE_BAND_MIN, inBand.length));
        base.mileageFallback = { target, n: rows.length, inBand: inBand.length, label: "Nearest in miles" };
      }
    }
    // Gearbox refine (Part 1 Rule 2): classify by title+transmission (F1/PDK/SMG = auto), so a
    // Ferrari F1 or a Porsche PDK is caught even when the transmission field is bare.
    if (refine.tx === "manual") rows = rows.filter(r => gearboxType(r) === "manual");
    if (refine.tx === "auto") rows = rows.filter(r => gearboxType(r) === "auto");
    // Competition-variant refine (Part 1 change 1): the askable variant in or out of the range.
    if (refine.variant === "competition") rows = rows.filter(r => r._askable);
    if (refine.variant === "standard") rows = rows.filter(r => !r._askable);
    // Dictionary driver (item 7/8): narrow to the listings that carry (or do not carry) the mined
    // title flag. Framed "listed as" in the copy since it is read off the title, not inspected.
    if (refine.driver) { const drv = driverByKey(base.vehicle, refine.driver); if (drv) rows = rows.filter(r => refine.driverVal === "no" ? !drv.re.test(dtext(r)) : drv.re.test(dtext(r))); }
    // Observable-fact refinement (item 9): hold the flagged cars OUT of the main band and report
    // THEIR own range as an aside. Never adjusts a price; the main band becomes "cars that didn't".
    if (refine.observe && OBSERVE_FLAGS[refine.observe]) {
      const det = OBSERVE_FLAGS[refine.observe];
      const fu = rows.filter(r => det.re.test(obText(r))).map(r => r._usd).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      if (fu.length) observeAside = { key: refine.observe, label: det.label, lo: roundFloor(fu[0]), hi: roundCeil(fu[fu.length - 1]), n: fu.length };
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
  // Fix 5: for a COVERED model the Rule 5 guard has already removed wrong cars and year-gated the
  // pool, so every remaining non-tagged sale is a real same-model car and belongs IN the range -
  // a price/mileage outlier is NOT a variant. Aside = only the guard-tagged variants (r._tag);
  // everything else is solid. Uncovered models keep the r4Split price fence (no guard to trust).
  let solid, aside;
  if (mrRulesFor(spec.make, spec.model)) {
    aside = window.filter(r => r._tag);
    solid = window.filter(r => !r._tag);
  } else {
    ({ solid, aside } = r4Split(window, keepAll));
  }
  // PROVENANCE SET-ASIDE (Part 3 bug 3): pull ex-celebrity / works / press / show cars OUT of the
  // solid pool on EVERY path, so they never sit in the typical range or the side cards. Tagged so the
  // "Shown separately" group can carry them; their value traces to provenance, not the market.
  const prov = solid.filter(isProvenance);
  if (prov.length) { prov.forEach(r => { if (!r._tag) r._tag = "provenance"; }); solid = solid.filter(r => !isProvenance(r)); aside = aside.concat(prov); }
  // ENGINE SWAP (set aside like a restomod): a non-factory engine car never sits in the range or side
  // cards. Covers uncovered models (r4Split); covered models are already tagged by rule5PoolGuard.
  const swapped = solid.filter(isEngineSwap);
  if (swapped.length) { swapped.forEach(r => { if (!r._tag) r._tag = "engine swap"; }); solid = solid.filter(r => !isEngineSwap(r)); aside = aside.concat(swapped); }
  // MODEL-SPECIFIC HALOS (bug 6): set aside alloy-body / race 300SLs so the steel Gullwing pool reads
  // as one market instead of "too spread out". Make+model scoped; never fires for other cars.
  const mhRe = modelHaloReFor(spec.make, spec.model);
  if (mhRe) { const mh = solid.filter(r => mhRe.test(titleOf(r)) || mhRe.test(String(r.rtitle || ""))); if (mh.length) { mh.forEach(r => { if (!r._tag) r._tag = "halo"; }); solid = solid.filter(r => !(mhRe.test(titleOf(r)) || mhRe.test(String(r.rtitle || "")))); aside = aside.concat(mh); } }
  // RANGE LADDER floor (Part 3): 3+ qualified sales render the thin "here are the sales" state (no
  // range); 1-2 fall to the single-sale / thin-mode return below; 0 is the not-tracked return. The
  // old floor was 4, which sent a 3-sale pool to refusal - the ladder now keeps it as an honest thin
  // result listing the three sales.
  const THIN = 3;
  // A swapped or provenance car is NEVER shown as an example of the model anywhere, including a
  // refusal's "what has sold" list (the Land Rover Defender varied-refusal leaked LS/V8-swapped cars).
  // Halos (genuine pricier variants) still show - they ARE the model.
  const refusalRows = rows.filter(r => !isEngineSwap(r) && !isProvenance(r));
  if (chosen.step === "thin" || solid.length < THIN) {
    return { ...b, tier: "refusal", ladderStep: "thin", refusal: { kind: "thin", model: spec.subject }, cards: shapeCards(refusalRows) };
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
    return { ...b, tier: "refusal", ladderStep: "varied", refusal: { kind: "varied", model: spec.subject, variants: variantTokens(refusalRows).slice(0, 6), yearSpanPhrase }, cards: shapeCards(refusalRows) };
  }
  // RANGE LADDER bucket (Part 3), by qualified pool size: 16+ cluster, 8-15 band, 3-7 thin.
  // For the thin band, ALL the sales are shown (the state lists them), and `olderOutside` reports how
  // many of them predate the recent twelve-month window, with the years - the raw material for the
  // "14 more sold in 2023 and 2024" count line. The pool is NOT re-scoped here (every sale stays
  // visible in the cards); the recent-window split is a render decision the surface makes from this
  // field. Only emitted for the thin tier, where it is meaningful.
  const rangeTier = rangeTierForCount(solid.length);
  let olderOutside = null;
  if (rangeTier === "thin" && !refined) {
    const older = solid.filter(r => String(r.auction_end_date || "").slice(0, 10) < winIso);
    const inWin = solid.length - older.length;
    if (older.length && inWin >= 1) {
      const yrs = [...new Set(older.map(r => Number(String(r.auction_end_date || "").slice(0, 4))).filter(Boolean))].sort((x, y) => x - y);
      olderOutside = { n: older.length, years: yrs, recentN: inWin };
    }
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

  // MILEAGE NEAREST (Part 3 item 4, up-front case): when the INPUT gave a mileage and fewer than 3
  // sales sit in its band, surface the 3 nearest in mileage as a labelled set so a mileage-specific
  // read never dead-ends. The refine-chip case is handled above (base.mileageFallback); this covers a
  // mileage typed with the original query. Never adjusts a number, only which sales are shown.
  let nearestInMiles = null;
  if (!refined && Number(base.subjectMileage) > 0) {
    const target = Number(base.subjectMileage);
    const withMi = solid.filter(r => miOf(r) > 0);
    const bucket = (buckets || []).find(bk => target >= bk.min && (bk.max == null || target < bk.max));
    const inBand = bucket
      ? withMi.filter(r => { const m = miOf(r); return m >= bucket.min && (bucket.max == null || m < bucket.max); })
      : withMi.filter(r => Math.abs(miOf(r) - target) <= target * 0.25);
    if (inBand.length < 3 && withMi.length >= 3) {
      const nearest = withMi.slice().sort((a, z) => Math.abs(miOf(a) - target) - Math.abs(miOf(z) - target)).slice(0, 3);
      nearestInMiles = { target, label: "Nearest in miles", inBand: inBand.length, cards: shapeCards(nearest) };
    }
  }

  // TRIMS COVERED (Part 3): when the shown pool spans more than one trim, name them so Lane C's eyebrow
  // can read "992 Carrera S and T Coupes". Mutates the shared resolvedCar object (carried on the result).
  const covered = detectSubTrims(solid, spec.make, spec.model);
  if (base.resolvedCar) base.resolvedCar.trimsCovered = covered.length > 1 ? covered : null;

  // SAM'S TAKE (Part 3 items 1 + 6): renders ONLY at the cluster tier (16+). 8-15 is count-forward
  // with no Take, and the stronger-vs-weaker split needs two 8-sale halves anyway. The sentence is
  // held to <=2 sentences / <=30 words with a banned-word lint; a Take that fails is dropped and the
  // reason logged in samsTakeSkipReason (telemetry, never rendered).
  let samsTakeOut = null, samsTakeSkipReason = null;
  if (rangeTier === "cluster") {
    const raw = samsTake(solid);
    if (!raw) samsTakeSkipReason = "no separating pattern cleared the thresholds";
    else { const chk = enforceSamsTake(raw); if (chk.ok) samsTakeOut = { ...raw, sentence: chk.sentence }; else samsTakeSkipReason = chk.reason; }
  } else {
    samsTakeSkipReason = `pool tier ${rangeTier} below the 16-sale cluster tier`;
  }

  return {
    ...b, tier: "result", ladderStep: chosen.step, widening: chosen.widening || null,
    // Item 4: the gearbox line shows on a card only when the gearbox question applies (pool has both a
    // manual and a non-manual box); an all-manual car (Cobra) never shows "Manual" on its hero.
    gearboxApplies: !!(base && base.gearboxApplies),
    // Capped third splits (Part 3 question cap): rendered as lines in the result, not asked.
    inlineSplits: (base && base.inlineSplits && base.inlineSplits.length) ? base.inlineSplits : null,
    // Mileage nearest-sales fallback (Part 3): set when a too-thin mileage band fell back to the
    // closest sales by mileage, so the copy says so honestly instead of claiming an exact band.
    mileageFallback: (base && base.mileageFallback) || null,
    // Up-front mileage nearest set (item 4): the 3 nearest-in-mileage sales when the input gave a
    // mileage and its band held fewer than 3. Null on the normal path.
    nearestInMiles,
    poolTrim: exactStep ? (spec.trim || null) : null,
    poolYears: poolYrs.length ? [Math.min(...poolYrs), Math.max(...poolYrs)] : null,
    // RANGE LADDER (Part 3): the bucket this pool landed in, read the same way by every surface.
    //   cluster (16+): cluster band + Sam's Take | band (8-15): middle-half band, count-forward |
    //   thin (3-7): the sales themselves, NO range. `olderOutside` carries the count of older sales
    // held out of a recent-scoped thin view, for the "N more sold in 2023 and 2024" line.
    rangeTier, olderOutside,
    // span (the min-to-max "everything from X to Y has sold" figure) is SUPPRESSED on the thin tier:
    // 3-7 sales get no range of any kind (Part 3 item 1). cluster stays the typical-band carrier.
    span: (rangeTier === "thin" || rangeTier === "single" || rangeTier === "none") ? null : span,
    cluster, direction, driver, divergence,
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
    // Sam's Take (v1): stronger-vs-weaker-half pattern read on the sales behind the range. Null when
    // too thin; the frontend renders the section only when a sentence comes back. Snapshot attributes
    // are worded "as listed at the time of sale". Only meaningful once a real band stands (8+ solid).
    samsTake: samsTakeOut, samsTakeSkipReason,
    // "Shown separately" is ONLY the Rule 5 tagged VARIANTS (CSL, Heritage, Scuderia, restomod,
    // year-mismatch...), never a price/mileage outlier (fix 5: mileage is not a variant - a high-mile
    // car stays in the range). asideCards keeps the full aside for internal use; taggedCards is what
    // the "Shown separately" group renders.
    cards: shapeCards(solid), asideCards: shapeCards(aside), taggedCards: shapeCards(aside.filter(r => r._tag))
  };
}

export async function runOneBox(vehicle, generation, searchText, env, refine) {
  try { await ensureFxReady(env); } catch (e) {}   // item 1: arm sale-date FX for every conversion downstream
  const spec = buildSpec(vehicle, generation, searchText);
  // Ambiguous bare "Blazer" (1983-1994, no full-size/compact clue): ask K5 vs S-10 rather than guess.
  // Reuses the generation_choice shape (chips re-query the explicit model), so no frontend change.
  if (spec.blazerAsk) {
    const yr = spec.year ? spec.year + " " : "";
    return {
      tier: "generation_choice", askIndex: (Number(env && env.asked) || 0) + 1,
      resolvedCar: { year: spec.year || null, make: "Chevrolet", model: "Blazer", trim: "", genCode: null, badge: null, bodyStyle: null, transmission: null, familyLabel: "Blazer" },
      resolvedSpec: spec.resolvedSpec || null,
      prompt: `A ${spec.year || ""} Chevrolet Blazer came as the full-size K5 and the compact S-10, which price very differently. Which is it?`.replace(/\s+/g, " ").trim(),
      generationOptions: [
        { label: "K5 Blazer (full-size)", query: `${yr}Chevrolet K5 Blazer` },
        { label: "S-10 Blazer (compact)", query: `${yr}Chevrolet S-10 Blazer` }
      ]
    };
  }
  // TRANSMISSION NAMED IN THE QUERY (Part 3 item 1): when the cold query itself names a gearbox
  // ("992 Carrera S manual"), treat it exactly like the answered gearbox refine - skip the gearbox
  // question and scope the pool to that box - instead of re-asking what the seller already told us.
  // The resolver does not lift a transmission word, so detect it here from the raw/search text. A
  // standalone token only (word-bounded), so a model/trim is never mistaken for a gearbox.
  if (!refine || !refine.tx) {
    const txText = `${searchText || ""} ${(vehicle && (vehicle.raw || vehicle.canonicalLabel || vehicle.displayName)) || ""}`;
    if (/\b(manual|stick|gated|\dmt)\b/i.test(txText) && !/\bautomatic\b|\bpdk\b|\bdct\b|tiptronic/i.test(txText)) refine = { ...(refine || {}), tx: "manual", label: "Manual" };
    else if (/\b(pdk|automatic|tiptronic|\bdct\b)\b/i.test(txText)) refine = { ...(refine || {}), tx: "auto", label: /\bpdk\b/i.test(txText) ? "PDK" : "Automatic" };
  }
  // BASE TRIM + MANUAL (bug 2 interaction): a PDK-only base trim (992 Carrera) asked with a manual
  // widens to the manual-capable sibling trims (Carrera S / T) instead of an empty base pool - the
  // honest "the manual Carreras are the S and T" answer. trimsCovered then names them in the eyebrow.
  if (refine && refine.tx === "manual" && spec.subTrimNoManualBase) {
    spec.subTrimInclude = /\bcarrera\s*4?\s*s\b|\bcarrera\s*t\b/i;
    spec.subTrimExclude = null; spec.subTrimName = null;
  }
  // YEAR PINS THE GENERATION (bug 1): whenever a year is given AND a generation is resolved (here, or
  // bound in buildSpec), the year pinned it - so the body/gearbox asks are skipped and the query goes
  // straight to a result. (The generation gate only sets this when IT binds; buildSpec may bind first.)
  // GENERATION BY YEAR AND TRIM (bug 1): correct a year-only generation binding when the named trim
  // crosses generations at a different year than the base car - a 2005 911 Turbo S is a 996, not a 997.
  // Re-scope genCode + the year window to the trim-specific generation, so the pool is that generation's
  // trim only (no 2011 997s in a 996 Turbo S read). Runs before resolvedCar so the label is correct too.
  {
    const mr = mrRulesFor(spec.make, spec.model);
    if (mr && spec.trim && spec.year) {
      const g = mrGenForTrimYear(mr, spec.trim, spec.year);
      if (g && g.code) { spec.genCode = g.code; spec.yearMin = g.yearStart; spec.yearMax = g.yearEnd; spec.genBound = true; }
    }
  }
  // BODY-SPECIFIC GENERATION CODE (bug 2): findGeneration ran before buildSpec detected the body, so map
  // the generation to its body code now (2008 M3 sedan -> E90, coupe -> E92, convertible -> E93).
  if (spec.genCode && spec.bodyStyle) spec.genCode = mrBodyGenCode(spec.make, spec.model, spec.genCode, spec.bodyStyle);
  if (spec.year && spec.genCode) spec.genPinnedByYear = true;
  const now = Date.now();
  const iso = days => new Date(now - days * DAY).toISOString();
  const subject = { mileage: vehicle.mileage };   // seller-provided subject mileage (usually absent)
  const ingestDate = await oneBoxIngestDate(env);  // S2-2: freshest online sale, the "ingest current?" signal
  // Resolved-car confirmation line (STEP 3): plain restatement, first thing rendered on
  // EVERY path, so "did it understand my car" is answered before any price appears.
  // 964 OWNERS CALL THE REAR-DRIVE CAR "Carrera 2" (the 964 was sold as Carrera 2 / Carrera 4 to name
  // the driveline; later generations dropped the "2"). Show "Carrera 2" for a 964 base Carrera so the
  // spec label matches what owners say; the pool is already fenced away from the Carrera 4.
  const dispTrim = (String(spec.genCode || "") === "964" && /^carrera(\s*2)?$/i.test(String(spec.trim || "").trim())) ? "Carrera 2" : spec.trim;
  const resolvedCar = {
    year: spec.year, make: spec.make, model: spec.model, trim: dispTrim,
    genCode: spec.genCode || null,   // so the cluster/since lead can name the generation ("E30 M3")
    badge: spec.badge || null,       // a performance badge (S65, M4) names the car itself; the body is redundant ("Most S65s", not "Most S65 sedans")
    // spec.bodyStyle drives pool SCOPING (the detectBodyStyle vocabulary). For DISPLAY (the resolved-car
    // line, the headline, the recent-search chip) fall back to the resolver's Sportbrake so the word a
    // buyer named is not silently dropped from the label ("XF Sportbrake", not "XF"). Scoped to
    // Sportbrake on purpose: it is a distinct model variant the model keyword already scopes the fetch
    // to, so the label and pool agree. A generic body word (hardtop) is NOT surfaced this way - it
    // would not scope the pool and the label would then over-claim.
    bodyStyle: spec.bodyStyle || (/sportbrake/i.test(vehicle.bodyStyle || "") ? "sportbrake" : null),
    transmission: vehicle.transmission || null,
    // FAMILY LABEL (Part 3 item 3): names the pool's family for the freshness line, so it reads "Latest
    // 992 Carrera sale" rather than the bare make-line model "Latest 911 sale". genCode + the resolved
    // trim (or the model when no trim). The frontend freshLine should read familyLabel || model.
    // genCode + trim/model, but DON'T double the word when the genCode already carries it ("3.2 Carrera"
    // + trim "Carrera" -> "3.2 Carrera", not "3.2 Carrera Carrera"; "911SC" + model "911" -> "911SC").
    familyLabel: (function () {
      const gc = spec.genCode ? String(spec.genCode).trim() : "";
      const noun = (dispTrim && String(dispTrim).trim()) ? String(dispTrim).trim() : String(spec.model || "");
      if (gc && noun && new RegExp(noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(gc)) return gc;   // genCode already names it
      return [gc, noun].filter(Boolean).join(" ").trim() || spec.model;
    })()
  };
  const diag = {};
  // QUESTION CAP (Part 3): One Box asks at most TWO questions before a result. `asked` is the running
  // count threaded from the frontend across every chip answer (generation, body, gearbox, Competition).
  // A would-be THIRD split (gearbox / Competition) is not asked - it renders inside the result as two
  // short lines instead (base.inlineSplits). Disambiguation (generation / body) still asks, since no
  // answer can form without it, but it counts toward the two.
  const asked = Math.max(0, Math.min(9, (env && Number(env.asked)) || 0));
  const askCapped = asked >= 2;
  // TWO-QUESTION CAP (Part 3 item 5): once two clarifying questions have been asked, NO third is
  // asked - a would-be third generation/body disambiguation is skipped and the engine answers on the
  // broader family instead, stating what that family covers. familyCoverageNote carries that honest
  // "I widened to the whole {model}" line through to the result (flows via base -> b -> result).
  let familyCoverageNote = null;

  // MODEL FAMILY clarify (item 3): a nameplate with more than one family and NO family named ("Shelby
  // Cobra" or a non-family token like "Shelby Cobra 42") is genuinely several markets. Ask which family
  // with the real choices (289 or 427) instead of pooling every Cobra. One question; chips carry a full
  // re-runnable query. Halo (Daytona) and continuation (CSX) are reached by naming them, not offered.
  if (spec.familyAmbiguous && !askCapped) {
    const g = modelFamilyGroup(spec.make, spec.model);
    if (g) {
      const yearPfx = spec.year ? spec.year + " " : "";
      const asks = (g.askFamilies || []).map(nm => g.families.find(x => x.name === nm)).filter(Boolean);
      const options = asks.map(f => ({ label: f.chip || f.label, query: `${yearPfx}${spec.make} ${spec.model} ${f.chip || f.name}` }));
      const names = asks.map(f => f.chip || f.label);
      const prompt = `The ${g.canonical || spec.model} came as very different cars that price worlds apart. Which is it, the ${names.join(" or the ")}?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
  }

  // GENERATION clarification FIRST (#4): a bare, year-less, trim-less multi-generation nameplate
  // ("911", "Corvette", "Mustang") is genuinely several markets - ASK which generation with
  // year-resolvable chips rather than pooling 1965-2024 into one refusal. Runs before the body
  // ask (generation is the bigger axis) and spares the whole-nameplate fetch. A chassis-code
  // model ("997"), or any year/trim query, skips this and scopes normally.
  // GENERATION GATE (Part 1 Rule 1/3): a curated model consults modelRules - offer only the
  // generations that actually had the resolved body/trim, with UPPERCASE codes and US chip years,
  // in a sentence-case prompt. When a body/trim narrows it to ONE generation, bind that generation
  // silently (so "S-Class Coupe" scopes to the W222 coupe without asking). Uncovered models keep the
  // existing generations.js path verbatim (fallback = today).
  const mrRule = mrRulesFor(spec.make, spec.model);
  if (mrRule && !spec.yearRange && !spec.genCode) {
    let gens = mrRule.generations || [];
    if (spec.bodyStyle) gens = mrGensFor(mrRule, { body: spec.bodyStyle });
    if (spec.trim) gens = mrGensFor({ ...mrRule, generations: gens }, { trim: spec.trim });
    if (spec.year) gens = gens.filter(g => { const r = g.prodYears || g.years; return spec.year >= r[0] && spec.year <= r[1]; });
    const bodyWord = spec.bodyStyle ? " " + mrBodyLabel(mrRule, spec.bodyStyle) : "";
    // YEAR PICKS THE GENERATION (Part 3 bug 1): a year in EXACTLY ONE generation binds it silently (no
    // ask). A year that lands in an OVERLAP (two generations claim it, e.g. 1989 = G-body handover to
    // 964) or NO year still asks. So the ask fires on gens.length>=2 whether or not a year was given.
    if (gens.length >= 2 && !askCapped) {
      const name = mrCanonical(mrRule, spec.model);
      const options = gens.map(g => ({ label: `${g.code} (${g.years[0]}-${g.years[1]})`, query: `${Math.floor((g.years[0] + g.years[1]) / 2)} ${spec.make} ${spec.model}${bodyWord}` }));
      const prompt = spec.year
        ? `A ${spec.year} ${name}${bodyWord} lands on a generation change - the ${gens.map(g => g.code).join(" and ")} both claim it, and they price very differently. Which is it?`
        : `The ${name}${bodyWord} spans generations that price very differently. Which is it?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
    // Capped third ask: answer on the whole model, naming the generations it covers (item 5).
    if (gens.length >= 2 && askCapped) familyCoverageNote = `covering every generation of the ${mrCanonical(mrRule, spec.model)}${bodyWord} (${gens.map(g => g.code).join(", ")})`;
    // Single generation: bind it. genPinnedByYear = the YEAR did the pinning, so the body/gearbox asks
    // below are skipped and the query goes straight to a result (matches /sell, clears the engineCheck
    // OB-choice-vs-SELL-result rows).
    if (gens.length === 1) { spec.yearMin = gens[0].years[0]; spec.yearMax = gens[0].years[1]; spec.genCode = gens[0].code; spec.genBound = true; spec.genPinnedByYear = !!spec.year; }
  } else if (!mrRule && !spec.trim && !spec.yearRange && !spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    const matching = spec.year ? gens.filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd) : gens;
    if (matching.length >= 2 && !askCapped) {
      const options = matching.map(g => ({ label: `${g.code} (${g.yearStart}-${g.yearEnd})`, query: `${Math.floor((g.yearStart + g.yearEnd) / 2)} ${spec.make} ${spec.model}` }));
      const prompt = spec.year
        ? `A ${spec.year} ${spec.model} lands right on a generation change - the ${matching.map(g => g.code).join(" and ")} both claim it, and they price very differently. Which is it?`
        : `The ${spec.model} spans generations that price very differently. Which is it?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
    // Capped third ask: answer on the whole model, naming the generations it covers (item 5).
    if (matching.length >= 2 && askCapped) familyCoverageNote = `covering the ${matching.map(g => g.code).join(", ")} generations of the ${spec.model}`;
  }

  // RULE 8 (named body not offered by the resolved generation): a "2003 S-Class Coupe" resolves to
  // W220, which was sedan-only (its coupe is the CL). Never build a sedan/CLS range and label it a
  // coupe - say the body does not exist for this car and show the real sales unlabelled.
  if (spec.bodyStyle && mrRule && spec.genCode) {
    const gb = mrBodiesForGen(mrRule, spec.genCode);
    if (gb && gb.length && !gb.some(b => mrBodyEq(b, spec.bodyStyle))) {
      const name = mrCanonical(mrRule, spec.model);
      const bl = mrBodyLabel(mrRule, spec.bodyStyle);
      return { tier: "body_unavailable", resolvedCar, resolvedSpec: spec.resolvedSpec,
        samLine: `The ${spec.genCode} ${name} was not sold as a ${bl}. If you mean a different body or a related model, tell me which and I'll pull the right sales.` };
    }
  }
  // BODY GATE (Part 1 Rule 1/3): if the seller did not name a body, offer only bodies the resolved
  // generation/trim actually had AND that the pool contains, with the maker's own body names.
  if (!spec.bodyStyle) {
    // modelRules-allowed bodies for the resolved scope (trim locks tightest, then generation).
    let allowed = null;
    if (mrRule) {
      const trimB = spec.trim ? mrBodiesForTrim(mrRule, spec.trim) : null;
      const genB = spec.genCode ? mrBodiesForGen(mrRule, spec.genCode) : null;
      allowed = trimB || genB || null;
      // A body-locked trim/generation scopes silently, never asks (CSL -> coupe, W220 -> sedan).
      if (allowed && allowed.length === 1) { spec.bodyStyle = allowed[0]; }
    }
    if (!spec.bodyStyle) {
      const bodyProbeSpec = (spec.trim && String(spec.trim).trim() && !spec.badge) ? { ...spec, titleContains: String(spec.trim).trim() } : spec;
      const wide = await fetchQualifying(bodyProbeSpec, iso(730), env, diag);
      // Body classification for a COVERED model uses the maker's OWN body names first (Ferrari GTS ->
      // targa, Berlinetta -> coupe, Spider -> convertible; Jaguar Roadster/FHC), because classifyBody
      // only reads generic body words and a Ferrari/Jaguar body is named by the trim. A sale that
      // still names no body counts as the car's DEFAULT body (sedan for an S-Class, coupe for a 911),
      // so sedan titles ("S550") are not lost. Uncovered models keep classifyBody; a no-body sale is
      // UNSPECIFIED, never dropped. (Body fix, Oct 2026.)
      const FAM = s => { s = String(s || "").toLowerCase(); return ["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead"].includes(s) ? "convertible" : s === "targa" ? "targa" : ["coupe", "berlinetta", "fastback", "fixed head coupe", "fhc"].includes(s) ? "coupe" : ["sedan", "saloon"].includes(s) ? "sedan" : s; };
      const defBody = mrDefaultBody(mrRule, spec.genCode);
      const bn = (mrRule && mrRule.bodyNames) ? Object.entries(mrRule.bodyNames).map(([fam, label]) => [FAM(fam), new RegExp("\\b" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i")]) : null;
      const classifyFor = r => {
        const t = String(r.raw_title || r.rtitle || r.title || "");
        if (bn) { for (const [fam, re] of bn) if (re.test(t)) return fam; }
        const cb = classifyBody(r); if (cb) return FAM(cb);
        return defBody ? FAM(defBody) : null;
      };
      const counts = {}; let unspecified = 0;
      for (const r of wide) { const b = classifyFor(r); if (b) counts[b] = (counts[b] || 0) + 1; else unspecified++; }
      const bodyTotal = Object.values(counts).reduce((a, c) => a + c, 0) + unspecified;
      let present;
      if (mrRule) {
        // A covered model offers every body FAMILY its generation actually had (Rule 1) with >= an
        // ABSOLUTE floor of real sales - not a share threshold, which a dominant default body (sedan)
        // would use to wrongly suppress a real minority line (the C217 coupe / A217 cabriolet).
        // CHIP ORDER (Oct 2026): the maker's listed order (closed body first), from bodyNames keys.
        const order = Object.keys(mrRule.bodyNames || {}).map(FAM);
        present = Object.keys(counts)
          .filter(fam => counts[fam] >= 5 && (!allowed || allowed.some(a => mrBodyEq(a, fam))))
          .map(fam => ({ style: fam, n: counts[fam], label: mrBodyLabel(mrRule, fam) }))
          .sort((a, z) => { const ia = order.indexOf(a.style), iz = order.indexOf(z.style); return (ia < 0 ? 99 : ia) - (iz < 0 ? 99 : iz); });
      } else {
        // Uncovered model: counts are already keyed by FAMILY, so build one chip per family (never
        // three "Cabriolet/Convertible/Roadster" chips for the one open family). Generic body names.
        const GEN_LABEL = { convertible: "Convertible", coupe: "Coupe", targa: "Targa", sedan: "Sedan", wagon: "Wagon", truck: "Truck" };
        present = Object.keys(counts).filter(fam => counts[fam] >= Math.max(3, bodyTotal * 0.18)).map(fam => ({ style: fam, n: counts[fam], label: GEN_LABEL[fam] || fam }));
      }
      // 90% COVERAGE GATE (body fix): the offered chips must cover >=90% of the pool, else the
      // question would omit the body most owners have - skip it and proceed body-agnostic.
      const coverage = bodyTotal > 0 ? present.reduce((a, p) => a + (p.n || 0), 0) / bodyTotal : 0;
      // Capped third ask (item 5): skip the body question and read every body style, saying so.
      if (present.length >= 2 && coverage >= 0.9 && askCapped) familyCoverageNote = `covering every body style (${present.map(p => p.label).join(", ")})`;
      // Year pinned the generation AND a trim is named (bug 1): go STRAIGHT TO A RESULT, don't ask body
      // - a "2008 Carrera S" reads the generation+trim pool (both bodies) like /sell does, clearing the
      // OB-choice-vs-SELL-result engineCheck rows. trimsCovered/the band still describe what is shown.
      if (present.length >= 2 && coverage >= 0.9 && !askCapped && !(spec.genPinnedByYear && spec.trim)) {
        // Covered models keep the maker's listed order (set above); uncovered order by sales count.
        if (!mrRule) present.sort((a, z) => z.n - a.n);
        return { tier: "body_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label) };
      }
    }
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
    subjectMileage: Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Number(subject.mileage) : null,
    // Two-question cap fall-through (item 5): when a third clarify was suppressed, this states what the
    // broader-family answer covers; null on the normal path. Flows through to the rendered result.
    familyCoverageNote,
    inlineSplits: [] };   // capped third splits (gearbox / Competition) rendered as lines, not a question

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
  // setAsideHalo unless the TRIM itself is the halo: a plain trim (LP640) or base query must not let
  // a special edition (a Murcielago Versace / SV) lead its pool; a halo-trim query (GT3, SV) keeps it.
  const thin = await assessThin(famSpec, trimName, trimRe, iso, env, diag, { setAsideHalo: !trimIsHalo });
  base.htMeta = thin; // diagnostics: carried on the non-firing result/refusal too
  if (thin && thin.isThin) {
    await attachSibling(thin, spec, env);   // additive: a badge-twin pointer when the queried car is thin
    return { tier: "thin", ...base, thin, span: thin.span || undefined, refine, freshness: obFreshness(!!thin.houseSteer, obNewestDate(thin.receipts), ingestDate, now) };
  }
  // MODEL rung (item 2): the exact TRIM pool is empty, but the MODEL (all trims) may not be. Assess
  // the model with the trim dropped (halos / special editions set aside by the shared rule) BEFORE
  // ever falling to the make+decade class band. A Murcielago LP640 with no LP640 sales then reads
  // across all Murcielagos, never jumping straight to "2000s Lamborghinis".
  if (thin && thin.totalN === 0 && trimName) {
    const modelThin = await assessThin(famSpec, null, null, iso, env, diag, { setAsideHalo: true });
    if (modelThin && modelThin.isThin && modelThin.receipts && modelThin.receipts.length) {
      base.htMeta = modelThin;
      await attachSibling(modelThin, spec, env);   // additive: badge-twin pointer on the model-widened thin read too
      return { tier: "thin", ...base, thin: modelThin, span: modelThin.span || undefined, modelWidened: { fromTrim: trimName, toModel: spec.model }, refine, freshness: obFreshness(!!modelThin.houseSteer, obNewestDate(modelThin.receipts), ingestDate, now) };
    }
  }
  // CLASS-ERA rung: the exact-model pool is EMPTY over 36 months (a genuine one-off). Widen to the
  // same marque within the car's decade era band, clearly labelled as the wider market. Only when a
  // year is known (era band needs it); otherwise fall through to the normal ladder/refusal.
  if (thin && thin.totalN === 0 && spec.year) {
    const classEra = await assessClassEra(spec, env, diag);
    if (classEra && classEra.isClass && classEra.receipts.length) {
      // WIDE-BAND GUARD (better nothing than a fake number): a marque-decade class-era band can be
      // honest in COUNT but dishonest in SHAPE - a $6,755-$38,000 "typical" range built from mainstream
      // sedans standing in for a rare CLK DTM, a $127k-$986k range spanning every pre-war Bentley model.
      // high > 3x low means the band is not a real cluster; never show it as a range.
      const tooWide = classEra.lowHammer > 0 && classEra.highHammer > classEra.lowHammer * 3;
      if (!tooWide) {
        return { tier: "class_era", ...base, classEra, refine, freshness: obFreshness(true, obNewestDate(classEra.receipts), ingestDate, now) };
      }
      // Try the SAME last-resort title-keyword route Sell uses (lib/_classify.js titleKeywordPool,
      // the single shared source - never a second copy) before giving up on a real answer: every model
      // word required in the sale title, 36 months, hammer-basis USD with the house premium backed out.
      const kw = await titleKeywordPool({ make: spec.make, model: spec.model, year: spec.year, bodyStyle: spec.bodyStyle }, env, DISPLAY_FLOOR).catch(() => null);
      if (kw && kw.pool && kw.pool.length >= 3) {
        const kwRows = kw.pool.map(r => ({ ...r, _hammer: r._hv, _allin: r._hv, currency: "USD", transmission: null }));
        const kwReceipts = kwRows.map(htReceipt).sort((a, z) => String(z.date || "").localeCompare(String(a.date || "")));
        const kwHammers = kwRows.map(r => r._hv).filter(v => v > 0).sort((a, z) => a - z);
        const kwBand = kwHammers.length >= 8 ? [Math.round(percentile(kwHammers, 0.1)), Math.round(percentile(kwHammers, 0.9))] : [kwHammers[0], kwHammers[kwHammers.length - 1]];
        const kwClassEra = { isClass: true, era: classEra.era, make: spec.make, model: spec.model, receipts: kwReceipts, totalN: kwRows.length, setAsideN: 0, medianHammer: htMedOf(kwHammers), lowHammer: kwBand[0], highHammer: kwBand[1], outliers: [], trueLow: kwHammers[0], trueHigh: kwHammers[kwHammers.length - 1], source: "keyword", cohort: kw.cohort, route: kw.route };
        return { tier: "class_era", ...base, classEra: kwClassEra, refine, freshness: obFreshness(true, obNewestDate(kwReceipts), ingestDate, now) };
      }
      // Neither the marque-decade band nor the title-keyword route found enough: NO range, ever. Show
      // the nearest real receipts the class-era pool already ranked by relevance, state plainly that
      // there is not enough to mark a typical band, and ask for the ONE detail most likely to narrow it
      // (never guess at more than one missing field at a time).
      const askDetail = !spec.trim ? "trim" : !spec.bodyStyle ? "body style" : "year";
      return {
        tier: "class_era", ...base,
        classEra: { ...classEra, lowHammer: null, highHammer: null, rangeSuppressed: true, suppressReason: `Only ${classEra.receipts.length} nearby sale${classEra.receipts.length === 1 ? "" : "s"} on record, too spread out to mark a typical range.` },
        askNarrow: { detail: askDetail, question: `I don't have enough comparable sales to give a range. Can you tell me the ${askDetail}?` },
        refine, freshness: obFreshness(true, obNewestDate(classEra.receipts), ingestDate, now)
      };
    }
  }
  // NOT TRACKED (issue 2): make + model are resolved (we can NAME the car) but there is not a single
  // sale on file - say so honestly, never the generic "what year, make and model" ask. Fires only
  // when the exact-model pool is empty (and class-era could not stand in), so a car we DO have sales
  // for never lands here.
  if (thin && thin.totalN === 0 && spec.make && spec.model) {
    const name = [spec.make, spec.model, spec.trim].filter(Boolean).join(" ");
    return { tier: "not_tracked", resolvedCar, resolvedSpec: spec.resolvedSpec, samLine: `We haven’t tracked a ${name} sale yet. When one sells, it’ll show up here.` };
  }

  // Aside = the make halo (haloRe, badge-aware) OR a non-stock car (race/restomod/period tuner) via
  // the SHARED rule with wantHalo:true, so the tuner/race/restomod categories are added on BOTH
  // surfaces (change #4) WITHOUT re-applying the broad make-halo (which would re-break the
  // intrinsic-AMG/badge scoping). A named-halo query keeps its own halo (trimIsHalo) but still sets
  // aside race/restomod/tuner.
  // _tag (Rule 5 guard: CSL, Heritage, Scuderia, 16M, restomod/replica, year-mismatch, ...) is set
  // ASIDE here - kept in the pool, shown separately, OUT of the headline band. _askable (Competition/
  // ZCP) is deliberately NOT aside in this deploy, so it stays in the range until the gearbox/Competition
  // question ships (second deploy); no range silently shrinks in between.
  const isAside = r => !!r._tag || (haloRe && haloRe.test(titleOf(r))) || !!recordExcludeReason(r, spec.make, { wantHalo: true });
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
  // GEARBOX QUESTION (Part 1 Rule 2): after generation + body, when the generation offered BOTH a
  // manual and a non-manual box AND the pool has >=5 POSITIVELY-IDENTIFIED of each, ask it before the
  // range (the manual vs F1/PDK/SMG gap moves price). gearboxType counts only positive markers now, so
  // unknown "N-speed" cars count on neither side; the question never fires for a single-gearbox car
  // (a 458's whole pool is auto/unknown). The chip answer re-scopes via refine.tx. Never on a thin pool.
  if (mrRule && !(refine && refine.tx) && chosen.step !== "thin" && chosen.rows.length >= 8) {
    const gbTypes = mrGearboxFor(mrRule, spec.genCode, spec.trim, spec.year);
    if (gbTypes.includes("manual") && gbTypes.some(t => t !== "manual")) {
      const man = chosen.rows.filter(r => gearboxType(r) === "manual").length;
      const aut = chosen.rows.filter(r => gearboxType(r) === "auto").length;
      if (man >= 5 && aut >= 5) {
        const lbl = autoGearboxLabel(mrRule, spec.genCode);
        // Question cap, OR the year already pinned the generation (bug 1: go straight to a result): the
        // gearbox split renders as an inline line instead of a question, so "1994 911 Coupe" lands on a
        // result rather than a Manual/PDK ask.
        if (askCapped || spec.genPinnedByYear) {
          const sp = inlineSplitRange(chosen.rows, gearboxType, "manual", "Manuals", "auto", lbl + "s");
          if (sp) base.inlineSplits.push({ key: "gearbox", sides: sp });
        } else {
          return { tier: "gearbox_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: `Manual or ${lbl}? They price differently.`, gearboxOptions: ["Manual", lbl] };
        }
      }
    }
  }
  // COMPETITION QUESTION (Part 1 change 1): an askable variant (Competition / ZCP) that is >25% of
  // the pool with >=3 each side becomes a QUESTION rather than being tagged out. The chip answer
  // re-scopes via refine.variant. Rare editions (CSL etc.) stay tagged out (not _askable).
  if (mrRule && !(refine && refine.variant) && chosen.step !== "thin") {
    const comp = chosen.rows.filter(r => r._askable).length, std = chosen.rows.length - comp;
    if (comp >= 3 && std >= 3 && comp / chosen.rows.length > 0.25) {
      // Question cap: a would-be third question becomes an inline split instead.
      if (askCapped) {
        const sp = inlineSplitRange(chosen.rows, r => r._askable ? "comp" : "std", "comp", "Competition Package cars", "std", "Standard cars");
        if (sp) base.inlineSplits.push({ key: "competition", sides: sp });
      } else {
        return { tier: "variant_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: "Competition Package or standard?", variantOptions: ["Competition Package", "Standard"], variantKey: "competition" };
      }
    }
  }
  // GEARBOX APPLIES (item 4): the gearbox line shows on a card only when the gearbox question actually
  // applies to this car - the pool has BOTH a manual and a non-manual box. An all-manual car (a Shelby
  // Cobra, a pre-war car) never shows "Manual" on its hero, matching /sell. Mirrors htGearboxSplit.
  base.gearboxApplies = (function () {
    let man = 0, non = 0;
    for (const r of (chosen.rows || [])) { const g = gearboxType(r); if (g === "manual") man++; else if (g) non++; }
    return man > 0 && non > 0;
  })();
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
// The make's most-SOLD models by archive sales count (bare-make model chips, Part 2). Collapses chassis
// codes into the base model (996/997 -> 911) via deskModelFamily so the chips are real models, not gen
// codes, and ranks by count. Archive-only, cars-only, last 3 years. Returns up to n base model names.
async function topModelsForMake(env, make, n) {
  try {
    if (!env || !make) return [];
    const since = new Date(Date.now() - 1095 * 864e5).toISOString().slice(0, 10);
    const rows = await supabaseSelectAll(env, `sales_archive?select=model&make=eq.${encodeURIComponent(make)}&model=not.is.null&sale_price=not.is.null${VT_CAR}&sale_date=gte.${since}`);
    if (!rows || !rows.length) return [];
    const counts = {};
    for (const r of rows) {
      const raw = String(r.model || "").trim(); if (!raw || /^unknown$/i.test(raw)) continue;
      let fam; try { fam = mrModelFamily({ make, model: raw }) || raw; } catch { fam = raw; }
      fam = String(fam || "").trim(); if (!fam || /^unknown$/i.test(fam)) continue;
      counts[fam] = (counts[fam] || 0) + 1;
    }
    // Chip-name tidy-up: say it how a buyer says it ("1 Series", not "1-Series"); dedupe the two spellings.
    // Mercedes bare displacement codes (560, 190, 300) are not buyer-named models - the -Class chips
    // cover them - so drop a pure-number Mercedes family. (BMW 2002 and Porsche 911/356/944 stay: those
    // ARE the model's name.)
    const isMercedes = /mercedes|benz/i.test(make);
    const normalizeChip = s => String(s).replace(/[-\s]+Series\b/i, " Series").replace(/\s{2,}/g, " ").trim();
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([m]) => m);
    const seen = new Set(), out = [];
    for (const m of ranked) {
      if (isMercedes && /^\d{2,4}$/.test(m)) continue;   // drop bare displacement codes for Mercedes
      const nm = normalizeChip(m), k = nm.toLowerCase();
      if (nm && !seen.has(k)) { seen.add(k); out.push(nm); }
      if (out.length >= n) break;
    }
    return out;
  } catch (e) { return []; }
}
export async function runOneBoxModelChoice(vehicle, env) {
  const make = (vehicle && vehicle.make) || "";
  if (!make) return null;
  const year = Number(vehicle && vehicle.year) || null;
  // Bare make (no year): offer the most-SOLD models by archive count (up to 8), deduped to base models.
  if (!year) {
    const top = await topModelsForMake(env, make, 8);
    if (top.length) {
      const resolvedCar0 = { year: null, make, model: null, trim: null, bodyStyle: null, transmission: null };
      return { tier: "model_choice", resolvedCar: resolvedCar0, prompt: `Which ${make} model?`, modelOptions: top };
    }
  }
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
    modelOptions: models.slice(0, 8)
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

// ---- Test surface (additive, non-rendering): exposes the pure range-ladder helpers so the local
// proof harness (scripts/rangeLadderCheck.mjs) can assert the rules with synthetic rows, zero DB.
export const __rangeLadderTest = {
  rangeTierForCount, roundStep, roundNearest, roundFloor, roundCeil,
  percentile, r4Cluster, r4Span, enforceSamsTake, samsTake, stPlainClause, DISPLAY_FLOOR,
  siblingFor, VT_CAR
};
// Spec-page data layer (lib/specPages.js) reuses the gearbox classifier, the hammer-USD per row, the
// recent-sale shaper and the 12-month window helper, so the public spec pages read the SAME numbers as
// One Box. Internal surface, not a public API.
export const __specEngine = { gearboxType, hammerUsd, mileageInfo, titleOf, monthYear, percentile, r4Cluster, r4Span, roundFloor, roundCeil, DISPLAY_FLOOR, VT_CAR };
