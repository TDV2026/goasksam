// /buy (Lane C, Oct 2026): the live-auction finder. Server-rendered shell + a small inline client
// that calls /api/buySearch. One Box tokens, fonts and rail. ZERO OldCarsData (the feed is the cron's).
// Copy rule: the product name of the archive answer is never shown on this page.
import { PAGE_CSS, FONT_LINKS, railHtml } from "./_chrome.js";

const BUY_CSS = `
.search{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:8px 8px 8px 20px}
.search input{flex:1;min-width:0;border:0;outline:0;font:400 19px/1.4 var(--sans);color:var(--ink);background:transparent}
.search input::placeholder{color:var(--sec)}
.search .go{width:48px;height:48px;flex:none;border:0;border-radius:10px;background:var(--green);color:#fff;font-size:22px;cursor:pointer}
.looking{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:15px;color:var(--sec)}
.looking b{color:var(--ink);font-weight:500}
.linkbtn{background:none;border:0;padding:0;color:var(--green);font:600 15px/1.4 var(--sans);text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:44px;display:inline-flex;align-items:center}
.status{font-size:15px;color:var(--sec)}
.list{display:flex;flex-direction:column;gap:20px}
.bcard{display:grid;grid-template-columns:320px minmax(0,1fr);background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.bph{display:flex;flex-direction:column}
.bph a{display:block;flex:1;min-height:220px;background:var(--ph)}
.bph img{width:100%;height:100%;object-fit:cover;display:block}
.bph .credit{font-size:14px;color:var(--sec);padding:6px 12px 8px}
.bbody{padding:18px 22px 20px;display:flex;flex-direction:column;gap:8px;min-width:0}
.brow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--sec)}
.hpill{display:inline-block;padding:5px 10px;border-radius:999px;background:var(--green);color:#fff;font:600 12px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase}
.btitle{margin:0;font:500 18px/1.35 var(--sans)}
.bbid{font-size:15px;color:var(--sec)}
.bbid .amt{font:600 32px/1.1 var(--serif);color:var(--ink);font-variant-numeric:lining-nums tabular-nums;margin-left:6px}
.bmeta{font-size:15px;color:var(--sec)}
.mkt{background:var(--take);border-radius:12px;padding:12px 16px;font:400 17px/1.45 var(--serif);color:var(--soft)}
.seen{border:1.5px solid var(--green);border-radius:12px;padding:10px 14px;font-size:15px}
.seen a{font-weight:600}
.bact{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:4px}
.wform{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.wform input{min-height:44px;min-width:220px;border:1px solid var(--border);border-radius:10px;padding:0 14px;font:400 16px var(--sans)}
.wmsg{font-size:15px;color:var(--sec);margin:0}
.qscreen{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:26px 28px 28px;display:flex;gap:18px}
.qscreen .roundel{width:40px;height:40px;font-size:11px}
.qbody{display:flex;flex-direction:column;gap:16px;min-width:0}
.qtext{margin:0;font:400 28px/1.3 var(--serif)}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{min-height:48px;padding:0 24px;border-radius:999px;border:1.5px solid var(--green);background:var(--card);color:var(--green);font:600 17px var(--sans);cursor:pointer}
.chip:hover{background:var(--green);color:#fff}
.qsub{font-size:15px;color:var(--sec)}
.empty{padding:24px 26px;display:flex;flex-direction:column;gap:12px}
.empty h2{font:500 24px/1.3 var(--serif)}
.loader{font-size:15px;color:var(--sec)}
@media (max-width:640px){
  .search{border-radius:12px;padding:6px 6px 6px 14px}.search input{font-size:17px}.search .go{width:44px;height:44px}
  .bcard{grid-template-columns:1fr}
  .bph a{min-height:200px;height:200px;flex:none}
  .bbody{padding:16px}
  .bbid .amt{font-size:28px}
  .qscreen{padding:20px 18px}.qtext{font-size:23px}
  .wform input{min-width:0;flex:1}
}`;

