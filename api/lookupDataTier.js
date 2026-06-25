// api/lookupDataTier.js — fixes applied:
// 1. hasModelDetail now checks word count, not character length, so a
//    bare model name alone ("911") correctly triggers needs_clarification.
// 2. determineDataTier only confirms a Tier 1 match against the trim the
//    user actually requested, not any confident match anywhere in the batch.
// 3. "Carrera T" added to taxonomy, ordered before plain "Carrera".

const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";
const CACHE_REFRESH_HOURS = 24;

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
const RECENT_WINDOWS_DAYS = [45, 90];

function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
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

async function fetchRecentRecords(parsed, liquidityTierOrNull, apiKey, supabaseUrl, supabaseKey) {
  const liquidityTier = liquidityTierOrNull || 'normal';
  const modelWords = (parsed.modelGuess || "").split(" ").filter(Boolean);
  const cleanModel = modelWords[0] || undefined;

  let allRecords = [];
  let page = 1;
  let pagesFetched = 0;
  let hitStaleRecord = false;
  const MAX_PAGES_SAFETY_CAP = 10;
  const MAX_WINDOW = Math.max(...RECENT_WINDOWS_DAYS);

  while (!hitStaleRecord && pagesFetched < MAX_PAGES_SAFETY_CAP) {
    const query = {
      make: parsed.make,
      model: cleanModel,
      keyword: parsed.modelGuess || undefined,
      status: "sold",
      sort: "date",
      direction: "desc",
      page,
      limit: 50
    };

    const apiResult = await callOldCarsData("/auctions", query, apiKey);
    const pageRecords = apiResult.data || [];
    pagesFetched++;

    if (pageRecords.length === 0) break;

    for (const record of pageRecords) {
      if (daysAgo(record.auction_end_date) > MAX_WINDOW) {
        hitStaleRecord = true;
        break;
      }
      allRecords.push(record);
    }

    const totalPages = apiResult.meta?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  await saveRawRecords(allRecords, supabaseUrl, supabaseKey);
  const classified = allRecords.map(classifyTrim);
  await saveVehicleIntelligence(allRecords, classified, supabaseUrl, supabaseKey);

  for (const windowDays of RECENT_WINDOWS_DAYS) {
    const threshold = await getRecencyThreshold(liquidityTier, windowDays, supabaseUrl, supabaseKey);
    if (threshold === null) continue;

    const inWindow = allRecords.filter((r, i) => {
      const withinDays = daysAgo(r.auction_end_date) <= windowDays;
      const confidentMatch = classified[i].classification_confidence === "high" ||
                              classified[i].classification_confidence === "medium";
      return withinDays && confidentMatch;
    });

    if (inWindow.length >= threshold) {
      return { records: allRecords, classified, windowUsed: windowDays, thin: false, pagesFetched };
    }
  }

  return { records: allRecords, classified, windowUsed: null, thin: true, pagesFetched };
}
function findTrimIn(text, trimList) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const trim of trimList) {
    if (lower.includes(trim.toLowerCase())) return trim;
  }
  return null;
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
  // FIX: word count, not character length. A bare model name alone
  // ("911", "M3") is exactly one word and is NOT specific — "911" passing
  // the old `.length > 2` check was the root cause of the "Porsche 911"
  // bug, where a whole model family silently matched a specific trim.
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
    source: "oldcarsdata",
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
    await fetch(`${supabaseUrl}/rest/v1/vehicle_market_records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "resolution=ignore-duplicates"
      },
      body: JSON.stringify(rows)
    });
  } catch (err) {
    console.error("vehicle_market_records write failed:", err.message);
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
  searchContext.liquidityTier = liquidityTier;

  return searchContext;
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
      `${supabaseUrl}/rest/v1/vehicle_market_records?source=eq.oldcarsdata&source_record_id=in.(${idsParam})&select=id,source_record_id`,
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

async function normalizeRecords(searchContext, supabaseUrl, supabaseKey) {
  searchContext.normalizedRecords = (searchContext.rawRecords || []).map(classifyTrim);
  await saveVehicleIntelligence(
    searchContext.rawRecords,
    searchContext.normalizedRecords,
    supabaseUrl,
    supabaseKey
  );
  return searchContext;
}

async function determineDataTier(searchContext, supabaseUrl, supabaseKey) {
  const parsed = searchContext.normalizedCar;
  const records = searchContext.rawRecords || [];
  const classified = searchContext.normalizedRecords || [];

  let result;

  if (records.length === 0) {
    result = { status: "matched", level: "3", levelDescription: "no usable data at all", matchedScope: null, clarification: null };
  } else {
    // FIX: figure out which specific trim the user actually asked about,
    // by checking modelGuess against the same taxonomy used for
    // classification. If a specific trim was requested, ONLY count a
    // record as confirming Tier 1 if its classified trim matches that
    // request — never just "any confident match anywhere in the batch."
    const taxonomyKey = `${parsed.make}|${(parsed.modelGuess || "").split(" ")[0]}`;
    const trimList = TRIM_TAXONOMY[taxonomyKey] || TRIM_TAXONOMY[`${parsed.make}|911`]; // fallback for Porsche 911 specifically while taxonomy is 911-only
    const requestedTrim = trimList ? findTrimIn(parsed.modelGuess, trimList) : null;

    if (requestedTrim) {
      const matchingRequestedTrim = classified.filter(c =>
        c.normalized_trim === requestedTrim &&
        (c.classification_confidence === "high" || c.classification_confidence === "medium")
      );

      if (matchingRequestedTrim.length > 0) {
        result = {
          status: "matched",
          level: "1",
          levelDescription: "exact model+trim match",
          matchedScope: `${parsed.year || ""} ${parsed.make} ${requestedTrim}`.trim(),
          clarification: null
        };
      } else {
        result = {
          status: "matched",
          level: "2",
          levelDescription: `no confirmed sales of "${requestedTrim}" specifically yet — make/model-level data only`,
          matchedScope: `${parsed.make} ${parsed.modelGuess || ""}`.trim(),
          clarification: null
        };
      }
    } else {
      // No specific trim recognized in the request — fall back to any
      // confident match (original behavior, used when resolveCar's
      // specificity check let through a request that names a generation
      // or other detail not in the trim taxonomy).
      const highConfidenceMatches = classified.filter(c => c.classification_confidence === "high" || c.classification_confidence === "medium");

      if (highConfidenceMatches.length > 0) {
        result = {
          status: "matched",
          level: "1",
          levelDescription: "exact model+trim match",
          matchedScope: `${parsed.year || ""} ${parsed.make} ${highConfidenceMatches[0].normalized_trim || parsed.modelGuess}`.trim(),
          clarification: null
        };
      } else {
        result = {
          status: "matched",
          level: "2",
          levelDescription: "make/model-level only — no usable trim-specific data",
          matchedScope: `${parsed.make} ${parsed.modelGuess || ""}`.trim(),
          clarification: null
        };
      }
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
    return { status: "needs_clarification", level: null, levelDescription: null, matchedScope: null, clarification: searchContext.clarification };
  }
  if (searchContext.status === "unidentifiable") {
    return { status: "unidentifiable", level: null, levelDescription: null, matchedScope: null, clarification: null };
  }

  searchContext = await fetchCandidateRecords(searchContext, apiKey, supabaseUrl, supabaseKey);

  if (searchContext.cacheHit) {
    return searchContext.cachedResult;
  }

if (!searchContext.normalizedRecords) {
    searchContext = await normalizeRecords(searchContext, supabaseUrl, supabaseKey);
  }  searchContext = await determineDataTier(searchContext, supabaseUrl, supabaseKey);

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
