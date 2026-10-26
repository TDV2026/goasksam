// The sign-in card's "Sign me up to The Daily Vroom" box (Sam, Oct 26 2026). When a person ticks it and signs in, /api/account adds that email to The Daily
// Vroom list in Beehiiv (create subscription, utm_source goasksam, utm_medium signin). Safe by design:
//   - it runs AFTER the sign-in is verified, in the background (never awaited by the sign-in), with a short timeout; whatever Beehiiv answers, the person is
//     not told and sign-in is never slowed or blocked; the only log line is an outcome word, never an address;
//   - reactivate_existing is false: someone already on the list is returned as they are (no duplicate), and someone who left the list is NOT put back;
//   - a per-device and per-address daily ceiling (lib/_ceilings.js newsletter_signup) keeps a repeated sign-in from calling Beehiiv again and again;
//   - a switch that needs no deploy: the app_config row "signin_newsletter_enabled" (off = false, 0, "off" or "false"; a missing row is ON), the same pattern as
//     the Task email switch (lib/_email.js), read at call time and held 5 seconds;
//   - the publication and key are the ones the tier lookup already reads (lib/_beehiiv.js, environment only); nothing is named here or logged.
// The call sets neither send_welcome_email nor double_opt_override, so the publication's own settings decide whether Beehiiv sends its confirmation or welcome email.
import { checkCeiling } from "./_ceilings.js";

const TIMEOUT_MS = 3000, BASE = "https://api.beehiiv.com/v2/publications", SWITCH_KEY = "signin_newsletter_enabled", HOLD_MS = 5000;
let seen = { at: 0, off: false };
export function resetNewsletterSwitchCache() { seen = { at: 0, off: false }; }
export const switchValueIsOff = v => v === false || v === 0 || ["0", "off", "false"].includes(String(v == null ? "" : v).trim().toLowerCase().replace(/^"|"$/g, ""));
export async function newsletterSwitchOff(env) {
  const now = Date.now();
  if (now - seen.at < HOLD_MS) return seen.off;
  try {
    if (!env || !env.supabaseUrl || !env.supabaseKey) throw new Error("no database credentials");
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=eq.${SWITCH_KEY}&select=value&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) throw new Error("read " + r.status);
    const rows = await r.json();
    seen = { at: now, off: !!(rows && rows[0] && switchValueIsOff(rows[0].value)) };
    return seen.off;
  } catch { return false; }   // an unreadable switch fails open, like the Task email switch
}

// Returns an outcome word (never throws, never carries an address). The caller does not wait for it.
export async function subscribeToNewsletter(req, env, email) {
  let outcome = "failed";
  try {
    const key = process.env.BEEHIIV_API_KEY, pub = process.env.BEEHIIV_PUBLICATION_ID, addr = String(email || "").trim().toLowerCase();
    if (!key || !pub || !addr || !addr.includes("@")) outcome = "not_configured";
    else if (await newsletterSwitchOff(env)) outcome = "switch_off";
    else if (!(await checkCeiling(env, req, "newsletter_signup", { tool: null }).catch(() => ({ ok: true }))).ok) outcome = "limited";
    else {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(pub)}/subscriptions`, {
          method: "POST", signal: ctrl.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: addr, reactivate_existing: false, utm_source: "goasksam", utm_medium: "signin" })
        });
        outcome = res.ok ? "subscribed" : (res.status === 401 || res.status === 403) ? "denied" : res.status === 429 ? "busy" : res.status >= 500 ? "beehiiv_error" : "refused";
      } finally { clearTimeout(timer); }
    }
  } catch (e) { outcome = e && e.name === "AbortError" ? "timeout" : "failed"; }
  try { console.log("newsletter signup outcome=" + outcome); } catch {}
  return outcome;
}

// The one entry /api/account uses: only a TICKED box calls Beehiiv, and the call runs after the response (waitUntil on Vercel), so the sign-in never waits for it.
export function maybeSubscribeAfterSignin(req, env, email, consent) {
  if (consent !== true) return null;
  const p = subscribeToNewsletter(req, env, email).catch(() => "failed");
  try { const c = globalThis[Symbol.for("@vercel/request-context")], x = c && c.get && c.get(); if (x && x.waitUntil) x.waitUntil(p); } catch {}
  return p;
}
