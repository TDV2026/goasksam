/* Sam Desk client (Stage 1). Renders the four-part Analyst result:
   1 answer table  2 receipts (every transaction)  3 the read  4 query echo + coverage.
   Every number on screen has its receipts one click away. */
(function () {
  "use strict";
  var API = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  var out = document.getElementById("out");
  var input = document.getElementById("q");
  var go = document.getElementById("go");

  // (h) The "what's my car worth" example is removed: the Desk never values a car, and the
  // language rules apply here too. A record example shows the highest-sale flow instead.
  var EXAMPLES = [
    "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?",
    "E30 M3s: median and count by month over three years, houses and online.",
    "What's the record sale for a BMW M3?",
    "1929 Duesenberg Model J, every house sale."
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

  // (j) Robust fetch: a Vercel timeout/500 returns PLAIN TEXT, not JSON. Parsing it as JSON threw
  // the raw "Unexpected token 'A'..." at the user. Read the body as text, JSON.parse in a guard, and
  // on a non-JSON or failed response show a plain-English error with a Retry button and log the real
  // error. LAST_PAYLOAD lets Retry re-run the exact request.
  var LAST_PAYLOAD = null;
  function deskError(text) {
    return '<div class="msg deskerr"><div class="t">That took longer than expected</div><p>' + esc(text) + '</p><button class="retry" id="deskretry">Try again</button></div>';
  }
  function wireRetry() {
    var rb = document.getElementById("deskretry");
    if (rb) rb.onclick = function () { if (LAST_PAYLOAD) deskFetch(LAST_PAYLOAD); };
  }
  function deskFetch(payload) {
    LAST_PAYLOAD = payload;
    go.setAttribute("disabled", "1");
    out.innerHTML = '<div class="working"><span class="pulse"></span> reading the archive</div>';
    fetch(API + "/api/sellerDecision", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ desk: true, action: "run" }, payload))
    }).then(function (r) {
      return r.text().then(function (t) { return { ok: r.ok, code: r.status, text: t }; });
    }).then(function (resp) {
      var j;
      try { j = JSON.parse(resp.text); }
      catch (e) {
        console.error("Desk non-JSON response (" + resp.code + "): " + String(resp.text).slice(0, 300));
        out.innerHTML = deskError("Try again, or narrow the window (a shorter window, or one generation instead of all)."); wireRetry(); return;
      }
      if (!resp.ok) {
        console.error("Desk error " + resp.code + ": " + JSON.stringify(j).slice(0, 300));
        out.innerHTML = deskError(esc((j && j.error) || ("The request failed (" + resp.code + ").")) + " Try again, or narrow the window."); wireRetry(); return;
      }
      render(j);
    }).catch(function (e) {
      console.error("Desk fetch failed:", e);
      out.innerHTML = deskError("The Desk could not reach the archive. Check your connection and try again."); wireRetry();
    }).finally(function () { go.removeAttribute("disabled"); });
  }
  // ---- STAGE B: interpreter + reading card + clarification + conversation ----
  var CUR_READING = null, THREAD = [], RECENT = [];
  var readingcard = document.getElementById("readingcard");
  var turnsEl = document.getElementById("turns");
  var followrow = document.getElementById("followrow");
  var followq = document.getElementById("followq");
  var followgo = document.getElementById("followgo");

  function interpretFetch(question, opts) {
    opts = opts || {};
    go.setAttribute("disabled", "1"); if (followgo) followgo.setAttribute("disabled", "1");
    out.innerHTML = '<div class="working"><span class="pulse"></span> reading your question</div>';
    var body = { desk: true, action: "interpret", question: question, run: true, recentReadings: RECENT.slice(-3) };
    if (opts.threadReading) body.threadReading = opts.threadReading;
    fetch(API + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, code: r.status, text: t }; }); })
      .then(function (resp) {
        var j; try { j = JSON.parse(resp.text); } catch (e) { out.innerHTML = deskError("Try again."); wireRetry(); return; }
        if (!resp.ok || j.status !== "interpreted") { out.innerHTML = deskError(esc((j && j.error) || "The request failed.")); wireRetry(); return; }
        handleInterpret(question, j);
      })
      .catch(function () { out.innerHTML = deskError("The Desk could not reach the archive."); wireRetry(); })
      .finally(function () { go.removeAttribute("disabled"); if (followgo) followgo.removeAttribute("disabled"); });
  }
  function chipHtml(c) {
    var k = c.type ? '<span class="k">' + esc(c.type) + '</span>' : "";
    var x = c.removable ? ' <span class="x" data-drop-grouping="1">clear</span>' : "";
    return '<span class="rc-chip' + (c.defaulted ? " def" : "") + '">' + k + esc(c.label) + x + '</span>';
  }
  function renderCard(res) {
    var r = res.reading || {};
    var srcLbl = res.source === "fallback" ? "basic parser (understanding layer unavailable)" : res.source === "vin" ? "VIN decoded" : "understood";
    var h = '<div class="rcard"><div class="rc-lede">How I read this · ' + esc(srcLbl) + '</div><div class="rc-chips">';
    (res.chips || []).forEach(function (c) { h += chipHtml(c); });
    h += '</div>';
    if (r.grouping && r.grouping.members && r.grouping.members.length) {
      var same = !!r.grouping.sameModel;
      h += '<div class="rc-members">';
      r.grouping.members.forEach(function (m, i) {
        var lbl = m.chipLabel || (same ? (m.generation || m.label || (m.make + " " + m.model)) : (m.make + " " + m.model));
        h += '<span class="rc-mem">' + esc(lbl) + '<span class="x" data-drop-member="' + i + '" data-drop-tok="' + esc(m.generation || m.label || m.model) + '">×</span></span>';
      });
      h += '</div>';
    }
    (res.not_applied || []).forEach(function (n) { h += '<div class="rc-na"><b>Not applied:</b> ' + esc(n.phrase) + (n.why ? " (" + esc(n.why) + ")" : "") + '</div>'; });
    if (res.clarify) {
      h += '<div class="rc-clarify"><div class="q">' + esc(res.clarify.question) + '</div>';
      (res.clarify.options || []).forEach(function (o) { h += '<span class="rc-opt" data-opt="' + esc(o) + '">' + esc(o) + '</span>'; });
      h += '<div class="rc-na" style="margin-top:8px;color:var(--faint)">Tap one, or type your answer below.</div></div>';
    }
    h += '</div>';
    readingcard.innerHTML = h;
    Array.prototype.forEach.call(readingcard.querySelectorAll('[data-drop-member]'), function (el) {
      el.onclick = function () { interpretFetch("drop the " + (el.getAttribute("data-drop-tok") || ""), { threadReading: res.reading }); };
    });
    Array.prototype.forEach.call(readingcard.querySelectorAll('[data-opt]'), function (el) {
      el.onclick = function () { interpretFetch(el.getAttribute("data-opt"), { threadReading: res.reading }); };
    });
  }
  function renderTurns() {
    if (THREAD.length < 2) { turnsEl.innerHTML = ""; return; }
    var h = "";
    THREAD.slice(0, -1).forEach(function (t, i) { h += '<div class="turn" data-turn="' + i + '"><div class="tq">' + esc(t.question) + '</div><div class="tr">' + esc(t.summary || "") + '</div></div>'; });
    turnsEl.innerHTML = h;
    Array.prototype.forEach.call(turnsEl.querySelectorAll('[data-turn]'), function (el) {
      el.onclick = function () { var t = THREAD[+el.getAttribute("data-turn")]; readingcard.innerHTML = t.cardHtml; out.innerHTML = t.answerHtml; };
    });
  }
  function summarize(res) {
    var r = res.reading || {}, parts = [];
    (r.scopes || []).forEach(function (s) { parts.push(s.make + " " + s.model); });
    if (r.grouping) parts.push(r.grouping.name);
    if (r.metric && r.metric.measure) parts.push(r.metric.measure);
    if (res.clarify) parts.push("needs a choice");
    if (res.unsupported) parts.push("not answerable");
    return parts.join(" · ");
  }
  function handleInterpret(question, res) {
    renderCard(res);
    if (res.cannot_apply) { out.innerHTML = msg("Can't apply that", esc(res.cannot_apply)); }
    else if (res.answer) render(res.answer);
    else if (res.clarify) out.innerHTML = msg("One quick thing", "Pick an option above (or type it) and I'll run it.");
    else if (res.unsupported) out.innerHTML = msg("Not what the Desk does", esc(res.unsupported.message));
    else if (res.meta === "coverage") out.innerHTML = msg("Coverage", "Name a source (e.g. “what do you cover for Mecum”) to see its dates.");
    else if (res.honest_miss) out.innerHTML = msg("I couldn't read that", "I don't recognize that yet. It's logged so we can add it. Try a make and model.");
    else if (res.reading && (res.reading.grouping || (res.reading.structural || []).some(function (s) { return s.kind === "comparison"; }))) out.innerHTML = msg("Reading ready", "This is a ranking or comparison; the multi-car answer arrives in the next stage. The reading above is how it was understood.");
    else out.innerHTML = "";
    CUR_READING = res.reading; RECENT.push(res.reading);
    THREAD.push({ question: question, reading: res.reading, summary: summarize(res), cardHtml: readingcard.innerHTML, answerHtml: out.innerHTML });
    renderTurns();
    if (followrow) followrow.style.display = "flex";
  }
  function run() {
    var q = (input.value || "").trim(); if (!q) return;
    THREAD = []; RECENT = []; CUR_READING = null; renderTurns();
    interpretFetch(q, {});
  }
  function runFollow() {
    var q = (followq.value || "").trim(); if (!q) return;
    interpretFetch(q, { threadReading: CUR_READING }); followq.value = "";
  }
  go.onclick = run;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
  if (followgo) followgo.onclick = runFollow;
  if (followq) followq.addEventListener("keydown", function (e) { if (e.key === "Enter") runFollow(); });

  function msg(tag, body) { return '<div class="msg"><div class="t">' + esc(tag) + '</div>' + body + '</div>'; }

  var LAST = null;
  function render(res) {
    if (res && (res.status === "ok" || res.status === "rerun")) LAST = res;
    if (!res || res.status === "error") {
      // (a) The executor returns status "error" (reason "query_error") when the archive query failed
      // under load AFTER retries, rather than a silently empty pool. Show the plain-English retry.
      if (res && res.reason === "query_error") { out.innerHTML = deskError("The archive query did not come back cleanly. Try again, or narrow the window."); wireRetry(); return; }
      out.innerHTML = msg("Trouble", esc((res && res.reason) || "something went wrong") + "."); return;
    }
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

    // (e) RECORD block: the single highest sale leads, then the top five (price descending), then
    // the set-aside specials and the definition. Drawn from result.record (full pool, halos/race/
    // restomods removed via the shared rule), so the top sale is always traceable to its receipt.
    if (res.record) {
      var rec = res.record, rtop = rec.top && rec.top[0];
      h += '<div class="section record"><div class="slabel">Record</div>';
      if (rtop) {
        h += '<div class="recordtop"><div class="recordprice">' + usd(rtop.hammer_usd) + '</div>' +
          '<div class="recordcar">' + (rtop.link ? '<a href="' + esc(rtop.link) + '" target="_blank" rel="noopener">' + esc(rtop.title || "listing") + '</a>' : esc(rtop.title || "")) + '</div>' +
          '<div class="recordmeta">' + esc(rtop.venue || "") + ' &middot; ' + fmtDate(rtop.date) + '</div></div>';
        h += '<div class="tblwrap"><table class="receipts"><thead><tr><th class="r">#</th><th class="r">price</th><th>car</th><th>venue</th><th class="r">date</th></tr></thead><tbody>';
        rec.top.forEach(function (r, i) {
          var t = r.link ? '<a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc((r.title || "").slice(0, 54)) + '</a>' : esc((r.title || "").slice(0, 54));
          h += '<tr><td class="r">' + (i + 1) + '</td><td class="r">' + usd(r.hammer_usd) + '</td><td>' + t + '</td><td>' + esc(r.venue || "") + '</td><td class="r">' + fmtDate(r.date) + '</td></tr>';
        });
        h += '</tbody></table></div>';
        if (rec.set_aside && rec.set_aside.length) {
          h += '<details class="setaside"><summary>' + rec.set_aside_total + ' higher/special result' + (rec.set_aside_total === 1 ? '' : 's') + ' set aside (halo, race car or restomod)</summary><div class="tblwrap"><table class="receipts"><tbody>';
          rec.set_aside.forEach(function (r) { h += '<tr><td class="r">' + usd(r.hammer_usd) + '</td><td>' + esc((r.title || "").slice(0, 54)) + '</td><td>' + esc(r.record_excluded_as || "") + '</td></tr>'; });
          h += '</tbody></table></div></details>';
        }
        h += '<div class="recorddef">' + esc(rec.definition) + '</div>';
      } else {
        h += '<div class="read">No qualifying sale to set a record from once halos, race cars and restomods are set aside.</div>';
      }
      h += '</div>';
    }

    // 1. the answer (measure-aware columns)
    var a = res.answer, rows = a.rows || [];
    var dimLabel = (a.dimensions && a.dimensions.length ? a.dimensions.join(" · ") : (a.dimension || "overall")).replace(/_/g, " ");
    var M = a.measures || [];
    // Table shows only REQUESTED measures (stats are always computed for charts, so a presence
    // check would leak unrequested columns). count always shows.
    var has = function (m) { return M.indexOf(m) !== -1; };
    var priceHdr = a.priceLabel && /bid-to/.test(a.priceLabel) ? "bid-to" : "median";
    var unit = res.status; // noop
    var cols = [];
    cols.push(["count", "count", function (r) { return '<span class="clk" data-group="' + esc(r.group) + '">' + r.count + '</span>'; }]);
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
    // (i) The header states the channel and window IN FORCE, so a refine is visibly applied.
    var chanInForce = (res.echo && res.echo.dsl && res.echo.dsl.filters && res.echo.dsl.filters.channel) || "all";
    var chanWord = chanInForce === "house" ? "auction houses" : chanInForce === "online" ? "online" : "all channels";
    var winInForce = (res.coverage && res.coverage.window) || "";
    h += '<div class="section"><div class="slabel">Answer <span class="n">' + rows.length + ' ' + esc(dimLabel) + (rows.length === 1 ? '' : 's') + ' &middot; ' + a.total + (a.outcome && a.outcome !== "sold" ? ' ' + esc(a.outcome.replace(/_/g, " ")) : ' sales') + ' &middot; ' + esc(chanWord) + (winInForce ? ' &middot; ' + esc(winInForce) : '') + '</span></div>';
    h += '<div class="tblwrap"><table class="answer"><thead><tr><th>' + esc(dimLabel) + '</th>';
    cols.forEach(function (c) { h += '<th>' + esc(c[1]) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.group) + (r.thin ? '<span class="thintag">thin</span>' : '') + '</td>';
      cols.forEach(function (c) { h += '<td class="cellnum">' + c[2](r) + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    // charts (spec-driven; drawn from the answer/receipts on screen)
    if (res.charts && res.charts.length) h += '<div class="section" id="charts"></div>';

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
    var exclN = (res.coverage && res.coverage.excluded_total) || recs.filter(function (r) { return r.excluded; }).length;
    // (g) ONE clear pool number: the qualifying total. Receipts are a recent sample of it; excluded
    // rows are shown separately with reasons. No competing 1348/743/300 trio.
    var qualifyN = (res.answer && res.answer.total) != null ? res.answer.total : (recs.length - exclN);
    var keptShown = recs.length - exclN;
    var sampleNote = (res.coverage && res.coverage.receipts_sampled)
      ? 'Showing the ' + res.coverage.receipts_sampled.shown + ' most recent of ' + qualifyN + ' qualifying sales; the answer uses the full pool.'
      : 'Showing all ' + keptShown + ' qualifying sale' + (keptShown === 1 ? '' : 's') + '.';
    h += '<div class="section" id="receipts"><div class="slabel">Receipts <span class="n">' + qualifyN + ' qualifying</span></div>';
    h += '<div class="reconcile">' + esc(sampleNote) + (exclN > 0 ? ' Plus ' + exclN + ' excluded, listed below with reasons.' : '') + '</div>';
    h += '<div id="drillhdr"></div>';
    h += '<div class="tblwrap"><table class="receipts"><thead><tr>';
    h += '<th>date</th><th>venue</th><th>room</th><th class="r">hammer (USD)</th><th class="r">buyer paid<sup class="fn">*</sup></th><th class="r">miles</th><th>chassis</th><th>title</th>';
    h += '</tr></thead><tbody id="recbody"></tbody></table></div>';
    h += '<button class="recmore" id="recmore"></button>';
    // (f) The buyer-paid column excludes the online platform fee (not yet computed). Footnote so a
    // reader can see it. Houses are premium-inclusive; online (BaT, C&B) charge a fee on top.
    h += '<div class="feefoot">* Buyer paid is premium-inclusive at the auction houses. Bring a Trailer and Cars &amp; Bids charge a buyer fee on top of the sold price that is not yet included, so the online figure equals the sold price (marked "excl. fee").</div>';
    h += '</div>';

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
    // (g) receipts_sampled is stated once, in the Receipts header, not repeated here (no count trio).
    h += 'Thin threshold ' + (cov.thin_threshold || 5) + ' sales.';
    h += '</div>';

    h += '</div>';
    out.innerHTML = h;

    // receipts paging (show 12, expand) + (d) drill-down to a clicked group
    var shown = 0, PAGE = 12;
    var VIEW = recs;                 // current receipts view: all, or a drilled group
    var PRIMARY = a.dimension;       // primary grouping dimension, for filtering
    function recMatchesGroup(r, group) {
      var d = r.date ? new Date(r.date) : null;
      switch (PRIMARY) {
        case "generation": return (r.generation || "unknown") === group;
        case "venue": return (r.venue || "") === group;
        case "channel": return (r.channel || "") === group;
        case "year": return d ? String(d.getUTCFullYear()) === group : false;
        case "model_year": return String(r.year || "") === group;
        default: return null;        // dimension not client-filterable -> scroll only
      }
    }
    function setDrillHeader(group, count) {
      var hdr = document.getElementById("drillhdr"); if (!hdr) return;
      if (group == null) { hdr.innerHTML = ""; return; }
      hdr.innerHTML = '<div class="drillbar">Showing <b>' + esc(group) + '</b> &middot; ' + count + ' sale' + (count === 1 ? '' : 's') + ' <button class="drillback" id="drillback">show all</button></div>';
      var bk = document.getElementById("drillback"); if (bk) bk.onclick = function () { VIEW = recs; shown = 0; setDrillHeader(null); drawRecs(); };
    }
    function drawRecs() {
      var body = document.getElementById("recbody"); if (!body) return;
      var slice = VIEW.slice(0, shown + PAGE); shown = slice.length;
      body.innerHTML = slice.map(recRow).join("");
      var more = document.getElementById("recmore");
      if (shown < VIEW.length) { more.textContent = "show " + Math.min(PAGE, VIEW.length - shown) + " more of " + VIEW.length; more.style.display = ""; more.onclick = drawRecs; }
      else more.style.display = "none";
    }
    function drillTo(group) {
      var t = document.getElementById("receipts"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      var probe = recMatchesGroup(recs[0] || {}, group);
      if (probe === null) { setDrillHeader(null); return; }   // not filterable client-side: scroll only
      var row = (rows || []).filter(function (r) { return String(r.group) === String(group); })[0];
      var filtered = recs.filter(function (r) { return recMatchesGroup(r, group); });
      // Pin the group's MAX and MIN receipts from the FULL pool (backend-attached to the answer row),
      // so every figure - the max especially - is traceable even when it is older than the 300 sample.
      var pinned = [];
      if (row && row.max_receipt) pinned.push(Object.assign({}, row.max_receipt, { _tag: "MAX" }));
      if (row && row.min_receipt && (!row.max_receipt || row.min_receipt.link !== row.max_receipt.link)) pinned.push(Object.assign({}, row.min_receipt, { _tag: "MIN" }));
      var pl = {}; pinned.forEach(function (p) { if (p.link) pl[p.link] = 1; });
      VIEW = pinned.concat(filtered.filter(function (r) { return !(r.link && pl[r.link]); }));
      shown = 0;
      setDrillHeader(group, row ? row.count : VIEW.length);
      drawRecs();
    }
    function recRow(r) {
      var st = r.sale_type ? '<span class="stype ' + (r.sale_type.type === "live" ? "live" : "online") + '">' + esc(r.sale_type.type) + (r.sale_type.source === "inferred" ? " (inf)" : "") + '</span>' : "";
      var buyer = r.buyer_paid ? (r.buyer_paid.currency !== "USD" ? esc(r.buyer_paid.currency) + " " : "$") + Math.round(r.buyer_paid.amount).toLocaleString("en-US") : "&mdash;";
      if (r.channel === "online" && r.buyer_paid) buyer += ' <span class="feetag">excl. fee</span>';
      var tag = r._tag ? '<span class="drilltag">' + esc(r._tag) + '</span> ' : '';
      var title = r.link ? '<a class="reclink" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc((r.title || "listing").slice(0, 54)) + '</a>' : esc((r.title || "").slice(0, 54));
      var excl = r.excluded ? ' excl' : '';
      var roomcell = r.room ? esc(r.room.text) + (r.room.source === "inferred" ? ' <span class="rinf">inf</span>' : '') : "&mdash;";
      var reason = r.excluded ? '<div class="exreason">excluded: ' + esc(r.excluded_reason || "") + '</div>' : '';
      return '<tr class="rec' + excl + '">' +
        '<td class="r">' + fmtDate(r.date) + '</td>' +
        '<td>' + esc(r.venue) + ' ' + st + reason + '</td>' +
        '<td>' + roomcell + '</td>' +
        '<td class="r">' + tag + usd(r.hammer_usd) + '</td>' +
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

    // (d) click a count -> filter the receipts to that group (drawn from the full pool, max/min
    // pinned and traceable), with a clear way back to all. Dimensions that cannot be filtered
    // client-side fall back to a scroll.
    Array.prototype.forEach.call(document.querySelectorAll(".answer .clk"), function (el) {
      el.onclick = function () { var g = el.getAttribute("data-group"); if (g != null) drillTo(g); };
    });

    wireToolbar(res);
    buildChips(res);
    if (res.charts && res.charts.length) renderCharts(res);
  }

  // ================= CHARTS (SVG, every mark a real transaction) =================
  // Colour-blind-safe fixed venue palette (Okabe-Ito); the SAME colour per venue on every chart.
  var VENUE_COLORS = {
    "Bring a Trailer": "#0072B2", "Cars & Bids": "#E69F00", "RM Sotheby's": "#009E73",
    "Gooding & Co": "#CC79A7", "Gooding Christie's": "#CC79A7", "Bonhams": "#56B4E9",
    "Broad Arrow": "#D55E00", "Barrett-Jackson": "#F0E442", "Mecum Auctions": "#8C564B",
    "Hagerty": "#117733", "Sotheby's Motorsport": "#AA4499", "MB Market": "#44AA99", "Online": "#999999"
  };
  var PALETTE = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#8C564B", "#117733", "#AA4499", "#44AA99", "#999999"];
  function colorFor(name, i) { return VENUE_COLORS[name] || PALETTE[(i || 0) % PALETTE.length]; }
  var SVGNS = "http://www.w3.org/2000/svg";
  function E(tag, attrs, txt) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; }
  function money(n) { return n == null ? "" : "$" + Math.round(n).toLocaleString("en-US"); }

  // period order helpers (categorical order by MEANING, never by value)
  var DOW_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var BAND_ORDER = ["under 25k", "25k to 50k", "50k to 100k", "100k to 250k", "250k to 500k", "500k to 1M", "1M and up", "unknown"];
  function orderCats(dim, cats, rowsByCat) {
    if (dim === "day_of_week") return DOW_ORDER.filter(function (d) { return cats.indexOf(d) !== -1; });
    if (dim === "price_band") return BAND_ORDER.filter(function (d) { return cats.indexOf(d) !== -1; });
    if (dim === "month" || dim === "quarter" || dim === "year" || dim === "model_year") return cats.slice().sort();
    // venue / generation etc: by count descending
    return cats.slice().sort(function (a, b) { return (rowsByCat[b] || 0) - (rowsByCat[a] || 0); });
  }

  var _tip;
  function tip() { if (!_tip) { _tip = document.createElement("div"); _tip.className = "charttip"; document.body.appendChild(_tip); } return _tip; }
  function showTip(x, y, html) { var t = tip(); t.innerHTML = html; t.style.display = "block"; t.style.left = (x + 12) + "px"; t.style.top = (y + 12) + "px"; }
  function hideTip() { if (_tip) _tip.style.display = "none"; }

  function renderCharts(res) {
    var host = document.getElementById("charts"); if (!host) return;
    var specs = res.charts;
    var tabs = specs.map(function (s, i) { return '<button class="ctab' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' + esc(chartTabLabel(s)) + '</button>'; }).join("");
    host.innerHTML = '<div class="slabel">Chart</div><div class="ctabs">' + tabs + '<button class="ctab png" id="chpng">Download PNG</button></div><div class="cwrap" id="cwrap"></div><div class="cnote" id="cnote"></div>';
    function draw(i) {
      var wrap = document.getElementById("cwrap"); wrap.innerHTML = ""; document.getElementById("cnote").textContent = "";
      var spec = specs[i];
      var w = Math.max(320, Math.min(920, wrap.clientWidth || 900)), narrow = w < 520;
      var svg = E("svg", { viewBox: "0 0 " + w + " 460", width: "100%", height: "460", "font-family": "ui-monospace,Menlo,monospace", role: "img" });
      wrap.appendChild(svg);
      try {
        if (spec.type === "bars") drawBars(svg, res, spec, w);
        else if (spec.type === "line") drawLine(svg, res, spec, w);
        else if (spec.type === "strip") drawStrip(svg, res, spec, w, narrow);
        else if (spec.type === "stacked") drawStacked(svg, res, spec, w);
      } catch (e) { wrap.innerHTML = msg("Chart", "Could not draw this from real points; the table above is the record."); }
    }
    Array.prototype.forEach.call(host.querySelectorAll(".ctab:not(.png)"), function (el) {
      el.onclick = function () { host.querySelectorAll(".ctab").forEach(function (x) { x.classList.remove("on"); }); el.classList.add("on"); draw(Number(el.getAttribute("data-i"))); };
    });
    document.getElementById("chpng").onclick = function () { var s = document.querySelector("#cwrap svg"); if (s) chartToPNG(s); };
    draw(0);
    window.addEventListener("resize", function () { var on = host.querySelector(".ctab.on"); if (on) draw(Number(on.getAttribute("data-i"))); }, { once: true });
  }
  function chartTabLabel(s) { return s.type === "bars" ? "Bars" : s.type === "line" ? "Line over time" : s.type === "strip" ? "Distribution" : "Share over time"; }

  var AX = "#928b7a", INK = "#191410", GRID = "#e4ddcd";

  function drawBars(svg, res, spec, w) {
    var rows = (res.answer.rows || []).filter(function (r) { return r.group !== "unknown"; });
    var rowsByCat = {}; rows.forEach(function (r) { rowsByCat[r.group] = r.count; });
    var cats = orderCats(spec.x, rows.map(function (r) { return r.group; }), rowsByCat);
    var yKey = spec.y, m = 0;
    cats.forEach(function (c) { var r = rowById(rows, c); if (r && r[yKey] != null) m = Math.max(m, r[yKey]); });
    var L = 60, R = 20, T = 20, B = 90, H = 460, plotH = H - T - B, plotW = w - L - R;
    axisY(svg, L, T, plotH, m, yKey === "median" ? money : String);
    var bw = plotW / cats.length, barw = Math.min(64, bw * 0.62);
    cats.forEach(function (c, i) {
      var r = rowById(rows, c), val = r ? r[yKey] : 0; if (val == null) val = 0;
      var x = L + i * bw + (bw - barw) / 2, bh = m ? (val / m) * plotH : 0, y = T + plotH - bh;
      var col = spec.x === "venue" ? colorFor(c, i) : PALETTE[i % PALETTE.length];
      var rect = E("rect", { x: x, y: y, width: barw, height: Math.max(0, bh), fill: col, rx: 3, class: "cmark" });
      rect.addEventListener("mousemove", function (e) { showTip(e.pageX, e.pageY, "<b>" + esc(c) + "</b><br>" + (yKey === "median" ? "median " + money(val) : val + " sales")); });
      rect.addEventListener("mouseleave", hideTip);
      svg.appendChild(rect);
      svg.appendChild(E("text", { x: x + barw / 2, y: y - 6, "text-anchor": "middle", "font-size": 11, fill: INK }, yKey === "median" ? money(val) : String(val)));
      var lbl = E("text", { x: x + barw / 2, y: T + plotH + 16, "text-anchor": "end", "font-size": 10, fill: AX, transform: "rotate(-35 " + (x + barw / 2) + " " + (T + plotH + 16) + ")" }, c.length > 16 ? c.slice(0, 15) + "…" : c);
      svg.appendChild(lbl);
    });
    caption(svg, w, H, spec.y === "median" ? "Median (" + basisShort(spec.basis) + ")" : "Count");
  }

  function drawLine(svg, res, spec, w) {
    var rows = res.answer.rows || [];
    var L = 64, R = 20, T = 20, B = 70, H = 460, plotH = H - T - B, plotW = w - L - R;
    // periods (x) in chronological order; series (optional) e.g. price band
    var periods = [], seriesKeys = [];
    var byKey = {}; // "series|period" -> row
    rows.forEach(function (r) {
      var parts = String(r.group).split(" · ");
      var per, ser;
      if (spec.series) { // group is "series · period" OR "period · series" depending on order; find the time part
        var timeIdx = parts.findIndex(function (p) { return /\d{4}/.test(p); });
        per = parts[timeIdx]; ser = parts[1 - timeIdx] || parts.filter(function (_, i) { return i !== timeIdx; })[0];
      } else { per = parts[0]; ser = "_"; }
      if (periods.indexOf(per) === -1) periods.push(per);
      if (seriesKeys.indexOf(ser) === -1) seriesKeys.push(ser);
      byKey[ser + "|" + per] = r;
    });
    periods.sort();
    var maxY = 0;
    Object.keys(byKey).forEach(function (k) { var r = byKey[k]; if (r.p75 != null) maxY = Math.max(maxY, r.p75); else if (r.median != null) maxY = Math.max(maxY, r.median); });
    var dotsMode = spec.mode === "dots";
    // in dots mode overlay real sales; recompute maxY from receipts too
    var recByPer = {};
    if (dotsMode) { (res.receipts || []).filter(function (x) { return !x.excluded && x.hammer_usd > 0; }).forEach(function (x) { var per = periodOf(spec.x, x.date); (recByPer[per] = recByPer[per] || []).push(x); maxY = Math.max(maxY, x.hammer_usd); }); }
    axisY(svg, L, T, plotH, maxY, money);
    var xw = plotW / Math.max(1, periods.length);
    var xAt = function (per) { return L + periods.indexOf(per) * xw + xw / 2; };
    var yAt = function (v) { return T + plotH - (maxY ? (v / maxY) * plotH : 0); };
    periods.forEach(function (per) { svg.appendChild(E("text", { x: xAt(per), y: T + plotH + 16, "text-anchor": "middle", "font-size": 10, fill: AX }, per)); });
    seriesKeys.forEach(function (ser, si) {
      var col = colorFor(ser, si);
      // build points where data exists (break line across empty periods)
      var segs = [], cur = [];
      periods.forEach(function (per) {
        var r = byKey[ser + "|" + per];
        if (r && r.median != null && !r.thin) { cur.push([xAt(per), yAt(r.median), r, per]); }
        else { if (cur.length) segs.push(cur); cur = []; }
      });
      if (cur.length) segs.push(cur);
      segs.forEach(function (seg) {
        if (seg.length > 1) { var d = seg.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" "); svg.appendChild(E("path", { d: d, fill: "none", stroke: col, "stroke-width": 2 })); }
        seg.forEach(function (p) {
          var r = p[2];
          if (!dotsMode) { // median point + p25-p75 whisker
            if (r.p25 != null && r.p75 != null) svg.appendChild(E("line", { x1: p[0], y1: yAt(r.p25), x2: p[0], y2: yAt(r.p75), stroke: col, "stroke-width": 1.5, opacity: 0.55 }));
            var c = E("circle", { cx: p[0], cy: p[1], r: 4, fill: col, class: "cmark" });
            c.addEventListener("mousemove", function (e) { showTip(e.pageX, e.pageY, "<b>" + esc(ser === "_" ? p[3] : ser + " · " + p[3]) + "</b><br>median " + money(r.median) + "<br>p25-p75 " + money(r.p25) + " to " + money(r.p75) + "<br>" + r.count + " sales"); });
            c.addEventListener("mouseleave", hideTip); svg.appendChild(c);
          }
        });
      });
    });
    // dots mode: every real sale as a clickable dot
    if (dotsMode) {
      periods.forEach(function (per) {
        (recByPer[per] || []).forEach(function (x, i) {
          var jx = xAt(per) + (Math.random() - 0.5) * Math.min(22, xw * 0.5);
          var dot = E("circle", { cx: jx, cy: yAt(x.hammer_usd), r: 3, fill: colorFor(x.venue, 0), opacity: 0.7, class: "cmark clk" });
          bindReceipt(dot, x);
          svg.appendChild(dot);
        });
      });
      document.getElementById("cnote").textContent = "Every dot is a real sale, clickable to its receipt.";
    } else {
      document.getElementById("cnote").textContent = "Pool " + spec.pool + " sales (300+): each period shows the median with a p25 to p75 whisker; individual dots folded for size. Every sale is in the receipts.";
    }
    caption(svg, w, H, "Median (" + basisShort(spec.basis) + ")");
    if (seriesKeys.length > 1) legend(svg, w, seriesKeys);
  }

  function drawStrip(svg, res, spec, w, narrow) {
    // Use the larger strip sample (up to 500 priced sales) when the backend sent it; fall back to the
    // 300-row table receipts. strip_sampled carries the true "N of M" (M = all priced in the pool).
    var recs = (res.strip_receipts || res.receipts || []).filter(function (r) { return !r.excluded && r.hammer_usd > 0; });
    var N = recs.length;
    if (recs.length > spec.cap) { recs = shuffle(recs.slice()).slice(0, spec.cap); N = recs.length; }
    var groupKey = spec.by === "generation" ? function (r) { return r.generation || "unknown"; } : function (r) { return r.venue; };
    var groups = []; recs.forEach(function (r) { var g = groupKey(r); if (groups.indexOf(g) === -1) groups.push(g); });
    var byCount = {}; recs.forEach(function (r) { byCount[groupKey(r)] = (byCount[groupKey(r)] || 0) + 1; });
    groups = orderCats(spec.by, groups, byCount);
    var prices = recs.map(function (r) { return r.hammer_usd; }), mn = Math.min.apply(null, prices), mx = Math.max.apply(null, prices);
    var log = spec.scale === "log";
    var pos = function (v) { return log ? (Math.log(v) - Math.log(mn)) / (Math.log(mx) - Math.log(mn) || 1) : (v - mn) / (mx - mn || 1); };
    var H = 460;
    if (narrow) { // vertical: price on Y, groups on X
      var L = 60, R = 12, T = 16, B = 90, plotH = H - T - B, plotW = w - L - R, gw = plotW / groups.length;
      axisPrice(svg, L, T, plotH, mn, mx, log, true);
      groups.forEach(function (g, gi) {
        svg.appendChild(E("text", { x: L + gi * gw + gw / 2, y: T + plotH + 14, "text-anchor": "end", "font-size": 9, fill: AX, transform: "rotate(-35 " + (L + gi * gw + gw / 2) + " " + (T + plotH + 14) + ")" }, g.length > 12 ? g.slice(0, 11) + "…" : g));
      });
      recs.forEach(function (r) { var gi = groups.indexOf(groupKey(r)); var cx = L + gi * gw + gw / 2 + (Math.random() - 0.5) * gw * 0.6; var cy = T + plotH - pos(r.hammer_usd) * plotH; var d = E("circle", { cx: cx, cy: cy, r: 3, fill: colorFor(r.venue, 0), opacity: 0.5, class: "cmark clk" }); bindReceipt(d, r); svg.appendChild(d); });
    } else { // horizontal: price on X, one row per group
      var L2 = 130, R2 = 20, T2 = 16, B2 = 44, plotH2 = H - T2 - B2, plotW2 = w - L2 - R2, rh = plotH2 / groups.length;
      axisPrice(svg, L2, T2, plotW2, mn, mx, log, false, H - B2);
      groups.forEach(function (g, gi) {
        var y0 = T2 + gi * rh + rh / 2;
        svg.appendChild(E("text", { x: L2 - 8, y: y0 + 3, "text-anchor": "end", "font-size": 10, fill: INK }, g.length > 18 ? g.slice(0, 17) + "…" : g));
        svg.appendChild(E("line", { x1: L2, y1: y0, x2: w - R2, y2: y0, stroke: GRID, "stroke-width": 1, opacity: 0.5 }));
      });
      recs.forEach(function (r) { var gi = groups.indexOf(groupKey(r)); var cx = L2 + pos(r.hammer_usd) * plotW2; var cy = T2 + gi * rh + rh / 2 + (Math.random() - 0.5) * rh * 0.6; var d = E("circle", { cx: cx, cy: cy, r: 3.2, fill: colorFor(r.venue, 0), opacity: 0.5, class: "cmark clk" }); bindReceipt(d, r); svg.appendChild(d); });
    }
    caption(svg, w, H, "Price " + (log ? "(log scale, " : "(") + basisShort(spec.basis) + ")");
    var samp = res.strip_sampled;
    var sampNote = samp ? (samp.shown + " of " + samp.of + " shown (the rest are in the receipts). ") : "";
    document.getElementById("cnote").textContent = sampNote + "Every dot is one real sale; click to open its receipt.";
  }

  function drawStacked(svg, res, spec, w) {
    var rows = res.answer.rows || [];
    var periods = [], segs = [], byPS = {}, totByP = {};
    rows.forEach(function (r) {
      var parts = String(r.group).split(" · ");
      var ti = parts.findIndex(function (p) { return /\d{4}/.test(p); });
      var per = parts[ti], seg = parts[1 - ti];
      if (periods.indexOf(per) === -1) periods.push(per);
      if (segs.indexOf(seg) === -1) segs.push(seg);
      byPS[seg + "|" + per] = r.count; totByP[per] = (totByP[per] || 0) + r.count;
    });
    periods.sort();
    var L = 40, R = 20, T = 20, B = 60, H = 460, plotH = H - T - B, plotW = w - L - R, bw = Math.min(70, plotW / periods.length * 0.6);
    // Y is share 0-100%
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var y = T + plotH - f * plotH; svg.appendChild(E("line", { x1: L, y1: y, x2: w - R, y2: y, stroke: GRID })); svg.appendChild(E("text", { x: L - 6, y: y + 3, "text-anchor": "end", "font-size": 10, fill: AX }, (f * 100) + "%")); });
    var xw = plotW / periods.length;
    periods.forEach(function (per, pi) {
      var x = L + pi * xw + (xw - bw) / 2, tot = totByP[per] || 0, thin = tot < spec.thin, acc = 0;
      if (thin) { svg.appendChild(E("text", { x: x + bw / 2, y: T + plotH - 6, "text-anchor": "middle", "font-size": 10, fill: "#a4571f" }, tot + " (thin)")); }
      else segs.forEach(function (seg, si) {
        var c = byPS[seg + "|" + per] || 0; if (!c) return; var frac = c / tot, bh = frac * plotH, y = T + plotH - acc - bh; acc += bh;
        var rect = E("rect", { x: x, y: y, width: bw, height: bh, fill: colorFor(seg, si), class: "cmark" });
        rect.addEventListener("mousemove", function (e) { showTip(e.pageX, e.pageY, "<b>" + esc(seg) + " · " + esc(per) + "</b><br>" + c + " of " + tot + " (" + Math.round(frac * 100) + "%)"); });
        rect.addEventListener("mouseleave", hideTip); svg.appendChild(rect);
      });
      svg.appendChild(E("text", { x: x + bw / 2, y: T + plotH + 16, "text-anchor": "middle", "font-size": 10, fill: AX }, per));
    });
    caption(svg, w, H, "Share of sales by count");
    legend(svg, w, segs);
    document.getElementById("cnote").textContent = "Segments sum to the real total per period; periods under " + spec.thin + " sales show counts and are marked thin.";
  }

  // ---- chart helpers ----
  function rowById(rows, g) { for (var i = 0; i < rows.length; i++) if (rows[i].group === g) return rows[i]; return null; }
  function periodOf(dim, date) { var d = new Date(date); if (dim === "year") return String(d.getUTCFullYear()); if (dim === "quarter") return d.getUTCFullYear() + " Q" + (Math.floor(d.getUTCMonth() / 3) + 1); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bindReceipt(el, r) {
    el.addEventListener("mousemove", function (e) { showTip(e.pageX, e.pageY, "<b>" + esc(r.venue) + "</b> " + fmtDate(r.date) + "<br>" + money(r.hammer_usd) + (r.mileage ? "<br>" + Math.round(r.mileage).toLocaleString() + " mi" : "") + (r.chassis ? "<br>" + esc(r.chassis) : "") + "<br><span style='opacity:.7'>" + esc((r.title || "").slice(0, 44)) + "</span>"); });
    el.addEventListener("mouseleave", hideTip);
    el.style.cursor = "pointer";
    el.addEventListener("click", function () { if (r.link) window.open(r.link, "_blank", "noopener"); else { var t = document.getElementById("receipts"); if (t) t.scrollIntoView({ behavior: "smooth" }); } });
  }
  function axisY(svg, L, T, plotH, maxY, fmt) {
    for (var f = 0; f <= 1.0001; f += 0.25) { var y = T + plotH - f * plotH; svg.appendChild(E("line", { x1: L, y1: y, x2: L + 3000, y2: y, stroke: GRID, opacity: 0.6 })); svg.appendChild(E("text", { x: L - 6, y: y + 3, "text-anchor": "end", "font-size": 10, fill: AX }, fmt(Math.round(maxY * f)))); }
  }
  function axisPrice(svg, L, T, span, mn, mx, log, vertical, baseY) {
    var ticks = log ? logTicks(mn, mx) : linTicks(mn, mx);
    ticks.forEach(function (v) {
      var f = log ? (Math.log(v) - Math.log(mn)) / (Math.log(mx) - Math.log(mn) || 1) : (v - mn) / (mx - mn || 1);
      if (vertical) { var y = T + span - f * span; svg.appendChild(E("line", { x1: L, y1: y, x2: L + 3000, y2: y, stroke: GRID, opacity: 0.5 })); svg.appendChild(E("text", { x: L - 6, y: y + 3, "text-anchor": "end", "font-size": 9, fill: AX }, money(v))); }
      else { var x = L + f * span; svg.appendChild(E("line", { x1: x, y1: T, x2: x, y2: baseY, stroke: GRID, opacity: 0.5 })); svg.appendChild(E("text", { x: x, y: baseY + 14, "text-anchor": "middle", "font-size": 9, fill: AX }, money(v))); }
    });
  }
  function logTicks(mn, mx) { var t = [], p = Math.floor(Math.log10(mn)); for (; Math.pow(10, p) <= mx * 1.0001; p++) { var v = Math.pow(10, p); if (v >= mn * 0.5) t.push(v); } return t.length ? t : [mn, mx]; }
  function linTicks(mn, mx) { var t = [], step = (mx - mn) / 4; for (var i = 0; i <= 4; i++) t.push(mn + step * i); return t; }
  function caption(svg, w, H, txt) { svg.appendChild(E("text", { x: 8, y: 12, "font-size": 10, fill: "#928b7a" }, txt)); }
  function basisShort(b) { return /bid-to/.test(b || "") ? "bid-to USD" : "hammer USD, premiums backed out"; }
  function legend(svg, w, keys) {
    var x = 60, y = 452;
    keys.slice(0, 8).forEach(function (k, i) { svg.appendChild(E("rect", { x: x, y: y - 9, width: 10, height: 10, fill: colorFor(k, i), rx: 2 })); var t = E("text", { x: x + 14, y: y, "font-size": 10, fill: INK }, k.length > 14 ? k.slice(0, 13) + "…" : k); svg.appendChild(t); x += 16 + Math.min(110, (k.length * 6 + 24)); });
  }
  function chartToPNG(svg) {
    var xml = new XMLSerializer().serializeToString(svg);
    var vb = svg.getAttribute("viewBox").split(" "), W = Number(vb[2]) * 2, Hh = Number(vb[3]) * 2;
    var img = new Image();
    img.onload = function () { var cv = document.createElement("canvas"); cv.width = W; cv.height = Hh; var cx = cv.getContext("2d"); cx.fillStyle = "#fffdf9"; cx.fillRect(0, 0, W, Hh); cx.drawImage(img, 0, 0, W, Hh); cv.toBlob(function (bl) { var u = URL.createObjectURL(bl); var a = document.createElement("a"); a.href = u; a.download = "sam-desk-chart-" + new Date().toISOString().slice(0, 10) + ".png"; document.body.appendChild(a); a.click(); setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 500); }); };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
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
      // (i) Route the refine through the robust fetch so a changed channel/window actually reruns and
      // a slow rerun shows a real error + retry, never the old identical-answer/raw-text failure.
      postRun({ dsl: dsl });
    }
    var ws = document.getElementById("chip_window"); if (ws) ws.onchange = function () { rerunWith({ window: this.value }); };
    var cs = document.getElementById("chip_channel"); if (cs) cs.onchange = function () { rerunWith({ channel: this.value }); };
    var ss = document.getElementById("chip_sale_type"); if (ss) ss.onchange = function () { rerunWith({ sale_type: this.value }); };
  }

  function postRun(payload) { deskFetch(payload); }

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
