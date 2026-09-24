// Sam Desk — the VALIDATOR (Stage A).
// =====================================================================
// Trusts neither the model nor the dictionary (spec section 3). Given a structured
// reading, it confirms:
//   1. every scope re-resolves through the same resolver /sell uses,
//   2. every generation exists in lib/generations.js,
//   3. every grouping expands to real models WITH sales in the archive,
//   4. every metric is one the DSL can compute,
// and returns per-part confidence plus the list of unresolved phrases. Nothing the
// interpreter invented (a make/model that will not resolve, a generation not in
// generations.js, a metric the DSL cannot compute) is allowed to pass.
//
// PURE except for the injected resolver: I/O (the resolver call, archive counts) is
// passed in via `opts`, so this module runs offline in the golden (generation + metric
// checks) and fully on the server (resolver + archive counts) with the same code.
//
// A "reading" (the interpreter's output; Stage B fills it, the Stage-A lookup also does):
//   {
//     scopes:   [ { make, model, yearStart?, yearEnd?, generation?, source } ],
//     grouping: { name, members: [ ...scope ] } | null,
//     metric:   { measure, sort, ask? } | null,
//     filters:  { channel?, venue?, era?, price?, mileage?, body?, transmission? },
//     window:   "<WINDOWS token>" | { from, to } | null,
//     structural: [ { kind, dimension?, n? } ],
//     phrases:  [ { text, fate: "used"|"defaulted"|"not_applied"|"unresolved", note? } ]
//   }
//
// opts:
//   resolve : async (make, model, year?) => boolean      // re-resolve a scope (resolveVehicle-backed)
//   counts  : Map | object  keyed "make|model|generation||yearStart|yearEnd" -> integer sales
//   thin    : number (default 3)                         // fewer than this = thin, shown never ranked
// =====================================================================

import { generationsForModel } from "../generations.js";
import { MEASURES } from "./query.js";

// The DSL's current metrics, exported so the gate report can list them (spec item 3).
export const DSL_METRICS = [...MEASURES];

const keyOf = (mm) => [
  String(mm.make || "").toLowerCase(),
  String(mm.model || "").toLowerCase(),
  String(mm.generation || "").toLowerCase(),
  mm.yearStart == null ? "" : mm.yearStart,
  mm.yearEnd == null ? "" : mm.yearEnd
].join("|");

function lookupCount(counts, mm) {
  if (!counts) return null;
  const k = keyOf(mm);
  if (counts instanceof Map) return counts.has(k) ? counts.get(k) : (counts.has(k.toLowerCase()) ? counts.get(k.toLowerCase()) : null);
  return Object.prototype.hasOwnProperty.call(counts, k) ? counts[k] : null;
}

// Validate one car scope member. Returns { status, confidence, checks:{...}, reason }.
async function validateScope(mm, opts) {
  const checks = { hasCarName: !!(mm.make && mm.model), generation: null, resolves: null, count: null };
  const reasons = [];

  if (!checks.hasCarName) {
    if (mm.make && mm.makeOnly) {
      return { status: "unverified", confidence: "low", checks, reason: "make-only (needs a model, code or era before it can run)" };
    }
    return { status: "invalid", confidence: "low", checks, reason: "no make+model" };
  }

  // 2) generation must exist in generations.js when one is declared.
  if (mm.generation) {
    const gens = generationsForModel(mm.make, mm.model).map(g => String(g.code).toLowerCase());
    checks.generation = gens.includes(String(mm.generation).toLowerCase());
    if (!checks.generation) reasons.push(`generation "${mm.generation}" not in generations.js for ${mm.make} ${mm.model}`);
  }

  // 1) re-resolve through the resolver (when available).
  if (typeof opts.resolve === "function") {
    try { checks.resolves = !!(await opts.resolve(mm.make, mm.model, mm.yearStart)); }
    catch { checks.resolves = false; }
    if (!checks.resolves) reasons.push(`${mm.make} ${mm.model} did not resolve`);
  }

  // 3) real sales in the archive (when counts supplied).
  const c = lookupCount(opts.counts, mm);
  if (c != null) { checks.count = c; if (c === 0) reasons.push(`no sales in the archive for ${mm.make} ${mm.model}${mm.generation ? " (" + mm.generation + ")" : ""}`); }

  // Verdict. A declared generation that does not exist is INVALID (invented). A resolver miss is
  // INVALID. Zero sales is INVALID (flagged, not hidden). Otherwise valid; "unverified" when we
  // could not check the resolver AND had no count.
  const hardFail = (mm.generation && checks.generation === false) || checks.resolves === false || checks.count === 0;
  if (hardFail) return { status: "invalid", confidence: "low", checks, reason: reasons.join("; ") };

  const verified = checks.resolves === true || (checks.count != null && checks.count > 0) || (mm.generation && checks.generation === true);
  const thin = checks.count != null && checks.count < (opts.thin || 3);
  return {
    status: verified ? "valid" : "unverified",
    confidence: verified ? (thin ? "medium" : "high") : "medium",
    checks,
    reason: thin ? `thin (${checks.count} sales; shown, never ranked on a spread)` : (verified ? "" : "not re-checked (no resolver/count supplied)")
  };
}

