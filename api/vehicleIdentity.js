const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";

const FALLBACK_MAKES = [
  "Porsche", "Ferrari", "BMW", "Mercedes-Benz", "Mercedes", "Audi",
  "Lamborghini", "Aston Martin", "Bentley", "Chevrolet", "Ford", "Dodge",
  "Toyota", "Honda", "Nissan", "Subaru", "Land Rover", "Jaguar", "McLaren",
  "Alfa Romeo", "Acura", "Maserati", "Lotus"
];

const MODEL_OWNER_ALIASES = [
  { model: "E-Type", makes: ["Jaguar"], aliases: ["etype", "e type", "e-type"], suggestion: "Jaguar F-Type", suggestionStart: 2013 },
  { model: "F-Type", makes: ["Jaguar"], aliases: ["ftype", "f type", "f-type"] },
  { model: "911", makes: ["Porsche"], aliases: ["911"] },
  { model: "Supra", makes: ["Toyota"], aliases: ["supra"] },
  { model: "Highlander", makes: ["Toyota"], aliases: ["highlander"] },
  { model: "NSX", makes: ["Acura", "Honda"], aliases: ["nsx"] },
  { model: "R8", makes: ["Audi"], aliases: ["r8"] },
  { model: "GT-R", makes: ["Nissan"], aliases: ["gtr", "gt r", "gt-r"] },
  { model: "370Z", makes: ["Nissan"], aliases: ["370z"] },
  { model: "M3", makes: ["BMW"], aliases: ["m3"] },
  { model: "360", makes: ["Ferrari"], aliases: ["360", "modena"] },
  { model: "F430", makes: ["Ferrari"], aliases: ["f430"] },
  { model: "458", makes: ["Ferrari"], aliases: ["458"] },
  { model: "488", makes: ["Ferrari"], aliases: ["488"] },
  { model: "Viper", makes: ["Dodge"], aliases: ["viper"] }
];

