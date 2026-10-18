// PARTNER DEMO PAGE (Lane C, Oct 15 2026; closed, crew-only, noindex, linked from nowhere public): four views of
// "What these sell for, powered by GoAskSam" inside a partner's own listing layout. The page is a NEUTRAL MIRROR of
// that layout (its structure, type scale, button shape and colour pattern) applied to our own elements: no partner
// name, logo, copy or photos, placeholder photos only. Every number on it comes from api/partnerAnswer.js, which is
// Market Check's own answer for the same words; the page computes nothing but where a figure sits against a range.
//   a. Before listing: one box (any car or VIN), the engine's identity chips and question, the range panel only when
//      the engine gives a range, the VIN's history, a List it button that does nothing in the demo.
//   b. Setting a reserve: a reserve field with a pill (inside the range green, above amber, below slate, no range
//      grey; grey means only "no range", Sam Oct 16 2026).
//   c. On the listing: the dummy listing with "What these sell for" and "This car before" in the right rail and a
//      pill for the current price against the range; on a phone they stack under the price and buy buttons.
//   d. Under the listing: a full-width "What cars like this sold for" (sale tiles, lowest price first), then "This car
//      before"; on a phone after the description.
// Route: /preview (vercel.json rewrite to /api/partnerDemo; Sam, Oct 18 2026: the old /partner-demo redirects there), ?view=a|b|c|d.
import { isCrewRequest } from "../lib/_crew.js";
import { isPartnerRequest, partnerCodeMatches, partnerSetCookies } from "../lib/_partnerAccess.js";
import { checkCeiling } from "../lib/_ceilings.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { SELLS_FOR_CARD_CSS } from "../lib/sellsForCard.js";
import { HERO_JPEG_B64, HERO_W, HERO_H } from "./_partnerHero.js";
import { DEMO_CARS } from "./partnerAnswer.js";

export const DUMMY = { title: "2015 Porsche 911 GT3", colour: "Black", miles: 20611, titleStatus: "Clean", price: 139900, priceKind: "Buy It Now", daysLeft: 13, vin: "WP0AC2A96FS189139", q: "2015 Porsche 911 GT3" };

