// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
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
  // (Removed at launch, Aug 2026: the crew-gated q.jread journey-verification read
  // and the q.probe archive-vs-OCD calibration probe. Both were temporary diagnostic
  // paths for pre-launch verification; the permanent bhs auto-signin below stays.)
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
  // GUEST tier redemption: ?guest=<CODE>. Validated against the GUEST_CODE env var; sets a
  // JS-readable gas_guest cookie so the frontend can nudge the visitor to sign in and claim
  // their 30. On the normal email-OTP sign-in, /api/account tiers the account "guest30" (a
  // FIXED LIFETIME allowance of 30 searches, fully attributed - not anonymous like tester).
  // Falls through to home on a bad code. Distinct from tester (anonymous/IP, dashboard-excluded).
  const guest = String(q.guest || "");
  if (guest) {
    const expectedGuest = process.env.GUEST_CODE || "";
    if (expectedGuest && guest === expectedGuest) {
      res.setHeader("Set-Cookie", `gas_guest=ok; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax; Secure`);
      res.setHeader("Location", to);
      res.status(302).end();
      return;
    }
    res.setHeader("Location", "/");
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
