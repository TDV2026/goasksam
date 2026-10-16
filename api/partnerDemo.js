// PARTNER DEMO PAGE (Lane C, Oct 15 2026; closed, crew-only, noindex, linked from nowhere public): four views of
// "What these sell for, powered by GoAskSam" inside a partner's own listing layout. The page is a NEUTRAL MIRROR of
// that layout (its structure, type scale, button shape and colour pattern) applied to our own elements: no partner
// name, logo, copy or photos, placeholder photos only. Every number on it comes from api/partnerAnswer.js, which is
// Market Check's own answer for the same words; the page computes nothing but where a figure sits against a range.
//   a. Before listing: one box (any car or VIN), the engine's identity chips and question, the range panel only when
//      the engine gives a range, the VIN's history, a List it button that does nothing in the demo.
//   b. Setting a reserve: a reserve field with a pill (inside the range green, above amber, no range grey).
//   c. On the listing: the dummy listing with "What these sell for" and "This car before" in the right rail and a
//      pill for the current price against the range; on a phone they stack under the price and buy buttons.
//   d. Under the listing: a full-width "What cars like this sold for" (sale tiles, lowest price first), then "This car
//      before"; on a phone after the description.
// Route: /api/partnerDemo (?view=a|b|c|d). A /partner-demo rewrite needs one vercel.json line (not this lane's file).
import { isCrewRequest } from "../lib/_crew.js";

export const DUMMY = { title: "2015 Porsche 911 GT3", colour: "Black", miles: 20611, titleStatus: "Clean", price: 139900, priceKind: "Buy It Now", daysLeft: 13, vin: "WP0AC2A96FS189139", q: "2015 Porsche 911 GT3" };

