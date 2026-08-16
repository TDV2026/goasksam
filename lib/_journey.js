// Business analytics: seller-journey event ingestion (docs/supabase-journeys-schema.sql).
// BEST-EFFORT and NON-BLOCKING: a failure (including the RPC not existing yet, before
// the migration is run) never affects the seller request. Server-side only; the
// service-role key is required for the RPC (RLS-locked tables).
import { supabaseEnv } from "./_supabase.js";

const RPC = "record_journey_event";

// Client-emittable event allowlist. The client can emit only impression/entry events;
// it can NEVER emit downstream/manual outcomes (sale, revenue, consignment, etc.),
// which are server- or admin-only. Enforced in api/funnel.js.
export const CLIENT_JOURNEY_EVENTS = new Set([
  "seller_journey_started", "vehicle_identified", "seller_questions_completed",
  "platform_cta_viewed", "powerseller_card_viewed", "powerseller_intro_clicked"
]);

export async function recordJourneyEvent(env, {
  journeyId, eventType, anonId = null, userId = null,
  platformId = null, powersellerId = null, dedupKey = null,
  metadata = {}, vehicle = null, snapshot = null, occurredAt = null
} = {}) {
  env = env || supabaseEnv();
  if (!env || !journeyId || !eventType) return { ok: false, reason: "missing" };
  // journey_id is a uuid column; a malformed id would error, so guard the shape.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(journeyId))) return { ok: false, reason: "bad_journey_id" };
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_journey_id: journeyId, p_event_type: eventType,
        p_anon_id: anonId, p_user_id: userId,
        p_platform_id: platformId, p_powerseller_id: powersellerId,
        p_dedup_key: dedupKey, p_metadata: metadata || {},
        p_vehicle: vehicle, p_snapshot: snapshot,
        p_occurred_at: occurredAt || new Date().toISOString()
      })
    });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json().catch(() => ({ ok: true }));
  } catch { return { ok: false, reason: "threw" }; }
}

// Admin-only manual downstream update (Phase 3). Calls the audited
// journey_manual_update RPC (field allowlist + who/what/old/new/when audit row
// enforced in SQL). Service-role only; returns the RPC's {ok, field, old, new}
// or {ok:false, ...} so the caller can surface the outcome. One field per call.
export async function journeyManualUpdate(env, { journeyId, field, value, changedBy, note = null } = {}) {
  env = env || supabaseEnv();
  if (!env || !journeyId || !field || !changedBy) return { ok: false, reason: "missing" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(journeyId))) return { ok: false, reason: "bad_journey_id" };
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/journey_manual_update`, {
      method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_journey_id: journeyId, p_field: field, p_value: value == null ? "" : String(value), p_changed_by: String(changedBy), p_note: note || null })
    });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json().catch(() => ({ ok: true }));
  } catch { return { ok: false, reason: "threw" }; }
}

// Normalize a resolved vehicle (+ seller criteria) into the RPC's p_vehicle shape.
export function journeyVehicle(vehicle, criteria) {
  const v = vehicle || {};
  const c = criteria || {};
  const attrs = {
    condition: c.condition || null, records: c.serviceRecords || c.records || null,
    title: c.title || c.titleStatus || null, price: c.targetPrice || null,
    timeline: c.timeline || null, preference: c.sellerPreference || c.involvement || null,
    modified: c.modified || null
  };
  const hasAttrs = Object.values(attrs).some(Boolean);
  return {
    year: v.year != null ? String(v.year) : null,
    make: v.make || null, model: v.model || null, trim: v.trim || null,
    generation: (v.generation && v.generation.code) || v.generationCode || null,
    location: c.state || c.region || v.location || null,
    mileage: c.mileage || null,
    attrs: hasAttrs ? attrs : null
  };
}
