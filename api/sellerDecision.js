const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";
const ANALYSIS_WINDOWS_DAYS = [45, 90, 180];
const SELLER_ACTIVITY_WINDOWS_DAYS = [90, 180, 270];
const MAX_PAGES = 3;
const DEFAULT_LIMIT = 50;
const MIN_CLOSE_EVIDENCE = 3;
const MIN_RELEVANT_EVIDENCE = 6;
const MIN_BROAD_EVIDENCE = 6;

const COMMON_COLORS = [
  "black", "white", "silver", "gray", "grey", "red", "blue", "green",
  "yellow", "orange", "brown", "gold", "beige", "purple"
];

const FALLBACK_MAKES = [
  "Porsche", "Ferrari", "BMW", "Mercedes-Benz", "Mercedes", "Audi",
  "Lamborghini", "Aston Martin", "Bentley", "Chevrolet", "Ford", "Dodge",
  "Toyota", "Honda", "Nissan", "Subaru", "Land Rover", "Jaguar", "McLaren"
];

let makesCache = null;
const modelsCache = {};

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

function recordPlatform(record) {
  return record.platform || record.source || record.auction_platform || record.listing_source || "unknown";
}

function recordSellerUsername(record) {
  return asText(record.seller_username || record.seller_name || record.seller || record.username);
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

function extractMileage(text) {
  const clean = asText(text).toLowerCase().replace(/,/g, "");
  const match = clean.match(/\b(\d{1,3})(?:k|000)?\s*(?:miles|mile|mi)\b/);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  return clean.includes(`${match[1]}k`) || raw < 1000 ? raw * 1000 : raw;
}

function extractColor(text) {
  const lower = asText(text).toLowerCase();
  return COMMON_COLORS.find(color => lower.includes(color)) || null;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status}: ${json.message || json.error || "request failed"}`);
  }
  return json;
}

async function getMakes() {
  if (makesCache) return makesCache;
  try {
    const json = await fetchJson(`${OLDCARSDATA_BASE}/makes`);
    makesCache = json.data || FALLBACK_MAKES;
  } catch {
    makesCache = FALLBACK_MAKES;
  }
  return makesCache;
}

async function getModels(make) {
  if (!make) return [];
  if (modelsCache[make]) return modelsCache[make];
  try {
    const json = await fetchJson(`${OLDCARSDATA_BASE}/models?make=${encodeURIComponent(make)}`);
    modelsCache[make] = json.data || [];
  } catch {
    modelsCache[make] = [];
  }
  return modelsCache[make];
}

async function resolveVehicle(rawSearch) {
  const raw = asText(rawSearch);
  const lower = raw.toLowerCase();
  const makes = await getMakes();
  const make = makes
    .filter(m => textHasTerm(lower, m))
    .sort((a, b) => String(b).length - String(a).length)[0] || null;
  const year = extractYear(raw);
  const color = extractColor(raw);
  const mileage = extractMileage(raw);

  let model = null;
  let remainder = raw;
  if (year) remainder = remainder.replace(String(year), " ");
  if (make) remainder = remainder.replace(new RegExp(make, "i"), " ");
  if (color) remainder = remainder.replace(new RegExp(color, "i"), " ");
  remainder = remainder.replace(/\b(to sell|sell|selling|i have|have a|with|miles|mile|mi)\b/gi, " ").trim();

  if (make) {
    const models = await getModels(make);
    const remLower = remainder.toLowerCase();
    model = models
      .filter(m => remLower.includes(String(m).toLowerCase()))
      .sort((a, b) => String(b).length - String(a).length)[0] || null;
  }

  if (!model) {
    model = remainder.split(/\s+/).filter(Boolean)[0] || null;
  }

  return {
    raw,
    year,
    make,
    model,
    color,
    mileage,
    confidence: make && model ? "medium" : "low",
    missingFields: [
      !make ? "make" : null,
      !model ? "model" : null
    ].filter(Boolean)
  };
}

async function callOldCarsData(path, params, apiKey) {
  const url = new URL(`${OLDCARSDATA_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return fetchJson(url.toString(), { Authorization: `Bearer ${apiKey}` });
}

function buildFetchPasses(vehicle) {
  const modelToken = asText(vehicle.model).split(/\s+/)[0] || undefined;
  const passes = [
    {
      name: "exact",
      label: "exact year/model",
      pages: 2,
      params: {
        make: vehicle.make,
        model: modelToken,
        keyword: [vehicle.year, vehicle.model].filter(Boolean).join(" ") || undefined
      }
    },
    {
      name: "same_model",
      label: "same make/model",
      pages: MAX_PAGES,
      params: {
        make: vehicle.make,
        model: modelToken
      }
    }
  ];

  if (vehicle.year) {
    for (const year of [vehicle.year - 2, vehicle.year - 1, vehicle.year + 1, vehicle.year + 2]) {
      passes.push({
        name: `nearby_year_${year}`,
        label: `nearby year ${year}`,
        pages: 1,
        params: {
          make: vehicle.make,
          model: modelToken,
          keyword: [year, vehicle.model].filter(Boolean).join(" ")
        }
      });
    }
  }

  return passes;
}

async function fetchPass(pass, apiKey) {
  const records = [];
  for (let page = 1; page <= pass.pages; page++) {
    const result = await callOldCarsData("/auctions", {
      ...pass.params,
      status: "sold",
      sort: "date",
      direction: "desc",
      page,
      limit: DEFAULT_LIMIT
    }, apiKey);

    const pageRecords = result.data || [];
    records.push(...pageRecords.map(record => ({
      ...record,
      _goasksam_fetch_pass: pass.name,
      _goasksam_fetch_label: pass.label
    })));
    if (!pageRecords.length) break;
    if (page >= (result.meta?.total_pages || 1)) break;
  }
  return records;
}

async function fetchRecentRecords(vehicle, apiKey) {
  const passes = buildFetchPasses(vehicle);
  const seen = new Set();
  const records = [];
  const passSummary = [];
  const maxWindow = Math.max(...ANALYSIS_WINDOWS_DAYS, ...SELLER_ACTIVITY_WINDOWS_DAYS);

  for (const pass of passes) {
    let passRecords = [];
    let passError = null;
    try {
      passRecords = await fetchPass(pass, apiKey);
    } catch (err) {
      passError = err.message;
    }
    let added = 0;

    for (const record of passRecords) {
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
      fetched: passRecords.length,
      added,
      error: passError
    });
  }

  return { records, passSummary };
}

