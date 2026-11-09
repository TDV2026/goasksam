// MARKET CHECK AND SELL ON THE NEW SHELL (Lane E, Nov 8 2026, Sam's approved brief: docs/design/market-check-sell-brief-full.md). Crew previews only: /preview/market-check and /preview/sell.
// THREE THINGS LIVE HERE:
//   1. the shared shell pieces for the two products (the rail, configured per product) and the shell CSS for a RESULTS page, which is scoped to the shell's own elements so a protected results page is never restyled;
//   2. the ENTRY pages (Find's empty state: eyebrow, headline, line, the shared search component, trust or benefit line, chips, and the engine's own example sales when the field is there);
//   3. wrapLive(): the live page (api/marketCheck.js, api/sell.js, exactly as they answer) put inside the shell: the old left navigation is taken out, the Find header, rail and footer go in, the outer container is widened, and NOTHING inside the results is touched.
// Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. Every figure here is a string the engine wrote; this file never adds, rounds or formats one.
import { SHARED } from "./previewPages.js";
import { copyText } from "../copy.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_MIRROR_JS } from "../authBar.js";
const { IC, esc, header, searchBox, pills, footer, doc, FIND_CSS, SEARCH_JS } = SHARED;

export const KINDS = {
  mc: {
    active: "market-check", path: "/preview/market-check", live: "/market-check", param: "q", ph: "previewMc",
    newLabel: "New check", head: "Recent Market Checks", aria: "Market Checks",
    eyebrow: "MARKET CHECK · COMPLETED SALES", headline: "What have cars like yours sold for?",
    line: "Explore actual completed sales, with the individual transactions behind every result.",
    under: "Completed sales only. Every result links to its source.", title: "GoAskSam preview: Market Check"
  },
  sell: {
    active: "sell", path: "/preview/sell", live: "/sell", param: "car", ph: "previewSell",
    newLabel: "New analysis", head: "Recent selling analyses", aria: "Selling analyses",
    eyebrow: "SELL · SELLING INTELLIGENCE", headline: "Where should you sell your car?",
    line: "See where similar cars have sold, how different auction platforms perform and what the evidence suggests for your car.",
    under: "Platform performance · Selling strategy · PowerSeller options", title: "GoAskSam preview: Sell"
  }
};
const hrefOf = (k, t) => k.path + "?" + k.param + "=" + encodeURIComponent(t);

// ---- the rail: Find's component, configured for the product. The list is filled by RAIL_JS from the product's EXISTING recent history (Market Check: gas_ob_recent; Sell: gas_sell_recent); nothing is stored anywhere new.
export const railHtml = k => `<aside class="rail" aria-label="${esc(k.aria)}" data-kind="${k.active}"><a class="new" href="${k.path}">${IC.plus}${esc(k.newLabel)}</a><div class="rh" id="mc-rail-head" hidden>${esc(k.head)}</div><div class="list" id="mc-rail-recent" data-ic="${esc(IC.clock)}"></div></aside>`;

// The recent history is the product's own: Market Check keeps {q,label} under gas_ob_recent (the account's key when signed in, this tab's session otherwise); Sell keeps {label,url} under gas_sell_recent. Only same-site addresses are drawn. A click reopens that search in the preview (Market Check: its query; Sell: its saved address).
export const RAIL_JS = `(function(){
 var rail=document.getElementById("mc-rail-recent");if(!rail)return;var kind=rail.parentNode.getAttribute("data-kind");
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
 draw();
 try{var set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){set.apply(this,arguments);if(/^gas_(ob|sell)_recent/.test(String(k)))draw();};}catch(e){}
 window.addEventListener("storage",draw);
 try{var s2=JSON.parse(localStorage.getItem("gas_auth_session")||"null");if(s2&&s2.access_token){var a=document.getElementById("acct");if(a)a.setAttribute("href","/tasks/mine");}}catch(e){}
})();`;

