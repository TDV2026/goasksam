// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
import { callOldCarsData } from "../lib/_ocd.js";
import { TESTER_CODE, testerCodeExpired, testerCookieMaxAge } from "../lib/_tester.js";
import { beehiivBySubscriberId } from "../lib/_beehiiv.js";

// Mint a real Supabase session for a (Beehiiv-verified) email WITHOUT sending an email:
// admin generate_link (creates the user if new) -> server-side verify of the returned
// token -> access/refresh tokens. Returns null on any failure. The email is authoritative
// (from Beehiiv), never client-supplied.
async function mintSessionForEmail(url, serviceKey, anonKey, email) {
  try {
    const genRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email })
    });
    if (!genRes.ok) return null;
    const gen = await genRes.json().catch(() => ({}));
    const props = (gen && gen.properties) || gen || {};
    const tokenHash = props.hashed_token || gen.hashed_token || null;
    const emailOtp = props.email_otp || gen.email_otp || null;
    const tryVerify = async (body) => {
      const r = await fetch(`${url}/auth/v1/verify`, { method: "POST", headers: { apikey: anonKey || serviceKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return (r.ok && j && j.access_token) ? j : null;
    };
    let sess = null;
    if (tokenHash) sess = await tryVerify({ type: "magiclink", token_hash: tokenHash });
    if (!sess && emailOtp) sess = await tryVerify({ type: "email", email, token: emailOtp });
    if (!sess) return null;
    return { access_token: sess.access_token, refresh_token: sess.refresh_token || "", expires_at: sess.expires_at || "", userId: (sess.user && sess.user.id) || null };
  } catch (e) { return null; }
}

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
  // ===================== BEEHIIV LINK AUTO-SIGNIN (2B+) =====================
  // A TDV email link carries ?bhs={{api_subscription_id}} (a sub_... id). We verify it
  // against Beehiiv server-side (the email is authoritative, never in the URL), mint a
  // real Supabase session with NO email send, lift the curtain for the verified reader,
  // and 302 to the homepage with the tokens in the hash so the EXISTING auth callback
  // signs them in with their tier active. A forwarded link = shared access, like a magic
  // link. Runs BEFORE the crew/tester handling, which stays byte-identical when bhs is absent.
  if (q.bhs) {
    const url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, anonKey = process.env.SUPABASE_ANON_KEY;
    const bail = () => { res.setHeader("Location", "/?bhs_error=1"); res.status(302).end(); };
    if (!url || !serviceKey) return bail();
    // Robustness: accept sub_<uuid> OR a bare <uuid> (prefix sub_).
    let bhs = String(q.bhs).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bhs)) bhs = "sub_" + bhs;
    const sub = await beehiivBySubscriberId(bhs);
    if (!sub || !sub.ok || !sub.active || !sub.email) return bail();
    const session = await mintSessionForEmail(url, serviceKey, anonKey, sub.email);
    if (!session || !session.access_token) return bail();
    // Distinct attribution (server-side, best-effort).
    try {
      await fetch(`${url}/rest/v1/funnel_events`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([{ event: "beehiiv_link_signin", user_id: session.userId || null, dedup_key: `beehiiv_signin:${session.userId || sub.email}` }])
      });
    } catch (e) { /* attribution best-effort */ }
    // Lift the curtain for a verified active subscriber, then hand the tokens to the app.
    res.setHeader("Set-Cookie", `gas_tester=ok; Max-Age=${60 * 60 * 24 * 120}; Path=/; SameSite=Lax; Secure`);
    // Redirect to the CANONICAL /sell path directly (not /), so the browser doesn't take
    // the vercel.json / -> /sell hop, which would carry the token fragment past the auth
    // callback's scrub and leave tokens in the URL. This matches the OAuth/magic-link path.
    const frag = `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&expires_at=${encodeURIComponent(session.expires_at)}&via=beehiiv`;
    res.setHeader("Location", `/sell#${frag}`);
    res.status(302).end();
    return;
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
