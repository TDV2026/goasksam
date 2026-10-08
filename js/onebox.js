// One Box frontend (wiring phase). One input, one honest result state, at most three
// cards, rendered into the approved /onebox-preview design. Talks only to the archive-only
// oneBox branch of /api/sellerDecision. Never exposes the dataset. All render, zero LLM:
// the answer line, cards, labels and Sam's take are composed deterministically from the
// engine's structured facts. Engine truth wins over any sample data in the preview.
(function () {
  "use strict";
  var API_ORIGIN = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  var root = document.getElementById("ob");
  // SELL MODE (Lane C, Oct 2026): the one-direction Sell runs on THIS page and THIS question flow, so
  // its questions, cards and type are Market Check's own. api/sellNext.js sets window.GAS_SELL; when it
  // is absent (Market Check itself) every hook below is inert. GAS_SELL.homeHtml: the front page words;
  // .onCar(d, query): One Box has named one car, Sell continues; .onSubmit(text): Sell's own answers.
  var SELL = window.GAS_SELL || null;
  var lastQuery = "";
  var proofPool = [];
  var obSnapshotId = null; // stable id of the last result, for the shareable /o/<id> URL
  var obAsOf = null;       // when THIS analysis ran (product rule 4: run date, not freshness)
  var obResolvedCar = null; // the resolved vehicle of the current result, for the /sell handoff
  var obSourceVin = null;   // the 17-char VIN when this result was VIN-sourced (travels to /sell)
  var obLastVehicle = null;  // the resolved vehicle of the current pool, reused for an inline refine
  var obAsked = 0;
  var obLastD = null;        // the decision currently rendered (for the /sell handoff parameters)
  // The answered refinement(s) behind the current view. ACCUMULATES (Oct 2026, phone review bug):
  // each earned-question chip used to REPLACE this whole object, so answering a second question
  // (e.g. gearbox, after mileage) silently dropped the first answer and the engine, seeing no
  // miMin anymore, offered the mileage question again - a loop. The engine's own refine filter
  // already stacks every key it is given in one pass (lib/onebox.js, the refined block); mergeRefine
  // below is the client-side fix: every chip merges INTO the existing answers instead of replacing
  // them. Per-dimension label keys (miLabel/txLabel/variantLabel/driverLabel) so the eyebrow can
  // name every answered question, not just the newest one.
  var obLastRefine = null;
  // Rotating placeholder (Screen 1): real, concrete examples, one at a time - a typed car, a
  // trim, and a VIN - so the input teaches what it accepts. Rotation in startPlaceholderRotation().
  var PLACEHOLDER_BEATS = ["1994 Porsche 911", "2019 BMW M4 Competition", "WBS4Y9C55KAG67564"];
  var phTimer = null, phIdx = 0;
  // Time promise (item 2): gated on the real end-to-end latency measurement. Measured Sep 20 2026
  // over live searches (N=10 answer renders): p50 3.9s but p95 16.3s (VIN two-hop and muscle-car
  // description second-fetch are genuine >10s tails). p95 over 10s, so NO time claim renders; the
  // narrated loading state (item 3) carries the wait instead. Flip to true only if p95 drops under 10s.
  var OB_FAST = false;
  function cueText() { return "Any car, a VIN, or whatever you know." + (OB_FAST ? " Takes a few seconds." : ""); }

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function usd(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function sym(cur) { return ({ USD: "$", GBP: "£", EUR: "€" })[cur] || ""; }
  function carLabel(rc) {
    if (!rc) return "this car";
    // Prefer the clean canonical/display label (the title-derived "1990 BMW M3") over rebuilding
    // from the raw model field ("E30 M3") when it's present.
    if (rc.canonicalLabel) return rc.canonicalLabel;
    // Drop the body word when the trim already carries it (a "Roadster" trim + "roadster" body
    // would print "300SL Roadster Roadster"); trim stays to protect real model names.
    var body = rc.bodyStyle && !(rc.trim && String(rc.trim).toLowerCase().indexOf(String(rc.bodyStyle).toLowerCase()) >= 0) ? cap(rc.bodyStyle) : "";
    return [rc.year, rc.make, rc.model, rc.trim, body].filter(Boolean).join(" ") || "this car";
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

  // As-of line (Task 4): shown ONLY on a re-opened shared snapshot, so a reader who lands on
  // an old /o/<id> link knows when the read was taken. Product rule 4: this is when the
  // analysis RAN, never a claim about data freshness.
  function monthDayYear(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return M[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
  }
  // ---------------------------------------------------------------- shared chrome
  function inboxHtml(value, placeholder) {
    // Single control: text input + green submit arrow. The square photo affordance is
    // removed (photo input is not a built capability).
    return '<div class="inbox" role="search"><label class="sr" for="ob-input">Search a car</label><input id="ob-input" autocomplete="off" ' + (value ? 'value="' + esc(value) + '"' : 'placeholder="' + esc(placeholder || PLACEHOLDER_BEATS[0]) + '"') + '>' +
      '<button type="button" class="go" id="ob-go" aria-label="Search">&#8594;</button></div>';
  }
  // Layout fix (item 3): the empty state centres the input in the viewport; the loading/result
  // render re-anchors it to the top of the page. Swapping innerHTML would SNAP it up. This does a
  // FLIP: render the new DOM (input at its final top position), then translate the whole #ob back
  // down to where the input just was and transition to zero, so the input glides up instead of
  // jumping. dy ~ 0 on renders that were already at the top (chip taps, refines), so it no-ops
  // there. Honors prefers-reduced-motion.
  function setRootHtmlLifted(html) {
    var prev = document.getElementById("ob-input");
    var prevTop = prev ? prev.getBoundingClientRect().top : null;
    root.innerHTML = html;
    if (prevTop == null) return;
    var now = document.getElementById("ob-input"); if (!now) return;
    var dy = prevTop - now.getBoundingClientRect().top;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (dy <= 6 || reduce) return;
    root.style.transform = "translateY(" + dy + "px)";
    root.style.willChange = "transform";
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      root.style.transition = "transform .34s cubic-bezier(.4,0,.2,1)";
      root.style.transform = "translateY(0)";
    }); });
    setTimeout(function () { root.style.transition = ""; root.style.transform = ""; root.style.willChange = ""; }, 440);
  }
  function footHtml() {
    return '<div class="trustline foot"><span class="dot" aria-hidden="true"></span><span>Real sales only. Nothing estimated.</span></div>';
  }
  // samTakeHtml removed: the "Got it, I'm looking at comparable sales for your ..." interstitial is
  // gone (replaced by the narrated loader, item 3) and carried ownership language (item 6).
  // WHY IT LOOKS LIKE THIS: the method, in plain words, under "Ready to sell?". Thin and single-sale
  // reads (no range: the thin tier, or a result with too few sales for a band) get WHY SO LITTLE.
  function whyNoteHtml(d) {
    var thin = d.tier === "thin" || (d.tier === "result" && !d.cluster && Number(d.poolN) > 0 && Number(d.poolN) < 8);
    var label = thin ? "Why so little" : "Why it looks like this";
    var text = thin
      ? "Because that’s all that sold. We’d rather show you every real sale than a number we made up from them."
      : "No chart, no estimate, no score. Every figure on this page is a hammer price from a real auction, matched to the car’s trim, body and gearbox, converted at the rate on the day it sold, with the replicas, projects and odd sales set aside. The range is where most of those sales landed. Where there aren’t enough sales to say something, we say that instead.";
    return '<section class="whynote" data-stage="note"><span class="eyebrow">' + esc(label) + '</span><p>' + esc(text) + '</p><a href="/how-sam-decides">How Sam decides &#8594;</a></section>';
  }
  // LIVE PANEL: when live_listings holds cars of this family, "{N} like this are live right now" with
  // up to 3 compact rows and a link to /buy. Nothing renders when there are none (or on any error).
  function livePanelSlot() { return '<div id="ob-live" hidden></div>'; }
  function endsShort(iso) {
    var d = new Date(iso); if (!iso || isNaN(d)) return "";
    var tz = "America/Los_Angeles", diff = d.getTime() - Date.now();
    if (diff < 0) return "Ending now";
    var time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(" AM", "am").replace(" PM", "pm");
    if (d.toLocaleDateString("en-US", { timeZone: tz }) === new Date().toLocaleDateString("en-US", { timeZone: tz })) return "Ends today " + time + " PT";
    if (diff < 6.5 * 864e5) return "Ends " + d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }) + " " + time + " PT";
    return "Ends " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  }
  function loadLivePanel(d, m) {
    var slot = document.getElementById("ob-live"); var rc = d && d.resolvedCar;
    if (!slot || !rc || !rc.make || !rc.model) return;
    var qs = "panel=1&make=" + encodeURIComponent(rc.make) + "&model=" + encodeURIComponent(rc.model) +
      (rc.trim ? "&trim=" + encodeURIComponent(rc.trim) : "") + (rc.year ? "&year=" + encodeURIComponent(rc.year) : "") + (rc.bodyStyle ? "&body=" + encodeURIComponent(rc.bodyStyle) : "");
    fetch(API_ORIGIN + "/api/buySearch?" + qs).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !(j.count > 0) || !j.rows || !j.rows.length || !document.body.contains(slot)) return;
      var rows = j.rows.map(function (l) {
        var bid = l.current_bid_usd ? usd(l.current_bid_usd) : (l.current_bid ? Math.round(l.current_bid).toLocaleString("en-US") + " " + l.currency : "No bids");
        return '<a class="lp-row" href="' + esc(utmUrl(l.url)) + '" target="_blank" rel="noopener"><span class="lp-house">' + esc(l.source) + '</span><span class="lp-t">' + esc(cleanReceiptTitle(l.title)) + '</span><span class="lp-r"><b>' + esc(bid) + '</b>' + esc(endsShort(l.end_time)) + '</span></a>';
      }).join("");
      var q = (m && m.displayName) || carLabel(rc);
      slot.className = "livepanel";
      slot.innerHTML = '<div class="lp-h"><h2><span class="dot" aria-hidden="true"></span>' + esc(j.count + (j.count === 1 ? " like this is" : " like this are") + " live right now") + '</h2><a class="linkbtn" href="/buy?q=' + encodeURIComponent(q) + '">See all on Buy &#8594;</a></div>' + rows;
      slot.hidden = false;
    }).catch(function () {});
  }
  // READY TO SELL: a real link into /sell carrying the resolved car + every answered question as URL
  // parameters (sellHref). Ownership-neutral (rule 20): an offer, not an assertion.
  function sellHtml() {
    return '<section class="sellbox" data-stage="note"><div class="st"><h3>Ready to sell?</h3><p>I can tell you the best place to sell this car right now, and why.</p></div>' +
      '<a id="ob-sell" href="' + esc(sellHref()) + '">See where I’d sell it &#8594;</a></section>';
  }
  // ---------------------------------------------------------------- state renderers
  function chipsHtml(options, kind) {
    return '<div class="chips">' + (options || []).map(function (o) { return '<button class="chip" data-' + kind + '="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div>";
  }
  function renderEmpty() {
    if (SELL && SELL.homeHtml) { root.innerHTML = SELL.homeHtml(inboxHtml); wire(); syncRailResults(); return; }
    // Screen 1 (empty state): reached on boot only when the server did NOT already render the rich
    // landing (lib/live/marketCheckLanding.js - see boot()'s early exit below), and on "Change" from
    // an active result. Fixed copy (Oct 2026 landing redesign, Sam): the same headline/sub/placeholder
    // as the landing's hero, literal and exact - no rotation, no added words. The landing's proof row,
    // "What you get" and example band are landing-only (server-rendered, removed once a search runs,
    // same as /buy's #lead); this simple fallback never tries to reproduce them.
    root.innerHTML =
      '<div class="ob-home">' +
        '<h1 class="ob-head">What’s your car going for?</h1>' +
        '<p class="ob-sub">Not what it should sell for. What cars like yours actually did, with the receipts.</p>' +
        inboxHtml("", "Your car, for example 2008 Porsche 997 Carrera S") +
      "</div>";
    wire();
    syncRailResults();
  }
  // ---------------------------------------------------------------- round-3 result render
  // The locked /onebox-preview (Screen 2) design, driven ENTIRELY by the engine's structured
  // facts (span/cluster/recency/basis/platforms/cards/refusal). Prose is composed here with
  // styled number spans; the engine never sends prose numbers. Matches the design of record.
  function r3money(n) { return '<span class="num">' + usd(n) + "</span>"; }
  function spellK(n) { return ({ 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" })[n] || String(n); }
  // A chassis-style generation code ("E30", "964", "991.2") to prefix the model name so the cluster
  // reads "Most E30 M3s", not "Most M3s". Word codes ("first"/"second") and family codes are skipped.
  function genCodeLabel(rc) {
    var g = rc && rc.genCode ? String(rc.genCode) : "";
    return /^[a-z]?\d{2,3}(\.\d)?$/i.test(g) ? g.toUpperCase() : "";
  }
  function withGen(name, rc) {
    // A Mercedes AMG badge ("S65") is already specific and the W-code is not how buyers say it, so
    // no prefix there ("Most S65s"). BMW/Porsche etc. get the chassis code ("Most E30 M3s").
    if (rc && /mercedes|benz/i.test(rc.make || "")) return name;
    var g = genCodeLabel(rc);
    if (g && name && obNorm(name).indexOf(obNorm(g)) < 0) return g + " " + name;
    return name;
  }
  // The answer block: headline span, gated cluster, gated recency, mono meta line, placement.
  // ---- Round-4 render: Sam's take folded block, earned question, clickable cards, no counts ----
  var OB_UTM = "utm_source=goasksam&utm_medium=onebox&utm_campaign=comp_card";
  function utmUrl(url) { return url ? url + (url.indexOf("?") >= 0 ? "&" : "?") + OB_UTM : null; }
  function windowText(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "the last twelve months" : "the past two years"; }
  function windowMeta(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "Past twelve months" : "Past two years"; }
  function priceRange(a) { return r3money(a[0]) + " to " + r3money(a[1]); }
  function monthOnly(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return p.length >= 2 ? (M[+p[1]] || "") : ""; }
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
      q = "How many miles on it?";
      chips = (e.buckets || []).map(function (bk) { return '<button type="button" class="qchip" data-milemin="' + bk.min + '" data-milemax="' + (bk.max == null ? "" : bk.max) + '" data-mlabel="' + esc(bk.label) + '">' + esc(bk.label) + "</button>"; }).join("") + '<button type="button" class="qchip typeit" data-typemiles>type it</button>';
    } else if (e.kind === "transmission") {
      q = cap(e.labels.manual) + " or " + e.labels.auto + "?";
      chips = '<button type="button" class="qchip" data-tx="manual" data-mlabel="' + esc(e.labels.manual) + '">' + esc(cap(e.labels.manual)) + '</button><button type="button" class="qchip" data-tx="auto" data-mlabel="' + esc(e.labels.auto) + '">' + esc(e.labels.auto) + "</button>";
    } else if (e.kind === "driver") {
      // Item 7/8: a dictionary-driven second question (mined from titles, so the pool splits on it).
      q = e.q;
      chips = '<button type="button" class="qchip" data-driver="' + esc(e.driverKey) + '" data-drvval="yes" data-mlabel="' + esc(e.yes) + '">' + esc(e.yes) + '</button>'
            + '<button type="button" class="qchip" data-driver="' + esc(e.driverKey) + '" data-drvval="no" data-mlabel="' + esc(e.no) + '">' + esc(e.no) + "</button>";
    } else return "";
    return '<div class="qcard earned" data-stage="answer"><p class="q">' + esc(q) + '</p><div class="qchips">' + chips + "</div></div>";
  }
  // Item 9: the observable-fact refinement. Offers only the flags the pool actually contains; a tap
  // re-scopes the evidence set and adds a sentence, never adjusts a price. "Nothing major" dismisses.
  var OBS_CHIP = { needs_work: "Needs work", modified: "Modified", salvage: "Salvage or rebuilt title" };
  function observeHtml(d) {
    var offer = (d && d.observeOffer) || []; if (!offer.length) return "";
    var chips = offer.map(function (o) { return '<button type="button" class="qchip" data-observe="' + esc(o.key) + '" data-olabel="' + esc(o.label) + '">' + esc(OBS_CHIP[o.key] || o.key) + "</button>"; }).join("");
    chips += '<button type="button" class="qchip" data-observe="none">Nothing major</button>';
    return '<div class="qcard earned observe" data-stage="answer"><p class="q">' + lint("Anything I should know about it?", "obs.q") + '</p><div class="qchips">' + chips + "</div></div>";
  }
  function observeAsideHtml(d) {
    var a = d && d.observeAside; if (!a || !(a.lo > 0)) return "";
    var bare = bareNameOf(d, null);
    return '<p class="varynote">' + lint(esc(bare) + "s listed as " + esc(a.label) + " brought " + priceRange([a.lo, a.hi]) + "; the band above is for cars that didn’t.", "obs.aside") + "</p>";
  }
  function receiptCardHtml(c, tagAside) {
    var img = c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.rplate\');if(p)p.style.display=\'flex\'">' : "";
    var aside = (tagAside && c.hollow) ? '<span class="aside">set aside</span>' : "";
    var ext = '<span class="ext"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>';
    var inner = '<div class="rph">' + img + ext + aside + '<div class="rplate"><div class="n">' + esc(titleCaseSaleTitle(c.title)) + '</div><div class="s">photo unavailable</div></div></div>' +
      '<div class="rb"><div class="rprice num">' + esc(usd(c.price)) + "</div>" +
      '<div class="rmeta"><span class="num">' + esc(c.mileageText) + '</span><span class="dot">&middot;</span>' + esc(c.platform) + "</div>" +
      '<div class="rdate">' + esc(c.month) + "</div><div class=\"rtitle\">" + esc(titleCaseSaleTitle(c.title)) + "</div></div>";
    var href = utmUrl(c.url);
    return href ? '<a class="rcard" href="' + esc(href) + '" target="_blank" rel="noopener" data-cardclick="' + esc(c.platformSlug || "") + '">' + inner + "</a>" : '<div class="rcard">' + inner + "</div>";
  }
  // ============ RENDER PORT (round 7): cluster hero, quiet span, freshness slot, Sam's Read
  // (driver + divergence), three representative cards, See-all -> platforms. Replaces the
  // round-4 samTakeBlock/receipts grid. Engine facts only; copy is composed here (rule 3). ====
  function bareNameOf(d, m) {
    return (m && m.displayName) ? m.displayName.replace(/^\d{4}\s+/, "") : (carLabel(d.resolvedCar) || "car");
  }
  // HERO: the cluster is the unconditional headline; a pool under the cluster gate falls back to
  // the full span. The quiet span line is ALWAYS present so the ceiling is never hidden.
  // The subject's mileage, from the exact sale (VIN) / divergence / typed input, whichever we have.
  function subjMileageOf(d, m) {
    var mi = m && Number(String(m.mileage == null ? "" : m.mileage).replace(/[^\d]/g, ""));
    if (mi > 0) return mi;
    if (d.divergence && d.divergence.mileage > 0) return d.divergence.mileage;
    if (Number(d.subjectMileage) > 0) return Number(d.subjectMileage);
    return null;
  }
  // Shared plural helper (Oct 2026, phone review): a bare "s" on a name ending in S, a digit, or
  // any other capital letter reads as a typo, not a plural - "997 Carrera S" -> "997 Carrera Ss",
  // "911 GT3" -> "911 GT3s", "Boss 429" -> "Boss 429s". Those get " models" instead; a name that
  // ends lowercase just takes "s" as normal ("Mustang" -> "Mustangs").
  function carNamePlural(name) {
    var n = String(name == null ? "" : name).trim();
    if (!n) return "";
    // Also guards a name already ending in a (lowercase) "s" ("Lotus" -> "Lotuss" is the same typo.
    return (/[A-Z0-9]$/.test(n) || /s$/i.test(n)) ? n + " models" : n + "s";
  }
  // The engine's own prose (d.widening / d.resolvedSpec) can carry the exact same artifact from its
  // own template (a bare "s" appended to a name that already ends in S/digit/capital - flagged to
  // Lane B for a source-side fix in lib/onebox.js). Narrow, text-level correction of that one known
  // pattern only - never touches any other word - so engine copy reads right until that lands.
  function fixPluralArtifact(text) {
    return String(text == null ? "" : text).replace(/\b(\S*[A-Z0-9])s\b/g, "$1");
  }
  var BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", saloon: "saloons", wagon: "wagons", spider: "Spiders", spyder: "Spyders", hardtop: "hardtops" };
  // The noun for the lead: trim (or generation code, or model) + pluralized body. "Competition
  // Package coupes", "964 Cabriolets", "M4s". Empty -> the lead falls back to "Cars like it".
  // The car's name, singular ("997 Carrera S", "E30 M3"): the head carNoun pluralizes. Also used by the
  // new Sell's headline ("I'd sell your 997 Carrera S on ...") through window.OBX.
  function carHead(d) {
    var v = d.resolvedCar || d.vehicle || {};
    var model = (v.model && String(v.model).trim()) || "";
    var trim = (v.trim && String(v.trim).trim()) || "";
    var poolTrim = (d.poolTrim && String(d.poolTrim).trim()) || "";
    var head;
    if (model && trim && !obSameIdentity(model, trim) && obNorm(model).indexOf(obNorm(trim)) < 0 && obNorm(trim).indexOf(obNorm(model)) < 0)
      head = model + " " + trim;
    else head = trim || poolTrim || model || "";
    return withGen(head, v);   // "Most E30 M3s" - name the generation, not just the model
  }
  function carNoun(d) {
    var v = d.resolvedCar || d.vehicle || {};
    var bw = v.bodyStyle ? BODY_PLURAL[String(v.bodyStyle).toLowerCase()] : "";
    // Item 5a: name the MODEL in the lead. With a real trim distinct from the model, lead with
    // "model trim" ("M4 Competition"); otherwise the trim / generation code / model alone ("964",
    // "M4"), so a generation code is never doubled with the model ("911 964").
    var head = carHead(d);
    // A performance badge (S65, M4) already names the car; appending the body reads loose
    // ("S65 sedans"), so a badge head pluralizes alone ("Most S65s").
    var isBadge = v.badge && obNorm(head) === obNorm(v.badge);
    if (head && bw && !isBadge) return esc(head) + " " + bw;
    if (head) return esc(carNamePlural(head));
    return "";
  }
  // Item 5b: the band is mileage-scoped only when a real mileage refine narrowed the pool (the
  // engine flag, or the refine phrase names miles). Otherwise the band is the whole market.
  function bandMileageScoped(d) { return !!(d && (d.mileageScoped || (obLastRefine && obLastRefine.miMin != null))); }
  // Resolved car line: the car Sam is reading, plus a real "Change" button. On an exact VIN/chassis
  // match a pill leads it and the car is named from its own record.
  function carLineHtml(d, m) {
    var pill = m ? '<span class="vinpill">' + (obSourceVin ? "VIN match" : "Exact match") + "</span>" : "";
    var name = m ? (m.displayName || carLabel(d.resolvedCar)) : carLabel(d.resolvedCar);
    return '<div class="carline" data-stage="resolved">' + pill + "<span>" + esc(name) + '</span><button type="button" class="linkbtn ch" data-change>Change</button></div>';
  }
  // Eyebrow over the range: what the pool is (noun from the resolved car), any answered refinement,
  // and the window. Text stays mixed-case; CSS sets the caps.
  // When the engine names the trims a pool covers (resolvedCar.trimsCovered, e.g. ["Carrera S",
  // "Carrera T"]) the eyebrow says so: "992 Carrera S and T Coupes". Shared leading words fold.
  function trimsCoveredNoun(d) {
    var rc = d.resolvedCar || {}, list = Array.isArray(rc.trimsCovered) ? rc.trimsCovered.filter(Boolean).map(String) : [];
    if (list.length < 2) return "";
    var first = list[0].split(/\s+/), shared = 0;
    while (shared < first.length - 1 && list.every(function (t) { return t.split(/\s+/)[shared] === first[shared]; })) shared++;
    var lead = first.slice(0, shared).join(" "), tails = list.map(function (t) { return t.split(/\s+/).slice(shared).join(" "); });
    var joined = (lead ? lead + " " : "") + (tails.length > 1 ? tails.slice(0, -1).join(", ") + " and " + tails[tails.length - 1] : tails[0]);
    var g = genCodeLabel(rc), bw = rc.bodyStyle ? (BODY_PLURAL[String(rc.bodyStyle).toLowerCase()] || "") : "";
    return [g, joined, bw ? bw.charAt(0).toUpperCase() + bw.slice(1) : ""].filter(Boolean).join(" ");
  }
  function eyebrowText(d) {
    var noun = trimsCoveredNoun(d) || carNoun(d);
    var tmp = document.createElement("div"); tmp.innerHTML = noun; noun = tmp.textContent || "";
    var parts = [noun || "Cars like it"];
    var rf = obLastRefine;
    // Names EVERY answered question, not just the newest one (observe is deliberately excluded:
    // the main band stays "cars that didn't", the aside sentence carries that context instead).
    if (rf) {
      var bits = [];
      if (rf.miLabel) bits.push(rf.miLabel + " miles");
      if (rf.txLabel) bits.push(rf.txLabel);
      if (rf.variantLabel) bits.push(rf.variantLabel);
      if (rf.driverLabel) bits.push(rf.driverLabel);
      if (bits.length) parts.push(bits.join(", "));
    }
    parts.push("sold in " + windowText(d));
    return parts.join(" · ");
  }
  // Older-sales count (engine d.olderOutside = { n, years, recentN }): "14 more sold in 2023 and 2024."
  // Nothing when the engine returns no count.
  function olderOutsideLine(d) {
    var o = d && d.olderOutside;
    if (!o || !(Number(o.n) > 0)) return "";
    var ys = (o.years || []).filter(Boolean).map(String);
    var yp = ys.length <= 1 ? (ys[0] || "") : ys.slice(0, -1).join(", ") + " and " + ys[ys.length - 1];
    return Number(o.n) + " more sold" + (yp ? " in " + yp : " earlier") + ".";
  }
  // RANGE BAR (Oct 2026, prepared behind ?bar=1 - not shipped until Lane B makes Market Check and
  // Buy agree on the range): the full spread with the typical band highlighted, same shape as the
  // Buy rail (api/buy.js railHtml). Reads ONLY d.span (the full min-to-max) and d.cluster (the
  // SAME typical band the headline figures above it already show) - nothing computed in the page.
  function rangeBarHtml(d) {
    var span = d.span, band = d.cluster;
    if (!Array.isArray(span) || span.length !== 2 || !Array.isArray(band) || band.length !== 2) return "";
    var lo = span[0], hi = span[1];
    if (!(Number(hi) > Number(lo))) return "";
    var pc = function (x) { return Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)); };
    var a = pc(band[0]), b = pc(band[1]);
    // Labelled ends (Oct 2026, phone review): "Lowest sale $X" / "Highest sale $Y" - bare numbers
    // read as a second, contradicting range next to the headline. No caption under the bar: the
    // headline and "Most sales landed here." already say it.
    return '<div class="rangebar" data-stage="answer"><div class="rb-row"><span class="rb-end rb-lo">' + lint(esc("Lowest sale " + usd(lo)), "rb.lo") +
      '</span><span class="rb-track"><i class="rb-band" style="left:' + a.toFixed(1) + "%;width:" + Math.max(1.5, b - a).toFixed(1) + '%"></i></span><span class="rb-end rb-hi">' + lint(esc("Highest sale " + usd(hi)), "rb.hi") + "</span></div></div>";
  }
  // ANSWER CARD: left 7 of 10 columns carry eyebrow, ONE range (the cluster), "Most sales landed
  // here." and the freshness line; the right 3 carry Sam's Take ONLY when the engine returns one
  // (d.samsTake.sentence). No Take: the left spans the card and no panel renders.
  // NO HEADLINE $ WITHOUT A BAND (standing rule 24): with no cluster there is no range of any kind;
  // the card leads with the sales themselves and says why.
  function answerCardHtml(d, m) {
    var take = d.samsTake && d.samsTake.sentence ? String(d.samsTake.sentence) : "";
    var mi = subjMileageOf(d, m);
    var main = '<div class="eyebrow">' + esc(eyebrowText(d)) + "</div>";
    if (d.cluster) {
      var band = d.cluster;
      var miCtx = (mi && bandMileageScoped(d)) ? (m ? " around this mileage" : " around " + mi.toLocaleString("en-US") + " miles") : "";
      main += '<h1 class="range band">' + esc(usd(band[0])) + ' <span class="to">to</span> ' + esc(usd(band[1])) + "</h1>" +
        '<p class="landed lead">' + lint("Most sales" + miCtx + " landed here.", "ans.landed") + "</p>" +
        rangeBarHtml(d);
    } else {
      var noun = carNoun(d), subj = noun || "cars like it";
      var line = (d.poolN && d.poolN < 8)
        ? ("Only " + d.poolN + " " + subj + " ha" + (d.poolN === 1 ? "s" : "ve") + " sold in " + windowText(d) + ", not enough for a range, so here are the sales themselves.")
        : (subj.charAt(0).toUpperCase() + subj.slice(1) + " sold too spread out in " + windowText(d) + " to call a typical price, so here are the sales themselves.");
      main += '<p class="ans-lead lead">' + lint(line, "ans.noband") + "</p>";
      var ol = olderOutsideLine(d); if (ol) main += '<p class="ans-line older">' + lint(esc(ol), "ans.older") + "</p>";
    }
    main += freshLine(d);
    var panel = take
      ? '<aside class="take" aria-label="Sam’s Take"><div class="take-h"><span class="roundel" aria-hidden="true">SAM</span><span class="take-tag">' + lint("Sam’s Take", "take.tag") + "</span></div><p>" + lint(esc(take), "take") + "</p></aside>"
      : "";
    return '<section class="anscard livetake blk' + (take ? "" : " solo") + '" data-stage="answer"><div class="ans-main">' + main + "</div>" + panel + "</section>";
  }
  // Item 2: the divergence contradiction as ONE plain serif line (no box, no kicker), assembled from
  // the real numbers - same delta logic, rendered as a sentence.
  function contradictionLine(d) {
    var dv = d.divergence; if (!dv) return "";
    // The price/mileage fact is already in the exact-car hero ("Last sold $X ... N mi"), so it is
    // NOT restated here. Render ONLY the new information (where the recent market sits relative to
    // this car) and omit the line entirely when there is no such insight to add.
    var trim = (d.resolvedCar && d.resolvedCar.trim) || "";
    var tw = trim ? (String(trim).split(/\s+/)[0] + " ") : "";
    var dir = dv.direction === "below" ? ("Recent lower-mileage " + esc(tw) + "cars have sold higher.")
            : dv.direction === "above" ? ("Recent higher-mileage " + esc(tw) + "cars have sold lower.")
            : "";
    if (!dir) return "";
    return '<p class="contradiction">' + lint(dir, "contra") + "</p>";
  }
  // Pool-aware freshness line (S2-2). NOT passed through lint(): "estimated" is a deliberate
  // negation here (as in the trust line), not a valuation claim. No dashes.
  function freshLine(d) {
    var f = d && d.freshness; if (!f) return "";
    // Item 7c: when the newest IN-SCOPE sale is older than the archive's newest sale, state TWO facts
    // so a stale-looking in-scope date never reads as "our data stops here": the archive currency, then
    // the latest sale of THIS car. Applies on every surface (house + online).
    var through = f.through, arch = f.archiveThrough;
    if (through && arch && through < arch) {
      var now = Date.now();
      var archRecent = (now - Date.parse(arch + "T00:00:00Z")) <= 2 * 864e5;
      var fact1 = archRecent ? "Sales through last night." : ("Sales through " + monthDayYear(arch) + ".");
      var modelW = (d.resolvedCar && (d.resolvedCar.familyLabel || d.resolvedCar.model)) ? titleCaseSaleTitle(d.resolvedCar.familyLabel || d.resolvedCar.model) : "this car";
      var fact2 = "Latest " + modelW + " sale: " + monthYear(through) + ".";
      return '<div class="fresh"><span class="dot"></span>' + esc(fact1 + " " + fact2) + "</div>";
    }
    var txt = "";
    if (f.mode === "house") { if (f.through) txt = "Auction results through " + monthOnly(f.through) + "."; }
    else if (f.lastNight) txt = "Real sales through last night. Nothing estimated.";
    else if (f.through) txt = "Real sales through " + monthDayYear(f.through) + ". Nothing estimated.";
    if (!txt) return "";
    return '<div class="fresh"><span class="dot"></span>' + esc(txt) + "</div>";
  }
  // ---- Sale cards (Oct 2026 design). One renderer for every card size: photo slot (real photo, or
  // a clearly marked "No photo" slot), pill, price, venue + month, the record's OWN title (rule 25),
  // a meta line, and an optional italic why-line. Whole card is the listing link when there is one.
  var DELTA_LABEL = { fewer_miles: "Fewer miles", more_miles: "More miles", manual: "Manual", automatic: "Automatic", earlier: "Earlier", more_recent: "More recent", recent: "More recent", higher: "Higher sale", lower: "Lower sale" };
  function photoHtml(image, alt, pill) {
    var img = image ? '<img src="' + esc(image) + '" alt="' + esc(alt || "") + '" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">' : "";
    return '<div class="ph' + (image ? "" : " noimg") + '">' + img + '<span class="none">No photo</span>' + (pill ? '<span class="pill">' + esc(pill) + "</span>" : "") + "</div>";
  }
  function saleCardHtml(o) {
    var head = o.venueLine ? '<div class="price-row"><span class="cprice num">' + o.priceHtml + '</span><span class="cvenue">' + esc(o.venueLine) + "</span></div>"
      : '<span class="cprice num">' + o.priceHtml + "</span>";
    var body = '<div class="cbody">' + head +
      (o.allIn ? '<div class="callin">Buyer paid ' + esc(o.allIn) + " with premium</div>" : "") +
      (o.title ? '<div class="ctitle">' + esc(o.title) + "</div>" : "") +
      (o.meta ? '<div class="cmeta">' + esc(o.meta) + "</div>" : "") +
      (o.extra || "") +
      (o.why ? '<p class="cwhy">' + lint(esc(o.why), "card.why") + "</p>" : "") +
      (o.after || "") + "</div>";
    var cls = "card " + (o.cls || "");
    var photo = photoHtml(o.image, o.title, o.pill);
    if (o.article) {
      // A card that carries its own inner link (the VIN history link) cannot itself be a link;
      // the photo opens the listing instead.
      var ph = o.href ? '<a href="' + esc(o.href) + '" target="_blank" rel="noopener" aria-label="Open the listing" data-cardclick="' + esc(o.slug || "") + '">' + photo + "</a>" : photo;
      return '<article class="' + cls + '">' + ph + body + "</article>";
    }
    return o.href
      ? '<a class="' + cls + '" href="' + esc(o.href) + '" target="_blank" rel="noopener" data-cardclick="' + esc(o.slug || "") + '">' + photo + body + "</a>"
      : '<div class="' + cls + '">' + photo + body + "</div>";
  }
  // "Automatic (7-speed)" -> "Automatic, 7-speed".
  function gearboxText(t) { return cap(String(t || "").replace(/\s*\((\d+)[- ]?speed\)/i, ", $1-speed").trim()); }
  function longMiles(c) { return Number(c.mi) > 0 ? Number(c.mi).toLocaleString("en-US") + " miles" : (c.mileageText && c.mileageText !== "TMU" ? c.mileageText : ""); }
  // The hero (CLOSEST SALE) for a typed query. The gearbox renders only when a gearbox question
  // applies to this pool (obGbApplies) and the record carries one.
  function heroCardHtml(c) {
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    var gb = (c.transmission && obGbApplies) ? gearboxText(c.transmission) : "";
    var mi = longMiles(c);
    var meta = [mi, gb].filter(Boolean).join(" · ");
    if (meta) meta += " · as listed at the time of sale";
    return saleCardHtml({
      cls: "hero", pill: "Closest sale", href: utmUrl(c.url), slug: c.platformSlug, image: c.image,
      priceHtml: esc(usd(c.price)), venueLine: [venue, monthYear(c.date)].filter(Boolean).join(" · "),
      allIn: (c.isHouse && c.allIn) ? usd(c.allIn) : "", title: cleanReceiptTitle(c.title), meta: meta,
      why: c.basis === "subject" ? "The nearest recent sale on mileage and spec." : "The sale nearest the middle of the range."
    });
  }
  function smallCardHtml(c) {
    if (!c) return "";
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    var meta = [c.mileageText && c.mileageText !== "TMU" ? c.mileageText : "", venue, c.month || monShort(c.date)].filter(Boolean).join(" · ");
    return saleCardHtml({
      cls: "sm", pill: DELTA_LABEL[c.delta] || (c.role === "closest" ? "Closest sale" : "Recent sale"), href: utmUrl(c.url), slug: c.platformSlug, image: c.image,
      priceHtml: esc(usd(c.price)), allIn: (c.isHouse && c.allIn) ? usd(c.allIn) : "", title: cleanReceiptTitle(c.title), meta: meta
    });
  }
  // The exact car (VIN or chassis match) as the hero: "THIS CAR", 1.5px green border, its last sale.
  // Snapshot attributes are dated and past tense (rule 26). The history link renders only when the
  // engine returns how many times it sold before the shown sale (m.soldBeforeCount >= 1) and the
  // query was a VIN (the /vin/{vin} page is keyed on it).
  function vinHeroCardHtml(m, rc) {
    var name = m.displayName || carLabel(rc);
    var priceHtml, venueLine;
    var lastAttempt = (m.history || []).filter(function (h) { return h.kind === "attempt" || h.notSold; })[0];
    if (m.price) priceHtml = esc(usd(m.price));
    else if (lastAttempt && lastAttempt.highBid) priceHtml = esc(usd(lastAttempt.highBid)) + ' <span class="cvenue">high bid, not sold</span>';
    else priceHtml = "";
    venueLine = [obPlat(m.source || (lastAttempt && lastAttempt.platform)), monthYear(m.soldDate || (lastAttempt && lastAttempt.date))].filter(Boolean).join(" · ");
    var mi = Number(String(m.mileage == null ? "" : m.mileage).replace(/[^\d]/g, ""));
    var bits = [];
    if (mi > 0) bits.push(mi.toLocaleString("en-US") + " miles");
    if (m.materialMods && m.materialMods.length) bits.push("modified");
    var when = monthYear(m.soldDate);
    var meta = bits.length ? bits.join(" · ") + (when ? ", as reported " + when : ", as listed at the time of sale") : "";
    var n = Number(m.soldBeforeCount);
    var hist = (n >= 1 && obSourceVin)
      ? '<a class="histlink" href="' + esc(historyHref(rc, obSourceVin)) + '">' + esc("Sold " + (n === 1 ? "once" : n === 2 ? "twice" : n + " times") + " before. See its history") + " &#8594;</a>"
      : "";
    return saleCardHtml({ cls: "hero this exact", article: true, pill: "This car", href: utmUrl(m.url), slug: m.source, image: m.photoUrl,
      priceHtml: priceHtml, venueLine: venueLine, title: name, meta: meta, after: hist });
  }
  // Canonical VIN history URL (/history/{year}-{make}-{model-slug}/{VIN}), built the same way as
  // api/_historyData.js carSlug; the server 301s any slug that does not match its own identity.
  function historyHref(rc, vin) {
    var sl = function (x) { return String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); };
    var sq = function (x) { return sl(x).replace(/-/g, ""); };
    var v = rc || {}, model = String(v.model || ""), trim = String(v.trim || "");
    var fam = !trim || sq(model).indexOf(sq(trim)) >= 0 ? model : (sq(trim).indexOf(sq(model)) >= 0 ? trim : model + " " + trim);
    var slug = [v.year, sl(v.make), sl(fam)].filter(Boolean).join("-");
    return (v.year && v.make && model) ? "/history/" + slug + "/" + encodeURIComponent(vin) : "/vin/" + encodeURIComponent(vin);
  }
  // Thin / class-era / pair receipts (engine thin.receipts shape: hammer, venue, isHouse, allIn...).
  function receiptCardHtml(rc) {
    var natH = rc.nativeCur && rc.nativeHammer;
    var priceHtml = natH ? esc(natMoney(rc.nativeCur, rc.nativeHammer)) + ' <span class="cvenue">(' + esc(usd(rc.hammer)) + ")</span>" : esc(usd(rc.hammer));
    var allIn = "";
    if (rc.isHouse && rc.allIn) allIn = (natH && rc.nativeAllIn) ? natMoney(rc.nativeCur, rc.nativeAllIn) + " (" + usd(rc.allIn) + ")" : usd(rc.allIn);
    var segs = [];
    if (Number(rc.mileage) > 0) segs.push(Number(rc.mileage).toLocaleString("en-US") + " mi");
    segs.push(rc.venue); segs.push(monthYear(rc.date));
    if (rc.isHouse) { var ch = houseChassisMeta(rc); if (ch) segs.push(ch); }
    else if (htGearboxSplit) { var gl = gearboxLabel(rc); if (gl) segs.push(gl); }
    var marks = (rc.markers && rc.markers.length) ? "<div>" + rc.markers.map(function (mk) { return '<span class="mk">' + esc(mk.label) + "</span>"; }).join("") + "</div>" : "";
    return saleCardHtml({ cls: "t", href: utmUrl(rc.url), slug: rc.slug, image: rc.image, priceHtml: priceHtml, allIn: allIn,
      title: cleanReceiptTitle(shortCarName(rc.title)), meta: segs.filter(Boolean).join(" · "), extra: marks });
  }
  // Engine d.cards shape (refusal / shown-separately): price, mileageText, platform, month, title.
  // tagLabel is an optional small pill ("Above range") - never invented, only ever a label the
  // caller derived from data the engine already returned (see shownSeparatelyHtml).
  function poolCardHtml(c, tagLabel) {
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    return saleCardHtml({ cls: "t", pill: tagLabel || "", href: utmUrl(c.url), slug: c.platformSlug, image: c.image,
      priceHtml: esc(usd(c.price)), title: cleanReceiptTitle(c.title),
      meta: [c.mileageText && c.mileageText !== "TMU" ? c.mileageText : "", venue, c.month || monShort(c.date)].filter(Boolean).join(" · ") });
  }
  // Shared "cap at N, reveal 10 more per click" list pattern (Oct 2026): every long card list (thin
  // receipts, comparable sales, shown-separately) server-renders EVERY card so search engines see
  // them all; past the cap the extras just sit hidden until revealed a batch at a time.
  var obCapSeq = 0;
  var OB_CAP_BATCH = 10;
  function capCardsHtml(gridClass, cardsHtml, cap) {
    cardsHtml = cardsHtml.filter(Boolean);
    if (!cardsHtml.length) return "";
    if (cardsHtml.length <= cap) return '<div class="' + gridClass + '" data-stage="cards">' + cardsHtml.join("") + "</div>";
    var id = "ob-cap" + (++obCapSeq);
    var shown = cardsHtml.slice(0, cap).join("");
    // Every extra card still server-renders here (hidden, not omitted); the button reveals them
    // OB_CAP_BATCH at a time rather than all at once (Oct 2026, phone review).
    var extra = cardsHtml.slice(cap).map(function (h) { return '<div class="cap-extra" hidden>' + h + "</div>"; }).join("");
    var firstBatch = Math.min(OB_CAP_BATCH, cardsHtml.length - cap);
    return '<div class="' + gridClass + '" data-stage="cards" id="' + id + '">' + shown + extra + "</div>" +
      '<button type="button" class="linkbtn capshow" data-capshow="' + id + '" aria-expanded="false">Show ' + firstBatch + " more &#8594;</button>";
  }
  // Receipt-row title cleanup (Sep 2026): the raw OCD title leads with the listing's mileage hook
  // ("21k-Mile ...", "4,800-Mile ...") and trails a gearbox tag ("... 6-Speed") - both redundant on
  // a receipt row where the mileage + gearbox already sit in the meta line. Strip them to the clean
  // nameplate ("2018 BMW M4 Coupe Competition Package"). Never returns empty (falls back to the raw).
  // Title-case a shouting sale title (item 6): "1973 FORD PINTO HATCHBACK" -> "1973 Ford Pinto
  // Hatchback", keeping alphanumeric badges/codes (E63, 911R, GT3, 300SL, 550) and short all-caps
  // badges (RS, SS, GT, GTO, GTS, AMG) as-is, and leaving already-mixed-case titles untouched.
  function titleCaseSaleTitle(t) {
    return String(t == null ? "" : t).split(/(\s+)/).map(function (w) {
      if (!/[A-Za-z]/.test(w)) return w;
      if (/\d/.test(w)) return w;
      if (w.length <= 3 && w === w.toUpperCase()) return w;
      if (w === w.toUpperCase()) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w;
    }).join("");
  }
  // Strip VIN / chassis / engine designations and auction lot codes from a displayed title (item 2):
  // "... VIN. ZFFZR49B...", "... Chassis no. *...*", "... (FL26)". The chassis renders on its own line.
  function stripIdsFromTitle(t) {
    t = String(t == null ? "" : t);
    // Item 5: strip VIN/chassis/engine AND transmission/gearbox/body designation numbers a house adds.
    t = t.replace(/\s*\b(?:vin|chassis|engine|transmission|gearbox|body)\b\.?\s*(?:no\.?|number|#)?\s*:?\s*\*?[A-Za-z0-9][A-Za-z0-9*\/\-]{4,}\*?/ig, "");
    t = t.replace(/\s*["‘’“”']\s*type\s+[A-Za-z0-9.\/-]+\s*["‘’“”']/ig, "");   // quoted 'Type 993' fragments
    t = t.replace(/\s*\((?:[A-Za-z]{1,3}\d{1,3}|lot\s*\d+)\)/ig, "");
    t = t.replace(/\b([A-Za-z])([A-Za-z]*\d[A-Za-z0-9]*)\s+\1\b/g, "$2 $1");   // de-glue "RGT2 R" -> "GT2 R"
    t = t.replace(/\b((?:[A-Za-z0-9][A-Za-z0-9\/.\-]*\s+){0,2}[A-Za-z0-9][A-Za-z0-9\/.\-]*)(?:\s+\1\b)+/ig, "$1");   // collapse doubled token/phrase
    return t.replace(/\s{2,}/g, " ").replace(/\s+[,-]\s*$/, "").trim();
  }
  function cleanReceiptTitle(title) {
    var t = String(title == null ? "" : title);
    t = t.replace(/^\s*[\d][\d,.]*\s*k?\s*[-\s]\s*(mile|kilometer|km)s?\b'?s?\s*/i, ""); // "21k-Mile " / "4,800-Mile " / "26k-Kilometer "
    t = t.replace(/\s+\d+[-\s]speed\b/ig, "");   // " 6-Speed"
    t = stripIdsFromTitle(t);                    // item 2: no VIN/chassis/lot codes in the title
    t = t.replace(/\s{2,}/g, " ").trim();
    t = titleCaseSaleTitle(t);                   // item 6: never shout a sale title
    return t || String(title == null ? "" : title);
  }
  // RECENT COMPARABLE SALES: divider head (title, scope line), the 5-column card row (hero spans 3 -
  // CLOSEST SALE, or THIS CAR on an exact match - two stacked cards span 2), then the rest of the
  // engine's qualifying pool (d.cards), capped at 4 with "See all N" (Oct 2026, Sam's live review).
  function salesSectionHtml(d, m) {
    var rep = d.representative;
    var hero = "", sides = [];
    if (m) {
      hero = vinHeroCardHtml(m, d.resolvedCar);
      if (rep) sides = [rep.high, rep.low].filter(Boolean);
      if (rep && sides.length < 2 && rep.closest) sides.push(rep.closest);
    } else {
      if (!rep || !rep.closest) return "";
      hero = heroCardHtml(rep.closest);
      sides = [rep.high, rep.low].filter(Boolean);
    }
    sides = sides.slice(0, 2);
    var scope;
    if (m) scope = sides.length ? "This car, plus " + (sides.length === 2 ? "two" : "one") + " recent comparable sale" + (sides.length === 2 ? "s" : "") + ". Tap any to open the listing." : "This car’s last recorded sale.";
    else scope = fixPluralArtifact(d.widening || d.resolvedSpec || "") + (d.widening || d.resolvedSpec ? " " : "") + "Tap any to open the listing.";
    var headHtml = '<div class="sec-head" data-stage="cards"><div><h2>Recent comparable sales</h2><span class="scope">' + lint(esc(scope), "sec.scope") + "</span></div></div>";
    var row = '<div class="cards5' + (sides.length ? "" : " single") + '" data-stage="cards">' + hero +
      (sides.length ? '<div class="stack">' + sides.map(smallCardHtml).join("") + "</div>" : "") + "</div>";
    // Everything else the engine already qualified into this pool, minus whatever the row above
    // already shows (matched by listing URL), so the same sale never appears twice.
    var shownUrls = {};
    if (m && m.url) shownUrls[m.url] = true;
    [rep && rep.closest, rep && rep.high, rep && rep.low].forEach(function (c) { if (c && c.url) shownUrls[c.url] = true; });
    var more = (d.cards || []).filter(function (c) { return !(c.url && shownUrls[c.url]); });
    var moreHtml = capCardsHtml("grid3", more.map(function (c) { return poolCardHtml(c, false); }), 4);
    return headHtml + row + moreHtml;
  }
  // "Shown separately" (Part 1 Rule 7): tagged variants and aside cars stay visible, out of the range.
  // The subject's OWN sale (the "This car" hero, on a VIN match) is a genuine price outlier against
  // its typical-range pool for the SAME reason any outlier gets set aside - that part is correct.
  // But nothing should list it a SECOND time down here as if it were a third-party "kept out" comp,
  // right under its own hero card. Matched by URL, same dedup pattern the comparable-sales section
  // already uses against the hero (line ~601 above).
  // Per-card tag (Oct 2026, phone review): "Above/Below the range" is derived from data already on
  // the page (the card's own price vs. the displayed band) - never a reason the engine does not
  // supply. The engine does not yet expose a per-card reason for non-price exclusions (replica,
  // project, provenance...); those cards render with no tag rather than a guessed one.
  function shownSeparatelyHtml(d, m) {
    var list = (d.asideCards || []).filter(function (c) { return !(m && m.url && c.url === m.url); });
    if (!list.length) return "";
    var band = Array.isArray(d.cluster) ? d.cluster : (Array.isArray(d.span) ? d.span : null);
    var dirN = 0;
    var dirs = list.map(function (c) {
      if (!band || !(Number(c.price) > 0)) return "";
      if (c.price > band[1]) { dirN++; return "Above range"; }
      if (c.price < band[0]) { dirN++; return "Below range"; }
      return "";
    });
    var sentence = (dirN === list.length)
      ? "Real sales of the same car that sat well above or below the range, so they are not used to set it. Still useful to know about."
      : "Real sales of the same car, kept out of the range above. Still useful to know about.";
    var cardsHtml = list.map(function (c, i) { return poolCardHtml(c, dirs[i]); });
    return '<div class="sec-head" data-stage="cards"><div><h2>' + lint("Shown separately", "sep.lab") + "</h2></div></div>" +
      '<p class="sep-note" data-stage="cards">' + lint(sentence, "sep.note") + "</p>" +
      capCardsHtml("grid3", cardsHtml, 4);
  }
  // Item 4: the mileage reconfirm / earned question renders AFTER the evidence (answer, proof, then
  // the refinement). On a divergent car it is the "still around X miles?" reconfirm; otherwise the
  // normal earned question. One ask, never two.
  function reconfirmHtml(d, m) {
    var dv = d.divergence;
    if (dv && dv.kase === "a" && dv.mileage > 0) {
      // Refinement copy pattern (locked, CLAUDE.md): reruns the EVIDENCE around the current
      // mileage, never promises a different number/range. "which real sales are used", not a result.
      return '<div class="qcard earned reconfirm" data-stage="answer"><p class="q">' + lint("Still around " + Number(dv.mileage).toLocaleString("en-US") + " miles?", "rc.q") +
        '</p><p class="rc-sub">' + lint("If not, update it and I’ll rerun the market around the current mileage.", "rc.sub") +
        '</p><div class="qchips"><button type="button" class="qchip g" data-refyes>Yes</button><button type="button" class="qchip typeit" data-typemiles>Update mileage</button></div></div>';
    }
    return earnedHtml(d, m);
  }
  // Capped third split (Part 3 question cap): the would-be third question rendered as short lines.
  // "Manuals sold between X and Y. F1s between X and Y." - real ranges, $500-rounded, never a question.
  function inlineSplitsHtml(d) {
    if (!d.inlineSplits || !d.inlineSplits.length) return "";
    var lines = d.inlineSplits.map(function (sp) {
      var a = sp.sides[0], b = sp.sides[1];
      return '<p class="splitline">' + lint(esc(a.label) + " sold between " + r3money(a.lo) + " and " + r3money(a.hi) + ". " + esc(b.label) + " between " + r3money(b.lo) + " and " + r3money(b.hi) + ".", "split." + sp.key) + "</p>";
    }).join("");
    return '<div class="inlinesplits" data-stage="answer">' + lines + "</div>";
  }
  // Mileage nearest-sales fallback (Part 3): the band was too thin, so the sales shown are the closest
  // by mileage. Said plainly so the read never looks like an exact-band match it isn't.
  function mileageFallbackHtml(d) {
    if (!d.mileageFallback) return "";
    return '<p class="mifallback" data-stage="answer">' + lint(esc("Too few sold right at that mileage, so these are the " + d.mileageFallback.n + " closest sales by mileage."), "mifb") + "</p>";
  }
  function resultHtml(d, m) {
    // Order (Oct 2026, Sam's live review): range -> the earned question(s) directly under it ->
    // Recent comparable sales -> live listings -> Shown separately -> Ready to sell -> Why it looks
    // like this. ONE range only (the cluster in the answer card); no second "everything from" span.
    var notes = mileageFallbackHtml(d) + contradictionLine(d) + observeAsideHtml(d) + inlineSplitsHtml(d);
    if (d.driverSentence && !(d.earned) && !(d.divergence && d.divergence.kase === "a")) notes += '<p class="varynote">' + lint(esc(d.driverSentence), "varynote") + "</p>";
    var body = answerCardHtml(d, m);
    if (notes) body += '<div class="notes" data-stage="answer">' + notes + "</div>";
    body += reconfirmHtml(d, m);
    body += observeHtml(d);
    body += salesSectionHtml(d, m);
    body += livePanelSlot();
    body += shownSeparatelyHtml(d, m);
    body += sellHtml();
    body += whyNoteHtml(d);
    return body;
  }
  function samMsgHtml(paras, tag, cls) {
    return '<div class="sam' + (cls ? " " + cls : "") + '" data-stage="answer"><span class="roundel lg" aria-hidden="true">SAM</span><div class="body">' +
      (tag ? '<div class="tag">' + esc(tag) + "</div>" : "") + paras.map(function (p) { return "<p>" + p + "</p>"; }).join("") + "</div></div>";
  }
  function poolGridHtml(cards, label) {
    if (!cards.length) return "";
    return '<div class="sec-head" data-stage="cards"><div><h2>' + esc(label) + '</h2></div></div><div class="grid3" data-stage="cards">' + cards.map(function (c) { return poolCardHtml(c, false); }).join("") + "</div>";
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
      var paras = [lint(esc(lead), "thin")]; if (follow) paras.push(lint(esc(follow), "thin.follow"));
      return '<div class="refusal">' + samMsgHtml(paras, "Sam’s read") + "</div>" + poolGridHtml(cards, "What has sold") + sellHtml();
    }
    var listJoin = function (a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; };
    // Only claim a YEAR spread when there genuinely is one (>= 2 years, so no "across 1 years").
    var yspan = rf.yearSpanPhrase ? (" across " + esc(rf.yearSpanPhrase)) : "";
    var reason = (rf.variants && rf.variants.length >= 2)
      ? "The " + esc(model) + "s that have sold span the " + esc(listJoin(rf.variants)) + yspan + ". Cars this different do not trade as one market, so a single range would invent a pattern that is not there."
      : "The " + esc(model) + "s that have sold range too widely in spec and condition to trade as one market" + yspan + ". A single range would invent a pattern that is not there.";
    var follow2 = "Tell me which " + esc(model) + " it is and I’ll compare it to the ones that match.";
    var chips = (rf.variants && rf.variants.length)
      ? '<div class="wayfwd">' + rf.variants.map(function (v) { return '<button type="button" class="chip" data-model="' + esc(v) + '">' + esc(v) + "</button>"; }).join("") + '<button type="button" class="linkbtn" data-change>Or tell me the year and engine &#8594;</button></div>'
      : "";
    var head = '<div class="refusal" data-stage="answer"><p class="ans">' + lint(esc("I won’t give you a range on this one. It would be a guess."), "refuse") + "</p>" +
      samMsgHtml([lint(reason, "refuse.reason"), lint(esc(follow2), "refuse.follow")], "Sam’s read") + chips + "</div>";
    return head + poolGridHtml(cards, "What has sold") + sellHtml();
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
  function R4C_MANUAL(t) { return /manual|\d[- ]?speed(?!\s*auto)|\bmt\b|\bstick\b/i.test(t) && !/automatic|pdk|dct|tiptronic|dsg/i.test(t); }
  // Gearbox label. On models with a single-clutch automated box, "manual vs E-gear" is the defining
  // split, so label plainly: "Manual" (factory), "Manual (conversion)" (a retrofit, NEVER a factory
  // manual - item 4), or "E-gear" (the automated). Other models keep their raw label. Uses the
  // current render's resolved model (htLastD) for scope.
  var EGEAR_MODELS = /murci[eé]lago|gallardo|aventador|huracan|huracán/i;   // Lamborghini single-clutch "E-gear"
  function gearboxLabel(rc) {
    var raw = String(rc.transmission || "");
    var title = String(rc.title || "");
    var modelName = (htLastD && htLastD.resolvedCar && htLastD.resolvedCar.model) || (htLastD && htLastD.vehicle && htLastD.vehicle.model) || "";
    var isConv = /conversion|converted/i.test(raw) || /conversion|converted/i.test(title);
    var isManual = /\bmanual\b|\bgated\b|\bstick\b/i.test(raw);
    if (isManual || (isConv && /\bmanual\b|\d[- ]?speed/i.test(raw + " " + title))) return isConv ? "Manual (conversion)" : "Manual";
    if (EGEAR_MODELS.test(String(modelName)) || EGEAR_MODELS.test(title)) return "E-gear";
    return raw ? cap(raw) : "";
  }
  // One plain OBSERVED-pattern line for the manual-vs-E-gear split (never a cause). Only when the
  // pool actually holds both, on an E-gear model. Conversions are excluded from the manual figure.
  var GEARBOX_PATTERN_MIN = 3;   // each side needs >=3 real sales, or it is a coincidence, not a pattern
  function gearboxPatternLine(scope) {
    var man = [], eg = [];
    (scope || []).forEach(function (rc) { var g = gearboxLabel(rc); if (g === "Manual") man.push(rc.hammer); else if (g === "E-gear") eg.push(rc.hammer); });
    // A pattern needs both sides populated: >=3 manuals AND >=3 E-gears. One manual (often the
    // searched car itself) is not a pattern - omit the line entirely.
    if (man.length < GEARBOX_PATTERN_MIN || eg.length < GEARBOX_PATTERN_MIN) return "";
    var mn = Math.min.apply(null, man), mx = Math.max.apply(null, man), en = Math.min.apply(null, eg), ex = Math.max.apply(null, eg);
    var mr = man.length === 1 ? usd(mn) : usd(mn) + " to " + usd(mx);
    var er = eg.length === 1 ? usd(en) : usd(en) + " to " + usd(ex);
    return "The manuals here sold " + mr + "; the E-gears " + er + ".";
  }
  function R4C_AUTO(t) { return /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle/i.test(t); }
  function htHasMk(rc, key) { return !!(rc.markers && rc.markers.some(function (mk) { return mk.key === key; })); }
  function natMoney(cur, n) { var s = sym(cur); return s ? s + Number(n).toLocaleString("en-US") : Number(n).toLocaleString("en-US") + " " + esc(cur); }
  // Short car-name header for a HOUSE row: year/make/model/variant only. Strip chassis/engine/serial
  // clauses, parenthetical codes, and a trailing coachbuilder ("by X") - those move to the meta line.
  function shortCarName(title) {
    var t = String(title || "");
    t = t.replace(/\b(?:vin|chassis|engine|s\/n|serial)\s*(?:no\.?|number|#)?\s*[:.]?\s*\*?[A-Za-z0-9][A-Za-z0-9.\-\/*]*/gi, "");
    t = t.replace(/\([^)]*\)/g, "");
    t = t.replace(/\bby\s+[A-Z][\w'&.\- ]+$/, "");
    return t.replace(/\s{2,}/g, " ").replace(/[\s,;·-]+$/, "").trim();
  }
  // Compact month for the house meta line ("Aug 2026") so venue + date + chassis scan as ONE line.
  function monShort(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return p.length >= 2 ? ((M[+p[1]] || "") + " " + p[0]).trim() : ""; }
  // One chassis format everywhere (item 3): "chassis" + the last six alphanumeric characters of the
  // VIN/chassis, never the full VIN on some rows and the tail on others. A shorter id shows in full.
  // Item 4 (Oct 2026): render ONLY a plausible VIN/chassis. A field like "SEE TEXT" / "N/A" /
  // "UNKNOWN" / "TBA" (a listing placeholder, not a number) must never surface as "chassis EETEXT".
  // Returns "" for a placeholder, anything under 6 alphanumerics, or a value with no digit (a real
  // chassis/VIN always carries at least one), so every caller omits the chassis line entirely.
  function chassisTail6(c){
    var raw=String(c==null?"":c).trim();
    if(/^(see\s*text|n\/?a|unknown|tba|tbd|none|null|no\.?|n\.a\.?)$/i.test(raw)) return "";
    var clean=raw.replace(/[^A-Za-z0-9]/g,"");
    if(clean.length<6||!/[0-9]/.test(clean)) return "";
    return clean.length>6?clean.slice(-6):clean;
  }
  function houseChassisMeta(rc) {
    const tail = chassisTail6(rc.chassis || rc.chassisTail);
    return tail ? "Chassis " + esc(tail) : "";
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
      return { q: "Mileage moves the number most on these. Roughly how many miles on it?", chips: [{ v: "mi:lo", label: "Under " + k + "k" }, { v: "mi:hi", label: "Over " + k + "k" }] };
    }
    if (intake.kind === "transmission") {
      var egM = EGEAR_MODELS.test(String((htLastD && htLastD.resolvedCar && htLastD.resolvedCar.model) || (htLastD && htLastD.vehicle && htLastD.vehicle.model) || ""));
      return { q: "The gearbox splits these on price. Which is it?", chips: [{ v: "tx:manual", label: "Manual" }, { v: "tx:auto", label: egM ? "E-gear" : "Automatic" }] };
    }
    return null;
  }
  function thinIntakeHtml(d, ht, name) {
    var c = thinIntakeCopy(ht.intake);
    if (!c) return null;
    var lead = "Before I show you numbers, one thing about the " + esc(name) + ". " + esc(c.q);
    var chips = '<div class="chips htintake">' +
      c.chips.map(function (ch) { return '<button type="button" class="chip" data-thinsplit="' + esc(ch.v) + '">' + esc(ch.label) + "</button>"; }).join("") +
      '<button type="button" class="chip ghost" data-htskip>Just show me what sold</button></div>';
    return qscreenHtml(lint(esc(lead), "ht.intake"), chips, "One question first", "");
  }
  // Scope the receipts by the intake answer (client-side; the engine returned them all).
  function thinScope(receipts, intake, choice) {
    if (!choice || choice === "__skip__") return { scope: receipts, label: null };
    var keep, lbl;
    if (choice.indexOf("no:") === 0) { var key = choice.slice(3); keep = receipts.filter(function (r) { return !htHasMk(r, key); }); lbl = "standard"; }
    else if (choice === "mi:lo") { var thL = intake && intake.threshold; keep = receipts.filter(function (r) { var mi = Number(r.mileage) || 0; return mi > 0 && mi <= thL; }); lbl = "lower-mileage"; }
    else if (choice === "mi:hi") { var thH = intake && intake.threshold; keep = receipts.filter(function (r) { var mi = Number(r.mileage) || 0; return mi > thH; }); lbl = "higher-mileage"; }
    else if (choice === "tx:manual") { keep = receipts.filter(function (r) { var g = gearboxLabel(r); if (g === "Manual") return true; if (g === "E-gear" || /conversion/i.test(g)) return false; return R4C_MANUAL(String(r.transmission || "")); }); lbl = "manual"; }
    else if (choice === "tx:auto") { keep = receipts.filter(function (r) { var g = gearboxLabel(r); if (g === "E-gear") return true; if (g === "Manual" || /conversion/i.test(g)) return false; return R4C_AUTO(String(r.transmission || "")); }); lbl = "e-gear"; }
    else { keep = receipts.filter(function (r) { return htHasMk(r, choice); }); lbl = (intake && intake.markerLabel ? intake.markerLabel : "").toLowerCase(); }
    return keep && keep.length ? { scope: keep, label: lbl } : { scope: receipts, label: null };
  }
  // The window the thin pool covers, from the engine's thin.windowMonths (never assumed).
  function thinWindowText(ht) {
    var w = Number(ht && ht.windowMonths);
    if (w === 12) return "the last twelve months";
    if (w === 24) return "the past two years";
    if (w === 36 || !w) return HT_WINDOW_TEXT;
    if (w % 12 === 0) return "the past " + spellK(w / 12) + " years";
    return "the past " + w + " months";
  }
  // Thin state (Thin.html): headline with the count in green, freshness, the engine's older-sales
  // count when present, then the sales as a two-column card grid. NO HEADLINE DOLLAR FIGURE (rule 24)
  // and no second range line: the cards are the record.
  function thinHeadHtml(name, scope, scopedLabel, ht) {
    var who = (scopedLabel ? cap(scopedLabel) + " " + name : cap(name));
    // The year comes from the sale itself, never the typed year (a "1902 Pierce Motorette" whose
    // only sale is a 1904 reads "a 1904").
    var whoNoYear = String(who).replace(/^\s*(18|19|20)\d\d\s+/, "");
    var win = thinWindowText(ht), n = scope.length;
    var plural = carNamePlural(whoNoYear);
    if (n === 1) {
      var yr = scope[0] && scope[0].year ? scope[0].year : null;
      return '<h1 class="thin-head lead">' + lint("Only <span class=\"ct\">one " + esc(whoNoYear) + "</span> has sold in " + win + (yr ? ", a " + yr : "") + ". Here’s what it went for.", "ht.hero1") + "</h1>";
    }
    return '<h1 class="thin-head lead">' + lint("Only <span class=\"ct\">" + n + " " + esc(plural) + "</span> have sold in " + win + ", not enough for a range. Here’s what they went for.", "ht.hero") + "</h1>";
  }
  // Paired sales: same chassis at a house AND online. Two receipts side by side, NO percentage
  // until a model clears 3 such pairs (design: the % stays dormant below that).
  function htPairsHtml(ht) {
    if (!ht.pairs || !ht.pairs.length) return "";
    var note = ht.pairPctEligible
      ? "Same car, both venues."
      : "The same chassis, sold at a house and online. Too few matched pairs yet to read a house-versus-online pattern, so here are both receipts.";
    return '<div class="sec-head" data-stage="cards"><div><h2>' + lint("The same car, twice", "ht.pairlab") + '</h2><span class="scope">' + lint(note, "ht.pairnote") + "</span></div></div>" +
      '<div class="grid2" data-stage="cards">' + ht.pairs[0].map(receiptCardHtml).join("") + "</div>";
  }
  // Widening box: ONLY when the engine returns a sibling family (thin.sibling {label, count, query,
  // relation?}). The button runs the sibling's own query.
  function siblingHtml(ht) {
    var sb = ht && ht.sibling;
    if (!sb || !sb.label || !sb.query || !(Number(sb.count) > 0)) return "";
    var who = sb.relation ? "Its " + esc(sb.label) + " " + esc(sb.relation) : "The " + esc(sb.label);
    var times = Number(sb.count) === 1 ? "once" : Number(sb.count) + " times";
    return '<section class="widen" data-stage="cards"><p>' + lint("Want the wider picture? " + who + " sold " + times + ".", "ht.sibling") + '</p><button type="button" data-sibling="' + esc(sb.query) + '">Show those too &#8594;</button></section>';
  }
  function thinHtml(d, m) {
    var ht = d.thin;
    htLastD = d;
    if (!ht || !ht.receipts || !ht.receipts.length) return refusalHtml(d, m); // safety: never dead-end
    var name = bareNameOf(d, m);
    // Intake FIRST, but only when a split forks THIS car's price and the user has not answered.
    if (ht.intake && htChoice === null) { var iv = thinIntakeHtml(d, ht, name); if (iv) return iv; }
    var sc = thinScope(ht.receipts, ht.intake, htChoice);
    var scope = sc.scope, scopedLabel = sc.label;
    // A gearbox tag shows only when the pool has a real manual-vs-non-manual split.
    htGearboxSplit = (function () { var man = 0, non = 0; (scope || []).forEach(function (rc) { if (rc.isHouse) return; var g = gearboxLabel(rc); if (!g) return; if (/^manual/i.test(g)) man++; else non++; }); return man > 0 && non > 0; })();
    var lines = [];
    var ol = olderOutsideLine(d); if (ol) lines.push(ol);
    // HOUSE STEER text only when house share >= 2/3 (ht.houseSteer); venue-neutral otherwise.
    if (ht.houseSteer) lines.push(!ht.onlineReceiptsN ? "These trade at the auction houses, not online. Every recorded sale here came through one." : "These mostly trade at the auction houses; a few sell online. Both are below.");
    else if (ht.houseN && ht.onlineReceiptsN) lines.push("These sell online and at the auction houses. The recorded sales are below.");
    var gpat = gearboxPatternLine(scope); if (gpat) lines.push(gpat);
    var body = livePanelSlot() + '<div class="thinblk livetake" data-stage="answer">' + thinHeadHtml(name, scope, scopedLabel, ht) + freshLine(d) +
      lines.map(function (p) { return '<p class="ans-line">' + lint(esc(p), "ht.line") + "</p>"; }).join("") + "</div>";
    if (m) body += '<div class="cards5 single" data-stage="cards">' + vinHeroCardHtml(m, d.resolvedCar) + "</div>";
    // Newest first (the honest evidence order); the engine's hammer-desc order is for its own math.
    // Every sale renders (capped display only, Oct 2026): "every real sale", not a curated slice.
    var shownRecs = scope.slice().sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    body += capCardsHtml("grid2", shownRecs.map(receiptCardHtml), 4);
    if (scope === ht.receipts) body += htPairsHtml(ht);
    body += siblingHtml(ht);
    // One Box NEVER recommends a house or platform; "Ready to sell?" is the only bridge to /sell.
    body += sellHtml();
    body += whyNoteHtml(d);
    return body;
  }

  // ============ CLASS-ERA render (Part 1, Sep 2026) =====================================
  // The rung beneath thin mode: the exact model has NOT sold in three years, so this widens to the
  // same marque within the car's decade era band. Rendered as a COARSE fallback, labelled plainly
  // as the wider market, never as a price for the exact car (rule 17). Same receipt discipline.
  // "A", "A and B", "A, B and C" - up to 3.
  function obListPhrase(arr) {
    var a = arr.slice(0, 3);
    if (a.length <= 1) return a[0] || "";
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function obNumWord(n) { return ["", "One", "Two", "Three", "Four", "Five"][n] || String(n); }
  function classEraHtml(d, m) {
    var ce = d.classEra;
    htLastD = d;   // so gearboxLabel can read the resolved model for the receipt rows
    if (!ce || !ce.receipts || !ce.receipts.length) return refusalHtml(d, m);
    var v = d.resolvedCar || d.vehicle || {};
    var carName = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || bareNameOf(d, m);
    var era = esc(ce.era), make = esc(ce.make);
    // Never claim "none sold" when the subject car itself sold in-window.
    var exactSold = m && (m.price || m.soldDate);
    var saleBits = [];
    if (m && m.price) saleBits.push(esc(usd(m.price)));
    if (m && m.source) saleBits.push(esc(obPlat(m.source)));
    if (m && m.soldDate) saleBits.push(esc(monShort(m.soldDate)));
    // rangeSuppressed (engine wide-band guard): the band was too wide to be an honest "typical" range
    // (high > 3x low) and no narrower pool was found - NEVER render the <h1 class="range band"> headline
    // in that case (rule 24: no dollar headline without a real band), just the plain statement + ask.
    var leadTxt = ce.rangeSuppressed
      ? "No " + esc(carName) + " has sold in " + HT_WINDOW_TEXT + ", and the wider " + era + " " + make + " market is too spread out to mark a typical range." + (ce.suppressReason ? " " + esc(ce.suppressReason) : "") + (ce.askNarrow && ce.askNarrow.question ? " " + esc(ce.askNarrow.question) : "")
      : exactSold
      ? "The only recent " + esc(carName) + " sale on record is this car" + (saleBits.length ? " (" + saleBits.join(", ") + ")" : "") + ". Beyond it, " + era + " " + make + "s have sold for"
      : "No " + esc(carName) + " has sold in " + HT_WINDOW_TEXT + ". " + era + " " + make + "s have sold for";
    var shown = ce.receipts.slice(0, 8);
    var venues = []; shown.forEach(function (r) { if (r.venue && venues.indexOf(r.venue) < 0) venues.push(r.venue); });
    var allHouse = shown.length > 0 && shown.every(function (r) { return r.isHouse; });
    var vlist = venues.length ? obListPhrase(venues) : "the auction houses";
    var tailTxt = allHouse ? ("at the hammer at " + esc(vlist) + ".") : ("across " + esc(vlist) + ".");
    // Every shown card must sit inside the stated band, or be called out in words here.
    var oc = ce.outliers || [];
    var hi = oc.filter(function (o) { return o.above; }), lo = oc.filter(function (o) { return !o.above; });
    function callout(list, dir) {
      if (!list.length) return "";
      var prices = list.map(function (o) { return esc(usd(o.hammer)); });
      var ps = prices.length === 1 ? prices[0] : prices.slice(0, -1).join(", ") + " and " + prices[prices.length - 1];
      var lbl = (list.length === 1 && list[0].label) ? ", " + esc(list[0].label) : "";
      return obNumWord(list.length) + " sold " + dir + ", at " + ps + lbl + ".";
    }
    var outSentence = [callout(hi, "higher"), callout(lo, "lower")].filter(Boolean).join(" ");
    var out = '<section class="anscard solo livetake blk" data-stage="answer"><div class="ans-main">' +
      '<div class="eyebrow">' + esc(ce.era + " " + ce.make + " sales · the wider market") + "</div>" +
      '<p class="landed lead">' + lint(leadTxt, "ce.lead") + "</p>" +
      (ce.rangeSuppressed ? "" : '<h1 class="range band">' + esc(usd(ce.lowHammer)) + ' <span class="to">to</span> ' + esc(usd(ce.highHammer)) + "</h1>") +
      (ce.rangeSuppressed ? "" : '<p class="ans-line tail">' + lint(tailTxt, "ce.tail") + "</p>") +
      (outSentence ? '<p class="ans-line ce-outlier">' + lint(outSentence, "ce.outlier") + "</p>" : "") +
      freshLine(d) + "</div></section>";
    if (m) out += '<div class="cards5 single" data-stage="cards">' + vinHeroCardHtml(m, d.resolvedCar) + "</div>";
    out += '<div class="sec-head" data-stage="cards"><div><h2>' + lint(era + " " + make + " sales, " + spanRange(ce.receipts), "ce.reclab") + "</h2></div></div>";
    out += '<div class="grid2" data-stage="cards">' + shown.map(receiptCardHtml).join("") + "</div>";
    out += sellHtml();
    return out;
  }

  function renderResults(d) {
    // Search box, resolved car line (VIN MATCH pill on an exact match), then the tier body. Every
    // branch renders from the engine's structured facts - no fabricated numbers, ever.
    obGbApplies = !!(d && d.gearboxApplies);   // item 4: gate the hero gearbox line
    obLastD = d;
    var m = vinAnchor;
    var head = (d.resolvedCar || m) ? carLineHtml(d, m) : "";
    // A VIN that resolved a car but has NO recorded sale must SAY SO before the model market, so the
    // market read is never mistaken for this exact car's history.
    if (!m && vinQueryNoSale) {
      head += '<div class="notes vinnosale" data-stage="anchor"><p>' + lint(esc("No recorded sale for this VIN. Here’s the market for the " + (carLabel(d.resolvedCar) || "model") + " instead."), "vin.nosale") + "</p></div>";
    }
    var body, foot = false;
    if (d.tier === "thin") body = thinHtml(d, m);
    else if (d.tier === "class_era") body = classEraHtml(d, m);
    else if (d.tier === "refusal") { body = refusalHtml(d, m); foot = true; }
    else if (d.tier === "body_unavailable") { body = samMsgHtml([lint(esc(d.samLine || "That body was not offered for this car."), "bu")], "Sam’s read", "big"); foot = true; }
    else if (d.tier === "not_tracked") { body = samMsgHtml([lint(esc(d.samLine || "We haven’t tracked a sale of this car yet."), "nt")], "Sam’s read", "big") + sellHtml(); foot = true; }
    else if (d.tier === "non_road") { body = samMsgHtml([lint(esc(d.samLine || "Market Check covers cars, trucks and motorcycles."), "nr")], "Sam’s read", "big"); foot = true; }
    else if (d.tier === "result") body = resultHtml(d, m);
    else { body = samMsgHtml([lint(esc("I don’t have enough real " + carLabel(d.resolvedCar) + " sales to show you an honest read, and I won’t make one up. Try another car and I’ll pull what actually sold."), "zero")], "Sam’s read", "big") + sellHtml(); foot = true; }
    root.innerHTML = inboxHtml(lastQuery) + head + body + (foot ? footHtml() : "");
    wire();
    streamReveal();
    if (d.tier === "result" || d.tier === "thin") loadLivePanel(d, m);
  }
  // QUESTION screen (Question.html): one card, SAM roundel, eyebrow, the question in Newsreader,
  // 44px+ chips, and the honest cap line. A question never renders inside a Sam's Take panel.
  function qscreenHtml(promptHtml, chipsBlock, eyebrow, sub) {
    return '<section class="qscreen" data-stage="answer"><span class="roundel lg" aria-hidden="true">SAM</span><div class="qbody">' +
      '<div class="qtop"><span class="eyebrow">' + esc(eyebrow) + '</span><p class="qtext">' + promptHtml + "</p></div>" +
      chipsBlock + (sub ? '<span class="qsub">' + esc(sub) + "</span>" : "") + "</div></section>";
  }
  // The engine caps One Box at two questions before a result (askIndex 1 or 2).
  function askCopy(d) {
    return (d && Number(d.askIndex) >= 2)
      ? { eyebrow: "One last question", sub: "Then what actually sold." }
      : { eyebrow: "One question first", sub: "One more at most, then what actually sold." };
  }
  function renderQuestion(html) {
    root.innerHTML = inboxHtml(lastQuery) + html + footHtml();
    wire();
  }
  // Gearbox / Competition question (Part 1 Rule 2 + change 1): a REFINE choice - the chip re-scopes
  // the SAME car (runPool with refine), not a re-query.
  function renderRefineChoice(d) {
    var chips = "";
    if (d.gearboxOptions) chips = d.gearboxOptions.map(function (o) { var tx = /manual/i.test(o) ? "manual" : "auto"; return '<button type="button" class="chip qchip" data-tx="' + tx + '" data-mlabel="' + esc(o) + '">' + esc(o) + "</button>"; }).join("");
    else if (d.variantOptions) chips = d.variantOptions.map(function (o) { var v = /competition/i.test(o) ? "competition" : "standard"; return '<button type="button" class="chip qchip" data-variant="' + v + '" data-mlabel="' + esc(o) + '">' + esc(o) + "</button>"; }).join("");
    var ac = askCopy(d);
    renderQuestion(qscreenHtml(lint(esc(d.prompt || "Which one is it?"), "refchoice"), '<div class="chips">' + chips + "</div>", ac.eyebrow, ac.sub));
  }
  function renderChoice(d) {
    var ac = askCopy(d);
    // Generation choice: chips carry a full year-resolvable query (run directly, not appended).
    if (d.generationOptions && d.generationOptions.length) {
      var gchips = '<div class="chips">' + d.generationOptions.map(function (o) {
        return '<button type="button" class="chip" data-genquery="' + esc(o.query) + '">' + esc(o.label) + "</button>";
      }).join("") + "</div>";
      renderQuestion(qscreenHtml(lint(esc(d.prompt || "Which generation is it?"), "genchoice"), gchips, ac.eyebrow, ac.sub));
      return;
    }
    var opts = d.modelOptions || d.bodyOptions || [];
    var kind = d.modelOptions ? "model" : "body";
    // Base a chip appends its answer to: a passed baseLabel (year+make on a VIN model ask), else
    // the resolved car (year+make+model+trim on a body ask), so a body answer re-queries the SAME
    // car and a VIN chip never appends to the VIN (which re-decodes and loops).
    choiceCtx = d.baseLabel || (d.resolvedCar ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model, d.resolvedCar.trim].filter(Boolean).join(" ") : null) || null;
    renderQuestion(qscreenHtml(lint(esc(d.prompt || "Which one is it?"), "choice"), chipsHtml(opts, kind), ac.eyebrow, ac.sub));
  }
  function renderError(msg) {
    root.innerHTML = inboxHtml(lastQuery) + samMsgHtml([esc(msg)], "", "big") + footHtml();
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
  // ---------------------------------------------------------------- narrated loading (item 3)
  // Sam-voice, one line at a time with animated dots, only the steps that actually run, in order.
  // The engine call is a single round-trip (no mid-fetch signal), so the pre-result lines advance
  // on a minimum dwell while the fetch is in flight; the post-result lines are gated on real facts
  // (the premium back-out line renders ONLY when the pool actually contains auction-house sales).
  // Never a fake progress bar or percentage.
  function loaderHtml() {
    return '<div class="loader" data-stage="note"><span class="ltext"></span>' +
      '<span class="ldots"><i></i><i></i><i></i></span></div>';
  }
  function setLoaderLine(text) { var t = document.querySelector(".loader .ltext"); if (t) t.textContent = text; }
  // start(lines): shows the first line, then advances through the rest on a min dwell while waiting.
  // finish(steps, cb): lets the current line finish its dwell, plays the final steps in order (each
  // for the min dwell), then fires cb. Faithful to "sequential with a minimum dwell so lines don't
  // flash." A screen swap (clarification / error / choice) simply replaces the loader DOM.
  function makeLoader() {
    var MIN = 600, shownAt = 0, ambient = [], ai = 0, timer = null, finalizing = false;
    function show(line) { setLoaderLine(line); shownAt = Date.now(); }
    function ambientTick() {
      timer = setTimeout(function () {
        if (finalizing) return;
        if (ai < ambient.length - 1) { ai++; show(ambient[ai]); }
        ambientTick();
      }, MIN);
    }
    return {
      start: function (lines) { ambient = lines || []; ai = 0; if (ambient.length) show(ambient[0]); ambientTick(); },
      finish: function (steps, cb) {
        finalizing = true; if (timer) clearTimeout(timer);
        var seq = (steps || []).slice();
        (function next(delay) {
          setTimeout(function () {
            if (!seq.length) { cb(); return; }
            show(seq.shift()); next(MIN);
          }, delay);
        })(Math.max(0, MIN - (Date.now() - shownAt)));
      }
    };
  }
  // The premium back-out step is real ONLY for pools that contain auction-house sales.
  function resultIsHousePool(d) {
    if (!d) return false;
    if (d.tier === "thin") { var tr = (d.thin && d.thin.receipts) || []; return tr.some(function (r) { return r.isHouse; }); }
    if (d.tier === "class_era") { var cr = (d.classEra && d.classEra.receipts) || []; return cr.some(function (r) { return r.isHouse; }); }
    var rep = d.representative; if (rep && [rep.closest, rep.high, rep.low].some(function (c) { return c && c.isHouse; })) return true;
    return false;
  }

  // ---------------------------------------------------------------- VIN anchor (Task 2)
  var vinAnchor = null;   // carried from the confirm step into the result render
  var vinQueryNoSale = false;   // the query WAS a VIN that resolved a car but has NO recorded sale in our archive
  var pendingVin = null;  // resolved vehicle awaiting confirmation
  // Base label a clarification chip appends its answer to (year+make for a model ask, the full
  // car for a body ask). A VIN query's raw text is the VIN, so a chip must NOT append to it (it
  // re-decodes and loops) - the chip builds a clean query from this context instead. Null for a
  // typed query, where appending to the raw text is correct.
  var choiceCtx = null;
  var htChoice = null; // house-tier intake selection: null=not asked, "__skip__", or a marker key
  var htLastD = null;  // last house-tier decision, so an intake chip can re-render in place
  var obGbApplies = false;  // item 4: gearbox line on a volume-result card only when a gearbox question applies
  var htGearboxSplit = false;  // item 7b: true only when the pool holds BOTH a manual and a non-manual
  // gearbox (a real split / a gearbox question applies). When false, the per-card gearbox tag is dropped.
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
  // Chassis exact match: the matched car as a THIS CAR card (its own record, evidence only), then an
  // honest ask for the car. No decoding, no marque guess.
  function renderChassisMatch(match) {
    var ask = "I know this exact car. Tell me the year, make and model and I’ll pull what similar ones have done.";
    vinAnchor = null;
    root.innerHTML = inboxHtml(lastQuery) + '<div class="cards5 single" data-stage="anchor">' + vinHeroCardHtml(match, null) + "</div>" +
      samMsgHtml([lint(esc(ask), "chassisMatchAsk")], "", "big") + footHtml();
    wire();
  }

  // ---------------------------------------------------------------- run (dispatcher)
  function run(text, keepAsk) {
    text = String(text || "").trim();
    if (!text) return;
    // A brand-new search resets the question count; a chip answer (keepAsk) carries it forward so
    // the engine can enforce the two-question cap across generation/body re-queries (Part 3).
    if (!keepAsk) obAsked = 0;
    lastQuery = text; obLastRefine = null; obLastD = null; vinAnchor = null; pendingVin = null; obSourceVin = null; choiceCtx = null; obLastVehicle = null; htChoice = null; vinQueryNoSale = false;
    // Identifier-shaped input (VIN or chassis) routes through the shared resolver (decode +
    // confirm + exact-match + the honest VIN-invalid / chassis lines); everything else goes
    // straight to the archive pool.
    if (obIdentifierShaped(text)) { vinResolve(text); return; }
    runPool(text, null);
  }
  // Graceful failure copy + a fetch that never hangs the spinner: if the server is slow/down and the
  // request stalls, the abort fires and the catch renders one calm line.
  var OB_CALM = "Sam’s catching his breath, try again in a minute.";
  function obFetch(url, opts, ms) {
    var o = opts || {};
    if (typeof AbortController !== "undefined") {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms || 12000);
      o = Object.assign({}, o, { signal: ctrl.signal });
      return fetch(url, o).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
    }
    return fetch(url, o);
  }
  // Merges a newly-answered earned question INTO the refinements already answered this session
  // (see obLastRefine above), instead of replacing them, so a second question narrows alongside
  // the first rather than silently un-asking it. The engine filters every key it is given in one
  // pass, so one combined object (all answered dimensions) is all it needs.
  function mergeRefine(partial) {
    var base = obLastRefine ? Object.assign({}, obLastRefine) : {};
    Object.keys(partial).forEach(function (k) { if (k !== "label") base[k] = partial[k]; });
    if ("miMin" in partial) base.miLabel = partial.label;
    if ("tx" in partial) base.txLabel = partial.label;
    if ("variant" in partial) base.variantLabel = partial.label;
    if ("driver" in partial) base.driverLabel = partial.label;
    if ("observe" in partial) base.observeLabel = partial.label;
    return base;
  }
  function runPool(text, vehicle, refine) {
    obLastVehicle = vehicle || obLastVehicle;
    obLastRefine = refine || null;
    setRootHtmlLifted(inboxHtml(text) + loaderHtml() + footHtml());
    wire();
    var loader = makeLoader();
    loader.start(["Working out exactly what car this is", "Pulling the real sales"]);
    var car = { raw: text };
    if (vehicle) car.vehicle = vehicle;
    // #1 divergence rule: pass the exact car's own sale (from the VIN/chassis match) so the engine
    // can compare it to the cluster. Only present on a matched car; harmless when absent.
    if (vinAnchor && Number(vinAnchor.price) > 0) car.exactSale = { price: vinAnchor.price, mileage: vinAnchor.mileage, soldDate: vinAnchor.soldDate };
    var payload = { oneBox: true, anonId: obAnonId(), car: car, asked: obAsked };
    if (refine) payload.refine = refine;   // inline earned-question refinement (mileage / transmission)
    obFetch(API_ORIGIN + "/api/sellerDecision", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, 25000).then(function (r) { return r.json(); }).then(function (d) {
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
      if (!d || d.status !== "one_box") { renderError(OB_CALM); return; }
      if (d.tier === "unavailable") { renderError(d.samLine || OB_CALM); return; }
      if (d.tier === "rate_limited") { renderError(d.samLine || "That’s a lot of lookups for one day. Come back tomorrow and I’ll keep pulling real sales."); return; }
      if (d.tier === "model_choice" || d.tier === "body_choice" || d.tier === "generation_choice") { if (d.askIndex) obAsked = d.askIndex; renderChoice(d); return; }
      if (d.tier === "gearbox_choice" || d.tier === "variant_choice") { if (d.askIndex) obAsked = d.askIndex; renderRefineChoice(d); return; }
      if (vinAnchor) obEvent("onebox_vin_anchor_shown");
      obSnapshotId = d.snapshotId || null; obAsOf = null; // live result: shareable, no as-of line
      obResolvedCar = d.resolvedCar || null;              // carried into the /sell handoff
      obAnalytics(d);
      // Final narrated steps, gated on real engine facts: the premium back-out line only when the
      // pool actually has auction-house sales; then "Picking the ones that matter"; then reveal.
      var finalSteps = [];
      if (resultIsHousePool(d)) finalSteps.push("Backing out the buyer’s premiums");
      finalSteps.push("Picking the ones that matter");
      loader.finish(finalSteps, function () { if (SELL && SELL.onCar && SELL.onCar(d, text)) return; renderResults(d); });
    }).catch(function () { renderError(OB_CALM); });
  }
  // VIN path: decode + confirm (reuses /api/vehicleIdentity). VINs travel in the request
  // body only; nothing here logs the raw VIN.
  function vinResolve(text) {
    setRootHtmlLifted(inboxHtml(text) + loaderHtml() + footHtml());
    wire(); setLoaderLine("Reading that VIN");
    obFetch(API_ORIGIN + "/api/vehicleIdentity", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) }, 25000)
      .then(function (r) { return r.json(); }).then(function (d) {
        var cl = d && d.clarification;
        // Branch on clarification KIND first (status can be needs_confirmation OR
        // needs_clarification for a vin_confirmation depending on the resolver path).
        if (cl && cl.kind === "vin_confirmation") {
          obSourceVin = (d.vehicle && d.vehicle.vin) || null; // travels to /sell for lead enrichment
          // MATCH-FIRST (fault 2): an EXACT archive match is stronger evidence than a decode, so
          // it IS the confirmation. Skip the confirm AND any model ask: lead with the matched car
          // (named from its record) and go straight to comps for that car. Mirrors /sell Option B.
          // Lead with the exact match whenever we can NAME the car - from its make OR, when the
          // row is filed make/model 'Unknown' (BaT files its whole feed that way), from the
          // title-derived displayName. The record is the answer; runPool re-resolves the car from
          // that displayName text, so the Unknown classification never hides a real recorded sale.
          if (d.vinArchiveMatch && (d.vinArchiveMatch.make || d.vinArchiveMatch.displayName)) {
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
            vinQueryNoSale = true;   // a VIN reached confirmation with no archive match -> no recorded sale
            renderChoice({ prompt: cl.question, modelOptions: cl.modelOptions, baseLabel: [d.vehicle && d.vehicle.year, d.vehicle && d.vehicle.make].filter(Boolean).join(" ") || null });
            return;
          }
          pendingVin = d.vehicle || null; vinAnchor = null; vinQueryNoSale = true;   // decoded a VIN, no recorded sale
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
          if (d.vinArchiveMatch && (d.vinArchiveMatch.make || d.vinArchiveMatch.displayName)) {
            vinAnchor = d.vinArchiveMatch;
            runPool(d.vinArchiveMatch.displayName || carLabel(vehicleFromMatch(d.vinArchiveMatch, d.vehicle)) || text, vehicleFromMatch(d.vinArchiveMatch, d.vehicle));
          } else { vinAnchor = null; vinQueryNoSale = true; runPool(text, d.vehicle); }   // VIN resolved, no recorded sale
          return;
        }
        if (d && d.status === "needs_clarification" && cl && (cl.chips || (d.vehicle && d.vehicle.make))) {
          // MATCH-FIRST (fault 2, defensive): if a partial decode ALSO carries an exact match,
          // the match names the model - skip the model ask, lead with the matched car, go to comps.
          if (d.vinArchiveMatch && (d.vinArchiveMatch.make || d.vinArchiveMatch.displayName)) {
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
    renderQuestion(qscreenHtml(lint(esc(question || "Is this the car?"), "vinconfirm"),
      '<div class="chips"><button type="button" class="chip" id="ob-vin-yes">Yes, that’s it</button><button type="button" class="chip ghost" id="ob-vin-no">No, let me type it</button></div>', "One question first", ""));
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
  // Sell handoff: "See where I'd sell it" is a real link into /sell carrying the resolved car and
  // every answered question as URL parameters (only the ones we actually have):
  //   src=onebox, car (display label), year, make, model, family (trim family), gen (generation code),
  //   body, mileage (the subject's miles when known), tx (manual|auto) + tx_label, variant,
  //   mi_min / mi_max (answered mileage band), driver + driver_val, observe.
  // The raw VIN is NEVER put in the URL (it would land in logs); a VIN-sourced result still hands
  // the VIN over through the existing localStorage prefill (gas_onebox_prefill), set on click.
  function sellHref() {
    var d = obLastD || {}, rc = obResolvedCar || d.resolvedCar || {}, rf = obLastRefine || {};
    var p = { src: "onebox" };
    function put(k, v) { if (v != null && String(v).trim() !== "") p[k] = String(v).trim(); }
    put("car", (vinAnchor && vinAnchor.displayName) || (rc.make ? carLabel(rc) : ""));
    put("year", rc.year); put("make", rc.make); put("model", rc.model);
    put("family", rc.trim || d.poolTrim); put("gen", rc.genCode); put("body", rc.bodyStyle);
    var mi = obLastD ? subjMileageOf(d, vinAnchor) : null;
    if (!mi && /^around/i.test(rf.miLabel || "") && Number(rf.miTarget) > 0) mi = rf.miTarget;   // a typed mileage
    put("mileage", mi);
    if (rf.tx) { put("tx", rf.tx); put("tx_label", rf.txLabel); }
    put("variant", rf.variant);
    if (rf.miMin != null) { put("mi_min", rf.miMin); put("mi_max", rf.miMax); }
    if (rf.driver) { put("driver", rf.driver); put("driver_val", rf.driverVal); }
    put("observe", rf.observe);
    return "/sell?" + Object.keys(p).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
  }
  function toSell() {
    var prefill = obSourceVin || (obResolvedCar ? carLabel(obResolvedCar) : "") || lastQuery || "";
    try { if (prefill) localStorage.setItem("gas_onebox_prefill", prefill); } catch (e) {}
    obEvent("onebox_sell_handoff_clicked");
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
    var submitText = function (v) { if (SELL && SELL.onSubmit && SELL.onSubmit(v)) return; run(v); };
    if (go) go.addEventListener("click", function () { submitText(input && input.value); });
    if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitText(input.value); } });
    var edit = document.getElementById("ob-edit"); if (edit) edit.addEventListener("click", function () { renderEmpty(); if (input && lastQuery) { var i2 = document.getElementById("ob-input"); if (i2) { i2.value = lastQuery; i2.focus(); } } });
    var sell = document.getElementById("ob-sell"); if (sell) sell.addEventListener("click", toSell);
    // Market Check landing search-example chips (item 3, Oct 2026): fills the box, then searches.
    Array.prototype.forEach.call(root.querySelectorAll("[data-mc-chip]"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-mc-chip");
        var inp = document.getElementById("ob-input"); if (inp) inp.value = v;
        submitText(v);
      });
    });
    // Long-list cap (Oct 2026, phone review): "Show 10 more" reveals one batch of the already
    // server-rendered extra cards per click, not the whole tail at once. The button updates its
    // count each click and only removes itself once the last batch is shown.
    Array.prototype.forEach.call(root.querySelectorAll("[data-capshow]"), function (b) {
      b.addEventListener("click", function () {
        var grid = document.getElementById(b.getAttribute("data-capshow")); if (!grid) return;
        var hidden = Array.prototype.slice.call(grid.querySelectorAll(".cap-extra[hidden]"));
        hidden.slice(0, OB_CAP_BATCH).forEach(function (x) { x.removeAttribute("hidden"); });
        var remaining = hidden.length - Math.min(OB_CAP_BATCH, hidden.length);
        b.setAttribute("aria-expanded", "true");
        if (remaining > 0) b.textContent = "Show " + Math.min(OB_CAP_BATCH, remaining) + " more →";
        else if (b.parentNode) b.parentNode.removeChild(b);
      });
    });
    // Market Check landing example band (item 3, Oct 2026): answering the miles/gearbox chip
    // REORDERS the already server-rendered sales (closest to the answer first) - it never changes
    // the pool or refetches anything, since this is a fixed illustrative example, not a real search.
    (function () {
      var qcard = document.getElementById("mc-ex-qcard"); if (!qcard) return;
      var grid = document.getElementById("mc-ex-sales"); if (!grid) return;
      var heading = document.getElementById("mc-ex-sales-h2");
      function cardOf(child) { return child.classList.contains("mc-ex-card") ? child : child.querySelector(".mc-ex-card"); }
      function reorder(keyFn) {
        var kids = Array.prototype.slice.call(grid.children);
        var withKeys = kids.map(function (k, i) { var c = cardOf(k); return { el: k, key: c ? keyFn(c) : Infinity, i: i }; });
        withKeys.sort(function (a, b) { return a.key - b.key || a.i - b.i; });
        withKeys.forEach(function (w) { grid.appendChild(w.el); });
        if (heading) heading.textContent = "The closest to yours";
      }
      Array.prototype.forEach.call(qcard.querySelectorAll(".qchip[data-mc-ex-milemin]"), function (b) {
        b.addEventListener("click", function () {
          var lo = Number(b.getAttribute("data-mc-ex-milemin")), hi = b.getAttribute("data-mc-ex-milemax");
          var target = hi ? (lo + Number(hi)) / 2 : lo;
          reorder(function (c) { var mi = Number(c.getAttribute("data-mi")); return mi > 0 ? Math.abs(mi - target) : Infinity; });
          Array.prototype.forEach.call(qcard.querySelectorAll(".qchip"), function (x) { x.classList.toggle("sel", x === b); });
        });
      });
      Array.prototype.forEach.call(qcard.querySelectorAll(".qchip[data-mc-ex-tx]"), function (b) {
        b.addEventListener("click", function () {
          var tx = b.getAttribute("data-mc-ex-tx");
          reorder(function (c) { return /manual/i.test(c.getAttribute("data-tx") || "") === (tx === "manual") ? 0 : 1; });
          Array.prototype.forEach.call(qcard.querySelectorAll(".qchip"), function (x) { x.classList.toggle("sel", x === b); });
        });
      });
      // The example band's own "type it" (mock item 6): reorders by distance from the typed
      // number, same as the mileage buckets above - never a refetch, same fixed illustrative pool.
      Array.prototype.forEach.call(qcard.querySelectorAll(".qchip[data-mc-ex-typemiles]"), function (b) {
        b.addEventListener("click", function () {
          b.outerHTML = '<span class="typemiles"><input id="mc-ex-miles" type="number" inputmode="numeric" placeholder="miles" /><button type="button" class="qchip" id="mc-ex-miles-go">Go</button></span>';
          var inp = document.getElementById("mc-ex-miles"); if (inp) inp.focus();
          function submit() {
            var v = Number((document.getElementById("mc-ex-miles") || {}).value); if (!(v > 0)) return;
            reorder(function (c) { var mi = Number(c.getAttribute("data-mi")); return mi > 0 ? Math.abs(mi - v) : Infinity; });
          }
          var go = document.getElementById("mc-ex-miles-go"); if (go) go.addEventListener("click", submit);
          if (inp) inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
        });
      });
    })();
    // Thin widening box: run the sibling family the engine named.
    Array.prototype.forEach.call(root.querySelectorAll("[data-sibling]"), function (b) { b.addEventListener("click", function () { obEvent("onebox_sibling_clicked", lastQuery); run(b.getAttribute("data-sibling")); }); });
    var share = root.querySelector("[data-share]"); if (share) share.addEventListener("click", shareResult);
    // A clarification chip RESOLVES the answer and advances: it builds a clean "year make model"
    // (or "...body") query from the choice context, never appending to the raw query - which for
    // a VIN would re-decode the VIN and loop forever (fault 1).
    function chipAnswer(value) { var base = choiceCtx || lastQuery || ""; run((base + " " + value).replace(/\s+/g, " ").trim(), true); }
    Array.prototype.forEach.call(root.querySelectorAll("[data-model]"), function (b) { b.addEventListener("click", function () { chipAnswer(b.getAttribute("data-model")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-body]"), function (b) { b.addEventListener("click", function () { chipAnswer(b.getAttribute("data-body")); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-change]"), function (b) { b.addEventListener("click", function () { renderEmpty(); }); });
    // Reconfirm "Yes": the answer already reflects this mileage, so just dismiss the ask (no re-scope).
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-refyes]"), function (b) { b.addEventListener("click", function () { var blk = b.parentNode && b.parentNode.parentNode; if (blk && blk.parentNode) blk.parentNode.removeChild(blk); }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-recent]"), function (b) { b.addEventListener("click", function () { run(b.getAttribute("data-recent")); }); });
    // Generation chips carry a full year-resolvable query - run it directly (never appended).
    Array.prototype.forEach.call(root.querySelectorAll("[data-genquery]"), function (b) { b.addEventListener("click", function () { run(b.getAttribute("data-genquery"), true); }); });
    // House-tier intake: place the car by its price-forking config, then re-render the same
    // decision scoped to the answer (no re-fetch; the engine returned every receipt).
    Array.prototype.forEach.call(root.querySelectorAll("[data-thinsplit]"), function (b) { b.addEventListener("click", function () { htChoice = b.getAttribute("data-thinsplit"); obEvent("onebox_ht_intake", lastQuery + ":" + htChoice); if (htLastD) { renderResults(htLastD); } }); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-htskip]"), function (b) { b.addEventListener("click", function () { htChoice = "__skip__"; obEvent("onebox_ht_skip", lastQuery); if (htLastD) { renderResults(htLastD); } }); });
    // The earned question: a mileage band or transmission chip narrows the SAME pool inline
    // (re-request with a refine), and Sam's take + the sales re-render to match. Each answer
    // MERGES into whatever was already answered (mergeRefine), so a second question narrows
    // alongside the first instead of un-asking it.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-milemin]"), function (b) {
      b.addEventListener("click", function () {
        var lo = b.getAttribute("data-milemin"), hi = b.getAttribute("data-milemax"), label = b.getAttribute("data-mlabel");
        runPool(lastQuery, obLastVehicle, mergeRefine({ miMin: Number(lo), miMax: hi ? Number(hi) : null, miTarget: hi ? Math.round((Number(lo) + Number(hi)) / 2) : Number(lo), label: label }));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-tx]"), function (b) {
      b.addEventListener("click", function () {
        var tx = b.getAttribute("data-tx"), label = b.getAttribute("data-mlabel");
        runPool(lastQuery, obLastVehicle, mergeRefine({ tx: tx, label: label }));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-variant]"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-variant"), label = b.getAttribute("data-mlabel");
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: v, label: label }));
      });
    });
    // Dictionary driver chip (item 7/8): narrows the pool to the listings that carry (or do not
    // carry) the mined title flag. Framed "listed as" - it is read off the title, not inspected.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-driver]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-driver"), val = b.getAttribute("data-drvval"), label = b.getAttribute("data-mlabel");
        obEvent("onebox_driver_refine", lastQuery + ":" + key + ":" + val);
        runPool(lastQuery, obLastVehicle, mergeRefine({ driver: key, driverVal: val, label: label }));
      });
    });
    // Item 9: observable-fact refinement. "Nothing major" just dismisses; a flag re-scopes the pool
    // (main band = cars WITHOUT the flag) and the aside sentence reports what the flagged ones brought.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-observe]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-observe"), label = b.getAttribute("data-olabel");
        if (key === "none") { var blk = b.parentNode && b.parentNode.parentNode; if (blk && blk.parentNode) blk.parentNode.removeChild(blk); return; }
        obEvent("onebox_observe_refine", lastQuery + ":" + key);
        runPool(lastQuery, obLastVehicle, mergeRefine({ observe: key, label: label }));
      });
    });
    // "type it": reveal a small inline mileage input; Enter narrows to a band around that number.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-typemiles]"), function (b) {
      b.addEventListener("click", function () {
        var wrap = b.parentNode;
        b.outerHTML = '<span class="typemiles"><input id="ob-miles" type="number" inputmode="numeric" placeholder="miles" /><button type="button" class="qchip" id="ob-miles-go">Go</button></span>';
        var inp = document.getElementById("ob-miles"); if (inp) inp.focus();
        function submit() { var v = Number((document.getElementById("ob-miles") || {}).value); if (!(v > 0)) return; var band = v >= 60000 ? 25000 : 15000; runPool(lastQuery, obLastVehicle, mergeRefine({ miMin: Math.max(0, v - band), miMax: v + band, miTarget: v, label: "around " + Math.round(v / 1000) + "k" })); }
        var go = document.getElementById("ob-miles-go"); if (go) go.addEventListener("click", submit);
        if (inp) inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      });
    });
    // Outbound comp-card click: log the referral per platform (the card link already carries the
    // UTM for the destination). Best-effort beacon, never blocks the navigation.
    Array.prototype.forEach.call(root.querySelectorAll("a[data-cardclick]"), function (a) {
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
  // Item 10: the corner avatar is the signed-in TDV subscriber state (magic-link / Beehiiv auto
  // sign-in). Render initials ONLY when a real session exists; render nothing for a guest - who
  // still gets the full two-question-to-answer flow with no prompt (the answer is never gated on
  // sign-in). Reads the session localStorage key auth.js writes; no dependency on auth.js loading.
  function obAvatarInit() {
    var el = document.getElementById("ob-account"); if (!el) return;
    var email = null;
    try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); if (s && s.access_token) email = s.email || "signed-in"; } catch (e) {}
    if (!email) { el.style.display = "none"; el.textContent = ""; return; }   // guest: no avatar, no prompt
    var lp = String(email).split("@")[0].split(/[\s._-]+/).filter(Boolean);
    var initials = (((lp[0] || "")[0] || "") + ((lp[1] || "")[0] || (lp[0] || "")[1] || "")).toUpperCase() || "•";
    el.textContent = initials; el.title = email; el.style.display = "";
  }
  function boot() {
    obAvatarInit();
    // JUST SOLD proof block removed from the empty state, so no fetchProof() on boot.
    if (renderSnapshot()) { syncRailResults(); return; }
    // The server already rendered the rich landing (lib/live/marketCheckLanding.js: hero, proof row,
    // "What you get", the example band) straight into #ob - mirrors renderSnapshot()'s early exit so
    // that content is never wiped and rebuilt as the plain empty state. wire() attaches the real
    // search box (#ob-input/#ob-go, same ids renderEmpty() uses) and the example band's own
    // handlers (capCardsHtml's existing [data-capshow], plus the reorder-on-answer below).
    if (document.getElementById("mc-landing")) {
      wire(); syncRailResults();
      var lq = /[?&]q=([^&]*)/.exec(location.search || "");
      if (lq) { try { run(decodeURIComponent(lq[1])); } catch (e) {} }
      return;
    }
    renderEmpty();
    syncRailResults();
    var q = /[?&]q=([^&]*)/.exec(location.search || "");
    if (q) { try { run(decodeURIComponent(q[1])); } catch (e) {} }
  }
  // The card builders, for Sell mode (same cards, same type): read-only use, nothing here changes.
  window.OBX = { carHead: carHead, qscreenHtml: qscreenHtml, askCopy: askCopy, esc: esc, inboxHtml: inboxHtml, footHtml: footHtml, saleCardHtml: saleCardHtml,
    samMsgHtml: samMsgHtml, setRootHtmlLifted: setRootHtmlLifted, wire: wire, root: root, run: run, renderError: renderError, renderEmpty: renderEmpty };
  boot();
})();
