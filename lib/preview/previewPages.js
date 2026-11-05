// CREW-ONLY DESIGN PREVIEWS: /preview/home and /preview/find (Lane E, Nov 4 2026), from the three mockups in docs/design/ and Sam's correction brief
// (docs/design/homepage-find-brief.md). Served only by api/crewPage.js (crew cookie, or the platform's own 404), never linked, never in a sitemap, noindex.
// They compute nothing: the words are data/copy.json, the brief's own lines and the engine's approved example searches (lib/startPlaceholders.js, run through the
// engine by scripts/placeholderCheck.mjs --live); the real-sales block is a labelled placeholder until Lane B's engine field lands, and no figure is typed.
//
// ONE DESIGN SYSTEM (brief 1): header(), searchBox(), pills() and footer() and the tokens and type styles in CSS are written ONCE and used by both pages;
// scripts/previewCopyCheck.mjs compares the two pages' header, search box, pills and footer byte for byte.
//
// WHERE THE RULES WIN OVER THE BRIEF OR THE MOCKUPS (also listed in docs/lane-notes.md):
//  - the real-sales block (brief 15) is a labelled placeholder: no typed figure and no real car until Lane B's engine field exists;
//  - "How Sam decides" (brief 16) prints the four approved rules word for word, in the brief's editorial layout (intro column plus four numbered columns);
//  - the Porsche photographs are crops of the mockups (no original asset exists in the repo), used as they are;
//  - the pills label reads "Go ask Sam:" so the approved call to action stays in the copy; the submit itself is the compact arrow;
//  - a visitor with no history sees "Searches to try" (engine-approved searches), never a "Recent searches" heading naming searches they did not make;
//  - the footer links are the site's own approved copy ("For business", "What's new"); the copyright year (a typed number) is left out.
import fs from "node:fs";
import path from "node:path";
import { copy, copyText } from "../copy.js";
import { PLACEHOLDERS } from "../startPlaceholders.js";
import { FONT_LINKS } from "../../api/_chrome.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = name => { try { return "data:image/jpeg;base64," + fs.readFileSync(path.join(process.cwd(), "lib/crewPages/preview", name)).toString("base64"); } catch { return ""; } };
const DAILY_VROOM = "https://thedailyvroom.com";
const PLACEHOLDER = "Tell Sam what you're looking for...";
const FIND_LEAD = "Search live and recent auctions across multiple platforms.";
const HERO_SUB = "Find your next car. See real sales. Discover where to sell.";
const WAYS = { find: "Search live auctions across multiple platforms in your own words.", mc: "See what comparable cars have actually sold for, with the sales behind every result.", sell: "Discover where and how to sell your car." };
const EX_HEAD = "Same car. Different auctions. Real selling prices.";

// The approved "How Sam decides" rules, kept word for word: the four rule paragraphs of the page's own copy (each opens with its own short sentence).
export function rulesOf() {
  const part = copy("howSamDecides.PARTS").find(x => x.h === "The rules");
  const paras = part ? part.p : [];
  const lead = paras[0] || "";
  return { lead: lead.split(/(?<=\.)\s/)[0] || lead, rules: paras.slice(1).map(p => { const i = p.indexOf(". "); return i > 0 ? { h: p.slice(0, i + 1), b: p.slice(i + 2) } : { h: p, b: "" }; }) };
}

// One icon set: 24 grid, 1.5 stroke, round caps. Sizes come from the CSS, never from the markup.
const IC = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11M9.5 20V5M15 20v-6.5M20 20V8M3 20h18"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7-9.3-9.3z"/><circle cx="7.8" cy="8.8" r="1.1"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/></svg>'
};

