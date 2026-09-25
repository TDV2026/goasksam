// Sam Desk — deterministic DICTIONARY LOOKUP (Stage A).
// =====================================================================
// Stage A has no model call yet (that is Stage B). To prove the dictionary + validator
// read the test questions correctly, this module does a DETERMINISTIC pass: longest-match
// dictionary phrases + numeric parsing ($ amounts, mileage, years) + residual nameplate
// resolution through the shared resolver, producing the same structured `reading` shape the
// interpreter will emit in Stage B, with a fate for every phrase (used / defaulted /
// not_applied / unresolved). The no-silent-drops rule (spec s7) is enforced here: every
// token of the question ends up in exactly one fate bucket.
//
// PURE except for the injected resolver (opts.resolveResidual), so it runs offline (dictionary
// only) and on the server (with resolveVehicle for explicit nameplates) with the same code.
// =====================================================================

import { phraseIndex, normalizePhrase, lowMileThresholdForYear } from "./dictionary.js";
import { generationsForModel } from "../generations.js";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "in", "on", "at", "to", "and", "or", "with", "from", "by",
  "what", "which", "how", "many", "much", "is", "are", "was", "were", "do", "does", "did",
  "sold", "sell", "sells", "selling", "most", "cars", "car", "that", "this", "these", "those",
  "over", "under", "about", "me", "my", "i", "show", "get", "give", "tell", "s", "'s", "last",
  "ever", "years", "year", "months", "month", "week", "days", "day", "ago", "now", "then",
  "anything", "everything", "something", "market", "vs", "versus", "compared", "against",
  "since", "been", "has", "have", "had", "the", "a"
]);
// Known trim/variant tokens: a scope REFINEMENT, not slang and not a nameplate on their own.
// Marked USED (variant) so they are never dropped and never logged as unresolved; attached to the
// nearest scope as a trim. (Stage B/DSL applies the trim; Stage A records it on the reading.)
const VARIANT_TOKENS = new Set(["turbo", "gt3", "gt2", "gt4", "gt3 rs", "gts", "carrera", "carrera s", "carrera t", "speedster", "rs", "cooper s", "type r", "gt350", "gt500", "hellcat", "z06", "zr1", "quadrifoglio", "gtb", "gtc"]);
// Market-spec tokens: applied by the resolver's marketSpec layer, not the dictionary (spec/memory).
const MARKETSPEC_TOKENS = new Set(["nas", "euro", "jdm-spec", "federal", "grey market", "grey-market"]);
// Condition / provenance words. Condition is NOT recorded (spec s6) -> not applied, said plainly.
// numbers-matching / original / restored are title-only filters (applied, labelled). Private = out of scope.
const CONDITION_NOT_APPLIED = ["concours condition", "concours", "mint", "pristine", "clean", "project", "rough", "barn find", "survivor", "condition"];
const CONDITION_TITLE_ONLY = ["numbers-matching", "numbers matching", "matching numbers", "original", "restored"];
const PRIVATE_NOT_APPLIED = ["sold privately", "private sale", "privately", "private sales"];

// Phrases that, when present with an ambiguous nickname, resolve it (spec s9).
const DISAMBIGUATORS = {
  "bird": [
    { needs: ["screaming chicken", "trans am", "t/a", "firebird", "pontiac"], keep: "Pontiac Firebird" },
    { needs: ["thunderbird", "ford"], keep: "Ford Thunderbird" }
  ]
};

function markSpan(consumed, start, end) { for (let i = start; i < end; i++) consumed[i] = true; }

// Find a normalized phrase as a whole-token run in text, tolerating a trailing plural ("Lussos",
// "M3s", "E-Types"); return {start,end} char offsets (span INCLUDING the plural) or null.
function findPhrase(text, phrase, consumed) {
  if (!phrase) return null;
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp("(^|[^a-z0-9])(" + body + "(?:e?s)?)([^a-z0-9]|$)", "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    const end = start + m[2].length;
    let free = true; for (let i = start; i < end; i++) if (consumed[i]) { free = false; break; }
    if (free) return { start, end };
    re.lastIndex = end;
  }
  return null;
}

