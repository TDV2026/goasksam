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
- SUBJECTIVE METRIC WORDS ALWAYS DEFAULT, NEVER a clarify (the Desk always answers): best/top -> metric measure "median", sort "desc", metric.alternatives ["rising fastest","most sold","strongest recent results"]. priciest/most expensive -> median desc. cheapest/entry/affordable/bargain/value -> median asc, alternatives ["most sold","rising fastest"]. hottest/on fire -> trend desc, alternatives ["most sold recently"]. undervalued -> median asc (reframed), alternatives ["most sold"]. Set metric.measure to the default; do NOT emit metric.ask; do NOT emit clarify for a metric word.
- A clarify is ONLY for an ambiguous CAR: a nickname resolving to two different cars with no make/era (Bird), or two make-only names, or two cars named with no comparison/grouping word. Never for a metric.
- worth/value/valuation -> metric median (TRANSLATE; never write "worth/value/estimate/appraisal" in any text you emit).
- average/typical/normal -> median.
- rising/appreciating -> trend desc; falling/softening/cooling -> trend asc. resold/repeat -> velocity. most sold/popular -> count. record/highest ever -> record.
- A grouping whose members are all the same make+model (e.g. air-cooled 911s = the 901/G-body/964/993 generations) stays a grouping with those GENERATIONS as members and "sameModel": true; it reads as a SINGLE read (not a ranking) but keeps the generations as removable members so a follow-up can drop one. A multi-model grouping stays a grouping; if it has no metric, default metric count and add a defaulted "(metric)" phrase.
- A single scope with no metric -> default median (add a defaulted "(metric)" phrase). trend over one multi-year model -> add group_by model_year.
- "vs/versus/compared to/against/or" between two cars -> structural comparison. Two make-only names ("Ferrari vs Lamborghini") -> a clarify asking which models. A comparison scope MUST carry its FULL trim in "trim" and the exact phrase in "source" (Camaro Z28 -> {make:"Chevrolet",model:"Camaro",trim:"Z28",source:"Camaro Z28"}; Firebird Trans Am WS6 -> {make:"Pontiac",model:"Firebird",trim:"Trans Am WS6",source:"Firebird Trans Am WS6"}). NEVER drop a named trim or badge from a comparison scope. When a trim implies a production period (WS6 1996-2002, 2.3-16 1986-1993, Sport Evolution 1990), set yearStart/yearEnd on that scope so the caller can scope both sides to the overlapping years.
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
    { q: "best F-body cars from the 90s", a: { scopes: [{ make: "Chevrolet", model: "Camaro", yearStart: 1967, yearEnd: 2002, source: "f-body" }, { make: "Pontiac", model: "Firebird", yearStart: 1967, yearEnd: 2002, source: "f-body" }], metric: { measure: "median", sort: "desc", alternatives: ["rising fastest", "most sold", "strongest recent results"], note: "best -> typical sale price" }, filters: { era: [1990, 1999] }, window: "36mo", windowDefaulted: true, structural: [], phrases: [{ text: "best", fate: "defaulted", note: "typical sale price; also rising fastest, most sold" }, { text: "f-body cars", fate: "used" }, { text: "90s", fate: "used" }, { text: "(window)", fate: "defaulted" }] } },
    { q: "air-cooled 911s under $100k sold this year", a: { grouping: { name: "air-cooled 911s", sameModel: true, members: GROUPINGS.find(g => g.name === "air-cooled 911s").members.map(m => ({ make: m.make, model: m.model, generation: m.generation, label: m.label, yearStart: m.yearStart, yearEnd: m.yearEnd })) }, metric: { measure: "median", sort: "desc" }, filters: { price: { max: 100000 } }, window: "ytd", windowDefaulted: false, structural: [], phrases: [{ text: "air-cooled 911s", fate: "used" }, { text: "under $100k", fate: "used" }, { text: "sold this year", fate: "used" }, { text: "(metric)", fate: "defaulted" }] } },
    { q: "what 90s Japanese sports cars sold most on Cars & Bids", a: { grouping: { name: "90s Japanese sports cars", members: GROUPINGS.find(g => g.name === "90s Japanese sports cars").members.map(m => ({ make: m.make, model: m.model, yearStart: m.yearStart, yearEnd: m.yearEnd })) }, metric: { measure: "count", sort: "desc" }, filters: { venue: "Cars & Bids" }, window: "36mo", windowDefaulted: true, structural: [], phrases: [{ text: "90s japanese sports cars", fate: "used" }, { text: "sold most", fate: "used" }, { text: "cars & bids", fate: "used" }, { text: "(window)", fate: "defaulted" }] } },
    { q: "Z28 vs Trans Am WS6", a: { scopes: [{ make: "Chevrolet", model: "Camaro", trim: "Z28", source: "Camaro Z28" }, { make: "Pontiac", model: "Firebird", trim: "Trans Am WS6", yearStart: 1996, yearEnd: 2002, source: "Firebird Trans Am WS6" }], metric: { measure: "median", sort: "desc" }, filters: {}, window: "36mo", windowDefaulted: true, structural: [{ kind: "comparison" }], phrases: [{ text: "z28", fate: "used" }, { text: "trans am ws6", fate: "used" }, { text: "(window)", fate: "defaulted" }] } },
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

