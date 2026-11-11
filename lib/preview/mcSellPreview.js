// MARKET CHECK AND SELL ON THE NEW SHELL (Lane E, Nov 8 2026, Sam's approved brief: docs/design/market-check-sell-brief-full.md). Crew previews only: /preview/market-check and /preview/sell.
// THREE THINGS LIVE HERE:
//   1. the shared shell pieces for the two products (the rail, configured per product) and the shell CSS for a RESULTS page, which is scoped to the shell's own elements so a protected results page is never restyled;
//   2. the ENTRY pages (Find's empty state: eyebrow, headline, line, the shared search component, trust or benefit line, chips, and the engine's own example sales when the field is there);
//   3. wrapLive(): the live page (api/marketCheck.js, api/sell.js, exactly as they answer) put inside the shell: the old left navigation is taken out, the Find header, rail and footer go in, the outer container is widened, and NOTHING inside the results is touched.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. Every figure here is a string the engine wrote; this file never adds, rounds or formats one.
import { SHARED } from "./previewPages.js";
import { copyText } from "../copy.js";
import { reasonLine } from "../reasonWords.js";
import { ENTRY_BRIEF_COPY } from "../entryCopy.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_MIRROR_JS } from "../authBar.js";
import { STACK_BANNERS_JS } from "../_publicHead.js";
export { STACK_BANNERS_JS };
const { entryHero, entryPlaceholder, IC, esc, header, searchBox, pills, footer, doc, FIND_CSS, SEARCH_JS } = SHARED;

export const KINDS = {
  mc: {
    active: "market-check", path: "/preview/market-check", live: "/market-check", param: "q", ph: "previewMc",
    newLabel: "New check", head: "Recent Market Checks", aria: "Market Checks",
    title: "GoAskSam preview: Market Check"
  },
  find: {
    active: "find", path: "/preview/find", live: "/find", param: "q", ph: "previewFind",
    newLabel: "New search", head: "Recent searches", aria: "Searches",
    title: "GoAskSam preview: Find"
  },
  sell: {
    active: "sell", path: "/preview/sell", live: "/sell", param: "car", ph: "previewSell",
    newLabel: "New analysis", head: "Recent selling analyses", aria: "Selling analyses",
    title: "GoAskSam preview: Sell"
  }
};
const hrefOf = (k, t) => k.path + "?" + k.param + "=" + encodeURIComponent(t);

// ---- the rail: Find's component, configured for the product. The list is filled by RAIL_JS from the product's EXISTING recent history (Market Check: gas_ob_recent; Sell: gas_sell_recent); nothing is stored anywhere new.
// FIND'S RAIL keeps what today's Find rail has, from the same places and with no new storage: Recent searches are the shared shell's own (gasRecentDraw fills #gas-recent-list from "gas_recent", the account's list when signed in, five, with remove buttons); below them, signed in only, the page's own "Your searches" list (its drawRail fills #searches from the search history it keeps and the account's saved searches, api/buySearch list) and Before it ends (its own armed cars, api/buySearch alerts).
// the landing a New search goes to is the product's own (k.path); a public page's /preview address is its public one (lib/_publicHead.js publicAddresses)
// ONE h1 AT ANY MOMENT: the live page carries the landing's h1 in a node it removes when the results draw, and its own client may draw a heading later; the h1 given from the query steps aside while another is on the page and returns when none is
export const H1_JS = `(function(){var m=document.getElementById("gas-h1");if(!m)return;var host=m.parentNode,next=m.nextSibling,t=0;function d(){t=0;var o=[].filter.call(document.querySelectorAll("h1"),function(h){return h!==m;});if(o.length){if(m.parentNode)m.parentNode.removeChild(m);}else if(!m.parentNode&&host){host.insertBefore(m,next&&next.parentNode===host?next:null);}}function q(){if(!t)t=setTimeout(d,60);}d();if(window.MutationObserver)new MutationObserver(q).observe(document.body,{childList:true,subtree:true});})();`;
export const newSearchJs = path => `(function(){var L=${JSON.stringify(path)};document.addEventListener("click",function(e){var t=e.target&&e.target.closest&&e.target.closest("[data-newsearch],[data-sellnew]");if(!t||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();e.stopPropagation();location.assign(L);},true);})();`;
const findRailHtml = k => `<aside class="rail" aria-label="${esc(k.aria)}" data-kind="find"><a class="new" href="${k.path}">${IC.plus}${esc(k.newLabel)}</a><div class="gas-recent" id="gas-recent" hidden><div class="rh">${esc(k.head)}</div><div id="gas-recent-list"></div></div><div class="find-saved" id="find-saved" hidden><div class="rh">Saved searches</div><div id="searches"></div></div></aside>`;
export const railHtml = k => k.active === "find" ? findRailHtml(k) : `<aside class="rail" aria-label="${esc(k.aria)}" data-kind="${k.active}"><a class="new" href="${k.path}">${IC.plus}${esc(k.newLabel)}</a><div class="rh" id="mc-rail-head" hidden>${esc(k.head)}</div><div class="list" id="mc-rail-recent" data-ic="${esc(IC.clock)}"></div></aside>`;

