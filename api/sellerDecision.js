import { oldCarsDataCost, recordUsageEvent, requestMetadata } from "./_usage.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { callOldCarsData } from "../lib/_ocd.js";
import { findGeneration, generationModelToken } from "../lib/generations.js";
import { MODEL_SEGMENTS } from "../lib/vehicleData.js";
import { calculateEffectiveSampleSize, MINIMUM_EFFECTIVE_SAMPLE, getRecencyMultiplier, getPlatformDominanceScore, calculateConfidenceScore, getConfidenceLevel } from "../lib/weighting.js";
import { computePartnerCareerStats, computePlatformBaselines, partnerRelevance, priceBand } from "../lib/marketStats.js";
import {
  asText,
  classifyRecord,
  persistableMakeModel,
  daysAgo,
  median,
  modelSearchTerms,
  normalizeMoney,
  recordPlatform,
  recordSellerUsername,
  sourceRecordId,
  sourceRecordKey,
  textHasTerm
} from "../lib/_classify.js";

// Powerseller referrals are gated (locked product rule): estimated value from
// actual comps must clear this threshold before a partner can lead.
const POWERSELLER_MIN_VALUE_USD = Number(process.env.POWERSELLER_MIN_VALUE_USD || 75000);
// Depth-first breadth: evaluate 45 days first, broaden only while comps stay
// under threshold: 90, then 180, then all-time (represented as 36500 days).
const ALL_TIME_WINDOW_DAYS = 36500;
const ANALYSIS_WINDOWS_DAYS = [45, 90, 180, ALL_TIME_WINDOW_DAYS];

function windowLabel(days) {
  return days >= ALL_TIME_WINDOW_DAYS ? "across everything tracked" : `in the last ${days} days`;
}
const SELLER_ACTIVITY_WINDOWS_DAYS = [90, 180, 270];
const MAX_PAGES = 3;
const DEFAULT_LIMIT = 50;
const FETCH_TIME_BUDGET_MS = 22000;
const PER_REQUEST_TIMEOUT_MS = 8000;

