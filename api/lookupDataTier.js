// api/lookupDataTier.js
//
// Session changes applied, in order:
// 1. hasModelDetail checks word count, not character length, so a bare
//    model name alone ("911") correctly triggers needs_clarification.
// 2. determineDataTier only confirms an exact-trim match against the trim
//    the user actually requested, never any confident match anywhere in
//    the batch.
// 3. "Carrera T" added to taxonomy, ordered before plain "Carrera".
// 4. saveRawRecords() persists every fetched record to vehicle_market_records
//    permanently, before any tier/recommendation logic runs.
// 5. saveVehicleIntelligence() persists every classification to
//    vehicle_intelligence, keyed back to its market_record_id.
// 6. fetchRecentRecords() replaces the old single-page, no-recency fetch.
//    It fetches up to a safety cap of pages, then filters the FULL combined
//    set by real auction_end_date afterward -- it does NOT trust
//    OldCarsData's sort=date to mean "stop early once we see one old
//    record," because that sort does not reliably keep auction_end_date in
//    strict order page-to-page.
// 7. determineDataTier returns structured facts (exactTrimSales, windowDays,
//    minimumEvidenceRequired, thin, analysisDate) instead of constructed
//    prose sentences -- presentation belongs in the UI/Sam layer, not here.

const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";
const CACHE_REFRESH_HOURS = 24;
const RECENT_WINDOWS_DAYS = [45, 90]; // config, not magic numbers buried in logic

const TRIM_TAXONOMY = {
  "Porsche|911": [
    "GT3 RS", "GT2 RS",
    "GT3 Cup",
    "GT3 Touring",
    "GT3", "GT2",
    "Turbo S Exclusive Series",
    "Turbo S", "Turbo",
    "Carrera S Club Coupe",
    "Carrera 4 GTS",
    "Targa 4 GTS",
    "Carrera GTS",
    "Carrera 4S", "Carrera S", "Carrera 4",
    "Carrera T",
    "Carrera",
    "Targa 4S", "Targa 4", "Targa",
    "Speedster Heritage Design",
    "Speedster",
    "Sport Classic",
    "Dakar"
  ]
};

function getTaxonomyKey(make, model) {
  return `${make}|${model}`;
}

function findTrimIn(text, trimList) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const trim of trimList) {
    if (lower.includes(trim.toLowerCase())) return trim;
  }
  return null;
}

