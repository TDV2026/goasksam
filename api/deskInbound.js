// Sam Desk Valuations: the inbound email webhook (Lane D, Nov 2026; docs/desk-valuations-spec.md "Intake by email").
// Resend receives mail for *@desk.goasksam.com and posts an "email.received" event here, signed (Svix). We verify the signature on the RAW body, read the
// full email from the Receiving API, and hand it to lib/desk/intake/run.js. A mail from anyone who is not a seat of the org is logged and dropped there.
// A failure to READ the email answers 500 so Resend delivers it again; once the email is claimed in desk_intake_log a repeat is harmless.
import { processInbound } from "../lib/desk/intake/run.js";
import { verifyWebhook, fetchReceived } from "../lib/desk/intake/resendInbound.js";
import { supabaseStore } from "../lib/desk/intake/store.js";
import { engineReader } from "../lib/desk/intake/engineRead.js";
import { decodeVinPublic } from "../lib/desk/intake/run.js";
import { resolveVehicle } from "../lib/vehicle.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { keepAlive } from "../lib/keepAlive.js";
import { failBody } from "../lib/_fail.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const raw = await rawBody(req);
    const v = verifyWebhook(raw, req.headers, process.env.DESK_INBOUND_WEBHOOK_SECRET);
    if (!v.ok) return res.status(401).json({ error: "bad signature" });
    let evt; try { evt = JSON.parse(raw); } catch { return res.status(400).json({ error: "bad json" }); }
    if (evt.type !== "email.received") return res.status(200).json({ ignored: evt.type || null });
    const emailId = evt.data && (evt.data.email_id || evt.data.id);
    const apiKey = process.env.RESEND_API_KEY;
    const env = supabaseEnv();
    if (!emailId || !apiKey || !env) return res.status(500).json({ error: "not configured" });

    const mail = await fetchReceived(emailId, apiKey);   // throws -> 500 -> Resend retries
    const store = supabaseStore(env);
    let simpleParser = null; try { simpleParser = (await import("mailparser")).simpleParser; } catch { /* forwarded-as-attachment mail then stays a document */ }
    const reader = engineReader(store, env);
    const out = await processInbound(mail, {
      store, resolveVehicle, decodeVin: decodeVinPublic, simpleParser,
      startRead: (sheet, car, read) => { keepAlive(reader(sheet, car, read)); }
    });
    return res.status(200).json({ outcome: out.outcome });
  } catch (e) {
    return res.status(500).json(failBody("deskInbound", e, { status: "error" }));
  }
}
