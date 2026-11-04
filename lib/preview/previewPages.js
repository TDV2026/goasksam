// CREW-ONLY DESIGN PREVIEWS: /preview/home and /preview/find (Lane E, Nov 4 2026), built from the three mockups in docs/design/. Served only by api/crewPage.js
// (crew cookie, or the platform's own 404), never linked, never in a sitemap, noindex. They compute nothing: the words are data/copy.json and the engine's own
// approved example searches (lib/startPlaceholders.js, each one run through the engine by scripts/placeholderCheck.mjs); the real example block is a labelled
// placeholder until Lane B's engine field lands, and no figure is typed on either page.
//
// WHERE THE RULES WIN OVER THE MOCKUPS (also listed in docs/lane-notes.md):
//  - the orange and red buttons are the site's dark green and paper;  - chips on cards stay short labels (the results page is not in this job);
//  - the "Real example" block is a placeholder: the mockup's "sold twice before", its two prices, two house names and "Now on ..." live line are typed figures,
//    competitor names and a live bid, none allowed;  - "See how Sam found it" would put Sam in the first person's seat, so the link reads "See the sales behind it";
//  - the three "How Sam decides" columns are the approved rules (data/copy.json howSamDecides), not the mockup's own three;
//  - a visitor with no search history sees "Searches to try" (engine-approved searches), never a "Recent searches" heading naming searches they did not make;
//  - the mockup's Tasks dot (an unread state) and copyright year (a typed number) are left out.
import fs from "node:fs";
import path from "node:path";
import { copy, copyText } from "../copy.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { FONT_LINKS } from "../../api/_chrome.js";
import { BRAND_TOKENS } from "../appShell.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const T = BRAND_TOKENS;
const img = name => { try { return "data:image/jpeg;base64," + fs.readFileSync(path.join(process.cwd(), "lib/crewPages/preview", name)).toString("base64"); } catch { return ""; } };
const DAILY_VROOM = "https://thedailyvroom.com";

// The approved "How Sam decides" rules, kept word for word: the four rule paragraphs of the page's own copy (each opens with its own short sentence).
export function rulesOf() {
  const part = copy("howSamDecides.PARTS").find(x => x.h === "The rules");
  const paras = part ? part.p : [];
  const lead = paras[0] || "";
  return { lead: lead.split(/(?<=\.)\s/)[0] || lead, rules: paras.slice(1).map(p => { const i = p.indexOf(". "); return i > 0 ? { h: p.slice(0, i + 1), b: p.slice(i + 2) } : { h: p, b: "" }; }) };
}

const IC = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M9 20V6M14 20v-8M19 20V4M3 20h18"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.6"/><path d="M5 20c1.2-4 4-5.4 7-5.4s5.8 1.4 7 5.4"/></svg>'
};

