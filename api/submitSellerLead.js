import { withTracking, track } from "../lib/track/log.js";
import { recordJourneyEvent, journeyVehicle } from "../lib/_journey.js";
import { sendLeadNotification, sendAdditionalDetails, safePriorSaleUrl } from "../lib/_email.js";
import { checkCeiling, leadEmailCeiling } from "../lib/_ceilings.js";
import crypto from "node:crypto";
import { cors as gasCors } from "../lib/_cors.js";
import { failBody } from "../lib/_fail.js";

// HARDENING (Oct 21 2026, Lane D, Sam's job D, docs/lane-security.md F-03). The public lead form stores a row and emails
// a real PowerSeller from our address, so: a ceiling per device, address and email (lib/_ceilings.js, crew exempt); a
// honeypot field (hp) that a person never fills; an unguessable reference; the add-details step only for a stored lead
// whose email matches, sent to the partner stored on that lead; the partner email built from the stored, validated
// row; a prior-sale link only on an allowed auction host (lib/_email.js safePriorSaleUrl); CORS for goasksam.com only;
// a request body capped at 20 KB. A real seller's path is unchanged: submit, the roster check, the partner email
// (feedback@ BCC), the confirmation and its reference, then add-details.
const CALM_LEAD = "Lots of requests from here just now. Give it a few minutes and try again.";
const MAX_BODY = 20000;
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I
const isEmail = e => e.length <= 254 && /^[^\s@<>"'(),;:]{1,64}@[^\s@<>"'(),;:]{1,190}\.[A-Za-z]{2,24}$/.test(e);
// A stored or emailed field: trimmed, control characters out, length capped.
const clean = (v, max = 120) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
// A partner slug as the roster stores it; it only ever goes URL-encoded into a lookup, so any real slug passes.
const slugOk = v => (/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(v || "")) ? String(v) : null);

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

// One CORS helper (lib/_cors.js, security F-06): goasksam.com, www and this project's previews only, as Lane D's rule.
function setCors(req, res) { gasCors(req, res, { methods: "POST, OPTIONS", headers: "Content-Type" }); }

function asText(value) {
  return String(value || "").trim();
}

