// The one-direction Sell page client (Lane C, Oct 2026; behind SELL_NEXT_ON). It runs INSIDE the /sell
// page shell (index.html via api/sellPage.js sellShellHtml, styles.css): the same hero, the same centred
// input box, body.home kept so nothing pins to the bottom. Each question is a card in the middle of the
// page with the input directly under it; the result uses the existing /sell result card classes
// (.sell-rec-header, .sell-rec-card.primary-rec, .chips/.chip). FLOW_CSS is layout only (width, grid,
// photo size): no colours, type or new design. Data: /api/sellChat {action:"flow"} (lib/sell/sellFlow.js).
export const FLOW_CSS = `
.sflow{width:100%;max-width:640px;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;text-align:left}
.sflow .sf-sum{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6B6861;margin:0 0 10px;font-weight:600}
.sflow .sell-rec-header{margin:0 0 12px}
.sflow .sell-rec-header .chips{margin-top:14px}
.sflow .sf-you{font-size:15px;color:#6B6861;margin:14px 0 8px}
.sflow .sell-rec-card.primary-rec{cursor:default}
.sflow .sell-rec-card.primary-rec:hover{transform:none;box-shadow:none}
.sflow .sf-link{font-size:14px;color:#171717;text-decoration:underline;text-underline-offset:3px}
.sflow .sf-h{font-size:15px;font-weight:850;letter-spacing:-.2px;margin:22px 0 10px;color:#171717}
.sflow .sf-sales{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sflow .sf-sales .sell-rec-card{padding:0;overflow:hidden;gap:0;cursor:default}
.sflow .sf-sales .sell-rec-card:hover{transform:none}
.sflow .sf-ph{display:block;aspect-ratio:3/2;background:#F6F5F2;overflow:hidden}
.sflow .sf-ph img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
.sflow .sf-ph{position:relative}
.sflow .sf-noph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6B6861}
body.home{background:#F4F1EA}
.sflow .sf-tx{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px}
.sflow .sf-tx a{color:#171717;text-decoration:none}
.sflow .psform input{flex:1;min-width:0;border:1px solid #e5e5e2;border-radius:10px;padding:10px 12px;font:inherit}
@media (max-width:640px){.sflow{padding:0 16px}.sflow .sf-sales{grid-template-columns:1fr}.sflow .psform{flex-wrap:wrap}}`;