const ROUTE_POLICIES = {
  bringatrailer: {
    about: { regionsLabel: "the US", since: 2014, knownFor: "enthusiast and collector cars across every era", source: "policy_provided" },
    label: "Bring a Trailer",
    evidenceCapable: true,
    priceOutcome: "strong",
    speedToList: "slower",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: ["premium_collectors", "air_cooled_porsche", "high_end_enthusiast", "classic_european", "modern_classic"]
  },
  carsandbids: {
    about: { regionsLabel: "the US", since: 2020, knownFor: "modern enthusiast cars from the 1980s onward", source: "policy_provided" },
    label: "Cars & Bids",
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: ["modern_enthusiast", "bmw_m", "modern_porsche", "jdm", "sports_cars", "quick_listing"]
  },
  pcarmarket: {
    about: { regionsLabel: "the US", since: 2018, knownFor: "Porsche and European sports cars", source: "policy_provided" },
    label: "PCarMarket",
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium_low",
    regions: ["US"],
    strongSegments: ["porsche", "european_sports", "nimble_listing"]
  },
  hemmings: {
    about: { regionsLabel: "the US", since: 1954, knownFor: "classic American and pre-1990 collector cars", source: "policy_provided" },
    label: "Hemmings",
    evidenceCapable: false,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: ["older_classic", "classic_american", "pre_1990", "collector"]
  },
  hagerty: {
    about: { regionsLabel: "the US", since: 2021, knownFor: "classic and collector cars, backed by the Hagerty community", source: "policy_provided" },
    label: "Hagerty Marketplace",
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: ["classic", "collector", "older_enthusiast", "pre_1990"]
  },
  carandclassic: {
    about: { regionsLabel: "the UK and Europe", since: 2005, knownFor: "classics and modern classics", source: "policy_provided" },
    label: "Car & Classic",
    evidenceCapable: false,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["UK", "Europe"],
    strongSegments: ["uk_europe", "classic", "modern_classic", "collector", "older_enthusiast"]
  },
  collectingcars: {
    about: { regionsLabel: "the UK, Europe, Australia and the Middle East", since: 2019, knownFor: "modern classics and enthusiast cars", source: "policy_provided" },
    label: "Collecting Cars",
    evidenceCapable: false,
    priceOutcome: "strong",
    speedToList: "medium_fast",
    sellerEffort: "medium_low",
    regions: ["UK", "Europe", "Australia", "Middle East"],
    strongSegments: ["high_value", "premium_collectors", "international", "specialist", "modern_classic", "collector"]
  }
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseSellerTargetPrice(value) {
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (text.includes("six figure") || text.includes("six-figure")) return 100000;

  const compact = text.replace(/,/g, "");
  const kMatch = compact.match(/\$?\s*(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);

  const numberMatch = compact.match(/\$?\s*(\d{5,7})\b/);
  if (numberMatch) return Number(numberMatch[1]);

  return null;
}

function recordNumber(record, fields) {
  for (const field of fields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function weekdayName(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return null;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
}

function analysisDateForSeller() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function strongestWeekdayInsight(items) {
  const dayMap = new Map();
  for (const item of items) {
    const price = Number(item?.classification?.price);
    const weekday = weekdayName(item?.record?.auction_end_date);
    if (!Number.isFinite(price) || !weekday) continue;
    if (!dayMap.has(weekday)) dayMap.set(weekday, []);
    dayMap.get(weekday).push(price);
  }

  const rankedDays = [...dayMap.entries()]
    .map(([weekday, prices]) => ({
      weekday,
      sales: prices.length,
      medianSalePrice: median(prices)
    }))
    .filter(day => day.sales >= 2 && Number.isFinite(day.medianSalePrice))
    .sort((a, b) => b.medianSalePrice - a.medianSalePrice);

  if (rankedDays.length < 2) return null;
  const [best, next] = rankedDays;
  if (!next?.medianSalePrice) return null;
  const lift = Math.round((best.medianSalePrice - next.medianSalePrice) / next.medianSalePrice * 100);
  if (lift < 5) return null;
  return {
    strongestWeekday: best.weekday,
    strongestWeekdaySales: best.sales,
    strongestWeekdayLiftPercent: lift
  };
}

function platformPolicyKey(platform) {
  const normalized = asText(platform).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("bringatrailer") || normalized === "bat") return "bringatrailer";
  if (normalized.includes("carsandbids")) return "carsandbids";
  if (normalized.includes("pcarmarket")) return "pcarmarket";
  if (normalized.includes("hemmings")) return "hemmings";
  if (normalized.includes("hagerty")) return "hagerty";
  if (normalized.includes("carandclassic")) return "carandclassic";
  if (normalized.includes("collectingcars")) return "collectingcars";
  return normalized || "unknown";
}

function inferSellerPriorities(vehicle, criteria) {
  const text = [
    vehicle.raw,
    criteria.region,
    criteria.timeline,
    criteria.involvement,
    criteria.notes,
    criteria.targetPrice
  ].map(asText).join(" ").toLowerCase();

  let region = "US";
  if (/\b(australia|australian|aus)\b/i.test(text)) region = "Australia";
  else if (/\b(middle east|uae|dubai|saudi|qatar|kuwait|bahrain|oman)\b/i.test(text)) region = "Middle East";
  else if (/\b(uk|united kingdom|england|scotland|wales|europe|european)\b/i.test(text)) region = "UK_Europe";
  const fastSale = /\b(fast|quick|quickly|tomorrow|this week|asap|soon|gone)\b/i.test(text);
  const handsOff = /\b(handle|hands[- ]?off|someone|consign|broker)\b/i.test(text);
  const maximumPrice = /\b(top dollar|max|maximize|most money|best price|highest)\b/i.test(text);
  const year = vehicle.year || null;
  const segments = new Set();
  const targetPrice = parseSellerTargetPrice(criteria.targetPrice);

  if (year && year < 1990) segments.add("pre_1990");
  if (year && year < 2000) segments.add("older_enthusiast");
  if (year && year >= 2000) segments.add("modern_enthusiast");
  if (asText(vehicle.make).toLowerCase() === "porsche") segments.add("porsche");
  if (asText(vehicle.make).toLowerCase() === "bmw" && /m\d|\bm\b/i.test(asText(vehicle.model))) segments.add("bmw_m");
  if (["bmw", "porsche", "mercedes-benz", "mercedes", "audi"].includes(asText(vehicle.make).toLowerCase())) {
    segments.add("classic_european");
    segments.add("european_sports");
  }
  if (Number.isFinite(targetPrice) && targetPrice >= 100000) {
    segments.add("high_value");
    segments.add("premium_collectors");
  }
  if (["UK_Europe", "Australia", "Middle East"].includes(region)) segments.add("international");

  return {
    region,
    fastSale,
    handsOff,
    maximumPrice,
    segments: [...segments]
  };
}

function routeFitFacts(policy, priorities) {
  const facts = [];
  const regionFits = priorities.region === "US"
    ? policy.regions.includes("US")
    : priorities.region === "UK_Europe"
      ? (policy.regions.includes("UK") || policy.regions.includes("Europe"))
      : policy.regions.includes(priorities.region);

  if (priorities.fastSale && ["fast", "medium_fast"].includes(policy.speedToList)) facts.push("faster_listing_fit");
  if (priorities.fastSale && policy.speedToList === "slower") facts.push("speed_tradeoff");
  if (policy.priceOutcome === "strong") facts.push("strong_price_signal_route");
  if (priorities.handsOff && ["medium_low", "medium"].includes(policy.sellerEffort)) facts.push("may_support_handoff");
  if (priorities.segments.some(segment => policy.strongSegments.includes(segment))) facts.push("segment_fit");
  if (regionFits) facts.push("region_fit");
  if (!regionFits) facts.push("region_mismatch");
  return facts;
}

function analyzeRouteFit(analysis, criteria, vehicle) {
  const priorities = inferSellerPriorities(vehicle, criteria);
  const evidenceByPlatform = Object.fromEntries(
    (analysis.platformPerformance || []).map(platform => [platformPolicyKey(platform.platform), platform])
  );
  const comparableMedians = Object.values(evidenceByPlatform)
    .filter(evidence => (evidence.closeSales || evidence.relevantSales) && evidence.medianSalePrice)
    .map(evidence => evidence.medianSalePrice);
  const maxComparableMedian = comparableMedians.length ? Math.max(...comparableMedians) : 0;
  const candidateKeys = new Set(Object.keys(evidenceByPlatform));

  for (const [key, policy] of Object.entries(ROUTE_POLICIES)) {
    const facts = routeFitFacts(policy, priorities);
    const hasRegionMismatch = facts.includes("region_mismatch");
    if (hasRegionMismatch) continue;
    if (priorities.fastSale && ["fast", "medium_fast"].includes(policy.speedToList)) candidateKeys.add(key);
    if (facts.includes("region_fit")) candidateKeys.add(key);
    if (priorities.segments.some(segment => policy.strongSegments.includes(segment))) candidateKeys.add(key);
  }

  const routes = [...candidateKeys].map(key => {
    const policy = ROUTE_POLICIES[key] || {
      label: evidenceByPlatform[key]?.platform || key,
      priceOutcome: "unknown",
      speedToList: "unknown",
      sellerEffort: "unknown",
      regions: [],
      strongSegments: []
    };
    const evidence = evidenceByPlatform[key] || null;
    const facts = routeFitFacts(policy, priorities);
    let score = 0;

    if (evidence) {
      const comparableCount = (evidence.closeSales || 0) + (evidence.relevantSales || 0);
      const confidenceScore = 20
        + Math.min(evidence.closeSales || 0, 3) * 5
        + Math.min(evidence.relevantSales || 0, 6) * 2
        + Math.min(evidence.broadSales || 0, 3);
      score += confidenceScore;
      if (maxComparableMedian && (evidence.closeSales || evidence.relevantSales) && evidence.medianSalePrice) {
        const medianRatio = evidence.medianSalePrice / maxComparableMedian;
        score += Math.round(medianRatio * 35);
        if (medianRatio < 0.95) score -= Math.round((1 - medianRatio) * 45);
        if (medianRatio >= 0.9 && ["fast", "medium_fast"].includes(policy.speedToList)) score += 8;
      }
      if (comparableCount >= 3) score += 3;
    }
    if (facts.includes("segment_fit")) score += 10;
    if (priorities.fastSale && facts.includes("faster_listing_fit")) score += 12;
    if (priorities.fastSale && facts.includes("speed_tradeoff")) score -= 8;
    if (priorities.maximumPrice && policy.priceOutcome === "strong") score += 10;
    if (priorities.segments.includes("high_value") && policy.strongSegments.includes("high_value")) score += 20;
    if (facts.includes("region_fit")) score += 15;
    if (facts.includes("region_mismatch")) score -= 175;
    if (priorities.handsOff && facts.includes("may_support_handoff")) score += 4;

    return {
      platform: evidence?.platform || policy.label,
      policyKey: key,
      label: policy.label,
      score,
      priceOutcome: policy.priceOutcome,
      speedToList: policy.speedToList,
      sellerEffort: policy.sellerEffort,
      routeFitFacts: facts,
      // False for routes with no covered data source (Hemmings, Car & Classic,
      // Collecting Cars): they can only ever be policy recommendations.
      evidenceCapable: policy.evidenceCapable !== false,
      // Evidence-only sources (consignment auction houses) have no route
      // policy: we cannot send a seller there, so they can never be the pick.
      routable: !!ROUTE_POLICIES[key],
      about: policy.about || null,
      hasMarketEvidence: !!evidence,
      marketEvidence: evidence
    };
  }).sort((a, b) => b.score - a.score);

  return {
    priorities,
    routes
  };
}

// ---- Evidence ladder ----
// The explicit, ordered drawdown from narrowest to broadest evidence. The
// engine fetches and evaluates rung by rung, lands on the narrowest rung whose
// threshold is met, and decide() treats the regional policy floor as the
// bottom rung so a recommendation always comes back.
//
// Generation-aware (Phase 4): when the vehicle's year falls inside a mapped
// generation, the year-widening rungs use that generation's exact year range
// and name it in their labels. Models with no mapping get the calendar +/- 2
// rungs unchanged, so unmapped models behave exactly as before.

function buildLadder(vehicle, generation = null) {
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  const trim = asText(vehicle.trim) || null;
  const model = asText(vehicle.model);
  const modelTrim = [model, trim].filter(Boolean).join(" ");
  const gen = generation && year ? generation : null;
  // Decade input ("80s Bus"): no single year, but a range the rungs can use.
  const range = !year && vehicle.yearRange && Number.isFinite(vehicle.yearRange.start) ? vehicle.yearRange : null;
  const rungs = [];

  if (trim && range) {
    rungs.push({ key: "year_range_trim", label: `${modelTrim} sales ${range.start} to ${range.end}`, needTrim: true, yearMin: range.start, yearMax: range.end, maxYearGap: null, threshold: 3, pages: 2 });
  }
  if (trim && year) {
    rungs.push({ key: "exact_year_trim", label: `${year} ${modelTrim} sales`, needTrim: true, maxYearGap: 0, threshold: 3, pages: 1 });
    rungs.push(gen
      ? { key: "generation_trim", label: `${gen.code}-generation ${modelTrim} sales, ${gen.yearStart} to ${gen.yearEnd}`, needTrim: true, yearMin: gen.yearStart, yearMax: gen.yearEnd, maxYearGap: null, generationCode: gen.code, threshold: 3, pages: 2 }
      : { key: "near_years_trim", label: `${modelTrim} sales ${year - 2} to ${year + 2}`, needTrim: true, maxYearGap: 2, threshold: 3, pages: 2 });
  }
  if (trim) {
    rungs.push({ key: "any_year_trim", label: `${modelTrim} sales, any year${gen ? " (cross-generation)" : ""}`, needTrim: true, maxYearGap: null, threshold: 4, pages: 2 });
  }
  if (year && !trim) {
    rungs.push({ key: "exact_year_model", label: `${year} ${model} sales`, needTrim: false, maxYearGap: 0, threshold: 3, pages: 1 });
  }
  if (year) {
    rungs.push(gen
      ? { key: "generation_model", label: `${gen.code}-generation ${model} sales, ${gen.yearStart} to ${gen.yearEnd}`, needTrim: false, yearMin: gen.yearStart, yearMax: gen.yearEnd, maxYearGap: null, generationCode: gen.code, threshold: 3, pages: 2 }
      : { key: "near_years_model", label: `${model} sales ${year - 2} to ${year + 2}`, needTrim: false, maxYearGap: 2, threshold: 3, pages: 2 });
  }
  if (range) {
    rungs.push({ key: "year_range_model", label: `${model} sales ${range.start} to ${range.end}`, needTrim: false, yearMin: range.start, yearMax: range.end, maxYearGap: null, threshold: 3, pages: 2 });
  }
  rungs.push({ key: "any_year_model", label: `${model} sales, any year`, needTrim: false, maxYearGap: null, threshold: 6, pages: MAX_PAGES });
  rungs.push({
    key: "make_context",
    label: `${vehicle.make} sales${year ? ` ${year - 8} to ${year + 8}` : ""}`,
    makeOnly: true,
    maxYearGap: year ? 8 : null,
    threshold: 6,
    pages: 2
  });

  return rungs.map((rung, index) => ({ ...rung, rung: index + 1 }));
}

function rungYearBounds(rung, vehicle) {
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  if (rung.yearMin != null && rung.yearMax != null) return { year_min: rung.yearMin, year_max: rung.yearMax };
  if (rung.maxYearGap !== null && year) return { year_min: year - rung.maxYearGap, year_max: year + rung.maxYearGap };
  return null;
}

function rungFetchParams(rung, vehicle) {
  const modelToken = asText(vehicle.model).split(/\s+/)[0] || undefined;
  const params = { make: vehicle.make };
  if (!rung.makeOnly) params.model = modelToken;
  Object.assign(params, rungYearBounds(rung, vehicle) || {});
  if (rung.needTrim && vehicle.trim) params.keyword = vehicle.trim;
  return params;
}

// Insurance against OldCarsData model-name mismatches (e.g. vPIC says "325i"
// where OldCarsData files it under "3-Series"): if a rung's model-param pass
// returns nothing, retry with the model as a keyword instead. Generation rungs
// whose code doubles as an OldCarsData model (997, e46) also try that model
// directly, since some sources file those generations as their own models.
function rungKeywordFallbackPasses(rung, vehicle, generationToken = null) {
  if (rung.makeOnly) return [];
  const bounds = rungYearBounds(rung, vehicle) || {};
  const passes = [];
  if (rung.generationCode && generationToken) {
    passes.push({
      name: `rung${rung.rung}_${rung.key}_genmodel_${generationToken}`,
      label: `${rung.label} (as model ${generationToken})`,
      rung: rung.rung,
      pages: 1,
      params: {
        make: vehicle.make,
        model: generationToken,
        ...bounds,
        ...(rung.needTrim && vehicle.trim ? { keyword: vehicle.trim } : {})
      }
    });
  }
  for (const term of modelSearchTerms(vehicle)) {
    passes.push({
      name: `rung${rung.rung}_${rung.key}_keyword_${term}`,
      label: `${rung.label} (keyword ${term})`,
      rung: rung.rung,
      pages: 1,
      params: { make: vehicle.make, keyword: [term, rung.needTrim ? vehicle.trim : null].filter(Boolean).join(" "), ...bounds }
    });
  }
  return passes;
}

function ladderEligible(item, rung) {
  const classification = item.classification;
  if (classification.comparison_tier === "excluded") return false;
  if (rung.makeOnly) {
    if (!classification.same_make) return false;
    if (rung.maxYearGap === null) return true;
    return classification.year_gap === null || classification.year_gap <= rung.maxYearGap;
  }
  if (!classification.same_model) return false;
  if (rung.needTrim && !classification.trim_match) return false;
  if (rung.yearMin != null && rung.yearMax != null) {
    // Generation rung: the record's year must fall inside the generation.
    const recordYear = classification.normalized_year;
    if (!Number.isFinite(recordYear)) return false;
    return recordYear >= rung.yearMin && recordYear <= rung.yearMax;
  }
  if (rung.maxYearGap !== null) {
    if (classification.year_gap === null) return false;
    if (classification.year_gap > rung.maxYearGap) return false;
  }
  return true;
}

function evaluateLadder(pairedRecords, ladder) {
  const maxWindow = ANALYSIS_WINDOWS_DAYS[ANALYSIS_WINDOWS_DAYS.length - 1];
  const walk = ladder.map(rung => {
    const eligible = pairedRecords.filter(item =>
      daysAgo(item.record.auction_end_date) <= maxWindow && ladderEligible(item, rung)
    );
    // Effective-sample gating (locked, July 2026): each sale is weighted by
    // recency decay times the rung's scope purity, so five fresh exact
    // comps beat fifteen stale make-level ones. The gate is flat 3.0;
    // wider scopes automatically need more sales via the purity multiplier.
    // Raw counts still report everywhere (copy rules use real counts).
    let landedWindow = null;
    let landedEffective = 0;
    for (const windowDays of ANALYSIS_WINDOWS_DAYS) {
      const inWindow = eligible.filter(item => daysAgo(item.record.auction_end_date) <= windowDays);
      const effective = calculateEffectiveSampleSize(inWindow.map(item => daysAgo(item.record.auction_end_date)), rung.key);
      if (effective >= MINIMUM_EFFECTIVE_SAMPLE) {
        landedWindow = windowDays;
        landedEffective = effective;
        break;
      }
    }
    return {
      rung: rung.rung,
      key: rung.key,
      label: rung.label,
      threshold: rung.threshold,
      sales: eligible.length,
      effectiveSample: landedEffective || calculateEffectiveSampleSize(eligible.map(item => daysAgo(item.record.auction_end_date)), rung.key),
      windowDays: landedWindow,
      met: landedWindow !== null,
      definition: rung
    };
  });

  let landed = walk.find(entry => entry.met) || null;
  let thin = false;
  if (!landed) {
    // No rung met its threshold: land on the narrowest rung with any evidence
    // at the widest window, honestly flagged as thin.
    const fallback = walk.find(entry => entry.sales > 0);
    if (fallback) {
      landed = { ...fallback, windowDays: maxWindow };
      thin = true;
    }
  }
  return { walk, landed, thin };
}

async function fetchPass(pass, apiKey, deadline) {
  const records = [];
  let error = null;
  let meteredRequests = 0;
  let pagesFetched = 0;
  const firstPage = pass.startPage || 1;
  for (let page = firstPage; page < firstPage + pass.pages; page++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      error = "time_budget_reached";
      break;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(PER_REQUEST_TIMEOUT_MS, remainingMs))
    );
    let result;
    try {
      meteredRequests++;
      result = await callOldCarsData("/auctions", {
        ...pass.params,
        status: "sold",
        sort: "date",
        direction: "desc",
        page,
        limit: DEFAULT_LIMIT
      }, apiKey, { signal: controller.signal });
    } catch (err) {
      error = err.name === "AbortError" ? "request_timeout" : err.message;
      break;
    } finally {
      clearTimeout(timeout);
    }

    pagesFetched++;
    const pageRecords = result.data || [];
    records.push(...pageRecords.map(record => ({
      ...record,
      _goasksam_fetch_pass: pass.name,
      _goasksam_fetch_label: pass.label
    })));
    if (!pageRecords.length) break;
    if (page >= (result.meta?.total_pages || 1)) break;
  }
  return { records, error, meteredRequests, pagesFetched };
}

async function fetchRecentRecords(vehicle, apiKey, generation = null) {
  const ladder = buildLadder(vehicle, generation);
  const generationToken = generationModelToken(generation);
  const startedAt = Date.now();
  const deadline = startedAt + FETCH_TIME_BUDGET_MS;
  const seen = new Set();
  const records = [];
  const passSummary = [];
  const maxWindow = Math.max(...ANALYSIS_WINDOWS_DAYS, ...SELLER_ACTIVITY_WINDOWS_DAYS);
  let stoppedEarly = false;
  let stopReason = null;
  let meteredRequests = 0;

  const evaluate = () => evaluateLadder(
    records.map(record => ({ record, classification: classifyRecord(record, vehicle) })),
    ladder
  );

  const runPass = async pass => {
    const passResult = await fetchPass(pass, apiKey, deadline);
    meteredRequests += passResult.meteredRequests;
    let added = 0;
    for (const record of passResult.records) {
      if (daysAgo(record.auction_end_date) > maxWindow) continue;
      const key = sourceRecordKey(recordPlatform(record), sourceRecordId(record));
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
      added++;
    }
    passSummary.push({
      name: pass.name,
      label: pass.label,
      rung: pass.rung,
      params: pass.params,
      fetched: passResult.records.length,
      added,
      meteredRequests: passResult.meteredRequests,
      pagesFetched: passResult.pagesFetched,
      error: passResult.error
    });
    return passResult;
  };

  let ladderEval = evaluate();
  for (const rung of ladder) {
    if (Date.now() >= deadline) {
      stoppedEarly = true;
      stopReason = "time_budget_reached";
      break;
    }

    // No pre-fetch: pull one page at a time and stop the moment this rung
    // meets its threshold at any window. Thin markets stop stalling on
    // speculative pages.
    let primary = null;
    for (let page = 1; page <= rung.pages; page++) {
      primary = await runPass({
        name: `rung${rung.rung}_${rung.key}_p${page}`,
        label: rung.label,
        rung: rung.rung,
        pages: 1,
        startPage: page,
        params: rungFetchParams(rung, vehicle)
      });
      if (primary.error) break;
      if (!primary.records.length) break;
      if (evaluate().walk.find(entry => entry.rung === rung.rung)?.met) break;
      if (Date.now() >= deadline) break;
    }

    // Keyword fallback whenever the rung is still unmet, not just on an empty
    // primary: sources like OldCarsData file some cars under chassis-code
    // models (997 vs 911) that only a title keyword search can reach.
    const rungMetAfterPrimary = evaluate().walk.find(entry => entry.rung === rung.rung)?.met;
    if (!rungMetAfterPrimary && !primary.error) {
      for (const fallbackPass of rungKeywordFallbackPasses(rung, vehicle, generationToken)) {
        if (Date.now() >= deadline) break;
        await runPass(fallbackPass);
      }
    }

    ladderEval = evaluate();
    if (ladderEval.landed?.met && ladderEval.landed.rung <= rung.rung) {
      stoppedEarly = true;
      stopReason = `ladder_rung_${ladderEval.landed.rung}_satisfied`;
      break;
    }
  }

  return {
    records,
    passSummary,
    stoppedEarly,
    stopReason,
    elapsedMs: Date.now() - startedAt,
    timeBudgetMs: FETCH_TIME_BUDGET_MS,
    meteredRequests,
    ladder
  };
}

// ---- Market-fetch cache ----
// 24h cache keyed by make|model family. A hit serves records from
// vehicle_market_records (every fetched record is stored permanently, so a
// fresh fetch within 24h would return the same rows) and costs zero metered
// requests. All reads and writes degrade silently until the table exists.

const MARKET_FETCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Daily OldCarsData budget guard (Stage 3): plan pace is ~33 metered
// requests/day (1K/month). Past the daily budget we soft-degrade: serve
// whatever the store holds and log loudly, never spend past pace and never
// dead-end (the ladder and policy floor handle a thin or empty set honestly).
const OCD_DAILY_REQUEST_BUDGET = Number(process.env.OCD_DAILY_REQUEST_BUDGET || 33);

async function ocdRequestsToday(supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) return null;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `app_usage_events?created_at=gte.${since.toISOString()}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=2000`
  );
  if (!rows) return null;
  return rows.reduce((sum, row) => sum + (Number(row.oldcarsdata_metered_requests) || 0), 0);
}