const VEHICLE_PRODUCTION_RULES = [
  { make: "Toyota", model: "Highlander", aliases: ["highlander"], start: 2001, end: 2026 },
  { make: "Toyota", model: "Supra", aliases: ["supra"], ranges: [[1978, 2002], [2020, 2026]] },
  { make: "Jaguar", model: "E-Type", aliases: ["etype", "e type", "e-type"], start: 1961, end: 1974, suggestion: "Jaguar F-Type", suggestionStart: 2013 },
  { make: "Jaguar", model: "F-Type", aliases: ["ftype", "f type", "f-type"], start: 2013, end: 2024 },
  { make: "Acura", model: "NSX", aliases: ["nsx"], ranges: [[1991, 2005], [2017, 2022]] },
  { make: "Honda", model: "NSX", aliases: ["nsx"], ranges: [[1991, 2005], [2017, 2022]] },
  { make: "Nissan", model: "370Z", aliases: ["370z"], start: 2009, end: 2020 },
  { make: "Nissan", model: "GT-R", aliases: ["gtr", "gt r", "gt-r"], start: 2009, end: 2024 },
  { make: "Audi", model: "R8", aliases: ["r8"], start: 2008, end: 2023 },
  { make: "BMW", model: "M3", aliases: ["m3"], start: 1986, end: 2026 }
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

function normalize(value) {
  return asText(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function textHasTerm(text, term) {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm.split(/\s+/).map(escapeRegExp).join("[\\s-]*");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(text);
}

function extractYear(text) {
  const year = asText(text).match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
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

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${json.message || json.error || "request failed"}`);
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

function matchMake(raw, makes) {
  const normalized = normalize(raw);
  const exact = makes
    .filter(make => textHasTerm(normalized, make))
    .sort((a, b) => String(b).length - String(a).length)[0];
  if (exact) return { value: exact, confidence: "high" };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let best = null;
  for (const make of makes) {
    for (const token of tokens) {
      const score = similarity(token, make);
      if (score >= 0.84 && (!best || score > best.score)) best = { value: make, score };
    }
  }
  return best ? { value: best.value, confidence: "medium" } : { value: null, confidence: "low" };
}

function removeKnownNoise(raw, make, year) {
  let value = asText(raw);
  if (year) value = value.replace(new RegExp(`\\b${year}\\b`, "i"), " ");
  if (make) value = value.replace(new RegExp(escapeRegExp(make), "ig"), " ");
  if (make === "Alfa Romeo") value = value.replace(/\balfa(?:\s+romeo)?\b/gi, " ");
  return value
    .replace(/\b(i have|i've got|my car is|to sell|sell|selling|with|miles|mile|mi|black|white|silver|gray|grey|red|blue|green|yellow|orange)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchModel(raw, models) {
  const normalized = normalize(raw);
  const exact = models
    .filter(model => textHasTerm(normalized, model))
    .sort((a, b) => String(b).length - String(a).length)[0];
  if (exact) return { value: exact, confidence: "high" };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let best = null;
  for (const model of models) {
    const modelNorm = normalize(model);
    const modelTokens = modelNorm.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const tokenScore = Math.max(similarity(token, modelNorm), ...modelTokens.map(modelToken => similarity(token, modelToken)));
      const score = tokenScore;
      if (score >= 0.78 && token.length >= 4 && (!best || score > best.score)) best = { value: model, score };
    }
  }
  return best ? { value: best.value, confidence: "medium" } : { value: null, confidence: "low" };
}

function modelOwnerMismatch(raw, make, year) {
  const normalized = normalize(raw);
  const rule = MODEL_OWNER_ALIASES.find(item =>
    item.aliases.some(alias => textHasTerm(normalized, alias)) && !item.makes.includes(make)
  );
  if (!rule) return null;
  const preferredMake = rule.makes[0];
  const suggestionModel = rule.suggestion && (!rule.suggestionStart || year >= rule.suggestionStart)
    ? rule.suggestion
    : `${preferredMake} ${rule.model}`;
  const suggestion = year ? `${year} ${suggestionModel}` : suggestionModel;
  return {
    status: "invalid_vehicle",
    question: `${rule.model} is a ${preferredMake} model, not a ${make}. Did you mean the ${suggestion}, or a different ${make} model?`,
    chips: [suggestion, `Different ${make} model`, "Change car", "Not sure"],
    suggestion,
    baseVehicle: [year, make].filter(Boolean).join(" ")
  };
}

function validYearForRule(year, rule) {
  if (!year) return true;
  if (rule.ranges) return rule.ranges.some(([start, end]) => year >= start && year <= end);
  return year >= rule.start && year <= rule.end;
}

function productionIssue(raw, make, model, year) {
  if (!year || !make || !model) return null;
  const normalized = normalize(raw);
  const rule = VEHICLE_PRODUCTION_RULES.find(item =>
    item.make === make &&
    normalize(item.model) === normalize(model) &&
    item.aliases.some(alias => textHasTerm(normalized, alias))
  );
  if (!rule || validYearForRule(year, rule)) return null;
  const replacement = rule.suggestion && (!rule.suggestionStart || year >= rule.suggestionStart);
  const question = replacement
    ? `The ${rule.model} wasn't produced in ${year}. Did you mean the ${year} ${rule.suggestion}?`
    : `The ${rule.model} wasn't produced in ${year}. Which ${make} model are we talking about?`;
  return {
    status: "invalid_vehicle",
    question,
    chips: replacement ? [`${year} ${rule.suggestion}`, "Change car", "Not sure"] : [`Different ${make} model`, "Change car", "Not sure"],
    suggestion: replacement ? `${year} ${rule.suggestion}` : null,
    baseVehicle: [year, make].filter(Boolean).join(" ")
  };
}

function matchKnownModelAlias(raw, make) {
  const normalized = normalize(raw);
  const rule = MODEL_OWNER_ALIASES.find(item =>
    item.makes.includes(make) && item.aliases.some(alias => textHasTerm(normalized, alias))
  );
  return rule ? { value: rule.model, confidence: "high" } : null;
}

async function identifyVehicle(raw) {
  const text = asText(raw);
  const year = extractYear(text);
  const makes = await getMakes();
  const makeMatch = matchMake(text, makes);
  const make = makeMatch.value;
  if (!year || !make) {
    return {
      status: "needs_clarification",
      vehicle: { raw: text, year, make, model: null, confidence: "low" },
      clarification: {
        question: "What year, make and model are we talking about?",
        chips: ["Change car", "Not sure"]
      }
    };
  }

  const mismatch = modelOwnerMismatch(text, make, year);
  if (mismatch) {
    return {
      status: "invalid_vehicle",
      vehicle: { raw: text, year, make, model: null, confidence: "low" },
      clarification: mismatch
    };
  }

  const models = await getModels(make);
  const remainder = removeKnownNoise(text, make, year);
  const modelMatch = matchModel(remainder, models);
  const knownModelMatch = modelMatch.value ? modelMatch : matchKnownModelAlias(remainder, make);
  const resolvedModel = knownModelMatch?.value || null;
  const invalidProduction = productionIssue(text, make, resolvedModel, year);
  if (invalidProduction) {
    return {
      status: "invalid_vehicle",
      vehicle: { raw: text, year, make, model: resolvedModel, confidence: "low" },
      clarification: invalidProduction
    };
  }
  if (!resolvedModel) {
    return {
      status: "needs_clarification",
      vehicle: { raw: text, year, make, model: null, confidence: makeMatch.confidence },
      clarification: {
        question: `${make} made a lot of different cars${year ? ` in ${year}` : ""}. Which model are we talking about? Pick one below, or type the exact model if it is not shown.`,
        chips: models.slice(0, 5).concat("Not sure"),
        baseVehicle: [year, make].filter(Boolean).join(" ")
      }
    };
  }

  return {
    status: "valid",
    vehicle: {
      raw: text,
      year,
      make,
      model: resolvedModel,
      confidence: makeMatch.confidence === "high" && knownModelMatch.confidence === "high" ? "high" : "medium",
      canonicalLabel: [year, make, resolvedModel].filter(Boolean).join(" ")
    },
    clarification: null
  };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.body?.text || req.body?.car || req.body?.search || req.body?.query;
  if (!raw) return res.status(400).json({ error: "Missing text" });

  try {
    const result = await identifyVehicle(raw);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Vehicle identity failed" });
  }
}
