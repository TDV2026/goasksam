// DESK VALUATIONS: the Send panel's call. The sending itself is Lane D's (through the org's own email provider, as them); this posts to its endpoint and hands back what it says.
// The contract (for Lane D): POST /api/deskSend  { sheetId, reportNumber, to, message, note, org, filename, pdf_b64 }  ->  { ok:true, subject, messageId, sentAt } | { ok:false, why }
export async function sendReport(ctx, payload) {
  if (typeof ctx.send === "function") return ctx.send(payload);   // checks inject a stand-in
  const base = process.env.DESK_SEND_BASE || "";
  if (!base) return { ok: false, why: "Sending is not switched on for this organisation yet." };
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/api/deskSend", { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": process.env.DESK_SEND_KEY || "" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => null); return j && typeof j === "object" ? j : { ok: false, why: "The send service answered with something unreadable." };
  } catch (e) { return { ok: false, why: "The send service could not be reached." }; }
}
