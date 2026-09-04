// Homepage shell (Stage A). A new shell around the EXISTING send() flow: the
// input is the same #inp/#btn the wizard uses, so submitting is byte-identical
// to today's entry path. Stage B items are stubbed and tagged STAGE_B in code.

// Hero supporting line (no dash; the global no-dash rule now has zero exceptions).
const HERO_SUPPORTING = "I'll recommend where I'd sell your vehicle and show you exactly why.";

// Rotating placeholder: real, resolver-parseable examples.
const PLACEHOLDER_EXAMPLES = ["2021 Porsche 911 GT3 Touring", "1987 Ferrari Testarossa", "2005 Ford GT"];

// ---- Learn page copy (prose, Paddock system, no dashes) ----
const LEARN_HOW = {
  title: "How Sam works",
  sections: [
    { h: "What we look at", body: "Sam analyzes recent auction results, platform performance and timing patterns before making a recommendation. For your exact vehicle, we look at where comparable vehicles have actually sold and how those results compare across platforms. We never value your vehicle and never predict a price. Every claim states the scope it was measured at and the time window it covers, so you always know what a number is based on." },
    { h: "How the comparison works", body: "We start narrow, at your exact year and trim, and only widen the scope when the close data is too thin to be useful. When we widen, we say so. The recommendation is the platform where vehicles like yours have found the strongest, most consistent results, judged on recent sold records rather than opinion." },
    { h: "Where the recommendation comes from", body: "The recommendation itself comes from our own algorithm. We built the ranking rules, the evidence thresholds, and the honesty gates ourselves. The sales data informs it, but the judgement of where your vehicle should sell is ours." },
    { h: "What we never do", body: "We never value your vehicle, and we never invent a number. Every figure you see comes from real records. We hold no platform fee data and never state fees as fact. If the data is thin, we tell you plainly and give an honest read rather than a confident guess." },
    { h: "Platform or PowerSeller", body: "Sometimes the answer is a platform you list on yourself. For some vehicles, we may suggest speaking to a PowerSeller, someone who runs the whole sale for you for a fee. A PowerSeller is a hands off choice, not a way to get more money, and the platform read stands either way. Nobody pays to be recommended here." }
  ]
};
const LEARN_PLATFORMS = {
  title: "Selling Platforms",
  intro: "Sam compares recent sold results across the online auction platforms we track. Here is a short note on each, with more online platforms being added.",
  platforms: [
    { name: "Bring a Trailer", body: "One of the largest online enthusiast auction audiences, strong across a wide range of collector and enthusiast vehicles. We track its sold results." },
    { name: "Cars & Bids", body: "An online auction platform with a particularly strong audience for late model performance and enthusiast vehicles. We track its sold results." },
    { name: "Hagerty Marketplace", body: "An online marketplace connected to the wider classic car world, spanning classics and modern collectibles. We track its sold results." },
    { name: "PCarMarket", body: "An online auction platform with a deep Porsche and enthusiast following. We track its sold results." },
    { name: "Hemmings", body: "A long-established US marketplace for classic and collector vehicles, with deep roots in classic American and vintage vehicles. We track its sold results." },
    { name: "Sotheby's Motorsport (SOMO)", body: "An online marketplace carrying the Sotheby's Motorsport name, for collector and enthusiast vehicles. We track its sold results." },
    { name: "MB Market", body: "An online marketplace dedicated to Mercedes-Benz, from classics to modern collectibles. We track its sold results for Mercedes-Benz vehicles." }
  ],
  outro: "More online platforms are being added as we widen the data we track."
};
const HP_REASSURANCE = "Recommendations are based on recent auction results and platform performance.";

// ---- state ----
let __phTimer = null, __phIndex = 0, __phStopped = false;