// ---- the shared design system: tokens, type styles, header, search, pills, footer (every rule here applies to BOTH pages)
const CSS = `
:root{
 --forest:#0B3126;--forest-hover:#164536;--forest-line:rgba(255,255,255,.14);
 --ink:#15201A;--sec:#5B665F;--cream:#F8F4EC;--card:#FCFAF5;--line:#DDD8CB;--tint:#E8EFEA;--foot:#1D2421;
 --sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif;
 --gut:40px;--maxw:1440px;--hdr:76px;--r-ctl:10px;--r-box:14px;--r-pill:999px}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--cream);color:var(--ink);font:400 16px/1.5 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
:focus-visible{outline:2px solid var(--forest);outline-offset:2px}.gh :focus-visible,.hero :focus-visible,.ft :focus-visible{outline-color:#fff}
.wrap{max-width:var(--maxw);margin:0 auto;padding-left:var(--gut);padding-right:var(--gut)}
/* type styles: the only sizes on the pages */
.t-hero{font:500 clamp(36px,4.4vw,58px)/1.06 var(--serif);letter-spacing:-.015em}
.t-title{font:500 40px/1.1 var(--serif);letter-spacing:-.01em}
.t-h2{font:500 clamp(30px,3.4vw,46px)/1.1 var(--serif);letter-spacing:-.012em}
.t-h3{font:500 28px/1.15 var(--serif)}
.t-eyebrow{font:600 12.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase}
.t-lead{font:400 20px/1.4 var(--sans)}
.t-body{font:400 15.5px/1.5 var(--sans)}
/* header */
.gh{background:var(--forest);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.gh .wrap{display:flex;align-items:center;gap:20px;height:var(--hdr)}
.wm{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;white-space:nowrap}
.wm b{font:500 30px/1 var(--serif);letter-spacing:-.01em}
.beta{display:inline-block;padding:3px 8px 4px;border:1px solid rgba(255,255,255,.4);border-radius:var(--r-pill);font:500 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.tabs{display:flex;align-items:center;gap:4px;margin-left:auto}
.tabs a{display:inline-flex;align-items:center;white-space:nowrap;height:38px;padding:0 14px;border-radius:var(--r-ctl);color:rgba(255,255,255,.94);text-decoration:none;font:500 15.5px/1 var(--sans);transition:background .15s}
.tabs a:hover{background:rgba(255,255,255,.1)}.tabs a:active{background:rgba(255,255,255,.16)}
.tabs a[aria-current]{background:var(--cream);color:var(--forest)}
.tabs a.acct{margin-left:8px;border:1px solid rgba(255,255,255,.45)}
.tabs a.acct:hover{border-color:#fff}
/* search: one component */
.sb{display:flex;align-items:center;gap:8px;width:100%;height:64px;background:#fff;border:1px solid var(--line);border-radius:var(--r-box);padding:0 10px 0 20px;box-shadow:0 1px 2px rgba(11,49,38,.08),0 6px 18px rgba(11,49,38,.06)}
.sb:focus-within{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.14)}
.sb .ico{display:inline-flex;font-size:22px;color:var(--ink)}
.sb input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;font:400 17px/1.3 var(--sans);color:var(--ink)}
.sb input::placeholder{color:var(--sec);opacity:1}
.sb .mic{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin-right:2px;border:0;border-radius:var(--r-ctl);background:transparent;color:var(--ink);font-size:21px;cursor:pointer}
.sb .mic:hover{background:var(--tint)}
.sb .go{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-radius:var(--r-ctl);background:var(--forest);color:#fff;font-size:22px;cursor:pointer}
.sb .go:hover{background:var(--forest-hover)}.sb .go:active{transform:translateY(1px)}
/* pills: one component, colours set by where it sits */
.pills{display:flex;flex-wrap:wrap;align-items:center;gap:10px;--p-bg:var(--tint);--p-ink:var(--forest);--p-line:#C9D6CD;--p-lbl:var(--sec)}
.pills .lbl{font:500 14px/1 var(--sans);color:var(--p-lbl);margin-right:2px}
.pill{display:inline-flex;align-items:center;height:36px;padding:0 15px;border-radius:var(--r-pill);border:1px solid var(--p-line);background:var(--p-bg);color:var(--p-ink);font:400 14.5px/1 var(--sans);text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s}
.pill:hover{border-color:var(--p-ink)}.pill:active{opacity:.85}
/* footer */
.ft{background:var(--foot);color:#fff}
.ft .wrap{display:flex;align-items:center;gap:36px;min-height:104px;padding-top:26px;padding-bottom:26px}
.ft .wm{padding-right:36px;border-right:1px solid rgba(255,255,255,.22);align-self:stretch}
.ft nav{display:flex;flex-wrap:wrap;gap:10px 34px}
.ft nav a{color:rgba(255,255,255,.92);text-decoration:none;font:400 15px/1.3 var(--sans)}.ft nav a:hover{text-decoration:underline;text-underline-offset:4px}
.ft .cp{margin-left:auto;font:400 14px/1.3 var(--sans);color:rgba(255,255,255,.7);white-space:nowrap}
@media (max-width:860px){
 :root{--gut:20px;--hdr:auto}
 .gh .wrap{flex-wrap:wrap;gap:6px 12px;padding-top:14px;padding-bottom:10px}.wm b{font-size:26px}
 .tabs{margin-left:0;width:100%;gap:0;justify-content:space-between}.tabs a{height:36px;padding:0 9px;font-size:14.5px}.tabs a.acct{margin-left:0}
 .sb{height:58px;padding:0 8px 0 14px;gap:4px}.sb .ico{display:none}.sb input{font-size:14px}.sb .mic{width:34px;margin-right:0}.sb .go{width:40px;height:40px}
 .ft .wrap{flex-direction:column;align-items:flex-start;gap:20px;padding-top:28px;padding-bottom:28px}.ft .wm{width:100%;padding:0 0 18px;border:0;border-bottom:1px solid rgba(255,255,255,.22)}.ft nav{gap:10px 22px}.ft .cp{margin-left:0}
}`;

