// The one vehicle brain. Every endpoint that needs to turn free text into a
// structured vehicle goes through resolveVehicle(). Taxonomy comes from the
// Supabase taxonomy tables when seeded; otherwise it falls back to live
// OldCarsData /makes + /models (free, unmetered) and vPIC.
//
// Resolution statuses:
// - "valid":               vehicle fully resolved
// - "needs_confirmation":  a typo correction is proposed; the user must confirm
//                          before we proceed (product rule 6)
// - "needs_clarification": we are missing year/make/model and have to ask
// - "invalid_vehicle":     the combination cannot exist (wrong make for the
//                          nameplate, or outside production years)

import {
  MAKE_ALIASES,
  MODEL_ALIASES,
  MODEL_OWNERSHIP,
  PRODUCTION_RULES,
  SINGLE_MODEL_MAKES,
  porscheSuggestionChips
} from "./vehicleData.js";
import { supabaseEnv, supabaseSelect } from "./_supabase.js";
import { OLDCARSDATA_BASE, fetchJson } from "./_ocd.js";
import { loadAllGenerations } from "./generations.js";

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const TAXONOMY_CACHE_TTL_MS = 10 * 60 * 1000;

const COMMON_COLORS = [
  "black", "white", "silver", "gray", "grey", "red", "blue", "green",
  "yellow", "orange", "brown", "gold", "beige", "purple"
];

