// api/lookupDataTier.js
//
// Live endpoint implementing lookupDataTier(car) against real infrastructure:
// - Supabase data_tier_cache table for Snapshot Stability (Rule 1)
// - The classifyTrim taxonomy, tested against ~85 real Porsche 911 records
// - A real OldCarsData query on cache miss

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
    "Carrera 4S", "Carrera S", "Carrera 4", "Carrera",
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

function parseCarInput(raw) {
  const text = (raw || "").trim();
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  const KNOWN_MAKES = ["porsche", "bmw", "ruf", "audi", "ferrari", "mercedes", "toyota", "nissan", "dodge"];
  const lower = text.toLowerCase();
  const make = KNOWN_MAKES.find(m => lower.includes(m)) || null;

  let remainder = text;
  if (yearMatch) remainder = remainder.replace(yearMatch[0], "");
  if (make) remainder = remainder.replace(new RegExp(make, "i"), "");
  remainder = remainder.trim();

  return { raw: text, year, make: make ? make[0].toUpperCase() + make.slice(1) : null, modelGuess: remainder || null };
}

function checkSpecificity(parsed, contextFields) {
  const hasYear = !!parsed.year;
  const hasModelDetail = !!(parsed.modelGuess && parsed.modelGuess.length > 2);

  if (contextFields && (contextFields.vin || contextFields.year)) {
    return { specific: true };
  }

  if (!hasYear && !hasModelDetail) {
    return {
      specific: false,
      missingFields: ["year", "generation", "trim"],
      question: `Which ${parsed.make || "car"} are we talking about — what year, and any specific trim?`
    };
  }

  return { specific: true };
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

async function writeCacheResult(cacheKey, parsed, result, sampleSize, supabaseUrl, supabaseKey) {
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
        cache_key: cacheKey,
        make: parsed.make,
        model: parsed.modelGuess,
        trim: result.matchedScope || null,
        result,
        sample_size: sampleSize,
        expires_at: expiresAt
      })
    });
  } catch (err) {
    console.error("Cache write failed:", err.message);
  }
}

async function lookupDataTier(car, contextFields, apiKey, supabaseUrl, supabaseKey) {
  const parsed = parseCarInput(car.raw || car);

  const specificity = checkSpecificity(parsed, contextFields);
  if (!specificity.specific) {
    return {
      status: "needs_clarification",
      level: null,
      levelDescription: null,
      matchedScope: null,
      clarification: { question: specificity.question, missingFields: specificity.missingFields }
    };
  }

  if (!parsed.make) {
    return { status: "unidentifiable", level: null, levelDescription: null, matchedScope: null, clarification: null };
  }

  const cacheKey = buildCacheKey(parsed);

  const cached = await getCachedResult(cacheKey, supabaseUrl, supabaseKey);
  if (cached) return cached;

  try {
    const query = {
      make: parsed.make,
      model: parsed.modelGuess,
      year_min: parsed.year || undefined,
      year_max: parsed.year || undefined,
      limit: 50
    };
    const apiResult = await callOldCarsData("/auctions", query, apiKey);
    const records = apiResult.data || [];

    if (records.length === 0) {
      const result = { status: "matched", level: "3", levelDescription: "no usable data at all", matchedScope: null, clarification: null };
      await writeCacheResult(cacheKey, parsed, result, 0, supabaseUrl, supabaseKey);
      return result;
    }

    const classified = records.map(classifyTrim);
    const highConfidenceMatches = classified.filter(c => c.classification_confidence === "high" || c.classification_confidence === "medium");

    let result;
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

    await writeCacheResult(cacheKey, parsed, result, records.length, supabaseUrl, supabaseKey);
    return result;
  } catch (err) {
    throw new Error(`lookupDataTier failed: ${err.message}`);
  }
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
    const result = await lookupDataTier(car, contextFields || {}, apiKey, supabaseUrl, supabaseKey);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
