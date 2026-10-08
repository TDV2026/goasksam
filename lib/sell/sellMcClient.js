// The one-direction Sell on Market Check's page (Lane C, Oct 2026; behind SELL_NEXT_ON). The car questions
// ARE Market Check's: One Box's own engine tiers and renderChoice cards (js/onebox.js), unchanged. Once One
// Box has named one car it calls GAS_SELL.onCar and Sell asks the state, how to sell it and how quickly, in
// the same question card (OBX.qscreenHtml). The result uses the OLD /sell result cards (the .pcard family
// from styles.css, which api/sellNext.js inlines from that file, never a copy): the platform card with its
// reason tiles (the words line, the figures line under it behind "See the numbers"), then the PowerSeller
// card, in the agreed order; then Market Check's sale cards (OBX.saleCardHtml) and the follow-up box.
// SELL_MC_CSS is layout only: the card container, three tiles across, the figures toggle, the email form.
export const SELL_MC_CSS = `
.sellpc{container-type:inline-size;--font-sans:var(--sans);margin:0 0 22px}
.sellpc .pcard{grid-template-columns:1fr!important}
.sellpc .pcard-left{padding:30px 34px 30px!important}
.sellpc .pcard-name{font-size:clamp(26px,5.6cqi,44px)!important;line-height:1.08!important;margin-top:14px}
.sellpc .pcard-tiles{grid-template-columns:repeat(3,1fr);margin-top:22px;gap:12px}
.sellpc .pcard-tiles.n1{grid-template-columns:1fr}
.sellpc .pcard-tiles.n2{grid-template-columns:1fr 1fr}
.sellpc .pcard-tile{padding:16px 16px 18px}
.sellpc .pcard-ts{font-size:15px;line-height:1.45;margin-top:8px}
.sellpc .pcard-ts-f{display:block!important}
.sellpc .pcard-cta{display:flex;align-items:center;justify-content:center;text-decoration:none;min-height:54px;margin-top:24px}
@container (max-width:620px){.sellpc .pcard-tiles,.sellpc .pcard-tiles.n2{grid-template-columns:1fr}.sellpc .pcard-left{padding:24px 20px 24px!important}}
.sell-fig{background:none;border:0;padding:0;margin-top:8px;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;color:var(--pc-grey);cursor:pointer;display:block}
.sell-figs{display:block;font-family:var(--pc-mono);font-size:12px;letter-spacing:.02em;color:var(--pc-grey);margin-top:6px}
.sell-temp{display:inline-flex;align-items:center;margin-left:8px;padding:5px 9px;border:1px solid var(--pc-grey);border-radius:999px;font-family:var(--pc-mono);font-size:11px;letter-spacing:.08em;color:var(--pc-grey)}
.sell-ps{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
.sell-ps input{flex:1 1 220px;min-width:0;border:1px solid var(--pc-line);border-radius:14px;padding:14px 16px;font:inherit;font-size:16px;background:#fff}
.sell-ps .pcard-cta{flex:1 1 220px;margin-top:0!important;min-height:52px}
.sell-psmsg{font-size:14px;color:var(--pc-grey);margin:10px 0 0}
.sell-chips{margin-top:12px}`;

