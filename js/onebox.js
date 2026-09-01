// One Box frontend. One input, one result state, at most three cards. Talks only to
// the archive-only oneBox branch of /api/sellerDecision. Never exposes the dataset:
// no pagination, no see-more, no filters. The CTA hands the resolved car to /sell.
// v2 phase 1: resolved-car confirmation line + trust line render first; each card shows
// the native display price (with a buyer's-premium label for auction-house records) and
// a deterministic comp explanation. All render, zero LLM.
(function () {
  var API_ORIGIN = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function miles(m) { return m ? Number(m).toLocaleString() + " miles" : "TMU"; }
  function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s; }
  // Native display price, never converted. House records carry a premium label separately.
  function priceStr(disp) {
    if (!disp || disp.amount == null) return "";
    var sym = { USD: "$", GBP: "£", EUR: "€" }[disp.currency];
    return sym ? sym + Number(disp.amount).toLocaleString() : Number(disp.amount).toLocaleString() + " " + esc(disp.currency);
  }

  var input = document.getElementById("ob-input");
  var result = document.getElementById("ob-result");
  var lastText = "";

  function card(c) {
    var disp = c.display || {};
    var mid = !!c.closest; // highlight the closest match, not a price position
    var note = disp.premiumInclusive ? '<div class="ob-price-note">includes buyer’s premium</div>' : "";
    var mileLine = c.mileage ? esc(miles(c.mileage))
      : (c.mileageStated ? '<span class="ob-stated">listed as ~' + esc(miles(c.mileageStated)) + "</span>" : "TMU");
    return '<div class="ob-tile' + (mid ? " mid" : "") + '">' +
      '<div class="ob-ph"><img src="' + esc(c.image) + '" alt="comparable sale" ' +
        'onerror="this.parentNode.classList.add(\'ob-noimg\');this.remove();"></div>' +
      '<div class="ob-body"><div class="ob-rank' + (mid ? " mid" : "") + '">' + esc(c.rank) + "</div>" +
      '<div class="ob-price">' + esc(priceStr(disp)) + "</div>" + note +
      '<div class="ob-miles">' + mileLine + "</div>" +
      '<div class="ob-spec">' + esc(c.spec) + "</div>" +
      (c.explanation ? '<div class="ob-explain">' + esc(c.explanation) + "</div>" : "") +
      '<div class="ob-meta"><span>' + esc(c.soldLabel) + '</span><span class="ob-plat">' + esc(c.platform) + "</span></div>" +
      "</div></div>";
  }

  // Resolved-car confirmation line (STEP 3): plain restatement + Change, first thing shown.
  function resolvedLine(rc) {
    if (!rc) return "";
    var name = [rc.year, rc.make, rc.model, rc.trim].filter(Boolean).join(" ");
    var extra = [rc.bodyStyle ? cap(rc.bodyStyle) : "", rc.transmission || ""].filter(Boolean).join(", ");
    var full = name + (extra ? " · " + extra : "");
    if (!full) return "";
    return '<div class="ob-confirm"><span>Your car: <strong>' + esc(full) + "</strong></span>" +
      '<button class="ob-change" onclick="oneBoxChange()">Change</button></div>';
  }

  function statLine(count, windowLabel) {
    var noun = count === 1 ? "relevant sale" : "relevant sales";
    return '<div class="ob-stat"><span>Based on ' + count + " " + noun + '</span><span class="ob-dot">&middot;</span><span>' + esc(windowLabel) + "</span></div>";
  }
  function samRead(line) {
    return '<div class="ob-read"><div class="ob-who"><i></i><span>Sam</span></div><p>' + esc(line) + "</p></div>";
  }
  function cta() {
    return '<div class="ob-cta"><p>I\'ll look at the same market and tell you where I\'d sell it.</p>' +
      '<button class="ob-btn" onclick="oneBoxToSell()">See where I\'d sell it &#8594;</button></div>';
  }
  function grid(cards) {
    var cls = cards.length === 3 ? "" : cards.length === 2 ? " two" : " one";
    return '<div class="ob-tiles' + cls + '">' + cards.map(card).join("") + "</div>";
  }
  function chips(options) {
    return '<div class="ob-chips">' + options.map(function (o) {
      return '<button class="ob-chip" onclick="oneBoxBody(' + JSON.stringify(o).replace(/"/g, "&quot;") + ')">' + esc(o) + "</button>";
    }).join("") + "</div>";
  }

  function render(d) {
    if (d.status === "needs_clarification") {
      result.innerHTML = '<div class="ob-note">I could not pin that exact car down. Try the year, make and model together, like 1972 Porsche 911 or 1969 Ford Mustang.</div>';
      return;
    }
    if (d.status !== "one_box") {
      result.innerHTML = '<div class="ob-note">I am having trouble reading the market right now. Give it another try in a moment.</div>';
      return;
    }
    // Resolved-car line renders on EVERY one_box path, including the disambiguation asks.
    var head = resolvedLine(d.resolvedCar);
    if (d.tier === "model_choice") {
      // Make resolved, model missing/ambiguous: ask with real model chips (same one-tap
      // pattern as the body-style follow-up); a chip appends the model and re-runs.
      result.innerHTML = head + samRead(d.prompt) + chips(d.modelOptions);
      return;
    }
    if (d.tier === "body_choice") {
      result.innerHTML = head + samRead(d.prompt) + chips(d.bodyOptions);
      return;
    }
    if (d.tier === "zero" || d.tier === "underspecified") {
      result.innerHTML = head + samRead(d.samLine) + cta();
      return;
    }
    result.innerHTML = head +
      (d.trustLine ? '<div class="ob-trust">' + esc(d.trustLine) + "</div>" : "") +
      grid(d.cards) + statLine(d.count, d.windowLabel) + samRead(d.samLine) + cta();
  }

  function run(text) {
    text = String(text || "").trim();
    if (!text) return;
    lastText = text;
    var intro = document.getElementById("ob-intro"); // the empty-state explainer clears on first search
    if (intro) intro.style.display = "none";
    result.innerHTML = '<div class="ob-loading">Reading the market for real sold prices.</div>';
    fetch(API_ORIGIN + "/api/sellerDecision", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oneBox: true, car: { raw: text } })
    }).then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { result.innerHTML = '<div class="ob-note">I am having trouble reading the market right now. Give it another try in a moment.</div>'; });
  }

  // Hand the resolved car to the sell wizard, pre-filled.
  window.oneBoxToSell = function () {
    try { if (lastText) localStorage.setItem("gas_onebox_prefill", lastText); } catch (e) {}
    location.href = "/sell";
  };
  window.oneBoxRun = function () { run(input.value); };
  // Change link on the confirmation line: clear the result, restore the input for a retype.
  window.oneBoxChange = function () {
    result.innerHTML = "";
    var intro = document.getElementById("ob-intro"); if (intro) intro.style.display = "";
    if (input) { if (lastText) input.value = lastText; input.focus(); try { input.select(); } catch (e) {} }
  };
  // One-tap body-style pick: re-run the same query with the chosen body appended.
  window.oneBoxBody = function (bodyLabel) {
    var base = lastText || (input && input.value) || "";
    run(base + " " + bodyLabel);
  };

  if (input) {
    document.getElementById("ob-go").addEventListener("click", function () { run(input.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(input.value); } });
  }
})();