const CSS = `
:root{--ink:#191919;--ink2:#707070;--rule:#e5e5e5;--soft:#f7f7f7;--blue:#3665f3;--blue2:#2b52c5;--green:#0b7a34;--greenbg:#e6f4ea;--amber:#8a5a00;--amberbg:#fdf3dc;--grey:#5c5c5c;--greybg:#efefef;--slate:#334b66;--slatebg:#e3eaf3;--r:16px;color-scheme:light;
  /* the shared card reads these tokens: the partner mirror's own type and lines, so the card sits in its layout */
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;--serif:var(--sans);--sec:var(--ink2);--div:var(--rule);--card:#fff}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
.demo-bar{background:#111;color:#fff;font-size:13px}
.demo-bar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-block:8px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.carbar{background:var(--soft);border-bottom:1px solid var(--rule);font-size:14px}
.carbar .wrap{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;padding-block:10px}
.carpick{display:flex;gap:8px;align-items:center;flex:1 1 320px;min-width:0}
.carpick label{font-weight:600}
.carpick input{flex:1;min-width:0;height:40px;border:1px solid var(--ink2);border-radius:999px;padding:0 14px;font:inherit;background:#fff}
.carpick .btn{min-height:40px;font-size:15px;padding:0 16px}
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
.pillrow{margin:6px 0 10px}
.note{color:var(--ink2);font-size:14px;margin:8px 0 0}
.qrow{margin:0 0 16px;font-size:15px}
.upd{font-weight:400}
.facts{display:flex;gap:0;flex-wrap:wrap;margin:10px 0 0}
.facts div{padding:0 16px;border-left:1px solid var(--rule)}
.facts div:first-child{padding-left:0;border-left:0}
.facts dt{font-size:13px;color:var(--ink2)}
.facts dd{margin:2px 0 0;font-size:16px}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:14px;font-weight:600}
.pill.in{background:var(--greenbg);color:var(--green)}
.pill.above{background:var(--amberbg);color:var(--amber)}
.pill.below{background:var(--slatebg);color:var(--slate)}
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
.listing.with-below{row-gap:0}
.listing.with-below>.rail{grid-column:2;grid-row:1 / span 2}
.below-gal{grid-column:1;min-width:0}
.idline{margin:12px 2px 0;font-size:14px;color:var(--ink2,#555);line-height:1.7}
.idl{font:inherit;background:none;border:0;padding:0;color:var(--ink,#111);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.idl.chosen{text-decoration:none;font-weight:600}
.res-line{padding:10px 0;border-top:2px solid var(--ink,#111);border-bottom:2px solid var(--ink,#111);font-weight:700;font-size:15px}
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
.desc.below{margin-top:40px}
.desc h2{margin-bottom:8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.tile .ph{aspect-ratio:4/3;margin-bottom:12px;border-radius:16px;background:var(--soft);border:12px solid var(--soft);background-image:linear-gradient(135deg,#d9d9d9,#bfbfbf);background-clip:content-box}
.tile{background:var(--soft);border-radius:var(--r);padding:16px 18px}
.tile .p{font-size:18px;font-weight:700}
.tile .d{color:var(--ink2);font-size:14px}
.full{margin-top:36px}
.hero-img{display:block;width:100%;height:auto;aspect-ratio:1600/1058;object-fit:cover;border-radius:12px;background:#d9d9d9}
.gal-hero{grid-template-columns:1fr}
.thumb-img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#d9d9d9}
.b-hero{max-width:760px;margin:0 0 22px}
.b-hero:empty{display:none}
.car-photo{margin:0 0 18px;max-width:760px}
.photo-note{margin:6px 0 0;font-size:13px;color:var(--ink2)}
.prior{margin:0 0 18px}
.prior h3{margin-bottom:8px}
#c-photo .car-photo{max-width:none}
.full-a{margin-top:26px}
.full-a h2{font-size:20px;margin-bottom:8px}
.sl-head{margin:-6px 0 12px}
.slist{display:flex;flex-direction:column}
.srow{display:flex;align-items:center;gap:16px;padding:12px 0;border-top:1px solid var(--line,#e5e5e5)}
.srow:first-child{border-top:0}
.sph{flex:none;width:128px;aspect-ratio:4/3;border-radius:10px;background:#ececec;overflow:hidden}
.sph img{display:block;width:100%;height:100%;object-fit:cover}
.sinfo{flex:1;min-width:0}
.st{font-weight:600;font-size:15px;line-height:1.3;overflow-wrap:anywhere}
.sd{color:var(--ink2);font-size:14px}
.sr{color:var(--ink2);font-size:13px;margin-top:2px}
.sp{flex:none;font-weight:700;font-size:17px;text-align:right}
.morewrap{margin-top:16px;text-align:center}
.more{font:inherit;font-size:15px;font-weight:600;padding:12px 28px;border-radius:999px;border:1px solid #d0d0d0;background:#fff;color:inherit;cursor:pointer}
.aside-grp{margin-top:28px}
.aside-grp summary{cursor:pointer;font-weight:600;font-size:15px;padding:8px 0}
.aside-grp[open] summary{margin-bottom:4px}
@media (max-width:600px){.sph{width:88px}.srow{gap:12px}.sp{font-size:15px}}
.stable{width:100%;border-collapse:collapse;font-size:15px}
.stable th{text-align:left;font-size:13px;font-weight:600;color:var(--ink2);padding:0 8px 8px;border-bottom:1px solid var(--rule)}
.stable td{padding:10px 8px;border-bottom:1px solid var(--rule)}
.stable th:first-child,.stable td:first-child{padding-left:0}
.stable .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:0}
.stable .res-row td{padding:8px 12px;background:var(--soft);border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);font-weight:700}
.res-line-big{margin:4px 0 12px;font-size:18px;font-weight:700;line-height:1.35}
.sfc-howline{margin:8px 0 0;font-size:13px;color:var(--ink2,#666);line-height:1.45}
.hsd{color:var(--ink)}
/* "How Sam decides" is plain static text on the demo (Sam): the card's own link styling is undone here only */
.sfc-card span.sfc-footer-link{color:var(--ink2);font-weight:400;text-decoration:none}
.tile .d+.d{margin-top:2px}
.phone-only{display:none}
@media (max-width:760px){
  .gal-hero .hero-img{border-radius:0;margin:0 -16px;width:calc(100% + 32px);max-width:none}
  .stable{font-size:14px}
  .stable td,.stable th{padding-left:6px;padding-right:6px}
  .wrap{padding-left:16px;padding-right:16px}
  .listing{grid-template-columns:1fr;gap:0}
  .listing.with-below>.rail,.below-gal{grid-column:1;grid-row:auto}
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
  // THE SELECTED CAR (Sam, Oct 18 2026): one car for the whole demo, chosen in the bar on every view and carried in the
  // address (car=), so every view reads the same car. Only the 2015 GT3 has listing detail (D); any other car has none.
  var CAR = __CAR__, D = __LISTING__, CARS = __CARS__;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var usd = function(n){ return "$" + Math.round(Number(n)).toLocaleString("en-US"); };
  var MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var monthYear = function(d){ var p = String(d || "").split("-"); return p.length >= 2 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1] + " " + p[0] : ""; };
  var plural = function(n, one, many){ return n === 1 ? one : many; };
  // One read. The page has no wait or retry rule of its own (Sam, Oct 18 2026): when the engine answers that it is still
  // reading, the page draws the engine's line and asks again after the engine's own retryAfterMs. The abort below is a
  // safety net only (Sam's approval): past it the page shows the stored last good answer for a demo car (GET ?last=, no
  // engine read), otherwise the plain still-reading state with Try again. Nothing on the page is timed for a number.
  var ASK_DEADLINE_MS = 25000;
  function ask1(body){
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var t = ctl ? setTimeout(function(){ ctl.abort(); }, ASK_DEADLINE_MS) : null;
    var read = fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function(r){ return r.json(); }).catch(function(){ return { aborted: true }; });
    var late = new Promise(function(res){ setTimeout(function(){ res({ aborted: true }); }, ASK_DEADLINE_MS + 1000); });
    return Promise.race([read, late]).then(function(a){ if (t) clearTimeout(t); return a; });
  }
  var STILL = { ok: false, error: "unavailable", stillReading: true, line: null, retryAfterMs: null };
  function ask(body){
    return ask1(body).then(function(a){
      if (!a || !a.aborted) return a;
      if (body.refine || CARS.indexOf(String(body.q || "")) < 0) return STILL;
      return fetch("/api/partnerAnswer?last=" + encodeURIComponent(body.q), { credentials: "include" }).then(function(r){ return r.json(); }).catch(function(){ return STILL; });
    });
  }
  // A read and its drawing, kept per view so Try again (and the engine's own retry) reruns exactly that read.
  var runs = {};
  // THE CHOSEN CAR FOLLOWS EVERY VIEW (Sam, Oct 18 2026: a car typed into the first screen's own box did not reach the
  // second screen). Any read that names a new car, in any view (the first screen's box, a pasted VIN, an identity
  // chip), makes it the chosen car at once: car= in the address (replaced in place), every tab, the car bar and the
  // car bar. The listing detail belongs to the 2015 GT3 only, so another car drops it. Nothing else changes.
  var VIEW = (document.querySelector('#car-form input[name="view"]') || {}).value || "a";
  function setCar(q){
    q = String(q || "").replace(/\s+/g, " ").trim();
    if (!q || q === CAR) return;
    CAR = q; if (CAR !== CARS[0]) D = null;
    var tail = CAR === CARS[0] ? "" : "&car=" + encodeURIComponent(CAR);
    try { var u = new URL(location.href); if (tail) u.searchParams.set("car", CAR); else u.searchParams.delete("car"); u.searchParams.delete("q"); history.replaceState(history.state, "", u.pathname + u.search); } catch (e) {}
    [].forEach.call(document.querySelectorAll(".tabs a"), function(a){ var k = (String(a.getAttribute("href")).match(/view=([abc])/) || [])[1]; if (k) a.setAttribute("href", "?view=" + k + tail); });
    var ci = $("car-in"); if (ci) ci.value = CAR;
  }
  // Only a view's latest read draws (Oct 18 2026: the page's first read of the default car could land after the
  // visitor's own typed car and draw over it); an older answer is dropped, never drawn.
  var seqs = {};
  function run(view, body, draw){
    if (view !== "all" && body && body.q && !body.refine && !body.vin) setCar(body.q);
    runs[view] = function(){ run(view, body, draw); };
    var my = seqs[view] = (seqs[view] || 0) + 1;
    return ask(body).then(function(a){
      if (seqs[view] !== my) return a;
      draw(a);
      if (a && a.stillReading && a.retryAfterMs > 0) setTimeout(runs[view], a.retryAfterMs);
      return a;
    });
  }
  var COULD_NOT = "Sam could not read the sales just now. Try again in a minute.";
  // Each refusal says what it is: the demo's daily limit for other cars, the per-minute limit, or a read that failed.
  var LIMIT = "That is today's limit for other cars here.";
  var BUSY = "Lots of reads just now. Try again in a minute.";
  // The still-reading state draws the engine's own line; when the engine named no wait, a Try again button reruns the read.
  var STILL_LINE = "Sam is still reading the sales for this one.";
  var notRead = function(a){
    if (a && a.stillReading) return esc(a.line || STILL_LINE) + (a.retryAfterMs > 0 ? "" : ' <button type="button" class="idl" data-retry>Try again</button>');
    return a && a.error === "car_limit" ? LIMIT : a && a.error === "rate_limited" ? BUSY : COULD_NOT;
  };
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-retry]"); if (!b) return;
    var sec = b.closest(".sec-view"), v = sec && sec.id.replace("view-", "");
    if (v && runs[v]) { b.disabled = true; runs[v](); }
  });
  // The card's footer: the credit, the Updated date (the endpoint's shared last-ingest date, none when unread) and
  // How Sam decides.
  // Panels around the shared card (This car before, the sales section): the credit and How Sam decides only; the one
  // Updated date on a view is the card's own (its read time), never a second, different date beside it.
  function foot(a){ return '<div class="gas-foot"><span><b>Powered by GoAskSam</b></span><span class="hsd">How Sam decides</span></div>'; }
  // A sale's mileage as the engine read it, or the plain words when the listing stated none.
  var milesOf = function(s){ return s && s.miles ? Number(s.miles).toLocaleString("en-US") + " miles" : "Mileage not stated"; };
  var dayLabel = function(d){ var p = String(d || "").split("-"); return p.length === 3 && MON[Number(p[1]) - 1] ? MON[Number(p[1]) - 1].slice(0, 3) + " " + Number(p[2]) + ", " + p[0] : (monthYear(d) || ""); };
  // The sales table (views a and b): date, mileage, price per row, from the endpoint's own sales (the engine's pool,
  // never a set-aside row). opts.reserve inserts the one divider row at the reserve (rows sorted by price, high first).
  // View b's list (Sam, Oct 18 2026): the same rows as the other lists (photo, name, date, mileage, price), highest price
  // first, with "Your reserve" placed where the reserve falls among the prices; no Show more.
  function reserveList(rows, opts){
    opts = opts || {};
    var body = "", placed = false, r = opts.reserve > 0 ? opts.reserve : null;
    var line = function(){ return '<div class="res-line">Your reserve ' + usd(r) + "</div>"; };
    rows.forEach(function(s){
      if (r != null && !placed && s.price < r) { body += line(); placed = true; }
      body += saleRow(s);
    });
    if (r != null && !placed) body += line();
    return '<div class="slist">' + body + "</div>";
  }
  var newest = function(a){ return (a && a.sales || []).slice().sort(function(x, y){ return String(y.date || "").localeCompare(String(x.date || "")) || y.price - x.price; }); };
  // Where a figure sits against the engine's range. The only thing this page works out, and only from that range.
  // The pill names whose figure it is (Sam, Oct 18 2026): the listing's asking price, or the seller's reserve. Neutral,
  // no deal words, no advice.
  function placing(x, a, who){
    if (!a || !a.range) return { cls: "none", text: "No range for cars like this yet" };
    var w = who === "reserve" ? "Your reserve is " : "Asking price is ";
    if (x < a.range.low) return { cls: "below", text: w + "below the usual range" };
    if (x > a.range.high) return { cls: "above", text: w + "above the usual range" };
    return { cls: "in", text: w + "inside the usual range" };
  }
  // The car's photo (Sam, Oct 18 2026): the endpoint's carPhoto, a photo from the engine's own included sales of this
  // car, served by id; none when the engine has none, and a photo that fails to load leaves nothing behind.
  function carPhotoHtml(a){
    var p = a && a.ok !== false && a.carPhoto && a.carPhoto.photo;
    return p ? '<div class="car-photo"><img class="hero-img" data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(p) + '" alt="' + esc(CAR) + '" decoding="async"><p class="photo-note">Photo from a recent sale of a car like this one.</p></div>' : "";
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
    if (!a || a.ok === false) return '<div class="panel"><h3>What these sell for</h3><p class="muted">' + notRead(a) + "</p>" + foot(a) + "</div>";
    if (a.question) return '<div class="panel"><h3>What these sell for</h3>' + idChips(a) + questionHtml(a, opts.slot || "") + foot(a) + "</div>";
    // The shared card (lib/sellsForCard.js, rendered by the endpoint): this page only fills its pill slot. The card has
    // pill slot in every case (Lane A's 3e8445d6), so every pill, the grey no-range one too, sits where the card puts it.
    if (a.card) {
      var pl = opts.price != null ? placing(opts.price, a, opts.who) : null, ph = (pl ? '<p class="pillrow"><span class="pill ' + pl.cls + '">' + esc(pl.text) + "</span></p>" : "") + (opts.underPill || "");
      return (opts.chips ? idChips(a) : "") + (a.card.indexOf('<div class="gas-pill-slot"></div>') >= 0 ? a.card.replace('<div class="gas-pill-slot"></div>', ph) : a.card + ph) + (opts.lines ? linesHtml(opts.lines) : "");
    }
    var pill = opts.price != null ? '<p class="pillrow"><span class="pill ' + placing(opts.price, a, opts.who).cls + '">' + esc(placing(opts.price, a, opts.who).text) + "</span></p>" : "";
    var body = a.range
      ? '<p class="range">' + usd(a.range.low) + " to " + usd(a.range.high) + "</p>" + pill + '<p class="sub">The middle half of ' + a.count + " " + plural(a.count, "sale", "sales") + "" + ".</p>"
      : '<p class="sub">' + esc(a.thin || "No range for cars like this yet.") + "</p>" + pill;
    var aside = a.setAside && a.setAside.total ? '<p class="note">' + a.setAside.total + " more set aside" + (a.setAside.reasons ? " (" + Object.keys(a.setAside.reasons).map(function(k){ return a.setAside.reasons[k] + " " + esc(k); }).join(", ") + ")" : "") + ".</p>" : "";
    return '<div class="panel"><h3>What these sell for</h3>' + (opts.chips ? idChips(a) : "") + body + aside + foot(a) + "</div>";
  }
  // THIS EXACT CAR SOLD BEFORE (Sam, Oct 18 2026, stage 4): when the car's VIN or chassis number matched earlier sales
  // in the archive (the endpoint's history), every sale, newest first, at the top of the answer: its own photo, the
  // month and year, the price and the mileage at that sale. Venue-blind: no venue name and no link (Sam's answer).
  var soldRows = function(a){ return ((a && a.history) || []).filter(function(r){ return r.result === "sold" && r.price; }); };
  function priorPanel(a){
    var sold = soldRows(a); if (!sold.length) return "";
    var last = sold[0], my = monthYear(last.date);
    return '<div class="panel prior"><h3>This car last sold for ' + usd(last.price) + (my ? " in " + esc(my) : "") + ".</h3>" + '<div class="slist">' +
      sold.map(function(r){ return '<div class="srow">' + photoSlot(r) + '<div class="sinfo"><div class="st">Sold ' + esc(monthYear(r.date) || "") + '</div><div class="sd">' + esc(r.miles ? Number(r.miles).toLocaleString("en-US") + " miles at that sale" : "Mileage not stated at that sale") + '</div></div><div class="sp">' + usd(r.price) + "</div></div>"; }).join("") +
      "</div>" + foot(a) + "</div>";
  }
  function historyPanel(a){
    if ((!a || a.ok === false) && !(a && a.history && a.history.length)) return '<div class="panel"><h3>This car before</h3><p class="muted">' + notRead(a) + "</p>" + foot(a) + "</div>";   // a failed read never claims the car has no history
    var h = a && a.history;
    var rows = h && h.length ? '<ul class="hist">' + h.map(function(r){
      var right = r.result === "sold" ? (r.price ? "Sold for " + usd(r.price) : "Sold") : (r.highBid ? "Offered, not sold. High bid " + usd(r.highBid) : "Offered, not sold");
      return "<li><span>" + esc(monthYear(r.date)) + (r.miles ? '<br><span class="muted" style="font-size:14px">' + Number(r.miles).toLocaleString("en-US") + " miles</span>" : "") + '</span><span class="r">' + esc(right) + "</span></li>"; }).join("") + "</ul>"
      : '<p class="muted">No earlier sale or listing of this car on record.</p>';
    return '<div class="panel"><h3>This car before</h3>' + rows + foot(a) + "</div>";
  }
  // THE SALES LIST (Sam, Oct 18 2026), views a and d: the answer's own included sales (the engine's cards, never a
  // set-aside one), newest first, ten at a time with Show more from the same answer (no request, no new number). Each
  // row: a photo in a fixed slot (/api/partnerAnswer?photo=<id>, lazy; a neutral tile when there is none or it fails), the
  // engine row's own title, the sale date, mileage and price. Rows are not links. Set-aside sales, if the engine sent any,
  // sit in their own small group below with the engine's own reason words.
  var LIST_STEP = 10, lists = {};
  function photoSlot(s){ return '<div class="sph">' + (s && s.photo ? '<img data-ph src="/api/partnerAnswer?photo=' + encodeURIComponent(s.photo) + '" alt="" width="160" height="120" loading="lazy" decoding="async">' : "") + "</div>"; }
  function saleRow(s, reason){
    return '<div class="srow">' + photoSlot(s) + '<div class="sinfo"><div class="st">' + esc(s.name || "") + '</div><div class="sd">Sold ' + esc(dayLabel(s.date)) + '</div><div class="sd">' + esc(milesOf(s)) + "</div>" +
      (reason ? '<div class="sr">' + esc(reason.charAt(0).toUpperCase() + reason.slice(1)) + "</div>" : "") + '</div><div class="sp">' + usd(s.price) + "</div></div>";
  }
  function listHead(slot){ var n = $("sl-" + slot) ? $("sl-" + slot).children.length : 0; return "The most recent " + (n < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][n] : n) + " " + plural(n, "sale", "sales") + " behind this answer, newest first."; }
  function salesList(a, slot){
    if (!a || a.ok === false) return '<p class="muted">' + notRead(a) + "</p>";
    if (a.question || !a.sales || !a.sales.length) return '<p class="muted">' + esc((a && a.thin) || "No recorded sales of cars like this yet.") + "</p>";
    var rows = newest(a); lists[slot] = rows;
    var shown = rows.slice(0, LIST_STEP), n = shown.length;
    var aside = (a.asideRows || []).slice().sort(function(x, y){ return String(y.date || "").localeCompare(String(x.date || "")); });
    return '<p class="sub sl-head" id="slh-' + slot + '">The most recent ' + (n < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][n] : n) + " " + plural(n, "sale", "sales") + " behind this answer, newest first.</p>" +
      '<div class="slist" id="sl-' + slot + '">' + shown.map(function(s){ return saleRow(s); }).join("") + "</div>" +
      (rows.length > LIST_STEP ? '<p class="morewrap"><button type="button" class="more" data-more="' + slot + '">Show more</button></p>' : "") +
      (aside.length ? '<details class="aside-grp"><summary>' + esc(a.asideLine || ((aside.length < 10 ? ["zero","one","two","three","four","five","six","seven","eight","nine"][aside.length] : aside.length) + " " + plural(aside.length, "sale", "sales") + " set aside")) + '</summary><p class="sub">Not part of the answer above.</p><div class="slist">' + aside.map(function(s){ return saleRow(s, s.reason); }).join("") + "</div></details>" : "");
  }
  document.addEventListener("click", function(e){
    var m = e.target.closest && e.target.closest("[data-more]"); if (!m) return;
    var slot = m.getAttribute("data-more"), box = $("sl-" + slot), rows = lists[slot] || []; if (!box) return;
    var have = box.children.length;
    box.insertAdjacentHTML("beforeend", rows.slice(have, have + LIST_STEP).map(function(s){ return saleRow(s); }).join(""));
    $("slh-" + slot).textContent = listHead(slot);
    if (box.children.length >= rows.length) m.parentNode.removeChild(m);
  });
  // A photo that does not load leaves the plain neutral tile, never a broken image.
  document.addEventListener("error", function(e){ var t = e.target; if (t && t.tagName === "IMG" && t.hasAttribute("data-ph")) { var box = t.closest(".car-photo"); (box || t).parentNode.removeChild(box || t); } }, true);
  // THE NARROWING LINES (Sam, Oct 18 2026): Market Check's own "Which M3? Convertible (9) · Coupe (3)" lines, from the
  // engine's fields (a.lines, api/partnerAnswer.js linesOf). An option reruns the same query with that refine; once
  // chosen, the line stays, the choice in plain ink, with "Any (N)" back to the unsplit answer (N the engine's count).
  var idState = { a: null, b: null, c: null };
  function noteLines(slot, a){ var st = idState[slot]; if (st && st.refining) { st.refining = false; return; } idState[slot] = { q: a && a.query, lines: (a && a.lines) || [], chosen: null }; }
  function linesHtml(slot){
    var st = idState[slot]; if (!st || !st.lines.length) return "";
    return st.lines.map(function(l){
      var hasChosen = st.chosen && st.chosen.key === l.key;
      var items = l.options.map(function(o){
        var lab = esc(o.label) + " (" + Number(o.n).toLocaleString("en-US") + ")";
        return hasChosen && String(st.chosen.value) === String(o.value) ? '<span class="idl chosen">' + lab + "</span>" : '<button type="button" class="idl" data-idopt="' + slot + '" data-key="' + esc(l.key) + '" data-val="' + esc(o.value) + '">' + lab + "</button>";
      });
      if (hasChosen && l.any != null) items.push('<button type="button" class="idl" data-idopt="' + slot + '" data-key="' + esc(l.key) + '" data-val="">Any (' + Number(l.any).toLocaleString("en-US") + ")</button>");
      return '<p class="idline">' + (l.lead ? esc(l.lead) + " " : "") + items.join(" &middot; ") + "</p>";
    }).join("");
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-idopt]"); if (!b) return;
    var slot = b.getAttribute("data-idopt"), key = b.getAttribute("data-key"), val = b.getAttribute("data-val"), st = idState[slot]; if (!st) return;
    st.chosen = val ? { key: key, value: val } : null; st.refining = true;
    var send = { q: st.q }; if (val) { send.refine = {}; send.refine[key] = val; }
    if (slot === "a") return runA(send);
    if (slot === "b") { $("b-out").innerHTML = '<p class="loading">Sam is reading the sales for this one.</p>'; return run("b", send, gotB); }
    if (slot === "c") return run("c", D ? Object.assign({ vin: D.vin }, send) : send, drawListing);
  });
  // ---- view a: before listing
  var aLast = null;
  function drawA(a){
    noteLines("a", a);
    aLast = a;
    if (a.ok === false) { $("a-out").innerHTML = rangePanel(a, { slot: "a" }); return; }
    $("a-out").innerHTML = (a.question ? "" : priorPanel(a)) + (a.question ? "" : carPhotoHtml(a)) + (a.question ? rangePanel(a, { slot: "a", chips: true }) : (idChips(a) ? '<div style="margin:0 0 16px">' + idChips(a) + "</div>" : "") + (a.range || a.thin ? rangePanel(a, { lines: "a" }) : "")) + ((a.vin || (a.history && a.history.length)) && !soldRows(a).length ? historyPanel(a) : "") +
      (!a.question && a.sales && a.sales.length ? '<section class="full-a"><h2>What cars like this sold for</h2>' + salesList(a, "a") + "</section>" : "") +
      '<div style="margin-top:20px"><button type="button" class="btn pri" id="a-list">List it</button></div>';
  }
  function runA(body){ $("a-out").innerHTML = '<p class="loading">Sam is reading the sales for this one.</p>'; run("a", body, drawA); }
  // ---- view b: setting a reserve
  var bAns = null;
  function gotB(a){ bAns = a; noteLines("b", a); if (!D && $("b-photo")) $("b-photo").innerHTML = carPhotoHtml(a); drawB(); }
  function drawB(){
    var v = Number(String($("b-res").value || "").replace(/[^\d]/g, ""));
    var a = bAns; if (!a) return;
    if (a.question || a.ok === false) { $("b-out").innerHTML = rangePanel(a, { slot: "b" }); return; }
    var last = newest(a).slice(0, 10).sort(function(x, y){ return y.price - x.price; });
    // (Sam, Oct 18 2026) one prominent line under the pill, counted from exactly the rows shown below against the reserve
    // as typed; no other claim.
    var at = v > 0 ? last.filter(function(s){ return s.price >= v; }).length : null;
    var resLine = at == null || !last.length ? "" : '<p class="res-line-big">' + (at === 0 ? "None of the " + last.length + " most recent sales reached " + usd(v) + "." : at + " of the " + last.length + " most recent sales reached " + usd(v) + " or more.") + "</p>";
    $("b-out").innerHTML = rangePanel(a, { price: v > 0 || !a.range ? v : null, lines: "b", who: "reserve", underPill: resLine }) + (last.length ?
      '<section class="full-a"><h2>What cars like this sold for</h2><p class="sub" style="margin:-6px 0 12px">The last ' + (last.length === 1 ? "sale" : last.length + " sales") + ", highest price first.</p>" + reserveList(last, { reserve: v }) +
      "</section>" : "");
  }
  // ---- view c: the listing (Sam, Oct 18 2026: c and d are one page; the card under the buy box, the sales list and
  // "This car before" under the gallery, once)
  var cAns = null;
  function drawListing(a){
    cAns = a; noteLines("c", a);
    if (!D && $("c-photo")) $("c-photo").innerHTML = carPhotoHtml(a);
    $("c-rail").innerHTML = priorPanel(a) + rangePanel(a, D ? { price: D.price, slot: "c", lines: "c" } : { slot: "c", lines: "c" });
    var lq = a && a.range && a.trend && a.trend.length ? a.trend.reduce(function(m, t){ return String(t.period) > String(m.period) ? t : m; }) : null;   // the latest quarter with eight or more sales, view d only
    $("d-sales").innerHTML = '<h2>What cars like this sold for</h2>' +
      (a && a.card ? (a.quarter ? '<div class="qrow">' + a.quarter + "</div>" : "") : (lq ? '<p class="qrow"><b>' + esc(lq.period.replace("-", " ")) + "</b> " + usd(lq.low) + " to " + usd(lq.high) + ", " + lq.count + " sales</p>" : "")) + salesList(a, "d") + foot(a);
    $("d-hist").innerHTML = D && !soldRows(a).length ? historyPanel(a) : "";
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-send]"); if (!b) return;
    var send = JSON.parse(b.getAttribute("data-send")), slot = b.getAttribute("data-slot");
    if (slot === "a") return runA(send);
    if (slot === "b") { $("b-out").innerHTML = '<p class="loading">Sam is reading the sales for this one.</p>'; return run("b", send, gotB); }
    if (slot === "c") return run("c", D ? Object.assign({ vin: D.vin }, send) : send, drawListing);
  });
  document.addEventListener("click", function(e){ if (e.target && e.target.id === "a-list") e.preventDefault(); });   // the demo's List it does nothing
  $("a-form").addEventListener("submit", function(e){ e.preventDefault(); var v = String($("a-q").value || "").trim(); if (v) runA({ q: v }); });
  $("b-res").addEventListener("input", function(){ var d = String(this.value || "").replace(/[^\d]/g, "").slice(0, 9); this.value = d ? Number(d).toLocaleString("en-US") : ""; drawB(); });
  run("b", { q: CAR }, gotB);
  run("c", D ? { q: CAR, vin: D.vin } : { q: CAR }, drawListing);
  var pre = new URLSearchParams(location.search).get("q") || CAR; $("a-q").value = pre; runA({ q: pre });
})();
`;