const CSS = `
:root{--ink:${T.ink};--sec:${T.inkSoft};--page:${T.page};--card:${T.card};--line:${T.border};--brand:${T.brand};--brand-hover:${T.brandHover};--tint:${T.brandSelected};
--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--page);color:var(--ink);font:400 16px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.wm{font:500 32px/1 var(--serif);letter-spacing:-.01em;color:#fff;text-decoration:none;white-space:nowrap}
.tabs{display:flex;align-items:center;gap:6px}
.tabs a{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-height:44px;padding:0 16px;border-radius:10px;color:#fff;text-decoration:none;font:500 17px/1 var(--sans)}
.tabs a.on{background:var(--page);color:var(--brand)}
.tabs a.out{border:1px solid rgba(255,255,255,.55);border-radius:10px;padding:0 20px}
.tabs a.acct{width:44px;padding:0;justify-content:center;font-size:30px}
.tabs a.acct svg{stroke-width:1.5}
.box{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 8px 8px 18px;box-shadow:0 1px 2px rgba(18,63,51,.08)}
.box>span{font-size:23px;color:var(--ink)}
.box input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:400 18px/1.3 var(--sans);color:var(--ink);padding:12px 0}
.box input::placeholder{color:var(--sec)}
.box .mic{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-left:1px solid var(--line);border-radius:0;background:transparent;color:var(--ink);font-size:22px;cursor:pointer}
.box .go{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 20px;border:0;border-radius:10px;background:var(--brand);color:#fff;font:600 16px/1 var(--sans);cursor:pointer;white-space:nowrap}
.box .go:hover{background:var(--brand-hover)}.box .go svg{font-size:19px}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.chips .lbl{font:400 16px/1 var(--sans)}
.chip{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--tint);color:var(--brand);font:400 15.5px/1.2 var(--sans);text-decoration:none}
.chip:hover{border-color:var(--brand)}
.ft{background:#1d2421;color:#fff;margin-top:0}
.ft .in{display:flex;align-items:center;gap:36px;max-width:1440px;margin:0 auto;padding:34px 40px}
.ft .brandcol{padding-right:36px;border-right:1px solid rgba(255,255,255,.25)}
.ft .brandcol .wm{display:block;font-size:30px}.ft .brandcol p{margin:6px 0 0;font:400 15.5px/1.3 var(--sans);color:rgba(255,255,255,.82)}
.ft nav{display:flex;flex-wrap:wrap;gap:10px 40px}
.ft nav a{color:#fff;text-decoration:none;font:400 16px/1.3 var(--sans)}.ft nav a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.hero :focus-visible,.top :focus-visible,.ft :focus-visible{outline-color:#fff}
@media (max-width:860px){
 .wm{font-size:28px}.tabs a{padding:0 10px;font-size:15px;min-height:40px}.tabs a.out{padding:0 14px}
 .ft .in{flex-direction:column;align-items:flex-start;gap:22px;padding:30px 20px}.ft .brandcol{padding:0 0 18px;border:0;border-bottom:1px solid rgba(255,255,255,.25);width:100%}
 .ft nav{gap:10px 24px}
}`;

