// DESK V3, STAGE 2: THE WORKFLOW RULES (Lane D, Nov 8 2026). Pure functions over the case (lib/desk/caseModel.js); the engine is reached only through an injected `read`, which is sheetRead's oneEngineAnswer read. Nothing here makes a market
// figure: the evidence, the comparables and the quartiles are fields of what the engine answered (sheet.desk, Lane B's shapes in docs/lane-notes.md), stored on the case as case.desk.
import { reasonLine } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";
import { viewOf, viewKey, hasViews, reserveCheckOf as engineReserveCheck } from "../deskV3.js";
import { recordSync, compactWords } from "../wordsLedger.js";
// the engine's check of the reserve is made here after the read, so its sentences are recorded in the case's ledger like the read's own (lib/wordsLedger.js)
const setReserveCheck = (desk, compute) => { const { result, refs } = recordSync(compute), d = { ...desk, reserveCheck: result }; d.words = compactWords(refs, d, desk.words); return d; };
import { syncSteps, editStep, removeStep, addStep, orderSteps } from "./nextSteps.js";
import { syncConsidered, editConsidered, removeConsidered, addConsidered } from "./considered.js";
import { takeFromLastSale, isServiceInvoice, kindOfDoc, addDocument, logAudit, handlingSeconds, markAsked, stillToAsk, setField, verifyField, FIELD_KEYS, addNeed, setNeed, excludeSale, addPhoto, setCover as setCoverM, selectForReport } from "./caseModel.js";
const clone = x => structuredClone(x);
const iso = now => now || new Date().toISOString();