export const FLOW_CLIENT = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  // The shell's rail calls these (the old wizard's scripts defined them; this page does not load those).
  window.toggleRail = function(force){ var open = typeof force === "boolean" ? force : !document.body.classList.contains("rail-open"); document.body.classList.toggle("rail-open", open); };
  window.setActiveNav = function(){}; window.openSettings = function(){}; window.startSellFlow = function(){ location.reload(); };
  // While the page is switched off, a reviewer opens it with ?key=...; the same key goes on its API calls.
  var KEYQ = (function(){ var k = new URLSearchParams(location.search).get("key"); return k ? "?key=" + encodeURIComponent(k) : ""; })();
  function api(body){ return fetch("/api/sellChat" + KEYQ, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: "flow" }, body)) }).then(function(r){ return r.json(); }); }
  var S = { stage: "car", car: "", picks: [], label: null, state: null, how: null, busy: false, follow: [] };
  var STATES = ["California","Florida","Texas","New York","New Jersey","Arizona"];
  var HOW = [["self","I'll sell it myself"],["handled","I'd like someone to handle it"],["house","Through an auction house"],["unsure","I'm not sure yet"]];
  var msgs = $("msgs"), inp = $("inp"), btn = $("btn");
  function view(html){
    msgs.innerHTML = '<div class="sflow" id="sflow">' + html + "</div>";
    document.querySelectorAll(".hp-home-only").forEach(function(e){ e.style.display = "none"; });
    window.scrollTo({ top: 0 });
  }
  function sumLine(){ return S.label ? '<p class="sf-sum">' + esc([S.label, S.state].filter(Boolean).join(" · ")) + "</p>" : ""; }
  function card(q, chips){
    return '<div class="sell-rec-header"><div class="sell-rec-title">' + esc(q) + "</div>" +
      (chips && chips.length ? '<div class="chips">' + chips.map(function(c){ var k = Array.isArray(c) ? c : [c, c]; return '<button type="button" class="chip" data-chip="' + esc(k[0]) + '">' + esc(k[1]) + "</button>"; }).join("") + "</div>" : "") + "</div>";
  }
  function ask(q, chips, placeholder){
    view(sumLine() + card(q, chips));
    inp.value = ""; inp.placeholder = placeholder || "Type your answer"; try { inp.focus(); } catch(e){}
  }
  function busy(on, label){ S.busy = on; btn.disabled = on; if (on) view(sumLine() + card(label || "Sam is reading...", null)); }
  function carStep(){
    busy(true);
    api({ step: "car", car: S.car, picks: S.picks }).then(function(j){
      busy(false);
      if (j.ask) { S.stage = "narrow"; ask(j.ask.question, j.ask.chips, "Type your answer"); return; }
      if (j.car) { S.label = j.car.label; S.stage = "state"; ask("Which state is it in?", STATES.concat(["Somewhere else"]), "Or type the state"); return; }
      S.stage = "car"; ask("Sam couldn't read that. Which car is it? The make and model is enough, or paste the VIN.", null, "Type your car, or paste a VIN.");
    }).catch(function(){ busy(false); S.stage = "car"; ask("Sam couldn't read that just now. Try again in a moment.", null, "Type your car, or paste a VIN."); });
  }
  function answer(t, key){
    t = String(t || "").trim(); if (S.busy || !t) return;
    if (S.stage === "car") { S.car = t; S.picks = []; carStep(); return; }
    if (S.stage === "narrow") { S.picks.push(t); carStep(); return; }
    if (S.stage === "state") {
      if (/somewhere else/i.test(t)) { S.stage = "stateText"; ask("Where is it?", null, "The state, or the country"); return; }
      S.state = t; S.stage = "how"; ask("How would you like to sell it?", HOW, "Or type it in your own words"); return;
    }
    if (S.stage === "stateText") { S.state = t; S.stage = "how"; ask("How would you like to sell it?", HOW, "Or type it in your own words"); return; }
    if (S.stage === "how") {
      S.how = key || (/handle|someone|powerseller/i.test(t) ? "handled" : /myself|my own|diy/i.test(t) ? "self" : /auction house|house/i.test(t) ? "house" : "unsure");
      S.stage = "result"; result(); return;
    }
    if (S.stage === "done") followAsk(t);
  }
  function salesCard(c){
    var when = c.date ? new Date(c.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
    // No photo on record: the slot says so (never an empty box); a photo, when there is one, covers it.
    var img = '<span class="sf-noph">No photo</span>' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "");
    return '<div class="sell-rec-card"><a class="sf-ph" href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + img + '</a><div class="sf-tx"><div class="sell-rec-name" style="font-size:15px"><a href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + esc(c.title) + '</a></div><div class="sell-rec-type">' + esc([c.house, when].filter(Boolean).join(" · ")) + '</div><div class="sell-rec-reason"><b>Sold $' + Number(c.price).toLocaleString("en-US") + "</b></div></div></div>";
  }
  function result(){
    busy(true, "Sam is reading the sales...");
    api({ step: "result", car: S.label || S.car, state: S.state, how: S.how }).then(function(j){
      busy(false);
      if (!j || !j.rec) { S.stage = "car"; ask("Sam couldn't read that just now. Try again in a moment.", null, "Type your car, or paste a VIN."); return; }
      var r = j.rec, h = '<p class="sf-sum">' + esc([j.label, j.state].filter(Boolean).join(" · ")) + "</p>";
      h += '<div class="sell-rec-card primary-rec"><div class="sell-rec-title">' + esc(r.headline) + "</div>";
      if (r.why) h += '<div class="sell-rec-subtitle" style="font-size:15px;margin-top:0">' + esc(r.why) + "</div>";
      if (r.kind === "powerseller") {
        if (r.note) h += '<div class="sell-rec-reason">' + esc(r.note) + "</div>";
        h += '<form class="psform sell-rec-actions" data-ps="' + esc(r.slug) + '" data-name="' + esc(r.name) + '"><input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email"><button type="submit" class="primary">Get in touch with ' + esc(r.name) + '</button></form><div class="sell-rec-reason psmsg"></div>';
      } else if (r.link) {
        h += '<div><a class="sf-link" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.name) + "'s own page explains how to sell there</a></div>";
      }
      h += "</div>";
      var rc = j.recent || [];
      if (rc.length) h += '<div class="sf-h">The latest sales</div><div class="sf-sales">' + rc.map(salesCard).join("") + "</div>";
      h += '<div class="sf-h">Ask Sam about this</div><div id="fturns"></div>';
      view(h); S.stage = "done";
      inp.value = ""; inp.placeholder = "Ask Sam about this, like: why not Cars & Bids?";
    }).catch(function(){ busy(false); S.stage = "car"; ask("Sam couldn't read that just now. Try again in a moment.", null, "Type your car, or paste a VIN."); });
  }
  function followAsk(q){
    if (S.busy) return; S.busy = true; btn.disabled = true; inp.value = "";
    var box = $("fturns"); box.insertAdjacentHTML("beforeend", '<p class="sf-you">' + esc(q) + '</p><div class="sell-rec-header"><div class="sell-rec-subtitle" style="margin:0">Sam is reading...</div></div>');
    var slot = box.lastElementChild; slot.scrollIntoView({ block: "nearest" });
    api({ step: "ask", car: S.label || S.car, state: S.state, how: S.how, question: q, history: S.follow }).then(function(j){
      var t = (j && j.reply) || "Sam couldn't answer that just now."; S.follow.push({ role: "buyer", text: q }, { role: "sam", text: t });
      slot.innerHTML = '<div class="sell-rec-subtitle" style="margin:0;font-size:15px;color:#171717">' + esc(t) + "</div>";
    }).catch(function(){ slot.innerHTML = '<div class="sell-rec-subtitle" style="margin:0">Sam couldn’t answer that just now. Try again in a moment.</div>'; })
      .then(function(){ S.busy = false; btn.disabled = false; });
  }
  btn.addEventListener("click", function(e){ e.preventDefault(); answer(inp.value); });
  inp.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answer(inp.value); } });
  document.addEventListener("click", function(e){
    var c = e.target.closest && e.target.closest("[data-chip]"); if (c) { e.preventDefault(); answer(c.textContent.trim(), c.getAttribute("data-chip")); }
  });
  document.addEventListener("submit", function(e){
    var f = e.target.closest && e.target.closest(".psform"); if (!f) return; e.preventDefault();
    var email = f.querySelector("input").value.trim(), msg = f.parentNode.querySelector(".psmsg"), name = f.getAttribute("data-name"), b = f.querySelector("button");
    b.disabled = true; b.textContent = "Sending...";
    fetch("/api/submitSellerLead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: { email: email }, car: { raw: S.label || S.car, state: S.state || "" }, choice: { destination: name, destinationType: "powerseller", powerSeller: { slug: f.getAttribute("data-ps") } }, decision: { surface: "sell-flow" } }) })
      .then(function(r){ return r.json(); }).then(function(j){ msg.textContent = j && (j.reference || j.ok || j.status === "submitted") ? "Sent. " + name + " will be in touch." : (j && j.status === "partner_unavailable" ? name + " isn't taking new cars right now." : "That didn't send. Try again in a minute."); b.textContent = "Sent"; })
      .catch(function(){ msg.textContent = "That didn't send. Try again in a minute."; b.disabled = false; b.textContent = "Get in touch with " + name; });
  });
})();`;