const HOME_CSS = `
.hero{position:relative;background:var(--brand);color:#fff;overflow:hidden}
.hero .photo{position:absolute;top:0;right:0;bottom:0;width:58%;background:var(--brand) center/cover no-repeat;opacity:1}
.hero .photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--brand) 0%,rgba(18,63,51,.7) 30%,rgba(18,63,51,.12) 70%)}
.top{position:relative;display:flex;align-items:center;gap:22px;max-width:1440px;margin:0 auto;padding:26px 48px 0}
.top .tag{padding-left:22px;border-left:1px solid rgba(255,255,255,.35);font:500 14px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.88)}
.top .tabs{margin-left:auto}
.hero .in{position:relative;max-width:1440px;margin:0 auto;padding:24px 48px 44px}
.hero h1{margin:0;max-width:640px;font:500 64px/1.04 var(--serif);letter-spacing:-.015em;text-wrap:balance}
.hero .sub{margin:18px 0 28px;font:400 22px/1.35 var(--sans);color:rgba(255,255,255,.94)}
.hero .box{max-width:664px}
.hero .chips{margin-top:20px;max-width:760px}.hero .chips .lbl{color:rgba(255,255,255,.92)}
.hero .chip{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.55);color:#fff}.hero .chip:hover{background:rgba(255,255,255,.14)}
.ways{display:grid;grid-template-columns:repeat(3,1fr);max-width:1440px;margin:0 auto;padding:34px 48px 30px}
.way{display:flex;align-items:flex-start;gap:20px;padding:6px 34px}
.way+.way{border-left:1px solid var(--line)}.way:first-child{padding-left:0}
.way .ic{flex:none;width:64px;height:64px;border-radius:14px;background:#ECE8DD;display:flex;align-items:center;justify-content:center;font-size:32px;color:var(--ink)}
.way h2{margin:0 0 6px;font:500 32px/1.1 var(--serif)}.way p{margin:0 0 14px;font:400 17px/1.4 var(--sec,sans-serif);color:var(--sec)}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 20px;border-radius:10px;border:1px solid var(--brand);background:var(--brand);color:#fff;text-decoration:none;font:600 15.5px/1 var(--sans)}
.btn:hover{background:var(--brand-hover)}.btn.alt{background:transparent;color:var(--brand)}.btn.alt:hover{background:var(--tint)}
.ex{max-width:1344px;margin:0 auto 34px;display:grid;grid-template-columns:464px 1fr;gap:40px;align-items:center;padding:24px;border:1px solid var(--line);border-radius:16px;background:#FBF9F4}
.ex .ph{aspect-ratio:16/10;border-radius:10px;border:1.5px dashed #9aa39d;background:repeating-linear-gradient(135deg,#ECE8DD,#ECE8DD 12px,#E4E0D4 12px,#E4E0D4 24px);display:flex;align-items:center;justify-content:center;font:500 14px/1.3 var(--sans);color:var(--sec);text-align:center;padding:12px}
.ex .eb{font:600 13px/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--brand)}
.ex h2{margin:8px 0 18px;font:500 30px/1.2 var(--serif)}
.ex .pills{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:20px}
.ex .pill{min-width:210px;min-height:50px;border:1.5px dashed #9aa39d;border-radius:10px;display:flex;align-items:center;padding:0 16px;font:400 14.5px/1.2 var(--sans);color:var(--sec)}
.ex .note{margin:0 0 16px;font:400 14.5px/1.45 var(--sans);color:var(--sec);max-width:62ch}
.ex a.more{font:600 17px/1.2 var(--sans);color:var(--brand);text-decoration:none;border-bottom:2px solid var(--brand)}
.how{max-width:1440px;margin:0 auto;padding:18px 48px 70px;display:grid;grid-template-columns:1.2fr repeat(4,1fr);gap:0}
.how .hd{padding-right:30px}.how .eb{font:600 14px/1.3 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--brand)}
.how h2{margin:10px 0 14px;font:500 34px/1.12 var(--serif)}.how .link{font:600 16px/1.3 var(--sans);color:var(--brand);text-decoration:none;border-bottom:2px solid var(--brand)}
.rule{padding:0 24px;border-left:1px solid var(--line)}
.rule .n{font:500 34px/1 var(--serif);color:var(--brand)}.rule h3{margin:8px 0 6px;font:600 20px/1.25 var(--sans)}.rule p{margin:0;font:400 16px/1.5 var(--sans);color:var(--sec)}
@media (max-width:1180px){.how{grid-template-columns:repeat(2,1fr);row-gap:30px}.how .hd{grid-column:1/-1}.rule:nth-of-type(odd){border-left:0;padding-left:0}.ex{grid-template-columns:1fr}.ways{grid-template-columns:1fr;gap:6px}.way,.way:first-child{padding:18px 0}.way+.way{border-left:0;border-top:1px solid var(--line)}}
@media (max-width:860px){
 .top{padding:18px 20px 0;flex-wrap:wrap;gap:10px 14px}.top .tag{display:none}.top .tabs{margin-left:0;width:100%;overflow-x:auto}
 .hero .photo{width:100%;opacity:.3}.hero .photo::after{background:linear-gradient(180deg,rgba(18,63,51,.2),var(--brand))}
 .hero .in{padding:26px 20px 40px}.hero h1{font-size:40px}.hero .sub{font-size:18px;margin:14px 0 22px}
 .box{padding-left:12px}.box .mic{display:none}.box input{font-size:16px}.box .go{padding:0 14px;min-height:46px}
 .ways{padding:20px}.way h2{font-size:28px}.ex{margin:0 20px 28px;padding:16px;gap:20px}.ex h2{font-size:24px}.ex .pill{min-width:0;flex:1 1 100%}
 .how{padding:10px 20px 48px;grid-template-columns:1fr}.rule,.rule:nth-of-type(odd){border-left:0;padding:0;border-top:1px solid var(--line);padding-top:18px}.how h2{font-size:28px}
}`;

