// DESK V3, STAGE 2: THE WORKFLOW RULES (Lane D, Nov 8 2026). Pure functions over the case (lib/desk/caseModel.js); the engine is reached only through an injected `read`, which is sheetRead's oneEngineAnswer read. Nothing here makes a market
// figure: the evidence, the comparables and the quartiles are fields of what the engine answered (sheet.desk, Lane B's shapes in docs/lane-notes.md), stored on the case as case.desk.
import { TIER_NAMES } from "../conditionTier.js";
import { reasonLine } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";
import { reportSalesOf } from "./reportSales.js";
import { viewOf, viewKey, hasViews, reserveCheckOf as engineReserveCheck, DESK_SHAPE } from "../deskV3.js";
import { recordSync, compactWords } from "../wordsLedger.js";
// the engine's check of the reserve is made here after the read, so its sentences are recorded in the case's ledger like the read's own (lib/wordsLedger.js)
const setReserveCheck = (desk, compute) => { const { result, refs } = recordSync(compute), d = { ...desk, reserveCheck: result }; d.words = compactWords(refs, d, desk.words); return d; };
import { syncSteps, editStep, removeStep, addStep, orderSteps } from "./nextSteps.js";
import { syncConsidered, editConsidered, removeConsidered, addConsidered } from "./considered.js";
import { takeFromLastSale, isServiceInvoice, kindOfDoc, addDocument, logAudit, handlingSeconds, markAsked, stillToAsk, setField, verifyField, FIELD_KEYS, addNeed, setNeed, excludeSale, addPhoto, removePhoto as removePhotoM, setCover as setCoverM, selectForReport } from "./caseModel.js";
const clone = x => structuredClone(x);
const iso = now => now || new Date().toISOString();

