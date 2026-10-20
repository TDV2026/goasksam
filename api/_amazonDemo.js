// THE AMAZON AUTOS PARTNER DEMO (Sam's spec, locked Oct 19 2026, new build Oct 20 2026; Lane C). The same gated demo
// shell as the eBay demo (api/partnerDemo.js): the black demo bar with three tabs, the car box, a partner header with the
// partner's own logo and "Prepared for Amazon", "Sample listing" on every listing frame. Presentation only: every figure,
// line, range and sale comes from the one engine through the existing partner answer path (api/partnerAnswer.js, the
// same seven stored demo answers); the page adds no partner logic. The PROFILE below controls presentation only.
// Every buy, finance, trade-in, sign-in and search control is inert (a button that does nothing, no form, no link); the
// only links are the demo's own tabs and "How Sam decides". Served by api/partnerDemo.js at /preview?p=amazon, behind
// the same gate (the signed crew cookie or the partner cookie), noindex.
import { SELLS_FOR_CARD_CSS } from "../lib/sellsForCard.js";
import { DEMO_CARS } from "./partnerAnswer.js";

// THE PROFILE (presentation only). makeScope: the pilot's enthusiast and specialty cars (Sam approves the list); a car
// outside it shows no module. Each entry: a make, and the models in scope (["*"] for every model of the make).
export const AMAZON_PROFILE = {
  key: "amazon",
  name: "Amazon Autos",
  logoPath: "/preview?img=amazon-logo",
  logoAlt: "Amazon Autos",
  preparedFor: "Prepared for Amazon",
  tabs: [["a", "a. Before shopping"], ["b", "b. Dealer lists a car"], ["c", "c. On the listing"]],
  moduleName: "Market Check",
  attribution: "Powered by GoAskSam",
  historyDisplay: { a: "inline", b: "inline", c: "link" },
  makeScope: [
    ["Porsche", ["911", "996", "997", "991", "992", "356", "Boxster", "Cayman"]], ["Ferrari", ["*"]],
    ["BMW", ["M2", "M3", "M4", "M5"]],
    ["Chevrolet", ["Corvette", "Camaro", "Chevelle", "Nova", "El Camino", "C10", "K5 Blazer", "Impala", "Bel Air"]],
    ["Pontiac", ["GTO", "Firebird"]], ["Ford", ["Mustang", "Bronco", "Thunderbird", "F-100"]], ["Dodge", ["Charger", "Challenger"]],
    ["Mercedes-Benz", ["SL-Class", "SL"]], ["Jaguar", ["E-Type", "XKE"]], ["Nissan", ["Skyline", "300ZX"]], ["Toyota", ["Supra", "Land Cruiser"]],
    ["Mazda", ["RX-7", "MX-5"]], ["Honda", ["S2000"]], ["Volkswagen", ["Beetle", "Bus"]], ["MG", ["MGB"]], ["Land Rover", ["Range Rover"]], ["Jeep", ["Wrangler"]]
  ]
};