function daysAgo(dateString) {
  if (!dateString) return Infinity; // no date = treat as unknown/stale, never counts as "recent"
  const then = new Date(dateString).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function classifyTrim(record) {
  const make = record.ocd_make_name || record.listing_make;
  const model = record.ocd_model_name || record.listing_model;
  const key = getTaxonomyKey(make, model);
  const trimList = TRIM_TAXONOMY[key];

  const base = {
    raw_title: record.title || null,
    raw_listing_model: record.listing_model || null,
    raw_description: record.description || null,
    normalized_make: make || null,
    normalized_model: model || null,
    normalized_generation: null
  };

  if (!trimList) {
    return { ...base, normalized_trim: null, classification_source: null, matched_terms: [], classification_confidence: "unknown", needs_review: true };
  }

  let trim = findTrimIn(record.title, trimList);
  if (trim) return { ...base, normalized_trim: trim, classification_source: "title", matched_terms: [trim], classification_confidence: "high", needs_review: false };

  trim = findTrimIn(record.listing_model, trimList);
  if (trim) return { ...base, normalized_trim: trim, classification_source: "listing_model", matched_terms: [trim], classification_confidence: "medium", needs_review: false };

  trim = findTrimIn(record.description, trimList);
  if (trim) return { ...base, normalized_trim: trim, classification_source: "description", matched_terms: [trim], classification_confidence: "low", needs_review: true };

  return { ...base, normalized_trim: null, classification_source: null, matched_terms: [], classification_confidence: "unknown", needs_review: true };
}

function resolveCar(searchContext) {
  const text = (searchContext.userInput || "").trim();
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  const KNOWN_MAKES = ["porsche", "bmw", "ruf", "audi", "ferrari", "mercedes", "toyota", "nissan", "dodge"];
  const lower = text.toLowerCase();
  const make = KNOWN_MAKES.find(m => lower.includes(m)) || null;

  let remainder = text;
  if (yearMatch) remainder = remainder.replace(yearMatch[0], "");
  if (make) remainder = remainder.replace(new RegExp(make, "i"), "");
  remainder = remainder.trim();

  const parsed = { raw: text, year, make: make ? make[0].toUpperCase() + make.slice(1) : null, modelGuess: remainder || null };

  const hasYear = !!parsed.year;
  // Word count, not character length. A bare model name alone ("911",
  // "M3") is exactly one word and is NOT specific.
  const modelWords = (parsed.modelGuess || "").trim().split(/\s+/).filter(Boolean);
  const hasModelDetail = modelWords.length >= 2;
  const contextFields = searchContext.contextFields || {};

  let specific = true;
  let clarification = null;

  if (contextFields.vin || contextFields.year) {
    specific = true;
  } else if (!hasYear && !hasModelDetail) {
    specific = false;
    clarification = {
      question: `Which ${parsed.make || "car"} are we talking about — what year, and any specific trim?`,
      missingFields: ["year", "generation", "trim"]
    };
  }

  if (!specific) {
    searchContext.status = "needs_clarification";
    searchContext.clarification = clarification;
    searchContext.normalizedCar = null;
    return searchContext;
  }

  if (!parsed.make) {
    searchContext.status = "unidentifiable";
    searchContext.clarification = null;
    searchContext.normalizedCar = null;
    return searchContext;
  }

  searchContext.status = "resolved";
  searchContext.clarification = null;
  searchContext.normalizedCar = parsed;
  return searchContext;
}

async function saveRawRecords(records, supabaseUrl, supabaseKey) {
  if (!records || records.length === 0) return;

  const rows = records.map(r => ({
    source: r.source || "unknown",
    source_record_id: String(r.id ?? r.source_record_id ?? r.listing_id),
    make: r.ocd_make_name || r.listing_make || null,
    model: r.ocd_model_name || r.listing_model || null,
    raw_title: r.title || null,
    raw_listing_model: r.listing_model || null,
    raw_description: r.description || null,
    price: r.price ?? null,
    auction_status: r.auction_status ?? null,
    auction_end_date: r.auction_end_date ?? null,
    seller_username: r.seller_username ?? null,
    year: r.year ?? null,
    raw_record: r,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: crypto.randomUUID()
  }));

  try {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/vehicle_market_records?on_conflict=source,source_record_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "resolution=ignore-duplicates"
      },
      body: JSON.stringify(rows)
    });

    const insertText = await insertRes.text();

    console.log("vehicle_market_records insert status:", insertRes.status);
    console.log("vehicle_market_records insert response:", insertText);

    if (!insertRes.ok) {
      throw new Error(`vehicle_market_records insert failed: ${insertRes.status} ${insertText}`);
    }
  } catch (err) {
    console.error("vehicle_market_records write failed:", err.message);
  }
}

async function saveVehicleIntelligence(rawRecords, classifiedRecords, supabaseUrl, supabaseKey) {
  if (!rawRecords || rawRecords.length === 0) return;

  const sourceRecordIds = rawRecords.map(r =>
    String(r.id ?? r.source_record_id ?? r.listing_id)
  );

  let idLookup = {};
  try {
    const idsParam = sourceRecordIds.map(id => `"${id}"`).join(",");
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/vehicle_market_records?source_record_id=in.(${idsParam})&select=id,source_record_id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (lookupRes.ok) {
      const rows = await lookupRes.json();
      idLookup = Object.fromEntries(rows.map(row => [row.source_record_id, row.id]));
    }
  } catch (err) {
    console.error("vehicle_intelligence: id lookup failed:", err.message);
    return;
  }

  const batchId = crypto.randomUUID();
  const rows = rawRecords
    .map((raw, i) => {
      const sourceRecordId = String(raw.id ?? raw.source_record_id ?? raw.listing_id);
      const marketRecordId = idLookup[sourceRecordId];
      if (!marketRecordId) return null;

      const classified = classifiedRecords[i];
      return {
        market_record_id: marketRecordId,
        normalized_make: classified.normalized_make,
        normalized_model: classified.normalized_model,
        normalized_generation: classified.normalized_generation,
        normalized_trim: classified.normalized_trim,
        classification_source: classified.classification_source,
        classification_confidence: classified.classification_confidence,
        needs_review: classified.needs_review,
        classified_at: new Date().toISOString(),
        classification_batch_id: batchId
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/vehicle_intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(rows)
    });
  } catch (err) {
    console.error("vehicle_intelligence write failed:", err.message);
  }
}

