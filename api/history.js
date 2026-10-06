// VIN history pages (Lane C, Oct 2026). Server-rendered, archive only, read only, zero OldCarsData.
//   GET /history/{year}-{make}-{model-slug}/{VIN}  -> the car page   (?slug=&vin=)
//   GET /history/{year}-{make}-{model-slug}        -> the hub page   (?slug=)
//   GET /vin/{VIN}                                 -> 301 to the car page (?vin=&go=1)
//   POST /api/history {action:"watch", vin, email} -> watch_requests (service role)
// Indexing (Oct 2026): a car page is indexable when the car has at least one SALE with a photo, and is
// listed in /sitemap-vins.xml; every other page (no photographed sale, hubs, 404s) stays noindex.
//   GET /sitemap-vins.xml -> sitemap index (?sitemap=index);  /sitemap-vins-N.xml -> page N (?sitemap=N)
import { houseName, historyEnv, normVin, vinAppearances, carIdentity, oneBoxFor, parseHubSlug, hubVins, liveListing, addWatch, carSlug, familyOf, slugify, listingSaid, familySales, SITEMAP_PAGE, resolveText, cleanTitle } from "./_historyData.js";
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { PAGE_CSS as CSS, FONT_LINKS, railHtml, WHY_RESULT_HTML } from "./_chrome.js";

