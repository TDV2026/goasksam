import { isCrewRequest as isSignedCrew } from "../lib/_crew.js";
// Shared page chrome for the server-rendered public pages (history, /buy): One Box tokens + fonts,
// the left rail (with Buy) and the phone header. Lane C.
//
// PUBLIC NAV LOCKDOWN (Oct 2026, urgent, Sam): for the public, only "Where to sell" is visible
// anywhere in this chrome - Ask Sam, Buy, Tasks, Market Check, How Sam decides and For business are
// removed from the HTML entirely (never CSS-hidden). Crew (the existing gas_crew=ok cookie, the same
// mechanism the One Box crew gate used) see the full rail exactly as before. isCrewRequest(req) is the
// single check every caller of railHtml()/whyResultHtml() must pass through.
// The signed crew cookie (lib/_crew.js): the one shared check, re-exported here for existing callers.
export function isCrewRequest(req) { return isSignedCrew(req); }
export const PAGE_CSS = `
:root{--page:#F6F3EC;--card:#FFFFFF;--border:#DCD8CC;--ink:#15201A;--green:#1E4D38;--green-dk:#15372A;--sec:#5E6B63;--div:#E2DED3;--take:#F1F5F1;--live:#2E8B57;--ph:#E6E2D8;--soft:#3C4942;--tint:#EDF3EE;--tint-line:#D5E2D8;--serif:"Newsreader",Georgia,"Times New Roman",serif;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--page);color:var(--ink);font:400 17px/1.5 var(--sans);-webkit-font-smoothing:antialiased;font-variant-numeric:lining-nums}
[hidden]{display:none!important}
a{color:var(--green)}a:hover{color:var(--green-dk)}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.rail{position:fixed;left:0;top:0;bottom:0;width:240px;border-right:1px solid var(--div);padding:28px 24px;display:flex;flex-direction:column;gap:2px;background:var(--page)}
.rail .logo{font:600 26px/1.1 var(--serif);color:var(--ink);text-decoration:none;margin-bottom:22px}
.rail a.n{display:flex;align-items:center;min-height:44px;padding:0 14px;color:var(--sec);text-decoration:none;font-size:15px;border-left:2px solid transparent}
.rail a.n:hover{color:var(--ink)}.rail a.n.on{color:var(--green);font-weight:600;border-left-color:var(--green);padding-left:12px}
.mhead,.mnav{display:none}
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
.card.anscard{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));overflow:hidden;padding:0}
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
.whynote{display:flex;flex-direction:column;gap:6px}
.whynote .eyebrow{color:var(--sec)}
.whynote p{margin:0;font:400 15px/1.55 var(--sans);color:var(--sec);max-width:68ch}
.whynote a{font-weight:600;font-size:15px;min-height:44px;display:inline-flex;align-items:center;align-self:flex-start}
.notfound h1{font:600 36px/1.2 var(--serif);margin:0 0 10px;overflow-wrap:anywhere}
.range,.cprice,td{font-variant-numeric:lining-nums tabular-nums}
@media (max-width:860px){
  .rail{display:none}
  .mhead{display:flex;justify-content:space-between;align-items:center;padding:20px 16px 0}
  .mhead>a{font:600 22px/1 var(--serif);color:var(--ink);text-decoration:none}
  .mnav{display:flex;gap:2px}
  .mnav a.n{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;color:var(--sec);text-decoration:none;font-size:15px;border-radius:8px}
  .mnav a.n.on{color:var(--green);font-weight:600;background:var(--tint)}
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
  .card.anscard{display:flex;flex-direction:column}
  .ans-main{padding:18px;border-right:0;border-bottom:1px solid var(--div)}
  .anscard.solo .ans-main{border-bottom:0}
  .range{font-size:32px}.range .to{font-size:20px}
  .take{padding:16px 18px}
  .btns .btn{flex:1 1 100%}
  .watch input{min-width:0}
}`;
// Self-hosted (Oct 2026, search rule 11): Newsreader + Instrument Sans, latin and latin-ext only, from
// /fonts/. No third-party stylesheet blocks first paint; the two latin files are preloaded.
export const FONT_LINKS = "<link rel=\"preload\" href=\"/fonts/newsreader-normal-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin><link rel=\"preload\" href=\"/fonts/instrument-sans-normal-latin.woff2\" as=\"font\" type=\"font/woff2\" crossorigin><style>@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 400; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 400; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 500; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 500; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 600; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Instrument Sans'; font-style: normal; font-weight: 600; font-stretch: 100%; font-display: swap; src: url(/fonts/instrument-sans-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Newsreader'; font-style: italic; font-weight: 400; font-display: swap; src: url(/fonts/newsreader-italic-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Newsreader'; font-style: italic; font-weight: 400; font-display: swap; src: url(/fonts/newsreader-italic-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 400; font-display: swap; src: url(/fonts/newsreader-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 400; font-display: swap; src: url(/fonts/newsreader-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 500; font-display: swap; src: url(/fonts/newsreader-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 500; font-display: swap; src: url(/fonts/newsreader-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 600; font-display: swap; src: url(/fonts/newsreader-normal-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }@font-face { font-family: 'Newsreader'; font-style: normal; font-weight: 600; font-display: swap; src: url(/fonts/newsreader-normal-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }</style>";
// The Tasks badge, filled in the browser for a signed-in buyer: "Needs you" when Sam is waiting on an
// answer, else the count of unread updates. Signed out, nothing shows.
// Tasks in the rail: the badge, the app link when signed in, and the one-task rule at every entry point
// ([data-task-entry]: /buy "Have Sam keep looking", the VIN page button, the /tasks buttons).
const TASKS_BADGE = "<style>.tbadge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:9px;background:#1A1A1A;color:#fff;font:600 11px/1.3 var(--sans,sans-serif);vertical-align:1px}.tbadge.nu{background:#D7262C}p.tkblocked,.msg.sam p.tkblocked{margin:10px 0;padding:10px 14px;border-left:3px solid #D7262C;background:#fff;font:400 15px/1.5 var(--sans,sans-serif)!important;color:#1A1A1A;flex-basis:100%;max-width:640px}p.tkblocked a{color:#D7262C;font-weight:600;font-size:15px}</style><script>(function(){var s=null;try{s=JSON.parse(localStorage.getItem(\"gas_auth_session\")||\"null\");}catch(e){}var on=!!(s&&s.access_token),sum=null;function get(){if(!sum)sum=fetch(\"/api/tasks?summary=1\",{cache:\"no-store\",headers:{Authorization:\"Bearer \"+s.access_token}}).then(function(r){return r.json();}).catch(function(){return null;});return sum;}function go(el){var h=el.getAttribute(\"data-href\")||el.getAttribute(\"href\");if(h)location.href=h;}document.addEventListener(\"click\",function(e){var el=e.target.closest&&e.target.closest(\"[data-task-entry]\");if(!el||!on)return;e.preventDefault();get().then(function(j){var a=j&&j.signedIn&&j.active;if(!a)return go(el);var box=el.closest(\"p,nav,header,li\")||el,old=box.parentNode&&box.parentNode.querySelector(\".tkblocked\");if(old)old.remove();var m=document.createElement(\"p\");m.className=\"tkblocked\";m.setAttribute(\"role\",\"status\");m.innerHTML=(a.state===\"paused\"?\"Your task is paused. Resume or stop it to start another.\":\"You have one task running. Stop it to start another.\")+' <a href=\"/tasks/mine?task='+encodeURIComponent(a.id)+'#task-'+encodeURIComponent(a.id)+'\">Open your task</a>';box.insertAdjacentElement(\"afterend\",m);});});if(!on)return;document.querySelectorAll('.rail a[href=\"/tasks\"],.mnav a[href=\"/tasks\"],.mhead a[href=\"/tasks\"]').forEach(function(a){a.setAttribute(\"href\",\"/tasks/mine\");});get().then(function(j){if(!j||!j.signedIn)return;var t=j.active&&j.active.state===\"needs_you\"?\"Needs you\":(j.unread?String(j.unread):\"\");if(!t)return;document.querySelectorAll(\"[data-tasks-badge]\").forEach(function(b){b.textContent=t;b.hidden=false;if(t===\"Needs you\")b.classList.add(\"nu\");});});})();</script>";
export function railHtml(active, extra, crew) {
  const item = (key, href, label) => '<a class="n' + (active === key ? ' on" aria-current="page' : '') + '" href="' + href + '">' + label + '</a>';
  // A tiny inline flag so any client script loaded LATER on the same page (e.g. api/buy.js's CLIENT,
  // which builds some CTAs at runtime) can gate itself without a second cookie read.
  const flag = '<script>window.GAS_CREW=' + (crew ? 'true' : 'false') + ';</script>';
  if (!crew) {
    return flag +
      '<nav class="rail" aria-label="Main navigation"><a class="logo" href="/sell">GoAskSam</a>' +
      item('sell', '/sell', 'Where to sell') + (extra || '') + '</nav>' +
      '<header class="mhead"><a href="/sell">GoAskSam</a><nav class="mnav" aria-label="Sections">' + item('sell', '/sell', 'Sell') + '</nav></header>';
  }
  return flag +
    '<nav class="rail" aria-label="Main navigation"><a class="logo" href="/market-check">GoAskSam</a>' +
    item('ask', '/market-check', 'Ask Sam') + item('buy', '/buy', 'Buy') + item('sell', '/sell', 'Where to sell') + item('tasks', '/tasks', 'Tasks<span class="tbadge" data-tasks-badge hidden></span>') +
    (active === 'history' ? item('history', '#', 'Car histories') : '') +
    item('how', '/how-sam-decides', 'How Sam decides') + item('business', '/business', 'For business') + (extra || '') + '</nav>' +
    '<header class="mhead"><a href="/market-check">GoAskSam</a><nav class="mnav" aria-label="Sections">' + item('ask', '/market-check', 'Ask Sam') + item('buy', '/buy', 'Buy') + item('sell', '/sell', 'Sell') + item('tasks', '/tasks', 'Tasks<span class="tbadge" data-tasks-badge hidden></span>') + '</nav></header>' + TASKS_BADGE;
}

export function whyResultHtml(crew) {
  return '<section class="whynote"><span class="eyebrow">Why it looks like this</span><p>No chart and no score. Every figure on this page is a hammer price from a real auction, matched to the car&#8217;s trim, body and gearbox, converted at the rate on the day it sold, with the replicas, projects and odd sales set aside. The range is where most of those sales landed. Where there aren&#8217;t enough sales to say something, the page says so instead.</p>' + (crew ? '<a href="/how-sam-decides">How Sam decides &#8594;</a>' : '') + '</section>';
}
