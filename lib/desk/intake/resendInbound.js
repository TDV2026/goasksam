// DESK INTAKE: the inbound provider is Resend (the one we already send mail through). Receiving is on the domain desk.goasksam.com; Resend posts an
// "email.received" webhook (signed with Svix) holding the email's id, and the full email, the original file and the attachments are read from the
// Receiving API (https://resend.com/docs/api-reference/emails/retrieve-received-email, checked Nov 4 2026). Only fixed hosts are fetched: api.resend.com
// and the signed download URLs it hands back. No link inside an email is ever fetched.
import crypto from "node:crypto";

const API = "https://api.resend.com";
export const WEBHOOK_TOLERANCE_S = 300;

// Svix signature: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${raw body}` with the secret's base64 part; the header lists "v1,<sig>" values.
// The body is signed as BYTES (a Buffer is used as it arrived; a string is taken as utf8), never re-stringified from a parsed object.
// Rejection reasons (codes only, nothing secret): secret_missing, missing_headers, stale_timestamp, no_matching_signature.
export function cleanSecret(secret) {
  let s = String(secret == null ? "" : secret).trim();
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim();
  return s.replace(/^whsec_/i, "").trim();
}
const toBytes = raw => Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw == null ? "" : raw), "utf8");
export function verifyWebhook(raw, headers, secret, nowMs = Date.now()) {
  const h = k => { const key = Object.keys(headers || {}).find(x => x.toLowerCase() === k); const v = key ? headers[key] : ""; return Array.isArray(v) ? v.join(" ") : String(v || ""); };
  const bare = cleanSecret(secret);
  if (!bare) return { ok: false, reason: "secret_missing" };
  const id = h("svix-id").trim(), ts = h("svix-timestamp").trim(), sig = h("svix-signature").trim();
  if (!id || !ts || !sig) return { ok: false, reason: "missing_headers" };
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > WEBHOOK_TOLERANCE_S) return { ok: false, reason: "stale_timestamp" };
  const key = Buffer.from(bare, "base64");
  const want = crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`${id}.${ts}.`, "utf8"), toBytes(raw)])).digest();
  for (const part of sig.split(/\s+/)) {
    const i = part.indexOf(","); if (i < 0) continue;
    const v = part.slice(0, i), b64 = part.slice(i + 1);
    if (v !== "v1" || !b64) continue;
    const got = Buffer.from(b64, "base64");
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) return { ok: true };
  }
  return { ok: false, reason: "no_matching_signature" };
}
export function signWebhook(raw, id, tsSeconds, secret) {   // for the checks
  const key = Buffer.from(cleanSecret(secret), "base64");
  return "v1," + crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`${id}.${tsSeconds}.`, "utf8"), toBytes(raw)])).digest("base64");
}

async function getJson(url, apiKey) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`resend ${r.status} ${url.replace(API, "")}`);
  return r.json();
}
const bytesFrom = async url => {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("download url not https");
  const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

// The mail object processInbound reads. Attachments load lazily (the signed URLs last an hour).
export async function fetchReceived(emailId, apiKey) {
  const e = await getJson(`${API}/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`, apiKey);
  let atts = [];
  try { atts = (await getJson(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, apiKey)).data || []; } catch { atts = e.attachments || []; }
  return {
    emailId,
    from: e.from, to: Array.isArray(e.to) ? e.to : [e.to].filter(Boolean), subject: e.subject || "",
    text: e.text || "", html: e.html || "", headers: e.headers || {}, messageId: e.message_id || null, authentication: e.authentication || null,
    raw: async () => (e.raw && e.raw.download_url ? bytesFrom(e.raw.download_url) : null),
    attachments: atts.map(a => ({ filename: a.filename, contentType: a.content_type, size: a.size, load: () => bytesFrom(a.download_url) }))
  };
}