// WHAT THE ENGINE IS ASKED. (An exclusion re-calls when it changes what the engine answers: market_calc moves the figures, report_comps moves the comparables list. note_only changes nothing, so it never costs a read.) (Generation is NOT in the key: the engine derives it from the verified year, so a generation edit logs an audit line and nothing else. Sam, Nov 8 2026.) A change to any of these re-calls it; nothing else does (a note, a photo or a reserve never costs a read). Mileage, transmission, body and generation are the case's fields; the
// market_calc exclusions leave the calculation; the condition the analyst selected is the tier (it changes the pool, so it re-calls too).
// THE RESERVE AS THE CASE HOLDS IT (V4): one recommended reserve, the figure, where it came from (engine until the analyst changes it once), whether it is the seller's request, the why and the condition note. A case stored before V4 carries the old
// {figure, rationale, seller_agreed}: its figure is the analyst's (never reseeded) and its rationale is the why.
export const WINDOWS = [3, 6, 12, 24];
export const windowOf = c => (WINDOWS.includes(Number(c.windowMonths)) ? Number(c.windowMonths) : 12);
export function reserveOf(c) { const r = c.reserve || {}; return { figure: r.figure == null ? null : r.figure, source: r.source || (r.figure != null ? "analyst" : null), sellerRequested: r.sellerRequested === true, why: String(r.why != null ? r.why : r.rationale || ""), whyEdited: r.whyEdited === true || (r.why == null && !!String(r.rationale || "").trim()), conditionNote: String(r.conditionNote || ""), seller_agreed: r.seller_agreed === true, sellerPreference: ["yes", "no", "not_sure"].includes(r.sellerPreference) ? r.sellerPreference : null }; }
// ONE VERIFICATION STATE PER FACT (order 2318, Nov 15 2026; found live: the mileage field said Verified, the checks list said not confirmed, page one said verified two lines above "outstanding until verified"). CAUSE: the engine's lists (supports, considered, why) are built at read time from the verification states the case sends, and the states were not part of the recall key, so verifying a fact left the engine's old lines on the case until something else changed. FIX: the states are built here, once, from the fields and documents; they are the input of the read AND part of the recall key, so a change of any state is read again and the engine's lines, the needs-attention items (NEED_RULES read the same fields) and the report's sentences all follow the one field.
export function verificationOf(c) {
  const verification = {}; for (const [k, key] of [["transmission", "transmission"], ["mileage", "mileage_band"]]) if (c.fields[k].value != null) verification[key] = c.fields[k].verified ? "verified" : c.fields[k].source === "seller" ? "seller_stated" : "not_confirmed";
  const doc = c.documents.some(d => kindOfDoc(d) === "invoice"); if (doc) verification.service_ims = c.documents.some(isServiceInvoice) ? "documented" : "seller_stated";
  return verification;
}
export function recallInput(c, caseDate) {
  const f = k => c.fields[k].value, tier = readTierOf(c);
  const verification = verificationOf(c);
  return {
    ...(f("vin") ? { vin: f("vin") } : { year: f("year"), make: f("make"), model: f("model") }), mileage: f("mileage"), ...(f("body") ? { bodyStyle: f("body") } : {}), ...(f("trim") ? { trim: f("trim") } : {}), ...([1, 2, 3, 4].includes(tier) ? { tier } : {}),
    desk: { caseDate: caseDate || null, views: true, windowMonths: windowOf(c), reserve: reserveOf(c).figure, transmission: f("transmission"), label: [f("year"), f("make"), f("model")].filter(Boolean).join(" ") || null, case: { verification }, exclusions: c.exclusions.map(e => ({ saleId: e.saleId, scope: e.scope, reason: e.reason, at: e.at })) }
  };
}
export const recallKey = c => JSON.stringify([c.fields.vin.value, c.fields.year.value, c.fields.make.value, c.fields.model.value, c.fields.mileage.value, c.fields.transmission.value, c.fields.body.value, c.exclusions.filter(e => e.scope !== "note_only").map(e => e.scope + ":" + e.saleId).sort(), reserveOf(c).figure, ...(c.fields.trim && c.fields.trim.value ? [c.fields.trim.value] : []), ...(Object.keys(verificationOf(c)).length ? [verificationOf(c)] : [])]);   // the trim joins the key only when the case has one, so a stored case without a trim keeps its key
// THE PERIOD AND THE CONDITION ARE NOT IN THE KEY (Lane D, Nov 11 2026): the engine's one read carries a view for each (desk.views), so a switch adopts a stored view and asks nothing. A stored answer is stale only when it is not the answer for the period and the condition the case now holds
// (desk.view says which it is): a read that carried no views (an older case, a failed build) is then read again, once.
// THE VIEW THE CASE SERVES (order 2318): the chosen condition by the chosen period. The chosen condition is the analyst's when they set one (selected), else the engine's suggestion (when the answer holds a view for it); no suggestion: all conditions.
// an analyst's condition is a tier she chose (order 2318, Nov 15 2026): "All conditions" is a view of the sales, never a car's condition, so a choice of none is no choice and the case goes back to the suggestion, or to "Not yet set"
export const isAnalystCondition = k => !!k && !!(k.selected && k.selected.tier) && (k.source === "analyst" || !k.source);
export const viewOfCase = c => { const k = c.condition || {}, months = windowOf(c); let tier = 0; if (isAnalystCondition(k)) tier = k.selected && [1, 2, 3, 4].includes(Number(k.selected.tier)) ? Number(k.selected.tier) : 0; else { const sg = conditionSuggestedOf(c); if (sg && c.desk && hasViews(c.desk) && viewOf(c.desk, viewKey(sg.tier, months))) tier = sg.tier; } return { tier, months }; };
// the tier the engine is ASKED for (an input of the read): the analyst's own choice only; a suggestion is read from the answer it came with
export const readTierOf = c => { const k = c.condition || {}; return isAnalystCondition(k) && k.selected && [1, 2, 3, 4].includes(Number(k.selected.tier)) ? Number(k.selected.tier) : 0; };
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
// A CASE STORED AT AN OLDER SHAPE OF THE ENGINE'S ANSWER (Nov 14 2026, order 2318: pv_hm served desk.likely with count 0 because it was stored before the engine carried desk.likelyBasis; every stored case of the Hagerty org had the same gap, and every future engine field would reopen it).
// CAUSE: a stored case keeps the answer it was read with, and nothing said which fields that answer had. FIX: the engine's answer carries desk.shape (lib/deskV3.js DESK_SHAPE), the case stores it with the answer, and a case OPENED by an editor whose stored shape is below the current one is read once, from the same engine and the same inputs (the one read carries a view for every period the case offers), and the answer is stored;
// no analyst action. A failed or retry read leaves the case as it is. The 3 month view is one instance of the rule (a case with views and no 3 month view is read too, whatever its shape). A case with no answer at all is not this (it reads when it is edited, as before).
export const lacksWindowViews = c => !!(c && c.desk && c.desk.views && Object.keys(c.desk.views).length && !Object.keys(c.desk.views).some(k => /:3$/.test(k)));
// A STALE CASE COSTS EXACTLY ONE READ (Lane C's deskV4FlowCheck, Nov 15 2026: four condition clicks made four reads): the first action that reads the answer at the current shape stamps the case (case.shapeRead, beside the answer, so an adopted view cannot drop it: the shape asked for) whether the engine answered with a newer answer (then desk.shape is current) or with one no newer than the stored (an engine not at this shape: a recorded read); the stamp is stored with the case by the action itself, so the next action reads nothing. desk.shape stays the truth about the answer; case.shapeRead only says it was asked. A deploy that raises DESK_SHAPE asks again.
export const CURRENT_SHAPE = DESK_SHAPE;
export const staleShape = c => !!(c && c.desk && c.desk.evidence && (Number(c.desk.shape) || 0) < DESK_SHAPE);
export const askedAtShape = c => (Number(c && c.shapeRead) || 0) >= DESK_SHAPE;   // the engine was asked at this shape and had no more to give (a recorded read, an engine not yet at this shape): it is not asked again for the same shape
export const needsReread = c => !askedAtShape(c) && (lacksWindowViews(c) || staleShape(c));
export async function backfillWindows(c0, read, { caseDate, now } = {}) {
  if (!needsReread(c0)) return { case: c0, filled: false };
  const sheet = await read(recallInput(c0, caseDate || iso(now).slice(0, 10)));
  if (!sheet || sheet.retry || !sheet.desk) return { case: c0, filled: false };   // a failed or retry read: nothing is learned, nothing is stamped
  if (!sheet.desk.views) return { case: c0, filled: false, answered: true };   // an answer with no views (a recorded read): asked, and no newer
  if (!lacksWindowViews(c0) && !((Number(sheet.desk.shape) || 0) > (Number(c0.desk.shape) || 0))) return { case: c0, filled: false, answered: true };   // an answer no newer than the one stored (a deploy not yet live, a recorded read) is not stored again on every open
  let c = adoptRead(c0, sheet, iso(now));
  const offered = ((c.desk && c.desk.windows) || []).map(w => Number(w.months));
  if (offered.length && !offered.includes(windowOf(c))) { c = adoptView({ ...c, windowMonths: 12 }, now); }
  return { case: c, filled: true };
}
export const refreshShape = backfillWindows;
// Store the engine's answer on the case under the key of the case AS IT NOW STANDS, so the next edit that moves none of the engine's inputs costs no read. One place, used by every road that reads the engine (an edit, a new case).
export function adoptRead(c0, sheet, now) {
  const c = clone(c0); c.desk = { key: recallKey(c0), readAt: iso(now), view: { tier: readTierOf(c0), months: windowOf(c0) }, ...sheet.desk };
  if (sheet.own) c.vehicle = { ...(c.vehicle || {}), ownHistory: sheet.own.history || [], vinLiveMatch: sheet.own.vinLiveMatch || null };   // the VIN's own record (lib/desk/ownCar.js): figures only, every sentence is made at serve time
  c.record = { appearances: sheet.exact && Array.isArray(sheet.exact.appearances) ? sheet.exact.appearances.length : null, none: sheet.exact ? sheet.exact.none || null : null };   // the VIN's own record, as the engine read it
  // THE GENERATION THE ENGINE NAMED IS THE CASE'S (Lane F's run: the header said 996 while the Generation row said Not confirmed): a blank generation takes the engine's, marked decoded for a VIN and from the records for typed words, unverified; one the seller or the analyst gave is never touched
  const gen = sheet.desk && sheet.desk.generation, g = c.fields.generation;
  const withGen = gen && g && g.value == null ? setField(c, "generation", gen, c.fields.vin.value ? "vin_decoded" : "records", { by: "market", now: iso(now), quiet: true }) : c;
  // THE FIRST READ IS THE ONLY READ OF A NEW CASE (Lane D, Nov 11 2026; Lane F: New case by VIN took 25 seconds, two full reads one after the other): the read answered with no reserve, the case then took the engine's start as its reserve, and a second whole read was made only to check that reserve. The check is the engine's own function over the sales of the read it already holds (reserveCheckOf), as a switch of period does, so the case is complete after one read.
  let out = seedReserve(seedAssessment(withGen, iso(now)), iso(now));
  if (out.desk && Array.isArray(out.desk.sales) && out.desk.evidence) { const fig = reserveOf(out).figure, was = out.desk.reserveCheck; if (fig != null && !(was && was.reserve === fig)) { out = clone(out); out.desk = setReserveCheck(out.desk, () => engineReserveCheck(out.desk.sales, out.desk.evidence, fig, out.desk.evidence.windowMonths || windowOf(out))); } out.desk.key = recallKey(out); }
  // THE SERVED VIEW IS THE CHOSEN CONDITION'S (order 2318): a read answers for the tier it was asked, the case then takes the stored view of its chosen condition (the engine's suggestion unless the analyst chose), with no second read.
  if (out.desk && hasViews(out.desk)) { const w = viewOfCase(out); if (!out.desk.view || out.desk.view.tier !== w.tier || out.desk.view.months !== w.months) out = adoptView(out, now); }
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
  logAudit(c, { at: iso(now), by: "market", what: ok ? "assessment set from the market median" : "assessment cleared: too few sales", field: "assessment", from: a.figure, to: next.figure });
  return c;
}
// THE RECOMMENDED RESERVE STARTS AT THE ENGINE'S START (desk.reserveStart, the first quartile of the chosen period) and its why at the engine's draft (desk.whyDraft). Both follow a later engine read (a new period, a new tier) until the analyst
// changes them once: a typed or dragged figure is the analyst's (source "analyst") and no read touches it; an edited why is the analyst's (whyEdited) and no read touches it. Too few sales gives the engine no start, so an engine-sourced figure is cleared.
// THE RESERVE LADDER AS THE CASE SERVES IT (order 2318): the engine's desk.reserveLadder of the view on screen; a thin view prices from the all-conditions view of the period (ladder.fallback: rungs, recommended, reason), so its rungs are those.
export const RUNG_KEYS = ["safe", "balanced", "ambitious", "noReserve"];
export const ladderOf = c => { const l = c && c.desk && c.desk.reserveLadder; if (!l || !Array.isArray(l.rungs)) return null; return l.thin && !l.servedFrom ? null : { rungs: l.rungs, recommended: l.recommended, reason: l.reason, byCondition: l.byCondition || null }; };   // a thin view served whole from its fallback (Lane B, Nov 15 2026: servedFrom) carries the fallback's own priced rungs; a thin view with nothing to fall back to prices nothing (its thinLine says so)
// THE ENGINE'S RUNG FOR THE CAR'S CONDITION (Sam's read of the live screen, Nov 15 2026; Lane B's reserveLadder.byCondition): when the analyst has set a condition, the rung the engine starts from, and the reason it gives, are the condition's own (a thin view served from the all-conditions sales takes a different rung for Concours, Good and Fair), so the chip, the panel line and the figure change together. No condition set, or no byCondition: the ladder's own recommended rung.
const analystTierOf = c => { const k = c.condition || {}; return isAnalystCondition(k) && k.selected && [1, 2, 3, 4].includes(Number(k.selected.tier)) ? Number(k.selected.tier) : null; };
export const engineRungOf = c => { const l = ladderOf(c); if (!l) return null; const t = analystTierOf(c), bc = t && l.byCondition && l.byCondition[t]; if (t && !l.byCondition) return { key: null, reason: null, byCondition: false, missing: true };   // an analyst's condition and an answer with no byCondition: no rung is named (never the recommended one under the condition's name)
  return bc && bc.key ? { key: bc.key, reason: bc.reason || l.reason || null, byCondition: true } : { key: l.recommended || null, reason: l.reason || null, byCondition: false }; };
