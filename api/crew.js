// ===================== CURTAIN (pre-launch) =====================
// Temporary. Delete at launch in the single curtain-removal commit.
// Validates the crew code against env CURTAIN_CREW_CODE and drops a long-lived,
// JS-readable unlock cookie, then 302s back to a same-origin path. Presentation
// only: it never touches auth, the product API, or 2A. Rotate the code by
// changing the env var (existing unlocked devices keep their cookie).
import { testerCodeMatches, testerSetCookie } from "../lib/_tester.js";

import crypto from "node:crypto";
import { checkCeiling } from "../lib/_ceilings.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { FONT_LINKS } from "./_chrome.js";
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
  // The code box (Sam, Oct 25 2026): the page at /api/crew has a box that POSTS the code as a form body, so the code never sits in an
  // address (browser history, Vercel request logs). The old ?code= link still works. Nothing here echoes, redirects with or logs the code.
  let bodyCode = "", bodyTo = "";
  if (req.method === "POST") {
    let b = req.body;
    if (typeof b === "string") { try { b = Object.fromEntries(new URLSearchParams(b)); } catch (e) { b = {}; } }
    if (Buffer.isBuffer(b)) { try { b = Object.fromEntries(new URLSearchParams(b.toString("utf8"))); } catch (e) { b = {}; } }
    b = b && typeof b === "object" ? b : {};
    bodyCode = String(b.code || "").slice(0, 200); bodyTo = String(b.to || "");
  }
  const code = req.method === "POST" ? bodyCode : String(q.code || "").slice(0, 200);
  const dest = req.method === "POST" ? (/^\/(?![\/\\])/.test(bodyTo) ? bodyTo : "") : (q.to ? to : "");
  if (!code) {   // no code anywhere: the box
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(crewBoxHtml(/^\/(?![\/\\])/.test(rawTo) && rawTo !== "/" ? rawTo : "", false));
    return;
  }
  // Wrong guesses are limited like the partner demo's code (lib/_ceilings.js crew_code); over the limit the answer is the same 403 page, right code or not.
  const lim = await checkCeiling(supabaseEnv(), req, "crew_code", { tool: null }).catch(() => ({ ok: true }));
  const expected = process.env.CURTAIN_CREW_CODE || "";
  const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
  const v = lim.ok && expected && same(code, expected) ? mintCrewCookieValue() : null;
  if (v) {
    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    const domain = /(^|\.)goasksam\.com$/.test(host) ? "; Domain=goasksam.com" : "";
    res.setHeader("Set-Cookie", `${CREW_COOKIE}=${v}; Max-Age=${CREW_MAX_AGE_S}; Path=/${domain}; SameSite=Lax; Secure`);
    res.setHeader("Location", dest || "/find");
    res.status(302).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(403).send(crewBoxHtml(dest, true));
}

const escA = x => String(x == null ? "" : x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// The box page: the holding page's look (tokens, fonts, light and dark, phone width). The code field is a password field, never pre-filled.
function crewBoxHtml(to, failed) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<title>Crew</title>
${FONT_LINKS}
<style>
:root{--bg:#F6F3EC;--ink:#15201A;--sec:#5E6B63;--green:#1E4D38;--card:#FFFFFF;--line:#D8D4CB;--bad:#9B2C2C;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme: dark){:root{--bg:#121512;--ink:#F3F1EA;--sec:#B9C2BC;--green:#8FD0A8;--card:#1D221F;--line:#3A423D;--bad:#E59A9A}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font:400 17px/1.5 var(--sans);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:420px;text-align:center}
.wm{font:600 26px/1.1 var(--serif);letter-spacing:-.01em;margin:0 0 28px}
h1{margin:0 0 18px;font:500 28px/1.15 var(--serif)}
form{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 16px;text-align:left}
label{display:block;font:600 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec);margin-bottom:10px}
input[type=password]{width:100%;font:400 17px/1.3 var(--sans);color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px}
input[type=password]:focus{outline:2px solid var(--green);outline-offset:1px}
button{margin-top:14px;width:100%;font:600 16px/1 var(--sans);color:#fff;background:var(--green);border:0;border-radius:10px;padding:14px;cursor:pointer}
@media (prefers-color-scheme: dark){button{color:#0E1A13}}
.bad{margin:0 0 14px;color:var(--bad);font-size:15px}
.foot{margin-top:28px;color:var(--sec);font-size:13px}
</style></head><body><main>
<p class="wm">GoAskSam</p>
<h1>Crew</h1>
<form method="post" action="/api/crew" autocomplete="off">
${failed ? '<p class="bad" role="alert">That crew code did not work. Nothing was changed on this browser.</p>' : ""}
<label for="code">Crew code</label>
<input id="code" name="code" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus required>
${to ? `<input type="hidden" name="to" value="${escA(to)}">` : ""}
<button type="submit">Open</button>
</form>
<p class="foot">goasksam.com</p>
</main></body></html>`;
}
