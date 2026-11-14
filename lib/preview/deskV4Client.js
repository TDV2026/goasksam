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
    // WHO AND WHERE, as the case carries them: the seller's email and phone, and the city and state the seller gave. Each value is its own element in the words sent (the comma between two is drawn by the style); a value the case does not carry is not drawn, and a line with no value is not drawn at all.
    var lf = (K.lead && K.lead.facts) || {}, who = el("div", { class: "who" }), ct = [["email", s.email], ["phone", s.phone]].filter(function (x) { return x[1]; }), lc = [["city", lf.city && lf.city.value], ["state", lf.state && lf.state.value]].filter(function (x) { return x[1]; });
    if (ct.length) { var cl = el("div", { class: "wl", id: "ch-contact" }, el("span", { class: "wk", text: "Contact" })); ct.forEach(function (x) { cl.appendChild(el("span", { class: "wv", "data-contact": x[0], text: String(x[1]) })); }); who.appendChild(cl); }
    if (lc.length) { var ll = el("div", { class: "wl", id: "ch-location" }, el("span", { class: "wk", text: "Location" })); lc.forEach(function (x) { ll.appendChild(el("span", { class: "wv", "data-loc": x[0], text: String(x[1]) })); }); who.appendChild(ll); }
    if (who.firstChild) h.appendChild(who);
    // THE UNOPENED STATE (case.claim, the server's line and button, present only for a seat that can pick the lead up): until the button is pressed the lead is not the analyst's, so every card and the Reserve panel are locked and nothing prints a refusal
    var op = K.claim; if (op) h.appendChild(el("div", { class: "openbar", id: "openbar" }, el("p", { id: "openline", text: op.line || "" }), el("button", { type: "button", class: "btn pri", id: "openbtn", text: op.button || "", onclick: function () { openCase(this); } }), el("p", { class: "msg", id: "openmsg", role: "alert", hidden: "hidden" })));
  }
  var LOCKED = ["s-car", "s-docs", "s-own", "s-market", "s-live", "s-closest", "s-considered", "s-steps", "val"];
  function lock() { var u = !!K.claim; LOCKED.forEach(function (i) { var e = $(i); if (!e) return; if (u) { e.setAttribute("inert", ""); e.classList.add("locked"); } else { e.removeAttribute("inert"); e.classList.remove("locked"); } }); }
  function openCase(btn) {
    btn.disabled = true; var m = $("openmsg"); if (m) { m.hidden = true; m.textContent = ""; }
    chain = chain.then(function () { return post({ action: "case_get", id: C.active, open: true }); }).then(function (g) { return { got: g };   // case_get with open true claims the lead (it becomes this seat's, in progress) and records the first open: the handling clock starts
    }).then(function (x) {
      if (x && x.got && x.got.ok && x.got.case && !x.got.case.claim) { K = x.got.case; D.kase = K; var ck = K.handling && K.handling.clock, ce = $("clock"); if (ck && ce) ce.textContent = ck; all(); needs(); footer(D.readiness); sendPaint(); return; }
      var why = x && x.got && (x.got.why || x.got.line); var m2 = $("openmsg"); if (m2) { m2.textContent = why || "That could not be opened."; m2.hidden = false; } var b2 = $("openbtn"); if (b2) b2.disabled = false;
    }, function () { var m3 = $("openmsg"); if (m3) { m3.textContent = "That could not be opened. The connection dropped."; m3.hidden = false; } var b3 = $("openbtn"); if (b3) b3.disabled = false; });
  }

  // ---------- THE CAR'S OWN RECORD (Lane D's case.vehicle.ownBlock and ownLive; every word is the server's) ----------
  // "This car has sold before": each prior sale or no-sale of this VIN as the server sent it, newest first, its line whole and linked to its listing when it has one; "Listed now" when the car is on a listing today. Nothing is drawn that the case does not carry: no heading, no row and no card without a block.
  // ONE CARD FOR A CAR ON SALE NOW, in "Listed now" and in "For sale now": the photo (or a marked empty slot), the title, the venue, the bid, the time left and the engine's vs-range line, each as sent, the whole card opening its listing. Nothing is made here.
  function lvCard(o) {
    var ph = el("div", { class: "ph" + (o.photo ? "" : " none") }); if (o.photo) ph.appendChild(el("img", { src: o.photo, alt: "", loading: "lazy" })); else ph.appendChild(el("span", { text: "No photo" }));
    var kids = [ph, el("div", { class: "lb" }, o.chip ? el("span", { class: "ownchip", text: o.chip }) : null, el("b", { class: "lt", text: (o.title || "") + (o.url ? " ↗" : "") }),
      o.venue ? el("span", { class: "lvn", text: String(o.venue) }) : null, o.bid ? el("div", { class: "f num lbid", text: String(o.bid) }) : null, o.left ? el("span", { class: "lleft", text: String(o.left) }) : null, o.status ? el("span", { class: "lstat", text: String(o.status) }) : null, o.vs ? el("span", { class: "lvs", text: String(o.vs) }) : null)];
    return el.apply(null, [o.url ? "a" : "div", { class: "lvc" + (o.own ? " own" : ""), href: o.url || null, target: o.url ? "_blank" : null, rel: o.url ? "noopener" : null }].concat(kids));
  }
  function own() {
    var card = $("s-own"); if (!card) return; var v = K.vehicle || {}, b = v.ownBlock, lv = v.ownLive, rows = clear($("ownrows")), box = clear($("ownlive"));
    var has = !!(b && b.rows && b.rows.length) || !!(lv && lv.listing); card.hidden = !has; if (!has) { $("own-h").textContent = ""; box.hidden = true; return; }
    $("own-h").textContent = b && b.rows && b.rows.length ? b.heading || "" : "";
    ((b && b.rows) || []).forEach(function (r, i) { if (!r.line) return; var t = r.url ? el("a", { href: r.url, target: "_blank", rel: "noopener", text: r.line + " ↗" }) : el("span", { text: r.line }); rows.appendChild(el("li", { class: "ownrow", "data-own": r.kind || "", "data-i": String(i) }, t)); });
    if (lv && lv.listing) { var l = lv.listing; box.appendChild(lvCard({ chip: "Listed now", url: l.url, photo: l.photo || l.photo_url || l.image || null, title: l.title || lv.line || "", venue: l.venue || l.platform || null, bid: l.bidLine || null, left: lv.endsLine || l.endsLine || null, vs: l.vsRangeLine || null, own: true })); box.hidden = false; } else box.hidden = true;
  }
  // ---------- car card ----------
  var FACTS = [["vin", "VIN"], ["mileage", "Mileage"], ["transmission", "Transmission"], ["body", "Body"], ["colour", "Colour"], ["generation", "Generation"], ["accident_history", "Accidents"], ["service_history", "Service"]];
  var LONG = { accident_history: true, service_history: true };
  var SRC = D.srcLabels || {};
  // ONE WORD FOR ONE STATE, FROM THE CASE'S OWN MARK (field.verified and field.source): a verified value reads Verified; a value the seller gave, or one taken from the car's own last sale, that nobody has verified reads Unverified (the source chip says where it came from, the state says it is not checked); two values that disagree read Conflicting. A field with no value carries no mark word (the Needs attention list is where a missing fact is asked for), and no other word is used for these states anywhere in the facts grid ("Not confirmed" is not one of them).
  var MARKWORD = { verified: "Verified", unverified: "Unverified", conflicting: "Conflicting" };
  function markOf(f) { return f.verified ? "verified" : f.source === "conflicting" ? "conflicting" : (f.source === "seller" || f.source === "last_sale") && f.value != null && f.value !== "" ? "unverified" : null; }
  function marksOf(k, f) {
    var g = el("span", { class: "marks", "data-fact": k }); if (!f) return g; var m = markOf(f);
    if (m === "verified") { g.appendChild(el("span", { class: "chip ok", "data-mark": m, text: MARKWORD[m] })); return g; }
    var src = f.sourceLine || (f.source !== "missing" && f.source !== "conflicting" ? SRC[f.source] : null); if (src) g.appendChild(el("span", { class: "chip", text: src }));
    if (m) g.appendChild(el("span", { class: "chip " + (m === "conflicting" ? "warn" : "unv"), "data-mark": m, "data-unverified": m === "unverified" ? k : null, text: MARKWORD[m] }));
    if (m === "unverified") g.appendChild(el("button", { type: "button", class: "link", "data-verify": k, text: "Verify", onclick: function () { edit("verify", { field: k }).then(function () { car(); needs(); footer(D.readiness); sendPaint(); }); } }));
    return g;
  }
  function factValue(k, f) { if (k === "mileage" && K.vehicle && K.vehicle.mileageLine) return K.vehicle.mileageLine; return f && f.value != null ? String(f.value) : ""; }
  function photos() {
    var P = K.photos || { items: [] }, items = P.items || [], inr = {}; (P.reportIds || []).forEach(function (i) { inr[i] = true; });
    var cover = items.filter(function (p) { return p.id === P.coverId; })[0] || items[0] || null;
    var hero = $("hero"); if (hero) { hero.style.backgroundImage = cover && cover.url ? "url('" + cover.url + "')" : ""; hero.classList.toggle("nophoto", !cover); hero.textContent = cover ? "" : "No photos yet"; }
    var th = clear($("thumbs"));
    items.forEach(function (p) {
      var isCover = !!cover && cover.id === p.id, mid = "thm-" + p.id;
      var t = el("div", { class: "th" + (inr[p.id] ? " inr" : "") + (isCover ? " cover" : ""), role: "button", tabindex: "0", "aria-pressed": inr[p.id] ? "true" : "false", "aria-label": (p.name || "Photo") + (isCover ? ", the cover" : "") + (inr[p.id] ? ", in the report" : ", not in the report"), "data-photo": p.id, style: p.url ? "background-image:url('" + p.url + "')" : null, onclick: function () { togglePhoto(p.id); }, onkeydown: function (e) { if (e.target === t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); togglePhoto(p.id); } } });
      if (isCover) t.appendChild(el("em", { class: "ctag", "data-cover-tag": p.id, text: "Cover" }));
      else t.appendChild(el("button", { type: "button", class: "thc", "data-setcover": p.id, text: "Set as cover", onclick: function (e) { e.stopPropagation(); setCover(p.id); } }));
      var menu = el("div", { class: "thm", id: mid, role: "menu", hidden: true });
      if (!isCover) menu.appendChild(el("button", { type: "button", role: "menuitem", "data-menu-cover": p.id, text: "Set as cover", onclick: function (e) { e.stopPropagation(); setCover(p.id); } }));
      menu.appendChild(el("button", { type: "button", role: "menuitem", "data-menu-report": p.id, text: inr[p.id] ? "Leave out of the report" : "Put in the report", onclick: function (e) { e.stopPropagation(); togglePhoto(p.id); } }));
      var kb = el("button", { type: "button", class: "thk", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": mid, "aria-label": "Photo actions", "data-photo-menu": p.id, text: "\u22EF", onclick: function (e) { e.stopPropagation(); var open = menu.hidden; [].forEach.call(document.querySelectorAll("#thumbs .thm"), function (m) { m.hidden = true; }); [].forEach.call(document.querySelectorAll("#thumbs .thk"), function (b) { b.setAttribute("aria-expanded", "false"); }); menu.hidden = !open; kb.setAttribute("aria-expanded", open ? "true" : "false"); } });
      t.appendChild(kb); t.appendChild(menu); th.appendChild(t);
    });
    var add = el("label", { class: "th add", title: "Add photos", "for": "photofile" }, "+"); th.appendChild(add);
    var n = items.filter(function (p) { return inr[p.id]; }).length; $("pcount").textContent = n + " of " + items.length + " in the report";
  }
  // the cover is the photo the report's first page prints (Lane D's case_edit cover, photoId); the hero above and the tag on the thumbnail follow the case's own coverId
  function setCover(id) { edit("cover", { photoId: id }).then(function () { photos(); }); }
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
      var lg = LONG[p[0]] ? " long" : "";   // a sentence (accidents, service) takes the full width under its name, so it is never cut
      facts.appendChild(el("span", { class: "k" + lg, text: p[1] })); facts.appendChild(el("span", { class: "v" + lg }, inp));
      var mk = marksOf(p[0], f); if (lg) mk.className += " long"; facts.appendChild(mk);
    });
    // THE SELLER'S OWN ANSWERS, when the case carries them (case.lead.facts): Title status and Mileage original, read only, each in the words sent and marked as the seller's, unverified
    [["titleStatus", "Title status"], ["mileageOriginal", "Mileage original"]].forEach(function (p) {
      var lf = (K.lead && K.lead.facts || {})[p[0]], t = lf && (lf.line || (typeof lf.value === "string" ? lf.value : "")); if (!t) return;
      facts.appendChild(el("span", { class: "k", text: p[1] })); facts.appendChild(el("span", { class: "v ro", "data-lead": p[0], text: t }));
      var g = el("span", { class: "marks", "data-fact": p[0] }), m = markOf(lf), src = lf.source && lf.source !== "missing" && lf.source !== "conflicting" ? SRC[lf.source] : null; if (src) g.appendChild(el("span", { class: "chip", text: src })); if (m) g.appendChild(el("span", { class: "chip " + (m === "verified" ? "ok" : m === "conflicting" ? "warn" : "unv"), "data-mark": m, text: MARKWORD[m] })); facts.appendChild(g); });
    var notes = (K.seller && K.seller.notes) ? el("div", { class: "notes" }, el("b", { text: "Seller notes" }), K.seller.notes) : null;
    c.appendChild(el("div", { class: "car" }, left, el("div", null, facts, notes))); photos();
  }

  // ---------- documents ----------
  var KINDS = D.docKinds || [];
  function docs() {
    var d = $("s-docs"), grid = clear($("docs")), list = K.documents || [];
    var em = K.sourceEmail; if (em && em.url) grid.appendChild(el("a", { class: "doc mail", id: "origmail", href: em.url, target: "_blank", rel: "noopener" }, el("b", { text: (em.name || "") + " ↗" }), el("span", { text: em.line || "" })));
    (K.exports || []).forEach(function (x) { grid.appendChild(el("div", { class: "doc", "data-export": x.version }, el("b", { text: "Report sent" }), el("span", { text: x.line || "" }))); });
    list.filter(function (x) { return !x.sellerWords; }).forEach(function (x) { grid.appendChild(el(x.url ? "a" : "div", { class: "doc", "data-doc": x.id, href: x.url || null, target: x.url ? "_blank" : null, rel: x.url ? "noopener" : null }, el("b", { text: x.name || x.kindLabel || "Document" }), el("span", { text: x.line || x.kindLabel || "" }))); });
    var sel = el("select", { id: "dockind", "aria-label": "Kind of document" }); KINDS.forEach(function (k) { sel.appendChild(el("option", { value: k[0], text: k[1] })); });
    grid.appendChild(el("label", { class: "doc drop", id: "docdrop", "for": "docfile" }, "Add a document", el("span", { text: "Invoice, title, inspection" }),
      el("input", { type: "file", id: "docfile", accept: DOCACCEPT, hidden: true, onchange: function (e) {
        var f = e.target.files[0]; if (!f) return; var kind = $("dockind").value;
        readFile(f).then(function (b64) { return edit("doc_add", { kind: kind, title: f.name.replace(/\.[^.]+$/, ""), name: f.name, data: b64 }); }).then(function (r) { everything(r, null); e.target.value = ""; }); } })));
    var sw = list.filter(function (x) { return x.sellerWords; }), wb = $("sellerWords"); if (wb) { clear(wb); wb.hidden = !sw.length; if (sw.length) { wb.appendChild(el("h4", { text: "In the seller's own words" })); sw.forEach(function (x) { wb.appendChild(el("div", { class: "sw", "data-field": x.field || "", "data-sw": x.id }, el("b", { text: x.title || "" }), el("p", { text: x.text || "" }))); }); } }
    var dc = $("dcount"); if (dc) dc.textContent = K.documentsLine || "";
    // RE-READ THE EMAIL (Lane D's case_reread_email): on a forwarded lead only, never on a finalized case; the server's line (or its refusal) prints under the header, the page counts nothing
    var rb = $("rereadbox"); if (rb) { clear(rb); if (D.forwarded && D.rereadWord && K.status !== "finalized") rb.appendChild(el("button", { type: "button", class: "link", id: "reread", text: D.rereadWord, onclick: function (e) {
      var b = e.currentTarget, m = $("rereadmsg"); b.disabled = true; if (m) { m.hidden = true; m.textContent = ""; }
      chain = chain.then(function () { return post({ action: "case_reread_email", id: C.active }); }).then(function (r) {
        var shown = r && r.ok && r.case; if (shown) { K = r.case; D.kase = K; all(); needs(); footer(D.readiness); sendPaint(); }
        var m2 = $("rereadmsg"); if (m2) { m2.textContent = (r && (r.ok ? r.line : (r.why || r.line))) || "The email could not be read again."; m2.hidden = !m2.textContent; m2.className = "rereadmsg" + (r && r.ok ? "" : " bad"); }
        var b2 = $("reread"); if (b2) b2.disabled = false; }, function () { var m3 = $("rereadmsg"); if (m3) { m3.textContent = "The email could not be read again. The connection dropped."; m3.hidden = false; m3.className = "rereadmsg bad"; } var b3 = $("reread"); if (b3) b3.disabled = false; }); } })); }
    var kb = $("dockindbox"); if (kb && !kb.firstChild) kb.appendChild(sel);
  }

  // ---------- the plot (the only arithmetic on the page is scaleOf and figureAt) ----------
  var PADX = 14, W = 800, H = 170, BASE = 118;
  function domain() {
    var e = ev(), v = [];
    (desk().sales || []).forEach(function (s) { if (s.price != null) v.push(s.price); });
    if (e) [e.low, e.high, e.q1, e.q3, e.median].forEach(function (x) { if (x != null) v.push(x); });
    var wn = e && e.byWindow && e.byWindow[String(e.windowMonths)]; if (wn) [wn.axisMin, wn.axisMax].forEach(function (x) { if (x != null) v.push(x); });   // the engine's own axis ends, so every sent tick sits on the plot
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
    var none = !DOM || !e || e.insufficient, mk = $("s-market"); svg.setAttribute("aria-disabled", none ? "true" : "false"); if (mk) mk.classList.toggle("noplot", !!none);   // no plot: nothing to drag, so the reserve handle and its legend are not offered; the engine's own line says why
    if (none) { svg.setAttribute("height", "0"); return; }
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
    // THE PRICE AXIS: the engine's own ticks for the window on screen (evidence.byWindow[months].axisTicks, each {value, label}), printed exactly as sent. No ticks sent (a thin window) means no axis; the page never makes a label of its own.
    var win = e && e.byWindow && e.byWindow[String(e.windowMonths)], ticks = (win && Array.isArray(win.axisTicks) ? win.axisTicks : []).slice().sort(function (a, b) { return a.value - b.value; });
    var drawn = [], lastx = -999; ticks.forEach(function (t) { var x = Math.max(PADX + 22, Math.min(W - PADX - 22, scaleOf(t.value))); if (x - lastx >= 62) { drawn.push({ t: t, x: x, px: scaleOf(t.value) }); lastx = x; } });
    if (ticks.length && drawn.length && drawn[drawn.length - 1].t !== ticks[ticks.length - 1]) { var lt = ticks[ticks.length - 1], lx = Math.max(PADX + 22, Math.min(W - PADX - 22, scaleOf(lt.value))); drawn.pop(); drawn.push({ t: lt, x: lx, px: scaleOf(lt.value) }); }
    var ax = sv("g", { id: "axis", "aria-hidden": "true" }); drawn.forEach(function (d) { ax.appendChild(sv("line", { class: "tick", "data-tick": d.t.value, x1: d.px, x2: d.px, y1: BASE + 10, y2: BASE + 16, stroke: mu })); ax.appendChild(sv("text", { class: "ticklabel", "data-ticklabel": d.t.value, x: d.x, y: BASE + 32, "text-anchor": "middle", "font-size": 11, fill: mu }, d.t.label)); }); svg.appendChild(ax);
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
    p.addEventListener("pointerdown", function (e) { if (!DOM || p.getAttribute("aria-disabled") === "true") return; dragging = true; p.setPointerCapture(e.pointerId); if (window.__v4reserve) window.__v4reserve(at(e), "drag"); });
    p.addEventListener("pointermove", function (e) { if (dragging && DOM && window.__v4reserve) window.__v4reserve(at(e), "drag"); });
    p.addEventListener("pointerup", function () { dragging = false; }); p.addEventListener("pointercancel", function () { dragging = false; });
    window.addEventListener("resize", plot);
  }

  // ---------- what the market paid ----------
  // THE PERIODS THE CASE OFFERS: desk.windows as the server sent it, [{ months, label }], and nothing else. The page carries no list of its own; a period the archive cannot honour is not sent and so is not drawn.
  function windows() { return (desk().windows || []).map(function (w) { return [Number(w.months), w.label || ""]; }).filter(function (x) { return x[0] > 0 && x[1]; }); }
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
    windows().forEach(function (w) { seg.appendChild(el("button", { type: "button", "data-m": w[0], class: e && Number(e.windowMonths) === Number(w[0]) ? "on" : "", text: w[1], onclick: function () { if (e && Number(e.windowMonths) === Number(w[0])) return; working(true, this); edit("window", { months: w[0] }).then(function (r) { working(false); all(); switched(r); }); } })); });
    var wl = clear($("winlines")); [e && e.sameLine, e && e.startLine].forEach(function (t) { if (t) wl.appendChild(el("span", { text: t })); }); wl.hidden = !wl.firstChild;   // the engine's own lines about the period, as sent
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
  // WHAT WE TOOK INTO ACCOUNT: the report's own list, editable like the next steps (the engine's items are the start; edits are stored on the case and the PDF prints the case's list)
  function considered() {
    var box = $("considered"); if (!box) return; clear(box);
    (K.considered || []).forEach(function (it) {
      var t = el("input", { "data-con-title": it.id, value: it.title || "", "aria-label": "Title", onblur: function () { save(); } }), x = el("input", { "data-con-text": it.id, value: it.text || "", "aria-label": "What we took into account", onblur: function () { save(); } });
      function save() { if (!x.value.trim()) return; if (t.value !== it.title || x.value !== it.text) { it.title = t.value; it.text = x.value; edit("considered_edit", { item: it.id, title: t.value, text: x.value }); } }
      box.appendChild(el("div", { class: "s", "data-conRow": it.id }, t, x, el("button", { class: "link", type: "button", text: "Remove", onclick: function () { edit("considered_remove", { item: it.id }).then(function () { considered(); }); } })));
    });
  }
  function addCon() {
    var box = $("considered"), t = el("input", { "aria-label": "New title", placeholder: "Title" }), x = el("input", { "aria-label": "New item", placeholder: "What we took into account" }), row = el("div", { class: "s" }, t, x, el("button", { class: "link", type: "button", text: "Cancel", onclick: function () { row.remove(); } }));
    var done = false; function commit() { if (done) return; if (!x.value.trim()) return; done = true; edit("considered_add", { title: t.value, text: x.value }).then(function () { considered(); }); }
    x.addEventListener("blur", commit); x.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
    box.appendChild(row); t.focus();
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
    list.forEach(function (l) { g.appendChild(lvCard({ url: l.url, photo: l.photo, title: l.title, venue: l.platform, bid: l.figureLine, left: l.left, status: l.left ? null : l.statusLine, vs: l.vsRangeLine })); });
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
    var any = desk().anyCondition, cb = $("condbox"), hint = $("condhint"); if (hint) hint.hidden = sug == null;   // the hint prints only when the engine marked a condition
    if (cb) cb.hidden = !any && !(desk().rungs || []).length;
    if (any) box.appendChild(el("button", { type: "button", "data-c": "0", "aria-pressed": sel == null ? "true" : "false", class: sel == null ? "on" : "", onclick: pickAny }, any.name || "All conditions", el("small", { text: any.countLine || "" })));
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
      open++; row.classList.add("need"); row.appendChild(el("span", { class: "nl", text: n.label }));
      // the statement field: the words typed are what the seller said (saved to the fact as the seller's, Lane D's seller_said, when the fact is empty) or why we proceed without (the waive's reason)
      var sf = SAID[n.id], held = sf ? ((K.fields || {})[sf] || {}).value : null, empty = !!sf && (held == null || held === "");
      var x = el("span", { class: "x" }), st = el("input", { class: "txt nstate", "data-statement": n.id, autocomplete: "off", placeholder: empty ? "What the seller said, or why you proceed" : "Why you proceed without it", "aria-label": "Statement for " + n.label }), bt = el("span", { class: "nb" }), nm = el("p", { class: "msg nmsg", "data-nmsg": n.id, role: "alert", hidden: true });
      var act = NEEDACT[n.id]; if (act) bt.appendChild(el("button", { type: "button", class: "btn sm", "data-act": act.act, text: act.label, onclick: function () { act.run(n, nm); } }));
      if (empty) bt.appendChild(el("button", { type: "button", class: "btn sm", "data-act": "state", text: "Seller states", onclick: function () { needSay(n, st, nm, "stated"); } }));
      bt.appendChild(el("button", { type: "button", class: "btn sm", "data-act": "waive", text: "Proceed without", onclick: function () { needSay(n, st, nm, "waived"); } }));
      x.appendChild(st); x.appendChild(bt); row.appendChild(x); row.appendChild(nm); box.appendChild(row);
    });
    var cnt = $("attN"); if (cnt) cnt.textContent = list.length || open ? (open ? open + " open" : "All clear") : "";
    badge("needs", open);
  }
  // THE RIGHT PANEL'S TABS: the figure, its lines and the check lines stay at the top and Preview and Finalize at the bottom; between them one tab at a time has the whole remaining height. A count badge sits on a tab that has open items (a count of the case's own items, never a made figure).
  var TABS = ["why", "needs", "rmode", "report"];
  function badge(k, n) { var b = document.querySelector('#vtabs [data-bdg="' + k + '"]'); if (!b) return; b.textContent = n ? String(n) : ""; b.hidden = !n; var t = $("tab-" + k); if (t) { var base = t.querySelector("span").textContent; t.setAttribute("aria-label", n ? base + ", " + n + " open" : base); } }
  function tabTo(k, focus) {
    TABS.forEach(function (x) { var on = x === k, t = $("tab-" + x), p = $("tp-" + x); if (!t || !p) return; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; p.hidden = !on; if (on && focus) t.focus(); });
  }
  window.__v4tab = tabTo;
  function bindTabs() {
    var bar = $("vtabs"); if (!bar) return;
    bar.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) tabTo(b.getAttribute("data-tab")); });
    var NEXT = { why: "needs", needs: "rmode", rmode: "report", report: "why" }, PREV = { why: "report", needs: "why", rmode: "needs", report: "rmode" };
    bar.addEventListener("keydown", function (e) { var k = (e.target.getAttribute && e.target.getAttribute("data-tab")) || ""; if (!NEXT[k]) return; var n = e.key === "ArrowRight" ? NEXT[k] : e.key === "ArrowLeft" ? PREV[k] : e.key === "Home" ? "why" : e.key === "End" ? "report" : null; if (n) { e.preventDefault(); tabTo(n, true); } });
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
  var SAID = { mileage_unconfirmed: "mileage", accident_unclear: "accident_history", service_documents: "service_history" };
  var NEEDACT = {
    mileage_unconfirmed: { act: "verify", label: "Verify from photo", run: function (n, nm) { edit("verify", { field: "mileage" }).then(function (r) { everything(r, nm); }); } },
    accident_unclear: { act: "verify", label: "Mark verified", run: function (n, nm) { edit("verify", { field: "accident_history" }).then(function (r) { everything(r, nm); }); } },
    service_documents: { act: "doc", label: "Received", run: function (n, nm) { var pk = document.createElement("input"); pk.type = "file"; pk.accept = DOCACCEPT; pk.onchange = function () { var f = pk.files[0]; if (!f) return; readFile(f).then(function (b64) { return edit("doc_add", { kind: "invoice", title: f.name.replace(/\.[^.]+$/, ""), name: f.name, data: b64 }); }).then(function (r) { everything(r, nm); }); }; pk.click(); } }
  };
  var DOCACCEPT = "application/pdf,image/jpeg,image/png";
  // ONE redraw after any edit: every section that reads the case (documents, attention, steps, what we took into account, footer, send) is drawn again from the case the server just sent, so no action leaves a section on the earlier case.
  function everything(r, nm) {
    if (r && r.ok === false) { if (nm) { nm.textContent = r.why || r.line || "That did not save."; nm.hidden = !nm.textContent; } return r; }
    all(); needs(); footer(D.readiness); sendPaint(); return r;
  }
  // the inline statement and its two buttons: the words typed in the field go to the server as the item's statement (Seller states) or as the reason to proceed without it; a refusal prints under the row
  function needSay(n, inp, nm, state) {
    var t = inp.value.trim(); if (state === "waived" && t.length < 8) t = ""; if (!t) { inp.placeholder = state === "waived" ? "Say why, in a few words" : "Write what the seller states"; inp.focus(); return; }
    edit(state === "waived" ? "need" : "seller_said", state === "waived" ? { item: n.id, state: "waived", reason: t } : { field: SAID[n.id], text: t }).then(function (r) { everything(r, nm); });
  }
  function footer(rd) {
    var R = rd || D.readiness || { ready: false, blockers: [] }, chk = clear($("chk")), fin = K.status === "finalized";
    var lines = (R.checks && R.checks.length ? R.checks : K.checks) || [];
    if (lines.length) lines.forEach(function (l) { chk.appendChild(el("div", { class: l.ok === false ? "no" : "", "data-key": l.key, text: l.line || "" })); });
    else (R.blockers || []).forEach(function (b) { chk.appendChild(el("div", { class: "no", "data-key": b.key, text: b.why })); });
    badge("report", lines.length ? lines.filter(function (l) { return l.ok === false; }).length : (R.blockers || []).length);   // the open items the check lines above name
    $("bFin").disabled = !R.ready || fin; $("finHint").textContent = fin ? "" : (R.hint || K.finalizeHint || "");
    var fb = $("finBox"); fb.classList.toggle("on", fin); fb.textContent = fin ? "Finalized as version " + K.version + ". Locked." : "";
  }
  // RESERVE OR NO RESERVE (Lane B's desk.reserveMode, Lane D's report.reserveMode): the engine's line, its two counts and (when thin) its thin line are printed as sent; the control sets the report's mode through case_edit report_reserve_mode with the why line.
  // When the engine says thin, the choice stays disabled until the why line is written. With no desk.reserveMode the row is not drawn.
  function rmode() {
    var rm = desk().reserveMode, box = $("rmode"); if (!box) return; var none0 = $("rmNone"); if (!rm) { box.hidden = true; if (none0) none0.hidden = false; return; } box.hidden = false;
    var none = $("rmNone"); if (none) none.hidden = true;
    var rl = $("rmLine"); rl.textContent = rm.thin && rm.thinLine ? rm.thinLine : (rm.line || ""); rl.classList.toggle("thin", rm.thin === true);   // printed ONCE, above the tiles: when the engine says thin its thin line is the line (it is also sent as .line), in the warning colour
    [["rmWith", rm.withReserve], ["rmNo", rm.noReserve]].forEach(function (p) { var c = $(p[0]), d = p[1] || {}; if (!c) return; c.querySelector("b").textContent = d.count == null ? "" : String(d.count); c.querySelector("em").textContent = d.medianLine || ""; });
    var cur = (K.report && K.report.reserveMode) || {}, on = cur.mode === "no_reserve", why = $("rmWhy"), cb = $("rmNoRes"); if (document.activeElement !== why) why.value = cur.why || "";
    cb.checked = on; cb.disabled = !on && rm.thin === true && !why.value.trim(); cb.setAttribute("aria-describedby", "rmLine");
    var st = $("rmSet"); st.textContent = on ? ((K.report && K.report.reserveModeLine) || "") : ""; st.hidden = !st.textContent;
  }
  function panel() {
    var r = K.reserve || {}, vi = $("valIn"), fig = curFig(), ck = r.check || null;
    if (vi && document.activeElement !== vi) vi.value = localFig == null && r.figureLine ? r.figureLine : (fig != null ? String(fig) : "");
    var d = $("diff"); d.textContent = localFig != null ? "" : [r.reachedLine, r.positionLine].filter(Boolean).join(" ");
    var sp = $("sellerPref"); if (sp) { sp.textContent = r.sellerPreferenceLine || ""; sp.hidden = !r.sellerPreferenceLine; }   // the seller's answer to "request a reserve", as the case words it
    rmode();
    var sa = $("sellerAsk"); if (sa) { sa.textContent = r.sellerAskLine || ""; sa.hidden = !r.sellerAskLine; }
    var hw = $("hiWarn"); hw.hidden = !(localFig == null && ck && ck.supported === false); $("sellerReq").checked = r.sellerRequested === true;
    $("mkt").textContent = K.marketLine || ""; $("mkt").hidden = !K.marketLine;
    var ol = $("ownLiveLine"); if (ol) { ol.textContent = r.liveLine || ""; ol.hidden = !r.liveLine; }   // when the car itself is live now: the engine's line about its bid against the figure, as sent (case.reserve.liveLine)
    var st = $("resStart"); clear(st); if (r.source === "analyst" && r.start && r.start.sentence) { st.appendChild(document.createTextNode(r.start.sentence + " ")); st.appendChild(el("button", { type: "button", class: "link", id: "resRestart", text: "Go back to it", onclick: function () { localFig = null; edit("reserve", { patch: { restart: true } }).then(function () { all(); }); } })); }
    if (r.start && r.start.note) st.appendChild(el("span", { class: "startnote", id: "startNote", text: r.start.note }));   // the note under the start, as sent: too few sales in the chosen condition to move it
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

  function all() { head(); lock(); own(); car(); docs(); market(); comps(false); steps(); considered(); live(); if (window.__v4panel) window.__v4panel(); }
  window.__v4 = { all: all, plot: plot, market: market, comps: comps, steps: steps, everything: everything, car: car, docs: docs, head: head, photos: photos, K: function () { return K; }, setK: function (k) { K = k; D.kase = k; }, el: el, sv: sv, $: $, clear: clear, edit: edit, note: note, say: say, figureAt: figureAt, scaleOf: scaleOf, D: D };
  var sa = $("addstep"); if (sa) sa.addEventListener("click", addStep);
  var sc = $("addcon"); if (sc) sc.addEventListener("click", addCon);
  var vi0 = $("valIn"); vi0.addEventListener("input", function () { window.__v4reserve(digits(this.value), "in"); }); vi0.addEventListener("blur", function () { if (localFig == null) panel(); });
  $("sellerReq").addEventListener("change", function () { edit("reserve", { patch: { sellerRequested: this.checked } }).then(function () { panel(); }); });
  $("why").addEventListener("input", function () { var t = this.value; defer("why", 600, function () { edit("reserve", { patch: { why: t } }).then(function () { footer(D.readiness); }); }); });
  $("cnote").addEventListener("input", function () { var t = this.value; defer("note", 600, function () { edit("reserve", { patch: { conditionNote: t } }); }); });
  $("rmNoRes").addEventListener("change", function () { var cb = this, why = $("rmWhy").value.trim(); edit("report_reserve_mode", { mode: cb.checked ? "no_reserve" : null, why: why }).then(function () { rmode(); footer(D.readiness); }); });
  $("rmWhy").addEventListener("input", function () { var rm = desk().reserveMode || {}, cb = $("rmNoRes"), t = this.value.trim(); cb.disabled = !cb.checked && rm.thin === true && !t; if (cb.checked) defer("rmwhy", 600, function () { edit("report_reserve_mode", { mode: "no_reserve", why: t }).then(function () { rmode(); }); }); });
  $("bFin").addEventListener("click", function () { say("Saving"); post({ action: "case_finalize", id: C.active }).then(function (r) { if (r && r.ok) { K = r.case; D.kase = K; D.readiness = { ready: true, blockers: [] }; say("Locked"); all(); } else { say("Not saved"); note((r && (r.why || r.line)) || "That did not finalize."); if (r && r.blockers) footer({ ready: false, blockers: r.blockers }); } }); });
  $("bPrev").addEventListener("click", function () { if (window.__v4preview) window.__v4preview(); });
  $("bSend").addEventListener("click", openSend); $("sendGo").addEventListener("click", doSend); $("sendNo").addEventListener("click", function () { if (!sending) closeSend(); });
  $("sendDlg").addEventListener("keydown", function (e) { if (e.key === "Escape" && !sending) { e.preventDefault(); closeSend(); } else if (e.key === "Tab") { var f = dlgFocusables(); if (!f.length) return; var i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } });
  bindPlot(); bindTabs(); all();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", plot);
}

