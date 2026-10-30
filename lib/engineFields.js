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
  "mileageNear",
  "matchedOption",
  "optionsRemainder",
  "chart",
  "headlineDimension",
  "headlineLines",
  "optionLines",
  "refineOptions",
  "optionsNote",
  "rangeFloor",
  "wideCause",
  "wideLever",
  "wideLine",
  "yearExcluded",
  "yearNote",
  "mileageBand",
  "windowLine",
  "countLine",
  "chartCaption",
  "trendHeld",
  "scope_reason",
  "scopeLine",
  "metaLine",
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
  "distSubLine", "latestQuarterLine",   // Oct 29 2026 (Lane B): the price-band heading and the latest-quarter line, engine sentences printed by the One Box page and its shared card
  "appliedFilters", "appliedLine",   // Oct 29 2026 (Lane B): which narrowing is on, the engine's words and order, and the refine that takes each off; the page prints the line and the clear control
  "trimFallbackLine",   // Oct 29 2026 (Lane B, Sam): "Too few Boxster Spyder sales for a range. Here is the Boxster market instead." when a typed trim with too few sales reads the model's market; null otherwise
  "updatedLine",   // Oct 29 2026 (Lane B): "Updated Oct 28, 2026." as its own field (the real last-ingest date), so a page can set it small on its own line; null when the date is not read
  "rangeSentence",   // Oct 29 2026 (Lane B, Sam): "Half of the 11 sales since November 2023 landed in this range. The rest ran from $139,000 to $355,500." on every answer that shows one range (never thin, refusal or an option block); lowest and highest are the pool's real sales
  "setAsideLine",   // Oct 29 2026 (Lane B): the set-aside footnote ("5 odd sales set aside."), printed by the shared card on every surface that draws it
  "salesHeading",   // Oct 29 2026 (Lane B): the sales table heading on Market Check ("All 35 comparable sales", or "Comparable sales" with no count when an option reaches past the window); no Sell, Find or email card prints it
  "answer_line", "count_line",   // Oct 29 2026 (Lane B): the keys of thin_sales (carried whole) that lib/onebox.js thinSalesOf and restateLines write; the scan reads them as answer fields, the answer has no such top-level field
  "wayOut",   // Oct 29 2026 (Lane B, lib/questionWayOut.js): the way out of a question (label, prefill, placeholder); a question is not a card, Market Check's identityQuestion carries it and no Sell, Find or email card prints it
  "nearPool",   // e98: the slim miles and prices of the pool; Find reads it through coreOf to place a listing's own mileage band (mileageNearOf), no page prints it
  "modelCheck", "txOwn",
  "_allin", "_hammer", "_usd", "answerType", "asideCards", "attr", "baseScopeEmpty", "basisPool", "best_day", "bodyOptions", "bodyScoped", "bodyUnspecified",
  "cached", "chipFallback", "contextRoles", "counts", "currency", "dedup", "didNotSellCount", "didNotSellCountN", "didNotSellRows", "direction", "distribution",
  "divergence", "driver", "driverDiag", "driverSentence", "earned", "exactSale", "exactYearLine", "exactYearPool", "factsBlock", "fallbackRung",
  "familyCoverageNote", "freshness", "gearboxApplies", "genYears", "halfGeneration", "high", "highestSaleN", "houseLed", "htMeta", "identityQuestion",
  "inlineSplits", "kase", "ladderStep", "latestSaleDate", "liveScope", "low", "lowestSaleN", "mileage", "mileageFallback", "mileageNotNarrowed",
  "nearestInMiles", "newestSale", "noCluster", "observeAside", "observeOffer", "olderOutside", "oldestIncludedSaleDate", "optionCounts", "ownSales", "percent",
  "platforms", "platformsCount", "poolMedianMileage", "poolSize", "poolTrim", "poolYears", "prompt", "quarterlyBands", "queryMileage", "questionChecked",
  "questionDropped", "questionResolved", "questionRulesTag", "rangeTier", "rawPool", "raw_title", "reasonFlag", "recent3", "referenceFigure", "referenceFigureReason", "refined",
  "refusal", "reserve_split", "resolvedCar", "resolvedSpec", "rowsNotShownCount", "samsTake", "samsTakeSkipReason",
  "sentence", "setAsideCountN", "setAsideLabels", "setAsideRows", "setAsideTags", "sharedFlight", "siblingName", "singlePlatform", "snapshotId",
  "soldCount", "soldCountN", "span", "spanOnly", "status", "strip", "subjectMileage", "taggedCards", "thin_sales", "timings", "topPlatform", "transmission",
  "trimChips", "trimOptions", "trimQuestion", "variantAside", "variantAsides", "variantOptionsLine", "vehicle", "wideSpread", "widening", "windowLabel",
  "windowMonthsChosen", "windowStart", "windowWords", "yearWidened", "yoyDirection"
]);
