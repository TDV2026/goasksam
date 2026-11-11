// DESK V4 CLIENT (Lane S, Nov 10 2026), the browser half of lib/preview/deskV4.js, built to docs/desk-mockups/desk-v4.html.
// It is a real function whose source is embedded in the page (deskV4.js prints `(${deskV4Client})()`), so it is linted and read like any module.
// RULE: this code computes nothing. Every figure and sentence it draws is a field the server sent (Lane B's desk.* and Lane D's case view, through window.__V4__.kase and each case_edit answer).
// The ONE piece of arithmetic is the plot's own axis: turning a price into an x position on the dot plot and a pointer position back into a figure (scaleOf / figureAt). scripts/deskV4WireCheck.mjs holds this file to that.
// It never formats, adds, averages, ranks or compares a figure: money prints through the engine's own line or not at all (numberSentenceCheck sweeps this file).
export function deskV4Client() {
  var C = window.__DESK_V3__, D = window.__V4__ || {}, K = D.kase;
  if (!C || !C.active || !K) return;
  var $ = function (i) { return document.getElementById(i); };
  function el(tag, props) {
    var e = document.createElement(tag), kids = [].slice.call(arguments, 2);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k]; if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ""); else e.setAttribute(k, v);
    });
    kids.forEach(function (x) { if (x != null && x !== false) e.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    return e;
  }
  var NS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  // No figure is ever formatted here: a figure is printed through the engine's own line (typicalLine, extremesLine, medianLine, priceLine, figureLine) or not at all.
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  var desk = function () { return K.desk || {}; }, ev = function () { return desk().evidence || null; };

  // writes that wait a moment (a figure being dragged, a why being typed): Preview flushes them first, so the report is built from the case as it stands, never from the last saved moment
  var later = {};
  function defer(name, ms, fn) { clearTimeout(later[name] && later[name].t); later[name] = { fn: fn, t: setTimeout(function () { var l = later[name]; delete later[name]; l.fn(); }, ms) }; }
  function flush() { Object.keys(later).forEach(function (k) { var l = later[k]; clearTimeout(l.t); delete later[k]; l.fn(); }); return chain; }
  // ---------- the wire: every edit goes through one queue, so two quick edits never race each other ----------
  var chain = Promise.resolve(), saveT = null;
  function say(t) { var s = $("saved"); if (s) s.textContent = t; }
  function note(t) { var m = $("v4msg"); if (m) { m.textContent = t || ""; m.hidden = !t; } }
  function post(b) { return fetch(C.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); }
  function edit(op, x) {
    x = x || {}; x.action = "case_edit"; x.id = C.active; x.op = op; say("Saving");
    var run = chain.then(function () { return post(x); }).then(function (r) {
      if (r && r.ok) { if (r.id && r.id !== C.active) { C.active = r.id; try { history.replaceState(null, "", "/preview/desk/case/" + r.id); } catch (e) {} } K = r.case; D.kase = K; note(""); clearTimeout(saveT); saveT = setTimeout(function () { say("Saved"); }, 250); D.readiness = r.readiness || D.readiness; var ck = K.handling && K.handling.clock, ce = $("clock"); if (ck && ce) ce.textContent = ck; if (window.__v4after) window.__v4after(r, op); return r; }
      say("Not saved"); note((r && (r.why || r.line)) || "That did not save."); if (window.__v4fail) window.__v4fail(r, op); return r;
    }, function () { say("Not saved"); note("That did not save. The connection dropped."); return { ok: false }; });
    chain = run.catch(function () {}); return run;
  }
  window.__v4edit = edit;

  // ---------- case head ----------
  function head() {
    var h = $("s-head"); if (!h) return; clear(h);
    h.appendChild(el("div", null, el("h1", { id: "ch-title", text: D.title || "" }), desk().specLine ? el("p", { class: "spec", id: "ch-spec", text: desk().specLine }) : null));
    var s = K.seller || {}, m = el("div", { class: "meta" });
    if (s.name) m.appendChild(el("span", null, "Seller ", el("b", { text: s.name })));
    if (K.lead_ref) m.appendChild(el("span", null, "Lead ", el("b", { text: K.lead_ref })));
    var rl = K.vehicle && K.vehicle.submittedLine || D.receivedLine; if (rl) m.appendChild(el("span", { id: "recv", text: rl }));
    if (D.askLine) m.appendChild(el("span", null, "Asking ", el("b", { text: D.askLine })));
    if (D.forwarded) m.appendChild(el("span", { class: "tag", id: "fwdtag", text: "Forwarded lead" }));
    var sl = (D.stages && D.stages[K.stage]) || D.stageLabel; if (sl) m.appendChild(el("span", { class: "pill", id: "status", text: sl + (K.status === "finalized" ? " · v" + K.version : "") }));
    h.appendChild(m);
  }

  // ---------- car card ----------
  var FACTS = [["vin", "VIN"], ["mileage", "Mileage"], ["transmission", "Transmission"], ["body", "Body"], ["colour", "Colour"], ["generation", "Generation"], ["accident_history", "Accidents"], ["service_history", "Service"]];
  var SRC = D.srcLabels || {};
  // the marks the case carries: verified is the case's own flag, source is where the value came from. A seller supplied value that nobody verified shows as Unverified until the analyst verifies it (the case's verify op).
  function marksOf(k, f) {
    var g = el("span", { class: "marks" }); if (!f) return g;
    if (f.verified) { g.appendChild(el("span", { class: "chip ok", text: "Verified" })); return g; }
    var src = SRC[f.source]; if (src) g.appendChild(el("span", { class: "chip" + (f.source === "missing" || f.source === "conflicting" ? " warn" : ""), text: src }));
    if (f.source === "seller" && f.value != null && f.value !== "") {
      g.appendChild(el("span", { class: "chip unv", "data-unverified": k, text: "Unverified" }));
      g.appendChild(el("button", { type: "button", class: "link", "data-verify": k, text: "Verify", onclick: function () { edit("verify", { field: k }).then(function () { car(); needs(); footer(D.readiness); sendPaint(); }); } }));
    }
    return g;
  }
  function factValue(k, f) { if (k === "mileage" && K.vehicle && K.vehicle.mileageLine) return K.vehicle.mileageLine; return f && f.value != null ? String(f.value) : ""; }
  function photos() {
    var P = K.photos || { items: [] }, items = P.items || [], inr = {}; (P.reportIds || []).forEach(function (i) { inr[i] = true; });
    var cover = items.filter(function (p) { return p.id === P.coverId; })[0] || items[0] || null;
    var hero = $("hero"); if (hero) { hero.style.backgroundImage = cover && cover.url ? "url('" + cover.url + "')" : ""; hero.classList.toggle("nophoto", !cover); hero.textContent = cover ? "" : "No photos yet"; }
    var th = clear($("thumbs"));
    items.forEach(function (p) {
      th.appendChild(el("div", { class: "th" + (inr[p.id] ? " inr" : ""), role: "button", tabindex: "0", "aria-pressed": inr[p.id] ? "true" : "false", "aria-label": (p.name || "Photo") + (inr[p.id] ? ", in the report" : ", not in the report"), "data-photo": p.id, style: p.url ? "background-image:url('" + p.url + "')" : null, onclick: function () { togglePhoto(p.id); }, onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePhoto(p.id); } } }));
    });
    var add = el("label", { class: "th add", title: "Add photos", "for": "photofile" }, "+"); th.appendChild(add);
    var n = items.filter(function (p) { return inr[p.id]; }).length; $("pcount").textContent = n + " of " + items.length + " in the report";
  }
  function togglePhoto(id) {
    var ids = ((K.photos && K.photos.reportIds) || []).slice(), i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1); else ids.push(id);
    var t = document.querySelector('#thumbs [data-photo="' + id + '"]'); if (t) { t.classList.toggle("inr", i < 0); t.setAttribute("aria-pressed", i < 0 ? "true" : "false"); }
    edit("report_photos", { ids: ids }).then(function () { photos(); });
  }
  function readFile(f) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(f); }); }
  function car() {
    var c = $("s-car"); clear(c);
    var left = el("div", null, el("div", { class: "hero", id: "hero" }), el("div", { class: "thumbs", id: "thumbs" }),
      el("div", { class: "photobar" }, el("span", { id: "pcount" }), el("span", null,
        el("button", { class: "link", type: "button", id: "pall", text: "Select all", onclick: function () { edit("report_photos", { ids: "all" }).then(photos); } }), " · ",
        el("button", { class: "link", type: "button", id: "pnone", text: "Clear", onclick: function () { edit("report_photos", { ids: [] }).then(photos); } }), " · ",
        el("label", { class: "link", id: "padd", "for": "photofile", text: "Add photos" }),
        el("input", { type: "file", id: "photofile", accept: "image/jpeg,image/png", multiple: true, hidden: true, onchange: function (e) {
          var fs = [].slice.call(e.target.files), p = Promise.resolve(); fs.forEach(function (f) { p = p.then(function () { return readFile(f); }).then(function (b64) { return edit("photo_add", { name: f.name, data: b64 }); }); });
          p.then(function () { photos(); e.target.value = ""; }); } }))));
    var facts = el("div", { class: "facts", id: "facts" });
    FACTS.forEach(function (p) {
      var f = (K.fields || {})[p[0]], inp = el("input", { "data-field": p[0], value: factValue(p[0], f), title: factValue(p[0], f), "aria-label": p[1], onchange: function () {
        var typed = this.value.trim(); if (p[0] === "mileage") typed = typed.replace(/[^0-9]/g, "");
        edit("field", { field: p[0], value: typed }).then(function () { facts.parentNode && car(); }); } });
      facts.appendChild(el("span", { class: "k", text: p[1] })); facts.appendChild(el("span", { class: "v" }, inp));
      facts.appendChild(marksOf(p[0], f));
    });
    var notes = (K.seller && K.seller.notes) ? el("div", { class: "notes" }, el("b", { text: "Seller notes" }), K.seller.notes) : null;
    c.appendChild(el("div", { class: "car" }, left, el("div", null, facts, notes))); photos();
  }

  // ---------- documents ----------
  var KINDS = D.docKinds || [];
  function docs() {
    var d = $("s-docs"), grid = clear($("docs")), list = K.documents || [];
    var em = K.sourceEmail; if (em && em.url) grid.appendChild(el("a", { class: "doc mail", id: "origmail", href: em.url, target: "_blank", rel: "noopener" }, el("b", { text: (em.name || "") + " ↗" }), el("span", { text: em.line || "" })));
    (K.exports || []).forEach(function (x) { grid.appendChild(el("div", { class: "doc", "data-export": x.version }, el("b", { text: "Report sent" }), el("span", { text: x.line || "" }))); });
    list.forEach(function (x) { grid.appendChild(el(x.url ? "a" : "div", { class: "doc", "data-doc": x.id, href: x.url || null, target: x.url ? "_blank" : null, rel: x.url ? "noopener" : null }, el("b", { text: x.name || x.kindLabel || "Document" }), el("span", { text: x.line || x.kindLabel || "" }))); });
    var sel = el("select", { id: "dockind", "aria-label": "Kind of document" }); KINDS.forEach(function (k) { sel.appendChild(el("option", { value: k[0], text: k[1] })); });
    grid.appendChild(el("label", { class: "doc drop", id: "docdrop", "for": "docfile" }, "Add a document", el("span", { text: "Invoice, title, inspection" }),
      el("input", { type: "file", id: "docfile", accept: "application/pdf,image/jpeg,image/png", hidden: true, onchange: function (e) {
        var f = e.target.files[0]; if (!f) return; var kind = $("dockind").value;
        readFile(f).then(function (b64) { return edit("doc_add", { kind: kind, title: f.name.replace(/\.[^.]+$/, ""), name: f.name, data: b64 }); }).then(function () { docs(); e.target.value = ""; }); } })));
    var dc = $("dcount"); if (dc) dc.textContent = K.documentsLine || "";
    var kb = $("dockindbox"); if (kb && !kb.firstChild) kb.appendChild(sel);
  }

  // ---------- the plot (the only arithmetic on the page is scaleOf and figureAt) ----------
  var PADX = 14, W = 800, H = 170, BASE = 118;
  function domain() {
    var e = ev(), v = [];
    (desk().sales || []).forEach(function (s) { if (s.price != null) v.push(s.price); });
    if (e) [e.low, e.high, e.q1, e.q3, e.median].forEach(function (x) { if (x != null) v.push(x); });
    if (D.asking != null) v.push(D.asking);
    return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : null;
  }
  var DOM = null;
  function scaleOf(price) { return PADX + (price - DOM[0]) / ((DOM[1] - DOM[0]) || 1) * (W - 2 * PADX); }
  function figureAt(x) { var c = Math.max(PADX, Math.min(W - PADX, x)); return Math.round(DOM[0] + (c - PADX) / (W - 2 * PADX) * (DOM[1] - DOM[0])); }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var hotTier = function () { var c = K.condition || {}; var s = c.selected || c.suggested; return s && s.tier != null ? s.tier : null; };
  function plot() {
    var svg = $("plot"); if (!svg) return; clear(svg); W = svg.clientWidth || 800; DOM = domain(); var e = ev();
    if (!DOM || !e || e.insufficient) { svg.setAttribute("height", "0"); return; }
    svg.setAttribute("height", String(H)); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var evc = cssv("--ev"), evs = cssv("--ev-soft"), evd = cssv("--ev-dot"), an = cssv("--an"), mu = cssv("--mute"), fa = cssv("--faint"), ln = cssv("--line"), panel = cssv("--panel");
    if (e.q1 != null && e.q3 != null) svg.appendChild(sv("rect", { id: "band", x: scaleOf(e.q1), y: 14, width: scaleOf(e.q3) - scaleOf(e.q1), height: BASE - 6, rx: 6, fill: evs }));
    svg.appendChild(sv("line", { x1: 10, x2: W - 10, y1: BASE + 10, y2: BASE + 10, stroke: ln }));
    var cols = {}, hot = hotTier();
    (desk().sales || []).forEach(function (s) {
      var b = Math.round(scaleOf(s.price) / 13); cols[b] = (cols[b] || 0) + 1;
      var on = hot != null && s.tier && s.tier.tier === hot, dim = hot != null && !on;
      var c = sv("circle", { class: "dot" + (on ? " hot" : ""), "data-sale": s.id, cx: scaleOf(s.price), cy: BASE - (cols[b] - 1) * 13, r: 5, fill: on ? evc : evd, opacity: on ? 1 : dim ? 0.35 : 0.55 });
      if (on) { c.setAttribute("stroke", panel); c.setAttribute("stroke-width", "1.5"); }
      svg.appendChild(c);
    });
    if (e.median != null) svg.appendChild(sv("line", { id: "medline", x1: scaleOf(e.median), x2: scaleOf(e.median), y1: 8, y2: BASE + 10, stroke: evc, "stroke-width": 2.5 }));
    if (D.asking != null) svg.appendChild(sv("line", { id: "askline", x1: scaleOf(D.asking), x2: scaleOf(D.asking), y1: 26, y2: BASE + 10, stroke: fa, "stroke-width": 2, "stroke-dasharray": "4 4" }));
    var rf = curFig();
    if (rf != null) {
      var vx = Math.max(PADX, Math.min(W - PADX, scaleOf(rf)));
      svg.appendChild(sv("line", { id: "resline", x1: vx, x2: vx, y1: 10, y2: BASE + 14, stroke: an, "stroke-width": 3, "stroke-linecap": "round" }));
      svg.appendChild(sv("circle", { id: "resknob", cx: vx, cy: 10, r: 7, fill: an, stroke: panel, "stroke-width": 2 }));
    }
  }
  var dragging = false;
  function bindPlot() {
    var p = $("plot"); if (!p) return;
    function at(ev2) { var r = p.getBoundingClientRect(); return figureAt(ev2.clientX - r.left); }
    p.addEventListener("pointerdown", function (e) { if (!DOM) return; dragging = true; p.setPointerCapture(e.pointerId); if (window.__v4reserve) window.__v4reserve(at(e), "drag"); });
    p.addEventListener("pointermove", function (e) { if (dragging && DOM && window.__v4reserve) window.__v4reserve(at(e), "drag"); });
    p.addEventListener("pointerup", function () { dragging = false; }); p.addEventListener("pointercancel", function () { dragging = false; });
    window.addEventListener("resize", plot);
  }

  // ---------- what the market paid ----------
  var WINDOWS = D.windows || [];
  // a switch in flight is never a dead click: the control shows it is pressed, the market and its sales are dimmed, and the server's answer replaces them (a refusal restores them)
  function working(on, who) {
    ["s-market", "s-closest", "cond"].forEach(function (i) { var e = $(i); if (e) { e.classList.toggle("busy", on); e.setAttribute("aria-busy", on ? "true" : "false"); } });
    if (who) { who.classList.toggle("wait", on); who.setAttribute("aria-pressed", on ? "true" : "false"); }
  }
  // a switch the server refused: its own line is printed under the period control (never only at the top of the page) and the figures stay as they were
  function switched(r) { var m = $("swmsg"); if (!m) return; var t = r && r.ok === false ? (r.why || r.line || "That did not change.") : ""; m.textContent = t; m.hidden = !t; }
  function market() {
    var e = ev(), m = $("s-market"); if (!m) return;
    var seg = $("period"); clear(seg);
    WINDOWS.forEach(function (w) { seg.appendChild(el("button", { type: "button", "data-m": w[0], class: e && Number(e.windowMonths) === Number(w[0]) ? "on" : "", text: w[1], onclick: function () { if (e && Number(e.windowMonths) === Number(w[0])) return; working(true, this); edit("window", { months: w[0] }).then(function (r) { working(false); all(); switched(r); }); } })); });
    var sum = clear($("mk-sum"));
    if (e) {
      if (!e.insufficient && e.typicalLine) sum.appendChild(el("div", null, el("span", { class: "eyebrow", text: "Typical range" }), el("div", { class: "big num", id: "mBand", text: e.typicalLine })));
      if (!e.insufficient && e.medianLine) sum.appendChild(el("div", { class: "st" }, el("b", { class: "num", id: "mMed", text: e.medianLine }), el("span", { text: "median" })));
      if (e.countLine) sum.appendChild(el("div", { class: "st" }, el("b", { class: "num", id: "mN", text: e.countLine }), e.periodLine ? el("span", { id: "mPer", text: e.periodLine }) : null));
      if (!e.insufficient && e.extremesLine) sum.appendChild(el("div", { class: "st" }, el("b", { class: "num", id: "mLH", text: e.extremesLine }), el("span", { text: "lowest to highest" })));
    }
    var ins = $("mkins"); ins.textContent = e && e.insufficient && e.sentence ? (typeof e.sentence === "string" ? e.sentence : (e.sentence.text || "")) : ""; ins.hidden = !ins.textContent;
    plot(); rungline();
    var nl = $("mknote"); var parts = []; if (e && e.population && e.population.sentence) parts.push(e.population.sentence); (desk().outside || []).forEach(function (o) { if (o.countLine) parts.push(o.countLine); }); if (e && e.latestSale && e.latestSale.line) parts.push(e.latestSale.line);
    nl.textContent = parts.join(" ");
  }
  function rungline() {
    var c = K.condition || {}, s = c.selected || c.suggested, r = clear($("rungline")), line = "";
    if (s && s.tier != null) { var rg = (desk().rungs || []).filter(function (x) { return x.tier === s.tier; })[0]; line = rg ? rg.sentence : ""; }
    else if (desk().condition && desk().condition.basis) line = desk().condition.basis;
    r.textContent = line || "";
  }

  // ---------- closest sales: a row is changed in place; the list is never redrawn by a tick or an exclusion ----------
  var rows = [];   // the rendered comparables: the engine's, plus any sale this analyst excluded (kept on the page with its reason)
  function pickedSet() { var s = {}; (K.selectedComparables || []).forEach(function (i) { s[String(i)] = true; }); return s; }
  function saleOf(id) { return (desk().sales || []).filter(function (s) { return String(s.id) === String(id); })[0] || null; }
  function metaOf(c) { var s = saleOf(c.id) || {}; return [c.milesLine || s.milesLine, c.platform, c.dateLine || s.dateLine].filter(Boolean).join(" · "); }
  function rowEl(c) {
    var im = c.photo ? el("a", { class: "im", href: c.url || "#", target: "_blank", rel: "noopener", style: "background-image:url('" + (c.photo.url || c.photo) + "')", "aria-label": "Open the listing" }) : el("div", { class: "im none", text: "No photo" });
    var title = el("a", { href: c.url || "#", target: "_blank", rel: "noopener", text: (c.title || "") + " ↗" });
    var tick = el("input", { type: "checkbox", "data-in": c.id, onchange: function () { onTick(c.id, this.checked); } });
    var xf = el("div", { class: "exf" }, el("input", { placeholder: "Reason, required", "data-reason": c.id, "aria-label": "Reason for excluding" }),
      el("button", { class: "btn sm", type: "button", "data-xo": c.id, text: "Exclude from the market", onclick: function () { onExclude(c.id); } }), el("button", { class: "btn sm", type: "button", text: "Cancel", onclick: function () { xf.classList.remove("on"); } }));
    var r = el("div", { class: "comp", "data-comp": c.id }, im,
      el("div", null, el("div", { class: "t" }, title, c.relevance === "close" ? el("span", { class: "rel", text: "Closest" }) : null), el("div", { class: "m", text: metaOf(c) }), el("div", { class: "w", "data-why": c.id })),
      el("div", { class: "rgt" }, el("span", { class: "pr num", text: c.priceLine || "" }), el("label", { "data-tick": c.id }, tick, "In report"), el("button", { class: "link", type: "button", "data-x": c.id, text: "Exclude", onclick: function () { xf.classList.add("on"); xf.querySelector("input").focus(); } }), el("button", { class: "link", type: "button", "data-re": c.id, hidden: true, text: "Restore", onclick: function () { onRestore(c.id); } })), xf);
    return r;
  }
  function paintRow(c) {
    var r = document.querySelector('[data-comp="' + c.id + '"]'); if (!r) return;
    var ex = c.exclusion || (K.exclusions || []).filter(function (e) { return String(e.saleId) === String(c.id); })[0] || null, picked = pickedSet()[String(c.id)] === true;
    r.classList.toggle("ex", !!ex); var tk = r.querySelector("[data-in]"); tk.checked = picked && !ex; tk.disabled = !!ex;
    r.querySelector("[data-why]").textContent = ex ? "Excluded: " + ex.reason : (c.why || "");
    r.querySelector("[data-x]").hidden = !!ex; var rs = r.querySelector("[data-re]"); if (rs) rs.hidden = !ex; var xf = r.querySelector(".exf"); if (ex) xf.classList.remove("on");
  }
  function comps(force) {
    var box = $("comps"), list = desk().comparables || [], have = {}; rows.forEach(function (r) { have[String(r.id)] = true; });
    var fresh = list.filter(function (c) { return !have[String(c.id)]; }).length > 0 || (!rows.length && list.length > 0) || force;
    if (fresh) {
      var keep = rows.filter(function (r) { return r.exclusion || (K.exclusions || []).some(function (e) { return String(e.saleId) === String(r.id); }); }), ids = {}; list.forEach(function (c) { ids[String(c.id)] = true; });
      rows = list.slice(); keep.forEach(function (r) { if (!ids[String(r.id)]) rows.push(r); });
      clear(box); rows.forEach(function (c) { box.appendChild(rowEl(c)); });
      if (!rows.length) box.appendChild(el("p", { class: "mute", text: desk().comparablesNote || "" }));
    } else { list.forEach(function (c) { for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(c.id)) rows[i] = c; }); }
    rows.forEach(paintRow);
    var cc = $("ccount"); if (cc) cc.textContent = (K.selectedComparables || []).length ? (K.selectedComparables.length + " in the report") : "";
    var sa = $("showall"); if (sa) { var n = desk().comparablesCount != null ? desk().comparablesCount : (desk().comparables || []).length; sa.textContent = n ? "Show all " + n : ""; sa.hidden = !n; }
  }
  function onTick(id, on) {
    var ids = (K.selectedComparables || []).map(String), i = ids.indexOf(String(id));
    if (on && i < 0) ids.push(String(id)); else if (!on && i >= 0) ids.splice(i, 1);
    K.selectedComparables = ids;   // the row answers at once; the server's answer then confirms it, and only this row is touched
    edit("comparables", { ids: ids }).then(function (r) { if (r && r.ok) (r.rows || []).forEach(function (x) { for (var k = 0; k < rows.length; k++) if (String(rows[k].id) === String(x.id) && !x.gone) rows[k] = Object.assign({}, rows[k], x); }); rows.forEach(paintRow); cc2(); });
    paintRow(rows.filter(function (r) { return String(r.id) === String(id); })[0]); cc2();
  }
  function cc2() { var cc = $("ccount"); if (cc) cc.textContent = (K.selectedComparables || []).length ? (K.selectedComparables.length + " in the report") : ""; }
  function onExclude(id) {
    var inp = document.querySelector('[data-reason="' + id + '"]'), reason = inp.value.trim();
    if (reason.length < 8) { inp.placeholder = "Say why, in a few words"; inp.focus(); return; }
    var row = rows.filter(function (r) { return String(r.id) === String(id); })[0];
    edit("exclude", { saleId: String(id), scope: "market_calc", reason: reason }).then(function (r) {
      if (!r || !r.ok) return;
      if (row) row.exclusion = { scope: "market_calc", reason: reason };
      market(); comps(false); if (window.__v4panel) window.__v4panel();
    });
  }

  function onRestore(id) {
    var row = rows.filter(function (r) { return String(r.id) === String(id); })[0];
    edit("restore", { saleId: String(id) }).then(function (r) { if (!r || !r.ok) return; if (row) row.exclusion = null; (r.rows || []).forEach(function (x) { for (var k = 0; k < rows.length; k++) if (String(rows[k].id) === String(x.id) && !x.gone) rows[k] = Object.assign({}, rows[k], x, { exclusion: null }); }); market(); comps(false); panel(); });
  }

  // ---------- next steps ----------
  var stepT = {};
  function steps() {
    var box = clear($("steps")), list = K.nextSteps || [];
    list.forEach(function (s, i) {
      var inp = el("input", { "data-step": s.id, value: s.text, "aria-label": "Step " + (i + 1), oninput: function () { defer("step" + s.id, 700, save); }, onblur: function () { if (later["step" + s.id]) { clearTimeout(later["step" + s.id].t); delete later["step" + s.id]; } save(); } });
      function save() { if (inp.value.trim() && inp.value !== s.text) { s.text = inp.value; edit("step_edit", { step: s.id, text: inp.value }); } }
      box.appendChild(el("div", { class: "s", "data-stepRow": s.id }, el("span", { class: "num", text: String(i + 1) }), inp, el("button", { class: "link", type: "button", text: "Remove", onclick: function () { edit("step_remove", { step: s.id }).then(function () { steps(); }); } })));
    });
    var a = $("stepAuto"); if (a) a.textContent = list.length ? "Printed large on the last page, in this order." : "";
  }
  function addStep() {
    var box = $("steps"), inp = el("input", { "aria-label": "New step", placeholder: "Write the step" }), row = el("div", { class: "s" }, el("span", { class: "num", text: "+" }), inp, el("button", { class: "link", type: "button", text: "Cancel", onclick: function () { row.remove(); } }));
    var done = false; function commit() { if (done) return; var t = inp.value.trim(); if (!t) return; done = true; edit("step_add", { text: t }).then(function () { steps(); }); }
    inp.addEventListener("blur", commit); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
    box.appendChild(row); inp.focus();
  }

  // ---------- for sale now (analyst only) ----------
  function live() {
    var g = clear($("live")), list = desk().live || [];
    list.forEach(function (l) { g.appendChild(el("a", { class: "lv", href: l.url || "#", target: "_blank", rel: "noopener" }, el("b", { text: (l.title || "") + " ↗" }), el("div", { class: "f num", text: l.figureLine || "" }), el("span", { text: l.statusLine || "" }))); });
    $("s-live").hidden = !list.length;
  }


  // ---------- the Reserve panel: the one place the figure lives ----------
  var localFig = null, figSeq = 0, figTimer = null, whyTimer = null, noteTimer = null;
  function curFig() { return localFig != null ? localFig : (K.reserve && K.reserve.figure != null ? K.reserve.figure : null); }
  function digits(t) { var d = String(t).replace(/[^0-9]/g, ""); return d ? Number(d) : null; }
  // a typed or dragged figure: the marker and the input move together at once, and the figure is written after a pause (the answer is the engine's check of THIS figure)
  window.__v4reserve = function (fig, from) {
    if (fig == null) return; localFig = fig; var vi = $("valIn"); if (from !== "in" && vi) vi.value = String(fig);
    plot(); var d = $("diff"); if (d) d.textContent = ""; var hw = $("hiWarn"); if (hw) hw.hidden = true; say("Saving");
    var my = ++figSeq;
    defer("fig", 350, function () { edit("reserve", { patch: { figure: fig } }).then(function (r) { if (my === figSeq) { localFig = null; if (r && r.ok) panel(); plot(); } }); });
  };
  function condition() {
    var box = clear($("cond")), c = K.condition || {}, sel = c.selected && c.selected.tier != null ? c.selected.tier : null, sug = c.suggested && c.suggested.tier != null ? c.suggested.tier : null;
    var any = desk().anyCondition;
    if (any) box.appendChild(el("button", { type: "button", "data-c": "0", "aria-pressed": sel == null ? "true" : "false", class: sel == null ? "on" : "", onclick: pickAny }, "Any condition", el("small", { text: any.countLine || "" })));
    (desk().rungs || []).forEach(function (r) {
      var b = el("button", { type: "button", "data-c": r.tier, "aria-pressed": sel === r.tier ? "true" : "false", class: (sel === r.tier ? "on " : "") + (sug === r.tier ? "sug" : ""), onclick: function () { pickTier(r); } }, r.name, el("small", { text: r.countLine || "" }));
      box.appendChild(b);
    });
  }
  function pickAny() {
    var c = K.condition = K.condition || {}; c.selected = null;   // no condition: the case holds the untiered view the engine already sent
    condition(); plot(); rungline(); working(true, document.querySelector('#cond [data-c="0"]')); edit("condition", { selected: null }).then(function (x) { working(false); all(); switched(x); });
  }
  function pickTier(r) {
    var c = K.condition = K.condition || {}; c.selected = { tier: r.tier, name: r.name };   // the rung's dots and sentence answer at once; the server then re-reads for that tier
    condition(); plot(); rungline(); working(true, document.querySelector('#cond [data-c="' + r.tier + '"]')); edit("condition", { selected: { tier: r.tier, name: r.name } }).then(function (x) { working(false); all(); switched(x); });
  }
  function areaText(id, v) { var e = $(id); if (e && document.activeElement !== e) e.value = v == null ? "" : v; }
  function needs() {
    var box = clear($("att")), list = K.needs_review || [], open = 0;
    var vb = ((D.readiness || {}).blockers || []).filter(function (b) { return b.key === "vehicle"; })[0];   // the case's own line for a car it could not identify, with the way to fix it in place
    if (vb) { open++; box.appendChild(vehicleRow(vb)); }
    list.forEach(function (n) {
      var row = el("div", { class: "i" + (n.state === "open" ? "" : " done"), "data-need": n.id });
      if (n.state !== "open") { row.appendChild(el("span", { text: n.label + (n.state === "waived" && n.reason ? " (waived: " + n.reason + ")" : "") })); box.appendChild(row); return; }
      open++; row.appendChild(el("span", { text: n.label }));
      var x = el("span", { class: "x" });
      var act = NEEDACT[n.id]; if (act) x.appendChild(el("button", { type: "button", class: "btn sm", "data-act": act.act, text: act.label, onclick: function () { act.run(n); } }));
      x.appendChild(el("button", { type: "button", class: "btn sm", "data-act": "waive", text: "Proceed without", onclick: function () { waive(n, row); } }));
      row.appendChild(x); box.appendChild(row);
    });
    var cnt = $("attN"); if (cnt) cnt.textContent = list.length || open ? (open ? open + " open" : "All clear") : "";
  }
  function vehicleRow(vb) {
    var f = function (id, ph) { return el("input", { id: id, class: "txt", autocomplete: "off", placeholder: ph, "aria-label": ph }); }, msg = el("span", { class: "mute", id: "idmsg", role: "status" });
    var go = el("button", { type: "button", class: "btn sm", id: "idgo", text: "Identify", onclick: function () {
      var v = function (i) { return $(i).value.trim(); }, vin = v("idvin"), yr = v("idyear"), mk = v("idmake"), md = v("idmodel");
      if (!vin && !(yr && mk && md)) { msg.textContent = "Enter a VIN, or the year, make and model."; return; }
      go.disabled = true; msg.textContent = ""; var p = Promise.resolve();
      (vin ? [["vin", vin]] : [["year", yr], ["make", mk], ["model", md]]).forEach(function (x) { p = p.then(function () { return edit("field", { field: x[0], value: x[1] }); }); });
      p.then(function () { go.disabled = false; all(); });
    } });
    return el("div", { class: "i vehicle", "data-need": "vehicle" }, el("span", { text: vb.why }), el("div", { class: "idcar" }, f("idvin", "VIN"), el("div", { class: "row4" }, f("idyear", "Year"), f("idmake", "Make"), f("idmodel", "Model")), el("div", null, go, " ", msg)));
  }
  var NEEDACT = {
    mileage_unconfirmed: { act: "verify", label: "Verify from photo", run: function () { edit("verify", { field: "mileage" }).then(function () { all(); }); } },
    accident_unclear: { act: "verify", label: "Mark verified", run: function () { edit("verify", { field: "accident_history" }).then(function () { all(); }); } },
    service_documents: { act: "doc", label: "Received", run: function () { var pk = document.createElement("input"); pk.type = "file"; pk.accept = "application/pdf,image/jpeg,image/png"; pk.onchange = function () { var f = pk.files[0]; if (!f) return; readFile(f).then(function (b64) { return edit("doc_add", { kind: "invoice", title: f.name.replace(/\.[^.]+$/, ""), name: f.name, data: b64 }); }).then(function () { all(); }); }; pk.click(); } }
  };
  function waive(n, row) {
    var x = row.querySelector(".x"); if (row.querySelector("[data-reason-need]")) return; clear(x);
    var inp = el("input", { class: "txt", "data-reason-need": n.id, placeholder: "Reason, required", "aria-label": "Reason for proceeding without" });
    x.appendChild(inp); x.appendChild(el("button", { type: "button", class: "btn sm", text: "Waive", onclick: function () { var t = inp.value.trim(); if (t.length < 8) { inp.placeholder = "Say why, in a few words"; inp.focus(); return; } edit("need", { item: n.id, state: "waived", reason: t }).then(function () { all(); }); } }));
    x.appendChild(el("button", { type: "button", class: "btn sm", text: "Cancel", onclick: function () { needs(); } })); inp.focus();
  }
  function footer(rd) {
    var R = rd || D.readiness || { ready: false, blockers: [] }, chk = clear($("chk")), fin = K.status === "finalized";
    var lines = (R.checks && R.checks.length ? R.checks : K.checks) || [];
    if (lines.length) lines.forEach(function (l) { chk.appendChild(el("div", { class: l.ok === false ? "no" : "", "data-key": l.key, text: l.line || "" })); });
    else (R.blockers || []).forEach(function (b) { chk.appendChild(el("div", { class: "no", "data-key": b.key, text: b.why })); });
    $("bFin").disabled = !R.ready || fin; $("finHint").textContent = fin ? "" : (R.hint || K.finalizeHint || "");
    var fb = $("finBox"); fb.classList.toggle("on", fin); fb.textContent = fin ? "Finalized as version " + K.version + ". Locked." : "";
  }
  function panel() {
    var r = K.reserve || {}, vi = $("valIn"), fig = curFig(), ck = r.check || null;
    if (vi && document.activeElement !== vi) vi.value = localFig == null && r.figureLine ? r.figureLine : (fig != null ? String(fig) : "");
    var d = $("diff"); d.textContent = localFig != null ? "" : [r.reachedLine, r.positionLine].filter(Boolean).join(" ");
    var sa = $("sellerAsk"); if (sa) { sa.textContent = r.sellerAskLine || ""; sa.hidden = !r.sellerAskLine; }
    var hw = $("hiWarn"); hw.hidden = !(localFig == null && ck && ck.supported === false); $("sellerReq").checked = r.sellerRequested === true;
    $("mkt").textContent = K.marketLine || ""; $("mkt").hidden = !K.marketLine;
    var st = $("resStart"); clear(st); if (r.source === "analyst" && r.start && r.start.sentence) { st.appendChild(document.createTextNode(r.start.sentence + " ")); st.appendChild(el("button", { type: "button", class: "link", id: "resRestart", text: "Go back to it", onclick: function () { localFig = null; edit("reserve", { patch: { restart: true } }).then(function () { all(); }); } })); }
    condition(); areaText("why", r.why); areaText("cnote", r.conditionNote); needs(); footer(D.readiness); sendPaint();
  }
  window.__v4panel = panel;


  // ---------- the Seller report tab and Preview: Lane D's PDF for the case as it stands (case_pdf), DRAFT until it is finalized ----------
  var pdfUrl = null, pdfSeq = 0;
  function loadReport() {
    var rep = clear($("rep")), my = ++pdfSeq, fin = K.status === "finalized";
    rep.appendChild(el("div", { class: "card pad", id: "pdfstate" }, el("p", { class: "mute", id: "pdfmsg", role: "status", text: "Building the report from the case as it stands." })));
    return flush().then(function () { return post({ action: "case_pdf", id: C.active, draft: !fin }); }).then(function (r) {
      if (my !== pdfSeq) return;
      clear(rep);
      if (!r || !r.ok) { rep.appendChild(el("div", { class: "card pad" }, el("p", { class: "msg", id: "pdfmsg", role: "alert", text: (r && (r.why || r.line)) || "The report could not be built." }), el("button", { type: "button", class: "btn", id: "pdfretry", text: "Try again", onclick: loadReport }))); return; }
      var bin = atob(r.pdf_b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl); pdfUrl = URL.createObjectURL(new Blob([u8], { type: "application/pdf" }));
      rep.appendChild(el("div", { class: "pdfbar" }, el("span", { id: "pdfmsg", text: r.draft ? "Draft, as the case stands now." : (r.reportNumber || "Finalized report") }), el("span", null,
        el("button", { type: "button", class: "btn sm", id: "pdfrefresh", text: "Refresh", onclick: loadReport }), " ", el("a", { class: "btn sm", id: "pdfopen", href: pdfUrl, target: "_blank", rel: "noopener", text: "Open in a new tab" }), " ", el("a", { class: "btn sm", id: "pdfsave", href: pdfUrl, download: r.filename || "report.pdf", text: "Download" }))));
      rep.appendChild(el("iframe", { id: "pdfframe", class: "pdfframe", title: "Seller report", src: pdfUrl }));
    }, function () { clear(rep); rep.appendChild(el("div", { class: "card pad" }, el("p", { class: "msg", id: "pdfmsg", text: "The report could not be built. The connection dropped." }))); });
  }
  window.__v4preview = function () { if (window.__v4view) window.__v4view("report", true); loadReport(); };
  window.__v4report = loadReport; window.__v4flush = flush;


  // ---------- Send to seller (Lane D's case_send_preview { id } and case_send { id, version, to }) ----------
  // THE CONTRACT'S NAMES LIVE HERE AND ONLY HERE: if Lane D changes one, this table is the one place to change. Every word the dialog and the panel print is a field the server sent; a refusal is shown exactly as given.
  var SEND = {
    preview: function (r) { return { to: r.to, subject: r.subject, message: r.message, attachment: r.attachmentName, version: r.version, from: r.from, fromName: r.fromName, earlier: r.alreadySent || [] }; },
    refusal: function (r) { return (r && r.why) || ""; },
    // every send, oldest first, one line each (case.handling.sentLines); the latest is case.handling.sentLine. case.handling.clock is the handling time and is never the sent line.
    sentLines: function (k) { var h = k.handling || {}; return h.sentLines && h.sentLines.length ? h.sentLines : (h.sentLine ? [h.sentLine] : []); },
    again: function (p) { return p && p.earlier && p.earlier.length > 0; }   // the preview's alreadySent[] is what tells the page this is an explicit second send
  };
  var sending = false, pv = null;
  function hasFinal() { return !!K.finalized_at; }
  function sendPaint() {
    var box = $("sendBox"); if (!box) return; var edited = hasFinal() && K.status !== "finalized", lines = SEND.sentLines(K), line = lines.length;
    box.hidden = !hasFinal(); var b = $("bSend"); b.disabled = edited || sending; b.textContent = line ? "Send again" : "Send to seller";
    $("sendHint").textContent = edited ? "Finalize again to send the updated report" : "";
    var sl = clear($("sentLine")); lines.forEach(function (t) { sl.appendChild(el("span", { "data-sent": "1", text: t })); }); sl.hidden = !lines.length;
  }
  function dlgFocusables() { return [].slice.call($("sendDlg").querySelectorAll("input,button")).filter(function (e) { return !e.disabled && !e.hidden; }); }
  function closeSend() { $("sendScrim").hidden = true; $("sendErr").hidden = true; $("sendErr").textContent = ""; pv = null; var b = $("bSend"); if (b) b.focus(); }
  function openSend() {
    if (sending || $("bSend").disabled) return; $("bSend").disabled = true;
    post({ action: "case_send_preview", id: C.active }).then(function (r) {
      sendPaint();
      if (!r || !r.ok) { $("sendHint").textContent = SEND.refusal(r); return; }
      pv = SEND.preview(r); $("sendFrom").textContent = [pv.fromName, pv.from].filter(Boolean).join(" "); var ea = clear($("sendEarlier")); pv.earlier.forEach(function (x) { ea.appendChild(el("div", { class: "ro" }, el("span", { text: x.to || "" }), el("span", { class: "mute", text: "Version " }), el("b", { text: x.version != null ? String(x.version) : "" }))); }); $("sendEarlierBox").hidden = !pv.earlier.length; $("sendTo").value = pv.to || ""; $("sendSubject").textContent = pv.subject || ""; $("sendMsg").textContent = pv.message || ""; $("sendAtt").textContent = pv.attachment || ""; $("sendVer").textContent = pv.version != null ? String(pv.version) : "";
      $("sendErr").hidden = true; $("sendGo").disabled = false; $("sendScrim").hidden = false; $("sendTo").focus();
    }, function () { sendPaint(); });
  }
  function doSend() {
    if (sending || !pv) return; sending = true; $("sendGo").disabled = true; $("sendNo").disabled = true; $("sendErr").hidden = true;
    post(SEND.again(pv) ? { action: "case_send", id: C.active, version: pv.version != null ? pv.version : K.version, to: $("sendTo").value.trim(), again: true } : { action: "case_send", id: C.active, version: pv.version != null ? pv.version : K.version, to: $("sendTo").value.trim() }).then(function (r) {
      if (r && r.ok) { return (r.case ? Promise.resolve(r.case) : post({ action: "case_get", id: C.active }).then(function (g) { return g && g.case; })).then(function (k) { if (k) { K = k; D.kase = k; } sending = false; $("sendNo").disabled = false; closeSend(); head(); docs(); panel(); }); }
      sending = false; $("sendGo").disabled = false; $("sendNo").disabled = false; var e = $("sendErr"); e.textContent = SEND.refusal(r); e.hidden = !e.textContent;
    }, function () { sending = false; $("sendGo").disabled = false; $("sendNo").disabled = false; });
  }

  function all() { head(); car(); docs(); market(); comps(false); steps(); live(); if (window.__v4panel) window.__v4panel(); }
  window.__v4 = { all: all, plot: plot, market: market, comps: comps, steps: steps, car: car, docs: docs, head: head, photos: photos, K: function () { return K; }, setK: function (k) { K = k; D.kase = k; }, el: el, sv: sv, $: $, clear: clear, edit: edit, note: note, say: say, figureAt: figureAt, scaleOf: scaleOf, D: D };
  var sa = $("addstep"); if (sa) sa.addEventListener("click", addStep);
  var vi0 = $("valIn"); vi0.addEventListener("input", function () { window.__v4reserve(digits(this.value), "in"); }); vi0.addEventListener("blur", function () { if (localFig == null) panel(); });
  $("sellerReq").addEventListener("change", function () { edit("reserve", { patch: { sellerRequested: this.checked } }).then(function () { panel(); }); });
  $("why").addEventListener("input", function () { var t = this.value; defer("why", 600, function () { edit("reserve", { patch: { why: t } }).then(function () { footer(D.readiness); }); }); });
  $("cnote").addEventListener("input", function () { var t = this.value; defer("note", 600, function () { edit("reserve", { patch: { conditionNote: t } }); }); });
  $("bFin").addEventListener("click", function () { say("Saving"); post({ action: "case_finalize", id: C.active }).then(function (r) { if (r && r.ok) { K = r.case; D.kase = K; D.readiness = { ready: true, blockers: [] }; say("Locked"); all(); } else { say("Not saved"); note((r && (r.why || r.line)) || "That did not finalize."); if (r && r.blockers) footer({ ready: false, blockers: r.blockers }); } }); });
  $("bPrev").addEventListener("click", function () { if (window.__v4preview) window.__v4preview(); });
  $("bSend").addEventListener("click", openSend); $("sendGo").addEventListener("click", doSend); $("sendNo").addEventListener("click", function () { if (!sending) closeSend(); });
  $("sendDlg").addEventListener("keydown", function (e) { if (e.key === "Escape" && !sending) { e.preventDefault(); closeSend(); } else if (e.key === "Tab") { var f = dlgFocusables(); if (!f.length) return; var i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } });
  bindPlot(); all();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", plot);
}

