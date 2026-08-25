// Phase 3 / Stage 2A: the account layer. Supabase Auth (GoTrue) over plain REST,
// no client library and no bundler. Two doors: Google (primary) + magic-link
// email (fallback, with ?email= prefill). Auth WRAPS the product: it never
// touches #inp/#btn/send() or the wizard. Search stays open to everyone until 2C
// (the free-first-search + gate ship there); here we only add the ability to
// have an account, show signed-in state, and store the consent choice.

const AUTH_SESSION_KEY = "gas_auth_session";     // distinct from outbound's "gas_session"
const AUTH_CONSENT_KEY = "gas_pending_consent";  // survives the sign-in redirect (11d)
let __authConfig = null, __authConfigPromise = null;
let __authAccount = null;      // { email, tier, marketingConsent } once ensured
let __authPrefillEmail = "";
let __authOtpEmail = "";        // the email a one-time code was sent to (for verify + resend)

function authApiPath(p) { return (typeof apiPath === "function") ? apiPath(p) : p; }
function authEsc(s) { return (typeof escapeHtml === "function") ? escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s); }

// ---------------- config ----------------
async function authConfig() {
  if (__authConfig) return __authConfig;
  if (!__authConfigPromise) {
    __authConfigPromise = fetch(authApiPath("/api/publicConfig"))
      .then(r => r.ok ? r.json() : null)
      .then(c => { __authConfig = (c && c.supabaseUrl && c.anonKey) ? c : null; return __authConfig; })
      .catch(() => null);
  }
  return __authConfigPromise;
}

// ---------------- session ----------------
function authGetSession() { try { const s = localStorage.getItem(AUTH_SESSION_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function authSetSession(s) { try { if (s) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {} }
function authIsSignedIn() { const s = authGetSession(); return !!(s && s.access_token); }
function sessionFromTokenResponse(j) {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (now + (j.expires_in || 3600)), email: (j.user && j.user.email) || null };
}
// Returns a fresh access token, refreshing if it is within 60s of expiry.
async function authValidToken() {
  const s = authGetSession(); if (!s || !s.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at && s.expires_at - now > 60) return s.access_token;
  const cfg = await authConfig(); if (!cfg || !s.refresh_token) return s.access_token || null;
  try {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!res.ok) { authSetSession(null); return null; }
    const sess = sessionFromTokenResponse(await res.json());
    authSetSession(sess); return sess.access_token;
  } catch (e) { return s.access_token || null; }
}

// ---------------- consent stash (survives redirect) ----------------
function authStashConsent(v) { try { localStorage.setItem(AUTH_CONSENT_KEY, v ? "1" : "0"); } catch (e) {} }
function authPopConsent() { try { const v = localStorage.getItem(AUTH_CONSENT_KEY); localStorage.removeItem(AUTH_CONSENT_KEY); return v === null ? undefined : (v === "1"); } catch (e) { return undefined; } }

// ---------------- doors ----------------
async function authSignInGoogle() {
  const cfg = await authConfig(); if (!cfg) return authCardError("Sign-in isn't configured yet. Try again shortly.");
  authStashConsent(authReadConsentCheckbox());
  const redirect = encodeURIComponent(location.origin + location.pathname);
  location.href = `${cfg.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
}
async function authSignInEmail() {
  const cfg = await authConfig(); if (!cfg) return authCardError("Sign-in isn't configured yet. Try again shortly.");
  // Email OR the stashed code-email (so "Resend" works from the code screen where the
  // email field no longer exists).
  const field = document.getElementById("auth-email");
  const email = String((field && field.value) || __authOtpEmail || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { authCardError("That doesn't look like an email. Mind checking it?"); return; }
  // Only (re)stash consent when the checkbox is on screen, so a Resend from the code
  // screen doesn't clear a previously-ticked consent.
  const consentEl = document.getElementById("auth-consent");
  if (consentEl) authStashConsent(!!consentEl.checked);
  __authOtpEmail = email;
  try {
    // Code-only OTP (no magic link): the email template renders {{ .Token }}, a numeric
    // code, so an email-scanner GET can't consume a link before the real user acts.
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/otp`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify({ email })
    });
    if (!res.ok) { authCardError("I couldn't send the code just now. Try again in a moment."); return; }
    authRenderCheckEmail(email);
  } catch (e) { authCardError("I couldn't send the code just now. Try again in a moment."); }
}
// Verify the code and finalize the session (mirrors authBoot's post-login steps).
async function authVerifyCode() {
  const cfg = await authConfig(); if (!cfg) return authCardError("Sign-in isn't configured yet. Try again shortly.");
  const codeField = document.getElementById("auth-code");
  const code = String((codeField && codeField.value) || "").replace(/\s+/g, "").trim();
  // Length-agnostic: Supabase's OTP length is a dashboard setting (this project sends 8).
  // Accept any 4-10 digit numeric code so the frontend never has to track that setting.
  if (!/^\d{4,10}$/.test(code)) { authCardError("Enter the code from your email."); return; }
  const email = String(__authOtpEmail || "").trim();
  if (!email) { authCardError("Something went wrong. Close this and sign in again."); return; }
  try {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify({ type: "email", email, token: code })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) { authCardError("That code didn't work. Double-check it, or resend a new one."); return; }
    const now = Math.floor(Date.now() / 1000);
    authSetSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (now + (j.expires_in || 3600)), email: (j.user && j.user.email) || email });
    authRenderTopbar();
    await authEnsureAccount({ forceRecheck: true });   // fresh sign-in: pick up a just-made TDV subscription now
    authRenderTopbar();
    authCloseModal();
    if (typeof gateAfterSignup === "function") gateAfterSignup();
  } catch (e) { authCardError("I couldn't verify that code just now. Try again in a moment."); }
}
async function authSignOut() {
  const cfg = await authConfig(); const s = authGetSession();
  authSetSession(null); __authAccount = null;
  if (cfg && s && s.access_token) { try { fetch(`${cfg.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${s.access_token}` } }); } catch (e) {} }
  authRenderTopbar();
}

