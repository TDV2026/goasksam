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
  // Identity question (Round 4 Job 3, Lane A render job): the dimension + real per-side counts the
  // engine gave on a BLOCKING identity question, kept alive after the user picks a side (unlike
  // obLastD, which the next render overwrites) so Narrow it down can still offer the OTHER side as
  // a chip - rule 2, nothing is a one-way door. Reset only on a genuinely fresh search (run()/
  // mcApplyFromUrl()), never on a chip-driven re-query, so it survives exactly as long as the car
  // being looked at does.
  var obIdQContext = null;
  // Item 9 ("Put Sam on it"), Oct 2026: whether /api/watch is set up at all (no watch control while
  // false, same gate Buy's own page uses); checked once at boot, read by samOnItHtml at render time.
  var OB_WATCH_READY = false;
  obFetch(API_ORIGIN + "/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ready" }) })
    .then(function (r) { return r.json(); }).then(function (j) { OB_WATCH_READY = !!(j && j.ready); }).catch(function () {});
  var obWatchArmed = null;   // the current result's own watch, once armed this session: {id, kind, label, ...}
  var obWatchFirst = false;  // this account's very first watch (show "Free. No card, no plan.")
  // Rejected model chips (Oct 2026, Market Check card rejected-chip job): the SAME algorithm
  // js/chat-core.js noteRejectedModel/dropRejectedChips already uses on live /sell - reused here,
  // not reinvented, because New Sell (api/sellNext.js) only loads this file, never chat-core.js, so
  // there is no shared sellState to read. When the engine answers invalid_vehicle (a picked model
  // did not exist for that year/make), that model never comes back as a model_choice chip for the
  // same year+make in this conversation. Filter only; the engine's own chip list is never added to.
  var obRejectedModels = {};
  function obRejKey(year, make) { return [year || "", String(make || "").toLowerCase()].join("|"); }
  function obChipNorm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function obNoteRejectedModel(vehicle) {
    if (!vehicle || !vehicle.make || !vehicle.model) return;
    var k = obRejKey(vehicle.year, vehicle.make), list = obRejectedModels[k] = obRejectedModels[k] || [];
    var n = obChipNorm(vehicle.model);
    if (n && list.indexOf(n) < 0) list.push(n);
  }
  function obDropRejectedChips(year, make, opts) {
    var list = obRejectedModels[obRejKey(year, make)] || [];
    return list.length ? (opts || []).filter(function (o) { return list.indexOf(obChipNorm(o)) < 0; }) : opts;
  }
  // The answered refinement(s) behind the current view. ACCUMULATES (Oct 2026, phone review bug):
  // each earned-question chip used to REPLACE this whole object, so answering a second question
  // (e.g. gearbox, after mileage) silently dropped the first answer and the engine, seeing no
  // miMin anymore, offered the mileage question again - a loop. The engine's own refine filter
  // already stacks every key it is given in one pass (lib/onebox.js, the refined block); mergeRefine
  // below is the client-side fix: every chip merges INTO the existing answers instead of replacing
  // them. Per-dimension label keys (miLabel/txLabel/variantLabel/driverLabel) so the eyebrow can
  // name every answered question, not just the newest one.
  var obLastRefine = null;
  // Item 2 (Sam's review round, Oct 14 2026): the engine only sends bodyOptions/trimQuestion on the
  // UNREFINED answer (null once a body/trim refine is applied), so the identity line has nothing to
  // draw from once a choice is made. These hold the LAST unrefined set (options + the unrefined
  // soldCount, for "Any") so the line - chosen option, every other option, "Any (N)" - survives the
  // refine. Updated only when the engine actually sends fresh options (a refined answer's null
  // bodyOptions/trimQuestion never overwrites what is already stored); reset alongside obLastRefine
  // at every new-search point.
  var obIdOrigBody = null, obIdOrigTrim = null;
  // Job 7 (round two): d.variantOptionsLine (Lane B, e47) - an array of independent variant-market
  // entries (e.g. "carrera" four-cam vs pushrod, "restoration" professional-restoration vs
  // unrestored), each with both sides' own counts, zero allowed. Same survive-the-refine pattern as
  // obIdOrigBody/obIdOrigTrim above (never overwritten by a null/absent variantOptionsLine once a
  // refine lands).
  var obIdOrigVariantLines = null;
  // Typo-confirmation "Not sure" fallback (Sam's review round): the clarification's own baseVehicle
  // text (e.g. "1986 Porsche"), so a reader who cannot pick between the suggested car and the
  // alternates still gets a real answer, never a dead end - set only while a typo confirmation
  // screen is on, read only by its own "Not sure" chip.
  var obTypoBase = null;
  // Search box placeholder (Part 2, result-hero job, Oct 2026): one of these four per PAGE LOAD
  // (not a mid-session ticker - the old startPlaceholderRotation()/phTimer cycling was dead code,
  // never called), prefixed "Try". Lane B confirmed each of these answers on the exact rung with a
  // real range - do not add another example here without the same confirmation. Rotates across
  // loads via a persisted round-robin counter (localStorage), so a visitor who reloads a few times
  // sees all four in turn rather than the same one forever.
  var TRY_PLACEHOLDERS = [
    "Try 2025 Porsche 911 Carrera S, 8,500 miles",
    "Try 2004 BMW M3 Coupe, manual",
    "Try 2019 Chevrolet Corvette Z06",
    "Try 2017 Ford Mustang GT350"
  ];
  function nextTryPlaceholder() {
    var key = "gas_ob_ph_idx", idx = 0;
    try { idx = (parseInt(localStorage.getItem(key), 10) || 0) % TRY_PLACEHOLDERS.length; } catch (e) {}
    try { localStorage.setItem(key, String((idx + 1) % TRY_PLACEHOLDERS.length)); } catch (e) {}
    return TRY_PLACEHOLDERS[idx];
  }
  var OB_PLACEHOLDER = nextTryPlaceholder();
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
  // Item 2 (Sam's review round): the engine never writes an applied body/trim refine back onto
  // resolvedCar (bodyStyle/trim stay null/"" post-refine), so the heading doesn't pick it up on its
  // own. Appends the chosen option's own label (obLastRefine.bodyLabel/trimLabel, the exact text the
  // engine's own options array gave for that choice) when it isn't already part of the name.
  function appendChosenLabel(base) {
    var lbl = obLastRefine && (obLastRefine.bodyLabel || obLastRefine.trimLabel);
    if (!lbl) return base;
    if (String(base).toLowerCase().indexOf(String(lbl).toLowerCase()) >= 0) return base;
    return base + " " + lbl;
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
    // mc-bar (Oct 2026, desktop width fix): Market Check only, never New Sell (SELL is truthy there) -
    // this is the SAME .inbox/js/onebox.js markup both surfaces share, so the narrower desktop width
    // is scoped to this one extra class rather than touching .inbox itself (which would also narrow
    // New Sell's bar).
    // Magnifier icon (mockup match round, Oct 2026): Market Check's own search bar only (SELL
    // false) - matches the approved mockup's header search box, never added to New Sell's bar.
    var magnifier = SELL ? "" : '<svg class="inbox-mag" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="14" y1="14" x2="18.5" y2="18.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    return '<div class="inbox' + (SELL ? '' : ' mc-bar') + '" role="search">' + magnifier + '<label class="sr" for="ob-input">Search a car</label><input id="ob-input" autocomplete="off" ' + (value ? 'value="' + esc(value) + '"' : 'placeholder="' + esc(placeholder || OB_PLACEHOLDER) + '"') + '>' +
      '<button type="button" class="go" id="ob-go" aria-label="Search"' + (SELL ? '' : ' data-gas-event="market_check_open"') + '>&#8594;</button></div>';
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
    return '<div class="trustline foot"><span class="dot" aria-hidden="true"></span><span>Real sales only.</span></div>';
  }
  // samTakeHtml removed: the "Got it, I'm looking at comparable sales for your ..." interstitial is
  // gone (replaced by the narrated loader, item 3) and carried ownership language (item 6).
  // whyNoteHtml removed (Lane A, Job 4): the bottom "Why it looks like this" block repeated the
  // "How Sam decided" disclosure already inside the card and the How Sam decides link already in
  // the nav rail (lib/appShell.js). Zero other callers; .whynote carried no CSS rule.
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
  // LIVE RIGHT NOW summary sentence (Job 3 / addendum item 5, result-page-polish round two). Shapes,
  // built purely from each live row's own placingFor judgement (below/inside/above the SAME range the
  // headline shows) and the count - never a hardcoded template for a specific count:
  //   one car:          "One comparable car is live, bidding above the range."
  //   N cars, one side:  "Two comparable cars are live. Both are bidding inside the range."
  //                      "Nine comparable cars are live. All nine are bidding inside the range."
  //   N cars, mixed:     "Three comparable cars are live. Two are bidding inside the range, one below it."
  // No placing at all (no band to judge against) falls back to the bare count sentence.
  function placingCounts(rows) {
    var out = { inside: 0, below: 0, above: 0 };
    (rows || []).forEach(function (r) {
      if (r.placing === "inside the range") out.inside++;
      else if (r.placing === "below the range") out.below++;
      else if (r.placing === "above the range") out.above++;
    });
    return out;
  }
  function liveSummarySentence(count, rows) {
    var p = placingCounts(rows);
    var sides = [];
    if (p.inside) sides.push({ n: p.inside, full: "bidding inside the range", short: "inside it" });
    if (p.below) sides.push({ n: p.below, full: "bidding below the range", short: "below it" });
    if (p.above) sides.push({ n: p.above, full: "bidding above the range", short: "above it" });
    if (count === 1) {
      return "One comparable car is live" + (sides.length ? ", " + sides[0].full : "") + ".";
    }
    var headline = obNumWord(count) + " comparable cars are live.";
    if (!sides.length) return headline;
    if (sides.length === 1) {
      var subj = count === 2 ? "Both" : "All " + obNumWordLow(count);
      return headline + " " + subj + " are " + sides[0].full + ".";
    }
    var out = sides.map(function (s, i) {
      return i === 0 ? (obNumWord(s.n) + " " + (s.n === 1 ? "is" : "are") + " " + s.full) : (obNumWordLow(s.n) + " " + s.short);
    });
    return headline + " " + out.join(", ") + ".";
  }
  // Status text from the engine's own placing field ("inside the range"/"below the range"/"above
  // the range", lib/live/search.js placingFor) - "Within the range" (not "Inside") to match the
  // approved mockup's own VS. RANGE wording. The mockup also shows a small coloured dot ahead of
  // this text (green for within, amber for above) - a DIFFERENT, older product rule (Job 8) banned
  // a coloured position pill on the comp-CARD badge, a different component; the mockup wins here,
  // per this round's explicit instruction. No "below" example exists in the mockup; given a muted,
  // non-primary grey for that third state rather than guess at an unreferenced colour.
  function placingPillText(placing) {
    if (placing === "inside the range") return "Within the range";
    if (placing === "below the range") return "Below the range";
    if (placing === "above the range") return "Above the range";
    return "";
  }
  function placingDotClass(placing) {
    if (placing === "inside the range") return "lp-dot-within";
    if (placing === "above the range") return "lp-dot-above";
    if (placing === "below the range") return "lp-dot-below";
    return "";
  }
  // bidTimePT mirrors lib/tasks/bidTime.js's own helper verbatim (same TZ, same wording) - this
  // script has no module system (plain <script>, no bundler), the same reason api/history.js's own
  // BID_AGE_JS already duplicates its small formatting helpers inline rather than importing them
  // into a browser context that cannot resolve ES module imports.
  function bidTimePT(at) {
    var d = new Date(at), tz = "America/Los_Angeles";
    var dayPT = function (x) { return x.toLocaleDateString("en-US", { timeZone: tz }); };
    var time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(" AM", "am").replace(" PM", "pm");
    return time + " PT" + (dayPT(d) === dayPT(new Date()) ? "" : " on " + d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }));
  }
  // LIVE RIGHT NOW (Market Check result-page spec, Oct 2026): a plain table - CAR / VENUE / LAST BID
  // WE SAW / VS. RANGE. "The existing rule stays" (the brief's own words): no amount is ever shown
  // without an honest basis - a fixed price reads "Asking $X", a real bid reads "Current bid $X"
  // with its own "at HH:MMam PT" time underneath when the engine gave one, and nothing at all reads
  // "No bids yet" - exactly today's fallback tree, just laid out as two lines (amount, then time)
  // instead of one sentence. Job 4 (Oct 2026): api/buySearch.js panel=1 rows now carry `miles` (a
  // whole number, or null when the listing has none usable) - l.miles.
  function loadLivePanel(d, m) {
    var slot = document.getElementById("ob-live"); var rc = d && d.resolvedCar;
    if (!slot || !rc || !rc.make || !rc.model) return;
    // Item 5 (placing, Oct 2026): the headline's own typical band (d.cluster), when this result has
    // one, so the server can judge each live figure against the SAME range shown on the page - never
    // a second band. No cluster (thin/span-only tiers) -> no lo/hi -> the server returns no placing.
    var band = Array.isArray(d.cluster) && d.cluster.length === 2 ? d.cluster : null;
    var qs = "panel=1&make=" + encodeURIComponent(rc.make) + "&model=" + encodeURIComponent(rc.model) +
      (rc.trim ? "&trim=" + encodeURIComponent(rc.trim) : "") + (rc.year ? "&year=" + encodeURIComponent(rc.year) : "") + (rc.bodyStyle ? "&body=" + encodeURIComponent(rc.bodyStyle) : "") +
      (band ? "&lo=" + Math.round(band[0]) + "&hi=" + Math.round(band[1]) : "");
    fetch(API_ORIGIN + "/api/buySearch?" + qs).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !(j.count > 0) || !j.rows || !j.rows.length || !document.body.contains(slot)) return;
      var rows = j.rows.map(function (l) {
        var amt = l.current_bid_usd ? usd(l.current_bid_usd) : (l.current_bid ? Math.round(l.current_bid).toLocaleString("en-US") + " " + l.currency : "");
        var amountText = l.fixedPriceUsd ? "Asking " + usd(l.fixedPriceUsd) : (amt ? "Current bid " + amt : "No bids yet");
        var timeText = (!l.fixedPriceUsd && amt && l.bid_at) ? ("at " + bidTimePT(l.bid_at)) : "";
        var vsrange = placingPillText(l.placing);
        var vsrangeDot = placingDotClass(l.placing);
        var photo = l.photo_url ? '<img src="' + esc(l.photo_url) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">' : "";
        var href = utmUrl(l.url);
        var milesText = (l.miles != null && Number(l.miles) > 0) ? Number(l.miles).toLocaleString("en-US") + " miles" : "";
        // Round 6 Job 1 (tracking fix, carried forward): data-gas-source carries the platform SLUG
        // (l.source_slug), never l.source (the display name used in the VENUE cell).
        var gasAttrs = ' data-gas-event="auction_clickout" data-gas-source="' + esc(l.source_slug || "") + '" data-gas-listing-id="' + esc(l.id != null ? l.id : "") + '"';
        return "<tr><td><span class=\"lp-car\"><span class=\"lp-ph" + (l.photo_url ? "" : " noimg") + "\">" + photo + '<span class="none">No photo</span></span>' +
          '<span class="lp-cbody"><a class="lp-title" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"' + gasAttrs + ">" + esc(cleanReceiptTitle(l.title)) + "</a>" +
          (milesText ? ('<span class="lp-miles">' + esc(milesText) + "</span>") : "") + "</span></span></td>" +
          '<td><span class="lp-venue">' + esc(l.source || "") + '</span><span class="lp-ends">' + esc(endsShort(l.end_time)) + "</span></td>" +
          '<td class="lp-bid"><b>' + esc(amountText) + "</b>" + (timeText ? ('<span class="lp-bidtime">' + esc(timeText) + "</span>") : "") + "</td>" +
          '<td class="lp-vsrange">' + (vsrangeDot ? ('<span class="lp-dot ' + vsrangeDot + '"></span>') : "") + esc(vsrange) + "</td></tr>";
      }).join("");
      var q = (m && m.displayName) || carLabel(rc);
      // The live scope (Market Check result-page spec): the engine's own live sentence plus the SAME
      // matched years the hero's scope line already carries (yearsClauseOf, off d.rungLabel) - never
      // a second, independently-computed scope.
      var years = yearsClauseOf(d);
      var summary = liveSummarySentence(j.count, j.rows);
      var scopeSentence = years ? (summary + " " + cap(years) + ".") : summary;
      var seeAll = j.count === 1 ? "See it live" : "See all " + obNumWordLow(j.count) + " live";
      slot.className = "livepanel";
      slot.innerHTML = '<div class="sec-head"><div><h2>Live right now</h2></div></div>' +
        '<p class="lp-summary">' + lint(esc(scopeSentence), "live.summary") + "</p>" +
        '<table class="lptable"><thead><tr><th class="colhead">Car</th><th class="colhead">Venue</th><th class="colhead">Last bid seen</th><th class="colhead">Vs. range</th></tr></thead><tbody>' + rows + "</tbody></table>" +
        '<a class="linkbtn" href="/buy?q=' + encodeURIComponent(q) + '">' + esc(seeAll) + " &#8594;</a>";
      slot.hidden = false;
    }).catch(function () {});
  }
  // READY TO SELL: a real link into /sell carrying the resolved car + every answered question as URL
  // parameters (sellHref). Ownership-neutral (rule 20): an offer, not an assertion. Rule 15/first-
  // person fix (Oct 2026) bans first-person Sam ("I can tell you") on Market Check, not the name
  // itself - third person ("Sam would sell it") is allowed and reads like a person again, unlike the
  // content-free "Start here" that briefly replaced it.
  function sellHtml() {
    return '<section class="sellbox" data-stage="note"><div class="st"><h2>Ready to sell?</h2><p>See where cars like this have sold and when.</p></div>' +
      '<a id="ob-sell" href="' + esc(sellHref()) + '">See where Sam would sell it &#8594;</a></section>';
  }
  // ---------------------------------------------------------------- state renderers
  function renderEmpty() {
    if (SELL && SELL.homeHtml) { root.innerHTML = SELL.homeHtml(inboxHtml); wire(); syncRailResults(); return; }
    // Screen 1 (empty state): reached on boot only when the server did NOT already render the rich
    // landing (lib/live/marketCheckLanding.js - see boot()'s early exit below), and on "Change" from
    // an active result. Headline/sub stay fixed (Oct 2026 landing redesign, Sam), matching the
    // landing's hero exactly. Placeholder now rotates (Part 2, result-hero job, Oct 2026) - lib/** is
    // out of scope this round, so the server-rendered first paint (marketCheckLanding.js) still shows
    // its own fixed "Your car or its VIN"; this client-rendered fallback (and any "Change" return) is
    // the surface this round actually owns. The landing's proof row, "What you get" and example band
    // are landing-only (server-rendered, removed once a search runs, same as /buy's #lead); this
    // simple fallback never tries to reproduce them.
    root.innerHTML =
      '<div class="ob-home">' +
        '<h1 class="ob-head">What do cars like yours sell for?</h1>' +
        '<p class="ob-sub">Real sales, matched to your car, with the range most landed in and the cars behind it.</p>' +
        inboxHtml("", OB_PLACEHOLDER) +
      "</div>";
    wire();
    syncRailResults();
  }
  // ---------------------------------------------------------------- round-3 result render
  // The locked /onebox-preview (Screen 2) design, driven ENTIRELY by the engine's structured
  // facts (span/cluster/recency/basis/platforms/cards/refusal). Prose is composed here with
  // styled number spans; the engine never sends prose numbers. Matches the design of record.
  function r3money(n) { return '<span class="num">' + usd(n) + "</span>"; }
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
  // The engine's own windowWords (lib/onebox.js windowFactsFor, e34): "in the last twelve months"
  // or "since {Month YYYY}" - a complete phrase, already carrying its own leading word. No page-side
  // fallback wording; a call site with no windowWords prints nothing rather than guess.
  function windowText(d) { return (d && d.windowWords) || ""; }
  function priceRange(a) { return r3money(a[0]) + " to " + r3money(a[1]); }
  function monthOnly(dstr) { var p = String(dstr || "").slice(0, 10).split("-"); var M = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return p.length >= 2 ? (M[+p[1]] || "") : ""; }
  // bodyOptionsHtml / trimQuestionHtml / gearboxEarnedHtml / driverEarnedHtml / the old
  // mileageFieldHtml / observeHtml / observeAsideHtml (earned-question cards that used to live in
  // "Narrow it down") were deleted in the hero-rebuild round (Oct 2026) along with that whole block
  // - see narrowItDownHtml's removal note further down. The mileage field and the trim question each
  // got a direct replacement inside the new hero (heroMileageLineHtml, heroIdentityLineHtml); body,
  // gearbox, driver and observe have no new home on this surface this round.
  function receiptCardHtml(c, tagAside) {
    var img = c.image ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" onerror="this.style.display=\'none\';var p=this.parentNode.querySelector(\'.rplate\');if(p)p.style.display=\'flex\'">' : "";
    var aside = (tagAside && c.hollow) ? '<span class="aside">set aside</span>' : "";
    var ext = '<span class="ext"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></span>';
    var inner = '<div class="rph">' + img + ext + aside + '<div class="rplate"><div class="n">' + esc(titleCaseSaleTitle(c.title)) + '</div><div class="s">photo unavailable</div></div></div>' +
      '<div class="rb"><div class="rprice num">' + esc(usd(c.price)) + "</div>" +
      '<div class="rmeta"><span class="num">' + esc(c.mileageText) + '</span><span class="dot">&middot;</span>' + esc(c.platform) + "</div>" +
      '<div class="rdate">' + esc(c.month) + "</div><div class=\"rtitle\">" + esc(titleCaseSaleTitle(c.title)) + "</div></div>";
    var href = utmUrl(c.url);
    return href ? '<a class="rcard" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-cardclick="' + esc(c.platformSlug || "") + '">' + inner + "</a>" : '<div class="rcard">' + inner + "</div>";
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
  // Round 6 Job 2 (Oct 2026): also guards a HYPHENATED name ("Mercedes-Benz" -> "Mercedes-Benzs",
  // the reported production bug) - a hyphen is the mark of a compound proper noun (a marque or a
  // chassis code), which reads as a typo the same way, and this helper can be reached with a bare
  // make-only name (bareNameOf's carLabel fallback, called from thinHeadHtml) whenever a car
  // resolves to make level with no model yet.
  function carNamePlural(name) {
    var n = String(name == null ? "" : name).trim();
    if (!n) return "";
    // Also guards a name already ending in a (lowercase) "s" ("Lotus" -> "Lotuss" is the same typo.
    return (/[A-Z0-9]$/.test(n) || /s$/i.test(n) || /-/.test(n)) ? n + " models" : n + "s";
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
    // Body style question (Oct 2026): once answered this session (obLastRefine.body), the chosen
    // body drives the noun exactly as a query-given bodyStyle already does ("997 Carrera S
    // Coupes"); until then the label stays the plain plural ("997 Carrera S models").
    var chosenBody = (obLastRefine && obLastRefine.body) || v.bodyStyle;
    var bw = chosenBody ? BODY_PLURAL[String(chosenBody).toLowerCase()] : "";
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
  // Result-hero job (Oct 2026): the eyebrow over the whole zone is the car exactly AS TYPED (or the
  // VIN, typed the same way) - zero resolution, zero engine involvement, so it can never be wrong and
  // never changes when a refinement chip re-queries the SAME search. lastQuery already holds this
  // (set once per run(), untouched by runPool's inline refinements). CSS (.eyebrow) does the actual
  // upper-casing; the string itself stays mixed-case, same house rule as every other eyebrow here.
  function typedEyebrowHtml() {
    var text = String(lastQuery || "").trim();
    return text ? '<p class="eyebrow typed-eyebrow">' + esc(text) + "</p>" : "";
  }
  // Sam's Take states a pattern as a plain ratio ("7 in 10 manual") - this round's copy rule wants
  // that read in words ("seven in ten manual") on this card specifically. The sentence itself is the
  // engine's own composed text (lib/onebox.js stPlainClause, off limits this round); this only
  // reformats the digits already in it, the same class of fix as Round 7's obNumWord - no number is
  // computed or changed, only how an already-decided number prints.
  var RATIO_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function wordifyRatios(s) {
    return String(s || "").replace(/\b(\d{1,2}) in 10\b/g, function (_, n) {
      var i = Number(n);
      return (RATIO_WORD[i] || n) + " in ten";
    });
  }
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
    // Market Check engine additions, item 1 (Oct 2026): the sold count as a market fact, phrased as
    // the market, not us - "42 sold in the last twelve months", never "based on". d.soldCount is the
    // engine's own word-or-number (countWord); printed exactly as it comes back, no reformatting.
    // windowText(d) is the engine's own windowWords, a complete phrase ("in the last twelve
    // months") - "sold" + windowWords directly, no page-side "in" (would double up with it).
    parts.push((d.soldCount != null ? d.soldCount + " " : "") + "sold " + windowText(d));
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
  // ================= HERO REBUILD (Oct 2026, hero-rebuild round) =================
  // Replaces the old evidenceBlockHtml (one boxed "anscard" with eyebrow/range/Sam's Take/Narrow it
  // down folded inside it) with the approved two-column hero: label, car name, one grey scope+count
  // +latest line, the range (or the rule-24 no-band fallback), the mileage field, and the trim
  // identity line on the left; one real receipt on the right. Sam's Take and the whole "Narrow it
  // down" block (body/gearbox/driver/observe/trim-chip/reconfirm questions, the removable-answer
  // chips) are gone - not part of the approved design's enumerated hero, and not given a new home
  // this round. Flagged plainly in the round report, not silently dropped.
  //
  // heroReceipt / contextRoles (dormant): Lane B has not yet added either field to the engine answer
  // (grepped lib/onebox.js - absent). Every reader below prefers d.heroReceipt / d.contextRoles and
  // falls back to the existing d.representative trio the moment they exist, no code change needed.
  //
  // poolSize (dormant on the wire): mapEngineAnswer computes poolSize/low/high/yearWidened but
  // api/sellerDecision.js only copies answerType/identityQuestion/factsBlock/reasonFlag/fallbackRung/
  // rungLabel/siblingName/queryMileage onto the client-facing object (grepped) - poolSize itself
  // never reaches the page. heroPoolSizeNum derives the same number honestly from fields that ARE
  // already on the wire (d.poolN, d.soldCount, d.factsBlock.count) rather than waiting on it; see the
  // FOR LANE B note in docs/lane-notes.md.
  function heroPoolSizeNum(d) {
    if (!d) return null;
    if (Number.isFinite(d.poolSize)) return d.poolSize;
    if (Number.isFinite(Number(d.poolN))) return Number(d.poolN);
    if (d.factsBlock && Number.isFinite(d.factsBlock.count)) return d.factsBlock.count;
    if (d.soldCount != null) { var v = digitOf(d.soldCount); return Number.isFinite(v) ? v : null; }
    return null;
  }
  // A small, non-interactive info marker (native title-attribute tooltip) beside "WHERE THE MIDDLE
  // HALF SOLD". The brief calls this "the existing info dot"; grepped public/js/onebox.js and
  // public/onebox.html for info-dot/tooltip markup (info.dot, data-info, title-tip, aria-label="Info)
  // and found none - nothing like it exists yet anywhere on this page. Built fresh, minimal (no new
  // JS, a native title attribute only), rather than blocking on the brief's "existing" framing.
  function infoDotHtml() {
    var t = "The middle half of comparable sales, closest to typical, with the highest and lowest set aside.";
    return ' <span class="infodot" tabindex="0" title="' + esc(t) + '" aria-label="' + esc(t) + '"></span>';
  }
  // bodyMixTailOf: reads back the engine's own body-mix clause (lib/onebox.js bodyMixSuffix, e.g.
  // ", coupes and cabriolets") already appended to the end of rungLabel - never computed here, only
  // isolated so the exact-rung scope line can show the body alone instead of repeating the car's
  // name (already the heading just above it).
  var BODY_MIX_WORDS = "coupes|cabriolets|convertibles|roadsters|targas|sedans|saloons|wagons|spiders|spyders|hardtops";
  var BODY_MIX_TAIL_RE = new RegExp(",\\s*((?:" + BODY_MIX_WORDS + ")(?:,?\\s*(?:and\\s+)?(?:" + BODY_MIX_WORDS + "))*)$", "i");
  function bodyMixTailOf(label) {
    var mm = BODY_MIX_TAIL_RE.exec(String(label || ""));
    return mm ? mm[1] : "";
  }
  // variantTailOf (job 1, Sam's review round, Oct 2026): the same read-back, for the engine's own
  // variant-market clause (lib/onebox.js variantSuffix, e40 - ", pushrod cars", ", pushrod cars (2
  // Carrera four-cam set aside)" or ", Touring and Lightweight cars mixed") - a car split by MARKET
  // rather than body (1957 356 Speedster: Pushrod vs Carrera four-cam). Open word list (unlike
  // BODY_MIX_WORDS' fixed set), so matched structurally: the trailing comma-clause ending in "cars",
  // "cars (...)" or "cars mixed".
  var VARIANT_TAIL_RE = /,\s*([^,]+?\s+cars(?:\s*\([^)]*\)|\s+mixed)?)\s*$/i;
  function variantTailOf(label) {
    var mm = VARIANT_TAIL_RE.exec(String(label || ""));
    return mm ? mm[1] : "";
  }
  // rungLabelYearSpan (found live, Sam's review: the scope line dropped the years on widened thin-
  // tier answers - 275 GTB read "Road cars" with no "1965 to 1967"). d.poolYears is only ever set on
  // the engine's PRE-widening candidate pool (lib/onebox.js `base`), which is empty on exactly the
  // cars that land on the thin tier - that absence is WHY they widened. The widened span is never
  // lost, though: thinLabel (lib/onebox.js) always builds d.rungLabel as "{nameplate}, {Y1} to {Y2}"
  // (or a bare "{Y1} {nameplate}" when the rung never widened past one year), so this reads the SAME
  // engine text bodyMixTailOf/variantTailOf already read back, never a second-sourced or computed
  // year. A "(997 generation)"-style label has no literal year in it and returns null here - the
  // generation code is printed as part of the body/variant text already; inventing years for it
  // would be a guess, not a read-back.
  var YEAR_SPAN_RE = /\b(\d{4})\s+to\s+(\d{4})\b/;
  var YEAR_SINGLE_RE = /\b(\d{4})\b/;
  function rungLabelYearSpan(label) {
    var s = String(label || "");
    var span = YEAR_SPAN_RE.exec(s);
    if (span) return [Number(span[1]), Number(span[2])];
    var one = YEAR_SINGLE_RE.exec(s);
    if (one) { var y = Number(one[1]); return [y, y]; }
    return null;
  }
  // The scope segment of the hero's one grey line. Prints d.rungLabel verbatim (never "Matched to
  // ..."), EXCEPT on a genuinely exact, nothing-widened rung (d.fallbackRung === "exact"): there the
  // car's own name already carries the year+nameplate (the heading just above), so repeating the
  // whole rungLabel would just restate it - the one new fact worth a line is which body(ies) the
  // pool covers, read straight off the resolved car's own bodyStyle or the engine's own body-mix
  // clause. Nothing invented when neither is present.
  function heroScopeText(d) {
    if (!d) return "";
    if (d.fallbackRung === "sibling") return (siblingLeadHtml(d) + String(d.rungLabel || "")).trim();
    if (!d.rungLabel) return "";
    if (d.fallbackRung === "exact") {
      var rc = d.resolvedCar || {};
      if (rc.bodyStyle) return cap(String(rc.bodyStyle));
      var tail = bodyMixTailOf(d.rungLabel);
      if (tail) return cap(tail);
      var vtail = variantTailOf(d.rungLabel);
      return vtail ? cap(vtail) : "";
    }
    return String(d.rungLabel);
  }
  function heroCountText(d) {
    var count = d && d.soldCount;
    if (count == null) return "";
    var n = Number(count), isNum = Number.isFinite(n);
    var countWord = isNum ? obNumWord(n) : String(count);
    var isOne = isNum ? n === 1 : /^one$/i.test(String(count));
    return countWord + (isOne ? " sale" : " sales") + " " + windowText(d);
  }
  function heroLatestText(d) {
    var p = countLatestPhrase(d);
    return p ? p.replace(/^the latest on\s+/i, "latest ") : "";
  }
  // The all-sales caption's own line: scope, count, latest - joined with middle dots, never
  // "Matched to...". Plain text (no markup), so moreComparableSalesHtml can name the window and
  // scope EXACTLY as before - unchanged by the hero's own line below.
  function heroMetaLineText(d) {
    var parts = [heroScopeText(d), heroCountText(d), heroLatestText(d)].filter(Boolean);
    return parts.length ? cap(parts.join(" · ")) : "";
  }
  // The hero's OWN scope line (item 1, Sam's follow-up round, Oct 2026): bodies, the pool's year
  // span, the count, the latest date - "Coupes, cabriolets and targas, 2004 to 2006 · 39 sales ·
  // latest Oct 7". Deliberately NOT heroMetaLineText any more (that stays for the all-sales caption,
  // which still carries the window via heroCountText/windowText): no model name (the H1 above
  // already carries it), no window clause. Bodies read the same way heroScopeText's "exact" branch
  // already did (resolvedCar.bodyStyle when the pool is one body, else the engine's own body-mix
  // clause lifted off rungLabel, bodyMixTailOf - never invented). Year span is d.poolYears, the
  // engine's own field, never computed here; omitted entirely when the engine gives none, never
  // guessed. Count re-uses heroCountText's own number formatting, just without its window suffix.
  // poolLenOverride (job 1, round two): the labelled-rung "thin" tier carries no top-level
  // d.soldCount at all (confirmed live - undefined on every thin-tier response), so this line went
  // empty there and thinHeroHtml built its own separate count sentence instead - two different
  // scope-line shapes on two tiers (the Speedster had the new line, CLK DTM and 275 GTB still had
  // the old one, repeating "latest" and "too few" twice). Passing the caller's own exact pool length
  // (the same array its tiles are built from) makes this ONE function the scope line for every tier -
  // never d.soldCount directly when an override is given, so the printed count always matches the
  // tiles shown, not a second-sourced engine field that might not even exist on this tier.
  function heroScopeLineText(d, poolLenOverride) {
    if (!d) return "";
    var rc = d.resolvedCar || {};
    var bodies = "";
    if (rc.bodyStyle) {
      var p = BODY_PLURAL[String(rc.bodyStyle).toLowerCase()];
      bodies = cap(p || (String(rc.bodyStyle) + "s"));
    } else {
      var tail = bodyMixTailOf(d.rungLabel);
      if (tail) bodies = cap(tail);
      // Item 2 fallback (Sam's review round): a body refine is active but resolvedCar.bodyStyle was
      // never updated to reflect it (engine gap) and rungLabel's own mix clause collapses once the
      // pool is down to one body (bodyMixSuffix only fires for 2+ families) - so read the chosen
      // body's own label back off obLastRefine, the exact text the engine's own option gave.
      else if (obLastRefine && obLastRefine.bodyLabel) {
        var bp = BODY_PLURAL[String(obLastRefine.bodyLabel).toLowerCase()];
        bodies = cap(bp || (String(obLastRefine.bodyLabel) + "s"));
      }
      // Job 1 fallback (Sam's review round): a car split by MARKET, not body (1957 356 Speedster),
      // has nothing for bodyMixTailOf to match - variantTailOf reads the engine's own variant clause
      // instead (", pushrod cars" etc., lib/onebox.js variantSuffix), same read-back discipline.
      else {
        var vtail = variantTailOf(d.rungLabel);
        if (vtail) bodies = cap(vtail);
      }
    }
    var py = Array.isArray(d.poolYears) && d.poolYears.length === 2 && Number.isFinite(d.poolYears[0]) && Number.isFinite(d.poolYears[1]) ? d.poolYears : rungLabelYearSpan(d.rungLabel);
    var yearSpan = py ? (py[0] === py[1] ? String(py[0]) : (py[0] + " to " + py[1])) : "";
    var bodyYear = bodies && yearSpan ? (bodies + ", " + yearSpan) : (bodies || yearSpan);
    var count = poolLenOverride != null ? poolLenOverride : d.soldCount, countTxt = "";
    if (count != null) {
      var n = Number(count), isNum = Number.isFinite(n);
      var countWord = isNum ? obNumWord(n) : String(count);
      var isOne = isNum ? n === 1 : /^one$/i.test(String(count));
      countTxt = countWord + (isOne ? " sale" : " sales");
    }
    var parts = [bodyYear, countTxt, heroScopeLatestText(d)].filter(Boolean);
    return parts.length ? cap(parts.join(" · ")) : "";
  }
  function heroMetaLine(d, poolLenOverride) {
    var t = heroScopeLineText(d, poolLenOverride);
    // VIN prefix (item 3, mockup match round, Oct 2026): "VIN ending 223093 · ..." leads the HERO's
    // own scope line whenever this search IS a VIN and the engine found that exact car's own
    // sale(s) (d.ownSales - the same signal exactCarSalesHtml reads) - never just because a VIN was
    // typed (no recorded sale means nothing of the car's own to lead with).
    if (obSourceVin && d && d.ownSales) t = "VIN ending " + String(obSourceVin).slice(-6) + (t ? (" · " + t) : "");
    // Item 1 (Sam's follow-up round): never truncate with an ellipsis - this line is already short
    // (no model name, no window clause) and wraps normally if it is ever still too long for one
    // line, rather than clipping.
    return t ? ('<p class="hero-scope" data-stage="answer">' + lint(esc(t), "hero.scope") + "</p>") : "";
  }
  // Mileage line (left column, item 6, Market Check result-page spec): the field is ALWAYS present
  // once rendered - only the sentence above it switches. Not yet narrowed: "Add mileage to narrow
  // the range." Narrowed: "Range narrowed around N miles." plus a small "Change" link that only
  // focuses the (already-visible, still-filled) field - never a rerun/undo (that mechanism,
  // data-rmchip="mi"/refineWithout, is gone with this round: nothing else ever fed it). Submitting
  // the field never leaves the page (see submitMileageInline/dimHeroForRerun in wire()): the range
  // and chart dim in place while the engine reruns, then this line + the range update together.
  // VIN/chassis reconfirm (restored, follow-up round, Oct 2026): a known mileage + sold date from an
  // exact match gets its own question instead of "Add mileage" - "Has the mileage changed? Last
  // reported N miles in Month Year.", the SAME inline field (prefilled with the known mileage), and
  // a quiet sub-line underneath. Checked AFTER the miTarget branch so a VIN reconfirm the visitor has
  // already answered this session correctly shows the normal "Range narrowed around..." state instead
  // of re-asking.
  function milesFieldHtml(val) {
    return ' <span class="miles-inline"><input id="ob-miles" type="number" inputmode="numeric" placeholder="e.g. 5,000" aria-label="Mileage"' + (val > 0 ? ' value="' + val + '"' : "") + ' /><span class="mi-unit">miles</span><button type="button" class="linkbtn mi-go" id="ob-miles-go">Go</button></span>';
  }
  function heroMileageLineHtml(d, m) {
    var rf = obLastRefine || {};
    if (Number(rf.miTarget) > 0) {
      var val = Number(rf.miTarget).toLocaleString("en-US");
      return '<p class="hero-miles on" data-stage="answer">' + lint(esc("Range narrowed around " + val + " miles."), "hero.mi.on") +
        ' <button type="button" class="linkbtn" id="ob-miles-change">Change</button>' + milesFieldHtml(rf.miTarget) + "</p>";
    }
    var mi = m && Number(String(m.mileage == null ? "" : m.mileage).replace(/[^\d]/g, ""));
    if (mi > 0 && m.soldDate) {
      var asOf = monthYear(m.soldDate);
      var q = "Has the mileage changed? Last reported " + mi.toLocaleString("en-US") + " miles" + (asOf ? " in " + asOf : "") + ".";
      return '<p class="hero-miles ask" data-stage="answer">' + lint(esc(q), "hero.mi.rc.q") + milesFieldHtml(mi) + "</p>" +
        '<p class="hero-miles-sub" data-stage="answer">' + lint("If it’s different now, update it and the range reruns around the mileage you give.", "hero.mi.rc.sub") + "</p>";
    }
    var pre = (d && Number.isFinite(d.queryMileage) && d.queryMileage > 0) ? d.queryMileage : null;
    return '<p class="hero-miles ask" data-stage="answer">' + lint("Add mileage to narrow the range.", "hero.mi.ask") + milesFieldHtml(pre) + "</p>";
  }
  // Identity line (left column, item 7): EVERY narrower pool the engine already returns with eight
  // or more sales on each side - not only trim. Three independent sources, each its own grey line
  // under one shared divider, in this order: trim ("Which 911? Carrera S (9) · Carrera T (12)"),
  // body (d.bodyOptions, "Coupe (29) · Cabriolet (13)", no leading question - follow-up round, Oct
  // 2026), gearbox (d.inlineSplits, key "gearbox", "Manual (9) · PDK (21)", also no leading
  // question). Counts are DIGITS THROUGHOUT (Number().toLocaleString, not obNumWordLow) - the "below
  // the sales row" round's own copy rule: a parenthetical count may read as digits even under ten,
  // "so (20) · (10) reads evenly" - a mixed "(nine) · (21)" on the same line was the exact unevenness
  // that rule calls out. Every option an UNQUALIFIED count check (never the engine computing a NEW
  // number -
  // just reading its own n/thin flags): trim and gearbox read the engine's own thin flag (n < the
  // same RANGE_THRESHOLD(8) this whole product uses); bodyOptions carries no thin flag of its own
  // (its only floor is n>=2, a real-split guard, not an eight-sale one), so body is filtered here on
  // the same n>=8 the brief asks for explicitly - a display floor, not a recompute. Variant/
  // documented-history splits are NOT added here: the brief's own two examples are body and gearbox
  // only, and those two read awkwardly as a bare link line ("Has documented history (29)") - left for
  // a future round if Sam wants them. Each category reuses its OWN already-wired click handler
  // ([data-trimopt]/[data-bodyopt]/[data-tx], see wire()), so answering any of them re-scopes the
  // SAME pool inline exactly as the old chip versions did.
  // Identity-line counts as WORDS, not digits (mockup, "Carrera S (six) · Carrera T (twelve)") -
  // Identity-line counts in parentheses are digits (item 5, mockup match round, Oct 2026): "Carrera
  // S (8) · Carrera T (15)", thousands separators from 1,000 per the standing copy rule.
  function idLineNum(n) { return Number(n).toLocaleString("en-US"); }
  // The nameplate for "Which {nameplate}?" (item 2, Sam's follow-up round, Oct 2026): resolvedCar's
  // own canonicalLabel is the engine's clean title-derived name ("2025 Porsche 911", never the
  // chassis code "992" resolvedCar.model carries) - stripping "{year} {make} " off the front and
  // keeping only the first remaining word isolates the nameplate alone, the same way carLabel
  // already prefers canonicalLabel for the car-name heading. Never invented when canonicalLabel is
  // absent or does not start with year+make as expected.
  function nameplateOf(d) {
    var rc = (d && d.resolvedCar) || {};
    var cl = rc.canonicalLabel;
    if (cl && rc.year && rc.make) {
      var prefix = rc.year + " " + rc.make + " ";
      if (String(cl).indexOf(prefix) === 0) return String(cl).slice(prefix.length).split(" ")[0] || "";
    }
    return rc.model || "";
  }
  // Item 2 (Sam's review round, Oct 14 2026): once a trim/body choice is made, the identity line
  // persists instead of vanishing - the chosen option reads as plain ink text (not a link), every
  // other option stays a link, and an "Any (N)" link returns to the unsplit answer. N is the
  // UNREFINED answer's own soldCount (obIdOrigBody/obIdOrigTrim.poolN) - never a sum of the shown
  // options (the engine's own count can exceed that sum, e.g. a car neither chip's share crosses
  // the display floor but is still part of the real total - printing the engine's own number keeps
  // this honest rather than inventing a total from what happens to be shown).
  function heroTrimLineHtml(d) {
    var chosen = obLastRefine && obLastRefine.trim;
    var orig = obIdOrigTrim;
    var q = (d && d.trimQuestion) || (chosen && orig ? { model: orig.model, options: orig.options } : null);
    if (!q || !q.options || !q.options.length) return "";
    var shown = q.options.filter(function (o) { return !o.thin || (chosen && String(o.value) === String(chosen)); });
    if (!chosen && shown.length < 2) return "";
    var items = shown.map(function (o) {
      var isChosen = chosen && String(o.value) === String(chosen);
      var label = esc(o.label) + " (" + idLineNum(digitOf(o.n)) + ")";
      return isChosen ? ('<span class="hero-idlink hero-idlink-chosen">' + label + "</span>")
        : ('<button type="button" class="linkbtn hero-idlink" data-trimopt="' + esc(o.value) + '" data-mlabel="' + esc(o.label) + '">' + label + "</button>");
    });
    if (chosen && orig && Number.isFinite(Number(orig.poolN))) items.push('<button type="button" class="linkbtn hero-idlink" data-trimopt-any="1">Any (' + idLineNum(orig.poolN) + ")</button>");
    return '<p class="hero-idline" data-stage="answer">' + lint("Which " + esc(q.model) + "?", "hero.idq") + " " + items.join(" · ") + "</p>";
  }
  function heroBodyLineHtml(d) {
    var chosen = obLastRefine && obLastRefine.body;
    var orig = obIdOrigBody;
    var opts = (d && d.bodyOptions) || (chosen && orig ? orig.options : []);
    // Found live (Sam's table run, e54): a stale >= 8 floor dropped "Body not stated" on the Mustang
    // (4) and the Camaro (1) - not an unknown-label issue and not a zero-count filter (there was none
    // here before), just this threshold. Sam's decision: every option the engine returns with a real
    // count renders, in the same chip style, no per-option floor - "Body not stated" is an honest
    // bucket, not a choice to be hidden for being small.
    var shown = opts.filter(function (o) { return Number(o.n) > 0 || (chosen && String(o.value) === String(chosen)); });
    if (!chosen && shown.length < 2) return "";
    var items = shown.map(function (o) {
      var isChosen = chosen && String(o.value) === String(chosen);
      var label = esc(o.label) + " (" + idLineNum(o.n) + ")";
      return isChosen ? ('<span class="hero-idlink hero-idlink-chosen">' + label + "</span>")
        : ('<button type="button" class="linkbtn hero-idlink" data-bodyopt="' + esc(o.value) + '" data-mlabel="' + esc(o.label) + '">' + label + "</button>");
    });
    if (chosen && orig && Number.isFinite(Number(orig.poolN))) items.push('<button type="button" class="linkbtn hero-idlink" data-bodyopt-any="1">Any (' + idLineNum(orig.poolN) + ")</button>");
    // "Which {nameplate}?" precedes the options - falls back to options-only when no nameplate is
    // available (never invented).
    var np = nameplateOf(d);
    var lead = np ? (lint("Which " + esc(np) + "?", "hero.idq.body") + " ") : "";
    return '<p class="hero-idline" data-stage="answer">' + lead + items.join(" · ") + "</p>";
  }
  function heroGearboxLineHtml(d) {
    var splits = (d && d.inlineSplits) || [];
    var gb = null;
    for (var i = 0; i < splits.length; i++) { if (splits[i] && splits[i].key === "gearbox") { gb = splits[i]; break; } }
    if (!gb || !gb.sides) return "";
    var shown = gb.sides.filter(function (s) { return !s.thin; });
    if (shown.length < 2) return "";
    var links = shown.map(function (s) {
      var label = String(s.label || "").replace(/s$/, ""); // the engine's own split labels are plural ("Manuals", "PDKs")
      var val = /manual/i.test(label) ? "manual" : "auto";
      return '<button type="button" class="linkbtn hero-idlink" data-tx="' + val + '" data-mlabel="' + esc(label) + '">' + esc(label) + " (" + idLineNum(s.n) + ")</button>";
    }).join(" · ");
    return '<p class="hero-idline" data-stage="answer">' + links + "</p>";
  }
  // Job 7 (round two, Lane B's e47 d.variantOptionsLine); round three (Sam's decision): at most ONE
  // identity line from this field, never two stacked, and never a restoration line at all - the
  // "Unrestored/Professional restoration" entry (key "restoration") is skipped outright, every time,
  // regardless of its counts. A zero-count option is never rendered, even from a stale persisted
  // snapshot (obIdOrigVariantLines) an older answer left behind - filtered out before anything else,
  // so Lane B's own engine change (an option with zero sales is never returned at all, once live)
  // changes nothing here: this was already defensive against exactly that case. An entry left with
  // fewer than two real (non-zero) options after filtering is not a choice - same "needs 2 to be
  // worth asking" rule heroBodyLineHtml already applies - so it is skipped too, and the search moves
  // to the next entry; the first entry that still has a real two-sided choice is the one line
  // rendered, and no others are considered.
  function variantOptionsLineHtml(d) {
    var entries = (d && Array.isArray(d.variantOptionsLine) && d.variantOptionsLine.length) ? d.variantOptionsLine : obIdOrigVariantLines;
    if (!Array.isArray(entries) || !entries.length) return "";
    var np = nameplateOf(d);
    var chosen = obLastRefine && obLastRefine.variant;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || entry.key === "restoration") continue;
      var opts = Array.isArray(entry.options) ? entry.options : [];
      var real = opts.filter(function (o) { var n = digitOf(o.n); return Number.isFinite(n) && n > 0; });
      if (real.length < 2) continue;
      var total = 0, chosenHere = false;
      real.forEach(function (o) { total += digitOf(o.n); if (chosen && String(o.value) === String(chosen)) chosenHere = true; });
      var items = real.map(function (o) {
        var isChosen = chosenHere && String(o.value) === String(chosen);
        var label = esc(o.label) + " (" + idLineNum(digitOf(o.n)) + ")";
        return isChosen ? ('<span class="hero-idlink hero-idlink-chosen">' + label + "</span>")
          : ('<button type="button" class="linkbtn hero-idlink" data-varopt="' + esc(o.value) + '" data-mlabel="' + esc(o.label) + '">' + label + "</button>");
      });
      if (chosenHere) items.push('<button type="button" class="linkbtn hero-idlink" data-varopt-any="1">Any (' + idLineNum(total) + ")</button>");
      var lead = np ? (lint("Which " + esc(np) + "?", "hero.idq.variant") + " ") : "";
      return '<p class="hero-idline" data-stage="answer">' + lead + items.join(" · ") + "</p>";
    }
    return "";
  }
  function heroIdentityLineHtml(d) {
    var lines = heroTrimLineHtml(d) + heroBodyLineHtml(d) + heroGearboxLineHtml(d) + variantOptionsLineHtml(d);
    return lines ? ('<div class="hero-divider"></div>' + lines) : "";
  }
  // ================= HERO CHART (Market Check result-page spec, Oct 2026) =================
  // Right column: "How this market has moved" - candles when the engine answer carries d.trend
  // (3+ quarters, each with low/high/typical/count), else the strip: every sale in the pool as a
  // dot on a lowest-to-highest line, the middle-half band behind it when `band` (d.cluster) is
  // given. Absent entirely when there is nothing to chart - never a placeholder box. d.trend/
  // d.priorYear are Lane B engine fields, dormant as of this round (grepped lib/onebox.js - not
  // present yet): read when present, never computed here. Proven via a hand-built stub (see
  // docs/lane-notes.md) until Lane B ships them live.
  function usdK(n) { var v = Number(n); return Number.isFinite(v) ? ("$" + Math.round(v / 1000) + "K") : ""; }
  function chartTip(parts) { return esc(parts.filter(Boolean).join(" · ")); }
  // Round $ axis step (1/2/5 x a power of ten), targeting ~4 steps across the data's own low-high
  // span - matches the mockup's measured axis exactly ($20K steps over a $70K span = 4 steps, 7
  // gridlines).
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var mult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
    return mult * mag;
  }
  // "2026-Q1" (the engine's own period key) -> "Q1 2026" (the mockup's own label format). Pure
  // string reformatting of a value the engine already gave, never a new fact.
  function qtrLabel(period) {
    var m = /^(\d{4})-Q([1-4])$/.exec(String(period || ""));
    return m ? ("Q" + m[2] + " " + m[1]) : String(period || "");
  }
  // CANDLES (mockup match round, Oct 2026). Every proportion measured directly off the approved
  // final-mockup.jpg (2025 Porsche 911, 941px): the plot area (axis + bars + quarter labels, not
  // the "How this market has moved" heading or the legend, both rendered by the caller) measures
  // about 11:7 (width:height), reproduced here as viewBox 880x560. Four quarter slots, evenly
  // spaced across the FULL plot width (slot = plotWidth / count), each box about 40% of its slot
  // (measured ~38px box in a ~94px slot). Axis headroom (measured): the data's own min/max rounds
  // OUT to the nearest round step, then one MORE full step on each side - this is why the mockup's
  // axis runs $80K to $200K against $102K-$172K data and no box ever touches the top or bottom
  // gridline. High prints just above each box and low just below it (small grey text, matching the
  // mockup, ALWAYS visible) - only the typical figure is hover (desktop) / tap (phone) only, beside
  // the dot, never printed permanently (a deliberate simplification the mockup itself does not
  // make). d.trend.quarters is ALWAYS the last four calendar quarters (lib/onebox.js trendFor,
  // e34): a quarter under eight sales still returns its own low/high/typical flagged thin: true -
  // drawn exactly the same as any other quarter (this function reads no thin flag at all, by
  // design: thin-ness changes nothing about how a quarter is PLOTTED, only that the engine kept it
  // in rather than dropping it). A quarter with zero sales in the window returns
  // low/high/typical/count: null - its slot still gets a label and "0 sales", just no box or dot
  // (nothing to plot). No chart at all when the engine supplies no trend (see heroChartHtml/
  // noChartLineHtml) - trendFor itself withholds the whole field unless at least one of the four
  // clears eight sales.
  function candleChartHtml(d) {
    var trendObj = d && d.trend;
    var all = (trendObj && Array.isArray(trendObj.quarters)) ? trendObj.quarters.filter(Boolean) : [];
    if (!all.length) return "";
    var qs = all.slice(-4);
    var priced = qs.filter(function (q) { return Number.isFinite(Number(q.low)) && Number.isFinite(Number(q.high)); });
    if (!priced.length) return "";
    var dataLo = Math.min.apply(null, priced.map(function (q) { return Number(q.low); }));
    var dataHi = Math.max.apply(null, priced.map(function (q) { return Number(q.high); }));
    if (!(dataHi > dataLo)) return "";
    var step = niceStep((dataHi - dataLo) / 4);
    var axisLo = Math.floor(dataLo / step) * step - step;
    var axisHi = Math.ceil(dataHi / step) * step + step;
    if (!(axisHi > axisLo)) return "";
    var W = 880, H = 560, padL = 60, padR = 20, padB = 44, padT = 44;
    // Item 3 (Sam's follow-up round): box width ~28% of its slot (was 40%, read as too fat against
    // the mockup).
    var plotW = W - padL - padR, slot = plotW / qs.length, barW = slot * 0.28;
    var y = function (v) { return padT + (1 - (v - axisLo) / (axisHi - axisLo)) * (H - padT - padB); };
    var grid = "";
    for (var v = axisLo; v <= axisHi + step * 0.01; v += step) {
      var yy = y(v);
      grid += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="var(--div)" stroke-width="1"/>' +
        '<text class="hc-axislabel" x="' + (padL - 10) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + esc(usdK(v)) + "</text>";
    }
    var bars = "";
    qs.forEach(function (q, i) {
      var cx = padL + slot * i + slot / 2;
      var label = qtrLabel(q.period || q.label), count = digitOf(q.count);
      var hasBox = Number.isFinite(Number(q.low)) && Number.isFinite(Number(q.high));
      var box = "";
      if (hasBox) {
        var ylo = y(Number(q.low)), yhi = y(Number(q.high));
        // Job 2 (round two): high/low in the secondary ink (not the heavier dark ink) at a size that
        // actually reads as 13px - .hc-axislabel/.hc-candlelabel (CSS, onebox.html) compensate for
        // the SVG's own viewBox-to-viewport scale (measured live: ~0.56 at 1440, ~0.41 at 390 - the
        // bare "13" SVG unit this used to carry rendered at under 8px on screen, the "too small and
        // too pale" Sam flagged), so the class carries a different base size per breakpoint instead
        // of one inline attribute that could only ever be right at one width.
        box = '<rect x="' + (cx - barW / 2).toFixed(1) + '" y="' + yhi.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, ylo - yhi).toFixed(1) + '" rx="2" fill="var(--chip)"/>' +
          '<text class="hc-candlelabel" x="' + cx.toFixed(1) + '" y="' + (yhi - 10).toFixed(1) + '" text-anchor="middle">' + esc(usd(q.high)) + "</text>" +
          '<text class="hc-candlelabel" x="' + cx.toFixed(1) + '" y="' + (ylo + 20).toFixed(1) + '" text-anchor="middle">' + esc(usd(q.low)) + "</text>";
        if (Number.isFinite(Number(q.typical))) {
          var typTip = chartTip(["Typical " + usd(q.typical), Number.isFinite(count) ? (obNumWordLow(count) + " sales") : ""]);
          box += '<circle class="hc-bar" tabindex="0" data-tip="' + typTip + '" cx="' + cx.toFixed(1) + '" cy="' + y(Number(q.typical)).toFixed(1) + '" r="6" fill="var(--num)"><title>' + typTip + "</title></circle>";
        }
      }
      bars += '<g>' + box +
        '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 24).toFixed(1) + '" text-anchor="middle" font-size="14" fill="var(--ink)">' + esc(label) + "</text>" +
        "</g>";
    });
    var svg = '<svg class="hc-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Quarterly sale prices">' + grid + bars + "</svg>";
    var legend = '<div class="hc-legend"><span class="hc-legend-sw"><span class="hc-legend-box"></span>Middle half of sales (25th to 75th percentile)</span><span class="hc-legend-sw"><span class="hc-legend-dot"></span>Typical sale (median)</span></div>';
    var py = trendObj && trendObj.priorYear && Number(trendObj.priorYear.high) > 0
      ? ('<p class="hc-prioryear">' + lint(esc("The year before, the middle half was " + usd(trendObj.priorYear.low) + " to " + usd(trendObj.priorYear.high) + "."), "hc.prioryear") + "</p>") : "";
    return svg + legend + py;
  }
  // No candle chart (the engine supplies no trend at all): no chart, no empty panel - the hero goes
  // full width instead (see heroRangeHtml/thinHeroHtml, :only-child CSS in onebox.html) and this one
  // quiet line sits where the chart would have been.
  function noChartLineHtml() {
    return '<p class="hero-noband" data-stage="answer">' + lint(esc("There are too few sales in each quarter to chart how this market has moved."), "hero.nochart") + "</p>";
  }
  function heroChartHtml(d) {
    var inner = candleChartHtml(d);
    if (!inner) return "";
    // The heading stays pinned at the top (hc-body is the ONLY flex:1/centered element) - when the
    // left column (mileage/identity lines) runs longer than the chart's own natural height, the
    // stretched right column (.hero2col's default align-items:stretch) gives the chart's own body
    // the extra room and centers within it, rather than leaving dead space below the legend or
    // sliding the heading itself away from the top.
    return '<div class="hero-chart"><h2>How this market has moved</h2><div class="hc-body">' + inner + "</div></div>";
  }
  // ============ THIN-TILE TREATMENT (Sam's review round, Oct 2026; widened round two) ==========
  // Replaces "too few sales in each quarter to chart" with the mockup's own treatment on any pool
  // that has no quarter trend (candleChartHtml returns nothing): a left-column serif sentence
  // always; a right-column grid, one tile per sale in the pool actually rendered, when that pool
  // holds 1-16 sales (job 3, round two: widened from 3-16 - a one- or two-sale pool now gets tiles
  // too, never the serif line alone). Above 16 this returns null so the caller falls back to
  // noChartLineHtml exactly as before. Shared by heroRangeHtml (result tier) and thinHeroHtml
  // (thin/labelled-rung tier): both already carry a pool array shaped the same way (shapeCards), so
  // one function serves both - the caller passes its OWN pool (d.cards for the result tier, the
  // thin tier's own newestFirst array), never re-derived here, so the tiles and the printed count
  // always match exactly what the rest of that render already shows (poolLen = pool.length, the
  // array actually iterated, never a second-sourced count field). A VIN/chassis page with its own
  // sale history (d.ownSales, exactCarSalesHtml) and any page still carrying an identityQuestion are
  // excluded (null) - both keep today's single-line treatment, unchanged. variant_choice/refusal
  // pages never reach this function at all (separate tiers, separate render paths), so they need no
  // extra gate here.
  // Job 5 (round two): the small label printed ON a set-aside tile - a known reason key reads its
  // established short word; any OTHER reason the engine returns (the brief's "and any other reason
  // the engine returns") reads back exactly as given, first letter capitalised, never invented or
  // guessed at.
  var THIN_ASIDE_TILE_LABEL = { modified: "Modified", project: "Project car", replica: "Replica", "odd sale": "Odd sale", variant: "Different variant", restoration: "Professional restoration", "professional restoration": "Professional restoration" };
  function thinAsideTileLabel(reason) {
    var key = String(reason || "").toLowerCase();
    if (THIN_ASIDE_TILE_LABEL[key]) return THIN_ASIDE_TILE_LABEL[key];
    return reason ? cap(String(reason)) : "";
  }
  // Round four (Sam's review): the trust line no longer states the set-aside count/reasons in prose -
  // the "Set aside, not in the range" block (thinTileTreatment) now carries that fact, with each
  // tile's own reason label, so the sentence would only repeat it.
  function thinTrustLineHtml() {
    return '<p class="thin-trust">' + lint("Hammer prices, premiums taken out. No asking prices, no failed bids. Every tile opens the sale.", "hero.thintiles.trust") + "</p>";
  }
  // Reuses the existing .ph/.noimg/.none photo-box pattern (photoHtml's own CSS, not its fixed "No
  // photo" text) - a missing photo shows the car's own title instead, per the brief; a stock image
  // is never used.
  function thinTilePhotoHtml(image, title) {
    var img = image ? ('<img src="' + esc(image) + '" alt="' + esc(title || "") + '" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">') : "";
    return '<div class="ph' + (image ? "" : " noimg") + '">' + img + '<span class="none">' + esc(title || "") + "</span></div>";
  }
  function thinTileHtml(c, asideLabel) {
    var href = utmUrl(c.url);
    var title = cleanReceiptTitle(c.title);
    var miles = Number(c.mi) > 0 ? (Number(c.mi).toLocaleString("en-US") + " miles") : "";
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    // monShort(c.date), never c.month directly: the thin tier's own pool (thinCardsFrom) builds
    // month with the client's full-month-name monthYear(), while the result tier's d.cards (shapeCards)
    // builds it with the server's three-letter one - monShort reads the shared date field instead, so
    // every tile reads "Mon YYYY" the same way regardless of which tier supplied the pool.
    var mon = monShort(c.date);
    // Job 2 (round three): price, then date, then venue, then miles, each its OWN line - never a
    // middle-dot-joined string (the old single .thin-tile-meta line). A missing piece (no venue, no
    // miles) just drops that line entirely, never a dangling dot or an empty line.
    var metaLines = [mon, venue, miles].filter(Boolean).map(function (t) { return '<p class="thin-tile-meta">' + esc(t) + "</p>"; }).join("");
    var gasAttrs = (href && c.id != null) ? (' data-gas-event="receipt_click" data-gas-source="' + esc(c.platformSlug || "") + '" data-gas-listing-id="' + esc(c.id) + '"') : "";
    var tag = href ? "a" : "div";
    var attrs = href ? (' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-cardclick="' + esc(c.platformSlug || "") + '"' + gasAttrs) : "";
    // Job 5 (round two): a set-aside sale is never hidden, only labelled - the tile is byte-identical
    // otherwise (same photo/price/meta, same link), so it reads as "one of the sales," not a second,
    // different kind of thing.
    var label = asideLabel ? ('<span class="thin-tile-label">' + esc(asideLabel) + "</span>") : "";
    return "<" + tag + ' class="thin-tile' + (asideLabel ? " thin-tile-aside" : "") + '"' + attrs + ">" + thinTilePhotoHtml(c.image, title) + label +
      '<div class="thin-tile-body"><p class="thin-tile-price">' + esc(usd(c.price)) + "</p>" + metaLines +
      "</div></" + tag + ">";
  }
  // asideRows (job 5, round two): the engine's own set-aside cards for THIS pool (d.setAsideRows on
  // the result tier - shapeCards(aside) plus each row's own `reason` key, lib/onebox.js
  // setAsideReasonFor; the labelled-rung "thin" tier has no fence/aside concept at all today, so this
  // is simply absent there - nothing invented, see the FOR LANE B note if Sam expects one on that
  // tier).
  // Round four (Sam's review, too much white space): set-aside sales no longer share the sales grid -
  // they get their OWN labelled block ("Set aside, not in the range," two tiles across at every
  // width), shown only when the engine actually reports some. Layout is chosen by tile count alone:
  // 8 or fewer keeps the two-column hero shell (sales grid in hero-right, the aside block under the
  // "said" sentence in hero-left); 9 to 16 would run the right column three to four rows against a
  // much shorter left column, so the sales grid instead goes full width BELOW the hero (six across at
  // 1440, three across at 390), with the aside block under that grid instead of in hero-left. `right`
  // and `full` are mutually exclusive (whichever the caller does not use is null); `asideBlock` is
  // "" in the wide case (it is already folded into `full` there), so appending it in hero-left is
  // always safe, a no-op when there is nothing to add or when it belongs in `full` instead.
  function thinTileTreatment(d, m, pool, asideRows) {
    if (d && d.identityQuestion) return null;
    if (m && d && d.ownSales && Array.isArray(d.ownSales.sales) && d.ownSales.sales.length) return null;
    var list = Array.isArray(pool) ? pool : [];
    var n = list.length;
    if (!n || n > 16) return null;
    var said = '<p class="hero-noband" data-stage="answer">' + lint(esc(obNumWord(n) + " sales. Too few to show movement, enough to show where they landed."), "hero.thintiles.said") + "</p>";
    var sorted = list.slice().sort(function (a, b) { return Number(b.price) - Number(a.price); });
    var wide = n >= 9;
    var tiles = '<div class="thin-tiles' + (wide ? " thin-tiles-wide" : "") + '">' + sorted.map(function (c) { return thinTileHtml(c, null); }).join("") + "</div>";
    var aside = Array.isArray(asideRows) ? asideRows : [];
    var asideBlock = "";
    if (aside.length) {
      var asideTiles = aside.slice().sort(function (a, b) { return Number(b.price) - Number(a.price); }).map(function (c) { return thinTileHtml(c, thinAsideTileLabel(c.reason)); }).join("");
      asideBlock = '<div class="thin-aside-block" data-stage="answer"><p class="eyebrow thin-aside-eyebrow">' + lint(esc("Set aside, not in the range"), "hero.thintiles.asideeyebrow") + '</p><div class="thin-tiles thin-tiles-aside">' + asideTiles + "</div></div>";
    }
    var eyebrow = '<div class="eyebrow">' + lint(esc("The " + obNumWordLow(n) + " sales"), "hero.thintiles.eyebrow") + "</div>";
    var trust = thinTrustLineHtml();
    if (wide) {
      var full = '<div class="thin-tiles-full" data-stage="answer">' + eyebrow + tiles + trust + asideBlock + "</div>";
      return { said: said, right: null, full: full, asideBlock: "", suppressSalesRow: true };
    }
    var right = eyebrow + tiles + trust;
    return { said: said, right: right, full: null, asideBlock: asideBlock, suppressSalesRow: true };
  }
  // HOVER (desktop) / TAP (phone) TOOLTIPS (mockup match round, Oct 2026): the typical figure is
  // the ONLY chart number never printed permanently - shown beside the dot, matching the mockup's
  // own position, but only on hover or tap (a deliberate simplification the mockup itself does not
  // make; high/low print always). Each dot carries a plain data-tip attribute (native <title> is
  // the desktop-hover/accessibility fallback) read by two bind-once listeners on root (survives
  // every re-render; root itself is never replaced): mouseenter/mouseleave for real desktop hover,
  // and a click toggle for touch (tap to show, tap the same dot again or tap elsewhere to hide).
  var hcTipEl = null, hcTipTarget = null;
  function hcHideTip() { if (hcTipEl) { hcTipEl.remove(); hcTipEl = null; hcTipTarget = null; } }
  function hcShowTip(target, text) {
    hcHideTip();
    var rect = target.getBoundingClientRect();
    var tip = document.createElement("div");
    tip.className = "hc-tooltip";
    tip.textContent = text;
    document.body.appendChild(tip);
    var tr = tip.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - tr.width / 2 + window.scrollX;
    var top = rect.top - tr.height - 8 + window.scrollY;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
    hcTipEl = tip; hcTipTarget = target;
  }
  root.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) {
      e.preventDefault();
      if (hcTipTarget === t) hcHideTip(); else hcShowTip(t, t.getAttribute("data-tip"));
      return;
    }
    hcHideTip();
  });
  root.addEventListener("mouseover", function (e) {
    var t = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t && t !== hcTipTarget) hcShowTip(t, t.getAttribute("data-tip"));
  });
  root.addEventListener("mouseout", function (e) {
    var t = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hcHideTip();
  });
  document.addEventListener("click", function (e) { if (!root.contains(e.target)) hcHideTip(); });
  // RANGE-TIER HERO (task #38, card job Oct 2026). The rule-24 no-band fallback is unchanged in
  // spirit: no cluster means no dollar headline of any kind, ever - enforced now inside the ONE
  // shared card function every product uses (lib/sellsForCard.js sellsForCardHtml, embedded here as
  // window.sellsForCardHtml by api/marketCheck.js before this file loads - STANDING CHECK: the only
  // place a dollar range headline can render from is that shared function, never a second one here).
  function heroRangeHtml(d, m, thinTile) {
    var left = '<p class="eyebrow hero-label">Market Check</p>' +
      '<h1 class="hero-carname">' + esc(m ? (m.displayName || appendChosenLabel(carLabel(d.resolvedCar))) : appendChosenLabel(carLabel(d.resolvedCar))) + "</h1>" +
      heroMetaLine(d);
    // e63 (Sam, Oct 19 2026; Lane C as integrator, Lane A away): ONE list on the spread refusal too. The card carries the
    // engine's line ("Sales too spread out for a range."), the tiles below carry the sales; no sale prints twice.
    left += (window.sellsForCardHtml ? window.sellsForCardHtml(d, { rows: false }) : "");
    if (!d.cluster) {
      var ol = olderOutsideLine(d); if (ol) left += '<p class="hero-noband" data-stage="answer">' + lint(esc(ol), "hero.older") + "</p>";
    }
    left += heroMileageLineHtml(d, m);
    left += heroIdentityLineHtml(d);
    var right = heroChartHtml(d);
    var full = "";
    if (!right) {
      if (thinTile) { left += thinTile.said; left += thinTile.asideBlock; right = thinTile.right; full = thinTile.full || ""; }
      else left += noChartLineHtml();
    }
    return '<section class="hero2col" data-stage="answer"><div class="hero-left">' + left + "</div>" +
      (right ? ('<div class="hero-right">' + right + "</div>") : "") + "</section>" + full;
  }
  // SALES ROW (task #41): "Sales behind this answer" - the same representative trio (d.representative
  // closest/high/low), now as three borderless cards. Prefers d.contextRoles (dormant, not yet sent by
  // Lane B) for the subhead sentence; falls back to the brief's own fallback sentence verbatim.
  function salesRowCardHtml(c, d) {
    if (!c) return "";
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    var month = c.month || monShort(c.date);
    var miles = longMiles(c);
    var href = utmUrl(c.url);
    var gasAttrs = (href && c.id != null) ? (' data-gas-event="receipt_click" data-gas-source="' + esc(c.platformSlug || "") + '" data-gas-listing-id="' + esc(c.id) + '"') : "";
    var tag = href ? "a" : "div";
    var attrs = href ? (' href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-cardclick="' + esc(c.platformSlug || "") + '"' + gasAttrs) : "";
    // Mockup match round, Oct 2026: miles, venue and date each on their own small line (was one
    // middle-dot-joined meta line) - matches the mockup's card layout exactly.
    return "<" + tag + ' class="salescard"' + attrs + ">" +
      photoHtml(c.image, cleanReceiptTitle(c.title), "") +
      '<div class="salescard-body"><p class="salescard-price">' + esc(usd(c.price)) + "</p>" +
      '<p class="salescard-title">' + esc(cleanReceiptTitle(c.title)) + "</p>" +
      (miles ? ('<p class="salescard-meta">' + esc(miles) + "</p>") : "") +
      (venue ? ('<p class="salescard-meta">' + esc(venue) + "</p>") : "") +
      (month ? ('<p class="salescard-meta">' + esc(month) + "</p>") : "") +
      otherHalfLabel(c, d) + offWindowLabel(c, d) +
      "</div></" + tag + ">";
  }
  // THIS CAR'S OWN SALES (Job 2, Sam's follow-up round, Oct 2026): a VIN/chassis match's own
  // history - one row per time it actually SOLD (m.sales, lib/_flags.js findVinArchiveMatch; never
  // the unsold attempts in m.history). Flat: no box, no pill, no badge. Nothing computed here beyond
  // a plain comparison of two numbers the engine already gave (this sale's own price against the
  // SAME cluster/span the headline range already shows) to choose which of three fixed words to
  // print - the same kind of classification asideToggleHtml and the live panel's own VS. RANGE
  // column already do client-side; no new number is produced. Absent entirely when the car has no
  // recorded sale (m.sales empty) or this isn't a matched-car search (m null).
  // ownSales (item 3, mockup match round, Oct 2026): reads d.ownSales (lib/onebox.js ownSalesFor)
  // straight through - every sale row AND the last-sale placing ("inside"/"above"/"below the
  // range") are computed server-side from the same receipts/fences/band the rest of the answer
  // uses, so there is nothing left to compute here beyond string assembly. Replaces the earlier
  // m/vinAnchor-based version (client-computed placing against d.cluster/d.span) now that the
  // engine carries ownSales on every tier that can have it (result, thin, refusal).
  function exactCarSalesHtml(d) {
    var own = d && d.ownSales;
    if (!own || !Array.isArray(own.sales) || !own.sales.length) return "";
    var rows = own.sales.map(function (s) {
      var miles = Number(s.miles) > 0 ? Number(s.miles).toLocaleString("en-US") + " miles" : "";
      var href = utmUrl(s.url);
      return '<div class="exactsale-row"><span class="exactsale-date">' + esc(monShort(s.date)) + '</span>' +
        '<span class="exactsale-price num">' + esc(usd(s.price)) + '</span>' +
        '<span class="exactsale-venue">' + esc(s.venue || "") + '</span>' +
        '<span class="exactsale-miles">' + esc(miles) + '</span>' +
        (href ? ('<a class="linkbtn exactsale-view" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">View sale &#8594;</a>') : "") +
        "</div>";
    }).join("");
    var note = "";
    var last = own.lastSale;
    if (last && Number(last.price) > 0 && last.placing) {
      var sentence = "Its last sale, " + usd(last.price) + " in " + monthOnly(last.date) + ", sits " + last.placing + ".";
      note = '<p class="exactsale-note">' + lint(esc(sentence), "exactsale.note") + "</p>";
    }
    return '<div class="exactsales" data-stage="cards"><h2>This car&#8217;s own sales</h2>' + rows + note + "</div>";
  }
  // d.contextRoles (dormant Lane B field, grepped lib/onebox.js - not present yet) is preferred for
  // both the cards and the subhead sentence; the range tier's own representative trio (closest/high/
  // low - a real, already-shipped editorial selection, not an arbitrary "first three") is the next
  // fallback, since its own semantics are exactly the brief's fallback sentence describes. A tier
  // with neither (thin, below the range threshold) falls back to `fallbackCards` (its caller's own
  // first three, newest-first) with no subhead - the "one from the middle, one at each edge" sentence
  // does not describe a thin pool, and the brief gives no thin-specific alternative.
  // Mockup match round, Oct 2026: on a cluster (ranged) answer, build the subhead sentence FROM the
  // engine's own role labels ("near the middle of the typical range" / "at the lower/upper edge of
  // the typical range") in the mockup's "one X, one Y, and one Z" pattern, instead of the engine's
  // own canned sentence - the mockup's literal words ("one with the lowest mileage") describe a
  // DIFFERENT selection rule than contextRolesFor actually uses (price position, not mileage or
  // date), so this reads the real roles into that same one-line shape rather than printing a
  // mismatched claim. A shared trailing clause ("of the typical range") is kept once, on the last
  // role, instead of repeated three times. Falls back to the engine's own sentence for the no-
  // cluster (thin) case, where the roles ("the lowest sale on record", "a sale between the two")
  // do not read naturally with a "one ..." prefix.
  function contextSentence(d, cr) {
    var roles = (cr && Array.isArray(cr.roles)) ? cr.roles.map(function (r) { return r && r.role; }).filter(Boolean) : [];
    if (d.cluster && roles.length) {
      var texts = roles.slice();
      var tailRe = / of the typical range$/i;
      if (tailRe.test(texts[texts.length - 1])) {
        texts = texts.map(function (t, i) { return (i < texts.length - 1 && tailRe.test(t)) ? t.replace(tailRe, "") : t; });
      }
      var joined = texts.length === 1 ? ("One " + texts[0]) : ("One " + texts.slice(0, -1).join(", one ") + ", and one " + texts[texts.length - 1]);
      return joined + ".";
    }
    return cr && cr.sentence ? String(cr.sentence) : null;
  }
  function salesRowHtml(d, m, fallbackCards) {
    // d.contextRoles is {roles:[{role, sale}], sentence} (Lane B Part 5/6, Oct 2026) - the sale is
    // already shapeCards()-shaped (title/url/image/platform/month/date/price/mi), same shape
    // salesRowCardHtml already reads off d.representative.
    var cr = d.contextRoles;
    var crSales = (cr && Array.isArray(cr.roles)) ? cr.roles.map(function (r) { return r && r.sale; }).filter(Boolean) : [];
    var cards = null, sub = null;
    if (crSales.length) { cards = crSales.slice(0, 3); sub = contextSentence(d, cr); }
    else {
      var rep = d.representative;
      if (rep && rep.closest) { cards = [rep.closest, rep.high, rep.low].filter(Boolean); sub = "One from the middle of the range, one at each edge of the middle half."; }
      else { cards = (fallbackCards || []).slice(0, 3); }
    }
    if (!cards || !cards.length) return "";
    var poolSize = heroPoolSizeNum(d);
    var seeAll = Number.isFinite(poolSize) ? ('<button type="button" class="linkbtn" data-scrollto="more-sales">See all ' + esc(obNumWordLow(poolSize)) + (poolSize === 1 ? " sale" : " sales") + " &#8594;</button>") : "";
    var id = "ob-why" + (++obCapSeq);
    var aside = asideToggleHtml(d, m);
    return '<div class="salesrow" data-stage="cards"><h2>Sales behind this answer</h2>' +
      (sub ? ('<p class="salesrow-sub">' + lint(esc(sub), "salesrow.sub") + "</p>") : "") +
      '<div class="salescards">' + cards.map(function (c) { return salesRowCardHtml(c, d); }).join("") + "</div>" +
      '<div class="salesrow-foot">' + (seeAll || "") +
      '<button type="button" class="linkbtn" data-qtoggle="' + id + '" aria-expanded="false">How Sam picked these</button>' + aside.trigger + "</div>" +
      '<div class="ev-why-note" id="' + id + '" hidden>' + howSamDecidedNoteHtml(d) + "</div>" + aside.panel + "</div>";
  }
  // "How Sam decided": the comparison fence (poolYears + the car's own name, e.g. "2005 to 2011 997
  // Carrera S"), that only completed sales count (hammer + buyer's premium reconciled), and what was
  // set aside and why (d.setAsideReasons) - never a count of sources/venues. Content unchanged from
  // the prior "How Sam decided" toggle; only its trigger moved (now "How Sam picked these", beside
  // "See all N sales" at the foot of the sales row, see salesRowHtml above).
  var ASIDE_REASON_LABEL = { modified: ["modified", "modified"], project: ["project car", "project cars"], replica: ["replica or tribute", "replicas or tributes"], "odd sale": ["odd sale", "odd sales"] };
  function howSamDecidedNoteHtml(d) {
    var yrs = Array.isArray(d.poolYears) ? d.poolYears : null;
    var yearPhrase = yrs ? (yrs[0] === yrs[1] ? String(yrs[0]) : (yrs[0] + " to " + yrs[1])) : "";
    var fence = [yearPhrase, carHead(d)].filter(Boolean).join(" ") || carLabel(d.resolvedCar);
    var sentence = "This compares " + fence + " sales: completed auctions only, with hammer price and any buyer’s premium reconciled into one figure.";
    var asideBits = [], asideTotal = 0;
    if (d.setAsideReasons) {
      Object.keys(d.setAsideReasons).forEach(function (k) {
        var n = d.setAsideReasons[k];
        if (n > 0) { asideTotal += n; var lbl = ASIDE_REASON_LABEL[k] || [k, k]; asideBits.push(n + " " + (n === 1 ? lbl[0] : lbl[1])); }
      });
    }
    var asideSentence = asideBits.length ? (" " + asideTotal + (asideTotal === 1 ? " sale set aside: " : " sales set aside: ") + asideBits.join(", ") + ".") : "";
    return '<p>' + lint(esc(sentence + asideSentence), "ev.why") + "</p>";
  }
  // "N sales sat outside the middle half" (Market Check result-page spec, Oct 2026): the brief's own
  // "existing ... opening in place as plain rows" - the trigger now lives in the sales row's footer
  // (salesRowHtml above), beside "See all N sales" and "How Sam picked these"; the panel it opens
  // (the lowest-to-highest bar + the above/below-range cards) is unchanged, still id="shown-
  // separately" so the scrollto handler keeps working.
  function asideToggleHtml(d, m) {
    // Job 5 (round two): d.setAsideRows (shapeCards(aside) plus each row's own `reason`,
    // lib/onebox.js setAsideReasonFor) when present - same rows as d.asideCards, same order, same
    // length, the only difference is the reason key - so a candle page's own "sat outside this
    // range" cards can carry the SAME per-sale label the thin-tile treatment uses, never hidden.
    var source = (Array.isArray(d.setAsideRows) && d.setAsideRows.length === (d.asideCards || []).length) ? d.setAsideRows : d.asideCards;
    var list = (source || []).filter(function (c) { return !(m && m.url && c.url === m.url); });
    if (!list.length) return { trigger: "", panel: "" };
    var band = Array.isArray(d.cluster) ? d.cluster : (Array.isArray(d.span) ? d.span : null);
    var dirN = 0;
    list.forEach(function (c) {
      if (!band || !(Number(c.price) > 0)) return;
      if (c.price > band[1] || c.price < band[0]) dirN++;
    });
    var sentence = (dirN === list.length)
      ? "Real sales of the same car that sat well above or below the range, so they are not used to set it. Still useful to know about."
      : "Real sales of the same car, kept out of the range above. Still useful to know about.";
    var cardsHtml = list.map(function (c) { return poolCardHtml(c, c.reason ? thinAsideTileLabel(c.reason) : ""); });
    // Wording matches what the panel actually lists (item 6, mockup match round, Oct 2026): this is
    // d.asideCards, the engine's own set-aside pool (fenced out for price position OR other reasons
    // - modified, replica, odd spec), never a statistical "outside the middle half" cut (a 68-sale
    // pool's real IQR excludes ~34, not 7 - the old label implied a different count than the list
    // actually holds). dirN === list.length means every aside card IS a price outlier (the "sat
    // outside the range" phrasing is then literally true); otherwise at least one was set aside for
    // a non-price reason, so the label says "set aside" instead, matching the sentence above it.
    var label = dirN === list.length
      ? (obNumWord(list.length) + (list.length === 1 ? " sale sat outside the range" : " sales sat outside the range"))
      : (obNumWord(list.length) + (list.length === 1 ? " sale was set aside" : " sales were set aside"));
    var trigger = '<button type="button" class="linkbtn" data-qtoggle="shown-separately" aria-expanded="false">' + esc(label) + " " + CHEV_SVG + "</button>";
    var panel = '<div class="ev-aside-note" id="shown-separately" hidden>' + rangeBarHtml(d) + '<p class="sep-note" data-stage="cards">' + lint(sentence, "sep.note") + "</p>" + capCardsHtml("flatlist", cardsHtml, 3) + "</div>";
    return { trigger: trigger, panel: panel };
  }
  // "All N comparable sales": a plain table - DATE, CAR, MILES, VENUE, PRICE (right aligned serif).
  // The whole pool, including the three Sales-behind-this-answer cards (per the brief, so this is a
  // true full list) - the exact-car's own sale is no longer excluded (there is no exact-car section
  // left on this page to have already shown it; see resultHtml's own note). Car cell links to the
  // sale; the row itself is plain.
  function allSalesRowHtml(c) {
    if (!c) return "";
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    var href = utmUrl(c.url);
    var gasAttrs = (href && c.id != null) ? (' data-gas-event="receipt_click" data-gas-source="' + esc(c.platformSlug || "") + '" data-gas-listing-id="' + esc(c.id) + '"') : "";
    var carCell = href
      ? ('<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" data-cardclick="' + esc(c.platformSlug || "") + '"' + gasAttrs + ">" + esc(cleanReceiptTitle(c.title)) + "</a>")
      : esc(cleanReceiptTitle(c.title));
    return "<tr><td>" + esc(fullDateOrMonth(c)) + "</td><td>" + carCell + "</td><td>" + esc(longMiles(c) || "") + "</td><td>" + esc(venue) +
      '</td><td class="astc-price num">' + esc(usd(c.price)) + "</td></tr>";
  }
  // "All N comparable sales" (Market Check result-page spec, Oct 2026): the heading count and the
  // scope/window subline both come from the SAME single source the hero itself reads
  // (heroPoolSizeNum / heroMetaLineText) - never a second computation that could disagree with the
  // hero's own count. First ten rows always visible (server-rendered); the rest sit hidden in one
  // <tbody> a single "Show more sales (N)" click reveals in place (the existing [data-qtoggle]
  // mechanism). `cards` is the tier's own full sale list (d.cards on a range answer; thinCardsFrom's
  // output on a thin answer - the thin tier has no exact-car section to exclude either).
  function moreComparableSalesHtml(d, m, cards) {
    var all = (cards || []).filter(function (c) { return c && Number(c.price) > 0; });
    if (!all.length) return "";
    var poolSize = heroPoolSizeNum(d);
    var n = Number.isFinite(poolSize) ? poolSize : all.length;
    // Job 6a (round two): "All eight comparable sales," not "All Eight" - obNumWordLow reads
    // lowercase mid-sentence, matching every other count-word mid-sentence on this page.
    var countWord = obNumWordLow(n);
    var sub = heroMetaLineText(d);
    var rows = all.map(allSalesRowHtml);
    var cap = 10, bodyHtml, foot = "";
    if (rows.length <= cap) { bodyHtml = "<tbody>" + rows.join("") + "</tbody>"; }
    else {
      var id = "ob-allcap" + (++obCapSeq);
      var restN = rows.length - cap;
      bodyHtml = "<tbody>" + rows.slice(0, cap).join("") + '</tbody><tbody id="' + id + '" hidden>' + rows.slice(cap).join("") + "</tbody>";
      foot = '<button type="button" class="linkbtn allsales-showall" data-qtoggle="' + id + '" aria-expanded="false">Show more ' + (restN === 1 ? "sale" : "sales") + " (" + restN + ") " + CHEV_SVG + "</button>";
    }
    // id="more-sales" (hero-rebuild round, kept): the sales row's "See all N sales" link scrolls here
    // via [data-scrollto] (wire()).
    return '<div id="more-sales"><div class="sec-head" data-stage="cards"><div><h2>All ' + esc(countWord) + " comparable " + (n === 1 ? "sale" : "sales") + "</h2>" +
      (sub ? ('<span class="scope">' + lint(esc(sub), "allsales.scope") + "</span>") : "") + "</div></div>" +
      '<table class="allsales-table" data-stage="cards"><thead><tr><th class="colhead">Date</th><th class="colhead">Car</th><th class="colhead">Miles</th><th class="colhead">Venue</th><th class="colhead astc-price">Price</th></tr></thead>' +
      bodyHtml + "</table>" + foot + "</div>";
  }
  // contradictionLine (the divergence sentence) was deleted in the hero-rebuild round (Oct 2026) -
  // its only call site was resultHtml's removed "notes" block (narrowItDownHtml). No new home this
  // round; flagged in the round report.
  // Pool-aware freshness line (S2-2). NOT passed through lint(): "estimated" is a deliberate
  // negation here (as in the trust line), not a valuation claim. No dashes.
  // Item 12 (Oct 2026): the day, not the month - "Oct 6" this year, "Oct 6, 2025" once it isn't.
  var FRESH_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function freshDay(dstr) {
    var p = String(dstr || "").slice(0, 10).split("-");
    var y = Number(p[0]), mo = Number(p[1]), dd = Number(p[2]);
    if (!y || !mo || !dd) return "";
    var s = (FRESH_MONTHS_SHORT[mo - 1] || "") + " " + dd;
    return y === new Date().getFullYear() ? s : s + ", " + y;
  }
  // Job 3 (round three, Sam's review): freshDay drops the year in the current year ("Apr 15" alone,
  // read in October, looks like it could be anything) - the hero's own scope line always needs the
  // year, so this is a separate, always-year variant, used only there (freshDay itself is unchanged
  // for its other callers - the all-sales caption, the fresh bullet, class-era - none of which Sam
  // flagged this round).
  function freshDayFull(dstr) {
    var p = String(dstr || "").slice(0, 10).split("-");
    var y = Number(p[0]), mo = Number(p[1]), dd = Number(p[2]);
    if (!y || !mo || !dd) return "";
    return (FRESH_MONTHS_SHORT[mo - 1] || "") + " " + dd + ", " + y;
  }
  // The hero scope line's own latest-sale clause, always with the year, always "latest sale" (not
  // "the latest on") - same three branches countLatestPhrase already reads (the two-dates-apart
  // case, a house-mode pool, the plain case), just every one of them with freshDayFull.
  function heroScopeLatestText(d) {
    var f = d && d.freshness; if (!f) return "";
    var through = f.through, arch = f.archiveThrough;
    if (through && arch && through < arch) return "latest sale " + freshDayFull(through);
    // House pools never claim day-level precision (countLatestPhrase's own monthOnly rule) - the
    // auction-house feed reports on its own cadence, so this reads "latest sale April 2026", not a
    // specific day, same hedge as everywhere else house dates are shown.
    if (f.mode === "house") return f.through ? ("latest sale " + monthYear(f.through)) : "";
    if (f.through) return "latest sale " + freshDayFull(f.through);
    return "";
  }
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
      var fact2 = "Latest sale: " + freshDay(through) + ".";
      return '<div class="fresh"><span class="dot"></span>' + esc(fact1 + " " + fact2) + "</div>";
    }
    var txt = "";
    if (f.mode === "house") { if (f.through) txt = "Auction results through " + monthOnly(f.through) + "."; }
    else if (f.lastNight) txt = "Real sales through last night.";
    else if (f.through) txt = "Real sales through " + monthDayYear(f.through) + ".";
    if (!txt) return "";
    return '<div class="fresh"><span class="dot"></span>' + esc(txt) + "</div>";
  }
  // Latest-sale clause for the count line (Oct 2026 follow-up): the old count line stated the
  // freshness fact as its OWN second sentence ("...through last night. Latest sale Aug 29.") - two
  // sentences doing one job. This states just the one fact that actually matters here (when the
  // newest comparable sale closed), dropping the separate archive-currency half of the old dual-fact
  // case as redundant with it. Same underlying d.freshness fields, no second measurement.
  function countLatestPhrase(d) {
    var f = d && d.freshness; if (!f) return "";
    var through = f.through, arch = f.archiveThrough;
    if (through && arch && through < arch) return "the latest on " + freshDay(through);
    if (f.mode === "house") return f.through ? ("the latest on " + monthOnly(f.through)) : "";
    if (f.through) return "the latest on " + freshDay(f.through);
    return "";
  }
  // evidenceMetaLine (the old count line) was deleted in the hero-rebuild round - heroCountText above
  // carries the same logic (d.soldCount, verbatim-if-a-word / obNumWord if numeric) folded into the
  // new hero's one grey meta line (heroMetaLine) instead of its own paragraph.
  // ---- Sale cards (Oct 2026 design). One renderer for every card size: photo slot (real photo, or
  // a clearly marked "No photo" slot), pill, price, venue + month, the record's OWN title (rule 25),
  // a meta line, and an optional italic why-line. Whole card is the listing link when there is one.
  var DELTA_LABEL = { fewer_miles: "Fewer miles", more_miles: "More miles", manual: "Manual", automatic: "Automatic", earlier: "Earlier", more_recent: "More recent", recent: "More recent", higher: "Higher sale", lower: "Lower sale" };
  // Range-comparison pills (Above/Below range) stay neutral - plain ink, never a status colour or
  // the brand fill every other pill (Closest match, This car...) uses. The "neutral" class is added
  // unconditionally; it only takes visual effect once the brand-palette CSS (lib/appShell.js
  // brandPaletteCss, crew-only for now) is present to define it - a silent no-op otherwise.
  function photoHtml(image, alt, pill) {
    var img = image ? '<img src="' + esc(image) + '" alt="' + esc(alt || "") + '" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">' : "";
    var neutral = pill === "Above range" || pill === "Below range";
    return '<div class="ph' + (image ? "" : " noimg") + '">' + img + '<span class="none">No photo</span>' + (pill ? '<span class="pill' + (neutral ? " neutral" : "") + '">' + esc(pill) + "</span>" : "") + "</div>";
  }
  // ONE grid item per card, always (Oct 2026, sale card template job). Previously a card with its
  // own inner link (poolCardHtml's "Sold before..." line, vinHeroCardHtml's history link) wrapped
  // that inner <a> INSIDE the card's own outer <a> - illegal HTML (a browser cannot nest an anchor
  // inside another anchor), so the browser's parser silently auto-closed the outer anchor the
  // moment the inner one started, splitting one card into orphaned grid cells (a photo with no
  // price, a price with no photo) - reproduced live, 2008 Porsche 997 Carrera S. Fixed structurally,
  // not just for the sold-before case: the photo and the body (price/title/meta) are now each their
  // OWN anchor pointing at the same href, as siblings inside one <article> - never nested - so any
  // future inner link (o.after) is always safe, and the whole photo+body area stays clickable
  // exactly as before (two anchors covering the same area a single wrapping anchor used to).
  // SECOND ADDENDUM item 1 (result-page-polish round two): one quiet "View sale" action, not several
  // underlined links per card. The title anchor's own ::after stretches over the whole article (CSS,
  // mirrors api/buy.js's CARD_RULES_CSS - the same "whole card opens the listing, title link
  // stretched, plain text details, only real actions sit above it" rule Lane C already wrote for
  // Buy, same technique here under this file's own .card/.ctitle names) so the card is clickable
  // everywhere, but price/title/meta read as plain text - no underline - and only "View sale" (and
  // any o.after inner link, e.g. "Sold before on...") sit above the stretch as real actions.
  function saleCardHtml(o) {
    var head = o.venueLine ? '<div class="price-row"><span class="cprice num">' + o.priceHtml + '</span><span class="cvenue">' + esc(o.venueLine) + "</span></div>"
      : '<span class="cprice num">' + o.priceHtml + "</span>";
    // data-gas-listing-id (Round 6 Job 1, tracking fix): the record's own id (o.id, already on
    // every card the engine shapes), so receipt_opened's sale_id is the sale, never the platform
    // slug (o.slug) it was wrongly sent as - the shared handler (lib/appShell.js) reads this.
    // Round 7 Job 3: receipt_click only fires when o.id is actually present - sale_id is a REQUIRED
    // catalog field, and vinHeroCardHtml's match (lib/_flags.js findVinArchiveMatch, not touched
    // this round) does not select an id column yet, so sending "unknown" for every exact-car hero
    // click would be a silently-wrong required field, not an honest gap. The card itself is
    // unaffected - it still opens the listing - only the tracking event is withheld until that
    // query carries an id.
    var gasAttrs = (o.href && o.id != null) ? (' data-gas-event="receipt_click" data-gas-source="' + esc(o.slug || "") + '" data-gas-listing-id="' + esc(o.id) + '"') : "";
    var linkAttrs = o.href ? (' href="' + esc(o.href) + '" target="_blank" rel="noopener noreferrer" data-cardclick="' + esc(o.slug || "") + '"' + gasAttrs) : "";
    var titleHtml = o.title
      ? (o.href ? ('<h3 class="ctitle"><a' + linkAttrs + ' aria-label="Open the listing">' + esc(o.title) + "</a></h3>") : ('<h3 class="ctitle">' + esc(o.title) + "</h3>"))
      : "";
    // o.flat (follow-up round, Oct 2026): the thin tier's own receipts grid, "This exact car," the
    // collapsed outside-range cards and the market-read quarter-row panel all opt into this - the
    // SAME box/pill/shadow removal the sales row and live panel already got, reusing this ONE shared
    // builder instead of a parallel row component (unlike allSalesRowHtml, which has a materially
    // different, simpler field set). Every other caller (htPairsHtml, classEraHtml, refusalHtml,
    // renderChassisMatch) does not pass it and is BYTE-IDENTICAL to before - not named in this round's
    // four pieces, left alone. A pill (o.pill) becomes plain small-caps grey text instead of the
    // green photo badge, since "no pills" applies here too.
    var flatTag = (o.flat && o.pill) ? ('<div class="flat-tag">' + esc(o.pill) + "</div>") : "";
    var bodyInner = flatTag + head +
      (o.allIn ? '<div class="callin">Buyer paid ' + esc(o.allIn) + " with premium</div>" : "") +
      titleHtml +
      (o.meta ? '<div class="cmeta">' + esc(o.meta) + "</div>" : "") +
      (o.extra || "") +
      (o.href ? ('<a class="viewsale"' + linkAttrs + ">View sale &#8594;</a>") : "") +
      (o.why ? '<p class="cwhy">' + lint(esc(o.why), "card.why") + "</p>" : "");
    var cls = "card " + (o.cls || "") + (o.flat ? " flat" : "");
    var photo = photoHtml(o.image, o.title, o.flat ? "" : o.pill);
    var body = '<div class="cbody">' + bodyInner + "</div>" + (o.after || "");
    return '<article class="' + cls + (o.href ? " clickable" : "") + '">' + photo + body + "</article>";
  }
  // "Automatic (7-speed)" -> "Automatic, 7-speed".
  function longMiles(c) { return Number(c.mi) > 0 ? Number(c.mi).toLocaleString("en-US") + " miles" : (c.mileageText && c.mileageText !== "TMU" ? c.mileageText : ""); }
  // ctxCardHtml (the old boxed/pilled "Closest match"/"Middle of the range" context cards) was
  // deleted in the hero-rebuild round (Oct 2026) along with contextSalesHtml - see salesRowCardHtml
  // above, the new borderless replacement. otherHalfLabel and offWindowLabel below are KEPT, byte-
  // identical, and now called from salesRowCardHtml instead: offWindowLabel specifically is load-
  // bearing for scripts/offWindowCheck.mjs (prePush), which extracts this exact function by name and
  // asserts its wording matches api/buy.js's drawerHtml for the same stubbed off-window card -
  // discovered the hard way when a first pass at this round deleted it and prePush caught the
  // regression immediately.
  // OTHER-HALF LABEL (Oct 2026, evidence-block job): a context card drawn from the OTHER half of a
  // split/merged generation (d.halfGeneration, lib/generations.js) reads "2010, later generation" /
  // "2006, earlier generation" - the card's own year, plus plain earlier/later against the searched
  // car's own year. Read defensively: nothing unless the engine actually carries a half-generation
  // table entry for this model (d.halfGeneration) AND this specific card was tagged cross-half
  // (c.sameHalf === false, set server-side by pickRepresentative) AND both years are known. This
  // NEVER computes which half a year belongs to (that boundary is the engine's call, via sameHalf) -
  // it only orders two already-known years in plain English once the engine says they differ.
  function otherHalfLabel(c, d) {
    if (!c || !d || !d.halfGeneration || c.sameHalf !== false || !c.year) return "";
    var subjYear = d.resolvedCar && Number(d.resolvedCar.year);
    if (!subjYear || !Number(c.year)) return "";
    var dir = Number(c.year) > subjYear ? "later generation" : (Number(c.year) < subjYear ? "earlier generation" : "");
    if (!dir) return "";
    return '<div class="otherhalf">' + esc(c.year + ", " + dir) + "</div>";
  }
  // OFF-WINDOW LABEL (Oct 2026, context-cards job): c.offWindow is true only when this card's own
  // year sits outside the searched year's preferred window AND the window could not be filled from
  // the pool (the engine's full-pool fallback, lib/onebox.js pickRepresentative) - false/null means
  // either the window was satisfied or no window applies, and nothing renders. Same family of note
  // as otherHalfLabel above (a plain fact-only div under the card, never a second number or a claim
  // about the range itself - the range/count are unchanged by this field, see docs/lane-notes.md).
  // ONE function: every surface that can show this card reuses it, never its own copy of the text.
  function offWindowLabel(c, d) {
    if (!c || c.offWindow !== true || !c.year) return "";
    var searchedYear = d && d.resolvedCar && Number(d.resolvedCar.year);
    if (!searchedYear) return "";
    return '<div class="offwindow">' + esc("A " + c.year + " car, a few years from the " + searchedYear + " searched.") + "</div>";
  }
  // The exact car (VIN or chassis match) as the hero: "THIS CAR", 1.5px green border, its last sale.
  // Snapshot attributes are dated and past tense (rule 26). The history link renders only when the
  // engine returns how many times it sold before the shown sale (m.soldBeforeCount >= 1) and the
  // query was a VIN (the /vin/{vin} page is keyed on it).
  // flat (follow-up round, Oct 2026, 3rd arg, default false): classEraHtml and renderChassisMatch
  // call this too but are out of the Market Check result-page spec's scope - left boxed, unchanged.
  function vinHeroCardHtml(m, rc, flat) {
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
    // THIS EXACT CAR (Oct 2026, evidence-block job): the specific prior sale when the engine's own
    // history carries one (m.history[1] - history[0] is this same most-recent sale, already the
    // card above) - "Previously sold for $X in {month year}." Falls back to the honest count-only
    // line when the next history entry is an unsold attempt rather than a sale with a real price.
    var n = Number(m.soldBeforeCount);
    var prior = (m.history && m.history[1]) || null;
    var priorSaleLine = (prior && prior.kind === "sale" && prior.price > 0 && prior.date)
      ? ("Previously sold for " + usd(prior.price) + " in " + monthYear(prior.date) + ". ")
      : (n === 1 ? "Sold once before. " : n === 2 ? "Sold twice before. " : n > 0 ? ("Sold " + n + " times before. ") : "");
    var hist = (n >= 1 && obSourceVin)
      ? '<a class="histlink" href="' + esc(historyHref(rc, obSourceVin)) + '">' + esc(priorSaleLine + "See its full history") + " &#8594;</a>"
      : "";
    return saleCardHtml({ cls: "hero this exact", flat: !!flat, pill: "This car", href: utmUrl(m.url), slug: m.source, image: m.photoUrl,
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
  // These never carry vinNorm/hasHistoryPage - Lane B's attachHistoryPage (lane-notes FOR LANE A,
  // Oct 13) is scoped to "result"-tier cards only (the same d.cards array poolCardHtml below reads),
  // same scope as the existing attachSoldBefore right beside it. Nothing to link here.
  // flat (follow-up round, Oct 2026, 2nd arg, default false): opt-in, NOT a 3rd .map() index gotcha -
  // every call site below passes it explicitly via a wrapping function, never bare `.map(receiptCardHtml)`
  // for the one caller (thin's own grid) that wants it, so the array index can never leak in as this
  // argument. Only the thin tier's own receipts grid passes true; htPairsHtml and classEraHtml are
  // unchanged, still boxed - neither is one of this round's four named pieces.
  function receiptCardHtml(rc, flat) {
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
    return saleCardHtml({ cls: "t", flat: !!flat, href: utmUrl(rc.url), slug: rc.slug, id: rc.id, image: rc.image, priceHtml: priceHtml, allIn: allIn,
      title: cleanReceiptTitle(shortCarName(rc.title)), meta: segs.filter(Boolean).join(" · "), extra: marks });
  }
  // Engine d.cards shape (refusal / shown-separately): price, mileageText, platform, month, title.
  // tagLabel is an optional small pill ("Above range") - never invented, only ever a label the
  // caller derived from data the engine already returned (see shownSeparatelyHtml).
  function poolCardHtml(c, tagLabel) {
    var venue = (c.platform && c.platform !== "others") ? c.platform : "";
    // Item 6 (Oct 2026): the same car's earlier sale, when the engine found one (attachSoldBefore,
    // d.cards only - asideCards/setAsideRows are a separate shapeCards call never mutated with it,
    // so this is a no-op there, same function either way).
    var sbText = "Sold before on " + monthYear((c.soldBefore && c.soldBefore.date) || "") + ((c.soldBefore && c.soldBefore.price) ? " for " + usd(c.soldBefore.price) : "");
    // Part 3 (result-hero job, Oct 2026): when the engine has no dated soldBefore fact but this
    // card's own VIN IS indexable (c.hasHistoryPage, lane-notes FOR LANE A Oct 13 - same d.cards
    // array, same conservative "never link to a noindex page" rule attachSoldBefore already
    // follows), the label still becomes a link - to the car's own history page rather than a specific
    // dated prior sale. soldBefore (a specific sale, when known) takes precedence when both are true.
    var sb = (c.soldBefore && c.soldBefore.date)
      ? (c.soldBefore.link ? ('<a class="sb-line" href="' + esc(utmUrl(c.soldBefore.link)) + '" target="_blank" rel="noopener noreferrer">' + esc(sbText) + '</a>') : ('<div class="sb-line">' + esc(sbText) + '</div>'))
      : (c.hasHistoryPage && c.vinNorm) ? ('<a class="sb-line" href="' + esc(historyHref(null, c.vinNorm)) + '">Sold before &#8594;</a>') : "";
    // flat: true unconditionally (follow-up round, Oct 2026) - poolCardHtml's callers (the aside-
    // toggle's outside-range cards, distribution's bucket receipts) all want the flat row treatment.
    return saleCardHtml({ cls: "t", flat: true, pill: tagLabel || "", href: utmUrl(c.url), slug: c.platformSlug, id: c.id, image: c.image,
      priceHtml: esc(usd(c.price)), title: cleanReceiptTitle(c.title),
      meta: [c.mileageText && c.mileageText !== "TMU" ? c.mileageText : "", venue, c.month || monShort(c.date)].filter(Boolean).join(" · "), after: sb });
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
    // ONE wrapper around the grid AND the button (Oct 2026, Sam's live review fix): at cap=0
    // (moreComparableSalesHtml's "collapsed by default" call) every card starts hidden, so the grid
    // div has zero VISIBLE children and naturally collapses to 0 height - but it was still a
    // SEPARATE top-level child of #ob's flex column (gap:28px), so that 0-height div still earned
    // its own 28px gap on each side, doubling the blank space between "More comparable sales" and
    // the "Show N more" button. Wrapping both in one div makes them a single flex item from #ob's
    // side regardless of how many cards are visible inside.
    return '<div class="capwrap" data-stage="cards"><div class="' + gridClass + '" id="' + id + '">' + shown + extra + "</div>" +
      '<button type="button" class="linkbtn capshow" data-capshow="' + id + '" aria-expanded="false">Show ' + firstBatch + " more &#8594;</button></div>";
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
  // Seller marketing lead-ins (Job 2e, result-page-polish round): "No Reserve:", "Reserve Met:" and
  // similar auction-listing hype that sits before the real car description - stripping these (not
  // just the trailing punctuation they leave behind) is what fixed the reported live example,
  // ", Individual Midnight Blue Slicktop 2004 BMW M3 Coupe" (a stray leading comma from a lead-in
  // phrase a DIFFERENT, earlier cleaning step had already removed without cleaning up after itself).
  var SELLER_LEADIN_RE = /^\s*(no\s+reserve|reserve\s+met|bring\s+a\s+trailer\s+certified|bat\s+certified|one[-\s]owner|single[-\s]family\s+owned)\s*[:,-]\s*/i;
  function cleanReceiptTitle(title) {
    var t = String(title == null ? "" : title);
    t = t.replace(/^\s*[\d][\d,.]*\s*k?\s*[-\s]\s*(mile|kilometer|km)s?\b'?s?\s*/i, ""); // "21k-Mile " / "4,800-Mile " / "26k-Kilometer "
    t = t.replace(/\s+\d+[-\s]speed\b/ig, "");   // " 6-Speed"
    t = t.replace(SELLER_LEADIN_RE, "");
    t = stripIdsFromTitle(t);                    // item 2: no VIN/chassis/lot codes in the title
    t = t.replace(/\s{2,}/g, " ").trim();
    // Leading/trailing punctuation (Job 2e): whatever stripping above leaves behind (a stray comma,
    // colon or dash at either end) is cleaned up last, once, regardless of which step caused it.
    t = t.replace(/^[\s,;:.\-]+/, "").replace(/[\s,;:.\-]+$/, "");
    t = titleCaseSaleTitle(t);                   // item 6: never shout a sale title
    return t || String(title == null ? "" : title);
  }
  // reconfirmHtml (the VIN mileage-staleness reconfirm), inlineSplitsHtml (the capped gearbox/
  // competition split chips) and mileageFallbackHtml were deleted in the hero-rebuild round (Oct
  // 2026) along with the rest of "Narrow it down" (resultHtml's removed "notes" block was their only
  // call site). No new home this round; flagged in the round report. The new hero's mileage line
  // (heroMileageLineHtml) keeps the same gate reconfirmHtml and the old mileageFieldHtml both used -
  // nothing mileage-related renders on a VIN/chassis match with a known mileage and sale date, since
  // that car's own hero card already states it.
  // "Digits not words" (Oct 2026, Market read pills): the engine word-ifies a count under ten
  // (countWord, lib/onebox.js) for prose; this card's pills want the raw digit instead. Same fact,
  // different print - not a recompute. Reverses the exact ST_NUMWORD list the engine uses.
  var NUMWORD_REV = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  function digitOf(v) { if (typeof v === "number") return v; var n = NUMWORD_REV[String(v == null ? "" : v).toLowerCase()]; return n != null ? n : (Number(v) || 0); }
  var CHEV_SVG = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
  var MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // marketReadQuarterRows/marketReadHtml ("Where sales landed over time") and the removable-answer
  // chip mechanism (RMCHIP_KEYS/refineWithout, [data-rmchip]) were deleted this round (Market Check
  // result-page spec, Oct 2026): the spec's own "ORDER AND NOTHING ELSE" names the hero chart as the
  // page's only over-time/spread view and explicitly calls out removing "any market-read text"; the
  // mileage "Change" link no longer reruns without the refine (it only focuses the field, see
  // heroMileageLineHtml), so refineWithout had no remaining caller. Flagged in docs/lane-notes.md.
  // Sign-in-then-continue for "Put Sam on it" (Oct 2026): module scope, not inside wire(), so both
  // the click handler AND renderResults() (after a post-sign-in reload) can reach it. Mirrors Buy's
  // own askSignIn/resumeArm/armWait pattern (api/buy.js) - a pending-arm flag in sessionStorage, a
  // short poll for authIsSignedIn(), an auto-arm once true. Covers both sign-in doors: email-code
  // never navigates away (obLastD/vinAnchor are still the current result, so the poll alone resumes
  // it); Google redirects away and back (js/auth.js keeps location.search on that round trip, so
  // boot()'s mcApplyFromUrl rebuilds the SAME result fresh - tryResumeWatchArm(), called once after
  // every renderResults(), is what catches that case; a no-op unless the flag is set).
  var OB_PENDWATCH_KEY = "gas_ob_pendwatch";
  function stashPendingWatch() { try { sessionStorage.setItem(OB_PENDWATCH_KEY, JSON.stringify({ at: Date.now() })); } catch (e) {} }
  function pendingWatch() { try { var p = JSON.parse(sessionStorage.getItem(OB_PENDWATCH_KEY) || "null"); return (p && Date.now() - p.at < 30 * 6e4) ? p : null; } catch (e) { return null; } }
  function clearPendingWatch() { try { sessionStorage.removeItem(OB_PENDWATCH_KEY); } catch (e) {} }
  function watchArmPayload() {
    if (vinAnchor && obSourceVin) return { kind: "vin", vin: obSourceVin };
    var rc = obLastD && obLastD.resolvedCar;
    if (!rc || !rc.make || !rc.model) return null;
    var car = { year: rc.year || null, make: rc.make, model: rc.model, trim: rc.trim || null, body: rc.bodyStyle || null };
    if (obLastRefine && obLastRefine.tx) car.gearbox = obLastRefine.tx === "manual" ? "manual" : "automatic";
    return { kind: "spec", car: car };
  }
  // Shared success path for both a direct click and a resumed post-sign-in arm: updates the band in
  // place and redraws the shared rail's Watching section at once, no reload (item 4).
  function armWatchNow(onFail) {
    var payload = watchArmPayload(); if (!payload) { if (onFail) onFail(); return; }
    var sess = (typeof authGetSession === "function") ? authGetSession() : null;
    var tok = sess && sess.access_token;
    if (!tok) { if (onFail) onFail(); return; }
    obFetch(API_ORIGIN + "/api/watch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(Object.assign({ action: "arm" }, payload)) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.watch) {
          obWatchArmed = j.watch; obWatchFirst = !!j.first;
          var sec = document.querySelector(".samonit");
          if (sec) sec.outerHTML = samOnItHtml(obLastD, vinAnchor);
          if (typeof gasWatchRail === "function") gasWatchRail();
          return;
        }
        if (onFail) onFail();
      })
      .catch(function () { if (onFail) onFail(); });
  }
  var obArmWait = null;
  // Called once after every render AND right after a sign-in click. A no-op unless a pending watch
  // is stashed. On the post-Google-redirect path, js/auth.js's deferred script (which processes the
  // OAuth callback and writes the session) may not have run yet when the first render lands - so a
  // pending flag with authIsSignedIn() still false gets a short poll here too, not an immediate
  // give-up, same TTL as the stash itself.
  function tryResumeWatchArm() {
    if (!pendingWatch()) return;
    if (typeof authIsSignedIn === "function" && authIsSignedIn()) { clearPendingWatch(); armWatchNow(null); return; }
    if (obArmWait) return;
    var t0 = Date.now();
    obArmWait = setInterval(function () {
      if (typeof authIsSignedIn === "function" && authIsSignedIn()) { clearInterval(obArmWait); obArmWait = null; clearPendingWatch(); armWatchNow(null); return; }
      if (!pendingWatch() || Date.now() - t0 > 6000) { clearInterval(obArmWait); obArmWait = null; clearPendingWatch(); }
    }, 400);
  }
  // Item 9 ("Put Sam on it"), connected (Oct 2026) to Lane C's /api/watch - arm by spec (car object,
  // no listing_id) or arm by VIN, the same endpoint and wording Buy's own watch control uses (see
  // docs/lane-notes.md). Gated on OB_WATCH_READY (no control while the tables aren't set up). Once
  // THIS session has armed a watch for the current result, shows the confirmation line instead of
  // the ask - reset on every new search (run()/mcApplyFromUrl()), not on a refine (the identity being
  // watched does not change when miles/gearbox narrow the same pool).
  // One action, not two (Oct 2026, Sam's live review): this used to be two separate blocks for the
  // same intent - this button (armed via /api/watch, Lane C's endpoint) AND a second "Keep looking"
  // card (lib/appShell.js's shared component, a link into /tasks/mine) stacked right below it on
  // every Market Check result. Merged into one: this block stays (it already confirms in place with
  // no navigation, the better of the two mechanisms), relabelled "Have Sam keep looking" to match the
  // wording the shared card used, and keepLookingCardHtml's call is gone from resultHtml below - so
  // "You'll be notified when another matching car goes live." (that card's fixed trailer line, which
  // belongs to Buy's live-listing results, not a market-range read) no longer appears here either.
  function samOnItHtml(d, m) {
    if (!OB_WATCH_READY) return "";
    if (obWatchArmed) {
      var onLine = m ? "Sam’s looking for this exact car to come up again." : ("Sam’s looking for the next sale of " + esc(obWatchArmed.label || carLabel(d.resolvedCar)) + ".");
      return '<section class="samonit" data-stage="note"><p class="samonit-on">' + lint(onLine, "samonit.on") + "</p>" + (obWatchFirst ? '<p class="samonit-free">Free. No card, no plan.</p>' : "") + "</section>";
    }
    var line = m ? "If this exact car comes up again, Sam will email you, with the sale attached." : ("When the next " + esc(carLabel(d.resolvedCar)) + " sells, Sam will email you, with the sale attached.");
    // samonit-main (follow-up round, Oct 2026): the sentence and the link read as one group on the
    // left, grey "Free to use..." sits at the right - plain text, no box, same copy as before.
    return '<section class="samonit" data-stage="note"><span class="samonit-main"><p>' + lint(line, "samonit") + '</p><button type="button" class="linkbtn" id="ob-samonit">Have Sam keep looking &#8594;</button></span><p class="samonit-free">Free to use. Sign in only if you want Sam to keep looking.</p><p class="samonit-msg" id="ob-samonit-msg" hidden></p></section>';
  }
  // narrowItDownHtml ("Narrow it down": the refinement questions, pills and removable-answer chips)
  // was removed WHOLESALE in the hero-rebuild round (Oct 2026) per the brief's explicit "Remove the
  // Narrow it down block and all its pills" - the trim question and the mileage field each got a
  // direct replacement inside the new hero (heroIdentityLineHtml, heroMileageLineHtml); body style,
  // gearbox, the dictionary driver question, the observable-fact question, the VIN mileage reconfirm,
  // the capped gearbox/competition split chips, the divergence-contradiction line, the mileage-
  // nearest-sales-fallback note and the identity-question "switch sides" chip have NO new home this
  // round. All flagged explicitly in the round report, not silently dropped.
  // The years clause off the end of the engine's own rungLabel ("911 models, 2020 to 2026" -> "2020
  // to 2026") - reused wherever a sentence needs the matched years without repeating the whole
  // rungLabel (the distribution subhead, the live panel's own scope sentence). Never computed from
  // the cards; read straight off the same field heroScopeText already prints.
  function yearsClauseOf(d) {
    var s = String((d && d.rungLabel) || "");
    var m = /((?:18|19|20)\d{2})(\s+to\s+(?:18|19|20)\d{2})?\s*$/.exec(s);
    return m ? (m[1] + (m[2] || "")) : "";
  }
  // ================= DISTRIBUTION (mockup match round, Oct 2026) =================
  // "How this market is distributed": price-band rows from d.distribution (lib/onebox.js
  // distributionFor, e34 - buckets with low/high/count/share/receipts/typicalBucket, the pool
  // scoped at 20+ sales). share is the engine's own whole percent (largest-remainder rounding, the
  // buckets' shares sum to 100) - printed directly, never computed here. Clicking a row expands its
  // receipts underneath, one bucket open at a time (shares one data-distgroup id).
  var obDistSeq = 0;
  // No label field on a bucket, so the band label is composed here from low/high (never invented -
  // both are the engine's own numbers, run through the same usd() every other dollar figure on this
  // page uses). Every bucket but the last is a half-open [low, high) band (the engine's own
  // distributionFor uses "< bHi" there and "<= bHi" only on the final bucket), so the label reads
  // "low to high-1" except on the last row, which reads "low to high".
  function distBucketLabel(b, isLast) {
    var hi = isLast ? Number(b.high) : Math.max(Number(b.low), Number(b.high) - 1);
    return usd(b.low) + " to " + usd(hi);
  }
  function distributionHtml(d) {
    var dist = d && d.distribution;
    var buckets = (dist && Array.isArray(dist.buckets)) ? dist.buckets.filter(function (b) { return b && Number.isFinite(Number(b.low)) && Number.isFinite(Number(b.high)); }) : [];
    if (buckets.length < 2) return "";
    var max = Math.max.apply(null, buckets.map(function (b) { return Number(b.count) || 0; }));
    var groupId = "ob-dist" + (++obDistSeq);
    var rows = buckets.map(function (b, i) {
      var count = Number(b.count) || 0;
      var pct = max > 0 ? Math.max(2, count / max * 100) : 0;
      // Item 5 (Sam's follow-up round): share only, "21%" - no count in brackets.
      var share = Number.isFinite(Number(b.share)) ? (Math.round(Number(b.share)) + "%") : count.toLocaleString("en-US");
      var receipts = Array.isArray(b.receipts) ? b.receipts : [];
      var panelId = groupId + "-" + i;
      var barHtml = '<span class="dist-label">' + esc(distBucketLabel(b, i === buckets.length - 1)) + '</span><span class="dist-track"><span class="dist-bar' + (b.typicalBucket ? " typical" : "") + '" style="width:' + pct.toFixed(1) + '%"></span></span><span class="dist-count num">' + esc(share) + "</span>";
      var btn = receipts.length
        ? ('<button type="button" class="distrowbtn" data-disttoggle="' + panelId + '" data-distgroup="' + groupId + '" aria-expanded="false">' + barHtml + "</button>")
        : ('<div class="distrowbtn" style="cursor:default">' + barHtml + "</div>");
      var panel = receipts.length ? ('<div class="dist-panel" id="' + panelId + '" hidden>' + capCardsHtml("flatlist", receipts.map(function (c) { return poolCardHtml(c, false); }), receipts.length) + "</div>") : "";
      return '<div class="distrow">' + btn + panel + "</div>";
    }).join("");
    var poolSize = heroPoolSizeNum(d);
    var sub = "Share of sales in each price band" + (Number.isFinite(poolSize) ? (", based on " + obNumWordLow(poolSize) + " sales") : "") + ".";
    return '<div class="sec-head" data-stage="cards"><div><h2>How this market is distributed</h2><span class="scope">' + lint(esc(sub), "dist.sub") + "</span></div></div>" +
      '<div class="distrows" data-stage="cards">' + rows + "</div>";
  }
  // ORDER AND NOTHING ELSE (Market Check result-page spec, Oct 2026): hero, sales behind this
  // answer, live right now, all N comparable sales, how this market is distributed, sell band, task
  // line. "This exact car" (VIN/chassis hero card) and "N sales sat outside the range" as a standalone
  // section are both gone from this order - the aside toggle survives, folded into the sales row's own
  // footer (per the brief's explicit "and the existing 'Four sales sat outside the middle half'
  // opening in place"), but a VIN/chassis match no longer gets its own card on this page. A real
  // behavior change, not an oversight - flagged plainly in docs/lane-notes.md.
  function resultHtml(d, m) {
    var thinTile = thinTileTreatment(d, m, d.cards, d.setAsideRows);
    var body = heroRangeHtml(d, m, thinTile);
    body += exactCarSalesHtml(d);
    // Item (d), Sam's review round: every sale is already on screen as a tile, so the "Sales behind
    // this answer" teaser (three cards + its own "see all" link) is redundant - suppressed whenever
    // tiles rendered (every pool size now, job 3 round two: 1 to 16 sales all get tiles).
    if (!(thinTile && thinTile.suppressSalesRow)) body += salesRowHtml(d, m);
    body += livePanelSlot();
    // Job 6a (round two): the full comparable-sales table is redundant once every sale is already a
    // tile - suppressed on the same gate as the sales-row teaser above.
    if (!(thinTile && thinTile.suppressSalesRow)) body += moreComparableSalesHtml(d, m, d.cards);
    body += distributionHtml(d);
    body += sellHtml();
    body += samOnItHtml(d, m);
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
  //  - VARIED: the "No range... a guess" headline + the templated reason + chips.
  function refusalHtml(d, m) {
    var rf = d.refusal || {};
    // Name from the exact-car displayName when matched, else the clean resolved subject - never
    // a raw model+trim concatenation ("4-Series M4 Competition Package").
    var model = (m && m.displayName) ? m.displayName.replace(/^\d{4}\s+/, "") : (rf.model || carLabel(d.resolvedCar) || "car");
    var cards = d.cards || [];
    if (rf.kind === "thin") {
      // A thin answer (e63, Sam, Oct 19 2026; Lane C as integrator, Lane A away): the shared card carries the engine's
      // thinLine and latest-sale line, the only explanation; the grid below carries the sales. No lead of the page's own.
      var follow = m ? "" : "A bit more detail, or a different car, and Sam pulls what actually sold.";
      var card = window.sellsForCardHtml ? window.sellsForCardHtml(d, { rows: false }) : "";
      return '<div class="refusal">' + card + (follow ? samMsgHtml([lint(esc(follow), "thin.follow")], "Sam’s read") : "") + factsBlockHtml(d, false) + "</div>" + exactCarSalesHtml(d) + poolGridHtml(cards, "What has sold") + sellHtml();
    }
    var follow2 = "Say which " + esc(model) + " it is and Sam compares it to the ones that match.";
    var chips = (rf.variants && rf.variants.length)
      ? '<div class="wayfwd">' + rf.variants.map(function (v) { return '<button type="button" class="chip" data-model="' + esc(v) + '">' + esc(v) + "</button>"; }).join("") + '<button type="button" class="linkbtn" data-change>Or add the year and engine &#8594;</button></div>'
      : "";
    // The spread refusal (Sam, Oct 19 2026; Lane C as integrator, Lane A away): the shared card carries the engine's own
    // line (its samLine, "Sales too spread out for a range.") and latest sale, the only explanation; no reason of the
    // page's own. The ask to name the car and the engine's own variant chips stay; the grid below carries the sales.
    var card = window.sellsForCardHtml ? window.sellsForCardHtml(d, { rows: false }) : "";
    var head = '<div class="refusal" data-stage="answer">' + card +
      samMsgHtml([lint(esc(follow2), "refuse.follow")], "Sam’s read") + factsBlockHtml(d, false) + chips + "</div>";
    return head + exactCarSalesHtml(d) + poolGridHtml(cards, "What has sold") + sellHtml();
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
  // Mockup match round, Oct 2026: "All N comparable sales" dates read "Oct 7, 2026" when the
  // engine gives a day (c.date, YYYY-MM-DD), else "Oct 2026" (monShort) when only a month is known.
  function fullDateOrMonth(c) {
    var p = String((c && c.date) || "").slice(0, 10).split("-");
    if (p.length === 3 && +p[2] > 0) {
      var M = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return ((M[+p[1]] || "") + " " + (+p[2]) + ", " + p[0]).trim();
    }
    return (c && c.month) || monShort(c && c.date) || "";
  }
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
  // Job 4 (round two, Sam's decision): the "One question first" price-split intake screen
  // (thinIntakeHtml/thinIntakeCopy/HT_MARKER_PHRASE, the [data-thinsplit]/[data-htskip] chips and the
  // htChoice state that tracked an answer) is deleted entirely - the page renders the engine's answer
  // for the typed words directly, never a blocking question first. If the engine still returns an
  // intake split (ht.intake truthy), it is simply ignored (thinScope below is always called with a
  // null choice, which already returns the full unscoped receipts - the exact behavior the screen's
  // own "Just show what sold" skip used to produce, now simply what always happens); flagged under
  // FOR LANE B so Lane B can confirm their own removal landed.
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
  // Adapts the thin tier's own hammer-shaped receipts to the price-card shape the chart/sales-row/
  // all-sales table all read (price/title/image/platform/month/date/url/id) - price is allIn when a
  // house reconciled one, else the hammer. Shared by thinHeroHtml (the chart's dots), salesRowHtml's
  // fallback cards and moreComparableSalesHtml (the full table), so all three thin-tier sections read
  // the exact same pool.
  function thinCardsFrom(scope) {
    return (scope || []).filter(function (rc) { return rc && (Number(rc.allIn) > 0 || Number(rc.hammer) > 0); }).map(function (rc) {
      return { price: rc.allIn || rc.hammer, url: rc.url, platformSlug: rc.slug, id: rc.id, image: rc.image, title: rc.title,
        mi: Number(rc.mileage) > 0 ? Number(rc.mileage) : null, platform: rc.venue, month: monthYear(rc.date), date: rc.date };
    });
  }
  // THIN-TIER HERO (task #39, hero-rebuild round; chart + WHERE THEY SOLD headline, Market Check
  // result-page spec, Oct 2026): same two-column shell as the range hero, with an ink (never green)
  // headline gated on the SAME 8-sale floor the engine's own factsBlock already enforces
  // (factsBlockFrom, lib/onebox.js, RANGE_THRESHOLD) - below that, count line only, exactly per the
  // brief. The chart's dots are thinCardsFrom(scope) (the hammer-shaped receipts, adapted) - never
  // d.cards, a different, unscoped array an intake split never narrows. No mileage line, no identity
  // line, ever, on this tier.
  // Job 1 (round two, Sam's review): ONE scope-line format on every page, whatever rung or tier - the
  // thin tier used to build its own separate scope+count sentence here (the old countTxt/scopeTxt/
  // fullLine below), different from the result tier's heroMetaLine, so a car that landed on this tier
  // (CLK DTM, 275 GTB) carried the OLD shape while a car on the result tier (the Speedster) already
  // had the new one - two formats live at once, several facts stated twice (the old countTxt's own
  // "the latest on {date}" duplicated heroLatestText's clause once both existed; freshLine's "Sales
  // through X. Latest sale: Y." duplicated it again). Now calls the SAME heroMetaLine(d, poolLen) the
  // result tier's hero already uses - poolLen is the exact tile-pool length (newestFirst.length, the
  // array this render's own tiles are built from), never d.soldCount (which this tier never sets) or
  // a second-sourced count.
  function thinHeroHtml(d, name, scope, ht, m, thinTile, poolLen) {
    var left = '<p class="eyebrow hero-label">Market Check</p>' +
      '<h1 class="hero-carname">' + esc(m ? (m.displayName || appendChosenLabel(carLabel(d.resolvedCar))) : appendChosenLabel(cap(name))) + "</h1>";
    left += heroMetaLine(d, poolLen);
    // Shared card (Sam, Oct 2026, card job): the thin tier has its own separate hero function (this
    // one) - never routes through heroRangeHtml - so it needs its own call to the same shared card.
    // The house-steered shape (most/all sales at auction houses) carries no top-level cluster/poolN;
    // the card gates on qualifyingTotal instead (detection only, never displayed) and shows its own
    // spread-too-wide line rather than staying silent - see lib/sellsForCard.js's own FOR LANE B note.
    // e63 (Sam, Oct 19 2026; Lane C as integrator, Lane A away): ONE list. The sale tiles below are this tier's list, so the
    // card draws the engine's line and latest sale without its own rows; no sale prints twice.
    left += (window.sellsForCardHtml ? window.sellsForCardHtml(d, { rows: false }) : "");
    var ol = olderOutsideLine(d); if (ol) left += '<p class="hero-noband" data-stage="answer">' + lint(esc(ol), "hero.thin.older") + "</p>";
    // The page's own house/online lines are gone (Sam, Oct 19 2026; Lane C as integrator, Lane A away): the engine's line
    // and latest-sale line on the card are the only explanation under a thin card.
    var gpat = gearboxPatternLine(scope); if (gpat) left += '<p class="hero-noband" data-stage="answer">' + lint(esc(gpat), "hero.thin.gpat") + "</p>";
    // REMOVED (Sam's review, found live on the 275 GTB): this used to print an "ink" headline range
    // from d.factsBlock.lowest/highest once poolLen reached 8, regardless of whether the engine ever
    // decided there was a real cluster for this car - the thin tier exists precisely BECAUSE there is
    // no cluster (d.cluster, the result tier's own gate, is never set here), so factsBlock's lowest/
    // highest are just the raw min/max of a price-diverse, non-clustered pool (275 GTB: $1,215,000 to
    // $3,481,000 across nine very different cars), not a typical band. Rule 24 ("no headline dollar
    // figure without a band") applies on this tier exactly as it does on the result tier; the only
    // legitimate range headline lives in heroRangeHtml, gated on d.cluster. The individual sale
    // prices are unaffected - they are still every tile's own price, right below.
    // Job 7 (round two): d.variantOptionsLine reaches the labelled-rung thin tier too (confirmed
    // live, 275 GTB) - the result tier's own identity-line wrapper (body/trim/gearbox) does not
    // apply here, so this calls the variant line directly rather than the full heroIdentityLineHtml.
    var varLine = variantOptionsLineHtml(d); if (varLine) left += '<div class="hero-divider"></div>' + varLine;
    // Candles only (engine's own d.trend quarters) - same rule as the result tier, no scope-filtered
    // fallback any more.
    var right = heroChartHtml(d);
    var full = "";
    if (!right) {
      if (thinTile) { left += thinTile.said; left += thinTile.asideBlock; right = thinTile.right; full = thinTile.full || ""; }
      else left += noChartLineHtml();
    }
    return '<section class="hero2col" data-stage="answer"><div class="hero-left">' + left + "</div>" +
      (right ? ('<div class="hero-right">' + right + "</div>") : "") + "</section>" + full;
  }
  // thinReasonHtml (the thin tier's own "None sold through live online marketplaces..." sentence)
  // was deleted this round (job 1, round two) - it duplicated the new unified scope line's own
  // count+latest facts on the exact pages Sam flagged (CLK DTM). FACTS_REASON_SENTENCE stays; it is
  // still read by factsBlockHtml below for the refusal tier, untouched.
  // htPairsHtml ("the same car, twice") and siblingHtml (the "widen" box) were deleted this round
  // (Market Check result-page spec, Oct 2026) along with their only caller (thinHtml) - neither is
  // in the brief's enumerated section list; flagged in docs/lane-notes.md.
  // Facts block (Round 4 Job 3 engine contract, Lane A render job): every number here is
  // d.factsBlock, the engine's own mapEngineAnswer() output - count/window/lowest/highest/latest
  // price+month, never recomputed from the cards in this file. Rule 24 still applies at this rung:
  // "sold between X and Y" states two individual sale prices as facts, never a computed typical/
  // middle band (the price-record-deferral precedent, rule 23's "cars like this sold between $X
  // and $Y"), so it never reads as a range headline. includeReason=false skips the second line
  // when the caller's own headline already states what was measured (the thin tier's 300SL fix),
  // so the same sentence is never printed twice.
  var FACTS_REASON_SENTENCE = {
    // Part 1 follow-up (Oct 2026, found while wiring this exact sentence to the thin tier -
    // Lane B2's CLK DTM report confirmed the same spot): obNumWordLow(0) fell through to the bare
    // digit "0" (NUMWORD's own array starts at index 0 with "", which is falsy) - "Only 0 sold..."
    // was never spelled, and "Only none sold" would read wrong once it is. Zero drops "Only"
    // entirely ("None sold...") rather than trying to spell a number that reads awkwardly either way.
    too_few_online_for_a_range: function (fb) {
      if (!fb || fb.onlineLiquidityN == null) return "Too few sold through live online marketplaces in that time to mark a typical band.";
      var n = fb.onlineLiquidityN;
      return (n === 0 ? "None" : "Only " + obNumWordLow(n)) + " sold through live online marketplaces in that time, too few to mark a typical band.";
    },
    too_few_in_window: function () { return "Too few sales in the window to mark a typical band."; },
    too_spread_unresolved: function () { return "These sales vary too widely in spec and condition to trade as one market."; },
    body_not_offered_for_this_car: function () { return "That body style was not offered for this car."; }
  };
  function monthLabelFromYM(ym) {
    var p = String(ym || "").split("-");
    return (p.length === 2 && MONTHS_FULL[Number(p[1]) - 1]) ? (MONTHS_FULL[Number(p[1]) - 1] + " " + p[0]) : String(ym || "");
  }
  function factsBlockHtml(d, includeReason) {
    var fb = d && d.factsBlock; if (!fb || !fb.count) return "";
    // Round 7 (Oct 2026): the new bottom rung (d.fallbackRung === "not_enough_data") is count-only
    // by rule - no dollar figures at all, not even lowest/highest - matching the class-era rung's
    // own, already-shipped treatment. Dormant until Lane B sets fallbackRung; every other caller
    // (thin/refusal, which genuinely are this car's own sales, just too few for a band) keeps its
    // existing lowest/highest/latest-price shape exactly as today.
    var countOnly = d && d.fallbackRung === "not_enough_data";
    // Number words one to ten in sentences (copy rule): this line leads with the count, so cap()
    // alone (meant for a letter-starting string) would silently leave a bare leading digit un-
    // spelled - obNumWord already handles the one-to-ten case and the thousands separator above ten.
    var bits = [obNumWord(fb.count) + (fb.count === 1 ? " sale" : " sales")];
    if (fb.window) bits.push(fb.window);
    var line1 = cap(bits.join(" "));
    if (!countOnly && fb.lowest != null && fb.highest != null) line1 += (fb.lowest === fb.highest) ? (", sold at " + usd(fb.lowest)) : (", sold between " + usd(fb.lowest) + " and " + usd(fb.highest));
    if (countOnly && fb.latestMonth) {
      line1 += ", most recently " + esc(monthLabelFromYM(fb.latestMonth));
    } else if (!countOnly && fb.count !== 1 && fb.latestPrice != null && fb.latestMonth) {
      // Skip "most recently" on a single sale - it would just restate the same price a second time.
      line1 += ", most recently " + usd(fb.latestPrice) + " in " + esc(monthLabelFromYM(fb.latestMonth));
    }
    line1 += ".";
    var reasonFn = includeReason !== false ? FACTS_REASON_SENTENCE[d.reasonFlag] : null;
    var line2 = reasonFn ? reasonFn(fb) : "";
    return '<p class="ans-line facts-block">' + lint(esc(line1), "facts.block") + "</p>" + (line2 ? '<p class="ans-line facts-reason">' + lint(esc(line2), "facts.reason") + "</p>" : "");
  }
  // ORDER AND NOTHING ELSE applies to the thin tier too (Market Check result-page spec, Oct 2026):
  // hero, sales behind this answer, live right now, all N comparable sales, distribution (never
  // fires below the 20-sale floor), sell band, task line. htPairsHtml ("the same car, twice") and
  // siblingHtml (the "widen" box) are gone - neither is in the brief's enumerated list; flagged in
  // docs/lane-notes.md. The thin tier's own "This exact car" VIN card is gone too, for the same
  // reason the range tier's is (resultHtml's own note) - consistency, not an oversight.
  function thinHtml(d, m) {
    var ht = d.thin;
    htLastD = d;
    if (!ht || !ht.receipts || !ht.receipts.length) return refusalHtml(d, m); // safety: never dead-end
    var name = bareNameOf(d, m);
    // Job 4 (round two, Sam's decision): the "One question first" price-split intake screen is gone
    // - the page renders the engine's answer for the typed words directly. thinScope's own choice
    // param is always null now (never answered, never will be - htChoice/thinIntakeHtml/
    // thinIntakeCopy/HT_MARKER_PHRASE are deleted below), which already made it return the FULL
    // unscoped receipts with no label (thinScope's own first line) - exactly the old "Just show what
    // sold" skip's own behavior, now simply what always happens.
    var sc = thinScope(ht.receipts, ht.intake, null);
    var scope = sc.scope;
    // A gearbox tag shows only when the pool has a real manual-vs-non-manual split.
    htGearboxSplit = (function () { var man = 0, non = 0; (scope || []).forEach(function (rc) { if (rc.isHouse) return; var g = gearboxLabel(rc); if (!g) return; if (/^manual/i.test(g)) man++; else non++; }); return man > 0 && non > 0; })();
    // Newest first (the honest evidence order); the engine's hammer-desc order is for its own math.
    var newestFirst = thinCardsFrom(scope).sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    var thinTile = thinTileTreatment(d, m, newestFirst, d.setAsideRows);
    var body = thinHeroHtml(d, name, scope, ht, m, thinTile, newestFirst.length);
    body += exactCarSalesHtml(d);
    if (!(thinTile && thinTile.suppressSalesRow)) body += salesRowHtml(d, m, newestFirst);
    body += livePanelSlot();
    // Job 6a (round two): the full comparable-sales table is redundant once every sale is already a
    // tile - suppressed on the same gate as the sales-row teaser above. id="more-sales" (hero-rebuild
    // round, kept) still exists on pages that keep the table (over 16 sales).
    if (!(thinTile && thinTile.suppressSalesRow)) body += moreComparableSalesHtml(d, m, newestFirst);
    body += distributionHtml(d);
    // One Box NEVER recommends a house or platform; "Ready to sell?" is the only bridge to /sell.
    body += sellHtml();
    body += samOnItHtml(d, m);
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
  // Number words one to ten in sentences (copy rule, result-page-polish round): extended from five
  // to ten - reused by the live-right-now headline/placing sentence and the "see all N live" footer.
  // Round 7 (Oct 2026): eleven and up render as digits with a thousands separator (3,715), never a
  // bare "3715" - the one shared spot every caller already routes through, so fixing it here
  // covers every surface, including the new fallback-ladder rendering below.
  var NUMWORD = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  function obNumWord(n) { return NUMWORD[n] || Number(n).toLocaleString("en-US"); }
  function obNumWordLow(n) { var w = NUMWORD[n]; return w ? w.toLowerCase() : Number(n).toLocaleString("en-US"); }
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
    // URGENT fix (Oct 2026, SL-Class class-era leak + rule 24): class-era is cross-model/cross-car
    // evidence, never this car's own market, so it never earns a dollar RANGE headline (rule 24:
    // no headline figure without a real band of THIS car's own comparable sales) - the old <h1
    // class="range band"> + tail/outlier sentences asserted exactly that, unconditionally, every
    // time this tier rendered. No "Only N" phrasing (banned - a value judgment on a number, and
    // "N" was never what gated this tier: the exact-model pool being EMPTY is what did, already
    // stated by the lead sentence above).
    var leadTxt = ce.rangeSuppressed
      ? "No " + esc(carName) + " has sold in " + HT_WINDOW_TEXT + ", and the wider " + era + " " + make + " market is too spread out to mark a typical range." + (ce.suppressReason ? " " + esc(ce.suppressReason) : "") + (ce.askNarrow && ce.askNarrow.question ? " " + esc(ce.askNarrow.question) : "")
      : exactSold
      ? "The only recent " + esc(carName) + " sale on record is this car" + (saleBits.length ? " (" + saleBits.join(", ") + ")" : "") + "."
      : "No " + esc(carName) + " has sold in " + HT_WINDOW_TEXT + ".";
    var shown = ce.receipts.slice(0, 8);
    var byDateDesc = ce.receipts.slice().sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    var latest = byDateDesc[0] || null;
    // Round 6 Job 3 (Oct 2026): count-only rung. The window is already stated once by leadTxt
    // above (HT_WINDOW_TEXT, the same constant the fetch itself uses), so this line never repeats
    // it - count and latest sale month only, no dollar figures anywhere on this rung (also closes
    // the CLK DTM defect 2 leak independently found this round - the old line computed its own
    // min/max straight off the receipts, bypassing lowHammer/highHammer entirely). Round 6 Job
    // 2: never pluralise the make by appending "s" ("Mercedes-Benzs") - "sales" is the plural
    // word, the make itself stays exactly as the engine returned it, same pattern already used by
    // this function's own eyebrow and section heading just below.
    var factsTxt = (!ce.rangeSuppressed && ce.receipts.length)
      ? (era + " " + make + " sales: " + obNumWordLow(ce.receipts.length) + " sold" + (latest && latest.date ? ", most recently " + esc(monShort(latest.date)) : "") + ".")
      : "";
    var out = '<section class="anscard solo livetake blk" data-stage="answer"><div class="ans-main">' +
      '<div class="eyebrow">' + esc(ce.era + " " + ce.make + " sales · the wider market") + "</div>" +
      '<p class="landed lead">' + lint(leadTxt, "ce.lead") + "</p>" +
      (factsTxt ? '<p class="ans-line ce-facts">' + lint(factsTxt, "ce.facts") + "</p>" : "") +
      freshLine(d) + "</div></section>";
    if (m) out += '<div class="cards5 single" data-stage="cards">' + vinHeroCardHtml(m, d.resolvedCar) + "</div>";
    out += '<div class="sec-head" data-stage="cards"><div><h2>' + lint(era + " " + make + " sales, " + spanRange(ce.receipts), "ce.reclab") + "</h2></div></div>";
    out += '<div class="grid2" data-stage="cards">' + shown.map(function (rc) { return receiptCardHtml(rc); }).join("") + "</div>";
    out += sellHtml();
    return out;
  }

  // Fallback-ladder rendering (Round 7, Oct 2026): DORMANT until Lane B's model-first ladder lands
  // d.rungLabel/d.fallbackRung/d.siblingName on the engine answer, replacing the old make-era
  // fallback. Reads only those fields, verbatim - no count or label is computed here, and nothing
  // renders when they are absent, so every page is byte-identical to today until the fields exist.
  // "The line above the count or range" - shown once, outside any one tier's own body, so it is in
  // the same place for a range, a thin pool, or a class-era read alike.
  // sibling: d.rungLabel already reads as a complete clause ("Closest: CLK 55 AMG, 2000s") per the
  // engine contract - this prepends an honest lead about the asked car's OWN pool. The sibling rung
  // fires whenever that pool is under the minimum, which can be zero OR a handful of real sales
  // (Oct 2026 fix) - "No sales yet" is only true at poolSize 0; 1-10 gets "{count} sales so far"
  // instead, so the line never claims zero when the engine actually has a couple on record.
  function siblingLeadHtml(d) {
    var n = d.poolSize;
    var car = carLabel(d.resolvedCar);
    if (n == null) return "";
    if (n === 0) return "No " + car + " sales yet. ";
    if (n >= 1 && n <= 10) return obNumWord(n) + " " + car + " " + (n === 1 ? "sale" : "sales") + " so far. ";
    if (typeof console !== "undefined" && console.warn) console.warn("rungLabelHtml: sibling rung with poolSize > 10", n);
    return "";
  }
  // Round 9 (Oct 2026, live data): the engine's ladder is live, so this now has real rungLabel text
  // on every answer, not just the dormant Round 7/8 proof. Three shapes: sibling keeps its own lead
  // sentence (unchanged); the bottom not_enough_data rung has nothing to add here - the facts block
  // inside the tier's own body is already the honest count-only scope statement for that case; every
  // other rung gets the plain "Matched to {rungLabel}" lead so a reader always knows which cars
  // produced the number, verbatim off the engine, never composed from parts here.
  function rungLabelHtml(d) {
    if (!d || !d.rungLabel) return "";
    var label = String(d.rungLabel);
    if (d.fallbackRung === "sibling") return '<p class="rung-label" data-stage="answer">' + lint(esc(siblingLeadHtml(d) + label), "rung.label") + "</p>";
    if (d.fallbackRung === "not_enough_data") return "";
    return '<p class="rung-label" data-stage="answer">' + lint(esc("Matched to " + label), "rung.label") + "</p>";
  }

  function renderResults(d) {
    // Search box, resolved car line (VIN MATCH pill on an exact match), then the tier body. Every
    // branch renders from the engine's structured facts - no fabricated numbers, ever.
    obGbApplies = !!(d && d.gearboxApplies);   // item 4: gate the hero gearbox line
    obLastD = d;
    // Item 2: capture the UNREFINED bodyOptions/trimQuestion (+ the unrefined soldCount, for "Any")
    // whenever the engine actually sends fresh ones - never overwritten by a refined answer's null
    // (the whole point is surviving past that). See heroBodyLineHtml/heroTrimLineHtml.
    if (d && Array.isArray(d.bodyOptions) && d.bodyOptions.length) obIdOrigBody = { options: d.bodyOptions, poolN: d.soldCount };
    if (d && d.trimQuestion && Array.isArray(d.trimQuestion.options) && d.trimQuestion.options.length) obIdOrigTrim = { model: d.trimQuestion.model, options: d.trimQuestion.options, poolN: d.soldCount };
    // Job 7 (round two): same survive-the-refine capture, for d.variantOptionsLine.
    if (d && Array.isArray(d.variantOptionsLine) && d.variantOptionsLine.length) obIdOrigVariantLines = d.variantOptionsLine;
    var m = vinAnchor;
    // The duplicate car line (Oct 2026, Sam's live review; extended to "thin" in the hero-rebuild
    // round): "result" and "thin" each render their own car-name heading at the top of the new hero
    // (heroRangeHtml / thinHeroHtml), so this outer copy (used by every OTHER tier - refusal,
    // class_era, not_tracked... - which have no such heading of their own) must not render a second
    // time for either of those two.
    var head = (d.tier !== "result" && d.tier !== "thin" && (d.resolvedCar || m)) ? carLineHtml(d, m) : "";
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
    else { body = samMsgHtml([lint(esc("Not enough real " + carLabel(d.resolvedCar) + " sales for an honest read, and nothing here is made up. Try another car and Sam pulls what actually sold."), "zero")], "Sam’s read", "big") + sellHtml(); foot = true; }
    // "Matched to ..." is gone from both "result" and "thin" (hero-rebuild round, Oct 2026): their
    // new heroes (heroRangeHtml / thinHeroHtml) never print that sentence, so it must not render at
    // this shared top level for them either. Every other tier (class_era, refusal...) is unchanged -
    // it keeps rendering here exactly as Round 7/8 shipped it.
    root.innerHTML = inboxHtml(lastQuery, "Your car or its VIN") + head + ((d.tier === "result" || d.tier === "thin") ? "" : rungLabelHtml(d)) + body + (foot ? footHtml() : "");
    wire();
    streamReveal();
    if (d.tier === "result" || d.tier === "thin") loadLivePanel(d, m);
    // Sign-in-then-continue (item 3): a no-op unless a watch arm is pending from before a Google
    // sign-in redirect (boot()'s mcApplyFromUrl just rebuilt this same result fresh).
    if (d.tier === "result") tryResumeWatchArm();
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
  // Job 6b (round two): "Real sales only." read as a dangling bullet under a question's own chip
  // row, with no rule above it to sit under - question screens never append footHtml() any more.
  function renderQuestion(html) {
    root.innerHTML = inboxHtml(lastQuery, "Your car or its VIN") + html;
    wire();
  }
  // renderRefineChoice (gearbox_choice/variant_choice as a bare-chip refine) had no remaining
  // caller - both tiers route through renderIdentityQuestion instead (the flat identity takeover),
  // confirmed by grep before deleting. Deleted rather than left dead.
  //
  // FLATTENED (Job 3, Sam's follow-up round, Oct 2026): generation_choice, body_choice, and the
  // VIN-decode/typo model-clarification flow (both call this same function, see vinResolve) now
  // share the SAME no-box/no-pill/no-badge shell identityTakeoverHtml/modelChoiceTakeoverHtml
  // already use - label, car/make name (when known), the question in ink serif, a grey line, plain
  // green text-link options with arrows. Click mechanisms are completely UNCHANGED: [data-genquery]/
  // [data-model]/[data-body] are already wired generically in wire() (by attribute, not by class or
  // element), so restyling the buttons as .linkbtn text instead of .chip pills does not touch how
  // an answer is recorded. No per-option counts here (none of these three option shapes carry one).
  // SHARED QUESTION SCREEN (item 4, mockup match round, Oct 2026): every question screen - VIN
  // confirm, generation, model, body, typo-clarification, the identity takeover (gearbox/
  // competition/documented-history) and the bare-make "Which BMW?" case - renders on this ONE
  // layout: full container width (no hero2col 6fr/6fr split - there is nothing to put in a second
  // column here), the question at car-name size (reuses .hero-carname, the exact class/size item 2
  // measured off the live Mustang page), options and actions in a real row with generous flex gap
  // (not the old tight inline .hero-idline text flow), no boxes/pills/chips. "Real sales only."
  // comes from footHtml(), already appended by renderQuestion() below every screen - not repeated
  // here.
  function idqScreenHtml(o) {
    return '<section class="idq-screen" data-stage="answer">' +
      '<p class="eyebrow hero-label">Market Check</p>' +
      (o.headName ? ('<h1 class="hero-carname">' + esc(o.headName) + "</h1>") : "") +
      (o.pre ? ('<p class="hero-scope" data-stage="answer">' + lint(esc(o.pre), (o.lintKey || "idq") + ".pre") + "</p>") : "") +
      '<h2 class="hero-carname idq-question">' + lint(esc(o.question), o.lintKey || "idq.q") + "</h2>" +
      (o.subline ? ('<p class="hero-scope" data-stage="answer">' + lint(esc(o.subline), (o.lintKey || "idq") + ".sub") + "</p>") : "") +
      '<div class="idq-options-row" data-stage="answer">' + o.links + "</div>" +
      "</section>";
  }
  function renderChoice(d) {
    var isGen = d.generationOptions && d.generationOptions.length;
    var opts = isGen ? d.generationOptions : (d.modelOptions || d.bodyOptions || []);
    var kind = isGen ? "gen" : (d.modelOptions ? "model" : "body");
    if (!isGen && d.modelOptions && d.resolvedCar) opts = obDropRejectedChips(d.resolvedCar.year, d.resolvedCar.make, opts);
    // Base a chip appends its answer to: a passed baseLabel (year+make on a VIN model ask), else
    // the resolved car (year+make+model+trim on a body ask), so a body answer re-queries the SAME
    // car and a VIN chip never appends to the VIN (which re-decodes and loops). Generation chips
    // carry a full query of their own and never touch choiceCtx.
    if (!isGen) choiceCtx = d.baseLabel || (d.resolvedCar ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model, d.resolvedCar.trim].filter(Boolean).join(" ") : null) || null;
    var headName = d.baseLabel || carLabel(d.resolvedCar) || lastQuery || "";
    var question = d.prompt || (isGen ? "Which generation is it?" : "Which one is it?");
    var links = (opts || []).map(function (o) {
      if (kind === "gen") return '<button type="button" class="linkbtn idq-opt" data-genquery="' + esc(o.query) + '">' + esc(o.label) + " &#8594;</button>";
      var attr = kind === "model" ? "data-model" : "data-body";
      return '<button type="button" class="linkbtn idq-opt" ' + attr + '="' + esc(o) + '">' + esc(o) + " &#8594;</button>";
    }).join("");
    renderQuestion(idqScreenHtml({ headName: headName, question: question, subline: "The range changes with the answer.", links: links, lintKey: "choice" }));
  }
  // Identity question (Round 4 Job 3 engine contract, Lane A render job): dimension/options/
  // skipLabel are the engine's own identityQuestion payload, nothing computed here. Round 6 Job 4
  // (Oct 2026): Lane B's TIER_DIMENSION fix (lib/onebox.js) reconciled the mismatch this comment
  // used to flag - variant_choice now gives "competition" and dochistory_choice now gives
  // "documented_history", matching the lane-notes contract and every other caller's own marker
  // string. Updated here to match; every other dimension name was already correct and is kept.
  var IDQ_REFINE_KEY = { gearbox: "tx", competition: "variant", body: "body", documented_history: "docHistory" };
  function idqValueFor(dim, label) {
    if (dim === "gearbox") return /manual/i.test(label) ? "manual" : "auto";
    if (dim === "competition") return /competition/i.test(label) ? "competition" : "standard";
    if (dim === "documented_history") return /^has/i.test(label) ? "has" : "nohas";
    if (dim === "body") return String(label || "").toLowerCase();
    return null;
  }
  // ================= IDENTITY-QUESTION TAKEOVER (task #40, hero-rebuild round) =================
  // Full-takeover screen for a BLOCKING identity question (iq.blocking, set by mapEngineAnswer):
  // today that is gearbox_choice, variant_choice and dochistory_choice (the runPool dispatch below,
  // unchanged) - each already carries a real per-option count via the engine's optionCounts field
  // (identityQuestionFrom, lib/onebox.js), which is what the approved design's "Coupe (29 sales) ->
  // Cabriolet (13 sales) ->" example calls for. model_choice/generation_choice/body_choice stay on
  // the older renderChoice/qscreenHtml/chipAnswer path, deliberately not moved here this round: the
  // brief's own example happens to read like a body question, but body_choice's chip answers work by
  // appending to the query text and fully re-resolving (chipAnswer), not by an inline refine on the
  // same pool the way gearbox/competition/documented-history do - moving it onto this screen would
  // mean rewiring its click handler to a mechanism (refine.body on a pre-ladder question) never
  // proven live, a real regression risk for an untested gain. Flagged in the round report.
  // The brief's screen is a closed list ("nothing else on the page"): no skip link renders here,
  // unlike the old identityQuestionHtml/idqSwitchChipHtml this replaces - both always offered a way
  // past the question (the engine's own skipLabel chip, and a "switch sides" chip after answering).
  // That is a deliberate, real behavior change made to follow the brief literally; flagged plainly in
  // the round report, not silently dropped.
  function idqBothLine(iq) {
    // Labels print exactly as the engine gives them (never lowercased) - an acronym like "PDK"
    // would otherwise read as "pdk", a real bug a first pass at this shipped and prePush's own
    // live proof caught.
    var labels = (iq.options || []).map(function (o) { return String(o.label || ""); }).filter(Boolean);
    if (labels.length === 2) return "Both " + labels[0] + " and " + labels[1] + " have enough sales to answer separately.";
    if (labels.length > 2) return "Each of " + obListPhrase(labels) + " has enough sales to answer separately.";
    return "Each side has enough sales to answer separately.";
  }
  function idqQuestionText(iq, d) {
    var labels = (iq.options || []).map(function (o) { return String(o.label || ""); }).filter(Boolean);
    if (labels.length === 2) return labels[0] + " or " + labels[1] + "?";
    if (labels.length > 2) return labels.slice(0, -1).join(", ") + " or " + labels[labels.length - 1] + "?";
    return (d && d.prompt) || "Which is it?";
  }
  function identityTakeoverHtml(d) {
    var iq = d && d.identityQuestion; if (!iq) return "";
    var links = (iq.options || []).map(function (o) {
      var val = idqValueFor(iq.dimension, o.label);
      var n = o.count != null ? digitOf(o.count) : null;
      var countTxt = Number.isFinite(n) ? (" (" + idLineNum(n) + (n === 1 ? " sale" : " sales") + ")") : "";
      return '<button type="button" class="linkbtn idqchip idq-opt" data-idq-dim="' + esc(iq.dimension) + '" data-idq-val="' + esc(val || "") + '" data-mlabel="' + esc(o.label) + '">' + esc(o.label) + countTxt + " &#8594;</button>";
    }).join("");
    return idqScreenHtml({ headName: carLabel(d.resolvedCar), pre: idqBothLine(iq), question: idqQuestionText(iq, d), subline: "The range changes with the answer.", links: links, lintKey: "idq" });
  }
  // MODEL CHOICE, the bare-make case ("Which BMW?", Market Check result-page spec, Oct 2026): the
  // SAME no-box/no-pill takeover shell as identityTakeoverHtml above, now covering d.tier ===
  // "model_choice" too - reuses the EXISTING [data-model] click mechanism (chipAnswer, wire())
  // unchanged, only the markup/style changes, not how an answer is recorded. No per-option counts
  // (d.modelOptions carries none). body_choice/generation_choice stay on the older qscreen/chip path
  // - not named in the brief's own "bare make" example, and body_choice's answer mechanism re-queries
  // the whole car rather than refining in place; rewiring it is a real regression risk for an
  // untested gain. Flagged plainly in docs/lane-notes.md.
  function modelChoiceTakeoverHtml(d) {
    var opts = d.modelOptions || [];
    if (d.resolvedCar) opts = obDropRejectedChips(d.resolvedCar.year, d.resolvedCar.make, opts);
    choiceCtx = d.baseLabel || (d.resolvedCar ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model, d.resolvedCar.trim].filter(Boolean).join(" ") : null) || null;
    var make = (d.resolvedCar && d.resolvedCar.make) || String(d.baseLabel || "").trim().split(/\s+/).pop() || "";
    var headName = d.baseLabel || carLabel(d.resolvedCar) || make;
    var question = make ? ("Which " + make + "?") : (d.prompt || "Which one is it?");
    var links = opts.map(function (o) {
      return '<button type="button" class="linkbtn idq-opt" data-model="' + esc(o) + '">' + esc(o) + " &#8594;</button>";
    }).join("");
    return idqScreenHtml({ headName: headName, question: question, subline: "The range changes with the answer.", links: links, lintKey: "mc" });
  }
  function renderIdentityQuestion(d) {
    obLastD = d;
    var iq = d.identityQuestion;
    renderQuestion(identityTakeoverHtml(d));
    if (typeof gasTrack === "function" && iq) gasTrack("identity_question_shown", { dimension: iq.dimension, option_count: (iq.options || []).length });
  }
  // VARIANT-CHOICE TAKEOVER (job 2, Sam's review round, Oct 2026): d.variantChoices is the engine's
  // own real per-market chip list (key/label/count/refine - Lane B's FOR LANE A note), a genuinely
  // separate-markets split, not the Competition Package's plain variantOptions strings. Same chip
  // shape as every other takeover screen (idqScreenHtml) plus an Any chip (this screen family had
  // none before) - the same "every option, plus the unsplit total" pattern the in-result "Which
  // 911?" identity line uses, applied here pre-answer: there is no "chosen" state yet (nothing has
  // been answered), so every option is always a live link, never plain text. Any's own count is the
  // sum of the engine's own two (or more) given counts - both are the engine's own numbers, just
  // added together, since this pre-answer screen carries no separate combined-pool total to read.
  function variantChoiceTakeoverHtml(d) {
    var choices = (d && d.variantChoices) || [];
    var counts = choices.map(function (c) { return digitOf(c.count); });
    var totalKnown = counts.every(function (n) { return Number.isFinite(n); });
    var total = totalKnown ? counts.reduce(function (sum, n) { return sum + n; }, 0) : null;
    var links = choices.map(function (c, i) {
      var n = counts[i];
      var countTxt = Number.isFinite(n) ? (" (" + idLineNum(n) + (n === 1 ? " sale" : " sales") + ")") : "";
      return '<button type="button" class="linkbtn idq-opt" data-variantopt="' + esc(c.key) + '" data-mlabel="' + esc(c.label) + '">' + esc(c.label) + countTxt + " &#8594;</button>";
    }).join("") + (total != null ? ('<button type="button" class="linkbtn idq-opt" data-variantopt-any="1">Any (' + idLineNum(total) + ") &#8594;</button>") : "");
    return idqScreenHtml({ headName: carLabel(d.resolvedCar), question: d.prompt || "Which is it?", subline: "The range changes with the answer.", links: links, lintKey: "variantq" });
  }
  // TRIM-CHOICE TAKEOVER (Lane F, Oct 20 2026; the 1965 Mustang Coupe dead end): the engine's tier "trim_choice" had no
  // branch here, so it fell to the generic fallback and read "Not enough real ... sales", a claim the engine never made.
  // It now draws like the other question tiers: the engine's own prompt and its own chip words (trimChips, each with its
  // count), each a button that re-asks with that option's own refine (trimOptions[i].value, and for "Other trims" the
  // named trims it leaves out). No wording of the page's own.
  function trimChoiceTakeoverHtml(d) {
    var opts = (d && d.trimOptions) || [], chips = (d && d.trimChips) || [];
    var links = opts.map(function (o, i) {
      return '<button type="button" class="linkbtn idq-opt" data-trimopt="' + esc(o.value) + '" data-trimnot="' + esc((o.notTrims || []).join(",")) + '" data-mlabel="' + esc(o.label) + '">' + esc(chips[i] || o.label) + " &#8594;</button>";
    }).join("");
    return idqScreenHtml({ headName: carLabel(d.resolvedCar), question: d.prompt || "", links: links, lintKey: "trimq" });
  }
  function renderTrimChoice(d) {
    obLastD = d;
    renderQuestion(trimChoiceTakeoverHtml(d));
    if (typeof gasTrack === "function") gasTrack("identity_question_shown", { dimension: "trim", option_count: (d.trimOptions || []).length });
  }
  function renderVariantChoice(d) {
    obLastD = d;
    renderQuestion(variantChoiceTakeoverHtml(d));
    if (typeof gasTrack === "function") gasTrack("identity_question_shown", { dimension: "competition", option_count: (d.variantChoices || []).length });
  }
  function renderError(msg) {
    root.innerHTML = inboxHtml(lastQuery, "Your car or its VIN") + samMsgHtml([esc(msg)], "", "big") + footHtml();
    wire();
  }
  // The daily distinct-car limit's own card (Oct 2026, evidence-block job: reworded - overrides the
  // earlier "Sam Desk is built for ongoing or business use." card). This is Market Check's OWN daily
  // limit (10 distinct cars/device/day, lib/_ceilings.js checkMarketCheckCarLimit) - Buy and Sell are
  // unaffected by this cap. No product name, no sign-in demand, no prefilled car/search text: just an
  // email door. The visitor can still type a different car (a fresh distinct car just won't resolve
  // until tomorrow; the server enforces that, not this render).
  function renderBusinessLimit(line) {
    var msg = line || "That is today’s limit of 10 cars on Market Check. If you would like more searches, email feedback@goasksam.com and we will get you set up.";
    var mailHref = "mailto:feedback@goasksam.com?subject=" + encodeURIComponent("More Market Check searches");
    root.innerHTML = inboxHtml(lastQuery, "Your car or its VIN") +
      '<section class="samonit" data-stage="note"><p>' + lint(esc(msg), "businesslimit") + '</p><a class="linkbtn" href="' + esc(mailHref) + '">Email feedback@goasksam.com &#8594;</a></section>' +
      footHtml();
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
  var htLastD = null;  // last house-tier decision; gearboxLabel reads its resolved model
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
    // Item 7 (Sam's follow-up round): the page-side colour-in-trim workaround (1c1d040) is removed -
    // lib/vehicle.js sanitizeResolvedVehicle now cleans a trim field server-side on every path
    // (Lane B2, "COLOUR OR MODEL NAME IN THE TRIM"), so match.trim already arrives clean.
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
    var ask = "This exact car is known. Share the year, make and model and Sam pulls what similar ones have done.";
    vinAnchor = null;
    root.innerHTML = inboxHtml(lastQuery, "Your car or its VIN") + '<div class="cards5 single" data-stage="anchor">' + vinHeroCardHtml(match, null) + "</div>" +
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
    lastQuery = text; obLastRefine = null; obIdOrigBody = null; obIdOrigTrim = null; obIdOrigVariantLines = null; obLastD = null; vinAnchor = null; pendingVin = null; obSourceVin = null; choiceCtx = null; obLastVehicle = null; vinQueryNoSale = false; obWatchArmed = null; obWatchFirst = false; obIdQContext = null;
    // Identifier-shaped input (VIN or chassis) routes through the shared resolver (decode +
    // confirm + exact-match + the honest VIN-invalid / chassis lines); everything else goes
    // straight to the archive pool.
    if (obIdentifierShaped(text)) { vinResolve(text); return; }
    runPool(text, null);
  }
  // ---------------------------------------------------------------- Market Check result address
  // (Oct 2026, Sam: "Market Check results need their own address"). Scoped to /market-check only
  // (location.pathname check) - every other consumer of this shared engine (the New Sell surface
  // behind SELL_NEXT_ON) is completely unaffected. The address is REBUILT from the engine's own
  // query + refine state, never a second source of truth: car=<slugified free text> (or
  // vin=<VIN> on a VIN/chassis match) plus miles=<lo>-<hi|-> and body=/tx= once answered. A reload
  // or a pasted link runs the SAME query through the SAME engine call (run/runPool below) - never a
  // frozen snapshot - so it reads whatever is true right now, same as a fresh search would.
  // SELL (window.GAS_SELL, set by lib/sell/sellMcClient.js) is this file's own existing flag for
  // "this page is New Sell, not Market Check" - checked FIRST, same as the runPool success hook
  // above already does. location.pathname is the belt-and-suspenders second check. New Sell runs
  // its own address handling (lib/sell/sellMcClient.js) - this must never also push there, or the
  // two would fight over the history stack and break Back on both pages.
  function mcUrlActive() { return !SELL && location.pathname === "/market-check"; }
  function slugifyQuery(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function deslugifyQuery(s) { return String(s || "").replace(/-+/g, " ").trim(); }
  function mcCurrentParams() {
    var p = new URLSearchParams();
    if (vinAnchor && (obSourceVin || lastQuery)) p.set("vin", String(obSourceVin || lastQuery).toUpperCase());
    else if (lastQuery) p.set("car", slugifyQuery(lastQuery));
    else return null;
    var rf = obLastRefine;
    if (rf) {
      if (rf.miMin != null) p.set("miles", Math.round(rf.miMin / 1000) + "-" + (rf.miMax != null ? Math.round(rf.miMax / 1000) : ""));
      if (rf.body) p.set("body", rf.body);
      if (rf.tx) p.set("tx", rf.tx);
      if (rf.trim) p.set("trim", rf.trim);
    }
    return p;
  }
  // A render that came FROM popstate (the browser already changed the address bar) must never push
  // again - that would corrupt the back/forward stack. One-shot: set true right before the
  // reconstruction call, consumed (and cleared) by the next mcPushUrl() regardless of how long the
  // engine fetch in between takes.
  var mcSuppressPush = false;
  function mcPushUrl() {
    if (!mcUrlActive()) return;
    if (mcSuppressPush) { mcSuppressPush = false; return; }
    var p = mcCurrentParams(); if (!p) return;
    var qs = p.toString();
    var url = location.pathname + (qs ? "?" + qs : "");
    if (url !== location.pathname + location.search) { try { history.pushState({ mc: true }, "", url); } catch (e) {} }
  }
  function mcRefineFromParams(sp) {
    var refine = {};
    var miles = sp.get("miles");
    if (miles) {
      var m = /^(\d+)-(\d+)?$/.exec(miles);
      if (m) { refine.miMin = Number(m[1]) * 1000; refine.miMax = m[2] ? Number(m[2]) * 1000 : null; refine.miTarget = refine.miMax ? Math.round((refine.miMin + refine.miMax) / 2) : refine.miMin; refine.label = m[2] ? (m[1] + "k to " + m[2] + "k") : ("over " + m[1] + "k"); }
    }
    var body = sp.get("body"); if (body) refine.body = body;
    var tx = sp.get("tx"); if (tx === "manual" || tx === "auto") refine.tx = tx;
    var trim = sp.get("trim"); if (trim) refine.trim = trim;
    return Object.keys(refine).length ? refine : null;
  }
  // Rebuilds a result straight from the address bar (cold load, reload, a pasted link, or Back/
  // Forward) - the SAME run()/runPool() path a fresh search uses, with any answered miles/body/tx
  // threaded straight into the first fetch instead of a second round-trip.
  function mcApplyFromUrl() {
    var sp = new URLSearchParams(location.search);
    var vin = sp.get("vin"), car = sp.get("car");
    if (!vin && !car) { renderEmpty(); syncRailResults(); return; }
    var refine = mcRefineFromParams(sp);
    obAsked = 0; lastQuery = vin || deslugifyQuery(car); obLastRefine = null; obIdOrigBody = null; obIdOrigTrim = null; obIdOrigVariantLines = null; obLastD = null; vinAnchor = null; pendingVin = null; obSourceVin = null; choiceCtx = null; obLastVehicle = null; vinQueryNoSale = false; obWatchArmed = null; obWatchFirst = false; obIdQContext = null;
    if (vin) { vinResolve(vin); return; }   // VIN re-decode is the full, tested path - refine on a VIN result is a rare combo and not threaded through it.
    runPool(lastQuery, null, refine);
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
    if ("body" in partial) base.bodyLabel = partial.label;
    if ("trim" in partial) base.trimLabel = partial.label;
    if ("docHistory" in partial) base.docHistoryLabel = partial.label;
    return base;
  }
  // Mileage dim-in-place rerun (Market Check result-page spec, Oct 2026): pressing Go never leaves
  // the page. Only the two things the brief names - the headline range/no-band line and the chart
  // column - dim to 40% (CSS .hero-dim); the mileage line/field/identity line stay fully interactive.
  function dimHeroForRerun(on) {
    var els = document.querySelectorAll(".hero2col .range, .hero2col .hero-noband, .hero-right");
    Array.prototype.forEach.call(els, function (el) { el.classList.toggle("hero-dim", on); });
  }
  function submitMileageInline(v) {
    if (!(v > 0)) return;
    var band = v >= 60000 ? 25000 : 15000, lbl = "around " + Math.round(v / 1000) + "k";
    if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "mileage", value: lbl });
    // Optimistic line update (the field itself keeps its typed value, untouched): the final
    // renderResults() call below will redraw this exactly the same way once the rerun lands, from
    // obLastRefine - set here only so the wait never shows the old "Add mileage" sentence.
    var mline = document.querySelector(".hero-miles");
    if (mline) mline.outerHTML = '<p class="hero-miles on" data-stage="answer">' + lint(esc("Range narrowed around " + v.toLocaleString("en-US") + " miles."), "hero.mi.on.opt") +
      ' <button type="button" class="linkbtn" disabled>Change</button>' + milesFieldHtml(v) + "</p>";
    dimHeroForRerun(true);
    runPool(lastQuery, obLastVehicle, mergeRefine({ miMin: Math.max(0, v - band), miMax: v + band, miTarget: v, label: lbl }), { inline: true });
  }
  function runPool(text, vehicle, refine, opts) {
    opts = opts || {};
    obLastVehicle = vehicle || obLastVehicle;
    obLastRefine = refine || null;
    var loader = null;
    if (opts.inline) {
      // The current result stays on screen, dimmed (dimHeroForRerun, called by the caller before
      // this runs) - no loader screen, no root.innerHTML replace, until the fetch actually resolves.
    } else {
      setRootHtmlLifted(inboxHtml(text) + loaderHtml() + footHtml());
      wire();
      loader = makeLoader();
      loader.start(["Working out exactly what car this is", "Pulling the real sales"]);
    }
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
      // Typo confirmation (found this round, Sam's review): a typed year/body combination the
      // resolver knows is wrong (product rule 6, e.g. a Speedster typed on a 911 year with no
      // factory Speedster) - a real question, never proceeded past silently.
      if (d && d.status === "needs_confirmation" && d.clarification && d.clarification.kind === "typo_confirmation") { renderTypoConfirm(d); return; }
      if (d && d.status === "needs_clarification") {
        // Rejected model chip (Oct 2026): the engine said this exact year+make+model combination
        // does not exist - record it so a later model_choice ask for the same year+make never
        // offers it again.
        if (d.invalidVehicle) obNoteRejectedModel(d.vehicle);
        // Multi-token chassis ("1E 31588"): an exact archive match came back -> lead with the
        // "This exact car is known" callout, then the ask (same as the single-token path).
        if (d.vinArchiveMatch) { obEvent("onebox_vin_anchor_shown"); renderChassisMatch(d.vinArchiveMatch); return; }
        // Otherwise surface the resolver's OWN honest question (the VIN-invalid reword, the
        // chassis-number line, or a specific clarification) rather than a generic fallback.
        renderError((d.clarification && d.clarification.question) || "That exact car couldn’t be pinned down. Try the year, make and model together, like 1972 Porsche 911 or 1969 Ford Mustang.");
        return;
      }
      if (!d || d.status !== "one_box") { renderError(OB_CALM); return; }
      if (d.tier === "unavailable") { renderError(d.samLine || OB_CALM); return; }
      if (d.tier === "rate_limited") { renderError(d.samLine || "That’s a lot of lookups for one day. Come back tomorrow and Sam keeps pulling real sales."); return; }
      if (d.tier === "business_limit") { renderBusinessLimit(d.samLine); return; }
      if (d.tier === "model_choice") { if (d.askIndex) obAsked = d.askIndex; obLastD = d; renderQuestion(modelChoiceTakeoverHtml(d)); return; }
      if (d.tier === "body_choice" || d.tier === "generation_choice") { if (d.askIndex) obAsked = d.askIndex; renderChoice(d); return; }
      // Identity question (Round 4 Job 3 engine contract): gearbox/competition/documented-history
      // are the three BLOCKING dimensions the engine gives real per-side counts for today, routed
      // through the one generic renderer below instead of the bare-chip renderRefineChoice (which
      // showed no counts and had no skip). dochistory_choice previously had NO branch at all here -
      // it fell through to the generic "zero sales" render, a real, unobserved-live bug this closes.
      // body_choice stays on its existing renderChoice/chipAnswer path (appends to the query text
      // and fully re-resolves, rather than refine.body on the same pool) - not touched here, so no
      // number or mechanism it already relies on moves; a candidate for the same upgrade later.
      // JOB 2 (Sam's review round, Oct 2026): a variant_choice answer carrying the richer
      // d.variantChoices shape (real per-market chips: key/label/count/refine, Lane B's FOR LANE A
      // note) is a genuinely separate-markets split (e.g. 356 Speedster Pushrod vs Carrera four-cam),
      // not the binary Competition Package question - routed to its own renderer so it can offer an
      // Any chip (this screen family never had one before). variant_choice with NO variantChoices
      // (the Competition Package case) falls through to the unchanged generic renderer below.
      if (d.tier === "variant_choice" && Array.isArray(d.variantChoices) && d.variantChoices.length) { if (d.askIndex) obAsked = d.askIndex; renderVariantChoice(d); return; }
      if (d.tier === "trim_choice" && Array.isArray(d.trimOptions) && d.trimOptions.length) { if (d.askIndex) obAsked = d.askIndex; renderTrimChoice(d); return; }
      if (d.tier === "gearbox_choice" || d.tier === "variant_choice" || d.tier === "dochistory_choice") { if (d.askIndex) obAsked = d.askIndex; renderIdentityQuestion(d); return; }
      if (vinAnchor) obEvent("onebox_vin_anchor_shown");
      obSnapshotId = d.snapshotId || null; obAsOf = null; // live result: shareable, no as-of line
      obResolvedCar = d.resolvedCar || null;              // carried into the /sell handoff
      obAnalytics(d);
      // Final narrated steps, gated on real engine facts: the premium back-out line only when the
      // pool actually has auction-house sales; then "Picking the ones that matter"; then reveal.
      var finalSteps = [];
      if (resultIsHousePool(d)) finalSteps.push("Backing out the buyer’s premiums");
      finalSteps.push("Picking the ones that matter");
      var finish = function () { mcPushUrl(); if (SELL && SELL.onCar && SELL.onCar(d, text)) return; renderResults(d); };
      if (loader) loader.finish(finalSteps, finish); else finish();
    }).catch(function () { if (opts.inline) dimHeroForRerun(false); renderError(OB_CALM); });
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
  // FLATTENED (Job 3, Sam's follow-up round): same no-box shell as renderChoice above. Click
  // handlers are the SAME two id-based listeners the boxed version used, unchanged.
  function renderVinConfirm(question, vehicle) {
    var links = '<button type="button" class="linkbtn idq-opt" id="ob-vin-yes">Yes, that’s it &#8594;</button>' +
      '<button type="button" class="linkbtn idq-opt" id="ob-vin-no">No, type it instead</button>';
    renderQuestion(idqScreenHtml({ question: question || "Is this the car?", links: links, lintKey: "vinconfirm" }));
    var yes = document.getElementById("ob-vin-yes"), no = document.getElementById("ob-vin-no");
    if (yes) yes.addEventListener("click", function () { runPool(lastQuery, pendingVin); });
    if (no) no.addEventListener("click", function () { vinAnchor = null; pendingVin = null; renderEmpty(); });
  }
  // TYPO CONFIRMATION (found while screenshotting the 1986 Carrera Speedster ask, Sam's review
  // round): d.status "needs_confirmation" with clarification.kind "typo_confirmation" (product rule
  // 6 - the resolver typed a Speedster on a 911 year with no factory Speedster) reached runPool's
  // response handler with no branch at all, so it fell through to the generic "status !== one_box"
  // calm-line error - never a dead end exactly, but the wrong screen entirely, not the real
  // question. clarification.chips is a plain array of strings (car names to re-run as a fresh
  // search, plus the two action words "Change car" and "Not sure") - same no-box shell as every
  // other question screen (idqScreenHtml), same full-search mechanism (run()) every car-name chip
  // already uses elsewhere on this page.
  function typoConfirmHtml(cl) {
    var chips = Array.isArray(cl.chips) ? cl.chips : [];
    var links = chips.map(function (c) {
      return '<button type="button" class="linkbtn idq-opt" data-typo-chip="' + esc(c) + '">' + esc(c) + " &#8594;</button>";
    }).join("");
    return idqScreenHtml({ question: cl.question || "Did you mean a different car?", subline: "The range changes with the answer.", links: links, lintKey: "typoconfirm" });
  }
  function renderTypoConfirm(d) {
    obLastD = null;
    obTypoBase = (d.clarification && d.clarification.baseVehicle) || null;
    renderQuestion(typoConfirmHtml(d.clarification || {}));
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
    var nav = document.getElementById("gas-nav-results"), menu = document.getElementById("gas-results-menu");
    if (!nav || !menu) return;
    var items = recentSearches();
    if (!items.length) { nav.style.display = "none"; menu.innerHTML = ""; return; }
    nav.style.display = "";
    menu.innerHTML = items.slice(0, 8).map(function (it) { return '<a data-recent="' + esc(it.q) + '">' + esc(it.label) + "</a>"; }).join("");
    Array.prototype.forEach.call(menu.querySelectorAll("[data-recent]"), function (a) {
      a.addEventListener("click", function () { if (typeof gasToggleRail === "function") gasToggleRail(false); run(a.getAttribute("data-recent")); });
    });
  }

  // ---------------------------------------------------------------- handoff + share
  // Sell handoff (Task 5): carry the resolved car into /sell so the seller never retypes it.
  // VIN-sourced result -> hand the VIN itself, so /sell runs its full VIN flow (decode +
  // confirm + exact archive match) and the lead enrichment (VIN row + prior-sale link)
  // fires. Otherwise hand the resolved car label (falls back to the raw query).
  // Sell handoff: "See where Sam would sell it" is a real link into /sell carrying the resolved car and
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
    // Result-hero job (Oct 2026): the handoff fires the catalog's own sell_started (docs/
    // analytics-events.md) - the Sell flow's first-answer event - alongside the older onebox-only
    // funnel event above, so this entry point is counted the same way every other Sell start is.
    // Part 2 (Oct 2026): vehicle_key (lower-case make|model, never trim or VIN) and year (an
    // integer) from the resolved car, so the dashboard can see which car a handoff was for - the
    // FOR LANE A ask this answers. Nothing computed or guessed: both are omitted entirely when the
    // resolved car has no make/model or no valid year to build them from. DORMANT until Lane C adds
    // these as optional props to lib/track/catalog.js's sell_started entry (today req:{}, opt:{}) -
    // the generated gasTrack() rejects an unknown prop, so sending them now means the event is a
    // silent no-op for any handoff with a resolved car, same as every other "built ahead of the
    // landing field" job this session (Round 7's fallbackRung, Part 3's hasHistoryPage).
    if (typeof gasTrack === "function") {
      var props = {}, rc = obResolvedCar;
      if (rc && rc.make && rc.model) props.vehicle_key = (String(rc.make) + "|" + String(rc.model)).toLowerCase();
      var yr = rc && Number(rc.year);
      if (Number.isFinite(yr) && yr > 0) props.year = yr;
      gasTrack("sell_started", props);
    }
  }
  function shareResult() {
    obEvent("onebox_share_clicked");
    // Market Check: the address bar already carries this exact result (mcPushUrl), so the real,
    // readable URL in the bar IS the link - copy it directly, never a second ID-based scheme.
    // Everywhere else this engine renders (today: nothing live still points at /onebox), fall back
    // to the older stable snapshot URL so Share is never dead.
    var url = mcUrlActive()
      ? location.href
      : (obSnapshotId ? location.origin + "/o/" + encodeURIComponent(obSnapshotId) : location.origin + "/market-check?q=" + encodeURIComponent(lastQuery));
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    var btn = root.querySelector("[data-share]"); if (btn) { var old = btn.innerHTML; btn.innerHTML = "Link copied."; setTimeout(function () { btn.innerHTML = old; }, 1400); }
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
      // Body style chip (item 2, Oct 2026): reorders matching-body cards first and relabels the pool
      // noun from the plain plural ("997 Carrera S models") to the body-specific one ("997 Carrera S
      // Coupes"), the same BODY_PLURAL map carNoun() uses on the real results page.
      Array.prototype.forEach.call(qcard.querySelectorAll(".qchip[data-mc-ex-body]"), function (b) {
        b.addEventListener("click", function () {
          var body = b.getAttribute("data-mc-ex-body");
          reorder(function (c) { return c.getAttribute("data-body") === body ? 0 : 1; });
          Array.prototype.forEach.call(qcard.querySelectorAll(".qchip[data-mc-ex-body]"), function (x) { x.classList.toggle("sel", x === b); });
          var plabel = document.getElementById("mc-ex-plabel");
          if (plabel) {
            var shortLabel = plabel.getAttribute("data-shortlabel") || "";
            var bw = BODY_PLURAL[body] || "";
            var noun = bw ? (shortLabel + " " + bw) : shortLabel;
            plabel.textContent = plabel.textContent.replace(/^.*?\./, noun + ".");
          }
        });
      });
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
    // House-tier intake screen (job 4, round two) is deleted - [data-thinsplit]/[data-htskip] no
    // longer render anywhere, so these handlers are gone with it.
    // Trim chip (item 2, Oct 2026) - from the question OR an "Other trims" row, same handler:
    // narrows the SAME pool inline (re-request with refine.trim), same merge pattern as body/
    // mileage/transmission - answering trim never un-asks the others, or vice versa.
    Array.prototype.forEach.call(root.querySelectorAll("[data-trimopt]"), function (b) {
      b.addEventListener("click", function () {
        var trim = b.getAttribute("data-trimopt"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "trim", value: String(label || trim || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ trim: trim, label: label }));
      });
    });
    // Body style chip: narrows the SAME pool inline (re-request with refine.body), same merge
    // pattern as mileage/transmission below - answering body never un-asks miles, or vice versa.
    // Bare [data-bodyopt] (follow-up round, Oct 2026): the hero's identity-line body links are plain
    // text (.linkbtn), not .qchip pills - loosened to match the [data-trimopt] handler's own
    // precedent just above. The old .qchip-scoped producer (bodyOptionsHtml) is gone, so this is a
    // strict broadening, not a behavior change for anything still alive.
    Array.prototype.forEach.call(root.querySelectorAll("[data-bodyopt]"), function (b) {
      b.addEventListener("click", function () {
        var body = b.getAttribute("data-bodyopt"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "body", value: String(label || body || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ body: body, label: label }));
      });
    });
    // "Any (N)" (item 2, Sam's review round): clears the chosen trim/body refine, returning to the
    // unsplit answer - mergeRefine sets the key to null (and its *Label alongside), the server reads
    // a null refine key as unanswered, same as never having asked.
    Array.prototype.forEach.call(root.querySelectorAll("[data-trimopt-any]"), function (b) {
      b.addEventListener("click", function () {
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "trim", value: "any" });
        runPool(lastQuery, obLastVehicle, mergeRefine({ trim: null, label: null }));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-bodyopt-any]"), function (b) {
      b.addEventListener("click", function () {
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "body", value: "any" });
        runPool(lastQuery, obLastVehicle, mergeRefine({ body: null, label: null }));
      });
    });
    // Job 7 (round two): the in-result variantOptionsLine chips - same mergeRefine key "variant" the
    // blocking variant_choice screen's own [data-variantopt] chips use (job 2), a DIFFERENT attribute
    // name so the two never collide (this fires inline on a result/thin page that already has an
    // answer; job 2's fires on its own full-takeover question screen).
    Array.prototype.forEach.call(root.querySelectorAll("[data-varopt]"), function (b) {
      b.addEventListener("click", function () {
        var val = b.getAttribute("data-varopt"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "variant", value: String(label || val || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: val, label: label }));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-varopt-any]"), function (b) {
      b.addEventListener("click", function () {
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "variant", value: "any" });
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: null, label: null }));
      });
    });
    // Job 2 (variant_choice takeover, Sam's review round): same refine mechanism the generic
    // gearbox/competition/documented-history takeover's [data-idq-dim="competition"] chips already
    // use (mergeRefine key "variant"), plus the new Any chip this screen family did not have before.
    Array.prototype.forEach.call(root.querySelectorAll("[data-variantopt]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-variantopt"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: "competition", choice: label || key || "", skipped: false });
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: key, label: label }));
      });
    });
    // The trim_choice takeover's chips: the engine's own trim refine (lib/onebox.js refine.trim / refine.notTrims).
    Array.prototype.forEach.call(root.querySelectorAll("[data-trimopt]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-trimopt"), not = b.getAttribute("data-trimnot") || "", label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: "trim", choice: label || key || "", skipped: false });
        var part = { trim: key, label: label }; if (not) part.notTrims = not;
        runPool(lastQuery, obLastVehicle, mergeRefine(part));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-variantopt-any]"), function (b) {
      b.addEventListener("click", function () {
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: "competition", choice: "any", skipped: true });
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: null, label: null }));
      });
    });
    // Typo confirmation chips: each car name is a fresh full search (run(), the same mechanism any
    // typed search uses); "Change car" clears back to the empty search box; "Not sure" runs the
    // clarification's own baseVehicle text (never a dead end, product rule 8).
    Array.prototype.forEach.call(root.querySelectorAll("[data-typo-chip]"), function (b) {
      b.addEventListener("click", function () {
        var text = b.getAttribute("data-typo-chip");
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: "typo_confirmation", choice: text, skipped: text === "Not sure" });
        if (text === "Change car") { renderEmpty(); return; }
        if (text === "Not sure") { run(obTypoBase || text); return; }
        run(text);
      });
    });
    // Identity question answer (either the original blocking screen or the "switch sides" chip
    // Narrow it down offers afterward - same handler, same event, same re-query): re-scopes the
    // SAME pool inline via the dimension's refine key.
    Array.prototype.forEach.call(root.querySelectorAll(".idqchip"), function (b) {
      b.addEventListener("click", function () {
        var dim = b.getAttribute("data-idq-dim"), val = b.getAttribute("data-idq-val"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: dim, choice: label || val || "", skipped: false });
        var key = IDQ_REFINE_KEY[dim];
        var patch = { label: label }; if (key) patch[key] = val;
        runPool(lastQuery, obLastVehicle, mergeRefine(patch));
      });
    });
    // Just show what sold (rule 2, reversible skip): forces askCapped server-side so this same
    // material split renders as an inline chip alongside a real range instead of asking again -
    // never a dead end, never re-asked a third time.
    Array.prototype.forEach.call(root.querySelectorAll(".idqskip"), function (b) {
      b.addEventListener("click", function () {
        var dim = b.getAttribute("data-idq-dim");
        if (typeof gasTrack === "function") gasTrack("identity_question_answered", { dimension: dim, choice: "skip", skipped: true });
        obAsked = 2;
        runPool(lastQuery, obLastVehicle, obLastRefine);
      });
    });
    // The earned question: a mileage band or transmission chip narrows the SAME pool inline
    // (re-request with a refine), and Sam's take + the sales re-render to match. Each answer
    // MERGES into whatever was already answered (mergeRefine), so a second question narrows
    // alongside the first instead of un-asking it.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-milemin]"), function (b) {
      b.addEventListener("click", function () {
        var lo = b.getAttribute("data-milemin"), hi = b.getAttribute("data-milemax"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "mileage", value: String(label || lo || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ miMin: Number(lo), miMax: hi ? Number(hi) : null, miTarget: hi ? Math.round((Number(lo) + Number(hi)) / 2) : Number(lo), label: label }));
      });
    });
    // Bare [data-tx] (follow-up round, Oct 2026): also matches the hero's plain-text (.linkbtn)
    // gearbox identity-line links, not just renderRefineChoice's .chip.qchip gearbox_choice answer
    // buttons - a strict broadening, same precedent as the [data-bodyopt] loosening just above.
    Array.prototype.forEach.call(root.querySelectorAll("[data-tx]"), function (b) {
      b.addEventListener("click", function () {
        var tx = b.getAttribute("data-tx"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "gearbox", value: String(label || tx || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ tx: tx, label: label }));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-variant]"), function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-variant"), label = b.getAttribute("data-mlabel");
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "variant", value: String(label || v || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ variant: v, label: label }));
      });
    });
    // Dictionary driver chip (item 7/8): narrows the pool to the listings that carry (or do not
    // carry) the mined title flag. Framed "listed as" - it is read off the title, not inspected.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-driver]"), function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-driver"), val = b.getAttribute("data-drvval"), label = b.getAttribute("data-mlabel");
        obEvent("onebox_driver_refine", lastQuery + ":" + key + ":" + val);
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: String(key || "driver").slice(0, 40), value: String(label || val || "").slice(0, 40) });
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
        if (typeof gasTrack === "function") gasTrack("refinement_applied", { field: "observe", value: String(label || key || "").slice(0, 40) });
        runPool(lastQuery, obLastVehicle, mergeRefine({ observe: key, label: label }));
      });
    });
    // Mileage input submit (result-hero job, Oct 2026): extracted so the SAME wiring serves both the
    // always-rendered "Add mileage" field (mileageFieldHtml, wired once below) and the older "type
    // it" chip (reconfirmHtml's "Update mileage"), which still creates its own #ob-miles/#ob-miles-go
    // on click since that field does not exist until then. Never attaches twice: the two producers
    // are mutually exclusive (one only renders when the other's VIN-known-mileage gate fires).
    function wireMilesSubmit() {
      var inp = document.getElementById("ob-miles"), go = document.getElementById("ob-miles-go");
      if (!inp || !go || inp.getAttribute("data-wired")) return;
      inp.setAttribute("data-wired", "1");
      function submit() { submitMileageInline(Number((document.getElementById("ob-miles") || {}).value)); }
      go.addEventListener("click", submit);
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    }
    wireMilesSubmit();
    // "type it" (reconfirmHtml's "Update mileage" chip only, now): reveal the inline mileage input;
    // Enter narrows to a band around that number.
    Array.prototype.forEach.call(root.querySelectorAll(".qchip[data-typemiles]"), function (b) {
      b.addEventListener("click", function () {
        b.outerHTML = '<span class="typemiles"><input id="ob-miles" type="number" inputmode="numeric" placeholder="miles" /><button type="button" class="qchip" id="ob-miles-go">Go</button></span>';
        var inp = document.getElementById("ob-miles"); if (inp) inp.focus();
        wireMilesSubmit();
      });
    });
    // Outbound comp-card click: log the referral per platform (the card link already carries the
    // UTM for the destination). Best-effort beacon, never blocks the navigation.
    Array.prototype.forEach.call(root.querySelectorAll("a[data-cardclick]"), function (a) {
      a.addEventListener("click", function () { try { obEvent("onebox_comp_click", a.getAttribute("data-cardclick") + ":" + lastQuery); } catch (e) {} });
    });
    // One id, one hidden attribute: "How Sam picked these", "N sales sat outside the middle half"
    // and "Show more sales (N)" all reveal their own already server-rendered content in place.
    Array.prototype.forEach.call(root.querySelectorAll("[data-qtoggle]"), function (b) {
      b.addEventListener("click", function () {
        var list = document.getElementById(b.getAttribute("data-qtoggle")); if (!list) return;
        var open = list.hasAttribute("hidden");
        if (open) list.removeAttribute("hidden"); else list.setAttribute("hidden", "");
        b.setAttribute("aria-expanded", open ? "true" : "false");
        // Item 4 (Sam's note, Oct 14 2026): "Show more sales (N)" is a one-way reveal, not a
        // collapsible toggle like the other [data-qtoggle] triggers - once the remaining rows are
        // showing there is nothing left for the button to do, so it goes away instead of sitting
        // there still reading a stale count.
        if (open && b.classList.contains("allsales-showall")) b.setAttribute("hidden", "");
      });
    });
    // Distribution row: expands its own receipts, closing any other open row in the same group first
    // (one bucket open at a time, per the brief).
    Array.prototype.forEach.call(root.querySelectorAll("[data-disttoggle]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-disttoggle"), grp = b.getAttribute("data-distgroup");
        var panel = document.getElementById(id); if (!panel) return;
        var willOpen = panel.hasAttribute("hidden");
        Array.prototype.forEach.call(root.querySelectorAll('[data-distgroup="' + grp + '"]'), function (ob) {
          var p = document.getElementById(ob.getAttribute("data-disttoggle"));
          if (p && p !== panel) { p.setAttribute("hidden", ""); ob.setAttribute("aria-expanded", "false"); }
        });
        if (willOpen) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
        b.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    });
    // A "set aside" pointer is never a second list - it scrolls to (and, if the evidence block's own
    // collapsed aside note is still folded up, opens) the existing "N sales sat outside this range"
    // section (Sam, Oct 2026).
    Array.prototype.forEach.call(root.querySelectorAll("[data-scrollto]"), function (b) {
      b.addEventListener("click", function () {
        var t = document.getElementById(b.getAttribute("data-scrollto"));
        if (!t) return;
        if (t.hasAttribute("hidden")) {
          t.removeAttribute("hidden");
          var trigger = root.querySelector('[data-qtoggle="' + t.id + '"]');
          if (trigger) trigger.setAttribute("aria-expanded", "true");
        }
        t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    // Mileage "Change" (Market Check result-page spec, Oct 2026): focuses the field only - the field
    // is already visible with its value retained, never a rerun/undo.
    (function () {
      var ch = document.getElementById("ob-miles-change");
      if (ch) ch.addEventListener("click", function () { var inp = document.getElementById("ob-miles"); if (inp) { inp.focus(); inp.select(); } });
    })();
    // Item 9 ("Put Sam on it"), connected (Oct 2026): Lane C's arm-by-spec/arm-by-vin addition to
    // /api/watch (docs/lane-notes.md) takes a resolved car or a bare VIN directly, no listing_id
    // needed - the SAME endpoint and wording Buy's own watch control uses, never a second one.
    // Sign-in-then-continue (helpers at module scope, see above wire()): a pending-arm flag in
    // sessionStorage, a short poll for authIsSignedIn(), and an auto-arm once true; closing the
    // sign-in card without completing leaves nothing armed.
    (function () {
      var soi = document.getElementById("ob-samonit"); if (!soi) return;
      soi.addEventListener("click", function () {
        if (typeof gasTrack === "function") gasTrack("keep_looking_clicked", { from_product: "market_check" });
        if (!(typeof authIsSignedIn === "function" && authIsSignedIn())) {
          stashPendingWatch();
          if (typeof openSignInCard === "function") openSignInCard("Sign in so Sam can keep looking. Free. No card, no plan.");
          clearInterval(obArmWait); obArmWait = null; var t0 = Date.now();
          obArmWait = setInterval(function () {
            if (typeof authIsSignedIn === "function" && authIsSignedIn()) { clearInterval(obArmWait); obArmWait = null; tryResumeWatchArm(); return; }
            if (!document.getElementById("auth-modal") && Date.now() - t0 > 1500) { clearInterval(obArmWait); obArmWait = null; clearPendingWatch(); }
          }, 600);
          return;
        }
        var msg = document.getElementById("ob-samonit-msg");
        soi.disabled = true; soi.textContent = "One moment...";
        armWatchNow(function () {
          soi.disabled = false; soi.textContent = "Put Sam on it →";
          if (msg) { msg.hidden = false; msg.textContent = "That didn’t work just now. Try again in a moment."; }
        });
      });
    })();
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
    // Account state renders via the shared sign-in bar (lib/authBar.js), not this page - nothing to
    // do here (the old corner-avatar initials control was removed with the shared app shell).
    // JUST SOLD proof block removed from the empty state, so no fetchProof() on boot.
    if (renderSnapshot()) { syncRailResults(); return; }
    // The server already rendered the rich landing (lib/live/marketCheckLanding.js: hero, proof row,
    // "What you get", the example band) straight into #ob - mirrors renderSnapshot()'s early exit so
    // that content is never wiped and rebuilt as the plain empty state. wire() attaches the real
    // search box (#ob-input/#ob-go, same ids renderEmpty() uses) and the example band's own
    // handlers (capCardsHtml's existing [data-capshow], plus the reorder-on-answer below).
    if (mcUrlActive()) window.addEventListener("popstate", function () { mcSuppressPush = true; mcApplyFromUrl(); });
    if (document.getElementById("mc-landing")) {
      wire(); syncRailResults();
      var sp = new URLSearchParams(location.search || "");
      if (sp.get("car") || sp.get("vin")) { try { mcSuppressPush = true; mcApplyFromUrl(); } catch (e) {} return; }
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
  // renderResults (Market Check result-page spec, Oct 2026 proof round): exported so a hand-built
  // engine answer (a trend/distribution stub, before Lane B ships either field live) can be rendered
  // straight to the page for a screenshot - read-only, no new behavior.
  window.OBX = { carHead: carHead, qscreenHtml: qscreenHtml, askCopy: askCopy, esc: esc, inboxHtml: inboxHtml, footHtml: footHtml, saleCardHtml: saleCardHtml,
    samMsgHtml: samMsgHtml, setRootHtmlLifted: setRootHtmlLifted, wire: wire, root: root, run: run, renderError: renderError, renderEmpty: renderEmpty,
    renderResults: renderResults, renderQuestion: renderQuestion, modelChoiceTakeoverHtml: modelChoiceTakeoverHtml };
  boot();
})();
