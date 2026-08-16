// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
import { callOldCarsData } from "../lib/_ocd.js";
import { TESTER_CODE, testerCodeExpired, testerCookieMaxAge } from "../lib/_tester.js";

export default async function handler(req, res) {
  const q = req.query || {};
  // Crew-gated journey verification read (temporary, removed with the curtain).
  // Reads the RLS-locked analytics tables via the service role so Phase-1 dedup +
  // anon->signed-in continuity can be verified before USAGE_DASHBOARD_KEY is set.
  if (q.jread === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) return res.status(500).json({ error: "supabase not configured" });
    const read = (path) => fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then(r => r.ok ? r.json() : null).catch(() => null);
    const anon = String(q.anon || "").slice(0, 64), jid = String(q.jid || "").slice(0, 64);
    const jFilter = jid ? `journey_id=eq.${encodeURIComponent(jid)}&` : anon ? `anon_id=eq.${encodeURIComponent(anon)}&` : "";
    const journeys = await read(`journeys?${jFilter}select=journey_id,anon_id,user_id,stage,vehicle_make,vehicle_model,vehicle_year,rec_platform,rec_powerseller,last_activity_at&order=created_at.desc&limit=20`);
    const events = await read(`journey_events?${jFilter}select=journey_id,event_type,dedup_key,platform_id,powerseller_id,occurred_at&order=occurred_at.asc&limit=200`);
    return res.status(200).json({ journeys: journeys || [], events: events || [], journeyCount: (journeys || []).length, eventCount: (events || []).length });
  }
  // Crew-gated Phase-3 manual-update verification harness (temporary, removed with
  // the curtain). Exercises the REAL journey_manual_update RPC + audit capture end
  // to end against prod on a throwaway internal-tier test journey, then purges it.
  // Proves: allowlist enforcement, old->new capture, who/what/when auditing.
  if (q.jmanual === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) return res.status(500).json({ error: "supabase not configured" });
    const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const rpc = (name, payload) => fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: H, body: JSON.stringify(payload) }).then(r => r.json()).catch(e => ({ error: e.message }));
    const read = (path) => fetch(`${url}/rest/v1/${path}`, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null);
    const del = (path) => fetch(`${url}/rest/v1/${path}`, { method: "DELETE", headers: H }).then(r => r.status).catch(() => -1);
    const jid = globalThis.crypto.randomUUID();
    const who = "verify-harness";
    await rpc("record_journey_event", { p_journey_id: jid, p_event_type: "recommendation_completed", p_anon_id: who, p_metadata: { tier: "internal" }, p_vehicle: { make: "Test", model: "Harness", year: "2000" }, p_snapshot: { rec_status: "completed", rec_platform: "bringatrailer" } });
    const u1 = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "sale_status", p_value: "listed", p_changed_by: who, p_note: "step1 set" });
    const u2 = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "sale_status", p_value: "sold", p_changed_by: who, p_note: "step2 change" });
    const u3 = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "sale_price", p_value: "12345", p_changed_by: who });        // numeric
    const u4 = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "sold_at", p_value: "2026-08-10", p_changed_by: who });        // timestamptz
    const u5 = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "listing_date", p_value: "2026-08-01", p_changed_by: who });   // date
    const uBad = await rpc("journey_manual_update", { p_journey_id: jid, p_field: "rec_platform", p_value: "should_be_rejected", p_changed_by: who });
    const audit = await read(`journey_audit?journey_id=eq.${jid}&select=changed_by,field,old_value,new_value,changed_at,note&order=changed_at.asc`);
    const journey = await read(`journeys?journey_id=eq.${jid}&select=sale_status,sale_price,sold_at,listing_date,rec_platform,updated_at`);
    let cleaned = null;
    if (q.cleanup !== "0") cleaned = { audit: await del(`journey_audit?journey_id=eq.${jid}`), events: await del(`journey_events?journey_id=eq.${jid}`), journey: await del(`journeys?journey_id=eq.${jid}`) };
    return res.status(200).json({ jid, updates: { u1, u2, u3, u4, u5, disallowed: uBad }, audit: audit || [], journey: (journey || [])[0] || null, cleaned });
  }
  // Read-only out-of-scope calibration probe (crew cookie required). Folded in
  // here to stay under the Hobby-plan 12-function cap. Returns per make+model the
  // all-time vehicle_market_records count (our archive) and the OldCarsData
  // all-time SOLD total (source). One metered OCD request per call. Temporary,
  // removed with the curtain.
  if (q.probe === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const make = String(q.make || "").trim(), model = String(q.model || "").trim();
    if (!make || !model) return res.status(400).json({ error: "make and model required" });
    const out = { make, model, vmrAllTime: null, ocdAllTime: null, ocdMeta: null, error: null };
    try {
      const url = `${process.env.SUPABASE_URL}/rest/v1/vehicle_market_records?make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent("*" + model + "*")}&select=id`;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" } });
      out.vmrAllTime = Number((r.headers.get("content-range") || "*/0").split("/")[1] || 0);
    } catch (e) { out.error = "vmr:" + e.message; }
    if (process.env.OLDCARSDATA_API_KEY) {
      try {
        const ocd = await callOldCarsData("/auctions", { make, model, status: "sold", sort: "date", direction: "desc", page: 1, limit: 1 }, process.env.OLDCARSDATA_API_KEY);
        out.ocdMeta = ocd.meta || null;
        out.ocdAllTime = (ocd.meta && (ocd.meta.total ?? ocd.meta.total_results ?? ocd.meta.count)) ?? (ocd.meta ? { total_pages: ocd.meta.total_pages } : null);
      } catch (e) { out.error = (out.error ? out.error + "; " : "") + "ocd:" + e.message; }
    }
    return res.status(200).json(out);
  }
  const rawTo = String(q.to || "/");
  const to = /^\/(?!\/)/.test(rawTo) ? rawTo : "/"; // same-origin path only, never an open redirect
  // TESTER cohort redemption: ?tcode=<TESTER_CODE>. Sets a gas_tester cookie whose
  // Max-Age ends at the hard expiry, and NEVER issues once the code has expired
  // (the search gate + curtain seal also re-check expiry, so this is one of two
  // enforcement points). Falls through to the curtain on a bad or expired code.
  const tcode = String(q.tcode || "");
  if (tcode) {
    if (tcode === TESTER_CODE && !testerCodeExpired()) {
      const maxAge = testerCookieMaxAge();
      res.setHeader("Set-Cookie", `gas_tester=ok; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`);
      res.setHeader("Location", to);
      res.status(302).end();
      return;
    }
    res.setHeader("Location", "/"); // wrong or expired tester code -> curtain
    res.status(302).end();
    return;
  }
  const code = String(q.code || "");
  const expected = process.env.CURTAIN_CREW_CODE || "";
  if (expected && code === expected) {
    // 1-year, path-wide, JS-readable (the inline curtain script reads it), Secure.
    res.setHeader("Set-Cookie", "gas_crew=ok; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    res.setHeader("Location", to);
    res.status(302).end();
    return;
  }
  res.setHeader("Location", "/");
  res.status(302).end();
}