// ---------------- account ensure ----------------
async function authEnsureAccount(opts) {
  const token = await authValidToken(); if (!token) return null;
  const consent = authPopConsent();
  // 11a: claim the anonymous free result onto the new account (attach, never rerun).
  let claimId = null; try { claimId = localStorage.getItem("gas_free_result"); } catch (e) {}
  const body = {};
  if (consent !== undefined) body.marketingConsent = consent;
  if (claimId) body.claimResultId = claimId;
  // Item 2: force a live Beehiiv tier re-check (on fresh sign-in, or a mid-wall
  // "Refresh your plan" tap) so a just-subscribed reader is upgraded to TDV now,
  // not up to 7 days later when the cached tier goes stale.
  if (opts && opts.forceRecheck) body.recheckTier = true;
  try {
    const res = await fetch(authApiPath("/api/account"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) { if (res.status === 401) authSetSession(null); return null; }
    const acc = await res.json();
    // daily = { dailyLimit, dailyUsed, dailyRemaining } | null. Drives the upfront
    // gate (#1): a signed-in user with 0 remaining is told before the wizard.
    __authAccount = { email: acc.email, tier: acc.tier, marketingConsent: acc.marketingConsent, daily: acc.daily || null };
    try { if (claimId) localStorage.removeItem("gas_free_result"); } catch (e) {}
    return __authAccount;
  } catch (e) { return null; }
}
function authAccount() { return __authAccount; }

// ---------------- callback + prefill (on load) ----------------
function authScrubPrefill() {
  // 11f: read ?email=, keep it for field prefill only, scrub from the URL before
  // anything else fires. Never logged, never sent anywhere but the field.
  try {
    const u = new URL(location.href);
    const pre = u.searchParams.get("email");
    if (pre) { __authPrefillEmail = pre; u.searchParams.delete("email"); window.history.replaceState(null, "", u.pathname + (u.search || "") + (u.hash || "")); }
  } catch (e) {}
}
function authHandleCallback() {
  // Google + magic-link both return tokens in the URL hash.
  if (!location.hash || location.hash.indexOf("access_token") === -1) return false;
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const access_token = h.get("access_token"), refresh_token = h.get("refresh_token");
    if (!access_token) return false;
    const expires_at = Number(h.get("expires_at")) || (Math.floor(Date.now() / 1000) + Number(h.get("expires_in") || 3600));
    const via = h.get("via"); // "beehiiv" for a TDV link-minted session (distinct attribution)
    authSetSession({ access_token, refresh_token, expires_at });
    // Use window.history explicitly (defensive: never let a same-named module local
    // shadow the History API in the concatenated bundle; the chat array is now chatHistory).
    window.history.replaceState(null, "", location.pathname + location.search); // scrub tokens + via
    if (via === "beehiiv" && typeof gasFunnel === "function") { try { gasFunnel("beehiiv_link_signin"); } catch (e) {} }
    return true;
  } catch (e) { return false; }
}

