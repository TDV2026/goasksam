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
  // One Box discovery probe (temporary, crew-gated). Answers the two build-gating
  // questions with Supabase-only reads (ZERO OCD/metered cost): (1) photo coverage
  // + a sample of featured_image_url across models for a manual quality spot-check,
  // (2) current billing-period metered usage vs the 10k cap and per-model archive
  // depth so we can size the initial set. Removed after the questions are settled.
  if (q.onebox_probe === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) return res.status(500).json({ error: "supabase not configured" });
    const H = { apikey: key, Authorization: `Bearer ${key}` };
    const read = (path) => fetch(`${url}/rest/v1/${path}`, { headers: H }).then(r => r.ok ? r.json() : null).catch(() => null);
    const count = async (path) => { const r = await fetch(`${url}/rest/v1/${path}`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }).catch(() => null); return r ? Number((r.headers.get("content-range") || "*/0").split("/")[1] || 0) : -1; };
    // (2a) metered usage this billing period (plan resets 2026-08-26; period start 2026-07-26)
    const periodStart = "2026-07-26T00:00:00Z";
    const usage = await read(`app_usage_events?created_at=gte.${periodStart}&select=oldcarsdata_metered_requests&limit=100000`) || [];
    const meteredThisPeriod = usage.reduce((s, e) => s + (Number(e.oldcarsdata_metered_requests) || 0), 0);
    // (2b) archive depth per enthusiast model: total sold-with-price vs with a photo
    const SET = [["Porsche", "911"], ["Porsche", "356"], ["Porsche", "Cayman"], ["Ford", "Mustang"], ["Ford", "Bronco"], ["Chevrolet", "Corvette"], ["Chevrolet", "Camaro"], ["BMW", "M3"], ["BMW", "2002"], ["Mazda", "Miata"], ["Toyota", "Land Cruiser"], ["Toyota", "Supra"], ["Jaguar", "E-Type"], ["Datsun", "240Z"], ["Mercedes-Benz", "SL"], ["Dodge", "Charger"], ["Land Rover", "Defender"], ["Volkswagen", "Beetle"]];
    const depth = [];
    for (const [mk, md] of SET) {
      const base = `make=ilike.${encodeURIComponent(mk)}&model=ilike.${encodeURIComponent("*" + md + "*")}&price=not.is.null`;
      const total = await count(`vehicle_market_records?${base}`);
      const withPhoto = await count(`vehicle_market_records?${base}&raw_record->>featured_image_url=not.is.null`);
      depth.push({ make: mk, model: md, soldWithPrice: total, withPhoto });
    }
    const totalRecords = await count(`vehicle_market_records?select=id`);
    // (1) photo sample across a few models for the manual quality spot-check
    const sampleModels = [["Porsche", "911"], ["Ford", "Mustang"], ["Chevrolet", "Corvette"], ["BMW", "M3"], ["Toyota", "Land Cruiser"], ["Jaguar", "E-Type"], ["Datsun", "240Z"]];
    const photoSample = [];
    for (const [mk, md] of sampleModels) {
      const rows = await read(`vehicle_market_records?make=ilike.${encodeURIComponent(mk)}&model=ilike.${encodeURIComponent("*" + md + "*")}&price=not.is.null&select=make,model,year,price,source,auction_status,image:raw_record->>featured_image_url&order=price.desc&limit=3`) || [];
      for (const r of rows) photoSample.push(r);
    }
    return res.status(200).json({ billingPeriod: { start: periodStart, resets: "2026-08-26", cap: 10000, meteredThisPeriod, remaining: 10000 - meteredThisPeriod }, totalRecords, depth, photoSampleCount: photoSample.length, photoSample });
  }
  // OCD usage trace (temporary, crew-gated): reconciles our internal tally against
  // OCD's authoritative rate-limit headers, breaks metered requests down by the code
  // path that logged them, and fingerprints the PROD key so Sam can match it to the
  // OCD account dashboard. &live=1 spends ONE metered request for a fresh header read.
  if (q.ocd_trace === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) return res.status(500).json({ error: "supabase not configured" });
    const read = (path) => fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then(r => r.ok ? r.json() : null).catch(() => null);
    const since = String(q.since || "2026-07-26T00:00:00Z");
    // our internal tally, broken down by the event_type that logged it
    const rows = await read(`app_usage_events?created_at=gte.${encodeURIComponent(since)}&select=event_type,oldcarsdata_metered_requests&limit=200000`) || [];
    const byType = {}; let internalTotal = 0;
    for (const r of rows) { const m = Number(r.oldcarsdata_metered_requests) || 0; byType[r.event_type] = (byType[r.event_type] || 0) + m; internalTotal += m; }
    // OCD's authoritative headers, as last logged by the prod key (seller_decision.metadata.ocdRateLimit)
    const rl = await read(`app_usage_events?metadata->ocdRateLimit=not.is.null&select=created_at,metadata->ocdRateLimit&order=created_at.desc&limit=5`) || [];
    // prod key fingerprint (masked) so Sam can match it against the 4 dashboard keys
    const apiKey = process.env.OLDCARSDATA_API_KEY || "";
    const fp = apiKey ? { prefix: apiKey.slice(0, 14), len: apiKey.length, set: true } : { set: false };
    // optional fresh live read (1 metered request)
    let live = null;
    if (q.live === "1" && apiKey) {
      try { const ocd = await callOldCarsData("/auctions", { make: "Porsche", model: "911", status: "sold", sort: "date", direction: "desc", page: 1, limit: 1 }, apiKey); live = { rateLimit: ocd.__rateLimit || null, metaTotal: ocd.meta?.total ?? ocd.meta?.total_results ?? null }; }
      catch (e) { live = { error: e.message, rateLimit: e.rateLimit || null }; }
    }
    return res.status(200).json({ since, prodKeyFingerprint: fp, internalTallyTotal: internalTotal, byEventType: byType, latestAuthoritativeHeaders: rl, live });
  }
  // One Box comps pull (temporary, crew-gated): the full sold-with-photo price
  // distribution for one spec so a mockup can show a genuine top/median/bottom
  // spread (not the top-3 outliers). Supabase-only, zero metered cost.
  if (q.onebox_comps === "1") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if ((req.headers.cookie || "").indexOf("gas_crew=ok") === -1) return res.status(403).json({ error: "forbidden (crew only)" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) return res.status(500).json({ error: "supabase not configured" });
    const read = (path) => fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then(r => r.ok ? r.json() : null).catch(() => null);
    const mk = String(q.make || "").trim(), md = String(q.model || "").trim(), ymin = String(q.ymin || "").trim(), ymax = String(q.ymax || "").trim();
    let path = `vehicle_market_records?make=ilike.${encodeURIComponent(mk)}&model=ilike.${encodeURIComponent("*" + md + "*")}&price=not.is.null&raw_record->>featured_image_url=not.is.null&select=year,price,source,auction_status,auction_end_date,raw_title,image:raw_record->>featured_image_url&order=price.desc&limit=400`;
    if (ymin) path += `&year=gte.${encodeURIComponent(ymin)}`;
    if (ymax) path += `&year=lte.${encodeURIComponent(ymax)}`;
    const rows = (await read(path)) || [];
    const prices = rows.map(r => Number(r.price)).filter(Number.isFinite).sort((a, b) => a - b);
    const pct = p => prices.length ? prices[Math.min(prices.length - 1, Math.floor(prices.length * p))] : null;
    return res.status(200).json({ spec: { make: mk, model: md, ymin, ymax }, n: rows.length, min: prices[0] ?? null, p25: pct(0.25), median: pct(0.5), p75: pct(0.75), max: prices[prices.length - 1] ?? null, rows });
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
