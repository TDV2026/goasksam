// VIN history pages (Lane C, Oct 2026). Server-rendered, archive only, read only, zero OldCarsData.
//   GET /history/{year}-{make}-{model-slug}/{VIN}  -> the car page   (?slug=&vin=)
//   GET /history/{year}-{make}-{model-slug}        -> the hub page   (?slug=)
//   GET /vin/{VIN}                                 -> 301 to the car page (?vin=&go=1)
//   POST /api/history {action:"watch", vin, email} -> watch_requests (service role)
// Indexing (Oct 2026): a car page is indexable when the car has at least one SALE with a photo, and is
// listed in /sitemap-vins.xml; every other page (no photographed sale, hubs, 404s) stays noindex.
//   GET /sitemap-vins.xml -> sitemap index (?sitemap=index);  /sitemap-vins-N.xml -> page N (?sitemap=N)
import { houseName, historyEnv, normVin, vinAppearances, carIdentity, oneBoxFor, parseHubSlug, hubVins, liveListing, addWatch, carSlug, familyOf, slugify, listingSaid, familySales, SITEMAP_PAGE, resolveText, cleanTitle, canonicalHub } from "./_historyData.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { PAGE_CSS as CSS, FONT_LINKS, railHtml, WHY_RESULT_HTML } from "./_chrome.js";
import { recordUsageEvent } from "./_usage.js";
import { logPageView } from "../lib/_pageview.js";