const FIND_CSS = `
.top{background:var(--brand);color:#fff}
.top .in{display:flex;align-items:center;gap:28px;max-width:1536px;margin:0 auto;padding:0 40px;min-height:72px}
.top .tabs{margin-left:auto}
.shell{display:grid;grid-template-columns:264px 1fr;min-height:calc(100dvh - 72px - 112px)}
.rail{border-right:1px solid var(--line);padding:42px 26px 28px;background:var(--page)}
.rail .new{display:flex;align-items:center;gap:10px;min-height:50px;padding:0 20px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;font:500 17px/1 var(--sans)}
.rail .new:hover{background:var(--brand-hover)}.rail .new svg{font-size:22px}
.rail hr{border:0;border-top:1px solid var(--line);margin:18px 0 20px}
.rail .rh{margin:0 0 10px 6px;font:600 13px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec)}
.rail a.it{display:flex;align-items:center;gap:14px;min-height:46px;padding:0 8px;border-radius:10px;text-decoration:none;font:400 16.5px/1.25 var(--sans)}
.rail a.it:hover{background:var(--tint)}.rail a.it svg{font-size:23px;color:var(--ink)}
.rail a.it span{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.rail .all{display:inline-block;margin:10px 0 0 6px;font:500 17px/1.3 var(--sans);color:var(--brand);text-decoration:underline;text-underline-offset:4px}
.rail .tasks{margin-top:26px}.rail .tasks p{margin:0 0 8px 6px;font:400 14.5px/1.45 var(--sans);color:var(--sec)}
.rail .tasks a.go{margin-left:6px;font:500 15.5px/1.3 var(--sans);color:var(--brand);text-underline-offset:3px}
.main{position:relative;overflow:hidden;padding:34px 40px 40px 44px}
.main .car{position:absolute;right:0;bottom:0;width:min(46%,676px);aspect-ratio:676/290;background:center/cover no-repeat;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 40%);mask-image:linear-gradient(90deg,transparent 0,#000 40%)}
.main .col{position:relative}
.main h1{margin:0;font:500 52px/1 var(--serif)}.main .lead{margin:6px 0 0;font:400 18px/1.4 var(--sec,sans-serif);color:var(--sec)}
.main h2{margin:116px 0 28px;text-align:center;font:500 62px/1.06 var(--serif);color:var(--brand);letter-spacing:-.01em}
.main .box{max-width:1044px;margin:0 auto;border-radius:16px;padding:10px 10px 10px 24px;box-shadow:0 2px 6px rgba(18,63,51,.1)}
.main .box .go{width:58px;height:58px;padding:0;justify-content:center;border-radius:50%}.main .box .go b{display:none}
.main .chips{max-width:1044px;margin:26px auto 0;justify-content:center}
.main .chip{min-height:50px;padding:0 24px;font-size:17px;border-radius:999px}
.sp{min-height:220px}
@media (max-width:860px){
 .top .in{padding:10px 16px;flex-wrap:wrap;min-height:0;gap:6px 12px}.top .tabs{margin-left:0;width:100%;overflow-x:auto}
 .shell{grid-template-columns:1fr;min-height:0}.rail{order:2;border-right:0;border-top:1px solid var(--line);padding:22px 20px 26px}
 .main{padding:22px 20px 0}.main h1{font-size:40px}.main .lead{font-size:16px}.main h2{margin:44px 0 20px;font-size:36px}
 .main .box{padding-left:14px}.main .box .mic{display:none}.main .chips{justify-content:flex-start;margin-top:18px}.main .chip{min-height:44px;padding:0 16px;font-size:15.5px}
 .main .car{position:relative;width:100%;margin-top:18px;height:0;padding-top:43%}.sp{min-height:0}
}`;

