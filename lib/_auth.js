// Phase 3 / 2A: validate a Supabase Auth (GoTrue) access token by asking GoTrue
// who it belongs to. Boring and correct: works regardless of the project's JWT
// signing scheme, needs no extra secret (uses the anon key we already have), and
// returns { userId, email } or null. One ~50-150ms call, negligible next to a
// multi-second search. Local JWT verification is a later latency optimization.
export async function validateBearer(authorizationHeader) {
  const token = String(authorizationHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return { userId: user.id, email: String(user.email || "").toLowerCase() };
  } catch {
    return null;
  }
}