const rungOf = (l, key) => (l && l.rungs.find(r => r.key === key)) || null;
// THE RESERVE CHOICE { key, source, line }: starts as the ladder's recommended rung, source "engine", its line the ladder's reason; the analyst's after reserve_use; a figure typed by hand is the analyst's with no rung (key null).
export function reserveChoiceOf(c) {
  const l = ladderOf(c), st = c.reserveChoice, r = reserveOf(c), ck = c.desk && c.desk.reserveCheck;
  if (st && st.source === "analyst" && st.key) {
    const rg = rungOf(l, st.key);
    if (st.key === "noReserve" && rg && rg.available) return { key: "noReserve", source: "analyst", line: reasonLine("case.reserve.choice_analyst_none") };
    if (rg && rg.available && rg.figure != null && rg.figure === r.figure) return { key: st.key, source: "analyst", line: reasonLine("case.reserve.choice_analyst", { figure: rg.figure, cleared: rg.cleared, of: rg.of }) };
  }
  if (r.source === "analyst" && r.figure != null) return { key: null, source: "analyst", line: ck && ck.of && ck.reserve === r.figure ? reasonLine("case.reserve.choice_analyst", { figure: r.figure, cleared: ck.reached, of: ck.of }) : reasonLine("case.reserve.choice_analyst_bare", { figure: r.figure }) };
  { const er = engineRungOf(c); if (er && er.key) return { key: er.key, source: "engine", line: er.reason }; }
  { const rl = c.desk && c.desk.reserveLadder; if (rl && rl.thin && !rl.servedFrom && r.figure == null) return { key: null, source: "engine", line: rl.thinLine || null }; }   // nothing can be priced: the engine's own line says so, and there is no reserve figure
  return { key: null, source: r.source || null, line: null };
}
// the figure the engine's recommended rung proposes as the case's reserve; none for no reserve (the safe rung's figure, the engine's start, stands behind it) or with no ladder (the start)
const ladderFigure = c => { const l = ladderOf(c), er = engineRungOf(c), k = er && er.key, rg = rungOf(l, k); return rg && rg.available && rg.figure != null ? rg.figure : null; };
export function reportRungsOf(c) {
  const l = ladderOf(c), inUse = reserveChoiceOf(c).key, ticked = c.report && Array.isArray(c.report.rungs) ? c.report.rungs.map(String) : [];
  const keys = RUNG_KEYS.filter(k => k === inUse || (ticked.includes(k) && (!l || (rungOf(l, k) && rungOf(l, k).available))));
  return { keys, inUse };
}
export function reserveUse(c0, key, now) {
  const l = ladderOf(c0), k = String(key || ""); if (!RUNG_KEYS.includes(k)) return { refuse: "case.reserve.refuse_key" };
  const rg = rungOf(l, k); if (!rg || rg.available === false) return { refuse: "case.reserve.refuse_unavailable", name: reasonLine("case.reserve.rung." + k) };
  const c = touch(clone(c0), now), was = reserveOf(c0);
  c.reserveChoice = { key: k, source: "analyst" };
  const fig = k === "noReserve" ? was.figure : rg.figure;
  c.reserve = { ...c.reserve, figure: fig, source: "analyst" };
  if (c.report && c.report.reserveMode && c.report.reserveMode.mode) c.report = { ...c.report, reserveMode: { mode: null, why: "" } };   // a rung is the choice now: an older "no reserve" setting is over
  logAudit(c, { at: iso(now), by: "analyst", what: "reserve choice", field: "reserve", from: was.figure, to: k === "noReserve" ? null : fig, key: k, name: reasonLine("case.reserve.rung." + k) });
  const fig2 = reserveOf(c).figure; c.desk = setReserveCheck(c.desk, () => (fig2 != null && c.desk.sales && c.desk.evidence ? engineReserveCheck(c.desk.sales, c.desk.evidence, fig2, windowOf(c)) : null));
  c.desk.key = recallKey(c);   // the engine's own check of this figure is stored, so no second read is owed
  return { case: settle(c, now) };
}
export function reportRungsSet(c0, keys, now) {
  const want = Array.isArray(keys) ? keys.map(String) : null; if (!want || want.some(k => !RUNG_KEYS.includes(k))) return { refuse: "case.rungs.refuse" };
  const c = touch(clone(c0), now), l = ladderOf(c0), ticked = RUNG_KEYS.filter(k => want.includes(k) && (!l || (rungOf(l, k) && rungOf(l, k).available))), kept = reportRungsOf({ ...c0, report: { ...(c0.report || {}), rungs: ticked } }).keys;
  c.report = { ...(c.report || {}), rungs: ticked };   // what the analyst ticked is stored; the rung in use is always served with it (reportRungsOf), so it is never lost and never sticks when the choice moves
  logAudit(c, { at: iso(now), by: "analyst", what: "report rungs", field: "report", to: kept.join(","), name: kept.map(k => reasonLine("case.reserve.rung." + k)).join(", ") });
  return { case: settle(c, now) };
}
export function seedReserve(c0, now) {
  const r = reserveOf(c0), d = c0.desk, start = ladderFigure(c0) != null ? ladderFigure(c0) : d && d.reserveStart && d.reserveStart.figure != null ? d.reserveStart.figure : null, draft = d && d.whyDraft ? String(d.whyDraft) : "";
  const ownFigure = r.source === "analyst", figure = ownFigure ? r.figure : start, source = ownFigure ? "analyst" : start != null ? "engine" : null, why = r.whyEdited ? r.why : draft;
  const reserve = { figure, source, sellerRequested: r.sellerRequested, why, whyEdited: r.whyEdited, conditionNote: r.conditionNote, rationale: why, seller_agreed: r.seller_agreed, sellerPreference: r.sellerPreference };
  if (JSON.stringify(reserve) === JSON.stringify(c0.reserve)) return c0;
  const c = clone(c0); c.reserve = reserve;
  if (!ownFigure && figure !== r.figure) logAudit(c, { at: iso(now), by: "market", what: figure != null ? "reserve set from the market" : "reserve cleared: too few sales", field: "reserve", from: r.figure, to: figure });
  return c;
}
// THE PERIOD THE SALES ARE READ OVER (3, 6, 12 or, when the record reaches back past a year, 24 months). It is an input to the engine (the engine recomputes the evidence for it), so a change re-calls.
export function setWindow(c0, months, now) { const m = Number(months); if (!WINDOWS.includes(m)) return null; if (c0.desk && Array.isArray(c0.desk.windows) && c0.desk.windows.length && !c0.desk.windows.some(w => Number(w.months) === m)) return null;  if (windowOf(c0) === m) return c0; const c = touch(clone(c0), now); c.windowMonths = m; logAudit(c, { at: iso(now), by: "analyst", what: "period changed", field: "window", from: windowOf(c0), to: m }); return settle(adoptView(c, now), now); }
// A SWITCH OF PERIOD OR CONDITION IS AN EDIT ON STORED DATA: the case takes the engine's view for the new (condition, period) out of what it already holds (desk.views), with the engine's own starting reserve and why for that view, and the engine's own check of the reserve the case now holds
// (lib/deskV3.js reserveCheckOf over that view's sales). No read. A case with no views is left as it is and reads once (needsRecall sees the view does not match).
export function adoptView(c0, now) {
  const d = c0.desk; if (!hasViews(d)) return c0;
  const want = viewOfCase(c0), block = viewOf(d, viewKey(want.tier, want.months)); if (!block) return c0;
  const keep = {}; for (const k of ["titleLine", "specLine", "bodyNote", "live"]) if (d[k] !== undefined) keep[k] = d[k];   // the read's own naming of the car and its live listings are the car's, not the view's
  let c = clone(c0); c.desk = { ...block, ...keep, key: d.key, readAt: d.readAt, view: want, views: d.views, pool: d.pool, ...(d.shape !== undefined ? { shape: d.shape } : {}), ...(d.words ? { words: d.words } : {}) };   // the answer keeps the shape it was read at: a view taken from it is that answer, never an older one (Nov 15 2026: dropping it made every adopted case read as stale and re-read on the next action)
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
  // A VIN THAT DECODED IS VERIFIED, AND SO ARE THE FIELDS IT NAMED (Sam's word, Nov 15 2026): the decode is the manufacturer's own record, not the seller's say. The VIN the seller typed becomes Verified when the decode answered for it; year, make, model, body and transmission that the decode filled are Verified; a field the seller typed stays Seller supplied (the decode never touches it), and so does everything else the seller gave.
  { const named = decode.year != null || decode.make != null || decode.model != null, vin0 = c.fields.vin.value, mine = vin0 && (!decode.vin || String(decode.vin).toUpperCase() === String(vin0).toUpperCase());
    const tag = k => { if (!c.fields[k] || c.fields[k].verified || c.fields[k].value == null) return; c = structuredClone(c); const f = c.fields[k]; f.verified = true; f.source = "vin_decoded"; if (!f.candidates.some(x => x.source === "vin_decoded")) f.candidates = [...f.candidates, { value: f.value, source: "vin_decoded" }]; };
    if (named && mine) tag("vin");
    for (const k of ["year", "make", "model", "body", "transmission"]) if (c.fields[k].source === "vin_decoded") tag(k); }
  return c;
}