// The recent history is the product's own: Market Check keeps {q,label} under gas_ob_recent (the account's key when signed in, this tab's session otherwise); Sell keeps {label,url} under gas_sell_recent. Only same-site addresses are drawn. A click reopens that search in the preview (Market Check: its query; Sell: its saved address).
export const RAIL_JS = `(function(){
 var rail=document.getElementById("mc-rail-recent"),kind=rail?rail.parentNode.getAttribute("data-kind"):"";   /* the landing pages have no rail (Nov 10 2026): the search and Account hooks below still run there, the list only where a rail is */
 function read(){try{
  if(kind==="sell"){return JSON.parse(localStorage.getItem("gas_sell_recent")||"[]").map(function(x){var u=String(x&&x.url||"");return {label:x&&x.label,url:u.indexOf("/sell?")===0?"/preview"+u:""};});}
  var s=JSON.parse(localStorage.getItem("gas_auth_session")||"null"),signed=s&&s.access_token,st=signed?localStorage:sessionStorage,key=signed?"gas_ob_recent:"+String(s.email||"").toLowerCase():"gas_ob_recent";
  return JSON.parse(st.getItem(key)||"[]").map(function(x){return {label:x&&x.label,url:x&&x.q?"/preview/market-check?q="+encodeURIComponent(x.q):""};});
 }catch(e){return [];}}
 function draw(){var l=read().filter(function(x){return x&&x.label&&x.url;}).slice(0,6),hd=document.getElementById("mc-rail-head");rail.innerHTML="";
  if(!l.length){hd.hidden=true;return;}hd.hidden=false;
  l.forEach(function(x){var a=document.createElement("a");a.className="it";a.href=x.url;a.title=x.label;a.innerHTML=rail.getAttribute("data-ic");var s=document.createElement("span");s.textContent=x.label;a.appendChild(s);rail.appendChild(a);});}
 var f=document.getElementById("pq-form");   // the entry's search goes to its own results address with the words percent encoded: a plain form GET writes spaces as +, which the live pages read as part of the car
 if(f&&String(f.getAttribute("action")||"").indexOf("/preview/")===0)f.addEventListener("submit",function(e){e.preventDefault();var i=document.getElementById("pq"),q=i.value.trim();if(!q)return;location.href=f.getAttribute("action")+"?"+i.name+"="+encodeURIComponent(q);});
 if(rail){draw();
 try{var set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){set.apply(this,arguments);if(/^gas_(ob|sell)_recent/.test(String(k)))draw();};}catch(e){}
 window.addEventListener("storage",draw);}
 var fs=document.getElementById("find-saved");if(fs){var sh=function(){try{var a=JSON.parse(localStorage.getItem("gas_auth_session")||"null");fs.hidden=!(a&&a.access_token);}catch(e){fs.hidden=true;}};sh();window.addEventListener("storage",sh);setInterval(sh,1500);}
 try{var s2=JSON.parse(localStorage.getItem("gas_auth_session")||"null");if(s2&&s2.access_token){var a=document.getElementById("acct");if(a)a.setAttribute("href","/tasks/mine");}}catch(e){}
})();`;

