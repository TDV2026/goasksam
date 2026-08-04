// Phase 3 / 2B: Beehiiv subscriber tiering. Checks whether an account email is
// an ACTIVE subscriber of The Daily Vroom's Beehiiv publication.
//   -> "tdv"   : found and active (a reader)
//   -> "free"  : definitively not a subscriber (404) or found-but-not-active
//   -> null    : unknown (not configured / network / timeout / 5xx) -> the caller
//                keeps the current tier and does NOT stamp tier_checked_at, so it
//                retries on a later ensure. Never blocks signup.
// Env: BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID.
const BEEHIIV_TIMEOUT_MS = 3000;

export async function beehiivTier(email) {
  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  const addr = String(email || "").trim().toLowerCase();
  if (!key || !pub || !addr) return null; // not configured / no email -> unknown, retry later

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BEEHIIV_TIMEOUT_MS);
  try {
    const url = `https://api.beehiiv.com/v2/publications/${encodeURIComponent(pub)}/subscriptions/by_email/${encodeURIComponent(addr)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status === 404) return "free";  // not a subscriber
    if (!res.ok) return null;                // 401/429/5xx -> unknown, retry later
    const body = await res.json().catch(() => null);
    const status = String((body && body.data && body.data.status) || (body && body.status) || "").toLowerCase();
    return status === "active" ? "tdv" : "free";
  } catch (e) {
    clearTimeout(timer);
    return null; // aborted/network -> unknown, retry later
  }
}
