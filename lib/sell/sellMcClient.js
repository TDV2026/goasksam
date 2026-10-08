// The one-direction Sell on Market Check's page (Lane C, Oct 2026; behind SELL_NEXT_ON). The car questions
// ARE Market Check's: One Box's own engine tiers and renderChoice cards (js/onebox.js), unchanged. Once One
// Box has named one car it calls GAS_SELL.onCar and Sell asks the state, how to sell it and how quickly, in
// the same question card (OBX.qscreenHtml). The result is the LIVE /sell result cards, the same markup and
// classes as js/result-v2.js (the pick card and the PowerSeller card), styled by styles.css's own .pcard
// section (api/sellNext.js inlines it from that file); only what feeds them differs. Then Market Check's
// sale cards (OBX.saleCardHtml) and the follow-up box. SELL_MC_CSS: the card container and the form.
export const SELL_MC_CSS = `
.sellpc{container-type:inline-size;--font-sans:var(--sans);margin:0 0 22px}
.sellpc .pcard.sell-norail{grid-template-columns:1fr!important}
.sellpc a.pcard-cta{text-decoration:none;box-sizing:border-box}
.sellpc .pcard{max-width:920px}
.sell-ps{display:flex;flex-direction:column;gap:12px;margin-top:26px}
.sell-ps input{width:100%;box-sizing:border-box;border:1px solid var(--pc-line);border-radius:14px;padding:16px 18px;font:inherit;font-size:16px;background:#fff}
.sell-ps .pcard-cta{margin-top:0!important;position:relative}
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
  var S = { stage: null, label: null, make: null, state: null, how: null, rush: null, busy: false, follow: [], result: null };
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
  // The live /sell result cards (js/result-v2.js pick card + PowerSeller card): the same markup and classes,
  // styled by styles.css's own .pcard section; only what feeds them differs (the Sell engine's facts).
  var ARROW = '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  var SHIELD = '<path d="M12 3l7 2.6v5.2c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.3 12l1.9 1.9 3.6-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  function svg(path, cls){ return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>"; }
  function boxesHtml(p){
    var bx = p.boxes || []; if (!bx.length) return "";
    return '<div class="pcard-ev"><div class="pcard-rule"></div><div class="pcard-tiles' + (bx.length === 1 ? " one" : "") + '">' + bx.map(function(t){
      return '<div class="pcard-tile"><div class="pcard-tl">' + e(t.label) + '</div><div class="pcard-tv">' + e(t.head) + '</div><div class="pcard-ts pcard-ts-c">' + e(t.line) + '</div><div class="pcard-ts pcard-ts-f">' + e(t.line) + "</div></div>";
    }).join("") + "</div></div>";
  }
  function platformCard(p, second){
    var make = S.make || "car";
    var script = second ? (p.house ? "Or take your " + make + " yourself to" : "Or sell your " + make + " yourself on") : (p.house ? "Sam would take your " + make + " to" : "Sam would sell your " + make + " on");
    var cta = p.link ? '<a class="pcard-cta" href="' + e(p.link) + '" target="_blank" rel="noopener">Start listing with ' + e(p.name) + svg(ARROW, "cta-arrow") + "</a>" +
      '<div class="pcard-reassure">' + svg(SHIELD) + "<span>You'll be taken to " + e(p.name) + " to begin your listing. Nothing is committed until you decide to publish.</span></div>" : "";
    return '<div class="sellpc"><div class="pcard pcard-platform">' +
      '<div class="pcard-left">' +
        '<span class="pcard-badge">' + (second ? "If you'd rather sell it yourself" : "+ Sam's Pick") + "</span>" +
        '<div class="pcard-script">' + e(script) + "</div>" +
        '<h1 class="pcard-name">' + e(p.name) + "</h1>" +
        (p.why ? '<div class="pcard-whyl pcard-whyl-main">Why Sam Picked This</div><p class="pcard-lead">' + e(p.why) + "</p>" : "") +
        cta +
      "</div>" +
      '<div class="pcard-right"><div class="pcard-wordmark">' + e(p.name) + "</div>" + boxesHtml(p) + "</div>" +
      '<div class="pcard-note">All numbers recalculated as new sales close.</div>' +
    "</div></div>";
  }
  function partnerCard(pt, first){
    var first1 = String(pt.name || "").split(" ")[0];
    return '<div class="sellpc"><div class="pcard pcard-ps sell-norail"><div class="pcard-left">' +
      '<div class="pcard-hero">' +
        '<div><span class="pcard-badge">Who Sam would recommend</span>' + "</div>" +
        '<div class="pcard-script">' + (first ? "Sam would hand it to" : "Or Sam would hand it to") + "</div>" +
        '<h1 class="pcard-name pcard-name-ps"><span class="pcard-hl">' + e(pt.name) + "</span></h1>" +
        '<p class="pcard-lead">' + e(pt.about || "") + "</p>" +
      "</div>" +
      '<div class="pcard-foot"><form class="sell-ps" data-ps="' + e(pt.slug) + '" data-name="' + e(pt.name) + '"><input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email">' +
        '<button type="submit" class="pcard-cta">Get in touch with ' + e(first1) + svg(ARROW, "cta-arrow") + '</button></form><p class="sell-psmsg"></p></div>' +
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
      var shown = 0;   // cards already drawn: the second one reads "Or ...", the first never does
      (j.order || ["platform", "partner"]).forEach(function(k){
        if (k === "platform" && j.platform) { h += platformCard(j.platform, shown > 0); shown++; }
        if (k === "partner" && j.partner) { h += partnerCard(j.partner, shown === 0); shown++; }
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
      return '<div class="ob-home"><p class="ob-tag">Go ahead, ask Sam.</p><h1 class="ob-head">Tell Sam what you’re selling. Sam will say where he’d sell it, and why.</h1>' +
        inboxHtml("", "Type your car, or paste a VIN.") + '<div class="ob-cue">Real auction results · Platform performance · PowerSeller data</div>' +
        (UPDATED ? '<div class="ob-cue">Updated ' + UPDATED + "</div>" : "") + "</div>";
    },
    onCar: function(d){
      var rc = (d && d.resolvedCar) || {};
      // No car named (a refusal or an unknown model): Market Check's own honest screen renders instead.
      if (!rc.make || !rc.model) return false;
      S.label = [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ") || "car";
      // The headline's name is Market Check's own (carHead: "997 Carrera S"), never re-derived here.
      S.make = rc.make;   // the handwritten line names the make ("Sam would sell your Porsche on"), from the engine's resolved car
      S.stage = "state"; question("One question first", "Which state is it in?", STATES.map(function(s){ return [s, s]; }).concat([["other", "Somewhere else"]]), "Or type the state");
      return true;
    },
    onSubmit: function(text){ if (!S.stage) return false; answer(text); return true; }
  };
})();`;