const SITE = "https://goasksam.com";
// Card design system (Oct 2026, the /buy cards): #FAF8F4 paper, near-black ink, one red (#D7262C),
// hairlines, 6px corners, Newsreader serif + Instrument Sans. The timeline is the page's main visual.
const STYLE = `:root{--page:#FAF8F4;--ink:#1A1A1A;--sec:#5F5A53;--div:#E4DFD6;--ph:#EFEBE4;--red:#D7262C;--line:#CFC8BC}
body{background:var(--page);color:var(--ink)}.rail{background:var(--page)}
.col{max-width:1000px}
.vhead{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:32px;align-items:start;margin-top:8px}
.vhead .eyebrow{display:block;font:500 13px/1.4 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec);margin-bottom:8px}
.vhead h1{margin:0;font:500 46px/1.08 var(--serif);letter-spacing:-.015em;color:var(--ink)}
.vhead .vinline{margin-top:8px;font:400 14px/1.4 var(--sans);color:var(--sec)}
.vhead .lead{margin:18px 0 0;font:400 22px/1.45 var(--serif);color:var(--ink)}
.vph{position:relative;margin:0;aspect-ratio:3/2;border-radius:6px;overflow:hidden;background:var(--ph)}
.vph a,.vph span.photo{display:block;width:100%;height:100%}
.vph img{width:100%;height:100%;object-fit:cover;display:block}
.vph .chip,.lcard .chip{position:absolute;top:12px;left:12px;background:rgba(255,255,255,.94);color:var(--ink);font:500 13px/1 var(--sans);padding:7px 10px;border-radius:4px}
.vph.nophoto{display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.vph.nophoto .nm{font:400 28px/1.25 var(--serif);color:var(--ink)}
.sec{border-top:1px solid var(--div);margin-top:34px;padding-top:24px}
.sec h2{margin:0 0 4px;font:500 26px/1.25 var(--serif);color:var(--ink)}
.sec .sub{margin:0 0 20px;font:400 14px/1.5 var(--sans);color:var(--sec)}
/* the timeline: oldest left, every appearance with house, date, result and miles */
.vtl{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));position:relative}
.vtl::before{content:"";position:absolute;top:7px;left:0;right:0;height:1px;background:var(--line)}
.vtl li{position:relative;padding:0 8px;display:flex;flex-direction:column;align-items:center;text-align:center}
.vtl li i{width:15px;height:15px;border-radius:50%;background:var(--ink);box-shadow:0 0 0 4px var(--page);position:relative;z-index:1}
.vtl li.unsold i{background:var(--page);border:2px solid var(--ink);width:15px;height:15px;box-sizing:border-box}
.vtl li.now i{background:var(--red)}
.vtl .d{margin-top:14px;font:500 15px/1.3 var(--sans);color:var(--ink)}
.vtl .r{margin-top:4px;font:400 19px/1.3 var(--serif);color:var(--ink)}
.vtl .h,.vtl .m{margin-top:3px;font:400 13px/1.4 var(--sans);color:var(--sec)}
.vtl .h a{color:var(--sec);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--line)}
.vtl li.now .r{color:var(--red)}
/* the spec's range rail */
.vrail .rrow{display:flex;align-items:center;gap:14px}
.vrail .rend{font:400 16px/1 var(--sans);font-variant-numeric:tabular-nums;white-space:nowrap}
.vrail .rline{position:relative;flex:1;height:2px;background:var(--line);border-radius:1px}
.vrail .band{position:absolute;top:-1px;height:4px;background:#3A3733;border-radius:2px}
.vrail .me{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--ink);box-shadow:0 0 0 2px var(--page)}
.vrail .melab{position:absolute;bottom:13px;transform:translateX(-50%);font:500 13px/1 var(--sans);white-space:nowrap}
.vrail.hasme{padding-top:28px}
.vrail .rmost{margin:14px 0 0;font:400 17px/1.4 var(--sans)}
.vrail .rcap{margin:3px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec)}
.vthin{margin:0;font:400 17px/1.5 var(--sans);color:var(--ink)}
/* back at auction now: the live card */
.lcard{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr);gap:22px;border:1px solid var(--div);border-radius:6px;padding:10px;align-items:center}
.lcard .lph{position:relative;display:block;aspect-ratio:3/2;border-radius:4px;overflow:hidden;background:var(--ph)}
.lcard .lph img{width:100%;height:100%;object-fit:cover;display:block}
.lcard .chips{position:absolute;top:12px;left:12px;display:flex;gap:6px;flex-wrap:wrap}
.lcard .chips .chip{position:static}
.lcard h3{margin:0;font:500 24px/1.2 var(--serif)}
.lcard h3 a{color:var(--ink);text-decoration:none}
.lcard .meta{margin:6px 0 0;font:400 15px/1.5 var(--sans);color:var(--sec)}
.lcard .go{display:inline-flex;margin-top:14px;min-height:44px;align-items:center;color:var(--red);font:500 16px/1 var(--sans);text-decoration:none}
.lcard .go:hover{text-decoration:underline;text-underline-offset:4px}
/* listing facts, other cars, questions */
.said{margin:0;font:italic 400 20px/1.45 var(--serif);border-left:2px solid var(--red);padding:2px 0 2px 16px}
.said .who{display:block;font:600 12px/1 var(--sans);font-style:normal;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:8px}
.others{list-style:none;margin:0;padding:0}
.others li{border-top:1px solid var(--div)}
.others li:first-child{border-top:0}
.others a{display:grid;grid-template-columns:60px minmax(0,1fr) auto;gap:4px 18px;padding:12px 0;color:var(--ink);text-decoration:none;font:400 15px/1.5 var(--sans);align-items:baseline}
.others a:hover .p{text-decoration:underline}
.others .p{font-weight:600}.others .m{color:var(--sec)}
.faq dt{margin-top:16px;font:500 19px/1.4 var(--serif)}
.faq dd{margin:4px 0 0;font:400 16px/1.55 var(--sans);color:var(--ink)}
.vlinks{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:30px;font:500 16px/1.4 var(--sans)}
.vlinks a,.vlinks button{color:var(--ink);background:none;border:0;padding:0;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:4px;text-decoration-color:#B9B2A6;min-height:44px}
.vlinks a.red{color:var(--red);text-decoration-color:var(--red)}
.watch{margin-top:10px}
.foot{margin-top:30px;font:400 13px/1.5 var(--sans);color:var(--sec)}
@media (max-width:760px){
  .vhead{grid-template-columns:1fr;gap:20px}
  .vhead h1{font-size:34px}
  .vhead .lead{font-size:19px}
  .vtl{grid-template-columns:1fr;gap:0}
  .vtl::before{top:0;bottom:0;left:7px;right:auto;width:1px;height:auto}
  .vtl li{display:grid;grid-template-columns:15px 1fr;column-gap:16px;align-items:start;text-align:left;padding:0 0 18px}
  .vtl li i{grid-row:1/span 4;margin-top:3px}
  .vtl .d{margin-top:0}
  .lcard{grid-template-columns:1fr}
  .others a{grid-template-columns:48px minmax(0,1fr);}
  .others a .p{grid-column:2}
}`;
const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUSES = new Set(["Gooding & Co", "RM Sotheby's", "Bonhams", "Broad Arrow", "Mecum", "Barrett-Jackson", "Sotheby's Motorsport"]);

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function usd(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
function money(amtUsd, native, cur) {
  if (amtUsd) return usd(amtUsd);
  if (native) { const s = ({ GBP: "£", EUR: "€" })[cur]; return s ? s + Math.round(native).toLocaleString("en-US") : Math.round(native).toLocaleString("en-US") + " " + cur; }
  return "";
}
function monthYear(d) { const p = String(d || "").split("-"); return p.length >= 2 && M[+p[1] - 1] ? M[+p[1] - 1] + " " + p[0] : ""; }
function monShort(d) { const p = String(d || "").split("-"); return p.length >= 2 && MS[+p[1] - 1] ? MS[+p[1] - 1] + " " + p[0] : ""; }
function on(house) { return (HOUSES.has(house) ? "at " : "on ") + house; }
function miles(n) { return n ? Math.round(n).toLocaleString("en-US") : ""; }
function timesWord(n) { return n === 1 ? "once" : n === 2 ? "twice" : n + " times"; }
function salePrice(a) { return money(a.priceUsd, a.nativePrice, a.currency); }
// Buyer's fee, only where the house's published fee is known (USD hammer): Bring a Trailer 5%
// ($250 to $7,500), Cars & Bids 4.5% ($225 to $4,500). Elsewhere the hammer stands alone.
const FEES = { "Bring a Trailer": [0.05, 250, 7500], "Cars & Bids": [0.045, 225, 4500] };
function withFee(a) {
  const f = FEES[a.house]; if (!f || !a.priceUsd || a.nativePrice) return null;
  return a.priceUsd + Math.min(f[2], Math.max(f[1], Math.round(a.priceUsd * f[0])));
}
function salePriceFee(a) { const w = withFee(a); return salePrice(a) + (w ? ` (${usd(w)} with buyer's fee)` : ""); }
function bidPrice(a) { return money(a.bidUsd, a.nativeBid, a.currency); }
function resultText(a) { return a.kind === "sale" ? "Sold " + salePriceFee(a) : (bidPrice(a) ? "Bid to " + bidPrice(a) + ", not sold" : "Not sold"); }
function utm(url) { return url ? url + (url.includes("?") ? "&" : "?") + "utm_source=goasksam&utm_medium=history&utm_campaign=vin_page" : null; }
function jsonLd(o) { return '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, "\\u003c") + "</script>"; }

// ---------------------------------------------------------------- shared page chrome
function page({ title, description, canonical, body, ld, index }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
${index ? '<meta name="robots" content="index, follow">' : '<meta name="robots" content="noindex, follow">'}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&amp;family=Instrument+Sans:wght@400;500;600&amp;display=swap">
<style>${CSS}${STYLE}</style>${(ld || []).map(jsonLd).join("")}</head><body>
${railHtml("history")}
<main><div class="col">${body}</div></main></body></html>`;
}
function send(res, status, html, extra = {}, index = false) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!index) res.setHeader("X-Robots-Tag", "noindex, follow");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=600, stale-while-revalidate=3600" : "no-store");
  for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.status(status).send(html);
}
function notFound(res, what) {
  send(res, 404, page({ title: "No auction history found | GoAskSam", body:
    `<section class="card notfound"><h1>No auction history for ${esc(what)}</h1><p class="muted">GoAskSam has no auction appearance of a car under this identifier. Real auction results only, so there is nothing to show.</p><p><a class="full" href="/onebox">Look up another car &#8594;</a></p></section>` }));
}
// A listing photo the house has since taken down (a 403 from its CDN) must never leave an empty
// tile: the hero tries the car's other photos, then removes the whole figure.
const PH_FALLBACK = "var f=this.closest('figure'),a=f?JSON.parse(f.getAttribute('data-alt')||'[]'):[];if(a.length){this.src=a.shift();f.setAttribute('data-alt',JSON.stringify(a));}else if(f){f.remove();}else{this.remove();}";
function photoHtml(img, url, house, alt, cls, hero) {
  const inner = img ? `<img src="${esc(img)}" alt="${esc(alt)}"${hero ? "" : ' loading="lazy"'} referrerpolicy="no-referrer" onerror="${hero ? PH_FALLBACK : "this.remove()"}">` : "";
  return url ? `<a class="${cls}" href="${esc(utm(url))}" target="_blank" rel="noopener">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
}

// ---------------------------------------------------------------- One Box block (same render as One Box)
function windowText(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "the last twelve months" : "the past two years"; }
function freshLine(d) {
  const f = d && d.freshness; if (!f) return "";
  if (f.through && f.archiveThrough && f.through < f.archiveThrough) {
    const archRecent = (Date.now() - Date.parse(f.archiveThrough + "T00:00:00Z")) <= 2 * 864e5;
    const model = d.resolvedCar && (d.resolvedCar.familyLabel || d.resolvedCar.model) ? (d.resolvedCar.familyLabel || d.resolvedCar.model) : "this car";
    return `<div class="fresh"><span class="d"></span>${esc((archRecent ? "Sales through last night." : "Sales through " + monthYear(f.archiveThrough) + ".") + " Latest " + model + " sale: " + monthYear(f.through) + ".")}</div>`;
  }
  const txt = f.mode === "house" ? (f.through ? "Auction results through " + monthYear(f.through) + "." : "") : f.lastNight ? "Real sales through last night." : f.through ? "Real sales through " + monthYear(f.through) + "." : "";
  return txt ? `<div class="fresh"><span class="d"></span>${esc(txt)}</div>` : "";
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders" };
function nounOf(d, id) {
  const v = d.resolvedCar || {};
  const fam = id.family || familyOf(v);
  const bw = v.bodyStyle ? BODY_PLURAL[String(v.bodyStyle).toLowerCase()] : "";
  // A family that already ends in its body word ("SLS AMG Roadster") is pluralised, never doubled.
  if (bw && new RegExp("\\b" + bw.replace(/s$/, "") + "$", "i").test(fam)) return fam + "s";
  return bw ? fam + " " + bw : fam + "s";
}
function oneBoxBlock(d, id, oneboxHref, ctx) {
  if (!d) return "";
  const link = "";   // no product name on public pages; the range block stands alone
  if (d.tier === "result" && d.cluster) {
    const take = d.samsTake && d.samsTake.sentence ? String(d.samsTake.sentence) : "";
    return `<section class="card anscard${take ? "" : " solo"}" aria-label="Cars like it"><div class="ans-main">
      <div class="eyebrow">${esc(nounOf(d, id) + " · sold in " + windowText(d))}</div>
      <p class="range">${esc(usd(d.cluster[0]))} <span class="to">to</span> ${esc(usd(d.cluster[1]))}</p>
      <p class="landed">Most sales landed here.</p>${freshLine(d)}${ctx ? `<p class="ctx">${esc(ctx)}</p>` : ""}${link}</div>
      ${take ? `<aside class="take"><div class="tag"><span class="roundel" aria-hidden="true">SAM</span>Sam&#8217;s Take</div><p>${esc(take)}</p></aside>` : ""}</section>`;
  }
  // No cluster: NO headline figure (rule 24). Lead with the count and let One Box show the sales.
  const n = d.poolN || (d.thin && d.thin.receipts ? d.thin.receipts.length : 0);
  if (!n) return "";
  const win = d.tier === "thin" ? "the past three years" : windowText(d);
  const line = n < 8 ? `Only ${n} ${nounOf(d, id)} ${n === 1 ? "has" : "have"} sold in ${win}, not enough for a range.` : `${nounOf(d, id)} sold too spread out in ${win} to call a typical price.`;
  return `<section class="card anscard solo" aria-label="Cars like it"><div class="ans-main"><div class="eyebrow">${esc(nounOf(d, id))}</div><p class="landed">${esc(line)}</p>${freshLine(d)}${ctx ? `<p class="ctx">${esc(ctx)}</p>` : ""}${link}</div></section>`;
}
function poolCount(d) { return d ? (d.tier === "thin" ? (d.thin && d.thin.receipts ? d.thin.receipts.length : 0) : (d.poolN || 0)) : 0; }
function poolWindow(d) { return d && d.tier === "thin" ? "the past three years" : (d ? windowText(d) : ""); }
function windowStartIso(d) { const days = d && d.tier === "thin" ? 1096 : (/twelve|12 months/.test((d && d.windowLabel) || "") ? 365 : 730); return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); }

// ---------------------------------------------------------------- car page
function sellHref(id) {
  const p = { src: "history", car: [id.year, id.make, id.family].filter(Boolean).join(" "), year: id.year, make: id.make, model: id.model, family: id.family, gen: id.genCode, body: id.bodyStyle };
  return "/sell?" + Object.keys(p).filter(k => p[k] != null && p[k] !== "").map(k => encodeURIComponent(k) + "=" + encodeURIComponent(p[k])).join("&");
}
async function carPage(req, res, env, slug, vin) {
  const { appearances, vinNorm, ok, source: dataSource } = await vinAppearances(env, vin);
  if (!ok) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  if (!appearances.length) return notFound(res, "VIN " + vinNorm);
  const id = await carIdentity(appearances, vinNorm);
  if (!id) return notFound(res, "VIN " + vinNorm);
  if (slug !== id.slug || vin !== vinNorm) { res.setHeader("Location", `/history/${id.slug}/${vinNorm}`); return res.status(301).end(); }

  const name = [id.year, id.make, id.family].filter(Boolean).join(" ");
  const sales = appearances.filter(a => a.kind === "sale"), atts = appearances.filter(a => a.kind === "attempt");
  const lastSale = sales[0] || null, newest = appearances[0];
  const asOf = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  // 2. THE ANSWER
  let answer;
  if (sales.length >= 2) answer = `This ${name} has sold at auction ${timesWord(sales.length)}, most recently for ${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
  else if (sales.length === 1) answer = `This ${name} sold once at auction, for ${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
  else {
    const top = atts.filter(a => a.bidUsd || a.nativeBid).sort((x, y) => (y.bidUsd || 0) - (x.bidUsd || 0))[0];
    answer = `This ${name} has been offered at auction ${atts.length === 1 ? "once" : atts.length + " times"} without selling` + (top ? `; the highest bid was ${bidPrice(top)} ${on(top.house)} in ${monthYear(top.date)}.` : ".");
  }
  // THE LEAD (search rule 1): one dated sentence telling the car's story from its own record.
  // The car's story in one dated sentence, oldest first, the live listing last: "This 1992 Jaguar XJS V12
  // sold for $11,000 on Bring a Trailer in August 2022, was bid to $8,300 there in September 2026
  // without selling, and is back at auction now on Hemmings, as of October 7, 2026."
  const storyOf = live => {
    const liveHouse = live ? houseName(live.source) : null, nowClause = live ? `is back at auction now ${on(liveHouse)}` : null;
    const join = cs => cs.length === 1 ? cs[0] : cs.length === 2 ? cs.join(" and ") : cs.slice(0, -1).join(", ") + ", and " + cs[cs.length - 1];
    if (appearances.length <= 3) {
      let prev = null;
      const cs = appearances.slice().reverse().map(a => {
        const where = prev && prev === a.house ? "there" : on(a.house); prev = a.house;
        return a.kind === "sale" ? `sold for ${salePrice(a)} ${where} in ${monthYear(a.date)}` : `was ${bidPrice(a) ? `bid to ${bidPrice(a)}` : "offered"} ${where} in ${monthYear(a.date)} without selling`;
      });
      if (nowClause) cs.push(nowClause);
      return `This ${name} ${join(cs)}, as of ${asOf}.`;
    }
    const head = `has been to auction ${appearances.length} times and ${sales.length ? `sold ${timesWord(sales.length)}, most recently for ${salePrice(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}` : "never sold"}`;
    return `This ${name} ${nowClause ? head + ", and " + nowClause : head}, as of ${asOf}.`;
  };
  // 4. WHAT'S HAPPENED TO IT (facts only)
  let samLine = "";
  if (appearances.length >= 2) {
    if (newest.kind === "attempt" && sales.length) samLine = `Offered again in ${monthYear(newest.date)}` + (bidPrice(newest) ? `, bid to ${bidPrice(newest)}, not sold.` : `, not sold.`);
    else if (newest.kind === "sale" && sales.length >= 2) {
      const prev = sales[1];
      const dm = (newest.mileage && prev.mileage && newest.mileage >= prev.mileage) ? newest.mileage - prev.mileage : null;
      const dp = (newest.priceUsd && prev.priceUsd) ? newest.priceUsd - prev.priceUsd : null;
      // Plain words, never a plus or minus sign: "3,850 more miles and $9,862 more than it last sold for."
      const money = dp == null ? "" : dp > 0 ? `${usd(dp)} more than it last sold for` : dp < 0 ? `${usd(-dp)} less than it last sold for` : "the same price it last sold for";
      if (dm != null && money) samLine = `${miles(dm) || "0"} more miles and ${money}.`;
      else if (dm != null) samLine = `${miles(dm) || "0"} more miles than when it last sold.`;
      else if (money) samLine = `${money.charAt(0).toUpperCase() + money.slice(1)}.`;
    }
  }
  // 5. CARS LIKE IT (the engine, read-only) + LIVE NOW, in parallel
  const exactSale = lastSale && lastSale.priceUsd ? { price: lastSale.priceUsd, mileage: lastSale.mileage, soldDate: lastSale.date } : null;
  const [d, live, said, others] = await Promise.all([oneBoxFor(env, id, exactSale), liveListing(env, vinNorm), listingSaid(env, vinNorm).catch(() => null), familySales(env, id, vinNorm).catch(() => null)]);
  const story = storyOf(live);
  const n = poolCount(d);
  let ctx = "";
  if (n) ctx = (lastSale && lastSale.date >= windowStartIso(d) ? `One of ${n}` : `${n}`) + ` ${id.family} sales at auction in ${poolWindow(d)}.`;
  const oneboxCar = `/onebox?q=${encodeURIComponent(name)}`;
  // 7. QUESTIONS
  let cmp = "There are not enough recent sales to say.";
  if (lastSale && lastSale.priceUsd && d && d.tier === "result" && d.cluster) {
    const [lo, hi] = d.cluster, p = lastSale.priceUsd;
    // Position words that stay fair near an edge: within 2% of an end reads "right at" it.
    const span = hi - lo, near = 0.02;
    const where = p < lo ? ((lo - p) / lo <= near ? "Right at the bottom of" : "Below")
      : p > hi ? ((p - hi) / hi <= near ? "Right at the top of" : "Above")
      : (span > 0 && (p - lo) / span <= 0.25) ? "Near the bottom of"
      : (span > 0 && (hi - p) / span <= 0.25) ? "Near the top of" : "In the middle of";
    cmp = `${where} the range where most ${id.family} sales landed in ${windowText(d)} (${usd(lo)} to ${usd(hi)}).`;
  }
  // Questions answered only with THIS car's own facts; a question whose answer would be a template (the
  // same words on every page) is left out.
  const topBid = atts.filter(a => a.bidUsd || a.nativeBid).sort((x, y) => (y.bidUsd || 0) - (x.bidUsd || 0))[0];
  const nowLine = live ? ` It is back at auction now ${on(houseName(live.source))}.` : "";
  const countAns = (sales.length && atts.length ? `${timesWord(appearances.length).replace(/^./, c => c.toUpperCase())}: ${sales.length === 1 ? "one sale" : sales.length + " sales"} and ${atts.length === 1 ? "one unsold attempt" : atts.length + " unsold attempts"}.`
    : sales.length ? `${timesWord(appearances.length).replace(/^./, c => c.toUpperCase())}, and it sold ${appearances.length === 1 ? "that time" : "each time"}.`
    : `${timesWord(appearances.length).replace(/^./, c => c.toUpperCase())}, without selling.`) + nowLine;
  const faq = [
    lastSale ? ["What did this car last sell for?", `${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`]
      : topBid ? ["What is the highest bid this car has had?", `${bidPrice(topBid)} ${on(topBid.house)} in ${monthYear(topBid.date)}, and it did not sell.`] : null,
    ["How many times has it been to auction?", countAns],
    lastSale && d && d.tier === "result" && d.cluster ? ["How does its last sale compare with others?", cmp] : null
  ].filter(Boolean);
  const photo = appearances.find(a => a.image) || null;
  const altPhotos = [...new Set(appearances.map(a => a.image).filter(Boolean))].filter(u => !photo || u !== photo.image);
  const hubHref = `/history/${id.slug}`;
  // Up to the model (the all-years hub) as well as this year's.
  const modelHub = `/history/${[slugify(id.make), slugify(id.family)].join("-")}`;
  const body = `
<header class="vhead"><div><span class="eyebrow">Auction history</span>
<h1>${esc(name)}</h1><div class="vinline">VIN ${esc(vinNorm)}</div>
<p class="lead" data-lead-sentence>${esc(story)}</p></div>
${photo ? `<figure class="vph" data-alt="${esc(JSON.stringify(altPhotos))}">${photoHtml(photo.image, photo.url, photo.house, name, "photo", true)}<span class="chip">Photo: ${esc(photo.house)}</span></figure>` : `<figure class="vph nophoto"><span class="nm">${esc(name)}</span></figure>`}</header>
${timelineHtml(appearances, live)}
${specRailHtml(d, id, lastSale)}
${live ? liveCardHtml(live, name) : ""}
${saidHtml(said)}
${othersHtml(others, id)}
<section class="sec"><h2>Questions</h2><dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<nav class="vlinks" aria-label="More"><a href="${esc(modelHub)}">All ${esc(id.make + " " + id.family)} auction results</a><a href="${esc(hubHref)}">Every ${esc(id.year + " " + id.make + " " + id.family)} by VIN</a><a class="red" href="${esc(sellHref(id))}">Where to sell it</a><button type="button" id="watch-open" aria-expanded="false" aria-controls="watch">Watch this car</button></nav>
<form class="watch" id="watch" hidden><label for="watch-email" style="position:absolute;left:-9999px">Email</label><input id="watch-email" type="email" required placeholder="Your email" autocomplete="email"><button class="btn p" type="submit">Watch it</button><p class="msg" id="watch-msg">Sam will email you if this car comes up at auction again.</p></form>
${WHY_RESULT_HTML}
<p class="foot">GoAskSam links to every sale. Bidding happens on the auction site.</p>
<script>(function(){var b=document.getElementById("watch-open"),f=document.getElementById("watch"),m=document.getElementById("watch-msg");if(!b||!f)return;b.addEventListener("click",function(){f.hidden=!f.hidden;b.setAttribute("aria-expanded",f.hidden?"false":"true");if(!f.hidden)document.getElementById("watch-email").focus();});f.addEventListener("submit",function(e){e.preventDefault();var em=document.getElementById("watch-email").value.trim();if(!em)return;m.textContent="Saving...";fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"watch",vin:${JSON.stringify(vinNorm)},email:em})}).then(function(r){return r.json();}).then(function(j){m.textContent=j&&j.ok?"Done. Sam will email you if this car comes up at auction again.":"That didn\\u2019t save just now. Try again in a minute.";}).catch(function(){m.textContent="That didn\\u2019t save just now. Try again in a minute.";});});})();</script>`;
  const canonical = `${SITE}/history/${id.slug}/${vinNorm}`;
  const body2 = body + `<!-- data: ${dataSource || "archive"} -->`;
  const ld = [{
    "@context": "https://schema.org", "@type": "Vehicle", name, vehicleIdentificationNumber: vinNorm,
    mileageFromOdometer: lastSale && lastSale.mileage ? { "@type": "QuantitativeValue", value: Math.round(lastSale.mileage), unitCode: "SMI" } : undefined,
    color: (appearances.find(a => a.color) || {}).color || undefined, bodyType: id.bodyStyle || undefined,
    brand: { "@type": "Brand", name: id.make }, model: id.family, vehicleModelDate: id.year ? String(id.year) : undefined,
    image: photo ? photo.image : undefined, url: canonical,
    offers: appearances.filter(a => a.kind === "sale" && a.priceUsd).map(a => ({ "@type": "Offer", price: Math.round(a.priceUsd), priceCurrency: "USD", availability: "https://schema.org/SoldOut", validFrom: a.date, url: a.url || undefined, seller: { "@type": "Organization", name: a.house } }))
  }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
  // Indexable when the car has 2+ appearances that EACH carry a price (sold or bid), a real identifier
  // and a proper name (carIdentity already refuses non-vehicles). The photo requirement was dropped
  // (Oct 2026): a photoless page shows the plain serif panel, never a broken image, and still earns a
  // place in sitemap-vins.xml. This gate MUST match the VIN sitemap's gate so index state and sitemap
  // membership stay coherent (search-rules rule 7). Single-priced-appearance pages stay noindex.
  const pricedCount = appearances.filter(a => a.priceUsd || a.bidUsd || a.nativeBid).length;
  const index = pricedCount >= 2 && realVin(vinNorm) && !!(id.family && id.make) && !(await deadPhotos(env)).vins.has(vinNorm);
  await logPageView(env, { path: canonical.replace(SITE, ""), referer: req.headers["referer"] || req.headers["referrer"], userAgent: req.headers["user-agent"] });
  send(res, 200, page({ title: `${name}, VIN ${vinNorm}: auction history`, description: story, canonical, body: body2, ld, index }), {}, index);
}
// THE TIMELINE (the page's main visual): every appearance, oldest left, with its date, result, house
// and miles; sold dots filled, unsold hollow, the live listing last in red.
function timelineHtml(apps, live) {
  const items = apps.slice().reverse().map(a => {
    const res = a.kind === "sale" ? `Sold ${salePrice(a)}` : (bidPrice(a) ? `Bid to ${bidPrice(a)}, not sold` : (/withdraw/i.test(String(a.status || "")) ? "Withdrawn" : "Not sold"));
    const house = a.url ? `<a href="${esc(utm(a.url))}" target="_blank" rel="noopener">${esc(a.house)}</a>` : esc(a.house);
    return `<li class="${a.kind === "sale" ? "sold" : "unsold"}"><i></i><span class="d">${esc(monShort(a.date))}</span><span class="r">${esc(res)}</span><span class="h">${house}</span>${a.mileage ? `<span class="m">${esc(miles(a.mileage))} miles</span>` : ""}</li>`;
  });
  if (live) items.push(`<li class="now"><i></i><span class="d">Now</span><span class="r">Live</span><span class="h">${esc(houseName(live.source))}</span>${live.mileage ? `<span class="m">${esc(miles(live.mileage))} miles</span>` : ""}</li>`);
  return `<section class="sec" aria-label="Every time it has been to auction"><h2>Every time it&#8217;s been to auction</h2><p class="sub">${apps.length} appearance${apps.length === 1 ? "" : "s"}${live ? ", and live now" : ""}. Oldest first.</p><ol class="vtl" style="--n:${items.length}">${items.join("")}</ol></section>`;
}
// THE SPEC'S RANGE RAIL: the same rule as the /buy card. Only with a real range (the engine's thin and
// spread rules passed); the ends are the spec's low and high, the dark band where the middle half sold;
// this car's own sale is a dot only when it was within 24 months and inside the ends. Otherwise one
// honest line, never a figure.
function specRailHtml(d, id, lastSale) {
  if (!d) return "";
  const fam = nounOf(d, id), win = windowText(d);
  if (d.tier === "result" && Array.isArray(d.cluster) && Array.isArray(d.span) && d.span[1] > d.span[0]) {
    const [lo, hi] = d.span, pc = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
    const a = pc(d.cluster[0]), b = pc(d.cluster[1]);
    const recent = lastSale && lastSale.priceUsd && (Date.now() - Date.parse(lastSale.date + "T00:00:00Z")) <= 730 * 864e5 && lastSale.priceUsd >= lo && lastSale.priceUsd <= hi;
    const dot = recent ? `<i class="me" style="left:${pc(lastSale.priceUsd).toFixed(1)}%"></i><span class="melab" style="left:${pc(lastSale.priceUsd).toFixed(1)}%">This car, ${esc(monShort(lastSale.date))}</span>` : "";
    const n = poolCount(d);
    return `<section class="sec" aria-label="What cars like it sold for"><h2>What ${esc(fam)} sell for</h2><p class="sub">${n ? `${n} sales in ${esc(win)}.` : ""}</p>
<div class="vrail${recent ? " hasme" : ""}"><div class="rrow"><span class="rend">${usd(lo)}</span><span class="rline"><i class="band" style="left:${a.toFixed(1)}%;width:${Math.max(1.5, b - a).toFixed(1)}%"></i>${dot}</span><span class="rend">${usd(hi)}</span></div>
<p class="rmost">Most sold between ${usd(d.cluster[0])} and ${usd(d.cluster[1])}</p><p class="rcap">What this spec has sold for, ${/twelve/.test(win) ? "last 12 months" : "last 2 years"}</p></div></section>`;
  }
  const n = poolCount(d);
  if (!n) return "";
  const line = n < 8 ? `Only ${n} ${fam} ${n === 1 ? "has" : "have"} sold in ${poolWindow(d)}, too few to mark a range.` : `${fam} sold too spread out in ${poolWindow(d)} to mark one range.`;
  return `<section class="sec" aria-label="What cars like it sold for"><h2>What ${esc(fam)} sell for</h2><p class="vthin">${esc(line)}</p></section>`;
}
// BACK AT AUCTION NOW: the live listing as a /buy card (photo with chips, title, facts, link out).
function timeLeft(iso) {
  const t = new Date(iso).getTime(); if (!iso || isNaN(t)) return "";
  const ms = t - Date.now(); if (ms <= 0) return "Ending now";
  const h = ms / 36e5; if (h < 1) return Math.max(1, Math.round(ms / 6e4)) + " min left";
  if (h < 24) { const hh = Math.floor(h); return hh + (hh === 1 ? " hour left" : " hours left"); }
  const dd = Math.floor(h / 24); return dd + (dd === 1 ? " day left" : " days left");
}
function liveCardHtml(l, name) {
  const house = houseName(l.source);
  const chips = [[house, timeLeft(l.end_time)].filter(Boolean).join(" · ")].concat(l.has_reserve === false ? ["No reserve"] : []);
  const bid = l.current_bid_usd ? "Bid " + usd(l.current_bid_usd) : (l.current_bid ? "Bid " + Math.round(l.current_bid).toLocaleString("en-US") + " " + (l.currency || "") : "No bids yet");
  const meta = [bid, l.location || "", l.mileage ? miles(l.mileage) + " miles" : ""].filter(Boolean);
  const img = l.photo_url ? `<img src="${esc(l.photo_url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return `<section class="sec" aria-label="Back at auction now"><h2>Back at auction now</h2><p class="sub">This car is live ${house === "Hemmings" || /^(Mecum|Bonhams|Gooding|RM|Broad|Barrett)/.test(house) ? "at" : "on"} ${esc(house)}.</p>
<article class="lcard"><a class="lph" href="${esc(utm(l.url))}" target="_blank" rel="noopener">${img}<span class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</span></a>
<div><h3><a href="${esc(utm(l.url))}" target="_blank" rel="noopener">${esc(name)}</a></h3><p class="meta">${meta.map(esc).join(" · ")}</p><a class="go" href="${esc(utm(l.url))}" target="_blank" rel="noopener">See the live auction</a></div></article></section>`;
}
// WHAT THE LISTING SAID: facts from the sale's own record, worded by Sam; never the house's text.
// Dated and past tense: these are what the listing reported at the time of that sale.
function saidHtml(s) {
  if (!s) return "";
  const parts = [];
  if (s.miles) parts.push(`${miles(s.miles)} miles`);
  if (s.programme) parts.push(`a ${s.programme} specification`);
  if (s.report) parts.push(`a ${s.report} report`);
  if (s.owners) parts.push(s.owners === 1 ? "one owner" : `${s.owners} owners`);
  for (const m of s.markers || []) parts.push(m);
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return `<section class="sec"><h2>What the listing said</h2><p class="said"><span class="who">Sam</span>${esc(`When it sold in ${monthYear(s.date)}, the listing gave ${list}.`)}</p></section>`;
}
// OTHER {FAMILY} THAT SOLD: a plain list, newest first, each row to that car's own page.
function othersHtml(o, id) {
  if (!o || !o.rows.length) return "";
  const li = o.rows.map(r => `<li><a href="${esc(r.href)}"><span>${esc(r.year || "")}</span><span class="m">${esc([r.miles ? miles(r.miles) + " miles" : "", monShort(r.date), r.house].filter(Boolean).join(" · "))}</span><span class="p">${esc(money(r.priceUsd, r.nativePrice, r.currency))}</span></a></li>`).join("");
  const base = o.gen && !String(id.family).includes(o.gen) ? o.gen + " " + id.family : id.family;
  const fam = /[a-z]s$/.test(base) ? base : /\d$/.test(base) || /[a-z]$/i.test(base) && !/\b[A-Z0-9]{2,4}$/.test(base) ? base + "s" : base + " cars";
  return `<section class="sec"><h2>Other ${esc(fam)} that sold</h2><p class="sub">Newest first. Each one opens its own history.</p><ul class="others">${li}</ul>${o.more ? `<p style="margin:12px 0 0"><a href="${esc(o.allHref)}">All ${esc(id.make + " " + id.family)} sales</a></p>` : ""}</section>`;
}
// LIVE NOW slot (only when live_listings holds this vin_norm as live): bid, house, end time in PT.
function endsPT(iso) {
  const d = new Date(iso); if (!iso || isNaN(d)) return "";
  const tz = "America/Los_Angeles";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(" AM", "am").replace(" PM", "pm");
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "ending now";
  if (d.toLocaleDateString("en-US", { timeZone: tz }) === new Date().toLocaleDateString("en-US", { timeZone: tz })) return "ends today " + time + " PT";
  if (diff < 6.5 * 864e5) return "ends " + d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz }) + " " + time + " PT";
  return "ends " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}
function liveNowHtml(l) {
  const house = houseName(l.source);
  const bid = l.current_bid_usd ? "Bid " + usd(l.current_bid_usd) : (l.current_bid ? "Bid " + Math.round(l.current_bid).toLocaleString("en-US") + " " + (l.currency || "") : "No bids yet");
  const sub = [bid + " on " + house, endsPT(l.end_time)].filter(Boolean).join(" · ");
  return `<section class="card live" aria-label="Live now"><span class="dot" aria-hidden="true"></span><div style="flex:1;min-width:200px"><div class="t">This car is at auction right now.</div><div class="muted">${esc(sub)}</div></div>${l.url ? `<a class="btn s" href="${esc(utm(l.url))}" target="_blank" rel="noopener">View the auction</a>` : ""}</section>`;
}

// ---------------------------------------------------------------- hub page
async function hubPage(req, res, env, slug) {
  const hub = parseHubSlug(slug);
  if (!hub) return notFound(res, slug);
  // An alias hub ("ford-shelby-gt500") is the same page as its canonical one ("shelby-gt500").
  { const c = canonicalHub(hub.makeSlug.replace(/-/g, " "), hub.modelSlug.replace(/-/g, " "));
    const canon = [hub.year, slugify(c.make), slugify(c.family)].filter(Boolean).join("-");
    if (canon !== slug && slugify(c.make) !== hub.makeSlug) { res.setHeader("Location", `/history/${canon}`); res.setHeader("Cache-Control", "public, s-maxage=3600"); return res.status(301).end(); } }
  const list = await hubVins(env, hub);
  if (list == null) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  if (!list.length) return notFound(res, slug.replace(/-/g, " "));
  // Name + One Box family from the resolver on the slug text (same resolver One Box uses).
  let v = null;
  try { const r = await resolveVehicle([hub.year, hub.makeSlug.replace(/-/g, " "), hub.modelSlug.replace(/-/g, " ")].filter(Boolean).join(" "), {}); v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null; } catch {}
  // Unresolvable model: the known make plus the model as listed, cleaned ("AC Cobra", "Fiat Dino Spider").
  const fbMake = v && v.make && v.model ? null : await knownMake(hub.makeSlug.replace(/-/g, " "));
  const id = v && v.make && v.model ? { year: hub.year, make: v.make, model: v.model, trim: v.trim || null, family: familyOf(v), genCode: v.genCode || null, bodyStyle: v.bodyStyle || null, vehicle: { ...v, year: hub.year } }
    : { year: hub.year, make: fbMake || hub.makeSlug.replace(/(^|-)\w/g, s => s.toUpperCase()), model: cleanModelName(hub.modelSlug), family: cleanModelName(hub.modelSlug), vehicle: null };
  const name = [id.year, id.make, id.family].filter(Boolean).join(" ");
  const d = id.vehicle ? await oneBoxFor(env, id, null) : null;
  const n = poolCount(d);
  const salesN = list.reduce((k, g) => k + g.apps.filter(a => a.kind === "sale").length, 0);
  const ctx = (n ? `${n} ${id.family} sales at auction in ${poolWindow(d)}. ` : "") + `${list.length} individual ${list.length === 1 ? "car" : "cars"} by VIN below, with ${salesN} recorded sale${salesN === 1 ? "" : "s"}.`;
  const canonical = `${SITE}/history/${slug}`;
  const rows = list.slice(0, 200).map(g => {
    const a = g.last, ph = g.apps.find(x => x.image) || null;
    // An all-years list links each VIN to its own year's page; the car page 301s if the year differs.
    const cy = hub.year || (g.apps.find(x => x.year) || {}).year;
    const carHref = hub.year ? `/history/${slug}/${g.vin}` : (cy && id.family ? `/history/${[cy, slugify(id.make), slugify(id.family)].join("-")}/${g.vin}` : `/vin/${g.vin}`);
    return `<tr><td class="thumbcell">${ph ? photoHtml(ph.image, ph.url, ph.house, g.vin, "thumb") : '<span class="thumb"></span>'}</td><td data-l="VIN"><a href="${esc(carHref)}">${esc(g.vin)}</a></td><td data-l="Appearances" class="r">${g.apps.length}</td><td data-l="Last result" class="${a.kind === "sale" ? "sold" : "muted"}">${esc(resultText(a))}</td><td data-l="Date">${esc(monShort(a.date))}</td><td data-l="Miles" class="r">${esc(miles(a.mileage))}</td></tr>`;
  }).join("");
  const body = `
<div><span class="eyebrow">${esc(id.family)} · Auction results</span><h1 style="margin:6px 0 0;font:600 40px/1.12 var(--serif)">${esc(name)} auction results</h1></div>
${oneBoxBlock(d, id, `/onebox?q=${encodeURIComponent(name)}`, "")}
<p class="answer" style="margin:0">${esc(ctx)}</p>
<section class="card"><div class="sh"><h2>Every ${esc(name)} by VIN</h2><span class="muted">Newest sale first</span></div>
<table class="stack"><thead><tr><th><span style="position:absolute;left:-9999px">Photo</span></th><th>VIN</th><th class="r">Appearances</th><th>Last result</th><th>Date</th><th class="r">Miles</th></tr></thead><tbody>${rows}</tbody></table></section>
${WHY_RESULT_HTML}
<p class="foot">GoAskSam links to every sale. Bidding happens on the auction site.</p>`;
  const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: `${name} auction results`, url: canonical,
    itemListElement: list.slice(0, 200).map((g, i) => ({ "@type": "ListItem", position: i + 1, url: hub.year ? `${SITE}/history/${slug}/${g.vin}` : `${SITE}/vin/${g.vin}`, name: `${name}, VIN ${g.vin}` })) }];
  const hubIndex = !hub.year && list.some(g => g.apps.some(a => a.image)) && (!!id.vehicle || (!!fbMake && salesN >= 5 && !!id.family && !GENERIC_MODEL.test(id.family))) && !(await deadPhotos(env)).hubs.has(slug);
  send(res, 200, page({ title: `${name} auction results and sale prices`, description: ctx, canonical, body, ld, index: hubIndex }), {}, hubIndex);
}

// ---------------------------------------------------------------- handler
export default async function handler(req, res) {
  const env = historyEnv();
  if (!env) return send(res, 503, page({ title: "GoAskSam", body: "<p>Unavailable.</p>" }));
  if (req.method === "POST") {
    const b = req.body || {};
    if (b.action !== "watch") return res.status(400).json({ ok: false });
    const vinNorm = normVin(b.vin), email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    if (!vinNorm || vinNorm.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, reason: "invalid" });
    const ok = await addWatch(env, vinNorm, email);
    return res.status(ok ? 200 : 500).json({ ok });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  const q = req.query || {};
  if (q.sitemap) return sitemap(res, env, String(q.sitemap));
  if (q.photocheck) return photoCheck(req, res, env, String(q.photocheck));
  const slug = String(q.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const vin = q.vin ? normVin(q.vin) : "";
  try {
    if (q.go && vin) {
      // /vin/{VIN}: 301 to the canonical car URL (404 when the VIN has no appearance or is not a car).
      const { appearances, ok } = await vinAppearances(env, vin);
      if (!ok) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
      const id = appearances.length ? await carIdentity(appearances, vin) : null;
      if (!id) return notFound(res, "VIN " + vin);
      res.setHeader("Location", `/history/${id.slug}/${vin}`);
      res.setHeader("Cache-Control", "public, s-maxage=3600");
      return res.status(301).end();
    }
    if (slug && vin) return await carPage(req, res, env, slug, vin);
    if (slug) return await hubPage(req, res, env, slug);
    return notFound(res, "that page");
  } catch (e) {
    console.error("history page failed:", (e && e.stack) || e);
    return send(res, 500, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  }
}

// ---------------------------------------------------------------- VIN sitemap
// /sitemap-vins.xml lists the pages; each page holds up to 1000 archive sales that carry a photo, one
// URL per VIN, at its canonical /history/{year-make-family}/{VIN} (slug from the same resolver the
// car page uses). Cached at the edge for a day.
const slugCache = new Map();
async function slugFor(title, year) {
  const k = String(year || "") + "|" + title;
  if (slugCache.has(k)) return slugCache.get(k);
  const v = await resolveText(cleanTitle(title));
  const out = v ? [Number(v.year) || year, slugify(v.make), slugify(familyOf(v))].filter(Boolean).join("-") : null;
  slugCache.set(k, out); if (slugCache.size > 20000) slugCache.delete(slugCache.keys().next().value);
  return out;
}
const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function supabaseSelectSafe(env, q) { try { const r = await fetch(`${env.supabaseUrl}/rest/v1/${q}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }); return r.ok ? r.json() : "err " + r.status; } catch { return "err"; } }
// A real vehicle identifier: letters and digits, at least one digit, 5 to 17 characters (pre-1981
// chassis numbers included). Words the archive stored in the VIN field ("RETAINED") are not.
// A make the resolver knows ("ac" -> "AC"), cached. Used when a hub's model can't be resolved.
const makeCache = new Map();
async function knownMake(words) {
  const k = String(words || "").toLowerCase().trim(); if (!k) return null;
  if (makeCache.has(k)) return makeCache.get(k);
  let mk = null;
  try { const r = await resolveVehicle(k, {}); mk = r && r.vehicle && r.vehicle.make && squashW(r.vehicle.make) === squashW(k) ? r.vehicle.make : null; } catch {}
  makeCache.set(k, mk); return mk;
}
const squashW = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// The model as listed, cleaned: no chassis/lot/VIN text, no long numbers, consistent capitals
// (all-caps words become "Dino Spider", codes with digits stay upper: "XK120", "300SL").
function cleanModelName(words) {
  const t = String(words || "").replace(/\b(chassis|frame|engine|lot|vin|serial)\b.*$/i, " ").replace(/\bno\.?\s*\S+/ig, " ").split(/[\s-]+/).filter(w => w && !/\d{5,}/.test(w));
  // A lone letter before a number is one code: "F 100" -> "F-100", "K 5" -> "K-5".
  const merged = []; for (let i = 0; i < t.length; i++) { if (/^[a-z]$/i.test(t[i]) && /^\d+$/.test(t[i + 1] || "")) { merged.push(t[i] + "-" + t[i + 1]); i++; } else merged.push(t[i]); }
  return merged.map(w => /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").trim();
}
// A fallback model that is only a generic word ("Model") is a truncated listing, not a model.
const GENERIC_MODEL = /^(model|car|coupe|sedan|roadster|convertible|truck)$/i;
function realVin(v) { return /^[A-Z0-9]{5,17}$/.test(v) && /\d/.test(v); }
function saneFamily(f) { return !!f && f.length <= 32 && !/\d{6,}|\bvin\b|frame|engine no|chassis/i.test(f); }
// One pass over vin_index (cached 6h per instance): every VIN classified into the rollout groups.
let ROLL = null, ROLL_AT = 0;
async function rollout(env) {
  if (ROLL && Date.now() - ROLL_AT < 6 * 3600e3) return ROLL;
  const per = new Map();
  for (let page = 0; page < 200; page++) {
    const rows = await supabaseSelectSafe(env, `vin_index?select=vin_norm,year,make,model_family,listing_title,photo_url,vehicle_type,appearance_date,result&order=id.asc&limit=1000&offset=${page * 1000}`);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) {
      const g = per.get(r.vin_norm) || { n: 0, sold: 0, photo: false, photos: [], title: null, year: null, make: null, family: null, type: null, date: "" };
      g.n++; if (r.photo_url) { g.photo = true; if (g.photos.length < 4 && !g.photos.includes(r.photo_url)) g.photos.push(r.photo_url); } if (/^sold/i.test(String(r.result || ""))) g.sold++;
      if (String(r.appearance_date || "") >= g.date) { g.date = String(r.appearance_date || ""); g.title = r.listing_title || g.title; g.year = r.year || g.year; g.make = r.make || g.make; g.family = r.model_family || g.family; }
      g.type = g.type || r.vehicle_type; per.set(r.vin_norm, g);
    }
    if (rows.length < 1000) break;
  }
  const counts = { vins: per.size, non_vehicle: 0, junk_identifier: 0, no_proper_title: 0, no_photo: 0, single_noindex: 0, multi_candidates: 0, multi_indexable: 0, hubs_indexable: 0 };
  const hubs = new Map(), multi = [], merged = new Map();
  for (const [vin, g] of per) {
    if (g.type && g.type !== "car") { counts.non_vehicle++; continue; }
    if (!realVin(vin)) { counts.junk_identifier++; continue; }
    if (!g.title || !g.make || !saneFamily(g.family)) { counts.no_proper_title++; continue; }
    if (!g.photo) counts.no_photo++;   // tracked for reporting; a photoless car is still indexable (priced-appearance gate below)
    const c = canonicalHub(g.make, g.family);
    const raw = slugify(g.make) + "-" + slugify(g.family), hk = slugify(c.make) + "-" + slugify(c.family);
    if (raw !== hk) { merged.set(raw, hk); }
    const h = hubs.get(hk) || { vins: 0, sales: 0, make: c.make, photos: [] }; h.vins++; h.sales += g.sold; if (h.photos.length < 3 && g.photos[0]) h.photos.push(g.photos[0]); hubs.set(hk, h);
    if (g.n >= 2) { counts.multi_candidates++; multi.push({ vin, g }); } else counts.single_noindex++;
  }
  const vins = [];
  for (let i = 0; i < multi.length; i += 40) {
    // The page's OWN identity check and canonical slug, so the sitemap never lists a page that 404s
    // or redirects: same appearances, same carIdentity, same index rule as carPage.
    const part = await Promise.all(multi.slice(i, i + 40).map(async ({ vin, g }) => {
      try {
        const { appearances, ok } = await vinAppearances(env, vin);
        // Same gate as carPage: 2+ appearances each carrying a price (sold or bid); photo not required.
        if (!ok || appearances.filter(a => a.priceUsd || a.bidUsd || a.nativeBid).length < 2) return null;
        const id = await carIdentity(appearances, vin);
        // Photos in the order the page tries them: the page's own hero first, then the others.
        const photos = [...new Set(appearances.map(a => a.image).filter(Boolean).concat(g.photos))].slice(0, 4);
        return id && id.family && id.make ? { vin, loc: `${SITE}/history/${id.slug}/${vin}`, lastmod: g.date.slice(0, 10), photos } : null;
      } catch { return null; }
    }));
    for (const u of part) if (u) vins.push(u); else counts.no_proper_title++;
  }
  // Hubs pass the hub page's own rule: the resolver names the make and model, or (fallback) the make
  // is known and the hub has 5+ sales, named from the archive's model, cleaned.
  const hubKeys = [...hubs.keys()], okHubs = [], fallback = [];
  for (let i = 0; i < hubKeys.length; i += 50) {
    const part = await Promise.all(hubKeys.slice(i, i + 50).map(async k => {
      const v = await resolveText(k.replace(/-/g, " ")); if (v && v.make && v.model) return { k };
      const h = hubs.get(k); if (h.sales < 5) return null;
      const mk = await knownMake(h.make); if (!mk) return null;
      const model = cleanModelName(k.slice(slugify(h.make).length + 1)); if (!model || GENERIC_MODEL.test(model)) return null;
      return { k, fb: mk + " " + model };
    }));
    for (const x of part) if (x) { okHubs.push(x.k); if (x.fb) fallback.push({ url: `/history/${x.k}`, name: x.fb, sales: hubs.get(x.k).sales }); }
  }
  counts.multi_indexable = vins.length; counts.hubs_candidates = hubs.size; counts.hubs_indexable = okHubs.length; counts.hubs_fallback_named = fallback.length;
  counts.hubs_alias_merged = merged.size;
  const hubPhotos = {}; for (const k of okHubs) hubPhotos[k] = hubs.get(k).photos;
  ROLL = { counts, hubs: okHubs.sort(), hubPhotos, vins, fallback, merged: [...merged.entries()].map(([from, to]) => ({ from: "/history/" + from, to: "/history/" + to })) }; ROLL_AT = Date.now();
  return ROLL;
}
async function sitemap(res, env, which) {
  if (which === "stats") { const r = await rollout(env); res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); return res.status(200).send(JSON.stringify({ ...r.counts, fallback_examples: r.fallback.slice().sort((a, b) => b.sales - a.sales).slice(0, 20), alias_merged: r.merged }, null, 1)); }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
  const r = await rollout(env);
  const urlset = list => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list.map(u => `<url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  if (which === "index") {
    const pages = Math.max(1, Math.ceil(r.vins.length / SITEMAP_PAGE));   // (dead-photo pages are dropped inside each page)
    const items = [`<sitemap><loc>${SITE}/sitemap-vins-hubs.xml</loc></sitemap>`].concat(Array.from({ length: pages }, (_, k) => `<sitemap><loc>${SITE}/sitemap-vins-${k + 1}.xml</loc></sitemap>`)).join("");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`);
  }
  const dead = await deadPhotos(env);
  if (which === "hubs") return res.status(200).send(urlset(r.hubs.filter(h => !dead.hubs.has(h)).map(h => ({ loc: `${SITE}/history/${h}` }))));
  const page = Math.max(1, Number(which) || 1) - 1;
  return res.status(200).send(urlset(r.vins.filter(u => !dead.vins.has(u.vin)).slice(page * SITEMAP_PAGE, (page + 1) * SITEMAP_PAGE)));
}