function getSellerCriteria(car = {}) {
  return {
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
  const recordYear = Number(record.year || extractYear(title));
  const yearGap = vehicle.year && recordYear ? Math.abs(vehicle.year - recordYear) : null;
  const sameMake = !!targetMake && (recordMake === targetMake || title.includes(targetMake));
  const sameModel = !!targetModel && (recordModel.includes(targetModel) || title.includes(targetModel));
  const colorMatch = vehicle.color ? title.includes(vehicle.color) : null;
  const price = normalizeMoney(record);
  const targetMentionsTurbo = textHasTerm(vehicle.raw, "turbo");
  const targetMentionsCup = textHasTerm(vehicle.raw, "cup");
  const exclusionReasons = [];

  if (!(sameMake && sameModel)) exclusionReasons.push("different make/model");
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
      colorMatch ? vehicle.color : null
    ].filter(Boolean),
    needs_review: confidence === "low",
    price
  };
}

function analyze(records, classifications) {
  const pairedRecords = records.map((record, index) => ({ record, classification: classifications[index] }));

  for (const windowDays of ANALYSIS_WINDOWS_DAYS) {
    const inWindow = pairedRecords
      .filter(item => daysAgo(item.record.auction_end_date) <= windowDays)
      .filter(item => item.classification.comparison_tier !== "excluded");

    const excludedRecords = pairedRecords
      .filter(item => item.classification.comparison_tier === "excluded");
    const closeMatches = inWindow.filter(item => item.classification.comparison_tier === "close_match");
    const relevantMatches = inWindow.filter(item => ["close_match", "relevant_match"].includes(item.classification.comparison_tier));
    const broadMatches = inWindow.filter(item => item.classification.comparison_tier === "broad_match");
    const broadEvidence = [...relevantMatches, ...broadMatches];

    if (
      closeMatches.length >= MIN_CLOSE_EVIDENCE ||
      relevantMatches.length >= MIN_RELEVANT_EVIDENCE ||
      broadEvidence.length >= MIN_BROAD_EVIDENCE ||
      windowDays === ANALYSIS_WINDOWS_DAYS[ANALYSIS_WINDOWS_DAYS.length - 1]
    ) {
      let evidenceSet = broadEvidence;
      let evidenceLevel = "broad";
      let evidenceLabel = "broader same-model evidence";

      if (closeMatches.length >= MIN_CLOSE_EVIDENCE) {
        evidenceSet = closeMatches;
        evidenceLevel = "close";
        evidenceLabel = "close evidence";
      } else if (relevantMatches.length >= MIN_RELEVANT_EVIDENCE) {
        evidenceSet = relevantMatches;
        evidenceLevel = "relevant";
        evidenceLabel = "same and closely related cars";
      }

      const platformMap = new Map();
      for (const item of evidenceSet) {
        const platform = recordPlatform(item.record);
        if (!platformMap.has(platform)) platformMap.set(platform, []);
        platformMap.get(platform).push(item);
      }

      const platformPerformance = [...platformMap.entries()]
        .map(([platform, items]) => ({
          platform,
          evidenceSales: items.length,
          relevantSales: items.filter(item => ["close_match", "relevant_match"].includes(item.classification.comparison_tier)).length,
          closeSales: items.filter(item => item.classification.comparison_tier === "close_match").length,
          broadSales: items.filter(item => item.classification.comparison_tier === "broad_match").length,
          medianSalePrice: median(items.map(item => item.classification.price)),
          latestSaleDate: items
            .map(item => item.record.auction_end_date)
            .filter(Boolean)
            .sort()
            .at(-1) || null
        }))
        .sort((a, b) => {
          if (b.closeSales !== a.closeSales) return b.closeSales - a.closeSales;
          if (b.relevantSales !== a.relevantSales) return b.relevantSales - a.relevantSales;
          return (b.medianSalePrice || 0) - (a.medianSalePrice || 0);
        });

      return {
        analysisDate: new Date().toISOString().slice(0, 10),
        windowDays,
        recordsFetched: records.length,
        recordsAnalyzed: inWindow.length,
        closeMatches: closeMatches.length,
        relevantMatches: relevantMatches.length,
        broadMatches: broadMatches.length,
        excludedRecords: excludedRecords.length,
        excludedReasons: summarizeExclusions(excludedRecords),
        evidenceLevel,
        evidenceLabel,
        evidenceSales: evidenceSet.length,
        thinMarket: evidenceSet.length < MIN_RELEVANT_EVIDENCE,
        platformPerformance,
        sellerActivity: analyzeSellerActivity(pairedRecords)
      };
    }
  }
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
    tradeoffs.push("Seller timeline favors routes that can get live quickly, but this V1 decision only measures recent market evidence, not partner speed.");
  }
  if (involvement.includes("handle") || involvement.includes("hands-off")) {
    tradeoffs.push("Seller prefers a hands-off route; power-seller fit should be checked before final handoff because this dataset currently ranks platforms, not individual sellers.");
  }
  if (involvement.includes("manage") || involvement.includes("control")) {
    tradeoffs.push("Seller is comfortable managing the process, so a direct listing may be viable if platform evidence is otherwise strong.");
  }

  return tradeoffs;
}

