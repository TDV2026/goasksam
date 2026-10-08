// The one-direction Sell on Market Check's page (Lane C, Oct 2026; behind SELL_NEXT_ON). The car questions
// ARE Market Check's: One Box's own engine tiers and renderChoice cards (js/onebox.js), unchanged. Once One
// Box has named one car it calls GAS_SELL.onCar and Sell asks the state and how to sell it in the same
// question card (OBX.qscreenHtml), then shows the result in Market Check's card styles (the answer card
// markup, OBX.saleCardHtml for the latest sales, OBX.samMsgHtml for follow-up answers). ?why=words (the
// default) shows reasons without figures, each with "See the numbers"; ?why=numbers puts the figures in
// the sentence. SELL_MC_CSS is layout only (list spacing, the small link and tag) on Market Check's tokens.
export const SELL_MC_CSS = `
.sell-why{margin:14px 0 6px;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.sell-why li{font-size:17px;line-height:1.5;padding-left:16px;position:relative}
.sell-why li::before{content:"";position:absolute;left:0;top:.7em;width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35}
.sell-fig{background:none;border:0;padding:0;margin-left:6px;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;opacity:.7;cursor:pointer;color:inherit}
.sell-figs{display:block;font-size:14px;opacity:.75;margin-top:4px}
.sell-head{font-size:clamp(28px,3.4vw,40px)!important;line-height:1.15!important}
.sell-temp{display:inline-block;margin-left:8px;padding:2px 6px;border:1px solid currentColor;border-radius:4px;font-size:11px;letter-spacing:.08em}
.sell-ps{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;max-width:520px}
.sell-ps input{flex:1;min-width:200px;border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:11px 14px;font:inherit;font-size:16px;background:#fff}
.sell-ps button{border:0;border-radius:10px;padding:0 16px;min-height:44px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;background:#1F5C3D;color:#fff}
.sell-psmsg{font-size:14px;opacity:.75;margin:8px 0 0}
.sell-gap{height:18px}
.sell-chips{margin-top:12px}`;

export const SELL_MC_CLIENT = String.raw`(function(){
  var P = new URLSearchParams(location.search);
  var WHY = P.get("why") === "numbers" ? "numbers" : "words";
  var KEYQ = P.get("key") ? "?key=" + encodeURIComponent(P.get("key")) : "";
  var UPDATED = (window.GAS_SELL_CFG && window.GAS_SELL_CFG.updated) || "";
  var STATES = ["California","Florida","Texas","New York","New Jersey","Arizona"];
  var HOW = [["self","I'll sell it myself"],["handled","I'd like someone to handle it"],["house","Through an auction house"],["unsure","I'm not sure yet"]];
  var S = { stage: null, label: null, state: null, how: null, busy: false, follow: [], result: null };
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
    if (S.stage === "state") { S.state = t; S.stage = "how"; question("One last question", "How would you like to sell it?", HOW, "Or type it in your own words"); return; }
    if (S.stage === "how") {
      S.how = key || (/handle|someone|powerseller/i.test(t) ? "handled" : /myself|my own|diy/i.test(t) ? "self" : /auction house|house/i.test(t) ? "house" : "unsure");
      S.stage = "result"; result(); return;
    }
    if (S.stage === "done") followAsk(t);
  }
  function reasonsHtml(p){
    if (!p.reasons || !p.reasons.length) return "";
    return '<ul class="sell-why">' + p.reasons.map(function(r, i){
      if (WHY === "numbers") return "<li>" + e(r.numbers) + "</li>";
      return "<li>" + e(r.words) + (r.figures ? '<button type="button" class="sell-fig" data-fig="' + i + '">See the numbers</button><span class="sell-figs" hidden>' + e(r.figures) + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
  }
  function platformCard(p, second){
    var head = second ? (p.house ? "Or take it to " + p.name + " yourself." : "Or sell it yourself on " + p.name + ".") : p.headline;
    return '<section class="anscard blk solo"><div class="ans-main"><div class="eyebrow">' + (second ? "If you would rather sell it yourself" : "Where Sam would sell it") + '</div><h2 class="range sell-head">' + e(head) + "</h2>" + reasonsHtml(p) +
      (p.link ? '<p class="ans-line"><a href="' + e(p.link) + '" target="_blank" rel="noopener">' + e(p.name) + "'s own page explains how to sell there</a></p>" : "") + "</div></section>";
  }
  function partnerCard(pt, first){
    return '<section class="anscard blk solo"><div class="ans-main"><div class="eyebrow">' + (first ? "Have it handled" : "Or have it handled") + (pt.tempRanking ? '<span class="sell-temp">TEMP RANKING</span>' : "") + "</div>" +
      '<h2 class="range sell-head">' + e((first ? "I'd hand it to " : "Or hand it to ") + pt.name + ".") + "</h2>" +
      '<p class="ans-line">' + e(pt.what) + "</p>" + (pt.note ? '<p class="ans-line">' + e(pt.note) + "</p>" : "") +
      '<form class="sell-ps" data-ps="' + e(pt.slug) + '" data-name="' + e(pt.name) + '"><input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email"><button type="submit">Get in touch with ' + e(pt.name) + '</button></form><p class="sell-psmsg"></p></div></section>';
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
    api({ step: "result", car: S.label, state: S.state, how: S.how }).then(function(j){
      S.busy = false; S.result = j; S.stage = "done";
      var x = X(), h = "";
      if (!j || (!j.platform && !j.partner)) h += x.samMsgHtml([e((j && j.empty) || "Sam couldn't read that just now. Try again in a moment.")], "", "big");
      (j.order || ["platform", "partner"]).forEach(function(k, i){
        if (k === "platform" && j.platform) h += (h ? '<div class="sell-gap"></div>' : "") + platformCard(j.platform, i > 0 && !!j.partner && j.order[0] === "partner");
        if (k === "partner" && j.partner) h += (h ? '<div class="sell-gap"></div>' : "") + partnerCard(j.partner, i === 0);
      });
      h += salesHtml(j.recent);
      h += '<div class="sec-head"><div><h2>Ask Sam about this</h2></div></div><div id="fturns"></div>';
      x.root.innerHTML = h + x.inboxHtml("", "Ask Sam about this, like: why not Cars & Bids?") + x.footHtml(); x.wire();
      window.scrollTo({ top: 0 });
    }).catch(function(){ S.busy = false; S.stage = "state"; X().renderError("Sam couldn't read that just now. Try again in a moment."); });
  }
  function followAsk(q){
    S.busy = true; var x = X(), box = document.getElementById("fturns"), inp = document.getElementById("ob-input"); if (inp) inp.value = "";
    box.insertAdjacentHTML("beforeend", '<p class="ans-line"><b>' + e(q) + "</b></p>" + x.samMsgHtml([e("Sam is reading...")], "", ""));
    var slot = box.lastElementChild;
    api({ step: "ask", car: S.label, state: S.state, how: S.how, question: q, history: S.follow }).then(function(j){
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
      S.stage = "state"; question("One last question", "Which state is it in?", STATES.map(function(s){ return [s, s]; }).concat([["other", "Somewhere else"]]), "Or type the state");
      return true;
    },
    onSubmit: function(text){ if (!S.stage) return false; answer(text); return true; }
  };
})();`;