// Map an APPROVED grouping's members onto the dictionary's canonical members (authoritative labels,
// chipLabels, generations and year spans), so the reading card NEVER shows the interpreter's own label
// (e.g. "930" instead of the approved "G-body"). Matches each member the reading has to a dictionary
// member by generation code, else by year-range overlap; members the user removed are NOT re-added.
function canonicalizeGrouping(grouping) {
  if (!grouping || !grouping.name || !Array.isArray(grouping.members)) return grouping;
  const dict = GROUPINGS.find(g => String(g.name).toLowerCase() === String(grouping.name).toLowerCase());
  if (!dict) return grouping;
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const used = new Set();
  const members = grouping.members.map(mm => {
    let i = dict.members.findIndex((x, k) => !used.has(k) && x.generation && mm.generation && norm(x.generation) === norm(mm.generation));
    if (i < 0) i = dict.members.findIndex((x, k) => !used.has(k) && Math.max(x.yearStart, mm.yearStart || 0) <= Math.min(x.yearEnd, mm.yearEnd || 9999));
    if (i < 0) return mm;   // no dictionary match: keep as-is (never invents)
    used.add(i); const d = dict.members[i];
    return { make: d.make, model: d.model, generation: d.generation, label: d.label || null, chipLabel: d.chipLabel || null, yearStart: d.yearStart, yearEnd: d.yearEnd };
  });
  return { ...grouping, members };
}

