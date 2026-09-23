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
    fetch(API + "/api/sellerDecision", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desk: true, action: "run", question: q })
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

    // 1. the answer (measure-aware columns)
    var a = res.answer, rows = a.rows || [];
    var dimLabel = (a.dimensions && a.dimensions.length ? a.dimensions.join(" · ") : (a.dimension || "overall")).replace(/_/g, " ");
    var M = a.measures || [];
    var has = function (m) { return M.indexOf(m) !== -1 || rows.some(function (r) { return r[m] != null; }); };
    var priceHdr = a.priceLabel && /bid-to/.test(a.priceLabel) ? "bid-to" : "median";
    var unit = res.status; // noop
    var cols = [];
    cols.push(["count", "count", function (r) { return '<span class="clk">' + r.count + '</span>'; }]);
    if (has("share")) cols.push(["share", "share", function (r) { return r.share != null ? (r.share * 100).toFixed(0) + '%' : "&mdash;"; }]);
    if (has("sell_through_rate")) cols.push(["sell_through_rate", "sell-through", function (r) { return r.sell_through_rate != null ? (r.sell_through_rate * 100).toFixed(0) + '%' : "&mdash;"; }]);
    if (has("reserve_not_met_rate")) cols.push(["reserve_not_met_rate", "RNM rate", function (r) { return r.reserve_not_met_rate != null ? (r.reserve_not_met_rate * 100).toFixed(0) + '%' : "&mdash;"; }]);
    if (has("withdrawn_rate")) cols.push(["withdrawn_rate", "withdrawn", function (r) { return r.withdrawn_rate != null ? (r.withdrawn_rate * 100).toFixed(0) + '%' : "&mdash;"; }]);
    if (has("median")) cols.push(["median", priceHdr, function (r) { return r.thin ? "&mdash;" : usd(r.median); }]);
    if (has("p25")) cols.push(["p25", "p25", function (r) { return r.thin ? "&mdash;" : usd(r.p25); }]);
    if (has("p75")) cols.push(["p75", "p75", function (r) { return r.thin ? "&mdash;" : usd(r.p75); }]);
    if (has("min")) cols.push(["min", "min", function (r) { return r.thin ? "&mdash;" : usd(r.min); }]);
    if (has("max")) cols.push(["max", "max", function (r) { return r.thin ? "&mdash;" : usd(r.max); }]);
    if (rows.some(function (r) { return r.online_share != null; })) cols.push(["online_share", "online %", function (r) { return r.online_share != null ? (r.online_share * 100).toFixed(0) + '%' : "&mdash;"; }]);
    cols.push(["freshness", "newest", function (r) { return fmtDate(r.freshness); }]);
    h += '<div class="section"><div class="slabel">Answer <span class="n">' + rows.length + ' ' + esc(dimLabel) + (rows.length === 1 ? '' : 's') + ' &middot; ' + a.total + (a.outcome && a.outcome !== "sold" ? ' ' + esc(a.outcome.replace(/_/g, " ")) : ' sales') + '</span></div>';
    h += '<div class="tblwrap"><table class="answer"><thead><tr><th>' + esc(dimLabel) + '</th>';
    cols.forEach(function (c) { h += '<th>' + esc(c[1]) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.group) + (r.thin ? '<span class="thintag">thin</span>' : '') + '</td>';
      cols.forEach(function (c) { h += '<td class="cellnum">' + c[2](r) + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    // velocity section (same-chassis repeat sales)
    if (res.velocity && res.velocity.length) {
      h += '<div class="section"><div class="slabel">Repeat sales <span class="n">' + res.velocity.length + ' chassis resold</span></div>';
      h += '<div class="tblwrap"><table class="receipts"><thead><tr><th>chassis</th><th>car</th><th>from</th><th class="r">then</th><th class="r">months</th><th class="r">change</th></tr></thead><tbody>';
      res.velocity.slice(0, 20).forEach(function (c) {
        c.pairs.forEach(function (p) {
          h += '<tr><td>' + esc(c.chassis) + '</td><td>' + esc((c.title || "").slice(0, 40)) + '</td>' +
            '<td class="r">' + usd(p.from_price) + ' <span style="color:var(--faint)">' + fmtDate(p.from_date) + '</span></td>' +
            '<td class="r">' + usd(p.to_price) + ' <span style="color:var(--faint)">' + fmtDate(p.to_date) + '</span></td>' +
            '<td class="r">' + p.months_between + '</td>' +
            '<td class="r">' + (p.pct_change != null ? (p.pct_change > 0 ? '+' : '') + p.pct_change + '%' : "&mdash;") + '</td></tr>';
        });
      });
      h += '</tbody></table></div></div>';
    }

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
    if (cov.sale_type_split && cov.sale_type_split.house_total) h += 'House sales: ' + cov.sale_type_split.live + ' live, ' + cov.sale_type_split.online + ' online' + (cov.sale_type_inferred ? ' (live/online inferred from the house calendar where the record does not carry it)' : '') + '. ';
    h += 'Rooms ' + (cov.rooms_inferred ? 'are inferred from the house calendar where the record does not carry them' : 'stated only where the record carries them') + '. ';
    if (cov.excluded_total) { var er = Object.keys(cov.excluded_by_reason || {}).map(function (k) { return cov.excluded_by_reason[k] + ' ' + k; }).join(", "); h += cov.excluded_total + ' rows excluded (shown in receipts): ' + esc(er) + '. '; }
    if (cov.attempts_note) h += esc(cov.attempts_note.charAt(0).toUpperCase() + cov.attempts_note.slice(1)) + '. ';
    if (cov.receipts_sampled) h += 'Receipts show a recent sample of ' + cov.receipts_sampled.shown + ' of ' + cov.receipts_sampled.of + ' sales; the answer uses the full pool. ';
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
      var st = r.sale_type ? '<span class="stype ' + (r.sale_type.type === "live" ? "live" : "online") + '">' + esc(r.sale_type.type) + (r.sale_type.source === "inferred" ? " (inf)" : "") + '</span>' : "";
      var buyer = r.buyer_paid ? (r.buyer_paid.currency !== "USD" ? esc(r.buyer_paid.currency) + " " : "$") + Math.round(r.buyer_paid.amount).toLocaleString("en-US") : "&mdash;";
      var title = r.link ? '<a class="reclink" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc((r.title || "listing").slice(0, 54)) + '</a>' : esc((r.title || "").slice(0, 54));
      var excl = r.excluded ? ' excl' : '';
      var roomcell = r.room ? esc(r.room.text) + (r.room.source === "inferred" ? ' <span class="rinf">inf</span>' : '') : "&mdash;";
      var reason = r.excluded ? '<div class="exreason">excluded: ' + esc(r.excluded_reason || "") + '</div>' : '';
      return '<tr class="rec' + excl + '">' +
        '<td class="r">' + fmtDate(r.date) + '</td>' +
        '<td>' + esc(r.venue) + ' ' + st + reason + '</td>' +
        '<td>' + roomcell + '</td>' +
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
