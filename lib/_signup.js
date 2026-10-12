// SIGN-UP PROTECTION (Oct 2026, Lane C). Only the creation of a NEW email account is checked; signing in to an
// existing account, Google sign in and the email code itself are never touched. Two halves:
//   1. signupCheck (POST /api/account {action:"signup_check"}): the page asks before it requests a sign-in code.
//      An existing account passes at once. A new one: a throwaway email domain is refused (lib/data/
//      disposableDomains.js, the maintained public list), new accounts per address per day are limited (crew
//      exempt), and when SIGNUP_TURNSTILE=1 a valid Cloudflare Turnstile token is required. A pass returns a
//      short-lived ticket the page sends along with the code request (as user metadata).
//   2. beforeUserCreated (Supabase Auth "Before User Created" hook, POST /api/account?hook=before_user_created,
//      signed with SUPABASE_AUTH_HOOK_SECRET): a new EMAIL account is created only with a valid ticket for that
//      address, so the checks cannot be skipped by calling Supabase directly. Google and other providers pass.
// Settings, all from the environment: SIGNUP_TURNSTILE ("1" = on), TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY,
// SUPABASE_AUTH_HOOK_SECRET, SIGNUP_TICKET_SECRET (falls back to TASK_LINK_SECRET, then CRON_SECRET).
// VPN and proxy traffic is never blocked or flagged: the address is only counted.
import crypto from "node:crypto";
import { DISPOSABLE_DOMAINS } from "./data/disposableDomains.js";

// New accounts per address per day. Measured (30 days, Oct 2026): 79 accounts in all, the busiest DAY for the
// whole site 20 (tester invites), most days 1 to 6; no address is stored with an account, so this is set at the
// whole site's busiest day, far above any family or office.
export const SIGNUPS_PER_ADDRESS_DAY = 20;

// What the person sees (plain, never naming the rule).
export const SIGNUP_REFUSED = {
  domain: "That email address can't be used for a new account. Try another address you use.",
  limit: "New accounts can't be made from here right now. Try again tomorrow, or sign in with an account you already have.",
  check: "That didn't go through. Refresh the page and try again."
};

let DOMAINS = null;
const domains = () => DOMAINS || (DOMAINS = new Set(DISPOSABLE_DOMAINS.split("\n")));
// The address's domain or any parent of it (mail.example.com -> example.com) on the list.
export function isThrowaway(email) {
  const d = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!d) return false;
  const parts = d.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (domains().has(parts.slice(i).join("."))) return true;
  return false;
}

export const turnstileOn = () => process.env.SIGNUP_TURNSTILE === "1" && !!process.env.TURNSTILE_SITE_KEY && !!process.env.TURNSTILE_SECRET_KEY;
export const turnstileConfig = () => ({ on: turnstileOn(), siteKey: turnstileOn() ? process.env.TURNSTILE_SITE_KEY : null });
// Cloudflare's own check of a widget token (siteverify). Test mode: Cloudflare's published test secrets.
export async function verifyTurnstile(token, ip, secret = process.env.TURNSTILE_SECRET_KEY) {
  if (!token || !secret) return false;
  try {
    const body = new URLSearchParams({ secret, response: String(token).slice(0, 2048) }); if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    return j.success === true;
  } catch { return false; }
}

const SECRET = () => process.env.SIGNUP_TICKET_SECRET || process.env.TASK_LINK_SECRET || process.env.CRON_SECRET || "";
const norm = e => String(e || "").trim().toLowerCase();
// A ticket for one address, good for 30 minutes: "<expiry>.<signature>".
export function signupTicket(email, now = Date.now()) {
  const exp = Math.floor(now / 1000) + 1800, s = SECRET();
  if (!s) return null;
  return exp + "." + crypto.createHmac("sha256", s).update(norm(email) + "|" + exp).digest("base64url");
}
export function ticketOk(email, ticket, now = Date.now()) {
  const [exp, sig] = String(ticket || "").split("."), s = SECRET();
  if (!exp || !sig || !s || Number(exp) * 1000 < now) return false;
  const want = crypto.createHmac("sha256", s).update(norm(email) + "|" + exp).digest("base64url");
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

// signupCheck(env, { email, token, ip, crew }, deps): deps = { accountExists(email), countToday(key), record(key) }
// (the ceilings ledger in production, stubs in tests). Returns { ok, ticket } or { ok:false, reason, message }.
export async function signupCheck({ email, token, ip, crew }, deps) {
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, reason: "email", message: "That doesn't look like an email address." };
  // An existing account is never checked: signing in is not signing up.
  if (await deps.accountExists(e).catch(() => false)) return { ok: true, existing: true, ticket: signupTicket(e) };
  if (isThrowaway(e)) return { ok: false, reason: "domain", message: SIGNUP_REFUSED.domain };
  if (turnstileOn() && !(await (deps.verify || verifyTurnstile)(token, ip))) return { ok: false, reason: "turnstile", message: SIGNUP_REFUSED.check };
  if (!crew && ip) {
    const n = await deps.countToday("ip:" + ip).catch(() => null);
    if (n != null && n >= SIGNUPS_PER_ADDRESS_DAY) return { ok: false, reason: "address_day", message: SIGNUP_REFUSED.limit };
    await deps.record("ip:" + ip).catch(() => {});
  }
  return { ok: true, ticket: signupTicket(e) };
}

// Standard Webhooks signature (what Supabase Auth hooks send): webhook-id, webhook-timestamp, webhook-signature
// ("v1,<base64>" entries) over "<id>.<timestamp>.<body>", keyed by the secret "v1,whsec_<base64>".
export function hookSignatureOk(headers, rawBody, secret = process.env.SUPABASE_AUTH_HOOK_SECRET, now = Date.now()) {
  if (!secret) return false;
  const id = headers["webhook-id"], ts = headers["webhook-timestamp"], sigs = String(headers["webhook-signature"] || "");
  if (!id || !ts || !sigs || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const want = crypto.createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
  return sigs.split(" ").some(s => { const v = s.split(",")[1] || ""; return v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)); });
}
// The hook's decision for one would-be user: { allow:true } or { allow:false, message }.
export function beforeUserCreated(payload) {
  const u = (payload && payload.user) || {};
  const provider = (u.app_metadata && u.app_metadata.provider) || "email";
  if (provider !== "email") return { allow: true };   // Google and every other sign in provider: never blocked
  const ticket = u.user_metadata && u.user_metadata.signup_ticket;
  if (ticketOk(u.email, ticket)) return { allow: true };
  return { allow: false, message: isThrowaway(u.email) ? SIGNUP_REFUSED.domain : SIGNUP_REFUSED.check };
}