// ---- the entry pages
const ENTRY_CSS = `
.xc{position:relative;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:0;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(11,49,38,.06);color:var(--ink)}
.xc-link{position:absolute;inset:0;z-index:1;border-radius:18px}.xc-link:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.xc-ph{min-width:0;border-radius:12px;overflow:hidden;background:#E6E2D8}.xc-ph img{display:block;width:100%;height:100%;min-height:260px;object-fit:cover}
.xc-body{min-width:0;padding:4px 6px 4px 26px;margin-left:26px;border-left:1px solid var(--line);display:flex;flex-direction:column;justify-content:center}
.xc-body .xeyebrow{margin:0 0 6px}.xc-t{margin:0 0 10px;font:500 clamp(26px,3vw,34px)/1.1 var(--serif);color:var(--forest);letter-spacing:-.01em}
.xc-fig{margin:0 0 6px;font:500 clamp(30px,3.6vw,44px)/1.1 var(--serif);color:var(--forest);letter-spacing:-.01em}.xc-m{margin:0 0 18px;color:var(--sec);font:400 17px/1.4 var(--sans)}
.xc-sale{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:12px;background:var(--tint);color:var(--forest);text-decoration:none}.xc-sale:hover{background:#DCE8E0}
.xc-sale b{display:block;font:600 17px/1.3 var(--sans)}.xc-sale em{display:block;font:400 14px/1.4 var(--sans);font-style:normal;color:var(--sec)}.xc-sale i{font-style:normal;font-size:18px}
.xs{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);grid-template-rows:auto auto}.xs .xc-ph{grid-row:1}.xs-body{grid-row:1;justify-content:flex-start}
.xs-pick{display:flex;gap:14px;align-items:flex-start;padding:0 0 16px}.xs-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:12px;background:var(--forest);color:#fff;font:600 20px/1 var(--serif)}
.xs-k{margin:0 0 2px;color:var(--sec);font:500 11.5px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase}.xs-name{margin:0 0 2px;font:500 24px/1.2 var(--serif);color:var(--forest)}.xs-s{margin:0;color:var(--sec);font:400 14.5px/1.45 var(--sans)}
.xs-two{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid var(--line)}.xs-two.one{grid-template-columns:1fr}.xs-sec{padding:14px 14px 4px 0}.xs-sec+.xs-sec{padding-left:18px;border-left:1px solid var(--line)}
.xs-v{margin:0 0 2px;font:500 22px/1.2 var(--serif);color:var(--forest)}
.xs-foot{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:14px 4px 0;border-top:1px solid var(--line);color:var(--ink);text-decoration:none;font:500 15.5px/1.3 var(--sans)}.xs-foot:hover{color:var(--forest);text-decoration:underline}.xs-foot i{font-style:normal;font-size:18px}
@media (max-width:900px){.xc,.xs{grid-template-columns:1fr}.xc-body{margin:16px 0 0;padding:16px 4px 4px;border-left:0;border-top:1px solid var(--line)}.xc-ph img{min-height:0;aspect-ratio:3/2}.xs-body{grid-row:auto}.xs-two{grid-template-columns:1fr}.xs-sec+.xs-sec{padding-left:0;border-left:0;border-top:1px solid var(--line);margin-top:10px}}
.etrust{margin:14px 0 0;color:var(--sec);font:400 14.5px/1.4 var(--sans)}
.proof .fx-h{margin:0 0 14px;font:500 22px/1.2 var(--serif);color:var(--ink);letter-spacing:0}
.exres .exl{margin:-6px 0 14px;color:var(--sec);font:400 16px/1.5 var(--sans)}
.exres .exf{display:block;width:100%;border:0;height:520px;background:transparent}
.pgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.pc{display:flex;flex-direction:column;min-width:0;padding:8px 8px 14px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-box);color:var(--ink);text-decoration:none}
.pc:hover{border-color:#B9C8BE;box-shadow:0 4px 14px rgba(11,49,38,.08)}.pc:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.pc-ph{display:block;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#E6E2D8}.pc-ph img{display:block;width:100%;height:100%;object-fit:cover}
.pc-t{display:block;margin:10px 6px 0;font:700 16px/1.3 var(--sans)}.pc-p{display:block;margin:4px 6px 0;font:600 17px/1.3 var(--sans);font-variant-numeric:tabular-nums}
.pc-m{display:block;margin:2px 6px 0;color:var(--sec);font:400 14px/1.4 var(--sans)}
@media (max-width:860px){.entry .stage{padding:34px 0 24px}.pgrid{grid-template-columns:1fr}.elead{margin-top:-4px}}`;

// The engine's example sales for Market Check (Lane B: marketCheckExampleSales, NEEDED FROM LANE B in docs/design/market-check-sell-brief.md): { sales: [ { title, soldLine, mileageLine, platformLine, dateLine, photo_url, url } x3 ] }. Printed as the engine wrote it. Hidden unless the field is there with three complete sales (a link to the sale, a photo, a title and the price line): a half field never draws half a section.
const httpOf = u => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
// THE REAL RESULT (Lane B's marketCheckExampleResult: { pickDate, model, result }). The section needs the whole result and its sales: tier "result", a typical band, a reference figure, and sales (cards) that each open a sale.
// Anything less and there is no section (never a card without its sales, never sales without a card). The page draws nothing: the frame below is the results page's own hero.
const httpU = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";
export function exampleResultOf(field) {
  const r = field && typeof field === "object" ? field.result : null;
  if (!r || r.tier !== "result" || !Array.isArray(r.cluster) || r.cluster.length !== 2 || !r.referenceFigure || typeof r.referenceFigure !== "object") return null;
  if (!Array.isArray(r.cards) || !r.cards.length || !r.cards.every(c => c && httpU(c.url))) return null;
  if (!String(field.model || "").trim()) return null;
  return field;
}
export const EXAMPLE_FRAME_PATH = "/preview/market-check/example";
export const EXAMPLE_HEAD = reasonLine("mc.example_head"), EXAMPLE_LINE = reasonLine("mc.example_line") + " " + reasonLine("mc.example_tiles");   // the words come from the reason table (Sam, Nov 8 2026), never typed here
export function exampleResultHtml(field) {
  const f = exampleResultOf(field); if (!f) return "";
  return `<section class="proof exres" data-example-result aria-label="${esc(EXAMPLE_HEAD)}"><h2 class="fx-h">${esc(EXAMPLE_HEAD)}</h2><p class="exl">${esc(EXAMPLE_LINE)}</p><iframe class="exf" id="exf" src="${EXAMPLE_FRAME_PATH}" title="${esc(f.model)}" loading="lazy" scrolling="no"></iframe></section>`
    + `<script>window.addEventListener("message",function(e){var h=e.data&&e.data.gasExampleHeight,f=document.getElementById("exf");if(f&&e.source===f.contentWindow&&h>0)f.style.height=h+"px"});</script>`;
}
// The frame: the live Market Check page's own document (its stylesheet, its shared card script, its results script) with only the results script's source pointed at the preview copy, the engine's result handed to it,
// and the page's old chrome hidden. The results script draws the hero.
export function exampleFrameHtml(liveHtml, field) {
  const f = exampleResultOf(field); if (!f) throw new ShellMarkerMissing("no example result");
  let out = String(liveHtml);
  if (!OBX_SCRIPT.test(out)) throw new ShellMarkerMissing("the onebox.js script tag was not found");
  const data = JSON.stringify({ model: f.model, result: f.result }).replace(/</g, "\\u003c");
  out = out.replace(OBX_SCRIPT, () => `<script>window.__GAS_MC_EXAMPLE=${data};</script><script src="${PREVIEW_OBX_SRC}"></script>`);
  return out.replace("</head>", () => `<style>${FRAME_CSS}</style></head>`);
}
export const FRAME_CSS = `html,body{background:transparent!important;min-height:0!important}#gas-scrim,#gas-rail,.gas-mhead,.gas-pillband,.gas-signbar,.gas-signbar-m,[id^=signin-area],footer,.narrow-strip{display:none!important}#gas-main{margin:0!important;padding:0!important;min-height:0!important}#gas-main .wrap{padding:0!important;max-width:none!important}#ob{max-width:none!important;padding:0!important}`;