const escHtml = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The partner's look, CSS only: a dark navy header, white page, the partner's yellow and orange buttons and its type
// stack. The shared card reads the --sans, --sec and --div tokens so it sits in this layout.
const CSS = `
:root{--ink:#0f1111;--ink2:#565959;--rule:#d5d9d9;--soft:#f7fafa;--navy:#131921;--navy2:#232f3e;--yellow:#ffd814;--yellow2:#f7ca00;--orange:#ffa41c;--link:#007185;--r:8px;color-scheme:light;
  --sans:"Amazon Ember",Arial,"Helvetica Neue",Helvetica,sans-serif;--serif:var(--sans);--sec:var(--ink2);--div:var(--rule);--card:#fff}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:400 15px/1.45 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:0 20px}
.demo-bar{background:#111;color:#fff;font-size:13px}
.demo-bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-block:8px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tabs a{color:#fff;text-decoration:none;border:1px solid #555;border-radius:999px;padding:4px 12px}
.tabs a[aria-current=page]{background:#fff;color:#111;border-color:#fff}
.carbar{background:var(--soft);border-bottom:1px solid var(--rule);font-size:14px}
.carbar .wrap{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;padding-block:10px}
.carpick{display:flex;gap:8px;align-items:center;flex:1 1 320px;min-width:0}
.carpick label{font-weight:700}
.carpick input{flex:1;min-width:0;height:38px;border:1px solid #888c8c;border-radius:var(--r);padding:0 12px;font:inherit;background:#fff}
.top{background:var(--navy);color:#fff}
.top .wrap{display:flex;gap:18px;align-items:center;padding-block:10px;flex-wrap:wrap}
.plogo{display:flex;align-items:center;gap:12px;flex:none}
.plogo img{display:block;height:21px;width:auto}
.plogo .chip{background:#fff;border-radius:4px;padding:6px 8px;display:inline-flex}
.prep{font-size:12px;line-height:1.2;color:#ddd;white-space:nowrap}
.sbox{flex:1;display:flex;align-items:center;min-width:180px;height:40px;background:#fff;border-radius:var(--r);color:#6f7373;padding:0 12px;font-size:14px}
.subnav{background:var(--navy2);color:#fff;font-size:14px}
.subnav .wrap{display:flex;gap:18px;padding-block:8px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 18px;border-radius:999px;font:500 14px/1 var(--sans);cursor:default;border:1px solid transparent;color:var(--ink)}
.btn.yel{background:var(--yellow);border-color:var(--yellow2)}
.btn.org{background:var(--orange);border-color:#ff8f00}
.btn.out{background:#fff;border-color:#888c8c}
.btn.blk{width:100%}
.btn.nav{background:transparent;color:#fff;border-color:transparent;padding:0 6px;min-height:32px}
.sample-tag{display:inline-block;margin:6px 0 0;padding:2px 8px;border-radius:4px;background:#f0f2f2;color:var(--ink2);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
main{padding-block:22px 48px}
.listing{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:28px}
.gal{aspect-ratio:4/3;background:#eaeded;border-radius:var(--r);overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--ink2)}
.gal img{width:100%;height:100%;object-fit:cover;display:block}
.photo-note{margin:6px 0 0;font-size:12px;color:var(--ink2)}
.rail h1{margin:0;font:400 26px/1.25 var(--sans)}
.price{margin:14px 0 2px;font:400 28px/1.1 var(--sans)}
.price-kind{margin:0 0 12px;font-size:13px;color:var(--ink2)}
.buybox{border:1px solid var(--rule);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:10px;margin-top:12px}
.buybox .row{font-size:13px;color:var(--ink2)}
.dealer{margin:12px 0 0;font-size:14px}
.dealer b{font-weight:700}
.mc{margin-top:16px;border:1px solid var(--rule);border-radius:var(--r)}
.mc-row{all:unset;box-sizing:border-box;display:flex;width:100%;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;font:700 16px/1.2 var(--sans)}
.mc-row:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.mc-row .attr{font:400 12px/1 var(--sans);color:var(--ink2)}
.mc-row .chev{font-size:14px;color:var(--ink2);margin-left:10px}
.mc-body{padding:0 16px 16px}
.below{grid-column:1/-1}
.sec{border-top:1px solid var(--rule);padding-top:18px;margin-top:22px}
.sec h2{margin:0 0 10px;font:700 20px/1.3 var(--sans)}
.specs{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 18px;margin:0}
.specs dt{font-size:13px;color:var(--ink2)}.specs dd{margin:0;font-weight:700}
.hist-l{margin:0 0 8px}
.linkbtn{all:unset;cursor:pointer;color:var(--link);text-decoration:underline;text-underline-offset:2px}
.linkbtn:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.muted{color:var(--ink2)}
.loading{color:var(--ink2)}
.pop-scrim{position:fixed;inset:0;background:rgba(15,17,17,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
.pop{background:#fff;border-radius:var(--r);max-width:560px;width:100%;max-height:80vh;overflow:auto;padding:20px}
.pop h3{margin:0 0 12px;font:700 18px/1.3 var(--sans)}
.pop ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.pop li{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:12px;align-items:center}
.pop .ph{width:72px;height:54px;border-radius:4px;background:#eaeded;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--ink2)}
.pop .pr{font-weight:700}
.pop .x{float:right}
.lead h1{margin:0 0 8px;font:400 28px/1.25 var(--sans)}
.foot{margin-top:10px;font-size:12px;color:var(--ink2)}
.foot a{color:var(--link)}
/* "How Sam decides" is plain static text on the demo (as on the eBay demo): the card's own link styling is undone here only */
.sfc-card span.sfc-footer-link{color:var(--ink2);font-weight:400;text-decoration:none}
@media (max-width:860px){.listing{grid-template-columns:1fr}.rail h1{font-size:22px}.price{font-size:24px}}
`;

