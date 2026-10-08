// The one-direction Sell page client (Lane C, Oct 2026; behind SELL_NEXT_ON). Four questions at most:
// the car, only what is missing, the state, and how to sell it. Then one direction, the latest sales,
// and How Sam decides. Everything shown comes from /api/sellChat {action:"flow"} (lib/sell/sellFlow.js).
export const FLOW_CSS = `
.sflow{max-width:760px;margin:0 auto;padding:8px 0 40px}
.sflow .hero{text-align:center;margin:8vh 0 28px}
.sflow .hero .script{font:400 22px/1.2 var(--serif);color:#2F6B47;font-style:italic;margin:0 0 10px}
.sflow .hero h1{margin:0;font:600 40px/1.15 var(--serif);letter-spacing:-.01em;color:var(--ink)}
.sflow .updated{margin:14px 0 0;font:400 12px/1.4 var(--sans);color:#8C877C;text-align:center}
.sflow .turn{margin:22px 0 0}
.sflow .q{font:400 22px/1.4 var(--serif);color:var(--ink);margin:0 0 10px}
.sflow .you{font:400 17px/1.4 var(--sans);color:#3A3733;margin:14px 0 0}
.sflow .chips{display:flex;gap:8px;flex-wrap:wrap}
.sflow .chips button{border:1px solid #D9D3C8;background:#fff;border-radius:999px;min-height:40px;padding:0 14px;font:500 15px var(--sans);color:var(--ink);cursor:pointer}
.sflow .chips button:hover{border-color:var(--ink)}
.sflow .box{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #D9D3C8;border-radius:10px;padding:4px 6px 4px 16px;margin-top:12px}
.sflow .box input{flex:1;min-width:0;border:0;outline:0;font:400 17px/1.4 var(--sans);background:transparent;padding:12px 0}
.sflow .box button{border:0;background:var(--ink);color:#fff;border-radius:8px;min-height:40px;padding:0 16px;font:500 15px var(--sans);cursor:pointer}
.sflow .box button[disabled]{opacity:.6}
.sflow .rec{margin-top:26px;border-top:1px solid var(--div);padding-top:22px}
.sflow .rec .sum{font:500 13px/1.4 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sec);margin:0 0 12px}
.sflow .rec h2{margin:0 0 12px;font:500 34px/1.2 var(--serif);color:var(--ink)}
.sflow .rec .why{margin:0 0 14px;font:400 19px/1.5 var(--serif);color:#3A3733}
.sflow .rec .note{margin:0 0 14px;font:400 15px/1.5 var(--sans);color:var(--sec)}
.sflow .rec a.link{font:500 16px var(--sans);color:var(--ink);text-decoration:underline;text-underline-offset:4px}
.sflow .psform{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;max-width:520px}
.sflow .psform input{flex:1;min-width:200px;border:1px solid #D9D3C8;border-radius:8px;padding:12px 14px;font:400 16px var(--sans)}
.sflow .psform button{border:0;background:var(--ink);color:#fff;border-radius:8px;min-height:46px;padding:0 18px;font:600 15px var(--sans);cursor:pointer}
.sflow .psmsg{font:400 15px var(--sans);color:var(--sec);margin:8px 0 0}
.sflow .recent{margin-top:34px}
.sflow .recent h3{margin:0 0 14px;font:500 22px/1.3 var(--serif)}
.sflow .rgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.sflow .rcard{border:1px solid var(--div);border-radius:8px;overflow:hidden;background:#fff}
.sflow .rcard .ph{display:block;aspect-ratio:3/2;background:#EFEBE4;overflow:hidden}
.sflow .rcard .ph img{width:100%;height:100%;object-fit:cover;display:block}
.sflow .rcard .tx{padding:10px 12px 12px}
.sflow .rcard h4{margin:0 0 4px;font:500 16px/1.3 var(--serif)}
.sflow .rcard h4 a{color:var(--ink);text-decoration:none}
.sflow .rcard p{margin:0;font:400 14px/1.45 var(--sans);color:var(--sec)}
.sflow .rcard p b{color:var(--ink);font-weight:600}
.sflow .follow{margin-top:30px;border-top:1px solid var(--div);padding-top:18px}
.sflow .follow .q{font-size:19px}
.sflow .follow .why{font:400 18px/1.5 var(--serif);color:#3A3733;margin:10px 0 0}
.sflow .foot{margin-top:28px;font:400 14px var(--sans);display:flex;gap:18px;flex-wrap:wrap}
.sflow .foot a{color:var(--sec);text-decoration:underline;text-underline-offset:3px}
@media (max-width:760px){.sflow .hero h1{font-size:30px}.sflow .rgrid{grid-template-columns:1fr}.sflow .rec h2{font-size:28px}}`;

