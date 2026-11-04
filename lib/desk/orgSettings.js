// Sam Desk Valuations: org settings (Lane S, Nov 4 2026). Spec: "an org can set venue choice on or off, threshold, branding,
// sending address and standard message, nothing else in v1" plus reserve-or-range and automatic sending (off unless the org turns it on).
// =====================================================================
// ONE list of what an org may edit (EDITABLE_FIELDS). Everything else (seat limit, licence dates, domain status, the provider's
// ids) is operator-only and is never accepted from an org's seat. This module validates and stores; it computes no market figure.
// A figure is never read from here: the threshold is a limit the sheet compares a figure against, and the engine supplies the figure.
import { supabaseSelect, supabaseInsert, supabasePatch } from "../_supabase.js";
import { validOrg } from "./storage.js";

export const DEFAULT_THRESHOLD_PCT = 15;
export const DEFAULTS = Object.freeze({
  logo_path: null, sending_name: null, sending_address: null, signature: null, standard_message: null,
  threshold_pct: DEFAULT_THRESHOLD_PCT, venue_choice: false, reserve_or_range: "either", auto_send: false,
  sending_domain: null, sending_domain_status: "unverified", sending_domain_verified_at: null,
  seat_limit: 3, licence_starts_on: null, licence_ends_on: null
});
export const EDITABLE_FIELDS = Object.freeze(["logo_path", "sending_name", "sending_address", "signature", "standard_message", "threshold_pct", "venue_choice", "reserve_or_range", "auto_send"]);
export const OPERATOR_FIELDS = Object.freeze(["seat_limit", "licence_starts_on", "licence_ends_on"]);
export const RESERVE_OR_RANGE = Object.freeze(["reserve", "range", "either"]);
export const FREE_MAIL = Object.freeze(["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "msn.com"]);

const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// No control characters at all (this is what stops a header injected through a name or address); text may keep newlines.
const hasCtl = (s, allowNl) => (allowNl ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(s);

export function domainOf(address) { const m = EMAIL_RE.exec(String(address || "")); return m ? String(address).split("@")[1].toLowerCase() : null; }

// patch -> { ok, clean, errors[] }. operator = true for the crew/operator only.
export function validateSettingsPatch(org, patch, { operator = false } = {}) {
  const errors = [], clean = {};
  if (!validOrg(org)) return { ok: false, clean, errors: ["bad org"] };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, clean, errors: ["settings must be an object"] };
  const allowed = new Set([...EDITABLE_FIELDS, ...(operator ? OPERATOR_FIELDS : [])]);
  for (const k of Object.keys(patch)) if (!allowed.has(k)) errors.push(`${k} cannot be set here`);
  const has = k => Object.prototype.hasOwnProperty.call(patch, k) && allowed.has(k);
  const text = (k, max, allowNl) => {
    if (!has(k)) return; const v = patch[k];
    if (v === null || v === "") { clean[k] = null; return; }
    if (typeof v !== "string" || v.length > max || hasCtl(v, allowNl)) { errors.push(`${k} is not valid text (max ${max} characters)`); return; }
    clean[k] = v.trim();
  };
  text("sending_name", 120, false); text("signature", 2000, true); text("standard_message", 4000, true);
  if (has("sending_address")) {
    const v = patch.sending_address;
    if (v === null || v === "") clean.sending_address = null;
    else if (typeof v !== "string" || hasCtl(v, false) || !EMAIL_RE.test(v.trim())) errors.push("sending_address is not a valid email address");
    else if (FREE_MAIL.includes(domainOf(v.trim()))) errors.push("sending_address must be on the organisation's own domain, not a free mail service");
    else clean.sending_address = v.trim().toLowerCase();
  }
  if (has("logo_path")) {
    const v = patch.logo_path;
    if (v === null || v === "") clean.logo_path = null;
    else if (typeof v !== "string" || !v.startsWith(org + "/brand/") || /\.\.|\\|\/\/|[\u0000-\u001f]/.test(v) || v.length > 200 || !/\.(png|jpg|svg|webp)$/.test(v)) errors.push("logo_path must be a logo uploaded to this org's brand folder");
    else clean.logo_path = v;
  }
  if (has("threshold_pct")) {
    const n = typeof patch.threshold_pct === "number" ? patch.threshold_pct : (typeof patch.threshold_pct === "string" && patch.threshold_pct.trim() !== "" ? Number(patch.threshold_pct) : NaN);
    if (!Number.isFinite(n) || n < 0.5 || n > 100) errors.push("threshold_pct must be a number from 0.5 to 100"); else clean.threshold_pct = Math.round(n * 100) / 100;
  }
  for (const k of ["venue_choice", "auto_send"]) if (has(k)) { if (typeof patch[k] !== "boolean") errors.push(`${k} must be true or false`); else clean[k] = patch[k]; }
  if (has("reserve_or_range")) { if (!RESERVE_OR_RANGE.includes(patch.reserve_or_range)) errors.push("reserve_or_range must be reserve, range or either"); else clean.reserve_or_range = patch.reserve_or_range; }
  if (has("seat_limit")) { const n = patch.seat_limit; if (!Number.isInteger(n) || n < 1 || n > 25) errors.push("seat_limit must be a whole number from 1 to 25"); else clean.seat_limit = n; }
  for (const k of ["licence_starts_on", "licence_ends_on"]) if (has(k)) {
    const v = patch[k];
    if (v === null) { if (k === "licence_ends_on") errors.push("licence_ends_on cannot be cleared"); else clean[k] = null; }
    else if (typeof v !== "string" || !DATE_RE.test(v) || new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) errors.push(`${k} must be a real date, yyyy-mm-dd`);
    else clean[k] = v;
  }
  return { ok: errors.length === 0, clean, errors };
}

// The stored row merged over the defaults. A missing row reads as the defaults (threshold 15, venue choice off).
export function effectiveSettings(row) { return { ...DEFAULTS, ...Object.fromEntries(Object.entries(row || {}).filter(([, v]) => v !== undefined)) }; }

// Sending is possible only from an address on a domain the provider has verified for this org.
export function sendingReady(s) {
  const e = effectiveSettings(s);
  return !!(e.sending_address && e.sending_domain && e.sending_domain_status === "verified" && domainOf(e.sending_address) === String(e.sending_domain).toLowerCase());
}

// What a browser may see: no provider ids, no DNS record internals beyond what the admin must publish.
export function publicSettings(row) {
  const e = effectiveSettings(row);
  return {
    logo_path: e.logo_path, sending_name: e.sending_name, sending_address: e.sending_address, sending_domain: e.sending_domain,
    sending_domain_status: e.sending_domain_status, sending_ready: sendingReady(e), signature: e.signature, standard_message: e.standard_message,
    threshold_pct: Number(e.threshold_pct), venue_choice: !!e.venue_choice, reserve_or_range: e.reserve_or_range, auto_send: !!e.auto_send,
    seat_limit: e.seat_limit, licence_ends_on: e.licence_ends_on
  };
}

export async function getOrgSettings(env, org) {
  if (!validOrg(org)) return null;
  const rows = await supabaseSelect(env, `desk_org_settings?select=*&org_id=eq.${encodeURIComponent(org)}&limit=1`);
  if (!Array.isArray(rows)) return null;     // a failed read is not "defaults": the caller must say so
  return effectiveSettings(rows[0] || null);
}

// Validate, then store. A new sending address on a different domain resets verification (the new domain must be verified again).
export async function putOrgSettings(env, { org, patch, operator = false, seatId = null }) {
  const v = validateSettingsPatch(org, patch, { operator });
  if (!v.ok) return { ok: false, errors: v.errors };
  const cur = await getOrgSettings(env, org);
  if (!cur) return { ok: false, errors: ["could not read the current settings"] };
  const next = { ...v.clean };
  if (Object.prototype.hasOwnProperty.call(next, "sending_address")) {
    const d = next.sending_address ? domainOf(next.sending_address) : null;
    if (d !== (cur.sending_domain || null)) Object.assign(next, { sending_domain: d, sending_domain_status: "unverified", sending_domain_provider_id: null, sending_domain_records: null, sending_domain_verified_at: null });
  }
  next.updated_by_seat_id = seatId;
  const exists = await supabaseSelect(env, `desk_org_settings?select=org_id&org_id=eq.${encodeURIComponent(org)}&limit=1`);
  if (!Array.isArray(exists)) return { ok: false, errors: ["could not write the settings"] };
  if (exists[0]) { const r = await supabasePatch(env, `desk_org_settings?org_id=eq.${encodeURIComponent(org)}`, next); if (r.error) return { ok: false, errors: [r.error] }; }
  else { const r = await supabaseInsert("desk_org_settings", [{ org_id: org, ...next }], env.supabaseUrl, env.supabaseKey); if (!r.ok) return { ok: false, errors: [r.error || "insert failed"] }; }
  return { ok: true, settings: publicSettings(await getOrgSettings(env, org)) };
}
