// Homepage shell (Stage A). A new shell around the EXISTING send() flow: the
// input is the same #inp/#btn the wizard uses, so submitting is byte-identical
// to today's entry path. Stage B items are stubbed and tagged STAGE_B in code.

// Hero supporting line (no dash; the global no-dash rule now has zero exceptions).
const HERO_SUPPORTING = "I'll recommend where I'd sell your car and show you exactly why.";

// Rotating placeholder: real, resolver-parseable examples.
const PLACEHOLDER_EXAMPLES = ["2021 Porsche 911 GT3 Touring", "1987 Ferrari Testarossa", "2005 Ford GT"];

// ---- Learn page copy (prose, Paddock system, no dashes) ----
const LEARN_HOW = {
  title: "How Sam works",
  sections: [
    { h: "What we look at", body: "Sam analyzes recent auction results, platform performance and timing patterns before making a recommendation. For your exact car, we look at where comparable cars have actually sold and how those results compare across platforms. We never value your car and never predict a price. Every claim states the scope it was measured at and the time window it covers, so you always know what a number is based on." },
    { h: "How the comparison works", body: "We start narrow, at your exact year and trim, and only widen the scope when the close data is too thin to be useful. When we widen, we say so. The recommendation is the platform where cars like yours have found the strongest, most consistent results, judged on recent sold records rather than opinion." },
    { h: "Where the recommendation comes from", body: "The recommendation itself comes from our own algorithm. We built the ranking rules, the evidence thresholds, and the honesty gates ourselves. The sales data informs it, but the judgement of where your car should sell is ours." },
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
    { name: "Hemmings", body: "A long-established US marketplace for classic and collector cars, with deep roots in classic American and vintage vehicles. We track its sold results." },
    { name: "Sotheby's Motorsport (SOMO)", body: "An online marketplace carrying the Sotheby's Motorsport name, for collector and enthusiast cars. We track its sold results." },
    { name: "AutoHunter", body: "An online auction platform for enthusiast and collector cars. We track its sold results." },
    { name: "MB Market", body: "An online marketplace dedicated to Mercedes-Benz, from classics to modern collectibles. We track its sold results for Mercedes-Benz cars." }
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
function showHowItWorks() {
  enterChatState();
  if (typeof toggleRail === "function") toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  const step = (n, t, b) => `<li><span class="hd-step-n">${n}</span><span class="hd-step-t">${t}</span><span class="hd-step-b">${b}</span></li>`;
  const card = (t, q, b) => `<div class="hd-card"><div class="hd-card-t">${t}</div><div class="hd-card-q">${q}</div><div class="hd-card-b">${b}</div></div>`;
  const know = (h, b) => `<div class="hd-know"><b>${h}</b><span>${b}</span></div>`;
  msgs.innerHTML = `<div class="hp-decides">
    <button class="hp-back" onclick="newConversation()">&larr; Back to home</button>
    <section class="hd-hero">
      <div class="hp-script">This isn't guesswork.</div>
      <h1 class="hd-h1">How Sam decides where I'd sell your car.</h1>
      <p class="hd-lead">Sam analyzes real auction results, platform performance and timing patterns to work out where cars like yours have been getting the strongest results. The data does the heavy lifting. Our own rules and methodology turn it into a recommendation.</p>
      <div class="hd-cred">Built by The Daily Vroom · Tracking this market every day · Never generated by AI</div>
    </section>
    <section class="hd-process">
      <ol class="hd-steps">
        ${step("01", "Your car", "We start with exactly what you're selling.")}
        ${step("02", "Finding comparable sales", "We look first at your exact year, model and trim, then widen the comparison only when necessary.")}
        ${step("03", "Comparing platform performance", "We analyze recent sold results, timing patterns and reserve outcomes across the platforms we track.")}
        ${step("04", "Writing the recommendation", "We turn that evidence into a clear answer about where I'd sell your car and why.")}
      </ol>
      <p class="hd-note">Whenever we widen the comparison beyond your exact car, we'll tell you. Every statistic shows the period and scope it came from.</p>
    </section>
    <section class="hd-cards">
      ${card("Recent sales", "Where have cars like yours actually sold?", "We compare recent completed auctions across the enthusiast platforms we monitor.")}
      ${card("Platform performance", "Where are cars like yours performing strongest?", "Sam looks for meaningful differences between platforms, not simply which one sells the most cars.")}
      ${card("Professional representation", "Who's well suited to handle a car like yours?", "When professional representation makes sense, Sam can match your car with one of our selected PowerSellers.")}
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">The data behind the recommendation</div>
      <p>Sam monitors results from Bring a Trailer, Cars & Bids, Hagerty Marketplace, PCarMarket, Sotheby's Motorsport, Hemmings, AutoHunter and MB Market, with more sources being added. We're interested in what actually happened: what sold, where it sold, when it sold and what it sold for.</p>
      <p>More data isn't automatically better. Sam starts with the closest match to your car and only broadens the comparison when there isn't enough useful evidence.</p>
      <a class="hd-link" onclick="showSellingPlatforms()">More about the platforms we track &rarr;</a>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">Built in-house</div>
      <p>The engine is ours, built over the past year. We built the comparison system that weighs platform results, the rules that govern every claim Sam is allowed to make, and the matching behind our PowerSeller recommendations. It started with the technology we built to track this market every day for The Daily Vroom. The raw sales data comes from the market; everything that turns it into a recommendation was built in-house. No off-the-shelf valuation model, no black box we can't explain. The recommendation itself is never generated by AI. Every claim Sam makes comes from our own rules running on real sales data, and the answer only changes when the market does.</p>
    </section>
    <section class="hd-sec">
      <div class="hp-script">Built by people who live this market.</div>
      <h2 class="hd-h2">From The Daily Vroom</h2>
      <p>GoAskSam grew out of The Daily Vroom, our daily look at the enthusiast auction market. For three years we've covered the platforms, sellers, cars and trends in this market without running a single paid advertisement.</p>
      <p>Along the way we've built free tools for the community, including our Import Calculator, Domestic Shipping Calculator and industry Jobs Board. Sam is the next step: taking the data and knowledge we've accumulated and making it useful when someone has a car to sell.</p>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">This is a beta</div>
      <p>This is an early version, and I'll be honest about what that means: there will be bugs. We've tested it till we're blue in the face, and every so often a new one still turns up. Nothing is ever perfect, and we'd rather put it in front of new eyes than keep polishing in private. If something looks off, use the Feedback link and tell us where the bug sits. This thing improves constantly.</p>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">Why searches are limited</div>
      <p>There's a lot happening behind every Sam recommendation, so while we're opening things up we're keeping usage sensible rather than cutting corners on the data. Daily Vroom readers get 3 searches every day. Everyone else gets 1 a day. Your allowance resets each day, so there are no monthly credits to keep track of. Signing in keeps your results, applies your allowance, and helps us trace bugs when you report them.</p>
    </section>
    <section class="hd-sec">
      <div class="hp-script">Sometimes I'd hand the keys to someone else.</div>
      <p>Not every owner wants to photograph the car, write the listing, answer questions and manage an auction themselves. For some cars, Sam may recommend one of our selected PowerSellers instead.</p>
      <p>That doesn't mean we think they'll magically get you more money. It means we think professional representation may be the better way to sell your particular car.</p>
      <a class="hd-link" onclick="showPowerSellers()">How we choose PowerSellers &rarr;</a>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">A few things you should know</div>
      ${know("We don't value your car.", "Sam recommends how to sell it, not what it's worth.")}
      ${know("We don't invent numbers.", "If we don't have enough useful data, we'll tell you.")}
      ${know("Recommendations aren't for sale.", "Platforms can't pay to be the pick, and PowerSellers can't pay to be the match.")}
      ${know("We show our work.", "When Sam makes a data claim, you'll see the scope and time period behind it.")}
    </section>
    <section class="hd-sec">
      <div class="hp-script">One more thing.</div>
      <p>This is just the start. The roadmap is long, and a lot of what Sam will do next is already in motion. If there's a feature you want, tell us. Some of the best things we've shipped came from readers asking for them.</p>
    </section>
    <div class="hp-script hd-close">You make the decision. Sam just helps you make a better-informed one.</div>
  </div>`;
  msgs.scrollTop = 0;
}

// Spec E: "Your results" surface. Lists the signed-in user's saved results with
// a "Saved {date}" label (conditional year), a staleness note + "Run it fresh"
// chip once older than the dial, and never mutates the stored result itself.
function savedDateLabel(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return "Saved";
  const mo = d.toLocaleDateString(undefined, { month: "long" }), day = d.getDate(), y = d.getFullYear();
  return y === new Date().getFullYear() ? `Saved ${mo} ${day}` : `Saved ${mo} ${day}, ${y}`;
}
async function showSavedResults() {
  enterChatState();
  if (typeof toggleRail === "function") toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  const shell = body => `<div class="hp-decides"><button class="hp-back" onclick="newConversation()">&larr; Back to home</button>
    <section class="hd-hero"><div class="hp-script">Everything you've run.</div><h1 class="hd-h1">Your results.</h1></section>${body}</div>`;
  msgs.innerHTML = shell(`<section class="hd-sec"><p>Loading your results...</p></section>`);
  msgs.scrollTop = 0;
  let data = null;
  try {
    const session = (typeof authGetSession === "function") ? authGetSession() : null;
    const token = session && session.access_token;
    if (!token) { msgs.innerHTML = shell(`<section class="hd-sec"><p>Sign in to see your saved results.</p></section>`); return; }
    const res = await fetch(apiPath("/api/account"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "savedResults" })
    });
    data = await res.json();
    if (!res.ok || data.status !== "ok") throw new Error(data && data.error || "failed");
  } catch (e) {
    msgs.innerHTML = shell(`<section class="hd-sec"><p>I couldn't load your results right now. Try again in a moment.</p></section>`);
    return;
  }
  const results = data.results || [];
  if (!results.length) {
    msgs.innerHTML = shell(`<section class="hd-sec"><p>Nothing saved yet. Every search you run gets saved here.</p>
      <button class="hd-cta" onclick="startSellFlow()">Sell my car &rarr;</button></section>`);
    return;
  }
  const esc = typeof escapeHtml === "function" ? escapeHtml : (s => String(s == null ? "" : s));
  const cards = results.map(r => {
    const pick = r.pick ? (typeof platformDisplayName === "function" ? platformDisplayName(r.pick) : r.pick) : null;
    const stale = r.stale ? `<p class="hd-note" style="margin-top:8px">Sales have landed since, so today's read could differ.</p>
      <button class="hd-link" onclick="runSavedFresh(this)" data-car="${esc(r.car)}">Run it fresh &rarr;</button>` : "";
    return `<section class="hd-sec">
      <div class="hd-eyebrow">${esc(savedDateLabel(r.createdAt))}</div>
      <p style="font-family:var(--pc-serif);font-size:19px;color:var(--pc-ink);margin:0">${esc(r.car)}</p>
      ${pick ? `<p class="hd-note" style="margin-top:4px">Pick: ${esc(pick)}</p>` : ""}
      ${stale}
    </section>`;
  }).join("");
  msgs.innerHTML = shell(cards);
  msgs.scrollTop = 0;
}
// "Run it fresh" starts a NORMAL, quota-consuming search for the same car. The
// stored saved result is never touched.
function runSavedFresh(btn) {
  const car = btn && btn.getAttribute("data-car");
  if (car && typeof startSellFlow === "function") startSellFlow(car, false);
}