const CSS = `
:root{--ink:#191919;--ink2:#707070;--rule:#e5e5e5;--soft:#f7f7f7;--blue:#3665f3;--blue2:#2b52c5;--green:#0b7a34;--greenbg:#e6f4ea;--amber:#8a5a00;--amberbg:#fdf3dc;--grey:#5c5c5c;--greybg:#efefef;--r:16px;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
.demo-bar{background:#111;color:#fff;font-size:13px}
.demo-bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-block:8px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tabs a{color:#fff;text-decoration:none;border:1px solid #555;border-radius:999px;padding:4px 12px}
.tabs a[aria-current=page]{background:#fff;color:#111;border-color:#fff}
.top{border-bottom:1px solid var(--rule)}
.top .wrap{display:flex;gap:20px;align-items:center;padding-block:16px}
.logo{width:110px;height:40px;border-radius:8px;background:repeating-linear-gradient(45deg,#ececec,#ececec 6px,#f6f6f6 6px,#f6f6f6 12px);color:#999;font-size:11px;display:grid;place-items:center;flex:none}
.sbtn{flex:none;min-width:150px}
.sbox{flex:1;display:flex;border:2px solid var(--ink);border-radius:999px;height:48px;align-items:center;padding:0 18px;color:#767676;min-width:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border-radius:999px;font-family:inherit;font-weight:600;font-size:17px;line-height:1;cursor:pointer;border:1px solid var(--blue);text-decoration:none}
.btn.pri{background:var(--blue);color:#fff}
.btn.sec{background:#fff;color:var(--blue)}
.btn.blk{width:100%}
.btn[disabled]{opacity:1;cursor:default}
h1{font-size:28px;line-height:1.2;margin:0 0 6px;font-weight:700}
h2{font-size:24px;line-height:1.25;margin:0 0 14px;font-weight:700}
h3{font-size:18px;line-height:1.3;margin:0 0 10px;font-weight:700}
.sub{color:var(--ink2);margin:0}
.muted{color:var(--ink2)}
.panel{background:var(--soft);border-radius:var(--r);padding:20px}
.panel+.panel{margin-top:16px}
.gas-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--rule);font-size:13px;color:var(--ink2)}
.gas-foot b{color:var(--ink);font-weight:600}
.gas-foot a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.range{font-size:26px;font-weight:700;margin:2px 0 4px}
.facts{display:flex;gap:0;flex-wrap:wrap;margin:10px 0 0}
.facts div{padding:0 16px;border-left:1px solid var(--rule)}
.facts div:first-child{padding-left:0;border-left:0}
.facts dt{font-size:13px;color:var(--ink2)}
.facts dd{margin:2px 0 0;font-size:16px}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:14px;font-weight:600}
.pill.in{background:var(--greenbg);color:var(--green)}
.pill.above{background:var(--amberbg);color:var(--amber)}
.pill.below{background:var(--greybg);color:var(--grey)}
.pill.none{background:var(--greybg);color:var(--grey)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
.chip{border:1px solid var(--ink2);border-radius:999px;padding:6px 14px;font-size:14px;background:#fff}
.chip.opt{cursor:pointer;border-color:var(--blue);color:var(--blue);font-family:inherit}
.hist{list-style:none;margin:0;padding:0}
.hist li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--rule)}
.hist li:first-child{border-top:0;padding-top:0}
.hist li>span:first-child{flex:none;white-space:nowrap}
.hist .r{text-align:right}
.loading{color:var(--ink2);font-size:14px}
.sec-view{padding-block:28px 48px}
.sec-view[hidden]{display:none}
.lead{max-width:760px}
.ask{display:flex;gap:10px;margin:18px 0 0;flex-wrap:wrap}
.ask input{flex:1;min-width:0;height:48px;border:1px solid var(--ink2);border-radius:999px;padding:0 18px;font:inherit}
.reserve{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0}
.reserve label{font-weight:600}
.money{display:flex;align-items:center;border:1px solid var(--ink2);border-radius:12px;height:48px;padding:0 14px;background:#fff}
.money input{border:0;font:inherit;width:140px;outline:none}
/* the listing (views c and d) */
.listing{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:40px;align-items:start}
.gal{display:grid;grid-template-columns:88px 1fr;gap:12px}
.thumbs{display:grid;gap:10px;align-content:start}
.ph{border-radius:12px;background:linear-gradient(135deg,#d9d9d9,#bfbfbf);display:grid;place-items:center;color:#7a7a7a;font-size:13px;aspect-ratio:4/3}
.thumbs .ph{aspect-ratio:1/1;font-size:10px}
.main-ph{aspect-ratio:4/3;font-size:15px}
.rail h1{font-size:28px}
.rail hr{border:0;border-top:1px solid var(--rule);margin:16px 0}
.price{font-size:28px;font-weight:700}
.price small{font-size:15px;font-weight:400;color:var(--ink2)}
.specs{display:flex;flex-wrap:wrap}
.specs div{padding:0 18px;border-left:1px solid var(--rule)}
.specs div:first-child{padding-left:0;border-left:0}
.specs dt{font-size:14px;color:var(--ink2)}.specs dd{margin:2px 0 0}
.buy{display:grid;gap:10px;margin:16px 0}
.time{display:flex;gap:24px;font-size:15px}
.below{margin-top:40px}
.desc h2{margin-bottom:8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.tile .ph{aspect-ratio:4/3;margin-bottom:12px;border-radius:16px;background:var(--soft);border:12px solid var(--soft);background-image:linear-gradient(135deg,#d9d9d9,#bfbfbf);background-clip:content-box}
.tile .p{font-size:18px;font-weight:700}
.tile .d{color:var(--ink2);font-size:14px}
.full{margin-top:36px}
.phone-only{display:none}
@media (max-width:760px){
  .wrap{padding-left:16px;padding-right:16px}
  .listing{grid-template-columns:1fr;gap:0}
  .gal{grid-template-columns:1fr}
  .thumbs{display:none}
  .main-ph{border-radius:0;margin:0 -16px}
  .rail{padding-top:16px}
  .facts div,.specs div{padding:0 12px}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .sbox{height:44px}
  .top .wrap{gap:12px}
  .logo{width:72px}
  .sbtn{display:none}
  h1,.rail h1{font-size:24px}
}
`;

