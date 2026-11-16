// THE CASE LIFECYCLE (Lane D, Nov 15 2026, redesign order 2318 item 1). Eight statuses: new, assigned, in_review, waiting (for information), ready, sent, converted, closed.
// A case's status is READ, never stored on its own: it is made from the case's own facts (opened, ready or finalized, sent) and the lifecycle events kept beside the sheet (docs/supabase-desk-case-lifecycle.sql: insert only, because a finalized or sent sheet is locked in the database).
// So an existing case maps onto the eight with no data changed: unopened is new, opened is in_review, ready or finalized is ready, a sent sheet is sent. Assigned, waiting, converted and closed come from events only.
// Pure: no clock, no network, no figure. Every sentence is the words table's (case.life.*, case.elapsed.*).
import { reasonLine, deskDateShort } from "../reasonWords.js";
import { handlingSeconds } from "./caseModel.js";
export const LIFECYCLE = ["new", "assigned", "in_review", "waiting", "ready", "sent", "converted", "closed"];
export const OUTCOMES = ["converted", "closed"];
// THE MOVES case_status allows, from where the case stands. ready and sent are never chosen: a case becomes ready when its checks pass and sent when its report goes out. converted is recorded as an outcome, only after a send.
export const MOVES = {
  new: ["assigned", "in_review", "waiting", "closed"], assigned: ["in_review", "waiting", "closed"], in_review: ["assigned", "waiting", "closed"],
  waiting: ["in_review", "assigned", "closed"], ready: ["waiting", "closed"], sent: ["closed"], converted: [], closed: ["in_review"]
};
export const labelOf = status => LIFECYCLE.includes(status) ? reasonLine("case.life.label." + status) : null;
const T = x => { const t = Date.parse(x); return Number.isFinite(t) ? t : null; };
const events = sheet => ((sheet && sheet.lifeEvents) || []).filter(e => e && (e.kind === "status" || e.kind === "outcome"));
const fieldOf = (sheet, k) => { const f = sheet && sheet.case && sheet.case.fields && sheet.case.fields[k]; return f && f.value != null ? f.value : null; };

