// /sell page client and styles (Lane C, Oct 2026): the conversation (the /buy interview layout: the
// seller's words, Sam's reply large in serif, earlier turns smaller) and, under each answer, the rows the
// turn produced: place cards, "How cars like yours sold" tiles, the latest sales as /buy cards, and a
// matched PowerSeller. Classes reuse the /buy design system (BUY_CSS); SELL_CSS adds only Sell's parts.
export const SELL_CSS = `
.pgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:6px}
.place{border:1px solid var(--div);border-radius:6px;padding:16px 16px 14px;background:var(--page);display:flex;flex-direction:column;gap:6px;position:relative}
.place.pick{border-color:#1A1A1A}
.place .pchip{align-self:flex-start;background:var(--red);color:#fff;font:600 12px/1 var(--sans);letter-spacing:.06em;padding:6px 9px;border-radius:4px;margin-bottom:4px}
.place h3{margin:0;font:500 24px/1.2 var(--serif);color:var(--ink)}
.place .kind{font:500 12px/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec)}
.msg.sam .place p{margin:0;font:400 15px/1.5 var(--sans);color:var(--ink)}
.msg.sam .place p.mute{color:var(--sec);font-size:14px}
.place .big{font:400 20px/1.3 var(--serif)}
.place .act{margin-top:auto;padding-top:10px}
.place .act a{display:inline-flex;align-items:center;min-height:44px;color:var(--red);font:500 16px/1 var(--sans);text-decoration:none}
.place .act a:hover{text-decoration:underline;text-underline-offset:4px}
.sec2{margin-top:30px}
.msg.sam .sec2 h2{margin:0 0 12px;font:500 22px/1.25 var(--serif);color:var(--ink)}
.tgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.tile{border-top:1px solid var(--div);padding-top:12px}
.tile .tk{font:600 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec)}
.msg.sam .tile p{margin:8px 0 0;font:400 17px/1.45 var(--serif);color:var(--ink)}
.msg.sam .tile p.cap{font:400 13px/1.4 var(--sans);color:var(--sec);margin-top:6px}
.pscard{border:1px solid var(--div);border-radius:6px;padding:16px;margin-top:6px}
.msg.sam .pscard p{margin:4px 0 0;font:400 16px/1.5 var(--sans)}
.pscard h3{margin:0;font:500 22px/1.2 var(--serif)}
.pscard form{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pscard input{flex:1;min-width:200px;border:1px solid #D9D3C8;border-radius:6px;padding:10px 12px;font:400 16px var(--sans);background:#fff}
.pscard button,.pscard .go2{border:0;background:none;color:var(--red);font:500 16px var(--sans);cursor:pointer;min-height:44px;padding:0}
.recent .cgrid{grid-template-columns:repeat(3,minmax(0,1fr))}
#lead .sub{margin-top:8px}
@media (max-width:900px){.pgrid,.recent .cgrid{grid-template-columns:minmax(0,1fr)}.tgrid{grid-template-columns:minmax(0,1fr)}}
`;