// WHAT THE ENGINE IS ASKED. (An exclusion re-calls when it changes what the engine answers: market_calc moves the figures, report_comps moves the comparables list. note_only changes nothing, so it never costs a read.) (Generation is NOT in the key: the engine derives it from the verified year, so a generation edit logs an audit line and nothing else. Sam, Nov 8 2026.) A change to any of these re-calls it; nothing else does (a note, a photo or a reserve never costs a read). Mileage, transmission, body and generation are the case's fields; the
// market_calc exclusions leave the calculation; the condition the analyst selected is the tier (it changes the pool, so it re-calls too).
// THE RESERVE AS THE CASE HOLDS IT (V4): one recommended reserve, the figure, where it came from (engine until the analyst changes it once), whether it is the seller's request, the why and the condition note. A case stored before V4 carries the old
// {figure, rationale, seller_agreed}: its figure is the analyst's (never reseeded) and its rationale is the why.
export const WINDOWS = [6, 12, 24];
export const windowOf = c => (WINDOWS.includes(Number(c.windowMonths)) ? Number(c.windowMonths) : 12);
export function reserveOf(c) { const r = c.reserve || {}; return { figure: r.figure == null ? null : r.figure, source: r.source || (r.figure != null ? "analyst" : null), sellerRequested: r.sellerRequested === true, why: String(r.why != null ? r.why : r.rationale || ""), whyEdited: r.whyEdited === true || (r.why == null && !!String(r.rationale || "").trim()), conditionNote: String(r.conditionNote || ""), seller_agreed: r.seller_agreed === true, sellerPreference: ["yes", "no", "not_sure"].includes(r.sellerPreference) ? r.sellerPreference : null }; }
export function recallInput(c, caseDate) {
  const f = k => c.fields[k].value, tier = c.condition && Number(c.condition.selected && c.condition.selected.tier);
  const verification = {}; for (const [k, key] of [["transmission", "transmission"], ["mileage", "mileage_band"]]) if (c.fields[k].value != null) verification[key] = c.fields[k].verified ? "verified" : c.fields[k].source === "seller" ? "seller_stated" : "not_confirmed";
  const doc = c.documents.some(d => kindOfDoc(d) === "invoice"); if (doc) verification.service_ims = c.documents.some(isServiceInvoice) ? "documented" : "seller_stated";
  return {
    ...(f("vin") ? { vin: f("vin") } : { year: f("year"), make: f("make"), model: f("model") }), mileage: f("mileage"), ...(f("body") ? { bodyStyle: f("body") } : {}), ...(f("trim") ? { trim: f("trim") } : {}), ...([1, 2, 3, 4].includes(tier) ? { tier } : {}),
    desk: { caseDate: caseDate || null, views: true, windowMonths: windowOf(c), reserve: reserveOf(c).figure, transmission: f("transmission"), label: [f("year"), f("make"), f("model")].filter(Boolean).join(" ") || null, case: { verification }, exclusions: c.exclusions.map(e => ({ saleId: e.saleId, scope: e.scope, reason: e.reason, at: e.at })) }
  };
}
export const recallKey = c => JSON.stringify([c.fields.vin.value, c.fields.year.value, c.fields.make.value, c.fields.model.value, c.fields.mileage.value, c.fields.transmission.value, c.fields.body.value, c.exclusions.filter(e => e.scope !== "note_only").map(e => e.scope + ":" + e.saleId).sort(), reserveOf(c).figure, ...(c.fields.trim && c.fields.trim.value ? [c.fields.trim.value] : [])]);   // the trim joins the key only when the case has one, so a stored case without a trim keeps its key
// THE PERIOD AND THE CONDITION ARE NOT IN THE KEY (Lane D, Nov 11 2026): the engine's one read carries a view for each (desk.views), so a switch adopts a stored view and asks nothing. A stored answer is stale only when it is not the answer for the period and the condition the case now holds
// (desk.view says which it is): a read that carried no views (an older case, a failed build) is then read again, once.
export const viewOfCase = c => ({ tier: c.condition && c.condition.selected && [1, 2, 3, 4].includes(Number(c.condition.selected.tier)) ? Number(c.condition.selected.tier) : 0, months: windowOf(c) });
export const needsRecall = c => { if (!c.desk || c.desk.key !== recallKey(c)) return true; const w = viewOfCase(c), v = c.desk.view; return !(v && v.tier === w.tier && v.months === w.months); };
// Re-call the engine for the case and store BOTH desk.original (the untouched evidence) and desk.evidence (with the market_calc exclusions out). A retry answer or a failed read is never stored over a good one.
export async function refreshEvidence(c0, read, { caseDate, now } = {}) {
  if (!needsRecall(c0)) return { case: c0, recalled: false };
  // At most two reads: the first answers with the engine's start, the case takes it as its reserve, and the second asks the engine to check that reserve (reserveCheck). A read that moves nothing ends it.
  let c = c0, recalled = false, retry = null;
  for (let i = 0; i < 2 && needsRecall(c); i++) {
    const sheet = await read(recallInput(c, caseDate || iso(now).slice(0, 10)));
    if (!sheet || sheet.retry || !sheet.desk) { retry = sheet && sheet.retry ? sheet : null; break; }
    c = adoptRead(c, sheet, iso(now)); recalled = true;
  }
  return { case: c, recalled, ...(retry ? { retry } : {}) };
}
// Store the engine's answer on the case under the key of the case AS IT NOW STANDS, so the next edit that moves none of the engine's inputs costs no read. One place, used by every road that reads the engine (an edit, a new case).
export function adoptRead(c0, sheet, now) {
  const c = clone(c0); c.desk = { key: recallKey(c0), readAt: iso(now), view: viewOfCase(c0), ...sheet.desk };
  if (sheet.own) c.vehicle = { ...(c.vehicle || {}), ownHistory: sheet.own.history || [], vinLiveMatch: sheet.own.vinLiveMatch || null };   // the VIN's own record (lib/desk/ownCar.js): figures only, every sentence is made at serve time
  c.record = { appearances: sheet.exact && Array.isArray(sheet.exact.appearances) ? sheet.exact.appearances.length : null, none: sheet.exact ? sheet.exact.none || null : null };   // the VIN's own record, as the engine read it
  // THE GENERATION THE ENGINE NAMED IS THE CASE'S (Lane F's run: the header said 996 while the Generation row said Not confirmed): a blank generation takes the engine's, marked decoded for a VIN and from the records for typed words, unverified; one the seller or the analyst gave is never touched
  const gen = sheet.desk && sheet.desk.generation, g = c.fields.generation;
  const withGen = gen && g && g.value == null ? setField(c, "generation", gen, c.fields.vin.value ? "vin_decoded" : "records", { by: "engine", now: iso(now), quiet: true }) : c;
  // THE FIRST READ IS THE ONLY READ OF A NEW CASE (Lane D, Nov 11 2026; Lane F: New case by VIN took 25 seconds, two full reads one after the other): the read answered with no reserve, the case then took the engine's start as its reserve, and a second whole read was made only to check that reserve. The check is the engine's own function over the sales of the read it already holds (reserveCheckOf), as a switch of period does, so the case is complete after one read.
  let out = seedReserve(seedAssessment(withGen, iso(now)), iso(now));
  if (out.desk && Array.isArray(out.desk.sales) && out.desk.evidence) { const fig = reserveOf(out).figure, was = out.desk.reserveCheck; if (fig != null && !(was && was.reserve === fig)) { out = clone(out); out.desk = setReserveCheck(out.desk, () => engineReserveCheck(out.desk.sales, out.desk.evidence, fig, out.desk.evidence.windowMonths || windowOf(out))); } out.desk.key = recallKey(out); }
  return out;
}
// THE ASSESSMENT STARTS AT THE ENGINE'S MEDIAN (Sam, Nov 9 2026): the analyst always has a number to move. The figure is the engine's median and the range its middle half (q1 to q3), source "engine", one audit line. It follows a later engine read (a new tier, a new mileage) until the analyst changes it
// once; from then on it is the analyst's (source "analyst", set by setAssessment) and no read touches it. A read with too few sales gives the engine no median, so an engine-sourced figure is cleared rather than left standing on the old pool.
export function seedAssessment(c0, now) {
  const a = c0.assessment; if (a.source === "analyst" || (a.source !== "engine" && a.figure != null)) return c0;   // the analyst's, or a figure set before this rule existed: never touched
  const ev = c0.desk && c0.desk.evidence, ok = ev && !ev.insufficient && ev.median != null, c = clone(c0);
  const next = ok ? { figure: ev.median, low: ev.q1, high: ev.q3 } : { figure: null, low: null, high: null };
  if (a.figure === next.figure && a.low === next.low && a.high === next.high && (a.source === "engine" || !ok)) return c0;
  c.assessment = { ...a, ...next, source: ok ? "engine" : null };
  logAudit(c, { at: iso(now), by: "engine", what: ok ? "assessment set from the engine's median" : "assessment cleared: the engine has too few sales", field: "assessment", from: a.figure, to: next.figure });
  return c;
}
// THE RECOMMENDED RESERVE STARTS AT THE ENGINE'S START (desk.reserveStart, the first quartile of the chosen period) and its why at the engine's draft (desk.whyDraft). Both follow a later engine read (a new period, a new tier) until the analyst
// changes them once: a typed or dragged figure is the analyst's (source "analyst") and no read touches it; an edited why is the analyst's (whyEdited) and no read touches it. Too few sales gives the engine no start, so an engine-sourced figure is cleared.
export function seedReserve(c0, now) {
  const r = reserveOf(c0), d = c0.desk, start = d && d.reserveStart && d.reserveStart.figure != null ? d.reserveStart.figure : null, draft = d && d.whyDraft ? String(d.whyDraft) : "";
  const ownFigure = r.source === "analyst", figure = ownFigure ? r.figure : start, source = ownFigure ? "analyst" : start != null ? "engine" : null, why = r.whyEdited ? r.why : draft;
  const reserve = { figure, source, sellerRequested: r.sellerRequested, why, whyEdited: r.whyEdited, conditionNote: r.conditionNote, rationale: why, seller_agreed: r.seller_agreed, sellerPreference: r.sellerPreference };
  if (JSON.stringify(reserve) === JSON.stringify(c0.reserve)) return c0;
  const c = clone(c0); c.reserve = reserve;
  if (!ownFigure && figure !== r.figure) logAudit(c, { at: iso(now), by: "engine", what: figure != null ? "reserve set from the engine" : "reserve cleared: the engine has too few sales", field: "reserve", from: r.figure, to: figure });
  return c;
}
// THE PERIOD THE SALES ARE READ OVER (6, 12 or 24 months). It is an input to the engine (the engine recomputes the evidence for it), so a change re-calls.
export function setWindow(c0, months, now) { const m = Number(months); if (!WINDOWS.includes(m)) return null; if (windowOf(c0) === m) return c0; const c = touch(clone(c0), now); c.windowMonths = m; logAudit(c, { at: iso(now), by: "analyst", what: "period changed", field: "window", from: windowOf(c0), to: m }); return settle(adoptView(c, now), now); }
// A SWITCH OF PERIOD OR CONDITION IS AN EDIT ON STORED DATA: the case takes the engine's view for the new (condition, period) out of what it already holds (desk.views), with the engine's own starting reserve and why for that view, and the engine's own check of the reserve the case now holds
// (lib/deskV3.js reserveCheckOf over that view's sales). No read. A case with no views is left as it is and reads once (needsRecall sees the view does not match).
export function adoptView(c0, now) {
  const d = c0.desk; if (!hasViews(d)) return c0;
  const want = viewOfCase(c0), block = viewOf(d, viewKey(want.tier, want.months)); if (!block) return c0;
  const keep = {}; for (const k of ["titleLine", "specLine", "bodyNote", "live"]) if (d[k] !== undefined) keep[k] = d[k];   // the read's own naming of the car and its live listings are the car's, not the view's
  let c = clone(c0); c.desk = { ...block, ...keep, key: d.key, readAt: d.readAt, view: want, views: d.views, pool: d.pool, ...(d.words ? { words: d.words } : {}) };
  c = seedReserve(seedAssessment(c, iso(now)), iso(now));
  const fig = reserveOf(c).figure; c.desk = setReserveCheck(c.desk, () => (fig != null ? engineReserveCheck(c.desk.sales, c.desk.evidence, fig, want.months) : null));
  c.desk.key = recallKey(c); return c;
}
// THE ONE ROAD THAT OPENS A NEW CASE ON THE ENGINE (case_new takes it, and so does a forwarded lead): ask the engine with the case's own inputs (the words typed stand in when there is no VIN or year, make and model), let the engine's decode fill the blank fields,
// store the answer under the case's key, then take the second read that checks the reserve it took. `read(input)` is the injected sheetRead call. Returns { case, recalled, read } (read is what the engine answered, a retry answer included).
export async function openCaseRead(c0, read, { caseDate, now, text = null, fromForm = false } = {}) {
  const inp = recallInput(c0, caseDate || iso(now).slice(0, 10)); if (!inp.vin && text) { delete inp.year; delete inp.make; delete inp.model; inp.text = text; }
  const rd = await read(inp);
  if (!rd || rd.retry === true) return { case: c0, recalled: false, read: rd || null };
  let c = fillFromDecode(fillFromLastSale(c0, rd.own, now, { fromForm }), rd.car && rd.car.decode, now), recalled = false;
  if (rd.desk) { c = adoptRead(c, rd, now); c = (await refreshEvidence(c, read, { caseDate, now })).case; recalled = true; }
  return { case: c, recalled, read: rd };
}
// THE VIN'S OWN LAST LISTING FIRST (Lane D, Nov 13 2026): year, make, model, trim, body, gearbox, colour and mileage from the car's own last sale, marked last_sale and unverified, over the bare decode. Every door that opens a case on the engine comes through openCaseRead, so New case, a typed VIN and a forwarded lead all take it.
export function fillFromLastSale(c0, own, now, { fromForm = false } = {}) {
  let c = c0; const pf = own && own.prefill; if (!pf) return c;
  for (const k of ["year", "make", "model", "trim", "body", "transmission", "colour", "mileage"]) if (pf[k] != null) c = takeFromLastSale(c, k, pf[k], iso(now), { adoptForm: fromForm });   // the New case form fills these from case_decode (the same step); a form value equal to the car's own listing is that listing's, not the analyst's typing
  return c;
}
// A NEW CASE KNOWS THE CAR ONLY BY THE WORDS THE SELLER TYPED: the engine's decode names the rest. Each blank field takes the decoded value, source vin_decoded; a field the seller gave is never touched (so nothing is silently overwritten).
export function fillFromDecode(c0, decode, now) {
  let c = c0; if (!decode) return c;
  for (const [k, v] of [["vin", decode.vin], ["year", decode.year], ["make", decode.make], ["model", decode.model], ["trim", decode.trim], ["body", decode.body], ["transmission", decode.transmission]]) if (v != null && v !== "" && c.fields[k].value == null) c = setField(c, k, v, "vin_decoded", { by: "intake", now: iso(now), quiet: true });
  return c;
}

