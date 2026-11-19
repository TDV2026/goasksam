// DESK V4 STAGE 3: NEXT STEPS (Lane D, Nov 10 2026). case.nextSteps is an ordered list of lines the report prints on page 4, as written. They are seeded from reasonWords (lib/reasonWords.js report.next.*) and the analyst owns them after that:
// edit, remove, add, reorder. A seeded step that the case makes obsolete drops itself (the invoice step when the invoice is received, the inspection step when an inspection report is received) unless the analyst edited it; a step the analyst removed
// is never put back. Pure functions over the case; nothing here is a market figure.
import { reasonLine } from "../reasonWords.js";
import { kindOfDoc, isServiceInvoice, logAudit } from "./caseModel.js";
export const IMS_WORDS = /\bIMS\b|intermediate shaft/i;
export const SEED_KEYS = ["call", "invoice", "inspection", "agree"];
export const MAX_STEPS = 12, MAX_STEP_CHARS = 300;
const clone = x => structuredClone(x);
const iso = n => n || new Date().toISOString();
// an invoice is outstanding when the case holds one it has not received, or the seller speaks of IMS work and no service invoice is in
export function invoiceOutstanding(c) {
  if (c.documents.some(isServiceInvoice)) return false;
  return c.documents.some(d => kindOfDoc(d) === "invoice") || IMS_WORDS.test(String((c.fields.service_history || {}).value || ""));
}
const applies = { call: () => true, invoice: invoiceOutstanding, inspection: c => !c.documents.some(d => kindOfDoc(d) === "inspection" && d.status === "received"), agree: () => true };
const nextId = c => { const used = new Set((c.nextSteps || []).map(s => s.id)); let n = 1; while (used.has("st" + n)) n++; return "st" + n; };
const cleanText = t => String(t == null ? "" : t).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_STEP_CHARS);
// the case with its seeded steps brought up to date: a seed that applies and is neither present nor removed is added in seed order; a seed that no longer applies and was not edited is dropped
export function syncSteps(c0) {
  const c = clone(c0); c.nextSteps = Array.isArray(c.nextSteps) ? c.nextSteps : []; c.nextStepsRemoved = Array.isArray(c.nextStepsRemoved) ? c.nextStepsRemoved : [];
  for (const key of SEED_KEYS) {
    const at = c.nextSteps.findIndex(s => s.key === key), on = applies[key](c);
    if (at >= 0 && !on && !c.nextSteps[at].edited) c.nextSteps.splice(at, 1);
    else if (at < 0 && on && !c.nextStepsRemoved.includes(key)) {
      const later = SEED_KEYS.slice(SEED_KEYS.indexOf(key) + 1), idx = c.nextSteps.findIndex(s => later.includes(s.key)), step = { id: nextId(c), key, text: reasonLine("report.next." + key), edited: false };
      if (idx >= 0) c.nextSteps.splice(idx, 0, step); else c.nextSteps.push(step);
    }
  }
  return c;
}
const find = (c, id) => { const i = c.nextSteps.findIndex(s => s.id === String(id)); if (i < 0) throw new Error("no such step"); return i; };
export function editStep(c0, id, text, now) {
  const c = syncSteps(c0), i = find(c, id), t = cleanText(text); if (!t) throw new Error("a step needs words, or remove it");
  if (c.nextSteps[i].text === t) return c;
  c.nextSteps[i] = { ...c.nextSteps[i], text: t, edited: true }; logAudit(c, { at: iso(now), by: "analyst", what: "next step edited", field: "nextSteps", to: c.nextSteps[i].id }); return c;
}
export function removeStep(c0, id, now) {
  const c = syncSteps(c0), i = find(c, id), [gone] = c.nextSteps.splice(i, 1);
  if (gone.key && !c.nextStepsRemoved.includes(gone.key)) c.nextStepsRemoved.push(gone.key);
  logAudit(c, { at: iso(now), by: "analyst", what: "next step removed", field: "nextSteps", to: gone.id }); return c;
}
export function addStep(c0, text, now) {
  const c = syncSteps(c0), t = cleanText(text); if (!t) throw new Error("a step needs words");
  if (c.nextSteps.length >= MAX_STEPS) throw new Error("a report takes up to " + MAX_STEPS + " steps");
  const step = { id: nextId(c), key: null, text: t, edited: true }; c.nextSteps.push(step);
  logAudit(c, { at: iso(now), by: "analyst", what: "next step added", field: "nextSteps", to: step.id }); return c;
}
// the new order is the list of every step id once; anything else is refused (a step is never lost by a reorder)
export function orderSteps(c0, order, now) {
  const c = syncSteps(c0), ids = c.nextSteps.map(s => s.id), want = Array.isArray(order) ? order.map(String) : [];
  if (want.length !== ids.length || new Set(want).size !== ids.length || !want.every(i => ids.includes(i))) throw new Error("the order must name every step once");
  if (want.join() === ids.join()) return c;
  c.nextSteps = want.map(i => c.nextSteps.find(s => s.id === i)); logAudit(c, { at: iso(now), by: "analyst", what: "next steps reordered", field: "nextSteps", to: want.join(",") }); return c;
}
// what the report prints: the steps as written, in order
export const printedSteps = c => syncSteps(c).nextSteps.map(s => s.text);
