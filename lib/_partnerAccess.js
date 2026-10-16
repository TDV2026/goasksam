// THE PARTNER DEMO ACCESS CODE (Sam, Oct 16 2026): a partner opens /partner-demo with its own code, never a crew cookie,
// and the crew cookie is never handed to a partner.
//
//   entry: /partner-demo?k=<PARTNER_DEMO_CODE> (or ?code=), compared in constant time; a match sets gas_partner and
//          redirects to /partner-demo with no query string. A wrong, empty or missing code, or too many attempts from one
//          address, is the plain 404 a visitor gets today, with no hint that a code exists.
//   cookie: gas_partner = p1.<expiry ms>.<HMAC-SHA256 over "gas_partner|p1|<expiry>">, HttpOnly, Secure, SameSite=Lax,
//          14 days, set twice: Path=/partner-demo and Path=/api/partnerAnswer, so the browser sends it to those two paths
//          only, and only api/partnerDemo.js and api/partnerAnswer.js read it. No other page opens with it.
//   key:   derived from PARTNER_DEMO_CODE itself (never the crew secret): changing that code ends every gas_partner cookie,
//          and rotating CURTAIN_CREW_CODE leaves them alone. With no PARTNER_DEMO_CODE set nothing here opens anything
//          (the demo is crew-only, as before), and nothing says so publicly.
// The code and the key come from the environment only; neither is ever printed, logged or stored.
import crypto from "node:crypto";
import { cookieValue } from "./_crew.js";

export const PARTNER_COOKIE = "gas_partner";
export const PARTNER_MAX_AGE_S = 14 * 24 * 3600;
export const PARTNER_PATHS = ["/partner-demo", "/api/partnerAnswer"];

function key() {
  const s = process.env.PARTNER_DEMO_CODE || "";
  return s ? crypto.createHash("sha256").update("gas_partner_cookie_v1:" + s).digest() : null;
}
const sign = (exp, k) => crypto.createHmac("sha256", k).update("gas_partner|p1|" + exp).digest("base64url");

// The typed code against PARTNER_DEMO_CODE, constant time. False when the variable is unset or the code is empty.
export function partnerCodeMatches(code) {
  const want = process.env.PARTNER_DEMO_CODE || "";
  const got = String(code == null ? "" : code);
  if (!want || !got) return false;
  const a = crypto.createHash("sha256").update(got).digest(), b = crypto.createHash("sha256").update(want).digest();
  return crypto.timingSafeEqual(a, b);
}
export function mintPartnerCookieValue(nowMs = Date.now()) {
  const k = key(); if (!k) return null;
  const exp = nowMs + PARTNER_MAX_AGE_S * 1000;
  return `p1.${exp}.${sign(exp, k)}`;
}
export function isPartnerCookieValue(v, nowMs = Date.now()) {
  const m = /^p1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(String(v || ""));
  if (!m) return false;
  const exp = Number(m[1]); if (!(exp > nowMs)) return false;
  const k = key(); if (!k) return false;
  const want = Buffer.from(sign(exp, k)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
export function isPartnerRequest(req) {
  const header = (req && req.headers && req.headers.cookie) || "";
  return isPartnerCookieValue(cookieValue(header, PARTNER_COOKIE));
}
// The two Set-Cookie values for a fresh gas_partner (one per path), or null when no code is configured.
export function partnerSetCookies(nowMs = Date.now()) {
  const v = mintPartnerCookieValue(nowMs); if (!v) return null;
  return PARTNER_PATHS.map(p => `${PARTNER_COOKIE}=${v}; Max-Age=${PARTNER_MAX_AGE_S}; Path=${p}; HttpOnly; Secure; SameSite=Lax`);
}