// WHERE THE RESERVE SITS against the typical range: the engine's own answer (desk.reserveCheck.position, asked with this very reserve), used by the workspace and by the report so they cannot disagree. null when there is no reserve, no range, or the engine has not yet checked this figure.
export function reserveCheckOf(c) { const ck = c.desk && c.desk.reserveCheck, f = reserveOf(c).figure; return f != null && ck && ck.reserve === f ? ck : null; }
export function reservePosition(c) { const ck = reserveCheckOf(c); return ck && ck.position ? ck.position : null; }
// A change after finalizing makes version n plus 1 (the finalized version row is never touched) and takes the case back to review. A first change takes a new case to review.
function touch(c, now) { if (c.status === "finalized") { c.version += 1; c.status = "in_review"; logAudit(c, { at: iso(now), by: "desk", what: "reopened as version " + c.version }); } else if (c.status === "new") c.status = "in_review"; return c; }
export function settle(c0, now) { const c = syncConsidered(syncSteps(c0)); if (c.status === "finalized") return c; const r = readinessOf(c); c.status = r.ready ? "ready" : "in_review"; return c; }

// CORRECTING A FIELD logs an audit line and resets its verification (setField does both). The caller then re-calls the engine when the case's recall key moved.
export function correctField(c0, key, value, { now, by = "analyst" } = {}) { const held = c0.fields[key] && c0.fields[key].value; if (held != null && String(held).toLowerCase() === String(key === "mileage" ? Math.round(Number(String(value).replace(/[^\d.]/g, ""))) : value).toLowerCase()) return c0; return settle(syncNeeds(touch(setField(clone(c0), key, value, "analyst_verified", { now, by }), now)), now); }
// THE SELLER'S OWN WORDS FOR A FACT THE CASE LACKS (Lane D, Nov 12 2026; Sam's second run: "Mark verified" on the accident history was refused because the field was empty). The analyst types what the seller said into the needs-attention item; it is stored on the fact as the seller's statement (source seller, not verified), and Mark verified then works. Only the three facts a needs-attention item is about.
export const SAID_FIELDS = ["accident_history", "service_history", "mileage"];
export function sellerSaid(c0, key, text, now) {
  if (!SAID_FIELDS.includes(key)) throw new Error("not a fact the seller can state here: " + key);
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, 600); if (!t) throw new Error("empty statement");
  return settle(syncNeeds(touch(setField(clone(c0), key, t, "seller", { by: "analyst", now }), now)), now);
}
export function verify(c0, key, { now } = {}) { return settle(syncNeeds(touch(verifyField(c0, key, { now }), now)), now); }