// DESK V4 NEW CASE (Lane S): two steps on one panel. Step one is one field (a VIN, or the year, make and model) and Start. On a VIN the server's case_decode answers the decoded values; on typed words the resolver's answer (case_decode {text}, PLANNED, Lane D) is used when it is served and the words as typed are the card when it is not.
// Step two is the car card (title, spec line, where it came from, each value a quiet tag with a pencil) over the optional facts. case_new reads the car with the real engine and answers the whole case; the photos are added one at a time; then the page opens the case. Nothing is computed or seeded here.
export function deskV4New() {
  var C = window.__DESK_V3__; if (!C) return;
  var $ = function (i) { return document.getElementById(i); }, files = [], dec = {}, car = null, VINRE = /^[A-HJ-NPR-Z0-9]{17}$/i, NEARVIN = /^[A-Za-z0-9][A-Za-z0-9-]{10,}$/, CHASSIS = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{6,16}$/;   // what a VIN looks like, by shape alone: 11 or more letters, digits and hyphens with no spaces. Whether it IS a VIN (17 characters, the check digit) is the server's answer to case_decode, never the page's
  var TAGS = [["year", "Year"], ["make", "Make"], ["model", "Model"], ["trim", "Trim"]], SRCL = C.srcLabels || {};   // SRCL: the server's words for where a value came from (lib/preview/deskV3.js SRC_LABEL); a prefilled field prints the one its own source names
  function post(b) { return fetch(C.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); }
  function msg(id, t, bad) { var m = $(id); if (!m) return; m.textContent = t || ""; m.hidden = !t; m.className = bad ? "msg" : "msg say"; }
  function b64(f) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(f); }); }
  function step(n) { $("nc-s1").hidden = n !== 1; $("nc-s2").hidden = n !== 2; }
  function el(t, a, kids) { var e = document.createElement(t); Object.keys(a || {}).forEach(function (k) { if (k === "text") e.textContent = a[k]; else e.setAttribute(k, a[k]); }); (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  // ---- the car card ----
  function titleOf() { var f = car.f; return car.title || [f.year, f.make, f.model, f.trim].filter(Boolean).join(" ") || car.text || car.vin || ""; }
  function drawCar() {
    $("nc-title").textContent = titleOf(); $("nc-spec").textContent = car.vin || ""; $("nc-spec").hidden = !car.vin;
    var s = $("nc-src"), mixed = Object.keys(car.src || {}).some(function (k) { return car.src[k] !== "vin_decoded"; }); s.textContent = mixed ? "" : (car.source || ""); s.hidden = mixed || !car.source; s.className = car.bad ? "nc-src warn" : "nc-src"; var wl = $("nc-warn"); if (wl) { wl.textContent = car.warning || ""; wl.hidden = !car.warning; }   // one line for a plain decode; once any value comes from the car's last sale each value names its own source instead
    var box = $("nc-tags"); box.textContent = "";
    TAGS.forEach(function (p) {
      var k = p[0], v = car.f[k]; if ((v == null || v === "") && k === "trim") return;
      var sw = mixed && car.src[k] && v != null && v !== "" ? SRCL[car.src[k]] : null;
      var tag = el("span", { class: "ntag", "data-tag": k }, [el("i", { text: p[1] }), el("b", { text: v == null || v === "" ? "Add" : String(v), class: v == null || v === "" ? "empty" : "" }), sw ? el("em", { class: "tsrc", "data-src": car.src[k], text: sw }) : null]);
      var pen = el("button", { type: "button", class: "pen", "aria-label": "Edit " + p[1].toLowerCase(), text: "✎" });
      pen.addEventListener("click", function () {
        var b = tag.querySelector("b"), inp = el("input", { class: "tagin", "aria-label": p[1], value: v == null ? "" : String(v) }); if (k === "trim") inp.setAttribute("list", "dl-trim");
        tag.replaceChild(inp, b); pen.hidden = true; inp.focus(); inp.select();
        var done = false; function commit() { if (done) return; done = true; car.f[k] = inp.value.trim(); if (car.src) delete car.src[k]; car.title = null; drawCar(); }
        inp.addEventListener("blur", commit); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { done = true; drawCar(); } });
      });
      tag.appendChild(pen); box.appendChild(tag);
    });
  }
  function mark(id, on, src) { dec[id] = on; var m = $(id + "-dec"); if (m) { m.hidden = !on; if (on && src && src !== "vin_decoded" && SRCL[src]) { m.textContent = SRCL[src]; m.setAttribute("data-src", src); } } }
  ["nc-body", "nc-trans", "nc-colour"].forEach(function (id) { var e = $(id); if (e) e.addEventListener("input", function () { mark(id, false); }); });
  function fill(id, list) { var d = $(id); if (!d) return; d.textContent = ""; (list || []).forEach(function (x) { var o = document.createElement("option"); if (x && typeof x === "object") { o.value = String(x.value); if (x.label) o.label = String(x.label); } else o.value = String(x); d.appendChild(o); }); }
  function pickers() {
    var f = car.f, ask = car.vin ? { vin: car.vin } : (f.year && f.make && f.model ? { year: f.year, make: f.make, model: f.model } : null); if (!ask) return;
    post(Object.assign({ action: "case_pickers" }, ask)).then(function (r) { if (!r || r.ok === false) return; fill("dl-body", r.body); fill("dl-trim", r.trim); fill("dl-trans", r.transmission); fill("dl-colour", r.colour); }).catch(function () {});
  }
  function take(decoded) {
    var any = false; Object.keys(decoded || {}).forEach(function (k) { var d = decoded[k], val = d && d.value; if (val == null || val === "") return; any = true;
      if (k === "body" || k === "transmission" || k === "colour") { var e = $(k === "body" ? "nc-body" : k === "colour" ? "nc-colour" : "nc-trans"); if (e && !(e.value.trim() && !dec[e.id])) { e.value = String(val); mark(e.id, true, d.source); } }
      else if (k in car.f) { car.f[k] = String(val); car.src = car.src || {}; car.src[k] = d.source; } });
    return any;
  }
  // ---- step one ----
  function reset() { files.length = 0; drawFiles(); car = null; dec = {}; made = null; $("nc-start").value = ""; ["nc-body", "nc-trans", "nc-colour", "nc-mileage", "nc-asking", "nc-seller", "nc-notes"].forEach(function (i) { $(i).value = ""; mark(i, false); }); msg("nc-msg1", ""); msg("nc-msg", ""); var g = $("nc-go"); g.disabled = false; g.textContent = "Create case"; step(1); }
  var made = null;
  function start() {
    var v = ($("nc-start").value || "").trim(); if (!v) { msg("nc-msg1", "Type a VIN, or the year, make and model.", true); return; }
    var vin = v.toUpperCase().replace(/[\s-]/g, ""), isVin = VINRE.test(vin), looks = isVin || NEARVIN.test(v) || CHASSIS.test(v.replace(/-/g, "")), btn = $("nc-startbtn"); btn.disabled = true; msg("nc-msg1", "Reading the car");
    car = { vin: isVin ? vin : null, text: looks ? null : v, title: null, f: { year: "", make: "", model: "", trim: "" }, source: "", bad: false };
    // anything that looks like a VIN goes to the engine's case_decode, valid or not; a refusal is the engine's line IN PLACE OF the card, the field kept for correction, and Start only goes on with a VIN the engine decoded or with typed words
    (looks ? post({ action: "case_decode", vin: isVin ? vin : v.toUpperCase().replace(/-/g, "") }) : Promise.resolve(null)).then(function (r) {
      var good = r && r.ok && r.decoded && take(r.decoded); if (r && r.ok && r.warning) car.warning = String(r.warning);   // a VIN the engine reads but warns about (the check digit) goes on with its line on the card
      if (good) { car.title = r.title || null; car.source = r.chassis ? "Found from the number" : "Decoded from the VIN"; return true; }
      if (looks && r && r.ok && r.ask) { car.source = String(r.ask); car.bad = true; return true; }   // a chassis or short number no record holds: the engine asks for the year, make and model, and step two is where they are typed
      if (looks && r && r.ok !== true) { car = null; btn.disabled = false; msg("nc-msg1", r.why || r.line || "The VIN was not read.", true); $("nc-start").focus(); return false; }
      car.source = looks ? "The VIN was not decoded." : "As you typed it"; car.bad = looks; return true;
    }, function () { car.source = looks ? "The VIN was not decoded." : "As you typed it"; car.bad = looks; return true; }).then(function (go) { if (!go) return; btn.disabled = false; msg("nc-msg1", ""); drawCar(); pickers(); step(2); var t = $("nc-body"); if (t) t.focus(); });
  }
  $("nc-startbtn").addEventListener("click", start);
  $("nc-start").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); start(); } });
  $("nc-back").addEventListener("click", function () { step(1); $("nc-start").focus(); });
  // ---- photos: a drop zone, thumbnails, a Remove each ----
  var fkey = function (f) { return f.name + "|" + f.size + "|" + f.lastModified; };
  function drawFiles() {
    var box = $("nc-list"); if (!box) return; box.textContent = "";
    files.forEach(function (f) {
      var row = el("div", { class: "ncf", "data-file": fkey(f) }), th = el("div", { class: "th" }), ext = (f.name.split(".").pop() || "").toLowerCase();
      if (/^(jpe?g|png)$/.test(ext) && window.URL && URL.createObjectURL) th.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')"; else th.textContent = ext.toUpperCase();
      var x = el("button", { type: "button", class: "link", "aria-label": "Remove " + f.name, text: "Remove" });
      x.addEventListener("click", function () { files.splice(files.indexOf(f), 1); drawFiles(); });
      row.appendChild(th); row.appendChild(el("span", { text: f.name })); row.appendChild(x); box.appendChild(row);
    });
  }
  function addFiles(list) { [].slice.call(list || []).forEach(function (f) { if (!files.some(function (g) { return fkey(g) === fkey(f); })) files.push(f); }); drawFiles(); }
  var ph = $("nc-photos"); if (ph) ph.addEventListener("change", function () { addFiles(ph.files); ph.value = ""; });
  var dz = $("nc-drop"); if (dz) { ["dragenter", "dragover"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.add("over"); }); }); ["dragleave", "drop"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.remove("over"); if (n === "drop" && e.dataTransfer) addFiles(e.dataTransfer.files); }); }); }
  // ---- open and close ----
  function open(on) {
    var f = $("newcase"); if (!f) return; if (on) reset(); f.hidden = !on; document.body.toggleAttribute("data-new", on);   // while the panel is open the Reserve panel shows its label only (it belongs to no case yet)
    if (on) { f.scrollIntoView({ block: "start" }); $("nc-start").focus(); }
  }
  var b0 = $("newcase-btn"); if (b0) b0.addEventListener("click", function () { var q = $("queue"); if (q) q.classList.remove("open"); var sc = $("qscrim"); if (sc) sc.classList.remove("on"); open(true); });
  ["nc-x", "nc-x1"].forEach(function (i) { var x = $(i); if (x) x.addEventListener("click", function () { open(false); }); });
  // ---- Create case ----
  var go = $("nc-go"); if (!go) return;
  go.addEventListener("click", function () {
    if (made) { location.href = C.base + "/case/" + made; return; }
    var v = function (i) { return ($(i).value || "").trim(); }, f = car.f, req = { action: "case_new" };
    if (car.vin) req.vin = car.vin; if (f.year && f.make && f.model) { req.year = f.year; req.make = f.make; req.model = f.model; } else if (car.text) req.text = car.text;
    if (f.trim) req.trim = f.trim;
    if (!req.vin && !req.text && !req.model) { msg("nc-msg", "Add the year, make and model, or go back and type a VIN.", true); return; }
    [["mileage", v("nc-mileage")], ["transmission", v("nc-trans")], ["body", v("nc-body")], ["colour", v("nc-colour")], ["seller_name", v("nc-seller")], ["asking_price", v("nc-asking")], ["seller_notes", ($("nc-notes").value || "").trim()]].forEach(function (p) { if (p[1]) req[p[0]] = p[1]; });
    go.disabled = true; msg("nc-msg", "Reading the car"); var list = files.slice(), bad = null;
    post(req).then(function (r) {
      if (!r.ok) throw r; made = r.id; var chain = Promise.resolve();
      list.forEach(function (f, i) { chain = chain.then(function () { if (bad) return null; msg("nc-msg", "Adding photo " + (i + 1) + " of " + list.length); return b64(f).then(function (d) { return post({ action: "case_edit", id: made, op: "photo_add", name: f.name, data: d }); }).then(function (q) { if (!q.ok) bad = q; }); }); });
      return chain.then(function () { if (!bad || !made) return null; return post({ action: "case_discard", id: made }).then(function (q) { if (q && q.ok) made = null; }); });   // the photos are part of the case: a refused photo takes the case out again, so nothing is left half made
    }).then(function () { if (bad) { go.disabled = false; msg("nc-msg", "The case was not made: " + (bad.why || bad.line || "a photo could not be added") + (made ? ". It could not be taken out again, so open it and add the photos there." : ". Fix the photo or take it out and try again."), true); if (made) go.textContent = "Open the case"; return; } location.href = C.base + "/case/" + made; }).catch(function (e) { go.disabled = false; msg("nc-msg", (e && (e.why || e.line)) || "The case could not be created: the server sent no reason (check the photo size and try again).", true); });
  });
}