function enterHomeState() {
  if (typeof document === "undefined" || !document.body || !document.body.classList) return;
  document.body.classList.remove("chat"); document.body.classList.add("home");
  const msgs = document.getElementById("msgs");
  if (msgs) msgs.innerHTML = homeHeroHTML();
  // PULSE_RAIL: the TODAY'S MARKET sidebar section is removed pre-Phase-3, so the
  // pulse is not rendered. The pipeline (refreshDailyPulse/dailyPulse.json/
  // api/dailyPulse) stays live; re-enable by restoring the rail section in
  // index.html and this call: loadDailyPulse();
  const inp = document.getElementById("inp");
  if (inp) { try { inp.focus(); } catch (e) {} }
  // C5: rotation only ever runs on the fresh homepage; reset the stop flag so a
  // return home (New conversation) starts the example rotation again.
  __phStopped = false;
  startPlaceholderRotation();
  if (typeof gasGuestNudge === "function") gasGuestNudge();  // guest-link "claim your 30" prompt
}
function enterChatState() {
  if (typeof document === "undefined" || !document.body || !document.body.classList) return;
  document.body.classList.remove("home"); document.body.classList.add("chat");
  stopPlaceholderRotation();
}

// ---- rotating placeholder ----
function startPlaceholderRotation() {
  const inp = document.getElementById("inp");
  if (!inp || __phTimer || __phStopped) return;
  inp.placeholder = PLACEHOLDER_EXAMPLES[0];
  __phTimer = setInterval(() => {
    const el = document.getElementById("inp");
    if (!el || __phStopped) return;
    el.classList.add("ph-fade");
    setTimeout(() => {
      __phIndex = (__phIndex + 1) % PLACEHOLDER_EXAMPLES.length;
      el.placeholder = PLACEHOLDER_EXAMPLES[__phIndex];
      el.classList.remove("ph-fade");
    }, 260);
  }, 3000);
}
function stopPlaceholderRotation() {
  __phStopped = true;
  if (__phTimer) { clearInterval(__phTimer); __phTimer = null; }
  // C5: replace the frozen rotating car example with a quiet contextual placeholder
  // so the homepage example never lingers in the wizard/chat input mid-conversation.
  const inp = document.getElementById("inp");
  if (inp) inp.placeholder = "Type your answer";
}