// ---- the entry pages
const ENTRY_CSS = `
.eyebrow{margin:0 0 14px;color:var(--forest);font:600 12.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase}
.elead{margin:-8px auto 26px;max-width:700px;text-wrap:balance;color:var(--sec);font:400 18px/1.45 var(--sans)}
.etrust{margin:14px 0 0;color:var(--sec);font:400 14.5px/1.4 var(--sans)}
.entry .main{padding-bottom:70px}.entry .stage{flex:none;justify-content:flex-start;padding:64px 0 30px}.entry .deco{display:none}
.proof{position:relative;z-index:1;width:100%;max-width:1040px;margin:0 auto}.proof .fx-h{margin:0 0 14px;font:500 22px/1.2 var(--serif);color:var(--ink);letter-spacing:0}
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
export const EXAMPLE_HEAD = "The sales behind the numbers";   // the brief's heading until Sam's copy for this section lands (lib/copy.js)
export function exampleResultHtml(field) {
  const f = exampleResultOf(field); if (!f) return "";
  return `<section class="proof exres" data-example-result aria-label="${esc(EXAMPLE_HEAD)}"><h2 class="fx-h">${esc(EXAMPLE_HEAD)}</h2><iframe class="exf" id="exf" src="${EXAMPLE_FRAME_PATH}" title="${esc(f.model)}" loading="lazy" scrolling="no"></iframe></section>`
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

export function entryHtml(kind, { exampleResult = null, sellExample = null, readError = null } = {}) {
  const k = KINDS[kind], p = PLACEHOLDERS[k.ph];
  const extra = kind === "mc" ? exampleResultHtml(exampleResult) : sellExampleHtml(sellExample);
  const err = !extra && readError ? `<section class="proof" data-could-not-read="${kind}"><p class="etrust">${esc(readError)}</p></section>` : "";
  const body = `${header(k.active)}
