// "RE-READ THE EMAIL" (Lane D, Nov 13 2026; Lane C: case 1f046d7e was parsed by the old code and only a resend caught it up).
// The stored first email (the .eml kept whole at submission.sourceEmail.path) is read again with the parser of today (run.js submissionOf, carOfRead, then toCase.js caseFromLead, the same road a new email takes), and ONLY THE EMPTY PLACES of the case are filled from it:
// a field with a value, a seller detail already held, a lead fact already held, a document already on the case, and a reserve answer already given are never touched, whoever set them. Nothing here makes a figure and no engine read is made; the analyst's next edit reads as it always does.
// Pure: the raw bytes and the deps go in, the new case and the count come out. The action (sheetActions.js case_reread_email) loads the bytes and saves under the sheet's version.
import { setField, addDocument, logAudit, FIELD_KEYS } from "../caseModel.js";
import { syncNeeds } from "../caseWorkflow.js";
import { caseFromLead } from "./toCase.js";
import { submissionOf, carOfRead } from "./run.js";

const blank = v => v == null || v === "" || (typeof v === "string" && !v.trim());

// fresh (the case the email builds today) fills the blanks of c0 (the stored case). Returns { case, filled: [keys], n }.
export function fillEmpty(c0, fresh, at) {
  let c = structuredClone(c0); const filled = [];
  for (const k of FIELD_KEYS) { const had = c.fields[k] && c.fields[k].value, f = fresh.fields[k]; if (blank(had) && f && !blank(f.value)) { c = setField(c, k, f.value, f.source || "seller", { by: "intake", now: at, quiet: true }); filled.push("field." + k); } }
  const fs = fresh.seller; if (fs) { const s = { ...(c.seller || {}) }; let n = 0; for (const k of ["name", "email", "phone", "asking_price"]) if (blank(s[k]) && !blank(fs[k])) { s[k] = fs[k]; n++; filled.push("seller." + k); } if (n) c.seller = { name: null, email: null, phone: null, asking_price: null, ...s }; }
  const fl = fresh.lead; if (fl && fl.facts) {
    const lead = c.lead && c.lead.facts ? { ...c.lead, facts: { ...c.lead.facts } } : { source: fl.source || "hagerty_form", facts: {} };
    for (const [k, v] of Object.entries(fl.facts)) if (!(lead.facts[k] && !blank(lead.facts[k].value)) && v && !blank(v.value)) { lead.facts[k] = v; filled.push("lead." + k); }
    if (Object.keys(lead.facts).length) c.lead = lead;
  }
  if (blank(c.reserve && c.reserve.sellerPreference) && fresh.reserve && !blank(fresh.reserve.sellerPreference)) { c.reserve = { ...(c.reserve || {}), sellerPreference: fresh.reserve.sellerPreference }; filled.push("reserve.sellerPreference"); }
  const have = new Set((c.documents || []).map(d => d.id));
  for (const d of fresh.documents || []) if (d && d.sellerWords && !have.has(d.id)) { c = addDocument(c, d); filled.push("document." + d.id); }
  if (filled.length) logAudit(c, { at, by: "intake", what: "email read again", field: "email", to: String(filled.length) });
  return { case: filled.length ? syncNeeds(c) : c0, filled, n: filled.length };
}

// raw: the .eml bytes. deps: { simpleParser, resolveVehicle, decodeVin }. sheet: the stored sheet (its case, photos and documents). internal: our own addresses.
export async function rereadEmail({ sheet, raw, deps, internal = [], orgId, at }) {
  if (!raw || !deps || !deps.simpleParser) return { ok: false, why: "unreadable" };
  let p; try { p = await deps.simpleParser(Buffer.from(raw)); } catch { return { ok: false, why: "unreadable" }; }
  const mail = { subject: p.subject || "", text: p.text || "", html: p.html || "", attachments: (p.attachments || []).map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size, load: async () => a.content })) };
  const { read } = await submissionOf(mail, deps, internal), { car } = await carOfRead(read, deps);
  const fresh = caseFromLead({ orgId, sheet, read, car, receivedAt: at });
  return { ok: true, ...fillEmpty(sheet.case, fresh, at) };
}