// The client: asks the endpoint, draws each view from its answer. Every figure on screen is the endpoint's.
const JS = String.raw`
(function(){
  var D = __DUMMY__;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var usd = function(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); };
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var monthYear = function(d){ var p = String(d || "").split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1] + " " + p[0] : ""; };
  var plural = function(n, one, many){ return n === 1 ? one : many; };
  function ask(body){
    return fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function(r){ return r.json(); }).catch(function(){ return { ok: false, error: "unavailable" }; });
  }
  var FOOT = '<div class="gas-foot"><span><b>Powered by GoAskSam</b></span><a href="/how-sam-decides" target="_blank" rel="noopener">How Sam decides</a></div>';
  // Where a figure sits against the engine's range. The only thing this page works out, and only from that range.
  function placing(x, a){
    if (!a || !a.range) return { cls: "none", text: "No range for cars like this yet" };
    if (x < a.range.low) return { cls: "below", text: "Below the range cars like this sold for" };
    if (x > a.range.high) return { cls: "above", text: "Above the range cars like this sold for" };
    return { cls: "in", text: "Inside the range cars like this sold for" };
  }
  function idChips(a){
    var id = a && a.identity; if (!id) return "";
    var parts = [id.year, id.make, id.generation && id.model ? id.model + " (" + id.generation + ")" : (id.model || id.generation), id.body, id.variant].filter(Boolean);
    return '<div class="chips" aria-label="The car">' + parts.map(function(p){ return '<span class="chip">' + esc(p) + "</span>"; }).join("") + "</div>";
  }
  function questionHtml(a, slot){
    var q = a && a.question; if (!q) return "";
    var opts = (q.options || []).map(function(o, i){ return '<button type="button" class="chip opt" data-slot="' + slot + '" data-send="' + esc(JSON.stringify(o.send)) + '">' + esc(o.label) + (o.count != null ? " (" + o.count + ")" : "") + "</button>"; }).join("");
    var skip = q.skip ? '<button type="button" class="chip opt" data-slot="' + slot + '" data-send="' + esc(JSON.stringify(q.skip.send)) + '">' + esc(q.skip.label) + "</button>" : "";
    return '<p style="margin:14px 0 0;font-weight:600">' + esc(q.text || "Which one is it?") + '</p><div class="chips">' + opts + skip + "</div>";
  }
  function rangePanel(a, opts){
    opts = opts || {};
    if (!a || a.ok === false) return '<div class="panel"><h3>What these sell for</h3><p class="muted">Sam could not read the sales just now. Try again in a minute.</p>' + FOOT + "</div>";
    if (a.question) return '<div class="panel"><h3>What these sell for</h3>' + idChips(a) + questionHtml(a, opts.slot || "") + FOOT + "</div>";
    var body = a.range
      ? '<p class="range">' + usd(a.range.low) + " to " + usd(a.range.high) + '</p><p class="sub">The middle half of ' + a.count + " " + plural(a.count, "sale", "sales") + (a.window ? " " + esc(a.window) : "") + ".</p>"
      : '<p class="sub">' + esc(a.thin || "No range for cars like this yet.") + "</p>";
    var pill = opts.price != null ? '<p style="margin:12px 0 0"><span class="pill ' + placing(opts.price, a).cls + '">' + esc(placing(opts.price, a).text) + "</span></p>" : "";
    var trend = a.range && a.trend ? '<p class="sub" style="margin-top:10px">' + a.trend.map(function(t){ return esc(t.period.replace("-", " ")) + ": " + usd(t.low) + " to " + usd(t.high) + " (" + t.count + " sales)"; }).join(" · ") + "</p>" : "";
    var aside = a.setAside && a.setAside.total ? '<p class="sub" style="margin-top:8px;font-size:14px">' + a.setAside.total + " more set aside" + (a.setAside.reasons ? " (" + Object.keys(a.setAside.reasons).map(function(k){ return a.setAside.reasons[k] + " " + esc(k); }).join(", ") + ")" : "") + ".</p>" : "";
    return '<div class="panel"><h3>What these sell for</h3>' + (opts.chips ? idChips(a) : "") + body + pill + trend + aside + FOOT + "</div>";
  }
  function historyPanel(a){
    var h = a && a.history;
    var rows = h && h.length ? '<ul class="hist">' + h.map(function(r){
      var right = r.result === "sold" ? (r.price ? "Sold for " + usd(r.price) : "Sold") : (r.highBid ? "Offered, not sold. High bid " + usd(r.highBid) : "Offered, not sold");
      return "<li><span>" + esc(monthYear(r.date)) + (r.miles ? '<br><span class="muted" style="font-size:14px">' + Number(r.miles).toLocaleString("en-US") + " miles</span>" : "") + '</span><span class="r">' + esc(right) + "</span></li>"; }).join("") + "</ul>"
      : '<p class="muted">No earlier sale or listing of this car on record.</p>';
    return '<div class="panel"><h3>This car before</h3>' + rows + FOOT + "</div>";
  }
  function tiles(a){
    if (!a || a.question || !a.sales || !a.sales.length) return '<p class="muted">' + esc((a && a.thin) || "No recorded sales of cars like this yet.") + "</p>";
    return '<div class="tiles">' + a.sales.map(function(s){ return '<div class="tile"><div class="ph" aria-hidden="true">Photo</div><div class="p">' + usd(s.price) + '</div><div class="d">Sold ' + esc(monthYear(s.date)) + "</div></div>"; }).join("") + "</div>";
  }
  // ---- view a: before listing
  var aLast = null;
  function drawA(a){
    aLast = a;
    $("a-out").innerHTML = (a.question ? rangePanel(a, { slot: "a", chips: true }) : (idChips(a) ? '<div style="margin:0 0 16px">' + idChips(a) + "</div>" : "") + (a.range || a.thin ? rangePanel(a) : "")) + (a.vin || (a.history && a.history.length) ? historyPanel(a) : "") +
      '<div style="margin-top:20px"><button type="button" class="btn pri" id="a-list">List it</button></div>';
  }
  function runA(body){ $("a-out").innerHTML = '<p class="loading">Sam is reading the sales.</p>'; ask(body).then(drawA); }
  // ---- view b: setting a reserve
  var bAns = null;
  function drawB(){
    var v = Number(String($("b-res").value || "").replace(/[^\d]/g, ""));
    var a = bAns; if (!a) return;
    if (a.question) { $("b-out").innerHTML = rangePanel(a, { slot: "b" }); return; }
    var p = v > 0 ? placing(v, a) : null;
    $("b-pill").innerHTML = p ? '<span class="pill ' + p.cls + '">' + esc(p.text) + "</span>" : (a.range ? "" : '<span class="pill none">No range for cars like this yet</span>');
    $("b-out").innerHTML = rangePanel(a);
  }
  // ---- views c and d: the listing
  var cAns = null;
  function drawListing(a){
    cAns = a;
    $("c-rail").innerHTML = rangePanel(a, { price: D.price, slot: "c" }) + historyPanel(a);
    $("d-sales").innerHTML = '<h2>What cars like this sold for</h2>' + (a && a.range ? '<p class="sub" style="margin:-6px 0 16px">' + a.count + " " + plural(a.count, "sale", "sales") + (a.window ? " " + esc(a.window) : "") + ", lowest price first.</p>" : "") + tiles(a) + FOOT;
    $("d-hist").innerHTML = historyPanel(a);
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-send]"); if (!b) return;
    var send = JSON.parse(b.getAttribute("data-send")), slot = b.getAttribute("data-slot");
    if (slot === "a") return runA(send);
    if (slot === "b") { $("b-out").innerHTML = '<p class="loading">Sam is reading the sales.</p>'; return ask(send).then(function(a){ bAns = a; drawB(); }); }
    if (slot === "c") return ask(Object.assign({ vin: D.vin }, send)).then(drawListing);
  });
  document.addEventListener("click", function(e){ if (e.target && e.target.id === "a-list") e.preventDefault(); });   // the demo's List it does nothing
  $("a-form").addEventListener("submit", function(e){ e.preventDefault(); var v = String($("a-q").value || "").trim(); if (v) runA({ q: v }); });
  $("b-res").addEventListener("input", function(){ var d = String(this.value || "").replace(/[^\d]/g, "").slice(0, 9); this.value = d ? Number(d).toLocaleString("en-US") : ""; drawB(); });
  ask({ q: D.q }).then(function(a){ bAns = a; drawB(); });
  ask({ q: D.q, vin: D.vin }).then(drawListing);
  var pre = new URLSearchParams(location.search).get("q"); if (pre) { $("a-q").value = pre; runA({ q: pre }); }
})();
`;