// PowerSellers page (editorial; locked copy). Reached from the rail and from the
// "How we choose PowerSellers" link on How Sam decides. The named roster comes
// later, post-briefing.
function showPowerSellers() {
  enterChatState();
  if (typeof toggleRail === "function") toggleRail(false);
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  msgs.innerHTML = `<div class="hp-decides">
    <button class="hp-back" onclick="newConversation()">&larr; Back to home</button>
    <section class="hd-hero">
      <div class="hp-script">Sometimes I'd hand the keys to someone else.</div>
      <h1 class="hd-h1">PowerSellers, and how we choose them.</h1>
      <p class="hd-lead">A PowerSeller is someone who regularly manages auction sales for other people. A good one preps the car, shapes the listing, answers buyer questions, lives in the comments, handles logistics and picks the platform they think gives the car the best shot.</p>
      <p class="hd-lead">They are not automatically better than selling it yourself. For some cars I'd keep it simple and go straight to a platform. For higher-value or specialist cars, speaking to one before deciding can be the smarter move.</p>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">How we choose</div>
      <p>We work with a small number of sellers we know from years covering this market. We look at their track record, what they specialise in and where they're based, and we match by fit: the right seller for the right car, in the right part of the country. Nobody pays to be recommended.</p>
    </section>
    <section class="hd-sec">
      <div class="hd-eyebrow">What it costs</div>
      <p>Every PowerSeller sets their own fee and agrees it with you upfront, before anything is listed. Some charge a percentage of the sale, some a flat fee, sometimes a mix. Each case is a little different.</p>
      <p>The way to think about it is simple: weigh the fee they quote you against what representation returns. A good PowerSeller earns their fee in the result: the right platform, professional photography and presentation, buyer questions handled, and the sale managed start to finish. They will also tell you what is worth fixing before listing and what is not, which often saves money rather than costing it.</p>
      <p>And where we have the data, we show it. When you see a number on a PowerSeller's card, that is how cars they represented have closed against comparable sales.</p>
      <button class="hd-cta" onclick="startSellFlow()">Tell me what you're selling &rarr;</button>
    </section>
  </div>`;
  msgs.scrollTop = 0;
}
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
    renderArticleShell(`<h1>Noted.</h1><p>You'll hear from me when this goes live. Want to add another? <button class="gate-inline-link" onclick="renderHuntForm()">Tell me about another car</button>.</p>`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Tell Sam"; }
    const page = document.querySelector(".hp-article");
    if (page) { const err = document.createElement("div"); err.className = "hunt-confirm"; err.textContent = "I couldn't save that just now. Try again in a moment."; page.appendChild(err); }
  }
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
