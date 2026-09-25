// Sam Desk — the INTERPRETER (Stage B, spec sections 2, 3, 6, 7).
// =====================================================================
// One server-side Claude call per question, temperature 0, fast model. It reads the sentence and
// returns a STRUCTURED READING (scope, filters, window, channel, metric, grouping, structural) with
// a FATE for every phrase (used / defaulted / not_applied / unresolved). The prompt forbids naming
// any make, model, generation or grouping not in the supplied lists; unknown phrases go to
// "unresolved", never into the scope. Every output is checked by validate.js before anything runs.
//
// Determinism (spec s3): temperature 0 + a versioned dictionary + a per-question cache -> the same
// question yields the same reading. Fallback (spec s6/item 6): if the model call fails or times out,
// fall back to the deterministic dictionary lookup for exact nameplates and flag the understanding
// layer as unavailable. Never guess.
//
// The API key stays server-side (spec s7); this module runs only inside the Desk handler.
// =====================================================================

import { dictionaryPromptBlock, DICTIONARY_VERSION, GROUPINGS, normalizePhrase } from "./dictionary.js";
import { validateReading, DSL_METRICS } from "./validate.js";
import { lookupQuestion } from "./lookup.js";

const INTERPRET_MODEL = process.env.DESK_INTERPRET_MODEL || "claude-haiku-4-5-20251001";  // fast, cheap; never a dated Sonnet snapshot
const cache = new Map();   // key -> { reading, at }
const TTL_MS = 60 * 60 * 1000;

function cacheKey(question, threadReading) {
  return DICTIONARY_VERSION + "|" + normalizePhrase(question) + "|" + (threadReading ? JSON.stringify(threadReading.scopes || []) + JSON.stringify(threadReading.filters || {}) : "");
}

const SYSTEM = `You convert a collector-car market question into a STRUCTURED READING for the Sam Desk. Output ONE JSON object and nothing else.

You may name ONLY makes, models, generations and groupings that appear in the DICTIONARY below, OR an explicit real nameplate the question states (e.g. "BMW M3", "Ferrari Testarossa") — those are re-checked by a resolver. NEVER invent a make, model, generation, grouping, year range or metric. A phrase you cannot map goes into "phrases" with fate "unresolved", never into the scope.

READING shape:
{
 "scopes": [ { "make","model","generation"?,"trim"?,"yearStart"?,"yearEnd"?,"source": "<the phrase>" } ],
 "grouping": { "name","members":[ {make,model,yearStart,yearEnd} ] } | null,   // ONLY from a dictionary grouping; copy its full member list
 "metric": { "measure": <one DSL metric or null>, "sort":"desc|asc", "ask": [<options>]|null } | null,
 "filters": { "channel"?, "venue"?, "era"?:[a,b], "price"?:{min?,max?}, "mileage"?:{band:"low|high"}, "body"?, "transmission"? },
 "window": "<window token>" | {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | null,
 "windowDefaulted": true|false,
 "structural": [ {"kind":"comparison"} | {"kind":"group_by","dimension":"venue|year|model_year|month|model|generation"} | {"kind":"limit","n":N} ],
 "phrases": [ { "text","fate":"used|defaulted|not_applied|unresolved","note"? } ],
 "clarify": { "question","options":[..2-4..] } | null,
 "unsupported": true|false,   // prediction/advice ("will X be worth", "should I sell")
 "meta": "coverage" | null    // "what do you cover"
}

RULES (spec s6/s7):
- DSL metrics allowed: ${DSL_METRICS.join(", ")}. NEVER mean/average/midpoint.
- best/top(subjective)/hottest/undervalued -> metric.measure null + metric.ask + a clarify question (one only).
- worth/value/valuation -> metric median (TRANSLATE; never write "worth/value/estimate/appraisal" in any text you emit).
- average/typical/normal -> median.
- rising/appreciating -> trend desc; falling/softening/cooling -> trend asc. resold/repeat -> velocity. most sold/popular -> count. record/highest ever -> record.
- A grouping whose members are ALL the same make+model (e.g. air-cooled 911s) COLLAPSES to ONE scope (that model, min-max years), single read — do NOT emit a grouping there. A multi-model grouping stays a grouping; if it has no metric, default metric count and add a defaulted "(metric)" phrase.
- A single scope with no metric -> default median (add a defaulted "(metric)" phrase). trend over one multi-year model -> add group_by model_year.
- "vs/versus/compared to/against/or" between two cars -> structural comparison. Two make-only names ("Ferrari vs Lamborghini") -> a clarify asking which models.
- Ambiguous nickname (Bird) with no disambiguator -> clarify (Thunderbird or Firebird); "screaming chicken"/"trans am" disambiguates to Firebird.
- window: apply a stated one; else default "36mo" with windowDefaulted true and a defaulted "(window)" phrase. "this year"->ytd. "since 2023"->{from:"2023-01-01"}. "in 2025"->{from:"2025-01-01",to:"2025-12-31"}.
- A decade/era word (60s..2010s, "from the 90s", pre-war, post-war, malaise era) ALWAYS sets filters.era:[start,end] AND a used phrase.
- Correct an OBVIOUS misspelling of a make/model to the nearest real one (Porshe->Porsche, Ferarri->Ferrari, Camero->Camaro, Mercedez->Mercedes) and emit the scope with a phrase note "corrected"; NEVER mark a misspelled real nameplate "unresolved".
- A 17-character VIN is a single car: emit one scope for the decoded car (the caller decodes it) and a used phrase; never unresolved.
- condition words (concours, mint, project) -> not_applied (we don't record condition). private sales -> not_applied. numbers-matching/original/restored -> used (title-only filter).
- NO SILENT DROPS: EVERY word/phrase of the question appears once in "phrases" with a fate. Filler (the, a, of, cars, sold) may be grouped, but nothing meaningful is dropped.
- Honest miss: if nothing resolves and nothing is invented, scopes [] and the phrase is unresolved (the caller logs it).`;