// the status of a sheet, from its facts and its events
export function statusOfSheet(sheet) {
  const ev = events(sheet), last = ev[ev.length - 1];
  if (last && last.kind === "outcome" && OUTCOMES.includes(last.outcome)) return last.outcome;
  if (sheet && sheet.status === "Sent") return "sent";
  const c = sheet && sheet.case, explicit = [...ev].reverse().find(e => e.kind === "status");
  if (explicit && explicit.status === "waiting") return "waiting";
  if (c && (c.status === "ready" || c.status === "finalized")) return "ready";
  if ((explicit && explicit.status === "in_review") || (c && (c.status === "in_review" || c.opened_at || (c.opens || []).length))) return "in_review";
  if (explicit && explicit.status === "assigned") return "assigned";
  return "new";
}
// "28m ago", "3h ago", "Yesterday", "3 days ago", else the date: from the received time and now, in the table's words
export function elapsedLine(at, now) {
  const a = T(at), n = T(now); if (a == null || n == null) return null;
  const mins = Math.max(0, Math.round((n - a) / 60000));
  if (mins < 1) return reasonLine("case.elapsed.now");
  if (mins < 60) return reasonLine("case.elapsed.minutes", { n: mins });
  const dayOf = t => Math.floor(t / 86400000), d = dayOf(n) - dayOf(a);
  if (d <= 0 && mins < 1440) return reasonLine("case.elapsed.hours", { n: Math.floor(mins / 60) });
  if (d === 1) return reasonLine("case.elapsed.yesterday");
  if (d < 7) return reasonLine("case.elapsed.days", { n: d });
  return reasonLine("case.elapsed.date", { date: deskDateShort(new Date(a).toISOString().slice(0, 10)) });
}
// the lifecycle block of a case: the same object serves the case and the list rows
export function lifecycleView(sheet, now) {
  const ev = events(sheet), c = sheet && sheet.case || {}, status = statusOfSheet(sheet);
  const lastStatus = [...ev].reverse().find(e => e.kind === "status"), lastOutcome = [...ev].reverse().find(e => e.kind === "outcome");
  const outcomeOn = status === "converted" || status === "closed", firstOpened = c.opened_at || sheet.opened_at || null;
  const assigned = [...ev].reverse().find(e => e.kind === "status" && e.to), received = c.submitted_at || sheet.created_at || null;
  const seconds = c.handling_seconds != null ? c.handling_seconds : firstOpened ? handlingSeconds(c, sheet.owner_seat, now) : null;
  const waiting = status === "waiting" && lastStatus ? (lastStatus.note || null) : null;
  return {
    status, label: labelOf(status), receivedAt: received, firstOpenedAt: firstOpened, assignedTo: assigned ? assigned.to : firstOpened ? (sheet.owner_seat || null) : null,
    sentAt: (sheet.sent && sheet.sent.at) || sheet.sent_at || null, activeSeconds: Number(c.activeSeconds) || 0, handlingSeconds: seconds == null ? null : seconds,   // activeSeconds is the time reported by case_active (Lane S); handlingSeconds is the wall clock from the first open (to the finalize)
     waitingReason: waiting,
    outcome: outcomeOn && lastOutcome ? { outcome: lastOutcome.outcome, at: lastOutcome.at, note: lastOutcome.note || null } : null,
    receivedLine: elapsedLine(received, now), moves: MOVES[status].map(s => ({ status: s, label: labelOf(s) }))
  };
}
// case_status: the event to write for a move, or the refusal's table key. note is required for waiting (its reason) and for closed.
export function planStatus(sheet, { status, note, to, seat }) {
  const cur = statusOfSheet(sheet), want = String(status || "");
  if (!LIFECYCLE.includes(want)) return { refuse: "case.life.refuse.unknown" };
  if (want === "ready") return { refuse: "case.life.refuse.ready_only" };
  if (want === "sent") return { refuse: "case.life.refuse.sent_only" };
  if (want === "converted") return { refuse: "case.life.refuse.converted_only" };
  if (!MOVES[cur].includes(want)) return { refuse: "case.life.refuse.move", p: { from: labelOf(cur).toLowerCase(), to: labelOf(want).toLowerCase() } };
  const words = String(note == null ? "" : note).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 400);
  if (want === "waiting" && !words) return { refuse: "case.life.refuse.waiting_reason" };
  if (want === "closed") return words ? { event: { kind: "outcome", outcome: "closed", note: words } } : { refuse: "case.life.refuse.closed_note" };
  return { event: { kind: "status", status: want, note: words || null, ...(want === "assigned" ? { to: String(to || seat || "").slice(0, 80) || null } : {}) } };
}
// case_outcome: converted (only after the report was sent) or closed (with a reason)
export function planOutcome(sheet, { outcome, note }) {
  const cur = statusOfSheet(sheet), want = String(outcome || "");
  if (!OUTCOMES.includes(want)) return { refuse: "case.life.refuse.outcome_kind" };
  if (cur === "converted" || cur === "closed") return { refuse: "case.life.refuse.has_outcome" };
  const words = String(note == null ? "" : note).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 400);
  if (want === "converted" && cur !== "sent") return { refuse: "case.life.refuse.converted_after_send" };
  if (want === "closed" && !words) return { refuse: "case.life.refuse.closed_note" };
  return { event: { kind: "outcome", outcome: want, note: words || null } };
}
// the status filter of case_list: one status or a list; an unknown word is no filter at all (null) so the caller can refuse it
export function statusFilter(v) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return { all: true, set: null };
  const list = (Array.isArray(v) ? v : String(v).split(",")).map(x => String(x).trim()).filter(Boolean);
  return list.every(x => LIFECYCLE.includes(x)) ? { all: false, set: new Set(list) } : null;
}