const NOISE_WORDS = /\b(i have|i've got|my car is|to sell|sell|selling|have a|with|miles|mile|mi|km|my|mine|from|please|the|a|an)\b/gi;

// Body styles can never become trim or model tokens (locked). Captured as a
// bodyStyle attribute instead. "spyder"/"spider" stay out: they are part of
// real model names (550 Spyder).
const BODY_STYLE_WORDS = ["vert", "convertible", "cabriolet", "cabrio", "coupe", "hardtop", "softtop", "soft top", "t top", "targa top"];
function extractBodyStyle(text) {
  const lower = normalize(text);
  return BODY_STYLE_WORDS.find(word => new RegExp(`(^|\\s)${word.replace(/\s/g, "\\s")}(\\s|$)`).test(lower)) || null;
}
function stripBodyStyles(text) {
  let value = String(text || "");
  for (const word of BODY_STYLE_WORDS) {
    value = value.replace(new RegExp(`(^|[^a-z0-9])${word.replace(/\s/g, "[\\s-]*")}([^a-z0-9]|$)`, "ig"), "$1$2");
  }
  return value.replace(/\s+/g, " ").trim();
}

let taxonomyCache = null;
const modelsCache = new Map();
const vpicYearModelsCache = new Map();
const vpicMakeModelsCache = new Map();
let vpicMakesCache = null;

export function asText(value) {
  return String(value || "").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalize(value) {
  return asText(value).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Canonical slug used by the taxonomy tables. The seed script and the runtime
// lookup must agree on this exactly.
export function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function textHasTerm(text, term) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm.split(/\s+/).map(escapeRegExp).join("[\\s-]*");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(normalize(text));
}

// Returns { year, token }. Accepts four-digit years and, when none exists,
// a standalone two-digit year ("67 corvette", "'05 miata").
function extractYearInfo(text) {
  const fourDigit = asText(text).match(/\b((?:19|20)\d{2})\b/);
  if (fourDigit) return { year: Number(fourDigit[1]), token: fourDigit[1] };
  const twoDigit = asText(text).match(/(?:^|\s)'?(\d{2})(?=\s|$)/);
  if (twoDigit) {
    const n = Number(twoDigit[1]);
    return { year: n >= 30 ? 1900 + n : 2000 + n, token: twoDigit[1] };
  }
  return { year: null, token: null };
}

// Decade expressions ("from the 80s", "early 90s", "late seventies") parse
// into a year range the evidence ladder can use directly. Only consulted
// when no explicit year exists.
const DECADE_WORDS = { twenties: 1920, thirties: 1930, forties: 1940, fifties: 1950, sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990 };
export function extractYearRange(text) {
  const lower = asText(text).toLowerCase();
  let decade = null;
  const numeric = lower.match(/\b(?:19|20)?([1-9]0)'?s\b/);
  if (numeric) {
    const two = Number(numeric[1]);
    decade = /\b20/.test(numeric[0]) ? 2000 + two : two >= 30 ? 1900 + two : 2000 + two;
  } else {
    const word = Object.keys(DECADE_WORDS).find(w => lower.includes(w));
    if (word) decade = DECADE_WORDS[word];
  }
  if (!decade) return null;
  const tokens = [];
  if (numeric) tokens.push(numeric[0]);
  else tokens.push(Object.keys(DECADE_WORDS).find(w => lower.includes(w)));
  let start = decade, end = decade + 9;
  if (/\bearly\b/.test(lower)) { end = decade + 4; tokens.push("early"); }
  else if (/\blate\b/.test(lower)) { start = decade + 5; tokens.push("late"); }
  else if (/\bmid\b/.test(lower)) { start = decade + 3; end = decade + 6; tokens.push("mid"); }
  return { start, end, tokens };
}
function yearRangeLabel(range) {
  if (!range) return null;
  return range.start % 10 === 0 && range.end === range.start + 9 ? `${range.start}s` : `${range.start}-${range.end}`;
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
  return COMMON_COLORS.find(color => new RegExp(`\\b${color}\\b`).test(lower)) || null;
}

function levenshtein(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return Math.max(left.length, right.length);
  const dp = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[left.length][right.length];
}

function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  const max = Math.max(left.length, right.length);
  if (!max) return 0;
  return 1 - levenshtein(left, right) / max;
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prettyMakeName(value) {
  const upper = asText(value).toUpperCase();
  const acronyms = new Set(["BMW", "GMC", "MINI", "RAM", "BYD", "MG", "AMC", "AC", "BSA", "GAZ", "NSU", "TVR", "REO"]);
  if (acronyms.has(upper)) return upper;
  return asText(value).toLowerCase().split(/([-\s]+)/).map(part => {
    if (/^[-\s]+$/.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("");
}

async function getVpicMakes() {
  if (vpicMakesCache) return vpicMakesCache;
  const json = await fetchJson(`${VPIC_BASE}/GetAllMakes?format=json`);
  const results = Array.isArray(json.Results) ? json.Results : [];
  vpicMakesCache = uniqueValues(results.map(item => prettyMakeName(item.Make_Name)).filter(Boolean));
  return vpicMakesCache;
}

function mergeAliases(dbRows) {
  const makeAliases = new Map(MAKE_ALIASES.map(item => [normalize(item.alias), item]));
  const modelAliases = new Map(MODEL_ALIASES.map(item => [`${normalize(item.alias)}|${normalize(item.make)}`, item]));
  for (const row of dbRows || []) {
    const entry = {
      alias: row.alias,
      make: row.make || null,
      model: row.model || null,
      trim: row.trim || null,
      kind: row.confirm ? "misspelling" : (row.model ? "nickname" : "abbreviation")
    };
    if (row.model) modelAliases.set(`${normalize(row.alias)}|${normalize(row.make)}`, entry);
    else makeAliases.set(normalize(row.alias), entry);
  }
  return { makeAliases: [...makeAliases.values()], modelAliases: [...modelAliases.values()] };
}

async function loadTaxonomy(options = {}) {
  if (taxonomyCache && Date.now() - taxonomyCache.loadedAt < TAXONOMY_CACHE_TTL_MS) return taxonomyCache;
  const env = supabaseEnv(options);
  let makes = null;
  let fromDb = false;
  let dbAliases = null;

  const makeRows = await supabaseSelect(env, "taxonomy_makes?select=name&limit=2000");
  if (makeRows?.length) {
    makes = uniqueValues(makeRows.map(row => row.name).filter(Boolean));
    fromDb = true;
    dbAliases = await supabaseSelect(env, "taxonomy_aliases?select=alias,make,model,trim,confirm&limit=5000");
  }

  if (!makes) {
    try {
      const json = await fetchJson(`${OLDCARSDATA_BASE}/makes`);
      makes = uniqueValues(json.data || []);
    } catch {
      makes = null;
    }
  }
  if (!makes?.length) {
    try {
      makes = await getVpicMakes();
    } catch {
      makes = uniqueValues([...MAKE_ALIASES.map(item => item.make), ...MODEL_OWNERSHIP.flatMap(item => item.makes)]);
    }
  }

  taxonomyCache = {
    loadedAt: Date.now(),
    fromDb,
    makes,
    aliases: mergeAliases(dbAliases),
    env
  };
  return taxonomyCache;
}

async function getModelsForMake(taxonomy, make) {
  if (!make) return [];
  const key = normalize(make);
  const cached = modelsCache.get(key);
  if (cached && Date.now() - cached.loadedAt < TAXONOMY_CACHE_TTL_MS) return cached.models;

  let models = null;
  if (taxonomy.fromDb) {
    const rows = await supabaseSelect(
      taxonomy.env,
      `taxonomy_models?make_slug=eq.${encodeURIComponent(slugify(make))}&select=name,year_ranges&limit=2000`
    );
    if (rows?.length) {
      models = rows.map(row => ({ name: row.name, yearRanges: row.year_ranges || null }));
    }
  }
  if (!models) {
    try {
      const json = await fetchJson(`${OLDCARSDATA_BASE}/models?make=${encodeURIComponent(make)}`);
      models = (json.data || []).map(name => ({ name, yearRanges: null }));
    } catch {
      models = [];
    }
  }
  modelsCache.set(key, { loadedAt: Date.now(), models });
  return models;
}

function canonicalMakeForYearLookup(make) {
  if (make === "Mercedes") return "Mercedes-Benz";
  return make;
}

async function getVpicModelsForMakeYear(make, year) {
  if (!make || !year) return [];
  const canonicalMake = canonicalMakeForYearLookup(make);
  const cacheKey = `${normalize(canonicalMake)}:${year}`;
  if (vpicYearModelsCache.has(cacheKey)) return vpicYearModelsCache.get(cacheKey);
  let models = [];
  try {
    const url = `${VPIC_BASE}/GetModelsForMakeYear/make/${encodeURIComponent(canonicalMake)}/modelyear/${year}?format=json`;
    const json = await fetchJson(url);
    const results = Array.isArray(json.Results) ? json.Results : [];
    models = [...new Set(results.map(item => item.Model_Name).filter(Boolean))];
  } catch {
    models = [];
  }
  vpicYearModelsCache.set(cacheKey, models);
  return models;
}

async function getVpicModelsForMake(make) {
  if (!make) return [];
  const canonicalMake = canonicalMakeForYearLookup(make);
  const cacheKey = normalize(canonicalMake);
  if (vpicMakeModelsCache.has(cacheKey)) return vpicMakeModelsCache.get(cacheKey);
  let models = [];
  try {
    const url = `${VPIC_BASE}/GetModelsForMake/${encodeURIComponent(canonicalMake)}?format=json`;
    const json = await fetchJson(url);
    const results = Array.isArray(json.Results) ? json.Results : [];
    models = [...new Set(results.map(item => item.Model_Name).filter(Boolean))];
  } catch {
    models = [];
  }
  vpicMakeModelsCache.set(cacheKey, models);
  return models;
}

function productionRuleFor(make, model, dbYearRanges) {
  if (dbYearRanges?.length) return { make, model, ranges: dbYearRanges };
  return PRODUCTION_RULES.find(rule =>
    normalize(rule.make) === normalize(make) &&
    (normalize(rule.model) === normalize(model) || rule.aliases.some(alias => normalize(alias) === normalize(model)))
  ) || null;
}

function yearInRanges(year, ranges) {
  return ranges.some(([start, end]) => year >= start && year <= end);
}

function findMakeAlias(taxonomy, text) {
  const matches = taxonomy.aliases.makeAliases.filter(item => textHasTerm(text, item.alias));
  if (!matches.length) return null;
  return matches.sort((a, b) => normalize(b.alias).length - normalize(a.alias).length)[0];
}

function findModelAlias(taxonomy, text, make) {
  const matches = taxonomy.aliases.modelAliases.filter(item =>
    textHasTerm(text, item.alias) && (!make || normalize(item.make) === normalize(make))
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => normalize(b.alias).length - normalize(a.alias).length)[0];
}

function matchExactMake(text, makes) {
  return makes
    .filter(make => textHasTerm(text, make))
    .sort((a, b) => String(b).length - String(a).length)[0] || null;
}

// Make inference: when the text names a model that belongs to exactly one
// make ("911", "miata", "corvette"), infer the make silently. Curated
// ownership first, then the seeded taxonomy across all makes.
async function inferMakeFromModel(taxonomy, text) {
  const owners = new Set();
  let matchedVia = null;
  for (const item of MODEL_OWNERSHIP) {
    if (!item.aliases.some(alias => textHasTerm(text, alias))) continue;
    for (const make of item.makes) owners.add(make);
    matchedVia = matchedVia || item.model;
  }
  if (owners.size === 1) return { make: [...owners][0], via: matchedVia, model: matchedVia };
  if (owners.size > 1) return null;

  if (!taxonomy.fromDb) return null;
  const tokens = normalize(text).split(/\s+/)
    .filter(token => token.length >= 3 && !/^\d{1,2}$/.test(token) && !TRIM_STOPWORDS.has(token))
    .sort((a, b) => b.length - a.length);
  for (const token of tokens.slice(0, 4)) {
    const rows = await supabaseSelect(
      taxonomy.env,
      `taxonomy_models?select=name,make_slug&slug=like.${encodeURIComponent(`*${slugify(token)}*`)}&limit=100`
    );
    if (!rows?.length) continue;
    const makeSlugs = new Set(rows.filter(row => textHasTerm(row.name, token)).map(row => row.make_slug));
    if (makeSlugs.size !== 1) continue;
    const slug = [...makeSlugs][0];
    const make = taxonomy.makes.find(name => slugify(name) === slug);
    if (make) return { make, via: token };
  }
  return null;
}

function fuzzyMakeCandidate(text, makes, consumedTokens) {
  const tokens = normalize(text).split(/\s+/).filter(token => token.length >= 4 && !consumedTokens.has(token) && !/^\d+$/.test(token));
  let best = null;
  for (const make of makes) {
    for (const token of tokens) {
      let score = similarity(token, make);
      // A 4+ char prefix of exactly this make ("pors" -> Porsche) is a
      // strong truncation signal even when edit distance is large.
      if (normalize(make).startsWith(token) && token.length >= 4) score = Math.max(score, 0.8);
      if (score >= 0.75 && score < 1 && (!best || score > best.score)) best = { make, token, score };
    }
  }
  return best;
}

function modelOwnerMismatch(text, make, year) {
  const rule = MODEL_OWNERSHIP.find(item =>
    item.aliases.some(alias => textHasTerm(text, alias)) && !item.makes.includes(make)
  );
  if (!rule) return null;
  const preferredMake = rule.makes[0];
  const suggestionModel = rule.suggestion && (!rule.suggestionStart || year >= rule.suggestionStart)
    ? rule.suggestion
    : `${preferredMake} ${rule.model}`;
  const suggestion = year ? `${year} ${suggestionModel}` : suggestionModel;
  return {
    question: `I don't think there was a ${make} ${rule.model}. ${rule.model} is usually a ${preferredMake}. Can you let me know the actual ${make} model so I can tell you the best place to sell it?`,
    chips: [suggestion, `Different ${make} model`, "Change car", "Not sure"],
    suggestion,
    baseVehicle: [year, make].filter(Boolean).join(" ")
  };
}

function removeKnownNoise(raw, make, year, aliasTexts = []) {
  let value = asText(raw);
  if (year) value = value.replace(new RegExp(`\\b${year}\\b`, "g"), " ");
  if (make) value = value.replace(new RegExp(escapeRegExp(make), "ig"), " ");
  if (make === "Alfa Romeo") value = value.replace(/\balfa(?:\s+romeo)?\b/gi, " ");
  for (const aliasText of aliasTexts) {
    const flexible = normalize(aliasText).split(/\s+/).map(escapeRegExp).join("['\\s-]*");
    value = value.replace(new RegExp(`(^|[^a-z0-9])${flexible}([^a-z0-9]|$)`, "ig"), "$1$2");
  }
  return value
    .replace(/\b\d{1,3}(?:,\d{3})*(?:k)?\s*(?:miles|mile|mi|km)\b/gi, " ")
    .replace(NOISE_WORDS, " ")
    .replace(new RegExp(`\\b(${COMMON_COLORS.join("|")})\\b`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchExactModel(text, modelNames) {
  return modelNames
    .filter(model => textHasTerm(text, model))
    .sort((a, b) => String(b).length - String(a).length)[0] || null;
}

function numericTypoCandidates(text, modelNames) {
  const tokens = normalize(text).split(/\s+/).filter(token => /^\d{2,4}$/.test(token));
  const numericModels = modelNames.filter(model => /^\d{2,4}$/.test(normalize(model).split(/\s+/)[0] || ""));
  const candidates = new Map();
  for (const token of tokens) {
    for (const model of numericModels) {
      const head = normalize(model).split(/\s+/)[0];
      if (token === head) continue;
      if (levenshtein(token, head) === 1) candidates.set(model, token);
    }
  }
  return [...candidates.entries()].map(([model, token]) => ({ model, token }));
}

function fuzzyModelCandidate(text, modelNames) {
  const tokens = normalize(stripBodyStyles(text)).split(/\s+/).filter(token => token.length >= 4 && !/^\d+$/.test(token));
  let best = null;
  for (const model of modelNames) {
    const modelNorm = normalize(model);
    const modelTokens = modelNorm.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const score = Math.max(similarity(token, modelNorm), ...modelTokens.map(part => similarity(token, part)));
      if (score >= 0.75 && score < 1 && (!best || score > best.score)) best = { model, token, score };
    }
  }
  return best;
}

const TRIM_STOPWORDS = new Set(["a", "an", "the", "my", "i", "to", "for", "in", "it", "its", "is", "and"]);

function formatTrim(value) {
  const cleaned = normalize(value);
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/).filter(word => !TRIM_STOPWORDS.has(word)).slice(0, 5).map(word =>
    word.length <= 3 || /\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
  );
  if (!words.length) return null;
  const trim = words.join(" ");
  return trim.length > 40 ? trim.slice(0, 40).trim() : trim;
}

function extractTrim(remainder, matchedModel, aliasTrim) {
  let leftover = stripBodyStyles(remainder);
  if (matchedModel) {
    for (const token of normalize(matchedModel).split(/\s+/)) {
      leftover = leftover.replace(new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}([^a-z0-9]|$)`, "i"), "$1$2");
    }
  }
  const extracted = matchedModel || aliasTrim ? formatTrim(leftover) : null;
  if (aliasTrim) {
    // An alias-derived trim (carrera -> Carrera) must not swallow richer
    // trims: leftover tokens extend it ("carrera gts" -> Carrera GTS).
    return extracted && normalize(extracted) !== normalize(aliasTrim)
      ? formatTrim(`${aliasTrim} ${extracted}`)
      : aliasTrim;
  }
  if (!matchedModel) return null;
  return extracted;
}

async function modelSuggestionChips(taxonomy, make, year, yearModels, archiveModels) {
  if (normalize(make) === "porsche" && year) return porscheSuggestionChips(year).concat("Not sure");
  if (yearModels?.length) return yearModels.slice(0, 5).concat("Not sure");
  // No year-specific taxonomy: use our own records for that era, ordered by
  // frequency, so chips never offer models that did not exist yet.
  if (year && taxonomy.env) {
    const rows = await supabaseSelect(
      taxonomy.env,
      `vehicle_market_records?select=model&make=ilike.${encodeURIComponent(make)}&year=gte.${year - 8}&year=lte.${year + 8}&limit=500`
    );
    if (rows?.length) {
      const counts = new Map();
      for (const row of rows) if (row.model) counts.set(row.model, (counts.get(row.model) || 0) + 1);
      const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
      if (ordered.length) return ordered.slice(0, 5).concat("Not sure");
    }
  }
  // Last resort: archive filtered by curated production rules for the year.
  const filtered = (archiveModels || []).filter(name => {
    const rule = productionRuleFor(make, name, null);
    return !rule?.ranges || !year || yearInRanges(year, rule.ranges);
  });
  return filtered.slice(0, 5).concat("Not sure");
}

function baseResult(status, vehicle, clarification, corrections) {
  return { status, vehicle, clarification: clarification || null, corrections };
}

function confirmationResult(vehicle, question, suggestion, corrections, extraChips = []) {
  return baseResult("needs_confirmation", vehicle, {
    kind: "typo_confirmation",
    question,
    chips: uniqueValues([suggestion, ...extraChips, "Change car", "Not sure"].filter(Boolean)),
    suggestion,
    baseVehicle: [vehicle.year, vehicle.make].filter(Boolean).join(" ")
  }, corrections);
}

// A correction chip must propose the fully cleaned, fully corrected vehicle:
// corrected make, digit-typo-corrected model, noise and body styles stripped.
async function buildCleanSuggestion(taxonomy, make, year, remainder) {
  let rest = stripBodyStyles(remainder);
  try {
    const archive = await getModelsForMake(taxonomy, make);
    const names = archive.map(m => m.name);
    const numeric = numericTypoCandidates(rest, names);
    if (numeric.length === 1) {
      rest = rest.replace(new RegExp(`(^|[^0-9])${numeric[0].token}([^0-9]|$)`), `$1${numeric[0].model}$2`);
    }
  } catch { /* keep rest as-is */ }
  const cleaned = formatTrim(rest);
  return [year, make, cleaned].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// Accepts a client-supplied resolved vehicle object and returns a clean copy,
// or null if it does not carry enough to skip re-parsing.
export function sanitizeResolvedVehicle(input) {
  if (!input || typeof input !== "object") return null;
  const make = asText(input.make);
  const model = asText(input.model);
  if (!make || !model) return null;
  const year = Number(input.year);
  return {
    raw: asText(input.raw) || [input.year, make, model, asText(input.trim)].filter(Boolean).join(" "),
    year: Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : null,
    make,
    model,
    trim: asText(input.trim) || null,
    yearRange: input.yearRange && Number.isFinite(Number(input.yearRange.start)) && Number.isFinite(Number(input.yearRange.end))
      ? { start: Number(input.yearRange.start), end: Number(input.yearRange.end) }
      : null,
    color: asText(input.color).toLowerCase() || null,
    mileage: Number.isFinite(Number(input.mileage)) ? Number(input.mileage) : null,
    confidence: ["high", "medium", "low"].includes(input.confidence) ? input.confidence : "medium",
    canonicalLabel: asText(input.canonicalLabel) || [input.year, make, model, asText(input.trim)].filter(Boolean).join(" ")
  };
}

export async function resolveVehicle(rawInput, options = {}) {
  const text = asText(rawInput);
  let { year, token: yearToken } = extractYearInfo(text);
  const yearRange = extractYearRange(text);
  let freedYearToken = null;
  if (yearRange && year) {
    // "late seventies bmw 2002": the decade is the year signal and the
    // four-digit token stays available as a model candidate.
    freedYearToken = String(year);
    year = null;
    yearToken = null;
  }
  const color = extractColor(text);
  const mileage = extractMileage(text);
  const bodyStyle = extractBodyStyle(text);
  const corrections = [];
  const taxonomy = await loadTaxonomy(options);

  const partialVehicle = extra => ({
    raw: text, year, yearRange, make: null, model: null, trim: null, color, mileage, bodyStyle, confidence: "low", ...extra
  });

  // 1. Make: exact taxonomy hit first, then silent abbreviation, then misspelling
  //    (confirm), then fuzzy (confirm).
  let make = matchExactMake(text, taxonomy.makes);
  let makeConfidence = make ? "high" : "low";
  const consumedAliasTexts = [];
  if (yearToken && yearToken !== String(year)) consumedAliasTexts.push(yearToken);
  if (yearRange) {
    for (const token of (yearRange.tokens || []).filter(Boolean)) {
      consumedAliasTexts.push(token);
      // The apostrophe form ("80's") normalizes to "80 s"; consume both so
      // decade fragments can never survive into the trim.
      if (normalize(token) !== token) consumedAliasTexts.push(normalize(token));
    }
  }

  if (!make) {
    const makeAlias = findMakeAlias(taxonomy, text);
    if (makeAlias && makeAlias.kind !== "misspelling") {
      make = makeAlias.make;
      makeConfidence = "high";
      consumedAliasTexts.push(makeAlias.alias);
      corrections.push({ type: "abbreviation", from: makeAlias.alias, to: makeAlias.make });
    } else if (makeAlias) {
      const suggestion = await buildCleanSuggestion(taxonomy, makeAlias.make, year, removeKnownNoise(text, null, year, [makeAlias.alias]));
      return confirmationResult(
        partialVehicle({}),
        `Did you mean ${makeAlias.make}?`,
        suggestion,
        corrections
      );
    }
  }

  // A model nickname can imply the make ("vette" -> Chevrolet Corvette).
  let aliasModel = null;
  let aliasTrim = null;
  let generationHint = null;
  const modelAlias = findModelAlias(taxonomy, text, make);
  if (modelAlias && /^[a-z]\d{2,3}$/i.test(String(modelAlias.alias))) {
    generationHint = String(modelAlias.alias).toLowerCase();
  }
  if (modelAlias && modelAlias.kind !== "misspelling") {
    if (!make) {
      make = modelAlias.make;
      makeConfidence = "high";
    }
    aliasModel = modelAlias.model;
    aliasTrim = modelAlias.trim || null;
    consumedAliasTexts.push(modelAlias.alias);
    if (normalize(modelAlias.alias) !== normalize(modelAlias.model)) {
      corrections.push({ type: "nickname", from: modelAlias.alias, to: `${modelAlias.make} ${modelAlias.model}` });
    }
  }

  // A model that belongs to exactly one make implies the make silently
  // ("2018 911 Carrera GTS" -> Porsche, "miata" -> Mazda).
  let inferredModelHint = null;
  if (!make) {
    const inferred = await inferMakeFromModel(taxonomy, removeKnownNoise(text, null, year, consumedAliasTexts));
    if (inferred) {
      make = inferred.make;
      makeConfidence = "high";
      inferredModelHint = inferred.model || null;
      corrections.push({ type: "make_inference", from: inferred.via, to: inferred.make });
    }
  }

  if (!make) {
    const fuzzy = fuzzyMakeCandidate(text, taxonomy.makes, new Set());
    if (fuzzy && year) {
      const suggestion = await buildCleanSuggestion(taxonomy, fuzzy.make, year, removeKnownNoise(text, null, year, [fuzzy.token]));
      return confirmationResult(
        partialVehicle({}),
        `Did you mean ${fuzzy.make}?`,
        suggestion,
        corrections
      );
    }
  }

  if ((!year && !yearRange) || !make) {
    // Ask only for what is actually missing. The full partial state also goes
    // back in `understood` so the frontend never repeats itself verbatim.
    // Explicit model tokens outrank chassis-code aliases (e46 m3 is an M3;
    // the e46 stays as a generation hint).
    let understoodModel = aliasModel || inferredModelHint || null;
    if (make) {
      try {
        const preModels = await getModelsForMake(taxonomy, make);
        const explicit = matchExactModel(
          removeKnownNoise(text, make, year, consumedAliasTexts),
          preModels.map(m => m.name)
        );
        if (explicit) understoodModel = explicit;
      } catch { /* keep alias-derived model */ }
    }
    let question = "What year, make and model are we talking about?";
    if (make && !year) {
      question = `Got it, a ${make}${understoodModel ? ` ${understoodModel}` : ""}. What year is it?`;
    } else if (year && !make) {
      question = `${year}, noted. What make and model is it?`;
    }
    return baseResult("needs_clarification", partialVehicle({ make, model: understoodModel }), {
      question,
      missing: [!year && !yearRange ? "year" : null, !make ? "make" : null, !understoodModel ? "model" : null].filter(Boolean),
      // Accepted partial state persists: the frontend combines follow-up
      // answers with this instead of re-asking for known pieces.
      baseVehicle: [year || yearRangeLabel(yearRange), make, understoodModel].filter(Boolean).join(" ") || null,
      chips: ["Change car", "Not sure"]
    }, corrections);
  }

  // 2. A nameplate that belongs to a different make ("Porsche E-Type").
  const mismatch = modelOwnerMismatch(text, make, year);
  if (mismatch && !aliasModel) {
    return baseResult("invalid_vehicle", partialVehicle({ make }), mismatch, corrections);
  }

  // 3. Model: vPIC year taxonomy exact, then archive exact, then alias, then
  //    misspelling alias (confirm), then digit typo (confirm), then fuzzy (confirm).
  const archiveModels = await getModelsForMake(taxonomy, make);
  const archiveModelNames = archiveModels.map(model => model.name);
  const yearModels = await getVpicModelsForMakeYear(make, year);
  const remainder = removeKnownNoise(text, make, year, consumedAliasTexts);

  let model = null;
  let modelSource = null;
  const yearExact = matchExactModel(remainder, yearModels);
  const archiveExact = yearExact ? null : matchExactModel(remainder, archiveModelNames);
  if (yearExact) {
    model = yearExact;
    modelSource = "year_taxonomy";
  } else if (archiveExact) {
    model = archiveExact;
    modelSource = "market_archive";
  } else if (aliasModel) {
    model = aliasModel;
    modelSource = "alias";
  }

  // A make with exactly one known model resolves silently: never ask "which
  // model?" when the taxonomy or our own records say there is only one answer
  // (Amphicar -> 770). Checked against vPIC year models, the archive taxonomy,
  // then distinct models in vehicle_market_records.
  if (!model) {
    let single = yearModels.length === 1 ? yearModels[0]
      : archiveModelNames.length === 1 ? archiveModelNames[0]
      : SINGLE_MODEL_MAKES[normalize(make)] || null;
    let singleSource = yearModels.length === 1 ? "year_taxonomy"
      : archiveModelNames.length === 1 ? "market_archive"
      : "curated_single_model";
    if (!single && !yearModels.length && !archiveModelNames.length && taxonomy.env) {
      const rows = await supabaseSelect(
        taxonomy.env,
        `vehicle_market_records?select=model&make=ilike.${encodeURIComponent(make)}&limit=500`
      );
      const distinct = uniqueValues((rows || []).map(row => row.model).filter(Boolean));
      if (distinct.length === 1) {
        single = distinct[0];
        singleSource = "market_records";
      }
    }
    if (single) {
      model = single;
      modelSource = singleSource;
      corrections.push({ type: "single_model_inference", from: make, to: single });
    }
  }

  if (!model) {
    const misspellingAlias = taxonomy.aliases.modelAliases.find(item =>
      item.kind === "misspelling" && normalize(item.make) === normalize(make) && textHasTerm(remainder, item.alias)
    );
    if (misspellingAlias) {
      const leftover = formatTrim(removeKnownNoise(remainder, null, null, [misspellingAlias.alias]));
      const suggestion = [year, make, misspellingAlias.model, leftover].filter(Boolean).join(" ");
      return confirmationResult(
        partialVehicle({ make }),
        `Did you mean the ${year} ${make} ${misspellingAlias.model}?`,
        suggestion,
        corrections
      );
    }

    const numericCandidates = numericTypoCandidates(remainder, uniqueValues([...yearModels, ...archiveModelNames]));
    if (numericCandidates.length === 1) {
      const candidate = numericCandidates[0];
      const leftover = formatTrim(removeKnownNoise(remainder, null, null, [candidate.token]));
      const suggestion = [year, make, candidate.model, leftover].filter(Boolean).join(" ");
      return confirmationResult(
        partialVehicle({ make }),
        `Did you mean the ${make} ${candidate.model}?`,
        suggestion,
        corrections
      );
    }
    if (numericCandidates.length > 1) {
      return baseResult("needs_clarification", partialVehicle({ make }), {
        question: `I couldn't find that exact ${make} model. Which one did you mean?`,
        chips: numericCandidates.slice(0, 4).map(candidate => `${year} ${make} ${candidate.model}`).concat("Change car", "Not sure"),
        baseVehicle: [year, make].join(" ")
      }, corrections);
    }

    const fuzzyModel = fuzzyModelCandidate(remainder, uniqueValues([...yearModels, ...archiveModelNames]));
    if (fuzzyModel) {
      const leftover = formatTrim(removeKnownNoise(remainder, null, null, [fuzzyModel.token]));
      const suggestion = [year, make, fuzzyModel.model, leftover].filter(Boolean).join(" ");
      return confirmationResult(
        partialVehicle({ make }),
        `Did you mean the ${year} ${make} ${fuzzyModel.model}?`,
        suggestion,
        corrections
      );
    }
  }

  // 4. Production-year validity for the resolved model.
  if (model) {
    const dbRanges = archiveModels.find(item => normalize(item.name) === normalize(model))?.yearRanges || null;
    const rule = productionRuleFor(make, model, dbRanges);
    if (rule?.ranges && !yearInRanges(year, rule.ranges)) {
      const replacement = rule.suggestion && (!rule.suggestionStart || year >= rule.suggestionStart);
      const fallbackChips = normalize(make) === "porsche"
        ? porscheSuggestionChips(year).concat("Change car", "Not sure")
        : [`Different ${make} model`, "Change car", "Not sure"];
      return baseResult("invalid_vehicle", partialVehicle({ make, model }), {
        question: replacement
          ? `The ${rule.model || model} wasn't produced in ${year}. Did you mean the ${year} ${rule.suggestion}?`
          : `The ${rule.model || model} wasn't produced in ${year}. Which ${make} model are we talking about?`,
        chips: replacement ? [`${year} ${rule.suggestion}`, "Change car", "Not sure"] : fallbackChips,
        suggestion: replacement ? `${year} ${rule.suggestion}` : null,
        baseVehicle: [year, make].join(" ")
      }, corrections);
    }

    // Year validation for models without a curated rule. The generation map
    // is the production authority when one exists: our own records' year span
    // reflects inventory (worse after partner backfills), not production, so
    // it is only the fallback for unmapped models.
    if (!rule?.ranges) {
      const family = String(model).split(/\s+/)[0].toLowerCase();
      const generations = (await loadAllGenerations(taxonomy.env || {})).filter(row =>
        String(row.make).toLowerCase() === String(make).toLowerCase() &&
        String(row.model).split(/\s+/)[0].toLowerCase() === family
      );
      if (generations.length) {
        const genMin = Math.min(...generations.map(row => row.yearStart));
        const genMax = Math.max(...generations.map(row => row.yearEnd));
        const outside = year
          ? (year < genMin - 2 || year > genMax + 2)
          : yearRange
            ? (yearRange.start > genMax + 2 || yearRange.end < genMin - 2)
            : false;
        if (outside) {
          return baseResult("needs_clarification", partialVehicle({ make, model }), {
            question: `A ${year || yearRangeLabel(yearRange)} ${make} ${model} doesn't line up: ${model} production in my data runs ${genMin} to ${genMax}. Double-check the year?`,
            missing: ["year"],
            baseVehicle: [make, model].join(" "),
            chips: ["Change car", "Not sure"]
          }, corrections);
        }
      } else if (taxonomy.env && year) {
        const coverageRows = await supabaseSelect(
          taxonomy.env,
          `vehicle_market_records?select=year&make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent(model)}&limit=500`
        );
        const years = (coverageRows || []).map(row => Number(row.year)).filter(y => y > 1900);
        if (years.length >= 5) {
          const minYear = Math.min(...years);
          const maxYear = Math.max(...years);
          if (year < minYear - 3 || year > maxYear + 3) {
            return baseResult("needs_clarification", partialVehicle({ make, model }), {
              question: `A ${year} ${make} ${model} doesn't line up with what I've seen: sales in my records run ${minYear} to ${maxYear}. Double-check the year?`,
              missing: ["year"],
              baseVehicle: [make, model].join(" "),
              chips: ["Change car", "Not sure"]
            }, corrections);
          }
        }
      }
    }

    // Model exists in general but vPIC has no sign of it for this specific year.
    if (yearModels.length && !matchExactModel(model, yearModels) && !rule?.ranges) {
      const allYearModels = modelSource === "market_archive" ? await getVpicModelsForMake(make) : [];
      const knownToVpic = modelSource !== "market_archive" || Boolean(matchExactModel(model, allYearModels));
      if (knownToVpic && modelSource !== "alias") {
        return baseResult("invalid_vehicle", partialVehicle({ make, model }), {
          question: `I don't think there was a ${year} ${make} ${model}. Can you let me know the actual ${make} model so I can tell you the best place to sell it?`,
          chips: await modelSuggestionChips(taxonomy, make, year, yearModels, archiveModelNames),
          suggestion: null,
          baseVehicle: [year, make].join(" ")
        }, corrections);
      }
    }
  }

  if (!model) {
    return baseResult("needs_clarification", partialVehicle({ make, confidence: makeConfidence }), {
      question: `Which model is the ${year} ${make}? Pick one below, or type the exact model if it is not shown.`,
      chips: await modelSuggestionChips(taxonomy, make, year, yearModels, archiveModelNames),
      baseVehicle: [year, make].join(" ")
    }, corrections);
  }

  // 5. Trim: whatever meaningful text is left after the model is accounted for.
  let trim = extractTrim(remainder, modelSource === "alias" ? modelAlias?.alias : model, aliasTrim);
  if (freedYearToken && trim && normalize(model) !== normalize(freedYearToken)) {
    trim = asText(trim.replace(new RegExp(`\\b${freedYearToken}\\b`, "g"), "").replace(/\s+/g, " ")) || null;
  }

  const vehicle = {
    raw: text,
    year,
    yearRange,
    make,
    model,
    trim,
    color,
    mileage,
    bodyStyle,
    generationHint,
    confidence: makeConfidence === "high" ? "high" : "medium",
    canonicalLabel: [year || yearRangeLabel(yearRange), make, model, trim].filter(Boolean).join(" ")
  };
  return baseResult("valid", vehicle, null, corrections);
}