// DESK V4 NEW CASE (Lane S): the form's behaviour. case_new reads the car with the real engine and answers the whole case; the photos are added to it one at a time; then the page opens the case, which serves that read. Nothing is computed or seeded here.
// The photos ACCUMULATE: every pick adds to the list (each with its Remove) and the input is emptied so the next pick adds again. A VIN typed in fills the blank fields from the server's decode, marked decoded and still editable; make, model, body, gearbox and colour are
// pickers whose options come from the server (a typed value is always allowed). A refusal is printed as the server's own `why`, under the button.
export function deskV4New() {
  var C = window.__DESK_V3__; if (!C) return;
  var $ = function (i) { return document.getElementById(i); }, files = [], dec = {}, lastVin = "", pickersAsked = false;
  function post(b) { return fetch(C.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); }
  function msg(t, bad) { var m = $("nc-msg"); if (!m) return; m.textContent = t || ""; m.hidden = !t; m.className = bad ? "msg" : "msg say"; }
  function b64(f) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(f); }); }
  var fkey = function (f) { return f.name + "|" + f.size + "|" + f.lastModified; };
  function drawFiles() {
    var box = $("nc-list"); if (!box) return; box.textContent = "";
    files.forEach(function (f) {
      var row = document.createElement("div"); row.className = "ncf"; row.setAttribute("data-file", fkey(f));
      var n = document.createElement("span"); n.textContent = f.name;
      var x = document.createElement("button"); x.type = "button"; x.className = "btn sm"; x.textContent = "Remove"; x.setAttribute("aria-label", "Remove " + f.name);
      x.addEventListener("click", function () { files.splice(files.indexOf(f), 1); drawFiles(); });
      row.appendChild(n); row.appendChild(x); box.appendChild(row);
    });
  }
  var ph = $("nc-photos"); if (ph) ph.addEventListener("change", function () { [].slice.call(ph.files || []).forEach(function (f) { if (!files.some(function (g) { return fkey(g) === fkey(f); })) files.push(f); }); ph.value = ""; drawFiles(); });
  var DF = [["year", "nc-year"], ["make", "nc-make"], ["model", "nc-model"], ["trim", "nc-trim"], ["body", "nc-body"], ["transmission", "nc-trans"]];
  function mark(id, on) { dec[id] = on; var m = $(id + "-dec"); if (m) m.hidden = !on; }
  DF.forEach(function (p) { var e = $(p[1]); if (e) e.addEventListener("input", function () { mark(p[1], false); }); });
  function fill(id, list) { var d = $(id); if (!d) return; d.textContent = ""; (list || []).forEach(function (x) { var o = document.createElement("option"); o.value = String(x); d.appendChild(o); }); }
  function pickers(make) {
    post(make ? { action: "case_pickers", make: make } : { action: "case_pickers" }).then(function (r) {
      if (!r || !r.ok) return;
      [["makes", "dl-make"], ["models", "dl-model"], ["bodies", "dl-body"], ["transmissions", "dl-trans"], ["colours", "dl-colour"]].forEach(function (p) { if (Array.isArray(r[p[0]])) fill(p[1], r[p[0]]); });
    }).catch(function () {});
  }
  var mk0 = $("nc-make"); if (mk0) mk0.addEventListener("change", function () { var t = mk0.value.trim(); if (t) pickers(t); });
  function decode() {
    var v = ($("nc-vin").value || "").trim().toUpperCase(); if (v.length !== 17 || v === lastVin) return; lastVin = v;
    post({ action: "case_decode", vin: v }).then(function (r) {
      if (!r || !r.ok || !r.fields) { if (r && r.why) msg(r.why, true); return; }
      msg("");
      DF.forEach(function (p) { var val = r.fields[p[0]]; if (val == null || val === "") return; var e = $(p[1]); if (!e || (e.value.trim() && !dec[p[1]])) return; e.value = String(val); mark(p[1], true); if (p[0] === "make") pickers(String(val)); });
    }).catch(function () {});
  }
  var vin0 = $("nc-vin"); if (vin0) { vin0.addEventListener("input", decode); vin0.addEventListener("blur", decode); }
  function open(on) {
    var f = $("newcase"); if (!f) return; f.hidden = !on; document.body.toggleAttribute("data-new", on);   // while the form is open the Reserve panel shows its label only (it belongs to no case yet)
    if (on) { f.scrollIntoView({ block: "start" }); var i = $("nc-vin"); if (i) i.focus(); if (!pickersAsked) { pickersAsked = true; pickers(); } }
  }
  var b0 = $("newcase-btn"); if (b0) b0.addEventListener("click", function () { var q = $("queue"); if (q) q.classList.remove("open"); var sc = $("qscrim"); if (sc) sc.classList.remove("on"); open(true); });
  var x0 = $("nc-x"); if (x0) x0.addEventListener("click", function () { open(false); });
  var go = $("nc-go"); if (!go) return;
  var made = null;   // the case once it exists: a photo the server refused never loses it (the button then opens the case)
  go.addEventListener("click", function () {
    if (made) { location.href = C.base + "/case/" + made; return; }
    var v = function (i) { return ($(i).value || "").trim(); }, vin = v("nc-vin"), yr = v("nc-year"), mk = v("nc-make"), md = v("nc-model");
    if (!vin && !(yr && mk && md)) { msg("Enter a VIN, or the year, make and model.", true); return; }
    var req = { action: "case_new" };
    [["vin", vin], ["year", yr], ["make", mk], ["model", md], ["trim", v("nc-trim")], ["mileage", v("nc-mileage")], ["transmission", v("nc-trans")], ["body", v("nc-body")], ["colour", v("nc-colour")], ["seller_name", v("nc-seller")], ["asking_price", v("nc-asking")], ["seller_notes", ($("nc-notes").value || "").trim()]].forEach(function (p) { if (p[1]) req[p[0]] = p[1]; });
    go.disabled = true; msg("Reading the car"); var list = files.slice(), bad = null;
    post(req).then(function (r) {
      if (!r.ok) throw r; made = r.id; var chain = Promise.resolve();
      list.forEach(function (f, i) { chain = chain.then(function () { if (bad) return null; msg("Adding photo " + (i + 1) + " of " + list.length); return b64(f).then(function (d) { return post({ action: "case_edit", id: made, op: "photo_add", name: f.name, data: d }); }).then(function (q) { if (!q.ok) bad = q; }); }); });
      return chain;
    }).then(function () { if (bad) { go.disabled = false; go.textContent = "Open the case"; msg((bad.why || bad.line || "A photo could not be added.") + " The case was made without the photos after it.", true); return; } location.href = C.base + "/case/" + made; }).catch(function (e) { go.disabled = false; msg((e && (e.why || e.line || e.error)) || "The case could not be created: the server sent no reason (check the photo size and try again).", true); });
  });
}