<div class="shell wrap entry">${railHtml(k)}
<main class="main"><h1 class="sr">${esc(k.headline)}</h1>
<div class="stage"><p class="eyebrow">${esc(k.eyebrow)}</p><h2 class="t-h2">${esc(k.headline)}</h2><p class="elead">${esc(k.line)}</p>${searchBox(false, "", { action: k.path, name: k.param, placeholder: p.text })}<p class="etrust">${esc(k.under)}</p>${pills(k.ph, t => hrefOf(k, t))}</div>${extra}${err}</main></div>${footer()}`;
  return doc(k.title, FIND_CSS + ENTRY_CSS, body, `<script>${RAIL_JS}</script>`);
}

// ---- a results page inside the shell. These rules are the header, rail and footer of the Find shell, applied to the shell's own elements only: the tokens sit on .gh, .ft and .rail (never on :root, where they would replace the results page's own --ink and --sec), and nothing here selects a results element.
export const SHELL_TOKENS = `--forest:#0B3126;--forest-hover:#164536;--ink:#15201A;--sec:#5B665F;--cream:#F8F4EC;--card:#FCFAF5;--line:#DDD8CB;--tint:#E8EFEA;--foot:#1D2421;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;--gut:40px;--maxw:1440px;--hdr:76px;--r-ctl:10px;--r-box:14px;--r-pill:999px`;
export const RESULTS_SHELL_CSS = `
body.mcs-col{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}body.mcs-col>*{width:100%}body.mcs-col>.ft{margin-top:auto}
.gh,.ft,.rail{${SHELL_TOKENS}}
.gh *,.ft *,.rail *{box-sizing:border-box}
.gh svg,.ft svg,.rail svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
.gh :focus-visible,.ft :focus-visible{outline:2px solid #fff;outline-offset:2px}.rail :focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.gh{background:var(--forest);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.1);font:400 16px/1.5 var(--sans)}
.gh .wrap{display:flex;justify-content:flex-start;align-items:center;gap:20px;height:var(--hdr);max-width:none;margin:0;padding:0 max(var(--gut),calc((100% - var(--maxw)) / 2 + var(--gut))) 0 28px}
.wm{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;white-space:nowrap}
.wm b{font:500 30px/1 var(--serif);letter-spacing:-.01em}
.beta{display:inline-block;padding:3px 8px 4px;border:1px solid rgba(255,255,255,.4);border-radius:var(--r-pill);font:500 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.tabs{display:flex;align-items:center;gap:4px;margin-left:auto}
.tabs a{display:inline-flex;align-items:center;white-space:nowrap;height:38px;padding:0 14px;border-radius:var(--r-ctl);color:rgba(255,255,255,.94);text-decoration:none;font:500 15.5px/1 var(--sans);transition:background .15s}
.tabs a:hover{background:rgba(255,255,255,.1)}.tabs a:active{background:rgba(255,255,255,.16)}
.tabs a[aria-current]{background:var(--cream);color:var(--forest)}
.tabs a.acct{margin-left:8px;border:1px solid rgba(255,255,255,.45)}.tabs a.acct:hover{border-color:#fff}
.mshell{display:grid;grid-template-columns:220px minmax(0,1fr);padding-left:28px}
.rail{border-right:1px solid var(--line);padding:24px 18px 28px 0;min-width:0;width:220px;box-sizing:border-box;font:400 16px/1.5 var(--sans);color:var(--ink)}
.new{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;height:38px;padding:0 12px;border-radius:var(--r-ctl);background:var(--forest);color:#fff;text-decoration:none;font:500 15px/1 var(--sans)}
.new:hover{background:var(--forest-hover)}.new:active{transform:translateY(1px)}.new svg{font-size:15px;stroke-width:2}
.rh{margin:28px 0 8px 10px;font:600 11.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.rail .list{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.it{display:flex;align-items:center;gap:11px;height:38px;padding:0 10px;border-radius:8px;text-decoration:none;color:var(--ink);font:400 14.5px/1 var(--sans)}
.it svg{font-size:15px;color:#8C968F;stroke-width:1.4}.it span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.it:hover{background:var(--tint)}
.ft{background:var(--foot);color:#fff;font:400 16px/1.5 var(--sans)}
.ft .wrap{display:flex;justify-content:flex-start;align-items:center;gap:36px;min-height:104px;padding-top:26px;padding-bottom:26px;max-width:none;margin:0;padding-left:28px;padding-right:max(var(--gut),calc((100% - var(--maxw)) / 2 + var(--gut)))}
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
    d.resolvedCar = { canonicalLabel: x.model };
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
export function wrapLive(kind, html) {
  const k = KINDS[kind]; let out = String(html);
  const open = /<div id="gas-scrim"[\s\S]*?<header class="gas-mhead">[\s\S]*?<\/header>/;
  if (!open.test(out)) throw new ShellMarkerMissing("the live page's old navigation was not found");
  const close = /<\/main>\s*<\/div>(\s*)/;
  if (!close.test(out)) throw new ShellMarkerMissing("the live page's content column does not close after </main>");
  out = out.replace(open, () => `${header(k.active)}<div class="mshell">${railHtml(k)}<div id="gas-main">`);
  out = out.replace(close, (m, ws) => `</main></div></div>${footer()}${ws}`);
  // the floating Sign in pill and the old mobile bar belong to the old navigation; the header's Account button is the one way in
  if (out.indexOf(AUTH_SIGNBAR_HTML) < 0) throw new ShellMarkerMissing("the live page's sign in bar was not found");
  out = out.replace(AUTH_SIGNBAR_HTML, () => "");
  out = out.replace("</head>", () => `<style>${RESULTS_SHELL_CSS}</style></head>`).replace(/<body([^>]*)>/, (m, a) => /class="/.test(a) ? m.replace(/class="/, 'class="mcs-col ') : `<body${a} class="mcs-col">`);   // the one declared body rule: the full height column (scripts/previewShellCheck.mjs)
  out = out.replace("</body>", () => `<script>${RAIL_JS}</script></body>`);
  if (kind === "sell") for (const [from, to] of SELL_PATCHES) { if (out.indexOf(from) < 0) throw new ShellMarkerMissing("a Sell address marker was not found: " + from.slice(0, 40)); out = out.split(from).join(to); }
  else { if (!OBX_SCRIPT.test(out)) throw new ShellMarkerMissing("the onebox.js script tag was not found"); out = out.replace(OBX_SCRIPT, () => `<script src="${PREVIEW_OBX_SRC}"></script>`); }
  return out;
}
export { AUTH_SIGNBAR_MIRROR_JS, SEARCH_JS, copyText };