// WHERE THE RESERVE SITS against the typical range: the engine's own answer (desk.reserveCheck.position, asked with this very reserve), used by the workspace and by the report so they cannot disagree. null when there is no reserve, no range, or the engine has not yet checked this figure.
export function reserveCheckOf(c) { const ck = c.desk && c.desk.reserveCheck, f = reserveOf(c).figure; return f != null && ck && ck.reserve === f ? ck : null; }
export function reservePosition(c) { const ck = reserveCheckOf(c); return ck && ck.position ? ck.position : null; }
// A change after finalizing makes version n plus 1 (the finalized version row is never touched) and takes the case back to review. A first change takes a new case to review.
function touch(c, now) { if (c.status === "finalized") { c.version += 1; c.status = "in_review"; logAudit(c, { at: iso(now), by: "desk", what: "reopened as version " + c.version }); } else if (c.status === "new") c.status = "in_review"; return c; }
// A CASE NOBODY HAS OPENED STAYS NEW (Nov 13 2026, Sam's resend went straight to In review): settling a case the engine just read in the background, or one a photo was added to, never moves it out of New leads. The analyst's first edit does (touch).
// A RESOLVED ITEM'S LABEL STATES THE RESOLUTION (Nov 15 2026): open keeps the question (the rule's label); done reads "Mileage confirmed"; waived with the seller's words reads "Accident history: seller states no accidents"; waived without them "Service documents: proceeding without". Made from the item's own state in settle, so the case, the audit and the report's page three all carry the one label.
export const needLabelOf = n => {
  const rule = NEED_RULES.find(r => r.id === n.id); if (!rule) return n.label;
  if (n.state === "done") { try { return reasonLine("case.need.done." + n.id); } catch { return rule.label; } }
  if (n.state === "waived") { let subject; try { subject = reasonLine("case.need.subject." + n.id); } catch { return n.label; } return n.resolution === "said" && n.words ? reasonLine("case.need.label_said", { subject, words: String(n.words).replace(/[.\s]+$/, "") }) : reasonLine("case.need.label_proceed", { subject }); }
  return rule.label;
};
export function settle(c0, now) { const c = syncConsidered(syncSteps(c0)); c.needs_review = (c.needs_review || []).map(n => { if (n.state === "open") { const { resolution, words, ...rest } = n; return { ...rest, label: needLabelOf(rest) }; } return { ...n, label: needLabelOf(n) }; }); if (c.status === "finalized" || c.status === "new") return c; const r = readinessOf(c); c.status = r.ready ? "ready" : "in_review"; return c; }

