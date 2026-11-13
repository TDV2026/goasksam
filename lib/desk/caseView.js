// DESK V3: what the page is given for a case (Lane D, Nov 8 2026). The page draws; it adds, counts and compares nothing. So the stage, the rail group counts and the operations block lines are all made here,
// from the stored cases, and ride on the case: case.stage, case.queue, case.handling.lines (shapes in docs/desk-v3-shapes.md).
import { ownView } from "./ownCar.js";
import { STAGE_OF, STAGES, ensureCase, kindOfDoc, handlingSeconds } from "./caseModel.js";
import { reportReserveModeOf, reserveOf, reserveCheckOf, windowOf, readinessOf } from "./caseWorkflow.js";
import { reasonLine, moneyWords } from "../reasonWords.js";
import { syncSteps } from "./nextSteps.js";
import { spoken } from "./reserveModeLines.js";
import { axisOf } from "../deskV3.js";
import { syncConsidered } from "./considered.js";
import { reportState, longDate } from "./reportState.js";
import { timeIn } from "./sheetStore.js";
const median = xs => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2)) : null; };
const dur = sec => sec == null ? "none yet" : sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
// an ARCHIVED case is out of the working groups whatever stage it was at (docs/supabase-desk-archive.sql keeps the events beside the sheet); a restore puts it back at the stage it had, which the case still says
export const stageOf = (c, sheet = null) => (sheet && sheet.archived ? "archived" : sheet && sheet.status === "Sent" ? "sent" : STAGE_OF[c.status] || "new");
export const workingStageOf = (c, sheet = null) => (sheet && sheet.status === "Sent" ? "sent" : STAGE_OF[c.status] || "new");
// the handling lines of the archive events, in the table's words
export const archiveLinesOf = (sheet) => ((sheet && sheet.archiveEvents) || []).map(e => { const d = longDate(String(e.at || "").slice(0, 10)); return reasonLine(e.kind === "archive" ? "case.handling.archived" : "case.handling.restored", { by: e.by || "", date: d || "", from: e.from || "" }); });
// a sheet that a later version corrects is superseded: it is counted once, as its latest version
export const live = sheets => { const gone = new Set(sheets.map(s => s.corrects).filter(Boolean)); return sheets.filter(s => !gone.has(s.id)); };
export function queueCounts(sheets0, now) { const sheets = live(sheets0); const q = Object.fromEntries(STAGES.map(k => [k, 0])); for (const s of sheets) q[stageOf(ensureCase(s, now), s)]++; return q; }
// THE TODAY PANEL (Lane S asked, Nov 13 2026; written here because the page counts nothing): the four tiles of the queue with their numbers, the age of the oldest New lead, and the case "Start the next lead" opens (the oldest New lead). Over the live, unarchived sheets of the org; { title, tiles: [{ key, label, value, sub }], nextLead: { id } | null, startLabel }.
export function todayOf(sheets0, now) {
  const sheets = live(sheets0), ms = Date.parse(now) || Date.now(), day = String(now).slice(0, 10);
  const stage = s => stageOf(ensureCase(s, now), s), q = queueCounts(sheets0, now);
  const waiting = sheets.filter(s => stage(s) === "new").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)), oldest = waiting[0] || null;
  const sentToday = sheets.filter(s => s.status === "Sent" && !s.archived && s.sent && String(s.sent.at || "").slice(0, 10) === day).length;
  const sub = oldest ? reasonLine("case.today.oldest", { age: timeIn(Math.max(0, Math.round((ms - Date.parse(oldest.created_at)) / 60000))) }) : reasonLine("case.today.none_waiting");
  return { title: reasonLine("case.today.title"), startLabel: reasonLine("case.today.start"), nextLead: oldest ? { id: oldest.id } : null,
    tiles: [{ key: "new", label: reasonLine("case.today.new"), value: String(q.new), sub }, { key: "review", label: reasonLine("case.today.review"), value: String(q.review), sub: null }, { key: "ready", label: reasonLine("case.today.ready"), value: String(q.ready), sub: null }, { key: "sent", label: reasonLine("case.today.sent"), value: String(sentToday), sub: null }] };
}
// The four operations lines, over this org's cases only (no per analyst figure is made or sent).
export function handlingLines(sheets0, now) {
  const sheets = live(sheets0);
  const cs = sheets.map(s => ensureCase(s, now)), today = String(now).slice(0, 10);
  const doneToday = cs.filter(c => c.finalized_at && String(c.finalized_at).slice(0, 10) === today);
  const leads = cs.filter(c => c.lead_ref), more = leads.filter(c => c.asked.length > 0);
  return [
    { label: "Reports finalized today", value: String(doneToday.length) },
    { label: "Median handling time", value: dur(median(cs.filter(c => c.handling_seconds != null).map(c => c.handling_seconds))) },
    { label: "Cases needing more from the seller", value: leads.length ? `${Math.round((more.length / leads.length) * 100)}%` : "none yet" },
    { label: "Reports revised after finalizing", value: String(cs.filter(c => c.finalized_at && c.version > 1).length) }
  ];
}
// THE OPEN CASE'S HANDLING TIME, AS ONE LINE for the top bar, made here from the case's own opens and rebuilt on every case view (so every edit's answer refreshes it). A finalized version reads its recorded time; an open case reads the time since the viewing analyst's first open.
export function handlingClock(c, seat, now) {
  if (c.handling_seconds != null) return reasonLine("case.handling.clock_done", { time: dur(c.handling_seconds) });
  const s = c.opened_at ? handlingSeconds(c, seat, now) : null; return s == null ? reasonLine("case.handling.clock_none") : reasonLine("case.handling.clock_open", { time: dur(s) });
}
// THE DAY THE LEAD CAME IN, in words (the page prints it as sent); null for a case with no submitted date.
export const submittedLine = c => { const d = longDate(c.submitted_at); return d ? reasonLine("case.vehicle.received", { date: d }) : null; };
// THE RESERVE FIGURE IN WORDS (moneyWords), rebuilt on every case view so the input and the panel print it as sent; null with no reserve.
export const reserveFigureLine = c => { const f = reserveOf(c).figure; return f == null ? null : moneyWords(f); };
// THE ORIGINAL EMAIL ON THE CASE VIEW: { name, url, line } or null. The stored sheet carries only the path (submission.sourceEmail.path); the url is minted at view time by storage.mintSheetUrls (the same signer and the same org and sheet folder rule as a photo), so a view never carries an unsigned storage path.
export const sourceEmailOf = sheet => { const s = sheet && sheet.submission && sheet.submission.sourceEmail; return s && s.path ? { name: reasonLine("case.source_email.name") + (s.ext || ".eml"), url: s.url || null, line: reasonLine("case.source_email.line") } : null; };
export const sellerAskLine = c => (c.seller && c.seller.asking_price ? reasonLine("case.reserve.seller_ask", { figure: c.seller.asking_price }) : null);
// THE SENDS OF A CASE, from the export records beside the sheet: one per send, newest last, with the handling line for each (the table's words). The page prints them as sent.
export const sendsOf = (exports = []) => exports.filter(e => e && e.kind === "send").map(e => { const to = e.detail && e.detail.to || null, d = longDate(String(e.at || "").slice(0, 10)); return { version: e.version, to, at: e.at, line: to && d ? reasonLine("case.handling.sent", { version: e.version, to, date: d }) : null }; });
export function caseView(sheet, allSheets, now, seat = null, exports = []) {
  const c = spoken(ensureCase(sheet, now));   // the reserve mode's sentences are made now from its stored figures (a case seeded under older wording speaks the table's current words)
  // the lines the workspace prints are the report's own (lib/desk/reportState.js), so the page and the PDF cannot say two things
  const rs = reportState(c);
  // a note on the comparable: any exclusion of that sale (its scope, reason and time) rides on the comparable the page draws; the stored engine answer is not changed
  const ex = new Map(c.exclusions.map(e => [e.saleId, { scope: e.scope, reason: e.reason, at: e.at }]));
  const { views: _v, pool: _p, words: _w, ...deskShown } = c.desk || {}, desk = c.desk && Array.isArray(c.desk.comparables) ? { ...deskShown, comparables: c.desk.comparables.map(x => (ex.has(String(x.id)) ? { ...x, exclusion: ex.get(String(x.id)) } : x)) } : (c.desk ? deskShown : c.desk);
  // THE PRICE AXIS OF EVERY WINDOW (for the dot plot): a case read before the axis was in the engine's answer gets the same ticks from the window's own figures (lib/deskV3.js axisOf); the page draws them and computes nothing
  if (desk && desk.evidence && !Array.isArray(desk.evidence.axisTicks)) desk.evidence = { ...desk.evidence, ...(desk.evidence.insufficient || desk.evidence.low == null ? { axisMin: null, axisMax: null, axisTicks: [] } : axisOf(desk.evidence.low, desk.evidence.high, [desk.evidence.q1, desk.evidence.q3, desk.evidence.median])) };
  if (desk && desk.evidence && desk.evidence.byWindow) desk.evidence = { ...desk.evidence, byWindow: Object.fromEntries(Object.entries(desk.evidence.byWindow).map(([k, w]) => [k, w && !Array.isArray(w.axisTicks) ? { ...w, ...(w.insufficient || w.low == null ? { axisMin: null, axisMax: null, axisTicks: [] } : axisOf(w.low, w.high, [w.q1, w.q3, w.median])) } : w])) };
  // ONE DOCUMENT LIST (Sam's second run: a document added through the needs-attention Received pill was stored but did not show in Documents): everything the case holds AND everything the sheet's submission holds (a forwarded email's attachments, a file filed by an older road) is listed once, by id, whatever road added it
  const sub = (sheet.submission && sheet.submission.documents) || [], allDocs = [...c.documents, ...sub.filter(d => d && d.id != null && !c.documents.some(x => String(x.id) === String(d.id))).map(d => ({ id: String(d.id), name: d.name || "document", kind: d.kind || "other", status: "received", bytes: d.bytes || null, url: d.url || null, storedAs: d.path || null }))];
  const have = new Map(((sheet.submission && sheet.submission.photos) || []).map(p => [String(p.id), p]));   // the stored picture the page draws: its address comes from the photo table, never made up here
  const photos = { ...c.photos, items: c.photos.items.map(p => (have.has(p.id) ? { ...p, url: have.get(p.id).url || null, width: have.get(p.id).width || null, height: have.get(p.id).height || null } : p)) };
  return { ...c, fields: Object.fromEntries(Object.entries(c.fields).map(([k, f]) => [k, f && f.source === "last_sale" ? { ...f, sourceLine: reasonLine("own.from_last_sale") } : f])), report: { ...(c.report || {}), reserveMode: reportReserveModeOf(c), reserveModeLine: reportReserveModeOf(c).mode === "no_reserve" && c.desk && c.desk.reserveMode ? reasonLine("report.reserve_mode_line", { line: c.desk.reserveMode.line || "" }) : null }, documentsLine: (allDocs.length ? reasonLine("case.docs.line", { received: allDocs.filter(d => d.status === "received").length, outstanding: allDocs.filter(d => d.status !== "received").length }) : null), nextSteps: syncSteps(c).nextSteps, considered: syncConsidered(c).considered, photos, documents: allDocs.map(d => ({ ...d, kind: kindOfDoc(d), kindLabel: reasonLine("case.doc.kind." + kindOfDoc(d)), line: d.sellerWords ? reasonLine("case.doc.line_seller_words", { title: d.title || "" }) : reasonLine(d.status === "received" ? "case.doc.line_received" : "case.doc.line_outstanding", { kind: reasonLine("case.doc.kind." + kindOfDoc(d)), title: d.title || (d.name && d.name !== "document" ? d.name : "") }) })), ...(desk ? { desk } : {}), assessment: { ...c.assessment, differenceLine: rs.differenceLine }, reserve: { ...c.reserve, ...reserveOf(c), sellerPreferenceLine: reserveOf(c).sellerPreference ? reasonLine("case.reserve.seller_preference", { answer: reserveOf(c).sellerPreference }) : null, positionLine: rs.reservePositionLine, position: rs.reservePosition, figureLine: reserveFigureLine(c), sellerAskLine: sellerAskLine(c), reachedLine: rs.reachedShortLine, check: reserveCheckOf(c), start: c.desk && c.desk.reserveStart ? c.desk.reserveStart : null }, origin: c.origin || null, sourceEmail: sourceEmailOf(sheet), windowMonths: windowOf(c), checks: readinessOf(c).checks, finalizeHint: readinessOf(c).hint, vehicle: { ...ownView(c.vehicle, now), mileageLine: rs.mileageWords, submittedLine: submittedLine(c) }, marketLine: rs.marketLine, stage: stageOf(c, sheet), archived: sheet.archived || null, exports: sendsOf(exports), queue: queueCounts(allSheets, now), today: todayOf(allSheets, now), handling: { lines: handlingLines(allSheets, now), clock: handlingClock(c, seat, now), sentLines: sendsOf(exports).map(x => x.line).filter(Boolean), sentLine: sendsOf(exports).map(x => x.line).filter(Boolean).slice(-1)[0] || null, archiveLines: archiveLinesOf(sheet) } };
}

// THE OPERATIONS BLOCK PER ORG for the crew dashboard (api/usageDashboard.js ?view=desk). Rows are { org_id, sheet }; each org's four lines are made from that org's own cases only and carry no seat, analyst or owner: the opens
// that hold a seat stay inside the case and are never read into this output.
export function deskOpsByOrg(rows, now) {
  const by = new Map(); for (const r of rows || []) { if (!r || !r.sheet) continue; const k = String(r.org_id || "sam"); if (!by.has(k)) by.set(k, []); by.get(k).push(r.sheet); }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([org, sheets]) => { const live_ = live(sheets).filter(s => s.case); return { org, cases: live_.length, queue: queueCounts(live_, now), lines: handlingLines(live_, now) }; });
}
