/* Sam Desk, Valuations mode (Nov 2026; docs/desk-valuations-spec.md). The rail (today's queue, my sheets, company), the open sheets, and the sheet's seven sections.
   THE PAGE COMPUTES NOTHING. Every figure, count, date, line, status, time in the queue, guard and refusal is printed from what the Desk API sent: the sheetRead object (sections 1 to 4, the
   engine's), the evaluation (the decision rules, server side) and the sheet itself. A tier click, a mileage entry, a checklist mark, a decision field and Finalise are asks: the answer comes back and is printed. */
(function () {
  "use strict";
  var API = (location.hostname === "localhost" || location.protocol === "file:") ? "https://goasksam.com" : "";
  var $ = function (id) { return document.getElementById(id); };
  var vals = $("vals"), rail = $("rail-vals"), form = $("vnew");
  if (!vals || !rail) return;
  var S = { mode: "vals", seat: "", org: "", lists: { queue: [], mine: [], company: [] }, seatName: "", viewAs: null, vaSeats: null, cq: "", tabs: [], active: null, sheets: {} };
  var timers = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function usd(n) { return n == null ? "n/a" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); }   // formatting only
  function nf(n) { return n == null ? "n/a" : Number(n).toLocaleString("en-US"); }
  function ns(n) { return nf(n) + (Number(n) === 1 ? " sale" : " sales"); }   // a count and its noun
  function day(d) { return d ? String(d).slice(0, 10) : ""; }
  function api(action, body) {
    return fetch(API + "/api/desk", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false, why: "The Desk could not be reached." }; });
  }

  // ---------- mode ----------
  function setMode(m) {
    S.mode = m; document.body.setAttribute("data-mode", m);
    $("modeVals").setAttribute("aria-selected", String(m === "vals")); $("modeAnalyst").setAttribute("aria-selected", String(m === "analyst"));
    vals.hidden = m !== "vals"; rail.hidden = m !== "vals"; form.hidden = m !== "vals";
    try { sessionStorage.setItem("desk_mode", m); } catch (e) { }
    if (m === "vals") { loadLists(); renderAll(); }
  }
  $("modeVals").onclick = function () { setMode("vals"); };
  $("modeAnalyst").onclick = function () { setMode("analyst"); };

  // ---------- the rail ----------
  function loadLists() {
    api("sheet_queue", { view: "queue" }).then(function (r) { if (r.ok) { S.lists.queue = r.rows; S.seat = r.seat; S.seatName = r.seatName || ""; S.viewAs = r.viewAs || null; S.org = r.org; renderRail(); } });
    api("sheet_queue", { view: "mine" }).then(function (r) { if (r.ok) { S.lists.mine = r.rows; renderRail(); } });
    api("sheet_queue", { view: "company", q: S.cq }).then(function (r) { if (r.ok) { S.lists.company = r.rows; renderRail(); } });
  }
  function stClass(s) { return s === "Finalised" ? "fin" : s === "Sent" ? "sent" : s === "Needs the car" ? "need" : ""; }
  function rowHtml(r) {
    return '<button type="button" class="qrow' + (S.active === r.id ? " on" : "") + '" data-open="' + esc(r.id) + '" data-role="' + esc(r.access) + '"><span class="qcar">' + esc(r.car) + '</span>' +
      '<span class="qmeta"><span class="st ' + stClass(r.status) + '">' + esc(r.status) + "</span><span>" + esc(r.owner) + "</span><span>" + esc(r.timeIn) + "</span></span></button>";
  }
  function listHtml(rows) { return rows.length ? rows.map(rowHtml).join("") : '<div class="none">Nothing here.</div>'; }
  function renderRail() {
    var focus = document.activeElement && document.activeElement.id === "csearch";
    rail.innerHTML = '<div class="sec">Today&rsquo;s queue</div><div id="l-queue">' + listHtml(S.lists.queue) + "</div>" +
      '<div class="sec">My sheets</div><div id="l-mine">' + listHtml(S.lists.mine) + "</div>" +
      '<div class="sec">Company</div><input class="csearch" id="csearch" type="text" autocomplete="off" placeholder="VIN, car, expert, date, status" value="' + esc(S.cq) + '"><div id="l-company">' + listHtml(S.lists.company) + "</div>";
    // The footer says who is looking. A crew person viewing as a seat is told so, with the way back; the crew (not a seat, not viewing) gets the "View as" switch. The server decides all of it; this only prints it.
    var who = esc(S.seatName || S.seat || "analyst"), line = "<b>" + esc(S.org || "Sam") + "</b> &middot; seat: " + who;
    if (S.viewAs) line += ' &middot; viewing as, crew <button type="button" class="vbtn" id="vaBack">Back to crew view</button>';
    else if (!window.__DESK_SEAT__ && S.vaSeats && S.vaSeats.length) line += '<br><select id="vaPick" aria-label="View as a seat"><option value="">View as&hellip;</option>' + S.vaSeats.map(function (x) { return '<option value="' + x.seatId + '">' + esc(x.org + " &middot; " + x.label) + "</option>"; }).join("") + "</select>";
    $("seatline").innerHTML = line;
    if (focus) { var c = $("csearch"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }
  var seatlineEl = $("seatline");
  if (seatlineEl) {
    seatlineEl.addEventListener("click", function (e) { if (e.target.id === "vaBack") api("viewas_clear").then(function () { location.reload(); }); });
    seatlineEl.addEventListener("change", function (e) { if (e.target.id === "vaPick" && e.target.value) api("viewas_set", { seatId: Number(e.target.value) }).then(function (r) { if (r.ok) location.reload(); else flash(r.error || "Could not switch."); }); });
  }
  if (!window.__DESK_SEAT__ && !window.__DESK_VIEWAS__) api("viewas_list").then(function (r) { if (r && r.ok && r.seats) { S.vaSeats = r.seats; renderRail(); } });
  rail.addEventListener("click", function (e) { var b = e.target.closest("[data-open]"); if (b) openSheet(b.getAttribute("data-open")); });
  rail.addEventListener("input", function (e) {
    if (e.target.id !== "csearch") return; S.cq = e.target.value; clearTimeout(timers.cq);
    timers.cq = setTimeout(function () { api("sheet_queue", { view: "company", q: S.cq }).then(function (r) { if (r.ok) { S.lists.company = r.rows; renderRail(); } }); }, 250);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault(); var q = $("vnewq"), t = q.value.trim(); if (!t) return;
    api("sheet_new", { text: t }).then(function (r) { if (!r.ok) { flash(r.why || "Could not open that."); return; } q.value = ""; loadLists(); openSheet(r.id); });
  });
  function flash(msg) { vals.insertAdjacentHTML("afterbegin", '<div class="banner" id="flash">' + esc(msg) + "</div>"); setTimeout(function () { var f = $("flash"); if (f) f.remove(); }, 4000); }

  // ---------- open sheets: each keeps its own state while another is in front ----------
  function openSheet(id, pickUp) {
    if (S.sheets[id] && !pickUp) { S.active = id; renderAll(); return; }
    api("sheet_open", { id: id, pickUp: pickUp === true }).then(function (r) {
      if (!r.ok) { flash(r.why || "Could not open that sheet."); return; }
      var st = r.sheet.state;
      S.sheets[id] = { v: r, draft: { decision: JSON.parse(JSON.stringify(st.decision)), checklist: JSON.parse(JSON.stringify(st.checklist || {})), corr: JSON.parse(JSON.stringify(st.corrections || {})), mileage: st.askedMileage || "", pinned: st.pinned || "" }, msg: "", sendMsg: "", send: { to: (r.sheet.submission.consignor && r.sheet.submission.consignor.email) || "", message: r.org.standardMessage || "" } };
      if (S.tabs.indexOf(id) < 0) S.tabs.push(id);
      S.active = id; renderAll(); loadLists();
    });
  }
  function closeTab(id) { S.tabs = S.tabs.filter(function (t) { return t !== id; }); delete S.sheets[id]; if (S.active === id) S.active = S.tabs[S.tabs.length - 1] || null; renderAll(); }

  // ---------- asks ----------
  // Saves: patches made inside the 400 ms window are MERGED (a later patch of another kind never drops an earlier one), and a sheet's saves run ONE AT A TIME in the order made
  // (a slow earlier save can never land after a later one). flush(id) sends what is pending and resolves when the sheet's last save is done: Finalise waits on it, so the
  // sheet is sealed from exactly what the screen shows.
  var pend = {}, chains = {};
  function flush(id) {
    clearTimeout(timers[id + "s"]); var patch = pend[id]; delete pend[id];
    if (!patch) return chains[id] || Promise.resolve();
    var p = (chains[id] || Promise.resolve()).then(function () {
      return api("sheet_save", { id: id, patch: patch }).then(function (r) {
        var h = S.sheets[id]; if (!h) return;
        if (!r.ok) { h.msg = r.why || "That was not saved."; renderAll(); return; }
        h.v = r; h.msg = ""; renderAll(); loadLists();
      });
    });
    chains[id] = p.catch(function () { }); return chains[id];
  }
  function save(id, patch, now) {
    pend[id] = Object.assign(pend[id] || {}, patch);
    clearTimeout(timers[id + "s"]); if (now) flush(id); else timers[id + "s"] = setTimeout(function () { flush(id); }, 400);
  }
  function settled() { return Promise.all(Object.keys(pend).map(flush)).then(function () { return Promise.all(Object.keys(chains).map(function (k) { return chains[k]; })); }); }
  function draftPatch(h) { return { decision: h.draft.decision }; }

  // ---------- the sheet ----------
  function renderAll() {
    var focusK = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-k"), ss = null, se = null;
    var top = vals.scrollTop;
    if (focusK) { try { ss = document.activeElement.selectionStart; se = document.activeElement.selectionEnd; } catch (e) { } }
    var tabs = S.tabs.map(function (id) { var h = S.sheets[id]; return '<button type="button" class="vtab' + (id === S.active ? " on" : "") + '" data-tab="' + esc(id) + '">' + esc(h.v.sheet.car_label || "Needs the car") + '<span class="x" data-close="' + esc(id) + '" aria-label="Close">&times;</span></button>'; }).join("");
    var body = S.active && S.sheets[S.active] ? sheetHtml(S.active) : '<div class="vempty">Open a sheet from the queue, or type a VIN or a year, make and model at the top. Several sheets can stay open; each keeps where you were.</div>';
    vals.innerHTML = (S.tabs.length ? '<div class="vtabs">' + tabs + "</div>" : "") + body;
    vals.scrollTop = top;
    if (focusK) { var el = vals.querySelector('[data-k="' + focusK + '"]'); if (el) { el.focus(); try { el.setSelectionRange(ss, se); } catch (e) { } } }
  }
  function sec(n, title, sub, inner) { return '<section class="sec7" data-sec="' + n + '"><div class="no">' + n + '</div><div class="card"><h2>' + esc(title) + "</h2>" + (sub ? '<p class="sub">' + sub + "</p>" : "") + inner + "</div></section>"; }
  function kv(rows) { return '<div class="kv">' + rows.map(function (r) { return '<div class="k">' + esc(r[0]) + "</div><div>" + r[1] + "</div>"; }).join("") + "</div>"; }

  function sheetHtml(id) {
    var h = S.sheets[id], v = h.v, s = v.sheet, a = v.access, rd = v.read, ev = v.evaluation, ed = a.canEdit, dis = ed ? "" : " disabled";
    var head = '<div class="shead"><h1>' + esc(s.car_label || "Needs the car") + '</h1><div class="vin">' + esc(s.vin || "No VIN found") + "</div>" +
      '<div class="chips"><span class="chip ' + (s.status === "Finalised" || s.status === "Sent" ? "ok" : "") + '">' + esc(s.status) + '</span><span class="chip">' + esc(s.owner_seat) + "</span>" + (s.final ? '<span class="chip ok">' + esc(s.final.reportNumber) + "</span>" : "") + (s.corrects ? '<span class="chip">Corrects ' + esc(s.correctsReport || "") + "</span>" : "") + "</div></div>";
    var banner = "";
    if (a.canPickUp) banner = '<div class="banner">' + esc(a.why) + ' <button type="button" class="vbtn" data-pickup="' + esc(id) + '">Pick up this sheet</button></div>';
    else if (a.role === "read_only") banner = '<div class="banner">' + esc(a.why) + "</div>";
    else if (a.role === "owner" && !ed) banner = '<div class="banner">' + esc(a.why) + "</div>";
    if (h.msg) banner += '<div class="banner">' + esc(h.msg) + "</div>";
    if (!rd) return '<div class="sheet" data-sheet="' + esc(id) + '">' + head + banner + '<div class="banner">' + esc(s.vin ? "The read is not available for this car yet." : "No car was found in this submission. Type the VIN or the year, make and model at the top.") + "</div></div>";
    if (rd.fixture) banner += '<div class="banner fx">Stand-in read: these figures are fixtures until the engine&rsquo;s sheet read is switched on.</div>';
    var out = head + banner + s1(h, rd, ed, dis) + s2(rd) + s3(rd) + s4(h, rd, s, ed, dis) + s5(h, ed, dis) + s6(h, rd, ev, ed, dis) + s7(h, id, v, s, ev, a);
    out += thisCar(v);
    out += '<div class="covfix">' + esc(rd.coverage.footer) + " " + esc(rd.coverage.methodology) + "</div>";
    return '<div class="sheet" data-sheet="' + esc(id) + '">' + out + "</div>";
  }

  // 1 the car
  function s1(h, rd, ed, dis) {
    var c = rd.car, d = c.decode, m = c.mileage, pr = c.prior, rows = [
      ["Vehicle", esc(d.year + " " + d.make + " " + d.model + (d.trim ? " " + d.trim : "") + (d.body ? ", " + d.body : ""))], ["VIN", '<span class="num">' + esc(c.vin) + "</span>"], ["Identified from", d.source === "vin" ? "VIN decode" : "Typed description"],
      ["Mileage", m.value ? '<span class="num">' + nf(m.value) + "</span> miles (" + (m.source === "asked" ? "entered" : "from the submission") + ")" : esc(m.ask || "")],
      ["Correct mileage", '<input class="vin mono" data-k="mileage" inputmode="numeric" placeholder="' + esc(m.value ? nf(m.value) : "miles") + '" value="' + esc(h.draft.mileage) + '"' + dis + ">"],
      ["Gearbox", '<input class="vin" data-k="corr-gearbox" placeholder="' + esc(c.gearbox || "") + '" value="' + esc(h.draft.corr.gearbox || "") + '"' + dis + ">"], ["Colour", '<input class="vin" data-k="corr-colour" placeholder="' + esc(c.colour || "") + '" value="' + esc(h.draft.corr.colour || "") + '"' + dis + ">"]];
    if (pr) rows.push(["Last listing", esc([pr.colour, pr.gearbox, pr.mileage ? nf(pr.mileage) + " miles at the last sale" : "", day(pr.lastSaleDate)].filter(Boolean).join(", "))]);
    var conf = h.v.sheet.state.confirmed;
    return sec(1, "The car", "From the VIN decode or the typed words. Confirm it, or correct it.", kv(rows) + '<p style="margin:12px 0 0">' + (conf ? '<span class="chip ok">Confirmed</span>' : '<button type="button" class="vbtn" data-confirm="1"' + dis + ">Confirm the car</button>") + "</p>");
  }
  // 2 this exact car
  function s2(rd) {
    var x = rd.exact;
    if (!x.appearances.length) return sec(2, "This exact car", "", '<p style="margin:0;font:400 15px/1.5 var(--serif)">' + esc(x.none) + "</p>");
    return sec(2, "This exact car", "Every auction appearance of this VIN.", '<table class="vt"><tr><th>Date</th><th>Venue</th><th>Result</th><th>Link</th></tr>' + x.appearances.map(function (a) {
      return '<tr><td class="m">' + esc(day(a.date)) + "</td><td>" + esc(a.venue) + '</td><td class="m">' + (a.outcome === "sold" ? "Sold " + usd(a.price) : "High bid " + usd(a.highBid) + ", not met") + "</td><td>" + (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">Open</a>' : "") + "</td></tr>";
    }).join("") + "</table>");
  }
  // 3 the market
  function s3(rd) {
    var m = rd.market, f = function (l, v, cls) { return '<div class="fig ' + (cls || "") + '"><div class="l">' + l + '</div><div class="v num">' + v + "</div></div>"; };
    var inner = '<div class="figs">' + f("Median", usd(m.median)) + f("Typical range", usd(m.p25) + " to " + usd(m.p75)) + f("Sales", nf(m.count)) + f("Newest sale", esc(day(m.newest))) + (m.startingFigure ? f("Starting figure", usd(m.startingFigure), "start") : "") + "</div>" +
      '<p class="sub" style="margin-top:-2px">' + esc(m.window.stated) + (m.window.fallback ? " (the wider window)" : "") + ". " + esc(m.startingNote || "") + "</p>";
    if (m.wider) inner += '<p class="sub">Wider range: <span class="num">' + usd(m.wider.low) + " to " + usd(m.wider.high) + "</span> (" + nf(m.wider.count) + " sales).</p>";
    (m.splits || []).forEach(function (sp) { inner += '<div class="slabel" style="font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:14px 0 4px">By ' + esc(sp.dimension) + '</div><table class="vt"><tr><th>Band</th><th>Sales</th><th>Median</th><th>Range</th></tr>' + sp.options.map(function (o) { return "<tr><td>" + esc(o.label) + '</td><td class="m">' + nf(o.count) + '</td><td class="m">' + usd(o.median) + '</td><td class="m">' + usd(o.p25) + " to " + usd(o.p75) + "</td></tr>"; }).join("") + "</table>"; });
    if ((m.live || []).length) inner += '<div class="slabel" style="font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:14px 0 4px">Live now</div><table class="vt"><tr><th>Venue</th><th>Bid</th><th>Ends</th><th>Link</th></tr>' + m.live.map(function (l) { return "<tr><td>" + esc(l.venue) + '</td><td class="m">' + usd(l.bid) + '</td><td class="m">' + esc(String(l.endsAt || "").slice(0, 16).replace("T", " ")) + "</td><td>" + (l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">Open</a>' : "") + "</td></tr>"; }).join("") + "</table>";
    inner += '<div class="slabel" style="font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:14px 0 4px">Comparables, newest first</div><table class="vt"><tr><th>Date</th><th>Venue</th><th>Price</th><th>Miles</th><th>Tier</th><th>Link</th></tr>' + (m.comparables || []).map(function (c) { return '<tr><td class="m">' + esc(day(c.date)) + "</td><td>" + esc(c.venue) + '</td><td class="m">' + usd(c.price) + '</td><td class="m">' + nf(c.mileage) + '</td><td class="m">' + esc(c.tier == null ? "" : c.tier) + "</td><td>" + (c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">Open</a>' : "") + "</td></tr>"; }).join("") + "</table>";
    return sec(3, "The market", "Median and quartiles of the sales, from the engine.", inner);
  }
  // 4 condition, with the submission's photos and documents
  function s4(h, rd, s, ed, dis) {
    var cd = rd.condition, sub = s.submission, st = s.state, sel = st.photosSelected || [];
    var inner = '<div class="tiers">' + cd.tiers.map(function (t) { return '<button type="button" class="tier' + (cd.selected === t.tier ? " on" : "") + '" data-tier="' + t.tier + '"' + dis + '><span class="n">TIER ' + t.tier + '</span>' + esc(t.label) + '<span class="c">' + ns(t.count) + "</span></button>"; }).join("") + "</div>";
    if (cd.selected) inner += '<p class="sub" style="margin:0 0 6px"><span class="num">' + ns(cd.sameTierCount) + "</span> in this condition. " + esc(cd.tooFewLine || "The comparables above are the same tier.") + "</p>";
    inner += '<p class="sub" style="margin:0">Untiered: <span class="num">' + ns(cd.untiered) + "</span> stay in the wider pool.</p>";
    var ph = sub.photos || [];
    if (ph.length) inner += '<div class="slabel" style="font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:16px 0 4px">Photos from the submission: tick the ones for the report, set the hero</div><div class="photos">' + ph.map(function (p) {
      var on = sel.indexOf(p.id) >= 0; return '<div class="ph' + (on ? " on" : "") + '"><img src="' + esc(p.url) + '" alt="' + esc(p.name || "") + '" loading="lazy"><div class="pb"><label><input type="checkbox" data-photo="' + esc(p.id) + '"' + (on ? " checked" : "") + dis + "> Report</label><button type=\"button\" class=\"hero" + (st.heroId === p.id ? " on" : "") + '" data-hero="' + esc(p.id) + '"' + dis + ">Hero</button></div></div>";
    }).join("") + "</div>";
    var dc = sub.documents || [];
    if (dc.length) inner += '<div class="slabel" style="font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:16px 0 4px">Documents supplied</div><div class="docs">' + dc.map(function (d) { return '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.name) + "</a>"; }).join("") + "</div>";
    return sec(4, "Condition", "Click the tier the photos show. The comparables above follow it.", inner);
  }
  // 5 what we cannot see
  function s5(h, ed, dis) {
    var CL = h.v.checklist, ST = h.v.checkStates;
    return sec(5, "What we cannot see", "Mark each. A free line is optional. No numbers here.", CL.map(function (it) {
      var cur = h.draft.checklist[it.key] || {};
      var seg = '<span class="seg">' + ST.map(function (x) { return '<button type="button" data-chk="' + it.key + '" data-state="' + esc(x) + '" class="' + (cur.state === x ? "on" : "") + '"' + dis + ">" + esc(x) + "</button>"; }).join("") + "</span>";
      var choice = it.choices ? ' <select class="vin" data-k="chkc-' + it.key + '" style="width:auto"' + dis + '><option value="">&mdash;</option>' + it.choices.map(function (c) { return "<option" + (cur.choice === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>" : "";
      return '<div class="chk"><div class="nm">' + esc(it.label) + "</div><div>" + seg + choice + '</div><input class="vin" data-k="chkl-' + it.key + '" placeholder="A line, if you want one" value="' + esc(cur.line || "") + '"' + dis + "></div>";
    }).join(""));
  }
  // 6 decision
  function s6(h, rd, ev, ed, dis) {
    var d = h.draft.decision, m = rd.market, cd = rd.condition, e = ev || { guards: [], missing: [], given: null };
    var beside = '<div class="beside"><span>Market range <b class="num">' + (cd.tooFew && m.wider ? usd(m.wider.low) + " to " + usd(m.wider.high) + " (wider pool)" : usd(m.p25) + " to " + usd(m.p75)) + '</b></span><span>Starting figure <b class="num">' + (m.startingFigure ? usd(m.startingFigure) : "none") + "</b></span></div>";
    var mode = '<span class="seg"><button type="button" data-dmode="reserve" class="' + (d.mode === "reserve" ? "on" : "") + '"' + dis + '>Reserve</button><button type="button" data-dmode="range" class="' + (d.mode === "range" ? "on" : "") + '"' + dis + ">Range</button></span>";
    var fields = d.mode === "reserve" ? '<div class="fields"><div class="f"><label>Reserve</label><input class="vin mono" data-k="d-reserve" inputmode="numeric" value="' + esc(d.reserve) + '"' + dis + "></div></div>"
      : d.mode === "range" ? '<div class="fields"><div class="f"><label>Low</label><input class="vin mono" data-k="d-low" inputmode="numeric" value="' + esc(d.low) + '"' + dis + '></div><div class="f"><label>High</label><input class="vin mono" data-k="d-high" inputmode="numeric" value="' + esc(d.high) + '"' + dis + "></div></div>" : "";
    var place = e.given ? '<p style="margin:0 0 6px"><span class="chip ' + (e.inRange ? "ok" : "warn") + '">' + (e.inRange ? "Inside the market range" : "Outside the market range") + "</span></p>" : "";
    var reasons = '<fieldset class="reasons' + (e.reasonsNeeded ? " need" : "") + '"><legend>Reasons' + (e.reasonsNeeded ? " (at least one)" : "") + "</legend>" + h.v.reasons.map(function (r) {
      return '<label><input type="checkbox" data-reason="' + r.key + '"' + (d.reasons.indexOf(r.key) >= 0 ? " checked" : "") + dis + "> " + esc(r.label) + "</label>";
    }).join("") + (d.reasons.indexOf("other") >= 0 ? '<input class="vin" data-k="d-other" placeholder="Other: what is it" value="' + esc(d.otherText) + '"' + dis + ">" : "") + "</fieldset>";
    var line = '<div class="fields"><div class="f" style="flex:1"><label>The line of reasoning' + (e.reasonsNeeded ? " (required)" : "") + '</label><textarea class="vin" data-k="d-line"' + dis + ">" + esc(d.line) + "</textarea></div></div>";
    var guards = (e.guards || []).map(function (g) { return '<div class="guard"><p>' + esc(g.text) + '</p><textarea class="vin" data-k="g-' + g.key + '" placeholder="Why"' + dis + ">" + esc((d.guardLines || {})[g.key] || "") + "</textarea></div>"; }).join("");
    var note = '<div class="fields"><div class="f" style="flex:1"><label>Note to the seller (its own page in the report and in the email; never changes a figure)</label><textarea class="vin" data-k="d-note"' + dis + ">" + esc(d.note) + "</textarea></div></div>";
    var pin = '<div class="fields"><div class="f" style="flex:1"><label>Pinned question (prints on the report)</label><input class="vin" data-k="pinned" value="' + esc(h.draft.pinned) + '"' + dis + "></div></div>";
    return sec(6, "Decision", "A reserve or a range. The engine never gives one: you do.", beside + mode + fields + place + reasons + line + guards + note + pin);
  }
  // 7 finalise
  function s7(h, id, v, s, ev, a) {
    var fin = s.final, inner = "";
    if (!fin) {
      var miss = ev && ev.missing.length ? '<ul class="missing">' + ev.missing.map(function (m) { return "<li>" + esc(m.text) + "</li>"; }).join("") + "</ul>" : "";
      inner = '<button type="button" class="vbtn pri" data-finalise="1"' + (a.canFinalise ? "" : " disabled") + ">Finalise</button>" + (h.fin ? '<p class="refuse">' + esc(h.fin) + "</p>" : "") + miss;
      return sec(7, "Finalise", "Locks the sheet, stamps it, builds the report.", inner);
    }
    inner = '<p class="done">Finalised on ' + esc(day(fin.finalisedAt)) + ". Report <b>" + esc(fin.reportNumber) + "</b>.</p>" +
      '<p><button type="button" class="vbtn" data-pdf="1">Download the PDF</button> <button type="button" class="vbtn" data-correct="1">Start a correction</button></p>';
    if (s.sent) inner += '<div class="sentbox"><b>Sent</b> to ' + esc(s.sent.to) + " on " + esc(day(s.sent.at)) + ".<br>" + esc(s.sent.copy.message) + (s.sent.copy.note ? "<br><i>Note to the seller:</i> " + esc(s.sent.copy.note) : "") + "</div>";
    else if (a.role === "owner") inner += '<div class="send"><div class="fields"><div class="f" style="flex:1"><label>To</label><input class="vin" data-k="send-to" value="' + esc(h.send.to) + '"></div></div><div class="fields"><div class="f" style="flex:1"><label>Message</label><textarea class="vin" data-k="send-msg">' + esc(h.send.message) + "</textarea></div></div>" +
      (fin.decision.note ? '<div class="banner fx"><i>Note to the seller, sent with it:</i> ' + esc(fin.decision.note) + "</div>" : "") + '<div class="attach">Attached: ' + esc(fin.reportNumber) + '.pdf</div><button type="button" class="vbtn pri" data-send="1">Send</button>' + (h.sendMsg ? '<p class="refuse">' + esc(h.sendMsg) + "</p>" : "") + "</div>";
    return sec(7, "Finalise", "The sheet is locked.", '<div class="fin">' + inner + "</div>");
  }
  function thisCar(v) {
    if (!v.thisCar || !v.thisCar.length) return "";
    return '<div class="thiscar card"><h2>This car</h2><p class="sub">Earlier sheets for this VIN.</p>' + v.thisCar.map(function (t) {
      return '<div class="tc"><span>' + esc(t.date) + "</span><span>" + esc(t.status) + "</span><span>" + esc(t.reportNumber || "") + "</span><span>" + (t.decision ? (t.decision.mode === "reserve" ? "Reserve " + usd(Number(t.decision.reserve)) : "Range " + usd(Number(t.decision.low)) + " to " + usd(Number(t.decision.high))) : "") + '</span><button type="button" class="vbtn" data-open="' + esc(t.id) + '">Open</button></div>';
    }).join("") + "</div>";
  }

  // ---------- events ----------
  vals.addEventListener("click", function (e) {
    var t = e.target, id = S.active, h = id && S.sheets[id];
    var x = t.closest("[data-close]"); if (x) { e.stopPropagation(); closeTab(x.getAttribute("data-close")); return; }
    var tab = t.closest("[data-tab]"); if (tab) { S.active = tab.getAttribute("data-tab"); renderAll(); renderRail(); return; }
    var op = t.closest("[data-open]"); if (op) { openSheet(op.getAttribute("data-open")); return; }
    if (!h) return;
    var pk = t.closest("[data-pickup]"); if (pk) { openSheet(pk.getAttribute("data-pickup"), true); return; }
    if (t.closest("[data-confirm]")) { save(id, { confirmed: true }, true); return; }
    var tr = t.closest("[data-tier]"); if (tr) { save(id, { tier: Number(tr.getAttribute("data-tier")) }, true); return; }
    var hero = t.closest("[data-hero]"); if (hero) { save(id, { heroId: hero.getAttribute("data-hero") }, true); return; }
    var ck = t.closest("[data-chk]"); if (ck) { var k = ck.getAttribute("data-chk"), cur = h.draft.checklist[k] || {}; cur.state = ck.getAttribute("data-state"); h.draft.checklist[k] = cur; save(id, { checklist: h.draft.checklist }, true); return; }
    var md = t.closest("[data-dmode]"); if (md) { h.draft.decision.mode = md.getAttribute("data-dmode"); save(id, draftPatch(h), true); return; }
    if (t.closest("[data-finalise]")) { h.fin = ""; flush(id).then(function () { return api("sheet_finalise", { id: id }); }).then(function (r) { if (r.ok) { h.v = r; h.fin = ""; } else h.fin = r.why || "The sheet was not finalised."; renderAll(); loadLists(); }); return; }
    if (t.closest("[data-pdf]")) { api("sheet_pdf", { id: id }).then(function (r) { if (!r.ok) { h.msg = r.why || "The PDF could not be made."; renderAll(); return; } var bin = atob(r.pdf_b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([u], { type: "application/pdf" })); a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); }); return; }
    if (t.closest("[data-correct]")) { api("sheet_correct", { id: id }).then(function (r) { if (r.ok) { loadLists(); openSheet(r.id); } else flash(r.why || "Could not start a correction."); }); return; }
    if (t.closest("[data-send]")) { h.sendMsg = ""; api("sheet_send", { id: id, to: h.send.to, message: h.send.message }).then(function (r) { if (r.ok) { h.v = r; h.sendMsg = ""; } else h.sendMsg = r.why || "The send did not go through."; renderAll(); loadLists(); }); return; }
  });
  vals.addEventListener("change", function (e) {
    var t = e.target, id = S.active, h = id && S.sheets[id]; if (!h) return;
    if (t.hasAttribute("data-photo")) { var cur = (h.v.sheet.state.photosSelected || []).slice(), pid = t.getAttribute("data-photo"), i = cur.indexOf(pid); if (t.checked && i < 0) cur.push(pid); if (!t.checked && i >= 0) cur.splice(i, 1); save(id, { photosSelected: cur }, true); return; }
    if (t.hasAttribute("data-reason")) { var r = h.draft.decision.reasons, k = t.getAttribute("data-reason"), j = r.indexOf(k); if (t.checked && j < 0) r.push(k); if (!t.checked && j >= 0) r.splice(j, 1); save(id, draftPatch(h), true); return; }
    var kk = t.getAttribute("data-k");
    if (kk === "mileage") { h.draft.mileage = t.value; save(id, { mileage: t.value }, true); return; }
    if (kk && kk.indexOf("chkc-") === 0) { var key = kk.slice(5), c = h.draft.checklist[key] || {}; c.choice = t.value || null; h.draft.checklist[key] = c; save(id, { checklist: h.draft.checklist }, true); }
  });
  vals.addEventListener("input", function (e) {
    var t = e.target, id = S.active, h = id && S.sheets[id], k = t.getAttribute && t.getAttribute("data-k"); if (!h || !k) return;
    var D = h.draft.decision;
    if (k === "d-reserve") D.reserve = t.value; else if (k === "d-low") D.low = t.value; else if (k === "d-high") D.high = t.value; else if (k === "d-line") D.line = t.value; else if (k === "d-note") D.note = t.value; else if (k === "d-other") D.otherText = t.value;
    else if (k === "g-prior" || k === "g-start") { D.guardLines = D.guardLines || {}; D.guardLines[k.slice(2)] = t.value; }
    else if (k === "pinned") { h.draft.pinned = t.value; save(id, { pinned: t.value }); return; }
    else if (k === "corr-gearbox" || k === "corr-colour") { h.draft.corr[k.slice(5)] = t.value; save(id, { corrections: h.draft.corr }); return; }
    else if (k.indexOf("chkl-") === 0) { var key = k.slice(5), c = h.draft.checklist[key] || {}; c.line = t.value; h.draft.checklist[key] = c; save(id, { checklist: h.draft.checklist }); return; }
    else if (k === "send-to") { h.send.to = t.value; return; } else if (k === "send-msg") { h.send.message = t.value; return; }
    else if (k === "mileage") { h.draft.mileage = t.value; return; }
    else return;
    save(id, draftPatch(h));
  });

  var m0 = "vals"; try { m0 = sessionStorage.getItem("desk_mode") || "vals"; } catch (e) { }
  // A seat (the server sets __DESK_SEAT__ only for a signed seat cookie) opens in Valuations and has no Analyst mode: the API refuses everything but the sheet actions
  if (window.__DESK_SEAT__ || window.__DESK_VIEWAS__) { m0 = "vals"; var ab = $("modeAnalyst"); if (ab) ab.hidden = true; }
  setMode(m0 === "analyst" ? "analyst" : "vals");
  window.__deskVals = { open: openSheet, state: S, settled: settled };
})();