function marketFetchCacheKey(vehicle) {
  const family = asText(vehicle.model).split(/\s+/)[0] || "";
  return `${asText(vehicle.make).toLowerCase()}|${family.toLowerCase()}`;
}

async function readMarketFetchCache(vehicle, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey || !asText(vehicle.make)) return null;
  const key = marketFetchCacheKey(vehicle);
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `market_fetch_cache?cache_key=eq.${encodeURIComponent(key)}&select=cache_key,fetched_at&limit=1`
  );
  const row = rows?.[0];
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (!Number.isFinite(age) || age > MARKET_FETCH_CACHE_TTL_MS) return null;
  return row;
}

async function writeMarketFetchCache(vehicle, meteredRequests, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey || !asText(vehicle.make)) return;
  await supabaseInsert("market_fetch_cache", [{
    cache_key: marketFetchCacheKey(vehicle),
    make: vehicle.make || null,
    model_family: asText(vehicle.model).split(/\s+/)[0] || null,
    fetched_at: new Date().toISOString(),
    metered_requests: meteredRequests
  }], supabaseUrl, supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=cache_key");
}

// Cache-hit path: replay the stored records for this make within the widest
// analysis window. A superset of what a fresh fetch would return; the
// classifier and ladder narrow it exactly as they would live records.
async function fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation = null) {
  const startedAt = Date.now();
  const ladder = buildLadder(vehicle, generation);
  const maxWindow = Math.max(...ANALYSIS_WINDOWS_DAYS, ...SELLER_ACTIVITY_WINDOWS_DAYS);
  const cutoff = new Date(Date.now() - maxWindow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `vehicle_market_records?make=ilike.${encodeURIComponent(vehicle.make)}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=2000`
  );
  if (!rows || !rows.length) return null;
  const records = rows.map(row => row.raw_record).filter(record => record && typeof record === "object");
  if (!records.length) return null;
  return {
    records,
    passSummary: [{
      name: "market_fetch_cache",
      label: `stored ${vehicle.make} records from the last ${maxWindow} days`,
      rung: null,
      fetched: records.length,
      added: records.length,
      meteredRequests: 0,
      pagesFetched: 0,
      error: null
    }],
    stoppedEarly: false,
    stopReason: "market_fetch_cache_hit",
    elapsedMs: Date.now() - startedAt,
    timeBudgetMs: FETCH_TIME_BUDGET_MS,
    meteredRequests: 0,
    ladder,
    fromCache: true
  };
}

function getSellerCriteria(car = {}) {
  return {
    region: asText(car.region) || null,
    state: asText(car.state) || null,
    mileage: asText(car.mileage) || null,
    condition: asText(car.condition) || null,
    serviceRecords: asText(car.serviceRecords) || null,
    title: asText(car.title) || null,
    targetPrice: asText(car.targetPrice) || null,
    timeline: asText(car.timeline) || null,
    involvement: asText(car.involvement) || null,
    notes: asText(car.notes) || null
  };
}

