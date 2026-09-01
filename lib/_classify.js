import crypto from "node:crypto";
import { familyFetchTerms, familyBadgeMatch } from "./modelFamilies.js";
// Record classification against a searched vehicle, plus the small record and
// text utilities the classifier and its callers share. classifyRecord returns
// both the persisted classification columns and in-memory ladder signals.

export function asText(value) {
  return String(value || "").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function textHasTerm(text, term) {
  const normalizedTerm = asText(term).toLowerCase();
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm
    .split(/\s+/)
    .map(escapeRegExp)
    .join("[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(text);
}

export function median(values) {
  const nums = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

export function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function normalizeMoney(record) {
  const value = record.sold_price ?? record.final_price ?? record.price ?? record.current_bid;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Source slugs that are NOT a platform: the data vendor's own name is not an
// auction house. A record whose source resolves to the vendor (OldCarsData
// stamps unattributed rows with "oldcarsdata") must never become a first-class
// source slug in the store's vocabulary. We fail closed to "unknown" so the
// evidence allowlist and new-source detection exclude it loudly instead of
// silently trusting the vendor name. See api/sellerDecision new-source scan.
const NON_PLATFORM_SOURCE_SLUGS = new Set(["oldcarsdata"]);

export function recordPlatform(record) {
  const raw = record.platform || record.source || record.auction_platform || record.listing_source || "";
  const norm = String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm || NON_PLATFORM_SOURCE_SLUGS.has(norm)) return "unknown";
  return raw;
}

export function recordSellerUsername(record) {
  return asText(record.seller_username || record.seller_name || record.seller || record.username);
}

export function sourceRecordId(record) {
  return String(record.id ?? record.source_record_id ?? record.listing_id ?? "");
}

// 7B.1: stable id for persistence. When the upstream record carries an id we use
// it; when it does not, we hash stable identifying fields so a re-fetch of the
// SAME listing produces the SAME id and conflicts correctly on
// (source, source_record_id) - instead of crypto.randomUUID() re-inserting the
// same listing on every fetch. source_url is the strongest key; the rest
// disambiguate when a url is absent.
export function stableRecordId(record) {
  const explicit = sourceRecordId(record).trim();
  if (explicit) return explicit;
  const parts = [
    record.source_url || record.url || record.listing_url || record.link || "",
    record.title || record.listing_title || "",
    record.year || "",
    record.ocd_make_name || record.listing_make || record.make || "",
    record.ocd_model_name || record.listing_model || record.model || "",
    record.sale_price || record.price || "",
    record.auction_end_date || record.sale_date || record.end_date || ""
  ].map(value => String(value).trim().toLowerCase()).join("|");
  return "gas-" + crypto.createHash("sha1").update(parts).digest("hex").slice(0, 24);
}

export function sourceRecordKey(source, id) {
  return `${source || "unknown"}|${id || ""}`;
}

function recordTitle(record) {
  return [
    record.title,
    record.listing_title,
    record.year,
    record.ocd_make_name || record.listing_make,
    record.ocd_model_name || record.listing_model
  ].filter(Boolean).join(" ");
}

function extractYear(text) {
  const match = asText(text).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// Model anchoring (July 2026 Ford GT fix). A model is matched EXACTLY, by whole
// tokens, never by substring. "GT" must never match "Mustang GT", "GT40" or
// "GT500"; "911" must still match "911 Carrera". The rule: the target model
// token sequence must LEAD the record's model field, or lead the model portion
// of the title (the tokens right after a leading year + make). That anchors the
// model position, so a trailing trim token ("Mustang GT") never counts, and a
// longer nameplate ("GT40") never collapses into a shorter one ("GT").
export function normModelText(value) {
  return asText(value).toLowerCase().replace(/[\s\-]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}
export function modelTokens(value) {
  const t = normModelText(value);
  return t ? t.split(" ") : [];
}
function leadingModelMatch(candidateTokens, targetTokens) {
  if (!candidateTokens.length || !targetTokens.length) return false;
  if (candidateTokens.length < targetTokens.length) return false;
  return targetTokens.every((tok, i) => candidateTokens[i] === tok);
}
// The model portion of a title = the tokens after a leading 4-digit year and the
// make (stripped only where the make actually leads the remaining tokens).
export function titleModelTokens(rawTitle, make) {
  let toks = modelTokens(rawTitle);
  if (toks.length && /^(19|20)\d{2}$/.test(toks[0])) toks = toks.slice(1);
  const makeToks = modelTokens(make);
  if (makeToks.length && leadingModelMatch(toks, makeToks)) toks = toks.slice(makeToks.length);
  return toks;
}
// True when any target model term anchors the record's model (field or title).
export function recordMatchesModel(record, vehicle) {
  const terms = modelSearchTerms(vehicle).map(modelTokens).filter(s => s.length);
  if (!terms.length) return false;
  const recModelToks = modelTokens(record.ocd_model_name || record.listing_model || record.model);
  const rawTitle = asText(record.title || record.listing_title);
  const titleToks = rawTitle ? titleModelTokens(rawTitle, record.ocd_make_name || record.listing_make || vehicle.make) : [];
  if (terms.some(target => leadingModelMatch(recModelToks, target) || leadingModelMatch(titleToks, target))) return true;
  // Fragmentation catch-all: a family-head search (E-Class, 5-Series) also owns
  // its badge-titled records (E550, M5, 500E). Scoped to the record's nameplate
  // tokens, make-guarded (lib/modelFamilies.js). No-op for badge/unmapped searches.
  return familyBadgeMatch(vehicle, record);
}

export function modelSearchTerms(vehicle) {
  const model = asText(vehicle.model);
  const terms = new Set();
  if (model) terms.add(model);

  const normalizedMake = asText(vehicle.make).toLowerCase();
  const numericModel = model.match(/^\d{3}$/)?.[0];
  if (normalizedMake === "bmw" && numericModel) {
    terms.add(`${numericModel}i`);
    terms.add(`${numericModel}is`);
    terms.add(`${numericModel}ic`);
  }

  // Fragmentation fix: a family-head search widens to its bounded top-volume
  // badges so the fetch keyword passes pull badge-titled listings into the
  // archive (lib/modelFamilies.js). No-op for badge/unmapped searches.
  for (const badge of familyFetchTerms(vehicle)) terms.add(badge);

  return [...terms].filter(Boolean);
}

export function classifyRecord(record, vehicle) {
  const title = recordTitle(record).toLowerCase();
  const recordMake = asText(record.ocd_make_name || record.listing_make).toLowerCase();
  const recordModel = asText(record.ocd_model_name || record.listing_model).toLowerCase();
  const targetMake = asText(vehicle.make).toLowerCase();
  const targetModel = asText(vehicle.model).toLowerCase();
  const recordYear = Number(record.year || extractYear(title));
  const yearGap = vehicle.year && recordYear ? Math.abs(vehicle.year - recordYear) : null;
  const sameMake = !!targetMake && (recordMake === targetMake || title.includes(targetMake));
  // Exact, whole-token model anchoring (never substring): a Ford GT pool holds
  // Ford GTs only, and Ford GT vs GT40 separate cleanly. See recordMatchesModel.
  const sameModel = !!targetModel && recordMatchesModel(record, vehicle);
  // Pool-alias: a curated package (Weissach, Touring) matches comps under its
  // PARENT badge (GT3 RS, GT3 Touring) via vehicle.fetchTrim, while vehicle.trim
  // stays the true package name for display (line ~238). See lib/modelFamilies.js.
  const targetTrim = asText(vehicle.fetchTrim || vehicle.trim).toLowerCase();
  const trimMatch = !!targetTrim && textHasTerm(title, targetTrim);
  const colorMatch = vehicle.color ? title.includes(vehicle.color) : null;
  const price = normalizeMoney(record);
  const targetMentionsTurbo = textHasTerm(vehicle.raw, "turbo");
  const targetMentionsCup = textHasTerm(vehicle.raw, "cup");
  const exclusionReasons = [];

  if (!sameMake) exclusionReasons.push("different make");
  if (!targetMentionsTurbo && textHasTerm(title, "turbo")) exclusionReasons.push("turbo market behaves differently");
  if (!targetMentionsCup && (textHasTerm(title, "cup") || textHasTerm(title, "race car") || textHasTerm(title, "racecar") || textHasTerm(title, "track car"))) {
    exclusionReasons.push("race/track market behaves differently");
  }
  // Non-genuine builds trade in a different market than the stock car and must
  // never count as comparable sales (Aug 2026). Modified/replica/tribute builds
  // ("Custom Track T Roadster", "Cargo Truck Re-Creation") were previously counted
  // as genuine model comps, inflating both the count and the median. Each term is
  // skipped when the SEARCHED car itself names it, so a real "Ford Custom" model or
  // a deliberately searched continuation car is not self-excluded (mirrors the
  // turbo/cup guard above). textHasTerm joins tokens with [\s-]+, so "re creation"
  // catches "Re-Creation" and "resto mod" catches "resto-mod". "salvage" is
  // title/history, never a model name, so it stays unconditional.
  const targetText = [vehicle.raw, vehicle.model, vehicle.trim].map(asText).join(" ");
  const NON_GENUINE_TERMS = ["replica", "kit car", "recreation", "re creation", "tribute", "clone", "continuation", "hot rod", "hotrod", "restomod", "resto mod", "custom"];
  const nonGenuineHit = NON_GENUINE_TERMS.find(term => textHasTerm(title, term) && !textHasTerm(targetText, term));
  if (nonGenuineHit || textHasTerm(title, "salvage")) {
    exclusionReasons.push(nonGenuineHit ? "modified or non-genuine build" : "salvage title/history");
  }

  // Body-style guard (Aug 2026, Fix 2): when the seller specified a body style, a record
  // whose title EXPLICITLY names a CONFLICTING style is a different market (a coupe is not
  // a convertible comp) and must not dilute the comparison. Bounded and conservative,
  // mirroring the turbo/cup guards: fires ONLY when the search named a body style, the
  // title names a clearly opposing group's word, and the title does NOT also name the
  // searched group's own word. Ambiguous styles (targa, hardtop, t-top, softtop) map to
  // no group, so they never trigger a conflict either as the search or in a title.
  const BODY_GROUPS = {
    open: ["convertible", "cabriolet", "cabrio", "roadster", "spyder", "spider", "drophead", "drop head", "dhc", "vert"],
    coupe: ["coupe", "coup", "berlinetta", "fastback"],
    sedan: ["sedan", "saloon"],
    wagon: ["wagon", "estate", "avant", "shooting brake"]
  };
  const bodyGroupOf = word => {
    const w = String(word || "").toLowerCase();
    for (const [g, words] of Object.entries(BODY_GROUPS)) if (words.some(x => w.includes(x))) return g;
    return null;
  };
  const searchBodyGroup = vehicle.bodyStyle ? bodyGroupOf(vehicle.bodyStyle) : null;
  if (searchBodyGroup) {
    const titleNamesOwnGroup = BODY_GROUPS[searchBodyGroup].some(x => textHasTerm(title, x));
    if (!titleNamesOwnGroup && Object.entries(BODY_GROUPS).some(([g, words]) => g !== searchBodyGroup && words.some(x => textHasTerm(title, x)))) {
      exclusionReasons.push("different body style");
    }
  }

  let comparisonTier = "excluded";
  let confidence = "low";
  if (exclusionReasons.length) {
    comparisonTier = "excluded";
  } else if (sameMake && sameModel && (yearGap === null || yearGap <= 2)) {
    comparisonTier = "close_match";
    confidence = "high";
  } else if (sameMake && sameModel && (yearGap === null || yearGap <= 8)) {
    comparisonTier = "relevant_match";
    confidence = "medium";
  } else if (sameMake && sameModel) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake && yearGap !== null && yearGap <= 8) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake && yearGap === null) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake) {
    exclusionReasons.push("same make but too far from searched year/model");
  }

  return {
    source_record_id: sourceRecordId(record),
    normalized_make: vehicle.make || record.ocd_make_name || record.listing_make || null,
    normalized_model: vehicle.model || record.ocd_model_name || record.listing_model || null,
    normalized_year: recordYear || null,
    searched_year: vehicle.year,
    searched_color: vehicle.color,
    target_match: comparisonTier === "close_match",
    comparison_tier: comparisonTier,
    exclusion_reasons: exclusionReasons,
    classification_confidence: confidence,
    classification_source: "search_context",
    matched_terms: [
      sameMake ? vehicle.make : null,
      sameModel ? vehicle.model : null,
      trimMatch ? vehicle.trim : null,
      colorMatch ? vehicle.color : null
    ].filter(Boolean),
    needs_review: confidence === "low",
    price,
    // In-memory only (not persisted columns): raw signals the evidence ladder
    // evaluates directly, independent of the comparison_tier rollup.
    same_make: sameMake,
    same_model: sameModel,
    trim_match: trimMatch,
    year_gap: yearGap
  };
}

// vehicle_market_records requires make and model NOT NULL, but OldCarsData
// returns oddball lots (RVs, motorcycles) without them; one such row used to
// kill its whole insert batch, silently dropping real sales (product rule 5).
// Derive best-effort values from the title, falling back to "Other".
export function persistableMakeModel(record) {
  const title = asText(record.title || record.listing_title);
  const afterYear = title.replace(/^\s*(19|20)\d{2}\s+/, "");
  const tokens = afterYear.split(/\s+/).filter(Boolean);
  const make = asText(record.ocd_make_name || record.listing_make) || tokens[0] || "Other";
  const model = asText(record.ocd_model_name || record.listing_model)
    || (tokens.length > 1 ? tokens.slice(1, 4).join(" ") : "") || "Other";
  return { make, model };
}
