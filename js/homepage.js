// Homepage shell (Stage A). A new shell around the EXISTING send() flow: the
// input is the same #inp/#btn the wizard uses, so submitting is byte-identical
// to today's entry path. Stage B items are stubbed and tagged STAGE_B in code.

// The hero supporting line is the ONE exempted constant that may carry an em
// dash (approved verbatim). copyLint exempts this exact string only.
const HERO_SUPPORTING = "I'll recommend where I'd sell your car—and show you exactly why.";

// Rotating placeholder: real, resolver-parseable examples.
const PLACEHOLDER_EXAMPLES = ["2006 Ford GT", "1995 Ferrari F355", "2018 Porsche 911 Carrera GTS", "1970 Chevelle SS", "2021 Porsche 911 GT3 Touring"];

// ---- Learn page copy (prose, Paddock system, no dashes) ----
const LEARN_HOW = {
  title: "How Recommendations Work",
  sections: [
    { h: "What we look at", body: "Sam reads real, recent sold results from the collector car auction platforms we track. For your exact car, we look at where comparable cars have actually sold, and how those results compare across platforms. Every claim states the scope it was measured at and the time window it covers, so you always know what a number is based on." },
    { h: "How the comparison works", body: "We start narrow, at your exact year and trim, and only widen the scope when the close data is too thin to be useful. When we widen, we say so. The recommendation is the platform where cars like yours have found the strongest, most consistent results, judged on recent sold records rather than opinion." },
    { h: "What we never do", body: "We never value your car, and we never invent a number. Every figure you see comes from real records. We hold no platform fee data and never state fees as fact. If the data is thin, we tell you plainly and give an honest read rather than a confident guess." },
    { h: "Platform or PowerSeller", body: "Sometimes the answer is a platform you list on yourself. For some cars, we may suggest speaking to a PowerSeller, someone who runs the whole sale for you for a fee. A PowerSeller is a hands off choice, not a way to get more money, and the platform read stands either way. Nobody pays to be recommended here." }
  ]
};
const LEARN_PLATFORMS = {
  title: "Selling Platforms",
  intro: "Sam compares recent sold results across the online auction platforms we track. Here is a short note on each, with more online platforms being added.",
  platforms: [
    { name: "Bring a Trailer", body: "One of the largest online enthusiast auction audiences, strong across a wide range of collector and enthusiast cars. We track its sold results." },
    { name: "Cars & Bids", body: "An online auction platform with a particularly strong audience for late model performance and enthusiast cars. We track its sold results." },
    { name: "Hagerty Marketplace", body: "An online marketplace connected to the wider classic car world, spanning classics and modern collectibles. We track its sold results." },
    { name: "PCarMarket", body: "An online auction platform with a deep Porsche and enthusiast following. We track its sold results." },
    { name: "Car & Classic", body: "A European online marketplace for classic and collector cars, a newer addition as we broaden coverage." }
  ],
  outro: "More online platforms are being added as we widen the data we track."
};
const HP_REASSURANCE = "Recommendations are based on recent sales, seller performance and market trends.";

// ---- state ----
let __phTimer = null, __phIndex = 0, __phStopped = false;

function enterHomeState() {
  if (typeof document === "undefined" || !document.body || !document.body.classList) return;
  document.body.classList.remove("chat"); document.body.classList.add("home");
  const msgs = document.getElementById("msgs");
  if (msgs) msgs.innerHTML = homeHeroHTML();
  loadDailyPulse();
  const inp = document.getElementById("inp");
  if (inp) { try { inp.focus(); } catch (e) {} }
  startPlaceholderRotation();
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
function stageBStub(label) {
  showHpDialog(String(label || "This feature"), "Arriving shortly. Sign-in and accounts land in the next release.", `<button class="ghost" onclick="closeHpDialog()">Close</button>`);
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
function showHowItWorks() {
  const body = LEARN_HOW.sections.map(s => `<h2>${escapeHtml(s.h)}</h2><p>${escapeHtml(s.body)}</p>`).join("");
  renderArticleShell(`<h1>${escapeHtml(LEARN_HOW.title)}</h1>${body}`);
}
function showSellingPlatforms() {
  const body = LEARN_PLATFORMS.platforms.map(p => `<h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.body)}</p>`).join("");
  renderArticleShell(`<h1>${escapeHtml(LEARN_PLATFORMS.title)}</h1><p>${escapeHtml(LEARN_PLATFORMS.intro)}</p>${body}<p>${escapeHtml(LEARN_PLATFORMS.outro)}</p>`);
}

// ---- boot (browser only; harness-safe) ----
function bootHomepage() { try { enterHomeState(); } catch (e) {} }
if (typeof document !== "undefined" && document.body && document.body.classList
  && typeof document.body.classList.contains === "function" && document.body.classList.contains("home")) {
  if (document.getElementById("inp") && typeof document.getElementById("inp").addEventListener === "function") {
    // Stop the placeholder rotation the moment the user types.
    document.getElementById("inp").addEventListener("input", () => stopPlaceholderRotation());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootHomepage);
  else bootHomepage();
}
