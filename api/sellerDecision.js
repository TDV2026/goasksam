import { oldCarsDataCost, recordUsageEvent, requestMetadata } from "./_usage.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { callOldCarsData } from "../lib/_ocd.js";

// Powerseller referrals are gated (locked product rule): estimated value from
// actual comps must clear this threshold before a partner can lead.
const POWERSELLER_MIN_VALUE_USD = Number(process.env.POWERSELLER_MIN_VALUE_USD || 75000);
const ANALYSIS_WINDOWS_DAYS = [45, 90, 180];
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

function asText(value) {
  return String(value || "").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasTerm(text, term) {
  const normalizedTerm = asText(term).toLowerCase();
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm
    .split(/\s+/)
    .map(escapeRegExp)
    .join("[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(text);
}

function median(values) {
  const nums = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
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

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function normalizeMoney(record) {
  const value = record.sold_price ?? record.final_price ?? record.price ?? record.current_bid;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function recordPlatform(record) {
  return record.platform || record.source || record.auction_platform || record.listing_source || "unknown";
}

function recordSellerUsername(record) {
  return asText(record.seller_username || record.seller_name || record.seller || record.username);
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

function sourceRecordId(record) {
  return String(record.id ?? record.source_record_id ?? record.listing_id ?? "");
}

function sourceRecordKey(source, id) {
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

function modelSearchTerms(vehicle) {
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

// ---- Evidence ladder ----
// The explicit, ordered drawdown from narrowest to broadest evidence. The
// engine fetches and evaluates rung by rung, lands on the narrowest rung whose
// threshold is met, and decide() treats the regional policy floor as the
// bottom rung so a recommendation always comes back.

function buildLadder(vehicle) {
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  const trim = asText(vehicle.trim) || null;
  const model = asText(vehicle.model);
  const modelTrim = [model, trim].filter(Boolean).join(" ");
  const rungs = [];

  if (trim && year) {
    rungs.push({ key: "exact_year_trim", label: `${year} ${modelTrim} sales`, needTrim: true, maxYearGap: 0, threshold: 3, pages: 1 });
    rungs.push({ key: "near_years_trim", label: `${modelTrim} sales ${year - 2} to ${year + 2}`, needTrim: true, maxYearGap: 2, threshold: 3, pages: 2 });
  }
  if (trim) {
    rungs.push({ key: "any_year_trim", label: `${modelTrim} sales, any year`, needTrim: true, maxYearGap: null, threshold: 4, pages: 2 });
  }
  if (year && !trim) {
    rungs.push({ key: "exact_year_model", label: `${year} ${model} sales`, needTrim: false, maxYearGap: 0, threshold: 3, pages: 1 });
  }
  if (year) {
    rungs.push({ key: "near_years_model", label: `${model} sales ${year - 2} to ${year + 2}`, needTrim: false, maxYearGap: 2, threshold: 3, pages: 2 });
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

function rungFetchParams(rung, vehicle) {
  const modelToken = asText(vehicle.model).split(/\s+/)[0] || undefined;
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  const params = { make: vehicle.make };
  if (!rung.makeOnly) params.model = modelToken;
  if (rung.maxYearGap !== null && year) {
    params.year_min = year - rung.maxYearGap;
    params.year_max = year + rung.maxYearGap;
  }
  if (rung.needTrim && vehicle.trim) params.keyword = vehicle.trim;
  return params;
}

// Insurance against OldCarsData model-name mismatches (e.g. vPIC says "325i"
// where OldCarsData files it under "3-Series"): if a rung's model-param pass
// returns nothing, retry with the model as a keyword instead.
function rungKeywordFallbackPasses(rung, vehicle) {
  if (rung.makeOnly) return [];
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  return modelSearchTerms(vehicle).map(term => {
    const params = { make: vehicle.make, keyword: [term, rung.needTrim ? vehicle.trim : null].filter(Boolean).join(" ") };
    if (rung.maxYearGap !== null && year) {
      params.year_min = year - rung.maxYearGap;
      params.year_max = year + rung.maxYearGap;
    }
    return {
      name: `rung${rung.rung}_${rung.key}_keyword_${term}`,
      label: `${rung.label} (keyword ${term})`,
      rung: rung.rung,
      pages: 1,
      params
    };
  });
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
    let landedWindow = null;
    for (const windowDays of ANALYSIS_WINDOWS_DAYS) {
      const count = eligible.filter(item => daysAgo(item.record.auction_end_date) <= windowDays).length;
      if (count >= rung.threshold) {
        landedWindow = windowDays;
        break;
      }
    }
    return {
      rung: rung.rung,
      key: rung.key,
      label: rung.label,
      threshold: rung.threshold,
      sales: eligible.length,
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
  for (let page = 1; page <= pass.pages; page++) {
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

async function fetchRecentRecords(vehicle, apiKey) {
  const ladder = buildLadder(vehicle);
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

    const primary = await runPass({
      name: `rung${rung.rung}_${rung.key}`,
      label: rung.label,
      rung: rung.rung,
      pages: rung.pages,
      params: rungFetchParams(rung, vehicle)
    });

    // Keyword fallback whenever the rung is still unmet, not just on an empty
    // primary: sources like OldCarsData file some cars under chassis-code
    // models (997 vs 911) that only a title keyword search can reach.
    const rungMetAfterPrimary = evaluate().walk.find(entry => entry.rung === rung.rung)?.met;
    if (!rungMetAfterPrimary && !primary.error) {
      for (const fallbackPass of rungKeywordFallbackPasses(rung, vehicle)) {
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

function classifyRecord(record, vehicle) {
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

function analyze(records, classifications, ladder, vehicle) {
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

  const totalEvidenceSales = evidenceSet.length;
  const strongestSales = [...evidenceSet]
    .filter(item => Number.isFinite(Number(item.classification.price)))
    .sort((a, b) => Number(b.classification.price) - Number(a.classification.price))
    .slice(0, 3);

  let platformPerformance = [...platformMap.entries()]
    .map(([platform, items]) => {
      const weekdayInsight = strongestWeekdayInsight(items);
      const otherPrices = evidenceSet
        .filter(item => recordPlatform(item.record) !== platform)
        .map(item => item.classification.price)
        .filter(Number.isFinite);
      return {
        platform,
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

  return {
    analysisDate: analysisDateForSeller(),
    windowDays,
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
    thinMarket: thin || !landed || evidenceSet.length < landed.threshold,
    ladder: {
      landed: landed ? {
        rung: landed.rung,
        key: landed.key,
        label: landed.label,
        windowDays,
        sales: evidenceSet.length,
        threshold: landed.threshold,
        thresholdMet: landed.met
      } : null,
      rungs: walk.map(({ rung, key, label, sales, threshold, met }) => ({ rung, key, label, sales, threshold, met })),
      policyFloorRung: walk.length + 1
    },
    platformPerformance,
    sellerActivity: analyzeSellerActivity(pairedRecords)
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
function ladderConfidence(analysis) {
  const landed = analysis.ladder?.landed;
  if (!landed || !landed.thresholdMet) return "low";
  const sales = analysis.evidenceSales;
  if (["exact_year_trim", "near_years_trim", "exact_year_model"].includes(landed.key)) {
    return sales >= 5 ? "high" : "medium";
  }
  if (["any_year_trim", "near_years_model"].includes(landed.key)) return "medium";
  if (landed.key === "any_year_model") return sales >= 8 ? "medium" : "low";
  return "low";
}

// Structured fact about the widening, for Sam to narrate. Only present when
// the analysis landed below the top rung.
function wideningFact(analysis) {
  const ladder = analysis.ladder;
  const landed = ladder?.landed;
  if (!landed || landed.rung <= 1) return null;
  const first = ladder.rungs[0];
  return `${first.label} came up thin (${first.sales} found), so the analysis widened to ${landed.label}: ${landed.sales} sales in the last ${landed.windowDays} days.`;
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
      best.closeSales ? `${best.closeSales} of those were close matches to the searched car.` : null,
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

async function partnerVerifiedStats(partner, supabaseUrl, supabaseKey) {
  const usernames = (partner.seller_usernames || []).filter(Boolean);
  const empty = { trackedSales: 0, topMakes: [], platformsSeen: [] };
  if (!usernames.length || !supabaseUrl || !supabaseKey) return empty;
  const list = usernames.map(u => `"${String(u).replace(/"/g, "")}"`).join(",");
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `vehicle_market_records?seller_username=in.(${encodeURIComponent(list)})&select=make,platform&limit=2000`
  );
  if (!rows) return empty;
  const makeCounts = new Map();
  const platforms = new Set();
  for (const row of rows) {
    if (row.make) makeCounts.set(row.make, (makeCounts.get(row.make) || 0) + 1);
    if (row.platform) platforms.add(ROUTE_POLICIES[platformPolicyKey(row.platform)]?.label || row.platform);
  }
  return {
    trackedSales: rows.length,
    topMakes: [...makeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([make, count]) => ({ make, count })),
    platformsSeen: [...platforms]
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
  const eligible = !!(valueMet && matched);

  const result = {
    eligible,
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
  if (eligible) {
    result.partner = {
      slug: matched.slug,
      name: matched.name,
      displayName: matched.display_name || matched.name,
      regions: matched.regions || [],
      specialties: matched.specialties || {},
      platforms: matched.platforms || [],
      serviceClaims: matched.service_claims || [],
      referralTerms: matched.referral_terms || null,
      verified: await partnerVerifiedStats(matched, supabaseUrl, supabaseKey)
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
    make: record.ocd_make_name || record.listing_make || null,
    model: record.ocd_model_name || record.listing_model || null,
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

    const fetchResult = await fetchRecentRecords(vehicle, apiKey);
    const records = fetchResult.records;
    const classifications = records.map(record => classifyRecord(record, vehicle));
    const rawPersistence = await persistRawRecords(records, supabaseUrl, supabaseKey);
    const classificationPersistence = await persistClassifications(records, classifications, rawPersistence.idLookup, supabaseUrl, supabaseKey);
    const analysis = analyze(records, classifications, fetchResult.ladder, vehicle);
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
        strategy: "evidence_ladder",
        recordsFetched: analysis.recordsFetched,
        evidenceSales: analysis.evidenceSales,
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
        windowDays: analysis.windowDays,
        thinMarket: analysis.thinMarket,
        ladder: analysis.ladder,
        fetchPasses: fetchResult.passSummary,
        fetchStrategy: {
          stoppedEarly: fetchResult.stoppedEarly,
          stopReason: fetchResult.stopReason,
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