function buildCacheKey(parsed) {
  return [parsed.make, parsed.modelGuess, parsed.year].filter(Boolean).join("|").toLowerCase();
}

async function getCachedResult(cacheKey, supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/data_tier_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=result`;
  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length > 0 ? rows[0].result : null;
}

async function callOldCarsData(path, params, apiKey) {
  const url = new URL(`${OLDCARSDATA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`OldCarsData ${res.status}: ${body.message || "request failed"}`);
  }

  return res.json();
}

async function getRecencyThreshold(liquidityTier, windowDays, supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/recency_thresholds?liquidity_tier=eq.${liquidityTier}&window_days=eq.${windowDays}&select=min_records`;
  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length > 0 ? rows[0].min_records : null;
}

async function getLiquidityTier(make, modelGuess, supabaseUrl, supabaseKey) {
  const trimGuess = (modelGuess || "").trim();
  if (!trimGuess) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/taxonomy?make=eq.${encodeURIComponent(make)}&active=eq.true&select=trim,expected_liquidity,priority&order=priority.asc`;
    const res = await fetch(url, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const lower = trimGuess.toLowerCase();
    for (const row of rows) {
      if (lower.includes(row.trim.toLowerCase())) return row.expected_liquidity;
    }
    return null;
  } catch (err) {
    console.error("getLiquidityTier failed:", err.message);
    return null;
  }
}

/**
 * Fetches OldCarsData /auctions, sorted newest-first, up to a safety cap of
 * pages. Does NOT trust sort=date to mean it's safe to stop early the
 * moment one old record appears -- that assumption was tested and proven
 * wrong (auction_end_date is not reliably monotonic page-to-page). Instead,
 * it fetches every page up to the cap, then filters the FULL combined set
 * by real auction_end_date afterward.
 *
 * Every fetched-and-in-window record is saved permanently to
 * vehicle_market_records and vehicle_intelligence, regardless of whether
 * the recency threshold for a recommendation ends up being met. Recency
 * was only the reason we fetched it -- once fetched, it's permanent Layer 1
 * data, same as any other ingestion.
 */
