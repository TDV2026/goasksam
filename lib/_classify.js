import crypto from "node:crypto";
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

  return [...terms].filter(Boolean);
}

export function classifyRecord(record, vehicle) {
  const title = recordTitle(record).toLowerCase();
  const recordMake = asText(record.ocd_make_name || record.listing_make).toLowerCase();
  const recordModel = asText(record.ocd_model_name || record.listing_model).toLowerCase();
  const targetMake = asText(vehicle.make).toLowerCase();
  const targetModel = asText(vehicle.model).toLowerCase();
  const targetModelTerms = modelSearchTerms(vehicle).map(term => term.toLowerCase());
  const recordYear = Number(record.year || extractYear(title));
  const yearGap = vehicle.year && recordYear ? Math.abs(vehicle.year - recordYear) : null;
  const sameMake = !!targetMake && (recordMake === targetMake || title.includes(targetMake));
  const sameModel = !!targetModel && targetModelTerms.some(term => recordModel.includes(term) || textHasTerm(title, term));
  const targetTrim = asText(vehicle.trim).toLowerCase();
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
  if (textHasTerm(title, "replica") || textHasTerm(title, "kit car") || textHasTerm(title, "salvage")) {
    exclusionReasons.push("special-case title/history");
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
