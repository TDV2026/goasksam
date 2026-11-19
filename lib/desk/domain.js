// Sam Desk Valuations: sending-address domain verification (Lane S, Nov 4 2026). Spec: "sent through the org's own email provider
// as them". The org's sending address may be used ONLY after its domain is verified with the email provider (Resend, the provider
// this product already sends through). Verified is the provider's word, never ours: we store what Resend reports and nothing else.
// The DNS records the org's admin must publish come back from the provider and are shown as given.
import { supabasePatch } from "../_supabase.js";
import { getOrgSettings, FREE_MAIL } from "./orgSettings.js";

const RESEND = "https://api.resend.com";
const authHeaders = key => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

function statusFromProvider(s) {
  const v = String(s || "").toLowerCase();
  if (v === "verified") return "verified";
  if (v === "failed" || v === "temporary_failure") return "failed";
  return "pending";   // not_started, pending, anything unknown: not verified
}

// Ask the provider to register the org's sending domain and keep the records it wants published.
export async function startDomainVerification(env, org, { apiKey = process.env.RESEND_API_KEY, fetchFn = globalThis.fetch } = {}) {
  if (!apiKey) return { ok: false, error: "no email provider key is configured" };
  const s = await getOrgSettings(env, org);
  if (!s) return { ok: false, error: "could not read the org's settings" };
  if (!s.sending_domain) return { ok: false, error: "set a sending address first" };
  if (FREE_MAIL.includes(String(s.sending_domain).toLowerCase())) return { ok: false, error: "a free mail domain cannot be verified" };
  const res = await fetchFn(`${RESEND}/domains`, { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify({ name: s.sending_domain }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.id) return { ok: false, error: `provider refused the domain (${res.status})` };
  const status = statusFromProvider(j.status);
  const r = await supabasePatch(env, `desk_org_settings?org_id=eq.${encodeURIComponent(org)}`, { sending_domain_provider_id: j.id, sending_domain_records: j.records || null, sending_domain_status: status, sending_domain_verified_at: status === "verified" ? new Date().toISOString() : null });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, status, records: j.records || [] };
}

// Re-check with the provider. Only the provider's "verified" makes the address usable.
export async function checkDomainVerification(env, org, { apiKey = process.env.RESEND_API_KEY, fetchFn = globalThis.fetch } = {}) {
  if (!apiKey) return { ok: false, error: "no email provider key is configured" };
  const s = await getOrgSettings(env, org);
  if (!s || !s.sending_domain_provider_id) return { ok: false, error: "start verification first" };
  await fetchFn(`${RESEND}/domains/${encodeURIComponent(s.sending_domain_provider_id)}/verify`, { method: "POST", headers: authHeaders(apiKey) }).catch(() => null);
  const res = await fetchFn(`${RESEND}/domains/${encodeURIComponent(s.sending_domain_provider_id)}`, { headers: authHeaders(apiKey) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) return { ok: false, error: `provider check failed (${res.status})` };
  // The provider must be talking about the domain we asked about; a mismatched answer never verifies anything.
  if (String(j.name || "").toLowerCase() !== String(s.sending_domain).toLowerCase()) return { ok: false, error: "provider answered for a different domain" };
  const status = statusFromProvider(j.status);
  const r = await supabasePatch(env, `desk_org_settings?org_id=eq.${encodeURIComponent(org)}`, { sending_domain_status: status, sending_domain_records: j.records || s.sending_domain_records || null, sending_domain_verified_at: status === "verified" ? new Date().toISOString() : null });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, status, records: j.records || [] };
}
