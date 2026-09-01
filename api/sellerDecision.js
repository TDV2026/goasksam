import { oldCarsDataCost, recordUsageEvent, requestMetadata } from "./_usage.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { runOneBox, runOneBoxModelChoice } from "../lib/onebox.js";
import { supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { callOldCarsData } from "../lib/_ocd.js";
import { testerCodeExpired } from "../lib/_tester.js";
import { verifyOnce } from "../lib/_onepass.js";
import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";
import { findGeneration, generationModelToken } from "../lib/generations.js";
import { findWinCondition, BACKING_MIN } from "../lib/winConditions.js";
import { MODEL_SEGMENTS } from "../lib/vehicleData.js";
import { poolTrimFor } from "../lib/modelFamilies.js";
import { calculateEffectiveSampleSize, MINIMUM_EFFECTIVE_SAMPLE, getRecencyMultiplier, getPlatformDominanceScore, calculateConfidenceScore, getConfidenceLevel } from "../lib/weighting.js";
import { computePartnerCareerStats, partnerRelevance, priceBand } from "../lib/marketStats.js";
import { censusRegion, partnerRegionBuckets } from "../lib/_regions.js";
import { findReserveContext, computeReserveCells, RESERVE_MIN_PER_SIDE } from "../lib/reserveContext.js";
import { findSpecializationContext } from "../lib/specializationShare.js";
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
  stableRecordId,
  sourceRecordKey,
  textHasTerm
} from "../lib/_classify.js";

// Powerseller referrals are gated (locked product rule): estimated value from
// actual comps must clear this threshold before a partner can lead.
// PowerSeller eligibility floor (business decision, Aug 2026): lowered 75000 -> 40000.
// The standard 20% tolerance (ps_min_tolerance_pct) applies underneath, so the
// effective floor is 40000 * 0.8 = 32000, and the secondary card folds into the SAME
// floor (below). Distinct from the $40k LEAD-LAYOUT dial (powerseller_value_lead_usd),
// which controls PS-forward vs platform-forward presentation and is untouched.
const POWERSELLER_MIN_VALUE_USD = Number(process.env.POWERSELLER_MIN_VALUE_USD || 40000);
// vehicle_classifications is a classifier-QA audit log that NOTHING in the product
// reads (write-only). It has no dedup and is re-written on every search, including
// cache hits that fetch zero new data, so it grew to 61% of the database. Writing is
// OFF by default. Set PERSIST_CLASSIFICATIONS=1 only to sample classifier judgments
// for a bounded review; leave it unset in normal operation. classifyRecord still runs
// in memory and feeds analyze() either way; this flag governs the DB write alone.
const PERSIST_CLASSIFICATIONS = process.env.PERSIST_CLASSIFICATIONS === "1";
// Depth-first breadth: evaluate 45 days first, broaden only while comps stay
// under threshold: 90, then 180, then all-time (represented as 36500 days).
const ALL_TIME_WINDOW_DAYS = 36500;
const ANALYSIS_WINDOWS_DAYS = [45, 90, 180, ALL_TIME_WINDOW_DAYS];
// Market-condition claims (price premium, concentration, segment majority) may
// NEVER be backed by a window beyond 180 days (3.8). This is the single, hard
// cap for every delta the frontend renders: if no window through 180 clears the
// sample gate, no delta is produced (the card falls to the honest cascade
// headline) rather than widening to all-time. The ladder walk above may still
// LAND a rung at all-time to prove a car exists, but that never backs a delta.
const PREMIUM_WINDOWS_DAYS = [45, 90, 180, 270];

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
    // evidenceCapable flipped to true (July 2026): Hemmings is on the evidence
    // allowlist (a self-listable marketplace with OldCarsData coverage), so it
    // is a platform like any other and can be an evidence-backed pick.
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: ["older_classic", "classic_american", "pre_1990", "collector"]
  },
  // SOMO is a self-listable marketplace on the evidence allowlist. No special
  // treatment and no fixed segment boosts: pickable ONLY when the data clears the
  // same evidence gates as everyone else (strongSegments empty => zero policy-driven
  // score, evidence only). AutoHunter was removed here (Aug 2026): out of business,
  // no longer routable/recommendable anywhere.
  sothebysmotorsport: {
    about: { regionsLabel: "the US", since: 2020, knownFor: "collector and enthusiast cars", source: "policy_provided" },
    label: "Sotheby's Motorsport (SOMO)",
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: []
  },
  // MB Market is a Mercedes-Benz-only marketplace on the evidence allowlist, but
  // MARQUE-GATED: its sold records count as evidence ONLY for Mercedes-Benz
  // searches (see MARQUE_GATED_EVIDENCE / isEvidenceSource). No policy boost:
  // strongSegments is empty, so it is pickable only when the Mercedes data clears
  // the same evidence gates as everyone else.
  mbmarket: {
    about: { regionsLabel: "the US", since: 2019, knownFor: "Mercedes-Benz cars", source: "policy_provided" },
    label: "MB Market",
    evidenceCapable: true,
    priceOutcome: "medium",
    speedToList: "medium_fast",
    sellerEffort: "medium",
    regions: ["US"],
    strongSegments: []
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

// US launch (Aug 2026): a US seller is only ever routed to platforms that actually
// serve US sellers. This is an EXPLICIT ALLOWLIST, not a UK denylist: a new non-US
// platform that turns up in the records (The Market, PistonHeads, Car & Classic,
// Collecting Cars...) is excluded by default rather than needing to be denylisted
// one at a time. SOMO stays in (a global operation with real US consignment reach).
// The routeFit build below is the source of truth; the frontend re-checks it too.
export const US_ROUTE_ALLOWLIST = new Set([
  "bringatrailer", "bat", "carsandbids", "pcarmarket", "hemmings",
  "sothebysmotorsport", "mbmarket", "hagerty"   // autohunter removed Aug 2026 (defunct)
]);

// ===================== EVIDENCE ALLOWLIST (July 2026) =====================
// The allowlist governs EVIDENCE ONLY: which sources count toward the premium
// "others" denominator and the evidence tallies (close/relevant/broad, sample
// counts, estimated value, confidence). It NEVER touches routing or
// recommendability. A market whose fixed policy rules route to Collecting Cars
// or Car & Classic still renders that recommendation with no data behind it,
// exactly as before; the allowlist only decides whose SOLD RECORDS are trusted
// as comparable-sale evidence.
//
// INCLUDED: self-listable marketplaces a seller could actually use.
// EXCLUDED for now: rmsothebys, gooding (white-glove consignment, not a
// seller-usable alternative) and the "oldcarsdata" vendor-name anomaly. Their
// medians still survive for the honest strongerNonRoutable pre-note (price
// facts only), they just never enter the pick's evidence math.
// US launch (Aug 2026): the evidence pool is EXACTLY these seven platforms.
// Dropped from evidence by Sam, records still persist (rule 5) but never count as
// comparable evidence: All Collector Cars (acc/allcollectorcars), and AutoHunter
// (autohunter, Aug 2026, out of business, ACC-style treatment: historical rows stay
// in the archive but are never counted or named as a live source).
export const EVIDENCE_ALLOWLIST = new Set([
  "bringatrailer", "bat", "carsandbids", "hagerty", "pcarmarket",
  "sothebysmotorsport", "hemmings"
]);
// MARQUE-GATED evidence sources: allowlisted, but ONLY for a specific marque.
// MB Market is a Mercedes-Benz-only marketplace, so its sold records may only
// count as comparable evidence when the searched car is a Mercedes-Benz. It is
// intentionally NOT in the unconditional EVIDENCE_ALLOWLIST above; isEvidenceSource
// admits it only when the vehicle marque matches. It is a KNOWN source so
// new-source detection never flags it.
export const MARQUE_GATED_EVIDENCE = { mbmarket: "Mercedes-Benz" };
// Every source slug we have ever knowingly admitted. Anything outside this set
// arriving on a fetched record is surfaced by new-source detection and never
// silently trusted. Excluded-from-evidence houses (rmsothebys/gooding) are
// still KNOWN; they render under "a leading auction house".
export const KNOWN_SOURCE_SLUGS = new Set([
  ...EVIDENCE_ALLOWLIST, ...Object.keys(MARQUE_GATED_EVIDENCE),
  // Known but NOT evidence: white-glove consignment houses and All Collector Cars
  // (dropped from the launch evidence pool). They render under a generic label and
  // never trip new-source detection.
  "acc", "allcollectorcars", "rmsothebys", "gooding", "goodingco"
]);
export function normSourceSlug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
// A vehicle make "matches" a gated marque when it is that marque (case-insensitive).
// The one gated marque is Mercedes-Benz; the resolver canonicalizes "Mercedes" to
// "Mercedes-Benz", so a simple mercedes-prefix check is robust to either form.
export function makeMatchesMarque(make, marque) {
  const m = String(make || "").toLowerCase().trim();
  const g = String(marque || "").toLowerCase().trim();
  if (!m || !g) return false;
  if (m === g) return true;
  return g.startsWith("mercedes") && m.startsWith("mercedes");
}
// isEvidenceSource governs which SOLD RECORDS count as comparable-sale evidence.
// Pass the searched `vehicle` so marque-gated sources (MB Market) are admitted
// only for their marque; without a vehicle the gate blocks them (fail-closed),
// which never affects the unconditional allowlist sources.
export function isEvidenceSource(record, vehicle) {
  const slug = normSourceSlug(recordPlatform(record));
  if (EVIDENCE_ALLOWLIST.has(slug)) return true;
  const marque = MARQUE_GATED_EVIDENCE[slug];
  if (marque) return makeMatchesMarque(vehicle && vehicle.make, marque);
  return false;
}
// True when a record's source is marque-gated AND the searched vehicle is not the
// gated marque: such a record can never enter this car's comparison at all.
export function marqueGatedBlocked(record, vehicle) {
  const marque = MARQUE_GATED_EVIDENCE[normSourceSlug(recordPlatform(record))];
  return !!marque && !makeMatchesMarque(vehicle && vehicle.make, marque);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Freeform asking-price parser. Must stay in lockstep with the frontend's
// parseAskingPrice (js/pipeline.js) so the wizard never accepts an input the
// backend then silently reads as null. Handles: "$65k", "65k", "65,000",
// "$65,000", "65000", "65 grand", "$1.2m", "six figures".
function parseSellerTargetPrice(value) {
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (text.includes("six figure") || text.includes("six-figure")) return 100000;

  const compact = text.replace(/,/g, "");
  const suffix = compact.match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|grand|thousand|m|mm|million)\b/);
  if (suffix) return Math.round(Number(suffix[1]) * (/^(m|mm|million)$/.test(suffix[2]) ? 1e6 : 1e3));

  // Bare number: >= 1000 is a literal figure; 1-999 is read as thousands (55 ->
  // 55000, 150 -> 150000), since nobody sells a collector car for $55. Mirrored
  // exactly in the frontend parseAskingPrice.
  const numberMatch = compact.match(/\$?\s*(\d{1,7})\b/);
  if (numberMatch) { const n = Number(numberMatch[1]); return n >= 1000 ? n : n * 1000; }

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

  // US-only launch (source of truth): candidateKeys is seeded from EVERY platform
  // with records above, so a non-US platform that has a sold record (Collecting
  // Cars, The Market) would otherwise become a routable candidate for a US seller.
  // Enforce the explicit US allowlist here so no non-US route ever leaves the
  // backend. International sellers are untouched (their region logic is unchanged).
  if (priorities.region === "US") {
    for (const key of [...candidateKeys]) {
      if (!US_ROUTE_ALLOWLIST.has(normSourceSlug(key))) candidateKeys.delete(key);
    }
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
      // Sample-size / share confidence (Aug 2026): a platform's median is only as
      // trustworthy as the share of the tracked market it represents. Weighting the
      // median bonus by share stops a low-share platform's high median (Hemmings on
      // 9% of MGB sales, SOMO on 7% of 992 sales) from out-scoring the volume leader
      // on price alone. Full trust at 50%+ share, floored so a real minority signal
      // is not zeroed. The cheap-median PENALTY stays at full weight (never reward a
      // platform for selling the car for less).
      const sharePct = Number(evidence.evidenceSharePercent) || 0;
      const shareConf = Math.max(0.25, Math.min(1, sharePct / 50));
      if (maxComparableMedian && (evidence.closeSales || evidence.relevantSales) && evidence.medianSalePrice) {
        const medianRatio = evidence.medianSalePrice / maxComparableMedian;
        score += Math.round(medianRatio * 35 * shareConf);
        if (medianRatio < 0.95) score -= Math.round((1 - medianRatio) * 45);
        if (medianRatio >= 0.9 && shareConf >= 0.9 && ["fast", "medium_fast"].includes(policy.speedToList)) score += 8;
      }
      // Volume leadership: a dominant share of the tracked market is itself a strong,
      // trustworthy signal that this is where the car actually sells. +40 at 100% share.
      score += Math.round(Math.min(sharePct, 100) * 0.4);
      if (comparableCount >= 3) score += 3;
      // Data pick (1b): the highest positive comparative delta leads. A cleared
      // premium (>=10%, 5+/5+ same rung and window) is the strongest signal,
      // above the median-ratio proxy; the platform that wins the pooled delta
      // wins the card. Never assume BaT. Region mismatch (-175 below) still
      // outranks this, so a region-excluded platform can never lead on a delta.
      const premium = evidence.pricePremium;
      if (premium && premium.gateType === "symmetric" && Number.isFinite(premium.percent) && premium.percent >= 10) {
        score += 40 + Math.min(premium.percent, 60);
      }
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

  applyWinConditions(routes, vehicle);
  applyThinWindowPriceOverride(routes, priorities);

  return {
    priorities,
    routes
  };
}

// The authoritative recommended route, IDENTICAL in logic to the frontend's
// routesForCards ladder (js/result.js): price-first, volume-second, never a
// small-sample artifact. Kept in lockstep with that function so recommendedPath
// (which the saved-results list renders) always equals the card the seller saw.
//   Branch 1 (Mode A): the highest CLEARED symmetric premium (>=10%, 5+/5+) leads.
//   Branch 5 (specialist crown, UNKNOWN spread only): a non-depth platform holding
//     a specialization cell (lift >= 3x AND 5+ scope comps) leads.
//   Branch 3: the depth leader (most sold comps at the landed scope) leads.
// Only routable routes can be the pick; consignment-only sources never lead.
function pickRecommendedRoute(routes) {
  const routable = (routes || []).filter(r => r.routable !== false);
  if (!routable.length) return (routes || []).find(r => r.routable) || (routes || [])[0] || null;
  // Thin-window price-signal override (set in analyzeRouteFit): a flagged strong-price
  // venue with materially deeper comps leads over a thin-window recency leader. Honored
  // first so recommendedPath (saved-list) and the reordered card stay in lockstep.
  const forced = routable.find(r => r.thinWindowPriceLead);
  if (forced) return forced;
  const clearedPct = r => {
    const p = r && r.marketEvidence && r.marketEvidence.pricePremium;
    return (p && p.gateType === "symmetric" && Number.isFinite(p.percent) && p.percent >= 10) ? p.percent : -1;
  };
  // Depth leader: most sold comps at the landed scope (computed before Branch 1 so the
  // volume-aware premium gate can reference it).
  let deep = null, deepN = -1;
  for (const r of routable) { const n = Number((r.marketEvidence && r.marketEvidence.evidenceSales) || 0); if (n > deepN) { deep = r; deepN = n; } }
  const deepPremium = deep ? clearedPct(deep) : -1;
  // Branch 1 (Mode A), VOLUME-AWARE (kept in lockstep with routesForCards in
  // js/result.js): among cleared symmetric premiums the highest leads, but a platform
  // that is NOT the depth leader may lead only when its premium rests on a sample
  // comparable to the leader's (platformSales >= half the leader's evidence, floor 5)
  // OR it beats the leader's OWN cleared premium by 8+ points. A boutique's high-mix
  // median on a thin sample (SOMO +27% on 8 sales) can no longer edge out the volume
  // venue (BaT +26% on 20) on a single percentage point.
  const cleared = routable.map(r => ({ r, pct: clearedPct(r) })).filter(x => x.pct >= 10).sort((a, b) => b.pct - a.pct);
  for (const { r, pct } of cleared) {
    const ps = Number((r.marketEvidence && r.marketEvidence.pricePremium && r.marketEvidence.pricePremium.platformSales) || 0);
    const sampleOK = ps >= Math.max(5, deepN * 0.5);
    const marginOK = deepPremium >= 10 && pct >= deepPremium + 8;
    if (r === deep || sampleOK || marginOK) return r;
  }
  const measured = routable.some(r => { const p = r && r.marketEvidence && r.marketEvidence.pricePremium; return p && p.platformSales >= 5 && p.othersSales >= 5; });
  if (!measured) {
    const specCell = r => { const c = r && r.marketEvidence && r.marketEvidence.specializationCell; return (c && Number(c.lift_rounded) >= 3 && Number(c.platform_count) >= 5) ? c : null; };
    const specialist = routable.find(r => r !== deep && specCell(r));
    if (specialist) return specialist;
  }
  if (deep && deepN > 0) return deep;
  return routable[0] || (routes || [])[0] || null;
}

// Thin-window price-signal override (Aug 2026). A high-scoring leader whose landed
// window sample is THIN must not hold the pick on a same-size recency edge when
// another routable platform is flagged the STRONG-PRICE-SIGNAL route AND carries a
// materially deeper comp record. In the reported case a 2-sale recent median edge on
// Cars & Bids out-ranked Bring a Trailer for an E30 convertible, even though BaT is the
// flagged strong-price venue with more comps. The thin leader wins on recent median;
// the challenger wins on a deeper, price-stronger track record. This reorders on the
// venue's OWN strong-price flag plus comp DEPTH, never a computed "more money" figure,
// so it makes no unsupported price claim (rule 11). Thresholds are explicit so a razor
// edge can never trigger it and a genuinely deep or price-strong leader is never demoted.
const THIN_PICK_MAX = 3;         // leader is "thin" at <= 3 sold comps in the landed window
const DEPTH_FLOOR = 8;           // challenger needs an absolute floor of 180-day model comps
const DEPTH_RATIO = 1.2;         // ...AND >= 1.2x the leader's, so a 1-comp edge never qualifies
function thinWindowPriceChallenger(routes, priorities) {
  // A speed-priority seller's fast thin-window pick is intentional; never demote it to a
  // slower strong-price venue. The override is for the default (price/evidence) read only.
  if (priorities && priorities.fastSale) return null;
  const routable = (routes || []).filter(r => r.routable !== false);
  if (routable.length < 2) return null;
  const top = routable[0];                         // current card leader (highest score / promoted)
  if (top.winCondition) return null;               // a curated win-condition pick stands
  const ev = top.marketEvidence || {};
  const topSales = Number(ev.evidenceSales || 0);
  if (topSales === 0 || topSales > THIN_PICK_MAX) return null;   // not thin (or no evidence at all)
  if (top.priceOutcome === "strong") return null;               // leader IS the strong-price route: keep it
  const topDepth = Number(ev.modelComps180 || 0);
  const qualifying = routable.slice(1).filter(r => {
    const e = r.marketEvidence || {};
    if (!(r.routeFitFacts || []).includes("strong_price_signal_route")) return false;
    if (Number(e.evidenceSales || 0) < topSales) return false;  // never trade down to an even thinner window
    const depth = Number(e.modelComps180 || 0);
    return depth >= DEPTH_FLOOR && depth >= topDepth * DEPTH_RATIO && depth > topDepth;
  });
  if (!qualifying.length) return null;
  qualifying.sort((a, b) => (Number(b.marketEvidence?.modelComps180 || 0) - Number(a.marketEvidence?.modelComps180 || 0)) || (b.score - a.score));
  return qualifying[0];
}
// Reorders `routes` in place: promotes the qualifying challenger to the front and marks
// it, so BOTH the card order (routeFit.routes) and the recommended pick
// (pickRecommendedRoute, which honors the marker) move together, and the frontend
// routesForCards mirror honors the same marker. Kept in lockstep across all three.
function applyThinWindowPriceOverride(routes, priorities) {
  const challenger = thinWindowPriceChallenger(routes, priorities);
  if (!challenger) return;
  const idx = routes.indexOf(challenger);
  if (idx > 0) { routes.splice(idx, 1); routes.unshift(challenger); }
  challenger.thinWindowPriceLead = true;
}

// Hybrid win-condition routing (Phase 2). A curated table marks a niche platform
// (Hagerty / PCARMarket) as ELIGIBLE for a segment; the car's OWN comps must
// back it (>= BACKING_MIN comparable sales on that platform) or nothing changes.
// High confidence -> Card 1; moderate -> Card 2 only; low -> never auto-routed.
// The measured share is a routing signal, never rendered (rule 1).
function applyWinConditions(routes, vehicle) {
  const wc = findWinCondition(vehicle);
  if (!wc || wc.confidence === "low") return;
  const candidate = routes.find(route => route.policyKey === wc.platform && route.routable);
  if (!candidate) return;
  const ev = candidate.marketEvidence || {};
  const carComps = (ev.closeSales || 0) + (ev.relevantSales || 0);
  if (carComps < BACKING_MIN) return; // not backed by this car's own comps
  candidate.winCondition = { platform: wc.platform, confidence: wc.confidence, segmentLabel: wc.segmentLabel };
  const idx = routes.indexOf(candidate);
  if (wc.confidence === "high") {
    if (idx > 0) { routes.splice(idx, 1); routes.unshift(candidate); }
  } else if (routes.length >= 2 && idx !== 1) {
    // moderate: Card 2 only, never promoted to Card 1.
    routes.splice(idx, 1);
    routes.splice(1, 0, candidate);
  }
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

// Explicit scope tag for the LANDED premium definition (Part 3). Derived from
// the landed rung key so the frontend headline knows exactly which window the
// delta was measured at (exact year keeps the year; any-year / near-years never
// prepend it). An unrecognized key returns {} so the frontend fails closed.
function premiumLandedScopeTags(landed) {
  const key = String(landed && landed.key || "");
  if (/generation/.test(key)) return { scope: "generation", generationCode: (landed.definition && landed.definition.generationCode) || null };
  if (/exact_year/.test(key)) return { scope: "exact_year" };
  if (/near_years/.test(key)) return { scope: "near_years" };
  if (/year_range/.test(key)) return { scope: "year_range" };
  if (/any_year/.test(key)) return { scope: "any_year" };
  if (/make/.test(key)) return { scope: "make" };
  return {};
}

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
  // Trim first, then body style, so "911 Cabriolet" comps don't mix with coupes.
  // Body style only narrows when the seller actually specified one (extractor is
  // conservative), so recall loss is limited to those cars.
  const keywords = [];
  // fetchTrim = the pool-alias parent badge when set (Weissach->GT3 RS), else the
  // real trim. Pooling only; the display trim (vehicle.trim) is untouched.
  const fetchTrim = vehicle.fetchTrim || vehicle.trim;
  if (rung.needTrim && fetchTrim) keywords.push(fetchTrim);
  if (vehicle.bodyStyle) keywords.push(vehicle.bodyStyle);
  if (keywords.length) params.keyword = keywords.join(" ");
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
  const fetchTrim = vehicle.fetchTrim || vehicle.trim; // pool-alias parent badge when set
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
        ...(rung.needTrim && fetchTrim ? { keyword: fetchTrim } : {})
      }
    });
  }
  for (const term of modelSearchTerms(vehicle)) {
    passes.push({
      name: `rung${rung.rung}_${rung.key}_keyword_${term}`,
      label: `${rung.label} (keyword ${term})`,
      rung: rung.rung,
      pages: 1,
      params: { make: vehicle.make, keyword: [term, rung.needTrim ? fetchTrim : null].filter(Boolean).join(" "), ...bounds }
    });
  }
  return passes;
}