function analyze(records, classifications, ladder, vehicle, debug) {
  const pairedRecords = records.map((record, index) => ({ record, classification: classifications[index] }));
  const maxWindow = ANALYSIS_WINDOWS_DAYS[ANALYSIS_WINDOWS_DAYS.length - 1];
  const { walk, landed, thin } = evaluateLadder(pairedRecords, ladder);
  const windowDays = landed?.windowDays ?? maxWindow;

  const inWindow = pairedRecords
    .filter(item => daysAgo(item.record.auction_end_date) <= windowDays)
    .filter(item => item.classification.comparison_tier !== "excluded");
  const excludedRecords = pairedRecords
    .filter(item => item.classification.comparison_tier === "excluded");
  const closeMatches = inWindow.filter(item => item.classification.comparison_tier === "close_match");
  const relevantMatches = inWindow.filter(item => ["close_match", "relevant_match"].includes(item.classification.comparison_tier));
  const broadMatches = inWindow.filter(item => item.classification.comparison_tier === "broad_match");

  // The evidence set is exactly what the landed rung defines. No rung with
  // evidence at all means the decision falls to the regional policy floor.
  const evidenceSet = landed
    ? pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= windowDays && ladderEligible(item, landed.definition)
      )
    : [];

  const platformMap = new Map();
  for (const item of evidenceSet) {
    const platform = recordPlatform(item.record);
    if (!platformMap.has(platform)) platformMap.set(platform, []);
    platformMap.get(platform).push(item);
  }

  // Momentum: the landed rung's comps in the prior equal-length window, per
  // platform. Only rendered when both windows carry a real sample.
  const priorWindowSet = landed
    ? pairedRecords.filter(item => {
        const age = daysAgo(item.record.auction_end_date);
        return age > windowDays && age <= windowDays * 2 && ladderEligible(item, landed.definition);
      })
    : [];

  const totalEvidenceSales = evidenceSet.length;
  const strongestSales = [...evidenceSet]
    .filter(item => Number.isFinite(Number(item.classification.price)))
    .sort((a, b) => Number(b.classification.price) - Number(a.classification.price))
    .slice(0, 3);

  // Price premium (Tier 1 claim): model-scoped only (never the make-context
  // rung), stepwise window widening 45 -> 90 -> 180 -> all-time, 5+ sold on
  // the platform AND 5+ sold elsewhere in the same window, rounded gap 10%+.
  // The numbers ship in the response as the claim's proof object.
  // Premium walk interleaves scope with window (locked): exact at 45, then
  // per window 90/180/all-time try the landed scope THEN the generation
  // scope, so a data-rich generation at 90 days beats exact-year at
  // all-time. Never a make scope: mixed models violate the Tier 1 gate.
  const premiumGenerationDef = landed
    ? ladder.find(rung => ["generation_model", "generation_trim"].includes(rung.key) && rung.rung > landed.rung)
    : null;
  // Same-make competitor segment (locked): a routing scope, never valuation.
  // Tried AFTER model and generation scopes, BEFORE the make last resort.
  // Never cross-brand; skipped silently when no segment is defined.
  const segmentDef = MODEL_SEGMENTS.find(seg =>
    seg.make.toLowerCase() === String(vehicle?.make || "").toLowerCase() &&
    seg.models.some(m => m.toLowerCase() === String(vehicle?.model || "").split(/\s+/)[0].toLowerCase()));
  const segmentEligible = item => {
    if (!segmentDef) return false;
    // Records arrive in two shapes: fresh OldCarsData rows (ocd_make_name/
    // ocd_model_name) and cache-served vehicle_market_records rows (make/
    // model). Same fallback chain as classifyRecord.
    const recordMake = asText(item.record.ocd_make_name || item.record.listing_make || item.record.make).toLowerCase();
    if (recordMake !== String(vehicle?.make || "").toLowerCase()) return false;
    const family = asText(item.record.ocd_model_name || item.record.listing_model || item.record.model).split(/\s+/)[0].toLowerCase();
    return segmentDef.models.some(m => m.toLowerCase() === family);
  };
  // Segment volume proof: first window where both sides clear the sample
  // gate; fuels the majority claim ("Most Audi sport-compact sales...").
  const segmentVolumeFor = platform => {
    if (!segmentDef) return null;
    for (const window of [45, 90, 180, 36500]) {
      const eligible = pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= window && segmentEligible(item));
      const mineSold = eligible.filter(item => recordPlatform(item.record) === platform).length;
      const othersSold = eligible.length - mineSold;
      if (mineSold >= 5 && othersSold >= 5) {
        return { mineSold, othersSold, windowDays: window, scope: "segment", segmentLabel: segmentDef.label, models: segmentDef.models };
      }
    }
    return null;
  };
  const premiumWalkTraces = debug ? {} : null;
  const pricePremiumFor = platform => {
    if (!landed || landed.key === "make_context") return null;
    const trace = premiumWalkTraces ? (premiumWalkTraces[platform] = []) : null;
    // A measured sub-10% gap at the first sample-sufficient step ships too:
    // the frontend renders it as the honest negligibility claim (Tier 1.5).
    let firstMeasured = null;
    for (const window of [45, 90, 180, 36500]) {
      const scopeDefs = window === 45 ? [landed.definition] : [landed.definition, premiumGenerationDef].filter(Boolean);
      for (const def of scopeDefs) {
        const eligible = pairedRecords.filter(item =>
          daysAgo(item.record.auction_end_date) <= window && ladderEligible(item, def));
        const mine = eligible.filter(item => recordPlatform(item.record) === platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const others = eligible.filter(item => recordPlatform(item.record) !== platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const step = trace ? { scope: def === landed.definition ? `landed(${landed.key})` : `generation(${def.generationCode || def.key})`, windowDays: window, mineSold: mine.length, othersSold: others.length } : null;
        const scopeTags = def === landed.definition ? {} : { scope: "generation", generationCode: def.generationCode || null };
        const boundary = window >= 3650 ? { earliestSaleDate: eligible.map(item => item.record.auction_end_date).filter(Boolean).sort()[0] || null } : {};
        // Asymmetric gate: when one platform IS the market (75%+ share with
        // 5+ sales and the locked 10+ total denominator), a symmetric
        // premium can't be computed against the thin "others" sample, but
        // the convergence itself is a real routing claim.
        const total = mine.length + others.length;
        const marketShare = total > 0 ? Math.round(mine.length / total * 100) : 0;
        if (mine.length >= 5 && marketShare >= 75 && total >= 10) {
          if (step) { step.gateType = "asymmetric"; step.marketShare = marketShare; step.samplesGatePass = true; step.landed = true; trace.push(step); }
          return { type: "market_dominance", gateType: "asymmetric", marketShare, percent: null, windowDays: window, platformSales: mine.length, othersSales: others.length, ...scopeTags, ...boundary };
        }
        if (mine.length >= 5 && others.length >= 5) {
          const gap = Math.round((median(mine) - median(others)) / median(others) * 100);
          if (step) { step.gateType = "symmetric"; step.gapPercent = gap; step.samplesGatePass = true; step.premiumGatePass = gap >= 10; trace.push(step); }
          const proof = {
            type: "premium", gateType: "symmetric",
            percent: gap, windowDays: window, platformSales: mine.length, othersSales: others.length,
            ...scopeTags, ...boundary
          };
          if (gap >= 10) { if (step) step.landed = true; return proof; }
          if (!firstMeasured) firstMeasured = proof;
          // keep walking: a later step may clear the 10% premium gate
        } else if (step) { step.samplesGatePass = false; trace.push(step); }
      }
    }
    // Segment steps (after model and generation scopes exhausted): the
    // premium may land here, always tagged with the segment label and its
    // model list. Segment never fills the Tier 1.5 negligibility slot: an
    // unlabeled segment-scope negligibility claim would violate scope
    // transparency.
    if (segmentDef) {
      for (const window of [45, 90, 180, 36500]) {
        const eligible = pairedRecords.filter(item =>
          daysAgo(item.record.auction_end_date) <= window && segmentEligible(item));
        const mine = eligible.filter(item => recordPlatform(item.record) === platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const others = eligible.filter(item => recordPlatform(item.record) !== platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const step = trace ? { scope: `segment(${segmentDef.key})`, windowDays: window, mineSold: mine.length, othersSold: others.length } : null;
        const segTags = { scope: "segment", segmentLabel: segmentDef.label, models: segmentDef.models };
        const segBoundary = window >= 3650 ? { earliestSaleDate: eligible.map(item => item.record.auction_end_date).filter(Boolean).sort()[0] || null } : {};
        const segTotal = mine.length + others.length;
        const segShare = segTotal > 0 ? Math.round(mine.length / segTotal * 100) : 0;
        if (mine.length >= 5 && segShare >= 75 && segTotal >= 10) {
          if (step) { step.gateType = "asymmetric"; step.marketShare = segShare; step.samplesGatePass = true; step.landed = true; trace.push(step); }
          return { type: "market_dominance", gateType: "asymmetric", marketShare: segShare, percent: null, windowDays: window, platformSales: mine.length, othersSales: others.length, ...segTags, ...segBoundary };
        }
        if (mine.length >= 5 && others.length >= 5) {
          const gap = Math.round((median(mine) - median(others)) / median(others) * 100);
          if (step) { step.gateType = "symmetric"; step.gapPercent = gap; step.samplesGatePass = true; step.premiumGatePass = gap >= 10; trace.push(step); }
          if (gap >= 10) {
            if (step) step.landed = true;
            return { type: "premium", gateType: "symmetric", percent: gap, windowDays: window, platformSales: mine.length, othersSales: others.length, ...segTags, ...segBoundary };
          }
        } else if (step) { step.samplesGatePass = false; trace.push(step); }
      }
    }
    return firstMeasured;
  };

  // Platform-scoped day advantage (locked): computed over THIS platform's
  // sales only, weekdays only (Saturday/Sunday excluded from both the best
  // day and the comparison base), model scope with make fallback. Cars &
  // Bids never gets one (no weekend auctions; the frontend also skips it).
  const platformDayAdvantage = platform => {
    const weekdaysOnly = list => list.filter(item => {
      const day = weekdayName(item.record.auction_end_date);
      return day && day !== "Saturday" && day !== "Sunday";
    });
    const gate = insight => insight && insight.strongestWeekdaySales >= 3 && insight.strongestWeekdayLiftPercent >= 10
      && !["Saturday", "Sunday"].includes(insight.strongestWeekday);
    const modelInsight = strongestWeekdayInsight(weekdaysOnly(pairedRecords.filter(item =>
      recordPlatform(item.record) === platform && ["close_match", "relevant_match"].includes(item.classification?.comparison_tier))));
    if (gate(modelInsight)) return { weekday: modelInsight.strongestWeekday, sales: modelInsight.strongestWeekdaySales, liftPercent: modelInsight.strongestWeekdayLiftPercent, scope: "model", window: "all_time" };
    const makeInsight = strongestWeekdayInsight(weekdaysOnly(pairedRecords.filter(item =>
      recordPlatform(item.record) === platform && item.classification?.comparison_tier && item.classification.comparison_tier !== "excluded")));
    if (gate(makeInsight)) return { weekday: makeInsight.strongestWeekday, sales: makeInsight.strongestWeekdaySales, liftPercent: makeInsight.strongestWeekdayLiftPercent, scope: "make", window: "all_time" };
    return null;
  };

  let platformPerformance = [...platformMap.entries()]
    .map(([platform, items]) => {
      const weekdayInsight = strongestWeekdayInsight(items);
      const otherPrices = evidenceSet
        .filter(item => recordPlatform(item.record) !== platform)
        .map(item => item.classification.price)
        .filter(Number.isFinite);
      const recentPrices = items.map(item => item.classification.price).filter(Number.isFinite);
      const priorPrices = priorWindowSet
        .filter(item => recordPlatform(item.record) === platform)
        .map(item => item.classification.price)
        .filter(Number.isFinite);
      const momentum = recentPrices.length >= 3 && priorPrices.length >= 3
        ? {
            percent: Math.round((median(recentPrices) - median(priorPrices)) / median(priorPrices) * 100),
            recentSales: recentPrices.length,
            priorSales: priorPrices.length,
            windowDays
          }
        : null;
      return {
        momentum,
        platform,
        pricePremium: pricePremiumFor(platform),
        segmentVolume: segmentVolumeFor(platform),
        dayAdvantage: platformDayAdvantage(platform),
        // Typical price band of THIS platform's comps (25th-75th pct): fuels
        // the car-specific alternative bullet. A range, never a median.
        priceBand: (() => {
          const prices = items.map(item => Number(item.classification.price)).filter(Number.isFinite).sort((a, b) => a - b);
          if (prices.length < 2) return null;
          const q = f => prices[Math.max(0, Math.min(prices.length - 1, Math.round(f * (prices.length - 1))))];
          return { low: q(0.25), high: q(0.75), sample: prices.length };
        })(),
        evidenceSales: items.length,
        totalEvidenceSales,
        othersSalesCount: otherPrices.length,
        othersMedianSalePrice: median(otherPrices),
        evidenceSharePercent: totalEvidenceSales ? Math.round(items.length / totalEvidenceSales * 100) : null,
        relevantSales: items.filter(item => ["close_match", "relevant_match"].includes(item.classification.comparison_tier)).length,
        closeSales: items.filter(item => item.classification.comparison_tier === "close_match").length,
        broadSales: items.filter(item => item.classification.comparison_tier === "broad_match").length,
        trimSales: items.filter(item => item.classification.trim_match).length,
        topThreeSales: strongestSales.filter(item => recordPlatform(item.record) === platform).length,
        medianSalePrice: median(items.map(item => item.classification.price)),
        averageBids: median(items
          .map(item => recordNumber(item.record, ["bid_count", "bids_count", "bids", "num_bids", "number_of_bids"]))
          .filter(Number.isFinite)),
        ...weekdayInsight,
        highestResultWeekday: weekdayName([...items]
          .filter(item => Number.isFinite(Number(item.classification.price)))
          .sort((a, b) => Number(b.classification.price) - Number(a.classification.price))[0]?.record?.auction_end_date),
        latestSaleDate: items
          .map(item => item.record.auction_end_date)
          .filter(Boolean)
          .sort()
          .at(-1) || null
      };
    })
    .sort((a, b) => {
      if (b.evidenceSales !== a.evidenceSales) return b.evidenceSales - a.evidenceSales;
      if (b.closeSales !== a.closeSales) return b.closeSales - a.closeSales;
      return (b.medianSalePrice || 0) - (a.medianSalePrice || 0);
    });

  platformPerformance = platformPerformance.map(platform => {
    const nextBest = platformPerformance
      .filter(other => other.platform !== platform.platform && other.medianSalePrice)
      .sort((a, b) => (b.medianSalePrice || 0) - (a.medianSalePrice || 0))[0];
    const delta = platform.medianSalePrice && nextBest?.medianSalePrice
      ? Math.round((platform.medianSalePrice - nextBest.medianSalePrice) / nextBest.medianSalePrice * 100)
      : null;
    return {
      ...platform,
      nextSupportedPlatform: nextBest?.platform || null,
      performanceDeltaPercent: delta
    };
  });

  // Historical day advantage: best weekday over ALL fetched sales (no
  // window), model scope first, make scope as the honest fallback. The
  // frontend gates at 3+ sales and 10%+ lift and must say "historically".
  const historicalWeekday = (() => {
    const passesGate = insight => insight && insight.strongestWeekdaySales >= 3 && insight.strongestWeekdayLiftPercent >= 10;
    const modelInsight = strongestWeekdayInsight(pairedRecords.filter(item =>
      ["close_match", "relevant_match"].includes(item.classification?.comparison_tier)));
    if (passesGate(modelInsight)) return {
      weekday: modelInsight.strongestWeekday, sales: modelInsight.strongestWeekdaySales,
      liftPercent: modelInsight.strongestWeekdayLiftPercent, scope: "model", window: "all_time"
    };
    const makeInsight = strongestWeekdayInsight(pairedRecords.filter(item =>
      item.classification?.comparison_tier && item.classification.comparison_tier !== "excluded"));
    if (passesGate(makeInsight)) return {
      weekday: makeInsight.strongestWeekday, sales: makeInsight.strongestWeekdaySales,
      liftPercent: makeInsight.strongestWeekdayLiftPercent, scope: "make", window: "all_time"
    };
    return null;
  })();

  return {
    analysisDate: analysisDateForSeller(),
    windowDays,
    historicalWeekday,
    recordsFetched: records.length,
    recordsAnalyzed: inWindow.length,
    closeMatches: closeMatches.length,
    relevantMatches: relevantMatches.length,
    broadMatches: broadMatches.length,
    excludedRecords: excludedRecords.length,
    excludedReasons: summarizeExclusions(excludedRecords),
    evidenceLevel: landed ? landed.key : "none",
    evidenceLabel: landed ? landed.label : "no comparable sales in tracked auction data",
    evidenceSales: evidenceSet.length,
    estimatedValue: median(evidenceSet.map(item => item.classification.price)),
    // Earliest boundary of the ladder-eligible set (all-time): the "since
    // YYYY" label on all-time claims must name a verifiable date.
    earliestSaleDate: landed
      ? pairedRecords.filter(item => ladderEligible(item, landed.definition))
          .map(item => item.record.auction_end_date).filter(Boolean).sort()[0] || null
      : null,
    thinMarket: thin || !landed || evidenceSet.length < landed.threshold,
    ladder: {
      landed: landed ? {
        rung: landed.rung,
        key: landed.key,
        label: landed.label,
        windowDays,
        sales: evidenceSet.length,
        effectiveSample: landed.effectiveSample ?? null,
        threshold: landed.threshold,
        thresholdMet: landed.met
      } : null,
      rungs: walk.map(({ rung, key, label, sales, effectiveSample, threshold, met }) => ({ rung, key, label, sales, effectiveSample, threshold, met })),
      policyFloorRung: walk.length + 1
    },
    // Internal confidence (locked: engine telemetry, NEVER rendered and
    // never a reason to hedge a recommendation).
    internalConfidence: (() => {
      if (!landed || !evidenceSet.length) return null;
      const ages = evidenceSet.map(item => daysAgo(item.record.auction_end_date));
      const recencySample = Math.round(ages.filter(a => a <= 90).reduce((sum, a) => sum + getRecencyMultiplier(a), 0) * 10) / 10;
      const counts = {};
      for (const item of evidenceSet) counts[recordPlatform(item.record)] = (counts[recordPlatform(item.record)] || 0) + 1;
      const score = calculateConfidenceScore({
        recencySample,
        totalSample: landed.effectiveSample ?? evidenceSet.length,
        platformDominance: getPlatformDominanceScore(counts),
        outcomeSample: evidenceSet.length
      });
      return { score, level: getConfidenceLevel(score) };
    })(),
    platformPerformance,
    sellerActivity: analyzeSellerActivity(pairedRecords),
    debugPremiumWalk: premiumWalkTraces || undefined,
    // Request-gated diagnostics (body.debug === true): per-window eligible
    // counts, pairwise premium math and earliest dates. Never rendered.
    debugWindows: debug && landed ? [45, 90, 180, 36500].map(window => {
      const eligible = pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= window && ladderEligible(item, landed.definition));
      const perPlatform = {};
      for (const item of eligible) {
        const platform = recordPlatform(item.record);
        if (!perPlatform[platform]) perPlatform[platform] = { sales: 0, prices: [], earliest: null, years: [] };
        perPlatform[platform].sales++;
        const price = Number(item.classification.price);
        if (Number.isFinite(price)) perPlatform[platform].prices.push(price);
        const date = item.record.auction_end_date;
        if (date && (!perPlatform[platform].earliest || date < perPlatform[platform].earliest)) perPlatform[platform].earliest = date;
        perPlatform[platform].years.push(Number(item.record.year) || item.record.year || null);
      }
      const premiums = {};
      for (const platform of Object.keys(perPlatform)) {
        const mine = perPlatform[platform].prices;
        const others = Object.entries(perPlatform).filter(([key]) => key !== platform).flatMap(([, value]) => value.prices);
        premiums[platform] = mine.length && others.length
          ? { gapPercent: Math.round((median(mine) - median(others)) / median(others) * 100), mineSold: mine.length, othersSold: others.length }
          : null;
      }
      return {
        windowDays: window,
        total: eligible.length,
        perPlatform: Object.fromEntries(Object.entries(perPlatform).map(([key, value]) => [key, { sales: value.sales, earliest: value.earliest, years: value.years, prices: [...value.prices].sort((a, b) => a - b) }])),
        premiums
      };
    }) : undefined
  };
}

function sellerActivityLabel(stats) {
  if (stats.relevantSales270 >= 9 || stats.relevantSales180 >= 6) return "high_activity_seller";
  if (stats.relevantSales180 >= 3 || stats.relevantSales90 >= 3) return "active_specialist";
  return "limited_signal";
}

function analyzeSellerActivity(pairedRecords) {
  const maxWindow = Math.max(...SELLER_ACTIVITY_WINDOWS_DAYS);
  const groups = new Map();

  for (const item of pairedRecords) {
    if (item.classification.comparison_tier === "excluded") continue;
    if (daysAgo(item.record.auction_end_date) > maxWindow) continue;

    const sellerUsername = recordSellerUsername(item.record);
    if (!sellerUsername) continue;

    const platform = recordPlatform(item.record);
    const key = `${platform}|${sellerUsername}`;
    if (!groups.has(key)) {
      groups.set(key, {
        platform,
        sellerUsername,
        items: []
      });
    }
    groups.get(key).items.push(item);
  }

  const sellers = [...groups.values()].map(group => {
    const stats = {
      platform: group.platform,
      sellerUsername: group.sellerUsername,
      sales90: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 90).length,
      sales180: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 180).length,
      sales270: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 270).length,
      relevantSales90: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 90 && ["close_match", "relevant_match"].includes(item.classification.comparison_tier)).length,
      relevantSales180: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 180 && ["close_match", "relevant_match"].includes(item.classification.comparison_tier)).length,
      relevantSales270: group.items.filter(item => daysAgo(item.record.auction_end_date) <= 270 && ["close_match", "relevant_match"].includes(item.classification.comparison_tier)).length,
      closeSales: group.items.filter(item => item.classification.comparison_tier === "close_match").length,
      broadSales: group.items.filter(item => item.classification.comparison_tier === "broad_match").length,
      medianSalePrice: median(group.items.map(item => item.classification.price)),
      latestSaleDate: group.items
        .map(item => item.record.auction_end_date)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
      consignmentStatus: "unknown",
      recommendableToUser: false
    };

    return {
      ...stats,
      activityLabel: sellerActivityLabel(stats)
    };
  }).sort((a, b) => {
    if (b.closeSales !== a.closeSales) return b.closeSales - a.closeSales;
    if (b.relevantSales270 !== a.relevantSales270) return b.relevantSales270 - a.relevantSales270;
    return b.sales270 - a.sales270;
  });

  const platformSummary = sellers.reduce((summary, seller) => {
    if (!summary[seller.platform]) {
      summary[seller.platform] = {
        highActivitySellers: 0,
        activeSpecialists: 0,
        sellersObserved: 0
      };
    }
    summary[seller.platform].sellersObserved++;
    if (seller.activityLabel === "high_activity_seller") summary[seller.platform].highActivitySellers++;
    if (seller.activityLabel === "active_specialist") summary[seller.platform].activeSpecialists++;
    return summary;
  }, {});

  return {
    windowsDays: SELLER_ACTIVITY_WINDOWS_DAYS,
    note: "Seller activity is market-observed only. Consignment fit is unknown unless separately verified.",
    platformSummary,
    topObservedSellers: sellers.slice(0, 10)
  };
}

