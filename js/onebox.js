// One Box frontend (wiring phase). One input, one honest result state, at most three
// cards, rendered into the approved /onebox-preview design. Talks only to the archive-only
// oneBox branch of /api/sellerDecision. Never exposes the dataset. All render, zero LLM:
// the answer line, cards, labels and Sam's take are composed deterministically from the
// engine's structured facts. Engine truth wins over any sample data in the preview.
(function () {
  "use strict";
  var API_ORIGIN = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  var root = document.getElementById("ob");
  var lastQuery = "";
  var proofPool = [];

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function usd(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function sym(cur) { return ({ USD: "$", GBP: "£", EUR: "€" })[cur] || ""; }
  function priceStr(disp) {
    if (!disp || disp.amount == null) return "";
    var s = sym(disp.currency);
    return s ? s + Number(disp.amount).toLocaleString("en-US") : Number(disp.amount).toLocaleString("en-US") + " " + esc(disp.currency);
  }
  function milesStr(c) {
    if (Number.isFinite(c.mileage)) return Number(c.mileage).toLocaleString("en-US") + " miles";
    if (c.mileageStated != null) return "listed as ~" + Number(c.mileageStated).toLocaleString("en-US") + " miles";
    return "TMU";
  }
  function carLabel(rc) {
    if (!rc) return "your car";
    return [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle ? cap(rc.bodyStyle) : ""].filter(Boolean).join(" ") || "your car";
  }
  function cap(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function hashStr(s) { var h = 0, i; s = String(s || ""); for (i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return Math.abs(h); }
  var PLAT_SVG = '<svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>';

  // ---------------------------------------------------------------- copy lint (T1.8)
  // A safety net over every user-facing string One Box composes: it must never carry a
  // valuation/estimate word, a midpoint/average, positional labels, "anchor", a condition
  // claim, a predictive-price phrase, or an em/en dash. Money must use outcome verbs. In a
  // dev context (localhost or ?lint=1) a violation throws so it is caught in test; in prod
  // it logs and returns the string unchanged (never breaks a seller's result).
  var LINT_BANNED = /\b(worth|valuation|valued|estimate[sd]?|estimating|apprais\w*|midpoint|average[sd]?|averaging|\bmean\b|typical price|best read|anchor|high(est)? price|low(est)? price|middle price|going rate|market value|fair value|book value|should (sell|go|fetch|bring) for|will (sell|go|fetch|bring) for|pristine|mint condition|excellent condition|concours)\b/i;
  var LINT_DASH = /[–—]/;
  function lint(s, where) {
    var str = String(s == null ? "" : s);
    var dev = location.hostname === "localhost" || /[?&]lint=1\b/.test(location.search);
    var hit = LINT_BANNED.test(str) ? (str.match(LINT_BANNED) || [])[0] : (LINT_DASH.test(str) ? "en/em dash" : null);
    if (hit) {
      var msg = "One Box copy-lint violation (" + (where || "?") + "): '" + hit + "' in: " + str.slice(0, 120);
      if (dev) throw new Error(msg);
      try { console.error(msg); } catch (e) {}
    }
    return str;
  }

  // ---------------------------------------------------------------- answer-line composer (T1.2)
  // Span endpoints are two REAL surviving sales from the full post-guard pool (engine
  // d.answer), so they usually will not equal the shown cards - correct behaviour. Money
  // verbs only: brought / been bringing / sold for. No midpoint, average or "best read".
  function answerHtml(d) {
    var a = d.answer;
    if (!a) return "";
    var n = '<span class="num">';
    if (a.kind === "span") {
      var z = a.closest != null ? (" The one most like yours brought " + n + usd(a.closest) + "</span>" + (a.closestMonth ? " in " + esc(a.closestMonth) : "") + ".") : "";
      return '<p class="answer">' + lint("Cars like yours have been bringing " + n + usd(a.low) + "</span> to " + n + usd(a.high) + "</span>." + z, "answer.span") + "</p>";
    }
    if (a.kind === "two") return '<p class="answer">' + lint("The two closest sales brought " + n + usd(a.high) + "</span> and " + n + usd(a.low) + "</span>.", "answer.two") + "</p>";
    if (a.kind === "one") return '<p class="answer">' + lint("The one sale I’d actually use brought " + n + usd(a.one) + "</span>.", "answer.one") + "</p>";
    return "";
  }
  function basisHtml(d) {
    var noun = d.count === 1 ? "sale" : "sales";
    var win = /12 months/.test(d.windowLabel || "") ? "last <span class=\"num\">12</span> months" : "past <span class=\"num\">2</span> years";
    return '<span class="basis">Based on <span class="num">' + d.count + "</span> " + noun + '<span class="dot">&middot;</span>' + win + "</span>";
  }
  function utilsHtml() {
    // Bell OMITTED at launch (no affordance renders). Share only.
    return '<div class="utils"><button class="util" data-share title="Share these sales">' +
      '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Share</button></div>';
  }

  // ---------------------------------------------------------------- cards (T1.1)
  // Relevance label -> preview tab. Never positional (no High/Low/Middle), never "anchor".
  function tabFor(rank) {
    var r = String(rank || "");
    if (r === "Closest match") return { label: "Closest match", cls: "match" };
    if (r === "Lower mileage") return { label: "Fewer miles", cls: "diff" };
    if (r === "Higher mileage") return { label: "More miles", cls: "diff" };
    if (r === "More recent") return { label: "More recent", cls: "diff" };
    if (r === "Earlier sale") return { label: "Earlier sale", cls: "diff" };
    return { label: "Comparable sale", cls: "diff" };
  }
  function plateHtml(c, show) {
    var name = [c.year, c.make, c.subjectName].filter(Boolean).join(" ");
    return '<div class="plate"' + (show ? ' style="display:flex"' : "") + '><div class="m">' + esc(c.platform || "") + '</div>' +
      '<div class="n">' + esc(name) + '</div><div class="s">Photo unavailable</div></div>';
  }
  function phHtml(c) {
    if (c.image) {
      return '<div class="ph"><span class="tab ' + tabFor(c.rank).cls + '">' + esc(tabFor(c.rank).label) + '</span>' +
        '<img src="' + esc(c.image) + '" alt="' + esc([c.year, c.make, c.subjectName].filter(Boolean).join(" ")) + '" ' +
        'onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.plate\');if(p)p.style.display=\'flex\'">' + plateHtml(c, false) + "</div>";
    }
    return '<div class="ph"><span class="tab ' + tabFor(c.rank).cls + '">' + esc(tabFor(c.rank).label) + "</span>" + plateHtml(c, true) + "</div>";
  }
  function cardHtml(c, hero) {
    // includes-buyer's-premium renders ONLY for a live-house premium-inclusive record.
    // BaT / C&B (online) never carry it, per the engine's basis field.
    var prem = (c.isHouse && c.display && c.display.premiumInclusive) ? '<div class="prem">Includes buyer’s premium</div>' : "";
    var usdAnchor = c.usdApprox ? '<div class="usd">&asymp; ' + usd(c.usdApprox) + "</div>" : "";
    var receipt = c.url || (c.receiptUrl) || null;   // engine card has no url today -> plate/label only
    var view = receipt ? '<a class="viewsale" href="' + esc(receipt) + '" target="_blank" rel="noopener">View sale on ' + esc(c.platform || "the platform") + "</a>" : "";
    return '<div class="card' + (hero ? " hero" : "") + '">' + phHtml(c) +
      '<div class="cbody"><div class="solds"><span>' + esc(c.soldLabel || "Sold recently") + '</span>' +
      '<span class="plat">' + PLAT_SVG + esc(c.platform || "") + "</span></div>" +
      '<div class="price">' + esc(priceStr(c.display)) + "</div>" + usdAnchor + prem +
      '<div class="miles">' + esc(milesStr(c)) + "</div>" +
      '<div class="cspec">' + lint(esc(c.explanation || c.spec || ""), "card.explanation") + "</div>" + view + "</div></div>";
  }
  function gridHtml(cards) {
    if (cards.length === 1) {
      return '<div class="grid" data-stage="cards" style="grid-template-columns:minmax(0,360px)">' + cardHtml(cards[0], true) + "</div>";
    }
    if (cards.length === 2) {
      return '<div class="grid" data-stage="cards" style="grid-template-columns:1fr 1fr;max-width:680px">' + cards.map(function (c) { return cardHtml(c, false); }).join("") + "</div>";
    }
    var hero = cards.filter(function (c) { return c.closest; })[0] || cards[0];
    var rest = cards.filter(function (c) { return c !== hero; });
    return '<div class="grid" data-stage="cards"><div>' + cardHtml(hero, true) + "</div>" +
      '<div class="rightcol">' + rest.map(function (c) { return cardHtml(c, false); }).join("") + "</div></div>";
  }

  // ---------------------------------------------------------------- Sam's Take variant pool (T1.5)
  // A small pool of note-structures, selected DETERMINISTICALLY by evidence shape + car
  // (no LLM), filled with the displayed cards' own numbers. Two different cars pick
  // different structures. Money uses outcome verbs; no valuation/positional/anchor words.
  function cardDesc(c, closest) {
    var p = priceStr(c.display) || usd(c.value);
    if (Number.isFinite(c.mileage) && Number.isFinite(closest.mileage)) {
      var dm = c.mileage - closest.mileage;
      if (Math.abs(dm) < 1500) return "the " + p + " car had similar miles";
      return "the " + p + " car had " + Math.abs(dm).toLocaleString("en-US") + (dm < 0 ? " fewer" : " more") + " miles";
    }
    var cd = String(c.date || "").slice(0, 10), zd = String(closest.date || "").slice(0, 10);
    if (cd && zd && cd > zd) return "the " + p + " car sold more recently";
    if (cd && zd && cd < zd) return "the " + p + " car sold earlier";
    return "the " + p + " car is the other comparable sale";
  }
  var THREE_TAKES = [
    function (z, a, b) { return "The " + z + " sale is the one I’d pay most attention to. " + cap0(a) + ", while " + b + "."; },
    function (z, a, b) { return "Of these, " + z + " lines up closest with yours. " + cap0(a) + "; " + b + "."; },
    function (z, a, b) { return "I’d read the " + z + " result most closely. " + cap0(a) + ", and " + b + "."; },
    function (z, a, b) { return "The clearest comparison here is the " + z + " car. " + cap0(a) + ", whereas " + b + "."; },
    function (z, a, b) { return "Start with the " + z + " sale. " + cap0(a) + "; on the other side, " + b + "."; },
    function (z, a, b) { return "The one that sits nearest yours is " + z + ". " + cap0(a) + ", and " + b + "."; }
  ];
  function cap0(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function samNoteHtml(d) {
    var cards = d.cards || [];
    if (!cards.length) return "";
    var closest = cards.filter(function (c) { return c.closest; })[0] || cards[0];
    var zPrice = priceStr(closest.display) || usd(closest.value);
    var seed = hashStr((d.vehicle ? (d.vehicle.make + d.vehicle.model + d.vehicle.year) : "") + ":" + d.count);
    var text;
    if (d.tier === "three") {
      var others = cards.filter(function (c) { return c !== closest; });
      var a = cardDesc(others[0], closest), b = others[1] ? cardDesc(others[1], closest) : "";
      var pick = THREE_TAKES[seed % THREE_TAKES.length];
      text = b ? pick(zPrice, a, b) : (cap0(a) + ", next to the " + zPrice + " sale I’d read most closely.");
    } else if (d.tier === "two") {
      var o = cards.filter(function (c) { return c !== closest; })[0];
      var TWO = ["These are thin on the ground, so I’m reading the two sales I have. " + cap0(cardDesc(o, closest)) + ".",
                 "With only two comparable sales, I’d weigh both: the " + zPrice + " car nearest yours, and " + cardDesc(o, closest) + ".",
                 "Two sales is what the record holds here. The " + zPrice + " result reads closest, and " + cardDesc(o, closest) + "."];
      text = TWO[seed % TWO.length];
    } else {
      var ONE = ["There isn’t enough recent activity for a range, so this " + zPrice + " sale is the one I’d actually read for yours.",
                 "One sale is what I’d stand behind here: the " + zPrice + " result, closest to your car.",
                 "The record is thin, but the " + zPrice + " sale is a real, comparable one I’d read for yours."];
      text = ONE[seed % ONE.length];
    }
    return '<div class="sam note" data-stage="note"><div class="ava">SAM</div><div class="body"><p>' + lint(esc(text), "samNote").replace(/\$([\d,]+)/g, '<span class="num">$$$1</span>') + "</p></div></div>";
  }

  // ---------------------------------------------------------------- shared chrome
  function inboxHtml(value, placeholder) {
    return '<div class="inbox"><input id="ob-input" ' + (value ? 'value="' + esc(value) + '"' : 'placeholder="' + esc(placeholder || "2005 BMW M3 coupe manual 72k miles") + '"') + '>' +
      '<button class="cam" title="Add a photo">&#9635;</button><button class="go" id="ob-go">&#8594;</button></div>';
  }
  function footHtml() {
    return '<div class="foot"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Real sales only. No estimates. No valuations.</div>';
  }
  function samTakeHtml(d) {
    var take = "Got it. I’m looking at comparable sales for your " + carLabel(d.resolvedCar) + ".";
    return '<div data-stage="resolved"><div class="sam"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div>' +
      "<p>" + lint(esc(take), "samTake") + "</p></div>" +
      '<button class="edit" id="ob-edit">Edit details</button></div></div>';
  }
  function sellHtml() {
    return '<div class="sell" data-stage="note"><div><h3>Ready to sell?</h3><p>I can tell you the best places to sell your car right now and why.</p></div>' +
      '<a id="ob-sell">See where I’d sell it &#8594;</a></div>';
  }
  function refineHtml() {
    return '<div class="refine" data-stage="note"><p class="r-lead">Colour and history move individual cars. Tell me what matters about yours and I’ll tighten the read.</p>' +
      '<input id="ob-refine" placeholder="e.g. Competition Package, recent service, original paint"></div>';
  }
  function recentHtml() {
    var items = recentSearches();
    if (!items.length) return "";
    return '<div class="recent" data-stage="note"><div class="rh"><h4>Recent searches</h4></div><div class="rcards">' +
      items.slice(0, 4).map(function (it) { return '<div class="rc" data-recent="' + esc(it.q) + '"><span class="th"></span><span><span class="t">' + esc(it.label) + '</span><span class="u">' + esc(it.when) + "</span></span></div>"; }).join("") + "</div></div>";
  }
  function whyRow() { return '<div class="whyrow" data-stage="answer"><button class="why"><span class="i">i</span>Why these cars?</button></div>'; }

  // ---------------------------------------------------------------- state renderers
  function chipsHtml(options, kind) {
    return '<div class="chips">' + (options || []).map(function (o) { return '<button class="chip" data-' + kind + '="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div>";
  }
  function renderEmpty() {
    var proof = proofLine();
    root.innerHTML =
      "<h1>What have cars like yours actually sold for?</h1>" +
      '<p class="lede">Real sales. Real cars. No guesswork.</p>' +
      inboxHtml("", "2005 BMW M3 coupe manual 72k miles") +
      (proof ? '<p class="proof" id="ob-proof">' + proof + "</p>" : "") +
      recentHtml() + footHtml();
    wire();
    startProofRotation();
  }
  function renderResults(d) {
    // Head: on a VIN exact match the ANCHOR beat (callout + bridge) leads on EVERY tier -
    // the exact car is known even if the similar-sales pool is thin or empty, so the anchor
    // is never dropped. Otherwise the generic "Sam's take" leads a real result; refusal and
    // zero are their own single Sam block.
    var isResult = (d.tier === "three" || d.tier === "two" || d.tier === "one");
    var head = vinAnchor ? anchorHtml(vinAnchor, d.resolvedCar) : (isResult ? samTakeHtml(d) : "");
    var body;
    if (d.tier === "three" || d.tier === "two" || d.tier === "one") {
      body = '<div data-stage="answer">' + answerHtml(d) + '<div class="meta-row">' + basisHtml(d) + utilsHtml() + "</div></div>" +
        whyRow() + gridHtml(d.cards) + samNoteHtml(d) + refineHtml() + sellHtml() + recentHtml();
    } else if (d.tier === "zero") {
      body = '<div class="sam" data-stage="answer"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div><p style="font-size:20px;line-height:1.45">' +
        lint(esc("I don’t have enough real " + carLabel(d.resolvedCar) + " sales to show you an honest read, and I won’t make one up. Try another car and I’ll pull what actually sold."), "zero") + "</p>" +
        chipsHtml(["Change the car"], "change") + "</div></div>" + sellHtml();
    } else if (d.tier === "underspecified") {
      // Refusal (signature trust state): NO answer line. Ask for the trim/engine.
      body = '<div class="sam" data-stage="answer"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div><p style="font-size:22px;line-height:1.4">' +
        lint(esc(d.samLine || "The sold examples here vary too much to show you an honest read. Add the trim or engine and I’ll compare like for like."), "refuse") + "</p></div></div>";
    }
    root.innerHTML = inboxHtml(lastQuery) + head + body + footHtml();
    wire();
    streamReveal();
  }
  function renderChoice(d) {
    var opts = d.modelOptions || d.bodyOptions || [];
    var kind = d.modelOptions ? "model" : "body";
    root.innerHTML = inboxHtml(lastQuery) +
      '<div class="sam" style="margin-top:26px"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div>' +
      '<p style="font-size:22px;line-height:1.4">' + lint(esc(d.prompt || "Which one is it?"), "choice") + "</p>" +
      chipsHtml(opts, kind) + "</div></div>" + footHtml();
    wire();
  }
  function renderError(msg) {
    root.innerHTML = inboxHtml(lastQuery) +
      '<div class="sam" style="margin-top:26px"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div><p>' + esc(msg) + "</p></div></div>" + footHtml();
    wire();
  }

  // ---------------------------------------------------------------- streaming (T1.4)
  function streamReveal() {
    var stages = ["resolved", "anchor", "answer", "cards", "note"];
    var els = [];
    stages.forEach(function (s) { Array.prototype.forEach.call(root.querySelectorAll('[data-stage="' + s + '"]'), function (e) { e.classList.add("stage-pending"); els.push(e); }); });
    var i = 0;
    (function step() {
      if (i >= els.length) return;
      els[i].classList.remove("stage-pending");
      i++;
      setTimeout(step, 170);
    })();
  }
  function workingLine(car, d) {
    var n = d ? d.count : null, m = d ? d.platformsCount : null;
    var txt = (n != null) ? ("Reading the market · " + n + " " + (n === 1 ? "sale" : "sales") + " across " + m + " " + (m === 1 ? "platform" : "platforms")) : ("Reading the market for your " + car);
    return '<div class="working"><span class="pulse"></span>' + esc(txt) + "</div>";
  }

  // ---------------------------------------------------------------- VIN anchor (Task 2)
  var vinAnchor = null;   // carried from the confirm step into the result render
  var pendingVin = null;  // resolved vehicle awaiting confirmation
  function obDetectVin(text) {
    var up = String(text || "").toUpperCase().replace(/[\s.\-]+/g, "");
    if (up.length !== 17) return null;
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(up)) return null;   // VIN alphabet (no I/O/Q)
    return (/[A-Z]/.test(up) && /[0-9]/.test(up)) ? up : null;  // real VINs mix letters + digits
  }
  var OB_PLAT = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty", rmsothebys: "RM Sotheby's", gooding: "Gooding & Co", acc: "All Collector Cars", allcollectorcars: "All Collector Cars", collectingcars: "Collecting Cars" };
  function obPlat(s) { var k = String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return OB_PLAT[k] || (s ? String(s) : ""); }
  function monthYear(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return p.length >= 2 ? ((M[Number(p[1])] || "") + " " + p[0]).trim() : ""; }
  // The ANCHOR beat (a + b): "I know this exact car..." + photo + receipt, then a one-line
  // BRIDGE into the pool. NEVER validates or predicts the anchor (no "still looks strong" /
  // "holds its value") - factual sale record + a neutral transition only. Copy-lint enforced.
  function anchorHtml(match, rc) {
    if (!match || (!match.soldDate && !match.price)) return "";
    var plat = obPlat(match.source), when = monthYear(match.soldDate), price = match.price ? usd(match.price) : null;
    var onP = plat ? " on " + plat : "", whenT = when ? " in " + when : "", forT = price ? " for " + price : "";
    var line = (Number(match.count) > 1)
      ? ("I know this exact car. It’s traded " + (match.count === 2 ? "twice" : match.count + " times") + " in our records, most recently" + onP + whenT + forT + ".")
      : ("I know this exact car. It sold" + onP + whenT + forT + ".");
    var name = [rc && rc.year, rc && rc.make, rc && rc.model].filter(Boolean).join(" ") || "this car";
    var photo;
    if (match.photoUrl) photo = '<div class="vin-photo"><img src="' + esc(match.photoUrl) + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.vin-plate\');if(p)p.style.display=\'flex\'"><div class="vin-plate"><div class="m">' + esc(plat) + '</div><div class="n">' + esc(name) + '</div><div class="s">Photo unavailable</div></div></div>';
    else photo = '<div class="vin-photo"><div class="vin-plate" style="display:flex"><div class="m">' + esc(plat) + '</div><div class="n">' + esc(name) + '</div><div class="s">Photo unavailable</div></div></div>';
    var receipt = match.url ? '<a class="anchor-receipt" href="' + esc(match.url) + '" target="_blank" rel="noopener">View that sale</a>' : "";
    var bridge = "Let’s see what’s happened with similar " + esc((rc && rc.model) ? rc.model : "cars") + "s since.";
    return '<div class="anchor" data-stage="anchor"><div class="sam"><div class="ava">SAM</div><div class="body"><div class="tag">The exact car</div>' +
      "<p>" + lint(esc(line), "anchor") + "</p>" + photo + receipt + "</div></div>" +
      '<p class="bridge">' + lint(bridge, "bridge") + "</p></div>";
  }

  // ---------------------------------------------------------------- run (dispatcher)
  function run(text) {
    text = String(text || "").trim();
    if (!text) return;
    lastQuery = text; vinAnchor = null; pendingVin = null;
    // A 17-char VIN routes through the shared resolver (decode + confirm + exact match)
    // before the pool; everything else goes straight to the archive pool.
    if (obDetectVin(text)) { vinResolve(text); return; }
    runPool(text, null);
  }
  function runPool(text, vehicle) {
    root.innerHTML = inboxHtml(text) + workingLine(esc(carLabel(vehicle) || text), null) + footHtml();
    wire();
    var car = { raw: text };
    if (vehicle) car.vehicle = vehicle;
    fetch(API_ORIGIN + "/api/sellerDecision", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oneBox: true, anonId: obAnonId(), car: car })
    }).then(function (r) { return r.json(); }).then(function (d) {
      pushRecent(text, d);
      if (d && d.status === "needs_clarification") { renderError("I couldn’t pin that exact car down. Try the year, make and model together, like 1972 Porsche 911 or 1969 Ford Mustang."); return; }
      if (!d || d.status !== "one_box") { renderError("I’m having trouble reading the market right now. Give it another try in a moment."); return; }
      if (d.tier === "rate_limited") { renderError(d.samLine || "That’s a lot of lookups for one day. Come back tomorrow and I’ll keep pulling real sales."); return; }
      if (d.tier === "model_choice" || d.tier === "body_choice") { renderChoice(d); return; }
      if (vinAnchor) obEvent("onebox_vin_anchor_shown");
      root.innerHTML = inboxHtml(text) + (vinAnchor ? "" : samTakeHtml(d)) + workingLine(carLabel(d.resolvedCar), d) + footHtml();
      wire();
      obAnalytics(d);
      setTimeout(function () { renderResults(d); }, 260);
    }).catch(function () { renderError("I’m having trouble reading the market right now. Give it another try in a moment."); });
  }
  // VIN path: decode + confirm (reuses /api/vehicleIdentity). VINs travel in the request
  // body only; nothing here logs the raw VIN.
  function vinResolve(text) {
    root.innerHTML = inboxHtml(text) + workingLine("Reading that VIN", null) + footHtml();
    wire();
    fetch(API_ORIGIN + "/api/vehicleIdentity", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        var cl = d && d.clarification;
        // Branch on clarification KIND first (status can be needs_confirmation OR
        // needs_clarification for a vin_confirmation depending on the resolver path).
        if (cl && cl.kind === "vin_confirmation") {
          pendingVin = d.vehicle || null; vinAnchor = d.vinArchiveMatch || null;
          renderVinConfirm(cl.question, d.vehicle);
          return;
        }
        if (cl && (cl.kind === "vin_decode_failed" || cl.kind === "vin_invalid_shape" || cl.kind === "chassis_hint")) { renderError(cl.question); return; }
        if (d && d.status === "valid" && d.vehicle) { pendingVin = null; vinAnchor = null; runPool(text, d.vehicle); return; }
        if (d && d.status === "needs_clarification" && cl && (cl.chips || (d.vehicle && d.vehicle.make))) {
          // Partial decode (make+year, no model): ask the model with chips, same as /sell.
          renderChoice({ prompt: cl.question || "Which model is it?", modelOptions: (cl.chips || []).filter(function (c) { return !/^not sure$/i.test(c); }) });
          return;
        }
        // Anything else: fall back to the pool on the raw text.
        runPool(text, null);
      }).catch(function () { runPool(text, null); });
  }
  function renderVinConfirm(question, vehicle) {
    root.innerHTML = inboxHtml(lastQuery) +
      '<div class="sam" style="margin-top:26px"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div>' +
      '<p style="font-size:20px;line-height:1.4">' + lint(esc(question || "Is this your car?"), "vinconfirm") + "</p>" +
      '<div class="chips"><button class="chip" id="ob-vin-yes">Yes, that’s it</button><button class="chip" id="ob-vin-no">No, let me type it</button></div>' +
      "</div></div>" + footHtml();
    wire();
    var yes = document.getElementById("ob-vin-yes"), no = document.getElementById("ob-vin-no");
    if (yes) yes.addEventListener("click", function () { runPool(lastQuery, pendingVin); });
    if (no) no.addEventListener("click", function () { vinAnchor = null; pendingVin = null; renderEmpty(); });
  }

  // ---------------------------------------------------------------- analytics (T1.7)
  // Aggregate-only: event name + a persistent anon id + a HASHED dedup key. Never the raw
  // query, VIN or chassis string. onebox_search is logged server-side (the cap's
  // authoritative source); the client logs outcome + interaction events.
  function obAnonId() {
    try { var a = localStorage.getItem("gas_ob_anon"); if (a) return a; a = "ob-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("gas_ob_anon", a); return a; }
    catch (e) { return null; }
  }
  var obFired = {};
  function obEvent(event, keySeed) {
    try {
      // Dedup CLIENT-side (per event + query, this page load): the server's
      // on_conflict=event,dedup_key path is unavailable, so a dedup_key insert is
      // dropped. We send NO dedup_key (plain insert records reliably) and guard
      // re-renders here so a single render never double-counts.
      var k = event + ":" + hashStr(String(keySeed || lastQuery));
      if (obFired[k]) return;
      obFired[k] = 1;
      var body = JSON.stringify({ event: event, anonSessionId: obAnonId() });
      var url = API_ORIGIN + "/api/funnel";
      if (navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); return; }
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function obAnalytics(d) {
    try {
      if (d.tier === "underspecified") obEvent("onebox_refusal_shown");
      else if (d.tier === "zero") obEvent("onebox_zero");
      else if (d.tier === "two") obEvent("onebox_thin_two");
      else if (d.tier === "one") obEvent("onebox_thin_one");
      else if (d.tier === "three") obEvent("onebox_answer_shown");
    } catch (e) {}
  }

  // ---------------------------------------------------------------- proof line (T1.3 empty storefront)
  function fetchProof() {
    fetch(API_ORIGIN + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oneBoxProof: true }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && d.proof && d.proof.length) { proofPool = d.proof; var el = document.getElementById("ob-proof"); if (el) el.innerHTML = proofLine(); } }).catch(function () {});
  }
  function relDay(dstr) {
    if (!dstr) return "recently";
    var d = new Date(String(dstr).slice(0, 10)); if (isNaN(d)) return "recently";
    var days = Math.round((Date.now() - d.getTime()) / 864e5);
    if (days <= 0) return "today"; if (days === 1) return "yesterday"; if (days < 7) return days + " days ago"; if (days < 14) return "last week"; return "recently";
  }
  var proofIdx = 0;
  function proofLine() {
    if (!proofPool.length) return "";
    var p = proofPool[proofIdx % proofPool.length];
    var name = [p.year, p.make, p.model].filter(Boolean).join(" ");
    return lint("A <span class=\"num\">" + esc(p.year) + "</span> " + esc([p.make, p.model].filter(Boolean).join(" ")) + " brought <span class=\"num\">" + usd(p.price) + "</span> on " + esc(p.platform) + " " + esc(relDay(p.date)) + ".", "proof");
  }
  var proofTimer = null;
  function startProofRotation() { if (proofTimer) clearInterval(proofTimer); proofTimer = setInterval(function () { proofIdx++; var el = document.getElementById("ob-proof"); if (el && proofPool.length) el.innerHTML = proofLine(); else if (!document.getElementById("ob-proof")) { clearInterval(proofTimer); } }, 3200); }

  // ---------------------------------------------------------------- recent searches (localStorage)
  function recentSearches() { try { return JSON.parse(localStorage.getItem("gas_ob_recent") || "[]"); } catch (e) { return []; } }
  function pushRecent(q, d) {
    try {
      var label = (d && d.resolvedCar) ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model].filter(Boolean).join(" ") : q;
      var list = recentSearches().filter(function (it) { return it.q !== q; });
      list.unshift({ q: q, label: label || q, when: "Just now" });
      localStorage.setItem("gas_ob_recent", JSON.stringify(list.slice(0, 8)));
    } catch (e) {}
  }

  // ---------------------------------------------------------------- handoff + share
  function toSell() { try { if (lastQuery) localStorage.setItem("gas_onebox_prefill", lastQuery); } catch (e) {} obEvent("onebox_sell_handoff_clicked"); location.href = "/sell"; }
  function shareResult() {
    obEvent("onebox_share_clicked");
    var url = location.origin + "/onebox?q=" + encodeURIComponent(lastQuery);
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    var btn = root.querySelector("[data-share]"); if (btn) { var old = btn.innerHTML; btn.innerHTML = "Copied"; setTimeout(function () { btn.innerHTML = old; }, 1400); }
  }

  // ---------------------------------------------------------------- wiring
  function wire() {
    var input = document.getElementById("ob-input");
    var go = document.getElementById("ob-go");
    if (go) go.addEventListener("click", function () { run(input && input.value); });
    if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(input.value); } });
    var edit = document.getElementById("ob-edit"); if (edit) edit.addEventListener("click", function () { renderEmpty(); if (input && lastQuery) { var i2 = document.getElementById("ob-input"); if (i2) { i2.value = lastQuery; i2.focus(); } } });
    var sell = document.getElementById("ob-sell"); if (sell) sell.addEventListener("click", toSell);
    var share = root.querySelector("[data-share]"); if (share) share.addEventListener("click", shareResult);
    Array.prototype.forEach.call(root.querySelectorAll("[data-model]"), function (b) { b.addEventListener("click", function () { run((lastQuery || "") + " " + b.getAttribute("data-model")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-body]"), function (b) { b.addEventListener("click", function () { run((lastQuery || "") + " " + b.getAttribute("data-body")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-change]"), function (b) { b.addEventListener("click", function () { renderEmpty(); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-recent]"), function (b) { b.addEventListener("click", function () { run(b.getAttribute("data-recent")); }); });
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    renderEmpty();
    fetchProof();
    var q = /[?&]q=([^&]*)/.exec(location.search || "");
    if (q) { try { run(decodeURIComponent(q[1])); } catch (e) {} }
  }
  boot();
})();