// ---- Homepage
const HOME_CSS = `
.hero{position:relative;background:var(--forest);color:#fff;overflow:hidden}
.hero .photo{position:absolute;top:0;right:0;bottom:0;width:58%;background:center right/auto 100% no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 42%),linear-gradient(180deg,transparent 0,#000 14%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0,#000 42%),linear-gradient(180deg,transparent 0,#000 14%);mask-composite:intersect}
.hero .wrap{position:relative;padding-top:52px;padding-bottom:60px}
.hero h1{margin:0;max-width:700px}
.hero .sub{margin:18px 0 30px;color:rgba(255,255,255,.92)}
.hero .sb,.hero .pills{max-width:720px}
.hero .pills{margin-top:18px;--p-bg:rgba(255,255,255,.06);--p-ink:#fff;--p-line:rgba(255,255,255,.5);--p-lbl:rgba(255,255,255,.9)}
.hero .pill:hover{background:rgba(255,255,255,.14)}
.ways{display:grid;grid-template-columns:repeat(3,1fr);padding-top:44px;padding-bottom:40px}
.way{display:flex;align-items:flex-start;gap:18px;padding:4px 36px;text-decoration:none;color:inherit}
.way:first-child{padding-left:0}.way:last-child{padding-right:0}.way+.way{border-left:1px solid var(--line)}
.way .ic{font-size:30px;color:var(--forest);margin-top:2px}
.way h2{margin:0 0 6px}.way p{margin:0;color:var(--sec);max-width:34ch}
.way:hover h2{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:6px}
.ex{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:44px;align-items:center;padding:24px;margin:0 var(--gut) 56px;max-width:calc(var(--maxw) - 2 * var(--gut));border:1px solid var(--line);border-radius:16px;background:var(--card)}
.exw{max-width:var(--maxw);margin:0 auto}
.ex .ph{aspect-ratio:16/10;border-radius:10px;border:1.5px dashed #9AA39D;background:#EFEBE0;display:flex;align-items:center;justify-content:center;padding:14px;text-align:center;color:var(--sec);font:500 14px/1.35 var(--sans)}
.ex .eb{color:var(--forest)}.ex h2{margin:8px 0 18px}
.ex .rows{border-top:1px solid var(--line)}
.ex .row{display:grid;grid-template-columns:1fr 1.3fr auto;gap:16px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line);color:var(--sec);font:400 14.5px/1.3 var(--sans)}
.ex .row.h{padding:9px 0;font:600 11.5px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase}
.ex .bar{display:block;height:22px;min-width:96px;border-radius:6px;border:1.5px dashed #9AA39D}
.ex .note{margin:14px 0 14px;color:var(--sec);font:400 14px/1.45 var(--sans);max-width:60ch}
.lnk{font:600 16px/1.2 var(--sans);color:var(--forest);text-decoration:none;border-bottom:2px solid var(--forest);padding-bottom:2px}.lnk:hover{color:var(--forest-hover);border-color:var(--forest-hover)}
.how{display:grid;grid-template-columns:1.15fr repeat(4,1fr);padding-top:8px;padding-bottom:84px}
.how .hd{padding-right:36px}.how .eb{color:var(--forest)}
.how h2{margin:12px 0 0;max-width:20ch;font-size:clamp(26px,2.3vw,32px);line-height:1.18}
.rule{padding:2px 26px 0;border-left:1px solid var(--line)}
.rule .n{font:500 36px/1 var(--serif);color:var(--forest)}.rule h3{margin:12px 0 8px;font:600 18px/1.3 var(--sans)}.rule p{margin:0;color:var(--sec)}
@media (max-width:1180px){
 .how{grid-template-columns:repeat(2,1fr);row-gap:34px}.how .hd{grid-column:1/-1;padding:0}.how h2{max-width:none}.rule:nth-of-type(even){border-left:0;padding-left:0}
 .ex{grid-template-columns:1fr;gap:24px}.ex .ph{aspect-ratio:16/6}
 .hero .photo{top:auto;height:190px;width:100%;background-position:right bottom;background-size:cover;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 55%);mask-image:linear-gradient(180deg,transparent 0,#000 55%);-webkit-mask-composite:initial;mask-composite:initial}.hero .wrap{padding-bottom:210px}
 .ft .wrap{gap:24px}.ft .wm{padding-right:24px}.ft nav{gap:10px 22px}.ways{grid-template-columns:1fr;gap:0}.way,.way:first-child,.way:last-child{padding:20px 0}.way+.way{border-left:0;border-top:1px solid var(--line)}.way p{max-width:none}}
@media (max-width:860px){
 .hero .photo{height:150px}
 .hero .wrap{padding-top:30px;padding-bottom:170px}.hero h1 br{display:none}.hero .sub{font-size:17px;margin:14px 0 22px}
 .hero .pills .lbl{width:100%}
 .ways{padding-top:20px;padding-bottom:20px}.way h2{font-size:26px}
 .ex{margin:0 var(--gut) 40px;padding:16px}.ex .row{grid-template-columns:1fr 1fr auto;gap:10px}
 .how{padding-bottom:56px;grid-template-columns:1fr}.rule,.rule:nth-of-type(even){border-left:0;padding:18px 0 0;border-top:1px solid var(--line)}
}`;

