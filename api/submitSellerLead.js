import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";
import { sendLeadNotification, sendAdditionalDetails } from "../lib/_email.js";

// Partner destination email + display name for a lead notification, looked up
// server-side by slug (never exposed to the browser). Best-effort: a missing
// column or row returns nulls so the notification still BCCs feedback@.
// Roster status for a partner slug: is it present AND active? A missing row (removed
// partner) or active=false is "not available". Fails OPEN (active:true) on any infra
// error, so a transient lookup failure never blocks a genuine live lead.
async function partnerRosterStatus(slug, supabaseUrl, supabaseKey) {
  if (!slug) return { active: false, name: null };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/partners?slug=eq.${encodeURIComponent(slug)}&select=active,display_name,name&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) return { active: true, name: null };
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { active: false, name: null };
    return { active: row.active !== false, name: row.display_name || row.name || null };
  } catch { return { active: true, name: null }; }
}

async function partnerNotifyTarget(slug, supabaseUrl, supabaseKey) {
  if (!slug) return { email: null, name: null };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/partners?slug=eq.${encodeURIComponent(slug)}&select=notification_email,display_name,name&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) return { email: null, name: null };
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return { email: row?.notification_email || null, name: row?.display_name || row?.name || null };
  } catch { return { email: null, name: null }; }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function asText(value) {
  return String(value || "").trim();
}

function makeReference() {
  return `GAS-${Math.floor(10000 + Math.random() * 90000)}`;
}

async function insertLead(row, supabaseUrl, supabaseKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/seller_leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || `seller_leads insert failed: ${res.status}`);
  }
  return Array.isArray(data) ? data[0] : data;
}

// The live table may lack some optional columns. PostgREST reports one unknown
// column per attempt, so strip whichever it names and retry; the full context
// is preserved in decision_summary regardless. Never drop the lead over a
// missing optional column.
async function insertLeadWithFallback(row, supabaseUrl, supabaseKey) {
  const attempt = { ...row };
  for (let tries = 0; tries < 6; tries++) {
    try {
      return await insertLead(attempt, supabaseUrl, supabaseKey);
    } catch (err) {
      const missing = String(err.message || "").match(/find the '([a-zA-Z0-9_]+)' column/)?.[1];
      if (!missing || !(missing in attempt) || missing === "seller_email" || missing === "reference") throw err;
      delete attempt[missing];
    }
  }
  return insertLead(attempt, supabaseUrl, supabaseKey);
}

