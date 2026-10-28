// THE ENGINE'S TOP LEVEL FIELDS, AND WHICH ONES THE SHARED CARD CARRIES (Oct 27 2026). Sell and Find hand the shared card (lib/sellsForCard.js) only the engine fields on ONE list,
// so a new engine field is never dropped silently by one of them and kept by the other: both read CARD_FIELDS from here. The 325i blank card, the thin card that missed and the
// pooled options that never reached the card were all one cause: a field on the engine's answer that a list did not know. scripts/engineFieldsCheck.mjs reads the engine's source
// (every field a builder adds to an answer) and the real answers in scripts/fixtures, and FAILS on any field that is on neither list below, so adding an engine field means saying,
// here, whether the card carries it. NOT_CARRIED is the baseline of Oct 27 2026: every field the engine adds today that the card does not read, acknowledged by name; the Market Check
// page reads the whole answer, and the rest are the engine's own working fields.
export const CARD_FIELDS = [
  "cluster",
  "poolN",
  "windowMonths",
  "bodyLine",
  "bodyLabel",
  "setAsideReasons",
  "setAsideCount",
  "readAt",
  "stale",
  "staleLine",
  "qualifyingTotal",
  "tier",
  "thinLine",
  "thinReason",
  "latestSaleLine",
  "samLine",
  "basisLine",
  "includesFromLine",
  "emailMode",
  "pooledApart",
  "pooledSplit",
  "options",
  "optionsState",
  "headlineDimension",
  "headlineLines",
  "optionLines",
  "refineOptions",
  "optionsNote",
  "rangeFloor",
  "wideCause",
  "wideLever",
  "wideLine",
  "trendHeld",
  "scope_reason",
  "rungLabel",
  "scopeLabel",
  "refusal_line",
  "windowNote",
  "windowLonger",
  "mileageNote"
];
// reshaped on the way in, never copied as they are
export const CARD_DERIVED = {
  "cards": "rebuilt row by row into the card's own sale rows",
  "trend": "reshaped into trendQuarters (period, low, high, count, thin)"
};
export const NOT_CARRIED = new Set([
  "modelCheck", "txOwn",
  "_allin", "_hammer", "_usd", "answerType", "asideCards", "attr", "baseScopeEmpty", "basisPool", "best_day", "bodyOptions", "bodyScoped", "bodyUnspecified",
  "cached", "chipFallback", "contextRoles", "counts", "currency", "dedup", "didNotSellCount", "didNotSellCountN", "didNotSellRows", "direction", "distribution",
  "divergence", "driver", "driverDiag", "driverSentence", "earned", "exactSale", "exactYearLine", "exactYearPool", "factsBlock", "fallbackRung",
  "familyCoverageNote", "freshness", "gearboxApplies", "genYears", "halfGeneration", "high", "highestSaleN", "houseLed", "htMeta", "identityQuestion",
  "inlineSplits", "kase", "ladderStep", "latestSaleDate", "liveScope", "low", "lowestSaleN", "mileage", "mileageFallback", "mileageNotNarrowed",
  "nearestInMiles", "newestSale", "noCluster", "observeAside", "observeOffer", "olderOutside", "oldestIncludedSaleDate", "optionCounts", "ownSales", "percent",
  "platforms", "platformsCount", "poolMedianMileage", "poolSize", "poolTrim", "poolYears", "prompt", "quarterlyBands", "queryMileage", "questionChecked",
  "questionDropped", "questionResolved", "rangeTier", "rawPool", "raw_title", "reasonFlag", "recent3", "referenceFigure", "referenceFigureReason", "refined",
  "refusal", "reserve_split", "resolvedCar", "resolvedSpec", "rowsNotShownCount", "samsTake", "samsTakeSkipReason",
  "sentence", "setAsideCountN", "setAsideLabels", "setAsideRows", "setAsideTags", "sharedFlight", "siblingName", "singlePlatform", "snapshotId",
  "soldCount", "soldCountN", "span", "spanOnly", "status", "strip", "subjectMileage", "taggedCards", "thin_sales", "timings", "topPlatform", "transmission",
  "trimChips", "trimOptions", "trimQuestion", "variantAside", "variantAsides", "variantOptionsLine", "vehicle", "wideSpread", "widening", "windowLabel",
  "windowMonthsChosen", "windowStart", "windowWords", "yearWidened", "yoyDirection"
]);