// ---------------- fetch wrapper: inject Bearer on same-origin /api calls ----------------
// Auth wraps the product without touching any call site. GoTrue calls go to the
// Supabase host (not /api), so they are never rewritten.
(function wrapFetch() {
  if (typeof window === "undefined" || window.__authFetchWrapped || typeof window.fetch !== "function") return;
  window.__authFetchWrapped = true;
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const isApi = url.indexOf("/api/") === 0 || url.indexOf(location.origin + "/api/") === 0;
      const s = authGetSession();
      if (isApi && s && s.access_token) {
        const headers = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || {});
        if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + s.access_token);
        init = Object.assign({}, init, { headers });
      }
    } catch (e) {}
    return orig(input, init);
  };
})();

// ---------------- UI ----------------
function authReadConsentCheckbox() { const c = document.getElementById("auth-consent"); return !!(c && c.checked); }
function authCardError(msg) { const el = document.getElementById("auth-error"); if (el) { el.textContent = msg; el.style.display = "block"; } }
function authCloseModal() { const m = document.getElementById("auth-modal"); if (m && m.remove) m.remove(); }

// The sign-in card. Sam-voiced, two doors, one unticked consent checkbox.
function openSignInCard(subtitle) {
  gasFunnel("signup_shown");   // 2F: the sign-in card was shown (a funnel step)
  authCloseModal();
  const scrim = document.createElement("div");
  scrim.className = "hp-dialog-scrim"; scrim.id = "auth-modal";
  scrim.onclick = e => { if (e.target === scrim) authCloseModal(); };
  const prefill = authEsc(__authPrefillEmail || "");
  scrim.innerHTML = `<div class="hp-dialog auth-dialog">
    <h3>Sign in to GoAskSam</h3>
    <p>${authEsc(subtitle || "Create a free account to run more searches.")}</p>
    <button class="auth-google" onclick="authSignInGoogle()">Continue with Google</button>
    <div class="auth-or"><span>or</span></div>
    <label class="auth-label" for="auth-email">Email me a sign-in code</label>
    <input id="auth-email" class="auth-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${prefill}" />
    <button class="auth-email-btn" onclick="authSignInEmail()">Email me a code</button>
    <label class="auth-consent-row"><input id="auth-consent" type="checkbox" /> <span>Send me Sam's market notes</span></label>
    <div id="auth-error" class="auth-error" style="display:none"></div>
    <div class="auth-fineprint">No passwords. We email you a one-time code. Marketing notes only if you tick the box.</div>
  </div>`;
  document.body.appendChild(scrim);
  const f = document.getElementById("auth-email"); if (f && !prefill) { try { f.focus(); } catch (e) {} }
}
function authRenderCheckEmail(email) {
  const d = document.querySelector("#auth-modal .auth-dialog");
  if (!d) return;
  d.innerHTML = `<h3>Check your email</h3>
    <p>I sent a code to <strong>${authEsc(email)}</strong>. Enter it below and you're in.</p>
    <input id="auth-code" class="auth-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Enter the code" aria-label="Sign-in code" />
    <div id="auth-error" class="auth-error" style="display:none"></div>
    <button class="auth-email-btn" onclick="authVerifyCode()">Verify and sign in</button>
    <button onclick="authSignInEmail()" style="margin-top:10px;background:none;border:none;color:#6B6861;font-size:13px;cursor:pointer;text-decoration:underline">Resend code</button>`;
  const f = document.getElementById("auth-code");
  if (f) { try { f.focus(); } catch (e) {} f.addEventListener("keydown", e => { if (e.key === "Enter") authVerifyCode(); }); }
}
// Topbar: signed-out shows "Sign in"; signed-in shows the email + Sign out.
function authRenderTopbar() {
  const area = document.getElementById("signin-area");
  if (!area) return;
  if (authIsSignedIn()) {
    const email = (__authAccount && __authAccount.email) || (authGetSession() && authGetSession().email) || "Signed in";
    area.innerHTML = `<span class="hp-account-email" title="${authEsc(email)}">${authEsc(email)}</span>
      <button class="hp-signout" onclick="authSignOut()">Sign out</button>`;
  } else {
    area.innerHTML = `<button class="hp-signin" onclick="openSignInCard()">Sign in</button>`;
  }
  // Saved-results surface is HIDDEN for launch (the page still exists and the save
  // pipeline keeps running; only the entry point is removed). Keep the "Your results"
  // rail entry hidden for everyone, signed in or not. Re-enable post-launch by
  // restoring the signed-in toggle here.
  const savedNav = document.getElementById("nav-saved");
  if (savedNav) savedNav.style.display = "none";
}