// Second-touch handler: persist VIN/note onto the existing lead row (by reference) and
// send the follow-up email. Requires at least one of VIN/note. The email is the point;
// a persist failure never blocks it, and vice versa.
async function handleAdditionalDetails(req, res, supabaseUrl, supabaseKey) {
  const { seller = {}, car = {}, vin: vinRaw, note: noteRaw, partnerSlug, reference } = req.body || {};
  const email = asText(seller.email);
  const vin = asText(vinRaw);
  const note = asText(noteRaw);
  const ref = asText(reference);
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email is required" });
  if (!vin && !note) return res.status(400).json({ error: "Nothing to send" });

  // Persist onto the existing lead row (best-effort). Append the note to any existing
  // notes rather than overwriting; set the VIN if provided.
  if (ref) {
    try {
      const cur = await fetch(`${supabaseUrl}/rest/v1/seller_leads?reference=eq.${encodeURIComponent(ref)}&select=notes,vin`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
      const rows = cur.ok ? await cur.json().catch(() => []) : [];
      const existing = Array.isArray(rows) ? rows[0] : null;
      const patch = {};
      if (vin) patch.vin = vin;
      if (note) patch.notes = [existing && existing.notes, `[Added by seller] ${note}`].filter(Boolean).join("\n");
      if (Object.keys(patch).length) {
        await fetch(`${supabaseUrl}/rest/v1/seller_leads?reference=eq.${encodeURIComponent(ref)}`, {
          method: "PATCH",
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(patch)
        });
      }
    } catch (e) { console.error("additionalDetails persist failed (non-fatal):", e.message, "ref", ref); }
  }

  // Follow-up email to the partner + feedback@ BCC.
  try {
    const target = await partnerNotifyTarget(asText(partnerSlug), supabaseUrl, supabaseKey);
    const notify = await sendAdditionalDetails({
      partnerEmail: target.email,
      partnerName: target.name || null,
      reference: ref || null,
      seller: { email },
      car: asText(car.raw) || "the car",
      vin: vin || null,
      note: note || null
    });
    if (!notify.ok && !notify.skipped) console.error("additionalDetails email failed:", notify.error || notify.status, "ref", ref);
  } catch (e) { console.error("additionalDetails email threw (non-fatal):", e.message); }

  return res.status(200).json({ status: "sent", reference: ref || null });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  // Second-touch: optional VIN + note the seller adds AFTER the lead already sent. Never
  // touches the original lead insert; persists the extras onto the existing row (by
  // reference) and fires a follow-up email to the partner + feedback@ BCC.
  if (req.body && req.body.action === "additionalDetails") {
    return await handleAdditionalDetails(req, res, supabaseUrl, supabaseKey);
  }

  const { seller = {}, car = {}, choice = {}, decision = {} } = req.body || {};
  const email = asText(seller.email);
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email is required" });

  // Partner re-validation on submit (scenario 7): a PowerSeller lead must go to a partner
  // still on the ACTIVE roster. A live card's partner passes; a re-opened historical card
  // can reference a since-removed partner - never record a lead to one. Fail OPEN on an
  // infra error so a transient DB blip never blocks a legitimate live lead.
  const isPowerSellerLead = asText(choice.destinationType).toLowerCase() === "powerseller";
  if (isPowerSellerLead) {
    const slug = (choice.powerSeller && (choice.powerSeller.slug || choice.powerSeller.id)) || null;
    const roster = await partnerRosterStatus(slug, supabaseUrl, supabaseKey);
    if (!roster.active) {
      return res.status(200).json({ status: "partner_unavailable", partner: roster.name || asText(choice.destination) || "That specialist" });
    }
  }

  const reference = makeReference();
  const decisionSummary = {
    ...decision,
    carContext: {
      raw: asText(car.raw),
      vin: asText(car.vin) || null,
      region: asText(car.region) || null,
      state: asText(car.state) || null,
      mileage: asText(car.mileage) || null,
      condition: asText(car.condition) || null,
      serviceRecords: asText(car.serviceRecords) || null,
      title: asText(car.title) || null,
      targetPrice: asText(car.targetPrice) || null,
      timeline: asText(car.timeline) || null,
      involvement: asText(car.involvement) || null,
      notes: asText(car.notes) || null
    }
  };
  const row = {
    reference,
    submitted_at: new Date().toISOString(),
    lead_status: "submitted",
    car_raw: asText(car.raw),
    vin: asText(car.vin) || null,
    car_region: asText(car.region) || null,
    car_state: asText(car.state) || null,
    mileage: asText(car.mileage) || null,
    condition: asText(car.condition) || null,
    service_records: asText(car.serviceRecords) || null,
    title_status: asText(car.title) || null,
    target_price: asText(car.targetPrice) || null,
    timeline: asText(car.timeline) || null,
    involvement_preference: asText(car.involvement) || null,
    notes: asText(car.notes) || null,
    chosen_destination: asText(choice.destination),
    chosen_destination_type: asText(choice.destinationType) || null,
    chosen_option_key: asText(choice.optionKey) || null,
    seller_email: email,
    seller_phone: asText(seller.phone) || null,
    decision_summary: decisionSummary
  };

  try {
    const inserted = await insertLeadWithFallback(row, supabaseUrl, supabaseKey);
    // Business journey: a PowerSeller introduction request. Deduped by the unique
    // lead reference. Best-effort; a failure never affects the lead confirmation.
    try {
      const journeyId = asText(req.body?.journeyId);
      const isPs = asText(choice.destinationType).toLowerCase() === "powerseller";
      if (journeyId && isPs) {
        const partner = choice.powerSeller || {};
        await recordJourneyEvent({ supabaseUrl, supabaseKey }, {
          journeyId, eventType: "powerseller_intro_requested",
          anonId: asText(req.body?.anonId) || null,
          powersellerId: partner.slug || asText(choice.destination) || null,
          dedupKey: inserted?.reference || reference,
          vehicle: journeyVehicle(decision.vehicle || { make: null }, { state: asText(car.state), region: asText(car.region), targetPrice: asText(car.targetPrice) }),
          metadata: { reference: inserted?.reference || reference, destination: asText(choice.destination) }
        });
      }
    } catch { /* analytics never blocks the lead */ }
    // Partner notification email (Aug 2026, product decision): notify the PowerSeller
    // partner and BCC feedback@goasksam.com on EVERY send, so a real lead is never
    // invisible even if the journey/dashboard layer fails again. Best-effort and fully
    // non-blocking: the lead is already persisted; any email issue is swallowed and
    // logged. Fires only for PowerSeller destinations (the ones a partner receives).
    try {
      const isPs = asText(choice.destinationType).toLowerCase() === "powerseller";
      if (isPs) {
        const partner = choice.powerSeller || {};
        const slug = partner.slug || partner.id || null;
        const target = await partnerNotifyTarget(slug, supabaseUrl, supabaseKey);
        const notify = await sendLeadNotification({
          partnerEmail: target.email,
          partnerName: target.name || asText(choice.destination) || null,
          reference: inserted?.reference || reference,
          seller: { email },
          car: {
            raw: asText(car.raw), region: asText(car.region), state: asText(car.state),
            mileage: asText(car.mileage), condition: asText(car.condition),
            serviceRecords: asText(car.serviceRecords), title: asText(car.title),
            targetPrice: asText(car.targetPrice), timeline: asText(car.timeline), notes: asText(car.notes)
          },
          choice: { destination: asText(choice.destination) },
          // Sam's platform recommendation the seller was shown, so the partner walks in
          // knowing which platform was named. From the decision payload sent at lead time
          // (decision.decision.recommendedPath); empty when no platform rec existed.
          recommendedPath: asText(decision.decision && decision.decision.recommendedPath) || null,
          // VIN feature (4c): the exact car's prior auction URL from the decision
          // payload (attached by sellerDecision only when the VIN matched). Null
          // otherwise, so ordinary leads are unchanged.
          priorSaleUrl: asText(decision.vinArchiveMatch && decision.vinArchiveMatch.url) || null
        });
        if (!notify.ok && !notify.skipped) console.error("lead notification email failed:", notify.error || notify.status, "ref", inserted?.reference || reference);
      }
    } catch (e) { console.error("lead notification threw (non-fatal):", e.message); }
    return res.status(200).json({
      status: "submitted",
      reference: inserted?.reference || reference,
      lead: inserted || row
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