const JS = String.raw`
(function(){
  var CAR = __CAR__, CARS = __CARS__, SCOPE = __SCOPE__, VIEW = __VIEW__, LIST = __LIST__;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var usd = function(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); };
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var monthYear = function(d){ var p = String(d || "").split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1] + " " + p[0] : ""; };
  // Sam's decision 6 (Oct 20 2026), the Amazon profile only: the page's own lines without "Sam"; the engine's own
  // still-reading line (a.line) is shown as the engine words it.
  var STILL_LINE = "Sam is still reading the sales for this one.", COULD_NOT = "The sales could not be read just now. Try again in a minute.";
  // ONE READ PER PAGE through the partner answer path (the same path and stored answers as the eBay demo); the engine's own
  // retryAfterMs is the only retry, and past the safety deadline a demo car falls back to its stored answer.
  var DEADLINE = 25000;
  function ask(body){
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function(){ ctl.abort(); }, DEADLINE) : null;
    return fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function(r){ return r.json(); }).catch(function(){ return { aborted: true }; })
      .then(function(a){ if (t) clearTimeout(t); if (!a || !a.aborted) return a; if (CARS.indexOf(String(body.q || "")) < 0) return { ok: false, stillReading: true };
        return fetch("/api/partnerAnswer?last=" + encodeURIComponent(body.q), { credentials: "include" }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false, stillReading: true }; }); });
  }
  // THE PILOT SCOPE (the profile's makeScope): the answer's own make and model against the list; outside it, no module.
  function inScope(a){
    var id = a && a.identity; if (!id || !id.make) return false;
    var mk = String(id.make).toLowerCase(), md = String(id.model || "").toLowerCase();
    return SCOPE.some(function(e){ return e[0].toLowerCase() === mk && (e[1][0] === "*" || e[1].some(function(m){ return m.toLowerCase() === md; })); });
  }
  // The shared card, as the partner answer draws it (cardWithRows: the engine's own sale rows, in the engine's order,
  // when the path sends them; else the card without its rows). The page adds nothing to it.
  function cardHtml(a){
    if (!a || a.ok === false) return '<p class="muted">' + esc(a && a.stillReading ? (a.line || STILL_LINE) : COULD_NOT) + "</p>";
    if (a.question) return '<p>' + esc(a.question.text || "") + "</p>";
    var c = a.cardWithRows || a.card || ""; return c.replace('<div class="gas-pill-slot"></div>', "");
  }
  // The demo's sample asking price: a round figure inside the engine's range (the eBay demo's rule), none without a range,
  // labelled exactly "Sample asking price". It feeds nothing.
  function samplePrice(a){
    if (!a || a.ok === false || a.question || !a.range || !(a.range.low > 0) || !(a.range.high >= a.range.low)) return null;
    var steps = [10000, 5000, 1000];
    for (var i = 0; i < steps.length; i++) { var p = Math.ceil(a.range.low / steps[i]) * steps[i]; if (p <= a.range.high) return p; }
    return null;
  }
  // This exact car's history (the answer's VIN history, newest first): "sold before" only when a prior listing sold.
  var anySold = function(h){ return (h || []).some(function(r){ return r.result === "sold"; }); };
  function histRows(h){
    return '<ul>' + h.map(function(r){
      var ph = r.photo ? '<img class="ph" src="/api/partnerAnswer?photo=' + encodeURIComponent(r.photo) + '&w=160" alt="" loading="lazy">' : '<span class="ph">No photo</span>';
      var what = r.result === "sold" ? "Sold " + monthYear(r.date) : "Listed " + monthYear(r.date) + ", did not sell";
      var amt = r.result === "sold" ? (r.price ? usd(r.price) : "") : (r.highBid ? "High bid " + usd(r.highBid) : "");
      return '<li>' + ph + '<span>' + esc(what) + (r.miles ? '<br><span class="muted">' + esc(Number(r.miles).toLocaleString("en-US")) + " miles</span>" : "") + '</span><span class="pr">' + esc(amt) + "</span></li>";
    }).join("") + "</ul>";
  }
  function openHist(h){
    var s = document.createElement("div"); s.className = "pop-scrim"; s.setAttribute("data-close", "");
    s.innerHTML = '<div class="pop" role="dialog" aria-modal="true" aria-label="Previous market history"><button type="button" class="linkbtn x" data-close>Close</button><h3>' + (anySold(h) ? "This car has sold before" : "This car was listed before") + "</h3>" + histRows(h) + "</div>";
    document.body.appendChild(s);
  }
  var HIST = [];
  document.addEventListener("click", function(e){
    var t = e.target;
    if (t.closest("[data-inert]")) { e.preventDefault(); return; }
    if (t.closest("[data-hist]")) { e.preventDefault(); return openHist(HIST); }
    if (t.closest("[data-close]") && (t.hasAttribute("data-close") || t.closest(".pop") === null || t.classList.contains("x"))) { var sc = document.querySelector(".pop-scrim"); if (sc && (t === sc || t.closest("[data-close]") !== sc)) sc.remove(); return; }
    var mc = t.closest("[data-mc-toggle]");
    if (mc) { var b = $("mc-body"), open = b.hidden; b.hidden = !open; mc.setAttribute("aria-expanded", open ? "true" : "false"); var ch = mc.querySelector(".chev"); if (ch) ch.textContent = open ? "Hide" : "Show"; }
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") { var sc = document.querySelector(".pop-scrim"); if (sc) sc.remove(); } });
  document.addEventListener("submit", function(e){ if (e.target.closest("[data-inert]")) e.preventDefault(); });
  // TAB c: the vehicle page.
  function drawC(a){
    var ok = a && a.ok !== false;
    var photo = ok && a.carPhoto && a.carPhoto.photo;
    $("c-photo").innerHTML = photo ? '<img src="/api/partnerAnswer?photo=' + encodeURIComponent(photo) + '&w=960" alt="' + esc(CAR) + '" decoding="async"><p class="photo-note"></p>' : "";
    var gal = $("c-photo"); if (photo) { gal.classList.add("has"); var n = gal.querySelector(".photo-note"); if (n) { n.textContent = "Photo of a car like it from a recent sale."; gal.parentNode.appendChild(n); } }
    var scope = ok && inScope(a), p = scope ? samplePrice(a) : null;
    $("c-price").innerHTML = p != null ? '<div class="price">' + usd(p) + '</div><p class="price-kind">Sample asking price</p>' : "";
    $("c-mc").hidden = !scope;
    if (scope) $("mc-body").innerHTML = cardHtml(a);
    HIST = (a && a.history) || [];
    // The vehicle history section shows only when this exact car has an earlier listing on record.
    $("c-hist").innerHTML = HIST.length ? '<p class="hist-l">This car has previous market history</p><button type="button" class="linkbtn" data-hist>See earlier sales</button>' : "";
    $("c-histsec").hidden = !HIST.length;
    if (a && a.stillReading && a.retryAfterMs > 0) setTimeout(function(){ ask(body).then(drawC); }, a.retryAfterMs);
  }
  var body = LIST && LIST.vin ? { q: CAR, vin: LIST.vin } : { q: CAR };
  if (VIEW === "c") ask(body).then(drawC);
})();
`;