export function exampleSalesOf(field) {
  const s = field && Array.isArray(field.sales) ? field.sales : null;
  if (!s || s.length !== 3) return null;
  const rows = s.map(x => x && typeof x === "object" ? { title: String(x.title || ""), sold: String(x.soldLine || ""), mi: String(x.mileageLine || ""), plat: String(x.platformLine || ""), date: String(x.dateLine || ""), photo: httpOf(x.photo_url), url: httpOf(x.url) } : null);
  return rows.every(r => r && r.title && r.sold && r.photo && r.url) ? rows : null;
}
export function exampleSalesHtml(field) {
  const rows = exampleSalesOf(field); if (!rows) return "";
  return `<section class="proof" data-example-sales aria-label="The sales behind the numbers"><h2 class="fx-h">The sales behind the numbers</h2><div class="pgrid">${rows.map(r => `<a class="pc" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="pc-ph"><img src="${esc(r.photo)}" alt="" loading="lazy"></span><span class="pc-t">${esc(r.title)}</span><span class="pc-p">${esc(r.sold)}</span>${[r.mi, r.plat, r.date].filter(Boolean).map(t => `<span class="pc-m">${esc(t)}</span>`).join("")}</a>`).join("")}</div></section>`;
}
// Sell's optional example (Lane B: sellExample): { cars: [ { title, line } x2 or x3 ] }, the engine's own sentence per car; it never says a platform guarantees a price (the sentences are the engine's). Hidden unless present with at least two cars that each have a title and a line.
export function sellExampleOf(field) {
  const c = field && Array.isArray(field.cars) ? field.cars : null;
  if (!c || c.length < 2 || c.length > 3) return null;
  const rows = c.map(x => x && typeof x === "object" ? { title: String(x.title || ""), line: String(x.line || ""), url: httpOf(x.url) || (typeof x.url === "string" && x.url.charAt(0) === "/" && x.url.charAt(1) !== "/" ? x.url : "") } : null);
  return rows.every(r => r && r.title && r.line) ? rows : null;
}
export function sellExampleHtml(field) {
  const rows = sellExampleOf(field); if (!rows) return "";
  return `<section class="proof" data-sell-example aria-label="Different cars. Different ways to sell."><h2 class="fx-h">Different cars. Different ways to sell.</h2><div class="pgrid">${rows.map(r => { const inner = `<span class="pc-t">${esc(r.title)}</span><span class="pc-m">${esc(r.line)}</span>`; return r.url ? `<a class="pc" href="${esc(r.url)}">${inner}</a>` : `<div class="pc">${inner}</div>`; }).join("")}</div></section>`;
}


