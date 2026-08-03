// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
export default async function handler(req, res) {
  const q = req.query || {};
  const code = String(q.code || "");
  const rawTo = String(q.to || "/");
  const to = /^\/(?!\/)/.test(rawTo) ? rawTo : "/"; // same-origin path only, never an open redirect
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
