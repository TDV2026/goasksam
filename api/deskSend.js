// Sam Desk Valuations: SEND (Lane D, Nov 2026; docs/desk-valuations-spec.md "Finalise, PDF, send").
//   GET  /api/deskSend?sheetId=...   what the Send screen pre-fills: consignor address, the org's standard message and signature, the sending address, any copy already sent
//   POST /api/deskSend {sheetId, to, subject, message, note, pdfBase64?}   sends the finalised sheet as the org through its own provider (lib/desk/send.js)
// Seat-only: the signed crew cookie, or a signed-in user whose email is a seat. Anyone else gets the same plain 404 as the rest of the Desk. A seat can send only a
// sheet it owns, inside its own org; automatic sending is never reachable from here (HTTP always sends manually).
import { callerSeat } from "../lib/desk/intake/caller.js";
import { routeLimit, sendTooMany } from "../lib/_routeLimit.js";
import { sendSheet, sendPrefill } from "../lib/desk/send.js";
import { supabaseStore } from "../lib/desk/intake/store.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { failBody } from "../lib/_fail.js";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const env = supabaseEnv();
    if (!env) return res.status(500).json({ error: "not configured" });
    const store = supabaseStore(env);
    const who = await callerSeat(req, env, store);
    if (!who) return sendDisguisedNotFound(res, req);   // a stranger sees the same plain 404 as the rest of the Desk, before any limit can tell them the route exists
    // The address limit (lib/_routeLimit.js; ceilings in lib/_ceilings.js): 30 a minute and 300 an hour by device, 60 and 600 by address; the signed crew cookie is exempt; fails open.
    { const lim = await routeLimit(env, req, "desk_send", { route: "/api/deskSend" }); if (!lim.ok) return sendTooMany(res, lim.retryAfter); }
    const { org, seat } = who;
    if (req.method === "GET") {
      const id = String((req.query && req.query.sheetId) || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "sheetId" });
      const pre = await sendPrefill({ store, org, sheetId: id });
      return pre ? res.status(200).json(pre) : res.status(404).json({ error: "no such sheet" });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!/^[0-9a-f-]{36}$/i.test(String(b.sheetId || ""))) return res.status(400).json({ ok: false, reason: "bad_sheet", message: "Missing sheet." });
    let pdf = null;
    if (b.pdfBase64) { try { pdf = { name: String(b.pdfName || "").slice(0, 120) || undefined, bytes: Buffer.from(String(b.pdfBase64), "base64") }; } catch { pdf = null; } }
    const out = await sendSheet({ store, org, seat, sheetId: b.sheetId, to: b.to, subject: b.subject, message: b.message, note: b.note, pdf, mode: "manual" });
    return res.status(out.ok ? 200 : 409).json(out);
  } catch (e) {
    return res.status(500).json(failBody("deskSend", e, { ok: false, reason: "error" }));
  }
}
