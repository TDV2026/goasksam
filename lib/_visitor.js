// Pseudonymous first-party visitor id (Oct 2026, open-search policy, Lane B Step 2).
// Random, no email, no typed text, no personal data. Excluded for crew (gas_crew=ok) so
// pre-launch testers never pollute visitor analytics. Excluded in the EEA/UK/Switzerland
// for now (same jurisdictions as lib/analytics.js GA_BLOCKED_COUNTRIES, same free Vercel
// geo header) pending Sam's consent-banner decision - see docs/admin-analytics.md. Not
// HttpOnly, matching every other gas_* cookie in this codebase (gas_crew/gas_tester/
// gas_once), so an existing convention isn't broken for this one id.
import { GA_BLOCKED_COUNTRIES } from "./analytics.js";

const COOKIE = "gas_vid";
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
  if (cookies.gas_crew === "ok") return { id: null, minted: false };
  const country = String((req.headers && req.headers["x-vercel-ip-country"]) || "").toUpperCase();
  if (GA_BLOCKED_COUNTRIES.has(country)) return { id: null, minted: false };
  const existing = cookies[COOKIE];
  if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return { id: existing, minted: false };
  const id = randomId();
  appendSetCookie(res, `${COOKIE}=${id}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`);
  return { id, minted: true };
}

// Read-only variant for endpoints that should attach the id if present but must never mint
// one themselves (e.g. a GET that renders a cached/shared page). Never sets a cookie.
export function readVisitorId(req) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  if (cookies.gas_crew === "ok") return null;
  const v = cookies[COOKIE];
  return (v && /^[a-zA-Z0-9_-]{8,64}$/.test(v)) ? v : null;
}
