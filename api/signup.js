// Sign-up protection (Oct 2026, Lane C): lib/_signup.js holds the rules.
//   POST /api/signup {action:"check", email, turnstile}  -> { ok, ticket } or { ok:false, message }
//        The page calls this before it asks Supabase for a sign-in code. An existing account always passes.
//   POST /api/signup?hook=before_user_created           -> Supabase Auth "Before User Created" hook (signed with
//        SUPABASE_AUTH_HOOK_SECRET). 200 {} lets the user be created; 400 {error:{http_code,message}} refuses.
// Body parsing is off so the hook's signature is checked over the exact bytes Supabase sent.
import { supabaseEnv } from "../lib/_supabase.js";
import { clientAddress, isCrew, countSince, record, addressKey, addressKeys } from "../lib/_ceilings.js";
import { signupCheck, hookSignatureOk, beforeUserCreated } from "../lib/_signup.js";
import { logEvent, EVENTS } from "../lib/events.js";
import { hasServerCredential } from "../lib/_credential.js";

export const config = { api: { bodyParser: false } };

// The stream is read BEFORE req.body is touched: on Vercel req.body is a lazy parser over the same bytes, and once
// it runs only a re-serialised copy is left (Oct 12 live check: 44 bytes sent, 35 seen).
async function rawBody(req) {
  try {
    const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    if (chunks.length) return { raw: Buffer.concat(chunks).toString("utf8"), from: "stream" };
  } catch { /* already consumed: fall through */ }
  const b = req.body;
  if (typeof b === "string") return { raw: b, from: "string" };
  if (Buffer.isBuffer(b)) return { raw: b.toString("utf8"), from: "buffer" };
  return { raw: b && typeof b === "object" ? JSON.stringify(b) : "", from: "reparsed" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { raw, from } = await rawBody(req).catch(() => ({ raw: "", from: "error" }));
  let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return res.status(400).json({ error: "bad body" }); }
  const env = supabaseEnv();

  if (req.query && req.query.hook === "before_user_created") {
    if (!hookSignatureOk(req.headers, raw)) return res.status(401).json({ error: { http_code: 401, message: "Unauthorized." } });
    const d = beforeUserCreated(body);
    if (d.allow) return res.status(200).json({});
    if (env) await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "signup", props: { kind: "signup_refused_at_creation", scope: "signup" } }).catch(() => {});
    return res.status(400).json({ error: { http_code: 400, message: d.message } });
  }

  // Our own check (header credential): the raw body arrives byte for byte (the hook's signature depends on it).
  if (body.action === "rawcheck" && hasServerCredential(req)) return res.status(200).json({ rawLength: raw.length, reparsedLength: JSON.stringify(body).length, from });
  // Our own check (header credential), Oct 2026: is the hook live and is the salt from its own setting? Names and yes or
  // no only, never a value. Creates throwaway accounts on our own address through Supabase's admin link (no email is
  // sent): one with a valid ticket (the hook should let it through), one without (the hook should refuse it); both
  // are deleted again at once. Reports what Supabase answered, so the page's refusal matching can be checked.
  if (body.action === "hookcheck" && hasServerCredential(req)) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const stamp = Date.now().toString(36), made = [];
    const tryCreate = async (email, data) => {
      const r = await fetch(`${url}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email, data }) });
      const j = await r.json().catch(() => ({}));
      const id = (j && (j.id || (j.user && j.user.id))) || null; if (id) made.push(id);
      return { status: r.status, created: !!id, said: String(j.msg || j.message || j.error_description || j.error || "").slice(0, 200) };
    };
    const withTicket = `feedback+hookcheck-${stamp}a@goasksam.com`, without = `feedback+hookcheck-${stamp}b@goasksam.com`;
    const out = {
      saltSource: process.env.ADDRESS_HASH_SECRET ? "ADDRESS_HASH_SECRET" : process.env.CRON_SECRET ? "CRON_SECRET (fallback)" : process.env.SUPABASE_SERVICE_ROLE_KEY ? "service role key (fallback)" : "none",
      hookSecretSet: !!process.env.SUPABASE_AUTH_HOOK_SECRET,
      withTicket: await tryCreate(withTicket, { signup_ticket: (await import("../lib/_signup.js")).signupTicket(withTicket) }),
      withoutTicket: await tryCreate(without, {})
    };
    for (const id of made) { const d = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => null); (out.deleted = out.deleted || []).push(d ? d.status : "error"); }
    return res.status(200).json(out);
  }
  if (body.action !== "check") return res.status(400).json({ error: "unknown action" });
  if (!env) return res.status(200).json({ ok: true, ticket: null });   // fail open: sign in must never break here
  const ip = clientAddress(req), dayAgo = () => new Date(Date.now() - 864e5).toISOString();
  const out = await signupCheck({ email: body.email, token: body.turnstile, ip, crew: isCrew(req) }, {
    accountExists: async e => {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/accounts?email=ilike.${encodeURIComponent(e.replace(/[%_*]/g, ""))}&select=user_id&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
      return r.ok ? (await r.json()).length > 0 : false;
    },
    countToday: () => countSince(env, addressKeys(req), "c:signup", dayAgo()),
    record: () => record(env, [addressKey(req)].filter(Boolean), "c:signup")
  });
  if (!out.ok) await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "signup", props: { kind: "signup_" + out.reason, scope: "signup" } }).catch(() => {});
  return res.status(200).json(out.ok ? { ok: true, ticket: out.ticket } : { ok: false, message: out.message });
}
