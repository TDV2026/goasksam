// DESK V3, STAGE 2: THE WORKFLOW RULES (Lane D, Nov 8 2026). Pure functions over the case (lib/desk/caseModel.js); the engine is reached only through an injected `read`, which is sheetRead's oneEngineAnswer read. Nothing here makes a market
// figure: the evidence, the comparables and the quartiles are fields of what the engine answered (sheet.desk, Lane B's shapes in docs/lane-notes.md), stored on the case as case.desk.
import { setField, verifyField, FIELD_KEYS, addNeed, setNeed, excludeSale } from "./caseModel.js";
const clone = x => structuredClone(x);
const iso = now => now || new Date().toISOString();

// WHAT THE ENGINE IS ASKED. A change to any of these re-calls it; nothing else does (a note, a photo or a reserve never costs a read). Mileage, transmission, body and generation are the case's fields; the
// market_calc exclusions leave the calculation; the condition the analyst selected is the tier (it changes the pool, so it re-calls too).
export function recallInput(c, caseDate) {
  const f = k => c.fields[k].value, tier = c.condition && Number(c.condition.selected && c.condition.selected.tier);
  const verification = {}; for (const [k, key] of [["transmission", "transmission"], ["mileage", "mileage_band"]]) if (c.fields[k].value != null) verification[key] = c.fields[k].verified ? "verified" : c.fields[k].source === "seller" ? "seller_stated" : "not_confirmed";
  const doc = c.documents.some(d => d.kind === "service"); if (doc) verification.service_ims = c.documents.some(d => d.kind === "service" && d.status === "received") ? "documented" : "seller_stated";
  return {
    ...(f("vin") ? { vin: f("vin") } : { year: f("year"), make: f("make"), model: f("model") }), mileage: f("mileage"), ...(f("body") ? { bodyStyle: f("body") } : {}), ...([1, 2, 3, 4].includes(tier) ? { tier } : {}),
    desk: { caseDate: caseDate || null, transmission: f("transmission"), label: [f("year"), f("make"), f("model")].filter(Boolean).join(" ") || null, case: { verification }, exclusions: c.exclusions.map(e => ({ saleId: e.saleId, scope: e.scope, reason: e.reason, at: e.at })) }
  };
}
export const recallKey = c => JSON.stringify([c.fields.vin.value, c.fields.year.value, c.fields.make.value, c.fields.model.value, c.fields.mileage.value, c.fields.transmission.value, c.fields.body.value, c.fields.generation.value, c.condition.selected ? c.condition.selected.tier : null, c.exclusions.filter(e => e.scope === "market_calc").map(e => e.saleId).sort()]);
export const needsRecall = c => !c.desk || c.desk.key !== recallKey(c);
// Re-call the engine for the case and store BOTH desk.original (the untouched evidence) and desk.evidence (with the market_calc exclusions out). A retry answer or a failed read is never stored over a good one.
export async function refreshEvidence(c0, read, { caseDate, now } = {}) {
  if (!needsRecall(c0)) return { case: c0, recalled: false };
  const sheet = await read(recallInput(c0, caseDate || iso(now).slice(0, 10)));
  if (!sheet || sheet.retry || !sheet.desk) return { case: c0, recalled: false, retry: sheet && sheet.retry ? sheet : null };
  const c = clone(c0); c.desk = { key: recallKey(c0), readAt: iso(now), ...sheet.desk };
  return { case: c, recalled: true };
}

// A change after finalizing makes version n plus 1 (the finalized version row is never touched) and takes the case back to review. A first change takes a new case to review.
function touch(c, now) { if (c.status === "finalized") { c.version += 1; c.status = "in_review"; c.audit.push({ at: iso(now), by: "desk", what: "reopened as version " + c.version }); } else if (c.status === "new") c.status = "in_review"; return c; }
export function settle(c0, now) { const c = clone(c0); if (c.status === "finalized") return c; const r = readinessOf(c); c.status = r.ready ? "ready" : "in_review"; return c; }

// CORRECTING A FIELD logs an audit line and resets its verification (setField does both). The caller then re-calls the engine when the case's recall key moved.
export function correctField(c0, key, value, { now, by = "analyst" } = {}) { const held = c0.fields[key] && c0.fields[key].value; if (held != null && String(held).toLowerCase() === String(key === "mileage" ? Math.round(Number(String(value).replace(/[^\d.]/g, ""))) : value).toLowerCase()) return c0; return settle(syncNeeds(touch(setField(clone(c0), key, value, "analyst_verified", { now, by }), now)), now); }
export function verify(c0, key, { now } = {}) { return settle(syncNeeds(touch(verifyField(c0, key, { now }), now)), now); }

// ASSESSMENT AND RESERVE ARE INDEPENDENT. Each writer builds a new object for its own part and copies the other by reference; the other's bytes cannot change.
const numOrNull = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
export function setAssessment(c0, patch, now) { const c = touch(clone(c0), now), a = c.assessment, p = patch || {}; c.assessment = { figure: "figure" in p ? numOrNull(p.figure) : a.figure, low: "low" in p ? numOrNull(p.low) : a.low, high: "high" in p ? numOrNull(p.high) : a.high, explanation: "explanation" in p ? String(p.explanation || "").slice(0, 2000) : a.explanation }; return settle(c, now); }
export function setReserve(c0, patch, now) { const c = touch(clone(c0), now), r = c.reserve, p = patch || {}; c.reserve = { figure: "figure" in p ? numOrNull(p.figure) : r.figure, rationale: "rationale" in p ? String(p.rationale || "").slice(0, 2000) : r.rationale, seller_agreed: "seller_agreed" in p ? p.seller_agreed === true : r.seller_agreed }; return settle(c, now); }
export function selectComparables(c0, ids, now) { const c = touch(clone(c0), now); c.selectedComparables = [...new Set((ids || []).map(String))]; return settle(c, now); }
export function setCondition(c0, selected, now) { const c = touch(clone(c0), now); c.condition = { ...c.condition, selected: selected && selected.tier ? { tier: Number(selected.tier), name: String(selected.name || "") } : null }; return settle(c, now); }

