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
  EXTRA_MAKES,
  PRODUCTION_RULES,
  SINGLE_MODEL_MAKES,
  YEAR_TRIM_RULES,
  AMBIGUOUS_NICKNAMES,
  BODY_STYLE_SPLITS,
  TRIM_VOCABULARY,
  porscheSuggestionChips
} from "./vehicleData.js";
import { supabaseEnv, supabaseSelect } from "./_supabase.js";
import { OLDCARSDATA_BASE, fetchJson } from "./_ocd.js";
import { loadAllGenerations } from "./generations.js";

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
// Sub-brand words that OldCarsData files as standalone "models" from auction
// titles (a bare "AMG" for Mercedes). They are not real models and, left in
// the model universe, hijack real designations ("C63 AMG" -> model "AMG"),
// so they are stripped from every model-name list before matching.
const NON_MODEL_TOKENS = new Set(["amg"]);
const dropNonModels = names => (names || []).filter(name => !NON_MODEL_TOKENS.has(normalize(name)));
// OldCarsData bakes a production span into some model names ("Bel Air
// (1953-1954)", "AK Series Pickup (1941-1947)"), which then never exact-match
// clean input ("bel air"). Strip the trailing parenthetical so the nameplate
// is recognized; the year still lands via the resolved year field.
const cleanModelName = name => String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
// Some catalogs prefix the make onto the model ("Nissan Z", "Nissan GT-R"), so
// input "Z" never matches. Strip a leading make word when a separator follows,
// so the bare nameplate is recognized. Word-boundary-guarded: "Mazda3" (no
// separator) and models that merely start with the make's letters are untouched.
function stripMakePrefix(name, make) {
  if (!name || !make) return name;
  const stripped = String(name).replace(new RegExp(`^${escapeRegExp(make)}[\\s-]+`, "i"), "").trim();
  return stripped.length >= 1 ? stripped : name;
}
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
  const match = clean.match(/\b(\d{1,3})(?:k|000)?[\s-]*(?:miles|mile|mi)\b/);
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
    // OldCarsData is the authoritative make list (its universe is real auction
    // marques, so it never carries the RV/trailer/equipment brands that collide
    // with model names). Only a small curated set of newer marques it omits is
    // added; the full vPIC make dump is deliberately NOT unioned in.
    try {
      const json = await fetchJson(`${OLDCARSDATA_BASE}/makes`);
      makes = uniqueValues([...(json.data || []), ...EXTRA_MAKES]);
    } catch {
      makes = null;
    }
  }
  if (!makes?.length) {
    try {
      makes = uniqueValues([...(await getVpicMakes()), ...EXTRA_MAKES]);
    } catch {
      makes = uniqueValues([...MAKE_ALIASES.map(item => item.make), ...MODEL_OWNERSHIP.flatMap(item => item.makes), ...EXTRA_MAKES]);
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
      // Apply the same non-model filter as the OCD/vPIC paths (Aug 2026): the seeded
      // taxonomy_models table carries an "AMG" row (a Mercedes sub-brand, not a model),
      // and without this filter it leaked in as a model and hijacked "S55 AMG" ->
      // model "AMG". Local (no DB) was correct because the OCD path already dropped it.
      models = rows
        .filter(row => !NON_MODEL_TOKENS.has(normalize(row.name)))
        .map(row => ({ name: row.name, yearRanges: row.year_ranges || null }));
    }
  }
  if (!models) {
    try {
      const json = await fetchJson(`${OLDCARSDATA_BASE}/models?make=${encodeURIComponent(make)}`);
      models = dropNonModels((json.data || []).map(cleanModelName).map(n => stripMakePrefix(n, make))).map(name => ({ name, yearRanges: null }));
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
    // vPIC matches the make name by CONTAINS: "Ford" also returns models from
    // "Bradford Built", "CRANFORD RADIATOR INC.", etc. Anchor to the exact make
    // (Make_Name normalizes to the canonical make) and drop non-model tokens,
    // exactly as getVpicModelsForMake already does.
    const wanted = normalize(canonicalMake);
    models = dropNonModels([...new Set(
      results
        .filter(item => normalize(item.Make_Name) === wanted)
        .map(item => item.Model_Name)
        .filter(Boolean)
    )]);
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
    models = dropNonModels([...new Set(results.map(item => item.Model_Name).filter(Boolean))]).map(n => stripMakePrefix(n, canonicalMake));
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
    .filter(token => token.length >= 3 && !/^\d{1,2}$/.test(token) && !TRIM_STOPWORDS.has(token) && !AMBIGUOUS_ENGLISH_MODELS.has(token))
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

// VIN decode (B9). A 17-char VIN uses only A-Z0-9 minus I/O/Q. Detected on a word
// boundary so it never fires on a normal make/model. vPIC's free DecodeVinValues
// returns ModelYear/Make/Model even for imperfect check digits (non-blocking error
// codes); a null/failed decode returns null so the caller falls through gracefully.
function detectVin(text) {
  const m = String(text || "").toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return m ? m[0] : null;
}
async function decodeVin(vin) {
  try {
    const res = await fetch(`${VPIC_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const row = (json.Results && json.Results[0]) || {};
    const make = row.Make ? prettyMakeName(row.Make) : null;
    const model = row.Model ? String(row.Model).trim() : null;
    const year = row.ModelYear && /^\d{4}$/.test(String(row.ModelYear)) ? Number(row.ModelYear) : null;
    return make ? { year, make, model } : null;
  } catch { return null; }
}

// Fix 2: systematic make typo resolution. A single canonical make within
// normalized edit-distance <=2 of an input token (or its capitalized first word,
// so "mercedez" reaches "Mercedes-Benz") resolves SILENTLY; several equally close
// makes ask; nothing close falls through to the friendly re-ask. Short makes need
// a tighter distance so "audi"/"auto" style collisions never fire. Fuzziness lives
// ONLY here at user-input resolution; everything downstream uses the canonical make.
function makeTypoTargets(make) {
  const canon = normalize(make);
  const first = normalize(String(make).split(/[\s-]+/)[0] || "");
  const targets = [canon];
  if (first && first.length >= 5 && first !== canon) targets.push(first);
  return targets;
}
function resolveMakeTypo(text, makes, consumedTokens = new Set()) {
  const tokens = normalize(text).split(/\s+/)
    .filter(token => token.length >= 4 && !/^\d+$/.test(token) && !consumedTokens.has(token));
  if (!tokens.length) return null;
  const hits = new Map();
  for (const make of makes) {
    for (const target of makeTypoTargets(make)) {
      const cap = target.length <= 5 ? 1 : 2; // tighter for short makes
      for (const token of tokens) {
        if (token === target) continue; // exact handled upstream
        if (Math.abs(token.length - target.length) > cap) continue;
        const d = levenshtein(token, target);
        if (d <= cap) {
          const prev = hits.get(make);
          if (!prev || d < prev.d) hits.set(make, { d, token });
        }
      }
    }
  }
  if (!hits.size) return null;
  const best = Math.min(...[...hits.values()].map(h => h.d));
  const top = [...hits.entries()].filter(([, h]) => h.d === best);
  if (top.length === 1) return { make: top[0][0], token: top[0][1].token, distance: best };
  return { ambiguous: top.map(([m]) => m), token: top[0][1].token };
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

// gentle mode keeps colors and filler words in place. Real model names contain
// both ("Silver Shadow", "Silver Cloud", "Model A"), and stripping them before
// exact model matching destroyed the nameplate (Silver -> color, A -> filler),
// so the exact-match pass runs on the gentle text; trim/color extraction still
// runs on the fully cleaned text.
function removeKnownNoise(raw, make, year, aliasTexts = [], opts = {}) {
  let value = asText(raw);
  if (year) value = value.replace(new RegExp(`\\b${year}\\b`, "g"), " ");
  if (make) value = value.replace(new RegExp(escapeRegExp(make), "ig"), " ");
  if (make === "Alfa Romeo") value = value.replace(/\balfa(?:\s+romeo)?\b/gi, " ");
  for (const aliasText of aliasTexts) {
    const flexible = normalize(aliasText).split(/\s+/).map(escapeRegExp).join("['\\s-]*");
    value = value.replace(new RegExp(`(^|[^a-z0-9])${flexible}([^a-z0-9]|$)`, "ig"), "$1$2");
  }
  value = value.replace(/\b\d{1,3}(?:,\d{3})*(?:k)?\s*(?:miles|mile|mi|km)\b/gi, " ");
  if (!opts.gentle) {
    value = value
      .replace(NOISE_WORDS, " ")
      .replace(new RegExp(`\\b(${COMMON_COLORS.join("|")})\\b`, "gi"), " ");
  }
  return value.replace(/\s+/g, " ").trim();
}

function matchExactModel(text, modelNames) {
  return modelNames
    .filter(model => textHasTerm(text, model))
    .sort((a, b) => String(b).length - String(a).length)[0] || null;
}

// Glued numeric-model + trim decomposition (Aug 2026): "911R" / "911GT3" / "718S" are
// typed with no space, so the word-boundary model matcher never sees the "911" and the
// token survives to the last-resort designation path as a bogus unverified model
// ("911R"). When a token is <known numeric model><alpha suffix>, split it so the model
// resolves normally and the suffix becomes the trim candidate (the trim whitelist drops
// any garbage suffix). GUARDS: never split a token that is ITSELF a known model / alias /
// generation code (300SL, 635CSi, 240D, 335i), and only split when the numeric PREFIX is
// a known standalone model for this make. Pure-numeric tokens (930, 964, 991, 992
// generation codes) never match the alpha-suffix pattern, so they are inherently safe and
// resolve on their own. Make-scoped: the known-model sets are this make's only.
function decomposeGluedModelTrim(text, knownModelNorms, knownNumericModelNorms) {
  return String(text || "").replace(/\b(\d{2,4})([a-z][a-z0-9]{0,6})\b/gi, (whole, num, suf) => {
    if (knownModelNorms.has(normalize(whole))) return whole;        // whole token is a real model -> keep intact
    if (!knownNumericModelNorms.has(normalize(num))) return whole;  // prefix is not a known model -> keep intact
    return `${num} ${suf}`;                                          // split into model + trim candidate
  });
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
      // Load-bearing trailing letter (Aug 2026): never fuzzy-drop the letter off a
      // numeric-code token to reach the bare-number model. The suffix is a real model
      // distinction, not a typo (Mercedes 240D diesel vs 240 gas, 300SD, 190D; also
      // guards BMW 328i -> 328 etc.). Only this exact stem case is skipped; genuine
      // typos ("240x" for a real "240" only when no letter is meaningful) are unaffected.
      const numStem = token.match(/^(\d{2,4})[a-z]{1,3}$/);
      if (numStem && modelNorm === numStem[1]) continue;
      // Leading-digit / badge-to-badge guard (Aug 2026): a numeric-badge token
      // (600SL, 560SEL) must never fuzzy-map onto a DIFFERENT numeric badge (300SL).
      // The number IS the model identity, not a typo - a leading-digit swap reaches a
      // wholly different car. Genuine same-family typos should be seeded as real
      // badges (see vehicleData.js) or handled by the numeric-typo matcher on the
      // pure-number token; badge-to-badge fuzzy is always wrong.
      const tokBadge = token.match(/^\d{2,4}[a-z]{1,4}$/);
      const modBadge = modelNorm.replace(/\s+/g, "").match(/^\d{2,4}[a-z]{1,4}$/);
      if (tokBadge && modBadge) continue;
      const score = Math.max(similarity(token, modelNorm), ...modelTokens.map(part => similarity(token, part)));
      if (score >= 0.75 && score < 1 && (!best || score > best.score)) best = { model, token, score };
    }
  }
  return best;
}

// Includes negation/correction filler (DEFECT 4): "no the 854f" must never
// concatenate "no"/"the" into a model or suggestion leftover. No real trim is
// one of these words, so dropping them everywhere formatTrim runs is safe.
const TRIM_STOPWORDS = new Set(["a", "an", "the", "my", "i", "to", "for", "in", "it", "its", "is", "and",
  "no", "not", "nope", "nah", "wrong", "incorrect", "actually", "said", "meant", "that", "this", "one", "nvm", "nevermind", "mean"]);

// Model names that are ALSO everyday English words. A bare token of one of these in free
// text must NOT infer a make/model (e.g. "so i can't see anymore for today" was resolving
// to Honda Today). Excluded from bare-model make-inference only; an explicit make ("Honda
// Today") still resolves through normal model matching. Extend as real false-positives
// surface (kept deliberately tight to avoid blocking legitimate bare queries like "civic").
const AMBIGUOUS_ENGLISH_MODELS = new Set(["today"]);

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

// Rank candidate models by our own recent sold-record volume (180 days), so
// chips lead with the models we can actually serve. Alphabetical only when no
// candidate has any records.
async function rankModelsByRecordVolume(taxonomy, make, candidates) {
  const list = uniqueValues(candidates || []);
  if (!list.length) return [];
  if (!taxonomy.env) return [...list].sort((a, b) => a.localeCompare(b));
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  // sales_archive is the deduped auction archive (merge-duplicates on source_id),
  // so its per-model counts are real distinct sales. vehicle_market_records is
  // NOT usable for ranking: records with no upstream ID get a fresh UUID each
  // fetch, so its counts measure fetch frequency, not sales.
  const rows = await supabaseSelect(
    taxonomy.env,
    `sales_archive?select=model&make=ilike.${encodeURIComponent(make)}&sale_date=gte.${cutoff}&limit=2000`
  );
  const counts = new Map();
  for (const row of rows || []) if (row.model) counts.set(normalize(row.model), (counts.get(normalize(row.model)) || 0) + 1);
  const withCount = list.map(name => ({ name, n: counts.get(normalize(name)) || 0 }));
  if (!withCount.some(c => c.n > 0)) return [...list].sort((a, b) => a.localeCompare(b));
  return withCount.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map(c => c.name);
}

async function modelSuggestionChips(taxonomy, make, year, yearModels, archiveModels) {
  if (normalize(make) === "porsche" && year) return porscheSuggestionChips(year).concat("Not sure");
  // yearModels are now make-anchored + non-model-filtered. Rank them by the
  // models we actually hold recent records for, then take the top 5 (replaces
  // the blind slice(0,5) that let alphabetics/junk crowd out real models).
  if (yearModels?.length) {
    const ranked = await rankModelsByRecordVolume(taxonomy, make, yearModels);
    return ranked.slice(0, 5).concat("Not sure");
  }
  // No year-specific taxonomy: use our own real sales for that era, ordered by
  // frequency, so chips never offer models that did not exist yet. sales_archive
  // (deduped on source_id), not vehicle_market_records, so counts are real sales.
  if (year && taxonomy.env) {
    const rows = await supabaseSelect(
      taxonomy.env,
      `sales_archive?select=model&make=ilike.${encodeURIComponent(make)}&year=gte.${year - 8}&year=lte.${year + 8}&limit=1000`
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
    unverified: input.unverified ? true : undefined,
    canonicalLabel: asText(input.canonicalLabel) || [input.year, make, model, asText(input.trim)].filter(Boolean).join(" ")
  };
}

// Field-contamination guard (locked): tokens that belong to another wizard
// field (location, asking price) are stripped from the vehicle text before
// resolution and returned as hints, so they can never survive into the make,
// model, trim or car label ("2020 BMW M3, US").
const US_STATE_NAMES = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming"];
const REGION_TOKENS = { us: "US", usa: "US", "u s": "US", "u s a": "US", "united states": "US", america: "US", uk: "UK", "united kingdom": "UK", england: "UK", scotland: "UK", wales: "UK", europe: "Europe", australia: "Australia", "middle east": "Middle East" };

const CONDITION_TOKENS = ["half restored", "fully restored", "unrestored", "restored", "barn find", "needs work", "project car", "project", "survivor", "mint condition", "mint", "rough shape", "rough"];

function extractFieldHints(text) {
  let working = asText(text);
  const hints = {};
  // Possessives and hedge words are commentary, never content ("wife's lexus
  // lx470 maybe 2004 not sure exact year"). Hedged years resolve but come
  // back tentative so the user confirms.
  const beforeHedges = working;
  working = working
    .replace(/\b(my|our|the)?\s*(wife'?s?|husband'?s?|dad'?s?|mom'?s?|mum'?s?|partner'?s?|son'?s?|daughter'?s?|buddy'?s?|friend'?s?)\s+/gi, " ")
    .replace(/\bnot (100% )?sure (of |about )?(the )?(exact )?(year|model)\b/gi, " ")
    .replace(/\b(maybe|i think|i believe|probably|possibly|roughly|approx(imately)?)\b/gi, " ")
    .replace(/\bor so\b/gi, " ")
    .replace(/(\d{4})\s*-?\s*ish\b/gi, "$1")
    .replace(/\s+/g, " ").trim();
  if (working !== beforeHedges && /\b(19|20)\d{2}\b/.test(working) && /maybe|i think|not sure|probably|possibly|ish\b|or so/i.test(beforeHedges)) {
    hints.tentativeYear = true;
  }
  // Condition tokens belong in notes, never the car label ("73 bronco half
  // restored").
  for (const token of CONDITION_TOKENS) {
    const re = new RegExp(`(^|[^a-z0-9])${token.replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "i");
    if (re.test(working)) {
      hints.conditionHint = token;
      working = working.replace(new RegExp(token.replace(/\s+/g, "\\s+"), "gi"), " ").replace(/\s+/g, " ").trim();
      break;
    }
  }
  // Region tokens (US, UK...) strip even bare; state names only strip with
  // an explicit separator (comma, or "in ..."), because states collide with
  // model names (Ferrari California).
  const regionAlt = Object.keys(REGION_TOKENS).map(t => t.replace(/\s+/g, "\\s+")).join("|");
  const stateAlt = US_STATE_NAMES.map(t => t.replace(/\s+/g, "\\s+")).join("|");
  // The region token must sit on a word boundary: without the \b a bare "us"
  // matched the tail of "bus" (and "uk" the tail of "souk"), slicing the model
  // out of "1972 VW Bus" so it never resolved.
  const regionMatch = working.match(new RegExp("[,.]?\\s*(?:located\\s+)?(?:in\\s+)?(?:the\\s+)?\\b(" + regionAlt + ")\\.?\\s*$", "i"));
  const stateMatch = working.match(new RegExp("(?:[,.]\\s*|\\b(?:located\\s+)?in\\s+)(" + stateAlt + ")\\.?\\s*$", "i"));
  if (stateMatch) {
    const token = stateMatch[1].toLowerCase().replace(/\s+/g, " ");
    hints.locationHint = { region: "US", state: token.replace(/\b[a-z]/g, c => c.toUpperCase()) };
    working = working.slice(0, stateMatch.index).trim();
  } else if (regionMatch) {
    const token = regionMatch[1].toLowerCase().replace(/\s+/g, " ");
    hints.locationHint = { region: REGION_TOKENS[token], state: null };
    working = working.slice(0, regionMatch.index).trim();
  }
  // Trailing price shapes only ("around 60k", "asking $45,000"); requires a
  // $ or k so plain years can never be mistaken for money.
  const priceMatch = working.match(/[,.]?\s*(?:around|about|asking|for|at)?\s*(\$\s?\d[\d,]*k?|\d{2,3}k)\s*$/i);
  if (priceMatch && /(around|about|asking|for|at|\$|k\s*$)/i.test(priceMatch[0])) {
    hints.priceHint = priceMatch[1].replace(/\s+/g, "");
    working = working.slice(0, priceMatch.index).trim();
  }
  return { working: working.replace(/[,\s]+$/, "").trim(), ...hints };
}

// A trim token is provably car-like when it is in the curated vocabulary or
// is an alphanumeric containing a digit AND a letter (4S, Z06, 335i, GT350).
// Pure numbers ("88", "2016") and conversational words ("weird", "about")
// never pass. Dropped tokens are reported so dirty input can be arbitrated.
export function trimTokenAllowed(token) {
  const clean = normalize(token);
  if (!clean) return false;
  if (TRIM_VOCABULARY.has(clean)) return true;
  // Mileage shorthand (12k) and mile-count fragments are never trims.
  if (/^\d+k$/.test(clean) || /^\d+(k)?\s*mile(s)?$/.test(clean)) return false;
  return /[a-z]/.test(clean) && /\d/.test(clean);
}

function validateTrimTokens(trim) {
  if (!trim) return { trim: null, dropped: [] };
  const kept = [];
  const dropped = [];
  for (const token of String(trim).split(/\s+/).filter(Boolean)) {
    (trimTokenAllowed(token) ? kept : dropped).push(token);
  }
  return { trim: kept.length ? kept.join(" ") : null, dropped };
}

// Sanity check used by the battery and the corpus replay: every token of a
// rendered label must be the year/range, the make, the model, or a
// whitelisted trim token.
export function labelIsProvablyCar(label, vehicle) {
  if (!label || !vehicle?.make || !vehicle?.model) return false;
  const consumed = new Set([
    ...(vehicle.year ? [String(vehicle.year)] : []),
    ...(vehicle.yearRange ? [`${vehicle.yearRange.start}s`, `${vehicle.yearRange.start}-${vehicle.yearRange.end}`] : []),
    ...normalize(vehicle.make).split(/\s+/),
    ...normalize(vehicle.model).split(/\s+/)
  ].map(normalize));
  return normalize(label).split(/\s+/).filter(Boolean).every(token =>
    consumed.has(token) || trimTokenAllowed(token)
  );
}

export async function resolveVehicle(rawInput, options = {}) {
  const fieldHints = extractFieldHints(rawInput);
  const text = fieldHints.working || asText(rawInput);
  // VIN decode (B9): a pasted 17-char VIN resolves via vPIC (free, already used for
  // makes/models) to year/make/model, then re-resolves through the normal path for
  // canonicalization. Guarded against recursion; any failure (no VIN, vPIC down, no
  // make decoded) falls through to the normal flow -> today's graceful re-ask.
  if (!options._vinResolved) {
    const vin = detectVin(text);
    if (vin) {
      const decoded = await decodeVin(vin);
      if (decoded && decoded.make) {
        const canonicalText = [decoded.year, decoded.make, decoded.model].filter(Boolean).join(" ");
        const resolved = await resolveVehicle(canonicalText, { ...options, _vinResolved: true });
        resolved.corrections = [{ type: "vin_decode", from: vin, to: canonicalText }, ...(resolved.corrections || [])];
        return resolved;
      }
    }
  }
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
    raw: text, year, yearRange, make: null, model: null, trim: null, color, mileage, bodyStyle, confidence: "low",
    locationHint: fieldHints.locationHint || null, priceHint: fieldHints.priceHint || null,
    conditionHint: fieldHints.conditionHint || null, ...extra
  });

  // 1. Make: exact taxonomy hit first, then silent abbreviation, then misspelling
  //    (confirm), then fuzzy (confirm).
  let make = matchExactMake(text, taxonomy.makes);
  // "Rover" is a defunct marque and a substring of "Land Rover" (a make) and
  // "Range Rover" (a Land Rover model). When the text is really a Land Rover
  // family car, never let the bare "Rover" match win.
  if (normalize(make) === "rover" && /\b(land\s*rover|range\s*rover)\b/i.test(text)) make = "Land Rover";
  // Make-owner preference (Aug 2026): when the text names a model whose SOLE owner
  // make is ALSO spelled out in the same input, that owner wins over any other make
  // token. "2003 Ford Mustang SVT Cobra" must resolve to Ford (Mustang's owner) and
  // never to the AC/Shelby "Cobra" make, which matchExactMake picks only because it
  // is a longer token. Requires the owner make to be explicitly present, so it never
  // over-fires on a bare model.
  if (make) {
    for (const item of MODEL_OWNERSHIP) {
      if (item.makes.length !== 1) continue;
      const owner = item.makes[0];
      if (normalize(owner) === normalize(make)) continue;
      if (item.aliases.some(alias => textHasTerm(text, alias)) && textHasTerm(text, owner)) {
        make = owner;
        break;
      }
    }
  }
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
      // Product rule 6: a curated make MISSPELLING CONFIRMS ("Did you mean the X?"),
      // it never silently auto-corrects - only ABBREVIATIONS (kind !== misspelling)
      // do. Same treatment as a non-curated edit-distance/fuzzy make typo below.
      const suggestion = await buildCleanSuggestion(taxonomy, makeAlias.make, year, removeKnownNoise(text, null, year, [makeAlias.alias]));
      corrections.push({ type: "typo", from: makeAlias.alias, to: makeAlias.make });
      // Carry the proposed make so the cold-entry probe (entry.js `understood`) starts
      // the wizard, which re-resolves and renders this same confirmation. The status
      // is still needs_confirmation, so nothing treats it as resolved.
      return confirmationResult(partialVehicle({ make: makeAlias.make }), `Did you mean the ${makeAlias.make}?`, suggestion, corrections);
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

  // Make TYPO -> CONFIRM (product rule 6: a misspelled make ALWAYS confirms, never
  // silently auto-corrects the way an abbreviation does). Runs even when a model has
  // already inferred the make ("Poesche 911" -> the user still misspelled "Porsche"),
  // so the model tokens consumed by inference/alias are excluded: a model that reads
  // like a make ("lancer" ~ "lancia") is never treated as a make typo. An exact or
  // abbreviated make never reaches here (it is set with no leftover typo token). A
  // single confident match asks "Did you mean the X?"; several equally close makes ask
  // which; nothing close falls through to the friendly re-ask / fuzzy confirm below.
  {
    const typoConsumed = new Set(consumedAliasTexts.map(normalize));
    if (inferredModelHint) String(inferredModelHint).split(/\s+/).forEach(t => typoConsumed.add(normalize(t)));
    const typo = resolveMakeTypo(text, taxonomy.makes, typoConsumed);
    // Only when the typo AGREES with the resolved make (the user misspelled the make
    // we found, e.g. "Poesche 911") or nothing was resolved. A confidently matched but
    // different make ("Ford Chevorlet") is never overridden by a stray near-miss token.
    if (typo && typo.make && (!make || normalize(typo.make) === normalize(make))) {
      const suggestion = await buildCleanSuggestion(taxonomy, typo.make, year, removeKnownNoise(text, null, year, [typo.token]));
      corrections.push({ type: "typo", from: typo.token, to: typo.make });
      // Carry the proposed make so the cold-entry probe starts the wizard (which
      // re-resolves and renders this confirmation); status stays needs_confirmation.
      return confirmationResult(partialVehicle({ make: typo.make }), `Did you mean the ${typo.make}?`, suggestion, corrections);
    }
    if (!make && typo && typo.ambiguous && typo.ambiguous.length > 1) {
      return baseResult("needs_clarification", partialVehicle({}), {
        question: `Which make did you mean: ${typo.ambiguous.slice(0, 3).join(", ")}?`,
        missing: ["make"],
        baseVehicle: year ? String(year) : "",
        chips: typo.ambiguous.slice(0, 3).concat("Something else")
      }, corrections);
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

  const ambiguousNickname = AMBIGUOUS_NICKNAMES.find(entry => textHasTerm(text, entry.alias));
  if (ambiguousNickname && !make) make = ambiguousNickname.make;
  if (ambiguousNickname && make === ambiguousNickname.make) {
    const named = ambiguousNickname.chips.some(chip => chip !== "Not sure" && textHasTerm(text, chip.split(/\s+/)[0]));
    if (!named) {
      return baseResult("needs_clarification", partialVehicle({ make }), {
        question: ambiguousNickname.question,
        missing: ["model"],
        baseVehicle: [year, make].filter(Boolean).join(" ") || make,
        chips: ambiguousNickname.chips
      }, corrections);
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

  // 2. A nameplate that belongs to a different make ("Porsche E-Type"). The
  // verdict is deferred until after model resolution: a bare number owned
  // elsewhere ("550" -> Porsche 550 Spyder) must not veto a real compound model
  // the make DOES own ("Ford F-550"), so the mismatch only stands when the make
  // could not resolve its own model from the text.
  const mismatch = modelOwnerMismatch(text, make, year);

  // 3. Model: vPIC year taxonomy exact, then archive exact, then alias, then
  //    misspelling alias (confirm), then digit typo (confirm), then fuzzy (confirm).
  const archiveModels = await getModelsForMake(taxonomy, make);
  const archiveModelNames = archiveModels.map(model => model.name);
  const yearModels = await getVpicModelsForMakeYear(make, year);
  // Known-model sets for this make, then split glued model+trim tokens ("911R" ->
  // "911 R") so the matcher sees the model. knownModelNorms guards whole tokens that are
  // real models/aliases; knownNumericModelNorms are the numeric standalone models a glued
  // suffix may follow.
  const knownModelNorms = new Set();
  const knownNumericModelNorms = new Set();
  const addModelNorm = name => {
    const n = normalize(name);
    if (!n) return;
    knownModelNorms.add(n);
    const head = n.split(/\s+/)[0];
    if (/^\d{2,4}$/.test(head)) knownNumericModelNorms.add(head);
  };
  for (const name of [...archiveModelNames, ...yearModels]) addModelNorm(name);
  for (const rule of PRODUCTION_RULES) if (normalize(rule.make) === normalize(make)) { addModelNorm(rule.model); (rule.aliases || []).forEach(addModelNorm); }
  for (const a of (taxonomy.aliases?.modelAliases || [])) if (normalize(a.make) === normalize(make)) knownModelNorms.add(normalize(a.alias));
  const gluedText = decomposeGluedModelTrim(text, knownModelNorms, knownNumericModelNorms);
  const remainder = removeKnownNoise(gluedText, make, year, consumedAliasTexts);
  // Exact model matching sees colors and filler (a real nameplate may include
  // them: "Silver Shadow", "Model A"); trim/typo/fuzzy work off `remainder`.
  const modelText = removeKnownNoise(gluedText, make, year, consumedAliasTexts, { gentle: true });

  let model = null;
  let modelSource = null;
  const yearExact = matchExactModel(modelText, yearModels);
  const archiveExact = yearExact ? null : matchExactModel(modelText, archiveModelNames);
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

  // vPIC's exact-year list is notoriously incomplete: a 2018 BMW query returns
  // 59 models and omits the entire 8 Series, i8 and Z-cars, so a real model the
  // seller actually typed (M850i) falls through every exact source and gets
  // mis-corrected by the typo matcher into a different real car (M550i). The
  // make's full all-years vPIC catalog is the comprehensive, free
  // (non-metered) source of truth; an exact hit there is a real model and is
  // accepted as-is. Year plausibility stays owned by the curated/generation/
  // records checks below, never by the unreliable exact-year list. Fetched
  // lazily so the common path (year/archive/alias hit) pays nothing.
  if (!model) {
    const catalogModels = await getVpicModelsForMake(make);
    const catalogExact = matchExactModel(modelText, catalogModels);
    if (catalogExact) {
      model = catalogExact;
      modelSource = "vpic_catalog";
    }
  }

  // Ownership mismatch stands only if the make could not explain the text with
  // one of its own models (deferred from step 2 above).
  if (!model && mismatch && !aliasModel) {
    return baseResult("invalid_vehicle", partialVehicle({ make }), mismatch, corrections);
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

  // 4. Production-year validity for the resolved model. Trim-scoped rules
  // (Raptor is 2010+) match via the original text so a nickname-set trim
  // still gets its honest year conflict.
  if (model) {
    const dbRanges = archiveModels.find(item => normalize(item.name) === normalize(model))?.yearRanges || null;
    let rule = productionRuleFor(make, model, dbRanges);
    if (!rule?.ranges) {
      const textRule = PRODUCTION_RULES.find(candidate =>
        normalize(candidate.make) === normalize(make) &&
        candidate.aliases.some(alias => textHasTerm(text, alias)));
      if (textRule) rule = textRule;
    }
    if (rule?.ranges && year && !yearInRanges(year, rule.ranges)) {
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
        // The year is the suspect field; make+model are known. Keeping the
        // bad year in the base made a corrected year merge into garbage
        // ("1950 Toyota 1986") and dropped the model.
        baseVehicle: [make, model].filter(Boolean).join(" ")
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
          // Generations are curated PRODUCTION spans, but coverage may be partial
          // for a model, so this must never assert a production FACT (a partly
          // mapped model would make the claim false, as the AE86-only Corolla map
          // once did). Frame it as our data coverage and always offer to proceed.
          return baseResult("needs_clarification", partialVehicle({ make, model }), {
            question: `A ${year || yearRangeLabel(yearRange)} ${make} ${model} is outside the range I have solid data for (${genMin} to ${genMax}). Double-check the year, or say 'Not sure' and I'll go with it as-is.`,
            missing: ["year"],
            baseVehicle: [make, model].join(" "),
            chips: ["Change car", "Not sure"]
          }, corrections);
        }
      }
      // No curated rule and no generation map: our SALES ARCHIVE year span reflects
      // inventory (what we happen to have ingested), NOT production, so it can never
      // back a year-range claim (a 2020 G-Class is real even if our records stop at
      // 2010). With no reliable production-year source, we do NOT challenge the year
      // at all - the car proceeds unverified and the evidence ladder reads it
      // honestly. (Absurd years are already nulled at parse: 1900..2100, line ~685.)
    }

    // A curated year->trim rule resolves the variant instead of failing the
    // year check ("2015 Ferrari California" -> California T).
    const yearTrimRule = year ? YEAR_TRIM_RULES.find(r =>
      normalize(r.make) === normalize(make) && normalize(r.model) === normalize(model) &&
      year >= r.yearStart && year <= r.yearEnd) : null;

    // Model exists in general but vPIC has no sign of it for this specific year.
    // A catalog-verified model (vpic_catalog) is a confirmed real nameplate;
    // the exact-year list is too incomplete to override that, so it is never
    // rejected here (a valid 2019 M850i must not be refused because vPIC's 2019
    // list happens to omit it). Genuine year mismatches surface through the
    // curated/generation/records checks above, not this list.
    if (!yearTrimRule && modelSource !== "vpic_catalog" && yearModels.length && !matchExactModel(model, yearModels) && !rule?.ranges) {
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

  // Last-resort recognition before we ask (locked: never fail to recognize a
  // real model designation the seller typed). Everything ahead of here has
  // already tried every catalog plus the misspelling, numeric-typo and fuzzy
  // matchers, so a surviving mixed letter+digit token (E63, C63, RS6, 350Z) is
  // a genuine designation, not a typo of a known model: accept it as-is instead
  // of dead-ending. Pure words are conversation; bare numbers are the typo
  // matcher's domain; both are deliberately excluded.
  if (!model) {
    const designation = normalize(remainder).split(/\s+/).find(token =>
      /^[a-z0-9]{2,7}$/.test(token) && /[a-z]/.test(token) && /\d/.test(token));
    if (designation) {
      // Guard (C): an unrecognized designation is not automatically a real
      // model. First check it against the make's FULL catalog. A near-miss
      // (edit distance 1-2) to a real designation is a typo, so confirm it
      // ("Did you mean 850i?") instead of recording a fake model verbatim.
      // The seller can insist on their designation ("keep as typed"): skip the
      // near-miss confirmation and accept it as unverified (DEFECT 4).
      const catalog = options.keepAsTyped ? [] : uniqueValues([...(await getVpicModelsForMake(make)), ...archiveModelNames]);
      let close = null, closeDist = 3;
      for (const m of catalog) {
        const head = normalize(String(m)).split(/\s+/)[0];
        if (!head || !/[a-z]/.test(head) || !/\d/.test(head) || head === designation) continue;
        const d = levenshtein(designation, head);
        if (d >= 1 && d <= 2 && d < closeDist) { close = m; closeDist = d; }
      }
      if (close) {
        const leftover = formatTrim(removeKnownNoise(remainder, null, null, [designation]));
        const suggestion = [year, make, close, leftover].filter(Boolean).join(" ");
        return confirmationResult(
          partialVehicle({ make }),
          `Did you mean the ${year ? year + " " : ""}${make} ${close}?`,
          suggestion,
          corrections
        );
      }
      // No catalog match: accept the designation so the seller is never
      // dead-ended, but mark it UNVERIFIED. We never record an unrecognized
      // model as verified/high-confidence; downstream runs at make level and
      // says the read is broader than model-specific (C).
      model = designation.toUpperCase();
      modelSource = "seller_designation_unverified";
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
  // An alias-derived trim only applies when the model actually resolved to the
  // alias's own model. A make-scoped trim alias ("svt"/"cobra" -> Ford Mustang SVT
  // Cobra) must never stamp its trim onto a DIFFERENT model that an exact source
  // resolved ("Ford F-150 SVT" is not an F-150 "SVT Cobra").
  const aliasTrimForModel = aliasTrim && (!aliasModel || !model || normalize(aliasModel) === normalize(model))
    ? aliasTrim
    : null;
  let trim = extractTrim(remainder, modelSource === "alias" ? modelAlias?.alias : model, aliasTrimForModel);
  // Whitelist gate (locked): unconsumed tokens never enter the label. What
  // fails the vocabulary is conversation and gets dropped here, reported as
  // dirty so the LLM arbitration can recover meaning.
  const trimValidation = validateTrimTokens(trim);
  trim = trimValidation.trim;
  const dirtyTokens = trimValidation.dropped;
  if (!trim && year) {
    const yearTrim = YEAR_TRIM_RULES.find(r =>
      normalize(r.make) === normalize(make) && normalize(r.model) === normalize(model) &&
      year >= r.yearStart && year <= r.yearEnd);
    if (yearTrim) trim = yearTrim.trim;
  }
  if (freedYearToken && trim && normalize(model) !== normalize(freedYearToken)) {
    trim = asText(trim.replace(new RegExp(`\\b${freedYearToken}\\b`, "g"), "").replace(/\s+/g, " ")) || null;
  }

  // Porsche mid-engine BODY-STYLE split (Aug 2026): "718"/"981"/"987" are
  // generation names shared by the Boxster (roadster) and Cayman (coupe). Never
  // silently collapse the shared code to one body. A body-style-specific trim
  // (Spyder -> Boxster, GT4 -> Cayman) or the explicit word resolves the body and
  // keeps the trim; an AMBIGUOUS case keeps the shared name and the wizard asks
  // "Boxster or Cayman?" after the trim step.
  if (model && make) {
    const split = BODY_STYLE_SPLITS.find(s => normalize(s.make) === normalize(make));
    if (split) {
      const lower = normalize(text);
      // Distrust a body-split chassis-code alias (a bad seeded "718 -> Boxster"
      // row): revert to the shared code, then resolve the body from real signals.
      // Makes the fix robust even before the DB alias cleanup runs.
      if (modelAlias && split.codes.includes(String(modelAlias.alias)) && split.models.includes(model)) {
        model = String(modelAlias.alias);
      }
      if (split.codes.includes(String(model))) {
        if (/\bcayman\b/.test(lower)) model = "Cayman";
        else if (/\bboxster\b/.test(lower)) model = "Boxster";
        else { const sig = split.trimSignals.find(t => t.re.test(text)); if (sig) model = sig.model; }
      }
    }
  }

  const unverifiedModel = modelSource === "seller_designation_unverified";
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
    locationHint: fieldHints.locationHint || null,
    priceHint: fieldHints.priceHint || null,
    conditionHint: fieldHints.conditionHint || null,
    dirtyTokens: dirtyTokens.length ? dirtyTokens : null,
    // An unrecognized seller designation is never "high": we could not verify it
    // against any catalog, so downstream must read it as broader than model-
    // specific and never claim comp counts for it (C).
    confidence: unverifiedModel ? "low" : (makeConfidence === "high" ? "high" : "medium"),
    unverified: unverifiedModel || undefined,
    canonicalLabel: [year || yearRangeLabel(yearRange), make, model, trim].filter(Boolean).join(" ")
  };
  if (fieldHints.tentativeYear) {
    return confirmationResult(vehicle, `${vehicle.canonicalLabel}, sound right?`, vehicle.canonicalLabel, corrections);
  }
  return baseResult("valid", vehicle, null, corrections);
}