// ASSESSMENT AND RESERVE ARE INDEPENDENT. Each writer builds a new object for its own part and copies the other by reference; the other's bytes cannot change.
const numOrNull = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
export function setAssessment(c0, patch, now) { const c = touch(clone(c0), now), a = c.assessment, p = patch || {}; c.assessment = { figure: "figure" in p ? numOrNull(p.figure) : a.figure, low: "low" in p ? numOrNull(p.low) : a.low, high: "high" in p ? numOrNull(p.high) : a.high, explanation: "explanation" in p ? String(p.explanation || "").slice(0, 2000) : a.explanation, source: "analyst" }; if (a.source !== "analyst") logAudit(c, { at: iso(now), by: "analyst", what: "assessment taken over from the engine", field: "assessment", from: a.figure, to: c.assessment.figure }); return settle(c, now); }
// THE REPORT'S RESERVE MODE (Lane D, Nov 11 2026): the analyst may set the report to recommend NO RESERVE, with a why line. The engine's own answer (desk.reserveMode, Lane B) is what the cover prints; nothing here decides which mode is right. Where the engine says the sales are too few (thin), the analyst must write the why line to choose it.
export const reportReserveModeOf = c => { const m = c.report && c.report.reserveMode || {}; return { mode: m.mode === "no_reserve" ? "no_reserve" : null, why: String(m.why || "") }; };
export function setReportReserveMode(c0, mode, why, now) {
  if (!(mode === null || mode === "no_reserve")) return { refuse: "case.reserve_mode.refuse_mode" };
  const rm = c0.desk && c0.desk.reserveMode, text = String(why || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (mode === "no_reserve") { if (!rm) return { refuse: "case.reserve_mode.refuse_none" }; if (rm.thin === true && !text) return { refuse: "case.reserve_mode.refuse_thin" }; }
  const c = touch(clone(c0), now), was = reportReserveModeOf(c0); c.report = { ...(c.report || {}), reserveMode: { mode, why: mode ? text : "" } };
  if (was.mode !== mode) logAudit(c, { at: iso(now), by: "analyst", what: "report reserve mode", field: "report", to: mode });
  return { case: settle(c, now) };
}
export function setReserve(c0, patch, now) {
  const c = touch(clone(c0), now), r = reserveOf(c0), p = patch || {}, next = { ...r };
  if (p.restart === true) { next.figure = null; next.source = null; next.whyEdited = false; next.sellerRequested = false; logAudit(c, { at: iso(now), by: "analyst", what: "reserve back to the engine", field: "reserve", from: r.figure, to: null }); }
  else if ("figure" in p) { const f = numOrNull(p.figure); if (f !== r.figure) { next.figure = f; next.source = f == null ? null : "analyst"; logAudit(c, { at: iso(now), by: "analyst", what: "reserve changed", field: "reserve", from: r.figure, to: f }); } }
  const why = "why" in p ? p.why : "rationale" in p ? p.rationale : undefined; if (why !== undefined) { next.why = String(why || "").slice(0, 2000); next.whyEdited = true; }
  if ("conditionNote" in p) next.conditionNote = String(p.conditionNote || "").slice(0, 2000);
  if ("sellerRequested" in p && (p.sellerRequested === true) !== r.sellerRequested) { next.sellerRequested = p.sellerRequested === true; logAudit(c, { at: iso(now), by: "analyst", what: "reserve seller request", field: "reserve", to: next.sellerRequested }); }
  if ("seller_agreed" in p) next.seller_agreed = p.seller_agreed === true;
  c.reserve = { ...next, rationale: next.why };
  return settle(c, now);
}
// Photos on a case: all three are edits, so a change after finalizing makes the next version like any other. Append only: there is no remove.
export function editCasedItem(c, id, p, now) { return syncNeeds(touch(editConsidered(c, id, p, iso(now)), now)); }
export function removeCasedItem(c, id, now) { return syncNeeds(touch(removeConsidered(c, id, iso(now)), now)); }
export function addCasedItem(c, p, now) { return syncNeeds(touch(addConsidered(c, p, iso(now)), now)); }
export function addCasePhoto(c0, photo, now) { return syncNeeds(touch(addPhoto(clone(c0), photo, iso(now)), now)); }
// A document received: the file is filed under its kind, the case records it, and a service invoice closes its attention item (syncNeeds) and flips the wording to documented (recallInput).
export function addCaseDocument(c0, doc, now) {
  const at = iso(now), c = touch(addDocument(clone(c0), { ...doc, status: "received", receivedAt: at, by: "analyst" }), now);
  logAudit(c, { at, by: "analyst", what: "document added", field: "documents", to: kindOfDoc(doc) }); return syncNeeds(c);
}
export function setCover(c0, id, now) { const c = touch(setCoverM(clone(c0), id), now); logAudit(c, { at: iso(now), by: "analyst", what: "cover set", field: "photos", to: id }); return c; }
export function selectPhotos(c0, ids, now) { const c = touch(selectForReport(clone(c0), ids), now); logAudit(c, { at: iso(now), by: "analyst", what: "report photos selected", field: "photos", to: ids.join(",") }); return c; }
export function selectComparables(c0, ids, now) { const c = touch(clone(c0), now); c.selectedComparables = [...new Set((ids || []).map(String))]; return settle(c, now); }
export function setCondition(c0, selected, now) { const c = touch(clone(c0), now); c.condition = { ...c.condition, selected: selected && selected.tier ? { tier: Number(selected.tier), name: String(selected.name || "") } : null }; return settle(adoptView(c, now), now); }

// NEEDS REVIEW IS GENERATED FROM SOURCE STATES, never typed. Four sources; only a material one blocks finalizing. An item the analyst closed or waived keeps its state while the cause stands; an item whose cause is gone closes itself.
export const NEED_RULES = [
  { id: "car_unidentified", material: true, label: reasonLine("case.need.car_unidentified"), applies: c => !(c.fields.vin.value || (c.fields.year.value && c.fields.make.value && c.fields.model.value)) },
  { id: "mileage_unconfirmed", material: true, label: "Mileage is not confirmed", applies: c => c.fields.mileage.value == null || !c.fields.mileage.verified },
  { id: "vin_mismatch", material: true, label: "The VIN and the other details do not agree", applies: c => c.fields.vin.source === "conflicting" || ["year", "make", "model"].some(k => c.fields[k].source === "conflicting") },
  { id: "accident_unclear", material: true, label: "Accident history is unclear", applies: c => c.fields.accident_history.value == null || c.fields.accident_history.source === "conflicting" || !c.fields.accident_history.verified },
  { id: "service_documents", material: false, label: "No service documents received", applies: c => !c.documents.some(isServiceInvoice) }
];
export function syncNeeds(c0) {
  let c = clone(c0);
  for (const r of NEED_RULES) {
    const on = r.applies(c), it = c.needs_review.find(n => n.id === r.id);
    if (on && !it) c = addNeed(c, { id: r.id, label: r.label, material: r.material });
    else if (on && it && it.state === "done") it.state = "open";   // the cause is back: it is open again
    else if (!on && it && it.state === "open") { it.state = "done"; it.reason = it.reason || "The cause no longer applies."; }
    // A WAIVED ITEM WHOSE CAUSE IS GONE LEAVES THE LIST (Lane D, Nov 11 2026, Sam's first run: "Mileage is not confirmed (waived)" under Needs attention while the Mileage row read Verified): the open items come from the marks, so the waiver is not kept once the mark says the cause no longer stands
    else if (!on && it && it.state === "waived") c.needs_review = c.needs_review.filter(n => n.id !== r.id);
  }
  return c;
}
// FIELDS ASKED OF THE SELLER: a field is asked once. The answer is the fields newly asked (the ones the Desk may put to the seller now) and the case with them recorded.
export function askFields(c0, keys, now) { const fresh = stillToAsk(c0).filter(k => (keys || []).includes(k)); return { case: fresh.length ? markAsked(c0, fresh, iso(now)) : c0, fields: fresh }; }
export { setNeed };
export const editNextStep = (c, id, text, now) => settle(editStep(c, id, text, now), now), removeNextStep = (c, id, now) => settle(removeStep(c, id, now), now), addNextStep = (c, text, now) => settle(addStep(c, text, now), now), orderNextSteps = (c, order, now) => settle(orderSteps(c, order, now), now);

// READINESS (V4): FOUR REPORT CHECKS, each with the panel's own line (the table's words), and the blockers they raise. Finalize needs all four, the vehicle identified, a photo and a why. Each blocker has its own key so each can be shown and tested alone.
// 1 the reserve is supported by the sales (the ENGINE's answer for this figure) or marked as the seller's request; 2 the seller's stated facts are worded as reported (no seller stated, unverified fact stands as a support); 3 at least two comparables are
// ticked and each carries its own listing; 4 every open item is resolved (done or waived: Received and Proceed without both resolve).
const SUPPORT_FIELD = { transmission: "transmission", mileage_band: "mileage", service_ims: "service_history" };
export function statedFactsBad(c) {
  const bad = []; for (const sp of (c.desk && c.desk.supports) || []) { const k = SUPPORT_FIELD[sp.key]; if (!k) continue; const f = c.fields[k]; const stated = f && f.source === "seller" && !f.verified && !(sp.key === "service_ims" && c.documents.some(isServiceInvoice)); if (stated) bad.push(sp.title || sp.key); }
  return bad;
}
export function readinessOf(c) {
  const ev = c.desk && c.desk.evidence ? c.desk.evidence : null, blockers = [], add = (key, why) => blockers.push({ key, why });
  const f = k => c.fields[k], idd = f("vin").value && f("vin").source !== "conflicting" || (f("year").value && f("make").value && f("model").value && ["year", "make", "model"].every(k => f(k).source !== "conflicting"));
  if (!idd) add("vehicle", "The vehicle is not identified.");
  const r = reserveOf(c), ck = reserveCheckOf(c), checks = [];
  // 1 the reserve
  const supported = !!(ck && ck.supported === true);
  if (r.figure == null) { add("reserve", "No recommended reserve."); checks.push({ key: "reserve", ok: false, line: reasonLine("case.check.reserve_none") }); }
  else if (supported && !r.sellerRequested) checks.push({ key: "reserve", ok: true, line: reasonLine("case.check.reserve_ok") });
  else if (r.sellerRequested) checks.push({ key: "reserve", ok: true, line: reasonLine(supported ? "case.check.reserve_ok" : "case.check.reserve_seller") });
  else { add("reserve_support", "The reserve is not supported by the sales and is not marked as the seller's request."); checks.push({ key: "reserve", ok: false, line: reasonLine(ck ? "case.check.reserve_high" : "case.check.reserve_unchecked") }); }
  // 2 the seller's stated facts
  const sb = statedFactsBad(c); if (sb.length) add("stated_facts", "A seller stated fact stands as verified: " + sb.join(", ") + "."); checks.push({ key: "stated", ok: !sb.length, line: sb.length ? reasonLine("case.check.stated_bad", { what: sb.join(", ") }) : reasonLine("case.check.stated_ok") });
  // 3 the comparables: those the engine still lists, at least two, each with its own listing
  const listed = c.desk && Array.isArray(c.desk.comparables) ? new Map(c.desk.comparables.map(x => [String(x.id), x])) : null;
  const picked = (c.selectedComparables || []).filter(id => !listed || listed.has(String(id))), nolink = listed ? picked.map(id => listed.get(String(id))).filter(x => x && !x.url) : [];
  if (picked.length < 2) { add("comparable", "Fewer than two comparables are selected."); checks.push({ key: "comparables", ok: false, line: reasonLine("case.check.comps_few") }); }
  else if (nolink.length) { add("comparable_listing", "A selected comparable has no listing address."); checks.push({ key: "comparables", ok: false, line: reasonLine("case.check.comps_nolink", { title: nolink[0].title || "" }) }); }
  else checks.push({ key: "comparables", ok: true, line: reasonLine("case.check.comps_ok") });
  // 4 the open items (every one: Received and Proceed without resolve them)
  const open = c.needs_review.filter(n => n.state === "open"); for (const n of open) add("need:" + n.id, n.label + ".");
  checks.push({ key: "open", ok: !open.length, line: open.length ? reasonLine("case.check.open_n", { count: countNoun(open.length, "open item", { words: false }) }) : reasonLine("case.check.open_ok") });
  if (!r.why.trim()) add("rationale", "No why for the reserve.");
  { const rmode = reportReserveModeOf(c), rm = c.desk && c.desk.reserveMode;   // a report that recommends no reserve needs the engine's answer, and a why where the engine says the sales are too few
    if (rmode.mode === "no_reserve" && !rm) add("reserve_mode", reasonLine("case.reserve_mode.blocker_none")); else if (rmode.mode === "no_reserve" && rm.thin === true && !rmode.why.trim()) add("reserve_mode", reasonLine("case.reserve_mode.blocker_thin")); }
  if (!c.photos.items.length) add("photo", "No photo.");
  const ready = blockers.length === 0;
  return { ready, blockers, checks, hint: reasonLine(ready ? "case.check.hint_ready" : "case.check.hint_blocked") };
}

// FINALIZE writes an immutable version row and sets the status. The row carries everything the report is made from: figures, the evidence block (and the original), the selected comparables as the engine gave them, the verification states
// and the wording (built by lib/desk/reportState.js, Stage 3; null until then). Refused whole when the case is not ready.
export function versionRow(c, now, wording = null) {
  const d = c.desk || {}, sel = new Set(c.selectedComparables || []);
  return {
    version: c.version, finalized_at: iso(now), lead_ref: c.lead_ref, handling_seconds: c.handling_seconds == null ? null : c.handling_seconds,
    figures: { assessment: clone(c.assessment), reserve: clone(c.reserve), windowMonths: windowOf(c) },
    evidence: clone(d.evidence || null), original: clone(d.original || null), exclusions: clone(c.exclusions),
    comparables: (d.comparables || []).filter(x => sel.has(String(x.id))).map(clone),
    verification: Object.fromEntries(FIELD_KEYS.map(k => [k, { value: c.fields[k].value, source: c.fields[k].source, verified: c.fields[k].verified }])),
    documents: clone(c.documents), needs_review: clone(c.needs_review), condition: clone(c.condition), wording
  };
}
export function finalize(c0, { now, wording = null, seat = null } = {}) {
  const r = readinessOf(c0); if (c0.status === "finalized") return { ok: false, why: "This version is already finalized." };
  if (!r.ready) return { ok: false, why: "The case is not ready.", blockers: r.blockers };
  const c = clone(c0); c.status = "finalized"; c.finalized_at = iso(now); c.handling_seconds = handlingSeconds(c, seat, c.finalized_at); logAudit(c, { at: iso(now), by: "analyst", what: "finalized version " + c.version });
  return { ok: true, case: c, row: versionRow(c, now, wording) };
}
