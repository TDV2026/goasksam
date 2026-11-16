// PRIOR CASES AND THE CASE LIST (Lane D, Nov 14 2026, order 2318 stage 3). Every other case of the same org, archived included, on the same car as this one.
// THE SAME CAR is the model key the pool read uses (lib/desk/familyKey.js deskModelFamily, the sales_archive model_family column), with the make and the year of the resolved car: never a match on the title text. A case with no year, make or model has no key and matches nothing.
// Pure: the figures come from the stored cases; the two sentences are the words table's (case.prior.*); pages compute nothing.
import { deskModelFamily } from "./familyKey.js";
import { reasonLine, deskDateShort } from "../reasonWords.js";
import { ensureCase } from "./caseModel.js";
import { lifecycleView, LIFECYCLE, labelOf } from "./lifecycle.js";
import { coverIdOf } from "./coverPhoto.js";
const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fv = (c, k) => { const f = c && c.fields && c.fields[k]; return f && f.value != null && String(f.value).trim() !== "" ? String(f.value).trim() : null; };
// the car key of a stored case: year | make | model family
export function carKeyOf(sheet) {
  let c = sheet && sheet.case; if (!c && sheet && sheet.submission) { try { c = ensureCase(sheet, sheet.created_at || new Date().toISOString()); } catch { c = null; } } if (!c || !c.fields) return null;
  const year = Number(fv(c, "year")), make = fv(c, "make"), model = fv(c, "model"); if (!(year > 0) || !make || !model) return null;
  const fam = deskModelFamily({ make, model, trim: fv(c, "trim") || "" }); if (!fam) return null;
  return year + "|" + norm(make) + "|" + norm(fam);
}
export const aliasOf = sheet => String(sheet && sheet.id != null ? sheet.id : "").slice(0, 8);
export const titleOf = sheet => { const c = sheet.case; return [fv(c, "year"), fv(c, "make"), fv(c, "model"), fv(c, "trim")].filter(Boolean).join(" ") || (c && c.desk && c.desk.titleLine) || sheet.car_label || null; };
// the seller's name as the case or the lead holds it (the queue narrowed by it before case_list replaced that)
const sellerNameOf = s => (s.case && s.case.seller && s.case.seller.name) || (s.submission && s.submission.consignor && s.submission.consignor.name) || null;
// open (new), in review (in review, ready, finalised and not sent yet), sent (the report went out), archived
export function statusOf(sheet) {
  if (sheet.archived) return "archived"; if (sheet.status === "Sent") return "sent";
  const st = sheet.case && sheet.case.status; return st === "in_review" || st === "ready" || st === "finalized" ? "in review" : "open";
}
// the recommended reserve as sent, or as it stands
const reserveOfSheet = sheet => { const d = sheet.final && sheet.final.decision && Number(sheet.final.decision.reserve); if (sheet.status === "Sent" && d > 0) return d; const f = sheet.case && sheet.case.reserve && sheet.case.reserve.figure; return f != null && Number(f) > 0 ? Number(f) : (d > 0 ? d : null); };
export const itemOf = sheet => {
  const analyst = sheet.owner_seat || null, openedAt = (sheet.case && sheet.case.opened_at) || sheet.opened_at || sheet.created_at || null, reserve = reserveOfSheet(sheet), sent = sheet.status === "Sent" && !sheet.archived;
  const day = String(openedAt || "").slice(0, 10);
  return { id: sheet.id, alias: aliasOf(sheet), title: titleOf(sheet), analyst, openedAt, openedLine: /^\d{4}-\d{2}-\d{2}$/.test(day) ? reasonLine("case.prior.opened", { date: deskDateShort(day), by: analyst }) : null, reserve, reserveLine: reserve != null ? reasonLine(sent ? "case.prior.reserve_sent" : "case.prior.reserve", { figure: reserve }) : null, status: statusOf(sheet) };
};
export function priorCasesOf(sheet, all) {
  const key = carKeyOf(sheet), items = !key ? [] : (all || []).filter(s => s && s.id !== sheet.id && carKeyOf(s) === key).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map(itemOf);
  return { count: items.length, line: items.length ? reasonLine("case.prior.some", { count: items.length }) : reasonLine("case.prior.none"), items };
}
// case_list: q matches year, make, model, title, seller name, VIN or chassis and the alias (every word of q must be found); a q includes archived cases, marked; without q the archived are left out unless includeArchived
// the cover photo's address as the sheet holds it (the handler mints the cover's signed address before the list is made; null when there is no photo or no address)
const thumbOf = s => { const ph = (s.submission && s.submission.photos) || [], id = coverIdOf(s.case, ph), p = id == null ? null : ph.find(x => String(x.id) === id); return p && p.url ? p.url : null; };
// the open attention items of a case: the count the queue card shows
const attentionOf = s => ((s.case && s.case.needs_review) || []).filter(n => n && n.state === "open").length;
export function listCases(all, { q, includeArchived, status = null, now = new Date().toISOString() } = {}) {
  const words = norm(q).split(" ").filter(Boolean), withArch = includeArchived === true || words.length > 0;
  const rows = (all || []).filter(s => s && (withArch || !s.archived)).filter(s => {
    if (!words.length) return true; const c = s.case, hay = norm([fv(c, "year"), fv(c, "make"), fv(c, "model"), fv(c, "trim"), titleOf(s), s.car_label, aliasOf(s), s.id, sellerNameOf(s), fv(c, "vin"), s.vin].filter(Boolean).join(" "));
    return words.every(w => hay.includes(w));
  }).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map(s => ({ s, lc: lifecycleView(s, now) })).filter(x => !status || status.has(x.lc.status)).map(({ s, lc }) => ({ ...itemOf(s), year: Number(fv(s.case, "year")) || null, make: fv(s.case, "make"), model: fv(s.case, "model"), archived: !!s.archived, activeSeconds: Number(s.case && s.case.activeSeconds) || 0, statusKey: lc.status, statusLabel: lc.label, analyst: lc.assignedTo || itemOf(s).analyst, thumb: thumbOf(s), needsAttention: attentionOf(s), receivedAt: lc.receivedAt, firstOpenedAt: lc.firstOpenedAt, assignedTo: lc.assignedTo, sentAt: lc.sentAt, activeSeconds: lc.activeSeconds, waitingReason: lc.waitingReason, outcome: lc.outcome, elapsedLine: lc.receivedLine }));
  const live = (all || []).filter(s => s && !s.archived), keys = live.map(s => lifecycleView(s, now).status);
  return { count: rows.length, rows, queue: { statuses: LIFECYCLE.map(k => ({ key: k, label: labelOf(k), count: keys.filter(x => x === k).length })) } };
}
