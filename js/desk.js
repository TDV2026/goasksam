/* Sam Desk client (Stage 1). Renders the four-part Analyst result:
   1 answer table  2 receipts (every transaction)  3 the read  4 query echo + coverage.
   Every number on screen has its receipts one click away. */
(function () {
  "use strict";
  var API = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  var out = document.getElementById("out");
  var input = document.getElementById("q");
  var go = document.getElementById("go");

  var EXAMPLES = [
    "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?",
    "E30 M3s: median and count by month over three years, houses and online.",
    "Share of 250-series Ferrari sales by house, by year, three years.",
    "1929 Duesenberg Model J, every house sale.",
    "what's my car worth"
  ];
  var ex = document.getElementById("examples");
  EXAMPLES.forEach(function (q) {
    var b = document.createElement("button");
    b.textContent = q; b.onclick = function () { input.value = q; run(); };
    ex.appendChild(b);
  });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function usd(n) { return n == null ? "&mdash;" : "$" + Math.round(n).toLocaleString("en-US"); }
  function fmtDate(d) { return d ? String(d).slice(0, 10) : "&mdash;"; }

  function run() {
    var q = (input.value || "").trim();
    if (!q) return;
    go.setAttribute("disabled", "1");
    out.innerHTML = '<div class="working"><span class="pulse"></span> reading the archive</div>';
    fetch(API + "/api/desk", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", question: q })
    }).then(function (r) { return r.json(); }).then(render).catch(function (e) {
      out.innerHTML = msg("Trouble", "The Desk could not answer that just now. " + esc(e.message || e));
    }).finally(function () { go.removeAttribute("disabled"); });
  }
  go.onclick = run;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });

  function msg(tag, body) { return '<div class="msg"><div class="t">' + esc(tag) + '</div>' + body + '</div>'; }

  function render(res) {
    if (!res || res.status === "error") { out.innerHTML = msg("Trouble", esc((res && res.reason) || "something went wrong") + "."); return; }
    if (res.status === "refused") { out.innerHTML = msg("Not what the Desk does", esc(res.message)); return; }
    if (res.status === "map_error") { out.innerHTML = msg("Could not read that", "I could not turn that into a market query. Try naming the car and what you want to see (counts, prices, by venue or month)."); return; }
    if (res.status === "unresolved") { out.innerHTML = msg("Car not resolved", "I could not pin that car down to a make and model. Try the full nameplate."); return; }
    if (res.status === "invalid") { out.innerHTML = msg("Nothing to run", esc((res.errors || []).join("; ")) + "."); return; }
    if (res.status !== "ok") { out.innerHTML = msg("Trouble", "Unexpected response."); return; }

    var h = '<div class="result">';

    // 4a. query echo (shown first so nothing runs the user cannot see)
    h += '<div class="section"><div class="slabel">Query</div><div class="chips">';
    (res.echo.chips || []).forEach(function (c, i) { h += '<span class="chip' + (i === 0 ? '' : ' dim') + '">' + esc(c) + '</span>'; });
    h += '</div>';
    if (res.echo.notice) h += '<div class="ignored"><b>Ignored:</b> ' + esc(res.echo.notice.replace(/^Ignored /, "")) + '</div>';
    h += '</div>';

    // 1. the answer
    var a = res.answer, rows = a.rows || [];
    var dimLabel = a.dimension ? a.dimension.replace(/_/g, " ") : "overall";
    h += '<div class="section"><div class="slabel">Answer <span class="n">' + rows.length + ' ' + esc(dimLabel) + (rows.length === 1 ? '' : 's') + ' &middot; ' + a.total + ' sales</span></div>';
    h += '<div class="tblwrap"><table class="answer"><thead><tr>';
    h += '<th>' + esc(dimLabel) + '</th><th>count</th><th>share</th><th>median</th><th>p25</th><th>p75</th><th>min</th><th>max</th><th>newest</th>';
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      h += '<td>' + esc(r.group) + (r.thin ? '<span class="thintag">thin</span>' : '') + '</td>';
      h += '<td class="cellnum clk" data-g="' + esc(r.group) + '">' + r.count + '</td>';
      h += '<td class="cellnum">' + (r.share != null ? (r.share * 100).toFixed(0) + '%' : "&mdash;") + '</td>';
      h += '<td class="cellnum">' + (r.thin ? "&mdash;" : usd(r.median)) + '</td>';
      h += '<td class="cellnum">' + (r.thin ? "&mdash;" : usd(r.p25)) + '</td>';
      h += '<td class="cellnum">' + (r.thin ? "&mdash;" : usd(r.p75)) + '</td>';
      h += '<td class="cellnum">' + (r.thin ? "&mdash;" : usd(r.min)) + '</td>';
      h += '<td class="cellnum">' + (r.thin ? "&mdash;" : usd(r.max)) + '</td>';
      h += '<td class="cellnum">' + fmtDate(r.freshness) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    // 3. the read
    h += '<div class="section"><div class="slabel">The read</div>';
    h += '<div class="read">' + esc(res.read) + '</div>';
    if (res.read_figures && res.read_figures.length) {
      h += '<button class="whyread" id="whyread">why this read &darr;</button>';
      h += '<ul class="figs" id="figs">' + res.read_figures.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join("") + '</ul>';
    }
    h += '</div>';

    // 2. the receipts (every transaction behind the numbers)
    var recs = res.receipts || [];
    h += '<div class="section" id="receipts"><div class="slabel">Receipts <span class="n">' + recs.length + ' sales</span></div>';
    h += '<div class="tblwrap"><table class="receipts"><thead><tr>';
    h += '<th>date</th><th>venue</th><th>room</th><th class="r">hammer (USD)</th><th class="r">buyer paid</th><th class="r">miles</th><th>chassis</th><th>title</th>';
    h += '</tr></thead><tbody id="recbody"></tbody></table></div>';
    h += '<button class="recmore" id="recmore"></button></div>';

    // coverage line
    var cov = res.coverage || {};
    var srcs = (cov.sources || []).map(function (s) { return '<span class="src">' + esc(s.source) + ' (from ' + fmtDate(s.earliest) + ')</span>'; }).join(", ");
    h += '<div class="coverage">';
    h += '<b>Coverage.</b> Window ' + esc(cov.window || "") + '. Basis ' + esc(cov.price_basis === "hammer" ? "implied hammer, house premiums backed out" : "buyer paid") + '. ';
    h += 'Pool drawn from: ' + (srcs || "none") + '. ';
    if (cov.generations && cov.generations.length) h += 'Generations: ' + esc(cov.generations.join(", ")) + '. ';
    h += 'Rooms ' + (cov.rooms_inferred ? 'are inferred from the house calendar where the record does not carry them' : 'stated only where the record carries them') + '. ';
    h += 'Thin threshold ' + (cov.thin_threshold || 5) + ' sales.';
    h += '</div>';

    h += '</div>';
    out.innerHTML = h;

    // receipts paging (show 12, expand)
    var shown = 0, PAGE = 12;
    function drawRecs() {
      var body = document.getElementById("recbody"); if (!body) return;
      var slice = recs.slice(0, shown + PAGE); shown = slice.length;
      body.innerHTML = slice.map(recRow).join("");
      var more = document.getElementById("recmore");
      if (shown < recs.length) { more.textContent = "show " + Math.min(PAGE, recs.length - shown) + " more of " + recs.length; more.style.display = ""; more.onclick = drawRecs; }
      else more.style.display = "none";
    }
    function recRow(r) {
      var room = r.room ? '<span class="room ' + (r.room.source === "data" ? "data" : "inferred") + '">' + esc(r.room.text) + (r.room.source === "inferred" ? " (inferred)" : "") + '</span>' : "";
      var buyer = r.buyer_paid ? (r.buyer_paid.currency !== "USD" ? esc(r.buyer_paid.currency) + " " : "$") + Math.round(r.buyer_paid.amount).toLocaleString("en-US") + (r.buyer_paid.premium_inclusive ? "" : "") : "&mdash;";
      var title = r.link ? '<a class="reclink" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc((r.title || "listing").slice(0, 54)) + '</a>' : esc((r.title || "").slice(0, 54));
      return '<tr>' +
        '<td class="r">' + fmtDate(r.date) + '</td>' +
        '<td>' + esc(r.venue) + room + '</td>' +
        '<td>' + (r.room ? esc(r.room.text) : "&mdash;") + '</td>' +
        '<td class="r">' + usd(r.hammer_usd) + '</td>' +
        '<td class="r">' + buyer + '</td>' +
        '<td class="r">' + (r.mileage != null ? Math.round(r.mileage).toLocaleString("en-US") : "&mdash;") + '</td>' +
        '<td>' + esc(r.chassis || "") + '</td>' +
        '<td>' + title + '</td>' +
        '</tr>';
    }
    drawRecs();

    // "why this read" toggle
    var wr = document.getElementById("whyread");
    if (wr) wr.onclick = function () { document.getElementById("figs").classList.toggle("open"); };

    // click a count -> jump to receipts
    Array.prototype.forEach.call(document.querySelectorAll(".answer .clk"), function (el) {
      el.onclick = function () { var t = document.getElementById("receipts"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); };
    });
  }
})();