const CLIENT = `
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var out = $("out"), input = $("q"), asked = 0, lastQ = "";
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];}); }
  function usd(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
  function anon(){ try { var a = localStorage.getItem("gas_ob_anon"); if (a) return a; a = "ob-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10); localStorage.setItem("gas_ob_anon", a); return a; } catch(e){ return null; } }
  var M = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  function monthYear(d){ var p = String(d||"").split("-"); return p.length>=2 && M[+p[1]-1] ? M[+p[1]-1] + " " + p[0] : ""; }
  function ends(iso){
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d)) return "";
    var diff = d.getTime() - Date.now();
    if (diff < 0) return "Ending now";
    var tz = "America/Los_Angeles";
    var time = d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:tz}).replace(" AM","am").replace(" PM","pm");
    var dayKey = function(x){ return x.toLocaleDateString("en-US",{timeZone:tz}); };
    if (dayKey(d) === dayKey(new Date())) return "Ends today " + time + " PT";
    if (diff < 6.5*864e5) return "Ends " + d.toLocaleDateString("en-US",{weekday:"long",timeZone:tz}) + " " + time + " PT";
    return "Ends " + d.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:tz});
  }
  function lookingLine(r){
    var f = r.filters || {}, bits = [r.label];
    if (f.gearbox) bits.push(f.gearbox === "manual" ? "manual" : String(f.gearboxLabel || "automatic").replace(/^Auto$/i,"automatic"));
    if (f.priceCap) bits.push("under " + usd(f.priceCap));
    if (f.mileageCap) bits.push("under " + Math.round(f.mileageCap).toLocaleString("en-US") + " miles");
    (f.excludeColours || []).forEach(function(c){ bits.push("not " + c); });
    return '<div class="looking"><span>Looking for: <b>' + esc(bits.join(", ")) + '</b></span><button type="button" class="linkbtn" data-change>Change</button></div>';
  }
  function marketLine(m){
    if (!m) return "";
    if (m.kind === "range") return '<div class="mkt">Cars like it sold for ' + usd(m.low) + " to " + usd(m.high) + (m.count ? " across " + m.count + " sales" : "") + ".</div>";
    if (m.count < 8) return '<div class="mkt">Only ' + m.count + " like it " + (m.count === 1 ? "has" : "have") + " sold in " + esc(m.window) + ".</div>";
    return '<div class="mkt">' + m.count + " like it have sold in " + esc(m.window) + ", too spread out to call a range.</div>";
  }
  function seenLine(s){
    if (!s) return "";
    var t = s.result === "sold"
      ? "This exact car sold for " + usd(s.priceUsd) + " in " + monthYear(s.date) + (s.miles ? " with " + s.miles.toLocaleString("en-US") + " miles" : "")
      : "This exact car was bid to " + usd(s.priceUsd) + " in " + monthYear(s.date) + " and didn\\u2019t sell";
    return '<div class="seen"><a href="' + esc(s.historyUrl) + '">' + esc(t) + "</a></div>";
  }
  function watchBlock(key, label){
    return '<button type="button" class="linkbtn" data-watch="' + esc(key) + '">' + esc(label) + '</button><form class="wform" hidden><label class="sr" style="position:absolute;left:-9999px">Email</label><input type="email" required placeholder="Your email" autocomplete="email"><button class="btn p" type="submit">Save</button><p class="wmsg"></p></form>';
  }
  function card(l){
    var img = l.photo_url ? '<img src="' + esc(l.photo_url) + '" alt="' + esc(l.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "";
    var bid = l.current_bid_usd ? '<div class="bbid">Current bid <span class="amt">' + usd(l.current_bid_usd) + "</span></div>" : (l.current_bid ? '<div class="bbid">Current bid <span class="amt">' + esc(Math.round(l.current_bid).toLocaleString("en-US") + " " + l.currency) + "</span></div>" : '<div class="bbid">No bids yet</div>');
    var meta = [l.mileage ? l.mileage.toLocaleString("en-US") + " miles" : "", l.location || ""].filter(Boolean).join(" \\u00b7 ");
    var key = l.vin_norm || ("live:" + l.sourceSlug + ":" + (l.url || "").replace(/^https?:\\/\\//,"").slice(0,90));
    return '<article class="bcard"><div class="bph"><a href="' + esc(l.url) + '" target="_blank" rel="noopener" aria-label="Open the listing on ' + esc(l.source) + '">' + img + '</a><span class="credit">Photo: ' + esc(l.source) + '</span></div>' +
      '<div class="bbody"><div class="brow"><span class="hpill">' + esc(l.source) + "</span><span>" + esc(ends(l.end_time)) + "</span></div>" +
      '<h3 class="btitle">' + esc(l.title) + "</h3>" + bid + (meta ? '<div class="bmeta">' + esc(meta) + "</div>" : "") +
      marketLine(l.market) + seenLine(l.seen_before) +
      '<div class="bact"><a class="btn p" href="' + esc(l.url) + '" target="_blank" rel="noopener">View on ' + esc(l.source) + "</a>" + watchBlock(key, "Watch this car") + "</div></div></article>";
  }
  function render(d){
    if (d.status === "question") {
      var chips = (d.chips || []).map(function(c){ return '<button type="button" class="chip" data-q="' + esc(c.query || (lastQ + " " + c.append)) + '">' + esc(c.label) + "</button>"; }).join("");
      var last = Number(d.askIndex) >= 2;
      out.innerHTML = '<section class="qscreen"><span class="roundel" aria-hidden="true">SAM</span><div class="qbody"><span class="eyebrow">' + (last ? "One last question" : "One question first") + '</span><p class="qtext">' + esc(d.prompt) + '</p><div class="chips">' + chips + '</div><span class="qsub">' + (last ? "Then what\\u2019s live." : "One more at most, then what\\u2019s live.") + "</span></div></section>";
      asked = Number(d.askIndex) || asked + 1; return;
    }
    if (d.status === "unresolved") { out.innerHTML = '<section class="qscreen"><span class="roundel" aria-hidden="true">SAM</span><div class="qbody"><span class="eyebrow">One question first</span><p class="qtext">' + esc(d.prompt) + '</p><span class="qsub">Type it in the box above, like 2019 Ferrari 812 Superfast.</span></div></section>'; input.focus(); return; }
    if (d.status !== "ok") { out.innerHTML = '<section class="card empty"><p class="answer" style="margin:0">Sam\\u2019s catching his breath, try again in a minute.</p></section>'; return; }
    var head = lookingLine(d.resolved);
    if (!d.listings.length) {
      out.innerHTML = head + '<section class="card empty"><h2>Nothing like that is live right now.</h2>' + marketLine(d.market) + '<div class="bact">' + watchBlock(d.familyKey, "Tell me when one is") + "</div></section>";
      return;
    }
    out.innerHTML = head + '<p class="status">' + (d.total > d.listings.length ? d.listings.length + " closest of " + d.total + " live now" : d.listings.length + " live now") + ', ending soonest first among the closest matches.</p><div class="list">' + d.listings.map(card).join("") + "</div>";
  }
  function search(q, keepAsk){
    q = String(q || "").trim(); if (!q) return;
    if (!keepAsk) asked = 0;
    lastQ = q; input.value = q;
    try { history.replaceState(null, "", "/buy?q=" + encodeURIComponent(q)); } catch(e){}
    out.innerHTML = '<p class="loader">Checking what\\u2019s live\\u2026</p>';
    fetch("/api/buySearch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q:q,asked:asked,anonId:anon()})})
      .then(function(r){ return r.json(); }).then(render)
      .catch(function(){ out.innerHTML = '<section class="card empty"><p class="answer" style="margin:0">Sam\\u2019s catching his breath, try again in a minute.</p></section>'; });
  }
  $("go").addEventListener("click", function(){ search(input.value); });
  input.addEventListener("keydown", function(e){ if (e.key === "Enter") { e.preventDefault(); search(input.value); } });
  out.addEventListener("click", function(e){
    var t = e.target.closest("[data-q],[data-change],[data-watch]"); if (!t) return;
    if (t.hasAttribute("data-q")) return search(t.getAttribute("data-q"), true);
    if (t.hasAttribute("data-change")) { input.value = ""; input.focus(); out.innerHTML = ""; return; }
    if (t.hasAttribute("data-watch")) {
      var f = t.nextElementSibling; if (!f) return; f.hidden = !f.hidden;
      if (!f.hidden) { var inp = f.querySelector("input"); inp.focus(); f.onsubmit = function(ev){ ev.preventDefault(); var m = f.querySelector(".wmsg"); m.textContent = "Saving\\u2026";
        fetch("/api/buySearch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"watch",key:t.getAttribute("data-watch"),email:inp.value.trim()})})
          .then(function(r){return r.json();}).then(function(j){ m.textContent = j && j.ok ? "Done. I\\u2019ll email you if one comes up." : "I couldn\\u2019t save that just now. Try again in a minute."; })
          .catch(function(){ m.textContent = "I couldn\\u2019t save that just now. Try again in a minute."; }); }; }
    }
  });
  var m = /[?&]q=([^&]*)/.exec(location.search || "");
  if (m) { try { search(decodeURIComponent(m[1].replace(/\\+/g, " "))); } catch(e){} }
})();`;

export default function handler(req, res) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Buy | GoAskSam</title><meta name="description" content="Live collector car auctions, with what cars like each one actually sold for.">
<meta name="robots" content="noindex, follow"><link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#1E4D38">
${FONT_LINKS}<style>${PAGE_CSS}${BUY_CSS}</style></head><body>
${railHtml("buy")}
<main><div class="col">
<div class="search" role="search"><label for="q" style="position:absolute;left:-9999px">What are you looking for?</label><input id="q" autocomplete="off" placeholder="What are you looking for? Try: manual 997 Carrera S under $70k"><button type="button" class="go" id="go" aria-label="Search">&#8594;</button></div>
<div id="out" aria-live="polite"></div>
<p class="foot">Bidding happens on the auction site. Sam tells you what cars like it actually sold for.</p>
</div></main>
<script>${CLIENT}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, follow");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
}