// ---- Find
const FIND_CSS = `
.shell{display:grid;grid-template-columns:272px minmax(0,1fr);min-height:calc(100dvh - var(--hdr) - 104px)}
.rail{border-right:1px solid var(--line);padding:24px 16px 28px 20px}
.new{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:var(--r-ctl);background:var(--forest);color:#fff;text-decoration:none;font:500 14.5px/1 var(--sans)}
.new:hover{background:var(--forest-hover)}.new:active{transform:translateY(1px)}.new svg{font-size:16px;stroke-width:1.8}
.rh{margin:26px 0 8px 10px;font:600 11.5px/1.3 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sec)}
.rail .list{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.it{display:flex;align-items:center;gap:11px;height:38px;padding:0 10px;border-radius:8px;text-decoration:none;color:var(--ink);font:400 14.5px/1 var(--sans)}
.it svg{font-size:16px;color:var(--sec);stroke-width:1.4}.it span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.it:hover{background:var(--tint)}.it[aria-current]{background:var(--tint);color:var(--forest)}
.rail .all{display:inline-block;margin:8px 0 0 10px;font:500 14px/1.3 var(--sans);color:var(--forest);text-underline-offset:4px}
.rail .tk{margin:0 0 0 10px;color:var(--sec);font:400 14px/1.45 var(--sans)}.rail .tk a{color:var(--forest);font-weight:500;text-underline-offset:3px}
.main{padding:34px 40px 0 48px;display:flex;flex-direction:column;min-width:0}
.main h1{margin:0}.main .lead{margin:6px 0 0;color:var(--sec);font:400 16.5px/1.4 var(--sans)}
.stage{width:100%;max-width:780px;margin:0 auto;padding-top:clamp(56px,9vh,104px);text-align:center}
.stage h2{margin:0 0 26px;color:var(--forest)}
.stage .pills{justify-content:center;margin-top:20px}
.deco{position:relative;flex:1 0 220px;margin:28px -40px 0 -48px;overflow:hidden}
.deco .car{position:absolute;right:0;bottom:0;width:min(46%,560px);aspect-ratio:676/290;background:center/cover no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 62%),linear-gradient(180deg,transparent 0,#000 42%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0,#000 62%),linear-gradient(180deg,transparent 0,#000 42%);mask-composite:intersect}
@media (max-width:1100px){.shell{grid-template-columns:216px minmax(0,1fr)}.main{padding-left:32px;padding-right:28px}.deco{margin-left:-32px;margin-right:-28px}.deco .car{width:min(52%,460px)}}
@media (max-width:860px){
 .shell{grid-template-columns:1fr;min-height:0}.rail{order:2;border-right:0;border-top:1px solid var(--line);padding:22px 20px 28px}
 .main{padding:24px 20px 0}.main h1{font-size:34px}.main .lead{font-size:15.5px}
 .stage{padding-top:34px}.stage h2{margin-bottom:18px}.stage .pills{justify-content:flex-start;margin-top:16px}.stage .pills .lbl{width:100%}
 .deco{flex:none;height:0;margin:20px -20px 0;padding-top:30%}.deco .car{width:70%}
}`;