function summarizeExclusions(excludedRecords) {
  const counts = new Map();
  for (const item of excludedRecords) {
    for (const reason of item.classification.exclusion_reasons || ["excluded"]) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function decisionTradeoffs(criteria) {
  const tradeoffs = [];
  const timeline = asText(criteria.timeline).toLowerCase();
  const involvement = asText(criteria.involvement).toLowerCase();

  if (timeline.includes("fast") || timeline.includes("month")) {
    tradeoffs.push("Seller timeline favors routes that can get live quickly, so slower auction processes should be weighed against likely sale result.");
  }
  if (involvement.includes("handle") || involvement.includes("hands-off")) {
    tradeoffs.push("Seller prefers a hands-off route; power-seller fit should be checked before final handoff because this dataset currently ranks platforms, not individual sellers.");
  }
  if (involvement.includes("manage") || involvement.includes("control")) {
    tradeoffs.push("Seller is comfortable managing the process, so a direct listing may be viable if platform evidence is otherwise strong.");
  }

  return tradeoffs;
}

// Honest confidence, mapped from the ladder rung the analysis landed on.
// Generation rungs map like their calendar counterparts: same-generation
// comps carry the same weight as the +/- 2-year window they replace.
function ladderConfidence(analysis) {
  const landed = analysis.ladder?.landed;
  if (!landed || !landed.thresholdMet) return "low";
  const sales = analysis.evidenceSales;
  if (["exact_year_trim", "near_years_trim", "generation_trim", "year_range_trim", "exact_year_model"].includes(landed.key)) {
    return sales >= 5 ? "high" : "medium";
  }
  if (["any_year_trim", "near_years_model", "generation_model", "year_range_model"].includes(landed.key)) return "medium";
  if (landed.key === "any_year_model") return sales >= 8 ? "medium" : "low";
  return "low";
}

// Structured fact about the widening, for Sam to narrate. Only present when
// the analysis landed below the top rung.
// Counts under 10 never render anywhere (locked): small numbers read as
// weakness, so the widening stays honest about scope but qualitative.
function countPhrase(count, noun) {
  return count >= 10 ? `${count} ${noun}` : `recent ${noun}`;
}

function wideningFact(analysis) {
  const ladder = analysis.ladder;
  const landed = ladder?.landed;
  if (!landed || landed.rung <= 1) return null;
  const countText = landed.sales >= 10 ? `: ${landed.sales} sales ${windowLabel(landed.windowDays)}` : "";
  return `The analysis looked at ${landed.label}${countText}.`;
}

function decide(analysis, criteria, vehicle) {
  const routeFit = analyzeRouteFit(analysis, criteria, vehicle);
  const bestRoute = routeFit.routes.find(route => route.routable) || routeFit.routes[0] || null;
  // Coherence fact: a non-routable source with a stronger median than the pick
  // must be explained, never silently presented as "stronger but not chosen".
  const pickMedian = bestRoute?.marketEvidence?.medianSalePrice || null;
  const strongerNonRoutable = routeFit.routes.find(route =>
    !route.routable && route.marketEvidence?.evidenceSales > 0 &&
    route.marketEvidence?.medianSalePrice && pickMedian &&
    route.marketEvidence.medianSalePrice > pickMedian
  ) || null;
  const powerSellerReferral = analyzePowerSellerReferral(analysis, criteria);
  const tradeoffs = decisionTradeoffs(criteria);

  if (!analysis.evidenceSales || !bestRoute) {
    // Bottom rung of the ladder: the regional policy floor. Always returns a
    // recommendation, clearly labeled as policy fit rather than market data.
    const policyRoute = bestRoute || {
      platform: ROUTE_POLICIES.bringatrailer.label,
      policyKey: "bringatrailer"
    };
    return {
      recommendedPath: policyRoute.platform,
      confidence: "low",
      evidenceBasis: "regional_policy",
      ladder: analysis.ladder,
      why: [
        `${policyRoute.platform} is the strongest route-policy fit for this car and the stated seller priorities.`,
        "No comparable recent sales were found in the tracked auction sources, so this is regional policy fit, not market evidence."
      ],
      tradeoffs,
      powerSellerReferral,
      routeFit,
      limitations: [
        "No comparable recent sales in the tracked auction data. This recommendation is route policy for the region and car segment, labeled as policy rather than data."
      ]
    };
  }

  const best = bestRoute.marketEvidence || analysis.platformPerformance[0];

  return {
    recommendedPath: bestRoute.platform,
    confidence: ladderConfidence(analysis),
    evidenceBasis: "market_evidence",
    strongerNonRoutable: strongerNonRoutable ? {
      platform: strongerNonRoutable.platform,
      medianSalePrice: strongerNonRoutable.marketEvidence.medianSalePrice,
      evidenceSales: strongerNonRoutable.marketEvidence.evidenceSales
    } : null,
    ladder: analysis.ladder,
    why: [
      bestRoute.marketEvidence
        ? `${bestRoute.platform} is the strongest combined fit from market signal and seller priorities.`
        : `${bestRoute.platform} is the strongest route-fit option for the stated priorities, while live market evidence is stronger on ${best.platform}.`,
      `${best.platform} has the clearest recent support in the selected ${analysis.windowDays}-day window of ${analysis.evidenceLabel}.`,
      wideningFact(analysis),
      best.closeSales >= 10 ? `${best.closeSales} of those were close matches to the searched car.` : null,
      sellerActivityExplanation(analysis.sellerActivity, best.platform)
    ].filter(Boolean),
    tradeoffs,
    powerSellerReferral,
    routeFit,
    limitations: analysis.thinMarket
      ? [`Evidence at this rung is thin (${analysis.evidenceSales} sales); treat the decision as directional, not definitive.`]
      : []
  };
}

function analyzePowerSellerReferral(analysis, criteria) {
  const targetPrice = parseSellerTargetPrice(criteria.targetPrice);
  const marketMedian = median((analysis.platformPerformance || []).map(platform => platform.medianSalePrice));
  const targetIsSixFigures = Number.isFinite(targetPrice) && targetPrice >= 100000;
  const marketLooksSixFigures = Number.isFinite(marketMedian) && marketMedian >= 100000;
  const activeSellerSignals = Object.values(analysis.sellerActivity?.platformSummary || {})
    .reduce((total, summary) => total + summary.highActivitySellers + summary.activeSpecialists, 0);
  const shouldEvaluate = targetIsSixFigures || marketLooksSixFigures;

  return {
    shouldEvaluate,
    recommendableNow: false,
    trigger: targetIsSixFigures
      ? "seller_target_price_six_figures"
      : marketLooksSixFigures
        ? "market_evidence_six_figures"
        : null,
    sellerTargetPrice: targetPrice,
    marketMedian,
    activeSellerSignals,
    constraints: shouldEvaluate
      ? ["verified_consignment_status_required", "region_required", "minimum_value_required", "seller_availability_required"]
      : [],
    reasonFacts: [
      targetIsSixFigures ? "seller_target_price_is_six_figures" : null,
      marketLooksSixFigures ? "market_evidence_supports_six_figure_context" : null,
      shouldEvaluate ? "power_seller_route_generally_relevant_for_six_figure_listings" : null,
      activeSellerSignals ? "active_seller_signals_observed" : null
    ].filter(Boolean)
  };
}

// ---- Partner (PowerSeller) referral layer ----
// Partners live in the Supabase partners table. Their claims carry sources:
// partner_provided renders with attribution; data_verified is computed here
// from vehicle_market_records at request time. Leading with a partner is
// gated on value, segment, region, and an active matching partner.

let partnersCache = { loadedAt: 0, rows: null };

async function loadActivePartners(supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) return [];
  if (partnersCache.rows && Date.now() - partnersCache.loadedAt < 10 * 60 * 1000) return partnersCache.rows;
  const rows = await supabaseSelect({ supabaseUrl, supabaseKey }, "partners?active=is.true&select=*&limit=50");
  if (!rows) return [];
  partnersCache = { loadedAt: Date.now(), rows };
  return partnersCache.rows;
}

// Career-wide partner stats (locked principle): computed over the partner's
// ENTIRE tracked history via seller usernames, never scoped to the current
// search's comparable records. Raw slices are stripped before the response;
// the relevance line is the one request-time connection to the current car.
async function partnerVerifiedStats(partner, vehicle, estimatedValue, supabaseUrl, supabaseKey) {
  const usernames = (partner.seller_usernames || []).filter(Boolean);
  const empty = { trackedSales: 0, belowCareerMinimum: true, medianSaleValue: null, sellThrough: null, makeMix: null, relevance: null, latestSaleDate: null };
  if (!usernames.length || !supabaseUrl || !supabaseKey) return empty;
  const career = await computePartnerCareerStats(usernames, { supabaseUrl, supabaseKey });
  if (!career) return empty;
  let sellThrough = career.sellThrough;
  if (sellThrough?.platform) {
    const baselines = await computePlatformBaselines({ supabaseUrl, supabaseKey });
    const baselinePercent = baselines?.[sellThrough.platform]?.sellThroughPercent;
    if (baselinePercent != null) sellThrough = { ...sellThrough, baselinePercent };
  }
  return {
    trackedSales: career.trackedSales,
    latestSaleDate: career.latestSaleDate,
    medianSaleValue: career.medianSaleValue,
    sellThrough,
    makeMix: career.makeMix,
    belowCareerMinimum: career.belowCareerMinimum,
    relevance: partnerRelevance(career, vehicle, estimatedValue)
  };
}

function partnerRegionCovered(partner, criteria) {
  const regions = (partner.regions || []).map(region => String(region).toLowerCase());
  if (!regions.length) return false;
  const sellerRegion = asText(criteria.region).toLowerCase();
  const sellerState = asText(criteria.state).toLowerCase();
  if (sellerState && regions.some(region => region === sellerState || region.includes(sellerState) || sellerState.includes(region))) return true;
  const isUs = !sellerRegion || sellerRegion === "us" || sellerRegion === "usa" || sellerRegion === "united states";
  if (isUs && regions.includes("nationwide")) return true;
  if (sellerRegion && regions.some(region => region.includes(sellerRegion) || sellerRegion.includes(region))) return true;
  return false;
}

function partnerSegmentMatch(partner, vehicle, priorities) {
  const makes = (partner.specialties?.makes || []).map(make => String(make).toLowerCase());
  if (makes.includes(asText(vehicle.make).toLowerCase())) return true;
  const segments = partner.specialties?.segments || [];
  return priorities.segments.some(segment => segments.includes(segment));
}

async function evaluatePartnerReferral(analysis, criteria, vehicle, supabaseUrl, supabaseKey) {
  const partners = await loadActivePartners(supabaseUrl, supabaseKey);
  const priorities = inferSellerPriorities(vehicle, criteria);
  // Value must come from actual comps at a met rung, never thin or policy data.
  const landedMet = !!analysis.ladder?.landed?.thresholdMet;
  const estimatedValue = landedMet && Number.isFinite(analysis.estimatedValue) ? analysis.estimatedValue : null;
  const valueMet = Number.isFinite(estimatedValue) && estimatedValue >= POWERSELLER_MIN_VALUE_USD;

  let matched = null;
  let anySegment = false;
  let anyRegion = false;
  for (const partner of partners) {
    const segmentMet = partnerSegmentMatch(partner, vehicle, priorities);
    const regionMet = partnerRegionCovered(partner, criteria);
    anySegment = anySegment || segmentMet;
    anyRegion = anyRegion || regionMet;
    if (!matched && segmentMet && regionMet) matched = partner;
  }
  // A partner whose specialization does not list the searched make needs
  // real tracked relevance for it (5+ sales) or the gate closes: a
  // mismatched card is worse than no card.
  if (matched && vehicle?.make) {
    const makeListed = (matched.specialties?.makes || []).map(m => String(m).toLowerCase()).includes(String(vehicle.make).toLowerCase());
    if (!makeListed) {
      const usernames = (matched.seller_usernames || []).filter(Boolean);
      const career = usernames.length ? await computePartnerCareerStats(usernames, { supabaseUrl, supabaseKey }) : null;
      if ((career?.rowsByMake?.[vehicle.make] || 0) < 5) matched = null;
    }
  }
  const eligible = !!(valueMet && matched);
  // Secondary mention (locked, updated July 2026): a $50k+ context (met-
  // comps estimate or the seller's asking price) ALWAYS shows the partner
  // as a secondary card when a region-covered active partner exists, even
  // without a segment match; the make-specific why-line falls back to his
  // attributed specialty note, so nothing mismatched is claimed. Leading
  // keeps the full gate. Never the lead, single destination unchanged,
  // service framing only.
  const askingPrice = parseSellerTargetPrice(criteria.targetPrice);
  const secondaryValue = Math.max(
    Number.isFinite(estimatedValue) ? estimatedValue : 0,
    Number.isFinite(askingPrice) ? askingPrice : 0
  );
  const secondaryPartner = matched || partners.find(partner => partnerRegionCovered(partner, criteria)) || null;
  const secondary = !eligible && !!secondaryPartner && secondaryValue >= 50000;

  const result = {
    eligible,
    secondary,
    secondaryMinUsd: 50000,
    minValueUsd: POWERSELLER_MIN_VALUE_USD,
    estimatedValue,
    conditions: {
      valueMet,
      segmentMet: anySegment,
      regionMet: anyRegion,
      partnerAvailable: partners.length > 0
    },
    partner: null
  };
  if (eligible || secondary) {
    const source = eligible ? matched : secondaryPartner;
    result.partner = {
      slug: source.slug,
      name: source.name,
      displayName: source.display_name || source.name,
      regions: source.regions || [],
      specialties: source.specialties || {},
      platforms: source.platforms || [],
      serviceClaims: source.service_claims || [],
      referralTerms: source.referral_terms || null,
      verified: await partnerVerifiedStats(source, vehicle, analysis.estimatedValue, supabaseUrl, supabaseKey)
    };
  }
  return result;
}

function sellerActivityExplanation(sellerActivity, platform) {
  const summary = sellerActivity?.platformSummary?.[platform];
  if (!summary) return null;
  const activeCount = summary.highActivitySellers + summary.activeSpecialists;
  if (!activeCount) return null;
  return `${platform} also showed ${activeCount} active seller signal${activeCount === 1 ? "" : "s"} in this segment, but consignment fit is not assumed.`;
}

async function lookupMarketRecordIds(records, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey || !records.length) return {};
  const ids = [...new Set(records.map(sourceRecordId).filter(Boolean))];
  if (!ids.length) return {};

  const idsParam = ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(",");
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `vehicle_market_records?source_record_id=in.(${idsParam})&select=id,source,source_record_id`
  );
  if (!rows) return {};
  return Object.fromEntries(rows.map(row => [sourceRecordKey(row.source, String(row.source_record_id)), row.id]));
}

