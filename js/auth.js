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
  const field = document.getElementById("auth-email");
  const email = String(field && field.value || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { authCardError("That doesn't look like an email. Mind checking it?"); return; }
  authStashConsent(authReadConsentCheckbox());
  try {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/otp`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
      body: JSON.stringify({ email, options: { email_redirect_to: location.origin + location.pathname } })
    });
    if (!res.ok) { authCardError("I couldn't send the link just now. Try again in a moment."); return; }
    authRenderCheckEmail(email);
  } catch (e) { authCardError("I couldn't send the link just now. Try again in a moment."); }
}
async function authSignOut() {
  const cfg = await authConfig(); const s = authGetSession();
  authSetSession(null); __authAccount = null;
  if (cfg && s && s.access_token) { try { fetch(`${cfg.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${s.access_token}` } }); } catch (e) {} }
  authRenderTopbar();
}

// ---------------- account ensure ----------------
async function authEnsureAccount() {
  const token = await authValidToken(); if (!token) return null;
  const consent = authPopConsent();
  try {
    const res = await fetch(authApiPath("/api/account"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(consent === undefined ? {} : { marketingConsent: consent })
    });
    if (!res.ok) { if (res.status === 401) authSetSession(null); return null; }
    const acc = await res.json();
    __authAccount = { email: acc.email, tier: acc.tier, marketingConsent: acc.marketingConsent };
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
    if (pre) { __authPrefillEmail = pre; u.searchParams.delete("email"); history.replaceState(null, "", u.pathname + (u.search || "") + (u.hash || "")); }
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
    authSetSession({ access_token, refresh_token, expires_at });
    history.replaceState(null, "", location.pathname + location.search); // scrub the hash
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
  authCloseModal();
  const scrim = document.createElement("div");
  scrim.className = "hp-dialog-scrim"; scrim.id = "auth-modal";
  scrim.onclick = e => { if (e.target === scrim) authCloseModal(); };
  const prefill = authEsc(__authPrefillEmail || "");
  scrim.innerHTML = `<div class="hp-dialog auth-dialog">
    <h3>Sign in to GoAskSam</h3>
    <p>${authEsc(subtitle || "Create a free account to run more searches and keep your results.")}</p>
    <button class="auth-google" onclick="authSignInGoogle()">Continue with Google</button>
    <div class="auth-or"><span>or</span></div>
    <label class="auth-label" for="auth-email">Email me a magic link</label>
    <input id="auth-email" class="auth-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${prefill}" />
    <button class="auth-email-btn" onclick="authSignInEmail()">Email me a link</button>
    <label class="auth-consent-row"><input id="auth-consent" type="checkbox" /> <span>Send me Sam's market notes</span></label>
    <div id="auth-error" class="auth-error" style="display:none"></div>
    <div class="auth-fineprint">No passwords. We email you a one-time link. Marketing notes only if you tick the box.</div>
  </div>`;
  document.body.appendChild(scrim);
  const f = document.getElementById("auth-email"); if (f && !prefill) { try { f.focus(); } catch (e) {} }
}
function authRenderCheckEmail(email) {
  const d = document.querySelector("#auth-modal .auth-dialog");
  if (!d) return;
  d.innerHTML = `<h3>Check your email</h3>
    <p>I sent a sign-in link to <strong>${authEsc(email)}</strong>. Click it and you're in. You can close this.</p>
    <button class="auth-email-btn" onclick="authCloseModal()">Done</button>`;
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
}

// ---------------- boot ----------------
async function authBoot() {
  authScrubPrefill();
  const returned = authHandleCallback();
  authRenderTopbar();               // immediate paint from stored session
  if (authIsSignedIn()) {
    await authEnsureAccount();       // create/refresh the account row (+ apply consent)
    authRenderTopbar();              // repaint with the resolved email/tier
  }
  if (returned) authCloseModal();    // if we just came back from a door, drop any stale modal
}
if (typeof document !== "undefined" && document.addEventListener) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", authBoot);
  else authBoot();
}