const SITE = "https://goasksam.com";
// Restyle (Oct 2026): the Buy design. Cream paper, serif, hairlines not boxes, no badges, larger photo.
const STYLE = `:root{--page:#F6F1E8;--ink:#23211E;--sec:#7A746B;--div:#E2DACB;--ph:#E9E2D4}
body{background:var(--page);color:var(--ink)}.rail{background:var(--page)}
.col{max-width:900px}
.card,section.card,.card.anscard,.card.live{background:none;border:0;border-top:1px solid var(--div);border-radius:0;box-shadow:none}
section.card{padding:22px 0 0}
.top{grid-template-columns:1fr;gap:18px}
.top h1{font:400 40px/1.15 var(--serif);letter-spacing:-.005em}
.eyebrow{color:var(--sec);letter-spacing:.12em}
.photo{height:auto;aspect-ratio:1.75;border:0;border-radius:0}
figcaption{font-size:13px}
.answer{font:400 22px/1.45 var(--serif)}
h2{font:400 24px/1.3 var(--serif)}
.roundel,.take .tag .roundel{display:none}
.samline p{font:400 21px/1.45 var(--serif)}
.ans-main{border-right:1px solid var(--div);padding-left:0}
.anscard.solo .ans-main{border-right:0}
.take{background:none}
table.stack th{font:500 12px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec)}
.faq dt{font:400 19px/1.4 var(--serif)}
.faq dd{font:400 16px/1.55 var(--sans);color:var(--ink)}
.btns{gap:28px}
.btn,.btn.s,.btn.p{background:none;border:0;padding:0;min-height:44px;border-radius:0;color:var(--ink);font:500 16px/1.4 var(--sans);text-decoration:underline;text-underline-offset:4px}
.btn:hover,.btn.s:hover{background:none;color:var(--green)}
.said{margin:0;font:400 19px/1.5 var(--serif)}
.others{list-style:none;margin:0;padding:0}
.others li{border-top:1px solid var(--div);padding:10px 0}
.others li:first-child{border-top:0}
.others a{display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--ink);text-decoration:none;font:400 15px/1.5 var(--sans)}
.others a:hover .p{text-decoration:underline}
.others .p{font-weight:600}.others .m{color:var(--sec)}
@media (max-width:640px){.top h1{font-size:30px}.answer{font-size:19px}.ans-main{border-right:0}}`;
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
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#1E4D38">
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
    const model = d.resolvedCar && (d.resolvedCar.familyLabel || d.resolvedCar.model) ? (d.resolvedCar.familyLabel || d.resolvedCar.model) : "this car";
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
  // 2. THE ANSWER
  let answer;
  if (sales.length >= 2) answer = `This ${name} has sold at auction ${sales.length} times, most recently for ${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
  else if (sales.length === 1) answer = `This ${name} sold once at auction, for ${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.`;
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
  const [d, live, said, others] = await Promise.all([oneBoxFor(env, id, exactSale), liveListing(env, vinNorm), listingSaid(env, vinNorm).catch(() => null), familySales(env, id, vinNorm).catch(() => null)]);
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
  const faq = [
    ["What did this car last sell for?", lastSale ? `${salePriceFee(lastSale)} ${on(lastSale.house)} in ${monthYear(lastSale.date)}.` : `It has not sold at auction. ${answer.replace(/^This [^;]+; /, "").replace(/^t/, "T")}`],
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
${live ? liveNowHtml(live) : ""}
<section class="card"><div class="sh"><h2>Every time it&#8217;s been to auction</h2><span class="muted">${appearances.length} appearance${appearances.length === 1 ? "" : "s"}</span></div>
<table class="stack"><thead><tr><th>Date</th><th>Where</th><th class="r">Miles</th><th class="r">Result</th></tr></thead><tbody>${rows}</tbody></table></section>
${samLine ? `<div class="samline"><span class="roundel" aria-hidden="true">SAM</span><p>${esc(samLine)}</p></div>` : ""}
${saidHtml(said)}
${oneBoxBlock(d, id, oneboxCar, ctx)}
${othersHtml(others, id)}
<section class="card"><h2 style="margin-bottom:12px">Questions</h2><dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<div><div class="btns"><a class="btn s" href="${esc(sellHref(id))}">Where to sell it</a><button type="button" class="btn s" id="watch-open" aria-expanded="false" aria-controls="watch">Watch this car</button></div>
<form class="watch" id="watch" hidden><label for="watch-email" style="position:absolute;left:-9999px">Email</label><input id="watch-email" type="email" required placeholder="Your email" autocomplete="email"><button class="btn p" type="submit">Watch it</button><p class="msg" id="watch-msg">Sam will email you if this car comes up at auction again.</p></form></div>
<div class="links"><a href="${esc(hubHref)}">All ${esc(id.year + " " + id.make + " " + id.family)} auction results &#8594;</a></div>
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
  // Staged rollout: a car page is indexable only with 2+ auction appearances, a photo, a real
  // identifier and a proper name (carIdentity already refuses non-vehicles). Single-appearance pages
  // stay noindex for now (still reachable from the hubs).
  const index = appearances.length >= 2 && appearances.some(a => a.image) && realVin(vinNorm) && !!(id.family && id.make);
  send(res, 200, page({ title: `${name} (${vinNorm}) auction history and sale price`, description: answer, canonical, body: body2, ld, index }), {}, index);
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
  return `<section class="card"><h2 style="margin-bottom:10px">What the listing said</h2><p class="said">${esc(`When it sold in ${monthYear(s.date)}, the listing gave ${list}.`)}</p></section>`;
}
// OTHER {FAMILY} THAT SOLD: a plain list, newest first, each row to that car's own page.
function othersHtml(o, id) {
  if (!o || !o.rows.length) return "";
  const li = o.rows.map(r => `<li><a href="${esc(r.href)}"><span>${esc(r.year || "")}</span><span class="m">${esc(r.miles ? miles(r.miles) + " miles" : "miles not listed")}</span><span class="p">${esc(money(r.priceUsd, r.nativePrice, r.currency))}</span><span class="m">${esc(monShort(r.date))}</span><span class="m">${esc(r.house)}</span></a></li>`).join("");
  return `<section class="card"><div class="sh"><h2>Other ${esc(id.family)} that sold</h2><span class="muted">Newest first</span></div><ul class="others">${li}</ul>${o.more ? `<p style="margin:12px 0 0"><a href="${esc(o.allHref)}">All ${esc(id.make + " " + id.family)} sales &#8594;</a></p>` : ""}</section>`;
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
  const list = await hubVins(env, hub);
  if (list == null) return send(res, 503, page({ title: "GoAskSam", body: `<section class="card"><p>Sam&#8217;s catching his breath, try again in a minute.</p></section>` }));
  if (!list.length) return notFound(res, slug.replace(/-/g, " "));
  // Name + One Box family from the resolver on the slug text (same resolver One Box uses).
  let v = null;
  try { const r = await resolveVehicle([hub.year, hub.makeSlug.replace(/-/g, " "), hub.modelSlug.replace(/-/g, " ")].filter(Boolean).join(" "), {}); v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null; } catch {}
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
  const hubIndex = !hub.year && !!id.vehicle && list.some(g => g.apps.some(a => a.image));
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
function realVin(v) { return /^[A-Z0-9]{5,17}$/.test(v) && /\d/.test(v); }
function saneFamily(f) { return !!f && f.length <= 32 && !/\d{6,}|\bvin\b|frame|engine no|chassis/i.test(f); }
// One pass over vin_index (cached 6h per instance): every VIN classified into the rollout groups.
let ROLL = null, ROLL_AT = 0;
async function rollout(env) {
  if (ROLL && Date.now() - ROLL_AT < 6 * 3600e3) return ROLL;
  const per = new Map();
  for (let page = 0; page < 200; page++) {
    const rows = await supabaseSelectSafe(env, `vin_index?select=vin_norm,year,make,model_family,listing_title,photo_url,vehicle_type,appearance_date&order=id.asc&limit=1000&offset=${page * 1000}`);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) {
      const g = per.get(r.vin_norm) || { n: 0, photo: false, title: null, year: null, make: null, family: null, type: null, date: "" };
      g.n++; if (r.photo_url) g.photo = true;
      if (String(r.appearance_date || "") >= g.date) { g.date = String(r.appearance_date || ""); g.title = r.listing_title || g.title; g.year = r.year || g.year; g.make = r.make || g.make; g.family = r.model_family || g.family; }
      g.type = g.type || r.vehicle_type; per.set(r.vin_norm, g);
    }
    if (rows.length < 1000) break;
  }
  const counts = { vins: per.size, non_vehicle: 0, junk_identifier: 0, no_proper_title: 0, no_photo: 0, single_noindex: 0, multi_candidates: 0, multi_indexable: 0, hubs_indexable: 0 };
  const hubs = new Map(), multi = [];
  for (const [vin, g] of per) {
    if (g.type && g.type !== "car") { counts.non_vehicle++; continue; }
    if (!realVin(vin)) { counts.junk_identifier++; continue; }
    if (!g.title || !g.make || !saneFamily(g.family)) { counts.no_proper_title++; continue; }
    if (!g.photo) { counts.no_photo++; continue; }
    const hk = slugify(g.make) + "-" + slugify(g.family); hubs.set(hk, (hubs.get(hk) || 0) + 1);
    if (g.n >= 2) { counts.multi_candidates++; multi.push({ vin, g }); } else counts.single_noindex++;
  }
  const vins = [];
  for (let i = 0; i < multi.length; i += 40) {
    const part = await Promise.all(multi.slice(i, i + 40).map(async ({ vin, g }) => { const sl = await slugFor(g.title, Number(g.year) || null); return sl ? { loc: `${SITE}/history/${sl}/${vin}`, lastmod: g.date.slice(0, 10) } : null; }));
    for (const u of part) if (u) vins.push(u); else counts.no_proper_title++;
  }
  counts.multi_indexable = vins.length; counts.hubs_indexable = hubs.size;
  ROLL = { counts, hubs: [...hubs.keys()].sort(), vins }; ROLL_AT = Date.now();
  return ROLL;
}
async function sitemap(res, env, which) {
  if (which === "stats") { const r = await rollout(env); res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); return res.status(200).send(JSON.stringify(r.counts, null, 1)); }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
  const r = await rollout(env);
  const urlset = list => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list.map(u => `<url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("")}</urlset>`;
  if (which === "index") {
    const pages = Math.max(1, Math.ceil(r.vins.length / SITEMAP_PAGE));
    const items = [`<sitemap><loc>${SITE}/sitemap-vins-hubs.xml</loc></sitemap>`].concat(Array.from({ length: pages }, (_, k) => `<sitemap><loc>${SITE}/sitemap-vins-${k + 1}.xml</loc></sitemap>`)).join("");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`);
  }
  if (which === "hubs") return res.status(200).send(urlset(r.hubs.map(h => ({ loc: `${SITE}/history/${h}` }))));
  const page = Math.max(1, Number(which) || 1) - 1;
  return res.status(200).send(urlset(r.vins.slice(page * SITEMAP_PAGE, (page + 1) * SITEMAP_PAGE)));
}
