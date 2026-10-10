import { oldCarsDataCost, recordUsageEvent, requestMetadata } from "./_usage.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { nonRoadReason } from "../lib/_roadType.js";
import { runOneBox, runOneBoxModelChoice, runOneBoxProof, assessThinForVehicle, assessClassEraForVehicle, priceBandForVehicle, listSalesForVehicle, rawTitleSearch, reserveInsightForVehicle, reserveDayInsightForVehicle, venueScopedSalesForVehicle, archiveResolveToken, houseReceiptsForVehicle, ENGINE_VERSION } from "../lib/onebox.js";
import { supabaseInsert, supabaseSelect, supabaseSelectAll } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { hasServerCredential } from "../lib/_credential.js";
import { checkCeiling, testLimits, CALM, checkMarketCheckCarLimit } from "../lib/_ceilings.js";
import { logEvent, EVENTS } from "../lib/events.js";
import { readVisitorId } from "../lib/_visitor.js";
import { callOldCarsData } from "../lib/_ocd.js";
import { testerCodeExpired } from "../lib/_tester.js";
import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";
import { findGeneration, generationModelToken, generationsForModel } from "../lib/generations.js";
import { sourceCoverage } from "../lib/desk/coverage.js";
import { isMaterialVariant } from "../lib/materialVariants.js";
import { buildHouseComparison } from "../lib/houseCalendar.js";
import { isHouseSource } from "../lib/_houseComps.js";
import { vinFeatureActive, findVinArchiveMatch } from "../lib/_flags.js";
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
import { hammerUsd, ensureFxReady } from "../lib/_houseComps.js";
import { buildSharedAnalysis, isRoutableVenue, depthWins, ROUTABLE_VENUES } from "../lib/platformPick.js";
import { specKeyFor, coreOf, persistCore } from "../lib/live/search.js";

import { isCrewRequest } from "../lib/_crew.js";
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
// ROUTE_POLICIES carries each venue's attributes; WHICH venues a seller can be sent to is the shared list
// (lib/platformPick.js ROUTABLE_VENUES). The two must name the same venues.
{ const k = Object.keys(ROUTE_POLICIES).sort().join(","), v = [...ROUTABLE_VENUES].sort().join(",");
  if (k !== v) console.error(`CRITICAL: ROUTE_POLICIES (${k}) and the shared routable venues (${v}) differ.`); }

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
  "acc", "allcollectorcars", "rmsothebys", "gooding", "goodingco",
  // Live-auction houses: now evidence (premium backed out), non-routable, named.
  "bonhams", "barrettjackson", "broadarrow", "mecum"
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
  // House-naming-as-evidence (Sep 2026): live-auction houses COUNT as comparable-sale
  // evidence (their premium is backed out to hammer in classifyRecord), so their sales
  // inform the read and they can be NAMED. They remain non-routable (not in
  // US_ROUTE_ALLOWLIST -> routable:false), so a house is never the pick/a submission door.
  if (isHouseSource(record)) return true;
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
  // 55000, 150 -> 150000), since nobody sells a collector car for $55. A bare
  // FRACTIONAL value reads as MILLIONS ("1.3" -> $1.3M): the old regex captured only
  // the integer part ("1"), dropped the decimal, and returned $1,000 - which then
  // silently failed the $100k+ high-value gate for a seven-figure car. Mirrored in
  // the frontend parseAskingPrice.
  const numberMatch = compact.match(/\$?\s*(\d{1,7}(?:\.\d+)?)\b/);
  if (numberMatch) {
    const n = Number(numberMatch[1]);
    if (!Number.isFinite(n)) return null;
    if (numberMatch[1].includes(".") && n < 100) return Math.round(n * 1e6);
    return n >= 1000 ? Math.round(n) : Math.round(n * 1000);
  }

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
      // Keep US-routable platforms AND the live-auction houses. Houses survive as
      // routable:false routes (not in ROUTE_POLICIES), so they can be NAMED as evidence /
      // surface as the stronger-non-routable callout, but never leave as a routable pick.
      if (!US_ROUTE_ALLOWLIST.has(normSourceSlug(key)) && !isHouseSource(normSourceSlug(key))) candidateKeys.delete(key);
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
      // Evidence-only sources (consignment auction houses) can never be the pick: the ONE shared
      // routable-venue test (lib/platformPick.js isRoutableVenue), the same one the shared pick uses.
      routable: isRoutableVenue(key),
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
// Returns the picked route and stamps WHY on it (route.pickReason: "thin_window_price" | "price" |
// "specialist" | "depth"), which decide() hands to the page as decision.routingReason so the page never
// re-derives the pick (js/result.js routesForCards reads recommendedPath and this reason).
function pickRecommendedRoute(routes) {
  const tag = (r, why) => { if (r) r.pickReason = why; return r; };
  const routable = (routes || []).filter(r => r.routable !== false && isRoutableVenue(r.policyKey));
  if (!routable.length) return (routes || []).find(r => r.routable) || (routes || [])[0] || null;
  // Thin-window price-signal override (set in analyzeRouteFit): a flagged strong-price
  // venue with materially deeper comps leads over a thin-window recency leader. Honored
  // first so recommendedPath (saved-list) and the reordered card stay in lockstep.
  const forced = routable.find(r => r.thinWindowPriceLead);
  if (forced) return tag(forced, "thin_window_price");
  const clearedPct = r => {
    const p = r && r.marketEvidence && r.marketEvidence.pricePremium;
    return (p && p.gateType === "symmetric" && Number.isFinite(p.percent) && p.percent >= 10) ? p.percent : -1;
  };
  // Depth leader: most sold comps at the landed scope (computed before Branch 1 so the
  // volume-aware premium gate can reference it).
  // The ONE depth tie-break (lib/platformPick.js depthWins): an exact tie goes to Bring a Trailer, never to
  // whichever route happened to sort first (2009 Nissan GT-R, a 4-4 tie, Oct 2026).
  let deep = null, deepN = -1;
  for (const r of routable) { const n = Number((r.marketEvidence && r.marketEvidence.evidenceSales) || 0); if (depthWins(n, r.policyKey, deepN, deep && deep.policyKey)) { deep = r; deepN = n; } }
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
    if (r === deep || sampleOK || marginOK) return tag(r, "price");
  }
  // "Measured" also counts a cleared ASYMMETRIC dominance share (>=75%, same gate pricePremiumFor's
  // own market_dominance branch applies) - not only a symmetric 5v5 comparison. Without this, a
  // platform with an overwhelming share but too few "others" sales to compare symmetrically (<5)
  // read as UNMEASURED, so a precomputed, cross-car specialist cell (lift>=3x on a platform's ENTIRE
  // tracked history, nothing to do with THIS car) could outrank an obvious depth leader. Surfaced by
  // the SELL_PICK_SHARED audit: "1967 Ford Mustang Fastback" - Bring a Trailer had 25 sales to
  // everyone else's 3 combined (89% share, asymmetric - too few others to clear 5v5), and a Hagerty
  // specialist cell (classic-Mustang lift, nothing to do with this exact car) won the pick on 1 sale.
  // Mirrors lib/platformPick.js's own anyMeasured/dominancePick gate (DOMINANCE_SHARE_PCT 75), ported
  // here so decide()'s real pick logic has the same fix the shared engine's mirror already carried -
  // this is a real pre-existing gap in decide() itself, not something introduced by feeding it a
  // different analysis; it was simply never triggered by the old capped fetch's own sampling.
  const measured = routable.some(r => { const p = r && r.marketEvidence && r.marketEvidence.pricePremium; return p && p.platformSales >= 5 && p.othersSales >= 5; })
    || routable.some(r => { const p = r && r.marketEvidence && r.marketEvidence.pricePremium; return p && p.gateType === "asymmetric" && Number.isFinite(p.marketShare) && p.marketShare >= 75; });
  if (!measured) {
    const specCell = r => { const c = r && r.marketEvidence && r.marketEvidence.specializationCell; return (c && Number(c.lift_rounded) >= 3 && Number(c.platform_count) >= 5) ? c : null; };
    const specialist = routable.find(r => r !== deep && specCell(r));
    if (specialist) return tag(specialist, "specialist");
  }
  if (deep && deepN > 0) return tag(deep, "depth");
  return routable[0] || (routes || [])[0] || null;
}

