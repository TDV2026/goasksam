// One Box frontend. One input, one result state, at most three cards. Talks only to
// the archive-only oneBox branch of /api/sellerDecision. Never exposes the dataset:
// no pagination, no see-more, no filters. The CTA hands the resolved car to /sell.
(function () {
  var API_ORIGIN = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function money(n) { return "$" + Math.round(Number(n)).toLocaleString(); }
  function miles(m) { return m ? Number(m).toLocaleString() + " miles" : "TMU"; }

  var input = document.getElementById("ob-input");
  var result = document.getElementById("ob-result");
  var lastText = "";

  function card(c) {
    return '<div class="ob-tile' + (c.rank === "MIDDLE OF THE MARKET" ? " mid" : "") + '">' +
      '<div class="ob-ph"><img src="' + esc(c.image) + '" alt="comparable sale" ' +
        'onerror="this.parentNode.classList.add(\'ob-noimg\');this.remove();"></div>' +
      '<div class="ob-body"><div class="ob-rank' + (c.rank === "MIDDLE OF THE MARKET" ? " mid" : "") + '">' + esc(c.rank) + '</div>' +
      '<div class="ob-price">' + money(c.price) + '</div>' +
      '<div class="ob-miles">' + esc(miles(c.mileage)) + '</div>' +
      '<div class="ob-spec">' + esc(c.spec) + '</div>' +
      '<div class="ob-meta"><span>' + esc(c.soldLabel) + '</span><span class="ob-plat">' + esc(c.platform) + '</span></div>' +
      '</div></div>';
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
    // Body-style follow-up: one tap, only when the market spans body styles.
    if (d.tier === "body_choice") {
      result.innerHTML = samRead(d.prompt) + chips(d.bodyOptions);
      return;
    }
    var html = '<div class="ob-resolved">' + esc(d.resolvedSpec) + "</div>";
    // Zero comps, or too varied for an honest spread: say so plainly, no cards.
    if (d.tier === "zero" || d.tier === "underspecified") {
      html += samRead(d.samLine) + cta();
      result.innerHTML = html;
      return;
    }
    html += '<h2 class="ob-answer">What cars like yours have actually sold for</h2>' +
      '<p class="ob-sub">Comparable stock examples, like yours.</p>' +
      grid(d.cards) + statLine(d.count, d.windowLabel) + samRead(d.samLine) + cta();
    result.innerHTML = html;
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
