// ===================== TESTER COHORT (pre-launch) =====================
// Temporary. Delete at launch alongside the curtain (api/crew.js, the index.html
// curtain block, CURTAIN_* env). A dedicated invite tier between crew (unlimited)
// and free (1/day): a code Sam hands out directly (no account/magic-link), a
// daily allowance, and a HARD expiry that revokes access server-side.
//
// The code and expiry are env-overridable but have baked defaults so the invite
// link works the moment this deploys and the exact code can be reported to Sam.
// Rotate the code or move the date with CURTAIN_TESTER_CODE / TESTER_CODE_EXPIRES.
export const TESTER_CODE = process.env.CURTAIN_TESTER_CODE || "tdv-tester-9f4kq2";

// Hard expiry (ISO 8601). Default: two weeks from the 2026-08-13 build. Set
// TESTER_CODE_EXPIRES to launch day or any other date to move it.
export const TESTER_EXPIRES_ISO = process.env.TESTER_CODE_EXPIRES || "2026-08-27T23:59:59Z";

export function testerExpiryMs() {
  const t = Date.parse(TESTER_EXPIRES_ISO);
  return Number.isFinite(t) ? t : 0; // unparseable date -> treat as expired (fail closed)
}
// True once the code is dead. Re-checked on EVERY search and on the curtain seal,
// so a device that already redeemed the code loses access the instant the date
// passes - the cookie is ignored, not merely no longer issued.
export function testerCodeExpired() {
  const t = testerExpiryMs();
  return !t || Date.now() > t;
}
// Cookie Max-Age (seconds) so the browser cookie also self-expires at the hard
// date. Server-side testerCodeExpired() is the real gate; this is belt-and-braces.
export function testerCookieMaxAge() {
  return Math.max(0, Math.floor((testerExpiryMs() - Date.now()) / 1000));
}