// Parse a $-amount token like "100k", "$1m", "50000" into a number.
function parseMoney(raw) {
  const s = String(raw).toLowerCase().replace(/[$,\s]/g, "");
  const mm = s.match(/^([\d.]+)(k|m)?$/);
  if (!mm) return null;
  let n = parseFloat(mm[1]); if (!Number.isFinite(n)) return null;
  if (mm[2] === "k") n *= 1000; if (mm[2] === "m") n *= 1000000;
  return Math.round(n);
}

export async function lookupQuestion(question, opts = {}) {
  const raw = String(question || "");
  const text = normalizePhrase(raw);
  const consumed = new Array(text.length).fill(false);

  const reading = {
    question: raw,
    scopes: [], grouping: null, metric: null,
    filters: {}, window: null, windowDefaulted: false,
    structural: [], phrases: [], notApplied: []
  };
  const usedPhrases = [];   // {text, fate, note}
  const addPhrase = (t, fate, note) => usedPhrases.push({ text: t, fate, note: note || null });

  // ---- 1) VIN short-circuit (17 chars alnum, no I/O/Q) ----
  const vin = (text.match(/\b([a-hj-npr-z0-9]{17})\b/i) || [])[1];
  if (vin) {
    markSpan(consumed, text.indexOf(vin.toLowerCase()), text.indexOf(vin.toLowerCase()) + 17);
    addPhrase(vin, "used", "VIN -> decode + sales of cars like it (resolver/One Box)");
    reading.vin = vin.toUpperCase();
    if (typeof opts.resolveResidual === "function") {
      const r = await opts.resolveResidual(vin);
      if (r && r.make) reading.scopes.push({ make: r.make, model: r.model, generation: r.generation || null, year: r.year || null, source: "VIN" });
      else reading.notApplied.push({ text: vin, reason: "VIN did not decode to a model" });
    }
  }

  // ---- 2) dictionary longest-match ----
  // Stage A gate runs with includePending so the drafted (pending) groupings are shown reading
  // correctly for Sam's approval; production (Stage B) reads approved entries only.
  const idx = phraseIndex(!!opts.includePending);
  const matched = [];
  for (const { phrase, entry } of idx) {
    const hit = findPhrase(text, phrase, consumed);
    if (!hit) continue;
    markSpan(consumed, hit.start, hit.end);
    matched.push({ entry, phrase, at: hit.start });
  }
  matched.sort((a, b) => a.at - b.at);

  // Apply matched entries by type.
  const scopeEntries = [], groupingEntries = [], eraEntries = [];
  for (const { entry, phrase } of matched) {
    switch (entry.type) {
      case "scope": scopeEntries.push(entry); addPhrase(phrase, "used", entry.category); break;
      case "grouping": groupingEntries.push(entry); addPhrase(phrase, "used", "grouping (shown in full)"); break;
      case "era": eraEntries.push(entry); addPhrase(phrase, "used", "era -> model years"); break;
      case "window": reading.window = entry.window; addPhrase(phrase, "used", "window"); break;
      case "channel": reading.filters.channel = entry.channel; addPhrase(phrase, "used", "channel"); break;
      case "venue":
        if (entry.venue === "__event__" && entry.event) { reading.filters.venue = entry.event.label; reading.filters.event = entry.event; reading.window = { from: entry.event.from, to: entry.event.to }; addPhrase(phrase, "used", "event venue + dates"); }
        else { reading.filters.venue = entry.venue; addPhrase(phrase, "used", "venue"); }
        break;
      case "price": reading.filters.price = entry.price; addPhrase(phrase, "used", "price band"); break;
      case "mileage": reading.filters.mileage = { band: entry.mileage.band }; addPhrase(phrase, "used", "mileage band (era threshold)"); break;
      case "metric": reading.metric = { ...entry.metric }; addPhrase(phrase, "used", "metric"); break;
      case "body": reading.filters.body = entry.body; addPhrase(phrase, "used", "body"); break;
      case "transmission": reading.filters.transmission = entry.transmission; addPhrase(phrase, "used", "transmission"); break;
      case "structural":
        if (entry.structural.kind === "comparison") reading.structural.push({ kind: "comparison" });
        else if (entry.structural.kind === "group_by") reading.structural.push({ kind: "group_by", dimension: entry.structural.dimension });
        else if (entry.structural.kind === "limit") reading.structural.push({ kind: "limit", n: entry.structural.n });
        addPhrase(phrase, "used", "structural");
        break;
    }
  }

  // ---- 3) numeric parsing: price ----
  const priceUnder = text.match(/\bunder\s+\$?([\d.,]+\s?[km]?)/) || text.match(/\bsub[- ]?\$?([\d.,]+\s?[km]?)/) || text.match(/\bless than\s+\$?([\d.,]+\s?[km]?)/);
  const priceOver = text.match(/\bover\s+\$?([\d.,]+\s?[km]?)/) || text.match(/\bmore than\s+\$?([\d.,]+\s?[km]?)/) || text.match(/\babove\s+\$?([\d.,]+\s?[km]?)/);
  if (priceUnder && !/mile/.test(priceUnder[0])) { const n = parseMoney(priceUnder[1]); if (n) { reading.filters.price = { ...(reading.filters.price || {}), max: n, unit: "usd" }; const s = text.indexOf(priceUnder[0]); markSpan(consumed, s, s + priceUnder[0].length); addPhrase(priceUnder[0].trim(), "used", "price cap"); } }
  if (priceOver && !/mile/.test(priceOver[0])) { const n = parseMoney(priceOver[1]); if (n) { reading.filters.price = { ...(reading.filters.price || {}), min: n, unit: "usd" }; const s = text.indexOf(priceOver[0]); markSpan(consumed, s, s + priceOver[0].length); addPhrase(priceOver[0].trim(), "used", "price floor"); } }

  // ---- 3b) numeric parsing: mileage ----
  const milesUnder = text.match(/\bunder\s+([\d.,]+\s?k?)\s?miles?\b/) || text.match(/\bsub[- ]?([\d.,]+k?)\s?miles?\b/);
  if (milesUnder) { const n = parseMoney(milesUnder[1]); if (n) { reading.filters.mileage = { band: "low", threshold: n }; const s = text.indexOf(milesUnder[0]); markSpan(consumed, s, s + milesUnder[0].length); addPhrase(milesUnder[0].trim(), "used", "mileage cap"); } }

  // ---- 3c) explicit calendar year / since <year> ----
  const since = text.match(/\bsince\s+(19|20)\d{2}\b/);
  if (since) { const y = since[0].match(/(19|20)\d{2}/)[0]; reading.window = { from: `${y}-01-01`, to: null, label: `since ${y}` }; const s = text.indexOf(since[0]); markSpan(consumed, s, s + since[0].length); addPhrase(since[0], "used", "sale-date floor"); }
  const inYear = text.match(/\bin\s+((19|20)\d{2})\b/);
  if (inYear && !reading.window) { const y = inYear[1]; reading.window = { from: `${y}-01-01`, to: `${y}-12-31`, label: y }; const s = text.indexOf(inYear[0]); markSpan(consumed, s, s + inYear[0].length); addPhrase(inYear[0], "used", "calendar year"); }

  // ---- 3d) condition / provenance / private / market-spec / variant token passes ----
  const consumePhrase = (p, fate, note, sink) => {
    const hit = findPhrase(text, p, consumed);
    if (!hit) return false;
    markSpan(consumed, hit.start, hit.end); addPhrase(p, fate, note);
    if (sink) sink.push(p);
    return true;
  };
  for (const p of CONDITION_NOT_APPLIED) if (consumePhrase(p, "not_applied", "condition is not recorded; the receipts are the evidence (spec s6)")) reading.notApplied.push({ text: p, reason: "condition not recorded" });
  for (const p of CONDITION_TITLE_ONLY) if (consumePhrase(p, "used", "applied as a title filter, labelled 'by title only' (spec s6)")) { reading.filters.titleFlag = reading.filters.titleFlag || []; reading.filters.titleFlag.push(p); }
  for (const p of PRIVATE_NOT_APPLIED) if (consumePhrase(p, "not_applied", "our data is auction and platform sales only (spec s6)")) reading.notApplied.push({ text: p, reason: "private sales not covered" });
  const variantHits = [];
  for (const p of VARIANT_TOKENS) consumePhrase(p, "used", "trim/variant (scope refinement)", variantHits);
  const marketHits = [];
  for (const p of MARKETSPEC_TOKENS) consumePhrase(p, "used", "market spec (applied by the resolver marketSpec layer)", marketHits);

  // ---- 4) ambiguous-nickname resolution ----
  for (const s of scopeEntries) {
    if (s.category === "nickname" && (s.models || []).length >= 2 && DISAMBIGUATORS[normalizePhrase(s.phrase)]) {
      const rules = DISAMBIGUATORS[normalizePhrase(s.phrase)];
      let picked = null;
      for (const rule of rules) if (rule.needs.some(n => text.includes(n))) { picked = rule.keep; break; }
      s._resolvedTo = picked;   // null => still ambiguous => ask
    }
  }

  // ---- 5) assemble scopes ----
  for (const s of scopeEntries) {
    let models = s.models || [];
    if (s._resolvedTo) models = models.filter(mm => `${mm.make} ${mm.model}` === s._resolvedTo);
    else if (s.category === "nickname" && (s.models || []).length >= 2 && DISAMBIGUATORS[normalizePhrase(s.phrase)]) {
      reading.ambiguous = reading.ambiguous || [];
      reading.ambiguous.push({ phrase: s.phrase, options: (s.models || []).map(mm => `${mm.make} ${mm.model}`) });
      continue;   // do not add a scope; the clarifying question decides
    }
    for (const mm of models) {
      if (mm.makeOnly) { reading.makeOnly = reading.makeOnly || []; reading.makeOnly.push({ make: mm.make, phrase: s.phrase }); continue; }
      reading.scopes.push({ ...mm, source: s.phrase });
    }
  }
  if (groupingEntries.length) {
    const g = groupingEntries[0];
    const members = (g.members || []).map(x => ({ ...x }));
    // COLLAPSE: a grouping whose members are all the SAME make+model is really one generation-
    // bounded scope ("air-cooled 911s" = Porsche 911 to 1998), so it reads as a SINGLE read, not a
    // multi-member ranking (spec Q3). A multi-make/model grouping ("90s Japanese sports cars") stays
    // a grouping and ranks (spec Q5).
    const distinct = new Set(members.map(x => `${String(x.make).toLowerCase()}|${String(x.model).toLowerCase()}`));
    if (distinct.size === 1 && members.length) {
      const yr0 = Math.min(...members.map(x => x.yearStart).filter(Number.isFinite));
      const yr1 = Math.max(...members.map(x => x.yearEnd).filter(Number.isFinite));
      reading.scopes.push({ make: members[0].make, model: members[0].model, generation: null, yearStart: yr0, yearEnd: yr1, source: g.phrase, collapsedFrom: g.name });
      reading.collapsedGrouping = { name: g.name, into: `${members[0].make} ${members[0].model} ${yr0}-${yr1}`, status: g.status };
    } else {
      reading.grouping = { name: g.name, members, definedBy: g.definedBy, status: g.status };
    }
  }

  // ---- 6) chassis-code + model narrowing ("E30 M3": scope becomes M3 e30, not the 3-Series platform) ----
  // If a chassis-scope carries a generation whose year window also fits a nearby model token, and a
  // model word is present, prefer the specific model. Handled generically via the residual resolver
  // below (the resolver produces the precise nameplate); we keep both and dedupe.

  // ---- 7) residual nameplate resolution (explicit makes/models not in the dictionary) ----
  const residualTokens = [];
  let cur = ""; for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (i < text.length && !consumed[i] && /[a-z0-9'.-]/.test(ch)) cur += ch;
    else { if (cur) { const w = cur.trim(); if (w && !STOPWORDS.has(w)) residualTokens.push(w); } cur = ""; }
  }
  const residualText = residualTokens.join(" ").trim();
  reading.residualText = residualText;
  if (residualText && typeof opts.resolveResidual === "function") {
    const r = await opts.resolveResidual(residualText);
    if (r && r.make && r.model) {
      // dedupe against existing scopes by make+model
      const exists = reading.scopes.some(sc => String(sc.make).toLowerCase() === String(r.make).toLowerCase() && String(sc.model).toLowerCase() === String(r.model).toLowerCase());
      if (!exists) { reading.scopes.push({ make: r.make, model: r.model, generation: r.generation || null, trim: r.trim || null, year: r.year || null, source: residualText + " (resolver)" }); addPhrase(residualText, "used", "resolved nameplate"); }
      else addPhrase(residualText, "used", "redundant with a matched scope (already named)");
    } else {
      // Unresolved residual: if it carries a car-ish token, flag it unresolved; else not applied.
      addPhrase(residualText, "unresolved", "not in dictionary and did not resolve");
    }
  } else if (residualText) {
    // Offline: cannot resolve. Split residual into words and mark them unresolved (car-ish) so the
    // gate report shows the phrase rather than silently dropping it.
    addPhrase(residualText, "unresolved", "residual (no resolver supplied offline)");
  }

  // ---- 7b) E-code platform + M-car narrowing: "E30 M3" -> BMW M3 e30 (not the 3-Series platform) ----
  const mCarM = text.match(/\bm([2345])s?\b/);
  const mCar = mCarM ? "m" + mCarM[1] : null;
  if (mCar) {
    const mModel = mCar.toUpperCase();
    let rebound = false;
    for (const sc of reading.scopes) {
      if (/3-series|5-series/i.test(sc.model) && sc.generation) {
        const gens = generationsForModel(sc.make, mModel).map(g => String(g.code).toLowerCase());
        if (gens.includes(String(sc.generation).toLowerCase())) { sc.model = mModel; rebound = true; }
      }
    }
    if (rebound) {
      // drop a bare M-car scope (no generation) now duplicated by a rebound one
      reading.scopes = reading.scopes.filter(sc => !(String(sc.model).toLowerCase() === mCar.toLowerCase() && !sc.generation &&
        reading.scopes.some(o => o !== sc && String(o.model).toLowerCase() === mCar.toLowerCase() && o.generation)));
    }
  }

  // ---- 7c) attach trim/variant + market spec to the nearest scope ----
  if (variantHits.length && reading.scopes.length) { const sc = reading.scopes[reading.scopes.length - 1]; sc.trim = [sc.trim, ...variantHits].filter(Boolean).join(" "); }
  if (marketHits.length && reading.scopes.length) reading.scopes[reading.scopes.length - 1].marketSpec = marketHits[0];

  // ---- 7d) channel reconciliation: houses AND online -> all; a venue question implies the house channel ----
  if (/\bonline\b/.test(text) && /house/.test(text)) reading.filters.channel = "all";
  if (reading.structural.some(s => s.kind === "group_by" && s.dimension === "venue") && /house/.test(text) && !reading.filters.channel) reading.filters.channel = "house";

  // ---- 8) defaults (shown as chips; spec s6/s7) ----
  const isMeta = /what do you (cover|have)|coverage/.test(text);
  // Refuse ONLY prediction + advice (spec s5 unsupported). Bare "worth"/"value" is TRANSLATED to
  // median (the worth metric), not refused (spec s6, Q9). Prediction = future/"next year"; advice =
  // "should I".
  const isUnsupported = /(will .*(be worth|go up|go down|be higher|be lower)|worth .*next|next year|going to (go|be)|predict|forecast|should i (sell|buy|keep|hold)|is it a good (buy|time|deal)|worth (buying|selling))/.test(text);
  if (!reading.window && !isMeta) { reading.window = "36mo"; reading.windowDefaulted = true; addPhrase("(window)", "defaulted", "no window stated -> last 36 months"); }
  if (!reading.metric) {
    const needsRanking = reading.grouping || reading.structural.some(s => s.kind === "limit") || reading.structural.some(s => s.kind === "comparison");
    if (needsRanking && (reading.grouping)) { reading.metric = { measure: "count", sort: "desc", note: "grouping with no metric -> ranked by count (spec s5: ranking needs a metric; count is the default proxy, a chip)" }; addPhrase("(metric)", "defaulted", "grouping -> ranked by count"); }
    else if (reading.scopes.length && !reading.structural.some(s => s.kind === "comparison")) { reading.metric = { measure: "median", sort: "desc", note: "single-car default: median + spread" }; addPhrase("(metric)", "defaulted", "single scope -> median + spread"); }
  }
  // trend over a single multi-year model with no explicit grouping -> group by model year
  // ("which Fox body Mustangs are rising fastest" -> per model year; spec Q2).
  if (reading.metric && reading.metric.measure === "trend" && reading.scopes.length === 1 && !reading.grouping && !reading.structural.some(s => s.kind === "group_by")) {
    const sc = reading.scopes[0];
    if ((sc.yearEnd || 0) - (sc.yearStart || 0) >= 3) { reading.structural.push({ kind: "group_by", dimension: "model_year" }); addPhrase("(grouping)", "defaulted", "trend over a multi-year model -> ranked by model year"); }
  }
  // era -> apply as a model-year filter if scopes don't already carry the years
  if (eraEntries.length) { const e = eraEntries[0]; reading.filters.era = e.yearRange; }
  // mileage band -> resolve the threshold from the first scope's era (spec s6)
  if (reading.filters.mileage && !reading.filters.mileage.threshold) {
    const y = (reading.scopes[0] && (reading.scopes[0].yearStart || reading.scopes[0].year)) || (reading.filters.era && reading.filters.era[0]) || 2000;
    reading.filters.mileage.threshold = lowMileThresholdForYear(y);
  }
  // unsupported question types (worth/predict/advice) -> nothing runs
  if (isUnsupported) { reading.unsupported = true; addPhrase("(intent)", "not_applied", "prediction/valuation/advice is out of scope; offer the trend answer or /sell"); }
  if (isMeta) { reading.meta = "coverage"; addPhrase("(intent)", "used", "coverage/meta question -> the coverage table"); }

  // ---- 8b) make-only comparison / bare make -> "which models?" clarify (spec Q13) ----
  if (reading.makeOnly && reading.makeOnly.length) {
    const isCompare = reading.structural.some(s => s.kind === "comparison");
    if (isCompare || reading.scopes.length === 0) {
      reading.ambiguous = reading.ambiguous || [];
      for (const mo of reading.makeOnly) reading.ambiguous.push({ phrase: mo.phrase, options: [`name the ${mo.make} models`, `top five ${mo.make} models by count`] });
    }
  }

  // ---- 9) honest miss (spec s1/s9/s30): nothing resolved, nothing invented -> say so + log ----
  const hasScope = reading.scopes.length > 0 || reading.grouping || reading.meta || reading.filters.venue;
  const anyUnresolved = usedPhrases.some(p => p.fate === "unresolved");
  if (!hasScope && !reading.unsupported && !reading.ambiguous && anyUnresolved) reading.honestMiss = true;

  reading.phrases = usedPhrases;
  return reading;
}
