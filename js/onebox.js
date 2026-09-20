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
  var obSnapshotId = null; // stable id of the last result, for the shareable /o/<id> URL
  var obAsOf = null;       // when THIS analysis ran (product rule 4: run date, not freshness)
  var obResolvedCar = null; // the resolved vehicle of the current result, for the /sell handoff
  var obSourceVin = null;   // the 17-char VIN when this result was VIN-sourced (travels to /sell)
  var obRefinePhrase = null; // the earned-question lead ("In the 100k to 160k miles band") on a refined view
  var obLastVehicle = null;  // the resolved vehicle of the current pool, reused for an inline refine
  // Two-beat rotating placeholder (Screen 1). No listing-URL example (not a built path),
  // no real VIN string. Slow, subtle rotation handled by startPlaceholderRotation().
  var PLACEHOLDER_BEATS = ["2005 BMW M3 coupe manual 72k miles", "Or paste your VIN"];
  var phTimer = null, phIdx = 0;

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
    // Prefer the clean canonical/display label (the title-derived "1990 BMW M3") over rebuilding
    // from the raw model field ("E30 M3") when it's present.
    if (rc.canonicalLabel) return rc.canonicalLabel;
    // Drop the body word when the trim already carries it (a "Roadster" trim + "roadster" body
    // would print "300SL Roadster Roadster"); trim stays to protect real model names.
    var body = rc.bodyStyle && !(rc.trim && String(rc.trim).toLowerCase().indexOf(String(rc.bodyStyle).toLowerCase()) >= 0) ? cap(rc.bodyStyle) : "";
    return [rc.year, rc.make, rc.model, rc.trim, body].filter(Boolean).join(" ") || "your car";
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
  var LINT_BANNED = /\b(worth|valuation|valued|estimate[sd]?|estimating|apprais\w*|midpoint|average[sd]?|averaging|\bmean\b|typical price|best read|anchor|high(est)? price|low(est)? price|middle price|going rate|market value|fair value|book value|should (sell|go|fetch|bring) for|will (sell|go|fetch|bring) for|pristine|mint condition|excellent condition|concours|still looks? strong|holds? (its )?value|holding (its )?value|good investment|can'?t go wrong|only going up|solid buy)\b/i;
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
    // "one" answer line removed pending the results-screen redesign (no replacement copy yet).
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
  // As-of line (Task 4): shown ONLY on a re-opened shared snapshot, so a reader who lands on
  // an old /o/<id> link knows when the read was taken. Product rule 4: this is when the
  // analysis RAN, never a claim about data freshness.
  function monthDayYear(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return M[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
  }
  function asOfHtml() {
    if (!obAsOf) return "";
    var when = monthDayYear(obAsOf); if (!when) return "";
    return '<span class="basis" style="margin-left:10px">As of ' + esc(when) + "</span>";
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
                 "The record is thin, but the " + zPrice + " sale is a real, comparable one I’d read for yours."];
      text = ONE[seed % ONE.length];
    }
    return '<div class="sam note" data-stage="note"><div class="ava">SAM</div><div class="body"><p>' + lint(esc(text), "samNote").replace(/\$([\d,]+)/g, '<span class="num">$$$1</span>') + "</p></div></div>";
  }

  // ---------------------------------------------------------------- shared chrome
  function inboxHtml(value, placeholder) {
    // Single control: text input + green submit arrow. The square photo affordance is
    // removed (photo input is not a built capability).
    return '<div class="inbox"><input id="ob-input" ' + (value ? 'value="' + esc(value) + '"' : 'placeholder="' + esc(placeholder || PLACEHOLDER_BEATS[0]) + '"') + '>' +
      '<button class="go" id="ob-go" aria-label="Ask Sam">&#8594;</button></div>';
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
  // refineHtml removed: it was an unbuilt feature (no submit, did nothing) and "tighten the
  // read" is valuation language. Unbuilt features do not render.
  function recentHtml() {
    var items = recentSearches();
    if (!items.length) return "";
    return '<div class="recent" data-stage="note"><div class="rh"><h4>Recent searches</h4></div><div class="rcards">' +
      items.slice(0, 4).map(function (it) {
        var th = it.img ? '<span class="th" style="background-image:url(\'' + esc(it.img) + '\');background-size:cover;background-position:center"></span>' : '<span class="th"></span>';
        return '<div class="rc" data-recent="' + esc(it.q) + '">' + th + '<span><span class="t">' + esc(it.label) + '</span><span class="u">' + esc(it.when) + "</span></span></div>";
      }).join("") + "</div></div>";
  }
  function whyRow() { return '<div class="whyrow" data-stage="answer"><button class="why"><span class="i">i</span>Why these cars?</button></div>'; }
  // JUST SOLD signal: ONE real recent sale, serif line with mono numbers, links to the sale.
  // Recency word is literally true; older than a week reads as the actual date, never "recently".
  function justSoldRecency(dstr) {
    if (!dstr) return "";
    var d = new Date(String(dstr).slice(0, 10)); if (isNaN(d)) return "";
    var days = Math.round((Date.now() - d.getTime()) / 864e5);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    var M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return "on " + M[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function justSoldHtml() {
    if (!proofPool.length) return "";
    var p = proofPool[0];
    var name = esc([p.make, p.model].filter(Boolean).join(" "));
    var when = justSoldRecency(p.date);
    var line = "A <span class=\"num\">" + esc(p.year) + "</span> " + name + " brought <span class=\"num\">" + usd(p.price) + "</span> on <span class=\"plat\">" + esc(p.platform) + "</span>" + (when ? " " + esc(when) : "") + ".";
    var open = p.url ? '<a class="justsold" id="ob-justsold" href="' + esc(p.url) + '" target="_blank" rel="noopener">' : '<div class="justsold" id="ob-justsold">';
    var close = p.url ? "</a>" : "</div>";
    return open + '<span class="js-label">Just sold</span><span class="js-line">' + lint(line, "justsold") + "</span>" + close;
  }

  // ---------------------------------------------------------------- state renderers
  function chipsHtml(options, kind) {
    return '<div class="chips">' + (options || []).map(function (o) { return '<button class="chip" data-' + kind + '="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div>";
  }
  function renderEmpty() {
    // Screen 1: green script kicker, dominant serif headline, one input, restrained
    // positioning line, then the JUST SOLD signal. No subtitle, no square icon, no recent
    // grid (past searches live in the rail's "Your results").
    root.innerHTML =
      '<div class="ob-kicker">Go ahead, ask Sam.</div>' +
      "<h1>What have cars like yours actually sold for?</h1>" +
      inboxHtml("", PLACEHOLDER_BEATS[0]) +
      '<div class="posline">Real sales only. No estimates. No valuations.</div>' +
      '<div id="ob-justsold-wrap">' + justSoldHtml() + "</div>";
    wire();
    startPlaceholderRotation();
    syncRailResults();
  }
  // ---------------------------------------------------------------- round-3 result render
  // The locked /onebox-preview (Screen 2) design, driven ENTIRELY by the engine's structured
  // facts (span/cluster/recency/basis/platforms/cards/refusal). Prose is composed here with
  // styled number spans; the engine never sends prose numbers. Matches the design of record.
  function r3money(n) { return '<span class="num">' + usd(n) + "</span>"; }
  function spellK(n) { return ({ 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" })[n] || String(n); }
  function bareModelOf(rc, m) {
    var name = (m && m.displayName) || carLabel(rc) || "";
    return String(name).replace(/^\d{4}\s+\S+\s+/, "").trim() || String(name) || "car";
  }
  // Singular, make-inclusive headline subject: "The {make} {model} {trim} {Body}". Never
  // pluralised (no "718 Cayman Ss"). Body is included only when it is a distinguishing open
  // variant (Convertible/Cabriolet/Roadster/Targa) - coupe/sedan are the default and omitted.
  function headlineSubject(rc, trim) {
    if (!rc || (!rc.make && !rc.model)) return "This car";
    var model = rc.model || "";
    // Drop a trim that merely repeats the model ("M3" model + "M3" trim -> not "M3 M3").
    var t = (trim && obNorm(trim) !== obNorm(model) && obNorm(model).indexOf(obNorm(trim)) < 0) ? trim : "";
    var body = rc.bodyStyle && /^(convertible|cabriolet|roadster|targa|spyder|spider|wagon)$/i.test(rc.bodyStyle) ? cap(rc.bodyStyle) : "";
    var parts = [rc.make, model, t, body].filter(Boolean).join(" ");
    return "The " + parts;
  }
  // The exact-car header (matched only): "I know this exact car" + photo + config line + receipt.
  function exactCarHtml(m, rc) {
    if (!m || (!m.price && !m.soldDate)) return "";
    var name = m.displayName || carLabel(rc);
    var bare = bareModelOf(rc, m);
    var plat = obPlat(m.source);
    // Cosmetic-only fitments (tint, wheels, mats, badges, stereo) do not change the car's
    // market read - they never render a fitments sentence. Only material or a genuine RUN of
    // bolt-ons does; n=1 reads "with X added" (no "run of", no "among them"); n=0 says nothing.
    var COSMETIC = /tinted?\s?window|window\s?tint|wheels?|tyres?|tires?|floor\s?mats?|\bbadges?\b|emblem|stereo|radio|speakers?|head\s?unit|dash\s?cam|radar|cover|decal|sticker/i;
    var mods = m.modifications || [];
    var material = m.materialMods || [];
    var substantive = mods.filter(function (x) { return !COSMETIC.test(x); });
    var keyMods = ((m.keyMods && m.keyMods.length ? m.keyMods : substantive.slice(0, 3)) || []).join(", ");
    var cfg = "";
    if (material.length) {
      cfg = "The prior listing shows material work" + (m.engine ? " on the " + esc(m.engine) : "") + (keyMods ? ", the " + esc(keyMods) + " among it" : "") + ", so it reads as a modified car rather than a standard " + esc(bare) + ".";
    } else if (substantive.length >= 2) {
      cfg = "The prior listing has it with " + (m.engine ? "the " + esc(m.engine) + " and " : "") + "a run of bolt-on fitments, the " + esc(substantive.slice(0, 3).join(", ")) + " among them. All reversible, so it still reads as a standard " + esc(bare) + ", not a rebuilt car.";
    } else if (substantive.length === 1) {
      cfg = "The prior listing has it with " + esc(String(substantive[0]).toLowerCase()) + " added" + (m.engine ? " on the " + esc(m.engine) : "") + ", so it still reads as a standard " + esc(bare) + ".";
    } else if (m.engine) {
      cfg = "The prior listing has it with the " + esc(m.engine) + ", so it still reads as a standard " + esc(bare) + ".";
    }
    // The fitments detail lists ALL mods, but only renders when there is a real run to see.
    var showDisc = material.length + substantive.length >= 2;
    var photo = m.photoUrl ? '<img src="' + esc(m.photoUrl) + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\'">' : "";
    // Every prior sale on its own line with its own link (a car traded twice needs both links,
    // not one folded into the sentence). Falls back to the single-sale fields when no array.
    var salesArr = (m.sales && m.sales.length) ? m.sales : [{ platform: m.source, soldDate: m.soldDate, price: m.price, url: m.url, mileage: m.mileage }];
    var recLines = salesArr.slice(0, 6).map(function (s) {
      if (!s.price && !s.soldDate) return "";
      var sp = obPlat(s.platform);
      var line = '<span class="p num">' + esc(usd(s.price)) + '</span><span>sold' + (sp ? " on " + esc(sp) : "") + (s.soldDate ? ", " + esc(monthYear(s.soldDate)) : "") + "</span>";
      if (s.mileage) { var mi = Number(String(s.mileage).replace(/[^\d]/g, "")); if (mi) line += '<span class="num">&middot; ' + mi.toLocaleString("en-US") + " mi</span>"; }
      if (s.url) line += '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">View that sale &#8594;</a>';
      return '<div class="rec">' + line + "</div>";
    }).join("");
    var disc = showDisc ? '<details class="disc"><summary>See the ' + mods.length + " listed fitment" + (mods.length === 1 ? "" : "s") + '</summary><ul>' + mods.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" : "";
    return '<div class="exact" data-stage="anchor"><div class="grid">' +
      '<div class="xph">' + photo + '<span class="tag">The exact car</span></div>' +
      '<div class="xbody"><div class="kick">I know this exact car</div><h2>' + esc(name) + "</h2>" +
      (cfg ? '<p class="cfg">' + lint(cfg, "exact.cfg") + "</p>" : "") +
      recLines + disc + "</div></div></div>";
  }
  // The answer block: headline span, gated cluster, gated recency, mono meta line, placement.
  // ---- Round-4 render: Sam's take folded block, earned question, clickable cards, no counts ----
  var OB_UTM = "utm_source=goasksam&utm_medium=onebox&utm_campaign=comp_card";
  function utmUrl(url) { return url ? url + (url.indexOf("?") >= 0 ? "&" : "?") + OB_UTM : null; }
  function windowText(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "the last twelve months" : "the past two years"; }
  function windowMeta(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "Past twelve months" : "Past two years"; }
  function priceRange(a) { return r3money(a[0]) + " to " + r3money(a[1]); }
  function betweenRange(a) { return r3money(a[0]) + " and " + r3money(a[1]); }
  function monthOnly(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return p.length >= 2 ? (M[+p[1]] || "") : ""; }
  function r500f(n) { return Math.round(n / 500) * 500; }
  // Matched-car fourth beat: what the market has done SINCE the car sold, computed from the
  // dated cards; falls back to a placement sentence when there is nothing since.
  function sinceSold(m, cards) {
    if (!m || !m.soldDate) return null;
    var since = (cards || []).filter(function (c) { return c.date && String(c.date).slice(0, 10) > String(m.soldDate).slice(0, 10) && c.price > 0; }).map(function (c) { return c.price; });
    if (since.length < 2) return null;
    return [r500f(Math.min.apply(null, since)), r500f(Math.max.apply(null, since))];
  }
  // SAM'S TAKE: one folded block. Up to four sentences, three sizes, nothing restated elsewhere.
  function samTakeBlock(d, m) {
    var s = d.span || [0, 0], out = '<div class="samtake" data-stage="answer"><div class="tk">Sam’s take</div>';
    if (d.widening) out += '<p class="ladder">' + lint(esc(d.widening), "widening") + "</p>";
    // "The Porsche 997..." stands alone as a headline subject; lowercased after "Right now,".
    var subj = m ? "cars like yours" : esc(headlineSubject(d.resolvedCar, d.poolTrim)).replace(/^The /, "the ") + ((d.poolYears && d.poolYears[1] > d.poolYears[0]) ? " (" + d.poolYears[0] + " to " + d.poolYears[1] + ")" : "");
    var verb = m ? "are" : "is";
    // "Right now," only leads when the window IS the last twelve months. When the pool
    // widened to the past two years (12mo genuinely thin), drop "Right now," and let the
    // subject start the sentence, so the opener never contradicts the stated window.
    var isRecentWindow = /12 months|twelve/.test(d.windowLabel || "");
    var lead = obRefinePhrase ? (obRefinePhrase + ", cars like yours are")
      : (isRecentWindow ? ("Right now, " + subj + " " + verb)
                        : (subj.charAt(0).toUpperCase() + subj.slice(1) + " " + verb));
    var s1 = lead + " bringing " + priceRange(s) + " in " + windowText(d) + ".";
    out += '<p class="s1">' + lint(s1, "s1") + "</p>";
    if (d.cluster) {
      var s2 = "Most land between " + betweenRange(d.cluster) + ".";
      if (d.driver === "mileage") s2 += " The ones at the top are the low-mileage cars; the cheaper end is high-mileage.";
      out += '<p class="s2">' + lint(s2, "s2") + "</p>";
    } else if (d.spanOnly && d.poolN && d.poolN < 8) {
      // Span-without-cluster (#4): a real result with too few sales to mark a typical band.
      // Show the full range (already in s1) and every sale, honestly caveated, no invented middle.
      var n = d.poolN;
      out += '<p class="s2">' + lint("Only " + n + " ha" + (n === 1 ? "s" : "ve") + " sold in " + windowText(d) + ", too few to mark a typical band, so that is the full range and every sale is below.", "s2") + "</p>";
    }
    if (d.direction && !obRefinePhrase) { var conn = d.direction.word === "about level" ? "with" : "than"; out += '<p class="s3">' + lint("That’s " + esc(d.direction.word) + " " + conn + " a year ago, when most landed between " + betweenRange(d.direction.prior) + ".", "s3") + "</p>"; }
    if (m && m.price) {
      var since = sinceSold(m, d.cards);
      if (since) out += '<p class="s4">' + lint("Yours sold for " + r3money(m.price) + " in " + esc(monthOnly(m.soldDate)) + ". The ones since brought " + priceRange(since) + ".", "s4") + "</p>";
      else if (d.cluster) { var c = d.cluster, yp = m.price; var place = yp < c[0] ? "toward the lower end" : yp > c[1] ? "toward the upper end" : (yp > (c[0] + c[1]) / 2 ? "a little above the middle" : "a little below the middle"); out += '<p class="s4">' + lint("Yours sold " + place + ", in company with the driver-grade cars.", "s4") + "</p>"; }
    }
    var tags = d.setAsideTags || [];
    out += '<span class="meta">' + windowMeta(d) + (tags.length ? '<span class="dot">&middot;</span>' + esc(tags.join(" and ")) + " cars set aside" : "") + "</span>";
    return out + "</div>";
  }
  // THE EARNED QUESTION: mileage (pool-relative buckets) or transmission; answered inline.
  function earnedHtml(d, m) {
    var e = d.earned; if (!e) return "";
    // Never ask for a field the matched record already supplies. On an exact archive match the
    // mileage and transmission are known from the listing, so the refinement question is already
    // answered - it must not render (same class as the VIN-decode "don't re-ask what's known" rule).
    if (m) {
      if (e.kind === "mileage" && Number(String(m.mileage == null ? "" : m.mileage).replace(/[^\d]/g, "")) > 0) return "";
      if (e.kind === "transmission" && m.transmission && String(m.transmission).trim()) return "";
    }
    var q, chips;
    if (e.kind === "mileage") {
      q = "How many miles on yours?";
      chips = (e.buckets || []).map(function (bk) { return '<button class="qchip" data-milemin="' + bk.min + '" data-milemax="' + (bk.max == null ? "" : bk.max) + '" data-mlabel="' + esc(bk.label) + '">' + esc(bk.label) + "</button>"; }).join("") + '<button class="qchip typeit" data-typemiles>type it</button>';
    } else if (e.kind === "transmission") {
      q = cap(e.labels.manual) + " or " + e.labels.auto + "?";
      chips = '<button class="qchip" data-tx="manual" data-mlabel="' + esc(e.labels.manual) + '">' + esc(cap(e.labels.manual)) + '</button><button class="qchip" data-tx="auto" data-mlabel="' + esc(e.labels.auto) + '">' + esc(e.labels.auto) + "</button>";
    } else return "";
    return '<div class="earned" data-stage="answer"><p class="q">' + esc(q) + '</p><div class="qchips">' + chips + "</div></div>";
  }
  function receiptCardHtml(c, tagAside) {
    var img = c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.rplate\');if(p)p.style.display=\'flex\'">' : "";
    var aside = (tagAside && c.hollow) ? '<span class="aside">set aside</span>' : "";
    var ext = '<span class="ext"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>';
    var inner = '<div class="rph">' + img + ext + aside + '<div class="rplate"><div class="n">' + esc(c.title) + '</div><div class="s">photo unavailable</div></div></div>' +
      '<div class="rb"><div class="rprice num">' + esc(usd(c.price)) + "</div>" +
      '<div class="rmeta"><span class="num">' + esc(c.mileageText) + '</span><span class="dot">&middot;</span>' + esc(c.platform) + "</div>" +
      '<div class="rdate">' + esc(c.month) + "</div><div class=\"rtitle\">" + esc(c.title) + "</div></div>";
    var href = utmUrl(c.url);
    return href ? '<a class="rcard" href="' + esc(href) + '" target="_blank" rel="noopener" data-cardclick="' + esc(c.platformSlug || "") + '">' + inner + "</a>" : '<div class="rcard">' + inner + "</div>";
  }
  function receiptsHtml(cards, n, tagAside) { return (cards || []).slice(0, n).map(function (c) { return receiptCardHtml(c, tagAside); }).join(""); }
  function platStripHtml(d, m) {
    var plats = d.platforms || [];
    if (!plats.length) return "";
    var pills = plats.map(function (nm) { return '<span class="plat-pill">' + esc(nm) + "</span>"; }).join("");
    var note = "";
    if (d.singlePlatform && d.topPlatform) note = '<p class="plat-note">' + lint("Almost all on " + esc(d.topPlatform) + ", so there is no cross-platform split to read here.", "platnote") + "</p>";
    else if (d.topPlatform) note = '<p class="plat-note">' + lint("Most change hands on " + esc(d.topPlatform) + ".", "platnote") + "</p>";
    return '<div class="seclabel">Where they sold</div><div class="plat-strip">' + pills + "</div>" + note;
  }
  // ============ RENDER PORT (round 7): cluster hero, quiet span, freshness slot, Sam's Read
  // (driver + divergence), three representative cards, See-all -> platforms. Replaces the
  // round-4 samTakeBlock/receipts grid. Engine facts only; copy is composed here (rule 3). ====
  function bareNameOf(d, m) {
    return (m && m.displayName) ? m.displayName.replace(/^\d{4}\s+/, "") : (carLabel(d.resolvedCar) || "car");
  }
  // HERO: the cluster is the unconditional headline; a pool under the cluster gate falls back to
  // the full span. The quiet span line is ALWAYS present so the ceiling is never hidden.
  function heroBlock(d) {
    var hasCluster = !!d.cluster;
    var heroRange = hasCluster ? d.cluster : d.span;
    var out = '<div class="livetake" data-stage="answer"><div class="lt-kick">' + lint("Sam’s live take", "lt.kick") + "</div>";
    out += '<p class="lt-hero">' + priceRange(heroRange) + "</p>";
    out += '<p class="lt-line">' + lint("Cars like yours have " + (hasCluster ? "mostly " : "") + "been bringing this over " + windowText(d) + ".", "lt.line") + "</p>";
    var spanLine = hasCluster
      ? ("Everything from " + priceRange(d.span) + " has sold; most land here.")
      : (d.spanOnly && d.poolN && d.poolN < 8
          ? ("Only " + d.poolN + " ha" + (d.poolN === 1 ? "s" : "ve") + " sold in " + windowText(d) + ", too few to mark a typical band, so that is the full range and every sale is below.")
          : ("Everything from " + priceRange(d.span) + " has sold."));
    out += '<p class="lt-span">' + lint(spanLine, "lt.span") + "</p>";
    // FRESHNESS SLOT (S2-2): pool-aware. Online rides the ingest signal ("through last night" when
    // the pipeline is current, else the real date); house-led states the newest house result in
    // the pool. Direction ("a touch softer than a year ago") could return here alongside it.
    return out + freshLine(d) + "</div>";
  }
  // Pool-aware freshness line (S2-2). NOT passed through lint(): "estimated" is a deliberate
  // negation here (as in the trust line), not a valuation claim. No dashes.
  function freshLine(d) {
    var f = d && d.freshness; if (!f) return "";
    var txt = "";
    if (f.mode === "house") { if (f.through) txt = "Auction results through " + monthOnly(f.through) + "."; }
    else if (f.lastNight) txt = "Real sales through last night. Nothing estimated.";
    else if (f.through) txt = "Real sales through " + monthDayYear(f.through) + ". Nothing estimated.";
    if (!txt) return "";
    return '<div class="fresh"><span class="dot"></span>' + esc(txt) + "</div>";
  }
  // SAM'S READ: driver sentence (gated 5+/5+ in the engine) plus the divergence beat (cases
  // a/b/c) when the matched car's own sale falls materially outside the cluster. No prices except
  // the car's own sale. Refinement chips reuse the earned-question data attributes.
  function samReadBlock(d, m) {
    var driverS = d.driver === "mileage" ? "Mileage is doing most of the separating in the recent sales." : "";
    var dv = d.divergence, parts = [], refine = "";
    if (dv && (dv.kase === "a" || dv.kase === "b" || dv.kase === "c")) {
      if (driverS) parts.push(driverS);
      var price = r3money(dv.price), where = dv.direction; // "below" | "above"
      if (dv.kase === "a") {
        parts.push("Your car itself last sold for " + price + " at <span class=\"num\">" + Number(dv.mileage).toLocaleString("en-US") + "</span> miles. That’s outside where the closest recent sales are clustering today, so current mileage matters here.");
        refine = '<div class="refine"><span class="q">' + lint("Still around " + Number(dv.mileage).toLocaleString("en-US") + " miles?", "read.refq") + '</span><button class="chip g" data-refyes>Yes</button><button class="chip typeit" data-typemiles>Update mileage</button></div>';
      } else if (dv.kase === "b") {
        var bare = bareNameOf(d, m), art = /^[aeiou8]/i.test(bare) ? "an" : "a";
        parts.push("Your car itself last sold for " + price + ", " + where + " where these are clustering, but its listing didn’t record the mileage, and on " + art + " " + esc(bare) + " that is the one fact that would explain it.");
        var bands = (d.earned && d.earned.kind === "mileage" && d.earned.buckets) ? d.earned.buckets : null;
        var bandChips = bands
          ? bands.map(function (bk) { return '<button class="chip" data-milemin="' + bk.min + '" data-milemax="' + (bk.max == null ? "" : bk.max) + '" data-mlabel="' + esc(bk.label) + '">' + esc(bk.label) + "</button>"; }).join("")
          : '<button class="chip" data-milemin="0" data-milemax="100000" data-mlabel="under 100k">Under 100k</button><button class="chip" data-milemin="100000" data-milemax="160000" data-mlabel="100k to 160k">100k to 160k</button><button class="chip" data-milemin="160000" data-milemax="" data-mlabel="over 160k">Over 160k</button>';
        refine = '<div class="refine"><span class="q">' + lint("Roughly how many miles?", "read.askq") + '</span></div><div class="askchips">' + bandChips + '<button class="chip typeit" data-typemiles>Enter miles</button></div>';
      } else { // case c: diverges but mileage does not explain it - state it, ask nothing
        parts.push("Your car itself last sold for " + price + ", " + where + " where these are clustering today.");
      }
    } else {
      if (driverS) parts.push(driverS);
      parts.push("These are the three I’d pay closest attention to.");
    }
    var ps = parts.map(function (p) { return "<p>" + lint(p, "read") + "</p>"; }).join("");
    return '<div class="samread" data-stage="answer"><div class="ava">SAM</div><div><div class="tag">' + lint("Sam’s read", "read.tag") + "</div>" + ps + refine + "</div></div>";
  }
  // A divergence a/b already carries its own refine/ask chips in Sam's Read; the standalone
  // earned block must not also render (one ask, never two).
  function divergenceAsksInline(d) { var dv = d.divergence; return !!(dv && (dv.kase === "a" || dv.kase === "b")); }
  function repMeta(c) {
    var bits = ['<span class="num">' + esc(c.mileageText) + "</span>"];
    if (c.transmission) bits.push(esc(cap(String(c.transmission))));
    return bits.join('<span class="dot">&middot;</span>');
  }
  // House both-numbers (locked addition): the math number (hammer) is the headline; the all-in
  // premium-inclusive price shows beside it, never leading. Non-house cards show price alone.
  function repPrice(c) { return esc(usd(c.price)) + (c.isHouse && c.allIn ? ' <span class="allin">&middot; buyer paid ' + esc(usd(c.allIn)) + " incl. premium</span>" : ""); }
  var DELTA_LABEL = { fewer_miles: "Fewer miles", more_miles: "More miles", manual: "Manual", automatic: "Automatic", earlier: "Earlier sale", higher: "Higher sale", lower: "Lower sale" };
  function bracketCard(c) {
    if (!c) return "";
    var ext = '<span class="ext"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>';
    var img = c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.plate\');if(p)p.style.display=\'flex\'">' : "";
    var lbl = DELTA_LABEL[c.delta] || "Recent sale";
    var meta = '<span class="num">' + esc(c.mileageText) + "</span>" + (c.transmission ? '<span class="dot">&middot;</span>' + esc(cap(String(c.transmission))) : "") + '<span class="dot">&middot;</span>' + esc(monthYear(c.date));
    var inner = '<div class="bth">' + img + ext + '<div class="plate" style="display:' + (c.image ? "none" : "flex") + '"><div class="n">' + esc(c.title) + '</div></div></div>' +
      '<div class="bb"><span class="blabel">' + esc(lbl) + '</span><div class="bprice num">' + repPrice(c) + '</div>' +
      // Name the car as VISIBLE text (year/model/trim), not only in the image-plate that hides when
      // the photo loads - a bracket must never render as an unlabelled $600k "peer" (Sep 2026 fix).
      (c.title ? '<div class="btitle">' + esc(c.title) + '</div>' : "") +
      '<div class="bmeta">' + meta + "</div></div>";
    var href = utmUrl(c.url);
    return href ? '<a class="bcard" href="' + esc(href) + '" target="_blank" rel="noopener" data-cardclick="' + esc(c.platformSlug || "") + '">' + inner + "</a>" : '<div class="bcard">' + inner + "</div>";
  }
  function cards3Html(d, m) {
    var rep = d.representative; if (!rep || !rep.closest) return "";
    var c = rep.closest;
    var why = c.basis === "subject" ? "The nearest recent sale on mileage and spec."
      : (d.driver === "mileage" ? "The middle of the market, on mileage." : "The middle of the market.");
    var ext = '<span class="ext"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>';
    var img = c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.plate\');if(p)p.style.display=\'flex\'">' : "";
    var cmInner = '<div class="rph">' + img + '<span class="cmkick">Closest match</span>' + ext + '<div class="plate" style="display:' + (c.image ? "none" : "flex") + '"><div class="n">' + esc(c.title) + '</div><div class="s">photo pending</div></div></div>' +
      '<div class="rb"><div class="rprice num">' + repPrice(c) + '</div>' +
      '<div class="rmeta">' + repMeta(c) + '</div>' +
      '<div class="rtitle">' + esc(c.title) + '<span class="dot">&middot;</span>' + esc(c.platform) + '<span class="dot">&middot;</span>' + esc(monthYear(c.date)) + '</div>' +
      '<div class="why">' + lint(why, "card.why") + "</div></div>";
    var cmHref = utmUrl(c.url);
    var cm = cmHref ? '<a class="cm" href="' + esc(cmHref) + '" target="_blank" rel="noopener" data-cardclick="' + esc(c.platformSlug || "") + '">' + cmInner + "</a>" : '<div class="cm">' + cmInner + "</div>";
    var brackets = bracketCard(rep.high) + bracketCard(rep.low);
    return '<div class="cards3">' + cm + (brackets ? '<div class="brackets">' + brackets + "</div>" : "") + "</div>";
  }
  function seeAllHtml(d, m) {
    var plats = d.platforms || [];
    if (!plats.length) return "";
    var pills = plats.map(function (nm) { return '<span class="plat-pill">' + esc(nm) + "</span>"; }).join("");
    var note = "";
    if (d.singlePlatform && d.topPlatform) note = '<p class="plat-note">' + lint("Almost all on " + esc(d.topPlatform) + ", so there is no cross-platform split to read here.", "platnote") + "</p>";
    else if (d.topPlatform) note = '<p class="plat-note">' + lint("Most change hands on " + esc(d.topPlatform) + ".", "platnote") + "</p>";
    var label = (d.poolTrim || bareNameOf(d, m)) + " sales, " + windowMeta(d).toLowerCase();
    return '<details class="showall"><summary>See all recent sales</summary>' +
      '<div class="allhead"><span class="lab">' + esc(label) + '</span></div>' +
      '<div class="platwrap"><div class="lab">Where they sold</div><div class="plat-strip">' + pills + "</div>" + note + "</div></details>";
  }
  function resultHtml(d, m) {
    var body = heroBlock(d) + samReadBlock(d, m);
    body += '<div class="seclabel">The sales behind it</div>';
    body += cards3Html(d, m);
    body += seeAllHtml(d, m);
    if (!divergenceAsksInline(d)) body += earnedHtml(d, m);
    body += sellHtml() + recentHtml();
    // Fixed approved disclaimer (round-7 mockup). NOT passed through lint(): "estimates" and
    // "valuations" here are deliberate NEGATIONS of the banned terms, not claims.
    body += '<div class="trust">Real completed sales from GoAskSam’s archive. No estimates. No valuations.</div>';
    return body;
  }
  // Two distinct refusal states, one template set each, so they can never mix:
  //  - THIN: its own copy, shows the sales that exist (or says none), no "guess" headline,
  //    and on a MATCHED car no "give me a different car" (they gave a VIN; the ladder widened).
  //  - VARIED: the "I won't give you a range... a guess" headline + the templated reason + chips.
  function refusalHtml(d, m) {
    var rf = d.refusal || {};
    // Name from the exact-car displayName when matched, else the clean resolved subject - never
    // a raw model+trim concatenation ("4-Series M4 Competition Package").
    var model = (m && m.displayName) ? m.displayName.replace(/^\d{4}\s+/, "") : (rf.model || carLabel(d.resolvedCar) || "car");
    var cards = d.cards || [];
    if (rf.kind === "thin") {
      var lead = cards.length
        ? "Too few recent " + esc(model) + " sales to show an honest spread. Here’s what there is."
        : "There are no recent " + esc(model) + " sales in the window I’d trust for a spread.";
      var follow = m ? "" : "Give me a bit more, or a different car, and I’ll pull what actually sold.";
      var block = '<div class="refusal" data-stage="answer"><div class="sam"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s read</div><p>' + lint(esc(lead), "thin") + "</p>" + (follow ? "<p>" + lint(esc(follow), "thin.follow") + "</p>" : "") + "</div></div></div>";
      var sales = cards.length ? ('<div class="seclabel">What has sold</div><div class="receipts">' + receiptsHtml(cards, 999) + "</div>") : "";
      return block + sales + sellHtml();
    }
    var listJoin = function (a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; };
    // Only claim a YEAR spread when there genuinely is one (>= 2 years, so no "across 1 years").
    // A same-year blend nameplate (250 GT, all 1965) spreads by spec/variant, not by year, so the
    // clause is dropped and the spec/variant argument carries the refusal on its own.
    var yspan = rf.yearSpanPhrase ? (" across " + esc(rf.yearSpanPhrase)) : "";
    var reason = (rf.variants && rf.variants.length >= 2)
      ? "The " + esc(model) + "s that have sold span the " + esc(listJoin(rf.variants)) + yspan + ". Cars this different do not trade as one market, so a single range would invent a pattern that is not there."
      : "The " + esc(model) + "s that have sold range too widely in spec and condition to trade as one market" + yspan + ". A single range would invent a pattern that is not there.";
    var follow2 = "Tell me which " + esc(model) + " yours is and I’ll compare it to the ones that match.";
    var chips = (rf.variants && rf.variants.length)
      ? '<div class="wayfwd">' + rf.variants.map(function (v) { return '<button class="chip" data-model="' + esc(v) + '">' + esc(v) + "</button>"; }).join("") + '<a class="lnk" data-change>Or tell me the year and engine &#8594;</a></div>'
      : "";
    var head = '<div class="refusal" data-stage="answer"><p class="ans">' + lint(esc("I won’t give you a range on this one. It would be a guess."), "refuse") + "</p>" +
      '<div class="sam"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s read</div><p>' + lint(reason, "refuse.reason") + "</p><p>" + lint(esc(follow2), "refuse.follow") + "</p></div></div>" + chips + "</div>";
    var vsales = cards.length ? ('<div class="seclabel">What has sold</div><div class="receipts">' + receiptsHtml(cards, 999) + "</div>") : "";
    return head + vsales + sellHtml();
  }
  // ============ THIN MODE render (Sep 2026, revised) ====================================
  // Two decoupled concerns: THIN MODE (render) fires whenever the online pool is too thin for a
  // volume band; the HOUSE STEER (a layer) only when house share >= 2/3. Flow: ask-first intake
  // ONLY when a split forks THIS car's price (config marker for vintage, mileage/transmission for
  // modern; else no intake line), then a sale-anchored single-sale hero (nearest when placed,
  // median when skipped, never a wide span), receipt cards with hammer + all-in + markers, paired
  // chassis as two receipts (% dormant until 3 pairs). Houses are named by THIS model's own
  // results and are never a routable button here; the venue steer lives in the read + on /sell.
  var HT_WINDOW_TEXT = "the past three years";
  // Item 3 (window honesty): name the REAL span the visible receipts cover, never a blanket window
  // they might contradict. Reads each receipt's sale year from .date (fallback .year). spanSince ->
  // "since 2024" / "in 2026" for the lead sentence; spanRange -> "2024 to 2026" / "in 2026" for the
  // receipt labels. Falls back to the window text when no receipt carries a readable date.
  function receiptYears(list) { return (list || []).map(function (rc) { var y = String((rc && (rc.date || rc.year)) || "").slice(0, 4); return /^\d{4}$/.test(y) ? +y : null; }).filter(Boolean); }
  function spanSince(list) { var ys = receiptYears(list); if (!ys.length) return "over " + HT_WINDOW_TEXT; var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); return lo === hi ? ("in " + lo) : ("since " + lo); }
  function spanRange(list) { var ys = receiptYears(list); if (!ys.length) return HT_WINDOW_TEXT; var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); return lo === hi ? ("in " + lo) : (lo + " to " + hi); }
  // Consignment doors (Sep 2026): the six houses are routable via their consignment intake page
  // (verb "consign", never "list"). Mirror of lib/_houseComps.HOUSE_CONSIGN.
  var HT_CONSIGN = {
    rmsothebys: "https://rmsothebys.com/consign/", broadarrow: "https://www.broadarrowauctions.com/consignment",
    gooding: "https://www.goodingco.com/consign", barrettjackson: "https://www.barrett-jackson.com/consignment-leads",
    bonhams: "https://sell.bonhams.com/?category=Motor%20Cars", mecum: "https://www.mecum.com/collector-cars/how-to-sell/"
  };
  // The house with the strongest recorded results for THIS model among scoped receipts: most sales,
  // then highest median, among houses that run a consignment door. Evidence-ordered, not preference.
  function htHousePick(scope) {
    var g = {};
    (scope || []).forEach(function (rc) {
      if (!rc.isHouse) return; var slug = String(rc.slug || "").toLowerCase(); if (!HT_CONSIGN[slug]) return;
      (g[slug] || (g[slug] = { slug: slug, venue: rc.venue, hammers: [] })).hammers.push(rc.hammer);
    });
    var ranked = Object.keys(g).map(function (k) { var s = g[k].hammers.slice().sort(function (a, b) { return a - b; }); return { slug: k, venue: g[k].venue, count: s.length, median: s[Math.floor((s.length - 1) / 2)], lo: s[0], hi: s[s.length - 1] }; })
      .sort(function (a, z) { return (z.count - a.count) || (z.median - a.median); });
    return ranked.length ? { pick: ranked[0], others: ranked.slice(1, 4) } : null;
  }
  function R4C_MANUAL(t) { return /manual|\d[- ]?speed(?!\s*auto)|\bmt\b|\bstick\b/i.test(t) && !/automatic|pdk|dct|tiptronic|dsg/i.test(t); }
  function R4C_AUTO(t) { return /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle/i.test(t); }
  function htHasMk(rc, key) { return !!(rc.markers && rc.markers.some(function (mk) { return mk.key === key; })); }
  function htMarkerChips(rc) {
    if (!rc.markers || !rc.markers.length) return "";
    return '<span class="htmk">' + rc.markers.map(function (mk) { return '<span class="mk">' + esc(mk.label) + "</span>"; }).join("") + "</span>";
  }
  function htPriceLine(rc) {
    var main = '<span class="num">' + esc(usd(rc.hammer)) + "</span>";
    if (rc.isHouse && rc.allIn) main += ' <span class="allin">&middot; buyer paid ' + esc(usd(rc.allIn)) + " incl. premium</span>";
    return main;
  }
  function htYearVenue(rc) { return (rc.year ? esc(rc.year) + " " : "") + esc(rc.venue); }
  function htMiText(rc) { return Number(rc.mileage) > 0 ? '<span class="htr-mi num">' + Number(rc.mileage).toLocaleString("en-US") + " mi</span>" : ""; }
  function htReceiptRow(rc) {
    var href = utmUrl(rc.url);
    var inner = '<div class="htr-l"><div class="htr-v">' + htYearVenue(rc) + (rc.isHouse ? '<span class="htr-h">auction house</span>' : "") + "</div>" +
      '<div class="htr-t">' + esc(rc.title) + "</div>" + htMiText(rc) + htMarkerChips(rc) + "</div>" +
      '<div class="htr-r"><div class="htr-p num">' + htPriceLine(rc) + "</div>" +
      '<div class="htr-d">' + esc(monthYear(rc.date)) + "</div></div>";
    var ext = href ? '<span class="ext htx"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>' : "";
    return href ? '<a class="htr" href="' + esc(href) + '" target="_blank" rel="noopener" data-cardclick="' + esc(rc.slug || "") + '">' + inner + ext + "</a>" : '<div class="htr">' + inner + "</div>";
  }
  // Intake copy composed CLIENT-side from the engine's split FACTS (product rule 3). Marker splits
  // carry a curated phrasing where we have one; mileage/transmission are generic. Returns the
  // question + chips (value + label). Value encodes how the client scopes: a marker key (yes) /
  // "no:<key>" / "mi:lo" / "mi:hi" / "tx:manual" / "tx:auto".
  var HT_MARKER_PHRASE = {
    competizione: { q: "One thing sets the price apart on these: whether it is a competition car.", yes: "Competition car", no: "Road car" },
    matching_numbers: { q: "One thing moves the number most on these: whether it keeps its original matching-numbers engine.", yes: "Matching numbers", no: "Replacement engine" },
    alloy_body: { q: "One thing sets these apart on price: whether it is an alloy-body car.", yes: "Alloy body", no: "Steel body" },
    long_nose: { q: "One thing separates these on price: whether it is a long-nose car.", yes: "Long nose", no: "Short nose" }
  };
  function thinIntakeCopy(intake) {
    if (!intake) return null;
    if (intake.kind === "marker") {
      var p = HT_MARKER_PHRASE[intake.markerKey];
      if (p) return { q: p.q, chips: [{ v: intake.markerKey, label: p.yes }, { v: "no:" + intake.markerKey, label: p.no }] };
      var lbl = String(intake.markerLabel || "that spec");
      return { q: "One thing separates these on price: whether it is " + lbl.toLowerCase() + ".", chips: [{ v: intake.markerKey, label: lbl }, { v: "no:" + intake.markerKey, label: "Not " + lbl.toLowerCase() }] };
    }
    if (intake.kind === "mileage") {
      var k = intake.thresholdK;
      return { q: "Mileage moves the number most on these. Roughly how many miles on yours?", chips: [{ v: "mi:lo", label: "Under " + k + "k" }, { v: "mi:hi", label: "Over " + k + "k" }] };
    }
    if (intake.kind === "transmission") {
      return { q: "The gearbox splits these on price. Which is yours?", chips: [{ v: "tx:manual", label: "Manual" }, { v: "tx:auto", label: "Automatic" }] };
    }
    return null;
  }
  function thinIntakeHtml(d, ht, name) {
    var c = thinIntakeCopy(ht.intake);
    if (!c) return null;
    var lead = "Before I show you numbers, one thing about your " + esc(name) + ". " + esc(c.q);
    var chips = '<div class="chips htintake">' +
      c.chips.map(function (ch) { return '<button class="chip" data-thinsplit="' + esc(ch.v) + '">' + esc(ch.label) + "</button>"; }).join("") +
      '<button class="chip ghost" data-htskip>Just show me what sold</button></div>';
    return '<div class="sam" data-stage="answer"><div class="ava">SAM</div><div class="body"><div class="tag">' + lint("Sam’s read", "ht.tag") + "</div>" +
      "<p>" + lint(esc(lead), "ht.intake") + "</p>" + chips + "</div></div>";
  }
  // Scope the receipts by the intake answer (client-side; the engine returned them all).
  function thinScope(receipts, intake, choice) {
    if (!choice || choice === "__skip__") return { scope: receipts, label: null };
    var keep, lbl;
    if (choice.indexOf("no:") === 0) { var key = choice.slice(3); keep = receipts.filter(function (r) { return !htHasMk(r, key); }); lbl = "standard"; }
    else if (choice === "mi:lo") { var thL = intake && intake.threshold; keep = receipts.filter(function (r) { var mi = Number(r.mileage) || 0; return mi > 0 && mi <= thL; }); lbl = "lower-mileage"; }
    else if (choice === "mi:hi") { var thH = intake && intake.threshold; keep = receipts.filter(function (r) { var mi = Number(r.mileage) || 0; return mi > thH; }); lbl = "higher-mileage"; }
    else if (choice === "tx:manual") { keep = receipts.filter(function (r) { return R4C_MANUAL(String(r.transmission || "")); }); lbl = "manual"; }
    else if (choice === "tx:auto") { keep = receipts.filter(function (r) { return R4C_AUTO(String(r.transmission || "")); }); lbl = "automatic"; }
    else { keep = receipts.filter(function (r) { return htHasMk(r, choice); }); lbl = (intake && intake.markerLabel ? intake.markerLabel : "").toLowerCase(); }
    return keep && keep.length ? { scope: keep, label: lbl } : { scope: receipts, label: null };
  }
  function htOnlineCeiling(scope) {
    var onl = scope.filter(function (r) { return !r.isHouse; }).sort(function (x, y) { return y.hammer - x.hammer; });
    return onl.length ? '<p class="lt-span">' + lint("Online, the highest to sell was " + usd(onl[0].hammer) + " on " + esc(onl[0].venue) + ".", "ht.online") + "</p>" : "";
  }
  // Sale-anchored hero: ALWAYS a single named sale, never a band. The median of the scoped set
  // (nearest to the placed config) when the user answered intake; the median of all when skipped.
  function thinHeroHtml(name, scope, scopedLabel, answered) {
    var s = scope.slice().sort(function (a, b) { return a.hammer - b.hammer; });
    var n = s.length, mid = s[Math.floor((n - 1) / 2)];
    var out = '<div class="livetake" data-stage="answer"><div class="lt-kick">' + lint("Sam’s live take", "ht.kick") + "</div>";
    out += '<p class="lt-hero">' + esc(usd(mid.hammer)) + "</p>";
    var line;
    if (n === 1) line = "The one " + name + " to change hands in " + HT_WINDOW_TEXT + ": " + mid.year + " at " + esc(mid.venue) + ", " + monthYear(mid.date) + "." + (mid.isHouse && mid.allIn ? " The buyer paid " + usd(mid.allIn) + " with the premium." : "");
    else if (answered && scopedLabel) line = "The closest recent sale to a " + scopedLabel + " car: " + mid.year + " at " + esc(mid.venue) + ", " + usd(mid.hammer) + " in " + monthYear(mid.date) + ".";
    else line = "The middle of the recent sales: " + mid.year + " at " + esc(mid.venue) + ", " + usd(mid.hammer) + " in " + monthYear(mid.date) + ".";
    out += '<p class="lt-line">' + lint(line, "ht.hero") + "</p>";
    if (n >= 2) {
      var min = s[0].hammer, max = s[n - 1].hammer;
      if (max > min) out += '<p class="lt-span">' + lint("Across the " + n + (scopedLabel ? " " + scopedLabel + " cars" : " recorded sales") + ", the range ran " + usd(min) + " to " + usd(max) + ".", "ht.span") + "</p>";
    }
    out += htOnlineCeiling(scope);
    return out + "</div>";
  }
  // Paired sales: same chassis at a house AND online. Two receipts side by side, NO percentage
  // until a model clears 3 such pairs (design: the % stays dormant below that).
  function htPairsHtml(ht) {
    if (!ht.pairs || !ht.pairs.length) return "";
    var rows = ht.pairs[0].map(function (rc) { return htReceiptRow(rc); }).join("");
    var note = ht.pairPctEligible
      ? "Same car, both venues."
      : "The same chassis, sold at a house and online. Too few matched pairs yet to read a house-versus-online pattern, so here are both receipts.";
    return '<div class="seclabel">' + lint("The same car, twice", "ht.pairlab") + "</div>" +
      '<div class="htpair">' + rows + "</div>" +
      '<p class="ht-note">' + lint(note, "ht.pairnote") + "</p>";
  }
  function thinHtml(d, m) {
    var ht = d.thin;
    htLastD = d;
    if (!ht || !ht.receipts || !ht.receipts.length) return refusalHtml(d, m); // safety: never dead-end
    var name = bareNameOf(d, m);
    // Intake FIRST, but only when a split forks THIS car's price and the user has not answered.
    if (ht.intake && htChoice === null) { var iv = thinIntakeHtml(d, ht, name); if (iv) return iv; }
    var sc = thinScope(ht.receipts, ht.intake, htChoice);
    var scope = sc.scope, scopedLabel = sc.label, answered = !!(htChoice && htChoice !== "__skip__");
    var body = thinHeroHtml(name, scope, scopedLabel, answered) + freshLine(d);
    // Sam's read: the HOUSE STEER text renders ONLY when house share >= 2/3 (ht.houseSteer).
    // Below that it is venue-neutral. No fee/valuation words, no invented pattern.
    var reads = [];
    if (ht.houseSteer) {
      if (!ht.onlineReceiptsN) reads.push("These trade at the auction houses, not online. Every recorded sale here came through one.");
      else reads.push("These mostly trade at the auction houses; a few sell online. Both are below.");
    } else if (ht.houseN && ht.onlineReceiptsN) {
      reads.push("These sell online and at the auction houses. The recorded sales are below.");
    }
    reads.push("Too few sold recently to mark a typical band, so these are the sales themselves, not a guess.");
    body += '<div class="samread" data-stage="answer"><div class="ava">SAM</div><div><div class="tag">' + lint("Sam’s read", "ht.readtag") + "</div>" +
      reads.map(function (p) { return "<p>" + lint(esc(p), "ht.read") + "</p>"; }).join("") + "</div></div>";
    body += '<div class="seclabel" data-stage="cards">' + lint("What has sold, " + esc(name) + ", " + spanRange(scope), "ht.reclab") + "</div>";
    body += '<div class="htreceipts" data-stage="cards">' + scope.slice(0, 8).map(function (rc) { return htReceiptRow(rc); }).join("") + "</div>";
    // Paired chassis are a whole-model signal; show them only in the unscoped view.
    if (scope === ht.receipts) body += htPairsHtml(ht);
    // CONSIGNMENT DOOR (Sep 2026): the houses are routable. On a house-forward car, name the house
    // with the strongest recent results for this model and open its consignment page. Evidence-
    // ordered, never a house preference. Consignment is an enquiry + agreement, not a listing.
    var hpick = htHousePick(scope);
    if (hpick && ht.houseSteer) {
      var hn = hpick.pick.venue;
      var hurl = HT_CONSIGN[hpick.pick.slug];
      var hrange = hpick.pick.count === 1 ? "at " + usd(hpick.pick.lo) : "from " + usd(hpick.pick.lo) + " to " + usd(hpick.pick.hi);
      body += '<div class="htconsign" data-stage="note"><div class="htc-kick">' + lint("Where I’d take it", "ht.ckick") + "</div>" +
        '<div class="htc-name">' + esc(hn) + "</div>" +
        '<p class="htc-why">' + lint(esc(hn + " has the strongest recent " + name + " results: " + hpick.pick.count + " sold " + hrange + "."), "ht.cwhy") + "</p>" +
        '<a class="htc-cta" href="' + esc(hurl) + '" target="_blank" rel="noopener" data-consign="' + esc(hpick.pick.slug) + '">' + lint("Start a consignment with " + hn, "ht.ccta") + "</a>" +
        '<p class="htc-sub">' + lint("You’ll go to " + hn + " to begin a consignment enquiry. Nothing is committed until you sign a consignment agreement.", "ht.csub") + "</p></div>";
    }
    body += sellHtml() + recentHtml();
    body += '<div class="trust">Real completed sales from GoAskSam’s archive, hammer prices with the buyer premium backed out. No estimates. No valuations.</div>';
    return body;
  }

  // ============ CLASS-ERA render (Part 1, Sep 2026) =====================================
  // The rung beneath thin mode: the exact model has NOT sold in three years, so this widens to the
  // same marque within the car's decade era band. Rendered as a COARSE fallback, labelled plainly
  // as the wider market, never as a price for the exact car (rule 17). Same receipt discipline.
  function classEraHtml(d, m) {
    var ce = d.classEra;
    if (!ce || !ce.receipts || !ce.receipts.length) return refusalHtml(d, m);
    var v = d.resolvedCar || d.vehicle || {};
    var carName = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || bareNameOf(d, m);
    var era = esc(ce.era), make = esc(ce.make);
    var out = '<div class="livetake" data-stage="answer"><div class="lt-kick">' + lint("Sam’s live take", "ce.kick") + "</div>";
    out += '<p class="lt-hero">' + priceRange([ce.lowHammer, ce.highHammer]) + "</p>";
    var line = "No " + esc(carName) + " has sold in " + HT_WINDOW_TEXT + ", so this is the wider " + era + " " + make + " market, not your exact car. " + ce.totalN + " " + (ce.totalN === 1 ? "has" : "have") + " sold " + spanSince(ce.receipts) + "; most landed in this range, the middle around " + usd(ce.medianHammer) + ".";
    out += '<p class="lt-line">' + lint(line, "ce.line") + "</p>" + freshLine(d) + "</div>";
    var reads = [
      "Your exact car is rare enough that it has not traded in the three years I track. Treat these as the neighborhood it sits in, not a figure for it.",
      "The moment one like yours sells, I can read it directly."
    ];
    out += '<div class="samread" data-stage="answer"><div class="ava">SAM</div><div><div class="tag">' + lint("Sam’s read", "ce.readtag") + "</div>" +
      reads.map(function (p) { return "<p>" + lint(esc(p), "ce.read") + "</p>"; }).join("") + "</div></div>";
    out += '<div class="seclabel" data-stage="cards">' + lint(era + " " + make + " sales, " + spanRange(ce.receipts), "ce.reclab") + "</div>";
    out += '<div class="htreceipts" data-stage="cards">' + ce.receipts.slice(0, 8).map(function (rc) { return htReceiptRow(rc); }).join("") + "</div>";
    out += sellHtml() + recentHtml();
    out += '<div class="trust">Real completed sales from GoAskSam’s archive, hammer prices with the buyer premium backed out. No estimates. No valuations.</div>';
    return out;
  }

  function renderResults(d) {
    // The exact-car header leads on a VIN match (matched frame); typed queries go straight
    // to the answer block (unmatched frame). Refusal is its own frame. Every branch renders
    // from the engine's structured facts - no fabricated numbers, ever.
    var m = vinAnchor;
    var head = m ? exactCarHtml(m, d.resolvedCar) : "";
    var body;
    if (d.tier === "thin") body = thinHtml(d, m);
    else if (d.tier === "class_era") body = classEraHtml(d, m);
    else if (d.tier === "refusal") body = refusalHtml(d, m);
    else if (d.tier === "result") body = resultHtml(d, m);
    else body = '<div class="sam" data-stage="answer"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s read</div><p>' +
      lint(esc("I don’t have enough real " + carLabel(d.resolvedCar) + " sales to show you an honest read, and I won’t make one up. Try another car and I’ll pull what actually sold."), "zero") + "</p></div></div>" + sellHtml();
    // Result/thin/class bodies already end with their own ".trust" disclaimer; only append the
    // generic footHtml() when the body has none (zero/refusal), so the "No estimates. No
    // valuations." line never renders twice on one page (Sep 2026 fix).
    root.innerHTML = inboxHtml(lastQuery) + head + body + (body.indexOf('class="trust"') < 0 ? footHtml() : "");
    wire();
    streamReveal();
  }
  function renderChoice(d) {
    // Generation choice: chips carry a full year-resolvable query (run directly, not appended).
    if (d.generationOptions && d.generationOptions.length) {
      var gchips = '<div class="chips">' + d.generationOptions.map(function (o) {
        return '<button class="chip" data-genquery="' + esc(o.query) + '">' + esc(o.label) + "</button>";
      }).join("") + "</div>";
      root.innerHTML = inboxHtml(lastQuery) +
        '<div class="sam" style="margin-top:26px"><div class="ava">SAM</div><div class="body"><div class="tag">Sam’s take</div>' +
        '<p style="font-size:22px;line-height:1.4">' + lint(esc(d.prompt || "Which generation is it?"), "genchoice") + "</p>" +
        gchips + "</div></div>" + footHtml();
      wire();
      return;
    }
    var opts = d.modelOptions || d.bodyOptions || [];
    var kind = d.modelOptions ? "model" : "body";
    // Base a chip appends its answer to: a passed baseLabel (year+make on a VIN model ask), else
    // the resolved car (year+make+model on a body ask). A VIN query's raw text is the VIN, so
    // this keeps the chip from appending to the VIN (which re-decodes and loops - fault 1). Null
    // falls back to the raw query, which is correct for a typed query.
    // Include the TRIM: a body-choice answer must re-query the SAME car ("2006 Porsche 997
    // Carrera S" + coupe), not drop to the base model ("2006 Porsche 997" + coupe), which would
    // widen the pool from Carrera S to every 911 Carrera of the generation (Sep 2026 fix).
    choiceCtx = d.baseLabel || (d.resolvedCar ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model, d.resolvedCar.trim].filter(Boolean).join(" ") : null) || null;
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
    var txt = (n != null) ? ("Reading the market · " + n + " " + (n === 1 ? "sale" : "sales") + " across " + m + " " + (m === 1 ? "platform" : "platforms")) : ("Reading the market for " + (/^your car$/i.test(String(car || "")) ? "your car" : "your " + car));
    return '<div class="working"><span class="pulse"></span>' + esc(txt) + "</div>";
  }

  // ---------------------------------------------------------------- VIN anchor (Task 2)
  var vinAnchor = null;   // carried from the confirm step into the result render
  var pendingVin = null;  // resolved vehicle awaiting confirmation
  // Base label a clarification chip appends its answer to (year+make for a model ask, the full
  // car for a body ask). A VIN query's raw text is the VIN, so a chip must NOT append to it (it
  // re-decodes and loops) - the chip builds a clean query from this context instead. Null for a
  // typed query, where appending to the raw text is correct.
  var choiceCtx = null;
  var htChoice = null; // house-tier intake selection: null=not asked, "__skip__", or a marker key
  var htLastD = null;  // last house-tier decision, so an intake chip can re-render in place
  // Same physical identity (one string cleaner/more granular than the other): token subset.
  function obNorm(s){ return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim(); }
  function obSameIdentity(a,b){ a=obNorm(a);b=obNorm(b); if(!a||!b)return false; var ta=a.split(/\s+/),tb=b.split(/\s+/),sa={},sb={}; ta.forEach(function(t){sa[t]=1;}); tb.forEach(function(t){sb[t]=1;}); return ta.every(function(t){return sb[t];})||tb.every(function(t){return sa[t];}); }
  function obRedundantTrim(t,model){ var mm={}; obNorm(model).split(/\s+/).forEach(function(x){mm[x]=1;}); var tt=obNorm(t).split(/\s+/); return tt.length>0&&tt.every(function(x){return mm[x];}); }
  // Build the resolved vehicle for the comp fetch from an exact archive match (mirrors /sell's
  // applyMatchedConfig reconciliation): the RECORD wins for year; make/model keep the decode's
  // clean form when it is the same identity, else the record; the record title-trim is set when
  // it adds to the model. canonicalLabel is the title-derived display name.
  function vehicleFromMatch(match, decoded){
    var v = {}; if (decoded) for (var k in decoded) v[k] = decoded[k];
    if (match.year) v.year = match.year;
    if (match.make && (!v.make || !obSameIdentity(v.make, match.make))) v.make = match.make;
    if (match.model && (!v.model || !obSameIdentity(v.model, match.model))) v.model = match.model;
    // The comp pool + generation lookup use the FAMILY model, not the chassis-prefixed field
    // value ("E30 M3" -> "M3"), so the pool reflects the whole generation and the generation
    // window resolves. The anchor still names the car from displayName. (Real models never match:
    // M3/X5/A6 are 1 digit; 993/997 pure digits.)
    if (v.model) v.model = String(v.model).replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || v.model;
    if (match.trim && !obRedundantTrim(match.trim, v.model)) v.trim = match.trim;
    // On an exact match we know the body from the record: carry it so the comp pool scopes to
    // the right body and never detours through the "coupe or convertible?" ask (the match IS
    // the answer). detectBodyStyle in buildSpec normalizes the raw value ("Coupe" -> coupe).
    if (match.bodyStyle) v.bodyStyle = match.bodyStyle;
    v.canonicalLabel = match.displayName || [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
    return v;
  }
  // Identifier-shaped input that should route through the shared resolver (VIN decode/
  // confirm, the VIN-invalid reword, the chassis-number line + exact match) instead of the
  // pool: a SINGLE token that is either a 17-char VIN attempt (valid OR invalid) or a
  // chassis-shaped token (5-14 chars), in both cases mixing at least one letter and one
  // digit so bare numbers (years, prices, ZIPs) and plain words never route here.
  // Single-token VIN or chassis routes through the shared resolver (decode/confirm/exact-
  // match). MULTI-token chassis ("1E 31588", the way BaT shows it) stays on the normal pool
  // path: sellerDecision flags chassis_hint and attaches the exact archive match, and
  // runPool renders the callout - so normal yearless queries ("Cayman GT4") are never
  // detoured through vehicleIdentity and its /sell-style year clarifications.
  function obIdentifierShaped(text) {
    var t = String(text || "").trim();
    if (!t || /\s/.test(t)) return false;
    var c = t.replace(/[\s.\-/]+/g, "");
    if (!/^[A-Za-z0-9]+$/.test(c) || !/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) return false;
    return c.length === 17 || (c.length >= 5 && c.length <= 14);
  }
  var OB_PLAT = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty", rmsothebys: "RM Sotheby's", gooding: "Gooding & Co", acc: "All Collector Cars", allcollectorcars: "All Collector Cars", collectingcars: "Collecting Cars" };
  function obPlat(s) { var k = String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return OB_PLAT[k] || (s ? String(s) : ""); }
  function monthYear(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return p.length >= 2 ? ((M[Number(p[1])] || "") + " " + p[0]).trim() : ""; }
  // The ANCHOR beat (a + b): "I know this exact car..." + photo + receipt, then a one-line
  // BRIDGE into the pool. NEVER validates or predicts the anchor (no "still looks strong" /
  // "holds its value") - factual sale record + a neutral transition only. Copy-lint enforced.
  function anchorCalloutHtml(match, rc) {
    if (!match || (!match.soldDate && !match.price)) return "";
    var plat = obPlat(match.source), when = monthYear(match.soldDate), price = match.price ? usd(match.price) : null;
    var onP = plat ? " on " + plat : "", whenT = when ? " in " + when : "", forT = price ? " for " + price : "";
    // Name the car from the MATCH's title-derived headline ("1990 BMW M3"), not the record's
    // internal model field ("E30 M3") or the pool's resolvedCar; lead with it (match-first).
    var name = (match && match.displayName) ? match.displayName : ([rc && rc.year, rc && rc.make, rc && rc.model].filter(Boolean).join(" ") || "this car");
    var named = (name && name !== "this car") ? (", a " + name) : "";
    var line = (Number(match.count) > 1)
      ? ("I know this exact car" + named + ". It’s traded " + (match.count === 2 ? "twice" : match.count + " times") + " in our records, most recently" + onP + whenT + forT + ".")
      : ("I know this exact car" + named + ". It sold" + onP + whenT + forT + ".");
    var photo;
    if (match.photoUrl) photo = '<div class="vin-photo"><img src="' + esc(match.photoUrl) + '" alt="' + esc(name) + '" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.vin-plate\');if(p)p.style.display=\'flex\'"><div class="vin-plate"><div class="m">' + esc(plat) + '</div><div class="n">' + esc(name) + '</div><div class="s">Photo unavailable</div></div></div>';
    else photo = '<div class="vin-photo"><div class="vin-plate" style="display:flex"><div class="m">' + esc(plat) + '</div><div class="n">' + esc(name) + '</div><div class="s">Photo unavailable</div></div></div>';
    var receipt = match.url ? '<a class="anchor-receipt" href="' + esc(match.url) + '" target="_blank" rel="noopener">View that sale</a>' : "";
    return '<div class="sam"><div class="ava">SAM</div><div class="body"><div class="tag">The exact car</div>' +
      "<p>" + lint(esc(line), "anchor") + "</p>" + photo + receipt + "</div></div>";
  }
  function anchorHtml(match, rc) {
    var callout = anchorCalloutHtml(match, rc);
    if (!callout) return "";
    // Bridge line removed pending the results-screen redesign (no replacement copy yet). The
    // exact-car block stands on its own above the comps.
    return '<div class="anchor" data-stage="anchor">' + callout + "</div>";
  }
  // Chassis exact match (Task 3): the anchor callout + an honest ask for the car (the match
  // is EVIDENCE only; the user still gives year/make/model). No decoding, no marque guess.
  function renderChassisMatch(match) {
    var ask = "Tell me the year, make and model and I’ll pull what similar ones have done.";
    root.innerHTML = inboxHtml(lastQuery) + '<div class="anchor">' + anchorCalloutHtml(match, null) + "</div>" +
      '<div class="sam" style="margin-top:16px"><div class="ava">SAM</div><div class="body"><p>' + lint(esc(ask), "chassisMatchAsk") + "</p></div></div>" + footHtml();
    wire();
  }

  // ---------------------------------------------------------------- run (dispatcher)
  function run(text) {
    text = String(text || "").trim();
    if (!text) return;
    lastQuery = text; vinAnchor = null; pendingVin = null; obSourceVin = null; choiceCtx = null; obRefinePhrase = null; obLastVehicle = null; htChoice = null;
    // Identifier-shaped input (VIN or chassis) routes through the shared resolver (decode +
    // confirm + exact-match + the honest VIN-invalid / chassis lines); everything else goes
    // straight to the archive pool.
    if (obIdentifierShaped(text)) { vinResolve(text); return; }
    runPool(text, null);
  }
  function runPool(text, vehicle, refine) {
    obLastVehicle = vehicle || obLastVehicle;
    root.innerHTML = inboxHtml(text) + workingLine(esc(carLabel(vehicle) || text), null) + footHtml();
    wire();
    var car = { raw: text };
    if (vehicle) car.vehicle = vehicle;
    // #1 divergence rule: pass the exact car's own sale (from the VIN/chassis match) so the engine
    // can compare it to the cluster. Only present on a matched car; harmless when absent.
    if (vinAnchor && Number(vinAnchor.price) > 0) car.exactSale = { price: vinAnchor.price, mileage: vinAnchor.mileage, soldDate: vinAnchor.soldDate };
    var payload = { oneBox: true, anonId: obAnonId(), car: car };
    if (refine) payload.refine = refine;   // inline earned-question refinement (mileage / transmission)
    fetch(API_ORIGIN + "/api/sellerDecision", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (d) {
      pushRecent(text, d);
      if (d && d.status === "needs_clarification") {
        // Multi-token chassis ("1E 31588"): an exact archive match came back -> lead with the
        // "I know this exact car" callout, then the ask (same as the single-token path).
        if (d.vinArchiveMatch) { obEvent("onebox_vin_anchor_shown"); renderChassisMatch(d.vinArchiveMatch); return; }
        // Otherwise surface the resolver's OWN honest question (the VIN-invalid reword, the
        // chassis-number line, or a specific clarification) rather than a generic fallback.
        renderError((d.clarification && d.clarification.question) || "I couldn’t pin that exact car down. Try the year, make and model together, like 1972 Porsche 911 or 1969 Ford Mustang.");
        return;
      }
      if (!d || d.status !== "one_box") { renderError("I’m having trouble reading the market right now. Give it another try in a moment."); return; }
      if (d.tier === "rate_limited") { renderError(d.samLine || "That’s a lot of lookups for one day. Come back tomorrow and I’ll keep pulling real sales."); return; }
      if (d.tier === "model_choice" || d.tier === "body_choice" || d.tier === "generation_choice") { renderChoice(d); return; }
      if (vinAnchor) obEvent("onebox_vin_anchor_shown");
      obSnapshotId = d.snapshotId || null; obAsOf = null; // live result: shareable, no as-of line
      obResolvedCar = d.resolvedCar || null;              // carried into the /sell handoff
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
          obSourceVin = (d.vehicle && d.vehicle.vin) || null; // travels to /sell for lead enrichment
          // MATCH-FIRST (fault 2): an EXACT archive match is stronger evidence than a decode, so
          // it IS the confirmation. Skip the confirm AND any model ask: lead with the matched car
          // (named from its record) and go straight to comps for that car. Mirrors /sell Option B.
          if (d.vinArchiveMatch && d.vinArchiveMatch.make) {
            vinAnchor = d.vinArchiveMatch; pendingVin = null;
            obEvent("onebox_vin_anchor_shown");
            var mv = vehicleFromMatch(d.vinArchiveMatch, d.vehicle);
            runPool(d.vinArchiveMatch.displayName || carLabel(mv) || text, mv);
            return;
          }
          // COLLAPSE (no match): the VIN decoded make+year but no model, so the clarification
          // carries the year-scoped model chips - render ONE model ask ("...a 1990 BMW. Which
          // model?"), not a confirm followed by a model screen. The chip builds "year make model".
          if (cl.modelOptions && cl.modelOptions.length) {
            renderChoice({ prompt: cl.question, modelOptions: cl.modelOptions, baseLabel: [d.vehicle && d.vehicle.year, d.vehicle && d.vehicle.make].filter(Boolean).join(" ") || null });
            return;
          }
          pendingVin = d.vehicle || null; vinAnchor = null;
          renderVinConfirm(cl.question, d.vehicle);
          return;
        }
        if (cl && cl.kind === "chassis_hint") {
          // Chassis-shaped input: on an exact archive hit, show the anchor + ask for the
          // car; otherwise just the honest chassis line. Match is evidence, never ranking.
          if (d.vinArchiveMatch) { obEvent("onebox_vin_anchor_shown"); renderChassisMatch(d.vinArchiveMatch); }
          else { renderError(cl.question); }
          return;
        }
        if (cl && (cl.kind === "vin_decode_failed" || cl.kind === "vin_invalid_shape")) { renderError(cl.question); return; }
        if (d && d.status === "valid" && d.vehicle) {
          pendingVin = null;
          // MATCH-FIRST on ANY exact archive match (chassis OR VIN), not just when a
          // chassis_match correction is present: the record IS the answer, so lead with the
          // exact car and take its model/trim/body from the record - never re-ask the model on
          // a matched car (the MGA filed under model "A" was asking "Which model?" because the
          // match wasn't forced through here). Reconcile the vehicle THROUGH the match so the
          // record's body scopes the pool. No match -> plain resolution, no anchor.
          if (d.vinArchiveMatch && d.vinArchiveMatch.make && d.vinArchiveMatch.model) {
            vinAnchor = d.vinArchiveMatch;
            runPool(d.vinArchiveMatch.displayName || carLabel(vehicleFromMatch(d.vinArchiveMatch, d.vehicle)) || text, vehicleFromMatch(d.vinArchiveMatch, d.vehicle));
          } else { vinAnchor = null; runPool(text, d.vehicle); }
          return;
        }
        if (d && d.status === "needs_clarification" && cl && (cl.chips || (d.vehicle && d.vehicle.make))) {
          // MATCH-FIRST (fault 2, defensive): if a partial decode ALSO carries an exact match,
          // the match names the model - skip the model ask, lead with the matched car, go to comps.
          if (d.vinArchiveMatch && d.vinArchiveMatch.make && d.vinArchiveMatch.model) {
            vinAnchor = d.vinArchiveMatch; pendingVin = null;
            obEvent("onebox_vin_anchor_shown");
            var mvc = vehicleFromMatch(d.vinArchiveMatch, d.vehicle);
            runPool(d.vinArchiveMatch.displayName || carLabel(mvc) || text, mvc);
            return;
          }
          // Partial decode (make+year, no model): ask the model with chips, same as /sell. The
          // chips are year-scoped by the backend (modelSuggestionChips production filter).
          renderChoice({ prompt: cl.question || "Which model is it?", modelOptions: (cl.chips || []).filter(function (c) { return !/^not sure$/i.test(c); }), baseLabel: [d.vehicle && d.vehicle.year, d.vehicle && d.vehicle.make].filter(Boolean).join(" ") || null });
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
      if (d.tier === "refusal") obEvent("onebox_refusal_shown");
      else if (d.tier === "result") obEvent("onebox_answer_shown");
      else if (d.tier === "thin") obEvent("onebox_thin_shown");
      else if (d.tier === "class_era") obEvent("onebox_classera_shown");
    } catch (e) {}
  }

  // ---------------------------------------------------------------- JUST SOLD proof (real recent sale)
  function fetchProof() {
    fetch(API_ORIGIN + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oneBoxProof: true }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && d.proof && d.proof.length) { proofPool = d.proof; var el = document.getElementById("ob-justsold-wrap"); if (el) el.innerHTML = justSoldHtml(); } }).catch(function () {});
  }
  // Two-beat placeholder rotation: slow and subtle, only while the input is empty. Not a
  // ticker on the page - it lives inside the input's own placeholder.
  function startPlaceholderRotation() {
    if (phTimer) clearInterval(phTimer);
    phIdx = 0;
    phTimer = setInterval(function () {
      var el = document.getElementById("ob-input");
      if (!el) { clearInterval(phTimer); phTimer = null; return; }
      if (el.value) return;                 // never fight real typing
      phIdx = (phIdx + 1) % PLACEHOLDER_BEATS.length;
      el.setAttribute("placeholder", PLACEHOLDER_BEATS[phIdx]);
    }, 4200);
  }

  // ---------------------------------------------------------------- recent searches (localStorage)
  function recentSearches() { try { return JSON.parse(localStorage.getItem("gas_ob_recent") || "[]"); } catch (e) { return []; } }
  function pushRecent(q, d) {
    try {
      // Name each entry the SAME way as the results headline: for a matched car the record's
      // title-derived displayName ("1990 BMW M3"), and carry its hero image. Dedupe by the CAR
      // (normalized label), not the raw query, so one car never lingers as "1990 BMW M3",
      // "1990 BMW E30 M3" and "1990 BMW" from different flow states.
      var label = (vinAnchor && vinAnchor.displayName) ? vinAnchor.displayName
        : ((d && d.resolvedCar) ? carLabel(d.resolvedCar) : q);
      // Dedup on the CAR, body-INDEPENDENT: "1994 Porsche 911 Coupe" and "1994 Porsche 911" are the
      // same car at different flow states and must collapse to one entry. carLabel appends the body
      // word, so the key is rebuilt WITHOUT it (year/make/model/trim only).
      var rc = d && d.resolvedCar;
      var keyBase = (vinAnchor && vinAnchor.displayName) ? vinAnchor.displayName
        : (rc ? [rc.year, rc.make, rc.model, rc.trim].filter(Boolean).join(" ") : (label || q));
      // Thumbnail: exact-car photo when VIN-anchored, else the closest comp's photo so a text search
      // gets a real thumbnail instead of a blank grey plate.
      var img = (vinAnchor && vinAnchor.photoUrl) ? vinAnchor.photoUrl
        : (d && d.representative && d.representative.closest && d.representative.closest.image) ? d.representative.closest.image
        : null;
      var key = String(keyBase || q).toLowerCase().replace(/\s+/g, " ").trim();
      var list = recentSearches().filter(function (it) { return (it.key || String(it.label || it.q || "").toLowerCase().replace(/\s+/g, " ").trim()) !== key; });
      list.unshift({ q: q, label: label || q, img: img, key: key, when: "Just now" });
      localStorage.setItem("gas_ob_recent", JSON.stringify(list.slice(0, 8)));
    } catch (e) {}
    syncRailResults();
  }
  // Rail "Your results": surfaces past searches inline in the rail (same pattern as /sell's
  // expandable Your results). Hidden when there are none. Re-running a search from here
  // reuses run() - no new behavior, just a rail entry point for the existing recent list.
  function syncRailResults() {
    var nav = document.getElementById("ob-nav-results"), menu = document.getElementById("ob-results-menu");
    if (!nav || !menu) return;
    var items = recentSearches();
    if (!items.length) { nav.style.display = "none"; menu.innerHTML = ""; return; }
    nav.style.display = "";
    menu.innerHTML = items.slice(0, 8).map(function (it) { return '<a data-recent="' + esc(it.q) + '">' + esc(it.label) + "</a>"; }).join("");
    Array.prototype.forEach.call(menu.querySelectorAll("[data-recent]"), function (a) {
      a.addEventListener("click", function () { if (typeof obToggleRail === "function") obToggleRail(false); run(a.getAttribute("data-recent")); });
    });
  }

  // ---------------------------------------------------------------- handoff + share
  // Sell handoff (Task 5): carry the resolved car into /sell so the seller never retypes it.
  // VIN-sourced result -> hand the VIN itself, so /sell runs its full VIN flow (decode +
  // confirm + exact archive match) and the lead enrichment (VIN row + prior-sale link)
  // fires. Otherwise hand the resolved car label (falls back to the raw query).
  function toSell() {
    var prefill = obSourceVin || (obResolvedCar ? carLabel(obResolvedCar) : "") || lastQuery || "";
    try { if (prefill) localStorage.setItem("gas_onebox_prefill", prefill); } catch (e) {}
    obEvent("onebox_sell_handoff_clicked");
    location.href = "/sell";
  }
  function shareResult() {
    obEvent("onebox_share_clicked");
    // Prefer the stable snapshot URL (/o/<id>): it re-opens the EXACT same answer cold and
    // carries the OG answer line. Falls back to a re-run URL only if the snapshot didn't
    // persist (e.g. a transient store error), so Share is never dead.
    var url = obSnapshotId
      ? location.origin + "/o/" + encodeURIComponent(obSnapshotId)
      : location.origin + "/onebox?q=" + encodeURIComponent(lastQuery);
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
    // A clarification chip RESOLVES the answer and advances: it builds a clean "year make model"
    // (or "...body") query from the choice context, never appending to the raw query - which for
    // a VIN would re-decode the VIN and loop forever (fault 1).
    function chipAnswer(value) { var base = choiceCtx || lastQuery || ""; run((base + " " + value).replace(/\s+/g, " ").trim()); }
    Array.prototype.forEach.call(root.querySelectorAll("[data-model]"), function (b) { b.addEventListener("click", function () { chipAnswer(b.getAttribute("data-model")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-body]"), function (b) { b.addEventListener("click", function () { chipAnswer(b.getAttribute("data-body")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-change]"), function (b) { b.addEventListener("click", function () { renderEmpty(); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-recent]"), function (b) { b.addEventListener("click", function () { run(b.getAttribute("data-recent")); }); });
    // Generation chips carry a full year-resolvable query - run it directly (never appended).
    Array.prototype.forEach.call(root.querySelectorAll("[data-genquery]"), function (b) { b.addEventListener("click", function () { run(b.getAttribute("data-genquery")); }); });
    // House-tier intake: place the car by its price-forking config, then re-render the same
    // decision scoped to the answer (no re-fetch; the engine returned every receipt).
    Array.prototype.forEach.call(root.querySelectorAll("[data-thinsplit]"), function (b) { b.addEventListener("click", function () { htChoice = b.getAttribute("data-thinsplit"); obEvent("onebox_ht_intake", lastQuery + ":" + htChoice); if (htLastD) { renderResults(htLastD); } }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-htskip]"), function (b) { b.addEventListener("click", function () { htChoice = "__skip__"; obEvent("onebox_ht_skip", lastQuery); if (htLastD) { renderResults(htLastD); } }); });
    // Consignment-door click tracking (same idea as an online comp click): log which house.
    Array.prototype.forEach.call(root.querySelectorAll("a[data-consign]"), function (a) { a.addEventListener("click", function () { try { obEvent("onebox_consign_click", a.getAttribute("data-consign") + ":" + lastQuery); } catch (e) {} }); });
    // The earned question: a mileage band or transmission chip narrows the SAME pool inline
    // (re-request with a refine), and Sam's take + the sales re-render to match.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-milemin]"), function (b) {
      b.addEventListener("click", function () {
        var lo = b.getAttribute("data-milemin"), hi = b.getAttribute("data-milemax"), label = b.getAttribute("data-mlabel");
        obRefinePhrase = "In the " + label + " miles band";
        runPool(lastQuery, obLastVehicle, { miMin: Number(lo), miMax: hi ? Number(hi) : null, label: label });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-tx]"), function (b) {
      b.addEventListener("click", function () {
        var tx = b.getAttribute("data-tx"), label = b.getAttribute("data-mlabel");
        obRefinePhrase = tx === "manual" ? "As a manual" : "As " + (/^[aeiou]/i.test(label) ? "an " : "a ") + label;
        runPool(lastQuery, obLastVehicle, { tx: tx, label: label });
      });
    });
    // "type it": reveal a small inline mileage input; Enter narrows to a band around that number.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-typemiles]"), function (b) {
      b.addEventListener("click", function () {
        var wrap = b.parentNode;
        b.outerHTML = '<span class="typemiles"><input id="ob-miles" type="number" inputmode="numeric" placeholder="miles" /><button class="qchip" id="ob-miles-go">Go</button></span>';
        var inp = document.getElementById("ob-miles"); if (inp) inp.focus();
        function submit() { var v = Number((document.getElementById("ob-miles") || {}).value); if (!(v > 0)) return; var band = v >= 60000 ? 25000 : 15000; obRefinePhrase = "Around " + v.toLocaleString() + " miles"; runPool(lastQuery, obLastVehicle, { miMin: Math.max(0, v - band), miMax: v + band, label: "around " + Math.round(v / 1000) + "k" }); }
        var go = document.getElementById("ob-miles-go"); if (go) go.addEventListener("click", submit);
        if (inp) inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      });
    });
    // Outbound comp-card click: log the referral per platform (the card link already carries the
    // UTM for the destination). Best-effort beacon, never blocks the navigation.
    Array.prototype.forEach.call(root.querySelectorAll("a.rcard[data-cardclick]"), function (a) {
      a.addEventListener("click", function () { try { obEvent("onebox_comp_click", a.getAttribute("data-cardclick") + ":" + lastQuery); } catch (e) {} });
    });
  }

  // ---------------------------------------------------------------- boot
  // Cold-open a shared snapshot (Task 4): the /o/<id> route injects window.__OB_SNAPSHOT__
  // (the exact stored result) + __OB_ASOF__. Render it straight to the result view with an
  // as-of line, no fetch. The share URL therefore opens the same answer cold.
  function renderSnapshot() {
    var snap = (typeof window !== "undefined") && window.__OB_SNAPSHOT__;
    if (!snap || !snap.tier) return false;
    lastQuery = (window.__OB_QUERY__ || carLabel(snap.resolvedCar) || "").toString();
    obAsOf = (typeof window !== "undefined" && window.__OB_ASOF__) || null;
    obSnapshotId = (typeof window !== "undefined" && window.__OB_SNAPID__) || null;
    obResolvedCar = snap.resolvedCar || null; // a cold-opened shared result still hands off its car
    obSourceVin = null;                       // the VIN is never stored in a shared snapshot
    vinAnchor = null; pendingVin = null;
    renderResults(snap);
    return true;
  }
  function boot() {
    if (renderSnapshot()) { fetchProof(); syncRailResults(); return; }
    renderEmpty();
    fetchProof();
    syncRailResults();
    var q = /[?&]q=([^&]*)/.exec(location.search || "");
    if (q) { try { run(decodeURIComponent(q[1])); } catch (e) {} }
  }
  boot();
})();