// 7C name-mismatch fallbacks: when the broad model pass returns nothing usable,
// try the generation code as a model and each model-search term as a keyword,
// all WITHOUT year bounds (broadest), once each. Local slicing then applies every
// rung and window to whatever returns.
function broadFallbackPasses(vehicle, generationToken = null) {
  const passes = [];
  if (generationToken) {
    passes.push({
      name: `fallback_genmodel_${generationToken}`,
      label: `${asText(vehicle.make)} ${generationToken} recent sales`,
      rung: null, pages: 1,
      params: { make: vehicle.make, model: generationToken }
    });
  }
  for (const term of modelSearchTerms(vehicle)) {
    passes.push({
      name: `fallback_keyword_${term}`,
      label: `${asText(vehicle.make)} "${term}" recent sales`,
      rung: null, pages: 1,
      params: { make: vehicle.make, keyword: term }
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

function evaluateLadder(pairedRecords, ladder, vehicle) {
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
      // ROUTABLE-only stop/land gate (Aug 2026, i8 fix): the effective-sample decision
      // that halts widening counts ONLY region-usable, allowlisted sources - never comps
      // the pick can't use (UK/consignment). A thin single-platform recent window (2
      // Cars & Bids i8 at 90d) no longer "clears" on non-routable neighbours, so the
      // ladder keeps widening - and the fetch keeps paging / runs the broad fallback -
      // until the real cross-platform routable picture is in hand (surfacing the 50
      // Bring a Trailer i8 sitting slightly further back in our own archive). Dense
      // models still clear at the narrow window unchanged (many routable comps there).
      const inWindow = eligible.filter(item => daysAgo(item.record.auction_end_date) <= windowDays && (!vehicle || isEvidenceSource(item.record, vehicle)));
      const effective = calculateEffectiveSampleSize(inWindow.map(item => daysAgo(item.record.auction_end_date)), rung.key);
      if (effective >= MINIMUM_EFFECTIVE_SAMPLE) {
        landedWindow = windowDays;
        landedEffective = effective;
        break;
      }
    }
    const routableEligible = vehicle ? eligible.filter(item => isEvidenceSource(item.record, vehicle)) : eligible;
    return {
      rung: rung.rung,
      key: rung.key,
      label: rung.label,
      threshold: rung.threshold,
      sales: eligible.length,
      routableSales: routableEligible.length,
      effectiveSample: landedEffective || calculateEffectiveSampleSize(eligible.map(item => daysAgo(item.record.auction_end_date)), rung.key),
      windowDays: landedWindow,
      met: landedWindow !== null,
      definition: rung
    };
  });

  let landed = walk.find(entry => entry.met) || null;
  let thin = false;
  // Specificity beats make-level noise (Aug 2026, i8 residual): if the only rung that
  // cleared is make/segment context but a MODEL rung actually holds real routable comps
  // (>=3, just too few to clear the recency-weighted gate), land there as THIN at the
  // widest window - so an ultra-thin nameplate (Xterra) reads on its own cross-platform
  // comps, never on make-level data. Prevents the routable-gate change from pushing
  // ultra-thin models down to make_context.
  if (landed && (landed.key === "make_context" || landed.key === "segment")) {
    const modelRungs = walk.filter(entry => /_model$/.test(entry.key) && (entry.routableSales || 0) >= 3);
    if (modelRungs.length) {
      const best = modelRungs.sort((a, b) => (b.routableSales || 0) - (a.routableSales || 0))[0];
      landed = { ...best, windowDays: maxWindow, met: true };
      thin = true;
    }
  }
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
  let rateLimited = false;      // OCD's own monthly plan is exhausted (429)
  let rateLimit = null;         // OCD rate-limit headers (authoritative remaining)
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
      if (err.status === 429 || err.rateLimited) { rateLimited = true; rateLimit = err.rateLimit || rateLimit; }
      break;
    } finally {
      clearTimeout(timeout);
    }

    if (result && result.__rateLimit) rateLimit = result.__rateLimit;
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
  return { records, error, meteredRequests, pagesFetched, rateLimited, rateLimit };
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
  let rateLimited = false;      // OCD monthly plan exhausted mid-walk
  let rateLimit = null;         // latest OCD rate-limit headers

  const evaluate = () => evaluateLadder(
    records.map(record => ({ record, classification: classifyRecord(record, vehicle) })),
    ladder,
    vehicle
  );

  const runPass = async pass => {
    const passResult = await fetchPass(pass, apiKey, deadline);
    meteredRequests += passResult.meteredRequests;
    if (passResult.rateLimited) { rateLimited = true; rateLimit = passResult.rateLimit || rateLimit; }
    else if (passResult.rateLimit) { rateLimit = passResult.rateLimit; }
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

  // 7C: the per-rung PRIMARY fetches are unchanged (year-targeted, one page at a
  // time, stop when the rung meets its threshold), so the LANDED rung is identical
  // to the original walk. The keyword / generation-code FALLBACKS - the source of
  // the thin-nameplate call explosion, because the original ran them once PER rung
  // with each rung's year bounds - now run ONCE per search, year-unbounded, so the
  // one superset slices locally to every rung. Dense cars land on their primary
  // fetch and never reach the fallback (~1 call, unchanged); a thin/oddly-named
  // nameplate stops re-running the same keyword searches for every rung.
  let ranBroadFallbacks = false;
  const ensureBroadFallbacks = async () => {
    if (ranBroadFallbacks) return;
    ranBroadFallbacks = true;
    for (const fallbackPass of broadFallbackPasses(vehicle, generationToken)) {
      if (Date.now() >= deadline) break;
      await runPass(fallbackPass);
      if (evaluate().landed?.met) break;
    }
  };

  let ladderEval = evaluate();
  for (const rung of ladder) {
    if (rateLimited) { stoppedEarly = true; stopReason = "rate_limited"; break; }  // don't fire doomed 429s at every rung
    if (Date.now() >= deadline) { stoppedEarly = true; stopReason = "time_budget_reached"; break; }
    if (ladderEval.landed?.met && ladderEval.landed.rung <= rung.rung) break;
    const rungMet = () => !!evaluate().walk.find(entry => entry.rung === rung.rung)?.met;
    let primary = null;
    for (let page = 1; page <= rung.pages; page++) {
      primary = await runPass({
        name: `rung${rung.rung}_${rung.key}_p${page}`,
        label: rung.label, rung: rung.rung, pages: 1, startPage: page,
        params: rungFetchParams(rung, vehicle)
      });
      if (primary.error) break;
      if (!primary.records.length) break;
      if (rungMet()) break;
      if (Date.now() >= deadline) break;
    }
    // Fallbacks once per search (deduped), only when a primary left the rung unmet.
    if (!rungMet() && (!primary || !primary.error)) await ensureBroadFallbacks();
    ladderEval = evaluate();
    if (ladderEval.landed?.met && ladderEval.landed.rung <= rung.rung) {
      stoppedEarly = true;
      stopReason = `ladder_rung_${ladderEval.landed.rung}_satisfied`;
      break;
    }
  }

  if (ladderEval.landed?.met) {
    stoppedEarly = true;
    stopReason = stopReason || `ladder_rung_${ladderEval.landed.rung}_satisfied`;
  } else if (!stopReason) {
    stopReason = "ladder_walk_complete";
  }

  return {
    records,
    passSummary,
    stoppedEarly,
    stopReason,
    elapsedMs: Date.now() - startedAt,
    timeBudgetMs: FETCH_TIME_BUDGET_MS,
    meteredRequests,
    rateLimited,
    rateLimit,
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
// 7A.2: monthly plan cap, env-driven so the 1K->10K upgrade is a config change.
const OCD_MONTHLY_BUDGET = Number(process.env.OCD_MONTHLY_BUDGET || 1000);
// 7E: the nightly warm may spend only up to this fraction of the budget, so a
// real seller search always has headroom left and outranks the warm.
const WARM_BUDGET_FRACTION = Number(process.env.OCD_WARM_BUDGET_FRACTION || 0.7);

async function ocdMeteredSince(sinceIso, supabaseUrl, supabaseKey, limit = 2000) {
  if (!supabaseUrl || !supabaseKey) return null;
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `app_usage_events?created_at=gte.${sinceIso}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=${limit}`
  );
  // null (unreadable/missing table) propagates so the guard can raise a BLIND
  // critical condition rather than silently reading zero.
  if (!rows) return null;
  return rows.reduce((sum, row) => sum + (Number(row.oldcarsdata_metered_requests) || 0), 0);
}

async function ocdRequestsToday(supabaseUrl, supabaseKey) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return ocdMeteredSince(since.toISOString(), supabaseUrl, supabaseKey, 2000);
}

async function ocdRequestsThisMonth(supabaseUrl, supabaseKey) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  return ocdMeteredSince(since.toISOString(), supabaseUrl, supabaseKey, 20000);
}

