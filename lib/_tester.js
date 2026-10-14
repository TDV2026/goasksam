// ===================== TESTER COHORT (pre-launch) =====================
// An invite tier Sam hands out directly (no account): /api/crew?tcode=<code> sets a signed cookie. Rewritten Oct 2026
// (Lane C): there is NO code in this file. The code comes from the environment only (CURTAIN_TESTER_CODE, at least 16
// characters) and the expiry is mandatory (TESTER_CODE_EXPIRES, ISO 8601). With either missing or unreadable, or the
// date past, tester access is off everywhere (fail closed). The code written into earlier versions of this file is in
// the repository history and must never be used again.
//
//   gas_tester=t1.<expiry ms>.<HMAC-SHA256 over "gas_tester|t1|<expiry ms>">
//
// The cookie's key is derived from the code, so changing CURTAIN_TESTER_CODE ends every tester cookie at once, and
// every check also re-reads the expiry, so a cookie stops working the moment the date passes. The old plain value
// "ok" is never a tester. Server checks go through isTesterRequest; browser pages may only test the "t1." shape to
// decide where to send someone, never to unlock anything.
import crypto from "node:crypto";
import { cookieValue } from "./_crew.js";

export const TESTER_COOKIE = "gas_tester";
const MIN_CODE = 16;

function code() { const c = String(process.env.CURTAIN_TESTER_CODE || "").trim(); return c.length >= MIN_CODE ? c : null; }
export function testerExpiryMs() {
  const t = Date.parse(String(process.env.TESTER_CODE_EXPIRES || ""));
  return Number.isFinite(t) ? t : 0;   // unset or unreadable: expired (fail closed)
}
// True when tester access is off: no code, no expiry, or the date has passed. Re-checked on every request.
export function testerCodeExpired(nowMs = Date.now()) {
  const t = testerExpiryMs();
  return !code() || !t || nowMs > t;
}
// Seconds until the hard date, for the cookie's own Max-Age (the server check is the real gate).
export function testerCookieMaxAge(nowMs = Date.now()) {
  return Math.max(0, Math.floor((testerExpiryMs() - nowMs) / 1000));
}
function key() { const c = code(); return c ? crypto.createHash("sha256").update("gas_tester_cookie_v1:" + c).digest() : null; }
function sign(exp, k) { return crypto.createHmac("sha256", k).update("gas_tester|t1|" + exp).digest("base64url"); }

// Does a presented code match? Timing-safe; false whenever tester access is off.
export function testerCodeMatches(presented, nowMs = Date.now()) {
  const c = code(); if (!c || testerCodeExpired(nowMs)) return false;
  const a = Buffer.from(String(presented || "")), b = Buffer.from(c);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// A fresh signed value that ends at the hard date, or null when tester access is off.
export function mintTesterCookieValue(nowMs = Date.now()) {
  if (testerCodeExpired(nowMs)) return null;
  const k = key(); if (!k) return null;
  const exp = testerExpiryMs();
  return `t1.${exp}.${sign(exp, k)}`;
}
export function isTesterCookieValue(v, nowMs = Date.now()) {
  const m = /^t1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(String(v || ""));
  if (!m || testerCodeExpired(nowMs)) return false;
  const exp = Number(m[1]); if (!(exp > nowMs) || exp > testerExpiryMs()) return false;
  const k = key(); if (!k) return false;
  const want = Buffer.from(sign(exp, k)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
// THE tester check for a request (or a raw Cookie header string).
export function isTesterRequest(reqOrCookie, nowMs = Date.now()) {
  const header = typeof reqOrCookie === "string" ? reqOrCookie : (reqOrCookie && reqOrCookie.headers && reqOrCookie.headers.cookie) || "";
  return isTesterCookieValue(cookieValue(header, TESTER_COOKIE), nowMs);
}
// The Set-Cookie line for a fresh tester cookie, or null when tester access is off.
export function testerSetCookie(nowMs = Date.now()) {
  const v = mintTesterCookieValue(nowMs);
  return v ? `${TESTER_COOKIE}=${v}; Max-Age=${testerCookieMaxAge(nowMs)}; Path=/; SameSite=Lax; Secure` : null;
}