export const SELL_CLIENT = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  var log = $("convo"), input = $("q"), scroller = $("scroll");
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  function usd(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function num(n){ return Math.round(Number(n)).toLocaleString("en-US"); }
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  function monthYear(d){ var p = String(d||"").split("-"); return p.length >= 2 && MON[+p[1]-1] ? MON[+p[1]-1] + " " + p[0] : ""; }
  function anon(){ try { var a = localStorage.getItem("gas_ob_anon"); if (a) return a; a = "ob-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10); localStorage.setItem("gas_ob_anon", a); return a; } catch(e){ return null; } }
  var conv = { chat: [], state: null, turns: 0 };
  function toBottom(){ try { scroller.scrollTop = scroller.scrollHeight; } catch(e){} }
  function toQuestion(){ try { var ys = log.querySelectorAll(".msg.you"), y = ys[ys.length - 1]; if (!y) return; scroller.scrollTop += y.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12; } catch(e){} }
  function sam(html, cls){ var d = document.createElement("div"); d.className = "msg sam" + (cls ? " " + cls : ""); d.innerHTML = html; log.appendChild(d); toBottom(); return d; }
  function you(text){ var d = document.createElement("div"); d.className = "msg you"; d.textContent = text; log.appendChild(d); toBottom(); }
  // ---------------- the rows a turn produced ----------------
  function placeCard(p, pick, car){
    var out = '<article class="place' + (pick ? " pick" : "") + '">' + (pick ? '<span class="pchip">Sam’s pick</span>' : "") +
      '<span class="kind">' + (p.house ? "Auction house" : "Online auction") + "</span><h3>" + esc(p.name) + "</h3>";
    out += '<p class="big">' + p.sales + " sale" + (p.sales === 1 ? "" : "s") + " of this spec in the window</p>";
    if (p.sold_through) out += "<p>" + p.sold_through.pct + "% of " + p.sold_through.offered + " offered sold</p>";
    if (p.most_sold_between) out += "<p>Most sold between " + usd(p.most_sold_between[0]) + " and " + usd(p.most_sold_between[1]) + "</p>";
    if (p.last_sale) out += '<p class="mute">Last sale: ' + (p.last_sale.url ? '<a href="' + esc(p.last_sale.url) + '" target="_blank" rel="noopener">' : "") + usd(p.last_sale.price) + ", " + esc(monthYear(p.last_sale.date)) + (p.last_sale.url ? "</a>" : "") + "</p>";
    if (p.next_sale) out += '<p class="mute">Next sale: ' + esc(p.next_sale.city || p.next_sale.event) + ", " + esc(p.next_sale.month + " " + p.next_sale.year) + ". " + esc(p.next_sale.consign) + ".</p>";
    out += '<p class="act"><a href="/out?p=' + encodeURIComponent(p.slug) + "&card=" + (pick ? "pick" : "alt") + "&src=sell" + '" target="_blank" rel="noopener">' + (p.house ? "Contact the house" : "Start your listing") + " →</a></p></article>";
    return out;
  }
  function tileHtml(t){
    var cap = t.cohort + ", last " + t.window_months + " months";
    if (t.kind === "reserve") return '<div class="tile"><span class="tk">Reserve</span><p>No reserve: ' + t.no_reserve.pct + "% sold, median " + usd(t.no_reserve.median) + " (" + t.no_reserve.n + " offered). With reserve: " + t.with_reserve.pct + "% sold, median " + usd(t.with_reserve.median) + " (" + t.with_reserve.n + ' offered).</p><p class="cap">' + esc(cap) + "</p></div>";
    if (t.kind === "day") return '<div class="tile"><span class="tk">Day ending</span><p>Weekend endings: ' + t.weekend.pct + "% sold (" + t.weekend.n + " offered). Weekday endings: " + t.weekday.pct + "% sold (" + t.weekday.n + ' offered).</p><p class="cap">' + esc(cap) + "</p></div>";
    if (t.kind === "season") return '<div class="tile"><span class="tk">Season</span><p>Most sold in ' + esc(t.months.slice(0, -1).join(", ") + " and " + t.months[t.months.length - 1]) + ": " + t.share_pct + "% of " + t.n + ' sales.</p><p class="cap">' + esc(cap) + "</p></div>";
    return "";
  }
  function recentCard(r){
    var panel = '<span class="noph"><span>' + esc(String(r.title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "").split(" ").slice(0, 3).join(" ")) + "</span></span>";
    var img = r.photo ? '<img src="' + esc(r.photo) + '" alt="' + esc(r.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=this.getAttribute(\'data-panel\')" data-panel="' + esc(panel) + '">' : panel;
    var title = String(r.title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "").replace(/\s+\d-Speed.*$/i, "");
    var meta = ["Sold " + usd(r.price), r.miles ? num(r.miles) + " miles" : ""].filter(Boolean).join(" · ");
    return '<article class="car"><a class="ph" href="' + esc(r.url || "#") + '" target="_blank" rel="noopener">' + img + '<span class="chips"><span class="chip">' + esc(r.house + " · " + monthYear(r.date)) + "</span></span></a>" +
      '<div class="tx"><h3><a href="' + esc(r.url || "#") + '" target="_blank" rel="noopener">' + esc(title) + '</a></h3><p class="meta">' + esc(meta) + "</p></div></article>";
  }
  function psCard(ps, page){
    var n = ps.on_this_make ? ps.on_this_make.sales + " recorded sales of this make" + (ps.on_this_make.median ? ", median " + usd(ps.on_this_make.median) + " across " + ps.on_this_make.median_n : "") + "." : "";
    return '<section class="sec2"><h2>Have it handled</h2><div class="pscard" data-ps="' + esc(ps.slug) + '"><h3>' + esc(ps.name) + "</h3>" + (ps.specialty ? "<p>" + esc(ps.specialty) + "</p>" : "") + (n ? '<p class="mute">' + esc(n) + "</p>" : "") +
      '<form data-psform><label style="position:absolute;left:-9999px" for="psemail">Email</label><input id="psemail" type="email" required placeholder="Your email" autocomplete="email"><button type="submit">Get in touch →</button></form><p class="mute psmsg"></p></div></section>';
  }
  function pageHtml(pg){
    if (!pg) return "";
    var h = "";
    if ((pg.places || []).length) h += '<section class="sec2"><h2>Where ' + esc(pg.cohort) + " sell</h2><div class=\"pgrid\">" + pg.places.map(function(p, i){ return placeCard(p, p.slug === pg.pick, pg.car); }).join("") + "</div></section>";
    var tiles = (pg.tiles || []).map(tileHtml).filter(Boolean);
    if (tiles.length) h += '<section class="sec2"><h2>How cars like yours sold</h2><div class="tgrid">' + tiles.join("") + "</div></section>";
    if ((pg.recent || []).length) h += '<section class="sec2 recent"><h2>The latest sales</h2><div class="cgrid">' + pg.recent.map(recentCard).join("") + "</div></section>";
    if (pg.powerseller) h += psCard(pg.powerseller, pg);
    return h;
  }
  // ---------------- the conversation ----------------
  function chatAsk(){
    Array.prototype.forEach.call(log.querySelectorAll(".msg.chatreply:not(.past)"), function(el){ el.classList.add("past"); var g = el.querySelector(".turnrows"); if (g && !g.hidden) { g.hidden = true; g.insertAdjacentHTML("beforebegin", '<p class="shownline"><a href="#" data-expand>' + esc(g.getAttribute("data-shown") || "Earlier results") + "</a></p>"); } });
    Array.prototype.forEach.call(log.querySelectorAll(".msg.you"), function(el, i, all){ if (i < all.length - 1) el.classList.add("past"); });
    var msgEl = sam('<p class="reply"><span class="dots" aria-label="Sam is looking"><i></i><i></i><i></i></span></p>', "results chatreply");
    var p = msgEl.querySelector(".reply"), finished = false;
    var finish = function(d){
      if (finished) return; finished = true;
      var reply = (d && d.reply) || "Sam couldn't finish that one. Try asking again in a moment.";
      p.textContent = reply;
      if ((reply.match(/[.!?](?=\s+[A-Z0-9"]|\s*$)/g) || []).length >= 3) p.classList.add("s3");
      conv.chat.push({ role: "assistant", content: reply });
      if (d && d.state) conv.state = d.state; conv.turns = (d && d.turns) || (conv.turns + 1);
      var rows = d && d.page ? pageHtml(d.page) : "";
      if (rows) { msgEl.insertAdjacentHTML("beforeend", '<div class="turnrows" data-shown="' + esc("Places for the " + (d.page.car || "car")) + '">' + rows + "</div>"); CUR = d.page; }
      msgEl.setAttribute("data-done", "1"); toQuestion();
    };
    fetch("/api/sellChat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", messages: conv.chat, state: conv.state, turns: conv.turns, anonId: anon() }) })
      .then(function(r){
        if (!r.ok) throw new Error("http " + r.status);
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
        var pump = function(){ return reader.read().then(function(x){
          if (x.done) { if (!finished) finish(null); return; }
          buf += dec.decode(x.value, { stream: true });
          var i; while ((i = buf.indexOf("\n\n")) >= 0) {
            var ev = buf.slice(0, i); buf = buf.slice(i + 2);
            var name = (/^event: (.+)$/m.exec(ev) || [])[1], data = (/^data: (.*)$/m.exec(ev) || [])[1];
            var val = null; try { val = data ? JSON.parse(data) : null; } catch(e){}
            if (name === "text") { p.textContent = val || ""; }
            else if (name === "done") finish(val);
            else if (name === "fallback") finish({ reply: "Sam can't reach the sales just now. Try again in a minute." });
          }
          return pump();
        }); };
        return pump();
      })
      .catch(function(){ finish({ reply: "Sam can't reach the sales just now. Try again in a minute." }); });
  }
  var CUR = null;
  function send(text){
    text = String(text || "").trim(); if (!text) return;
    var lead = $("lead"); if (lead) lead.remove();
    you(text); input.value = "";
    conv.chat.push({ role: "user", content: text });
    chatAsk();
  }
  // ---------------- events ----------------
  input.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); send(input.value); } });
  if ($("go")) $("go").addEventListener("click", function(){ send(input.value); });
  document.addEventListener("click", function(e){
    var ex = e.target.closest("[data-expand]");
    if (ex) { e.preventDefault(); var g = ex.parentNode.nextElementSibling; if (g) g.hidden = !g.hidden; return; }
  });
  document.addEventListener("submit", function(e){
    var f = e.target.closest("[data-psform]"); if (!f) return;
    e.preventDefault();
    var box = f.closest(".pscard"), msg = box.querySelector(".psmsg"), email = f.querySelector("input").value.trim();
    if (!email) return;
    msg.textContent = "Sending...";
    var said = (CUR && CUR.said) || {};
    fetch("/api/submitSellerLead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: { email: email }, car: { raw: (CUR && CUR.car) || "", vin: said.vin || "", state: said.state || "", mileage: said.miles ? String(said.miles) : "" }, choice: { destination: box.querySelector("h3").textContent, destinationType: "powerseller", powerSeller: { slug: box.getAttribute("data-ps") } }, decision: { surface: "sell-chat" } }) })
      .then(function(r){ return r.json(); }).then(function(j){ msg.textContent = j && (j.reference || j.ok || j.status === "submitted") ? "Sent. " + box.querySelector("h3").textContent + " will be in touch." : (j && j.status === "partner_unavailable" ? "That specialist isn't taking new cars right now." : "That didn't send. Try again in a minute."); })
      .catch(function(){ msg.textContent = "That didn't send. Try again in a minute."; });
  });
  // A car named in the URL (e.g. "Where to sell it" from a VIN page) starts the conversation.
  var m = /[?&]car=([^&]*)/.exec(location.search || "");
  if (m) { try { send(decodeURIComponent(m[1].replace(/\+/g, " "))); } catch(e){} }
  input.focus();
  // Voice in (the same as /buy).
  (function(){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $("mic");
    if (!SR || !mic) { if (mic) mic.hidden = true; return; }
    var rec = null, on = false;
    mic.addEventListener("click", function(){
      if (on && rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
      var base = input.value ? input.value + " " : "";
      rec.onresult = function(e){ var t = ""; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; input.value = base + t; };
      rec.onend = function(){ on = false; mic.classList.remove("on"); input.focus(); };
      rec.onerror = function(){ on = false; mic.classList.remove("on"); };
      on = true; mic.classList.add("on"); rec.start();
    });
  })();
})();`;