// NEEDS REVIEW IS GENERATED FROM SOURCE STATES, never typed. Four sources; only a material one blocks finalizing. An item the analyst closed or waived keeps its state while the cause stands; an item whose cause is gone closes itself.
export const NEED_RULES = [
  { id: "mileage_unconfirmed", material: true, label: "Mileage is not confirmed", applies: c => c.fields.mileage.value == null || !c.fields.mileage.verified },
  { id: "vin_mismatch", material: true, label: "The VIN and the other details do not agree", applies: c => c.fields.vin.source === "conflicting" || ["year", "make", "model"].some(k => c.fields[k].source === "conflicting") },
  { id: "accident_unclear", material: true, label: "Accident history is unclear", applies: c => c.fields.accident_history.value == null || c.fields.accident_history.source === "conflicting" || !c.fields.accident_history.verified },
  { id: "service_documents", material: false, label: "No service documents received", applies: c => !c.documents.some(d => d.kind === "service" && d.status === "received") }
];
export function syncNeeds(c0) {
  let c = clone(c0);
  for (const r of NEED_RULES) {
    const on = r.applies(c), it = c.needs_review.find(n => n.id === r.id);
    if (on && !it) c = addNeed(c, { id: r.id, label: r.label, material: r.material });
    else if (on && it && it.state === "done") it.state = "open";   // the cause is back: it is open again
    else if (!on && it && it.state === "open") { it.state = "done"; it.reason = it.reason || "The cause no longer applies."; }
  }
  return c;
}
export { setNeed };

// READINESS. Each blocker has its own key so each can be shown and tested alone. Optional things (the second photo, the service documents, a condition, the factors) never block.
const EXPLAIN_MIN = 60;
export function readinessOf(c) {
  const ev = c.desk && c.desk.evidence ? c.desk.evidence : null, blockers = [], add = (key, why) => blockers.push({ key, why });
  const f = k => c.fields[k], idd = f("vin").value && f("vin").source !== "conflicting" || (f("year").value && f("make").value && f("model").value && ["year", "make", "model"].every(k => f(k).source !== "conflicting"));
  if (!idd) add("vehicle", "The vehicle is not identified.");
  for (const n of c.needs_review) if (n.material && n.state === "open") add("need:" + n.id, n.label + ".");
  const a = c.assessment, long = t => String(t || "").trim().length >= EXPLAIN_MIN;
  if (a.figure == null) add("assessment", "No assessment figure.");
  else if (!(ev && ev.low != null && ev.high != null && a.figure >= ev.low && a.figure <= ev.high) && !long(a.explanation)) add("assessment_range", "The assessment is outside the evidence range and has no explanation of at least 60 characters.");
  if (!String(a.explanation || "").trim()) add("explanation", "No explanation for the assessment.");
  const r = c.reserve;
  if (r.figure == null) add("reserve", "No reserve figure.");
  else if (!(ev && ev.q3 != null && r.figure <= ev.q3) && !long(r.rationale)) add("reserve_range", "The reserve is above the third quartile and has no explanation of at least 60 characters.");
  if (!String(r.rationale || "").trim()) add("rationale", "No rationale for the reserve.");
  if (!c.photos.items.length) add("photo", "No photo.");
  if (!(c.selectedComparables || []).length) add("comparable", "No comparable selected.");
  return { ready: blockers.length === 0, blockers };
}

// FINALIZE writes an immutable version row and sets the status. The row carries everything the report is made from: figures, the evidence block (and the original), the selected comparables as the engine gave them, the verification states
// and the wording (built by lib/desk/reportState.js, Stage 3; null until then). Refused whole when the case is not ready.
export function versionRow(c, now, wording = null) {
  const d = c.desk || {}, sel = new Set(c.selectedComparables || []);
  return {
    version: c.version, finalized_at: iso(now), lead_ref: c.lead_ref,
    figures: { assessment: clone(c.assessment), reserve: clone(c.reserve) },
    evidence: clone(d.evidence || null), original: clone(d.original || null), exclusions: clone(c.exclusions),
    comparables: (d.comparables || []).filter(x => sel.has(String(x.id))).map(clone),
    verification: Object.fromEntries(FIELD_KEYS.map(k => [k, { value: c.fields[k].value, source: c.fields[k].source, verified: c.fields[k].verified }])),
    documents: clone(c.documents), needs_review: clone(c.needs_review), condition: clone(c.condition), wording
  };
}
export function finalize(c0, { now, wording = null } = {}) {
  const r = readinessOf(c0); if (c0.status === "finalized") return { ok: false, why: "This version is already finalized." };
  if (!r.ready) return { ok: false, why: "The case is not ready.", blockers: r.blockers };
  const c = clone(c0); c.status = "finalized"; c.finalized_at = iso(now); c.audit.push({ at: iso(now), by: "analyst", what: "finalized version " + c.version });
  return { ok: true, case: c, row: versionRow(c, now, wording) };
}
