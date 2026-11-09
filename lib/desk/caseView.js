// DESK V3: what the page is given for a case (Lane D, Nov 8 2026). The page draws; it adds, counts and compares nothing. So the stage, the rail group counts and the operations block lines are all made here,
// from the stored cases, and ride on the case: case.stage, case.queue, case.handling.lines (shapes in docs/desk-v3-shapes.md).
import { STAGE_OF, STAGES, ensureCase } from "./caseModel.js";
import { reportState } from "./reportState.js";
const median = xs => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2)) : null; };
const dur = sec => sec == null ? "none yet" : sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
export const stageOf = c => STAGE_OF[c.status] || "new";
// a sheet that a later version corrects is superseded: it is counted once, as its latest version
export const live = sheets => { const gone = new Set(sheets.map(s => s.corrects).filter(Boolean)); return sheets.filter(s => !gone.has(s.id)); };
export function queueCounts(sheets0, now) { const sheets = live(sheets0); const q = Object.fromEntries(STAGES.map(k => [k, 0])); for (const s of sheets) q[stageOf(ensureCase(s, now))]++; return q; }
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
export function caseView(sheet, allSheets, now) {
  const c = ensureCase(sheet, now);
  // the lines the workspace prints are the report's own (lib/desk/reportState.js), so the page and the PDF cannot say two things
  const rs = reportState(c);
  return { ...c, assessment: { ...c.assessment, differenceLine: rs.differenceLine }, reserve: { ...c.reserve, positionLine: rs.reservePositionLine, position: rs.reservePosition }, vehicle: { mileageLine: rs.mileageWords }, stage: stageOf(c), queue: queueCounts(allSheets, now), handling: { lines: handlingLines(allSheets, now) } };
}