// ---- dashboard cards ----
async function loadDailyPulse() {
  let pulse = null;
  try {
    const res = await fetch(apiPath("/api/dailyPulse"));
    if (res.ok) pulse = await res.json();
  } catch (e) { /* render nothing rather than a fake state */ }
  renderMarketCards(pulse);
}
function trendClass(dir) { return dir === "up" ? "up" : dir === "down" ? "down" : "flat"; }
function pulseCardHTML(card) {
  if (!card) return "";
  const quiet = card.state === "quiet";
  let lineHTML;
  if (quiet) lineHTML = escapeHtml(card.line);
  else if (card.id === "category_strength" && Array.isArray(card.makes)) {
    lineHTML = card.makes.map(m => `${escapeHtml(m.make)} <span class="${trendClass(m.dir)}">${escapeHtml(m.chip)}</span>`).join(", ");
  } else {
    lineHTML = `<span class="${trendClass(card.dir)}">${escapeHtml(card.line)}</span>`;
  }
  return `<div class="pulse-card${quiet ? " quiet" : ""}" onclick="pulseCardClick()">
    <div class="pc-title">${escapeHtml(card.title)}</div>
    <div class="pc-line">${lineHTML}</div>
  </div>`;
}
function renderMarketCards(pulse) {
  const cards = (pulse && Array.isArray(pulse.cards)) ? pulse.cards : [];
  const html = cards.map(pulseCardHTML).join("");
  for (const id of ["market-cards-desktop", "market-cards-mobile"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}
// Guest click-through: the future details view. STAGE_B wires the real page.
function pulseCardClick() {
  showHpDialog(
    "Market insights",
    "Market insights are for signed-in users. Sign up free to unlock.",
    `<button class="primary" disabled data-stage-b="signup">Sign-in arrives shortly</button>
     <button class="ghost" onclick="closeHpDialog()">Close</button>`
  );
}

// ---- dialog ----
function showHpDialog(title, body, actionsHTML) {
  if (typeof document === "undefined" || !document.getElementById) return;
  closeHpDialog();
  const scrim = document.createElement("div");
  scrim.className = "hp-dialog-scrim"; scrim.id = "hp-dialog-scrim";
  scrim.onclick = e => { if (e.target === scrim) closeHpDialog(); };
  scrim.innerHTML = `<div class="hp-dialog"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><div class="hp-dialog-actions">${actionsHTML}</div></div>`;
  document.body.appendChild(scrim);
}
function closeHpDialog() {
  const s = document.getElementById("hp-dialog-scrim");
  if (s && s.remove) s.remove();
}

// ---- STAGE B stubs (visible, not yet active) ----
// STAGE_B: sign-in, referral panel, settings/profile modal all wire here.
function openSettings() {
  showHpDialog("Settings", "Theme and account preferences are coming soon. For now, GoAskSam follows your device's light or dark appearance automatically.", `<button class="ghost" onclick="closeHpDialog()">Close</button>`);
}
function stageBStub(label) {
  showHpDialog(String(label || "This feature"), "Arriving shortly. Sign-in and accounts land in the next release.", `<button class="ghost" onclick="closeHpDialog()">Close</button>`);
}

// ---- left-rail active state ----
// The clicked rail item keeps a persistent highlight (same tint as hover) so
// the current section reads as active. A full navigation home (logo) reloads
// the page and clears it. Stub items never take the active state.
function setActiveNav(el) {
  if (typeof document === "undefined" || !document.querySelectorAll) return;
  try {
    document.querySelectorAll(".hp-navitem.active").forEach(n => n.classList.remove("active"));
    if (el && el.classList && !el.classList.contains("stub")) el.classList.add("active");
  } catch (e) { /* non-fatal: active state is cosmetic */ }
}

// ---- hamburger (mobile) ----
function toggleRail(force) {
  if (typeof document === "undefined" || !document.body || !document.body.classList) return;
  const open = typeof force === "boolean" ? force : !document.body.classList.contains("rail-open");
  document.body.classList.toggle("rail-open", open);
}

// ---- Learn pages (prose articles into #msgs, chat state) ----
function renderArticleShell(innerHTML) {
  enterChatState();
  toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  msgs.innerHTML = `<div class="hp-article"><button class="hp-back" onclick="newConversation()">&larr; Back to home</button>${innerHTML}</div>`;
  msgs.scrollTop = 0;
}
// "How Sam decides" (editorial page; locked copy). Person-case Sam throughout,
// no dashes. Content sits on the cream canvas with typography + thin rules; cards
// only for the three-card row.
// showHowItWorks / showPowerSellers REMOVED (Sep 2026): this content now lives ONLY on

// Spec E: "Your results" surface. Lists the signed-in user's saved results with
// a "Saved {date}" label (conditional year), a staleness note + "Run it fresh"
// chip once older than the dial, and never mutates the stored result itself.
function savedDateLabel(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return "Saved";
  const mo = d.toLocaleDateString(undefined, { month: "long" }), day = d.getDate(), y = d.getFullYear();
  return y === new Date().getFullYear() ? `Saved ${mo} ${day}` : `Saved ${mo} ${day}, ${y}`;
}
// Mid-wizard guard: opening a saved result (or "View all") while a wizard search is in
// progress (active, no result yet) asks first. Proceed on confirm, stay put on cancel.
function savedMidWizardActive() {
  return !!(typeof sellState !== "undefined" && sellState && sellState.active && !sellState.sellDecision);
}
function savedConfirmLeave() {
  if (!savedMidWizardActive()) return true;
  const car = (typeof sellState !== "undefined" && sellState && sellState.carName) || "current vehicle";
  try { return window.confirm(`You're mid-search on the ${car}. Open this result and start over?`); }
  catch (e) { return true; }
}
// Reject a promise if it does not settle in time, so a hung request surfaces the honest
// error fallback the callers already have instead of an eternal "Loading..." state.
function __withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error((label || "request") + " timed out")), ms))
  ]);
}
// Shared list fetch. Re-fetches on EVERY call (never cached) so a just-completed search
// shows immediately on the next open/expand, no page reload. Time-boxed: token refresh or
// the fetch can never hang the UI forever (the "Loading..." stuck bug).
async function fetchSavedResultsList() {
  const work = (async () => {
    // Use the REFRESHED token (same path as authEnsureAccount), not the raw stored
    // access_token: a session open past the token lifetime would otherwise send an expired
    // token and 401. authValidToken refreshes via the refresh_token first.
    const token = (typeof authValidToken === "function")
      ? await authValidToken()
      : (((typeof authGetSession === "function" && authGetSession()) || {}).access_token);
    if (!token) return { status: "auth" };
    const res = await fetch(apiPath("/api/account"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "savedResults" })
    });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") throw new Error((data && data.error) || "failed");
    return { status: "ok", results: data.results || [] };
  })();
  return await __withTimeout(work, 15000, "saved results");
}
const __savedEsc = s => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s));
// One list row (date . car -> platform . partner), clickable to reopen. compact=rail submenu.
function savedRowHTML(r, compact) {
  const plat = r.pick ? (typeof platformDisplayName === "function" ? platformDisplayName(r.pick) : r.pick) : null;
  const pickLine = plat ? `${__savedEsc(plat)}${r.partner ? ` &middot; ${__savedEsc(r.partner)}` : ""}` : "";
  return `<button class="saved-row${compact ? " saved-row-compact" : ""}" onclick="reopenSavedResult('${__savedEsc(r.id)}')">
    <span class="saved-row-date">${__savedEsc(savedShortDate(r.createdAt))}</span>
    <span class="saved-row-car">${__savedEsc(r.car)}</span>
    ${pickLine ? `<span class="saved-row-arrow">&rarr;</span><span class="saved-row-pick">${pickLine}</span>` : ""}
  </button>`;
}
// Full list in the main content area ("View all", and the empty/entry point).
async function showSavedResults() {
  if (!savedConfirmLeave()) return;
  if (typeof sellState !== "undefined" && sellState) sellState.active = false; // leaving the wizard for the list
  enterChatState();
  if (typeof toggleRail === "function") toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  const shell = body => `<div class="hp-decides"><button class="hp-back" onclick="newConversation()">&larr; Back to home</button>
    <section class="hd-hero"><div class="hp-script">Everything you've run.</div><h1 class="hd-h1">Your results.</h1></section>${body}</div>`;
  msgs.innerHTML = shell(`<section class="hd-sec"><p>Loading your results...</p></section>`);
  msgs.scrollTop = 0;
  let out = null;
  try { out = await fetchSavedResultsList(); }
  catch (e) { msgs.innerHTML = shell(`<section class="hd-sec"><p>I couldn't load your results right now. Try again in a moment.</p></section>`); return; }
  if (out.status === "auth") { msgs.innerHTML = shell(`<section class="hd-sec"><p>Sign in to see your saved results.</p></section>`); return; }
  const results = out.results;
  if (!results.length) {
    msgs.innerHTML = shell(`<section class="hd-sec"><p>Nothing saved yet. Every search you run gets saved here.</p>
      <button class="hd-cta" onclick="startSellFlow()">Sell my vehicle &rarr;</button></section>`);
    return;
  }
  const rows = results.map(r => savedRowHTML(r, false)).join("");
  msgs.innerHTML = shell(`<section class="hd-sec" style="display:flex;flex-direction:column;gap:2px">${rows}</section>`);
  msgs.scrollTop = 0;
}
// Rail submenu: expand/collapse "Your results" INLINE (recent 10 + View all). Never
// navigates the main area; re-fetches on every expand. Mobile: expanding does NOT close
// the drawer (only choosing a specific result / View all does, via their own toggleRail).
let __savedSubmenuOpen = false;
async function toggleSavedSubmenu() {
  const sub = document.getElementById("saved-submenu");
  const caret = document.getElementById("saved-caret");
  const toggle = document.querySelector(".saved-toggle");
  if (!sub) return;
  __savedSubmenuOpen = !__savedSubmenuOpen;
  if (caret) caret.style.transform = __savedSubmenuOpen ? "rotate(90deg)" : "";
  if (toggle) toggle.setAttribute("aria-expanded", __savedSubmenuOpen ? "true" : "false");
  if (!__savedSubmenuOpen) { sub.style.display = "none"; return; }
  sub.style.display = "block";
  sub.innerHTML = `<div class="saved-submenu-msg">Loading...</div>`;
  let out = null;
  try { out = await fetchSavedResultsList(); }
  catch (e) { if (__savedSubmenuOpen) sub.innerHTML = `<div class="saved-submenu-msg">Couldn't load. Try again.</div>`; return; }
  if (!__savedSubmenuOpen) return; // collapsed while loading
  if (out.status === "auth") { sub.innerHTML = `<div class="saved-submenu-msg">Sign in to see your results.</div>`; return; }
  if (!out.results.length) { sub.innerHTML = `<div class="saved-submenu-msg">Nothing saved yet.</div>`; return; }
  const rows = out.results.slice(0, 10).map(r => savedRowHTML(r, true)).join("");
  const viewAll = `<button class="saved-viewall" onclick="showSavedResults()">View all${out.results.length > 10 ? ` (${out.results.length})` : ""} &rarr;</button>`;
  sub.innerHTML = rows + viewAll;
}
// Short date for list rows + the as-of line: "Aug 26" (adds the year if not this year).
function savedShortDate(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  const mo = d.toLocaleDateString(undefined, { month: "short" }), day = d.getDate(), y = d.getFullYear();
  return y === new Date().getFullYear() ? `${mo} ${day}` : `${mo} ${day}, ${y}`;
}
// Latest-click-wins guard (scenario 1): clicking A then B must never let A's slower fetch
// overwrite B's card. Each click bumps the sequence; a resolved fetch renders only if it
// is still the latest.
let __reopenSeq = 0;
let __reopenCar = null;
let __reopenPayload = null;
async function reopenSavedResult(id) {
  if (!savedConfirmLeave()) return;   // mid-wizard: confirm before opening a saved result
  const seq = ++__reopenSeq;
  if (typeof enterChatState === "function") enterChatState();
  if (typeof toggleRail === "function") toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  msgs.innerHTML = `<div class="row sam"><div class="row-inner"><div class="msg-wrap"><div class="sam-text">Opening your result...</div></div></div></div>`;
  msgs.scrollTop = 0;
  let payload = null, createdAt = null;
  try {
    // REFRESHED token (matches authEnsureAccount / fetchSavedResultsList): an expired
    // stored access_token in a long-open session caused every saved result to fail to open
    // with "I couldn't open that result" while the user was still signed in. Refresh first.
    // Time-boxed so a hung refresh/fetch surfaces the error fallback, never eternal loading.
    const data = await __withTimeout((async () => {
      const token = (typeof authValidToken === "function")
        ? await authValidToken()
        : (((typeof authGetSession === "function" && authGetSession()) || {}).access_token);
      if (!token) return { __noToken: true };
      const res = await fetch(apiPath("/api/account"), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "savedResult", id })
      });
      const j = await res.json();
      if (!res.ok || j.status !== "ok" || !j.payload) throw new Error("failed");
      return j;
    })(), 15000, "saved result");
    if (seq !== __reopenSeq) return;               // a newer click won; drop this stale render
    if (data.__noToken) { if (seq === __reopenSeq) { msgs.innerHTML = ""; addMsg("sam", "Sign in to see your saved results."); } return; }
    payload = data.payload; createdAt = data.createdAt;
  } catch (e) {
    if (seq === __reopenSeq) { msgs.innerHTML = ""; addMsg("sam", "I couldn't open that result right now. Try again in a moment."); }
    return;
  }
  if (seq !== __reopenSeq) return;
  // Reconstruct the few client fields the render reads; everything else is the payload.
  const v = payload.vehicle || {};
  const crit = payload.sellerCriteria || {};
  __reopenCar = [v.year, v.make, v.model].filter(Boolean).join(" ") || v.raw || "your vehicle";
  __reopenPayload = payload;   // full snapshot, so Re-run can replay the saved criteria
  sellState.resolvedVehicle = v;
  sellState.carName = __reopenCar;
  sellState.vehicleIdentityValidated = true;
  sellState.sellerPreference = crit.sellerPreference || null;
  sellState.region = crit.region || sellState.region;
  sellState.state = crit.state || sellState.state;
  sellState.chosen = null;
  sellState.selectedPowerSellerId = null;
  // As-of line + Re-run, above the (identical) card composite.
  msgs.innerHTML = "";
  const asOf = savedShortDate((payload.analysis && payload.analysis.analysisDate) || createdAt);
  const header = document.createElement("div");
  header.className = "row sam";
  header.innerHTML = `<div class="row-inner"><div class="msg-wrap">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:2px 0 10px">
      <span style="font-family:var(--font-sans,inherit);font-size:13px;color:var(--slate,#6B6861);font-weight:600">Sam's read as of ${escapeHtml(asOf)}</span>
      <button onclick="rerunSavedResult()" style="padding:8px 14px;font-family:var(--font-sans,inherit);font-size:13px;font-weight:600;border:1px solid #171717;border-radius:10px;background:var(--paper,#fff);color:#171717;cursor:pointer">Re-run this search</button>
    </div>
  </div></div>`;
  msgs.appendChild(header);
  if (typeof renderDecision === "function") renderDecision(payload, { reopened: true });
  msgs.scrollTop = 0;
}
// "Re-run this search": one click -> one fresh sellerDecision with the SAVED criteria,
// no re-asked questions. Restores the full saved state (resolved vehicle incl. trim +
// every sellerCriteria field) and calls showSellRecommendation directly, bypassing the
// wizard. Must NOT route through startSellFlow(carString): that re-resolves the bare car
// and drops into the wizard's trim-clarification step (the reported bug). Clears the
// reopened snapshot first so the fresh flow REPLACES it, never stacks below it. The gate
// runs normally inside showSellRecommendation's fetch, so exactly one search is consumed
// (and the backend inserts a NEW saved row, leaving the snapshot intact).
function rerunSavedResult() {
  const payload = __reopenPayload;
  if (!payload) return;
  // Wall / upfront gate first, so a capped seller is told before we clear the view.
  if (typeof gasIsWalled === "function" && gasIsWalled()) { if (typeof gateWalledReack === "function") gateWalledReack(gasIsWalled()); return; }
  if (typeof gateCheckUpfront === "function" && gateCheckUpfront()) return;
  const v = payload.vehicle || {};
  const crit = payload.sellerCriteria || {};
  sellState.resolvedVehicle = v;
  sellState.carName = [v.year, v.make, v.model].filter(Boolean).join(" ") || v.raw || "your vehicle";
  sellState.vehicleIdentityValidated = true;   // send the resolved vehicle (incl. trim) as-is
  sellState.vehicleDetailSkipped = true;        // accept the saved level; never re-ask trim
  sellState.region = crit.region || null;
  sellState.state = crit.state || null;
  sellState.mileage = crit.mileage || null;
  sellState.condition = crit.condition || null;
  sellState.records = crit.serviceRecords || null;
  sellState.title = crit.title || null;
  sellState.price = crit.targetPrice || null;
  sellState.timeline = crit.timeline || null;
  sellState.involvement = crit.involvement || null;
  sellState.sellerPreference = crit.sellerPreference || null;
  sellState.notes = crit.notes || null;
  sellState.active = true; sellState.step = 12; sellState.chosen = null; sellState.selectedPowerSellerId = null;
  sellState.returnToConfirm = false; sellState.noEvidenceFallback = null; sellState.sellOptions = []; sellState.powerSellerProfiles = [];
  // Replace the reopened snapshot with the fresh flow, don't stack under it.
  if (typeof enterChatState === "function") enterChatState();
  const msgs = document.getElementById("msgs"); if (msgs) { msgs.innerHTML = ""; msgs.scrollTop = 0; }
  try { window.scrollTo && window.scrollTo(0, 0); } catch (e) {}
  if (typeof showSellRecommendation === "function") showSellRecommendation();
}
// Back-compat: old stale-row entry point, same behavior.
function runSavedFresh(btn) {
  const car = btn && btn.getAttribute("data-car");
  if (car && typeof startSellFlow === "function") startSellFlow(car, false);
}