// CORRECTING A FIELD logs an audit line and resets its verification (setField does both). The caller then re-calls the engine when the case's recall key moved.
export function correctField(c0, key, value, { now, by = "analyst" } = {}) { const held = c0.fields[key] && c0.fields[key].value; if (held != null && String(held).toLowerCase() === String(key === "mileage" ? Math.round(Number(String(value).replace(/[^\d.]/g, ""))) : value).toLowerCase()) return c0; return settle(syncNeeds(touch(setField(clone(c0), key, value, "analyst_verified", { now, by }), now)), now); }
// THE SELLER'S OWN WORDS FOR A FACT THE CASE LACKS (Lane D, Nov 12 2026; Sam's second run: "Mark verified" on the accident history was refused because the field was empty). The analyst types what the seller said into the needs-attention item; it is stored on the fact as the seller's statement (source seller, not verified), and Mark verified then works. Only the three facts a needs-attention item is about.
export const SAID_FIELDS = ["accident_history", "service_history", "mileage"];
export function sellerSaid(c0, key, text, now) {
  if (!SAID_FIELDS.includes(key)) throw new Error("not a fact the seller can state here: " + key);
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, 600); if (!t) throw new Error("empty statement");
  return settle(syncNeeds(touch(setField(clone(c0), key, t, "seller", { by: "analyst", now }), now)), now);
}
// THE NEEDS ATTENTION ACTIONS TAKE THE TYPED WORDS (Lane D, Nov 15 2026, order 2318 item 4; found live: "no accidents" typed, the page said nothing was recorded, and Proceed without did nothing).
// CAUSE: the buttons sent no words, the statement went to a different op than the resolution, and Proceed without needed a reason the page never sent. FIX: three actions, each { id (the case), item (the need), words }: seller_said stores the words on the fact as the seller's and resolves the item as "Seller states: <words>"; proceed_without resolves it as "Proceeding without" and records it; mark_verified requires the words typed or a document on the case. An item is resolved when it is waived: it stops blocking, keeps its reason, and the report names it as a limit.
// OTHER ITEMS AND CARS: every need on every case (mileage, accident history, service documents; the others take proceed_without alone). Pure: refuse is a table id.
export const NEED_FIELD = { mileage_unconfirmed: "mileage", accident_unclear: "accident_history", service_documents: "service_history" };
const wordsOf = w => String(w == null ? "" : w).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
const needOf = (c, item) => c.needs_review.find(n => n.id === String(item || ""));
export function needSays(c0, item, words, now) {
  if (!needOf(c0, item)) return { refuse: "case.need.no_item" }; const fk = NEED_FIELD[String(item)]; if (!fk) return { refuse: "case.need.said_field" };
  const t = wordsOf(words); if (!t) return { refuse: "case.need.said_empty" };
  if (fk === "mileage" && !/\d/.test(t)) return { refuse: "case.need.said_mileage" };   // a mileage has a number in it, whatever the case holds already
  const was = c0.fields[fk].value; let c = sellerSaid(c0, fk, t, now); if (fk === "mileage" && c.fields.mileage.value === was && was == null) return { refuse: "case.need.said_mileage" };
  c = setNeed(c, String(item), "waived", reasonLine("case.need.resolved_said", { words: t })); { const it = c.needs_review.find(n => n.id === String(item)); it.resolution = "said"; it.words = t; } logAudit(c, { at: iso(now), by: "analyst", what: "seller states: " + t, field: String(item) });
  return { case: settle(syncNeeds(c), now) };
}
export function needProceeds(c0, item, now) {
  const n = needOf(c0, item); if (!n) return { refuse: "case.need.no_item" };
  const c = setNeed(touch(clone(c0), now), String(item), "waived", reasonLine("case.need.resolved_proceed")); { const it = c.needs_review.find(x => x.id === String(item)); it.resolution = "proceed"; delete it.words; } logAudit(c, { at: iso(now), by: "analyst", what: needLabelOf({ ...n, state: "waived", resolution: "proceed" }), field: String(item) });
  return { case: settle(syncNeeds(c), now) };
}
export function needVerifies(c0, item, words, now) {
  if (!needOf(c0, item)) return { refuse: "case.need.no_item" }; const fk = NEED_FIELD[String(item)]; if (!fk) return { refuse: "case.need.said_field" };
  const t = wordsOf(words), got = c0.documents.some(d => d.status === "received") || (fk === "mileage" && c0.photos.items.length > 0), had = c0.fields[fk].value != null;
  if (!t && !(had && got)) return { refuse: "case.need.verify_how" };
  if (t && fk === "mileage" && !/\d/.test(t)) return { refuse: "case.need.said_mileage" };
  let c = c0; if (t) { c = correctField(c, fk, t, { now }); if (c.fields[fk].value == null || (fk === "mileage" && !(Number(c.fields.mileage.value) > 0))) return { refuse: "case.need.said_mileage" }; }
  return { case: verify(c, fk, { now }) };
}
export function verify(c0, key, { now } = {}) { return settle(syncNeeds(touch(verifyField(c0, key, { now }), now)), now); }