// Normalize a model reading into the shape validate.js + the reading card expect.
function normalizeReading(r) {
  r = r || {};
  const out = {
    question: r.question || null,
    scopes: Array.isArray(r.scopes) ? r.scopes : [],
    grouping: (r.grouping && Array.isArray(r.grouping.members)) ? canonicalizeGrouping(r.grouping) : null,
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
    cannotApply: r.cannotApply || null,
    honestMiss: (!r.scopes || !r.scopes.length) && !r.grouping && !r.meta && !r.unsupported && !r.clarify && !r.cannotApply && (r.phrases || []).some(p => p.fate === "unresolved")
  };
  // A same-model grouping (air-cooled 911s) reads as a SINGLE median read (spec Q3), never a count
  // ranking - the members are generations of one model, so "count" would be meaningless here.
  if (out.grouping && out.grouping.sameModel && (!out.metric || out.metric.measure === "count")) {
    out.metric = { measure: "median", sort: "desc", note: "single read across the generations" };
    if (!out.phrases.some(p => p.text === "(metric)")) out.phrases.push({ text: "(metric)", fate: "defaulted", note: "single read across the generations -> median + spread" });
  }
  // SAFETY NET: a subjective METRIC word must never dead-end in a clarify (the Desk always answers,
  // approved screen rules). If a null metric with options slipped through, default to typical sale
  // price (median desc) and drop the metric clarify, carrying the alternatives for the reading line.
  const isMetricClarify = out.clarify && /\bbest\b|typical|median|most sold|rising|priciest|cheapest|strongest recent|highest price/i.test(out.clarify.question || "");
  if ((out.metric && out.metric.measure == null && Array.isArray(out.metric.ask) && out.metric.ask.length) || isMetricClarify) {
    const alts = (out.metric && (out.metric.alternatives || out.metric.ask)) || (out.clarify && out.clarify.options) || ["rising fastest", "most sold", "strongest recent results"];
    out.metric = { measure: "median", sort: "desc", alternatives: alts.filter(a => !/highest median|typical|^median$|highest price/i.test(String(a))), note: "default: typical sale price" };
    out.clarify = null; out.ambiguous = null;
    if (!out.phrases.some(p => p.text === "(metric)")) out.phrases.push({ text: "(metric)", fate: "defaulted", note: "typical sale price; alternatives offered in words" });
  }
  // Deterministic default (mirrors lookup.js, spec Q2): a trend over ONE multi-year model with no
  // explicit grouping ranks by model year ("which Fox body Mustangs are rising fastest").
  if (out.metric && out.metric.measure === "trend" && out.scopes.length === 1 && !out.grouping && !out.structural.some(s => s.kind === "group_by")) {
    const s = out.scopes[0];
    if ((Number(s.yearEnd) || 0) - (Number(s.yearStart) || 0) >= 3) { out.structural.push({ kind: "group_by", dimension: "model_year" }); out.phrases.push({ text: "(grouping)", fate: "defaulted", note: "trend over a multi-year model -> ranked by model year" }); }
  }
  return out;
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

  // Deterministic "drop the X" follow-up on a grouping: remove the named member, or say IN WORDS that
  // it isn't in the set (no silent no-op, spec s7). Handled here so member edits are reliable.
  if (ctx.threadReading && ctx.threadReading.grouping && Array.isArray(ctx.threadReading.grouping.members)) {
    const dm = q.match(/^\s*(?:drop|remove|without|exclude|not)\s+(?:the\s+)?(.+?)\s*$/i);
    if (dm) {
      const tok = dm[1].toLowerCase().replace(/[^a-z0-9]/g, "");
      const g = ctx.threadReading.grouping;
      const idx = g.members.findIndex(m => [m.generation, m.label, m.model, (m.make + " " + m.model)].filter(Boolean).map(s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "")).some(c => c && (c === tok || c.indexOf(tok) >= 0 || tok.indexOf(c) >= 0)));
      let reading;
      if (idx >= 0) {
        const members = g.members.filter((_, i) => i !== idx);
        reading = normalizeReading({ ...ctx.threadReading, grouping: { ...g, members }, phrases: [{ text: q, fate: "used", note: "removed a member from the set" }] });
      } else {
        reading = normalizeReading({ ...ctx.threadReading, cannotApply: `I can't drop "${dm[1].trim()}" — it isn't in this set.`, phrases: [{ text: q, fate: "not_applied", note: "nothing named to drop in this set" }] });
      }
      const validation = await runValidate(reading);
      const result = { reading, validation, source: "edit" };
      cache.set(key, { result, at: Date.now() });
      return { ...result, ms: Date.now() - t0 };
    }
  }

  // Deterministic REFINEMENT of the current answer: a follow-up that EDITS the thread reading (narrow
  // the year, change channel, add a price cap, re-sort, narrow to a trim) applies the delta and KEEPS
  // everything else (scope, era, window, metric). The model merged these unreliably (it dropped the
  // era on "1998 to 2002 only" and misread "just the Trans Am"), so the clear patterns are handled here.
  if (ctx.threadReading && !ctx.threadReading.clarify && !ctx.threadReading.unsupported) {
    const tr = ctx.threadReading;
    const ql = q.toLowerCase().trim();
    const tf = tr.filters || {};
    const parseMoney = (s, u) => { let n = Number(String(s).replace(/[^0-9.]/g, "")); if (!n) return null; if (/k/i.test(u || "")) n *= 1000; else if (/m/i.test(u || "")) n *= 1e6; else if (n < 1000) n *= 1000; return Math.round(n); };
    let delta = null, note = "", widenNote = null;
    let ym = ql.match(/\b((?:19|20)\d{2})\s*(?:to|-|–|—|thru|through|until)\s*((?:19|20)\d{2})\b/);
    if (!ym) { const one = ql.match(/^(?:only\s+|just\s+)?((?:19|20)\d{2})(?:\s+only)?$/); if (one) ym = [one[0], one[1], one[1]]; }
    const pm = ql.match(/\b(?:under|below)\s*\$?\s*([\d,.]+)\s*(k|m)?\b/);
    if (ym) {
      const oldEra = Array.isArray(tf.era) ? tf.era : null;
      const ne = [Number(ym[1]), Number(ym[2])];
      delta = { filters: { ...tf, era: ne } }; note = "set the years to " + ym[1] + "-" + ym[2];
      // If the new range runs OUTSIDE the prior scope, say so (it is a widen, not just a narrow).
      if (oldEra && (ne[1] > oldEra[1] || ne[0] < oldEra[0])) widenNote = "I widened to " + ne[0] + " to " + ne[1] + ", which runs past the earlier " + oldEra[0] + " to " + oldEra[1] + " window.";
    }
    else if (/\bonline(?:\s+only)?\b/.test(ql) && !/offline/.test(ql)) { delta = { filters: { ...tf, channel: "online" } }; note = "online only"; }
    else if (/\b(auction houses?|houses only|at (the )?houses|house only)\b/.test(ql)) { delta = { filters: { ...tf, channel: "house" } }; note = "auction houses only"; }
    else if (pm && parseMoney(pm[1], pm[2])) { delta = { filters: { ...tf, price: { ...(tf.price || {}), max: parseMoney(pm[1], pm[2]) } } }; note = "added a price cap"; }
    else if (/\b(which sold highest|highest|most expensive|priciest|record sale|the record|top sale|dearest)\b/.test(ql)) { delta = { metric: { measure: "record", sort: "desc" } }; note = "the record sale"; }
    else if (/\b(cheapest|least expensive|lowest[- ]priced?)\b/.test(ql)) { delta = { metric: { measure: "median", sort: "asc" } }; note = "cheapest typical"; }
    // "just the X" / "only the X": narrow to a specific car/trim (resolve X), keep the era + window.
    let narrow = null;
    if (!delta) {
      const jm = q.match(/^(?:just|only)\s+(?:the\s+)?(.+?)\s*$/i);
      if (jm && typeof ctx.resolveResidual === "function") {
        const phrase = jm[1].trim();
        const r = await ctx.resolveResidual(phrase).catch(() => null);
        if (r && r.make && r.model) {
          // If the phrase named a trim/variant the resolver folded into the model (e.g. "Trans Am" ->
          // Pontiac Firebird), keep it as the trim so the read title-filters to it, not the whole model.
          const nn = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          let trim = r.trim || null;
          if (!trim && nn(phrase) !== nn(r.model) && nn(phrase) !== nn(r.make + " " + r.model)) trim = phrase;
          narrow = { make: r.make, model: r.model, trim, generation: r.generation || null, source: phrase };
        }
      }
    }
    if (delta || narrow) {
      const base = narrow
        ? { ...tr, grouping: null, scopes: [narrow], structural: (tr.structural || []).filter(s => s.kind !== "comparison") }
        : { ...tr, ...delta };
      const reading = normalizeReading({ ...base, phrases: [{ text: q, fate: "used", note: "refined the current answer" + (note ? ": " + note : narrow ? ": narrowed to " + [narrow.make, narrow.model, narrow.trim].filter(Boolean).join(" ") : "") }] });
      if (widenNote) reading.refineNote = widenNote;
      const validation = await runValidate(reading);
      const result = { reading, validation, source: "refine" };
      cache.set(key, { result, at: Date.now() });
      return { ...result, ms: Date.now() - t0 };
    }
  }

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