function fewShots() {
  return [
    { q: "best F-body cars from the 90s", a: { scopes: [{ make: "Chevrolet", model: "Camaro", yearStart: 1967, yearEnd: 2002, source: "f-body" }, { make: "Pontiac", model: "Firebird", yearStart: 1967, yearEnd: 2002, source: "f-body" }], metric: { measure: null, sort: "desc", ask: ["highest median", "rising fastest", "most sold", "strongest recent results"] }, filters: { era: [1990, 1999] }, window: "36mo", windowDefaulted: true, structural: [], phrases: [{ text: "best", fate: "used" }, { text: "f-body cars", fate: "used" }, { text: "90s", fate: "used" }, { text: "(window)", fate: "defaulted" }], clarify: { question: "By best, do you mean highest prices, rising fastest, most sold, or strongest recent results?", options: ["highest median", "rising fastest", "most sold", "strongest recent results"] } } },
    { q: "air-cooled 911s under $100k sold this year", a: { scopes: [{ make: "Porsche", model: "911", yearStart: 1964, yearEnd: 1998, source: "air-cooled 911s" }], metric: { measure: "median", sort: "desc" }, filters: { price: { max: 100000 } }, window: "ytd", windowDefaulted: false, structural: [], phrases: [{ text: "air-cooled 911s", fate: "used" }, { text: "under $100k", fate: "used" }, { text: "sold this year", fate: "used" }, { text: "(metric)", fate: "defaulted" }] } },
    { q: "what 90s Japanese sports cars sold most on Cars & Bids", a: { grouping: { name: "90s Japanese sports cars", members: GROUPINGS.find(g => g.name === "90s Japanese sports cars").members.map(m => ({ make: m.make, model: m.model, yearStart: m.yearStart, yearEnd: m.yearEnd })) }, metric: { measure: "count", sort: "desc" }, filters: { venue: "Cars & Bids" }, window: "36mo", windowDefaulted: true, structural: [], phrases: [{ text: "90s japanese sports cars", fate: "used" }, { text: "sold most", fate: "used" }, { text: "cars & bids", fate: "used" }, { text: "(window)", fate: "defaulted" }] } },
    { q: "what's a 964 worth", a: { scopes: [{ make: "Porsche", model: "911", generation: "964", yearStart: 1990, yearEnd: 1994, source: "964" }], metric: { measure: "median", sort: "desc" }, filters: {}, window: "36mo", windowDefaulted: true, structural: [], phrases: [{ text: "964", fate: "used" }, { text: "worth", fate: "used", note: "translated to median" }, { text: "(window)", fate: "defaulted" }] } },
    { q: "the frog", a: { scopes: [], grouping: null, metric: null, filters: {}, window: null, structural: [], phrases: [{ text: "the frog", fate: "unresolved" }] } }
  ];
}

function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// Normalize a model reading into the shape validate.js + the reading card expect.
function normalizeReading(r) {
  r = r || {};
  return {
    question: r.question || null,
    scopes: Array.isArray(r.scopes) ? r.scopes : [],
    grouping: (r.grouping && Array.isArray(r.grouping.members)) ? r.grouping : null,
    metric: r.metric || null,
    filters: r.filters && typeof r.filters === "object" ? r.filters : {},
    window: r.window || null,
    windowDefaulted: !!r.windowDefaulted,
    structural: Array.isArray(r.structural) ? r.structural : [],
    phrases: Array.isArray(r.phrases) ? r.phrases : [],
    ambiguous: r.clarify ? [{ phrase: r.clarify.question, options: r.clarify.options || [] }] : (r.ambiguous || null),
    clarify: r.clarify || null,
    unsupported: !!r.unsupported,
    meta: r.meta || null,
    honestMiss: (!r.scopes || !r.scopes.length) && !r.grouping && !r.meta && !r.unsupported && !r.clarify && (r.phrases || []).some(p => p.fate === "unresolved")
  };
}