function decide(analysis, criteria) {
  const best = analysis.platformPerformance[0] || null;
  const powerSellerReferral = analyzePowerSellerReferral(analysis, criteria);
  if (!best) {
    return {
      recommendedPath: null,
      confidence: "low",
      why: [],
      tradeoffs: decisionTradeoffs(criteria),
      powerSellerReferral,
      limitations: ["No relevant recent sales were found in the fetched market data."]
    };
  }

  const confidence = analysis.closeMatches >= 3 && best.relevantSales >= 3
    ? "medium"
    : "low";

  return {
    recommendedPath: best.platform,
    confidence,
    why: [
      `${best.platform} had ${best.evidenceSales} recent sale${best.evidenceSales === 1 ? "" : "s"} in the selected ${analysis.windowDays}-day ${analysis.evidenceLabel} set.`,
      best.closeSales
        ? `${best.closeSales} of those were close matches to the searched car.`
        : "The exact close-match sample is thin, so this uses clearly labeled broader evidence.",
      sellerActivityExplanation(analysis.sellerActivity, best.platform),
      best.medianSalePrice
        ? `Median sale price in that evidence set was $${best.medianSalePrice.toLocaleString()}.`
        : null
    ].filter(Boolean),
    tradeoffs: decisionTradeoffs(criteria),
    powerSellerReferral,
    limitations: analysis.thinMarket
      ? ["Recent evidence is thin; treat the decision as directional, not definitive."]
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

function sellerActivityExplanation(sellerActivity, platform) {
  const summary = sellerActivity?.platformSummary?.[platform];
  if (!summary) return null;
  const activeCount = summary.highActivitySellers + summary.activeSpecialists;
  if (!activeCount) return null;
  return `${platform} also showed ${activeCount} active seller signal${activeCount === 1 ? "" : "s"} in this segment, but consignment fit is not assumed.`;
}

async function supabaseInsert(table, rows, supabaseUrl, supabaseKey, prefer = "return=minimal", query = "") {
  if (!supabaseUrl || !supabaseKey || !rows.length) return { skipped: true, rows: [] };
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: prefer
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `${table} insert failed: ${res.status} ${text}` };
  }
  const text = await res.text();
  const returnedRows = text ? JSON.parse(text) : [];
  return { ok: true, rows: returnedRows };
}