const SEARCH_JS = `(function(){
 var f=document.getElementById("pq-form");
 if(f){
  f.addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("pq").value.trim();if(!q)return;location.href="/find?q="+encodeURIComponent(q);});
  var m=document.getElementById("pq-mic"),R=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(m){if(!R){m.hidden=true;}else{m.addEventListener("click",function(){try{var r=new R();r.lang="en-US";r.onresult=function(ev){document.getElementById("pq").value=ev.results[0][0].transcript;};r.start();}catch(x){}});}}
 }
 try{var s=JSON.parse(localStorage.getItem("gas_auth_session")||"null");if(s&&s.access_token){var a=document.getElementById("acct");if(a){a.textContent="Account";a.setAttribute("href","/tasks/mine");}}}catch(e){}
 var rail=document.getElementById("rail-recent");
 if(rail){try{var l=JSON.parse(sessionStorage.getItem("gas_recent_s")||"[]").filter(function(x){return x&&typeof x.url==="string"&&x.url.charAt(0)==="/"&&x.url.charAt(1)!=="/"&&x.label;}).slice(0,6);
  if(l.length){document.getElementById("rail-head").textContent="Recent searches";rail.innerHTML="";l.forEach(function(x){var a=document.createElement("a");a.className="it";a.href=x.url;a.title=x.label;a.innerHTML=rail.getAttribute("data-ic");var s=document.createElement("span");s.textContent=x.label;a.appendChild(s);rail.appendChild(a);});}}catch(e){}}
})();`;