function phs(n) { let s = ""; for (let i = 0; i < n; i++) s += '<div class="ph" aria-hidden="true">Photo</div>'; return s; }

// The selected car (Sam, Oct 18 2026): car=<any year, make and model>, or a quick pick's number (0 to 5, the demo's six
// cars, api/partnerAnswer.js DEMO_CARS); the 2015 GT3 when absent or not plain car words. Only the 2015 GT3 carries
// listing detail (DUMMY); no other car gets an invented listing, mileage, price or photo.
export function carOf(v) {
  const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (/^\d$/.test(t) && Number(t) < DEMO_CARS.length) return DEMO_CARS[Number(t)];
  const hit = DEMO_CARS.find(c => c.toLowerCase() === t.toLowerCase()) || (t.toUpperCase() === DUMMY.vin ? DUMMY.q : null);
  // Any letters (accented too), digits and the usual punctuation of a car name (Sam, Oct 18 2026: "Citroën DS" or a
  // comma fell back to the GT3); anything else opens the 2015 GT3. The text is escaped wherever it is shown.
  return hit || (/^[\p{L}\p{N}][\p{L}\p{N} .,'&/()+-]{1,59}$/u.test(t) && /\p{L}/u.test(t) ? t : DEMO_CARS[0]);
}
const escHtml = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function pageHtml(view, carIn) {
  const v = view === "d" ? "c" : (/^[abc]$/.test(view || "") ? view : "a");   // the old d address opens the merged listing
  const car = carOf(carIn), hasListing = car === DUMMY.q;
  const carQ = k => `?view=${k}${car === DEMO_CARS[0] ? "" : "&car=" + encodeURIComponent(car)}`;
  const tab = (k, label) => `<a href="${escHtml(carQ(k))}"${k === v ? ' aria-current="page"' : ""}>${label}</a>`;
  // The car bar, on every view: any year, make and model. A new car reopens the
  // same view for that car (a plain form, no script needed).
  // (Sam, Oct 18 2026, for the eBay showing: the six example chips are gone at every width; the car box stays.)
  const carBar = `<div class="carbar"><div class="wrap"><form class="carpick" id="car-form" method="get" action="/preview"><input type="hidden" name="view" value="${v}"><label for="car-in">Car</label><input id="car-in" name="car" value="${escHtml(car)}" autocomplete="off" maxlength="60" placeholder="Year, make and model"><button class="btn sec" type="submit">Show</button></form></div></div>`;
  const d = DUMMY, miles = d.miles.toLocaleString("en-US");
  // The one hero image (views b and d), served by this handler behind the same crew gate (?img=hero).
  const hero = `<img class="hero-img" src="/preview?img=hero" width="${HERO_W}" height="${HERO_H}" alt="A black 2015 Porsche 911 GT3 coupe in a white studio, seen from the front three-quarter, with its fixed rear wing and grey wheels" decoding="async">`;
  // View c (Sam, Oct 17 2026): the hero in the main photo slot and the same image as the thumbnails (decorative copies).
  const heroThumbs = Array.from({ length: 5 }, () => `<img class="thumb-img" src="/preview?img=hero" alt="" aria-hidden="true" decoding="async">`).join("");
  const listing = (withRail, withHero, below) => `
  <div class="listing${below ? " with-below" : ""}">
    <div>
      ${withHero === "gallery" ? `<div class="gal"><div class="thumbs">${heroThumbs}</div>${hero}</div>` : withHero ? `<div class="gal gal-hero">${hero}</div>` : `<div class="gal"><div class="thumbs">${phs(5)}</div><div class="ph main-ph" aria-hidden="true">Placeholder photo</div></div>`}
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
      ${withRail ? '<div id="c-rail"><p class="loading">Sam is reading the sales for this one.</p></div>' : ""}
    </div>
    ${below ? `<div class="below-gal">${below}</div>` : ""}
  </div>`;
  // A car with no listing detail (Sam, Oct 18 2026): its name, a plain line saying what the page is, the card and the
  // recent sales with photos. No gallery, price, mileage, buy buttons or "This car before".
  const noListing = `
  <div class="listing with-below">
    <div><div id="c-photo"></div><h1>${escHtml(car)}</h1><p class="sub">Recent sales of cars like this one.</p></div>
    <div class="rail"><div id="c-rail"><p class="loading">Sam is reading the sales for this one.</p></div></div>
    <div class="below-gal"><div class="full" id="d-sales"><p class="loading">Sam is reading the sales for this one.</p></div><div class="full" id="d-hist"></div></div>
  </div>`;
  const desc = `<div class="desc below"><h2>About this car</h2><dl class="specs"><div><dt>Year</dt><dd>2015</dd></div><div><dt>VIN</dt><dd>${d.vin}</dd></div><div><dt>Mileage</dt><dd>${miles}</dd></div></dl></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>What these sell for</title><style>${CSS}${SELLS_FOR_CARD_CSS}</style></head><body>
<div class="demo-bar"><div class="wrap"><span>What these sell for, powered by GoAskSam.</span><nav class="tabs" aria-label="Views">${tab("a", "a. Before listing")}${tab("b", "b. Setting a reserve")}${tab("c", "c. On the listing")}</nav></div></div>
${carBar}
<header class="top"><div class="wrap"><div class="logo">Partner logo</div><div class="sbox">Search</div><button type="button" class="btn sec sbtn">Search</button></div></header>
<main>
<section class="sec-view wrap" id="view-a"${v === "a" ? "" : " hidden"}>
  <div class="lead"><h1>What these sell for</h1><p class="sub">Type any car or paste a VIN.</p>
  <form class="ask" id="a-form"><input id="a-q" name="q" autocomplete="off" placeholder="Year, make and model, or a VIN" aria-label="Car or VIN"><button class="btn pri" type="submit">Check</button></form>
  <div id="a-out" style="margin-top:22px"></div></div>
</section>
<section class="sec-view wrap" id="view-b"${v === "b" ? "" : " hidden"}>
  ${hasListing ? `<div class="b-hero">${hero}</div>` : `<div class="b-hero" id="b-photo"></div>`}
  <div class="lead"><h1>Set your reserve</h1><p class="sub">${hasListing ? `${d.title}, ${miles} miles` : escHtml(car)}</p>
  <div class="reserve"><label for="b-res">Reserve</label><span class="money">$<input id="b-res" inputmode="numeric" placeholder="0" aria-label="Reserve in dollars"></span></div>
  <div id="b-out"><p class="loading">Sam is reading the sales for this one.</p></div></div>
</section>
<section class="sec-view wrap" id="view-c"${v === "c" ? "" : " hidden"}>${hasListing ? listing(true, "gallery", `${desc}
  <div class="full" id="d-sales"><p class="loading">Sam is reading the sales for this one.</p></div>
  <div class="full" id="d-hist"></div>`) : noListing}</section>
</main>
<script>${JS.replace("__CAR__", JSON.stringify(car)).replace("__LISTING__", JSON.stringify(hasListing ? DUMMY : null)).replace("__CARS__", JSON.stringify(DEMO_CARS))}</script></body></html>`;
}

// The plain 404 every refused request gets (no cookie, a wrong, empty or missing code, too many attempts): the same body
// and headers whatever the reason, so nothing says a code exists.
const notFound = res => { res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.status(404).send("Not found"); };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const q = req.query || {};
  // THE ACCESS CODE (lib/_partnerAccess.js): ?k= (or ?code=) is checked, never echoed or logged, and the address bar is
  // cleared at once by the redirect; attempts are counted per address (lib/_ceilings.js partner_code).
  if (q.k != null || q.code != null) {
    if (isCrewRequest(req)) { res.setHeader("Location", "/preview"); return res.status(302).end(); }
    const lim = await checkCeiling(supabaseEnv(), req, "partner_code", { tool: "partner" }).catch(() => ({ ok: true }));
    const cookies = lim.ok && partnerCodeMatches(q.k != null ? q.k : q.code) ? partnerSetCookies() : null;
    if (!cookies) return notFound(res);
    res.setHeader("Set-Cookie", cookies);
    res.setHeader("Location", "/preview");
    return res.status(302).end();
  }
  if (!isCrewRequest(req) && !isPartnerRequest(req)) return notFound(res);
  if (req.query && req.query.img === "hero") {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(Buffer.from(HERO_JPEG_B64, "base64"));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageHtml(String((req.query && req.query.view) || "a"), req.query && req.query.car));
}
