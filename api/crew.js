// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
import { testerCodeMatches, testerSetCookie } from "../lib/_tester.js";

import crypto from "node:crypto";
import { mintCrewCookieValue, CREW_COOKIE, CREW_MAX_AGE_S } from "../lib/_crew.js";
export default async function handler(req, res) {
  const q = req.query || {};
  // (Removed at launch, Aug 2026: the crew-gated q.jread journey-verification read
  // and the q.probe archive-vs-OCD calibration probe. Both were temporary diagnostic
  // paths for pre-launch verification.)
  // (Removed Oct 21 2026, Sam's decision, docs/lane-security.md: the ?bhs= newsletter-link auto-signin, which minted a
  // real session for anyone holding a subscription id. A ?bhs= request is now ignored: it falls through to the crew
  // code check below and, with no code, gets the plain "That crew link did not work." page, minting nothing and
  // setting no cookie. A signed, expiring newsletter link is a rebuild after launch, not now.)
  const rawTo = String(q.to || "/");
  const to = /^\/(?!\/)/.test(rawTo) ? rawTo : "/"; // same-origin path only, never an open redirect
  // TESTER cohort redemption: ?tcode=<the CURTAIN_TESTER_CODE env value>. Sets a signed gas_tester cookie whose
  // Max-Age ends at the hard expiry, and NEVER issues once the code has expired
  // (the search gate + curtain seal also re-check expiry, so this is one of two
  // enforcement points). Falls through to the curtain on a bad or expired code.
  const tcode = String(q.tcode || "");
  if (tcode) {
    const tc = testerCodeMatches(tcode) ? testerSetCookie() : null;
    if (tc) {
      res.setHeader("Set-Cookie", tc);
      res.setHeader("Location", to);
      res.status(302).end();
      return;
    }
    res.setHeader("Location", "/"); // wrong or expired tester code -> curtain
    res.status(302).end();
    return;
  }
  // Old guest (?guest=) and one-time pass (?once=) links (Oct 2026, open search): search is open to everyone,
  // so these links no longer carry any searches. Links already shared still land on the page; nothing is set.
  if (q.guest || q.once) {
    res.setHeader("Location", to);
    res.status(302).end();
    return;
  }
  // THE CREW LINK (/api/crew?code=<CURTAIN_CREW_CODE>): a right code sets the signed crew cookie (lib/_crew.js) on
  // goasksam.com and every subdomain, then lands on /buy (or the page a gate passed in `to`). A wrong code, or
  // no crew secret on the server, gets a plain page and sets nothing: never a silent redirect.
  res.setHeader("Cache-Control", "private, no-store");
  const code = String(q.code || "");
  const expected = process.env.CURTAIN_CREW_CODE || "";
  const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
  const v = expected && same(code, expected) ? mintCrewCookieValue() : null;
  if (v) {
    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    const domain = /(^|\.)goasksam\.com$/.test(host) ? "; Domain=goasksam.com" : "";
    res.setHeader("Set-Cookie", `${CREW_COOKIE}=${v}; Max-Age=${CREW_MAX_AGE_S}; Path=/${domain}; SameSite=Lax; Secure`);
    res.setHeader("Location", q.to ? to : "/find");
    res.status(302).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(403).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Crew link</title>' +
    '<body style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;color:#1A1A1A">' +
    '<h1 style="font-size:22px">That crew link did not work.</h1><p>Nothing was changed on this browser. Check the code in the link and open it again.</p>' +
    '<p><a href="/sell" style="color:#1E4D38">Go to GoAskSam</a></p></body>');
}
