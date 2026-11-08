// DESK V3, STAGE 1: THE CASE RECORD (Lane D, Nov 8 2026). A lead becomes a case. The case lives INSIDE the existing Desk sheet record (desk_sheets.sheet, key `case`), not in a new desk_cases table, because the sheet
// already carries what a case needs and Stage 2 depends on it: the org and seat ownership, RLS, the compare and set version (putIf), the photo and document tables, intake from email, and the immutability triggers.
// A second table would duplicate all of that and split one car across two rows. What IS new is one table for immutable finalized versions (Stage 2, docs/supabase-desk-case-versions.sql).
// This file is pure: no clock, no network. Every function takes the case and returns a new case; nothing here computes a market figure (pages and emails compute nothing, everything comes from oneEngineAnswer).
export const CASE_STATUS = ["new", "in_review", "ready", "finalized"];
export const SOURCES = ["seller", "vin_decoded", "records", "analyst_verified", "missing", "conflicting"];
// the vehicle fields as received. Mileage is ONE field, fields.mileage, and nowhere else in the case.
export const FIELD_KEYS = ["vin", "year", "make", "model", "trim", "body", "transmission", "generation", "mileage", "colour", "accident_history", "service_history"];
export const NEEDS_STATE = ["open", "done", "waived"];
export const EXCLUSION_SCOPES = ["market_calc", "report"];

const clone = x => structuredClone(x);
const str = (v, n = 400) => String(v == null ? "" : v).slice(0, n);
const num = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
const blankField = () => ({ value: null, source: "missing", verified: false, candidates: [] });

// A case with no lead data at all must work: every field is "missing", nothing else is required.
export function newCase({ org = "sam", leadRef = null, seller = null, submittedAt = null, now, vehicle = {}, source = "seller" } = {}) {
  const at = now || new Date().toISOString();
  const c = {
    org: str(org, 80), lead_ref: leadRef ? str(leadRef, 120) : null, seller: seller ? { name: str(seller.name, 120) || null, email: str(seller.email, 160) || null } : null,
    submitted_at: submittedAt || (leadRef ? at : null), opened_at: null, status: "new",
    fields: Object.fromEntries(FIELD_KEYS.map(k => [k, blankField()])), asked: [],
    photos: { items: [], coverId: null, reportIds: [] }, documents: [], needs_review: [],
    condition: { suggested: null, selected: null }, assessment: { figure: null, low: null, high: null, explanation: "" },
    reserve: { figure: null, rationale: "", seller_agreed: false }, factors: [], exclusions: [], audit: [], version: 1
  };
  let out = c;
  for (const k of FIELD_KEYS) if (vehicle[k] != null && vehicle[k] !== "") out = setField(out, k, vehicle[k], source, { by: "intake", now: at, quiet: true });
  return out;
}

const normal = (k, v) => k === "mileage" ? num(v) : k === "year" ? (Number(v) >= 1885 && Number(v) <= 2100 ? Number(v) : null) : k === "vin" ? (str(v, 40).toUpperCase().replace(/[^A-Z0-9]/g, "") || null) : (str(v, 200).trim() || null);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// One place a field is written. The source says where THIS value came from. A different value from a different source than the one held makes the field "conflicting" (both kept as candidates, the held value stays
// until the analyst settles it). analyst_verified is the analyst's own say and settles a conflict. Correcting an existing value logs an audit line and resets its verification (Stage 2 reads that line).
export function setField(c0, key, value, source, { by = "analyst", now, quiet = false } = {}) {
  if (!FIELD_KEYS.includes(key)) throw new Error("not a case field: " + key);
  if (!SOURCES.includes(source) || source === "missing" || source === "conflicting") throw new Error("not a source a value can come from: " + source);
  const c = clone(c0), f = c.fields[key], v = normal(key, value), at = now || new Date().toISOString();
  if (v == null) return c;
  const had = f.value != null;
  if (!had) { f.value = v; f.source = source; f.verified = source === "analyst_verified"; f.candidates = [{ value: v, source }]; }
  else if (same(f.value, v)) { if (source === "analyst_verified") { f.source = source; f.verified = true; } else if (!f.candidates.some(x => x.source === source)) f.candidates.push({ value: v, source }); }
  else if (source === "analyst_verified") { const was = f.value; f.value = v; f.source = source; f.verified = true; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }
  else if (by === "analyst") { const was = f.value; f.value = v; f.source = source; f.verified = false; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }
  else { f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; f.source = "conflicting"; f.verified = false; }
  if (!quiet) c.audit.push({ at, by, what: "set", field: key, to: v, source });
  return c;
}

