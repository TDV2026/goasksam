// DESK V3, STAGE 1: THE CASE RECORD (Lane D, Nov 8 2026). A lead becomes a case. The case lives INSIDE the existing Desk sheet record (desk_sheets.sheet, key `case`), not in a new desk_cases table, because the sheet
// already carries what a case needs and Stage 2 depends on it: the org and seat ownership, RLS, the compare and set version (putIf), the photo and document tables, intake from email, and the immutability triggers.
// A second table would duplicate all of that and split one car across two rows. What IS new is one table for immutable finalized versions (Stage 2, docs/supabase-desk-case-versions.sql).
// This file is pure: no clock, no network. Every function takes the case and returns a new case; nothing here computes a market figure (pages and emails compute nothing, everything comes from oneEngineAnswer).
export const CASE_STATUS = ["new", "in_review", "ready", "finalized"];
export const SOURCES = ["seller", "vin_decoded", "records", "analyst_verified", "missing", "conflicting"];
// the vehicle fields as received. Mileage is ONE field, fields.mileage, and nowhere else in the case.
export const FIELD_KEYS = ["vin", "year", "make", "model", "trim", "body", "transmission", "generation", "mileage", "colour", "accident_history", "service_history"];
// the stage the page draws (Lane E's names): the stored status in_review is "review", finalized is "final"
export const STAGE_OF = { new: "new", in_review: "review", ready: "ready", finalized: "final" };
export const STAGES = ["new", "review", "ready", "final", "sent"];   // "sent" is the sheet's own state (the report went out), not a case status: the finalized case is never changed
export const NEEDS_STATE = ["open", "done", "waived"];
// THE ENGINE'S OWN THREE SCOPES (Lane B, lib/deskV3.js SCOPES), spelled exactly as it spells them: market_calc leaves the market figures (and their quarters, factors and outside sentence), report_comps leaves the report's comparables list,
// note_only changes neither: it records the reason and scope in the audit trail and on the comparable. A scope the engine does not know it reads as note_only, so a made up name would silently do nothing.
export const EXCLUSION_SCOPES = ["market_calc", "report_comps", "note_only"];
import { reasonLine } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";

