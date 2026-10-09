// The crew cookie (Oct 2026): a signed value nobody can make up. It used to be the plain gas_crew=ok, which
// anyone could type into a browser to skip the ceilings, the Desk gate and the reduced public rail.
//
//   gas_crew=v1.<expiry ms>.<HMAC-SHA256 over "gas_crew|v1|<expiry ms>">
//
// The key comes from the environment only: CURTAIN_CREW_CODE, the same secret /api/crew already checks
// before granting crew. Rotating that code ends every crew cookie at once. With no secret set nothing is
// crew (fail closed). The old plain value "ok" is never crew.
//
// Every server-side crew check goes through isCrewRequest / isCrewCookieValue. Browser scripts may only
// test for the "v1." shape (looksLikeCrew) to hide analytics or rail chrome; they never unlock anything.
import crypto from "node:crypto";

export const CREW_COOKIE = "gas_crew";
export const CREW_MAX_AGE_S = 31536000;   // one year, as before

function key() {
  const s = process.env.CURTAIN_CREW_CODE || "";
  return s ? crypto.createHash("sha256").update("gas_crew_cookie_v1:" + s).digest() : null;
}
function sign(exp, k) { return crypto.createHmac("sha256", k).update("gas_crew|v1|" + exp).digest("base64url"); }

// A fresh signed value, for /api/crew when the right code is presented. Null when no secret is set.
export function mintCrewCookieValue(nowMs = Date.now()) {
  const k = key(); if (!k) return null;
  const exp = nowMs + CREW_MAX_AGE_S * 1000;
  return `v1.${exp}.${sign(exp, k)}`;
}

export function isCrewCookieValue(v, nowMs = Date.now()) {
  const m = /^v1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(String(v || ""));
  if (!m) return false;
  const exp = Number(m[1]); if (!(exp > nowMs)) return false;
  const k = key(); if (!k) return false;
  const want = Buffer.from(sign(exp, k)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// The value of one cookie from a raw Cookie header (no dependency on any page's own parser).
export function cookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    if (part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); } }
  }
  return null;
}

// THE crew check for a request (or a raw Cookie header string).
export function isCrewRequest(reqOrCookie) {
  const header = typeof reqOrCookie === "string" ? reqOrCookie : (reqOrCookie && reqOrCookie.headers && reqOrCookie.headers.cookie) || "";
  return isCrewCookieValue(cookieValue(header, CREW_COOKIE));
}

// For browser scripts (as a string to inline): the shape only, never trusted for access.
export const CREW_SHAPE_RE_SRC = "(?:^|; )gas_crew=v1\\.";