// ---------------- boot ----------------
async function authBoot() {
  authScrubPrefill();
  const returned = authHandleCallback();
  authRenderTopbar();               // immediate paint from stored session
  if (authIsSignedIn()) {
    // Fresh sign-in (returned via Google/magic-link callback) forces a live tier
    // re-check so a just-subscribed reader is TDV immediately; a normal load does not.
    await authEnsureAccount(returned ? { forceRecheck: true } : undefined);
    authRenderTopbar();              // repaint with the resolved email/tier
  }
  if (returned) { authCloseModal(); gateAfterSignup(); }  // #2: land on the claimed result after a wall signup
  else { gateCheckUpfront(); }                             // #1: tell a depleted visitor before the wizard
  gasFunnelOnce("homepage_view");  // 2F: one homepage_view per session
}

// ===================== 2C: the account gate (client) =====================
// Auth WRAPS the product: gate cards render into #msgs, none of the wizard,
// #inp/#btn, or send() is touched. sellerDecision returns the gate statuses.
function gasAnonId() {
  try { let id = localStorage.getItem("gas_anon"); if (!id) { id = "a_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("gas_anon", id); } return id; } catch (e) { return null; }
}
function gasStashResultId(id, isFirstFree) { try { if (isFirstFree && id) localStorage.setItem("gas_free_result", id); } catch (e) {} }
// ---- Business journey tracking (deterministic per-vehicle journey id) ----
// A person's attempt to sell ONE vehicle is one journey across visits; a different
// car is a new journey. Keyed by normalized make|model|year in localStorage so the
// same id is reused. journey_id is a real uuid (the analytics table PK).
function gasUuid() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
}
function gasJourneyKey(v) {
  if (!v) return null;
  const n = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const make = n(v.make), model = n(v.model), year = (v.year != null ? String(v.year) : "");
  if (!make || !model) return null; // no stable key until make+model are known
  return [make, model, year].filter(Boolean).join("|");
}
function gasJourneyId(v) {
  try {
    const key = gasJourneyKey(v); if (!key) return null;
    const k = "gas_jid:" + key;
    let id = localStorage.getItem(k);
    if (!id) { id = gasUuid(); localStorage.setItem(k, id); }
    return id;
  } catch (e) { return null; }
}
// ---- Acquisition / attribution (Phase 4) ----
// First-party only: the utm params on the landing URL + the referring host,
// classified into a coarse source. first-touch is immutable (the very first visit);
// last-touch updates whenever a visit carries a real acquisition signal, so an
// internal click-through never overwrites the meaningful most-recent source. Stored
// in localStorage and attached to journey-event metadata so it lands with the event.
function gasClassifySource(utm, ref) {
  const social = /facebook|fbclid|instagram|twitter|x\.com|linkedin|reddit|t\.co|tiktok|youtube|threads/;
  const us = String(utm.utm_source || "").toLowerCase();
  if (/dailyvroom|thedailyvroom|tdv/.test(us)) return "The Daily Vroom";
  if (us) return social.test(us) ? "Social" : us.charAt(0).toUpperCase() + us.slice(1);
  let host = "";
  try { host = ref ? new URL(ref).hostname.replace(/^www\./, "").toLowerCase() : ""; } catch (e) {}
  if (!host) return "Direct";
  try { if (host === String(location.hostname || "").replace(/^www\./, "").toLowerCase()) return "Direct"; } catch (e) {}
  if (/thedailyvroom\.com|dailyvroom/.test(host)) return "The Daily Vroom";
  if (/google|bing|duckduckgo|yahoo|ecosia|baidu|search/.test(host)) return "Organic";
  if (social.test(host)) return "Social";
  return "Referral";
}
function gasCurrentTouch() {
  let p; try { p = new URLSearchParams(location.search || ""); } catch (e) { p = new URLSearchParams(""); }
  const utm = { utm_source: p.get("utm_source") || null, utm_medium: p.get("utm_medium") || null, utm_campaign: p.get("utm_campaign") || null };
  const ref = (typeof document !== "undefined" && document.referrer) || "";
  return { source: gasClassifySource(utm, ref), utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign, referrer: ref ? ref.slice(0, 300) : null, at: new Date().toISOString() };
}
function gasCaptureTouch() {
  try {
    const t = gasCurrentTouch();
    if (!localStorage.getItem("gas_first_touch")) localStorage.setItem("gas_first_touch", JSON.stringify(t));
    const meaningful = !!t.utm_source || t.source !== "Direct";
    if (meaningful || !localStorage.getItem("gas_last_touch")) localStorage.setItem("gas_last_touch", JSON.stringify(t));
  } catch (e) {}
}
function gasAttribution() {
  try {
    const f = JSON.parse(localStorage.getItem("gas_first_touch") || "null");
    const l = JSON.parse(localStorage.getItem("gas_last_touch") || "null");
    if (!f && !l) return null;
    return { first: f || l, last: l || f };
  } catch (e) { return null; }
}
try { gasCaptureTouch(); } catch (e) {} // capture the landing touch the moment auth.js parses

// Fire-and-forget business-journey event beacon (client-emittable events only; the
// server enforces the allowlist). Carries the journey id + resolved vehicle so the
// server can materialize the journey. Never blocks the UI.
function gasJourneyEvent(eventType, opts) {
  opts = opts || {};
  try {
    const jid = opts.journeyId || gasJourneyId(opts.vehicle || (typeof sellState !== "undefined" ? sellState.resolvedVehicle : null));
    if (!jid) return;
    const meta = Object.assign({}, opts.metadata || {});
    const attribution = gasAttribution();
    if (attribution && meta.attribution == null) meta.attribution = attribution;
    const body = JSON.stringify({
      kind: "journey", event: eventType, journeyId: jid, anonId: gasAnonId(),
      vehicle: opts.vehicle || (typeof sellState !== "undefined" ? sellState.resolvedVehicle : null) || null,
      dedupKey: opts.dedupKey || null, platformId: opts.platformId || null,
      powersellerId: opts.powersellerId || null, metadata: Object.keys(meta).length ? meta : null
    });
    const url = authApiPath("/api/funnel");
    if (navigator && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); return; }
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch (e) {}
}
// Once-per-browser-tab wrapper (refresh/re-render safe on top of the server dedup).
function gasJourneyEventOnce(eventType, opts) {
  opts = opts || {};
  try {
    const jid = opts.journeyId || gasJourneyId(opts.vehicle || (typeof sellState !== "undefined" ? sellState.resolvedVehicle : null));
    const k = "gas_je_" + eventType + ":" + (jid || "") + (opts.dedupKey ? ":" + opts.dedupKey : "");
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch (e) {}
  gasJourneyEvent(eventType, opts);
}
// 2F: fire-and-forget funnel beacon for client-only steps. Idempotent per-session
// via a stable dedupKey (11e) so a refresh doesn't double-count.
function gasFunnel(event, dedupKey) {
  try {
    const body = JSON.stringify({ event, anonSessionId: gasAnonId(), dedupKey: dedupKey || null });
    const url = authApiPath("/api/funnel");
    if (navigator && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); return; }
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch (e) {}
}
// Fire an event at most once per browser session (dedup within the tab's life).
function gasFunnelOnce(event, dedupKey) {
  try {
    const k = "gas_fe_" + event + (dedupKey ? ":" + dedupKey : "");
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch (e) {}
  gasFunnel(event, dedupKey);
}
function gateAppendCard(html) {
  const msgs = document.getElementById("msgs"); if (!msgs) return;
  const row = document.createElement("div"); row.className = "row sam";
  row.innerHTML = `<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${html}</div></div>`;
  msgs.appendChild(row); try { row.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
}
// Walled-state guard (the wall is real, not cosmetic): once a hard wall renders, further
// search attempts are intercepted with a calm re-acknowledgement instead of starting a
// phantom wizard. The BACKEND already re-blocks every search, so nothing was lossy; this
// stops the confusing UI where a walled user could walk a new (blocked) flow. In-memory
// per session; a page reload re-derives the true state via gateCheckUpfront.
let gasWalledStatus = null;
function gasIsWalled() { return gasWalledStatus; }
function gasSetWalled(status) { gasWalledStatus = status || null; }
function gasClearWalled() { gasWalledStatus = null; }
// Statuses that mean "no more searches until reset / sign-in" (persistent), vs transient
// ones (ip_rate_limited, auth_required) that a retry can clear on its own.
function gasIsWallStatus(s) { return ["daily_limit_reached", "tester_daily_limit_reached", "limit_reached", "account_required", "capacity"].includes(s); }
function gateWalledReack(status) {
  if (status === "account_required" || status === "capacity") {
    gateAppendCard(`<div class="sam-text">You'll need a free account to run another search. <button class="gate-inline-link" onclick="gateCreateAccount()">Create one</button> and I'll pick up right where we left off.</div>`);
  } else if (status === "tester_daily_limit_reached") {
    gateAppendCard(`<div class="sam-text">That's your test searches for today. They reset tomorrow, so I'll be here then.</div>`);
  } else {
    gateAppendCard(`<div class="sam-text">That's your searches for today. They reset tomorrow, so I'll be here then.</div>`);
  }
}
// The subtle "first one's on me" line under the free result (amendment item 2).
function gateAppendFirstFreeLine() {
  gateAppendCard(`<div class="sam-text gate-firstfree">Your first one's on me. <button class="gate-inline-link" onclick="gateCreateAccount()">Create a free account</button> for a search every day. Daily Vroom readers get three, so if you want more, <a class="gate-inline-link" href="https://thedailyvroom.com/subscribe">subscribe</a> free with the same email.</div>`);
}
// Render the calm Sam-voiced card for each gate status (2D refines the copy).
function gateRenderStatus(data) {
  const status = data && data.status;
  if (status === "account_required") {
    gateAppendCard(`<div class="sam-text">That first search was on me. Create a free account for a search every day. Daily Vroom readers get three, so if you want more, <a class="gate-inline-link" href="https://thedailyvroom.com/subscribe">subscribe</a> free with the same email.</div><div class="sell-rec-actions"><button class="primary" onclick="gateCreateAccount()">Create a free account</button></div>`);
  } else if (status === "limit_reached") {
    // MONTHLY wall - now UNREACHABLE for standard tiers (daily-only policy: free +
    // tdv have monthly_searches = null, so reserve_search never returns
    // monthly_limit). Kept only as a defensive handler for any future tier that
    // explicitly sets a monthly cap; the live wall is daily_limit_reached below.
    if ((data.tier || "free") === "tdv") {
      gateAppendCard(`<div class="sam-text">That's this month's searches. I'll have a fresh set for you next month.</div>`);
    } else {
      gateAppendCard(`<div class="sam-text">That's your free searches for this month. Daily Vroom readers get more, on the house. <a class="gate-inline-link" href="https://thedailyvroom.com/subscribe">Join free &rarr;</a></div><div class="sam-text gate-sub">Already a reader? <button class="gate-inline-link" onclick="openSignInCard('Sign in with the email you subscribed with and your searches are yours.')">Sign in with the email you subscribed with</button>.</div>`);
    }
  } else if (status === "daily_limit_reached") {
    // Daily wall (the only per-user limit now). Resets at midnight ET; no monthly
    // credits. Branch by tier: free tier gets the TDV pitch (three a day) plus a
    // refresh affordance so a same-session subscriber upgrades without re-signing-in;
    // TDV tier gets a plain reset line with no subscribe mention.
    const n = Number(data && data.dailyCap) || 1;
    if ((data && data.tier) === "tdv") {
      const line = n > 1 ? `That's your ${n} for today. It resets tomorrow.` : "That's your search for today. It resets tomorrow.";
      gateAppendCard(`<div class="sam-text">${authEsc(line)}</div>`);
    } else {
      gateAppendCard(`<div class="sam-text">That's your search for today. It resets tomorrow. Want three a day? <a class="gate-inline-link" href="https://thedailyvroom.com/subscribe">Subscribe</a> to The Daily Vroom, free, with the email you signed in with.</div><div class="sam-text gate-sub">Already subscribed? <button class="gate-inline-link" onclick="gateRefreshTier()">Refresh your plan</button>.</div>`);
    }
  } else if (status === "tester_daily_limit_reached") {
    // Tester cohort daily wall. No account nag (testers are deliberately account
    // free); resets at midnight ET. Locked copy, no dashes.
    const tn = Number(data && data.dailyCap) || 10;
    gateAppendCard(`<div class="sam-text">That's your ${authEsc(String(tn))} test searches for today. They reset tomorrow. Thanks for helping put me through my paces.</div>`);
  } else if (status === "ip_rate_limited") {
    // Spec C: per-IP cap tripped. Honest, no blame, offers the two real outs.
    gateAppendCard(`<div class="sam-text">A lot of searches are coming from your connection. Sign in, or try again in a bit.</div>`);
  } else if (status === "auth_required") {
    gateAppendCard(`<div class="sam-text">I lost your session. Sign in again and we'll pick up where we left off.</div><div class="sell-rec-actions"><button class="primary" onclick="openSignInCard()">Sign in</button></div>`);
  } else if (status === "capacity") {
    gateAppendCard(`<div class="sam-text">I'm flat out right now. Give it a few minutes, or create a free account and I'll get to your search.</div><div class="sell-rec-actions"><button class="primary" onclick="gateCreateAccount()">Create a free account</button></div>`);
  }
  // Arm the frontend guard so the next input can't start a phantom search behind the wall.
  if (gasIsWallStatus(status)) gasSetWalled(status);
}
function gateCreateAccount() {
  gateStashPendingSearch();
  try { localStorage.setItem("gas_gate_signup", "1"); } catch (e) {}  // #2: mark this as a wall-triggered signup
  openSignInCard("Create a free account to keep going.");
}
// Read a non-HttpOnly cookie by name (gas_free_used, gas_crew, gas_tester).
function gasCookie(name) {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (e) { return null; }
}
// #1 (gate timing): surface the daily limit BEFORE the wizard, not after a full car
// entry. On the search surface, if the visitor has no searches left today, show the
// wall as the first thing. Signed-in users check their real daily remaining (from
// /api/account); anonymous visitors check the free-used cookie the backend sets after
// their one free search. Crew and tester devices bypass unconditionally.
function gateCheckUpfront() {
  try {
    // Crew/tester devices bypass, matching the backend gate, UNLESS realgate is on
    // (?realgate=1). realgate makes a crew device run the real gate for testing, so
    // the upfront wall must appear then too (the backend honors it as forceGate).
    const realgate = (typeof gasRealGate === "function") && gasRealGate();
    if (!realgate && (gasCookie("gas_crew") === "ok" || gasCookie("gas_tester") === "ok")) return false;
    if (typeof authIsSignedIn === "function" && authIsSignedIn()) {
      const d = (typeof authAccount === "function") && authAccount() && authAccount().daily;
      if (d && d.dailyRemaining != null && d.dailyRemaining <= 0) {
        gateShowUpfrontWall({ status: "daily_limit_reached", dailyCap: d.dailyLimit, tier: authAccount().tier });
        return true;
      }
    } else if (gasCookie("gas_free_used")) {
      gateShowUpfrontWall({ status: "account_required" });
      return true;
    }
  } catch (e) {}
  return false;
}
function gateShowUpfrontWall(data) {
  if (typeof hideHero === "function") hideHero();
  if (typeof enterChatState === "function") enterChatState();
  const msgs = document.getElementById("msgs"); if (msgs) msgs.innerHTML = "";
  gateRenderStatus(data);
}
// After a wall-triggered signup, land the user on a clean HOME surface with their
// signed-in state visible (topbar shows their email, quota now active). The saved-
// results surface is hidden for launch, so we no longer route here; the claimed result
// still saves silently for the post-launch results surface. The pending-search stash is
// cleared, never re-run: signup returns them to a fresh search they can now run.
function gateAfterSignup() {
  let gated = false;
  try { gated = localStorage.getItem("gas_gate_signup") === "1"; } catch (e) {}
  try { localStorage.removeItem("gas_gate_signup"); localStorage.removeItem("gas_pending_search"); } catch (e) {}
  if (!gated) return false;
  gasClearWalled();   // fresh account has quota; lift the walled guard
  if (typeof enterHomeState === "function") enterHomeState();
  if (typeof authRenderTopbar === "function") authRenderTopbar();
  return true;
}
// Item 2: a free-tier seller who subscribed to The Daily Vroom mid-wall can refresh
// their plan here without re-signing-in. Forces a live Beehiiv tier re-check; on an
// upgrade with searches left today, they can search again straight away.
async function gateRefreshTier() {
  if (typeof authEnsureAccount !== "function") return;
  const acc = await authEnsureAccount({ forceRecheck: true });
  const tier = acc && acc.tier;
  const d = acc && acc.daily;
  if (tier === "tdv") {
    if (d && d.dailyRemaining != null && d.dailyRemaining > 0) {
      gasClearWalled();   // upgraded and has searches left today: lift the walled guard
      gateAppendCard(`<div class="sam-text">You're all set. The Daily Vroom gives you three a day, so you've got ${authEsc(String(d.dailyRemaining))} more today. Tell me the next car.</div>`);
    } else {
      gateAppendCard(`<div class="sam-text">You're all set on The Daily Vroom's three a day. You've used today's, so I'll see you tomorrow.</div>`);
    }
    if (typeof authRenderTopbar === "function") authRenderTopbar();
  } else {
    gateAppendCard(`<div class="sam-text">I don't see a Daily Vroom subscription on this email yet. Subscribe with the same email you signed in with, then tap refresh again.</div>`);
  }
}
// 11d: stash the search that hit the gate so it resumes after sign-in.
function gateStashPendingSearch() {
  try {
    if (typeof sellState === "undefined" || !sellState.resolvedVehicle) return;
    const snap = {
      resolvedVehicle: sellState.resolvedVehicle, carName: sellState.carName,
      vehicleIdentityValidated: sellState.vehicleIdentityValidated, vehicleDetailSkipped: sellState.vehicleDetailSkipped,
      region: sellState.region, state: sellState.state, price: sellState.price, timeline: sellState.timeline,
      mileage: sellState.mileage, condition: sellState.condition, records: sellState.records, title: sellState.title,
      notes: sellState.notes, sellerPreference: sellState.sellerPreference, involvement: sellState.involvement
    };
    localStorage.setItem("gas_pending_search", JSON.stringify(snap));
  } catch (e) {}
}
function gateResumePendingSearch() {
  try {
    const raw = localStorage.getItem("gas_pending_search"); if (!raw) return false;
    localStorage.removeItem("gas_pending_search");
    const snap = JSON.parse(raw); if (!snap || !snap.resolvedVehicle || typeof sellState === "undefined") return false;
    Object.assign(sellState, snap); sellState.active = true;
    if (typeof hideHero === "function") hideHero();
    if (typeof enterChatState === "function") enterChatState();
    if (typeof showSellRecommendation === "function") { showSellRecommendation(); return true; }
  } catch (e) {}
  return false;
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", authBoot);
  else authBoot();
}