// Main entry. Returns { reading, validation, source: "model"|"fallback"|"cache", ms }.
export async function interpret(question, ctx = {}) {
  const q = String(question || "").trim();
  const t0 = Date.now();
  if (!q) return { reading: normalizeReading({ phrases: [] }), validation: { ok: false, runnable: false, parts: [], unresolved: [] }, source: "empty", ms: 0 };

  const key = cacheKey(q, ctx.threadReading);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.result, source: "cache", ms: Date.now() - t0 };

  const runValidate = (reading) => validateReading(reading, { resolve: ctx.resolve, counts: ctx.counts, thin: 3 });

  // ---- fallback (deterministic lookup) builder, used on any model failure ----
  const fallback = async (note) => {
    const reading = normalizeReading(await lookupQuestion(q, { includePending: false, resolveResidual: ctx.resolveResidual }));
    reading.understandingLayer = "unavailable";
    if (note) reading.fallbackNote = note;
    const validation = await runValidate(reading);
    const result = { reading, validation, source: "fallback" };
    return { ...result, ms: Date.now() - t0 };
  };

  // VIN short-circuit: a pasted 17-char VIN is one specific car; decode it deterministically through
  // the resolver (no model call needed) and read it as a single-car scope.
  const vinM = q.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
  if (vinM && typeof ctx.resolveResidual === "function") {
    const r = await ctx.resolveResidual(vinM[1]).catch(() => null);
    if (r && r.make && r.model) {
      const reading = normalizeReading({
        question: q,
        scopes: [{ make: r.make, model: r.model, generation: r.generation || null, trim: r.trim || null, year: r.year || null, source: "VIN " + vinM[1] }],
        metric: { measure: "median", sort: "desc", note: "single-car default (VIN)" },
        window: "36mo", windowDefaulted: true, filters: {}, structural: [],
        phrases: [{ text: vinM[1], fate: "used", note: "VIN decoded to the exact car" }]
      });
      const validation = await runValidate(reading);
      const result = { reading, validation, source: "vin" };
      cache.set(key, { result, at: Date.now() });
      return { ...result, ms: Date.now() - t0 };
    }
  }

  if (!ctx.apiKey) return await fallback("no ANTHROPIC_API_KEY");

  // ---- the one model call ----
  let data;
  try {
    const shots = fewShots().flatMap(s => ([{ role: "user", content: s.q }, { role: "assistant", content: JSON.stringify(s.a) }]));
    const context = ctx.threadReading ? `\nTHREAD (current reading to EDIT for a follow-up):\n${JSON.stringify({ scopes: ctx.threadReading.scopes, filters: ctx.threadReading.filters, window: ctx.threadReading.window, metric: ctx.threadReading.metric, grouping: ctx.threadReading.grouping ? ctx.threadReading.grouping.name : null })}` : "";
    const recent = (ctx.recentReadings && ctx.recentReadings.length) ? `\nRECENT (resolve ambiguity from these first): ${ctx.recentReadings.map(r => (r.scopes || []).map(s => s.make + " " + s.model).join("/")).filter(Boolean).slice(0, 3).join("; ")}` : "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs || 8000);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ctx.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: INTERPRET_MODEL, max_tokens: 1200, temperature: 0,
        system: `${SYSTEM}\n\nDICTIONARY (version ${DICTIONARY_VERSION}):\n${dictionaryPromptBlock()}`,
        messages: [...shots, { role: "user", content: q + context + recent }]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return await fallback(`model HTTP ${resp.status}`);
    data = await resp.json();
  } catch (e) {
    return await fallback(String(e && e.name === "AbortError" ? "model timeout" : (e && e.message) || e));
  }

  const text = data && data.content && data.content[0] && data.content[0].text;
  const parsed = extractJson(text);
  if (!parsed) return await fallback("model returned no parseable JSON");

  const reading = normalizeReading({ ...parsed, question: q });
  const validation = await runValidate(reading);
  // Nothing invented passes: if the model named an invalid scope/metric (validation flags it invalid),
  // fall back to the deterministic reading rather than run a fabricated scope.
  if (!validation.ok && !reading.unsupported && !reading.meta && !reading.clarify && !reading.honestMiss && validation.summary.invalid > 0) {
    return await fallback("model reading failed validation (invented part)");
  }
  const result = { reading, validation, source: "model" };
  cache.set(key, { result, at: Date.now() });
  return { ...result, ms: Date.now() - t0 };
}