function phs(n) { let s = ""; for (let i = 0; i < n; i++) s += '<div class="ph" aria-hidden="true">Photo</div>'; return s; }

export function pageHtml(view) {
  const v = /^[abcd]$/.test(view || "") ? view : "a";
  const tab = (k, label) => `<a href="?view=${k}"${k === v ? ' aria-current="page"' : ""}>${label}</a>`;
  const d = DUMMY, miles = d.miles.toLocaleString("en-US");
  const listing = (withRail) => `
  <div class="listing">
    <div>
      <div class="gal"><div class="thumbs">${phs(5)}</div><div class="ph main-ph" aria-hidden="true">Placeholder photo</div></div>
      <div class="phone-only"></div>
    </div>
    <div class="rail">
      <h1>${d.title}</h1>
      <p class="sub">${d.colour}, ${miles} miles, ${d.titleStatus.toLowerCase()} title</p>
      <hr>
      <div class="price">US ${"$" + d.price.toLocaleString("en-US")}</div>
      <dl class="specs" style="margin:14px 0 0"><div><dt>Condition</dt><dd>Used</dd></div><div><dt>Title</dt><dd>${d.titleStatus}</dd></div><div><dt>Mileage</dt><dd>${miles}</dd></div></dl>
      <hr>
      <div class="time"><span>Time left:</span><b>${d.daysLeft}d</b></div>
      <div class="buy"><button type="button" class="btn pri blk">${d.priceKind}</button><button type="button" class="btn sec blk">Make offer</button><button type="button" class="btn sec blk">Save</button></div>
      ${withRail ? '<div id="c-rail"><p class="loading">Sam is reading the sales.</p></div>' : ""}
    </div>
  </div>`;
  const desc = `<div class="desc below"><h2>About this car</h2><dl class="specs"><div><dt>Year</dt><dd>2015</dd></div><div><dt>VIN</dt><dd>${d.vin}</dd></div><div><dt>Mileage</dt><dd>${miles}</dd></div></dl><p class="muted" style="margin-top:14px">Placeholder description. The seller's own words sit here.</p></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Partner demo</title><style>${CSS}</style></head><body>
<div class="demo-bar"><div class="wrap"><span>Closed demo. What these sell for, powered by GoAskSam.</span><nav class="tabs" aria-label="Views">${tab("a", "a. Before listing")}${tab("b", "b. Setting a reserve")}${tab("c", "c. On the listing")}${tab("d", "d. Under the listing")}</nav></div></div>
<header class="top"><div class="wrap"><div class="logo">Partner logo</div><div class="sbox">Search</div><button type="button" class="btn sec sbtn">Search</button></div></header>
<main>
<section class="sec-view wrap" id="view-a"${v === "a" ? "" : " hidden"}>
  <div class="lead"><h1>What these sell for</h1><p class="sub">Type any car or paste a VIN.</p>
  <form class="ask" id="a-form"><input id="a-q" name="q" autocomplete="off" placeholder="Year, make and model, or a VIN" aria-label="Car or VIN"><button class="btn pri" type="submit">Check</button></form>
  <div id="a-out" style="margin-top:22px"></div></div>
</section>
<section class="sec-view wrap" id="view-b"${v === "b" ? "" : " hidden"}>
  <div class="lead"><h1>Set your reserve</h1><p class="sub">${d.title}, ${miles} miles</p>
  <div class="reserve"><label for="b-res">Reserve</label><span class="money">$<input id="b-res" inputmode="numeric" placeholder="0" aria-label="Reserve in dollars"></span><span id="b-pill"></span></div>
  <div id="b-out"><p class="loading">Sam is reading the sales.</p></div></div>
</section>
<section class="sec-view wrap" id="view-c"${v === "c" ? "" : " hidden"}>${listing(true)}</section>
<section class="sec-view wrap" id="view-d"${v === "d" ? "" : " hidden"}>${listing(false)}${desc}
  <div class="full" id="d-sales"><p class="loading">Sam is reading the sales.</p></div>
  <div class="full" id="d-hist"></div>
</section>
</main>
<script>${JS.replace("__DUMMY__", JSON.stringify(DUMMY))}</script></body></html>`;
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!isCrewRequest(req)) { res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.status(404).send("Not found"); }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageHtml(String((req.query && req.query.view) || "a")));
}