// ---------------------------------------------------------------- nightly hero-photo check
// Houses take listing photos down (their CDN then answers 403). Every night each indexable VIN page
// and hub has its photos checked (HEAD, about 8 a second, bounded); a page whose photos are ALL dead
// leaves the sitemap and turns noindex until a later check finds a live one. Only a hard 403/404/410
// counts as dead: a timeout or 5xx is "unknown" and never drops a page. State: app_config
// history_photo_dead. Two Vercel crons (vins, hubs), each well under the function limit.
let DEAD = null, DEAD_AT = 0;
async function deadPhotos(env) {
  if (DEAD && Date.now() - DEAD_AT < 600e3) return DEAD;
  const rows = await supabaseSelectSafe(env, "app_config?key=eq.history_photo_dead&select=value&limit=1");
  const v = Array.isArray(rows) && rows[0] ? (typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value) : {};
  DEAD = { raw: v || {}, vins: new Set((v && v.vins) || []), hubs: new Set((v && v.hubs) || []) }; DEAD_AT = Date.now();
  return DEAD;
}
async function photoStatus(url) {
  const go = async (method) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    try { const r = await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: method === "GET" ? { Range: "bytes=0-0", "User-Agent": "GoAskSam photo check" } : { "User-Agent": "GoAskSam photo check" } }); return r.status; }
    catch { return 0; } finally { clearTimeout(t); }
  };
  let st = await go("HEAD");
  if (st === 405 || st === 501 || st === 0) st = await go("GET");
  return st >= 200 && st < 400 ? "live" : (st === 403 || st === 404 || st === 410) ? "dead" : "unknown";
}
async function photoCheck(req, res, env, kind) {
  const cronSecret = process.env.CRON_SECRET, probeKey = process.env.PROBE_KEY || process.env.OPS_KEY;
  const isCron = !!cronSecret && String(req.headers["authorization"] || "") === `Bearer ${cronSecret}`;
  if (!isCron && (!probeKey || String((req.query && req.query.key) || "") !== probeKey)) return res.status(401).json({ error: "Unauthorized." });
  if (kind !== "vins" && kind !== "hubs") return res.status(400).json({ error: "photocheck=vins|hubs" });
  const t0 = Date.now(), BUDGET = 240e3, RATE = 8;
  const r = await rollout(env);
  const items = kind === "vins" ? r.vins.map(u => ({ key: u.vin, photos: u.photos || [] })) : r.hubs.map(h => ({ key: h, photos: r.hubPhotos[h] || [] }));
  const prev = await deadPhotos(env), deadSet = new Set(kind === "vins" ? prev.vins : prev.hubs);
  const counts = { kind, pages: items.length, live: 0, live_after_fallback: 0, dead: 0, unknown: 0, unchecked: 0, restored: 0, newly_dead: 0, requests: 0 };
  let next = 0, started = 0;
  const worker = async () => {
    while (next < items.length) {
      if (Date.now() - t0 > BUDGET) return;
      const it = items[next++];
      let state = "dead", firstDead = false;
      if (!it.photos.length) state = "unknown";
      for (let i = 0; i < it.photos.length; i++) {
        // pace: about RATE requests a second across all workers
        const wait = started / RATE * 1000 - (Date.now() - t0); if (wait > 0) await new Promise(x => setTimeout(x, wait));
        started++; counts.requests++;
        const st = await photoStatus(it.photos[i]);
        if (st === "live") { state = "live"; if (i > 0) firstDead = true; break; }
        if (st === "unknown") state = "unknown";
      }
      if (state === "live") { counts.live++; if (firstDead) counts.live_after_fallback++; if (deadSet.delete(it.key)) counts.restored++; }
      else if (state === "dead") { counts.dead++; if (!deadSet.has(it.key)) counts.newly_dead++; deadSet.add(it.key); }
      else counts.unknown++;   // unknown keeps the previous state
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  counts.unchecked = Math.max(0, items.length - next);
  counts.ms = Date.now() - t0;
  const value = { ...prev.raw, [kind]: [...deadSet], [kind + "_checked_at"]: new Date().toISOString(), [kind + "_counts"]: counts };
  const w = await fetch(`${env.supabaseUrl}/rest/v1/app_config?on_conflict=key`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "history_photo_dead", value }]) });
  DEAD = null;
  await recordUsageEvent({ event_type: "history_photo_check", route: "history_photo_check", status: w.ok ? "ok" : "write_failed", oldcarsdata_metered_requests: 0, metadata: counts }, env.supabaseUrl, env.supabaseKey).catch(() => {});
  return res.status(200).json({ ok: w.ok, ...counts });
}