// A FIELD ASKED ONCE IS NEVER ASKED AGAIN. What the Desk still needs from the seller is the fields with no value that have not been asked; asking them records it. A field the seller answered is not missing, and a field
// asked and left unanswered is not asked a second time (it is a needs-review item for the analyst instead).
export const stillToAsk = c => FIELD_KEYS.filter(k => c.fields[k].value == null && !c.asked.includes(k));
export function markAsked(c0, keys, now) { const c = clone(c0), ks = (keys || []).filter(k => FIELD_KEYS.includes(k) && !c.asked.includes(k)); c.asked.push(...ks); if (ks.length) c.audit.push({ at: now || new Date().toISOString(), by: "desk", what: "asked", field: ks.join(",") }); return c; }
// mileage is one field; this is the only read of it
export const mileageOf = c => c.fields.mileage.value;

// Photos are APPEND ONLY: there is no remove. The first photo is the cover until another is made the cover; the report selection is a subset the analyst picks.
export function addPhoto(c0, photo, now) {
  const c = clone(c0); if (!photo || !photo.id) throw new Error("a photo needs an id");
  if (c.photos.items.some(p => p.id === photo.id)) return c;
  c.photos.items.push({ id: String(photo.id), name: str(photo.name, 120) || "photo", addedAt: now || new Date().toISOString() });
  if (!c.photos.coverId) c.photos.coverId = String(photo.id);
  c.photos.reportIds.push(String(photo.id));
  c.audit.push({ at: now || new Date().toISOString(), by: "analyst", what: "photo added", field: "photos", to: String(photo.id) });
  return c;
}
export function setCover(c0, id) { if (!c0.photos.items.some(p => p.id === id)) throw new Error("no such photo"); const c = clone(c0); c.photos.coverId = id; if (!c.photos.reportIds.includes(id)) c.photos.reportIds.push(id); return c; }
export function selectForReport(c0, ids) { const c = clone(c0), have = new Set(c.photos.items.map(p => p.id)); c.photos.reportIds = ids.filter(i => have.has(i)); if (c.photos.coverId && !c.photos.reportIds.includes(c.photos.coverId)) c.photos.reportIds.unshift(c.photos.coverId); return c; }
export function addDocument(c0, doc) { const c = clone(c0); if (c.documents.some(d => d.id === doc.id)) return c; c.documents.push({ id: String(doc.id), name: str(doc.name, 120) || "document", kind: str(doc.kind, 40) || "other", status: doc.status === "received" ? "received" : "outstanding" }); return c; }

// Needs-review items: the state is open, done or waived, and a waived item must say why.
export function setNeed(c0, id, state, reason = "") {
  if (!NEEDS_STATE.includes(state)) throw new Error("bad state");
  const c = clone(c0), it = c.needs_review.find(n => n.id === id); if (!it) throw new Error("no such item");
  if (state === "waived" && !str(reason).trim()) throw new Error("waiving an item needs a reason");
  it.state = state; it.reason = state === "waived" ? str(reason, 300) : (it.reason || ""); return c;
}
export function addNeed(c0, { id, label, material = false }) { const c = clone(c0); if (!c.needs_review.some(n => n.id === id)) c.needs_review.push({ id: str(id, 60), label: str(label, 200), material: !!material, state: "open", reason: "" }); return c; }
export function excludeSale(c0, { saleId, scope, reason, now }) {
  if (!EXCLUSION_SCOPES.includes(scope)) throw new Error("bad scope"); if (!str(reason).trim()) throw new Error("an exclusion needs a reason");
  const c = clone(c0); if (c.exclusions.some(e => e.saleId === String(saleId) && e.scope === scope)) return c;
  c.exclusions.push({ saleId: String(saleId), scope, reason: str(reason, 300), at: now || new Date().toISOString() }); return c;
}

// The case as a sheet reads it. A sheet that has no case (every sheet before V3) gets one built from what it already holds; the case is then stored under sheet.case. Nothing is asked twice: what the sheet's
// submission carried (mileage, photos, documents) lands in the case once, as seller-sourced.
export function ensureCase(sheet, now) {
  if (sheet.case && sheet.case.fields) return sheet.case;
  const sub = sheet.submission || {}, at = now || sheet.created_at;
  let c = newCase({ org: sheet.org || "sam", leadRef: sub.typed ? null : sheet.id, seller: sub.consignor, submittedAt: sub.typed ? null : sheet.created_at, now: at, vehicle: {} });
  c.opened_at = sheet.opened_at || null;
  if (sheet.vin) c = setField(c, "vin", sheet.vin, sub.typed ? "analyst_verified" : "seller", { by: "intake", now: at, quiet: true });
  if (sub.mileage) c = setField(c, "mileage", sub.mileage, sub.typed ? "analyst_verified" : "seller", { by: "intake", now: at, quiet: true });
  for (const p of sub.photos || []) c = addPhoto(c, p, at);
  for (const d of sub.documents || []) c = addDocument(c, d);
  c.audit = [];
  return c;
}