const SEARCH_JS = `(function(){
 var f=document.getElementById("pq-form");if(!f)return;
 f.addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("pq").value.trim();if(!q)return;location.href="/find?q="+encodeURIComponent(q);});
 var m=document.getElementById("pq-mic"),R=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(m){if(!R){m.hidden=true;}else{m.addEventListener("click",function(){try{var r=new R();r.lang="en-US";r.onresult=function(ev){document.getElementById("pq").value=ev.results[0][0].transcript;};r.start();}catch(x){}});}}
 var rail=document.getElementById("rail-recent");
 if(rail){try{var l=JSON.parse(sessionStorage.getItem("gas_recent_s")||"[]").filter(function(x){return x&&typeof x.url==="string"&&x.url.charAt(0)==="/"&&x.url.charAt(1)!=="/"&&x.label;}).slice(0,5);
  if(l.length){var h=document.getElementById("rail-head");h.textContent="Recent searches";rail.innerHTML="";l.forEach(function(x){var a=document.createElement("a");a.className="it";a.href=x.url;a.innerHTML=rail.getAttribute("data-ic");var s=document.createElement("span");s.textContent=x.label;a.appendChild(s);rail.appendChild(a);});}}catch(e){}}
})();`;

const searchBox = (placeholder, withLabel) => `<form class="box" id="pq-form" role="search" action="/find" method="get"><span aria-hidden="true" style="display:inline-flex">${IC.search}</span><input id="pq" name="q" type="text" autocomplete="off" placeholder="${esc(placeholder)}" aria-label="${esc(copy("home.START_LABEL"))}"><button type="button" class="mic" id="pq-mic" aria-label="Speak your search">${IC.mic}</button><button class="go" type="submit" aria-label="Go ask Sam">${withLabel ? "Go ask Sam" : "<b>Go ask Sam</b>"}${IC.go}</button></form>`;
const chipsOf = list => list.map(t => `<a class="chip" href="/find?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
const footer = () => `<footer class="ft"><div class="in"><div class="brandcol"><a class="wm" href="/">GoAskSam</a><p>${copyText("rail.RAIL_TAGLINE")}</p></div><nav aria-label="Footer"><a href="/about">${copyText("rail.FOOT_ABOUT")}</a><a href="/business">${copyText("rail.FOOT_BUSINESS")}</a><a href="${DAILY_VROOM}" target="_blank" rel="noopener">${copyText("rail.FOOT_DAILY_VROOM")}</a><a href="/whats-new">${copyText("rail.FOOT_WHATS_NEW")}</a><a href="/feedback">${copyText("rail.FOOT_FEEDBACK")}</a><a href="/terms">${copy("home.LEGAL_TERMS")}</a><a href="/privacy">${copy("home.LEGAL_PRIVACY")}</a></nav></div></footer>`;
const doc = (title, css, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="${T.brand}"><link rel="icon" href="/favicon.ico" sizes="any">${FONT_LINKS}<style>${CSS}${css}</style></head><body>${body}<script>${SEARCH_JS}</script></body></html>`;

export function homeHtml() {
  const { lead, rules } = rulesOf();
  const ex = PLACEHOLDERS.home.examples;
  const way = (ic, h, p, href, label, alt) => `<div class="way"><span class="ic">${ic}</span><div><h2>${esc(h)}</h2><p>${esc(p)}</p><a class="btn${alt ? " alt" : ""}" href="${href}">${esc(label)}</a></div></div>`;
  const body = `<header class="hero"><div class="photo" style="background-image:url(${img("hero-home.jpg")})" aria-hidden="true"></div>
<div class="top"><a class="wm" href="/">GoAskSam</a><span class="tag">Find &middot; Check &middot; Sell</span><nav class="tabs" aria-label="Preview"><a href="/find">${copyText("rail.NAV_FIND")}</a><a href="/market-check">${copyText("rail.NAV_MARKET_CHECK")}</a><a href="/sell">${copyText("rail.NAV_SELL")}</a><a href="/tasks">${copyText("rail.NAV_TASKS")}</a><a class="out" href="/tasks">Sign in</a></nav></div>
<div class="in"><h1>${copyText("home.START_TITLE")}</h1><p class="sub">Find your next car. Check real sales. See where to sell.</p>${searchBox(ex[1] || ex[0], true)}<div class="chips"><span class="lbl">Try asking:</span>${chipsOf(ex)}</div></div></header>
<main><section class="ways" aria-label="Three ways in">${way(IC.search, copy("rail.NAV_FIND"), "Search live auctions in your own words.", "/find", "Find a car")}${way(IC.chart, copy("home.CARD_MC_TITLE"), copy("home.CARD_MC_SUB"), "/market-check", "Check the sales", true)}${way(IC.tag, "Sell", copy("home.CARD_SELL_SUB"), "/sell", copy("rail.NAV_SELL_EARLY"), true)}</section>
<section class="ex" aria-label="Example, placeholder"><div class="ph">Photo of one finished sale goes here</div><div><div class="eb">Example, placeholder</div><h2>One car, its earlier finished sales, side by side.</h2><div class="pills"><span class="pill">Earlier sale, from the engine</span><span class="pill">Earlier sale, from the engine</span></div><p class="note">Placeholder. This block prints one real car and its finished sales from the engine's example field, which is not built yet. No figure is typed here.</p><a class="more" href="/how-sam-decides">See the sales behind it &rarr;</a></div></section>
<section class="how" aria-label="How Sam decides"><div class="hd"><div class="eb">${copyText("rail.FOOT_HOW")}</div><h2>${esc(lead)}</h2><a class="link" href="/how-sam-decides">${copyText("rail.FOOT_HOW")} &rarr;</a></div>${rules.map((r, i) => `<div class="rule"><div class="n">${i + 1}</div><h3>${esc(r.h)}</h3><p>${esc(r.b)}</p></div>`).join("")}</section></main>${footer()}`;
  return doc("GoAskSam preview: home", HOME_CSS, body);
}

export function findHtml() {
  const ex = PLACEHOLDERS.find.examples;
  const seeded = ex.map(t => `<a class="it" href="/find?q=${encodeURIComponent(t)}">${IC.clock}<span>${esc(t)}</span></a>`).join("");
  const body = `<header class="top"><div class="in"><a class="wm" href="/">GoAskSam</a><nav class="tabs" aria-label="Preview"><a class="on" href="/find">${copyText("rail.NAV_FIND")}</a><a href="/market-check">${copyText("rail.NAV_MARKET_CHECK")}</a><a href="/sell">${copyText("rail.NAV_SELL")}</a><a href="/tasks">${copyText("rail.NAV_TASKS")}</a><a class="acct" href="/tasks" aria-label="Sign in">${IC.user}</a></nav></div></header>
<div class="shell"><aside class="rail" aria-label="Searches and Tasks"><a class="new" href="/find">${IC.plus}New search</a><hr><div class="rh" id="rail-head">Searches to try</div><div id="rail-recent" data-ic="${esc(IC.clock)}">${seeded}</div>
<div class="tasks"><div class="rh">${copyText("rail.NAV_TASKS")}</div><p>Put Sam on a search and it keeps watch here.</p><a class="go" href="/tasks">Open ${copyText("rail.NAV_TASKS")}</a></div></aside>
<main class="main"><div class="col"><h1>${copyText("rail.NAV_FIND")}</h1><p class="lead">${copyText("find.START_SUB")}</p><div class="sp"><h2>${copyText("find.START_TITLE")}</h2>${searchBox(ex[1] || ex[0], false)}<div class="chips"><span class="lbl">Try asking:</span>${chipsOf(ex)}</div></div></div><div class="car" style="background-image:url(${img("car-find.jpg")})" aria-hidden="true"></div></main></div>${footer()}`;
  return doc("GoAskSam preview: Find", FIND_CSS, body);
}

export const PREVIEW_PAGES = { "preview-home": homeHtml, "preview-find": findHtml };
