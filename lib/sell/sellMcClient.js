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
.sell-chips{margin-top:12px}
.sell-top{margin:0 0 18px}
.sell-for{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 18px;margin:14px 0 18px;font:400 16px/1.45 var(--sans);color:var(--soft,#4A4A44)}
.sell-for b{font-weight:600;color:var(--ink)}
.sell-new{font:500 14.5px/1 var(--sans);color:var(--green,#1E4D38);text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
.sell-ask{display:flex;align-items:center;gap:8px;border:1px solid var(--div,#E2DED3);border-radius:14px;background:#fff;padding:6px 6px 6px 18px;margin-top:6px}
.sell-ask input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 16px/1.4 var(--sans);color:var(--ink);padding:10px 0}
.sell-ask button{width:44px;height:44px;flex:none;border:0;border-radius:10px;background:var(--green,#1E4D38);color:#fff;font-size:18px;cursor:pointer}`;

export const SELL_MC_CLIENT = String.raw`(function(){
  var P = new URLSearchParams(location.search);
  var KEYQ = P.get("key") ? "?key=" + encodeURIComponent(P.get("key")) : "";
  var UPDATED = (window.GAS_SELL_CFG && window.GAS_SELL_CFG.updated) || "";
  // The Sell landing (lib/sell/sellLanding.js), server-rendered by api/sellNext.js; empty falls back to the plain home.
  var HOME = (window.GAS_SELL_CFG && window.GAS_SELL_CFG.home) || "";
  var STATES = ["California","Florida","Texas","New York","New Jersey","Arizona"];
  var HOW = [["self","I'll sell it myself"],["handled","I'd like someone to handle it"],["house","Through an auction house"],["unsure","I'm not sure yet"]];
  // The old /sell timing chips ("How quickly are you looking to sell?").
  var RUSH = [["fast","Want it gone fast"],["month","Within a month"],["none","No rush, right result only"]];
  var booted = false;
  var S = { stage: null, label: null, typed: null, make: null, state: null, how: null, rush: null, busy: false, follow: [], result: null, presetHow: null, keep: null };
  function X(){ return window.OBX; }
  // ---------------- result addresses (Oct 2026) ----------------
  // Each step has its own address: /sell?car=<the named car>&state=...&how=...&rush=... (vercel.json routes
  // /sell?car= here; with the new Sell off it serves the live /sell). Back steps back through the questions
  // and finally to the landing; a reload or a pasted link picks up at the same step. Never an email; the
  // state is the only place named. The probe key stays on a preview address (the new Sell is gated).
  // The landing: the gated preview (/api/sellNext?key=...) while the new Sell is off, /sell once it is on.
  var LANDING_URL = P.get("key") ? "/api/sellNext?key=" + encodeURIComponent(P.get("key")) : "/sell";
  function addressOf(st){
    var u = new URLSearchParams(); ["car", "state", "how", "rush"].forEach(function(k){ if (st[k]) u.set(k, String(st[k]).replace(/\S+@\S+/g, "").slice(0, 120)); });
    if (P.get("key")) u.set("key", P.get("key"));
    return "/sell?" + u.toString();
  }
  function remember(replace){
    var st = { sell: true, car: S.label, make: S.make, state: S.state, how: S.how, rush: S.rush };
    try { if (replace) history.replaceState(st, "", addressOf(st)); else history.pushState(st, "", addressOf(st)); } catch(err){}
  }
  // Show the step a set of answers reaches (Back, Forward, a reload or a pasted link).
  function restore(st){
    S.label = st.car; S.make = st.make || null; S.state = st.state || null; S.how = st.how || null; S.rush = st.rush || null; S.presetHow = null; S.busy = false; S.follow = [];
    if (!S.state) { S.stage = "state"; return askState(); }
    if (!S.how) { S.stage = "how"; return question("Next question", "How would you like to sell it?", HOW, "Or type it in your own words"); }
    if (!S.rush) { S.stage = "rush"; return question("One last question", "How quickly do you need it sold?", RUSH, "Or type it in your own words"); }
    S.stage = "result"; result();
  }
  function askState(){ question("One question first", "Which state is it in?", STATES.map(function(s){ return [s, s]; }).concat([["other", "Somewhere else"]]), "Or type the state"); }
  window.addEventListener("popstate", function(ev){
    var st = ev.state;
    if (st && st.sell && st.car) { restore(st); window.scrollTo({ top: 0 }); return; }
    S.stage = null; S.label = null; S.state = S.how = S.rush = null; S.presetHow = null; X().renderEmpty(); window.scrollTo({ top: 0 });
  });
  function e(s){ return X().esc(s); }
  // "Your results" in the rail: this browser's Sell results, newest first, each opening its own address.
  // Sell's own list (gas_sell_recent), never Market Check's; drawn after One Box's own rail sync.
  function recentList(){ try { return JSON.parse(localStorage.getItem("gas_sell_recent") || "[]"); } catch(err){ return []; } }
  function addRecent(label){
    var url = addressOf({ car: S.label, state: S.state, how: S.how, rush: S.rush }), key = String(S.label || "").toLowerCase();
    var l = recentList().filter(function(it){ return it.key !== key; });
    l.unshift({ key: key, label: label || S.label, url: url });
    try { localStorage.setItem("gas_sell_recent", JSON.stringify(l.slice(0, 8))); } catch(err){}
    syncRail();
  }
  function syncRail(){
    var nav = document.getElementById("gas-nav-results"), menu = document.getElementById("gas-results-menu"); if (!nav || !menu) return;
    var l = recentList(); if (!l.length) { nav.style.display = "none"; menu.innerHTML = ""; return; }
    nav.style.display = ""; menu.innerHTML = l.map(function(it){ return '<a href="' + e(it.url) + '">' + e(it.label) + "</a>"; }).join("");
  }
  function api(body){ return fetch("/api/sellChat" + KEYQ, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: "flow" }, body)) }).then(function(r){ return r.json(); }); }
  function chips(list){ return '<div class="chips sell-chips">' + list.map(function(c){ return '<button type="button" class="chip" data-sellchip="' + e(c[0]) + '">' + e(c[1]) + "</button>"; }).join("") + "</div>"; }
  function question(eyebrow, text, list, ph){
    var x = X(); x.root.innerHTML = x.inboxHtml("", ph) + x.qscreenHtml(e(text), list ? chips(list) : "", eyebrow, "") + x.footHtml(); x.wire();
    var i = document.getElementById("ob-input"); if (i) try { i.focus(); } catch(err){}
  }
  function waiting(text){ var x = X(); x.root.innerHTML = x.qscreenHtml(e(text), "", "One moment", "") + x.footHtml(); }
  function answer(t, key){
    t = String(t || "").trim(); if (!t || S.busy) return;
    if (S.stage === "state") {
      S.state = t; remember();
      // Started from the landing's "See who Sam would call": the seller already said they want it handled.
      if (S.presetHow) { S.how = S.presetHow; S.presetHow = null; history.replaceState && remember(true); S.stage = "rush"; question("One last question", "How quickly do you need it sold?", RUSH, "Or type it in your own words"); return; }
      S.stage = "how"; question("Next question", "How would you like to sell it?", HOW, "Or type it in your own words"); return;
    }
    if (S.stage === "how") {
      S.how = key || (/handle|someone|powerseller/i.test(t) ? "handled" : /myself|my own|diy/i.test(t) ? "self" : /auction house|house/i.test(t) ? "house" : "unsure"); remember();
      S.stage = "rush"; question("One last question", "How quickly do you need it sold?", RUSH, "Or type it in your own words"); return;
    }
    if (S.stage === "rush") {
      S.rush = key || (/\bno (rush|hurry)\b|not in a (rush|hurry)|right result|take my time/i.test(t) ? "none" : /month/i.test(t) ? "month" : /fast|quick|asap|soon|rush|urgent|hurry|this week/i.test(t) ? "fast" : "none");
      remember(); S.stage = "result"; result(); return;
    }
    if (S.stage === "done") followAsk(t);
  }
  // The live /sell result cards (js/result-v2.js pick card + PowerSeller card): the same markup and classes,
  // styled by styles.css's own .pcard section; only what feeds them differs (the Sell engine's facts).
  var ARROW = '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  var SHIELD = '<path d="M12 3l7 2.6v5.2c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.3 12l1.9 1.9 3.6-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  function svg(path, cls){ return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>"; }
  // The live /sell cards' own icons (js/result-v2.js V2_ICON / PSV2_ICON).
  var ICON = {
    pin: '<path d="M12 21s-6.5-5-6.5-10a6.5 6.5 0 0 1 13 0c0 5-6.5 10-6.5 10z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.4" fill="currentColor"/>',
    car: '<path d="M3.5 13l1.7-4.4A2.2 2.2 0 0 1 7.3 7.2h9.4a2.2 2.2 0 0 1 2.1 1.4L20.5 13m-17 0h17m-17 0v3.6m17-3.6v3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.2" cy="14.9" r="1.4" fill="currentColor"/><circle cx="16.8" cy="14.9" r="1.4" fill="currentColor"/>',
    cal: '<rect x="4" y="5.5" width="16" height="15" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8.5 3.5v3.6M15.5 3.5v3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    star: '<path d="M12 2.6l1.7 5.7 5.7 1.7-5.7 1.7L12 17.4l-1.7-5.7L4.6 10l5.7-1.7z" fill="currentColor"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10M10 13.5h4M9 20h6M12 13.5V17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    clip: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="2.8" width="6" height="3.4" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 11h7M8.5 15h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
  };
  // The pick card's right column rows (the live card's .pcard-meta): car and place, scope, window.
  function metaHtml(p){
    var m = p.meta || []; if (!m.length) return "";
    return '<div class="pcard-meta">' + m.map(function(r){ return '<div class="pcard-mrow">' + svg(ICON[r.icon] || "") + '<div><div class="pcard-mp">' + e(r.main) + "</div>" + (r.sub ? '<div class="pcard-ms">' + e(r.sub) + "</div>" : "") + "</div></div>"; }).join("") + "</div>";
  }
  // The PowerSeller card's tiles (the live card's .pcard-ttile stack), facts from lib/sell/sellPartner.js.
  function tileHtml(t){
    var inner = (t.label ? '<div class="lab">' + e(t.label) + "</div>" : "") + (t.num ? '<div class="pcard-tnum' + (t.green ? " green" : "") + '">' + e(t.num) + "</div>" : "") +
      (t.value ? '<div class="val' + (t.green && !t.num ? " green" : "") + '">' + e(t.value) + "</div>" : "") + (t.lines || []).map(function(x){ return '<div class="val">' + e(x) + "</div>"; }).join("") + (t.sub ? '<div class="sub">' + e(t.sub) + "</div>" : "");
    return '<div class="pcard-ttile"><span class="pcard-tic">' + svg(ICON[t.icon] || "") + '</span><div class="pcard-tt">' + inner + "</div></div>";
  }
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
    var right = metaHtml(p) + boxesHtml(p);
    return '<div class="sellpc"><div class="pcard pcard-platform' + (right ? "" : " sell-norail") + '">' +
      '<div class="pcard-left">' +
        '<span class="pcard-badge">' + (second ? "If you'd rather sell it yourself" : "+ Sam's Pick") + "</span>" +
        '<div class="pcard-script">' + e(script) + "</div>" +
        '<h1 class="pcard-name">' + e(p.name) + "</h1>" +
        (p.why ? '<div class="pcard-whyl pcard-whyl-main">Why Sam Picked This</div><p class="pcard-lead">' + e(p.why) + "</p>" : "") +
        cta +
      "</div>" +
      // No rows and no tiles: no right column at all (never an empty frame).
      (right ? '<div class="pcard-right"><div class="pcard-wordmark">' + e(p.name) + "</div>" + right + "</div>" : "") +
      '<div class="pcard-note">All numbers recalculated as new sales close.</div>' +
    "</div></div>";
  }
  function partnerCard(pt, first){
    var first1 = pt.first || String(pt.name || "").split(" ")[0];
    var tiles = (pt.tiles || []).map(tileHtml).join("");
    return '<div class="sellpc"><div class="pcard pcard-ps' + (tiles ? "" : " sell-norail") + '"><div class="pcard-left">' +
      '<div class="pcard-hero">' +
        '<div><span class="pcard-badge">Who Sam would recommend</span>' + "</div>" +
        '<div class="pcard-script">' + (first ? "Sam would hand it to" : "Or Sam would hand it to") + "</div>" +
        '<h1 class="pcard-name pcard-name-ps"><span class="pcard-hl">' + e(pt.name) + "</span></h1>" +
        '<p class="pcard-lead">' + e(pt.intro || pt.about || "") + "</p>" +
      "</div>" +
      '<div class="pcard-foot"><form class="sell-ps" data-ps="' + e(pt.slug) + '" data-name="' + e(pt.name) + '"><input type="email" required placeholder="Your email" autocomplete="email" aria-label="Your email">' +
        '<button type="submit" class="pcard-cta">Get in touch with ' + e(first1) + svg(ARROW, "cta-arrow") + '</button></form><p class="sell-psmsg"></p></div>' +
    "</div>" +
    (tiles ? '<div class="pcard-right pcard-right-ps">' + (pt.knownAs ? '<div class="pcard-known">Known online as <b>' + e(pt.knownAs) + "</b></div>" : "") + '<div class="pcard-tstack">' + tiles + "</div></div>" : "") +
    "</div></div>";
  }
  function salesHtml(list){
    if (!list || !list.length) return "";
    var x = X();
    return '<div class="sec-head"><div><h2>The latest sales</h2></div></div><div class="grid3">' + list.map(function(c){
      var when = c.date ? new Date(c.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
      return x.saleCardHtml({ priceHtml: '<span class="num">Sold $' + Number(c.price).toLocaleString("en-US") + "</span>", venueLine: [c.house, when].filter(Boolean).join(" · "), title: c.title, image: c.photo, href: c.url, slug: "", cls: "" });
    }).join("") + "</div>";
  }
  // Each result drawn in this visit, by address: Back and Forward redraw it at once (as Buy does); a reload
  // or a pasted link reads it fresh.
  var DRAWN = {};
  function result(){
    var key = addressOf({ car: S.label, state: S.state, how: S.how, rush: S.rush });
    if (DRAWN[key]) { draw(DRAWN[key]); return; }
    S.busy = true; waiting("Sam is reading the sales for the " + S.label + ".");
    api({ step: "result", car: S.label, state: S.state, how: S.how, rush: S.rush }).then(function(j){
      if (j && (j.platform || j.partner)) DRAWN[key] = j;
      draw(j);
    }).catch(function(){ S.busy = false; S.stage = "rush"; X().renderError("Sam couldn't read that just now. Try again in a moment."); });
  }
  function draw(j){
      S.busy = false; S.result = j; S.stage = "done"; if (j && j.make) S.make = j.make;
      var x = X(), h = "";
      // The search bar stays at the top, as on Market Check's results: the car as typed, editable; a new
      // car replaces these results in place (onSubmit below). Then the one line naming the car the cards
      // are for (the engine's car, humanised, with its generation) and the way back to the landing.
      h += '<div class="sell-top">' + x.inboxHtml(S.typed || S.label, "Type another car") + "</div>";
      var cl = j && j.carLine;
      if (cl && cl.title) h += '<p class="sell-for"><span>For the <b>' + e(cl.title) + "</b>" + (cl.generation ? ", " + e(cl.generation) + " generation" : "") + '.</span><a class="sell-new" href="' + e(LANDING_URL) + '" data-sellnew>New search</a></p>';
      if (!j || (!j.platform && !j.partner)) h += x.samMsgHtml([e((j && j.empty) || "Sam couldn't read that just now. Try again in a moment.")], "", "big");
      var shown = 0;   // cards already drawn: the second one reads "Or ...", the first never does
      (j.order || ["platform", "partner"]).forEach(function(k){
        if (k === "platform" && j.platform) { h += platformCard(j.platform, shown > 0); shown++; }
        if (k === "partner" && j.partner) { h += partnerCard(j.partner, shown === 0); shown++; }
      });
      h += salesHtml(j.recent);
      h += '<div class="sec-head"><div><h2>Ask Sam about this</h2></div></div><div id="fturns"></div>';
      h += '<form class="sell-ask" data-sellask><label class="sr" for="sell-askq">Ask Sam about this</label><input id="sell-askq" autocomplete="off" placeholder="Ask Sam about this, like: why not Cars &amp; Bids?"><button type="submit" aria-label="Ask">&#8594;</button></form>';
      x.root.innerHTML = h + x.footHtml(); x.wire();
      if (j && (j.platform || j.partner)) addRecent(cl && cl.title ? cl.title : S.label);
      window.scrollTo({ top: 0 });
  }
  function followAsk(q){
    S.busy = true; var x = X(), box = document.getElementById("fturns"), inp = document.getElementById("sell-askq"); if (inp) inp.value = "";
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
    // New search: back to the landing (an entry in the history, so Back returns to these results).
    var nw = ev.target.closest && ev.target.closest("[data-sellnew]");
    if (nw) { ev.preventDefault(); S.stage = null; S.label = S.typed = null; S.state = S.how = S.rush = null; S.presetHow = null; S.keep = null;
      try { history.pushState(null, "", LANDING_URL); } catch(err){} X().renderEmpty(); window.scrollTo({ top: 0 }); return; }
    // The landing's specialist band (display only): the real flow for the example car, as "have it handled".
    // The landing's two buttons start the flow at its beginning, no car prefilled: "Find out where yours
    // would sell" as is; "See who Sam would call" with a specialist intent (once the car is known, the
    // "how" question is answered as "have it handled" and the result leads with the specialist).
    var st = ev.target.closest && ev.target.closest("[data-sl-start],[data-sl-handled]");
    if (st) { ev.preventDefault(); var inp = document.getElementById("ob-input"), hint = document.getElementById("sl-hint");
      S.presetHow = st.hasAttribute("data-sl-handled") ? "handled" : null;
      if (hint) hint.hidden = !S.presetHow;
      window.scrollTo({ top: 0, behavior: (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
      if (inp) { inp.value = ""; try { inp.focus({ preventScroll: true }); } catch(err){ inp.focus(); } }
      return; }
    // The landing's mic (the same speech code as Buy's): fills the search box, the seller then sends it.
    var m = ev.target.closest && ev.target.closest("[data-slmic]");
    if (m) { var SR = window.SpeechRecognition || window.webkitSpeechRecognition, input = document.getElementById("ob-input"); if (!SR || !input) return;
      if (m._rec) { m._rec.stop(); return; }
      var rec = new SR(), base = input.value ? input.value + " " : ""; rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; m._rec = rec;
      rec.onresult = function(e2){ var t = ""; for (var i = 0; i < e2.results.length; i++) t += e2.results[i][0].transcript; input.value = base + t; };
      rec.onend = rec.onerror = function(){ m._rec = null; m.classList.remove("on"); m.setAttribute("aria-pressed", "false"); input.focus(); };
      m.classList.add("on"); m.setAttribute("aria-pressed", "true"); rec.start(); }
  });
  // No speech recognition in this browser: the mic is not shown.
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { var st = document.createElement("style"); st.textContent = "[data-slmic]{display:none}"; document.head.appendChild(st); }
  document.addEventListener("submit", function(ev){
    var a = ev.target.closest && ev.target.closest("[data-sellask]");
    if (a) { ev.preventDefault(); var q = (document.getElementById("sell-askq") || {}).value; if (q && q.trim() && !S.busy) followAsk(q.trim()); return; }
    var f = ev.target.closest && ev.target.closest(".sell-ps"); if (!f) return; ev.preventDefault();
    var email = f.querySelector("input").value.trim(), msg = f.nextElementSibling, name = f.getAttribute("data-name"), b = f.querySelector("button");
    b.disabled = true; b.textContent = "Sending...";
    fetch("/api/submitSellerLead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: { email: email }, car: { raw: S.label, state: S.state || "" }, choice: { destination: name, destinationType: "powerseller", powerSeller: { slug: f.getAttribute("data-ps") } }, decision: { surface: "sell-mc" } }) })
      .then(function(r){ return r.json(); }).then(function(j){ msg.textContent = j && (j.reference || j.ok || j.status === "submitted") ? "Sent. " + name + " will be in touch." : (j && j.status === "partner_unavailable" ? name + " isn't taking new cars right now." : "That didn't send. Try again in a minute."); b.textContent = "Sent"; })
      .catch(function(){ msg.textContent = "That didn't send. Try again in a minute."; b.disabled = false; b.textContent = "Get in touch with " + name; });
  });
  window.GAS_SELL = {
    homeHtml: function(inboxHtml){
      // Opened at a result address: the landing goes under it in the history (Back reaches it), then the step.
      if (!booted) { booted = true; var car = P.get("car");
        if (car) { var st0 = { sell: true, car: car, make: null, state: P.get("state"), how: P.get("how"), rush: P.get("rush") };
          try { history.replaceState(null, "", LANDING_URL); history.pushState(st0, "", addressOf(st0)); } catch(err){}
          setTimeout(function(){ restore(st0); }, 0); } }
      setTimeout(syncRail, 0);   // after One Box's own rail sync, which runs right after this
      if (HOME) return HOME;
      return '<div class="ob-home"><p class="ob-tag">Go ahead, ask Sam.</p><h1 class="ob-head">Tell Sam what you’re selling. Sam will say where he’d sell it, and why.</h1>' +
        inboxHtml("", "Type your car, or paste a VIN.") + '<div class="ob-cue">Real auction results · Platform performance · PowerSeller data</div>' +
        (UPDATED ? '<div class="ob-cue">Updated ' + UPDATED + "</div>" : "") + "</div>";
    },
    onCar: function(d, text){
      var rc = (d && d.resolvedCar) || {};
      // No car named (a refusal or an unknown model): Market Check's own honest screen renders instead.
      if (!rc.make || !rc.model) return false;
      S.label = [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ") || "car";
      // The headline's name is Market Check's own (carHead: "997 Carrera S"), never re-derived here.
      S.make = rc.make;   // the handwritten line names the make ("Sam would sell your Porsche on"), from the engine's resolved car
      S.typed = String(text || "").trim() || null;
      setTimeout(syncRail, 0);
      // A new car typed in the results bar: the seller's answers stand, so the result reruns in place.
      if (S.keep) { S.state = S.keep.state; S.how = S.keep.how; S.rush = S.keep.rush; S.keep = null; S.follow = []; remember(); S.stage = "result"; result(); return true; }
      S.stage = "state"; remember(); askState();
      return true;
    },
    // On the results, the search bar takes a new car: One Box resolves it (its own questions if it needs
    // any), then onCar above reruns the result with the same answers. Every other stage answers its question.
    onSubmit: function(text){
      if (!S.stage) return false;
      if (S.stage === "done") { var t = String(text || "").trim(); if (!t || S.busy) return true; S.keep = { state: S.state, how: S.how, rush: S.rush }; S.stage = null; return false; }
      answer(text); return true;
    }
  };
})();`;