// Returns the highest monthly warning band (80% then 50%) that THIS fetch crosses
// into, so the crossing is logged exactly once by the search that trips it.
function budgetWarningCrossing(before, added, budget) {
  if (before == null || !Number.isFinite(budget) || budget <= 0) return null;
  const after = before + (Number(added) || 0);
  for (const pct of [80, 50]) {
    const threshold = Math.floor(budget * pct / 100);
    if (before < threshold && after >= threshold) return { pct, threshold, after };
  }
  return null;
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
  const env = { supabaseUrl, supabaseKey };
  const mkq = encodeURIComponent(vehicle.make);
  const modelHead = vehicle.model ? String(vehicle.model).split(/\s+/)[0] : "";
  // PostgREST caps each read at 1000 rows. A make-wide read alone (BMW) is dominated by
  // recent common models, so a LOW-VOLUME model inside a HIGH-VOLUME make (an i8 among
  // thousands of 3-Series) has its older records crowded out of the top 1000 - the exact
  // reason the i8's Bring a Trailer records were missing from the pick. So pull the
  // MODEL's own records too (model-first at merge) so they can never be crowded out.
  const [makeRows, modelRows] = await Promise.all([
    supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`),
    modelHead ? supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&model=ilike.${encodeURIComponent("*" + modelHead + "*")}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`) : Promise.resolve(null)
  ]);
  const records = [];
  const seenStore = new Set();
  for (const list of [modelRows || [], makeRows || []]) {
    for (const row of list) {
      const rec = row && row.raw_record;
      if (!rec || typeof rec !== "object") continue;
      const k = sourceRecordKey(recordPlatform(rec), sourceRecordId(rec));
      if (seenStore.has(k)) continue;
      seenStore.add(k);
      records.push(rec);
    }
  }
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
    // The clean preference value ("powerseller" | "diy" | "unsure"). Was dropped here,
    // so the journey's recorded preference fell back to `involvement`, which is EMPTY
    // for the "unsure" default - the Journey Explorer Preference column then read blank
    // for every unsure seller. The engine reads criteria.involvement (not this), so
    // carrying it through is journey-attribution only, no decision impact.
    sellerPreference: asText(car.sellerPreference) || null,
    notes: asText(car.notes) || null
  };
}