// EVERY AUDIT ENTRY CARRIES ITS OWN SENTENCE (Lane D, Nov 9 2026): the entry keeps its facts (what, field, from, to) and gains `line`, a lib/reasonWords.js line built here with the figure formatters (moneyWords inside the line, countNoun for a mileage). The page prints `line`
// as carried; it never builds a sentence from an entry's parts. One door for every writer of the trail: nothing pushes to case.audit directly (scripts/deskAuditLineCheck.mjs).
const AUDIT_LABEL = { vin: "VIN", year: "Year", make: "Make", model: "Model", trim: "Trim", body: "Body", transmission: "Transmission", generation: "Generation", mileage: "Mileage", colour: "Colour", accident_history: "Accident history", service_history: "Service history" };
const auditVal = (field, v) => (v == null ? "nothing" : field === "mileage" ? countNoun(v, "mile", { words: false }) : String(v));
const SCOPE_WORDS = { market_calc: "market_calc", report_comps: "report_comps", note_only: "note_only" };
export function auditLineOf(e) {
  const what = String(e.what || ""), label = AUDIT_LABEL[e.field] || String(e.field || "");
  if (what === "corrected") return reasonLine("case.audit.corrected", { label, from: auditVal(e.field, e.from), to: auditVal(e.field, e.to) });
  if (what === "set") return reasonLine("case.audit.set", { label, to: auditVal(e.field, e.to) });
  if (what === "verified") return reasonLine("case.audit.verified", { label });
  if (what === "asked") return reasonLine("case.audit.asked", { count: countNoun(String(e.field || "").split(",").filter(Boolean).length, "detail", { words: false }) });
  if (what === "photo added") return reasonLine("case.audit.photo_added");
  if (what === "next step edited") return reasonLine("case.audit.step_edited");
  if (what === "next step removed") return reasonLine("case.audit.step_removed");
  if (what === "next step added") return reasonLine("case.audit.step_added");
  if (what === "next steps reordered") return reasonLine("case.audit.steps_reordered");
  if (what === "document added") return reasonLine("case.audit.document_added", { kind: reasonLine("case.doc.kind." + (DOC_KINDS.includes(e.to) ? e.to : "other")) });
  if (what === "cover set") return reasonLine("case.audit.cover_set");
  if (what === "report photos selected") return reasonLine("case.audit.photos_selected", { count: countNoun(String(e.to || "").split(",").filter(Boolean).length, "photo", { words: false }) });
  const ex = /^excluded \((\w+)\)$/.exec(what); if (ex) return reasonLine("case.audit.excluded_" + (SCOPE_WORDS[ex[1]] || "note_only"));
  if (what === "assessment set from the engine's median") return reasonLine("case.audit.assessment_seeded", { figure: e.to });
  if (what === "forwarded lead received") return reasonLine("case.audit.forwarded");
  if (what === "email added") return reasonLine("case.audit.email_added", { what: String(e.to || "") });
  if (what === "sale restored") return reasonLine("case.audit.restored");
  if (what === "reserve set from the engine") return reasonLine("case.audit.reserve_seeded", { figure: e.to });
  if (what.startsWith("reserve cleared")) return reasonLine("case.audit.reserve_cleared");
  if (what === "reserve changed") return reasonLine("case.audit.reserve_taken", { from: e.from, figure: e.to });
  if (what === "reserve back to the engine") return reasonLine("case.audit.reserve_restarted");
  if (what === "reserve seller request") return reasonLine("case.audit.reserve_seller", { on: e.to === true });
  if (what === "period changed") return reasonLine("case.audit.window_set", { months: e.to });
  if (what.startsWith("assessment cleared")) return reasonLine("case.audit.assessment_cleared");
  if (what === "assessment taken over from the engine") return e.from != null ? reasonLine("case.audit.assessment_taken", { figure: e.from }) : reasonLine("case.audit.assessment_set");
  const re = /^reopened as version (\d+)$/.exec(what); if (re) return reasonLine("case.audit.reopened", { version: countNoun(Number(re[1]), "version", { words: false }).replace(/^\d+ versions?$/, "version " + re[1]) });
  const fi = /^finalized version (\d+)$/.exec(what); if (fi) return reasonLine("case.audit.finalized", { version: "version " + fi[1] });
  return reasonLine("case.audit.other");
}
export function logAudit(c, e) { c.audit.push({ ...e, line: auditLineOf(e) }); }

const clone = x => structuredClone(x);
const str = (v, n = 400) => String(v == null ? "" : v).slice(0, n);
const num = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
const blankField = () => ({ value: null, source: "missing", verified: false, candidates: [] });