export const SELL_MC_CLIENT = String.raw`(function(){
  var P = new URLSearchParams(location.search);
  var KEYQ = P.get("key") ? "?key=" + encodeURIComponent(P.get("key")) : "";
  var UPDATED = (window.GAS_SELL_CFG && window.GAS_SELL_CFG.updated) || "";
  var STATES = ["California","Florida","Texas","New York","New Jersey","Arizona"];
  var HOW = [["self","I'll sell it myself"],["handled","I'd like someone to handle it"],["house","Through an auction house"],["unsure","I'm not sure yet"]];
  // The old /sell timing chips ("How quickly are you looking to sell?").
  var RUSH = [["fast","Want it gone fast"],["month","Within a month"],["none","No rush, right result only"]];
  var S = { stage: null, label: null, name: null, state: null, how: null, rush: null, busy: false, follow: [], result: null };
  function X(){ return window.OBX; }
  function e(s){ return X().esc(s); }
  function api(body){ return fetch("/api/sellChat" + KEYQ, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: "flow" }, body)) }).then(function(r){ return r.json(); }); }
  function chips(list){ return '<div class="chips sell-chips">' + list.map(function(c){ return '<button type="button" class="chip" data-sellchip="' + e(c[0]) + '">' + e(c[1]) + "</button>"; }).join("") + "</div>"; }
  function question(eyebrow, text, list, ph){
    var x = X(); x.root.innerHTML = x.inboxHtml("", ph) + x.qscreenHtml(e(text), list ? chips(list) : "", eyebrow, "") + x.footHtml(); x.wire();
    var i = document.getElementById("ob-input"); if (i) try { i.focus(); } catch(err){}
  }
  function waiting(text){ var x = X(); x.root.innerHTML = x.qscreenHtml(e(text), "", "One moment", "") + x.footHtml(); }
  function answer(t, key){
    t = String(t || "").trim(); if (!t || S.busy) return;
    if (S.stage === "state") { S.state = t; S.stage = "how"; question("Next question", "How would you like to sell it?", HOW, "Or type it in your own words"); return; }
    if (S.stage === "how") {
      S.how = key || (/handle|someone|powerseller/i.test(t) ? "handled" : /myself|my own|diy/i.test(t) ? "self" : /auction house|house/i.test(t) ? "house" : "unsure");
      S.stage = "rush"; question("One last question", "How quickly do you need it sold?", RUSH, "Or type it in your own words"); return;
    }
    if (S.stage === "rush") {
      S.rush = key || (/\bno (rush|hurry)\b|not in a (rush|hurry)|right result|take my time/i.test(t) ? "none" : /month/i.test(t) ? "month" : /fast|quick|asap|soon|rush|urgent|hurry|this week/i.test(t) ? "fast" : "none");
      S.stage = "result"; result(); return;
    }
    if (S.stage === "done") followAsk(t);
  }
  // The reason tiles: the old /sell .pcard-tile, the words line, then "See the numbers" opening the figures.
  function tilesHtml(p){
    var rs = p.reasons || []; if (!rs.length) return "";
    return '<div class="pcard-tiles n' + Math.min(rs.length, 3) + '">' + rs.map(function(r){
      return '<div class="pcard-tile"><div class="pcard-tl">' + e(r.label || "") + '</div><div class="pcard-ts pcard-ts-f">' + e(r.words) + "</div>" +
        (r.figures ? '<button type="button" class="sell-fig">See the numbers</button><span class="sell-figs" hidden>' + e(r.figures) + "</span>" : "") + "</div>";
    }).join("") + "</div>";
  }
  function platformCard(p, second){
    var name = S.name || "car";
    var head = second ? (p.house ? "Or take your " + name + " to " + p.name + " yourself." : "Or sell your " + name + " on " + p.name + " yourself.")
                      : (p.house ? "I'd take your " + name + " to " + p.name + "." : "I'd sell your " + name + " on " + p.name + ".");
    return '<div class="sellpc"><div class="pcard pcard-platform"><div class="pcard-left">' +
      '<span class="pcard-badge">Where Sam would sell it</span>' +
      '<h1 class="pcard-name">' + e(head) + "</h1>" + tilesHtml(p) +
      (p.link ? '<a class="pcard-cta" href="' + e(p.link) + '" target="_blank" rel="noopener">See how to sell on ' + e(p.name) + "</a>" : "") +
      "</div></div></div>";
  }
  function partnerCard(pt, first){
    var first1 = String(pt.name || "").split(" ")[0];
    return '<div class="sellpc"><div class="pcard pcard-ps"><div class="pcard-left"><div class="pcard-hero">' +
      '<div><span class="pcard-badge">Who Sam would recommend</span>' + (pt.tempRanking ? '<span class="sell-temp">TEMP RANKING</span>' : "") + "</div>" +
      '<h1 class="pcard-name pcard-name-ps">' + (first ? "I'd hand it to " : "Or hand it to ") + '<span class="pcard-hl">' + e(pt.name) + "</span>.</h1>" +
      '<p class="pcard-lead">' + e(pt.about || "") + "</p></div>" +
      '<form class="sell-ps" data-ps="' + e(pt.slug) + '" data-name="' + e(pt.name) + '"><input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email"><button type="submit" class="pcard-cta">Get in touch with ' + e(first1) + '</button></form><p class="sell-psmsg"></p>' +
      "</div></div></div>";
  }
  function salesHtml(list){
    if (!list || !list.length) return "";
    var x = X();
    return '<div class="sec-head"><div><h2>The latest sales</h2></div></div><div class="grid3">' + list.map(function(c){
      var when = c.date ? new Date(c.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
      return x.saleCardHtml({ priceHtml: '<span class="num">Sold $' + Number(c.price).toLocaleString("en-US") + "</span>", venueLine: [c.house, when].filter(Boolean).join(" · "), title: c.title, image: c.photo, href: c.url, slug: "", cls: "" });
    }).join("") + "</div>";
  }
  function result(){
    S.busy = true; waiting("Sam is reading the sales for the " + S.label + ".");
    api({ step: "result", car: S.label, state: S.state, how: S.how, rush: S.rush }).then(function(j){
      S.busy = false; S.result = j; S.stage = "done";
      var x = X(), h = "";
      if (!j || (!j.platform && !j.partner)) h += x.samMsgHtml([e((j && j.empty) || "Sam couldn't read that just now. Try again in a moment.")], "", "big");
      (j.order || ["platform", "partner"]).forEach(function(k, i){
        if (k === "platform" && j.platform) h += platformCard(j.platform, i > 0 && !!j.partner && j.order[0] === "partner");
        if (k === "partner" && j.partner) h += partnerCard(j.partner, i === 0);
      });
      h += salesHtml(j.recent);
      h += '<div class="sec-head"><div><h2>Ask Sam about this</h2></div></div><div id="fturns"></div>';
      x.root.innerHTML = h + x.inboxHtml("", "Ask Sam about this, like: why not Cars & Bids?") + x.footHtml(); x.wire();
      window.scrollTo({ top: 0 });
    }).catch(function(){ S.busy = false; S.stage = "rush"; X().renderError("Sam couldn't read that just now. Try again in a moment."); });
  }
  function followAsk(q){
    S.busy = true; var x = X(), box = document.getElementById("fturns"), inp = document.getElementById("ob-input"); if (inp) inp.value = "";
    box.insertAdjacentHTML("beforeend", '<p class="ans-line"><b>' + e(q) + "</b></p>" + x.samMsgHtml([e("Sam is reading...")], "", ""));
    var slot = box.lastElementChild;
    api({ step: "ask", car: S.label, state: S.state, how: S.how, rush: S.rush, question: q, history: S.follow }).then(function(j){
      var t = (j && j.reply) || "Sam couldn't answer that just now."; S.follow.push({ role: "buyer", text: q }, { role: "sam", text: t });
      slot.outerHTML = x.samMsgHtml([e(t)], "", "");
    }).catch(function(){ slot.outerHTML = x.samMsgHtml([e("Sam couldn't answer that just now. Try again in a moment.")], "", ""); })
      .then(function(){ S.busy = false; });
  }
  document.addEventListener("click", function(ev){
    var c = ev.target.closest && ev.target.closest("[data-sellchip]"); if (c) { ev.preventDefault(); answer(c.textContent.trim(), c.getAttribute("data-sellchip")); return; }
    var f = ev.target.closest && ev.target.closest(".sell-fig"); if (f) { ev.preventDefault(); var s = f.nextElementSibling; if (s) { s.hidden = !s.hidden; f.textContent = s.hidden ? "See the numbers" : "Hide the numbers"; } }
  });
  document.addEventListener("submit", function(ev){
    var f = ev.target.closest && ev.target.closest(".sell-ps"); if (!f) return; ev.preventDefault();
    var email = f.querySelector("input").value.trim(), msg = f.nextElementSibling, name = f.getAttribute("data-name"), b = f.querySelector("button");
    b.disabled = true; b.textContent = "Sending...";
    fetch("/api/submitSellerLead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: { email: email }, car: { raw: S.label, state: S.state || "" }, choice: { destination: name, destinationType: "powerseller", powerSeller: { slug: f.getAttribute("data-ps") } }, decision: { surface: "sell-mc" } }) })
      .then(function(r){ return r.json(); }).then(function(j){ msg.textContent = j && (j.reference || j.ok || j.status === "submitted") ? "Sent. " + name + " will be in touch." : (j && j.status === "partner_unavailable" ? name + " isn't taking new cars right now." : "That didn't send. Try again in a minute."); b.textContent = "Sent"; })
      .catch(function(){ msg.textContent = "That didn't send. Try again in a minute."; b.disabled = false; b.textContent = "Get in touch with " + name; });
  });
  window.GAS_SELL = {
    homeHtml: function(inboxHtml){
      return '<div class="ob-home"><p class="ob-tag">Go ahead, ask Sam.</p><h1 class="ob-head">Tell me what vehicle you’re selling. I’ll tell you where I’d sell it, and why.</h1>' +
        inboxHtml("", "Type your car, or paste a VIN.") + '<div class="ob-cue">Real auction results · Platform performance · PowerSeller data</div>' +
        (UPDATED ? '<div class="ob-cue">Updated ' + UPDATED + "</div>" : "") + "</div>";
    },
    onCar: function(d){
      var rc = (d && d.resolvedCar) || {};
      // No car named (a refusal or an unknown model): Market Check's own honest screen renders instead.
      if (!rc.make || !rc.model) return false;
      S.label = [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ") || "car";
      // The headline's name is Market Check's own (carHead: "997 Carrera S"), never re-derived here.
      S.name = (X().carHead && X().carHead(d)) || [rc.model, rc.trim].filter(Boolean).join(" ");
      S.stage = "state"; question("One question first", "Which state is it in?", STATES.map(function(s){ return [s, s]; }).concat([["other", "Somewhere else"]]), "Or type the state");
      return true;
    },
    onSubmit: function(text){ if (!S.stage) return false; answer(text); return true; }
  };
})();`;
