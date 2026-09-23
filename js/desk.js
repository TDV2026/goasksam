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

  var LAST = null;
  function render(res) {
    if (res && (res.status === "ok" || res.status === "rerun")) LAST = res;
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
    // editable Build chips (window / channel / sale_type) + remove-a-filter
    h += '<div class="buildbar" id="buildbar"></div>';
    // toolbar: save view + exports
    h += '<div class="toolbar">' +
      '<button class="tbtn" id="saveView">Save view</button>' +
      '<button class="tbtn" id="expAns">Answer CSV</button>' +
      '<button class="tbtn" id="expRec">Receipts CSV</button>' +
      '<button class="tbtn" id="expXlsx">Excel .xlsx</button>' +
      '<button class="tbtn" id="expPdf">PDF</button>' +
      '<button class="tbtn ghost" id="viewsBtn">Saved views</button>' +
      '</div><div id="viewsPanel"></div>';
    if (res.changed_since) {
      var cs = res.changed_since;
      h += '<div class="changed">' + (cs.first_run ? 'First run of this view.' :
        'Since last run: total ' + cs.prev_total + ' &rarr; ' + cs.now_total + ' (' + (cs.total_delta >= 0 ? '+' : '') + cs.total_delta + ')' +
        (cs.now_top ? ', top ' + esc(cs.now_top.group) : '')) + '</div>';
    }
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

    wireToolbar(res);
    buildChips(res);
  }

  // ---- editable Build chips: change window / channel / sale_type and rerun ----
  function buildChips(res) {
    var bar = document.getElementById("buildbar"); if (!bar || !res.echo || !res.echo.dsl) return;
    var f = res.echo.dsl.filters || {};
    var WINS = ["7d","30d","90d","6mo","12mo","18mo","24mo","36mo"];
    function sel(label, key, options, cur) {
      var id = "chip_" + key;
      var opts = options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join("");
      return '<label class="editchip"><span>' + esc(label) + '</span><select id="' + id + '">' + opts + '</select></label>';
    }
    var html = '';
    html += sel("window", "window", WINS.map(function (w) { return [w, w]; }), f.window || "36mo");
    html += sel("channel", "channel", [["all","all"],["house","houses"],["online","online"]], f.channel || "all");
    if (f.channel === "house" || f.sale_type) html += sel("sale type", "sale_type", [["","live + online"],["live","live only"],["online","online only"]], f.sale_type || "");
    bar.innerHTML = '<span class="buildlabel">Refine</span>' + html;
    function rerunWith(patch) {
      var dsl = JSON.parse(JSON.stringify(res.echo.dsl));
      dsl.filters = dsl.filters || {};
      Object.keys(patch).forEach(function (k) { if (patch[k] === "" || patch[k] == null) delete dsl.filters[k]; else dsl.filters[k] = patch[k]; });
      out.scrollIntoView({ block: "start" });
      out.insertAdjacentHTML("afterbegin", '<div class="working" id="rw"><span class="pulse"></span> rerunning</div>');
      postRun({ dsl: dsl });
    }
    var ws = document.getElementById("chip_window"); if (ws) ws.onchange = function () { rerunWith({ window: this.value }); };
    var cs = document.getElementById("chip_channel"); if (cs) cs.onchange = function () { rerunWith({ channel: this.value }); };
    var ss = document.getElementById("chip_sale_type"); if (ss) ss.onchange = function () { rerunWith({ sale_type: this.value }); };
  }

  function postRun(payload) {
    go.setAttribute("disabled", "1");
    fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ desk: true, action: "run" }, payload)) })
      .then(function (r) { return r.json(); }).then(render).catch(function (e) { out.innerHTML = msg("Trouble", esc(e.message || e)); }).finally(function () { go.removeAttribute("disabled"); });
  }

  // ---- toolbar: save view, exports ----
  function wireToolbar(res) {
    var sv = document.getElementById("saveView");
    if (sv) sv.onclick = function () {
      var name = prompt("Name this view:", res.question || (res.echo.chips || []).slice(0, 3).join(" "));
      if (name == null) return;
      fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk: true, action: "save_view", name: name, question: res.question || null, dsl: res.echo.dsl, summary: res.summary || null }) })
        .then(function (r) { return r.json(); }).then(function (d) { sv.textContent = d.status === "saved" ? "Saved ✓" : "Save failed"; setTimeout(function () { sv.textContent = "Save view"; }, 2500); });
    };
    var a = document.getElementById("expAns"); if (a) a.onclick = function () { downloadCSV(res, "answer"); };
    var rc = document.getElementById("expRec"); if (rc) rc.onclick = function () { downloadCSV(res, "receipts"); };
    var xl = document.getElementById("expXlsx"); if (xl) xl.onclick = function () { downloadXLSX(res); };
    var pf = document.getElementById("expPdf"); if (pf) pf.onclick = function () { window.print(); };
    var vb = document.getElementById("viewsBtn"); if (vb) vb.onclick = function () { toggleViews(); };
  }

  // ---- saved views panel ----
  function toggleViews() {
    var panel = document.getElementById("viewsPanel");
    if (panel.innerHTML) { panel.innerHTML = ""; return; }
    panel.innerHTML = '<div class="working"><span class="pulse"></span> loading views</div>';
    fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk: true, action: "list_views" }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        var views = (d && d.views) || [];
        if (!views.length) { panel.innerHTML = '<div class="viewspanel">No saved views yet. Run a query and Save view.</div>'; return; }
        var rows = views.map(function (v) {
          return '<div class="viewrow"><button class="vlink" data-id="' + v.id + '">' + esc(v.name) + '</button>' +
            '<span class="vmeta">last run ' + (v.last_run_at ? fmtDate(v.last_run_at) : "never") + (v.last_summary ? ' &middot; ' + v.last_summary.total + ' sales' : '') + '</span>' +
            '<button class="vdel" data-id="' + v.id + '">delete</button></div>';
        }).join("");
        panel.innerHTML = '<div class="viewspanel"><div class="slabel">Saved views</div>' + rows + '</div>';
        Array.prototype.forEach.call(panel.querySelectorAll(".vlink"), function (el) { el.onclick = function () { rerunView(el.getAttribute("data-id")); }; });
        Array.prototype.forEach.call(panel.querySelectorAll(".vdel"), function (el) { el.onclick = function () { deleteView(el.getAttribute("data-id")); }; });
      });
  }
  function rerunView(id) {
    out.innerHTML = '<div class="working"><span class="pulse"></span> rerunning saved view</div>';
    fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk: true, action: "rerun_view", id: Number(id) }) })
      .then(function (r) { return r.json(); }).then(render);
  }
  function deleteView(id) {
    fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk: true, action: "delete_view", id: Number(id) }) })
      .then(function (r) { return r.json(); }).then(function () { var p = document.getElementById("viewsPanel"); p.innerHTML = ""; toggleViews(); });
  }

  // ---- exports (self-contained; watermark + echo + coverage embedded) ----
  function coverageLine(res) {
    var c = res.coverage || {};
    var srcs = (c.sources || []).map(function (s) { return s.source + " (from " + fmtDate(s.earliest) + ")"; }).join("; ");
    return "Window " + (c.window || "") + ". Basis " + (c.price_basis || "") + ". Sources: " + srcs + ". Thin threshold " + (c.thin_threshold || 5) + ".";
  }
  function watermark(res) { return "Sam Desk — org sam — " + new Date().toISOString().slice(0, 10) + " — archive only, not for redistribution"; }
  function answerRows(res) {
    var a = res.answer, rows = a.rows || [];
    var head = ["group", "count", "share", "median", "p25", "p75", "min", "max"];
    if (rows.some(function (r) { return r.sell_through_rate != null; })) head.push("sell_through");
    if (rows.some(function (r) { return r.reserve_not_met_rate != null; })) head.push("reserve_not_met_rate");
    head.push("newest");
    var body = rows.map(function (r) {
      var line = [r.group, r.count, r.share, r.median, r.p25, r.p75, r.min, r.max];
      if (head.indexOf("sell_through") !== -1) line.push(r.sell_through_rate);
      if (head.indexOf("reserve_not_met_rate") !== -1) line.push(r.reserve_not_met_rate);
      line.push(r.freshness);
      return line;
    });
    return [head].concat(body);
  }
  function receiptRows(res) {
    var head = ["date", "venue", "sale_type", "room", "hammer_usd", "buyer_paid", "currency", "miles", "chassis", "year", "title", "excluded", "reason", "link"];
    var body = (res.receipts || []).map(function (r) {
      return [r.date, r.venue, r.sale_type ? r.sale_type.type + (r.sale_type.source === "inferred" ? " (inf)" : "") : "", r.room ? r.room.text + (r.room.source === "inferred" ? " (inf)" : "") : "",
      r.hammer_usd, r.buyer_paid ? r.buyer_paid.amount : "", r.buyer_paid ? r.buyer_paid.currency : "", r.mileage, r.chassis, r.year, r.title, r.excluded ? "yes" : "", r.excluded_reason || "", r.link || ""];
    });
    return [head].concat(body);
  }
  function csvEsc(v) { var s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function downloadCSV(res, kind) {
    var grid = kind === "receipts" ? receiptRows(res) : answerRows(res);
    var pre = [["# " + watermark(res)], ["# Query: " + (res.echo.chips || []).join(" | ")], ["# " + coverageLine(res)], []];
    var all = pre.concat(grid);
    var csv = all.map(function (row) { return row.map(csvEsc).join(","); }).join("\n");
    saveBlob(csv, "text/csv", "sam-desk-" + kind + "-" + new Date().toISOString().slice(0, 10) + ".csv");
  }
  function saveBlob(data, mime, name) {
    var blob = new Blob([data], { type: mime }); var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  // Minimal real .xlsx: a stored (uncompressed) zip of Office Open XML. Two sheets: Answer, Receipts.
  function downloadXLSX(res) {
    var sheets = [["Answer", answerRows(res)], ["Receipts", receiptRows(res)]];
    var meta = [["Sam Desk export"], [watermark(res)], ["Query: " + (res.echo.chips || []).join(" | ")], [coverageLine(res)]];
    sheets.unshift(["Coverage", meta]);
    var files = [];
    files.push(["[Content_Types].xml", ctXml(sheets.length)]);
    files.push(["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    files.push(["xl/workbook.xml", wbXml(sheets)]);
    files.push(["xl/_rels/workbook.xml.rels", wbRels(sheets)]);
    sheets.forEach(function (s, i) { files.push(["xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(s[1])]); });
    saveBlob(zipStore(files), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sam-desk-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }
  function xesc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function colRef(n) { var s = ""; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function sheetXml(grid) {
    var rows = grid.map(function (row, ri) {
      var cells = row.map(function (v, ci) {
        var ref = colRef(ci) + (ri + 1);
        if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
      }).join("");
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows + '</sheetData></worksheet>';
  }
  function wbXml(sheets) { var s = sheets.map(function (sh, i) { return '<sheet name="' + xesc(sh[0]).slice(0, 31) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join(""); return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + s + '</sheets></workbook>'; }
  function wbRels(sheets) { var r = sheets.map(function (sh, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join(""); return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + r + '</Relationships>'; }
  function ctXml(n) { var o = ""; for (var i = 1; i <= n; i++) o += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + o + '</Types>'; }

  // stored-only zip (no compression) with CRC32 — self-contained, valid .xlsx container.
  var CRCT = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRCT[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function strBytes(s) { return new TextEncoder().encode(s); }
  function zipStore(files) {
    var chunks = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var nameB = strBytes(f[0]), data = strBytes(f[1]), crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0));
      chunks.push(new Uint8Array(local)); chunks.push(nameB); chunks.push(data);
      var cen = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push({ head: new Uint8Array(cen), name: nameB });
      offset += local.length + nameB.length + data.length;
    });
    var cstart = offset, csize = 0, centralBytes = [];
    central.forEach(function (c) { centralBytes.push(c.head); centralBytes.push(c.name); csize += c.head.length + c.name.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(csize), u32(cstart), u16(0)));
    var total = offset + csize + end.length, outb = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { outb.set(c, pos); pos += c.length; });
    centralBytes.forEach(function (c) { outb.set(c, pos); pos += c.length; });
    outb.set(end, pos);
    return outb;
  }
})();