// PowerSellers page (editorial; locked copy). Reached from the rail and from the
// "How we choose PowerSellers" link on How Sam decides. The named roster comes
// later, post-briefing.
// the static pages /how-sam-decides and /powersellers (single source; the rail links open
function showSellingPlatforms() {
  const body = LEARN_PLATFORMS.platforms.map(p => `<h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.body)}</p>`).join("");
  renderArticleShell(`<h1>${escapeHtml(LEARN_PLATFORMS.title)}</h1><p>${escapeHtml(LEARN_PLATFORMS.intro)}</p>${body}<p>${escapeHtml(LEARN_PLATFORMS.outro)}</p>`);
}

// ---- 2E: the hunt door (buyer demand capture) ----
// Available to every signed-in account. No matching, no results, no timing
// promise - just capture what they're hunting.
function showHuntPage() {
  if (typeof authIsSignedIn === "function" && !authIsSignedIn()) {
    renderArticleShell(`<h1>Buying?</h1><p>Sam's working on it. Sign in and tell him what you're hunting, and you'll hear from him when it goes live.</p><div><button class="primary hunt-signin" onclick="openSignInCard('Sign in to tell Sam what you\\'re hunting.')">Sign in</button></div>`);
    return;
  }
  renderHuntForm();
}
function renderHuntForm() {
  renderArticleShell(`<h1>Buying?</h1><p>Sam's working on it. Tell him what you're hunting.</p>
    <textarea id="hunt-text" class="hunt-textarea" rows="4" placeholder="e.g. Clean 1973 911 Carrera RS, driver grade, under $500k"></textarea>
    <div><button class="primary hunt-submit" onclick="submitHunt()">Tell Sam</button></div>`);
  const t = document.getElementById("hunt-text"); if (t) { try { t.focus(); } catch (e) {} }
}
async function submitHunt() {
  const el = document.getElementById("hunt-text");
  const text = String(el && el.value || "").trim();
  if (!text) { if (el) el.focus(); return; }
  const btn = document.querySelector(".hunt-submit");
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
  try {
    const r = await fetch(apiPath("/api/hunts"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.status === 401) { if (typeof openSignInCard === "function") openSignInCard("Sign in to tell Sam what you're hunting."); if (btn) { btn.disabled = false; btn.textContent = "Tell Sam"; } return; }
    if (!r.ok) throw new Error("failed");
    renderArticleShell(`<h1>Noted.</h1><p>You'll hear from me when this goes live. Want to add another? <button class="gate-inline-link" onclick="renderHuntForm()">Tell me about another vehicle</button>.</p>`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Tell Sam"; }
    const page = document.querySelector(".hp-article");
    if (page) { const err = document.createElement("div"); err.className = "hunt-confirm"; err.textContent = "I couldn't save that just now. Try again in a moment."; page.appendChild(err); }
  }
}

// ---- boot (browser only; harness-safe) ----
function bootHomepage() {
  try { enterHomeState(); } catch (e) {}
  // #1 (gate timing): homepage.js is the last boot script, so the home surface it
  // just painted would otherwise overwrite the upfront limit wall authBoot rendered.
  // Re-run the check here so the wall is the final word for a depleted anonymous
  // visitor (the signed-in case re-checks in authBoot after the async account load).
  try { if (typeof gateCheckUpfront === "function") gateCheckUpfront(); } catch (e) {}
}
if (typeof document !== "undefined" && document.body && document.body.classList
  && typeof document.body.classList.contains === "function" && document.body.classList.contains("home")) {
  if (document.getElementById("inp") && typeof document.getElementById("inp").addEventListener === "function") {
    // Stop the placeholder rotation the moment the user types.
    document.getElementById("inp").addEventListener("input", () => stopPlaceholderRotation());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootHomepage);
  else bootHomepage();
}
