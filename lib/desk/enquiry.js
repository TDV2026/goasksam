// THE ENQUIRY (Lane D, Nov 15 2026, redesign order 2318 item 2): the seller's original email as the case serves it, for the expandable view. case.enquiry { subject, receivedAt, body, name, url, line, attachments[] } and case.header.enquiryUrl.
// The body is read from the stored .eml once (readEnquiry) and kept on the sheet (submission.enquiry), so every answer of every action carries it with no second parse. Pages print it as sent; nothing is computed.
// The attachments are the files the sheet received (a forwarded email's attachments and the files filed by hand), each with its type line (case.doc_type) and size; the address of each is minted at view time like a photo's.
import { reasonLine } from "../reasonWords.js";
import { docTypeOf } from "./docTypes.js";
const MAX_BODY = 20000;
export function enquiryOf(sheet, sourceEmail) {
  const sub = (sheet && sheet.submission) || {}, e = sub.enquiry || null;
  const attachments = (sub.documents || []).filter(d => d && (d.path || d.url) && d.kind !== "link").map(d => { const t = docTypeOf({ contentType: d.contentType, name: d.name }); return { id: String(d.id), name: d.name || "document", typeLine: t ? reasonLine("case.doc_type", { type: t }) : null, bytes: Number(d.bytes) || null, url: d.url || null }; });
  if (!e && !sourceEmail && !attachments.length) return null;
  return { subject: (e && e.subject) || sub.note || null, receivedAt: (e && e.at) || sheet.created_at || null, body: e && e.body ? String(e.body) : null, name: sourceEmail ? sourceEmail.name : null, url: sourceEmail ? sourceEmail.url : null, line: sourceEmail ? sourceEmail.line : null, attachments };
}
// the plain text of the stored email's first message, and its subject and date; null when there is no parser or the bytes do not read
export async function readEnquiry(raw, simpleParser) {
  if (!raw || !simpleParser) return null;
  try { const m = await simpleParser(raw), text = String(m.text || "").replace(/\r\n/g, "\n").trim(); if (!text && !m.subject) return null; return { subject: m.subject ? String(m.subject).slice(0, 300) : null, at: m.date instanceof Date && !Number.isNaN(m.date.getTime()) ? m.date.toISOString() : null, body: text.slice(0, MAX_BODY) }; } catch { return null; }
}
