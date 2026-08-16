// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
import { callOldCarsData } from "../lib/_ocd.js";
import { TESTER_CODE, testerCodeExpired, testerCookieMaxAge } from "../lib/_tester.js";
import { recordJourneyEvent } from "../lib/_journey.js";
import { supabaseEnv } from "../lib/_supabase.js";

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
  // Crew-gated journey write harness (temporary, removed with the curtain). Exercises
  // the real recordJourneyEvent code path so anon->signed-in continuity can be verified
  // (the production user_id source is validated auth; this only stands in for that).
  if (q.jwrite === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const out = await recordJourneyEvent(supabaseEnv(), {
      journeyId: String(q.jid || ""), eventType: String(q.event || "recommendation_completed"),
      anonId: q.anon ? String(q.anon).slice(0, 64) : null,
      userId: q.user ? String(q.user).slice(0, 64) : null,
      dedupKey: q.dedup ? String(q.dedup).slice(0, 128) : null,
      vehicle: (q.make ? { make: String(q.make), model: String(q.model || ""), year: q.year || null } : null)
    });
    return res.status(200).json(out);
  }
  // Crew-gated one-time purge of verification journeys (temporary). Deletes by anon
  // prefix so the Phase-1 test rows never pollute real analytics.
  if (q.jdelete === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    const pre = String(q.prefix || "a_verify");
    const del = (tbl) => fetch(`${url}/rest/v1/${tbl}?anon_id=like.${encodeURIComponent(pre + "%")}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" } }).then(r => r.status).catch(() => 0);
    const ev = await del("journey_events"); const jn = await del("journeys");
    return res.status(200).json({ deleted_from: { journey_events: ev, journeys: jn }, prefix: pre });
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