export async function validateReading(reading, opts = {}) {
  const parts = [];
  const unresolved = [];
  reading = reading || {};

  // ---- scopes ----
  const scopes = Array.isArray(reading.scopes) ? reading.scopes : [];
  for (const s of scopes) {
    const v = await validateScope(s, opts);
    parts.push({ part: "scope", value: `${s.make || ""} ${s.model || ""}${s.generation ? " (" + s.generation + ")" : ""}`.trim(), source: s.source || null, ...v });
  }

  // ---- grouping ----
  let groupingRunnable = null;
  if (reading.grouping && Array.isArray(reading.grouping.members)) {
    const memberResults = [];
    for (const mm of reading.grouping.members) {
      const v = await validateScope(mm, opts);
      memberResults.push({ member: `${mm.make} ${mm.model}`, ...v });
    }
    const withSales = memberResults.filter(r => r.checks.count == null || r.checks.count > 0);
    const zero = memberResults.filter(r => r.checks.count === 0);
    groupingRunnable = withSales.length >= 1;
    parts.push({
      part: "grouping",
      value: reading.grouping.name,
      status: groupingRunnable ? "valid" : "invalid",
      confidence: groupingRunnable ? (zero.length ? "medium" : "high") : "low",
      reason: zero.length ? `${zero.length} member(s) have no sales and are flagged (not hidden): ${zero.map(z => z.member).join(", ")}` : "",
      members: memberResults
    });
  }

  // ---- metric ----
  if (reading.metric) {
    const mObj = reading.metric;
    if (mObj.measure === null && Array.isArray(mObj.ask)) {
      parts.push({ part: "metric", value: "(subjective, needs one clarifying question)", status: "valid", confidence: "low", reason: "triggers the one clarifying question: " + mObj.ask.join(" / ") });
    } else if (mObj.measure && MEASURES.has(mObj.measure)) {
      parts.push({ part: "metric", value: mObj.measure, status: "valid", confidence: mObj.note ? "medium" : "high", reason: mObj.note || "" });
    } else {
      parts.push({ part: "metric", value: String(mObj.measure), status: "invalid", confidence: "low", reason: `"${mObj.measure}" is not a DSL metric (have: ${DSL_METRICS.join(", ")})` });
    }
  }

  // ---- filters (channel / venue / era / price / mileage / body / transmission) ----
  const f = reading.filters || {};
  const okFilter = (part, value, reason = "", confidence = "high") => parts.push({ part, value, status: "valid", confidence, reason });
  if (f.channel) okFilter("channel", f.channel);
  if (f.venue) okFilter("venue", Array.isArray(f.venue) ? f.venue.join(" / ") : f.venue);
  if (f.era) okFilter("era", `${f.era[0]}-${f.era[1]}`);
  if (f.price) okFilter("price", JSON.stringify(f.price));
  if (f.mileage) okFilter("mileage", f.mileage.band + "-mile" + (f.mileage.threshold ? ` (< ${f.mileage.threshold})` : ""), "threshold per era, chip shown", "medium");
  if (f.body) okFilter("body", f.body);
  if (f.transmission) okFilter("transmission", f.transmission, f.transmission === "other" ? "PDK/DCT folded to 'other'; rows lacking transmission counted" : "", f.transmission === "other" ? "medium" : "high");

  // ---- window ----
  if (reading.window) {
    const w = typeof reading.window === "string" ? reading.window : `${reading.window.from || "…"} to ${reading.window.to || "…"}`;
    parts.push({ part: "window", value: w, status: "valid", confidence: reading.windowDefaulted ? "medium" : "high", reason: reading.windowDefaulted ? "defaulted" : "" });
  }

  // ---- structural ----
  for (const st of (reading.structural || [])) {
    parts.push({ part: "structural", value: st.kind + (st.dimension ? ":" + st.dimension : "") + (st.n ? ":" + st.n : ""), status: "valid", confidence: "high", reason: "" });
  }

  // ---- phrase fates: collect unresolved ----
  for (const ph of (reading.phrases || [])) {
    if (ph.fate === "unresolved") unresolved.push(ph.text);
  }

  // ---- overall verdict ----
  const hasValidScope = parts.some(p => (p.part === "scope") && (p.status === "valid" || p.status === "unverified"));
  const hasValidGrouping = groupingRunnable === true;
  const hasMarketScope = !!(f.venue || (f.channel && f.channel !== "all"));
  const anyInvented = parts.some(p => p.status === "invalid" && (p.part === "scope" || p.part === "metric"));
  // Every phrase not-applied/unresolved with no runnable scope => does not run (spec s7).
  const runnable = (hasValidScope || hasValidGrouping || hasMarketScope);
  const ok = runnable && !anyInvented;

  return {
    ok,
    runnable,
    parts,
    unresolved,
    summary: {
      scopes: parts.filter(p => p.part === "scope").length,
      invalid: parts.filter(p => p.status === "invalid").length,
      unverified: parts.filter(p => p.status === "unverified").length,
      unresolvedPhrases: unresolved.length
    }
  };
}