// ASSESSMENT AND RESERVE ARE INDEPENDENT. Each writer builds a new object for its own part and copies the other by reference; the other's bytes cannot change.
const numOrNull = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
export function setAssessment(c0, patch, now) { const c = touch(clone(c0), now), a = c.assessment, p = patch || {}; c.assessment = { figure: "figure" in p ? numOrNull(p.figure) : a.figure, low: "low" in p ? numOrNull(p.low) : a.low, high: "high" in p ? numOrNull(p.high) : a.high, explanation: "explanation" in p ? String(p.explanation || "").slice(0, 2000) : a.explanation, source: "analyst" }; if (a.source !== "analyst") logAudit(c, { at: iso(now), by: "analyst", what: "assessment taken over from the market", field: "assessment", from: a.figure, to: c.assessment.figure }); return settle(c, now); }
// THE REPORT'S RESERVE MODE (Lane D, Nov 11 2026): the analyst may set the report to recommend NO RESERVE, with a why line. The engine's own answer (desk.reserveMode, Lane B) is what the cover prints; nothing here decides which mode is right. Where the engine says the sales are too few (thin), the analyst must write the why line to choose it.
export const reportReserveModeOf = c => { const m = c.report && c.report.reserveMode || {}; if (m.mode === "no_reserve") return { mode: "no_reserve", why: String(m.why || "") }; const ch = reserveChoiceOf(c); return ch.key === "noReserve" ? { mode: "no_reserve", why: String(ch.line || "") } : { mode: null, why: "" }; };
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
  if (p.restart === true) { next.figure = null; next.source = null; next.whyEdited = false; next.sellerRequested = false; logAudit(c, { at: iso(now), by: "analyst", what: "reserve back to the market", field: "reserve", from: r.figure, to: null }); }
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
export function removeCaseDocument(c0, id, now) {
  const c = touch(clone(c0), now), i = c.documents.findIndex(d => String(d.id) === String(id));
  if (i >= 0) { const [gone] = c.documents.splice(i, 1); logAudit(c, { at: iso(now), by: "analyst", what: "document removed", field: "documents", to: kindOfDoc(gone) }); }
  return syncNeeds(c);
}
// A DOCUMENT'S KIND, EDITABLE (Sam's read of the live screen, Nov 15 2026): the analyst may correct what a document is (invoice, title, inspection, other); the needs that read it (the service invoice) follow in the same answer.
export function setDocumentKind(c0, id, kind, now) {
  const c = touch(clone(c0), now), d = c.documents.find(x => String(x.id) === String(id)); if (!d) return c;
  if (kindOfDoc(d) === kind && d.kind === kind) return c0;
  const was = kindOfDoc(d); d.kind = kind; logAudit(c, { at: iso(now), by: "analyst", what: "document kind changed", field: "documents", from: was, to: kind }); return settle(syncNeeds(c), now);
}
export function removeCasePhoto(c0, id, now) { return syncNeeds(removePhotoM(clone(c0), id, now)); }
export function setCover(c0, id, now) { const c = touch(setCoverM(clone(c0), id), now); logAudit(c, { at: iso(now), by: "analyst", what: "cover set", field: "photos", to: id }); return c; }
export function selectPhotos(c0, ids, now) { const c = touch(selectForReport(clone(c0), ids), now); logAudit(c, { at: iso(now), by: "analyst", what: "report photos selected", field: "photos", to: ids.join(",") }); return c; }
export function selectComparables(c0, ids, now) { const c = touch(clone(c0), now); c.selectedComparables = [...new Set((ids || []).map(String))]; return settle(c, now); }
// THE CONDITION DECISION (order 2318, Nov 14 2026). case.condition = { suggested, chosen, source, note, line }: suggested is the engine's own (desk.condition.suggested of the all-conditions view of the period); chosen starts as suggested (source "suggested") and is the analyst's after condition_set (source "analyst", with a note).
// A condition other than the suggested one needs a note. The served view follows the analyst's choice (selected, the same tier) and the chosen period.
export const conditionSuggestedOf = c => { const d = c && c.desk; if (!d) return null; const v = hasViews(d) ? viewOf(d, viewKey(0, windowOf(c))) : null, s = (v && v.condition && v.condition.suggested) || (d.condition && d.condition.suggested) || null; return s && [1, 2, 3, 4].includes(Number(s.tier)) ? { tier: Number(s.tier), name: s.name || TIER_NAMES[Number(s.tier)] } : null; };
const fromOf = c => { const d = c.desk, v = d && hasViews(d) ? viewOf(d, viewKey(0, windowOf(c))) : null, k = (v && v.condition) || (d && d.condition) || null; if (k && k.from) return String(k.from); const m = k && k.basis ? /^Suggested \w+, from (.+)\.$/.exec(String(k.basis)) : null; return m ? m[1] : null; };
export function conditionOut(c) {
  const k = c.condition || {}, suggested = conditionSuggestedOf(c), analyst = isAnalystCondition(k), chosen = analyst ? (k.chosen || k.selected || null) : suggested, note = analyst ? String(k.note || "") : "";
  const name = chosen ? chosen.name : null, from = !analyst && suggested ? fromOf(c) : null, source = !chosen ? "none" : analyst ? "analyst" : "suggested";
  // NO SUGGESTED CONDITION AND NONE CHOSEN: chosen null, source "none", and the line says it is not set (never "All conditions", which is a view of the sales and not a condition of the car)
  const line = !chosen ? reasonLine("case.condition.none") : analyst ? (note ? reasonLine("case.condition.line_analyst", { name, note: note.replace(/[.\s]+$/, "") }) : reasonLine("case.condition.line_analyst_bare", { name })) : (from ? reasonLine("case.condition.line_suggested", { name, from }) : reasonLine("case.condition.line_suggested_bare", { name }));
  const rl = c.desk && c.desk.reserveLadder;   // a thin view is served from the all-conditions view of the period (Lane B's servedFrom): the case says so, in the engine's own line
  return { ...k, suggested, chosen, source, note, line, effectLine: effectLineOf(c, chosen), thin: !!(rl && rl.thin && c.desk.evidence && c.desk.evidence.servedFrom), thinLine: rl && rl.thin ? rl.thinLine || null : null };
}
// WHAT THE CHOSEN CONDITION DID TO THE FIGURES (order 2318, Nov 15 2026; found live: Concours chosen, nothing changed, nothing said). The counts are the engine's: the view the case serves (desk.view), the sales it prices on (desk.evidence.count) and the chosen tier's own sales in the period (desk.rungs). A tier that prices on its own says how many sales it used; one that falls back says how few it had, that the figures use all of them, and what to do if the condition warrants more. Nothing here is computed: no count is made, only read and worded.
export function effectLineOf(c, chosen) {
  const d = c.desk; if (!chosen || !d || !d.evidence || !d.view || Number(d.view.tier) !== Number(chosen.tier)) return null;
  const n = Number(d.evidence.count), nn = x => (x === 1 ? "sale" : "sales");
  if (!Number.isFinite(n)) return null;
  const base = effectBase(chosen, d, n, nn), st = c.reserveChoice, fig = reserveOf(c).figure, moved = st && st.movedFrom && st.source === "engine" && st.movedFrom.figure != null && fig != null && st.movedFrom.figure !== fig ? reasonLine("case.condition.reserve_moved", { name: chosen.name, figure: fig, was: st.movedFrom.figure }) : null;   // the analyst had pressed Use: the new condition moved the reserve, and the line says to what and how to keep the old figure
  return [base, moved].filter(Boolean).join(" ") || null;
}
function effectBase(chosen, d, n, nn) {
  if (!d.servedFrom) return reasonLine("case.condition.effect_own", { name: chosen.name, count: n, noun: nn(n) });
  const r = (d.rungs || []).find(x => Number(x.tier) === Number(chosen.tier)), own = r && Number.isFinite(Number(r.count)) ? Number(r.count) : 0;
  return reasonLine("case.condition.effect_fallback", { name: chosen.name, own, ownNoun: nn(own), months: Number(d.view.months), count: n });
}
export function setConditionChoice(c0, condition, note, now) {
  const t = condition == null || condition === "" || Number(condition) === 0 ? null : Number(condition);
  if (t !== null && ![1, 2, 3, 4].includes(t)) return { refuse: "case.condition.refuse_bad" };
  const sug = conditionSuggestedOf(c0), why = String(note == null ? "" : note).replace(/\s+/g, " ").trim().slice(0, 300);
  if (t !== null && sug && t !== sug.tier && !why) return { refuse: "case.condition.refuse_note" };   // a note is asked only when the engine suggested a condition and the analyst chose another: with no suggestion nothing is being overruled
  const c = touch(clone(c0), now), was = conditionOut(c0).chosen, to = t ? { tier: t, name: TIER_NAMES[t] } : null;
  c.condition = { ...c.condition, selected: to, chosen: to, source: to ? "analyst" : "none", note: to ? why : "" };   // none clears the choice: back to the suggestion, or to Not yet set
  // A NEW CONDITION ALWAYS RESETS THE RESERVE CHOICE (Lane C's live run on the Ferrari, Nov 15 2026: every tier left $571,000 because the analyst's earlier Use stood): the engine's rung for the tier (reserveLadder.byCondition) and its figure replace the analyst's Use; the case remembers the figure it moved from so the effect line can say so and the analyst can press Use to keep it. A figure the analyst typed by hand (no rung) is not a Use and stays.
  const use = c0.reserveChoice && c0.reserveChoice.source === "analyst" && c0.reserveChoice.key ? { figure: reserveOf(c0).figure, key: c0.reserveChoice.key } : null;
  delete c.reserveChoice; if (use) c.reserve = { ...c.reserve, source: "engine" };
  logAudit(c, { at: iso(now), by: "analyst", what: to ? "condition set" : "condition cleared", field: "condition", from: was ? was.name : null, to: to ? to.name : null, note: why });
  const out = settle(adoptView(c, now), now);
  if (use) { const er = engineRungOf(out); out.reserveChoice = { key: er && er.key || null, source: "engine", movedFrom: use }; logAudit(out, { at: iso(now), by: "market", what: "reserve moved with the condition", field: "reserve", from: use.figure, to: reserveOf(out).figure }); }
  return { case: out };
}
export function setCondition(c0, selected, now) { const c = touch(clone(c0), now); { const sel = selected && selected.tier ? { tier: Number(selected.tier), name: String(selected.name || "") } : null; c.condition = { ...c.condition, selected: sel, chosen: sel, source: "analyst" }; } return settle(adoptView(c, now), now); }

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
  if (picked.length < 2) { add("comparable", "Fewer than two Closest sales are selected."); checks.push({ key: "comparables", ok: false, line: reasonLine("case.check.comps_few") }); }
  else if (nolink.length) { add("comparable_listing", "A selected Closest sale has no listing address."); checks.push({ key: "comparables", ok: false, line: reasonLine("case.check.comps_nolink", { title: nolink[0].title || "" }) }); }
  else checks.push({ key: "comparables", ok: true, line: reasonLine("case.check.comps_ok") });
  // 4 the open items (every one: Received and Proceed without resolve them)
  // FINALIZE NEEDS EVERY ATTENTION ITEM RESOLVED, OR WAIVED WITH A NOTE (order 2318 item 5): a waived item whose note is empty still counts as open
  const open = c.needs_review.filter(n => n.state === "open"), bare = c.needs_review.filter(n => n.state === "waived" && !String(n.reason || "").trim()); for (const n of open) add("need:" + n.id, n.label + "."); for (const n of bare) add("need_note:" + n.id, n.label + ": waived without a note.");
  checks.push({ key: "open", ok: !open.length && !bare.length, line: open.length + bare.length ? reasonLine("case.check.open_n", { count: countNoun(open.length + bare.length, "open item", { words: false }) }) : reasonLine("case.check.open_ok") });
  // THE CONDITION MUST BE SET (order 2318 item 5): it starts unset, and a report is not finalized until the analyst has chosen one
  if (!(c.condition && c.condition.selected && Number(c.condition.selected.tier))) add("condition", "No condition is set.");
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
  const d = c.desk || {};
  return {
    version: c.version, finalized_at: iso(now), lead_ref: c.lead_ref, handling_seconds: c.handling_seconds == null ? null : c.handling_seconds, handling_active_seconds: Number(c.activeSeconds) || 0,
    figures: { assessment: clone(c.assessment), reserve: clone(c.reserve), windowMonths: windowOf(c) },
    evidence: clone(d.evidence || null), original: clone(d.original || null), exclusions: clone(c.exclusions),
    comparables: reportSalesOf(c).rows.map(clone),
    verification: Object.fromEntries(FIELD_KEYS.map(k => [k, { value: c.fields[k].value, source: c.fields[k].source, verified: c.fields[k].verified }])),
    documents: clone(c.documents), needs_review: clone(c.needs_review), condition: clone(c.condition), wording
  };
}
export function finalize(c0, { now, wording = null, seat = null } = {}) {
  const r = readinessOf(c0); if (c0.status === "finalized") return { ok: false, why: "This version is already finalized." };
  if (!r.ready) return { ok: false, why: "The case is not ready.", blockers: r.blockers };
  const c = clone(c0); c.status = "finalized"; c.finalized_at = iso(now); c.handling_seconds = handlingSeconds(c, seat, c.finalized_at); c.handling_active_seconds = Number(c.activeSeconds) || 0; logAudit(c, { at: iso(now), by: "analyst", what: "finalized version " + c.version });
  return { ok: true, case: c, row: versionRow(c, now, wording) };
}
