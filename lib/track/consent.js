// Consent and identity for analytics (Oct 2026, Lane C; docs/analytics-events.md "Consent and identity").
//
// region_class: "restricted" (EEA, UK, Switzerland; the same set lib/analytics.js uses for the GA banner) or
// "open", from the edge country header. The country itself is never kept.
// consent: gas_consent (Lane A's banner) "granted" | "declined". Restricted with no cookie counts as declined;
// an explicit "declined" is honoured anywhere. Otherwise "not_required" (open) or "granted".
// anon_id: cookie gas_aid, 16 random bytes, 13 months from the day it was made, never extended, made only
// when consent is not declined. session_id: cookie gas_sid, 30 minutes idle. Neither is ever derived from
// the device, the address, the browser string or the quota device id (gas_vid, which this file never reads).
import crypto from "crypto";
import { GA_CONSENT_COUNTRIES } from "../analytics.js";
import { isCrewRequest } from "../_crew.js";
import { hasServerCredential } from "../_credential.js";

export const ANON_COOKIE = "gas_aid";
export const SESSION_COOKIE = "gas_sid";
export const CONSENT_COOKIE = "gas_consent";
export const ANON_MAX_AGE_S = 395 * 24 * 3600;   // 13 months
export const SESSION_IDLE_S = 30 * 60;
const ID_RE = /^[A-Za-z0-9_-]{16,40}$/;

function cookies(req) {
  const out = {};
  String((req && req.headers && req.headers.cookie) || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  });
  return out;
}

// x-gas-region: restricted treats any request as restricted (the end-to-end test of the banner and a decline from
// outside Europe). It can only take tracking away, never turn a restricted visitor into an open one.
export function regionClass(req) {
  if (String((req && req.headers && req.headers["x-gas-region"]) || "").toLowerCase() === "restricted") return "restricted";
  const c = String((req && req.headers && req.headers["x-vercel-ip-country"]) || "").toUpperCase();
  return GA_CONSENT_COUNTRIES.has(c) ? "restricted" : "open";
}

export function consentState(req) {
  const region_class = regionClass(req);
  const v = String(cookies(req)[CONSENT_COOKIE] || "").toLowerCase();
  if (v === "declined") return { region_class, consent: "declined" };
  if (region_class === "restricted") return { region_class, consent: v === "granted" ? "granted" : "declined" };
  return { region_class, consent: "not_required" };
}

// Crew, a server credential (probe or ops key), the launch-stage test header, or an explicit test header.
export function isInternal(req) {
  if (!req || !req.headers) return false;
  try {
    if (isCrewRequest(req)) return true;
    if (hasServerCredential(req)) return true;
  } catch {}
  return !!(req.headers["x-launch-stage-test"] || req.headers["x-gas-test"]);
}

const newId = () => crypto.randomBytes(16).toString("base64url");

function setCookie(res, str) {
  if (!res || !res.setHeader) return;
  try {
    const existing = res.getHeader && res.getHeader("Set-Cookie");
    const arr = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
    res.setHeader("Set-Cookie", [...arr, str]);
  } catch {}
}
const cookieStr = (name, value, maxAge) => `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;

// The visitor's analytics identity for this request. With res and mint:true (the browser helper's own hits),
// makes gas_aid when missing, keeps gas_sid alive, and deletes both when consent is declined. Without res
// (any other handler), only reads: a handler never sets an analytics cookie on a product response.
export function identity(req, res, opts = {}) {
  const { region_class, consent } = consentState(req);
  const c = cookies(req);
  if (consent === "declined") {
    if (res && (c[ANON_COOKIE] || c[SESSION_COOKIE])) {
      setCookie(res, cookieStr(ANON_COOKIE, "", 0));
      setCookie(res, cookieStr(SESSION_COOKIE, "", 0));
    }
    return { region_class, consent, anon_id: null, session_id: null };
  }
  let anon_id = ID_RE.test(c[ANON_COOKIE] || "") ? c[ANON_COOKIE] : null;
  let session_id = ID_RE.test(c[SESSION_COOKIE] || "") ? c[SESSION_COOKIE] : null;
  if (res && opts.mint) {
    if (!anon_id) { anon_id = newId(); setCookie(res, cookieStr(ANON_COOKIE, anon_id, ANON_MAX_AGE_S)); }
    if (!session_id) session_id = newId();
    setCookie(res, cookieStr(SESSION_COOKIE, session_id, SESSION_IDLE_S));
  }
  return { region_class, consent, anon_id, session_id };
}