// DESK V4 QUEUE (Lane S): the filter row (All, Mine, Forwarded) and the search (title, seller, VIN) over the rows the server drew; each row's menu (Open, Archive or Restore, Delete with one inline question, never a browser dialog); the Archived group (collapsed); the keyboard (up and down move through the cases, Enter opens, N starts a new case).
// The operations are Lane D's case_archive, case_restore and case_delete ({action, id}). A refusal prints the server's own why under the row; a count is only ever the server's (a count the page was not sent is cleared, never recalculated).
export function deskV4Queue() {
  var C = window.__DESK_V3__, q = document.getElementById("queue"); if (!C || !q) return;
  var $ = function (i) { return document.getElementById(i); }, filt = "all", term = "";
  function post(b) { return fetch(C.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); }
  function rows() { return [].slice.call(q.querySelectorAll(".qi")); }
  function apply() {
    var shown = 0, narrowed = !!term || filt !== "all";
    rows().forEach(function (r) { var ok = (!term || r.getAttribute("data-search").indexOf(term) >= 0) && (filt === "all" || (filt === "mine" && r.getAttribute("data-mine") === "1") || (filt === "forwarded" && r.getAttribute("data-fwd") === "1")); r.hidden = !ok; if (ok) shown++; });
    [].forEach.call(q.querySelectorAll(".qgrp:not(.qarch)"), function (g) { g.hidden = narrowed && !g.querySelector(".qi:not([hidden])"); });
    var n = $("qnone"); if (n) n.hidden = shown > 0 || !narrowed;
  }
  $("qs").addEventListener("input", function () { term = this.value.toLowerCase().trim(); apply(); });
  [].forEach.call($("qf").querySelectorAll("[data-f]"), function (b) { b.addEventListener("click", function () { filt = b.getAttribute("data-f"); [].forEach.call($("qf").querySelectorAll("[data-f]"), function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false"); }); apply(); }); });
  var ah = $("qarchh"); if (ah) ah.addEventListener("click", function () { var on = $("qarchbox").hidden; $("qarchbox").hidden = !on; ah.setAttribute("aria-expanded", on ? "true" : "false"); });
  // ---- the row menu ----
  function closeMenus() { [].forEach.call(q.querySelectorAll(".qm,.qc"), function (m) { m.hidden = true; }); [].forEach.call(q.querySelectorAll(".qk"), function (k) { k.setAttribute("aria-expanded", "false"); }); }
  function say(row, t) { var e = row.querySelector(".qe"); e.textContent = t || ""; e.hidden = !t; }
  function stale() { [].forEach.call(q.querySelectorAll("[data-count]"), function (c) { c.hidden = true; }); }
  function counts(r) { if (r && r.queue && typeof r.queue === "object") [].forEach.call(q.querySelectorAll(".qgrp"), function (g) { var k = g.getAttribute("data-group") || (g.id === "qarch" ? "archived" : ""), c = g.querySelector("[data-count]"); if (c && r.queue[k] != null) { c.textContent = String(r.queue[k]); c.hidden = false; } }); }
  function put(row, archived) { row.setAttribute("data-archived", archived ? "1" : "0"); var box = archived ? $("qarchbox") : q.querySelector('.qgrp[data-group="' + (row.getAttribute("data-group") || "new") + '"]') || q.querySelector(".qgrp"); box.appendChild(row); $("qarch").hidden = !$("qarchbox").querySelector(".qi"); apply(); }
  function act(row, op) {
    var id = row.getAttribute("data-case"); say(row, ""); closeMenus();
    if (op === "open") { location.href = row.querySelector(".qa").getAttribute("href"); return; }
    if (op === "delete") { row.querySelector(".qc").hidden = false; row.querySelector('.qc [data-op="delete-yes"]').focus(); return; }
    if (op === "delete-no") return;
    var action = op === "archive" ? "case_archive" : op === "restore" ? "case_restore" : "case_delete"; row.classList.add("busy");
    post({ action: action, id: id }).then(function (r) {
      row.classList.remove("busy");
      if (!r || r.ok !== true) { say(row, (r && (r.why || r.line)) || "The server did not do that."); return; }
      stale(); counts(r);
      if (op === "archive") put(row, true); else if (op === "restore") put(row, false); else { var was = row.classList.contains("on"); row.remove(); $("qarch").hidden = !$("qarchbox").querySelector(".qi"); apply(); if (was) location.href = C.base; }
    }, function () { row.classList.remove("busy"); say(row, "That did not work. The connection dropped."); });
  }
  q.addEventListener("click", function (e) {
    var k = e.target.closest ? e.target.closest(".qk") : null, o = e.target.closest ? e.target.closest("[data-op]") : null;
    if (k) { var row = k.closest(".qi"), m = row.querySelector(".qm"), on = m.hidden; closeMenus(); m.hidden = !on; k.setAttribute("aria-expanded", on ? "true" : "false"); if (on) { var first = [].slice.call(m.querySelectorAll("button")).filter(function (b) { return b.offsetParent; })[0]; if (first) first.focus(); } e.stopPropagation(); return; }
    if (o) { var r = o.closest(".qi"), op = o.getAttribute("data-op"); if (op === "delete-yes") { act(r, "delete-final"); } else act(r, op); }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".qi")) closeMenus(); });
  // ---- the keyboard ----
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target, tag = t && t.tagName, typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable);
    if (e.key === "Escape") { closeMenus(); return; }
    if (typing || ($("sendScrim") && !$("sendScrim").hidden)) return;
    if (e.key === "n" || e.key === "N") { var b = $("newcase-btn"); if (b) { e.preventDefault(); b.click(); } return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (tag !== "BODY" && !(t.closest && t.closest("#queue"))) return;
    var list = [].slice.call(q.querySelectorAll(".qi .qa")).filter(function (a) { return a.offsetParent; }); if (!list.length) return;
    var i = list.indexOf(document.activeElement), to;
    if (i < 0) { var on = q.querySelector(".qi.on .qa"); to = on || list[0]; }   // the first press lands on the open case, the next ones move
    else to = e.key === "ArrowDown" ? (list.slice(i)[1] || list[i]) : (list.slice(0, i).pop() || list[i]);
    e.preventDefault(); to.focus();
  });
}