function analyze(records, classifications, ladder, vehicle, debug) {
  const pairedRecords = records.map((record, index) => ({ record, classification: classifications[index] }));
  const maxWindow = ANALYSIS_WINDOWS_DAYS[ANALYSIS_WINDOWS_DAYS.length - 1];
  const { walk, landed, thin } = evaluateLadder(pairedRecords, ladder, vehicle);
  const windowDays = landed?.windowDays ?? maxWindow;

  const inWindow = pairedRecords
    .filter(item => daysAgo(item.record.auction_end_date) <= windowDays)
    .filter(item => item.classification.comparison_tier !== "excluded");
  const excludedRecords = pairedRecords
    .filter(item => item.classification.comparison_tier === "excluded");
  // Evidence tallies count ALLOWLISTED sources only (July 2026): white-glove
  // consignment (rmsothebys/gooding) and the vendor-name anomaly never inflate
  // the match counts that back the recommendation and its confidence.
  const inWindowEvidence = inWindow.filter(item => isEvidenceSource(item.record, vehicle));
  const closeMatches = inWindowEvidence.filter(item => item.classification.comparison_tier === "close_match");
  const relevantMatches = inWindowEvidence.filter(item => ["close_match", "relevant_match"].includes(item.classification.comparison_tier));
  const broadMatches = inWindowEvidence.filter(item => item.classification.comparison_tier === "broad_match");

  // The evidence set is exactly what the landed rung defines. No rung with
  // evidence at all means the decision falls to the regional policy floor.
  // evidenceSet stays FULL so excluded-source medians survive for the honest
  // strongerNonRoutable pre-note; evidenceSetAllowed is the allowlisted subset
  // that drives every tally, denominator and confidence number.
  const evidenceSet = landed
    ? pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= windowDays && ladderEligible(item, landed.definition)
      )
    : [];
  const evidenceSetAllowed = evidenceSet.filter(item => isEvidenceSource(item.record, vehicle));

  const platformMap = new Map();
  for (const item of evidenceSet) {
    // Marque gate (belt-and-suspenders): a Mercedes-only source (MB Market) never
    // forms a platform entry for a non-Mercedes search, so it can never be a pick,
    // a comparison card, or a denominator outside its marque.
    if (marqueGatedBlocked(item.record, vehicle)) continue;
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

  const totalEvidenceSales = evidenceSetAllowed.length;
  const strongestSales = [...evidenceSetAllowed]
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
    for (const window of PREMIUM_WINDOWS_DAYS) {
      const eligible = pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= window && segmentEligible(item) && isEvidenceSource(item.record, vehicle));
      const mineSold = eligible.filter(item => recordPlatform(item.record) === platform).length;
      const othersSold = eligible.length - mineSold;
      if (mineSold >= 5 && othersSold >= 5) {
        return { mineSold, othersSold, windowDays: window, scope: "segment", segmentLabel: segmentDef.label, models: segmentDef.models };
      }
    }
    return null;
  };
  // Comparative momentum (July 2026): this platform's recent 30-day median
  // for the landed-scope comps, exposed so the frontend can compute the
  // pick-vs-alt gap in the SAME window. Comparing two platforms at one time
  // cancels variant mix (both sell the same distribution), the way the
  // premium claim does; a temporal same-platform momentum does not and was
  // dropped. The median is computation-only and never rendered.
  const recent30For = platform => {
    if (!landed) return null;
    const prices = pairedRecords.filter(item =>
      recordPlatform(item.record) === platform &&
      daysAgo(item.record.auction_end_date) <= 30 &&
      ladderEligible(item, landed.definition))
      .map(item => Number(item.classification.price)).filter(Number.isFinite);
    if (prices.length < 2) return null;
    return { median: median(prices), count: prices.length };
  };
  const premiumWalkTraces = debug ? {} : null;
  // Debug-only per-platform weekday-signal trace: every scope attempt (model ->
  // generation -> make) with its 180-day weekday comps vs the sample gate and the
  // best-day margin vs the tier bars. Powers the gate audit (numbers, not opinions).
  const signalTraces = debug ? {} : null;
  const pricePremiumFor = platform => {
    if (!landed || landed.key === "make_context") return null;
    const trace = premiumWalkTraces ? (premiumWalkTraces[platform] = []) : null;
    // A measured sub-10% gap at the first sample-sufficient step ships too:
    // the frontend renders it as the honest negligibility claim (Tier 1.5).
    let firstMeasured = null;
    for (const window of PREMIUM_WINDOWS_DAYS) {
      const scopeDefs = window === 45 ? [landed.definition] : [landed.definition, premiumGenerationDef].filter(Boolean);
      for (const def of scopeDefs) {
        const eligible = pairedRecords.filter(item =>
          daysAgo(item.record.auction_end_date) <= window && ladderEligible(item, def) && isEvidenceSource(item.record, vehicle));
        const mine = eligible.filter(item => recordPlatform(item.record) === platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const others = eligible.filter(item => recordPlatform(item.record) !== platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const step = trace ? { scope: def === landed.definition ? `landed(${landed.key})` : `generation(${def.generationCode || def.key})`, windowDays: window, mineSold: mine.length, othersSold: others.length } : null;
        // The finding MUST carry the rung it was measured at (Part 3): the
        // frontend headline needs it to label the sales honestly and never
        // prepend the requested year to an any-year or near-years window. An
        // absent scope makes the frontend fail closed instead of guessing.
        const scopeTags = def === landed.definition ? premiumLandedScopeTags(landed) : { scope: "generation", generationCode: def.generationCode || null };
        // Asymmetric gate fires ONLY when the "others" sample is too thin (<5)
        // to compute a symmetric price delta. When others has 5+, the delta is
        // computable and IS the decision reason, so it must be stated (headline
        // honesty): the symmetric branch below wins. Market dominance is the
        // fallback for genuinely one-platform markets, never a preemption of a
        // computable delta.
        const total = mine.length + others.length;
        const marketShare = total > 0 ? Math.round(mine.length / total * 100) : 0;
        if (mine.length >= 5 && others.length < 5 && marketShare >= 75 && total >= 10) {
          if (step) { step.gateType = "asymmetric"; step.marketShare = marketShare; step.samplesGatePass = true; step.landed = true; trace.push(step); }
          return { type: "market_dominance", gateType: "asymmetric", marketShare, percent: null, windowDays: window, platformSales: mine.length, othersSales: others.length, ...scopeTags };
        }
        if (mine.length >= 5 && others.length >= 5) {
          const gap = Math.round((median(mine) - median(others)) / median(others) * 100);
          if (step) { step.gateType = "symmetric"; step.gapPercent = gap; step.samplesGatePass = true; step.premiumGatePass = gap >= 10; trace.push(step); }
          const proof = {
            type: "premium", gateType: "symmetric",
            percent: gap, windowDays: window, platformSales: mine.length, othersSales: others.length,
            ...scopeTags
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
      for (const window of PREMIUM_WINDOWS_DAYS) {
        const eligible = pairedRecords.filter(item =>
          daysAgo(item.record.auction_end_date) <= window && segmentEligible(item) && isEvidenceSource(item.record, vehicle));
        const mine = eligible.filter(item => recordPlatform(item.record) === platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const others = eligible.filter(item => recordPlatform(item.record) !== platform)
          .map(item => Number(item.classification.price)).filter(Number.isFinite);
        const step = trace ? { scope: `segment(${segmentDef.key})`, windowDays: window, mineSold: mine.length, othersSold: others.length } : null;
        const segTags = { scope: "segment", segmentLabel: segmentDef.label, models: segmentDef.models };
        const segTotal = mine.length + others.length;
        const segShare = segTotal > 0 ? Math.round(mine.length / segTotal * 100) : 0;
        if (mine.length >= 5 && others.length < 5 && segShare >= 75 && segTotal >= 10) {
          if (step) { step.gateType = "asymmetric"; step.marketShare = segShare; step.samplesGatePass = true; step.landed = true; trace.push(step); }
          return { type: "market_dominance", gateType: "asymmetric", marketShare: segShare, percent: null, windowDays: window, platformSales: mine.length, othersSales: others.length, ...segTags };
        }
        if (mine.length >= 5 && others.length >= 5) {
          const gap = Math.round((median(mine) - median(others)) / median(others) * 100);
          if (step) { step.gateType = "symmetric"; step.gapPercent = gap; step.samplesGatePass = true; step.premiumGatePass = gap >= 10; trace.push(step); }
          if (gap >= 10) {
            if (step) step.landed = true;
            return { type: "premium", gateType: "symmetric", percent: gap, windowDays: window, platformSales: mine.length, othersSales: others.length, ...segTags };
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
  // Weekday advantage is a TIMING pattern (not a price claim), so it computes over
  // the past 365 days (approved widen, Aug 2026): a full year gives day-of-week
  // patterns a real base without touching the 180-day price-delta cap. ALL quality
  // gates unchanged (15 sample, 10% lift, 3 sales, non-weekend). Scope preference
  // model -> generation -> make; scope and the 365-day window are carried through.
  const WEEKDAY_WINDOW_DAYS = 365;
  const platformDayAdvantage = platform => {
    const withinWindow = list => list.filter(item => daysAgo(item.record.auction_end_date) <= WEEKDAY_WINDOW_DAYS);
    const weekdaysOnly = list => list.filter(item => {
      const day = weekdayName(item.record.auction_end_date);
      return day && day !== "Saturday" && day !== "Sunday";
    });
    const gate = insight => insight && insight.strongestWeekdaySales >= 3 && insight.strongestWeekdayLiftPercent >= 10
      && !["Saturday", "Sunday"].includes(insight.strongestWeekday);
    const mine = item => recordPlatform(item.record) === platform;
    // Weekday sample gate (1b): a day-of-week pattern splits the sample across
    // seven days, so it needs a real base. Require 15+ weekday sold comps in the
    // window at the rendered scope AND 3+ sales on the winning day. Below the gate
    // we fall through to the next scope; if none clears, no line.
    const WEEKDAY_MIN_SAMPLE = 15;
    const build = (records, scope) => {
      const pool = weekdaysOnly(withinWindow(records));
      const insight = pool.length ? strongestWeekdayInsight(pool) : null;
      const sampleGatePass = pool.length >= WEEKDAY_MIN_SAMPLE;
      const dayGatePass = sampleGatePass && gate(insight);
      if (signalTraces) {
        const t = (signalTraces[platform] = signalTraces[platform] || { weekday: [] });
        t.weekday.push({
          scope, weekdayComps: pool.length, windowDays: WEEKDAY_WINDOW_DAYS, sampleGateNeed: WEEKDAY_MIN_SAMPLE, sampleGatePass,
          bestDay: insight ? insight.strongestWeekday : null,
          bestDaySales: insight ? insight.strongestWeekdaySales : null, bestDayNeed: 3,
          liftPercent: insight ? insight.strongestWeekdayLiftPercent : null,
          dayGatePass: !!dayGatePass, failedThreshold: !sampleGatePass ? "sample<15" : !dayGatePass ? "day<3 or lift<10 or weekend" : null
        });
      }
      if (!sampleGatePass) return null;
      return gate(insight)
        ? { weekday: insight.strongestWeekday, sales: insight.strongestWeekdaySales, liftPercent: insight.strongestWeekdayLiftPercent, scope, window: WEEKDAY_WINDOW_DAYS, sample: pool.length }
        : null;
    };
    const model = build(pairedRecords.filter(item => mine(item) && ["close_match", "relevant_match"].includes(item.classification?.comparison_tier)), "model");
    if (model) return model;
    if (premiumGenerationDef) {
      const generation = build(pairedRecords.filter(item => mine(item) && ladderEligible(item, premiumGenerationDef)), "generation");
      if (generation) return generation;
    }
    return build(pairedRecords.filter(item => mine(item) && item.classification?.comparison_tier && item.classification.comparison_tier !== "excluded"), "make");
  };

  let platformPerformance = [...platformMap.entries()]
    .map(([platform, items]) => {
      const weekdayInsight = strongestWeekdayInsight(items);
      const otherPrices = evidenceSet
        .filter(item => recordPlatform(item.record) !== platform && isEvidenceSource(item.record, vehicle))
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
        recent30: recent30For(platform),
        // Typical price band of THIS platform's comps (25th-75th pct): fuels
        // the car-specific alternative bullet. A range, never a median.
        priceBand: (() => {
          const prices = items.map(item => Number(item.classification.price)).filter(Number.isFinite).sort((a, b) => a - b);
          if (prices.length < 2) return null;
          const q = f => prices[Math.max(0, Math.min(prices.length - 1, Math.round(f * (prices.length - 1))))];
          return { low: q(0.25), high: q(0.75), sample: prices.length };
        })(),
        evidenceSales: items.length,
        // Genuine same-model sales for THIS platform in the landed window (any
        // year, excluded/non-genuine builds already removed). This is the ONLY
        // count copy may render as a model-specific "sold N {model}s": evidenceSales
        // counts the landed RUNG, which at a make/broad rung includes OTHER models,
        // so labeling it with the searched model fabricates a statistic (rule 1).
        // The "9 Model Ts" bug was 9 assorted 1922-1938 Fords; modelSales here is 1.
        modelSales: items.filter(item => item.classification.same_model).length,
        // Model-level sold comps for THIS platform in the 180-day window (any
        // trim, model-relevant tiers). Feeds the ranking ladder's branch-4
        // relevance floor ("3+ at the landed rung OR model level"), so a
        // trim-narrowed landed rung never wrongly floors out a speed pick.
        modelComps180: pairedRecords.filter(item =>
          recordPlatform(item.record) === platform
          && daysAgo(item.record.auction_end_date) <= 180
          && ["close_match", "relevant_match"].includes(item.classification?.comparison_tier)).length,
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
    evidenceSales: evidenceSetAllowed.length,
    estimatedValue: median(evidenceSetAllowed.map(item => item.classification.price)),
    // Earliest boundary of the ladder-eligible set (all-time): the "since
    // YYYY" label on all-time claims must name a verifiable date.
    earliestSaleDate: landed
      ? pairedRecords.filter(item => ladderEligible(item, landed.definition))
          .map(item => item.record.auction_end_date).filter(Boolean).sort()[0] || null
      : null,
    thinMarket: thin || !landed || evidenceSetAllowed.length < landed.threshold,
    ladder: {
      landed: landed ? {
        rung: landed.rung,
        key: landed.key,
        label: landed.label,
        generationCode: landed.definition?.generationCode ?? null,
        windowDays,
        sales: evidenceSetAllowed.length,
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
      if (!landed || !evidenceSetAllowed.length) return null;
      const ages = evidenceSetAllowed.map(item => daysAgo(item.record.auction_end_date));
      const recencySample = Math.round(ages.filter(a => a <= 90).reduce((sum, a) => sum + getRecencyMultiplier(a), 0) * 10) / 10;
      const counts = {};
      for (const item of evidenceSetAllowed) counts[recordPlatform(item.record)] = (counts[recordPlatform(item.record)] || 0) + 1;
      const score = calculateConfidenceScore({
        recencySample,
        totalSample: landed.effectiveSample ?? evidenceSetAllowed.length,
        platformDominance: getPlatformDominanceScore(counts),
        outcomeSample: evidenceSetAllowed.length
      });
      return { score, level: getConfidenceLevel(score) };
    })(),
    platformPerformance,
    sellerActivity: analyzeSellerActivity(pairedRecords),
    debugPremiumWalk: premiumWalkTraces || undefined,
    debugSignalTraces: signalTraces || undefined,
    // Request-gated diagnostics (body.debug === true): per-window eligible
    // counts, pairwise premium math and earliest dates. Never rendered.
    debugWindows: debug && landed ? [45, 90, 180].map(window => {
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
  // Reserve context (Phase 1.5): attach the platform+make+asking-price-band cell
  // to every routable platform's evidence, so the composer can render it on the
  // pick card (Card 1 only). No cell -> field absent, nothing renders.
  const reserveAsking = parseSellerTargetPrice(criteria.targetPrice);
  for (const route of routeFit.routes) {
    if (route.routable && route.marketEvidence && vehicle?.make) {
      const cell = findReserveContext(route.platform || route.label, vehicle.make, reserveAsking);
      if (cell) route.marketEvidence.reserveContext = cell;
    }
  }
  // Specialization share (Stage 2): attach the platform's specialization cell at
  // the landed scope (segment -> generation -> model fallback) to every routable
  // route. Renders on whichever card the platform appears on; no cell -> field
  // absent, nothing renders. Zero OldCarsData calls (precomputed monthly).
  if (vehicle?.make && vehicle?.model) {
    const normS = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const familyS = m => normS(String(m || "").split(/\s+/)[0]);
    const landedKey = String(analysis.ladder?.landed?.key || "");
    const rungWord = /generation/.test(landedKey) ? "generation" : /make/.test(landedKey) ? "make" : "model";
    const seg = MODEL_SEGMENTS.find(s => normS(s.make) === normS(vehicle.make) && s.models.some(m => familyS(m) === familyS(vehicle.model)));
    const scopeQuery = { rung: rungWord, make: vehicle.make, model: vehicle.model, generationCode: analysis.ladder?.landed?.generationCode || null, segmentKey: seg?.key || null };
    for (const route of routeFit.routes) {
      if (!route.routable || !route.marketEvidence) continue;
      const spec = findSpecializationContext(route.platform || route.label, scopeQuery);
      if (spec) route.marketEvidence.specializationCell = spec;
    }
  }
  // The recommended route is the volume-aware pick, IDENTICAL to the frontend's
  // routesForCards ladder (js/result.js) so the saved-list pick (read from
  // recommendedPath) and the rendered card can never diverge. The old code took
  // the raw score-sort winner, which let a small-sample, high-median platform
  // (Hemmings on 10 MGB sales vs BaT's 105; SOMO on 1 992 sale vs BaT's 10)
  // become recommendedPath while the card correctly showed the volume leader.
  const bestRoute = pickRecommendedRoute(routeFit.routes)
    || routeFit.routes.find(route => route.routable) || routeFit.routes[0] || null;
  // Coherence fact: a non-routable source with a stronger median than the pick
  // must be explained, never silently presented as "stronger but not chosen".
  // Gated on a real sample (5+ sales): a one- or two-sale median is a mix
  // artifact, not "the strongest comparable results", and must never headline.
  const pickMedian = bestRoute?.marketEvidence?.medianSalePrice || null;
  const strongerNonRoutable = routeFit.routes.find(route =>
    !route.routable && (route.marketEvidence?.evidenceSales || 0) >= 5 &&
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
    why: bestRoute.thinWindowPriceLead
      // Thin-window price-signal override: state the reasoning honestly. The pick weighs
      // a deeper, price-stronger track record over a small recent-window sample. No money
      // claim (rule 11): it names the depth and the strong-price signal, not a "more money".
      ? [
          `${bestRoute.platform} has the deeper track record for this car and the stronger price signal in our data.`,
          `Recent comparable sales are thin right now, so the pick weighs the broader record over a small recent sample.`,
          wideningFact(analysis),
          sellerActivityExplanation(analysis.sellerActivity, bestRoute.platform)
        ].filter(Boolean)
      : [
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
  // Sell-through removed (1b): a "% sold" rate is a banned claim (sold-only
  // data). The partner's tracked-sales COUNT stays as a track-record total.
  const empty = { trackedSales: 0, belowCareerMinimum: true, medianSaleValue: null, makeMix: null, relevance: null, latestSaleDate: null };
  if (!usernames.length || !supabaseUrl || !supabaseKey) return empty;
  const career = await computePartnerCareerStats(usernames, { supabaseUrl, supabaseKey });
  if (!career) return empty;
  return {
    trackedSales: career.trackedSales,
    latestSaleDate: career.latestSaleDate,
    medianSaleValue: career.medianSaleValue,
    makeMix: career.makeMix,
    belowCareerMinimum: career.belowCareerMinimum,
    relevance: partnerRelevance(career, vehicle, estimatedValue)
  };
}

export function partnerRegionCovered(partner, criteria) {
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

// A partner MARQUE match: the partner explicitly lists the car's make in their
// specialties. This is a stronger, ranked-above signal than a broad segment
// overlap (a European-segment generalist is not an Audi specialist).
function partnerMarqueMatch(partner, vehicle) {
  const makes = (partner.specialties?.makes || []).map(make => String(make).toLowerCase());
  return makes.includes(asText(vehicle.make).toLowerCase());
}

function partnerSegmentMatch(partner, vehicle, priorities) {
  if (partnerMarqueMatch(partner, vehicle)) return true;
  const segments = partner.specialties?.segments || [];
  return priorities.segments.some(segment => segments.includes(segment));
}

// Spencer-specific PREWAR VETO (Option B, Aug 2026). Spencer's one stated blind spot
// is prewar cars. The shared segment vocabulary has no year floor (older_enthusiast /
// pre_1990 bucket a 1935 car identically to a 1985 one) and partnerMarqueMatch is
// year-agnostic, so his 80s/90s segments and German marques would otherwise match a
// prewar BMW/Mercedes. This veto removes ONLY Spencer from the candidate pool for a
// prewar vehicle, so such a car routes to Dan (who covers prewar) or elsewhere with no
// false-match or tie. It is gated on his slug, so it returns false for every other
// partner and can never alter Howard/Ingo/Dan/Chris matching. Deliberately NOT the
// shared era-floor change (parked as a post-launch improvement). Tunable via the
// constant; <= PREWAR_MAX_YEAR is prewar.
const SPENCER_SLUG = "specwerks-ltd";
const PREWAR_MAX_YEAR = 1945;
export function partnerPrewarVetoed(partner, vehicle) {
  if (String(partner?.slug || "") !== SPENCER_SLUG) return false;
  const year = Number(vehicle?.year);
  return Number.isFinite(year) && year > 0 && year <= PREWAR_MAX_YEAR;
}

// Pure candidate comparator (hoisted + exported so the veto/routing invariants are
// unit-testable against the REAL ranking, not a copy). Order:
//   local state > marque > segment > region-bucket proximity > fewer regions > track record.
// Region-bucket proximity (Aug 2026 fix): when nobody explicitly lists the seller's state,
// a partner who covers the seller's Census region (Northeast/Midwest/South/West) via
// explicit coverage outranks one who does not, BEFORE the blunt "fewer regions" tiebreak.
// That tiebreak alone used to hand a West Virginia seller to a Colorado partner (5 regions)
// over a nationwide Northeast partner (11), purely on list length. Track record (tracked
// career sales) is the final fallback so the more proven seller wins a true dead heat.
export const rankPartnerCandidates = (a, b) => (Number(b.local) - Number(a.local))
  || (Number(b.marqueMet) - Number(a.marqueMet))
  || (Number(b.segmentMet) - Number(a.segmentMet))
  || (Number(b.regionProximity) - Number(a.regionProximity))
  || (a.regionCount - b.regionCount)
  || ((Number(b.trackRecord) || 0) - (Number(a.trackRecord) || 0));

// Region-bucket proximity: the partner explicitly covers the seller's Census region (not
// via Nationwide). Mirrors partnerLocalState but at region granularity, so a same-region
// partner beats a distant one when neither lists the exact state.
export function partnerRegionProximity(partner, criteria) {
  const sellerBucket = censusRegion(asText(criteria && criteria.state));
  if (!sellerBucket) return false;
  return partnerRegionBuckets(partner && partner.regions || []).has(sellerBucket);
}

// A partner is LOCAL to the seller when they explicitly list the seller's state
// (not merely via "nationwide"). Locality lets a regional specialist outrank a
// broad nationwide generalist for the same car, so all four partners function in
// their own regions instead of the first nationwide row (howS) always winning.
export function partnerLocalState(partner, criteria) {
  const sellerState = asText(criteria.state).toLowerCase();
  if (!sellerState) return false;
  return (partner.regions || []).map(r => String(r).toLowerCase())
    .filter(r => r !== "nationwide")
    .some(r => r === sellerState || r.includes(sellerState) || sellerState.includes(r));
}

// US states (+ DC) for the last-resort locality check (Part 3). A seller's state is
// CONFIRMED only when it resolves to one of these; empty, "Not sure", or an unrecognized
// raw city (one the frontend city map did not cover) is UNCONFIRMABLE.
const US_STATE_SET = new Set(["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","washington, dc","district of columbia","dc"]);
export function localityConfirmed(criteria) {
  const st = asText(criteria && criteria.state).trim().toLowerCase();
  if (!st || /^not sure$/.test(st)) return false;
  return US_STATE_SET.has(st);
}

// PowerSeller value gate with minimum tolerance (product rule, Aug 2026).
// Sellers understate value, so the eligibility floor is the minimum minus a
// tolerance (default 20% -> floor = min * 0.8). The value weighed is the HIGHER
// of the seller's stated asking price and the comps estimate. Pure + exported
// for unit testing. The $40k lead dial (powerseller_value_lead_usd) is separate.
export function powerSellerValueMet(estimatedValue, askingPrice, minValueUsd, tolerancePct) {
  const tol = Math.max(0, Math.min(90, Number(tolerancePct) || 0));
  const floor = Number(minValueUsd) * (1 - tol / 100);
  const gateValue = Math.max(
    Number.isFinite(estimatedValue) ? estimatedValue : 0,
    Number.isFinite(askingPrice) ? askingPrice : 0
  );
  return gateValue > 0 && gateValue >= floor;
}

async function evaluatePartnerReferral(analysis, criteria, vehicle, supabaseUrl, supabaseKey) {
  const partners = await loadActivePartners(supabaseUrl, supabaseKey);
  const priorities = inferSellerPriorities(vehicle, criteria);
  // Value must come from actual comps at a met rung, never thin or policy data.
  const landedMet = !!analysis.ladder?.landed?.thresholdMet;
  const estimatedValue = landedMet && Number.isFinite(analysis.estimatedValue) ? analysis.estimatedValue : null;
  // Minimum tolerance (product rule, Aug 2026): sellers understate value, so the
  // eligibility floor is the minimum minus a tolerance (dial ps_min_tolerance_pct,
  // default 20 -> floor = min * 0.8). The value weighed is the HIGHER of the
  // seller's stated asking price and the comps estimate. The $40k lead dial
  // (powerseller_value_lead_usd) is separate and unchanged.
  const minTolerancePct = await appConfigInt("ps_min_tolerance_pct", 20, supabaseUrl, supabaseKey);
  const askingForGate = parseSellerTargetPrice(criteria.targetPrice);
  const valueMet = powerSellerValueMet(estimatedValue, askingForGate, POWERSELLER_MIN_VALUE_USD, minTolerancePct);
  // Secondary folds into the SAME effective floor as eligibility (min * (1 - tol)),
  // so the PS-render threshold is uniform: a matched partner leads, a region-covered-
  // only partner shows secondary, both from the same value bar.
  const psFloor = POWERSELLER_MIN_VALUE_USD * (1 - Math.max(0, Math.min(90, minTolerancePct)) / 100);

  // Rank every partner, then pick, so a local specialist beats a broad nationwide
  // generalist for the same car. Order: local state > segment fit > tighter
  // regional focus (fewer regions) > stable table order.
  // Prewar veto filter (Option B): removes ONLY Spencer, and ONLY for a prewar
  // vehicle. For any other car it is a no-op (the filter keeps everyone), and for
  // every non-Spencer partner it is always a no-op, so the other four are untouched.
  const cands = partners
    .filter(partner => !partnerPrewarVetoed(partner, vehicle))
    .map(partner => ({
      partner,
      marqueMet: partnerMarqueMatch(partner, vehicle),
      segmentMet: partnerSegmentMatch(partner, vehicle, priorities),
      regionMet: partnerRegionCovered(partner, criteria),
      local: partnerLocalState(partner, criteria),
      regionProximity: partnerRegionProximity(partner, criteria),
      regionCount: (partner.regions || []).length,
      trackRecord: 0
    }));
  // Track-record fallback: tracked career sales per candidate, computed in parallel. It is
  // only the LAST comparator key (a rare decider once locality + region proximity + region
  // count are exhausted), but computing it up front keeps the comparator pure. Best-effort:
  // a failed or empty lookup leaves 0.
  await Promise.all(cands.map(async c => {
    const usernames = (c.partner.seller_usernames || []).filter(Boolean);
    if (!usernames.length) return;
    try { const s = await computePartnerCareerStats(usernames, { supabaseUrl, supabaseKey }); c.trackRecord = (s && s.trackedSales) || 0; } catch (e) {}
  }));
  const anySegment = cands.some(c => c.segmentMet);
  const anyRegion = cands.some(c => c.regionMet);
  // Marque-aware ranking (Aug 2026): a partner who lists the car's actual marque
  // outranks one who only shares a broad European segment. Order: local state >
  // marque match > segment fit > tighter regional focus > stable table order. This
  // is why a nationwide Audi specialist (Dan) wins the Audi over a South-region
  // generalist (Chris) whose only tie was the classic_european segment.
  const rankPartner = rankPartnerCandidates;
  const matchedCand = cands.filter(c => c.segmentMet && c.regionMet).sort(rankPartner)[0] || null;
  let matched = matchedCand ? matchedCand.partner : null;
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
  // Part 3 (last-resort, Aug 2026): with UNCONFIRMABLE locality (US seller, no resolved
  // state), a nationwide generalist must not keep the LEAD purely by ELIMINATION over a
  // region-only specialist that is a STRICTLY STRONGER specialty match but was dropped on
  // unprovable region. We can neither confirm the specialist covers the seller nor honestly
  // claim locality, so we suppress the lead (the platform leads); the region-covered partner
  // can still render as a neutral secondary. Fires only when the dropped regional specialist
  // out-matches the nationwide lead (marque > segment), so a nationwide partner that is an
  // equal-or-better specialty fit still leads legitimately (real coverage, no false claim).
  // Confirmed locality is unchanged; with the current roster this is a rare/dormant safeguard.
  let localitySuppressedLead = false;
  const sellerRegionLc = asText(criteria.region).toLowerCase();
  const isUsSeller = !sellerRegionLc || ["us", "usa", "united states"].includes(sellerRegionLc);
  if (isUsSeller && matched && matchedCand && !localityConfirmed(criteria)) {
    const nationwideOf = p => (p.regions || []).map(r => String(r).toLowerCase()).includes("nationwide");
    const specialtyRank = c => (c.marqueMet ? 2 : 0) + (c.segmentMet ? 1 : 0);
    const strongerRegionalDropped = cands.some(c =>
      c !== matchedCand && !c.regionMet && !nationwideOf(c.partner) &&
      (c.segmentMet || c.marqueMet) && specialtyRank(c) > specialtyRank(matchedCand));
    if (nationwideOf(matched) && strongerRegionalDropped) { matched = null; localitySuppressedLead = true; }
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
  // Secondary is ranked over ALL region-covered partners local-first, NOT defaulted
  // to `matched`: a nationwide generalist that segment-matches broadly (e.g. a
  // "collections, pre-war" partner) must not preempt the seller's own local partner
  // on a secondary card. `matched` still drives the eligible LEAD above.
  const secondaryPartner = (cands.filter(c => c.regionMet).sort(rankPartner)[0]?.partner) || null;
  const secondary = !eligible && !!secondaryPartner && secondaryValue >= psFloor;

  const result = {
    eligible,
    secondary,
    secondaryMinUsd: psFloor,
    minValueUsd: POWERSELLER_MIN_VALUE_USD,
    estimatedValue,
    conditions: {
      valueMet,
      segmentMet: anySegment,
      regionMet: anyRegion,
      partnerAvailable: partners.length > 0,
      localitySuppressedLead
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
    // Match-reason variant (Stage 4): specialty (make/segment fits his stated
    // lane), region (covered but no specialty fit), or generalist (trusted on
    // his whole record). Drives the card's reason line and why-bullets.
    const seg = partnerSegmentMatch(source, vehicle, priorities);
    const makeListed = (source.specialties?.makes || []).map(m => String(m).toLowerCase()).includes(String(vehicle?.make || "").toLowerCase());
    result.matchType = (seg || makeListed) ? "specialty" : (partnerRegionCovered(source, criteria) ? "region" : "generalist");
    // Value-aware lead (Stage 4): for a "not sure" seller the card LEADS when the
    // context value clears a dial (app_config powerseller_value_lead_usd, default
    // 40000), read from the met-comps estimate or the asking price. Threshold lives
    // server-side so it is tunable without a deploy; the frontend reads the boolean.
    // The lead value is the seller's ASKING PRICE from the wizard (not the comp
    // estimate): a "not sure" seller who names a high number is telling us the car
    // is worth handling. No asking price -> never leads on value (platform leads).
    const valueLeadThreshold = await appConfigInt("powerseller_value_lead_usd", 40000, supabaseUrl, supabaseKey);
    const leadValue = Number.isFinite(askingPrice) ? askingPrice : 0;
    result.leadValueUsd = leadValue || null;
    result.valueLeadThresholdUsd = valueLeadThreshold;
    result.leadOnValue = leadValue >= valueLeadThreshold;
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
    source_record_id: stableRecordId(record),
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
  // Gated OFF by default: this table is write-only dead weight (see the flag note
  // above). Skip the insert entirely and return the same skipped shape supabaseInsert
  // yields, so the response diagnostic stays well-formed.
  if (!PERSIST_CLASSIFICATIONS) return { skipped: true, disabled: true, rows: [] };
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

// ===================== 2C: account gate, monthly limits, saved results, funnel =====================
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {} }
  });
  return out;
}
async function supabaseRpc(fn, args, supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify(args)
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}
async function appConfigInt(key, fallback, supabaseUrl, supabaseKey) {
  const rows = await supabaseSelect({ supabaseUrl, supabaseKey }, `app_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  const n = Number(rows && rows[0] && rows[0].value);
  return Number.isFinite(n) ? n : fallback;
}
// Spec C: per-IP rate caps. Count-then-record against the ip_rate_hits ledger.
// Soft (a tiny race is fine for abuse protection) and fail-OPEN: an unreadable
// ledger never blocks a legitimate search. Crew/internal callers never reach here.
function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
}
async function ipHitsSince(ip, kind, sinceIso, supabaseUrl, supabaseKey) {
  if (!ip) return null;
  const rows = await supabaseSelect({ supabaseUrl, supabaseKey },
    `ip_rate_hits?ip=eq.${encodeURIComponent(ip)}&kind=eq.${encodeURIComponent(kind)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1000`);
  return rows ? rows.length : null; // null => unreadable/missing table => fail open
}
async function recordIpHit(ip, kind, supabaseUrl, supabaseKey) {
  if (!ip) return;
  try { await supabaseInsert("ip_rate_hits", [{ ip, kind }], supabaseUrl, supabaseKey, "return=minimal", ""); } catch (e) {}
}
// Count ledger hits by KIND across all IPs (not IP-scoped). Used for the one-time
// pass, where the allowance is bound to the token (kind once:<nonce>), not a device,
// so it counts the same regardless of IP recycling / NAT. Fail-open (null) as above.
async function kindHitsSince(kind, sinceIso, supabaseUrl, supabaseKey) {
  const rows = await supabaseSelect({ supabaseUrl, supabaseKey },
    `ip_rate_hits?kind=eq.${encodeURIComponent(kind)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1000`);
  return rows ? rows.length : null;
}
// OCD authoritative rate-limit reconciliation (Aug 2026). We persist OCD's own
// x-ratelimit-remaining header (read in lib/_ocd.js) after every real fetch so the
// NEXT search's budget guard can soft-degrade BEFORE a 429, using OCD's real count
// rather than only our app_usage_events tally. Stored as a single app_config row.
async function persistOcdRateLimit(rateLimit, supabaseUrl, supabaseKey) {
  try {
    if (!rateLimit) return;
    const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v))) ? Number(v) : null;
    const remaining = num(rateLimit.remaining);
    if (remaining === null) return; // nothing authoritative to store
    const value = { remaining, limit: num(rateLimit.limit), reset: rateLimit.reset != null ? String(rateLimit.reset) : null, at: Date.now() };
    await supabaseInsert("app_config", [{ key: "ocd_rate_limit", value }],
      supabaseUrl, supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key");
  } catch {}
}
// OCD's reset header may be a unix-ms timestamp, a unix-seconds timestamp, a
// retry-after style seconds-from-now count, or an ISO date. Normalize to epoch ms
// (relative counts are measured from persist time `at`). Returns null if unparseable.
function parseOcdResetMs(reset, at) {
  if (reset == null || reset === "") return null;
  const n = Number(reset);
  if (Number.isFinite(n)) {
    if (n > 1e12) return n;            // already ms
    if (n > 1e9) return n * 1000;      // unix seconds
    return (Number(at) || Date.now()) + n * 1000; // seconds-from-now
  }
  const t = Date.parse(reset);
  return Number.isFinite(t) ? t : null;
}
async function readOcdRateLimit(supabaseUrl, supabaseKey) {
  try {
    const rows = await supabaseSelect({ supabaseUrl, supabaseKey }, `app_config?key=eq.ocd_rate_limit&select=value&limit=1`);
    const raw = rows && rows[0] && rows[0].value;
    if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (v && typeof v === "object" && Number.isFinite(Number(v.remaining))) ? { remaining: Number(v.remaining), at: Number(v.at) || 0, reset: v.reset || null } : null;
  } catch { return null; }
}
async function logFunnel(event, fields, supabaseUrl, supabaseKey) {
  try {
    await supabaseInsert("funnel_events", [{
      event,
      anon_session_id: fields.anon_session_id || null,
      user_id: fields.user_id || null,
      dedup_key: fields.dedup_key || null
    }], supabaseUrl, supabaseKey, "resolution=ignore-duplicates,return=minimal", fields.dedup_key ? "?on_conflict=event,dedup_key" : "");
  } catch {}
}
function coarseMonthKey() {
  const d = new Date(Date.now() - 5 * 3600 * 1000); // rough US-eastern shift; dedup tolerance only
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function coarseDayKey() {
  const d = new Date(Date.now() - 5 * 3600 * 1000); // rough US-eastern shift; dedup tolerance only
  return d.toISOString().slice(0, 10);
}
async function persistSavedResult(accountId, payload, supabaseUrl, supabaseKey) {
  try {
    const ins = await supabaseInsert("saved_results", [{ user_id: accountId || null, payload }],
      supabaseUrl, supabaseKey, "return=representation", "");
    return (ins.rows && ins.rows[0] && ins.rows[0].id) || null;
  } catch { return null; }
}
// All-time search count for a user (the guest30 lifetime counter). Uses PostgREST's
// exact-count header (Range 0-0) so it never fetches the rows. Returns null on failure so
// the caller fails OPEN (a count outage never wrongly walls a guest).
async function countAllTimeSearchEvents(userId, supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/search_events?user_id=eq.${encodeURIComponent(userId)}&select=id`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "count=exact", Range: "0-0" }
    });
    const cr = res.headers.get("content-range"); // "0-0/N" or "*/N"
    if (cr && cr.includes("/")) { const n = Number(cr.split("/")[1]); return Number.isFinite(n) ? n : null; }
    return null;
  } catch { return null; }
}

// Returns { block } to short-circuit with that JSON, or { ok, reservationEventId,
// accountId, anonFirstFree, anonSessionId } to proceed. Internal callers skip this.
async function computeSearchGate(req, vehicle, supabaseUrl, supabaseKey) {
  const anonSessionId = typeof req.body?.anonSessionId === "string" ? req.body.anonSessionId.slice(0, 64) : null;
  const cookies = parseCookies(req.headers.cookie);
  // Crew-testing bypass: a device holding the pre-launch crew cookie (gas_crew=ok)
  // skips the free-first gate AND the monthly quota entirely so testing never
  // burns quota or hits the account wall. The search still runs and still logs
  // (app_usage_events seller_decision), but consumes nothing (no reservation, no
  // gas_free_used cookie). The escape hatch: body.forceGate (set by ?realgate=1)
  // makes a crew device run the REAL gate flows on demand.
  const forceGate = req.body?.forceGate === true;
  if (cookies.gas_crew === "ok" && !forceGate) {
    return { ok: true, crewBypass: true, anonSessionId };
  }
  // Spec C (b): total searches per IP per hour, for every non-crew search (auth
  // and anon alike). Set high (default 60/hr) so signed-in users - already daily-
  // capped by A - effectively never hit it; it only catches scripted abuse. Fail
  // open on an unreadable ledger.
  const ip = clientIp(req);
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const hourHits = await ipHitsSince(ip, "search", hourAgo, supabaseUrl, supabaseKey);
  const hourCap = await appConfigInt("ip_cap_all_hour", 60, supabaseUrl, supabaseKey);
  if (hourHits !== null && hourHits >= hourCap) {
    return { block: { status: "ip_rate_limited" } };
  }
  await recordIpHit(ip, "search", supabaseUrl, supabaseKey);
  // Tester cohort (pre-launch): a device holding gas_tester=ok gets its OWN daily
  // allowance (default 10, app_config tester_cap_day) on a SEPARATE counter (kind
  // tester_search), never mixed with the free-tier or subscriber buckets. Searches
  // log with tier "tester" so the dashboard keeps them out of real-user metrics.
  // HARD-REVOKED at the expiry: testerCodeExpired() true -> the cookie is ignored
  // and the device falls through to the normal anon/free gate below. No account.
  // forceGate (?realgate=1) opts a tester into the real gate flows on demand.
  // SIGNED-IN sessions are NEVER the tester cohort: the Beehiiv sign-in link
  // (/api/crew?bhs=...) sets gas_tester ONLY to lift the curtain, but those are real
  // subscriber ACCOUNTS. If a Bearer token is present, skip the tester bypass so the
  // account is tiered by reserve_search (TDV 3/day) instead of the tester counter
  // (10/day, IP-based). The anonymous ?tester= cohort has no token and still bypasses.
  if (cookies.gas_tester === "ok" && !forceGate && !testerCodeExpired() && !req.headers.authorization) {
    const dayStartIso = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
    const testerHits = await ipHitsSince(ip, "tester_search", dayStartIso, supabaseUrl, supabaseKey);
    const testerCap = await appConfigInt("tester_cap_day", 10, supabaseUrl, supabaseKey);
    if (testerHits !== null && testerHits >= testerCap) {
      await logFunnel("tester_daily_limit_hit", { anon_session_id: anonSessionId, dedup_key: `tester:${ip}:${coarseDayKey()}` }, supabaseUrl, supabaseKey);
      return { block: { status: "tester_daily_limit_reached", tier: "tester", dailyCap: testerCap } };
    }
    // Attribution only (NOT allowance): if the tester is also signed in, attach the
    // account id so the journey records WHO ran it and the Journey Explorer email column
    // fills. The tester day counter above is untouched, tier stays "tester", and no
    // reserve_search runs, so nothing counts against the account's own daily quota. A
    // missing or invalid token simply leaves the search anonymous, exactly as before.
    let testerAccountId = null;
    if (req.headers.authorization) {
      try { const a = await validateBearer(req.headers.authorization); if (a) testerAccountId = a.userId; } catch (e) {}
    }
    await recordIpHit(ip, "tester_search", supabaseUrl, supabaseKey);
    return { ok: true, testerBypass: true, anonSessionId, accountId: testerAccountId };
  }
  // One-time pass: a device holding a gas_once cookie carrying a VALID signed token
  // (verifyOnce, lib/_onepass.js) gets a small fixed number of TOTAL searches (default 3,
  // app_config once_cap), counted PER TOKEN across all IPs (kind once:<nonce>), never
  // per day and never mixed with the free/subscriber buckets. The whole link is worth 3
  // searches and then dies for everyone; no account, no reset. A missing/forged token
  // falls through to the normal gate (never trust the cookie: the signature is checked
  // here too). Signed-in sessions skip it; forceGate opts back into the real gate. Logs
  // tier "once" (kept out of real-user metrics).
  if (cookies.gas_once && !forceGate && !req.headers.authorization) {
    const nonce = verifyOnce(cookies.gas_once);
    if (nonce) {
      const kind = `once:${nonce}`;
      const onceHits = await kindHitsSince(kind, "1970-01-01T00:00:00Z", supabaseUrl, supabaseKey);
      const onceCap = await appConfigInt("once_cap", 3, supabaseUrl, supabaseKey);
      if (onceHits !== null && onceHits >= onceCap) {
        await logFunnel("once_limit_hit", { anon_session_id: anonSessionId, dedup_key: `once:${nonce}` }, supabaseUrl, supabaseKey);
        return { block: { status: "once_limit_reached", tier: "once", dailyCap: onceCap } };
      }
      await recordIpHit(ip, kind, supabaseUrl, supabaseKey);
      return { ok: true, onceBypass: true, anonSessionId };
    }
  }
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const auth = await validateBearer(authHeader);
    if (!auth) return { block: { status: "auth_required" } };
    const r = await supabaseRpc("reserve_search", {
      p_user_id: auth.userId, p_make: vehicle.make || null, p_model: vehicle.model || null, p_year: vehicle.year || null
    }, supabaseUrl, supabaseKey);
    const row = Array.isArray(r) ? r[0] : r;
    if (!row) {
      // RPC/infra failure (NOT a real limit): fail OPEN so an outage never blocks
      // a legitimate search. Runs unmetered (no reservation) and logs loudly.
      console.error("reserve_search returned no row for", auth.userId, "- allowing search unmetered (RPC/infra issue)");
      return { ok: true, reservationEventId: null, accountId: auth.userId, anonSessionId };
    }
    if (!row.allowed) {
      // Guest tier: the daily cap equals the lifetime cap (30), so ANY reserve refusal for
      // a guest means the 30 are spent - show the honest guest wall, never the daily-reset
      // copy. (Across days the lifetime check below is what fires; same-day-30 lands here.)
      if (row.tier === "guest30") {
        await logFunnel("guest_limit_hit", { user_id: auth.userId, dedup_key: `guest:${auth.userId}` }, supabaseUrl, supabaseKey);
        return { block: { status: "guest_limit_reached", tier: "guest30", totalCap: 30 } };
      }
      // Spec A: the daily wall is a distinct block from the monthly one, with its
      // own funnel event, and carries the tier's daily cap as `dailyCap` so the
      // frontend picks the singular (n=1) vs plural (n>1) wall copy.
      if (row.reason === "daily_limit") {
        await logFunnel("daily_limit_hit", { user_id: auth.userId, dedup_key: `daily:${auth.userId}:${coarseDayKey()}` }, supabaseUrl, supabaseKey);
        return { block: { status: "daily_limit_reached", tier: row.tier || "free", dailyCap: Number(row.daily_limit) || 1 } };
      }
      await logFunnel("limit_hit", { user_id: auth.userId, dedup_key: `limit:${auth.userId}:${coarseMonthKey()}` }, supabaseUrl, supabaseKey);
      return { block: { status: "limit_reached", tier: row.tier || "free" } };
    }
    // GUEST tier (guest30): a FIXED LIFETIME allowance of 30 total searches (not daily),
    // enforced here against the account's ALL-TIME search_events - its own per-user counter,
    // fully separate from crew/tester/free/TDV. reserve_search already reserved + attributed
    // this row (so the search is dashboard-visible); if it pushed the lifetime total past 30,
    // refund the reservation and wall honestly. guest30's rate_limits daily cap is set high
    // enough that the daily wall never binds before this lifetime cap.
    if (row.tier === "guest30") {
      const GUEST_TOTAL = 30;
      const used = await countAllTimeSearchEvents(auth.userId, supabaseUrl, supabaseKey);
      if (used !== null && used > GUEST_TOTAL) {
        if (row.event_id) { try { await supabaseRpc("release_search", { p_event_id: row.event_id }, supabaseUrl, supabaseKey); } catch (e) {} }
        await logFunnel("guest_limit_hit", { user_id: auth.userId, dedup_key: `guest:${auth.userId}` }, supabaseUrl, supabaseKey);
        return { block: { status: "guest_limit_reached", tier: "guest30", totalCap: GUEST_TOTAL } };
      }
      // Report the LIFETIME remaining (not daily) so the client's upfront gate walls at 0.
      const guestDaily = { dailyLimit: GUEST_TOTAL, dailyUsed: used ?? 0, dailyRemaining: Math.max(0, GUEST_TOTAL - (used ?? 0)) };
      return { ok: true, reservationEventId: row.event_id, accountId: auth.userId, anonSessionId,
        quota: { used: used ?? 0, limit: GUEST_TOTAL, tier: "guest30" }, daily: guestDaily };
    }
    // Authoritative post-reserve DAILY count (same transaction as the insert, so it
    // can never disagree with the wall). The frontend applies this to its cached
    // account so the upfront gate on the NEXT search knows the true remaining without
    // a separate /api/account refetch (which could fail on mobile). null daily_limit
    // = uncapped tier (crew/unlimited) -> no client cap.
    const daily = (row.daily_limit != null)
      ? { dailyLimit: Number(row.daily_limit), dailyUsed: Number(row.daily_used), dailyRemaining: Math.max(0, Number(row.daily_limit) - Number(row.daily_used)) }
      : null;
    return { ok: true, reservationEventId: row.event_id, accountId: auth.userId, anonSessionId,
      quota: { used: row.used, limit: row.limit, tier: row.tier }, daily };
  }
  // Spec C (a): anonymous searches per IP per day. Protects the anonymous
  // endpoint from cookie-clearing abuse (a signed-in user is on the auth path
  // above and never reaches this). Fail open on an unreadable ledger.
  const dayStartIso = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  const anonDayHits = await ipHitsSince(ip, "anon_search", dayStartIso, supabaseUrl, supabaseKey);
  const anonDayCap = await appConfigInt("ip_cap_anon_day", 20, supabaseUrl, supabaseKey);
  if (anonDayHits !== null && anonDayHits >= anonDayCap) {
    return { block: { status: "ip_rate_limited" } };
  }
  await recordIpHit(ip, "anon_search", supabaseUrl, supabaseKey);
  // Anonymous free-first-search.
  if (cookies.gas_free_used) {
    await logFunnel("second_search_attempt", { anon_session_id: anonSessionId }, supabaseUrl, supabaseKey);
    return { block: { status: "account_required" } };
  }
  // FLAG 1: anonymous may not spend the auth-reserved top of the daily OCD
  // budget. But a cache-hit search costs nothing, so only floor anonymous when a
  // FRESH metered fetch would actually be needed (cache miss). This keeps the
  // free-first path open on a busy day for the many cars already in the store.
  const cacheHit = await readMarketFetchCache(vehicle, supabaseUrl, supabaseKey);
  if (!cacheHit) {
    const reserved = await appConfigInt("ocd_auth_reserved_requests", 8, supabaseUrl, supabaseKey);
    const usedToday = await ocdRequestsToday(supabaseUrl, supabaseKey);
    if (usedToday !== null && usedToday >= (OCD_DAILY_REQUEST_BUDGET - reserved)) {
      return { block: { status: "capacity" } };
    }
  }
  return { ok: true, anonFirstFree: true, anonSessionId };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Spec D: server-side curtain seal. Pre-launch, non-crew requests to the
  // decision API are refused HERE, not merely hidden by CSS. Crew devices and
  // internal jobs (warm / bypassCache) pass. Env-gated (CURTAIN_SEALED=1),
  // default off so a deploy never locks out crew testing before Sam enables it;
  // removed on launch day with the rest of the curtain.
  if (process.env.CURTAIN_SEALED === "1") {
    const sealCookies = parseCookies(req.headers.cookie);
    const internalSeal = req.body?.warm === true || req.body?.bypassCache === true;
    const testerSeal = sealCookies.gas_tester === "ok" && !testerCodeExpired(); // expired testers are re-sealed
    if (sealCookies.gas_crew !== "ok" && !testerSeal && !internalSeal) {
      return res.status(403).json({ status: "sealed", error: "Not open yet." });
    }
  }

  const apiKey = process.env.OLDCARSDATA_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey) return res.status(500).json({ error: "OldCarsData API key not configured" });

  const car = typeof req.body?.car === "object" ? req.body.car : {};
  const sellerCriteria = getSellerCriteria(car);
  const rawSearch = req.body?.car?.raw || req.body?.car?.vehicle?.raw || req.body?.car || req.body?.search || req.body?.query;
  if (!rawSearch && !car.vehicle) return res.status(400).json({ error: "Missing car/search field" });

  // 2C: an authenticated reservation to refund if the search fails server-side.
  let reservationEventId = null;
  // Authoritative post-reserve daily count (from reserve_search), returned to the
  // client so its upfront gate stays accurate without a separate /api/account call.
  let searchDaily = null;

  try {
    // The frontend validates with vehicleIdentity and passes the resolved
    // vehicle object through; parsing happens once. Raw text is only re-resolved
    // (same shared resolver) when a caller skips that step.
    let vehicle = sanitizeResolvedVehicle(car.vehicle);
    if (!vehicle) {
      const resolution = await resolveVehicle(rawSearch);
      if (resolution.status !== "valid") {
        // The caller already accepted a model-level read (the seller declined
        // the year in the wizard). Proceed with the partial make/model through
        // the evidence ladder at model level instead of clarifying: we never
        // re-ask the year after the summary was confirmed.
        const partial = car.acceptModelLevel ? sanitizeResolvedVehicle(resolution.vehicle) : null;
        if (partial) {
          vehicle = partial;
        } else if (req.body?.oneBox && resolution.vehicle?.make && resolution.vehicle?.model) {
          // One Box: make + model resolved, only the year is missing/ambiguous ("Miata",
          // "911", "Chevrolet Corvette") -> proceed YEAR-AGNOSTIC (comps across the model's
          // years) rather than asking a model we already know or rejecting.
          vehicle = sanitizeResolvedVehicle(resolution.vehicle) || resolution.vehicle;
        } else if (req.body?.oneBox && resolution.vehicle?.make) {
          // One Box: make resolved but NO model ("1989 Porsche") -> ASK which model with
          // real chips (mirrors the body-style follow-up), never a flat rejection. Falls
          // through to the normal re-ask only if the make has no usable archive models.
          const mc = await runOneBoxModelChoice(resolution.vehicle, { supabaseUrl, supabaseKey });
          if (mc) return res.status(200).json({ status: "one_box", ...mc });
          return res.status(200).json({
            status: "needs_clarification", vehicle: resolution.vehicle,
            clarification: resolution.clarification || { question: "What year, make and model are you selling?" }
          });
        } else {
          return res.status(200).json({
            status: "needs_clarification",
            vehicle: resolution.vehicle,
            clarification: resolution.clarification || {
              question: "What year, make and model are you selling?"
            }
          });
        }
      } else {
        vehicle = resolution.vehicle;
      }
    }

    // Curated package-name pool alias (Aug 2026): a named package (Weissach,
    // Touring) keeps its true trim for display + rarity, but pools against the
    // parent badge's comps (GT3 RS, GT3 Touring) because the archive titles those
    // exact cars there. Internal plumbing only: fetch keyword + classify trim-match
    // read vehicle.fetchTrim; every label and card still shows vehicle.trim.
    const poolAlias = poolTrimFor(vehicle);
    if (poolAlias) vehicle.fetchTrim = poolAlias;

    // Generation mapping (Phase 4): null is safe and means the ladder keeps
    // its calendar +/- 2 rungs, exactly as unmapped models behave today.
    const generation = await findGeneration(vehicle, { supabaseUrl, supabaseKey });

    // One Box (archive-only, read-only): a single honest result tier from our own
    // records for "what have cars like yours sold for". Returns BEFORE the search
    // gate, so it burns no allowance, makes zero OldCarsData calls, and writes
    // nothing. Tester/crew devices reach it (the curtain seal above lets them in).
    if (req.body?.oneBox) {
      const oneBoxText = typeof rawSearch === "string" ? rawSearch : (vehicle?.raw || vehicle?.canonicalLabel || "");
      const oneBox = await runOneBox(vehicle, generation, oneBoxText, { supabaseUrl, supabaseKey });
      return res.status(200).json({ status: "one_box", ...oneBox });
    }

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

    // Reserve-window simulation (debug/audit only, no OCD calls): compares the
    // reserve-cell render surface at a 1-month vs rolling-3-month window over
    // sales_archive, keeping the 10/10 per-side gate unchanged. Answers the gate
    // audit's "what does render-rate become with a 3-month window" numerically.
    if (req.body?.reserveSim) {
      const monthKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const now = new Date();
      const lastComplete = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); // previous calendar month
      const months6 = [0, 1, 2, 3, 4, 5].map(i => monthKey(new Date(Date.UTC(lastComplete.getUTCFullYear(), lastComplete.getUTCMonth() - i, 1))));
      const months = months6.slice(0, 3);
      const loadMonth = async m => {
        const out = []; let offset = 0;
        for (let page = 0; page < 20; page++) {
          const batch = await supabaseSelect({ supabaseUrl, supabaseKey }, `sales_archive?month=eq.${m}&select=platform,make,sale_price,has_reserve&limit=1000&offset=${offset}`);
          if (!batch || !batch.length) break;
          out.push(...batch); offset += batch.length; if (batch.length < 1000) break;
        }
        return out;
      };
      const rowsByMonth = {}; for (const m of months6) rowsByMonth[m] = await loadMonth(m);
      const oneRows = rowsByMonth[months[0]] || [];
      const threeRows = months.flatMap(m => rowsByMonth[m] || []);
      const sixRows = months6.flatMap(m => rowsByMonth[m] || []);
      const summarize = cells => ({
        cellCount: cells.length,
        cells: cells.map(c => ({ platform: c.platform, make: c.make, band: c.band_key, n_with: c.n_with, n_without: c.n_without, delta_pct: c.delta_pct }))
          .sort((a, b) => (b.n_with + b.n_without) - (a.n_with + a.n_without))
      });
      const stableSort = cells => cells.slice().sort((a, b) =>
        a.platform.localeCompare(b.platform) || a.make.localeCompare(b.make) || a.band_low - b.band_low);
      const threeLabel = `${months[2]}..${months[0]}`;
      const sixLabel = `${months6[5]}..${months6[0]}`;
      const oneCells = computeReserveCells(oneRows, months[0], "one month");
      const threeCells = computeReserveCells(threeRows, threeLabel, "three months");
      const sixCells = computeReserveCells(sixRows, sixLabel, "six months");
      return res.status(200).json({
        status: "reserve_sim",
        perSideGate: RESERVE_MIN_PER_SIDE,
        window1Month: { month: months[0], rows: oneRows.length, ...summarize(oneCells) },
        window3Month: { months: months.slice().reverse(), rows: threeRows.length, ...summarize(threeCells) },
        window6Month: { months: months6.slice().reverse(), rows: sixRows.length, ...summarize(sixCells) },
        // Full cells for a stable RESERVE_CONTEXT / RESERVE_CONTEXT_6MO write.
        window3MonthFullCells: req.body.full ? stableSort(threeCells) : undefined,
        window6MonthFullCells: req.body.full ? stableSort(sixCells) : undefined
      });
    }

    // 2C: account gate + monthly limits. Internal callers (warm, bypassCache;
    // ladderPreview already returned) run unenforced and never write gate state.
    // `rerun` is a same-session post-result edit (location/price/preference changed
    // through the summary-strip Edit). The search was already reserved this session,
    // so it must NOT consume a new credit - skip the gate like the internal callers.
    const internalCall = req.body?.warm === true || req.body?.bypassCache === true || req.body?.rerun === true;
    let searchAccountId = null, anonFirstFree = false, anonSessionId = null, searchQuota = null, crewBypass = false, testerBypass = false, onceBypass = false;
    if (!internalCall) {
      const gate = await computeSearchGate(req, vehicle, supabaseUrl, supabaseKey);
      if (gate.block) return res.status(200).json(gate.block);
      reservationEventId = gate.reservationEventId || null;
      searchAccountId = gate.accountId || null;
      anonFirstFree = !!gate.anonFirstFree;
      anonSessionId = gate.anonSessionId || null;
      searchQuota = gate.quota || null;
      searchDaily = gate.daily || null;
      crewBypass = !!gate.crewBypass;
      testerBypass = !!gate.testerBypass;
      onceBypass = !!gate.onceBypass;
    }
    // F: coarse tier for the dashboard (forward-only). internal jobs -> "internal".
    const searchTier = internalCall ? "internal" : crewBypass ? "crew" : testerBypass ? "tester" : onceBypass ? "once" : (searchQuota?.tier || (searchAccountId ? "free" : "anon"));

    let fetchResult = null;
    let cacheStatus = "miss";
    // bypassCache forces a fresh fetch (used by cold-fetch measurement harnesses).
    // The budget guards below still gate any metered spend.
    const bypassCache = req.body?.bypassCache === true;
    if (!bypassCache && await readMarketFetchCache(vehicle, supabaseUrl, supabaseKey)) {
      fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
      cacheStatus = fetchResult ? "hit" : "hit_store_empty_refetched";
    }
    // Budget guards (7A): daily pace + monthly cap, read from app_usage_events.
    let usedMonthBefore = null;
    if (!fetchResult) {
      const usedToday = await ocdRequestsToday(supabaseUrl, supabaseKey);
      const usedMonth = await ocdRequestsThisMonth(supabaseUrl, supabaseKey);
      usedMonthBefore = usedMonth;
      // 7A.1: a null count means the meter is BLIND (app_usage_events unreadable).
      // Never pass the guard silently: raise a loud critical condition and record
      // it best-effort, then CONTINUE (never hard-fail on an unreadable table).
      if (usedToday === null || usedMonth === null) {
        console.error("CRITICAL: OCD budget meter is BLIND (app_usage_events unreadable). Spending with no guard - run docs/supabase-v1-schema.sql.");
        await recordUsageEvent({
          event_type: "ocd_budget_meter_blind", route: "/api/sellerDecision", status: "critical",
          search_text: rawSearch, oldcarsdata_metered_requests: 0, duration_ms: 0,
          metadata: { ...requestMetadata(req), usedToday, usedMonth }
        }, supabaseUrl, supabaseKey);
      }
      // 7E: the nightly warm runs against a RESERVED fraction of the budget so a
      // real seller SEARCH always outranks it. A warm request degrades once the
      // day/month reaches WARM_BUDGET_FRACTION of the cap, leaving headroom for
      // searches; an organic search uses the full cap.
      const isWarm = req.body?.warm === true;
      const dailyCap = isWarm ? Math.floor(OCD_DAILY_REQUEST_BUDGET * WARM_BUDGET_FRACTION) : OCD_DAILY_REQUEST_BUDGET;
      const monthlyCap = isWarm ? Math.floor(OCD_MONTHLY_BUDGET * WARM_BUDGET_FRACTION) : OCD_MONTHLY_BUDGET;
      const overDaily = usedToday !== null && usedToday >= dailyCap;
      const overMonthly = usedMonth !== null && usedMonth >= monthlyCap;
      // OCD's OWN remaining-quota header, persisted by the previous fetch, is the
      // authoritative backstop: soft-degrade BEFORE a 429 once OCD reports it is at
      // (or within a small reserve floor of) zero. Only trust it while fresh so a
      // stale zero from before a quota reset cannot pin us degraded forever - once
      // the TTL lapses a real fetch fires, refreshes the header, and self-corrects.
      const ocdRL = await readOcdRateLimit(supabaseUrl, supabaseKey);
      const rlFloor = await appConfigInt("ocd_rate_limit_floor", 5, supabaseUrl, supabaseKey);
      const rlTtlMs = (await appConfigInt("ocd_rate_limit_ttl_min", 120, supabaseUrl, supabaseKey)) * 60 * 1000;
      const rlFresh = ocdRL && ocdRL.at && (Date.now() - ocdRL.at) < rlTtlMs;
      // OCD's reset is a real Unix timestamp: once it has passed the quota has
      // refreshed, so a persisted zero is stale regardless of TTL - allow the fetch
      // immediately rather than waiting out the TTL.
      const resetMs = rlFresh ? parseOcdResetMs(ocdRL.reset, ocdRL.at) : null;
      const resetPassed = resetMs !== null && Date.now() >= resetMs;
      const ocdRemaining = (rlFresh && !resetPassed) ? ocdRL.remaining : null;
      const overOcdRemaining = ocdRemaining !== null && ocdRemaining <= rlFloor;
      // bypassCache is the measurement path (frontend never sets it): it still
      // spends and logs real metered calls, but skips the soft-degrade so a
      // cold-fetch measurement is not silently served from the store when the
      // day's organic budget is already spent. Organic traffic stays fully guarded.
      if (!bypassCache && (overDaily || overMonthly || overOcdRemaining)) {
        // Loud log, soft degrade: no metered spend past the reached cap.
        const scope = overOcdRemaining ? "ocd_remaining" : overMonthly ? "monthly" : "daily";
        console.error(`OCD budget guard [${scope}] (day ${usedToday}/${OCD_DAILY_REQUEST_BUDGET}, month ${usedMonth}/${OCD_MONTHLY_BUDGET}, ocd_remaining ${ocdRemaining}): soft degrading, no metered spend.`);
        await recordUsageEvent({
          event_type: "ocd_budget_guard", route: "/api/sellerDecision", status: `soft_degraded_${scope}`,
          search_text: rawSearch, oldcarsdata_metered_requests: 0, duration_ms: 0,
          metadata: { ...requestMetadata(req), usedToday, usedMonth, dailyBudget: OCD_DAILY_REQUEST_BUDGET, monthlyBudget: OCD_MONTHLY_BUDGET, scope, ocdRemaining, ocdRemainingAt: ocdRL ? ocdRL.at : null, ocdRemainingFloor: rlFloor }
        }, supabaseUrl, supabaseKey);
        fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
        if (fetchResult) {
          fetchResult.stopReason = `ocd_${scope}_budget_reached`;
          cacheStatus = "budget_degraded_store";
        } else {
          fetchResult = {
            records: [],
            passSummary: [],
            stoppedEarly: true,
            stopReason: `ocd_${scope}_budget_reached`,
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
      // 7A.2: monthly budget warnings at 50% and 80%, logged once by the search
      // whose metered spend crosses each band.
      const crossing = budgetWarningCrossing(usedMonthBefore, fetchResult.meteredRequests, OCD_MONTHLY_BUDGET);
      if (crossing) {
        console.warn(`OCD monthly budget ${crossing.pct}% reached: ${crossing.after}/${OCD_MONTHLY_BUDGET} metered requests this month.`);
        await recordUsageEvent({
          event_type: "ocd_budget_warning", route: "/api/sellerDecision", status: `monthly_${crossing.pct}pct`,
          search_text: rawSearch, oldcarsdata_metered_requests: 0, duration_ms: 0,
          metadata: { ...requestMetadata(req), usedMonth: crossing.after, monthlyBudget: OCD_MONTHLY_BUDGET, pct: crossing.pct }
        }, supabaseUrl, supabaseKey);
      }
    }
    // Starved-fetch store fallback: if the live fetch failed (OCD 429 / all rung
    // fetches errored) but we hold permanent records for this car, serve those
    // (real data) rather than failing. Records in vehicle_market_records are
    // immutable (rule 5); the 24h cache is only a freshness gate, so an OCD
    // outage should still surface the stored market rather than nothing.
    {
      const passes0 = fetchResult.passSummary || [];
      const starved = fetchResult.records.length === 0 && cacheStatus !== "hit"
        && (fetchResult.rateLimited || (passes0.length > 0 && passes0.every(p => p.error)));
      if (starved) {
        const store = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
        if (store && store.records && store.records.length) {
          const ocdRL = fetchResult.rateLimit, ocdRLd = fetchResult.rateLimited;
          fetchResult = store;
          fetchResult.rateLimit = ocdRL; fetchResult.rateLimited = ocdRLd;
          fetchResult.stopReason = "rate_limited_served_store";
          cacheStatus = "rate_limited_store";
        }
      }
    }
    // Persist OCD's authoritative remaining-quota header (present on 200s and 429s
    // alike) so the NEXT search's guard soft-degrades before a 429. Skips cache/store
    // paths where no live fetch happened and rateLimit is absent.
    if (fetchResult.rateLimit && fetchResult.rateLimit.remaining != null) {
      await persistOcdRateLimit(fetchResult.rateLimit, supabaseUrl, supabaseKey);
    }
    const records = fetchResult.records;

    // DATA UNAVAILABLE (Aug 2026): a STARVED fetch must never render as a thin
    // market. Only when we pulled nothing AND the store fallback was also empty
    // AND the reason was a fetch failure (OCD 429, all rung fetches errored, or
    // the local budget guard degraded) rather than a genuinely empty market do we
    // return a distinct signal so the frontend renders "I couldn't pull the full
    // picture right now" instead of "sales are limited" or a rarity-hook pick. A
    // genuinely obscure car returns 0 records with NO fetch errors -> real thin read.
    const passes = fetchResult.passSummary || [];
    const allFetchesFailed = passes.length > 0 && passes.every(p => p.error);
    const budgetDegraded = cacheStatus === "budget_degraded_store" || /budget_reached/.test(fetchResult.stopReason || "");
    const dataUnavailable = records.length === 0 && cacheStatus !== "hit" && cacheStatus !== "rate_limited_store"
      && (fetchResult.rateLimited || allFetchesFailed || budgetDegraded);
    if (dataUnavailable) {
      const reason = fetchResult.rateLimited ? "ocd_rate_limited" : budgetDegraded ? "budget_degraded" : "fetch_failed";
      await recordUsageEvent({
        event_type: "data_unavailable", route: "/api/sellerDecision", status: reason,
        search_text: rawSearch, vehicle, oldcarsdata_metered_requests: fetchResult.meteredRequests || 0, duration_ms: fetchResult.elapsedMs || 0,
        metadata: { ...requestMetadata(req), reason, ocdRateLimit: fetchResult.rateLimit || null, stopReason: fetchResult.stopReason,
          enteredState: sellerCriteria.state || null, enteredCountry: sellerCriteria.region || null, tier: searchTier, outcome: "data_unavailable" }
      }, supabaseUrl, supabaseKey);
      if (reservationEventId) { try { await supabaseRpc("release_search", { p_event_id: reservationEventId }, supabaseUrl, supabaseKey); } catch (e) {} }
      return res.status(200).json({ status: "data_unavailable", reason, vehicle });
    }

    // New-source detection (July 2026): any source slug we have not knowingly
    // admitted is logged loudly and NEVER silently trusted (the evidence
    // allowlist already keeps it out of the pick's math). The vendor-name
    // anomaly ("oldcarsdata") normalizes to "unknown" via recordPlatform, so it
    // surfaces here too instead of masquerading as a source.
    try {
      const seen = new Map();
      for (const record of records) {
        const raw = record.platform || record.source || record.auction_platform || record.listing_source || "";
        const slug = normSourceSlug(recordPlatform(record) === "unknown" ? raw : recordPlatform(record));
        if (slug && !KNOWN_SOURCE_SLUGS.has(slug)) seen.set(slug, (seen.get(slug) || 0) + 1);
      }
      for (const [slug, count] of seen) {
        await recordUsageEvent({
          event_type: "new_source_detected",
          route: "/api/sellerDecision",
          status: "new_source",
          search_text: rawSearch,
          vehicle,
          metadata: { ...requestMetadata(req), source_slug: slug, records: count, note: "unrecognized source slug; excluded from evidence until approved" }
        }, supabaseUrl, supabaseKey);
      }
    } catch { /* detection is best-effort; never block the decision */ }
    const classifications = records.map(record => classifyRecord(record, vehicle));
    // Cache hits replay rows already stored permanently; re-inserting them
    // would be a no-op POST of up to 2000 rows, so only the id lookup runs.
    const rawPersistence = fetchResult.fromCache
      ? { skipped: true, cached: true, idLookup: await lookupMarketRecordIds(records, supabaseUrl, supabaseKey) }
      : await persistRawRecords(records, supabaseUrl, supabaseKey);
    const classificationPersistence = await persistClassifications(records, classifications, rawPersistence.idLookup, supabaseUrl, supabaseKey);
    const analysis = analyze(records, classifications, fetchResult.ladder, vehicle, req.body?.debug === true);

    // Sell-through removed (1b): our search-path records are sold-only, so a
    // sold/listed rate cannot be computed. The old segmentSellThrough was the
    // tracked partner's coverage rate for a platform+price-band across all
    // makes, mislabeled as the car's segment rate. No sell-through renders.

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
        // OCD's authoritative rate-limit headers (meter reconciliation): the real
        // remaining/limit/reset OCD reports, so the guard can be compared against
        // OCD's own monthly count rather than only our tally.
        ocdRateLimit: fetchResult.rateLimit || null,
        ocdRateLimited: !!fetchResult.rateLimited,
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
        evidenceBasis: decision.evidenceBasis,
        // F (forward-only, no backfill): the dashboard view=searches / view=geo
        // fields. Entered location (never raw IP), tier, coarse outcome, the pick
        // platform, and whether a PowerSeller was shown / eligible-to-lead + who.
        enteredState: sellerCriteria.state || null,
        enteredCountry: sellerCriteria.region || null,
        tier: searchTier,
        outcome: (() => {
          const p = analysis.pricePremium;
          if (p) {
            if (p.type === "premium" && p.gateType === "symmetric" && Number.isFinite(p.percent) && Math.abs(p.percent) >= 10) return "mode_a";
            if (p.gateType === "symmetric" && Number.isFinite(p.percent) && Math.abs(p.percent) < 10) return "mode_b";
            if (p.type === "market_dominance") return "concentration";
          }
          return "thin";
        })(),
        pickPlatform: decision.recommendedPath || null,
        powerSeller: {
          shown: !!(decision.partnerReferral && (decision.partnerReferral.eligible || decision.partnerReferral.secondary)),
          eligible: !!(decision.partnerReferral && decision.partnerReferral.eligible),
          name: (decision.partnerReferral && decision.partnerReferral.partner && decision.partnerReferral.partner.name) || null
        }
      }
    }, supabaseUrl, supabaseKey);

    // Business-journey events (best-effort, never blocks). The client sends the
    // deterministic per-vehicle journeyId; anonId = the gas_anon it also sends as
    // anonSessionId; userId links the account (anon -> signed-in continuity). Deduped
    // per (journey, day) so a same-day re-run or refresh is not double counted.
    if (!internalCall && typeof req.body?.journeyId === "string" && req.body.journeyId) {
      const jEnv = { supabaseUrl, supabaseKey };
      const partner = decision.partnerReferral && decision.partnerReferral.partner;
      const psId = partner ? (partner.slug || partner.name || null) : null;
      const psShown = !!(decision.partnerReferral && (decision.partnerReferral.eligible || decision.partnerReferral.secondary));
      const jCommon = { journeyId: req.body.journeyId, anonId: anonSessionId, userId: searchAccountId, vehicle: journeyVehicle(vehicle, sellerCriteria) };
      const dk = coarseDayKey();
      const snapshot = {
        rec_status: "completed",
        rec_platform: decision.recommendedPath || null,
        rec_powerseller: psShown ? psId : null,
        rec_scope: analysis.ladder?.landed?.rung || null,
        rec_window: analysis.windowDays >= ALL_TIME_WINDOW_DAYS ? "all_time" : `${analysis.windowDays}d`,
        rec_estimated_value: (analysis.estimatedValue != null && Number.isFinite(analysis.estimatedValue)) ? String(analysis.estimatedValue) : null
      };
      try {
        await Promise.all([
          recordJourneyEvent(jEnv, { ...jCommon, eventType: "recommendation_completed", dedupKey: dk, snapshot, metadata: { tier: searchTier, evidenceSales: analysis.evidenceSales, evidenceBasis: decision.evidenceBasis } }),
          recordJourneyEvent(jEnv, { ...jCommon, eventType: "platform_recommended", platformId: decision.recommendedPath || null, dedupKey: dk }),
          psShown ? recordJourneyEvent(jEnv, { ...jCommon, eventType: "powerseller_recommended", powersellerId: psId, dedupKey: dk, metadata: { eligible: !!decision.partnerReferral.eligible, secondary: !!decision.partnerReferral.secondary } }) : Promise.resolve()
        ]);
      } catch { /* analytics never blocks the decision */ }
    }

    const responsePayload = {
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
        debugSignalTraces: analysis.debugSignalTraces,
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
    };

    // 2C finalize: persist the result (FLAG 2 - every signed-in result; the
    // anonymous free result with user_id null for claim), fire rec_shown
    // (deduped by the result id, 11e), and mark the free-search cookie.
    if (!internalCall) {
      if (searchQuota) responsePayload.quota = searchQuota;  // authenticated: monthly meter (used/limit/tier)
      if (searchDaily) responsePayload.daily = searchDaily;  // authenticated: authoritative post-reserve daily (drives the client's upfront gate)
      const savedId = await persistSavedResult(searchAccountId, responsePayload, supabaseUrl, supabaseKey);
      if (savedId) {
        responsePayload.resultId = savedId;
        await logFunnel("rec_shown", { user_id: searchAccountId, anon_session_id: anonSessionId, dedup_key: `rec:${savedId}` }, supabaseUrl, supabaseKey);
      }
      if (anonFirstFree) {
        responsePayload.firstFree = true;
        res.setHeader("Set-Cookie", "gas_free_used=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
      }
    }
    return res.status(200).json(responsePayload);
  } catch (err) {
    // 2C: a server-side failure consumes nothing - refund the reservation (11b).
    if (reservationEventId) { try { await supabaseRpc("release_search", { p_event_id: reservationEventId }, supabaseUrl, supabaseKey); } catch (e) {} }
    return res.status(500).json({ error: err.message });
  }
}
