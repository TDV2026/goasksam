// VIN history pages (Lane C, Oct 2026). Server-rendered, archive only, read only, zero OldCarsData.
//   GET /history/{year}-{make}-{model-slug}/{VIN}  -> the car page   (?slug=&vin=)
//   GET /history/{year}-{make}-{model-slug}        -> the hub page   (?slug=)
//   GET /vin/{VIN}                                 -> 301 to the car page (?vin=&go=1)
//   POST /api/history {action:"watch", vin, email} -> watch_requests (service role)
// Noindex for now (meta + X-Robots-Tag); the SEO scaffolding (title, description, canonical,
// JSON-LD) is in place for the later indexing job. Same tokens and fonts as One Box.
import { historyEnv, normVin, vinAppearances, carIdentity, oneBoxFor, parseHubSlug, hubVins, liveListing, addWatch, carSlug, familyOf, slugify } from "./_historyData.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";

const SITE = "https://goasksam.com";
const NOINDEX = true;
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
function bidPrice(a) { return money(a.bidUsd, a.nativeBid, a.currency); }
function resultText(a) { return a.kind === "sale" ? "Sold " + salePrice(a) : (bidPrice(a) ? "Bid to " + bidPrice(a) + ", not sold" : "Not sold"); }
function utm(url) { return url ? url + (url.includes("?") ? "&" : "?") + "utm_source=goasksam&utm_medium=history&utm_campaign=vin_page" : null; }
function jsonLd(o) { return '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, "\\u003c") + "</script>"; }

// ---------------------------------------------------------------- shared page chrome
const CSS = `
:root{--page:#F6F3EC;--card:#FFFFFF;--border:#DCD8CC;--ink:#15201A;--green:#1E4D38;--green-dk:#15372A;--sec:#5E6B63;--div:#E2DED3;--take:#F1F5F1;--live:#2E8B57;--ph:#E6E2D8;--soft:#3C4942;--tint:#EDF3EE;--tint-line:#D5E2D8;--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--page);color:var(--ink);font:400 17px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--green)}a:hover{color:var(--green-dk)}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.rail{position:fixed;left:0;top:0;bottom:0;width:240px;border-right:1px solid var(--div);padding:28px 24px;display:flex;flex-direction:column;gap:2px;background:var(--page)}
.rail .logo{font:600 26px/1.1 var(--serif);color:var(--ink);text-decoration:none;margin-bottom:22px}
.rail a.n{display:flex;align-items:center;min-height:44px;padding:0 14px;color:var(--sec);text-decoration:none;font-size:15px;border-left:2px solid transparent}
.rail a.n:hover{color:var(--ink)}.rail a.n.on{color:var(--green);font-weight:600;border-left-color:var(--green);padding-left:12px}
.mhead{display:none}
main{margin-left:240px;padding:36px 48px 64px;display:flex;justify-content:center}
.col{width:100%;max-width:860px;display:flex;flex-direction:column;gap:28px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px}
.eyebrow{font:600 13px/1.4 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--green)}
.muted{color:var(--sec)}
.top{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;align-items:start}
.top h1{margin:6px 0 4px;font:600 40px/1.12 var(--serif);letter-spacing:-.01em}
.vinline{font:500 15px/1.4 var(--sans);color:var(--sec);letter-spacing:.04em}
.answer{margin:14px 0 0;font:400 20px/1.45 var(--serif);color:var(--ink)}
figure{margin:0}
.photo{display:block;position:relative;height:220px;border-radius:14px;overflow:hidden;background:var(--ph);border:1px solid var(--border)}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{margin-top:6px;font:400 14px/1.4 var(--sans);color:var(--sec)}
.live{display:flex;align-items:center;gap:16px;padding:18px 22px;flex-wrap:wrap}
.live .dot{width:10px;height:10px;border-radius:50%;background:var(--live);flex:none}
.live .t{font:600 20px/1.3 var(--serif)}
section.card{padding:22px 26px}
.sh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
h2{margin:0;font:500 22px/1.25 var(--serif)}
table{width:100%;border-collapse:collapse;font-size:16px}
th{text-align:left;font:600 13px/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--sec);padding:0 12px 10px 0;border-bottom:1px solid var(--div)}
td{padding:14px 12px 14px 0;border-bottom:1px solid var(--div);vertical-align:top}
tr:last-child td{border-bottom:0}
td.r,th.r{text-align:right;padding-right:0}
td a{font-weight:500}
.sold{font-weight:600}
.thumb{display:block;width:72px;height:50px;border-radius:8px;overflow:hidden;background:var(--ph)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.samline{display:flex;gap:14px;align-items:flex-start}
.roundel{flex:none;width:34px;height:34px;border-radius:50%;border:1.5px solid var(--green);color:var(--green);font:600 10px/1 var(--sans);letter-spacing:.08em;display:flex;align-items:center;justify-content:center}
.samline p{margin:4px 0 0;font:400 20px/1.45 var(--serif)}
.anscard{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));overflow:hidden;padding:0}
.ans-main{grid-column:span 7;padding:26px 28px 24px;display:flex;flex-direction:column;gap:10px;border-right:1px solid var(--div)}
.anscard.solo .ans-main{grid-column:1 / -1;border-right:0}
.ans-main .eyebrow{color:var(--sec)}
.range{margin:0;font:600 40px/1.1 var(--serif);color:var(--green);font-variant-numeric:tabular-nums}
.range .to{font-weight:400;font-size:26px;color:var(--sec)}
.landed{margin:0;font:400 20px/1.4 var(--serif)}
.fresh{display:flex;gap:10px;align-items:center;font-size:14px;color:var(--sec)}
.fresh .d{width:8px;height:8px;border-radius:50%;background:var(--live);flex:none}
.ctx{margin:0;font-size:15px;color:var(--soft)}
.full{font-weight:600;font-size:15px;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center;align-self:flex-start}
.take{grid-column:span 3;padding:24px 22px;background:var(--take);display:flex;flex-direction:column;gap:8px}
.take .tag{font:600 13px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--green);display:flex;gap:10px;align-items:center}
.take .tag .roundel{width:28px;height:28px}
.take p{margin:0;font:400 17px/1.45 var(--serif);color:var(--soft)}
.faq dt{font:600 16px/1.4 var(--sans);margin-top:14px}.faq dt:first-child{margin-top:0}
.faq dd{margin:4px 0 0;font:400 17px/1.5 var(--serif);color:var(--soft)}
.btns{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;font:600 16px var(--sans);text-decoration:none;cursor:pointer;border:0}
.btn.p{background:var(--green);color:#fff}.btn.p:hover{background:var(--green-dk);color:#fff}
.btn.s{background:var(--card);color:var(--green);border:1.5px solid var(--green)}.btn.s:hover{background:var(--tint)}
.watch{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
.watch input{min-height:48px;min-width:260px;flex:1;border:1px solid var(--border);border-radius:12px;padding:0 16px;font:400 16px var(--sans);background:var(--card);color:var(--ink)}
.watch .msg{flex-basis:100%;font-size:15px;color:var(--sec);margin:0}
.links{display:flex;gap:8px 24px;flex-wrap:wrap;font-size:15px}
.links a{font-weight:600;min-height:44px;display:inline-flex;align-items:center}
.foot{font-size:14px;color:var(--sec);margin:0}
.notfound h1{font:600 36px/1.2 var(--serif);margin:0 0 10px}
@media (max-width:860px){
  .rail{display:none}
  .mhead{display:flex;justify-content:space-between;align-items:center;padding:20px 16px 0}
  .mhead a{font:600 22px/1 var(--serif);color:var(--ink);text-decoration:none}
  main{margin-left:0;padding:20px 16px 40px}
}
@media (max-width:640px){
  .col{gap:20px}
  .top{grid-template-columns:1fr;gap:16px}
  .top h1{font-size:30px}
  .answer{font-size:19px}
  .photo{height:200px}
  section.card{padding:18px 16px}
  table.stack thead{display:none}
  table.stack,table.stack tbody,table.stack tr,table.stack td{display:block;width:100%}
  table.stack tr{padding:12px 0;border-bottom:1px solid var(--div)}
  table.stack tr:last-child{border-bottom:0}
  table.stack td{border:0;padding:2px 0;text-align:left}
  table.stack td[data-l]::before{content:attr(data-l) ": ";color:var(--sec);font-size:14px}
  table.stack td.thumbcell{float:right;margin-left:12px}
  .anscard{display:flex;flex-direction:column}
  .ans-main{padding:18px;border-right:0;border-bottom:1px solid var(--div)}
  .anscard.solo .ans-main{border-bottom:0}
  .range{font-size:32px}.range .to{font-size:20px}
  .take{padding:16px 18px}
  .btns .btn{flex:1 1 100%}
  .watch input{min-width:0}
}`;
function page({ title, description, canonical, body, ld }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
${NOINDEX ? '<meta name="robots" content="noindex, follow">' : ""}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#1E4D38">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&amp;family=Instrument+Sans:wght@400;500;600&amp;display=swap">
<style>${CSS}</style>${(ld || []).map(jsonLd).join("")}</head><body>
<nav class="rail" aria-label="Main navigation"><a class="logo" href="/onebox">GoAskSam</a>
<a class="n" href="/onebox">Ask Sam</a><a class="n" href="/sell">Where to sell</a><a class="n on" href="#" aria-current="page">Car histories</a>
<a class="n" href="/how-sam-decides">How Sam decides</a><a class="n" href="/business">For business</a></nav>
<header class="mhead"><a href="/onebox">GoAskSam</a></header>
<main><div class="col">${body}</div></main></body></html>`;
}
function send(res, status, html, extra = {}) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (NOINDEX) res.setHeader("X-Robots-Tag", "noindex, follow");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=600, stale-while-revalidate=3600" : "no-store");
  for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.status(status).send(html);
}
function notFound(res, what) {
  send(res, 404, page({ title: "No auction history found | GoAskSam", body:
    `<section class="card notfound"><h1>No auction history for ${esc(what)}</h1><p class="muted">GoAskSam has no auction appearance of a car under this identifier. Real auction results only, so there is nothing to show.</p><p><a class="full" href="/onebox">Look up a car on One Box &#8594;</a></p></section>` }));
}
function photoHtml(img, url, house, alt, cls) {
  const inner = img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  return url ? `<a class="${cls}" href="${esc(utm(url))}" target="_blank" rel="noopener">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
}

// ---------------------------------------------------------------- One Box block (same render as One Box)
function windowText(d) { return /12 months|twelve/.test(d.windowLabel || "") ? "the last twelve months" : "the past two years"; }
function freshLine(d) {
  const f = d && d.freshness; if (!f) return "";
  if (f.through && f.archiveThrough && f.through < f.archiveThrough) {
    const archRecent = (Date.now() - Date.parse(f.archiveThrough + "T00:00:00Z")) <= 2 * 864e5;
    const model = d.resolvedCar && d.resolvedCar.model ? d.resolvedCar.model : "this car";
    return `<div class="fresh"><span class="d"></span>${esc((archRecent ? "Sales through last night." : "Sales through " + monthYear(f.archiveThrough) + ".") + " Latest " + model + " sale: " + monthYear(f.through) + ".")}</div>`;
  }
  const txt = f.mode === "house" ? (f.through ? "Auction results through " + monthYear(f.through) + "." : "") : f.lastNight ? "Real sales through last night. Nothing estimated." : f.through ? "Real sales through " + monthYear(f.through) + ". Nothing estimated." : "";
  return txt ? `<div class="fresh"><span class="d"></span>${esc(txt)}</div>` : "";
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders" };
function nounOf(d, id) {
  const v = d.resolvedCar || {};
  const fam = id.family || familyOf(v);
  const bw = v.bodyStyle ? BODY_PLURAL[String(v.bodyStyle).toLowerCase()] : "";
  return bw ? fam + " " + bw : fam + "s";
}
function oneBoxBlock(d, id, oneboxHref, ctx) {
  if (!d) return "";
  const link = `<a class="full" href="${esc(oneboxHref)}">See the full picture on One Box &#8594;</a>`;
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
  const { appearances, vinNorm, ok } = await vinAppearances(env, vin);
  if (!ok) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  if (!appearances.length) return notFound(res, "VIN " + vinNorm);
  const id = await carIdentity(appearances, vinNorm);
  if (!id) return notFound(res, "VIN " + vinNorm);
  if (slug !== id.slug || vin !== vinNorm) { res.setHeader("Location", `/history/${id.slug}/${vinNorm}`); return res.status(301).end(); }

  const name = [id.year, id.make, id.family].filter(Boolean).join(" ");
  const sales = appearances.filter(a => a.kind === "sale"), atts = appearances.filter(a => a.kind === "attempt");
  const lastSale = sales[0] || null, newest = appearances[0];
  // 2. THE ANSWER
  let answer;
  if (sales.length >= 2) answer = `This ${name} has sold at auction ${sales.length} times, most recently for ${salePrice(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
  else if (sales.length === 1) answer = `This ${name} sold once at auction, for ${salePrice(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
  else {
    const top = atts.filter(a => a.bidUsd || a.nativeBid).sort((x, y) => (y.bidUsd || 0) - (x.bidUsd || 0))[0];
    answer = `This ${name} has been offered at auction ${atts.length === 1 ? "once" : atts.length + " times"} without selling` + (top ? `; the highest bid was ${bidPrice(top)} ${on(top.house)} in ${monthYear(top.date)}.` : ".");
  }
  // 4. WHAT'S HAPPENED TO IT (facts only)
  let samLine = "";
  if (appearances.length >= 2) {
    if (newest.kind === "attempt" && sales.length) samLine = `Offered again in ${monthYear(newest.date)}` + (bidPrice(newest) ? `, bid to ${bidPrice(newest)}, not sold.` : `, not sold.`);
    else if (newest.kind === "sale" && sales.length >= 2) {
      const prev = sales[1];
      const dm = (newest.mileage && prev.mileage && newest.mileage >= prev.mileage) ? newest.mileage - prev.mileage : null;
      const dp = (newest.priceUsd && prev.priceUsd) ? newest.priceUsd - prev.priceUsd : null;
      const parts = [];
      if (dm != null) parts.push(`Up ${miles(dm) || "0"} miles`);
      if (dp != null) parts.push((dp >= 0 ? "+" : "-") + usd(Math.abs(dp)));
      if (parts.length) samLine = `${parts.join(" and ")} since it last sold in ${monthYear(prev.date)}.`;
    }
  }
  // 5. CARS LIKE IT (the engine, read-only) + LIVE NOW, in parallel
  const exactSale = lastSale && lastSale.priceUsd ? { price: lastSale.priceUsd, mileage: lastSale.mileage, soldDate: lastSale.date } : null;
  const [d, live] = await Promise.all([oneBoxFor(env, id, exactSale), liveListing(env, vinNorm)]);
  const n = poolCount(d);
  let ctx = "";
  if (n) ctx = (lastSale && lastSale.date >= windowStartIso(d) ? `One of ${n}` : `${n}`) + ` ${id.family} sales at auction in ${poolWindow(d)}.`;
  const oneboxCar = `/onebox?q=${encodeURIComponent(name)}`;
  // 7. QUESTIONS
  let cmp = "There are not enough recent sales to say.";
  if (lastSale && lastSale.priceUsd && d && d.tier === "result" && d.cluster) {
    const [lo, hi] = d.cluster, p = lastSale.priceUsd;
    cmp = p > hi ? `Above the range where most ${id.family} sales landed in ${windowText(d)} (${usd(lo)} to ${usd(hi)}).`
      : p < lo ? `Below the range where most ${id.family} sales landed in ${windowText(d)} (${usd(lo)} to ${usd(hi)}).`
      : `In the ${p >= (lo + hi) / 2 ? "upper" : "lower"} half of the range where most ${id.family} sales landed in ${windowText(d)} (${usd(lo)} to ${usd(hi)}).`;
  }
  const faq = [
    ["What did this car last sell for?", lastSale ? `${salePrice(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.` : `It has not sold at auction. ${answer.replace(/^This [^;]+; /, "").replace(/^t/, "T")}`],
    ["How many times has it been to auction?", `${timesWord(appearances.length).replace(/^./, c => c.toUpperCase())}: ${sales.length} sale${sales.length === 1 ? "" : "s"} and ${atts.length} unsold attempt${atts.length === 1 ? "" : "s"}.`],
    ["How does its last sale compare with others?", lastSale ? cmp : "It has not sold, so there is no sale to compare."]
  ];
  const photo = appearances.find(a => a.image) || null;
  const rows = appearances.map(a => `<tr><td data-l="Date">${esc(monShort(a.date))}</td><td data-l="Where">${a.url ? `<a href="${esc(utm(a.url))}" target="_blank" rel="noopener">${esc(a.house)}</a>` : esc(a.house)}</td><td data-l="Miles" class="r">${esc(miles(a.mileage))}</td><td class="r ${a.kind === "sale" ? "sold" : "muted"}">${esc(resultText(a))}</td></tr>`).join("");
  const hubHref = `/history/${id.slug}`;
  const body = `
<div class="top"><div><span class="eyebrow">${esc(id.family)} · Auction history</span>
<h1>${esc(name)} auction history</h1><div class="vinline">VIN ${esc(vinNorm)}</div>
<p class="answer">${esc(answer)}</p></div>
${photo ? `<figure>${photoHtml(photo.image, photo.url, photo.house, name, "photo")}<figcaption>Photo: ${esc(photo.house)}</figcaption></figure>` : ""}</div>
${live ? `<section class="card live" aria-label="Live now"><span class="dot"></span><div style="flex:1;min-width:200px"><div class="t">This car is at auction right now.</div>${live.platform || live.source ? `<div class="muted">${esc(houseNameSafe(live.platform || live.source))}</div>` : ""}</div>${live.url || live.source_url ? `<a class="btn s" href="${esc(utm(live.url || live.source_url))}" target="_blank" rel="noopener">View the auction</a>` : ""}</section>` : ""}
<section class="card"><div class="sh"><h2>Every time it&#8217;s been to auction</h2><span class="muted">${appearances.length} appearance${appearances.length === 1 ? "" : "s"}</span></div>
<table class="stack"><thead><tr><th>Date</th><th>Where</th><th class="r">Miles</th><th class="r">Result</th></tr></thead><tbody>${rows}</tbody></table></section>
${samLine ? `<div class="samline"><span class="roundel" aria-hidden="true">SAM</span><p>${esc(samLine)}</p></div>` : ""}
${oneBoxBlock(d, id, oneboxCar, ctx)}
<section class="card"><h2 style="margin-bottom:12px">Questions</h2><dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<div><div class="btns"><a class="btn p" href="${esc(oneboxCar)}">What&#8217;s yours worth?</a><a class="btn s" href="${esc(sellHref(id))}">Where I&#8217;d sell it</a><button type="button" class="btn s" id="watch-open" aria-expanded="false" aria-controls="watch">Watch this car</button></div>
<form class="watch" id="watch" hidden><label for="watch-email" style="position:absolute;left:-9999px">Email</label><input id="watch-email" type="email" required placeholder="Your email" autocomplete="email"><button class="btn p" type="submit">Watch it</button><p class="msg" id="watch-msg">I&#8217;ll email you when this car comes up at auction again.</p></form></div>
<div class="links"><a href="${esc(hubHref)}">All ${esc(id.year + " " + id.make + " " + id.family)} auction results &#8594;</a><a href="/onebox?q=${encodeURIComponent(vinNorm)}">This VIN on One Box &#8594;</a></div>
<p class="foot">Auction results from Bring a Trailer, Cars &amp; Bids, RM Sotheby&#8217;s, Gooding, Bonhams, Mecum, Collecting Cars and more. GoAskSam links to every sale; bidding happens on the auction site.</p>
<script>(function(){var b=document.getElementById("watch-open"),f=document.getElementById("watch"),m=document.getElementById("watch-msg");if(!b||!f)return;b.addEventListener("click",function(){f.hidden=!f.hidden;b.setAttribute("aria-expanded",f.hidden?"false":"true");if(!f.hidden)document.getElementById("watch-email").focus();});f.addEventListener("submit",function(e){e.preventDefault();var em=document.getElementById("watch-email").value.trim();if(!em)return;m.textContent="Saving...";fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"watch",vin:${JSON.stringify(vinNorm)},email:em})}).then(function(r){return r.json();}).then(function(j){m.textContent=j&&j.ok?"Done. I\\u2019ll email you when this car comes up at auction again.":"I couldn\\u2019t save that just now. Try again in a minute.";}).catch(function(){m.textContent="I couldn\\u2019t save that just now. Try again in a minute.";});});})();</script>`;
  const canonical = `${SITE}/history/${id.slug}/${vinNorm}`;
  const ld = [{
    "@context": "https://schema.org", "@type": "Vehicle", name, vehicleIdentificationNumber: vinNorm,
    brand: { "@type": "Brand", name: id.make }, model: id.family, vehicleModelDate: id.year ? String(id.year) : undefined,
    image: photo ? photo.image : undefined, url: canonical,
    offers: appearances.filter(a => a.kind === "sale" && a.priceUsd).map(a => ({ "@type": "Offer", price: Math.round(a.priceUsd), priceCurrency: "USD", availability: "https://schema.org/SoldOut", validFrom: a.date, url: a.url || undefined, seller: { "@type": "Organization", name: a.house } }))
  }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }];
  send(res, 200, page({ title: `${name} auction history, VIN ${vinNorm} | GoAskSam`, description: answer, canonical, body, ld }));
}
function houseNameSafe(s) { return String(s || ""); }

// ---------------------------------------------------------------- hub page
async function hubPage(req, res, env, slug) {
  const hub = parseHubSlug(slug);
  if (!hub) return notFound(res, slug);
  const list = await hubVins(env, hub);
  if (list == null) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  if (!list.length) return notFound(res, slug.replace(/-/g, " "));
  // Name + One Box family from the resolver on the slug text (same resolver One Box uses).
  let v = null;
  try { const r = await resolveVehicle(`${hub.year} ${hub.makeSlug.replace(/-/g, " ")} ${hub.modelSlug.replace(/-/g, " ")}`, {}); v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null; } catch {}
  const id = v && v.make && v.model ? { year: hub.year, make: v.make, model: v.model, trim: v.trim || null, family: familyOf(v), genCode: v.genCode || null, bodyStyle: v.bodyStyle || null, vehicle: { ...v, year: hub.year } }
    : { year: hub.year, make: hub.makeSlug.replace(/(^|-)\w/g, s => s.toUpperCase()).replace(/-/g, "-"), model: hub.modelSlug.toUpperCase(), family: hub.modelSlug.replace(/-/g, " ").toUpperCase(), vehicle: null };
  const name = [id.year, id.make, id.family].filter(Boolean).join(" ");
  const d = id.vehicle ? await oneBoxFor(env, id, null) : null;
  const n = poolCount(d);
  const salesN = list.reduce((k, g) => k + g.apps.filter(a => a.kind === "sale").length, 0);
  const ctx = (n ? `${n} ${id.family} sales at auction in ${poolWindow(d)}. ` : "") + `${list.length} individual ${list.length === 1 ? "car" : "cars"} by VIN below, with ${salesN} recorded sale${salesN === 1 ? "" : "s"}.`;
  const canonical = `${SITE}/history/${slug}`;
  const rows = list.slice(0, 200).map(g => {
    const a = g.last, ph = g.apps.find(x => x.image) || null;
    return `<tr><td class="thumbcell">${ph ? photoHtml(ph.image, ph.url, ph.house, g.vin, "thumb") : '<span class="thumb"></span>'}</td><td data-l="VIN"><a href="/history/${esc(slug)}/${esc(g.vin)}">${esc(g.vin)}</a></td><td data-l="Appearances" class="r">${g.apps.length}</td><td data-l="Last result" class="${a.kind === "sale" ? "sold" : "muted"}">${esc(resultText(a))}</td><td data-l="Date">${esc(monShort(a.date))}</td><td data-l="Miles" class="r">${esc(miles(a.mileage))}</td></tr>`;
  }).join("");
  const body = `
<div><span class="eyebrow">${esc(id.family)} · Auction results</span><h1 style="margin:6px 0 0;font:600 40px/1.12 var(--serif)">${esc(name)} auction results</h1></div>
${oneBoxBlock(d, id, `/onebox?q=${encodeURIComponent(name)}`, "")}
<p class="answer" style="margin:0">${esc(ctx)}</p>
<section class="card"><div class="sh"><h2>Every ${esc(name)} by VIN</h2><span class="muted">Newest sale first</span></div>
<table class="stack"><thead><tr><th><span style="position:absolute;left:-9999px">Photo</span></th><th>VIN</th><th class="r">Appearances</th><th>Last result</th><th>Date</th><th class="r">Miles</th></tr></thead><tbody>${rows}</tbody></table></section>
<p class="foot">Auction results from Bring a Trailer, Cars &amp; Bids, RM Sotheby&#8217;s, Gooding, Bonhams, Mecum, Collecting Cars and more. Photos link to each listing.</p>`;
  const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: `${name} auction results`, url: canonical,
    itemListElement: list.slice(0, 200).map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/history/${slug}/${g.vin}`, name: `${name}, VIN ${g.vin}` })) }];
  send(res, 200, page({ title: `${name} auction results | GoAskSam`, description: ctx, canonical, body, ld }));
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