export const FLOW_CLIENT = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  var root = $("sflow");
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  var S = { stage: "car", car: "", picks: [], label: null, state: null, how: null, busy: false };
  var STATES = ["California","Florida","Texas","New York","New Jersey","Arizona"];
  var HOW = [["self","I'll sell it myself"],["handled","I'd like someone to handle it"],["house","Through an auction house"],["unsure","I'm not sure yet"]];
  var turns = $("turns");
  // While the page is switched off, a reviewer opens it with ?key=...; the same key goes on its API calls.
  var KEYQ = (function(){ var k = new URLSearchParams(location.search).get("key"); return k ? "?key=" + encodeURIComponent(k) : ""; })();
  function api(body){ return fetch("/api/sellChat" + KEYQ, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: "flow" }, body)) }).then(function(r){ return r.json(); }); }
  function you(t){ turns.insertAdjacentHTML("beforeend", '<p class="you">' + esc(t) + "</p>"); }
  function ask(q, chips, placeholder){
    var h = '<div class="turn"><p class="q">' + esc(q) + "</p>";
    if (chips && chips.length) h += '<div class="chips">' + chips.map(function(c){ var k = Array.isArray(c) ? c : [c, c]; return '<button type="button" data-chip="' + esc(k[0]) + '">' + esc(k[1]) + "</button>"; }).join("") + "</div>";
    if (placeholder != null) h += '<div class="box"><input id="ans" autocomplete="off" placeholder="' + esc(placeholder) + '"><button type="button" id="send">Send</button></div>';
    h += "</div>";
    var old = turns.querySelectorAll(".chips button, #ans, #send"); old.forEach(function(e){ e.disabled = true; if (e.id) e.removeAttribute("id"); });
    turns.insertAdjacentHTML("beforeend", h);
    var a = $("ans"); if (a) a.focus();
    turns.lastElementChild.scrollIntoView({ block: "nearest" });
  }
  function busy(on){ S.busy = on; var b = $("send"); if (b) { b.disabled = on; b.textContent = on ? "Sam is reading..." : "Send"; } }
  function carStep(){
    busy(true);
    api({ step: "car", car: S.car, picks: S.picks }).then(function(j){
      busy(false);
      if (j.ask) { S.stage = "narrow"; ask(j.ask.question, j.ask.chips, j.ask.chips && j.ask.chips.length ? null : ""); return; }
      if (j.car) { S.label = j.car.label; S.stage = "state"; ask("Which state is it in?", STATES.concat(["Somewhere else"]), null); return; }
      ask("Sam couldn't read that. Which car is it? The make and model is enough, or paste the VIN.", null, "");
      S.stage = "car";
    }).catch(function(){ busy(false); ask("Sam couldn't read that just now. Try again in a moment.", null, ""); S.stage = "car"; });
  }
  function answer(t, key){
    if (S.busy || !t) return;
    you(t);
    if (S.stage === "car") { S.car = t; S.picks = []; carStep(); return; }
    if (S.stage === "narrow") { S.picks.push(t); carStep(); return; }
    if (S.stage === "state") {
      if (/somewhere else/i.test(t)) { S.stage = "stateText"; ask("Where is it?", null, "The state, or the country"); return; }
      S.state = t; S.stage = "how"; ask("How would you like to sell it?", HOW, null); return;
    }
    if (S.stage === "stateText") { S.state = t; S.stage = "how"; ask("How would you like to sell it?", HOW, null); return; }
    if (S.stage === "how") { S.how = key || "unsure"; S.stage = "result"; result(); }
  }
  function result(){
    turns.insertAdjacentHTML("beforeend", '<p class="q" id="wait">Sam is reading the sales...</p>');
    api({ step: "result", car: S.label || S.car, state: S.state, how: S.how }).then(function(j){
      var w = $("wait"); if (w) w.remove();
      if (!j || !j.rec) { ask("Sam couldn't read that just now. Try again in a moment.", null, null); return; }
      var r = j.rec, h = '<section class="rec">';
      h += '<p class="sum">' + esc([j.label, j.state].filter(Boolean).join(" · ")) + "</p>";
      h += "<h2>" + esc(r.headline) + "</h2>";
      if (r.why) h += '<p class="why">' + esc(r.why) + "</p>";
      if (r.kind === "powerseller") {
        if (r.note) h += '<p class="note">' + esc(r.note) + "</p>";
        h += '<form class="psform" data-ps="' + esc(r.slug) + '" data-name="' + esc(r.name) + '"><label for="psemail" style="position:absolute;left:-9999px">Your email</label><input id="psemail" type="email" required placeholder="Your email" autocomplete="email"><button type="submit">Get in touch with ' + esc(r.name) + "</button></form><p class=\"psmsg\"></p>";
      } else if (r.link) {
        h += '<p><a class="link" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.name) + "'s own page explains how to sell there</a></p>";
      }
      h += "</section>";
      var rc = j.recent || [];
      if (rc.length) h += '<section class="recent"><h3>The latest sales</h3><div class="rgrid">' + rc.map(function(c){
        var when = c.date ? new Date(c.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
        var img = c.photo ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "";
        return '<article class="rcard"><a class="ph" href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + img + '</a><div class="tx"><h4><a href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + esc(c.title) + "</a></h4><p>" + esc([c.house, when].filter(Boolean).join(" · ")) + "</p><p><b>Sold $" + Number(c.price).toLocaleString("en-US") + "</b></p></div></article>";
      }).join("") + "</div></section>";
      // A follow-up question in the seller's own words (Claude on the shared chat core and guard).
      h += '<section class="follow"><p class="q">Ask Sam about this</p><div id="fturns"></div><div class="box"><label for="fq" style="position:absolute;left:-9999px">Ask Sam a question about this</label><input id="fq" autocomplete="off" placeholder="For example: why not Cars and Bids?"><button type="button" id="fsend">Ask</button></div></section>';
      h += '<p class="foot"><a href="/how-sam-decides">How Sam decides</a><a href="#" data-restart>Start again with another car</a></p>';
      turns.insertAdjacentHTML("beforeend", h);
      turns.querySelector(".rec").scrollIntoView({ block: "start" });
    }).catch(function(){ var w = $("wait"); if (w) w.remove(); ask("Sam couldn't read that just now. Try again in a moment.", null, null); });
  }
  var FH = [];
  function followAsk(q){
    var b = $("fsend"), box = $("fturns"); if (!q || (b && b.disabled)) return;
    box.insertAdjacentHTML("beforeend", '<p class="you">' + esc(q) + "</p>"); $("fq").value = "";
    if (b) { b.disabled = true; b.textContent = "Sam is reading..."; }
    api({ step: "ask", car: S.label || S.car, state: S.state, how: S.how, question: q, history: FH }).then(function(j){
      var t = (j && j.reply) || "Sam couldn't answer that just now."; FH.push({ role: "buyer", text: q }, { role: "sam", text: t });
      box.insertAdjacentHTML("beforeend", '<p class="why">' + esc(t) + "</p>");
    }).catch(function(){ box.insertAdjacentHTML("beforeend", '<p class="why">Sam couldn’t answer that just now. Try again in a moment.</p>'); })
      .then(function(){ if (b) { b.disabled = false; b.textContent = "Ask"; } });
  }
  document.addEventListener("click", function(e){
    if (e.target.id === "fsend") { var fq = $("fq"); if (fq) followAsk(fq.value.trim()); return; }
    var c = e.target.closest("[data-chip]"); if (c && !c.disabled) { e.preventDefault(); answer(c.textContent.trim(), c.getAttribute("data-chip")); return; }
    if (e.target.id === "send") { var a = $("ans"); if (a && a.value.trim()) answer(a.value.trim()); return; }
    if (e.target.id === "go") { var q = $("carq"); if (q && q.value.trim()) { $("hero").hidden = true; answer(q.value.trim()); } return; }
    if (e.target.hasAttribute && e.target.hasAttribute("data-restart")) { e.preventDefault(); location.reload(); }
  });
  document.addEventListener("keydown", function(e){
    if (e.key !== "Enter" || !e.target) return;
    if (e.target.id === "ans" && e.target.value.trim()) { e.preventDefault(); answer(e.target.value.trim()); }
    if (e.target.id === "fq" && e.target.value.trim()) { e.preventDefault(); followAsk(e.target.value.trim()); }
    if (e.target.id === "carq" && e.target.value.trim()) { e.preventDefault(); $("hero").hidden = true; answer(e.target.value.trim()); }
  });
  document.addEventListener("submit", function(e){
    var f = e.target.closest(".psform"); if (!f) return; e.preventDefault();
    var email = f.querySelector("input").value.trim(), msg = f.nextElementSibling, name = f.getAttribute("data-name");
    var btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Sending...";
    fetch("/api/submitSellerLead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: { email: email }, car: { raw: S.label || S.car, state: S.state || "" }, choice: { destination: name, destinationType: "powerseller", powerSeller: { slug: f.getAttribute("data-ps") } }, decision: { surface: "sell-flow" } }) })
      .then(function(r){ return r.json(); }).then(function(j){ msg.textContent = j && (j.reference || j.ok || j.status === "submitted") ? "Sent. " + name + " will be in touch." : (j && j.status === "partner_unavailable" ? name + " isn't taking new cars right now." : "That didn't send. Try again in a minute."); btn.textContent = "Sent"; })
      .catch(function(){ msg.textContent = "That didn't send. Try again in a minute."; btn.disabled = false; btn.textContent = "Get in touch with " + name; });
  });
})();`;
