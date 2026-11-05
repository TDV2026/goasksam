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

// The stream is read BEFORE req.body is touched (on Vercel req.body is a lazy parser over the same bytes). Returns the bytes as received and where they
// came from; "reparsed" means the platform had already parsed the body, so the original bytes are gone and the signature cannot match.
async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  if (chunks.length) return { raw: Buffer.concat(chunks), from: "stream" };
  const b = req.body;
  if (typeof b === "string") return { raw: Buffer.from(b, "utf8"), from: "string" };
  if (Buffer.isBuffer(b)) return { raw: b, from: "buffer" };
  return { raw: Buffer.from(b && typeof b === "object" ? JSON.stringify(b) : "", "utf8"), from: b && typeof b === "object" ? "reparsed" : "empty" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { raw, from } = await rawBody(req);
    const v = verifyWebhook(raw, req.headers, process.env.DESK_INBOUND_WEBHOOK_SECRET);
    if (!v.ok) {
      // one short reason code and where the body came from and how long it was: never the secret, a signature or any body content
      console.warn(`deskInbound rejected: reason=${v.reason} body=${from} bytes=${raw.length}`);
      return res.status(401).json({ error: "bad signature", reason: v.reason, body: from });
    }
    let evt; try { evt = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad json" }); }
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