async function lookupMarketRecordIds(records, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey || !records.length) return {};
  const ids = [...new Set(records.map(sourceRecordId).filter(Boolean))];
  if (!ids.length) return {};

  const idsParam = ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(",");
  const res = await fetch(`${supabaseUrl}/rest/v1/vehicle_market_records?source_record_id=in.(${idsParam})&select=id,source,source_record_id`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });
  if (!res.ok) return {};

  const rows = await res.json();
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
  const rawSearch = req.body?.car?.raw || req.body?.car || req.body?.search || req.body?.query;
  if (!rawSearch) return res.status(400).json({ error: "Missing car/search field" });

  try {
    const vehicle = await resolveVehicle(rawSearch);
    if (vehicle.missingFields.length) {
      return res.status(200).json({
        status: "needs_clarification",
        vehicle,
        clarification: {
          question: "What year, make and model are you selling?",
          missingFields: vehicle.missingFields
        }
      });
    }

    const fetchResult = await fetchRecentRecords(vehicle, apiKey);
    const records = fetchResult.records;
    const classifications = records.map(record => classifyRecord(record, vehicle));
    const rawPersistence = await persistRawRecords(records, supabaseUrl, supabaseKey);
    const classificationPersistence = await persistClassifications(records, classifications, rawPersistence.idLookup, supabaseUrl, supabaseKey);
    const analysis = analyze(records, classifications);
    const decision = decide(analysis, sellerCriteria);

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
        windowDays: analysis.windowDays,
        thinMarket: analysis.thinMarket,
        fetchPasses: fetchResult.passSummary
      },
      analysis: {
        analysisDate: analysis.analysisDate,
        platformPerformance: analysis.platformPerformance,
        sellerActivity: analysis.sellerActivity
      },
      decision,
      persistence: {
        rawRecords: rawPersistence,
        classifications: classificationPersistence
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
