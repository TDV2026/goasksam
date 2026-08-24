// Phase 3 / 2A: validate a Supabase Auth (GoTrue) access token and return
// { userId, email } or null.
//
// LOCAL verification (2026, launch hardening): verify the JWT signature in-process
// instead of calling GoTrue /auth/v1/user on every request. That removes a per-request
// round trip from Vercel's shared egress IPs (which otherwise aggregate against GoTrue's
// per-IP "token verifications" rate limit and could throttle the whole signed-in cohort),
// and cuts ~50-150ms off every authenticated request.
//   - JWKS-first: asymmetric tokens (ES256/RS256, this project uses ES256) are verified
//     against the project's published public keys - no secret needed.
//   - Secret fallback: an HS256 token is verified with SUPABASE_JWT_SECRET (dormant unless
//     the project switches back to symmetric signing and the secret is set).
//   - GoTrue fallback: if local verification CAN'T run (JWKS unreachable, unknown alg), we
//     fall back to the old /auth/v1/user call so a transient issue never breaks auth. A
//     token that is DEFINITIVELY invalid (bad signature, expired, wrong issuer) is rejected
//     locally without a fallback.
// Tradeoff (standard for local JWT verify): a revoked/logged-out token stays valid until it
// expires (Supabase access tokens are short-lived, ~1h). Acceptable for this surface.
import crypto from "node:crypto";

let __jwks = { at: 0, keys: {} }; // kid -> KeyObject, cached per instance (1h)
async function jwksKey(kid, force) {
  if (!force && __jwks.keys[kid] && Date.now() - __jwks.at < 3600 * 1000) return __jwks.keys[kid];
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) return null;
    const body = await res.json();
    const map = {};
    for (const jwk of (body && body.keys) || []) {
      try { map[jwk.kid] = crypto.createPublicKey({ key: jwk, format: "jwk" }); } catch { /* skip unusable key */ }
    }
    __jwks = { at: Date.now(), keys: map };
    return map[kid] || null;
  } catch { return null; }
}

// -> { userId, email } if valid, false if DEFINITIVELY invalid, null if UNABLE to verify locally.
async function verifyLocally(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch { return false; }
  const alg = String(header.alg || "");
  const signingInput = parts[0] + "." + parts[1];
  const sig = Buffer.from(parts[2], "base64url");
  let ok;
  if (alg === "HS256") {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return null; // no secret -> fall back to GoTrue
    const expected = crypto.createHmac("sha256", secret).update(signingInput).digest();
    ok = sig.length === expected.length && crypto.timingSafeEqual(sig, expected);
  } else if (/^(ES|RS)(256|384|512)$/.test(alg)) {
    let key = await jwksKey(header.kid, false) || await jwksKey(header.kid, true); // refetch once (rotation)
    if (!key) return null; // unable -> fall back to GoTrue
    const hash = "sha" + alg.slice(2);
    try { ok = crypto.verify(hash, Buffer.from(signingInput), alg[0] === "E" ? { key, dsaEncoding: "ieee-p1363" } : key, sig); }
    catch { return null; } // unable -> fall back
  } else {
    return null; // unknown alg -> fall back
  }
  if (!ok) return false; // bad signature -> reject
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= Number(payload.exp)) return false; // expired -> reject
  if (!payload.sub) return false;
  if (payload.iss && String(payload.iss).indexOf(String(process.env.SUPABASE_URL || "")) !== 0) return false; // wrong project -> reject
  return { userId: payload.sub, email: String(payload.email || "").toLowerCase() };
}

// Fallback: the original behavior - ask GoTrue who the token belongs to.
async function verifyViaGoTrue(token) {
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return { userId: user.id, email: String(user.email || "").toLowerCase() };
  } catch { return null; }
}

export async function validateBearer(authorizationHeader) {
  const token = String(authorizationHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const local = await verifyLocally(token);
  if (local === false) return null;   // definitively invalid -> reject
  if (local) return local;            // verified locally
  return await verifyViaGoTrue(token); // couldn't verify locally -> old path
}
