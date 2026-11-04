// DESK VALUATIONS: SEND (Lane D, Nov 2026; docs/desk-valuations-spec.md "Finalise, PDF, send").
// Takes a FINALISED sheet and sends the org's message with the PDF attached, through the org's own provider, as the org (its verified sending address and
// signature, never an expert's name). It logs the time and the address on the sheet and keeps the exact copy that went out. Automatic sending is OFF unless the
// org turned it on. It computes nothing: the message, note and PDF are the ones it is given.
//
// NOTHING SENT TWICE, by three locks in order: (1) the sheet must still read Finalised and not "sending" (one conditional write claims it), (2) the copy row in
// desk_sent has a unique index on the sheet, written BEFORE the provider is called, (3) the provider call carries an idempotency key made from the sheet. If the
// provider fails the claim and the copy row are removed and the sheet stays Finalised; if the provider succeeds nothing is ever removed.
import { objectPath } from "./intake/store.js";

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = t => String(t || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

export const orgKeyName = orgId => "DESK_SEND_KEY_" + String(orgId || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");

// The org's own provider. "resend" = the org's own Resend account (its key in the environment under DESK_SEND_KEY_<ORG>, its domain verified there).
export const providers = {
  async resend({ org, from, to, subject, text, html, pdf, idempotencyKey, env = process.env, fetchFn = fetch }) {
    const key = env[orgKeyName(org.id)];
    if (!key) return { ok: false, reason: "no_provider_key", message: "This org has no sending key set." };
    const r = await fetchFn("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [to], reply_to: org.sending_address, subject, text, html, attachments: pdf ? [{ filename: pdf.name, content: Buffer.from(pdf.bytes).toString("base64") }] : [] }),
      signal: AbortSignal.timeout(30000)
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: "provider_refused", message: String(body && body.message || "send " + r.status).slice(0, 200) };
    return { ok: true, id: body.id || null };
  }
};

// The message that goes out: the org's message as edited, then the note under the org's name, then the org's signature.
export function composeMessage({ org, message, note }) {
  const sections = [String(message || "").trim()];
  if (String(note || "").trim()) sections.push(`A note from ${org.sending_name || org.name}:\n${String(note).trim()}`);
  if (String(org.signature || "").trim()) sections.push(String(org.signature).trim());
  const text = sections.filter(Boolean).join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">${
    paras(message).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}${
    String(note || "").trim() ? `<p style="margin:0 0 4px;color:#6b6b6b">A note from ${esc(org.sending_name || org.name)}</p><p style="margin:0 0 14px">${esc(String(note).trim()).replace(/\n/g, "<br>")}</p>` : ""}${
    String(org.signature || "").trim() ? `<p style="margin:0;color:#444">${esc(String(org.signature).trim()).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
  return { text, html };
}
export const defaultSubject = (org, sheet) => `${org.sending_name || org.name}: your ${sheet.car_label || "car"}`;
export const pdfNameOf = sheet => `${(sheet.car_label || "report").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-report.pdf`;

// What the Send screen pre-fills (Lane E prints it as given).
export async function sendPrefill({ store, org, sheetId }) {
  const sheet = await store.getSheet(org.id, sheetId);
  if (!sheet) return null;
  const sent = await store.sentOf(org.id, sheetId);
  return { sheetId, status: sheet.status, to: sheet.consignor_email || "", subject: defaultSubject(org, sheet), message: org.standard_message || "", signature: org.signature || "", from: org.sending_address || null, fromName: org.sending_name || org.name, sendingVerified: !!org.sending_verified, autoSend: !!org.auto_send, pdf: !!sheet.pdf_path, sent: sent ? { to: sent.to_address, at: sent.sent_at, subject: sent.subject, text: sent.body_text } : null };
}

const refuse = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra });

// mode "manual": a seat pressed Send. mode "auto": the finalise step calls this; refused unless the org turned automatic sending on.
export async function sendSheet({ store, org, seat = null, sheetId, to, subject, message, note, pdf = null, mode = "manual", provider = null, now = () => new Date().toISOString() }) {
  if (mode !== "manual" && mode !== "auto") return refuse("bad_mode", "Unknown send mode.");
  if (mode === "auto" && !org.auto_send) return refuse("auto_send_off", "Automatic sending is off for this org.");
  const sheet = await store.getSheet(org.id, sheetId);
  if (!sheet) return refuse("no_sheet", "No such sheet in this org.");
  if (sheet.status === "Sent") return refuse("already_sent", "This sheet has already been sent.", { sentAt: sheet.sent_at, sentTo: sheet.sent_to });
  if (sheet.status !== "Finalised") return refuse("not_finalised", "Only a finalised sheet can be sent.");
  if (mode === "manual" && !(seat && seat.id != null && sheet.seat_id === seat.id)) return refuse("not_your_sheet", "Only the seat that owns this sheet can send it.");
  const addr = String(to || "").trim();
  if (!EMAIL.test(addr)) return refuse("bad_address", "The consignor address is missing or not valid.");
  const subj = String(subject || "").trim() || defaultSubject(org, sheet);
  if (!String(message || "").trim()) return refuse("no_message", "The message is empty.");
  if (!org.sending_address || !org.sending_verified) return refuse("sending_not_verified", "This org's sending address is not verified yet.");
  const sendFn = provider || providers[org.send_provider];
  if (!sendFn) return refuse("no_provider", "This org's email provider is not set up.");

  // the PDF: the one stored at finalise; a PDF handed in is accepted only when none is stored (it is immutable once there)
  let pdfBytes = null;
  if (sheet.pdf_path) { pdfBytes = await store.get(sheet.pdf_path); if (!pdfBytes) return refuse("pdf_missing", "The report PDF could not be read."); if (pdf && pdf.bytes && Buffer.compare(Buffer.from(pdf.bytes), pdfBytes) !== 0) return refuse("pdf_immutable", "This sheet already has a report PDF; it cannot be replaced."); }
  else if (pdf && pdf.bytes && pdf.bytes.length) {
    pdfBytes = Buffer.from(pdf.bytes);
    if (pdfBytes.slice(0, 4).toString() !== "%PDF") return refuse("not_a_pdf", "The attachment is not a PDF.");
  }
  if (!pdfBytes) return refuse("no_pdf", "There is no report PDF to attach.");
  const pdfName = (pdf && pdf.name) || pdfNameOf(sheet);

  // lock 1: claim the sheet (still Finalised, not already sending)
  const claimed = await store.patchSheetIf(org.id, sheetId, { status: "Finalised", sending: false }, { sending: true });
  if (!claimed) return refuse("already_sending", "This sheet is being sent, or was just sent.");
  const release = () => store.patchSheetIf(org.id, sheetId, { sending: true }, { sending: false }).catch(() => {});

  const { text, html } = composeMessage({ org, message, note });
  const from = `${org.sending_name || org.name} <${org.sending_address}>`;
  let pdfPath = sheet.pdf_path, wentOut = false, stamped = null;
  try {
    if (!pdfPath) { pdfPath = objectPath(org.id, sheetId, "report", pdfName); await store.put(pdfPath, pdfBytes, "application/pdf"); await store.patchSheet(org.id, sheetId, { pdf_path: pdfPath }); }
    // lock 2: the copy of what goes out, written BEFORE the send; the unique index on the sheet is the hard once-only
    try {
      await store.insertSent({ org_id: org.id, sheet_id: sheetId, seat_id: seat ? seat.id : null, seat_email: seat ? seat.email || null : null, from_address: org.sending_address, to_address: addr, subject: subj, body_text: text, body_html: html, note: String(note || "").trim() || null, pdf_path: pdfPath, pdf_name: pdfName, provider: org.send_provider, mode, sent_at: now() });
    } catch (e) {
      if (e && (e.status === 409 || /23505|duplicate/i.test(String(e.body || e.message)))) return refuse("already_sent", "A copy of this sheet's email already exists; it was sent.");   // the claim is left: a sent sheet stays claimed
      await release(); return refuse("copy_not_stored", "The copy could not be stored, so nothing was sent.");
    }
    // lock 3: the provider call, keyed by the sheet
    let out; try { out = await sendFn({ org, from, to: addr, subject: subj, text, html, pdf: { name: pdfName, bytes: pdfBytes }, idempotencyKey: `desk-send-${sheetId}` }); } catch (e) { out = { ok: false, reason: "provider_error", message: String(e && e.message || e).slice(0, 200) }; }
    if (!out || !out.ok) { await store.deleteSent(org.id, sheetId).catch(() => {}); await release(); return refuse(out && out.reason || "provider_error", out && out.message || "The email provider did not accept the message.", { sent: false }); }
    // the provider accepted it: from here nothing is ever removed and the claim is never released, whatever else fails
    wentOut = true;
    const at = now(); stamped = at;
    await store.patchSent(org.id, sheetId, { provider_id: out.id || null, sent_at: at }).catch(e => console.error("desk send: copy row not updated", e && e.message));
    const moved = await store.patchSheet(org.id, sheetId, { status: "Sent", sent_at: at, sent_to: addr, sending: false }).catch(() => null);
    return { ok: true, sentAt: at, to: addr, from: org.sending_address, subject: subj, providerId: out.id || null, mode, ...(moved ? {} : { warning: "sent_status_not_saved" }) };
  } catch (e) {
    if (wentOut) return { ok: true, sentAt: stamped, to: addr, from: org.sending_address, subject: subj, mode, warning: "sent_status_not_saved" };
    // an unexpected failure BEFORE the provider was called: nothing went out, so the claim is released
    await store.deleteSent(org.id, sheetId).catch(() => {}); await release();
    return refuse("send_failed", "Nothing was sent: " + String(e && e.message || e).slice(0, 160));
  }
}

// Called by the finalise step (Lane E) for an org that turned automatic sending on; a no-op reply for every other org.
export async function autoSend({ store, org, sheetId, pdf = null, provider = null, now }) {
  if (!org.auto_send) return refuse("auto_send_off", "Automatic sending is off for this org.");
  const sheet = await store.getSheet(org.id, sheetId);
  if (!sheet) return refuse("no_sheet", "No such sheet in this org.");
  return sendSheet({ store, org, sheetId, to: sheet.consignor_email, subject: null, message: org.standard_message, note: null, pdf, mode: "auto", provider, now });
}
