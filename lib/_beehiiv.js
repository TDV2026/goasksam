// Phase 3 / 2B: Beehiiv subscriber tiering. Checks whether an account email is
// an ACTIVE subscriber of The Daily Vroom's Beehiiv publication.
//   -> "tdv"   : found and active (a reader)
//   -> "free"  : the publication is valid AND the email is not an active subscriber
//   -> null    : unknown (not configured / bad publication id / bad key / network
//                / timeout / 5xx) -> the caller keeps the current tier and does
//                NOT stamp tier_checked_at, so it retries later. Never blocks signup.
// A wrong BEEHIIV_PUBLICATION_ID would make the by_email lookup 404 too, which is
// indistinguishable from "not subscribed" - so we verify the publication exists
// FIRST and treat a publication/auth failure as unknown (null), never as "free".
// Env: BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID.
const BEEHIIV_TIMEOUT_MS = 3500;
const BEEHIIV_BASE = "https://api.beehiiv.com/v2/publications";

export async function beehiivTier(email) {
  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  const addr = String(email || "").trim().toLowerCase();
  if (!key || !pub || !addr) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BEEHIIV_TIMEOUT_MS);
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  try {
    // 1) Confirm the publication exists (rules out a misconfigured pub id / key).
    const pubRes = await fetch(`${BEEHIIV_BASE}/${encodeURIComponent(pub)}`, { headers, signal: ctrl.signal });
    if (!pubRes.ok) {
      clearTimeout(timer);
      console.error(`beehiiv: publication check failed (${pubRes.status}) - treating as unknown, not free`);
      return null; // config/auth problem -> unknown, retry later; never silently "free"
    }
    // 2) The publication is real, so a 404 here genuinely means "not subscribed".
    const subRes = await fetch(`${BEEHIIV_BASE}/${encodeURIComponent(pub)}/subscriptions/by_email/${encodeURIComponent(addr)}`, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    if (subRes.status === 404) return "free";
    if (!subRes.ok) return null;
    const body = await subRes.json().catch(() => null);
    const status = String((body && body.data && body.data.status) || (body && body.status) || "").toLowerCase();
    return status === "active" ? "tdv" : "free";
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}