// THE TWO WIDE CARDS (Sam's final brief, Nov 9 2026; Lane B's marketCheckExample and sellExampleCard, shapes in docs/lane-notes.md). Each is drawn from the engine's block as sent: the page prints strings and draws no chart, no table, no figure of its own.
// A card is hidden unless the whole block is there (a photo, a title, the figure lines and its link); a half block never draws half a card. The card opens the real results (the preview's own address for the same search); the sale row opens its auction listing.
const sx = v => typeof v === "string" && v.trim() ? v : "";
const imgOf = v => (/^https?:\/\//i.test(String(v || "")) || /^data:image\//i.test(String(v || ""))) ? String(v) : "";
const previewOf = (u, kind) => { const m = kind === "mc" ? /^\/market-check\?(q=[^#]+)$/.exec(String(u || "")) : /^\/sell\?(car=[^#]+)$/.exec(String(u || "")); return m ? (kind === "mc" ? "/preview/market-check?" : "/preview/sell?") + m[1] : ""; };
export function mcCardOf(f) {
  if (!f || typeof f !== "object") return null; const rs = f.recentSale;
  if (!sx(f.titleLine) || !imgOf(f.photo) || !sx(f.rangeLine) || !sx(f.countLine) || !sx(f.periodLine) || !previewOf(f.resultUrl, "mc")) return null;
  if (!rs || typeof rs !== "object" || !sx(rs.priceLine) || !sx(rs.metaLine) || !/^https?:\/\//i.test(String(rs.url || ""))) return null;
  return f;
}
export function mcCardHtml(f) {
  const c = mcCardOf(f); if (!c) return "";
  return `<section class="proof" data-mc-card aria-label="${esc(reasonLine("entry.mc_example"))}"><article class="xc"><a class="xc-link" href="${esc(previewOf(c.resultUrl, "mc"))}" aria-label="${esc(c.titleLine)}"></a><div class="xc-ph"><img src="${esc(imgOf(c.photo))}" alt="" width="720" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`
    + `<div class="xc-body"><p class="xeyebrow">${esc(reasonLine("entry.mc_example"))}</p><h2 class="xc-t">${esc(c.titleLine)}</h2><p class="xc-fig">${esc(c.rangeLine)}</p><p class="xc-m">${esc(c.countLine)} \u00b7 ${esc(c.periodLine)}</p>`
    + `<a class="xc-sale" href="${esc(c.recentSale.url)}" target="_blank" rel="noopener"><span><b>${esc(c.recentSale.priceLine)}</b><em>${esc(c.recentSale.metaLine)}</em></span><i aria-hidden="true">\u2197</i></a></div></article></section>`;
}
export function sellCardOf(f) {
  if (!f || typeof f !== "object") return null; const p = f.platformPick, r = f.reserve;
  if (!sx(f.titleLine) || !imgOf(f.photo) || !previewOf(f.resultUrl, "sell")) return null;
  if (!p || !sx(p.name) || !sx(p.mark) || !sx(p.sentence) || !r || !sx(r.headline) || !sx(r.sentence)) return null;
  if (f.auctionDay != null && !(sx(f.auctionDay.day) && sx(f.auctionDay.sentence))) return null;   // a day with no sentence is a half block: no card
  return f;
}
export function sellCardHtml(f) {
  const c = sellCardOf(f); if (!c) return "";
  const day = c.auctionDay ? `<div class="xs-sec"><p class="xs-k">${esc(reasonLine("entry.sell_day"))}</p><p class="xs-v">${esc(c.auctionDay.day)}</p><p class="xs-s">${esc(c.auctionDay.sentence)}</p></div>` : "";
  return `<section class="proof" data-sell-card aria-label="${esc(reasonLine("entry.sell_example"))}"><article class="xc xs"><div class="xc-ph"><img src="${esc(imgOf(c.photo))}" alt="" width="720" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`
    + `<div class="xc-body xs-body"><p class="xeyebrow">${esc(reasonLine("entry.sell_example"))}</p><h2 class="xc-t">${esc(c.titleLine)}</h2>`
    + `<div class="xs-pick"><span class="xs-mark" aria-hidden="true">${esc(c.platformPick.mark)}</span><div><p class="xs-k">${esc(ENTRY_BRIEF_COPY.platformPickLabel)}</p><p class="xs-name">${esc(c.platformPick.name)}</p><p class="xs-s">${esc(c.platformPick.sentence)}</p></div></div>`
    + `<div class="xs-two${c.auctionDay ? "" : " one"}">${day}<div class="xs-sec"><p class="xs-k">${esc(reasonLine("entry.sell_reserve"))}</p><p class="xs-v">${esc(c.reserve.headline)}</p><p class="xs-s">${esc(c.reserve.sentence)}</p></div></div></div>`
    + `<a class="xs-foot" href="${esc(previewOf(c.resultUrl, "sell"))}"><span>${esc(reasonLine("entry.sell_link"))}</span><i aria-hidden="true">\u2192</i></a></article></section>`;
}

export function entryHtml(kind, { exampleResult = null, sellExample = null, mcCard = null, sellCard = null, readError = null } = {}) {
  const k = KINDS[kind];
  const extra = kind === "mc" ? mcCardHtml(mcCard) : sellCardHtml(sellCard);
  const err = !extra && readError ? `<section class="proof" data-could-not-read="${kind}"><p class="etrust">${esc(readError)}</p></section>` : "";
  const body = `${header(k.active)}
<div class="shell wrap entry">
<main class="main"><h1 class="sr">${esc(reasonLine(kind === "mc" ? "entry.mc_title" : "entry.sell_title"))}</h1>
${entryHero(kind, searchBox(false, "", { action: k.path, name: k.param, placeholder: entryPlaceholder(kind) }), pills(k.ph, t => hrefOf(k, t)))}${extra}${err}</main></div>${footer()}`;
  return doc(k.title, FIND_CSS + ENTRY_CSS, body, `<script>${RAIL_JS}</script>`);
}

// ---- a results page inside the shell. These rules are the header, rail and footer of the Find shell, applied to the shell's own elements only: the tokens sit on .gh, .ft and .rail (never on :root, where they would replace the results page's own --ink and --sec), and nothing here selects a results element.
export const SHELL_TOKENS = `--forest:#0B3126;--forest-hover:#164536;--ink:#15201A;--sec:#5B665F;--cream:#F8F4EC;--card:#FCFAF5;--line:#DDD8CB;--tint:#E8EFEA;--foot:#1D2421;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;--gut:40px;--maxw:1440px;--hdr:76px;--r-ctl:10px;--r-box:14px;--r-pill:999px`;
export const RESULTS_SHELL_CSS = `h1#gas-h1{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
body.mcs-col{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}body.mcs-col>*{width:100%}body.mcs-col>[role="dialog"]{width:auto}body.mcs-col>.ft{margin-top:auto}
.gh,.ft,.rail{${SHELL_TOKENS}}
.gh *,.ft *,.rail *{box-sizing:border-box}
.gh svg,.ft svg,.rail svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
.gh :focus-visible,.ft :focus-visible{outline:2px solid #fff;outline-offset:2px}.rail :focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.gh{background:var(--forest);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.1);font:400 16px/1.5 var(--sans)}
.gh .wrap{display:flex;justify-content:flex-start;align-items:center;gap:20px;height:var(--hdr);max-width:none;margin:0;padding:0 max(var(--gut),calc((100% - var(--maxw)) / 2 + var(--gut))) 0 28px}
.wm{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;white-space:nowrap}
.wm b{font:500 30px/1 var(--serif);letter-spacing:-.01em}
/* ONE HEADER ON EVERY ROUTE (Sam, Nov 11 2026): a results page carries the live page's own stylesheet, where .beta is the old pale badge (a pale fill); this rule had no background, so the old fill showed behind the white type. Specific, and every property the old rule sets is set here. */
.gh .wm .beta{display:inline-block;padding:3px 8px 4px;margin:0;border:1px solid rgba(255,255,255,.4);border-radius:var(--r-pill);background:transparent;box-shadow:none;opacity:1;font:500 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.tabs{display:flex;align-items:center;gap:4px;margin-left:auto}
.tabs a{display:inline-flex;align-items:center;white-space:nowrap;height:38px;padding:0 14px;border-radius:var(--r-ctl);color:rgba(255,255,255,.94);text-decoration:none;font:500 15.5px/1 var(--sans);transition:background .15s}
.tabs a:hover{background:rgba(255,255,255,.1)}.tabs a:active{background:rgba(255,255,255,.16)}
.tabs a[aria-current]{background:var(--cream);color:var(--forest)}
.tabs a.acct{margin-left:8px;border:1px solid rgba(255,255,255,.45)}.tabs a.acct:hover{border-color:#fff}
.mshell{display:grid;grid-template-columns:200px minmax(0,1fr);padding-left:28px}
.rail{border-right:1px solid var(--line);padding:24px 16px 28px 0;min-width:0;width:200px;box-sizing:border-box;font:400 16px/1.5 var(--sans);color:var(--ink)}
.new{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;height:38px;max-width:100%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 12px;border-radius:var(--r-ctl);background:var(--forest);color:#fff;text-decoration:none;font:500 15px/1 var(--sans)}
.new:hover{background:var(--forest-hover)}.new:active{transform:translateY(1px)}.new svg{font-size:15px;stroke-width:2}
.rh{margin:28px 0 8px 10px;font:600 11.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.rail .list{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.it{display:flex;align-items:center;gap:11px;height:38px;padding:0 10px;border-radius:8px;text-decoration:none;color:var(--ink);font:400 14.5px/1 var(--sans)}
.it svg{font-size:15px;color:#8C968F;stroke-width:1.4}.it span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.it:hover{background:var(--tint)}
.ft{background:var(--foot);color:#fff;font:400 16px/1.5 var(--sans)}
.ft .wrap{display:flex;justify-content:flex-start;align-items:center;gap:36px;min-height:76px;padding-top:18px;padding-bottom:18px;max-width:none;margin:0;padding-left:28px;padding-right:max(var(--gut),calc((100% - var(--maxw)) / 2 + var(--gut)))}
.ft .wm{padding-right:36px;border-right:1px solid rgba(255,255,255,.22);align-self:stretch}
.ft nav{display:flex;flex-wrap:wrap;gap:10px 34px}
.ft nav a{color:rgba(255,255,255,.92);text-decoration:none;font:400 15px/1.3 var(--sans)}.ft nav a:hover{text-decoration:underline;text-underline-offset:4px}
.ft .cp{margin-left:auto;font:400 14px/1.3 var(--sans);color:rgba(255,255,255,.7);white-space:nowrap}
/* the content column: the live page's own #gas-main (its sticky search rules are scoped to it, so it keeps its id) with the old rail's margin and mobile band taken off, and its outer width widened to the space beside the rail. Nothing inside it is restyled. */
#gas-main{margin-left:0!important;padding-top:0!important;min-height:0!important;background:transparent!important;--gas-pill-band:0px}
@media (min-width:861px){#gas-main .wrap{padding-left:40px;padding-right:40px}#gas-main #ob{max-width:1180px}}
@media (max-width:860px){
 .gh .wrap{flex-wrap:wrap;gap:6px 12px;padding:14px var(--gut) 10px}.wm b{font-size:26px}.gh,.ft,.rail{--gut:20px;--hdr:auto}
 .tabs{margin-left:0;width:100%;gap:0;justify-content:space-between}.tabs a{height:36px;padding:0 9px;font-size:14.5px}.tabs a.acct{margin-left:0}
 .mshell{grid-template-columns:minmax(0,1fr);padding:0 var(--gut)}.rail{order:2;border-right:0;border-top:1px solid var(--line);padding:22px 0 28px}
 .ft .wrap{flex-direction:column;align-items:flex-start;gap:20px;padding:28px var(--gut)}.ft .wm{width:100%;padding:0 0 18px;border:0;border-bottom:1px solid rgba(255,255,255,.22)}.ft .cp{margin-left:0}
}`;
// On /preview the address the live scripts push must stay in the preview. Sell's two address builders are inline in the served page, so they are changed in the served text; Market Check's path test is in public/js/onebox.js, which the preview serves itself (api/crewPage.js, patchOneboxJs) so the live file is never edited. Every marker is checked: a marker that is gone throws, never a silent live address.
export const SELL_PATCHES = [[`: "/sell";\n  function addressOf`, `: "/preview/sell";\n  function addressOf`], [`return "/sell?" + u.toString();`, `return "/preview/sell?" + u.toString();`]];
export const OBX_SCRIPT = /<script src="\/obx\.[^"]+\/onebox\.js"><\/script>/;
export const PREVIEW_OBX_SRC = "/preview/market-check/onebox.js";
export class ShellMarkerMissing extends Error {}
// The example hook (Nov 8 2026): the entry page's real result is the results page's OWN hero, called with the engine's answer for the day's pick car. The hook is inert unless the page sets window.__GAS_MC_EXAMPLE,
// so the results page behaves exactly as before. It calls the same two functions resultHtml calls (thinTileTreatment and heroRangeHtml) and draws nothing itself.
export const EXAMPLE_HOOK = `  function gasMcExample() {
    var x = window.__GAS_MC_EXAMPLE, d = JSON.parse(JSON.stringify(x.result));
    // the title is the engine's titleLine, handed to the hero as the car's label (the hero prints carLabel(resolvedCar)); with no titleLine the engine's own resolvedCar, and with neither the field's model text
    if (d.titleLine) d.resolvedCar = Object.assign({}, d.resolvedCar || {}, { canonicalLabel: d.titleLine }); else if (!d.resolvedCar) d.resolvedCar = { canonicalLabel: x.model };
    root.innerHTML = heroRangeHtml(d, null, thinTileTreatment(d, null, d.cards, d.setAsideRows));
    wire(); streamReveal();
    var post = function () { try { parent.postMessage({ gasExampleHeight: document.documentElement.scrollHeight }, "*"); } catch (e) {} };
    if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
    post();
  }
`;
export function patchOneboxJs(text) {
  const from = `location.pathname === "/market-check"`;
  if (String(text).indexOf(from) < 0) throw new ShellMarkerMissing("onebox.js: the Market Check path test was not found");
  let out = String(text).split(from).join(`/^\\/(preview\\/)?market-check$/.test(location.pathname)`);
  const at = "  function resultHtml(d, m) {";
  if (out.indexOf(at) < 0) throw new ShellMarkerMissing("onebox.js: resultHtml was not found");
  out = out.replace(at, () => EXAMPLE_HOOK + at);
  const tail = /\n(\s*)boot\(\);\n\}\)\(\);\s*$/;
  if (!tail.test(out)) throw new ShellMarkerMissing("onebox.js: the closing boot() call was not found");
  return out.replace(tail, (m, sp) => `\n${sp}if (window.__GAS_MC_EXAMPLE) gasMcExample(); else boot();\n})();\n`);
}
// The live served text goes in; the same text comes out with the old left navigation replaced by the shell. The markers are the live shell's own (lib/appShell.js railOpenHtml): its scrim through its mobile header is the old navigation, the one </div> after </main> closes its content column.
const FIND_RAIL_FIX = `.mvbar{display:none}.buymain{box-sizing:border-box;padding-bottom:var(--gas-banners,0px)}@media (max-width:860px){.mvbar{display:flex;justify-content:flex-end;align-items:center;padding:8px 16px 10px;position:relative;z-index:2}.mvbar .mvis{display:inline-flex!important;align-items:center;justify-content:center;height:36px;min-height:36px;line-height:1;padding:0 16px;margin:0;box-sizing:border-box}}.find-saved .srow,.find-saved .rh2~.srow{display:flex;align-items:center;gap:2px}.find-saved .srch{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:38px;padding:4px 10px;border-radius:8px;overflow:hidden;color:var(--ink);text-decoration:none;font:400 14.5px/1.25 var(--sans);text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}.find-saved .srch:not(.arm){display:block;line-height:30px;padding-top:4px;padding-bottom:4px}.find-saved .srch:hover{background:var(--tint)}.find-saved .srch.on{background:var(--tint)}.find-saved .srch:focus-visible{outline:2px solid var(--forest);outline-offset:2px}.find-saved .arm-t{display:block;margin:2px 0 0;font:400 12.5px/1.2 var(--sans);color:var(--sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.find-saved .srm{flex:none;width:26px;height:26px;border:0;background:none;color:var(--sec);font:400 16px/1 var(--sans);cursor:pointer;border-radius:6px}.find-saved .srm:hover{background:var(--tint)}.mshell>.rail{position:static;left:auto;top:auto;bottom:auto;display:block;flex-direction:initial;gap:0;background:none;width:200px;padding:24px 16px 28px 0}@media (max-width:860px){.mshell>.rail{display:none}}`;
// The results pages have no h1 of their own (the landings do): one is given from the query, as the address carries it (Find q; Market Check q, car or vin; Sell car), visually hidden like the landings' (Sam, Nov 11 2026). Nothing is worded: the text is the query. The h1 given from the query steps aside while the page has another one (H1_JS).
export const headingFromQuery = (kind, url) => { try { const sp = new URL(String(url || "/"), "https://x").searchParams, raw = kind === "sell" ? sp.get("car") : (sp.get("q") || sp.get("car") || sp.get("vin")); const t = String(raw || "").replace(/-/g, " ").replace(/\s+/g, " ").trim().slice(0, 120); return t || null; } catch { return null; } };
export function wrapLive(kind, html, opts = {}) {
  const k = KINDS[kind]; let out = String(html);
  const open = /<div id="gas-scrim"[\s\S]*?<header class="gas-mhead">[\s\S]*?<\/header>/;
  if (!open.test(out)) throw new ShellMarkerMissing("the live page's old navigation was not found");
  const close = /<\/main>\s*<\/div>(\s*)/;
  if (!close.test(out)) throw new ShellMarkerMissing("the live page's content column does not close after </main>");
  const h1 = opts.h1 ? `<h1 class="sr" id="gas-h1">${esc(opts.h1)}</h1>` : "";
  out = out.replace(open, () => `${header(k.active)}${h1}<div class="mshell">${railHtml(k)}<div id="gas-main">`);
  out = out.replace(close, (m, ws) => `</main></div></div>${footer()}${ws}`);
  // the floating Sign in pill and the old mobile bar belong to the old navigation; the header's Account button is the one way in
  if (out.indexOf(AUTH_SIGNBAR_HTML) < 0) throw new ShellMarkerMissing("the live page's sign in bar was not found");
  out = out.replace(AUTH_SIGNBAR_HTML, () => "");
  out = out.replace("</head>", () => `<style>${RESULTS_SHELL_CSS}</style></head>`).replace(/<body([^>]*)>/, (m, a) => /class="/.test(a) ? m.replace(/class="/, 'class="mcs-col ') : `<body${a} class="mcs-col">`);   // the one declared body rule: the full height column (scripts/previewShellCheck.mjs)
  out = out.replace("</body>", () => `<script>${RAIL_JS}</script></body>`);
  // EVERY "NEW SEARCH" GOES TO THE PRODUCT'S NEW LANDING (Sam, Nov 11 2026). The rail's New search is a plain link to the landing; the page's own buttons were not: Find's top right "New search" (and the phone list's) ran the page's goStart(), which restores the OLD landing inside the results page (the old search box and the old rail) and rewrites the address to /find; Sell's "New search" link ran renderEmpty() the same way. One capture phase handler sends each of them to the landing the rail's link goes to, as a navigation, before the page's handler can run.
  out = out.replace("</body>", () => `<script>${newSearchJs(k.path)}</script><script>${H1_JS}</script><script>${STACK_BANNERS_JS}</script></body>`);
  if (kind === "sell") for (const [from, to] of SELL_PATCHES) { if (out.indexOf(from) < 0) throw new ShellMarkerMissing("a Sell address marker was not found: " + from.slice(0, 40)); out = out.split(from).join(to); }
  else if (kind === "find") {   // Find's own client runs unchanged. Find's page carries the OLD rail's rules for the class .rail (fixed, 240px, a column); the new rail takes its place in the grid, so those rules are put back for it.
    out = out.replace("</head>", () => `<style>${FIND_RAIL_FIX}</style></head>`);
    // Before it ends: the page keeps its armed cars in ALERT_LIST and has a function that draws them for the rail (alertsRailHtml); today's page does not call it, so the page's own list gets it appended here, in this shell only.
    const FROM = 'if (box) box.innerHTML = html;';
    if (out.indexOf(FROM) < 0) throw new ShellMarkerMissing("Find's rail list marker was not found");
    out = out.replace(FROM, () => 'if (box) box.innerHTML = html + alertsRailHtml();');
    // the phone: the rail is hidden, so Find's own "Your searches" button (it opens the page's own list, saved searches included) goes in a bar under the header
    out = out.replace(/(<div class="mshell">)/, () => `<div class="mvbar"><button type="button" class="mvis" data-mvisits aria-expanded="false" aria-controls="mvlist">Your searches</button></div><div class="mshell">`);
  }
  else { if (!OBX_SCRIPT.test(out)) throw new ShellMarkerMissing("the onebox.js script tag was not found"); out = out.replace(OBX_SCRIPT, () => `<script src="${PREVIEW_OBX_SRC}"></script>`); }
  return out;
}
export { AUTH_SIGNBAR_MIRROR_JS, SEARCH_JS, copyText };
