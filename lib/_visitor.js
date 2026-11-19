// Pseudonymous first-party visitor id (Oct 2026, open-search policy, Lane B Step 2).
// Random, no email, no typed text, no personal data. Excluded for crew (gas_crew=ok) so
// pre-launch testers never pollute visitor analytics. Excluded in the EEA/UK/Switzerland
// for now (same jurisdictions as lib/analytics.js GA_BLOCKED_COUNTRIES, same free Vercel
// geo header) pending Sam's consent-banner decision - see docs/admin-analytics.md. Not
// HttpOnly, matching every other gas_* cookie in this codebase (gas_crew/gas_tester/
// gas_once), so an existing convention isn't broken for this one id.
import { GA_BLOCKED_COUNTRIES } from "./analytics.js";

import { isCrewRequest } from "./_crew.js";
import crypto from "node:crypto";
const COOKIE = "gas_vid";

// SERVER-ISSUED, SIGNED DEVICE ID (Lane S review, Oct 27 2026). The cookie used to be any 8 to 64 character string the client sent, so changing it on every call
// slipped every per-device limit. Now the value is v1.<random id>.<HMAC the server made over it>; only a value this server issued is read as a device. Anything else (a made-up
// string, an old unsigned cookie, a tampered one) is NOT a device: the limits fall back to the address plus browser hash (lib/_ceilings.js deviceKey), and the next beacon issues a
// fresh signed id. The key is derived from a server secret already in the environment (never printed); with none set, no id is issued or trusted (fail closed).
function signKey() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return s ? crypto.createHash("sha256").update("gas_vid_cookie_v1:" + s).digest() : null;
}
const macOf = (id, k) => crypto.createHmac("sha256", k).update("gas_vid|v1|" + id).digest("base64url");
function issueValue() {
  const k = signKey(); if (!k) return null;
  const id = crypto.randomBytes(16).toString("base64url");   // 22 characters
  return { id, value: `v1.${id}.${macOf(id, k)}` };
}
// The id inside a signed cookie value, or null when the value was not issued by this server.
export function verifiedDeviceId(value) {
  const m = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(String(value || ""));
  if (!m) return null;
  const k = signKey(); if (!k) return null;
  const want = Buffer.from(macOf(m[1], k)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? m[1] : null;
}
const MAX_AGE = 60 * 60 * 24 * 730; // ~2 years

export function parseCookieHeader(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  });
  return out;
}

function randomId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function appendSetCookie(res, cookieStr) {
  try {
    const existing = res.getHeader && res.getHeader("Set-Cookie");
    const arr = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
    res.setHeader("Set-Cookie", [...arr, cookieStr]);
  } catch {}
}

// Reads the existing visitor id, or mints + sets a new one. Returns {id:null,minted:false} for
// crew traffic and for blocked jurisdictions (no cookie set either way, so nothing to clean up
// later if Sam later ships a consent banner and lifts the gate). Call once per request, before
// the response is sent - safe to call from any handler, including fire-and-forget beacons.
// minted:true tells the caller this is the FIRST time this id has ever existed (Part 1.4: the one
// moment a first-touch row may be stored, never on a later, repeat read of the same cookie).
export function ensureVisitorId(req, res) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  if (isCrewRequest(req)) return { id: null, minted: false };
  const country = String((req.headers && req.headers["x-vercel-ip-country"]) || "").toUpperCase();
  if (GA_BLOCKED_COUNTRIES.has(country)) return { id: null, minted: false };
  const existing = verifiedDeviceId(cookies[COOKIE]);
  if (existing) return { id: existing, minted: false };
  const issued = issueValue();
  if (!issued) return { id: null, minted: false };   // no server secret: no id is issued
  appendSetCookie(res, `${COOKIE}=${issued.value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`);
  return { id: issued.id, minted: true };
}

// Read-only variant for endpoints that should attach the id if present but must never mint
// one themselves (e.g. a GET that renders a cached/shared page). Never sets a cookie.
export function readVisitorId(req) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  if (isCrewRequest(req)) return null;
  return verifiedDeviceId(cookies[COOKIE]);   // only an id this server issued; anything else is not a device
}