// THE ONE PICK over decide()'s routes (Oct 2026): the Sell-only thin-window override first (it is a separate
// rule, set by analyzeRouteFit), then the shared ladder's own pick (lib/platformPick.js onlinePicks, carried in
// analysis.sharedPick) mapped onto its route. No premium, dominance, specialist or depth logic of its own.
// With no shared pick (no routable sale in the pool) the route order stands (the policy floor, rule 8).
export function sharedPickRoute(routes, sharedPick) {
  const tag = (r, why) => { if (r) r.pickReason = why; return r; };
  const routable = (routes || []).filter(r => r.routable !== false && isRoutableVenue(r.policyKey));
  if (!routable.length) return (routes || []).find(r => r.routable) || (routes || [])[0] || null;
  const forced = routable.find(r => r.thinWindowPriceLead);
  if (forced) return tag(forced, "thin_window_price");
  const b = sharedPick && sharedPick.baseline;
  const k = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (b && b.platform) {
    const r = routable.find(x => k(x.policyKey) === k(b.platform));
    if (r) return tag(r, b.reasonCode === "premium" ? "price" : b.reasonCode);
  }
  return routable[0] || (routes || [])[0] || null;
}
// The rush pick's route (decision.speedPick): the shared ladder with Bring a Trailer left out (onlinePicks
// speed), or null when there is none. The page shows it beside the price pick for a seller in a rush.
export function sharedSpeedRoute(routes, sharedPick) {
  const sp = sharedPick && sharedPick.speed; if (!sp || !sp.platform) return null;
  const k = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return (routes || []).find(r => r.routable !== false && isRoutableVenue(r.policyKey) && k(r.policyKey) === k(sp.platform)) || null;
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

export function buildLadder(vehicle, generation = null) {
  const year = Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : null;
  const trim = asText(vehicle.trim) || null;
  const baseModel = asText(vehicle.model);
  // Market-spec + wheelbase are part of the market identity, not a trim: name them
  // in the ladder labels so every model/generation-scoped surface (card headline,
  // "why", evidenceLabel) says which market the comps describe ("1997 Defender 90
  // NAS sales"), never a generic "1997 Defender sales" that hides the NAS/wheelbase
  // scoping the pool is actually applying. The make-context rung stays make-wide
  // (no suffix), correctly, since it widens past the model. No-op when unset.
  const specSuffix = [asText(vehicle.wheelbase) || null, asText(vehicle.marketSpecShort) || null].filter(Boolean).join(" ");
  const model = specSuffix ? `${baseModel} ${specSuffix}` : baseModel;
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

  // Material-variant guard (Sep 2026, CLK DTM / Blower audit): a rare, materially-pricier
  // variant of a shared nameplate (250 GTO, Corvette ZR1, 911 R, Boss 429, ...) must never
  // widen into the base-model pool - that mixes a $50M car with $1M cars. Drop the
  // trim-dropping model rungs so a thin variant lands thin on its own trim rung or falls to
  // make context, never the base model. Variants folded into the model (CLK DTM, Blower) do
  // not reach this (no trim to drop). No-op for ordinary trims.
  let effective = rungs;
  if (trim && isMaterialVariant(vehicle)) {
    effective = rungs.filter(rung => rung.needTrim || rung.makeOnly);
  }
  return effective.map((rung, index) => ({ ...rung, rung: index + 1 }));
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

export async function fetchRecentRecords(vehicle, apiKey, generation = null, maxMetered = Infinity) {
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
      if (meteredRequests >= maxMetered) break;   // per-request metered floor (blind-meter fail-closed)
      await runPass(fallbackPass);
      if (evaluate().landed?.met) break;
    }
  };

  let ladderEval = evaluate();
  for (const rung of ladder) {
    if (rateLimited) { stoppedEarly = true; stopReason = "rate_limited"; break; }  // don't fire doomed 429s at every rung
    if (meteredRequests >= maxMetered) { stoppedEarly = true; stopReason = "metered_floor_reached"; break; }
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
      if (meteredRequests >= maxMetered) break;   // per-request metered floor reached
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
// How many of the closest sales ride along to the follow-up chat (decision.closestSales). Three, not five:
// five raised the cost per follow-up by about 60% (measured Oct 9 2026), three keeps the answer grounded.
const FOLLOWUP_SALES = 3;
// 7A.2: monthly plan cap, env-driven so the 1K->10K upgrade is a config change.
const OCD_MONTHLY_BUDGET = Number(process.env.OCD_MONTHLY_BUDGET || 1000);
// Ingest-priority reserve (until the monthly quota reset): when OCD's monthly remaining falls below
// this, the reader /sell (seller_decision) path spends NO metered requests and answers from the
// archive/store path (the same fallback Step 2 added), leaving the remaining quota for the nightly
// ingest. Ingest and other nightly jobs are NOT subject to this; they keep the lib/_ocd.js monthly
// floor of 100 (OCD_MONTHLY_RESERVE). Env-overridable so the reserve can shrink as the reset nears.
const OCD_SELL_MONTHLY_RESERVE = Number(process.env.OCD_SELL_MONTHLY_RESERVE || 450);
// 7E: the nightly warm may spend only up to this fraction of the budget, so a
// real seller search always has headroom left and outranks the warm.
const WARM_BUDGET_FRACTION = Number(process.env.OCD_WARM_BUDGET_FRACTION || 0.7);

async function ocdMeteredSince(sinceIso, supabaseUrl, supabaseKey, limit = 2000) {
  if (!supabaseUrl || !supabaseKey) return null;
  // Only RECURRING READER-FACING spend counts toward the pace/fallback: event_type=seller_decision
  // (real searches + warm). One-time BULK operations - ingest_health_below_floor, archive_backfill,
  // probes - also write oldcarsdata_metered_requests here (for cost reporting), but must NEVER
  // inflate a recurring-spend guard: unfiltered they pushed the calendar-month sum to ~4.6x OCD's
  // real usage (7929 vs OCD's 1710), phantom-throttling warm and threatening reader searches. The
  // monthly HARD cap is additionally reconciled against OCD's own rate-limit header in the guard.
  const rows = await supabaseSelect(
    { supabaseUrl, supabaseKey },
    `app_usage_events?created_at=gte.${sinceIso}&event_type=eq.seller_decision&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=${limit}`
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
  // ENGINE_VERSION prefix (Step 0): an engine change bumps the version, so every pre-change cache row
  // is keyed differently and can never be served. Old rows simply age out of the 24h window.
  return `${ENGINE_VERSION}|${asText(vehicle.make).toLowerCase()}|${family.toLowerCase()}`;
}

export async function readMarketFetchCache(vehicle, supabaseUrl, supabaseKey) {
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
export async function fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation = null) {
  const startedAt = Date.now();
  const ladder = buildLadder(vehicle, generation);
  const maxWindow = Math.max(...ANALYSIS_WINDOWS_DAYS, ...SELLER_ACTIVITY_WINDOWS_DAYS);
  const cutoff = new Date(Date.now() - maxWindow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const env = { supabaseUrl, supabaseKey };
  const mkq = encodeURIComponent(vehicle.make);
  const modelHead = vehicle.model ? String(vehicle.model).split(/\s+/)[0] : "";
  // The model-specific read must match records by the SAME breadth the live fetch
  // and classifier use, or a cache hit silently misses records a fresh fetch pulled.
  // OldCarsData files some generations under their CHASSIS CODE as the model (a 2008
  // 911 stored as model "997", not "911"), so a plain `model ilike *911*` drops them
  // and the cache-hit pool lands a different rung than the fresh pool for the same car.
  // Widen to the model head PLUS every chassis-code generation token for this model.
  const modelTokens = new Set();
  if (modelHead) modelTokens.add(modelHead.toLowerCase());
  for (const g of generationsForModel(vehicle.make, vehicle.model)) {
    const tok = generationModelToken(g);
    if (tok) modelTokens.add(tok.toLowerCase());
  }
  const orClause = [...modelTokens].map(t => `model.ilike.*${t}*`).join(",");
  // PostgREST caps each read at 1000 rows. A make-wide read alone (BMW) is dominated by
  // recent common models, so a LOW-VOLUME model inside a HIGH-VOLUME make (an i8 among
  // thousands of 3-Series) has its older records crowded out of the top 1000 - the exact
  // reason the i8's Bring a Trailer records were missing from the pick. So pull the
  // MODEL's own records too (model-first at merge) so they can never be crowded out.
  //
  // But a HIGH-VOLUME model (the 911 family: 911/997/996/991/992...) overflows even the
  // model read's 1000-row cap: ordered by sale date, the top 1000 is all recent sales
  // across every 911 year, and the specific YEAR/GENERATION comps for the searched car
  // fall off the end. The fresh ladder fetch surfaces them because it queries OCD with
  // year_min/year_max; the store read did not, so a cache hit landed a different (wider)
  // rung than a fresh fetch for the same car. Fix: add YEAR-SCOPED reads (exact year and
  // the generation window) so the year-specific comps are always pulled regardless of how
  // much recent family volume sits in front of them. year is the model-year column.
  const yr = Number(vehicle.year);
  const yearReads = [];
  if (orClause && Number.isFinite(yr) && yr > 1900) {
    yearReads.push(supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&or=(${orClause})&year=eq.${yr}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`));
    if (generation && Number.isFinite(Number(generation.yearStart)) && Number.isFinite(Number(generation.yearEnd))) {
      yearReads.push(supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&or=(${orClause})&year=gte.${generation.yearStart}&year=lte.${generation.yearEnd}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`));
    } else {
      // No generation mapping: fall back to a +/-2 year band (matches the calendar rungs).
      yearReads.push(supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&or=(${orClause})&year=gte.${yr - 2}&year=lte.${yr + 2}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`));
    }
  }
  const [makeRows, modelRows, ...yearRowSets] = await Promise.all([
    supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`),
    orClause ? supabaseSelect(env, `vehicle_market_records?make=ilike.${mkq}&or=(${orClause})&auction_end_date=gte.${cutoff}&select=raw_record&order=auction_end_date.desc&limit=1000`) : Promise.resolve(null),
    ...yearReads
  ]);
  const records = [];
  const seenStore = new Set();
  // Year-scoped reads first so year-specific comps can never be crowded out at merge.
  for (const list of [...yearRowSets.map(s => s || []), modelRows || [], makeRows || []]) {
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

// Item 4 (one engine rule): "the analysis step" exported without the search metering and save, so
// evaluatePartnerReferral gets the SAME analysis on both pages. fetchRecordsFromStore is already a
// read-only, zero-OldCarsData read of vehicle_market_records (the store a cache hit already reads);
// this just runs it plus the already-exported, pure analyze() on top, skipping the metered live
// fetch entirely and skipping persistRawRecords/persistClassifications (the "save"). Returns null
// when the store has nothing for this car yet (never searched live before) - callers should fall
// back to the same honest not-yet-measured shape evaluatePartnerReferral already handles for a thin
// analysis (analysis.ladder.landed.thresholdMet === false).
export async function buildAnalysisFromStore(vehicle, generation, supabaseUrl, supabaseKey) {
  if (!vehicle || !vehicle.make || !supabaseUrl || !supabaseKey) return null;
  const stored = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation).catch(() => null);
  if (!stored || !stored.records || !stored.records.length) return null;
  const classifications = stored.records.map(r => classifyRecord(r, vehicle));
  return analyze(stored.records, classifications, stored.ladder, vehicle, false, null);
}

export function getSellerCriteria(car = {}) {
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

// Transmission earned-gate (defect 5, ported from One Box r4Transmission): the
// /sell result offers a manual-vs-automatic refinement ONLY when the evidence
// pool splits materially, 5+ genuine manual AND 5+ genuine automatic sales.
// Below either side there is nothing honest to narrow, so no question renders.
// Same regexes and Porsche PDK/Tiptronic labeling as One Box so both surfaces
// read a split identically. Reads the raw OCD `transmission` field (present on
// the same records One Box's archive stores as raw_record->>transmission).
const TX_MANUAL = t => /manual|\d[- ]?speed(?!\s*auto)|\bmt\b|\bstick\b/i.test(t) && !/automatic|pdk|dct|tiptronic|dsg/i.test(t);
const TX_AUTO = t => /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle/i.test(t);
function recordTransmission(record) {
  return String(record?.transmission || record?.raw_record?.transmission || "");
}
function computeTransmissionSplit(items, make) {
  const man = items.filter(i => TX_MANUAL(recordTransmission(i.record)));
  const aut = items.filter(i => TX_AUTO(recordTransmission(i.record)));
  if (man.length < 5 || aut.length < 5) return null;
  const auto = /porsche/i.test(make || "")
    ? (aut.filter(i => /pdk/i.test(recordTransmission(i.record))).length >= aut.length / 2 ? "PDK" : "Tiptronic")
    : "automatic";
  return { manual: "manual", auto, manualCount: man.length, autoCount: aut.length };
}

export function analyze(records, classifications, ladder, vehicle, debug, txFilter) {
  const pairedRecords = records.map((record, index) => ({ record, classification: classifications[index] }));
  const maxWindow = ANALYSIS_WINDOWS_DAYS[ANALYSIS_WINDOWS_DAYS.length - 1];
  const { walk, landed, thin } = evaluateLadder(pairedRecords, ladder, vehicle);
  const windowDays = landed?.windowDays ?? maxWindow;

  // Defect 5: the transmission earned-gate narrows WITHIN the rung the ladder
  // already landed on (computed just above, on the FULL pool). Filtering raw
  // records BEFORE the ladder would let it re-land on a different, narrower rung
  // (the split gate would promise 34 manual sales, then the refine collapses to a
  // 5-sale generation rung). So the rung stays fixed and every downstream tally,
  // median and pick is recomputed over just the chosen transmission. Records with
  // no readable transmission drop out of a narrowed read. txSplitBase keeps the
  // UNFILTERED evidence set so the split gate itself is computed on the real pool.
  const txPass = txFilter === "manual" ? (it => TX_MANUAL(recordTransmission(it.record)))
    : txFilter === "auto" ? (it => TX_AUTO(recordTransmission(it.record)))
    : null;
  const applyTx = arr => txPass ? arr.filter(txPass) : arr;

  const inWindow = applyTx(pairedRecords
    .filter(item => daysAgo(item.record.auction_end_date) <= windowDays)
    .filter(item => item.classification.comparison_tier !== "excluded"));
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
    ? applyTx(pairedRecords.filter(item =>
        daysAgo(item.record.auction_end_date) <= windowDays && ladderEligible(item, landed.definition)
      ))
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
    ? applyTx(pairedRecords.filter(item => {
        const age = daysAgo(item.record.auction_end_date);
        return age > windowDays && age <= windowDays * 2 && ladderEligible(item, landed.definition);
      }))
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

  // MATCHED premium (Sep 2026, fixes the mileage-mix confound): the straight cross-venue median
  // (pricePremiumFor) is inflated because a venue's cars carry fewer miles, not because it pays more.
  // This compares the pick venue vs the others WITHIN the same model year AND the same mileage band,
  // combining the per-band deltas sample-weighted so the mileage mix cancels. 24-month window (a
  // matched, mix-cancelled read needs a deeper base than the raw 90-day median). USD via hammerUsd
  // (or sale_price_usd once vehicle_market_records carries it), NEVER raw sale_price. Too thin to
  // match -> returns { tooThin, platformSales, recencyDate } so the reason states the venue's sales
  // count and recency instead of a percentage. Does NOT feed ranking (pricePremiumFor still does);
  // only the displayed pick reason uses it.
  const MATCHED_WINDOW_DAYS = 730;
  const MATCHED_BANDS = [[0, 30000], [30000, 60000], [60000, 100000], [100000, 150000], [150000, Infinity]];
  const MATCHED_BAND_MIN = 5;
  const recYearOf = rec => { const y = Number(rec && (rec.year ?? (rec.raw_record && rec.raw_record.year))); return Number.isFinite(y) ? y : null; };
  const recMilesOf = rec => { const m = Number(String((rec && (rec.mileage ?? (rec.raw_record && rec.raw_record.mileage))) ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(m) && m > 0 ? m : null; };
  // USD value of a record: the hammerUsd conversion (online = dated toUsd, house = premium back-out +
  // dated toUsd). Item 1: the stored sale_price_usd column holds the ALL-IN at static FX (no premium
  // back-out), so it is NOT the hammer this compute needs; always recompute from the native price at
  // the sale-month FX. NEVER the raw native sale_price.
  const recUsdOf = rec => {
    const p = normalizeMoney(rec);
    if (!(p > 0)) return null;
    const v = hammerUsd({ source: recordPlatform(rec), price: p, currency: rec.currency || (rec.raw_record && rec.raw_record.currency) || "USD", date: rec.auction_end_date || rec.sale_date || null });
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const matchedPremiumFor = platform => {
    if (!landed || landed.key === "make_context") return null;
    const scopeTags = premiumLandedScopeTags(landed);
    // Item 2: when the landed rung KEPT the trim, the range is trim-scoped, so the venue count and the
    // scope label must be trim-scoped too (never a year-only count beside a trim-scoped range). Carry
    // the trim and a trimScoped flag so the archive-count override and the frontend sentence agree.
    const landedTrim = (landed.definition && landed.definition.needTrim) ? (asText(vehicle.trim) || null) : null;
    const trimTags = { trimScoped: !!landedTrim, trim: landedTrim };
    const yr = Number(vehicle.year) || null;
    const eligible = pairedRecords.filter(item =>
      daysAgo(item.record.auction_end_date) <= MATCHED_WINDOW_DAYS &&
      ladderEligible(item, landed.definition) &&
      isEvidenceSource(item.record, vehicle) &&
      (yr ? recYearOf(item.record) === yr : true));
    const mineAll = eligible.filter(item => recordPlatform(item.record) === platform);
    const recency = mineAll.reduce((mx, item) => { const d = String(item.record.auction_end_date || "").slice(0, 10); return d > mx ? d : mx; }, "");
    let wSum = 0, wDelta = 0, usedMine = 0, usedOthers = 0, bandsUsed = 0;
    for (const [lo, hi] of MATCHED_BANDS) {
      const inBand = item => { const mi = recMilesOf(item.record); return mi != null && mi >= lo && mi < hi; };
      const mine = eligible.filter(item => recordPlatform(item.record) === platform && inBand(item)).map(item => recUsdOf(item.record)).filter(v => v != null);
      const others = eligible.filter(item => recordPlatform(item.record) !== platform && inBand(item)).map(item => recUsdOf(item.record)).filter(v => v != null);
      if (mine.length >= MATCHED_BAND_MIN && others.length >= MATCHED_BAND_MIN && median(others) > 0) {
        const d = (median(mine) - median(others)) / median(others);
        const w = mine.length + others.length;
        wSum += w; wDelta += d * w; usedMine += mine.length; usedOthers += others.length; bandsUsed++;
      }
    }
    if (wSum > 0) return { ok: true, matched: true, percent: Math.round((wDelta / wSum) * 100), platformSales: usedMine, othersSales: usedOthers, sales: usedMine + usedOthers, bandsUsed, yearMatched: !!yr, windowDays: MATCHED_WINDOW_DAYS, ...scopeTags, ...trimTags };
    return { tooThin: true, matched: true, platformSales: mineAll.length, recencyDate: recency || null, yearMatched: !!yr, windowDays: MATCHED_WINDOW_DAYS, ...scopeTags, ...trimTags };
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
        matchedPremium: matchedPremiumFor(platform),
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
    // Defect 5: does the evidence pool split materially by transmission? Computed
    // over the same allowlisted evidence set the pick is built on. When the pool
    // has already been narrowed by an active refine, one side falls below 5 and
    // this returns null, so the answered question is never re-asked.
    transmissionSplit: computeTransmissionSplit(evidenceSetAllowed, vehicle?.make),
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

export function decide(analysis, criteria, vehicle) {
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
    routingReason: bestRoute.pickReason || null,
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

// A partner who consigns cars into the auction houses (RM / Gooding / Broad Arrow etc.). Read
// defensively from a top-level column OR the specialties JSON, so it works whichever way it is
// seeded. NOTHING is seeded today: attribute must never be assumed true for any partner.
function partnerConsignsToHouses(partner) {
  if (!partner) return false;
  if (partner.consigns_to_houses === true) return true;
  const s = partner.specialties || {};
  return s.consigns_to_houses === true || s.consignsToHouses === true;
}
// The HOUSE STEER practical-step partner: an active, region-covered consignor. Marque match ranks
// first. Returns null when none is seeded (the house-steer result then stands WITHOUT a door).
async function findConsignsToHousesPartner(vehicle, criteria, supabaseUrl, supabaseKey) {
  const partners = await loadActivePartners(supabaseUrl, supabaseKey);
  const eligible = (partners || []).filter(p => partnerConsignsToHouses(p) && partnerRegionCovered(p, criteria));
  if (!eligible.length) return null;
  eligible.sort((a, b) => (partnerMarqueMatch(b, vehicle) ? 1 : 0) - (partnerMarqueMatch(a, vehicle) ? 1 : 0));
  const p = eligible[0];
  return { name: p.name, marqueMatch: partnerMarqueMatch(p, vehicle), source: "consigns_to_houses" };
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

// Exported (Oct 2026, Sam's direct instruction) as the ONE shared PowerSeller gate: the locked
// product rules 9-11 (gated lead, value/segment/region/active-match ALL required, no money claims)
// live here and must never be re-implemented anywhere else that evaluates a partner match - the new
// Sell (lib/sell/) imports this directly instead of writing its own gate. See docs/lane-notes.md for
// the import path handed to Lane C.
export async function evaluatePartnerReferral(analysis, criteria, vehicle, supabaseUrl, supabaseKey) {
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
  const tolFraction = 1 - Math.max(0, Math.min(90, minTolerancePct)) / 100;
  const askingForGate = parseSellerTargetPrice(criteria.targetPrice);
  // Per-partner value floor (product change, Sep 2026): each partner is gated on
  // THEIR OWN min_value_usd, with the same tolerance the global floor uses, falling
  // back to the global POWERSELLER_MIN_VALUE_USD only when the partner has no floor
  // set. The gate MECHANIC is unchanged: gateValue = max(estimatedValue, askingPrice),
  // compared against that partner's own tolerant floor. Applies to EVERY partner in
  // the roster evaluation (the matched-lead pool AND the secondary pool), so a
  // stricter partner is held to their higher number, a no-floor partner (Dan) uses
  // the global floor, and a lower-floor partner (Chris at 20000) can take a car a
  // $40k-floored partner would decline.
  const partnerBaseFloor = p => {
    const m = Number(p && p.min_value_usd);
    return Number.isFinite(m) && m > 0 ? m : POWERSELLER_MIN_VALUE_USD;
  };
  const partnerValueMet = p => powerSellerValueMet(estimatedValue, askingForGate, partnerBaseFloor(p), minTolerancePct);
  const gateValueUsd = Math.max(
    Number.isFinite(estimatedValue) ? estimatedValue : 0,
    Number.isFinite(askingForGate) ? askingForGate : 0
  );
  // Global gate kept only as the no-candidate reporting fallback for conditions.valueMet.
  const globalValueMet = powerSellerValueMet(estimatedValue, askingForGate, POWERSELLER_MIN_VALUE_USD, minTolerancePct);
  const psFloor = POWERSELLER_MIN_VALUE_USD * tolFraction;

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
      valueMet: partnerValueMet(partner),
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
  // Eligible-lead pool is value-gated PER PARTNER: the best-ranked partner who
  // segment+region matches AND clears their OWN tolerant floor. A higher-ranked
  // partner who fails their floor steps aside for a lower-ranked one who clears theirs.
  const matchedCand = cands.filter(c => c.segmentMet && c.regionMet && c.valueMet).sort(rankPartner)[0] || null;
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
  const eligible = !!matched;
  // Secondary mention (locked, updated July 2026): shows a region-covered active
  // partner as a secondary card even without a segment match; the make-specific
  // why-line falls back to his attributed specialty note, so nothing mismatched is
  // claimed. Leading keeps the full gate. Never the lead, single destination
  // unchanged, service framing only. The value gate here is PER PARTNER too: the
  // secondary partner must clear their OWN tolerant floor.
  const askingPrice = parseSellerTargetPrice(criteria.targetPrice);
  // Secondary is ranked over ALL region-covered partners local-first, NOT defaulted
  // to `matched`: a nationwide generalist that segment-matches broadly (e.g. a
  // "collections, pre-war" partner) must not preempt the seller's own local partner
  // on a secondary card. `matched` still drives the eligible LEAD above.
  const secondaryPartner = (cands.filter(c => c.regionMet && c.valueMet).sort(rankPartner)[0]?.partner) || null;
  const secondary = !eligible && !!secondaryPartner;

  // conditions.valueMet (read by the frontend for the "below the money floor"
  // message) reflects the partner that would otherwise be recommended: true when a
  // segment+region partner cleared their own floor, false when one matched on
  // segment+region but the car sat below their floor. No seg+region partner falls
  // back to the global gate (the frontend gates that message on segment/region too).
  const segRegionCands = cands.filter(c => c.segmentMet && c.regionMet);
  const reportedValueMet = segRegionCands.length ? segRegionCands.some(c => c.valueMet) : globalValueMet;

  const result = {
    eligible,
    secondary,
    secondaryMinUsd: psFloor,
    minValueUsd: POWERSELLER_MIN_VALUE_USD,
    gateValueUsd,
    estimatedValue,
    conditions: {
      valueMet: reportedValueMet,
      segmentMet: anySegment,
      regionMet: anyRegion,
      partnerAvailable: partners.length > 0,
      localitySuppressedLead
    },
    partner: null
  };
  if (eligible || secondary) {
    const source = eligible ? matched : secondaryPartner;
    // Report the floor ACTUALLY applied to the rendered partner (their own
    // min_value_usd, or the global fallback), the tolerant floor, and the gate
    // value it was compared against - so a trace shows the real per-partner numbers.
    const appliedBase = partnerBaseFloor(source);
    result.appliedMinValueUsd = appliedBase;
    result.appliedFloorUsd = Math.round(appliedBase * tolFraction);
    result.minValueUsd = appliedBase;
    result.secondaryMinUsd = result.appliedFloorUsd;
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
    // Item 4a: pass the seller's state + whether THIS partner covers the seller's Census region (via an
    // explicit region, not just Nationwide), so the card names the seller's own state ("serves Texas")
    // instead of listing other states, and never implies local coverage it does not have.
    result.sellerState = criteria.state || null;
    result.coversSellerRegion = !!(criteria.state && partnerRegionBuckets(source.regions || []).has(censusRegion(asText(criteria.state))));
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

// Returns { block } to short-circuit with that JSON, or { ok, reservationEventId,
// accountId, anonFirstFree, anonSessionId } to proceed. Internal callers skip this.
async function computeSearchGate(req, vehicle, supabaseUrl, supabaseKey) {
  // OPEN SEARCH (Oct 2026 policy, Lane C): no account is needed to search, there is no free-search counter
  // and no daily search quota, and signed out and signed in get the same answer. What is left here is the
  // ONE guard every Sell search path shares, lib/_ceilings.js checkCeiling (the invisible per-device and
  // per-address ceiling, also used by Buy and the new Sell), plus who ran it for attribution: crew, the
  // tester cohort (a label only now; its own 10-a-day counter would sit BELOW the open public path, so it
  // is gone), or a verified account. Removed: the one free search and its gas_free_used wall, the 20 per
  // address per day signed-out cap, the reserve_search daily quota, the guest30 lifetime 30, the gas_once
  // pass and the capacity block (signed out never meters, so there is no metered top to protect).
  const anonSessionId = typeof req.body?.anonSessionId === "string" ? req.body.anonSessionId.slice(0, 64) : null;
  const cookies = parseCookies(req.headers.cookie);
  if (isCrewRequest(req)) return { ok: true, crewBypass: true, anonSessionId };   // signed crew cookie (lib/_crew.js)
  // Our own jobs (header credential) are not counted, unless they send the test ceiling (x-ceiling-test).
  const cred = hasServerCredential(req), lim = testLimits(req, cred);
  if (!cred || lim) {
    const ceil = await checkCeiling({ supabaseUrl, supabaseKey }, req, "sell_search", { tool: "sell", limits: lim });
    if (!ceil.ok) return { block: { status: "ip_rate_limited", message: CALM.search } };
  }
  // A session that does not verify (expired, signed out elsewhere) simply searches as signed out: an open
  // search never asks anyone to sign in.
  let accountId = null;
  if (req.headers.authorization) {
    try { const a = await validateBearer(req.headers.authorization); if (a) accountId = a.userId; } catch (e) {}
  }
  const tester = cookies.gas_tester === "ok" && !testerCodeExpired() && !accountId;
  return { ok: true, testerBypass: tester, accountId, anonSessionId, anonResult: !accountId };
}

// SPEND PROTECTION (Oct 2026, open-search policy): request flags that skip the search gate, force a fresh
// metered fetch or run a diagnostic are honoured ONLY with our own credential in a header (lib/_credential.js:
// x-probe-key / x-ops-key, or the cron secret). Without it they are removed before anything reads them, so a
// public request runs as an ordinary search. archiveOnly, ladderPreview, priceProbe and oneBox stay public:
// each only ever reduces spend (archive or fetch-free).
const SERVER_ONLY_FLAGS = ["warm", "bypassCache", "rerun", "poolDiag", "backfillCount", "archiveQuery", "oneBoxProof", "titleSearch", "cacheStats", "reserveSim", "debug"];
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const credentialed = hasServerCredential(req);
  if (!credentialed && req.body && typeof req.body === "object") for (const k of SERVER_ONLY_FLAGS) if (k in req.body) delete req.body[k];

  // Spec D: server-side curtain seal. Pre-launch, non-crew requests to the
  // decision API are refused HERE, not merely hidden by CSS. Crew devices and
  // internal jobs (warm / bypassCache) pass. Env-gated (CURTAIN_SEALED=1),
  // default off so a deploy never locks out crew testing before Sam enables it;
  // removed on launch day with the rest of the curtain.
  if (process.env.CURTAIN_SEALED === "1") {
    const sealCookies = parseCookies(req.headers.cookie);
    const internalSeal = req.body?.warm === true || req.body?.bypassCache === true;
    const testerSeal = sealCookies.gas_tester === "ok" && !testerCodeExpired(); // expired testers are re-sealed
    if (!isCrewRequest(req) && !testerSeal && !internalSeal) {
      return res.status(403).json({ status: "sealed", error: "Not open yet." });
    }
  }

  const apiKey = process.env.OLDCARSDATA_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  try { await ensureFxReady({ supabaseUrl, supabaseKey }); } catch (e) {}   // item 1: arm sale-date FX for every USD conversion in this request
  // One Box empty-state proof line: recent real sales for the storefront. Archive-only,
  // no OCD, no gate, no car needed -> answered before every other check.
  if (req.body?.oneBoxProof) {
    try {
      const p = await runOneBoxProof({ supabaseUrl, supabaseKey });
      return res.status(200).json({ status: "one_box_proof", ...p });
    } catch (e) { return res.status(200).json({ status: "one_box_proof", proof: [] }); }
  }
  // Sam Desk (/desk) moved to its own function, api/desk.js (Vercel Pro, maxDuration 300s).
  // It only lived here because the Hobby plan capped functions at 12; that is lifted.
  // Archive aggregation (archive-only, no car, no OCD). Modes: yearCounts (per-platform/per-year
  // counts + earliest date, for backfill reporting) and houseLeaders (per-model house comparison).
  if (req.body?.archiveQuery) {
    const env2 = { supabaseUrl, supabaseKey };
    const mode = String(req.body.archiveQuery);
    const pageAll = async (base) => { // page sales_archive in 1000s
      let all = [], off = 0;
      for (let i = 0; i < 400; i++) {
        const rows = await supabaseSelect(env2, `${base}&order=id&limit=1000&offset=${off}`);
        if (!rows || !rows.length) break; all = all.concat(rows); if (rows.length < 1000) break; off += 1000;
      }
      return all;
    };
    if (mode === "pool") {
      // Raw qualifying rows for ONE car scope: title term(s) + make + year range + date range.
      // The hvt100 harness applies exclusions/metrics; this just returns the archive rows.
      const terms = Array.isArray(req.body.terms) && req.body.terms.length ? req.body.terms : (req.body.term ? [req.body.term] : []);
      const make = req.body.make ? String(req.body.make) : null;
      const yMin = req.body.yearMin != null ? Number(req.body.yearMin) : null, yMax = req.body.yearMax != null ? Number(req.body.yearMax) : null;
      const dFrom = req.body.dateFrom ? String(req.body.dateFrom) : null, dTo = req.body.dateTo ? String(req.body.dateTo) : null;
      const seen = new Set(); let rows = [];
      const cols = "id,price:sale_price,date:sale_date,platform,title:listing_title,make,model,year,vin_norm,has_reserve," +
        "mileage:raw_record->>mileage,transmission:raw_record->>transmission,currency:raw_record->>currency,url:raw_record->>url,url2:raw_record->>source_url";
      // Strict paging: a leading-wildcard title ILIKE can statement-timeout under batch load, and a
      // swallowed timeout used to look identical to a genuinely empty pool (supabaseSelect returns
      // null -> pageAll broke -> count 0). That fabricated "zero comparable" rows for cars that
      // actually have 100+ comps (hvt100 preliminary pass: 27 false zeros). Retry a failed page,
      // and if it still fails, THROW so the caller reports an honest query error, never a false 0.
      const pageAllStrict = async (base) => {
        let all = [], off = 0;
        for (let i = 0; i < 400; i++) {
          let got = null;
          for (let attempt = 0; attempt < 4 && got === null; attempt++) {
            got = await supabaseSelect(env2, `${base}&order=id&limit=1000&offset=${off}`);
            if (got === null && attempt < 3) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          }
          if (got === null) { const e = new Error("pool page query failed after retries"); e.poolQueryFailed = true; throw e; }
          if (!got.length) break;
          all = all.concat(got); if (got.length < 1000) break; off += 1000;
        }
        return all;
      };
      try {
        for (const term of (terms.length ? terms : [null])) {
          let base = `sales_archive?select=${cols}&sale_price=not.is.null`;
          if (term) base += `&listing_title=ilike.${encodeURIComponent("*" + term + "*")}`;
          if (make) base += `&make=ilike.${encodeURIComponent(make)}`;
          if (yMin != null) base += `&year=gte.${yMin}`;
          if (yMax != null) base += `&year=lte.${yMax}`;
          if (dFrom) base += `&sale_date=gte.${dFrom}`;
          if (dTo) base += `&sale_date=lte.${dTo}`;
          const got = await pageAllStrict(base);
          for (const r of got) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
        }
      } catch (e) {
        if (e && e.poolQueryFailed) return res.status(200).json({ status: "archive_query", mode, count: null, error: "query_failed", rows: [] });
        throw e;
      }
      rows = rows.map(r => ({ id: r.id, date: r.date, price: Number(r.price) || null, platform: r.platform || null,
        make: r.make || null, model: r.model || null, year: r.year || null, title: r.title || null,
        vin: r.vin_norm || null, transmission: r.transmission || null,
        mileage: r.mileage != null ? Number(String(r.mileage).replace(/[^\d.]/g, "")) || null : null,
        hasReserve: r.has_reserve, url: r.url || r.url2 || null }));
      return res.status(200).json({ status: "archive_query", mode, count: rows.length, rows });
    }
    if (mode === "canonCount") {
      // Read-only counts of the canonical layer (service-role) + optional VIN-in-canonical lookup.
      // Zero OCD. Used to report canonical_sales / sale_aliases before/after a relink.
      const exact = async (table, col) => {
        try {
          const r = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${col}&limit=1`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
          const cr = r.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/); return m ? Number(m[1]) : null;
        } catch { return null; }
      };
      const canonical_sales = await exact("canonical_sales", "id");
      const sale_aliases = await exact("sale_aliases", "source_record_id");
      const vin = req.body.vin ? String(req.body.vin) : null;
      let vinRows = null;
      if (vin) { try { vinRows = await supabaseSelect(env2, `canonical_sales?select=id,make,model,year,sale_date,hammer_usd,primary_source,alias_count,chassis_vin_norm&chassis_vin_norm=eq.${encodeURIComponent(vin)}&limit=5`); } catch { vinRows = null; } }
      return res.status(200).json({ status: "archive_query", mode, canonical_sales, sale_aliases, vin, vinRows });
    }
    if (mode === "vinPresence") {
      // For a batch of VIN/chassis strings, return how many appear in >=2 archive rows (a prior sale
      // we could show) - used for the hvt100 vin_history metric. Archive-only.
      const vins = (Array.isArray(req.body.vins) ? req.body.vins : []).map(v => String(v || "").trim()).filter(Boolean);
      const out = {};
      for (const v of vins) {
        try { const rows = await supabaseSelect(env2, `sales_archive?select=id&vin_norm=eq.${encodeURIComponent(v)}&limit=5`); out[v] = (rows || []).length; }
        catch { out[v] = 0; }
      }
      return res.status(200).json({ status: "archive_query", mode, presence: out });
    }
    if (mode === "dupScan") {
      // READ-ONLY (archive only, zero OCD): count duplicate (vin_norm, sale_date, source_slug) rows
      // archive-wide - the same physical sale ingested under two source_record_ids (OCD double-assigns
      // ids to house sales). Reports the number of duplicate GROUPS and the number of EXTRA rows
      // (group size minus one, summed). Never deletes anything. Keyset-pages by the indexed id column
      // (ordering by vin_norm on the whole archive timed out the first page); groups in memory.
      const g = new Map(); let cursor = "", scanned = 0;
      for (let i = 0; i < 400; i++) {
        let q = `sales_archive?select=id,vin_norm,sale_date,source_slug&vin_norm=not.is.null&sale_date=not.is.null&order=id.asc&limit=1000`;
        if (cursor) q += `&id=gt.${encodeURIComponent(cursor)}`;
        let batch = null;
        for (let a = 0; a < 3 && batch === null; a++) { batch = await supabaseSelect(env2, q); if (batch === null && a < 2) await new Promise(r => setTimeout(r, 400 * (a + 1))); }
        if (batch === null) return res.status(200).json({ status: "archive_query", mode, error: "query_failed", scanned });
        if (!batch.length) break;
        for (const r of batch) {
          scanned++;
          const vn = String(r.vin_norm || "").trim(); if (!vn) continue;
          const k = `${vn}|${String(r.sale_date).slice(0, 10)}|${r.source_slug || ""}`;
          g.set(k, (g.get(k) || 0) + 1);
        }
        cursor = batch[batch.length - 1].id;
        if (batch.length < 1000) break;
      }
      let dupGroups = 0, extraRows = 0; const bySlug = {};
      for (const [k, n] of g) if (n > 1) { dupGroups++; extraRows += n - 1; const slug = k.split("|")[2] || "(null)"; bySlug[slug] = (bySlug[slug] || 0) + (n - 1); }
      return res.status(200).json({ status: "archive_query", mode, scanned, keyedGroups: g.size, dupGroups, extraRows, extraRowsBySlug: bySlug });
    }
    if (mode === "count") {
      // Exact row counts via PostgREST Content-Range (no paging, no deep-offset timeout).
      // Reports total + per-sale-year counts for each platform over the given window.
      const platforms = Array.isArray(req.body.platforms) ? req.body.platforms : ["Bring a Trailer", "Cars & Bids"];
      const dFrom = req.body.dateFrom ? String(req.body.dateFrom) : null, dTo = req.body.dateTo ? String(req.body.dateTo) : null;
      // Read-only created_at (ingest timestamp) window, for provenance audits (which rows landed
      // during a given ingest run). Applied to created_at alongside the sale_date window.
      const cFrom = req.body.createdFrom ? String(req.body.createdFrom) : null, cTo = req.body.createdTo ? String(req.body.createdTo) : null;
      const noYears = req.body.noYears === true;   // skip the per-year loop when only the window count is wanted
      const exactCount = async (filters) => {
        try {
          const r = await fetch(`${supabaseUrl}/rest/v1/sales_archive?select=id&${filters}&limit=1`, {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "count=exact", Range: "0-0" }
          });
          const cr = r.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
          return m ? Number(m[1]) : null;
        } catch { return null; }
      };
      const winFilter = (pf) => `${pf}${dFrom ? `&sale_date=gte.${dFrom}` : ""}${dTo ? `&sale_date=lte.${dTo}` : ""}${cFrom ? `&created_at=gte.${encodeURIComponent(cFrom)}` : ""}${cTo ? `&created_at=lte.${encodeURIComponent(cTo)}` : ""}`;
      const out = [];
      for (const plat of platforms) {
        const pf = `platform=eq.${encodeURIComponent(plat)}&sale_price=not.is.null`;
        const total = noYears ? null : await exactCount(pf);
        const windowCount = (dFrom || dTo || cFrom || cTo) ? await exactCount(winFilter(pf)) : null;
        const bySaleYear = {};
        if (!noYears) for (const y of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
          bySaleYear[y] = await exactCount(`${pf}&sale_date=gte.${y}-01-01&sale_date=lte.${y}-12-31`);
        }
        out.push({ platform: plat, total, windowCount, bySaleYear });
      }
      return res.status(200).json({ status: "archive_query", mode, dateFrom: dFrom, dateTo: dTo, createdFrom: cFrom, createdTo: cTo, out });
    }
    if (mode === "yearCounts") {
      const platforms = Array.isArray(req.body.platforms) ? req.body.platforms : ["Bring a Trailer", "Cars & Bids"];
      const yMin = Number(req.body.yearMin) || 2023, yMax = Number(req.body.yearMax) || 2025;
      const out = [];
      const dFrom = req.body.dateFrom ? String(req.body.dateFrom) : null, dTo = req.body.dateTo ? String(req.body.dateTo) : null;
      for (const plat of platforms) {
        const rows = await pageAll(`sales_archive?select=id,year,sale_date&platform=eq.${encodeURIComponent(plat)}&sale_price=not.is.null`);
        const byYear = {}; const bySaleYear = {}; let earliest = null; let inRange = 0;
        for (const r of rows) {
          const y = Number(r.year); if (y >= yMin && y <= yMax) byYear[y] = (byYear[y] || 0) + 1;
          if (r.sale_date) {
            if (!earliest || r.sale_date < earliest) earliest = r.sale_date;
            const sy = String(r.sale_date).slice(0, 4); bySaleYear[sy] = (bySaleYear[sy] || 0) + 1;
            if ((!dFrom || r.sale_date >= dFrom) && (!dTo || r.sale_date <= dTo)) inRange++;
          }
        }
        out.push({ platform: plat, total: rows.length, byYear, bySaleYear, earliest, inRange });
      }
      return res.status(200).json({ status: "archive_query", mode, yMin, yMax, out });
    }
    if (mode === "houseLeaders") {
      const HOUSES = ["RM Sotheby's", "Gooding & Co", "Bonhams", "Broad Arrow", "Barrett-Jackson", "Mecum Auctions"];
      const since = new Date(Date.now() - 1096 * 864e5).toISOString().slice(0, 10);
      const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : null; };
      const models = {}; // key -> { display, houses: {house: prices[]} }
      for (const h of HOUSES) {
        const rows = await pageAll(`sales_archive?select=model,make,sale_price,listing_title&platform=eq.${encodeURIComponent(h)}&sale_price=not.is.null&sale_date=gte.${since}`);
        for (const r of rows) {
          const model = r.model || null; if (!model) continue;
          const key = norm(`${r.make || ""} ${model}`); if (!key) continue;
          const price = Number(r.sale_price); if (!(price > 0)) continue;
          (models[key] = models[key] || { display: `${r.make ? r.make + " " : ""}${model}`.trim(), houses: {} });
          (models[key].houses[h] = models[key].houses[h] || []).push(price);
        }
      }
      const results = [];
      for (const key of Object.keys(models)) {
        const m = models[key];
        const stats = Object.entries(m.houses).map(([house, prices]) => ({ house, count: prices.length, median: med(prices) }));
        const totalHouse = stats.reduce((s, x) => s + x.count, 0);
        if (totalHouse < 3) continue;
        const gooding = stats.find(x => x.house === "Gooding & Co");
        const others = stats.filter(x => x.house !== "Gooding & Co");
        const maxOtherCount = Math.max(0, ...others.map(x => x.count));
        const maxOtherMed = Math.max(0, ...others.map(x => x.median || 0));
        // CLEAR leadership: Gooding STRICTLY most sales AND STRICTLY highest median (no ties).
        if (gooding && gooding.count > maxOtherCount && (gooding.median || 0) > maxOtherMed) {
          const second = others.sort((a, b) => b.median - a.median)[0] || null;
          results.push({ model: m.display, goodingCount: gooding.count, goodingMedian: gooding.median,
            second: second ? { house: second.house, count: second.count, median: second.median } : null });
        }
      }
      results.sort((a, b) => b.goodingMedian - a.goodingMedian);
      return res.status(200).json({ status: "archive_query", mode, count: results.length, top: results.slice(0, 15) });
    }
    if (mode === "sourceCoverage") {
      const table = await sourceCoverage(env2, { force: !!req.body.force });
      return res.status(200).json({ status: "archive_query", mode, coverage: table });
    }
    if (mode === "goodinguk") {
      // READ-ONLY (currency fix part 2a, item 2): Gooding is tagged all-USD in OldCarsData, but its
      // London sales would be GBP. List Gooding rows with a UK location OR "London" in the title so Sam
      // can raise it with OCD. Scans the FULL raw_record (Gooding's location may live under any key, or
      // be absent - the house-metadata gap), and reports which location-ish fields carry values so the
      // finding is honest either way. Changes nothing. Zero OCD.
      // Gooding's only London signal is the "(UKnn)" event code in the TITLE (its records carry NO
      // usable location field: city/state/zip empty, country_code populated on a handful and blank on the
      // London lots). Filter that code SERVER-SIDE so the result is a small set - no client pagination
      // (Range/offset paging both misbehaved on the full-table json-extraction scan). "%28" = "(".
      const gCols = "sale_date,sale_price,listing_title,cur:raw_record->>currency,cc:raw_record->>country_code,url:raw_record->>url";
      const cntHdr = { apikey: env2.supabaseKey, Authorization: `Bearer ${env2.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" };
      const goodingTotal = await (async () => { const r = await fetch(`${env2.supabaseUrl}/rest/v1/sales_archive?source_slug=eq.gooding&sale_price=not.is.null&select=id&limit=1`, { headers: cntHdr }); const m = (r.headers.get("content-range") || "").match(/\/(\d+)$/); return m ? Number(m[1]) : null; })();
      // Step 1: the "(UKnn)"-coded lots identify Gooding's London SALE DATES.
      const coded = (await supabaseSelect(env2, `sales_archive?source_slug=eq.gooding&sale_price=not.is.null&select=sale_date,listing_title&listing_title=ilike.*%28UK*&limit=300`)) || [];
      const UK_TITLE = /\(uk\d{2}\)/i;
      const londonDates = [...new Set(coded.filter(r => UK_TITLE.test(String(r.listing_title || ""))).map(r => String(r.sale_date || "").slice(0, 10)).filter(Boolean))].sort();
      // Step 2: EVERY Gooding lot on those dates is a London sale (some lack the title code).
      let rows = [];
      if (londonDates.length) {
        rows = (await supabaseSelect(env2, `sales_archive?source_slug=eq.gooding&sale_price=not.is.null&select=${gCols}&sale_date=in.(${londonDates.join(",")})&order=sale_date.desc&limit=1000`)) || [];
      }
      const seen = new Set(); const uniq = [];
      for (const r of rows.map(r => ({ date: (r.sale_date || "").slice(0, 10), price: Number(r.sale_price) || null, currency: r.cur || "USD", countryCode: (r.cc || "").trim() || null, title: r.listing_title || null, url: r.url || null }))) {
        const k = `${r.title}|${r.date}|${r.price}`; if (seen.has(k)) continue; seen.add(k); uniq.push(r);
      }
      const byCur = {}; for (const r of uniq) byCur[r.currency] = (byCur[r.currency] || 0) + 1;
      const byDate = {}; for (const r of uniq) byDate[r.date] = (byDate[r.date] || 0) + 1;
      return res.status(200).json({ status: "archive_query", mode, goodingTotal, londonDates, londonByDate: byDate, ukCount: uniq.length, byCurrency: byCur, rows: uniq });
    }
    if (mode === "makeAudit") {
      // How many DISTINCT makes in sales_archive are missing from the resolver's make list
      // (taxonomy_makes, the prod source of truth). Pages the make column, dedupes, compares.
      const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      // Scope to a year ceiling (default pre-war 1945) so the scan fits the function budget and targets
      // the actionable gap (the modern-era makes are all seeded); omit yearMax for the full scan.
      const auYmax = req.body.yearMax != null ? Number(req.body.yearMax) : 1945;
      const archRows = await pageAll(`sales_archive?select=make&make=not.is.null${Number.isFinite(auYmax) ? `&year=lt.${auYmax}` : ""}`);
      const archSet = new Map();   // norm -> display
      for (const r of archRows) { const m = String(r.make || "").trim(); if (m && !/^(unknown|reserve|null)$/i.test(m)) { const k = norm(m); if (k && !archSet.has(k)) archSet.set(k, m); } }
      const taxRows = (await supabaseSelect(env2, "taxonomy_makes?select=name&limit=2000")) || [];
      const taxSet = new Set(taxRows.map(r => norm(r.name)).filter(Boolean));
      const missing = [...archSet.entries()].filter(([k]) => !taxSet.has(k)).map(([, d]) => d).sort((a, b) => a.localeCompare(b));
      return res.status(200).json({ status: "archive_query", mode, archiveMakeCount: archSet.size, listMakeCount: taxSet.size, missingCount: missing.length, missing });
    }
    if (mode === "verify") {
      // Raw fields for sale verification (zero OCD): native price + currency, the stored USD columns,
      // high_bid, reserve, source + source_slug, and the raw-record location/sale name + url. Scoped by
      // a title ILIKE term (+ optional source_slug). For the 550 currency/premium/sale-vs-high-bid audit.
      // Filter by the SOURCE LABEL (source_slug is null on most rows - the slug backfill is pending,
      // see the house-premium-backout note). A scalar source filter is json-safe; a listing_title ILIKE
      // + json-extract columns hits the PostgREST false-0 quirk, so titles/chassis are matched client-side.
      // SCALAR columns only + a platform filter (json-extract columns + a filter trip the PostgREST
      // false-0 quirk). Currency is INFERRED from sale_price_usd / sale_price (1.0=USD, ~1.08=EUR,
      // ~1.27=GBP, ~1.12=CHF) since the raw_record->>currency json column can't be filtered-and-selected.
      const srcLabel = req.body.source ? String(req.body.source) : "Bonhams";
      const cols = req.body.cols ? String(req.body.cols) : "id,platform,sale_date,sale_price,sale_price_usd,has_reserve,listing_title,vin_norm";
      const lim = Math.min(3000, Number(req.body.limit) || 2000);
      const q = srcLabel === "SAMPLE"
        ? `sales_archive?select=${cols}&order=id.desc&limit=8`
        : `sales_archive?select=${cols}&platform=ilike.${encodeURIComponent("*" + srcLabel + "*")}&order=sale_date.desc&limit=${lim}`;
      const rows = (await supabaseSelect(env2, q)) || [];
      const inferCur = r => { const n = Number(r.sale_price), u = Number(r.sale_price_usd); if (!(n > 0) || !(u > 0)) return "?"; const k = u / n; return k > 1.2 ? "GBP" : k > 1.15 ? "CHF" : k > 1.04 ? "EUR" : k > 0.95 ? "USD" : "<USD?"; };
      const byCur = {}; for (const r of rows) { const c = inferCur(r); byCur[c] = (byCur[c] || 0) + 1; }
      return res.status(200).json({ status: "archive_query", mode, source: srcLabel, count: rows.length, byInferredCurrency: byCur, rows: rows.map(r => ({ ...r, inferredCur: inferCur(r) })) });
    }
    return res.status(400).json({ error: "unknown archiveQuery mode" });
  }
  // Raw archive title-search diagnostic (archive-only, no car needed, no OCD) -> answered before
  // the car-required check so it is a pure verification tool.
  if (req.body?.titleSearch) {
    const ts = await rawTitleSearch(String(req.body.titleSearch), { supabaseUrl, supabaseKey }, Number(req.body?.sinceDays) || undefined, Number(req.body?.limit) || undefined);
    return res.status(200).json({ status: "title_search", ...ts });
  }
  if (!apiKey) return res.status(500).json({ error: "OldCarsData API key not configured" });
  // Metered DRY-RUN for a backfill: reads OCD's own total count for a source+year range and its
  // authoritative rate-limit header, so we can size a backfill (requests = ceil(total/50)) and
  // confirm it fits the remaining quota BEFORE spending. ~1 metered request per source; no writes.
  if (req.body?.backfillCount) {
    const sources = Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : ["bringatrailer", "carsandbids"];
    const yearMin = Number(req.body.yearMin) || 2023, yearMax = Number(req.body.yearMax) || 2025;
    const out = []; let ocdRemaining = null, ocdLimit = null, ocdReset = null;
    // boundaryDate: the ingest paginates newest-first (status=sold, sort date desc) and filters
    // app-side, so a "from <date>" backfill costs the page count from newest back to that date. Binary
    // search the crossover page against OCD's real, date-desc pages - the authoritative request count.
    const boundaryDate = typeof req.body.boundaryDate === "string" ? req.body.boundaryDate : null;
    const datesOf = r => (r.data || []).map(x => x.auction_end_date).filter(Boolean).sort();
    if (boundaryDate) {
      let spent = 0;
      for (const source of sources) {
        try {
          const first = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: 1, limit: 50 }, apiKey); spent++;
          const rl = first.__rateLimit || {}; if (rl.remaining != null) ocdRemaining = Number(rl.remaining); if (rl.limit != null) ocdLimit = Number(rl.limit);
          const meta = first.meta || {}; const totalPages = Number(meta.total_pages || Math.ceil((meta.total || 0) / 50)) || 1;
          // largest page whose NEWEST (first) row is still >= boundaryDate; that page + 1 = backfill cost
          let lo = 1, hi = totalPages, boundary = 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const rm = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: mid, limit: 50 }, apiKey); spent++;
            const rlm = rm.__rateLimit || {}; if (rlm.remaining != null) ocdRemaining = Number(rlm.remaining);
            const ds = datesOf(rm); const newestOnPage = ds[ds.length - 1] || null;
            if (newestOnPage && newestOnPage >= boundaryDate) { boundary = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
          out.push({ source, totalPages, boundaryPage: boundary, backfillRequests: boundary + 1, totalRecords: Number(meta.total) || null });
        } catch (e) { out.push({ source, error: String(e.message || e) }); }
      }
      const totalReq = out.reduce((s, o) => s + (o.backfillRequests || 0), 0);
      return res.status(200).json({ status: "backfill_boundary", boundaryDate, ocdRemaining, ocdLimit, dryRunRequestsSpent: spent, totalBackfillRequests: totalReq, sources: out });
    }
    const useYear = req.body.noYear !== true;
    for (const source of sources) {
      try {
        const base = { source, status: "sold", limit: 50, ...(useYear ? { year_min: yearMin, year_max: yearMax } : {}) };
        const r = await callOldCarsData("/auctions", { ...base, page: 1 }, apiKey);
        const rl = r.__rateLimit || {}; if (rl.remaining != null) ocdRemaining = Number(rl.remaining); if (rl.limit != null) ocdLimit = Number(rl.limit); if (rl.reset != null) ocdReset = rl.reset;
        const meta = r.meta || r.pagination || {};
        const total = r.total ?? r.count ?? r.total_count ?? meta.total ?? meta.total_count ?? meta.count ?? null;
        const lastPageNo = r.last_page ?? r.pages ?? r.total_pages ?? meta.last_page ?? meta.total_pages ?? (total != null ? Math.ceil(Number(total) / 50) : null);
        const d1 = datesOf(r);
        // Probe the LAST page to learn the OLDEST date OCD actually holds for this filtered query.
        let oldest = null, lastPageLen = null;
        if (lastPageNo && lastPageNo > 1) {
          const rL = await callOldCarsData("/auctions", { ...base, page: lastPageNo }, apiKey);
          const dL = datesOf(rL); oldest = dL[0] || null; lastPageLen = (rL.data || []).length;
          const rlL = rL.__rateLimit || {}; if (rlL.remaining != null) ocdRemaining = Number(rlL.remaining);
        } else { oldest = d1[0] || null; }
        out.push({ source, total: total != null ? Number(total) : null, lastPage: lastPageNo != null ? Number(lastPageNo) : null,
          metaKeys: Object.keys(meta), newest: d1[d1.length - 1] || null, oldest, lastPageLen,
          requestsIf50: total != null ? Math.ceil(Number(total) / 50) : null });
      } catch (e) { out.push({ source, error: String(e.message || e) }); }
    }
    const totalRequests = out.reduce((s, o) => s + (o.requestsIf50 || 0), 0);
    return res.status(200).json({ status: "backfill_count", yearMin, yearMax, ocdRemaining, ocdLimit, ocdReset, dryRunRequestsSpent: sources.length, totalRequestsNeeded: totalRequests || null, sources: out });
  }

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
    // Market Check non-road gate (Oct 2026, ENTRY POINT ONLY - never the engine). A boat, aircraft,
    // standalone trailer/caravan, or memorabilia/parts/loose-engine query gets a plain answer here,
    // before the resolver or runOneBox ever sees it, so it can never be priced as a car. Motorcycles
    // and other self-propelled vehicles are NOT gated here (isNonRoad lets them through) - they resolve
    // and price normally, same as today. One Box only; /sell is untouched. lib/onebox.js is not edited.
    if (req.body?.oneBox && typeof rawSearch === "string") {
      const nr = nonRoadReason(rawSearch);
      if (nr) {
        const noun = { boat: "a boat", aircraft: "an aircraft", trailer: "a trailer or caravan", memorabilia: "that" }[nr] || "that";
        return res.status(200).json({ status: "one_box", tier: "non_road", samLine: `Market Check covers cars, trucks and motorcycles. ${noun.charAt(0).toUpperCase() + noun.slice(1)} isn't something it can price.` });
      }
    }

    // The frontend validates with vehicleIdentity and passes the resolved
    // vehicle object through; parsing happens once. Raw text is only re-resolved
    // (same shared resolver) when a caller skips that step.
    let vehicle = sanitizeResolvedVehicle(car.vehicle);
    if (!vehicle) {
      // One Box: turn on VIN/chassis detection so a chassis-shaped query the reader typed
      // with a space ("1E 31588", the way BaT shows it) resolves to a chassis_hint we can
      // attach the exact archive match to. Only matters when nothing else resolves; a
      // recognizable car ("Cayman GT4") resolves first and never reaches the chassis path.
      const obVinActive = req.body?.oneBox ? await vinFeatureActive(req.headers.cookie, { supabaseUrl, supabaseKey }) : false;
      const resolution = await resolveVehicle(rawSearch, obVinActive ? { vinConfirm: true } : {});
      if (resolution.status !== "valid") {
        // The caller already accepted a model-level read (the seller declined
        // the year in the wizard). Proceed with the partial make/model through
        // the evidence ladder at model level instead of clarifying: we never
        // re-ask the year after the summary was confirmed.
        // A seller who accepted a model-level read (or answered "not sure" to a model/ambiguity
        // question) proceeds at MAKE level. sanitizeResolvedVehicle drops a model-less vehicle, so when
        // the resolution still pinned a make (+ usually a year), fall back to a bare make-level vehicle
        // that carries make/year and the ORIGINAL raw text (so the class-era read can body-class it from
        // the codes the seller typed, e.g. "D50 D350" -> truck). This is what routes a "not sure" to the
        // wider class-era read instead of a route pick with no sales.
        // Fix 7 (Oct 2026): the engine is about to ASK (the resolver gave no model). Before asking,
        // see whether the SALE TITLES clearly name one car for what was typed. Runs ONLY here - never
        // on a search that resolves to a result today - is cached, and keeps the ask when the titles
        // disagree (condition 5: never guess).
        // Runs for BOTH One Box and /sell (Step 2): the wizard vehicle step gets the same archive
        // title resolution, so an unresolved make+token ("Eagle Talon", a pre-war marque) resolves
        // from the sale titles instead of a generic re-ask.
        if (!(resolution.vehicle && resolution.vehicle.model) && !car.acceptModelLevel && typeof rawSearch === "string") {
          const cleaned = rawSearch.replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
          const toks = cleaned.split(/\s+/).filter(t => t.length >= 2);
          const phrases = [cleaned, ...toks.filter(t => t.length >= 3)].filter((v, i, a) => v && a.indexOf(v) === i);
          try {
            const tok = await archiveResolveToken(phrases, { supabaseUrl, supabaseKey }, toks);
            if (tok && tok.make && tok.model) {
              // Trust the archive-resolved make (issue 1): a typed make that exists in the titles must
              // win over the resolver's fuzzy guess ("Eagle Talon" -> Eagle Talon, never "Talbot").
              vehicle = { make: tok.make, model: tok.model, year: (resolution.vehicle && resolution.vehicle.year) || null, raw: rawSearch };
              req._fix7 = tok;
            }
          } catch (e) { /* lookup is best-effort; fall through to the normal ask */ }
        }
        let partial = !vehicle && car.acceptModelLevel ? sanitizeResolvedVehicle(resolution.vehicle) : null;
        if (!partial && !vehicle && car.acceptModelLevel && resolution.vehicle && resolution.vehicle.make) {
          const rv = resolution.vehicle;
          partial = { make: rv.make, year: rv.year || null, model: rv.model || null, trim: rv.trim || null, raw: rv.raw || rawSearch, unverified: true };
        }
        if (vehicle) {
          /* Fix 7 resolved from the titles - proceed to the result, no ask */
        } else if (partial) {
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
            clarification: resolution.clarification || { question: "What year, make and model are you selling?" },
            // One Box rejected-chip tracking (Oct 2026, mirrors js/chat-core.js noteRejectedModel):
            // the frontend needs to know the underlying resolver status was invalid_vehicle, not a
            // generic re-ask, to record that this model never comes back as a chip for this year+make.
            invalidVehicle: resolution.status === "invalid_vehicle"
          });
        } else {
          const cl = resolution.clarification || { question: "What year, make and model are you selling?" };
          // Chassis exact-match (One Box, multi-token path): a chassis-shaped query that
          // resolved to nothing. Attach the separator-tolerant archive match (evidence only,
          // never ranking) so the frontend can lead with "I know this exact car" before
          // asking for the year/make/model. No hit -> just the honest chassis line.
          let obChassisMatch = null;
          if (obVinActive && cl.kind === "chassis_hint") {
            try { obChassisMatch = await findVinArchiveMatch({ supabaseUrl, supabaseKey }, { vin: rawSearch }); } catch { obChassisMatch = null; }
          }
          return res.status(200).json({
            status: "needs_clarification",
            vehicle: resolution.vehicle,
            clarification: cl,
            vinArchiveMatch: obChassisMatch || undefined,
            // One Box rejected-chip tracking (Oct 2026, mirrors js/chat-core.js noteRejectedModel).
            invalidVehicle: resolution.status === "invalid_vehicle"
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
      // Graceful failure (reliability pass): if Supabase is slow or DOWN, fail FAST to one calm line
      // rather than a hung spinner or a misleading "not enough sales" from empty reads. A cheap probe
      // with a short abort catches the down/slow case before the heavy compute.
      const OB_CALM = "Sam’s catching his breath, try again in a minute.";
      const obHealthy = await (async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, Number(process.env.ONEBOX_PROBE_MS || 3500));
          const r = await fetch(`${supabaseUrl}/rest/v1/sales_archive?select=source_id&limit=1`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: ctrl.signal });
          clearTimeout(t);
          return r.ok;
        } catch { return false; }
      })();
      if (!obHealthy) {
        console.error("One Box unavailable: Supabase health probe failed (slow/down).");
        return res.status(200).json({ status: "one_box", tier: "unavailable", samLine: OB_CALM });
      }
      // Invisible per-address/per-device ceiling (Oct 2026, open-search policy). REPLACES the old
      // onebox_daily_cap: that cap was counted against a client-chosen, resettable anonId (not a real
      // visitor limit) and, worse, was VISIBLE in normal use - a genuine visitor could land on a full
      // "That's a lot of lookups for one day" dead end, which contradicts "Market Check: unlimited
      // public checks... nothing is held back." One Box is still archive-only (zero OldCarsData cost,
      // see above), so this protects against automated floods only, never spend - uses Lane C's shared
      // ceiling (lib/_ceilings.js checkCeiling), the SAME mechanism Buy and Sell search already call,
      // never a second implementation. Fail open (an unreadable ledger never blocks a real search); a
      // genuine hit logs rate_limit_hit itself and shows one calm line, no sign-in demand, no number.
      const obCeiling = await checkCeiling({ supabaseUrl, supabaseKey }, req, "market_check_search", { tool: "market_check" });
      if (!obCeiling.ok) {
        return res.status(200).json({ status: "one_box", tier: "rate_limited", resolvedCar: null, samLine: CALM.search });
      }
      const oneBoxText = typeof rawSearch === "string" ? rawSearch : (vehicle?.raw || vehicle?.canonicalLabel || "");
      // Round-4 earned question: an inline refinement (mileage band / transmission) narrows the
      // same pool without a re-typed query. Sanitized to numbers + a known transmission token.
      const rawRefine = req.body?.refine || (car && car.refine) || null;
      const obRefine = rawRefine ? {
        miMin: Number.isFinite(Number(rawRefine.miMin)) ? Number(rawRefine.miMin) : null,
        miMax: Number.isFinite(Number(rawRefine.miMax)) ? Number(rawRefine.miMax) : null,
        // Nearest-sales fallback (Part 3): the band center, so a too-thin band shows the closest sales.
        miTarget: Number.isFinite(Number(rawRefine.miTarget)) ? Number(rawRefine.miTarget) : null,
        tx: rawRefine.tx === "manual" ? "manual" : rawRefine.tx === "auto" ? "auto" : null,
        // Body style refine (Oct 2026, Market Check): same small, known vocabulary lib/onebox.js's
        // detectBodyStyle()/BODY_LABEL use - anything else is dropped, never passed through raw.
        body: ["targa", "coupe", "cabriolet", "convertible", "roadster", "wagon", "sedan"].includes(rawRefine.body) ? rawRefine.body : null,
        // Trim question refine (item 2, Oct 2026, Market Check): a slug lib/onebox.js's own
        // trimSlug() produced (e.g. "carrera-s", "turbo-s") - shape-checked only, the engine itself
        // looks it up against the family's real fence names and ignores anything that doesn't match.
        trim: typeof rawRefine.trim === "string" && /^[a-z0-9-]{1,30}$/.test(rawRefine.trim) ? rawRefine.trim : null,
        // Competition-variant refine (Part 1 change 1): Competition Package vs standard.
        variant: rawRefine.variant === "competition" ? "competition" : rawRefine.variant === "standard" ? "standard" : null,
        // Item 7/8 dictionary-driver refine + item 9 observable-fact refine (both re-scope the pool).
        driver: typeof rawRefine.driver === "string" ? rawRefine.driver.slice(0, 40) : null,
        driverVal: rawRefine.driverVal === "no" ? "no" : rawRefine.driverVal === "yes" ? "yes" : null,
        observe: typeof rawRefine.observe === "string" ? rawRefine.observe.slice(0, 40) : null,
        label: typeof rawRefine.label === "string" ? rawRefine.label.slice(0, 40) : null
      } : null;
      // #1 divergence rule: the exact-car sale is fetched by the frontend (vehicleIdentity ->
      // vinAnchor) and passed back in car.exactSale; the engine compares it to the cluster.
      const rawES = car && typeof car.exactSale === "object" ? car.exactSale : null;
      const exactSale = rawES && Number(rawES.price) > 0 ? {
        price: Number(rawES.price),
        mileage: Number.isFinite(Number(rawES.mileage)) && Number(rawES.mileage) > 0 ? Number(rawES.mileage) : null,
        soldDate: typeof rawES.soldDate === "string" ? rawES.soldDate.slice(0, 10) : null
      } : null;
      // Daily distinct-car limit (Oct 2026, Market Check daily limit job): 10 distinct cars per
      // device per day; a refinement of the car already on screen (obRefine truthy) is exempt the
      // same way it already skips the SEARCH event just below - it is not a new lookup. The car
      // identity key reuses lib/live/search.js specKeyFor, the SAME key the spec cache already
      // builds from this vehicle/generation pair, so a device that looks up the identical car twice
      // today (even via two separate fresh searches, not a UI refine) never spends a second slot.
      if (vehicle && vehicle.make && !obRefine) {
        const carKey = specKeyFor(vehicle, generation, null);
        const carLimit = await checkMarketCheckCarLimit({ supabaseUrl, supabaseKey }, req, carKey);
        if (!carLimit.ok) {
          return res.status(200).json({
            status: "one_box", tier: "business_limit", resolvedCar: null,
            samLine: "That’s today’s limit for individual lookups. Sam Desk is built for ongoing or business use."
          });
        }
      }
      // Deadline: a slow query must fail fast to the calm line, never hang the spinner. Race the
      // whole compute against a server deadline; any timeout OR throw returns the unavailable line.
      let oneBox;
      try {
        oneBox = await Promise.race([
          runOneBox(vehicle, generation, oneBoxText, { supabaseUrl, supabaseKey, exactSale, asked: Math.max(0, Math.min(9, Number(req.body?.asked) || 0)) }, obRefine),
          new Promise((_, rej) => setTimeout(() => rej(new Error("onebox_deadline")), Number(process.env.ONEBOX_DEADLINE_MS || 20000)))
        ]);
      } catch (e) {
        console.error(`One Box unavailable (${(e && e.message) || e}).`);
        return res.status(200).json({ status: "one_box", tier: "unavailable", samLine: OB_CALM });
      }
      // search event (Oct 2026, open-search policy Part 1.2): once per completed search, never on a
      // refine tap (obRefine - a continuation of the same lookup, same exemption the old onebox_search
      // cap already used). Resolved make|model key only, never the typed text or a VIN. tagged
      // "market_check" - this branch is also reached by Buy's own live-listing drawer (see the comment
      // just below), which this does not separately distinguish; a known, minor imprecision, not fixed
      // here (would need a flag threaded from the drawer's own caller). No userId: this branch returns
      // before any bearer/account check runs, so only the visitor id is available.
      if (oneBox && !obRefine && vehicle && vehicle.make) {
        logEvent({ supabaseUrl, supabaseKey }, { event: EVENTS.SEARCH, tool: "market_check", visitorId: readVisitorId(req), props: { key: `${vehicle.make}|${vehicle.model || ""}` } }).catch(() => {});
      }
      // OPPORTUNISTIC CARD-CACHE REFRESH (Oct 2026 follow-up, item 1: "drawer vs card,
      // structurally"). Market Check and the Buy drawer both land here, and both just ran the
      // SAME live engine call Buy's card cache (spec_market_cache) is built from. Writing that
      // answer back under the identical key (specKeyFor, shared with lib/live/search.js specOf) on
      // every clean result means ordinary traffic keeps a popular spec's card fresh well inside the
      // ingest-tied invalidation and 1-day ceiling (items 1 and 2) - on top of those, never instead
      // of them, and never slowing or failing this response (fire-and-forget). Skipped on a refine
      // answer (obRefine) - a refined pool is narrower than the base spec the cache key names, and
      // would otherwise overwrite the card's base-spec row with a mileage/gearbox-filtered one.
      if (oneBox && oneBox.tier === "result" && !obRefine && vehicle && vehicle.make && vehicle.model) {
        try {
          const cacheKey = specKeyFor(vehicle, generation, null);
          const core = coreOf(oneBox, { v: vehicle, generation, refine: null });
          if (core) persistCore({ supabaseUrl, supabaseKey }, cacheKey, core).catch(() => {});
        } catch { /* best-effort only, never blocks the response */ }
      }
      // Addressable result (Task 4): persist a stable, shareable snapshot of THIS result so
      // /o/<id> re-opens the exact same answer cold and its OG tags carry the answer line.
      // Reuses the /sell saved_results store; tagged obShare:true so the public read path can
      // ONLY ever serve One Box snapshots (never a /sell seller result). Archive-only aggregate
      // payload, no seller PII, so it is safe to expose. Best-effort: a persist failure never
      // fails the lookup (the result just isn't shareable). Only real answers get a snapshot.
      let snapshotId = null;
      if (oneBox && oneBox.tier === "result" && !obRefine) {
        try {
          snapshotId = await persistSavedResult(null, {
            obShare: true, savedAt: new Date().toISOString(),
            query: oneBoxText, oneBox
          }, supabaseUrl, supabaseKey);
        } catch { snapshotId = null; }
      }
      return res.status(200).json({ status: "one_box", ...oneBox, snapshotId: snapshotId || undefined });
    }

    // Price-step transparency (#68): a seller who DEFERS the asking price gets THE RECORD
    // (the real range cars like this sold for), never a number. Archive-only (sales_archive),
    // ZERO OldCarsData, no search gate, no writes, returned BEFORE any metered fetch. NO median
    // is ever computed into the response - a midpoint a seller could adopt is a valuation.
    if (req.body?.priceProbe) {
      const band = await priceBandForVehicle(vehicle, generation, { supabaseUrl, supabaseKey });
      // Optional per-transaction listing (archive-only) for verification pulls: pass listSales:true
      // and an optional sinceDays window. Trim-scoped like the band; the caller filters finer spec.
      if (req.body?.listSales) {
        const listing = await listSalesForVehicle(vehicle, generation, { supabaseUrl, supabaseKey }, Number(req.body?.sinceDays) || undefined);
        return res.status(200).json({ status: "price_probe", band, listing });
      }
      return res.status(200).json({ status: "price_probe", band });
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

    // Pool-depth diagnostic (Sep 2026): runs the FRESH ladder fetch and the STORE
    // (cache-hit) fetch side by side for the same vehicle and reports the gap plus
    // WHY, so the cache-vs-fresh thinning is measured on real data, not guessed.
    // Metered (a real fresh fetch), so crew/probe-gated in practice; no DB writes.
    if (req.body?.poolDiag) {
      const days = n => n >= 36500 ? "all" : n;
      const keyOf = r => sourceRecordKey(recordPlatform(r), sourceRecordId(r));
      const inWin = r => daysAgo(r.auction_end_date) <= 180;
      const fresh = await fetchRecentRecords(vehicle, apiKey, generation);
      const store = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
      const freshRecs = fresh.records || [];
      const storeRecs = (store && store.records) || [];
      const storeKeys = new Set(storeRecs.map(keyOf));
      const freshKeys = new Set(freshRecs.map(keyOf));
      const freshOnly = freshRecs.filter(r => !storeKeys.has(keyOf(r)));
      const storeOnly = storeRecs.filter(r => !freshKeys.has(keyOf(r)));
      const modelField = r => String(r.ocd_model_name || r.listing_model || r.model || (r.raw_record && (r.raw_record.ocd_model_name || r.raw_record.listing_model || r.raw_record.model)) || "?");
      const dist = recs => { const m = {}; for (const r of recs) { const k = modelField(r); m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15); };
      // Which model-field key is actually populated on each pool's records?
      const keyPresence = recs => { const c = { ocd_model_name: 0, listing_model: 0, model: 0, none: 0 }; for (const r of recs) { if (r.ocd_model_name) c.ocd_model_name++; else if (r.listing_model) c.listing_model++; else if (r.model) c.model++; else c.none++; } return c; };
      // Run the SAME analysis both pools drive live, so the landed rung is comparable.
      const runLadder = recs => {
        const cls = recs.map(r => classifyRecord(r, vehicle));
        const a = analyze(recs, cls, buildLadder(vehicle, generation), vehicle, false);
        return { evidenceSales: a.evidenceSales, landed: a.ladder?.landed ? { key: a.ladder.landed.key, sales: a.ladder.landed.sales, thresholdMet: a.ladder.landed.thresholdMet } : null, walk: (a.ladder?.rungs || []).map(x => ({ key: x.key, sales: x.sales, met: x.met })) };
      };
      // For the freshOnly records: their model field, and a DIRECT DB existence
      // probe by source_record_id, to tell a PERSIST gap (not in DB) from a QUERY
      // gap (in DB but the store read didn't match it).
      const foSample = freshOnly.slice(0, 8).map(r => ({ model: modelField(r), platform: recordPlatform(r), id: String(sourceRecordId(r)), date: r.auction_end_date || null }));
      for (const s of foSample) {
        try {
          const hit = await supabaseSelect({ supabaseUrl, supabaseKey }, `vehicle_market_records?source_record_id=eq.${encodeURIComponent(s.id)}&select=make,model&limit=1`);
          s.inDb = Array.isArray(hit) && hit.length > 0;
          s.dbModel = s.inDb ? (hit[0].model || null) : null;
        } catch (e) { s.inDb = "probe_err"; }
      }
      return res.status(200).json({
        status: "pool_diag",
        freshSourceDist: (() => { const m = {}; for (const r of freshRecs) { const s = recordPlatform(r); m[s] = (m[s] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); })(),
        vehicle: { make: vehicle.make, model: vehicle.model, year: vehicle.year, trim: vehicle.trim || null },
        maxWindowDays: days(Math.max(...ANALYSIS_WINDOWS_DAYS, ...SELLER_ACTIVITY_WINDOWS_DAYS)),
        freshOnlySample: foSample,
        freshOnlyModelDist: dist(freshOnly),
        fresh: { total: freshRecs.length, inWindow180: freshRecs.filter(inWin).length, metered: fresh.meteredRequests, modelKeyPresence: keyPresence(freshRecs), modelDist: dist(freshRecs), analysis: runLadder(freshRecs) },
        store: { total: storeRecs.length, inWindow180: storeRecs.filter(inWin).length, modelKeyPresence: keyPresence(storeRecs), modelDist: dist(storeRecs), analysis: runLadder(storeRecs) },
        gap: {
          freshOnlyCount: freshOnly.length,
          freshOnlyInWindow180: freshOnly.filter(inWin).length,
          storeOnlyCount: storeOnly.length
        }
      });
    }

    // Cache-hit ratio (Sep 2026): how often real /sell searches serve from the
    // store vs a fresh metered fetch. Reads logged seller_decision events; no writes.
    if (req.body?.cacheStats) {
      const rows = await supabaseSelect({ supabaseUrl, supabaseKey }, `app_usage_events?event_type=eq.seller_decision&select=metadata,created_at&order=created_at.desc&limit=3000`);
      const tally = {}; let total = 0; let hitLike = 0;
      for (const r of (rows || [])) {
        const c = String(r.metadata?.marketFetchCache || "unknown");
        tally[c] = (tally[c] || 0) + 1; total++;
        if (/^hit|refine_store|store$/.test(c)) hitLike++;
      }
      return res.status(200).json({
        status: "cache_stats",
        totalSellerDecisions: total,
        cacheHitRatePct: total ? Math.round((hitLike / total) * 1000) / 10 : null,
        byStatus: Object.entries(tally).sort((a, b) => b[1] - a[1]),
        oldest: (rows || []).slice(-1)[0]?.created_at || null,
        newest: (rows || [])[0]?.created_at || null
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
      anonFirstFree = !!gate.anonResult;
      anonSessionId = gate.anonSessionId || null;
      searchQuota = gate.quota || null;
      searchDaily = gate.daily || null;
      crewBypass = !!gate.crewBypass;
      testerBypass = !!gate.testerBypass;
      onceBypass = !!gate.onceBypass;
    }
    // F: coarse tier for the dashboard (forward-only). internal jobs -> "internal".
    const searchTier = internalCall ? "internal" : crewBypass ? "crew" : testerBypass ? "tester" : onceBypass ? "once" : (searchQuota?.tier || (searchAccountId ? "free" : "anon"));

    // Defect 5: an active transmission refinement re-slices the SAME pool the
    // seller already paid for (rerun-class, gate-skipped above). It must never
    // spend a metered request, so it always serves from the store, and it filters
    // the pool to one transmission before classification so the whole decision
    // (pick, median, confidence) reflects the narrowed set.
    const rawTxRefine = (req.body?.refine && req.body.refine.tx) || (car && car.refine && car.refine.tx) || null;
    const activeTxRefine = rawTxRefine === "manual" ? "manual" : rawTxRefine === "auto" ? "auto" : null;

    let fetchResult = null;
    let cacheStatus = "miss";
    // bypassCache forces a fresh fetch (used by cold-fetch measurement harnesses).
    // The budget guards below still gate any metered spend.
    // Defect 5: a transmission refinement re-slices the pool. The store pool is
    // materially thinner than a fresh ladder fetch, and the split gate fires on
    // the (rich) pool THIS result was built on, so a refine must rebuild that same
    // rich pool to stay coherent with the offer, not serve the thin store. It is
    // rerun-class (no new search credit), user-gated behind a genuine 5+/5+ split,
    // and still bounded by the daily/monthly OCD budget guards below.
    const bypassCache = req.body?.bypassCache === true || !!activeTxRefine;
    // A measurement run (bypassCache, credential only) is the one caller exempt from the daily circuit
    // breaker below; a transmission refinement is not (it was, and could spend past the day's budget).
    const measuring = req.body?.bypassCache === true;
    // CACHE FIRST, ONE RULE FOR EVERYONE (open-search policy, Sam Oct 9 2026): a cache hit is served from
    // the store; on a miss anyone, signed in or not, may trigger the one metered fetch while the global
    // daily budget lasts (the breaker below), then everyone is served stored records. Sign in never
    // changes the answer. Only a credentialed measurement sits outside the daily budget; crew stays inside
    // it (the crew cookie is a plain value anyone could set, so it must never unlock spend).
    if (!bypassCache && await readMarketFetchCache(vehicle, supabaseUrl, supabaseKey)) {
      fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
      cacheStatus = fetchResult ? "hit" : "hit_store_empty_refetched";
    }
    // Item 3: internal archive-only flag (NEVER set by the frontend). The engineCheck harness and any
    // other zero-OCD proof sets archiveOnly:true so the real /sell engine runs end-to-end on the
    // permanent store/archive instead of a live OCD fetch, guaranteeing zero metered requests. It
    // short-circuits BEFORE the budget guard and the live fetch below, so no OCD call is ever made.
    // The shared pick (SELL_PICK_SHARED, lib/platformPick.js buildSharedAnalysis over runOneBox's pool)
    // builds the whole online analysis from the archive, so the old OldCarsData ladder fetch feeds
    // nothing it uses: read the store instead (zero metered requests), keeping every downstream field.
    // A seller who chose "through an auction house" keeps the old path, which still reads the fetch.
    const sellerChoseHouse = sellerCriteria.sellerPreference === "auction_house" || /auction house/i.test(String(sellerCriteria.involvement || ""));
    const sellPickSharedOn = process.env.SELL_PICK_SHARED === "1" && !sellerChoseHouse;
    const sharedStoreOnly = sellPickSharedOn && !measuring;
    const archiveOnly = req.body?.archiveOnly === true || sharedStoreOnly;
    if (!fetchResult && archiveOnly) {
      const tag = req.body?.archiveOnly === true ? "archive_only" : "shared_pick";
      fetchResult = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
      if (fetchResult) {
        fetchResult.stopReason = tag;
        cacheStatus = tag + "_store";
      } else {
        fetchResult = { records: [], passSummary: [], stoppedEarly: true, stopReason: tag + "_empty", elapsedMs: 0, timeBudgetMs: FETCH_TIME_BUDGET_MS, meteredRequests: 0, ladder: buildLadder(vehicle, generation), fromCache: true };
        cacheStatus = tag === "archive_only" ? "archive_only" : "shared_pick_empty";
      }
    }
    // Budget guards (7A): daily pace + monthly cap, read from app_usage_events.
    let usedMonthBefore = null;
    // Item 4: when the meter is blind, fail CLOSED to a small floor instead of spending unguarded.
    const BLIND_METER_FLOOR = 5;
    let meterBlind = false;
    // Item 2: the daily budget must be a real CEILING, not just a start-of-search pre-check. The
    // remaining daily allowance is carried OUT of the guard block and passed as a hard per-search
    // metered cap to the live fetch, so one search (ladder + keyword fallbacks) can't blow the day's
    // budget after passing the gate, and sequential searches can't cumulatively overshoot it. The old
    // gate compared only ALREADY-RECORDED usage, which lags in-flight spend and had no per-search
    // bound, so a 33/day cap still recorded 70-76 on a busy day.
    let perSearchMeteredCap = Infinity;
    if (!fetchResult) {
      const usedToday = await ocdRequestsToday(supabaseUrl, supabaseKey);
      const usedMonth = await ocdRequestsThisMonth(supabaseUrl, supabaseKey);
      usedMonthBefore = usedMonth;
      // 7A.1: a null count means the meter is BLIND (app_usage_events unreadable). Raise a loud
      // critical condition, record it best-effort, and FAIL CLOSED: this request may spend at most
      // BLIND_METER_FLOOR metered calls (enforced via fetchRecentRecords maxMetered below), instead of
      // the old fail-open "spend with no guard" that let a DB outage burn the quota.
      if (usedToday === null || usedMonth === null) {
        meterBlind = true;
        console.error(`CRITICAL: OCD budget meter is BLIND (app_usage_events unreadable). Failing CLOSED to a ${BLIND_METER_FLOOR}-request floor for this search - run docs/supabase-v1-schema.sql.`);
        await recordUsageEvent({
          event_type: "ocd_budget_meter_blind", route: "/api/sellerDecision", status: "critical",
          search_text: rawSearch, oldcarsdata_metered_requests: 0, duration_ms: 0,
          metadata: { ...requestMetadata(req), usedToday, usedMonth, blindFloor: BLIND_METER_FLOOR }
        }, supabaseUrl, supabaseKey);
      }
      // 7E: the nightly warm runs against a RESERVED fraction of the budget so a
      // real seller SEARCH always outranks it. A warm request degrades once the
      // day/month reaches WARM_BUDGET_FRACTION of the cap, leaving headroom for
      // searches; an organic search uses the full cap.
      const isWarm = req.body?.warm === true;
      const dailyCap = isWarm ? Math.floor(OCD_DAILY_REQUEST_BUDGET * WARM_BUDGET_FRACTION) : OCD_DAILY_REQUEST_BUDGET;
      const monthlyCap = isWarm ? Math.floor(OCD_MONTHLY_BUDGET * WARM_BUDGET_FRACTION) : OCD_MONTHLY_BUDGET;
      // Item 2: cap this search's live spend to whatever remains of the daily budget. bypassCache
      // (measurement) is exempt and keeps spending freely; the degrade branch below already serves the
      // store once usedToday has reached the cap, so a search that still proceeds has at least 1 left.
      if (!measuring && usedToday !== null) perSearchMeteredCap = Math.max(0, dailyCap - usedToday);
      // OCD's OWN remaining-quota header (persisted by the previous fetch) is the AUTHORITATIVE
      // monthly meter. Read it FIRST so both the monthly cap and the warm reserve reconcile against
      // OCD's real account usage, NOT the internal app_usage_events sum (which conflates one-time
      // bulk ops with recurring spend and read ~4.6x high: 7929 vs OCD's real 1710, phantom-
      // throttling warm). Trust the header only while fresh + pre-reset so a stale zero from before
      // a quota reset cannot pin us degraded forever; the TTL lapse fires a real fetch that refreshes
      // it and self-corrects. It also remains the near-zero 429 backstop (overOcdRemaining).
      const ocdRL = await readOcdRateLimit(supabaseUrl, supabaseKey);
      const rlFloor = await appConfigInt("ocd_rate_limit_floor", 5, supabaseUrl, supabaseKey);
      const rlTtlMs = (await appConfigInt("ocd_rate_limit_ttl_min", 120, supabaseUrl, supabaseKey)) * 60 * 1000;
      const rlFresh = ocdRL && ocdRL.at && (Date.now() - ocdRL.at) < rlTtlMs;
      const resetMs = rlFresh ? parseOcdResetMs(ocdRL.reset, ocdRL.at) : null;
      const resetPassed = resetMs !== null && Date.now() >= resetMs;
      const ocdRemaining = (rlFresh && !resetPassed) ? ocdRL.remaining : null;
      const overOcdRemaining = ocdRemaining !== null && ocdRemaining <= rlFloor;
      // Monthly usage = OCD-header authoritative (budget minus OCD's real remaining) when fresh,
      // else the internal reader-facing sum (now seller_decision-only) as fallback. usedToday
      // stays the self-imposed daily PACE cap, also reader-facing-only after the ocdMeteredSince fix.
      const monthlyUsedAuthoritative = ocdRemaining !== null ? Math.max(0, OCD_MONTHLY_BUDGET - ocdRemaining) : null;
      const monthlyUsedEffective = monthlyUsedAuthoritative !== null ? monthlyUsedAuthoritative : usedMonth;
      const monthlySource = monthlyUsedAuthoritative !== null ? "ocd_header" : "internal_seller_decision";
      const overDaily = usedToday !== null && usedToday >= dailyCap;
      const overMonthly = monthlyUsedEffective !== null && monthlyUsedEffective >= monthlyCap;
      // Item 1 (ingest priority): the reader /sell path stops spending OCD once monthly remaining is
      // below OCD_SELL_MONTHLY_RESERVE, degrading to the archive/store path. Nightly warm is exempt
      // (it has its own WARM_BUDGET_FRACTION reserve and keeps the _ocd.js 100 floor). Remaining is
      // OCD's authoritative header when fresh, else budget minus the internal reader-facing sum.
      const monthlyRemainingEffective = monthlyUsedEffective !== null ? Math.max(0, OCD_MONTHLY_BUDGET - monthlyUsedEffective) : null;
      const overSellReserve = !isWarm && monthlyRemainingEffective !== null && monthlyRemainingEffective < OCD_SELL_MONTHLY_RESERVE;
      // bypassCache is the measurement path (frontend never sets it): it still
      // spends and logs real metered calls, but skips the soft-degrade so a
      // cold-fetch measurement is not silently served from the store when the
      // day's organic budget is already spent. Organic traffic stays fully guarded.
      if (!measuring && (overDaily || overMonthly || overOcdRemaining || overSellReserve)) {
        // Loud log, soft degrade: no metered spend past the reached cap.
        const scope = overOcdRemaining ? "ocd_remaining" : overSellReserve ? "sell_monthly_reserve" : overMonthly ? "monthly" : "daily";
        console.error(`OCD budget guard [${scope}] (day ${usedToday}/${OCD_DAILY_REQUEST_BUDGET}, month ${monthlyUsedEffective}/${OCD_MONTHLY_BUDGET} via ${monthlySource}, ocd_remaining ${ocdRemaining}): soft degrading, no metered spend.`);
        await recordUsageEvent({
          event_type: "ocd_budget_guard", route: "/api/sellerDecision", status: `soft_degraded_${scope}`,
          search_text: rawSearch, oldcarsdata_metered_requests: 0, duration_ms: 0,
          metadata: { ...requestMetadata(req), usedToday, usedMonth, monthlyUsedEffective, monthlyRemainingEffective, monthlySource, dailyBudget: OCD_DAILY_REQUEST_BUDGET, monthlyBudget: OCD_MONTHLY_BUDGET, sellMonthlyReserve: OCD_SELL_MONTHLY_RESERVE, scope, ocdRemaining, ocdRemainingAt: ocdRL ? ocdRL.at : null, ocdRemainingFloor: rlFloor }
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
      fetchResult = await fetchRecentRecords(vehicle, apiKey, generation, meterBlind ? BLIND_METER_FLOOR : perSearchMeteredCap);
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
    // Before bailing, check the ARCHIVE (Engine A, the same read One Box uses). A pre-war or
    // OCD-uncovered car (a 1902 Pierce Motorette) fails the OCD fetch but HAS real sales in
    // sales_archive; One Box reads them fine. If the archive has the car, DON'T return
    // data_unavailable - fall through to the thin/class-era archive block below, so /sell shows
    // the same read One Box shows instead of "I couldn't pull the full picture" (Step 2).
    let archiveHasCar = false;
    if (dataUnavailable && vehicle && vehicle.make) {
      try { const _t = await assessThinForVehicle(vehicle, generation, { supabaseUrl, supabaseKey }); archiveHasCar = !!(_t && _t.totalN > 0); } catch (e) { archiveHasCar = false; }
    }
    if (dataUnavailable && !archiveHasCar) {
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

    // Depth unification (Sep 2026): a metered fresh fetch is SHALLOW - it pulls only
    // what its year-targeted passes + early stop happen to reach, which is often too
    // few generation-specific comps to meet the generation rung, so the ladder
    // OVER-WIDENS to "all years" (a 2008 M3 landing on all M3s 1988-2023). A cache
    // hit reads the full archive and lands the correct, more specific rung. Same car,
    // different answer depending on invisible cache state. To make BOTH paths land the
    // same rung, analyze over the UNION of the fresh fetch and the stored archive:
    // fresh contributes brand-new + chassis-code-filed sales, the store contributes
    // depth. Cache hits already read the store, so they are unchanged. Persistence
    // above stays on the fresh records only. Best-effort: a store read failure leaves
    // the fresh pool exactly as it was.
    let analysisRecords = records, analysisClassifications = classifications;
    if (!fetchResult.fromCache) {
      try {
        const deep = await fetchRecordsFromStore(vehicle, supabaseUrl, supabaseKey, generation);
        if (deep && Array.isArray(deep.records) && deep.records.length) {
          const seen = new Set(records.map(r => sourceRecordKey(recordPlatform(r), sourceRecordId(r))));
          const merged = records.slice();
          for (const r of deep.records) {
            const k = sourceRecordKey(recordPlatform(r), sourceRecordId(r));
            if (seen.has(k)) continue;
            seen.add(k); merged.push(r);
          }
          if (merged.length > records.length) {
            analysisRecords = merged;
            analysisClassifications = merged.map(r => classifyRecord(r, vehicle));
          }
        }
      } catch { /* keep the fresh pool as-is */ }
    }
    // SELL_PICK_SHARED, FULL CUTOVER (off by default - Sam must approve before this changes what live
    // /sell shows): with the flag on, the `analysis` object feeding decide() below is built ENTIRELY
    // from the shared archive pool (lib/platformPick.js buildSharedAnalysis) instead of this capped
    // fetch's records/classifications - decide() itself is untouched, so every gate it already runs
    // (route policy/region/evidenceCapable, win-conditions, thin-window-price override, premium/
    // specialist/depth) behaves identically, just fed different numbers. Scoped to the online pick
    // ONLY (item 4): an explicit "through an auction house" choice is left completely alone - the old
    // house-comparison path elsewhere in this handler (thin/class-era/rare-car) keeps deciding it,
    // unchanged, and buildSharedAnalysis is not even called in that case (no wasted fetch).
    // NEVER MIX: when the flag is on and the shared pool has nothing at all (a car the shared engine
    // has not seen sell), this feeds decide() the same honest "zero evidence" shape it already
    // renders cleanly (the regional-policy floor / "has not seen this car sell yet" wording, item 3) -
    // it does NOT fall back to the capped-fetch analysis, which would silently mix a capped number
    // into an otherwise shared-pool page. A genuine error building the shared analysis degrades the
    // same honest way (logged loudly, never a half-filled page).
    // sellerChoseHouse / sellPickSharedOn are set above, before the fetch (the shared pick reads the store).
    let analysis = null;
    if (sellPickSharedOn) {
      try {
        analysis = await buildSharedAnalysis(vehicle, generation, { supabaseUrl, supabaseKey }, sellerCriteria);
      } catch (e) { console.error("SELL_PICK_SHARED buildSharedAnalysis failed (rendering the honest zero-evidence state, never the capped fetch):", e && e.message); }
      if (!analysis) {
        analysis = {
          evidenceSales: 0, estimatedValue: null, thinMarket: true,
          ladder: { landed: null, rungs: [], policyFloorRung: 1 },
          platformPerformance: [], sellerActivity: null, historicalWeekday: null, transmissionSplit: null,
          windowDays: null, evidenceLabel: "no comparable sales in tracked auction data", sourcedFromSharedPool: true
        };
      }
    } else {
      analysis = analyze(analysisRecords, analysisClassifications, fetchResult.ladder, vehicle, req.body?.debug === true, activeTxRefine);
    }

    // Sell-through removed (1b): our search-path records are sold-only, so a
    // sold/listed rate cannot be computed. The old segmentSellThrough was the
    // tracked partner's coverage rate for a platform+price-band across all
    // makes, mislabeled as the car's segment rate. No sell-through renders.

    const decision = decide(analysis, sellerCriteria, vehicle);
    decision.partnerReferral = await evaluatePartnerReferral(analysis, sellerCriteria, vehicle, supabaseUrl, supabaseKey);

    // Reserve INSIGHT (item 2b): a fair reserve-vs-no-reserve read scoped to the exact model+trim+year
    // (generation fallback with unsold reserve-not-met counted at high bid), replacing the old
    // make+price-band cell for the tile. Archive-only, zero OldCarsData. Attached to the routable routes'
    // marketEvidence so the pick card can render it with a count; too thin -> ok:false, tile hidden.
    try {
      if (vehicle && vehicle.make && vehicle.model) {
        const ri = await reserveInsightForVehicle(vehicle, generation, { supabaseUrl, supabaseKey });
        if (ri && ri.ok && decision.routeFit && Array.isArray(decision.routeFit.routes)) {
          for (const route of decision.routeFit.routes) { if (route.routable && route.marketEvidence) route.marketEvidence.reserveInsight = ri; }
        }
        // Reserve-car DAY (item 2): weekend-vs-midweek SELL-THROUGH for reserve cars (sold vs
        // reserve-not-met on BaT), replacing the wrong price-median best-day tile. Archive-only.
        const rd = await reserveDayInsightForVehicle(vehicle, generation, { supabaseUrl, supabaseKey });
        // Attach regardless of ok (the frontend gates on rd.ok); a gate-failed object still carries the
        // bucket counts, useful as telemetry and for verification. The tile hides when !ok.
        if (rd && decision.routeFit && Array.isArray(decision.routeFit.routes)) {
          for (const route of decision.routeFit.routes) { if (route.routable && route.marketEvidence) route.marketEvidence.reserveDay = rd; }
        }
        // Matched-premium THIN FALLBACK count (item 1 fix): the bounded sell-flow evidence pool
        // undercounts a venue's sales (limit-1000, ladder/evidence-filtered, and it forced exact-year
        // even for a generation-scoped read). When matched is too thin, replace the count + recency with
        // an ACCURATE sales_archive count scoped to the SAME label the reason shows (exact year vs
        // generation range). Archive-only, zero OldCarsData. Cached per platform+scope to avoid repeats.
        if (decision.routeFit && Array.isArray(decision.routeFit.routes)) {
          const vsCache = new Map();
          for (const route of decision.routeFit.routes) {
            const mp = route.routable && route.marketEvidence && route.marketEvidence.matchedPremium;
            if (!mp || !mp.tooThin || !route.platform) continue;
            const yearScope = mp.scope || "exact_year";
            // Item 2: a trim-scoped range gets a trim-scoped count (29 Carrera S), not the year-only pool.
            const trimForCount = (mp.trimScoped && mp.trim) ? mp.trim : null;
            const cacheKey = `${route.platform}|${yearScope}|${trimForCount || ""}`;
            let vs = vsCache.get(cacheKey);
            if (!vs) { vs = await venueScopedSalesForVehicle(vehicle, generation, route.platform, yearScope, { supabaseUrl, supabaseKey, trim: trimForCount }); vsCache.set(cacheKey, vs); }
            if (vs && vs.count > 0) { mp.platformSales = vs.count; mp.recencyDate = vs.recencyDate || mp.recencyDate; mp.countSource = "archive"; }
          }
        }
      }
    } catch (e) { /* reserve insights are additive; never block the decision */ }
    // Comp price band (item 4b, Oct 2026 - ONE RANGE decision: pointed at runOneBox's own cluster,
    // not the separate priceBandForVehicle implementation). The result can state the asking-price
    // fact ("your $122,000 ask is above every sale shown") wherever the v2 card shows a premium but
    // no absolute prices - but that fact must be THE SAME range Market Check shows for this exact
    // car, from the SAME call (same resolver output, fences, gates, window), never a second,
    // separately-scoped archive read. No cluster (thin) -> no priceBand at all, never a fabricated
    // or widened number - js/result-v2.js's v2AskingLine already goes quiet on a missing band.
    // Archive-only, zero OldCarsData (runOneBox never calls OCD).
    try {
      if (vehicle && vehicle.make && vehicle.model) {
        const pbSearchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
        const pbResult = await runOneBox(vehicle, generation, pbSearchText, { supabaseUrl, supabaseKey, asked: 2 }, null).catch(() => null);
        if (pbResult && Array.isArray(pbResult.cluster)) {
          decision.priceBand = { low: pbResult.cluster[0], high: pbResult.cluster[1], count: pbResult.poolN ?? null };
        }
        // The closest sales (Oct 2026, follow-up chat): Market Check's own sale cards from this SAME runOneBox
        // call (closest first), never a new query. The follow-up chat may name only these.
        if (pbResult && Array.isArray(pbResult.cards) && pbResult.cards.length) {
          decision.closestSales = pbResult.cards.slice(0, FOLLOWUP_SALES).map(c => ({ date: c.date || null, price: Number(c.price) || null, platform: c.platform || null, miles: Number.isFinite(Number(c.mi)) ? Number(c.mi) : null, title: c.title || null })).filter(c => c.price && c.date);
        }
      }
    } catch (e) { /* additive */ }

    // THIN MODE + HOUSE STEER (Sep 2026): when the online market over 36 months is too thin for a
    // volume band, /sell renders the same sale-anchored thin read as One Box. assessThinForVehicle
    // reads the ARCHIVE only - ZERO extra OldCarsData. The HOUSE STEER (house share >= 2/3) routes
    // the practical step to a consigns_to_houses partner; with none seeded it stands WITHOUT a door
    // (names the houses evidence-ordered, explains consignment, never implies a placement partner).
    // THIN and CLASS-ERA are computed in SEPARATE try/catch blocks so a failure in one never
    // silently swallows the other (the earlier single-try/catch was a suspect for the 450S class
    // dropping). thinEnv is asserted present so a missing env surfaces rather than reading as an
    // empty pool. A debug field records what each stage saw (stripped from the client render).
    const thinEnv = { supabaseUrl, supabaseKey };
    const ceDbg = { thinTotalN: null, thinIsThin: null, vehYear: vehicle && vehicle.year || null, ceCalled: false, ceReceipts: null, ceErr: null };
    let thin = null;
    try { thin = await assessThinForVehicle(vehicle, generation, thinEnv); ceDbg.thinTotalN = thin && thin.totalN; ceDbg.thinIsThin = thin && thin.isThin; }
    catch (e) { ceDbg.ceErr = "thin:" + String((e && e.message) || e).slice(0, 80); }
    // THIN-vs-CLASS-ERA threshold (aligned with One Box, Oct 2026). One Box shows the THIN state for
    // ANY real archive sales (1+); class-era is only for a genuinely EMPTY model pool. /sell now matches:
    // a car with real sales (a Ford Pinto with 4) gets the thin state showing those sales, never a
    // wider-make class-era range. The old MIN_PICK_SALES=5 floor routed 1-4-sale cars to class-era to
    // avoid a shaky venue PICK, but the thin render shows the RECORD, not a confident pick, so the floor
    // was retired here (it diverged from One Box; engineCheck flagged the Pinto).
    const thinReceiptN = (thin && Array.isArray(thin.receipts)) ? thin.receipts.length : 0;
    const setThinDecision = async () => {
      const houseVenues = [];
      for (const rc of thin.receipts) { if (rc.isHouse && !houseVenues.includes(rc.venue)) houseVenues.push(rc.venue); }
      decision.thin = {
        isThin: true, houseSteer: !!thin.houseSteer,
        onlineN: thin.onlineN, houseN: thin.houseN, onlineReceiptsN: thin.onlineReceiptsN, totalN: thin.totalN,
        medianHammer: thin.medianHammer, receipts: thin.receipts, intake: thin.intake || null,
        pairs: thin.pairs || [], pairsCount: thin.pairsCount || 0, pairPctEligible: !!thin.pairPctEligible,
        houseVenues
      };
      decision.thin.consignPartner = thin.houseSteer
        ? await findConsignsToHousesPartner(vehicle, sellerCriteria, supabaseUrl, supabaseKey)
        : null;
      const _tl = String((car && car.timeline) || ""); const asap = /\b(asap|rush|hurry|urgent|fast|quick|soon)\b|right away|this week/i.test(_tl) && !/\bno\s+(rush|hurry)\b/i.test(_tl);
      decision.thin.houseComparison = buildHouseComparison(thin.receipts, { todayISO: new Date().toISOString().slice(0, 10), asap });
    };
    if (thin && thin.isThin && thinReceiptN >= 1) {
      // Any real archive sales -> the thin STATE showing those sales (One Box parity). A sub-5-sale
      // pool shows the record, not a confident "sell here" pick, so it is honest without widening.
      try { await setThinDecision(); } catch { /* thin render facts are additive */ }
    } else if (vehicle && vehicle.year && vehicle.make && thin && (thin.totalN === 0 || !vehicle.model || vehicle.unverified)) {
      // Class-era fires only when Engine A (assessThinForVehicle) says the MODEL pool is genuinely thin
      // or empty - the same call One Box makes in runOneBox - OR the car is truly make-level (no model)
      // or an unverified model. A SKIPPED TRIM (car.acceptModelLevel) is NOT a reason to widen to the
      // wider-make era band: a 550 Maranello with the trim skipped still has ~100 model sales and must
      // read as its own model (Step 1). acceptModelLevel was removed as a trigger here.
      // NEVER widen past the model to the wider make market on an assessThin ERROR (thin===null): an
      // error is not evidence of "no sales of this model", and widening to the marque surfaced halos
      // (an Enzo, a Superamerica) as comps for a regular 550 Maranello. A thrown thin keeps the normal
      // decision the main ladder already produced; class-era only fires on a REAL zero-model-sales read.
      // CLASS-ERA rung: the exact model has not sold in three years (empty model pool), OR the model
      // could not be pinned (make-level "not sure" / unverified). Widen to the same marque within the
      // car's decade era band, body-class scoped from the typed text - a coarse honest fallback that
      // gives a real read (e.g. 1980s Dodge trucks) instead of a route pick with no sales behind it.
      // Archive-only, zero extra OldCarsData.
      try {
        ceDbg.ceCalled = true;
        const ce = await assessClassEraForVehicle(vehicle, generation, thinEnv);
        ceDbg.ceReceipts = ce && ce.receipts ? ce.receipts.length : (ce ? "no-receipts:" + JSON.stringify(ce).slice(0, 80) : "null");
        if (ce && ce.isClass && Array.isArray(ce.receipts) && ce.receipts.length) {
          decision.classEra = ce;
          // House-by-house over the ERA band (the render frames it as the wider market, not the car).
          const _tl = String((car && car.timeline) || ""); const asap = /\b(asap|rush|hurry|urgent|fast|quick|soon)\b|right away|this week/i.test(_tl) && !/\bno\s+(rush|hurry)\b/i.test(_tl);
          decision.classEra.houseComparison = buildHouseComparison(ce.receipts, { todayISO: new Date().toISOString().slice(0, 10), asap, eraBand: true });
        }
      } catch (e) { ceDbg.ceErr = "class:" + String((e && e.message) || e).slice(0, 120); }
      // Safety net: class-era produced nothing but thin DID have real sales -> render the thin state
      // (never an empty result). With the aligned threshold this is rare (any sales take the thin
      // branch above), but kept so a class-era miss still falls back to the real sales.
      if (!decision.classEra && thin && thin.isThin && thinReceiptN >= 1) { try { await setThinDecision(); } catch { } }
    }
    // DENSE-CAR HOUSE COMPARISON (Item A, Oct 2026): a seller who chose the auction-house door for a
    // car dense enough to reach the normal pick (no thin/class-era house block built) still deserves
    // the car's OWN house record when the model genuinely sells at the houses (the 550 Maranello: 30
    // in 36 months). Build decision.houseComparison from the model's own HOUSE receipts (halos aside).
    // The "these trade mostly online" / wider-market copy is reserved for a model with NO house sales.
    if (String((car && car.sellerPreference) || "") === "auction_house"
        && !(decision.thin && decision.thin.houseComparison) && !decision.classEra
        && vehicle && vehicle.make && vehicle.model) {
      try {
        const hr = await houseReceiptsForVehicle(vehicle, generation, thinEnv);
        if (req.body && req.body.debug === true) decision._houseDbg = { pref: car && car.sellerPreference, hr: hr ? { houseN: hr.houseN, onlineN: hr.onlineN, onlineReceiptsN: hr.onlineReceiptsN, totalN: hr.totalN } : null };
        if (hr && hr.houseN >= 1) {
          const _tl = String((car && car.timeline) || ""); const asap = /\b(asap|rush|hurry|urgent|fast|quick|soon)\b|right away|this week/i.test(_tl) && !/\bno\s+(rush|hurry)\b/i.test(_tl);
          const hc = buildHouseComparison(hr.houseReceipts, { todayISO: new Date().toISOString().slice(0, 10), asap });
          if (req.body && req.body.debug === true && decision._houseDbg) decision._houseDbg.built = !!(hc && hc.houses && hc.houses.length);
          // Use onlineReceiptsN (the true count), not the photo-gated onlineN, or a BaT sale missing
          // an image gets silently dropped from the by-venue total (houseN + onlineN < totalN).
          if (hc && hc.houses && hc.houses.length) { hc.noOnline = hr.onlineReceiptsN === 0; hc.onlineN = hr.onlineReceiptsN; decision.houseComparison = hc; }
        }
      } catch (e) { if (req.body && req.body.debug === true) decision._houseDbg = { err: String((e && e.message) || e).slice(0, 120) }; }
    }
    if (req.body && req.body.debug === true) decision._ceDebug = ceDbg;

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

    // Exact-VIN archive match (VIN feature, 4b/4c). Computed HERE, AFTER `decision`
    // is fully built, and attached to the response only. It is never passed into the
    // ladder, platform scoring, or any ranking function, so the recommendation is
    // byte-identical whether or not a VIN match exists (n=1 evidence, never ranking).
    // The prior sale's own record still counts once as an ordinary same-model comp, as
    // it always has; this surfacing adds zero ranking weight. Flag-gated + VIN-gated.
    let vinArchiveMatch = null;
    // A 17-char VIN OR an older-car chassis token both key the exact-match. The chassis
    // rides on the resolved vehicle when a chassis exact-match resolved the car upstream,
    // so a chassis-matched car gets the SAME prior-sale lead enrichment a VIN does.
    const exactId = vehicle?.vin || vehicle?.chassis || null;
    if (exactId && await vinFeatureActive(req.headers.cookie, { supabaseUrl, supabaseKey })) {
      vinArchiveMatch = await findVinArchiveMatch({ supabaseUrl, supabaseKey },
        { vin: exactId, make: vehicle.make, model: vehicle.model, year: vehicle.year });
    }

    // search event (Oct 2026, open-search policy Part 1.2): once per completed Sell decision, never
    // on a transmission-refinement rerun (activeTxRefine - a continuation of the same result, not a
    // new search). Resolved make|model key only, never the typed text or a VIN. No userId here either:
    // a signed-in account id isn't resolved in this branch (auth.userId, where it exists, belongs to
    // the follow-up chat gate, a different code path) - the visitor id alone is enough for the admin
    // join via visitor_links.
    if (vehicle && vehicle.make && !activeTxRefine) {
      logEvent({ supabaseUrl, supabaseKey }, { event: EVENTS.SEARCH, tool: "sell", visitorId: readVisitorId(req), props: { key: `${vehicle.make}|${vehicle.model || ""}` } }).catch(() => {});
    }
    const responsePayload = {
      status: "decision_ready",
      vehicle,
      vinArchiveMatch: vinArchiveMatch || undefined,
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
        transmissionSplit: analysis.transmissionSplit || null,
        transmissionRefine: activeTxRefine || null,
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
      // A signed-out result is kept for its visitor: signing in later attaches it to the account (claim on
      // sign in, js/auth.js gas_free_result). No marker cookie any more (open search).
      if (anonFirstFree) responsePayload.anonResult = true;
    }
    res.status(200).json(responsePayload);
    return;
  } catch (err) {
    // 2C: a server-side failure consumes nothing - refund the reservation (11b).
    if (reservationEventId) { try { await supabaseRpc("release_search", { p_event_id: reservationEventId }, supabaseUrl, supabaseKey); } catch (e) {} }
    return res.status(500).json({ error: err.message });
  }
}