export function amazonPageHtml(view, carIn, { carOf, listing }) {
  const P = AMAZON_PROFILE;
  const v = /^[abc]$/.test(view || "") ? view : "c";
  const car = carOf(carIn), chosen = String(carIn == null ? "" : carIn).trim() !== "";
  const hasListing = listing && car === listing.q;
  const carQ = k => `?p=amazon&view=${k}${car === DEMO_CARS[0] ? "" : "&car=" + encodeURIComponent(car)}`;
  const tab = (k, label) => `<a href="${escHtml(carQ(k))}"${k === v ? ' aria-current="page"' : ""}>${label}</a>`;
  const carBar = `<div class="carbar"><div class="wrap"><form class="carpick" id="car-form" method="get" action="/preview"><input type="hidden" name="p" value="amazon"><input type="hidden" name="view" value="${v}"><label for="car-in">Car</label><input id="car-in" name="car" value="${chosen ? escHtml(car) : ""}" autocomplete="off" maxlength="60" placeholder="Type your car or paste a VIN"><button class="btn out" type="submit">Show</button></form></div></div>`;
  const sy = /^(\d{4})\b/.exec(car), year = sy ? sy[1] : null;
  // TAB c, ON THE LISTING: photos, title, "Sample listing", the sample asking price (inside the range only), the purchase box
  // (inert), the dealer line, then Market Check below the purchase box (a collapsed row opening the shared card), the
  // vehicle features and the vehicle history. No VIN printed, no "last sold" near the price, no verdict words.
  const viewC = `
<section class="wrap" id="view-c"${v === "c" ? "" : " hidden"}>
  <div class="listing">
    <div><div class="gal" id="c-photo"></div></div>
    <div class="rail">
      <h1>${escHtml(hasListing ? listing.title : car)}</h1><p class="sample-tag">Sample listing</p>
      <div id="c-price"></div>
      <div class="buybox">
        <button type="button" class="btn yel blk" data-inert>Check availability</button>
        <button type="button" class="btn org blk" data-inert>Get pre-qualified</button>
        <button type="button" class="btn out blk" data-inert>Value your trade-in</button>
      </div>
      <p class="dealer">Sold by <b>Sample dealer</b></p>
      <div class="mc" id="c-mc" hidden>
        <button type="button" class="mc-row" data-mc-toggle aria-expanded="false" aria-controls="mc-body"><span>${escHtml(P.moduleName)}<br><span class="attr">${escHtml(P.attribution)}</span></span><span class="chev">Show</span></button>
        <div class="mc-body" id="mc-body" hidden><p class="loading">Reading the sales for this one.</p></div>
      </div>
    </div>
    <div class="below">
      <div class="sec"><h2>Vehicle features</h2><dl class="specs">${year ? `<div><dt>Year</dt><dd>${year}</dd></div>` : ""}${hasListing ? `<div><dt>Mileage</dt><dd>${listing.miles.toLocaleString("en-US")}</dd></div>` : ""}</dl></div>
      <div class="sec" id="c-histsec" hidden><h2>Vehicle history</h2><div id="c-hist"></div></div>
    </div>
  </div>
</section>`;
  const later = (k, h) => `<section class="wrap" id="view-${k}"${v === k ? "" : " hidden"}><div class="lead"><h1>${h}</h1><p class="muted">This view is being prepared for the demo.</p></div></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>What these sell for</title><style>${CSS}${SELLS_FOR_CARD_CSS}</style></head><body>
<div class="demo-bar"><div class="wrap"><span>What these sell for, powered by GoAskSam.</span><nav class="tabs" aria-label="Views">${P.tabs.map(([k, l]) => tab(k, l)).join("")}</nav></div></div>
${carBar}
<header class="top"><div class="wrap"><div class="plogo"><span class="chip"><img src="${P.logoPath}" alt="${escHtml(P.logoAlt)}" width="138" height="21" decoding="async"></span><span class="prep">${escHtml(P.preparedFor)}</span></div><div class="sbox" aria-hidden="true">Search Amazon Autos</div><button type="button" class="btn nav" data-inert>Sign in</button></div></header>
<nav class="subnav" aria-label="Sample navigation"><div class="wrap"><button type="button" class="btn nav" data-inert>Shop cars</button><button type="button" class="btn nav" data-inert>Trade in</button><button type="button" class="btn nav" data-inert>Financing</button></div></nav>
<main>
${later("a", "What's your car going for?")}
${later("b", "List a car")}
${viewC}
</main>
<script>${JS.replace("__CAR__", JSON.stringify(car)).replace("__CARS__", JSON.stringify(DEMO_CARS)).replace("__SCOPE__", JSON.stringify(P.makeScope)).replace("__VIEW__", JSON.stringify(v)).replace("__LIST__", JSON.stringify(hasListing ? { vin: listing.vin } : null))}</script></body></html>`;
}