async function persistRawRecords(records, supabaseUrl, supabaseKey) {
  const batchId = crypto.randomUUID();
  const rows = records.map(record => ({
    source: recordPlatform(record),
    source_record_id: sourceRecordId(record) || crypto.randomUUID(),
    source_url: record.url || record.listing_url || null,
    platform: recordPlatform(record),
    // NOT NULL columns; a null used to kill the whole batch (rule 5 violation)
    ...persistableMakeModel(record),
    year: record.year || null,
    raw_title: record.title || record.listing_title || null,
    price: normalizeMoney(record),
    auction_status: record.auction_status || record.status || null,
    auction_end_date: record.auction_end_date || null,
    seller_username: record.seller_username || null,
    raw_record: record,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId
  }));
  const insertResult = await supabaseInsert(
    "vehicle_market_records",
    rows,
    supabaseUrl,
    supabaseKey,
    "resolution=ignore-duplicates,return=minimal",
    "?on_conflict=source,source_record_id"
  );
  const idLookup = await lookupMarketRecordIds(records, supabaseUrl, supabaseKey);
  return { ...insertResult, idLookup };
}

async function persistClassifications(records, classifications, idLookup, supabaseUrl, supabaseKey) {
  const batchId = crypto.randomUUID();
  const rows = records.map((record, index) => ({
    market_record_id: idLookup?.[sourceRecordKey(recordPlatform(record), sourceRecordId(record))] || null,
    source_record_id: sourceRecordId(record),
    normalized_make: classifications[index].normalized_make,
    normalized_model: classifications[index].normalized_model,
    normalized_year: classifications[index].normalized_year,
    searched_year: classifications[index].searched_year,
    searched_color: classifications[index].searched_color,
    target_match: classifications[index].target_match,
    comparison_tier: classifications[index].comparison_tier,
    exclusion_reasons: classifications[index].exclusion_reasons,
    classification_confidence: classifications[index].classification_confidence,
    classification_source: classifications[index].classification_source,
    matched_terms: classifications[index].matched_terms,
    needs_review: classifications[index].needs_review,
    classifier_version: 1,
    classified_at: new Date().toISOString(),
    classification_batch_id: batchId
  }));
  const result = await supabaseInsert("vehicle_classifications", rows, supabaseUrl, supabaseKey);
  if (result.error?.includes("exclusion_reasons")) {
    const fallbackRows = rows.map(({ exclusion_reasons, ...row }) => row);
    const fallbackResult = await supabaseInsert("vehicle_classifications", fallbackRows, supabaseUrl, supabaseKey);
    return {
      ...fallbackResult,
      warning: "exclusion_reasons column missing; classifications saved without exclusion reasons"
    };
  }
  return result;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OLDCARSDATA_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey) return res.status(500).json({ error: "OldCarsData API key not configured" });

  const car = typeof req.body?.car === "object" ? req.body.car : {};
  const sellerCriteria = getSellerCriteria(car);
  const rawSearch = req.body?.car?.raw || req.body?.car?.vehicle?.raw || req.body?.car || req.body?.search || req.body?.query;
  if (!rawSearch && !car.vehicle) return res.status(400).json({ error: "Missing car/search field" });

  try {
    // The frontend validates with vehicleIdentity and passes the resolved
    // vehicle object through; parsing happens once. Raw text is only re-resolved
    // (same shared resolver) when a caller skips that step.
    let vehicle = sanitizeResolvedVehicle(car.vehicle);
    if (!vehicle) {
      const resolution = await resolveVehicle(rawSearch);
      if (resolution.status !== "valid") {
        return res.status(200).json({
          status: "needs_clarification",
          vehicle: resolution.vehicle,
          clarification: resolution.clarification || {
            question: "What year, make and model are you selling?"
          }
        });
      }
      vehicle = resolution.vehicle;
    }

    // Generation mapping (Phase 4): null is safe and means the ladder keeps
    // its calendar +/- 2 rungs, exactly as unmapped models behave today.
    const generation = await findGeneration(vehicle, { supabaseUrl, supabaseKey });

    // Free structural preview for smoke tests: the ladder that WOULD be
    // walked, with zero metered fetches and zero writes.
    if (req.body?.ladderPreview) {
      return res.status(200).json({
        status: "ladder_preview",
        vehicle,
        generation: generation ? { code: generation.code, yearStart: generation.yearStart, yearEnd: generation.yearEnd } : null,
        ladder: buildLadder(vehicle, generation).map(({ rung, key, label, threshold, yearMin, yearMax, maxYearGap }) =>
          ({ rung, key, label, threshold, yearMin: yearMin ?? null, yearMax: yearMax ?? null, maxYearGap: maxYearGap ?? null }))
      });
    }

    let fetchResult = null;
    let cacheStatus = "miss";
    if (await readMarketFetchCache(vehicle, supabaseUrl, supabaseKey)) {
      fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
      cacheStatus = fetchResult ? "hit" : "hit_store_empty_refetched";
    }
    if (!fetchResult) {
      const usedToday = await ocdRequestsToday(supabaseUrl, supabaseKey);
      if (usedToday !== null && usedToday >= OCD_DAILY_REQUEST_BUDGET) {
        // Loud log, soft degrade: no metered spend past plan pace.
        console.error(`OCD daily budget reached: ${usedToday}/${OCD_DAILY_REQUEST_BUDGET} metered requests today`);
        await recordUsageEvent({
          event_type: "ocd_budget_guard",
          route: "/api/sellerDecision",
          status: "soft_degraded",
          search_text: rawSearch,
          oldcarsdata_metered_requests: 0,
          duration_ms: 0,
          metadata: { ...requestMetadata(req), usedToday, dailyBudget: OCD_DAILY_REQUEST_BUDGET }
        }, supabaseUrl, supabaseKey);
        fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
        if (fetchResult) {
          fetchResult.stopReason = "ocd_daily_budget_reached";
          cacheStatus = "budget_degraded_store";
        } else {
          fetchResult = {
            records: [],
            passSummary: [],
            stoppedEarly: true,
            stopReason: "ocd_daily_budget_reached",
            elapsedMs: 0,
            timeBudgetMs: FETCH_TIME_BUDGET_MS,
            meteredRequests: 0,
            ladder: buildLadder(vehicle, generation),
            fromCache: true
          };
          cacheStatus = "budget_degraded_empty";
        }
      }
    }
    if (!fetchResult) {
      fetchResult = await fetchRecentRecords(vehicle, apiKey, generation);
      // Only cache a healthy fetch: an all-errored pass with nothing fetched
      // must retry next search, not lock in 24h of emptiness.
      const fetchHealthy = fetchResult.records.length > 0 || fetchResult.passSummary.every(pass => !pass.error);
      if (fetchHealthy) await writeMarketFetchCache(vehicle, fetchResult.meteredRequests, supabaseUrl, supabaseKey);
    }
    const records = fetchResult.records;
    const classifications = records.map(record => classifyRecord(record, vehicle));
    // Cache hits replay rows already stored permanently; re-inserting them
    // would be a no-op POST of up to 2000 rows, so only the id lookup runs.
    const rawPersistence = fetchResult.fromCache
      ? { skipped: true, cached: true, idLookup: await lookupMarketRecordIds(records, supabaseUrl, supabaseKey) }
      : await persistRawRecords(records, supabaseUrl, supabaseKey);
    const classificationPersistence = await persistClassifications(records, classifications, rawPersistence.idLookup, supabaseUrl, supabaseKey);
    const analysis = analyze(records, classifications, fetchResult.ladder, vehicle, req.body?.debug === true);

    // Segment sell-through per platform, from the full-dataset baselines.
    // Null until the dataset carries non-sold listings; the frontend omits
    // the dimension rather than padding it.
    const baselines = await computePlatformBaselines({ supabaseUrl, supabaseKey });
    const segmentBand = priceBand(analysis.estimatedValue);
    if (baselines && segmentBand) {
      analysis.platformPerformance = analysis.platformPerformance.map(platform => {
        const bucket = baselines[platform.platform]?.byBand?.[segmentBand];
        return {
          ...platform,
          segmentSellThrough: bucket && bucket.sellThroughPercent != null
            ? { percent: bucket.sellThroughPercent, band: segmentBand, sample: bucket.listings }
            : null
        };
      });
    }

    const decision = decide(analysis, sellerCriteria, vehicle);
    decision.partnerReferral = await evaluatePartnerReferral(analysis, sellerCriteria, vehicle, supabaseUrl, supabaseKey);

    const costEstimate = oldCarsDataCost(fetchResult.meteredRequests);
    const usageLog = await recordUsageEvent({
      event_type: "seller_decision",
      route: "/api/sellerDecision",
      status: "decision_ready",
      search_text: rawSearch,
      vehicle,
      oldcarsdata_metered_requests: fetchResult.meteredRequests,
      oldcarsdata_cost_1k_usd: costEstimate.plan1k,
      oldcarsdata_cost_10k_usd: costEstimate.plan10k,
      anthropic_input_tokens: 0,
      anthropic_output_tokens: 0,
      anthropic_cost_usd: 0,
      duration_ms: fetchResult.elapsedMs,
      metadata: {
        ...requestMetadata(req),
        stopReason: fetchResult.stopReason,
        marketFetchCache: cacheStatus,
        // Coverage grows from real demand: unmapped ladders are queryable as
        // metadata->>generationMapped = 'false', grouped by make/model.
        generationMapped: !!generation,
        generation: generation?.code || null,
        // Breadth actually needed: which markets are thin at 45/90/180 days.
        breadthWindowDays: analysis.windowDays,
        breadth: analysis.windowDays >= ALL_TIME_WINDOW_DAYS ? "all_time" : `${analysis.windowDays}d`,
        strategy: "evidence_ladder",
        recordsFetched: analysis.recordsFetched,
        evidenceSales: analysis.evidenceSales,
        // Internal confidence: telemetry only, never rendered.
        internalConfidence: analysis.internalConfidence?.score ?? null,
        internalConfidenceLevel: analysis.internalConfidence?.level ?? null,
        evidenceLevel: analysis.evidenceLevel,
        ladderRung: analysis.ladder?.landed?.rung || null,
        evidenceBasis: decision.evidenceBasis
      }
    }, supabaseUrl, supabaseKey);

    return res.status(200).json({
      status: "decision_ready",
      vehicle,
      sellerCriteria,
      evidence: {
        recordsFetched: analysis.recordsFetched,
        recordsAnalyzed: analysis.recordsAnalyzed,
        closeMatches: analysis.closeMatches,
        relevantMatches: analysis.relevantMatches,
        broadMatches: analysis.broadMatches,
        excludedRecords: analysis.excludedRecords,
        excludedReasons: analysis.excludedReasons,
        evidenceLevel: analysis.evidenceLevel,
        evidenceLabel: analysis.evidenceLabel,
        evidenceSales: analysis.evidenceSales,
        estimatedValue: analysis.estimatedValue,
        earliestSaleDate: analysis.earliestSaleDate,
        debugWindows: analysis.debugWindows,
        debugPremiumWalk: analysis.debugPremiumWalk,
        windowDays: analysis.windowDays,
        thinMarket: analysis.thinMarket,
        historicalWeekday: analysis.historicalWeekday,
        generation: generation ? { code: generation.code, yearStart: generation.yearStart, yearEnd: generation.yearEnd } : null,
        ladder: analysis.ladder,
        fetchPasses: fetchResult.passSummary,
        fetchStrategy: {
          stoppedEarly: fetchResult.stoppedEarly,
          stopReason: fetchResult.stopReason,
          marketFetchCache: cacheStatus,
          strategy: "evidence_ladder",
          elapsedMs: fetchResult.elapsedMs,
          timeBudgetMs: fetchResult.timeBudgetMs,
          meteredRequests: fetchResult.meteredRequests,
          oldCarsDataCostEstimateUsd: costEstimate
        }
      },
      analysis: {
        analysisDate: analysis.analysisDate,
        platformPerformance: analysis.platformPerformance,
        sellerActivity: analysis.sellerActivity
      },
      decision,
      persistence: {
        rawRecords: rawPersistence,
        classifications: classificationPersistence,
        usage: usageLog
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