// ---- the shared parts
const header = active => `<header class="gh"><div class="wrap"><a class="wm" href="/"><b>GoAskSam</b><span class="beta">Beta</span></a><nav class="tabs" aria-label="Main"><a href="/find"${active === "find" ? ' aria-current="page"' : ""}>${copyText("rail.NAV_FIND")}</a><a href="/market-check">${copyText("rail.NAV_MARKET_CHECK")}</a><a href="/sell">${copyText("rail.NAV_SELL")}</a><a href="/tasks">${copyText("rail.NAV_TASKS")}</a><a class="acct" id="acct" href="/tasks">Sign in</a></nav></div></header>`;
const searchBox = () => `<form class="sb" id="pq-form" role="search" action="/find" method="get"><span class="ico" aria-hidden="true">${IC.search}</span><input id="pq" name="q" type="text" autocomplete="off" placeholder="${esc(PLACEHOLDER)}" aria-label="${esc(copy("home.START_LABEL"))}"><button type="button" class="mic" id="pq-mic" aria-label="Speak your search">${IC.mic}</button><button class="go" type="submit" aria-label="Go ask Sam">${IC.go}</button></form>`;
const pills = () => `<div class="pills"><span class="lbl">Go ask Sam:</span>${PLACEHOLDERS.preview.examples.map(t => `<a class="pill" href="/find?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>`;
const footer = () => `<footer class="ft"><div class="wrap"><a class="wm" href="/"><b>GoAskSam</b></a><nav aria-label="Footer"><a href="/about">${copyText("rail.FOOT_ABOUT")}</a><a href="/business">${copyText("rail.FOOT_BUSINESS")}</a><a href="${DAILY_VROOM}" target="_blank" rel="noopener">${copyText("rail.FOOT_DAILY_VROOM")}</a><a href="/whats-new">${copyText("rail.FOOT_WHATS_NEW")}</a><a href="/feedback">${copyText("rail.FOOT_FEEDBACK")}</a><a href="/terms">${copy("home.LEGAL_TERMS")}</a><a href="/privacy">${copy("home.LEGAL_PRIVACY")}</a></nav><span class="cp">&copy; GoAskSam</span></div></footer>`;
const doc = (title, css, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${esc(title)}</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#0B3126"><link rel="icon" href="/favicon.ico" sizes="any">${FONT_LINKS}<style>${CSS}${css}</style></head><body>${body}<script>${SEARCH_JS}</script></body></html>`;

export function homeHtml() {
  const { lead, rules } = rulesOf();
  const title = copyText("home.START_TITLE").replace(/^(\S+ \S+ \S+) /, "$1 <br>");
  const way = (ic, h, p, href) => `<a class="way" href="${href}"><span class="ic">${ic}</span><span><h2 class="t-h3">${esc(h)}</h2><p class="t-body">${esc(p)}</p></span></a>`;
  const body = `${header("")}
<section class="hero" aria-label="Search"><div class="photo" style="background-image:url(${img("hero-home.jpg")})" aria-hidden="true"></div>
<div class="wrap"><h1 class="t-hero">${title}</h1><p class="sub t-lead">${HERO_SUB}</p>${searchBox()}${pills()}</div></section>
<main><nav class="ways wrap" aria-label="Three ways in">${way(IC.search, copy("rail.NAV_FIND"), WAYS.find, "/find")}${way(IC.chart, copy("rail.NAV_MARKET_CHECK"), WAYS.mc, "/market-check")}${way(IC.tag, copy("rail.NAV_SELL"), WAYS.sell, "/sell")}</nav>
<div class="exw"><section class="ex" aria-label="Real sales example, placeholder"><div class="ph">Photo of one real car goes here</div><div><div class="eb t-eyebrow">Real example, placeholder</div><h2 class="t-h2" style="font-size:clamp(26px,2.6vw,34px);text-wrap:balance">${EX_HEAD}</h2>
<div class="rows"><div class="row h"><span>Date</span><span>Platform</span><span>Sold for</span></div><div class="row"><span class="bar"></span><span class="bar"></span><span class="bar"></span></div><div class="row"><span class="bar"></span><span class="bar"></span><span class="bar"></span></div></div>
<p class="note">Placeholder. This block prints one real car and its earlier completed sales from the engine's repeat sales field, which is not built yet. Nothing is typed here.</p><a class="lnk" href="/how-sam-decides">See the sales behind it &rarr;</a></div></section></div>
<section class="how wrap" aria-label="How Sam decides"><div class="hd"><div class="eb t-eyebrow">${copyText("rail.FOOT_HOW")}</div><h2 class="t-h2">${esc(lead)}</h2></div>${rules.map((r, i) => `<div class="rule"><div class="n">${i + 1}</div><h3>${esc(r.h)}</h3><p class="t-body">${esc(r.b)}</p></div>`).join("")}</section></main>${footer()}`;
  return doc("GoAskSam preview: home", HOME_CSS, body);
}

export function findHtml() {
  const ex = PLACEHOLDERS.preview.examples;
  const seeded = ex.map(t => `<a class="it" href="/find?q=${encodeURIComponent(t)}" title="${esc(t)}">${IC.clock}<span>${esc(t)}</span></a>`).join("");
  const body = `${header("find")}
<div class="shell"><aside class="rail" aria-label="Searches and Tasks"><a class="new" href="/find">${IC.plus}New search</a><div class="rh" id="rail-head">Searches to try</div><div class="list" id="rail-recent" data-ic="${esc(IC.clock)}">${seeded}</div>
<div class="rh">${copyText("rail.NAV_TASKS")}</div><p class="tk">Put Sam on a search and it keeps watch. <a href="/tasks">Open ${copyText("rail.NAV_TASKS")}</a></p></aside>
<main class="main"><h1 class="t-title">${copyText("rail.NAV_FIND")}</h1><p class="lead">${FIND_LEAD}</p>
<div class="stage"><h2 class="t-h2">${copyText("find.START_TITLE")}</h2>${searchBox()}${pills()}</div>
<div class="deco" aria-hidden="true"><div class="car" style="background-image:url(${img("car-find.jpg")})"></div></div></main></div>${footer()}`;
  return doc("GoAskSam preview: Find", FIND_CSS, body);
}

export const PREVIEW_PAGES = { "preview-home": homeHtml, "preview-find": findHtml };