// A case with no lead data at all must work: every field is "missing", nothing else is required.
export function newCase({ org = "sam", leadRef = null, seller = null, submittedAt = null, now, vehicle = {}, source = "seller", origin = null } = {}) {
  const at = now || new Date().toISOString();
  const c = {
    org: str(org, 80), lead_ref: leadRef ? str(leadRef, 120) : null, seller: seller ? { name: str(seller.name, 120) || null, email: str(seller.email, 160) || null, ...(seller.phone ? { phone: str(seller.phone, 40) } : {}), ...(seller.asking_price != null && num(seller.asking_price) ? { asking_price: num(seller.asking_price) } : {}), ...(seller.notes ? { notes: str(seller.notes, 2000) } : {}) } : null,
    origin: origin === "forwarded" || origin === "typed" ? origin : null,
    submitted_at: submittedAt || (leadRef ? at : null), opened_at: null, opens: [], finalized_at: null, handling_seconds: null, status: "new",
    fields: Object.fromEntries(FIELD_KEYS.map(k => [k, blankField()])), asked: [],
    photos: { items: [], coverId: null, reportIds: [] }, documents: [], needs_review: [],
    condition: { suggested: null, selected: null }, assessment: { figure: null, low: null, high: null, explanation: "", source: null },
    reserve: { figure: null, source: null, sellerRequested: false, why: "", whyEdited: false, conditionNote: "", rationale: "", seller_agreed: false }, windowMonths: 12, factors: [], exclusions: [], audit: [], version: 1
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
  else if (source === "analyst_verified") { const was = f.value; f.value = v; f.source = source; f.verified = false; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; logAudit(c, { at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }
  else if (by === "analyst") { const was = f.value; f.value = v; f.source = source; f.verified = false; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; logAudit(c, { at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }
  else { f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; f.source = "conflicting"; f.verified = false; }
  if (!quiet) logAudit(c, { at, by, what: "set", field: key, to: v, source });
  return c;
}

// HANDLING TIME (Stage 5). The first time each analyst opens the case is recorded once (opens: [{ seat, at }]); case.opened_at is the first open of anyone. Opening again changes nothing. Handling seconds are taken on finalize,
// from the finalizing analyst's own first open to the finalize. The seat stays inside the case: nothing that leaves the org carries it (lib/desk/caseView.js deskOpsByOrg).
export function recordOpen(c0, seat, now) {
  const at = now || new Date().toISOString(), c = clone(c0); c.opens = Array.isArray(c.opens) ? c.opens : [];
  if (c.opens.some(o => o.seat === String(seat))) return c0;
  c.opens.push({ seat: String(seat), at }); if (!c.opened_at) c.opened_at = at; return c;
}
export const handlingSeconds = (c, seat, finalizedAt) => { const o = (c.opens || []).find(x => x.seat === String(seat)), from = o ? o.at : c.opened_at; if (!from) return null; const s = Math.round((Date.parse(finalizedAt) - Date.parse(from)) / 1000); return Number.isFinite(s) && s >= 0 ? s : null; };
// A FIELD ASKED ONCE IS NEVER ASKED AGAIN. What the Desk still needs from the seller is the fields with no value that have not been asked; asking them records it. A field the seller answered is not missing, and a field
// asked and left unanswered is not asked a second time (it is a needs-review item for the analyst instead).
export const stillToAsk = c => FIELD_KEYS.filter(k => c.fields[k].value == null && !c.asked.includes(k));
export function markAsked(c0, keys, now) { const c = clone(c0), ks = (keys || []).filter(k => FIELD_KEYS.includes(k) && !c.asked.includes(k)); c.asked.push(...ks); if (ks.length) logAudit(c, { at: now || new Date().toISOString(), by: "desk", what: "asked", field: ks.join(",") }); return c; }
// mileage is one field; this is the only read of it
export const mileageOf = c => c.fields.mileage.value;

// The analyst's own confirmation of the value held (a correction never does this: it resets it).
export function verifyField(c0, key, { by = "analyst", now } = {}) {
  if (!FIELD_KEYS.includes(key)) throw new Error("not a case field: " + key);
  const c = clone(c0), f = c.fields[key]; if (f.value == null) throw new Error("nothing to verify");
  if (f.verified) return c0;
  f.verified = true; f.source = "analyst_verified"; logAudit(c, { at: now || new Date().toISOString(), by, what: "verified", field: key, to: f.value }); return c;
}
// Photos are APPEND ONLY: there is no remove. The first photo is the cover until another is made the cover; the report selection is a subset the analyst picks.
export function addPhoto(c0, photo, now) {
  const c = clone(c0); if (!photo || !photo.id) throw new Error("a photo needs an id");
  if (c.photos.items.some(p => p.id === photo.id)) return c;
  c.photos.items.push({ id: String(photo.id), name: str(photo.name, 120) || "photo", addedAt: now || new Date().toISOString() });
  if (!c.photos.coverId) c.photos.coverId = String(photo.id);
  c.photos.reportIds.push(String(photo.id));
  logAudit(c, { at: now || new Date().toISOString(), by: "analyst", what: "photo added", field: "photos", to: String(photo.id) });
  return c;
}
export function setCover(c0, id) { if (!c0.photos.items.some(p => p.id === id)) throw new Error("no such photo"); const c = clone(c0); c.photos.coverId = id; if (!c.photos.reportIds.includes(id)) c.photos.reportIds.push(id); return c; }
export function selectForReport(c0, ids) { const c = clone(c0), have = new Set(c.photos.items.map(p => p.id)); c.photos.reportIds = ids.filter(i => have.has(i)); if (c.photos.coverId && !c.photos.reportIds.includes(c.photos.coverId)) c.photos.reportIds.unshift(c.photos.coverId); return c; }
// DOCUMENTS (Lane D, Nov 10 2026). The kinds an analyst files: invoice (a service invoice), title, inspection, other. "service" is the older spelling of invoice and stays readable. A document that is received carries when, by whom and what file; one that is only expected is outstanding.
export const DOC_KINDS = ["invoice", "title", "inspection", "other"];
export const kindOfDoc = d => (d && d.kind === "service" ? "invoice" : DOC_KINDS.includes(d && d.kind) ? d.kind : "other");
export const isServiceInvoice = d => !!d && kindOfDoc(d) === "invoice" && d.status === "received";
export function addDocument(c0, doc) {
  const c = clone(c0); if (c.documents.some(d => d.id === doc.id)) return c;
  c.documents.push({ id: String(doc.id), name: str(doc.name, 120) || "document", kind: str(doc.kind, 40) || "other", status: doc.status === "received" ? "received" : "outstanding", ...(doc.title ? { title: str(doc.title, 120) } : {}), ...(doc.status === "received" ? { receivedAt: doc.receivedAt || null, by: doc.by || null, bytes: Number(doc.bytes) || null, contentType: doc.contentType ? str(doc.contentType, 80) : null, storedAs: doc.storedAs ? str(doc.storedAs, 200) : null } : {}) });
  return c;
}

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
  const at = now || new Date().toISOString(); c.exclusions.push({ saleId: String(saleId), scope, reason: str(reason, 300), at }); logAudit(c, { at, by: "analyst", what: "excluded (" + scope + ")", field: "exclusions", to: String(saleId), reason: str(reason, 300) }); return c;
}

// RESTORE undoes an exclusion by sale id (every scope the sale was excluded under) and logs it. A sale that is not excluded is refused by the caller (null here).
export function restoreSale(c0, { saleId, now }) {
  const id = String(saleId); if (!c0.exclusions.some(e => e.saleId === id)) return null;
  const c = clone(c0), at = now || new Date().toISOString(); c.exclusions = c.exclusions.filter(e => e.saleId !== id); logAudit(c, { at, by: "analyst", what: "sale restored", field: "exclusions", to: id }); return c;
}

// The case as a sheet reads it. A sheet that has no case (every sheet before V3) gets one built from what it already holds; the case is then stored under sheet.case. Nothing is asked twice: what the sheet's
// submission carried (mileage, photos, documents) lands in the case once, as seller-sourced.
export function ensureCase(sheet, now) {
  if (sheet.case && sheet.case.fields) return sheet.case;
  const sub = sheet.submission || {}, at = now || sheet.created_at;
  let c = newCase({ org: sheet.org || "sam", leadRef: sub.typed ? null : sheet.id, seller: sub.consignor, submittedAt: sub.typed ? null : sheet.created_at, now: at, vehicle: {}, origin: sub.typed ? "typed" : "forwarded" });
  c.opened_at = sheet.opened_at || null;
  if (sheet.vin) c = setField(c, "vin", sheet.vin, sub.typed ? "analyst_verified" : "seller", { by: "intake", now: at, quiet: true });
  if (sub.mileage) c = setField(c, "mileage", sub.mileage, sub.typed ? "analyst_verified" : "seller", { by: "intake", now: at, quiet: true });
  for (const p of sub.photos || []) c = addPhoto(c, p, at);
  for (const d of sub.documents || []) c = addDocument(c, d);
  c.audit = [];
  return c;
}