async function fetchRecentRecords(parsed, liquidityTierOrNull, apiKey, supabaseUrl, supabaseKey) {
  const liquidityTier = liquidityTierOrNull || 'normal';
  const modelWords = (parsed.modelGuess || "").split(" ").filter(Boolean);
  const cleanModel = modelWords[0] || undefined;

  let allRecords = [];
  let page = 1;
  let pagesFetched = 0;
  const MAX_PAGES_SAFETY_CAP = 5; // budget guard -- early-stop is not reliable, so cap pages instead
  const MAX_WINDOW = Math.max(...RECENT_WINDOWS_DAYS);

  while (pagesFetched < MAX_PAGES_SAFETY_CAP) {
    const query = {
      make: parsed.make,
      model: cleanModel,
      keyword: parsed.modelGuess || undefined,
      status: "sold", // recency comps should be actual sales, not reserve-not-met/active listings
      sort: "date",
      direction: "desc",
      page,
      limit: 50
    };

    const apiResult = await callOldCarsData("/auctions", query, apiKey);
    const pageRecords = apiResult.data || [];
    pagesFetched++;

    if (pageRecords.length === 0) break;
    console.log("SAMPLE RECORD KEYS:", JSON.stringify(pageRecords[0]));
    allRecords.push(...pageRecords);

    const totalPages = apiResult.meta?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  // Filter to the widest window we care about BEFORE saving or evaluating
  // thresholds, so nothing far outside any recency window gets persisted
  // just because it happened to share a page with relevant records.
  const withinMaxWindow = allRecords.filter(r => daysAgo(r.auction_end_date) <= MAX_WINDOW);

  await saveRawRecords(withinMaxWindow, supabaseUrl, supabaseKey);
  const classified = withinMaxWindow.map(classifyTrim);
  await saveVehicleIntelligence(withinMaxWindow, classified, supabaseUrl, supabaseKey);

  let lastThresholdChecked = null;
  for (const windowDays of RECENT_WINDOWS_DAYS) {
    const threshold = await getRecencyThreshold(liquidityTier, windowDays, supabaseUrl, supabaseKey);
    if (threshold === null) continue;
    lastThresholdChecked = threshold;

    const inWindow = withinMaxWindow.filter((r, i) => {
      const withinDays = daysAgo(r.auction_end_date) <= windowDays;
      const confidentMatch = classified[i].classification_confidence === "high" ||
                              classified[i].classification_confidence === "medium";
      return withinDays && confidentMatch;
    });

    if (inWindow.length >= threshold) {
      return { records: withinMaxWindow, classified, windowUsed: windowDays, thin: false, pagesFetched, threshold };
    }
  }

  // Even the widest window didn't meet threshold -- recent data is thin.
  // Report the widest window checked and its threshold so the caller can
  // state real numbers rather than nulls.
  return {
    records: withinMaxWindow,
    classified,
    windowUsed: RECENT_WINDOWS_DAYS[RECENT_WINDOWS_DAYS.length - 1],
    thin: true,
    pagesFetched,
    threshold: lastThresholdChecked
  };
}

async function fetchCandidateRecords(searchContext, apiKey, supabaseUrl, supabaseKey) {
  const parsed = searchContext.normalizedCar;
  const cacheKey = buildCacheKey(parsed);
  searchContext.cacheKey = cacheKey;

  const cached = await getCachedResult(cacheKey, supabaseUrl, supabaseKey);
  if (cached) {
    searchContext.cacheHit = true;
    searchContext.cachedResult = cached;
    searchContext.rawRecords = [];
    return searchContext;
  }

  searchContext.cacheHit = false;

  const liquidityTier = await getLiquidityTier(parsed.make, parsed.modelGuess, supabaseUrl, supabaseKey);
  const recencyResult = await fetchRecentRecords(parsed, liquidityTier, apiKey, supabaseUrl, supabaseKey);

  searchContext.rawRecords = recencyResult.records;
  searchContext.normalizedRecords = recencyResult.classified;
  searchContext.windowUsed = recencyResult.windowUsed;
  searchContext.thin = recencyResult.thin;
  searchContext.minimumEvidenceRequired = recencyResult.threshold;
  searchContext.liquidityTier = liquidityTier;

  return searchContext;
}

async function normalizeRecords(searchContext, supabaseUrl, supabaseKey) {
  // Only reached if rawRecords exist but were never classified by
  // fetchRecentRecords (defensive fallback -- in the current pipeline,
  // fetchRecentRecords always classifies, so this should rarely run).
  searchContext.normalizedRecords = (searchContext.rawRecords || []).map(classifyTrim);
  await saveVehicleIntelligence(
    searchContext.rawRecords,
    searchContext.normalizedRecords,
    supabaseUrl,
    supabaseKey
  );
  return searchContext;
}

/**
 * Returns structured facts about the exact-trim match, never constructed
 * prose. Presentation (what Sam says, what the UI shows) is a downstream
 * concern -- this function's job is to report what's true.
 */
async function determineDataTier(searchContext, supabaseUrl, supabaseKey) {
  const parsed = searchContext.normalizedCar;
  const records = searchContext.rawRecords || [];
  const classified = searchContext.normalizedRecords || [];

  let result;

  if (records.length === 0) {
    result = {
      status: "matched",
      matchedScope: null,
      exactTrim: null,
      exactTrimSales: 0,
      windowDays: searchContext.windowUsed ?? null,
      minimumEvidenceRequired: searchContext.minimumEvidenceRequired ?? null,
      thin: true,
      analysisDate: new Date().toISOString().split('T')[0],
      clarification: null
    };
  } else {
    // Identify which specific trim the user actually asked about, by
    // checking modelGuess against the same taxonomy used for
    // classification. Only an exact match against THAT requested trim
    // counts -- never any confident match anywhere in the batch.
    const taxonomyKey = `${parsed.make}|${(parsed.modelGuess || "").split(" ")[0]}`;
    const trimList = TRIM_TAXONOMY[taxonomyKey] || TRIM_TAXONOMY[`${parsed.make}|911`]; // fallback while taxonomy is 911-only
    const requestedTrim = trimList ? findTrimIn(parsed.modelGuess, trimList) : null;

    if (requestedTrim) {
      const matchingRequestedTrim = classified.filter(c =>
        c.normalized_trim === requestedTrim &&
        (c.classification_confidence === "high" || c.classification_confidence === "medium")
      );

      result = {
        status: "matched",
        matchedScope: `${parsed.make} ${parsed.modelGuess || ""}`.trim(),
        exactTrim: requestedTrim,
        exactTrimSales: matchingRequestedTrim.length,
        windowDays: searchContext.windowUsed,
        minimumEvidenceRequired: searchContext.minimumEvidenceRequired,
        thin: !!searchContext.thin,
        analysisDate: new Date().toISOString().split('T')[0],
        clarification: null
      };
    } else {
      // No specific trim recognized in the request -- report against
      // whatever confident matches exist in the batch generally.
      const highConfidenceMatches = classified.filter(c => c.classification_confidence === "high" || c.classification_confidence === "medium");

      result = {
        status: "matched",
        matchedScope: `${parsed.make} ${parsed.modelGuess || ""}`.trim(),
        exactTrim: highConfidenceMatches[0]?.normalized_trim || null,
        exactTrimSales: highConfidenceMatches.length,
        windowDays: searchContext.windowUsed,
        minimumEvidenceRequired: searchContext.minimumEvidenceRequired,
        thin: !!searchContext.thin,
        analysisDate: new Date().toISOString().split('T')[0],
        clarification: null
      };
    }
  }

  searchContext.dataTier = result;

  const expiresAt = new Date(Date.now() + CACHE_REFRESH_HOURS * 60 * 60 * 1000).toISOString();
  try {
    await fetch(`${supabaseUrl}/rest/v1/data_tier_cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        cache_key: searchContext.cacheKey,
        make: parsed.make,
        model: parsed.modelGuess,
        trim: result.matchedScope || null,
        result,
        sample_size: records.length,
        expires_at: expiresAt
      })
    });
  } catch (err) {
    console.error("Cache write failed:", err.message);
  }

  return searchContext;
}

async function runPipeline(userInput, contextFields, apiKey, supabaseUrl, supabaseKey) {
  let searchContext = {
    userInput,
    contextFields: contextFields || {}
  };

  searchContext = resolveCar(searchContext);

  if (searchContext.status === "needs_clarification") {
    return { status: "needs_clarification", matchedScope: null, clarification: searchContext.clarification };
  }
  if (searchContext.status === "unidentifiable") {
    return { status: "unidentifiable", matchedScope: null, clarification: null };
  }

  searchContext = await fetchCandidateRecords(searchContext, apiKey, supabaseUrl, supabaseKey);

  if (searchContext.cacheHit) {
    return searchContext.cachedResult;
  }

  if (!searchContext.normalizedRecords) {
    searchContext = await normalizeRecords(searchContext, supabaseUrl, supabaseKey);
  }

  searchContext = await determineDataTier(searchContext, supabaseUrl, supabaseKey);

  return searchContext.dataTier;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OLDCARSDATA_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey) return res.status(500).json({ error: "OldCarsData API key not configured" });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  const { car, contextFields } = req.body;
  if (!car) return res.status(400).json({ error: "Missing car field" });

  try {
    const userInput = car.raw || car;
    const result = await runPipeline(userInput, contextFields, apiKey, supabaseUrl, supabaseKey);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