// GAS- plus 12 random characters (about 60 bits), from crypto, never Math.random: a reference cannot be guessed.
function makeReference() {
  const b = crypto.randomBytes(12);
  return "GAS-" + Array.from(b, x => REF_ALPHABET[x % REF_ALPHABET.length]).join("");
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
  let refTries = 0;
  for (let tries = 0; tries < 6; tries++) {
    try {
      return await insertLead(attempt, supabaseUrl, supabaseKey);
    } catch (err) {
      // A duplicate reference (vanishingly rare at 60 bits): a fresh one, at most twice.
      if (/duplicate key|unique/i.test(String(err.message || "")) && /reference/i.test(String(err.message || "")) && refTries++ < 2) { attempt.reference = makeReference(); continue; }
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
  const env = { supabaseUrl, supabaseKey };
  const { seller = {}, vin: vinRaw, note: noteRaw, reference } = req.body || {};
  const email = clean(seller.email, 254).toLowerCase();
  const vin = clean(vinRaw, 20).replace(/[^A-Za-z0-9]/g, "").slice(0, 17);
  const note = clean(noteRaw, 2000);
  const ref = clean(reference, 20);
  if (!isEmail(email)) return res.status(400).json({ error: "Valid email is required" });
  if (!vin && !note) return res.status(400).json({ error: "Nothing to send" });
  if (!/^GAS-[A-Z0-9]{5,12}$/.test(ref)) return res.status(404).json({ error: "We couldn't find that request." });
  const lim = await checkCeiling(env, req, "seller_lead_details", { tool: "sell" });
  if (!lim.ok) return res.status(429).json({ error: CALM_LEAD });

  // Only a stored lead with this reference AND this seller's email (F-03): a guessed reference does nothing.
  let lead = null;
  try {
    const cur = await fetch(`${supabaseUrl}/rest/v1/seller_leads?reference=eq.${encodeURIComponent(ref)}&select=reference,seller_email,car_raw,notes,vin,decision_summary&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    const rows = cur.ok ? await cur.json().catch(() => []) : [];
    lead = Array.isArray(rows) ? rows[0] : null;
  } catch { lead = null; }
  if (!lead || String(lead.seller_email || "").trim().toLowerCase() !== email) return res.status(404).json({ error: "We couldn't find that request." });

  // Persist onto that lead: the note appended, the VIN set. The email is the point; a persist failure never blocks it.
  try {
    const patch = {};
    if (vin) patch.vin = vin;
    if (note) patch.notes = [lead.notes, `[Added by seller] ${note}`].filter(Boolean).join("\n").slice(0, 6000);
    if (Object.keys(patch).length) {
      await fetch(`${supabaseUrl}/rest/v1/seller_leads?reference=eq.${encodeURIComponent(ref)}`, {
        method: "PATCH",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(patch)
      });
    }
  } catch (e) { console.error("additionalDetails persist failed (non-fatal):", e.message, "ref", ref); }

  // Follow-up email to the partner STORED on the lead (never one named in the request) + feedback@ BCC. A lead from
  // before the slug was stored goes to feedback@ only.
  try {
    const slug = slugOk(lead.decision_summary && lead.decision_summary.partnerSlug);
    const target = slug ? await partnerNotifyTarget(slug, supabaseUrl, supabaseKey) : { email: null, name: null };
    const notify = await sendAdditionalDetails({
      partnerEmail: target.email,
      partnerName: target.name || null,
      reference: ref,
      seller: { email },
      car: clean(lead.car_raw, 200) || "the car",
      vin: vin || null,
      note: note || null
    });
    if (!notify.ok && !notify.skipped) console.error("additionalDetails email failed:", notify.error || notify.status, "ref", ref);
  } catch (e) { console.error("additionalDetails email threw (non-fatal):", e.message); }

  return res.status(200).json({ status: "sent", reference: ref });
}

async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });
  let size = 0; try { size = JSON.stringify(req.body || {}).length; } catch { size = MAX_BODY + 1; }
  if (size > MAX_BODY) return res.status(413).json({ error: "That request is too large." });
  // Honeypot (hp): a person never fills it. A filled one gets a success-shaped reply; nothing is stored or sent.
  if (clean(req.body && req.body.hp, 200)) return res.status(200).json({ status: req.body.action === "additionalDetails" ? "sent" : "submitted", reference: makeReference() });

  // Second-touch: optional VIN + note the seller adds AFTER the lead already sent. Never
  // touches the original lead insert; persists the extras onto the existing row (by
  // reference) and fires a follow-up email to the partner + feedback@ BCC.
  if (req.body && req.body.action === "additionalDetails") {
    return await handleAdditionalDetails(req, res, supabaseUrl, supabaseKey);
  }

  const { seller = {}, car = {}, choice = {}, decision = {} } = req.body || {};
  const email = clean(seller.email, 254);
  if (!isEmail(email)) return res.status(400).json({ error: "Valid email is required" });
  const env = { supabaseUrl, supabaseKey };
  const lim = await checkCeiling(env, req, "seller_lead", { tool: "sell" });
  if (!lim.ok) return res.status(429).json({ error: CALM_LEAD });
  const limE = await leadEmailCeiling(env, req, email);
  if (!limE.ok) return res.status(429).json({ error: CALM_LEAD });

  // Partner re-validation on submit (scenario 7): a PowerSeller lead must go to a partner
  // still on the ACTIVE roster. A live card's partner passes; a re-opened historical card
  // can reference a since-removed partner - never record a lead to one. Fail OPEN on an
  // infra error so a transient DB blip never blocks a legitimate live lead.
  const isPowerSellerLead = asText(choice.destinationType).toLowerCase() === "powerseller";
  const partnerSlug = isPowerSellerLead ? slugOk(choice.powerSeller && (choice.powerSeller.slug || choice.powerSeller.id)) : null;
  if (isPowerSellerLead) {
    const slug = partnerSlug;
    const roster = await partnerRosterStatus(slug, supabaseUrl, supabaseKey);
    if (!roster.active) {
      return res.status(200).json({ status: "partner_unavailable", partner: roster.name || clean(choice.destination, 80) || "That specialist" });
    }
  }

  const reference = makeReference();
  const decisionSummary = {
    ...decision,
    partnerSlug,
    carContext: {
      raw: clean(car.raw, 200),
      vin: clean(car.vin) || null,
      region: clean(car.region) || null,
      state: clean(car.state) || null,
      mileage: clean(car.mileage) || null,
      condition: clean(car.condition) || null,
      serviceRecords: clean(car.serviceRecords) || null,
      title: clean(car.title) || null,
      targetPrice: clean(car.targetPrice) || null,
      timeline: clean(car.timeline) || null,
      involvement: clean(car.involvement) || null,
      notes: clean(car.notes, 2000) || null
    }
  };
  const row = {
    reference,
    submitted_at: new Date().toISOString(),
    lead_status: "submitted",
    car_raw: clean(car.raw, 200),
    vin: clean(car.vin) || null,
    car_region: clean(car.region) || null,
    car_state: clean(car.state) || null,
    mileage: clean(car.mileage) || null,
    condition: clean(car.condition) || null,
    service_records: clean(car.serviceRecords) || null,
    title_status: clean(car.title) || null,
    target_price: clean(car.targetPrice) || null,
    timeline: clean(car.timeline) || null,
    involvement_preference: clean(car.involvement) || null,
    notes: clean(car.notes, 2000) || null,
    chosen_destination: clean(choice.destination),
    chosen_destination_type: clean(choice.destinationType) || null,
    chosen_option_key: clean(choice.optionKey) || null,
    seller_email: email,
    seller_phone: clean(seller.phone) || null,
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
        const target = await partnerNotifyTarget(partnerSlug, supabaseUrl, supabaseKey);
        const notify = await sendLeadNotification({
          partnerEmail: target.email,
          partnerName: target.name || row.chosen_destination || null,
          reference: inserted?.reference || reference,
          // Built from the stored, validated row (F-03), never from the raw request.
          seller: { email: row.seller_email },
          car: {
            raw: row.car_raw, vin: row.vin || "", region: row.car_region || "", state: row.car_state || "",
            mileage: row.mileage || "", condition: row.condition || "",
            serviceRecords: row.service_records || "", title: row.title_status || "",
            targetPrice: row.target_price || "", timeline: row.timeline || "", notes: row.notes || ""
          },
          choice: { destination: row.chosen_destination },
          // Sam's platform recommendation the seller was shown, so the partner walks in
          // knowing which platform was named. From the decision payload sent at lead time
          // (decision.decision.recommendedPath); empty when no platform rec existed.
          recommendedPath: (v => (/^[A-Za-z0-9 &'.-]{1,60}$/.test(v) ? v : null))(clean(decision.decision && decision.decision.recommendedPath, 60)),
          // VIN feature (4c): the exact car's prior auction URL from the decision
          // payload (attached by sellerDecision only when the VIN matched). Null
          // otherwise, so ordinary leads are unchanged.
          priorSaleUrl: safePriorSaleUrl(decision.vinArchiveMatch && decision.vinArchiveMatch.url)
        });
        if (!notify.ok && !notify.skipped) console.error("lead notification email failed:", notify.error || notify.status, "ref", inserted?.reference || reference);
      }
    } catch (e) { console.error("lead notification threw (non-fatal):", e.message); }
    track(req, "introduction_requested", { destination_type: asText(choice.destinationType).toLowerCase() || undefined }, { product: "sell", surface: "sell_page" });
    return res.status(200).json({
      status: "submitted",
      reference: inserted?.reference || reference,
      lead: inserted || row
    });
  } catch (err) {
    return res.status(500).json(failBody("submitSellerLead", err));
  }
}

// Analytics (docs/analytics-events.md): an error event when this route throws or answers 5xx.
export default withTracking("/api/submitSellerLead", handler, "sell");
