// /business, "Sam Desk" (Lane A, Oct 2026, version five - replaces every earlier /business build).
// Shared app shell (lib/appShell.js), reduced public rail for signed out visitors. The worked example
// (section "Don't stop at the first answer") runs the SAME engine Market Check, Buy and Sell use
// (api/_historyData.js oneBoxFor -> lib/onebox.js runOneBox - never a second implementation),
// precomputed nightly into spec_market_cache (lib/live/deskExample.js, scripts/buildDeskExample.js) so
// the public page is a cheap table read. "Sam Desk" the product is /desk, crew-only always (api/desk.js)
// - this page markets it; the demo input here is not wired to a live query (see section 2).
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { heroHtml, HERO_CSS } from "../lib/heroImage.js";
import { lastUpdatedDate } from "../lib/asOf.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { deskExample } from "../lib/live/deskExample.js";

const TITLE = "Sam Desk | GoAskSam for business";
const DESC = "Sam Desk: ask the whole collector car market in plain words. Real sales, platform comparisons and market slices, with the cars behind every number.";
const SITE = "https://goasksam.com";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const mailHref = subject => `mailto:feedback@goasksam.com?subject=${encodeURIComponent(subject)}`;

const YOUR_RESULTS_RAIL = '<a class="gas-navitem" id="gas-nav-results" href="#" style="display:none">Your results</a><div class="gas-submenu" id="gas-results-menu"></div>';

const DESK_QUESTIONS = [
  "How many Porsche 911s sold in the last three months?",
  "Which platform has performed best for E39 M5s this year?",
  "Show me 458 Italia results by mileage over the last 24 months.",
  "Which cars came back to auction this year and sold for less?"
];

const AREAS = [
  { name: "Market analysis", body: "Ask what is moving, what is slowing and how a segment has changed. Slice the answer by time, mileage, specification, platform or whatever matters." },
  { name: "Evidence and risk", body: "See the real sales around a car, the range most landed in and the evidence underneath it." },
  { name: "Platform intelligence", body: "Compare sell through, results, volume and behaviour across marketplaces and auction houses." },
  { name: "Research and consulting", body: "Answer client questions without building a collector car dataset from scratch. Go from a broad market question to the underlying cars without building a dataset first." }
];

const WHO_FOR = [
  { name: "Auction houses and marketplaces", body: "Understand your performance, the wider market and the cars moving through it." },
  { name: "Insurers and lenders", body: "Put real transaction evidence behind underwriting, claims and lending decisions." },
  { name: "Dealers, advisers and funds", body: "Track segments, compare opportunities and see the recent sales behind a number." },
  { name: "Consultants and research teams", body: "Answer market questions, build analyses and support client work without assembling the data manually." }
];

const TRUST = [
  { name: "Matched like with like.", body: "The family rules distinguish the cars that actually belong together." },
  { name: "Built from completed sales.", body: "Not asking prices dressed up as market data." },
  { name: "Every number opens.", body: "Click through to the sales, dates and sources behind it." },
  { name: "Sam says when the data is thin.", body: "No confident looking answer when the evidence is not there." }
];

const ICON = {
  arrow: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  rarrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

const CSS = `
:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--green-dk:#15372A;--page:#F6F3EC;--card:#FFFFFF;--div:#E2DED3;--border:#DCD8CC;--tint:#EDF3EE;--tint-line:#D5E2D8;--chip:#C9D6CC;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--main-bg,var(--page));color:var(--ink);font:400 17px/1.5 var(--sans)}
a{color:var(--green)}a:hover{color:var(--green-dk)}
:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.biz-col{max-width:1080px;margin:0 auto;padding:0 48px 80px}
.biz-eyebrow{margin:0 0 10px;padding:24px 0 0;font:600 13px/1.4 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--green)}
.biz-h1{margin:0 0 14px;font:600 clamp(34px,4.2vw,48px)/1.1 var(--serif);letter-spacing:-.02em;color:var(--ink);text-wrap:balance}
.biz-sub{margin:0 0 26px;font:400 19px/1.5 var(--sans);color:var(--soft);max-width:60ch}
.biz-ctas{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:0 0 36px}
.biz-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:12px;background:var(--green);color:#fff;font:600 16px var(--sans);text-decoration:none;border:0;cursor:pointer}
.biz-btn:hover{background:var(--green-dk);color:#fff}
.biz-quiet{font:600 15px/1 var(--sans);color:var(--green);text-decoration:underline;text-underline-offset:3px}
.biz-sec{padding:44px 0;border-top:1px solid var(--div)}
.biz-sec h2{margin:0 0 10px;font:600 26px/1.3 var(--serif);color:var(--ink)}
.biz-sec>.biz-sub2{margin:0 0 26px;font:400 17px/1.5 var(--sans);color:var(--soft);max-width:68ch}

/* section 2: the desk search demo */
.biz-desk-search{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:8px 8px 8px 20px;box-shadow:0 1px 2px rgba(21,32,26,.04);max-width:640px;margin:22px 0 10px}
.biz-desk-search input{flex:1;min-width:0;border:0;outline:0;font:400 18px/1.4 var(--sans);color:var(--ink);background:transparent}
.biz-desk-search input::placeholder{color:var(--sec)}
.biz-desk-go{width:46px;height:46px;flex:none;border:0;border-radius:10px;background:var(--green);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
.biz-desk-go:hover{background:var(--green-dk)}
.biz-desk-go svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.biz-desk-exlabel{margin:0 0 30px;font:500 12px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec)}
.biz-answerformat{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:28px}
.biz-af-h{margin:0 0 4px;font:600 16px/1.3 var(--sans);color:var(--ink)}
.biz-answerformat p:last-child{margin:0;font:400 15px/1.5 var(--sans);color:var(--soft)}
.biz-followchips{display:flex;gap:10px;flex-wrap:wrap}
.biz-fchip{display:inline-flex;align-items:center;border:1px solid var(--div);background:var(--tint);border-radius:999px;padding:8px 16px;font:400 13px/1.2 var(--sans);color:var(--soft)}

/* section 3: four areas */
.biz-areas{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.biz-area{background:var(--card);border:1px solid var(--div);border-radius:16px;padding:28px 26px;box-shadow:0 10px 24px -18px rgba(21,32,26,.35)}
.biz-area h3{margin:0 0 8px;font:600 19px/1.3 var(--serif);color:var(--ink)}
.biz-area p{margin:0;font:400 15px/1.55 var(--sans);color:var(--soft)}

/* section 4: the real worked example steps */
.biz-steps{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;align-items:stretch;gap:14px}
.biz-step{background:var(--tint);border:1px solid var(--tint-line);border-radius:14px;padding:20px 18px;display:flex;flex-direction:column;gap:8px;min-width:0}
.biz-step-lab{margin:0;font:600 12px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--green)}
.biz-step-q{margin:0;font:400 14px/1.4 var(--sans);color:var(--soft)}
.biz-step-a{margin:0;font:600 26px/1.15 var(--serif);color:var(--green)}
.biz-step-table{display:flex;flex-direction:column;gap:4px;margin-top:2px}
.biz-step-trow{display:flex;justify-content:space-between;gap:10px;font:400 14px/1.4 var(--sans);color:var(--ink)}
.biz-step-trow b{font-weight:600}
.biz-step-cmp{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.biz-step-cmpitem{font:400 13px/1.4 var(--sans);color:var(--ink)}
.biz-step-cmpitem b{display:block;font:600 16px/1.2 var(--serif);color:var(--green)}
.biz-step-cards{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.biz-step-card{display:flex;gap:10px;align-items:center;text-decoration:none;min-width:0}
.biz-step-card-ph{width:44px;height:34px;flex:none;border-radius:6px;background:var(--border);overflow:hidden}
.biz-step-card-ph img{width:100%;height:100%;object-fit:cover;display:block}
.biz-step-card-t{min-width:0;display:flex;flex-direction:column}
.biz-step-card-t span:first-child{font:600 13px/1.3 var(--sans);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.biz-step-card-t span:last-child{font:400 12px/1.3 var(--sans);color:var(--sec)}
.biz-step-arrow{display:flex;align-items:center;justify-content:center;color:var(--chip);flex:none}
.biz-step-arrow svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.biz-step-note{margin:16px 0 0;font:400 13px/1.4 var(--sans);color:var(--sec)}

/* section 5 */
.biz-who{display:grid;grid-template-columns:1fr 1fr;gap:18px 32px}
.biz-who-item{padding:4px 0}
.biz-who-item b{display:block;margin:0 0 4px;font:600 16px/1.4 var(--sans);color:var(--ink)}
.biz-who-item span{font:400 15px/1.55 var(--sans);color:var(--soft)}

/* section 6 */
.biz-trust{display:grid;grid-template-columns:1fr 1fr;gap:18px 32px}
.biz-trust-item b{display:block;margin:0 0 4px;font:600 16px/1.4 var(--sans);color:var(--ink)}
.biz-trust-item span{font:400 15px/1.55 var(--sans);color:var(--soft)}
.biz-trust-link{display:block;margin-top:18px;font:600 15px/1.4 var(--sans)}

/* close / form */
.biz-close{margin-top:28px;padding:32px;background:var(--card);border:1px solid var(--div);border-radius:16px}
.biz-close-pair{margin:0 0 20px;font:400 15px/1.6 var(--sans);color:var(--soft)}
.biz-close-pair b{color:var(--ink);font-weight:600}
.biz-lead{display:flex;flex-direction:column;gap:12px;max-width:440px}
.biz-lead input,.biz-lead textarea{border:1px solid var(--border);border-radius:10px;padding:12px 14px;font:400 15px var(--sans);color:var(--ink);background:var(--page)}
.biz-lead textarea{resize:vertical;min-height:70px}
.biz-lead-msg{margin:0;font:400 14px/1.4 var(--sans);color:var(--sec)}
.biz-lead-msg[hidden]{display:none}
.biz-lead-msg.ok{color:var(--green);font:500 17px/1.5 var(--serif);padding:8px 0}

@media (max-width:860px){
  .biz-areas{grid-template-columns:1fr}
  .biz-who{grid-template-columns:1fr}
  .biz-trust{grid-template-columns:1fr}
  .biz-steps{grid-template-columns:1fr}
  .biz-step-arrow{transform:rotate(90deg);padding:2px 0}
  .biz-answerformat{grid-template-columns:1fr}
}
@media (max-width:640px){
  .biz-col{padding:0 20px 56px}
  .biz-h1{font-size:30px}
  .biz-sub{font-size:17px}
  .biz-sec{padding:34px 0}
  .biz-sec h2{font-size:22px}
}
${HERO_CSS}`;

function areasHtml() {
  return AREAS.map(a => `<div class="biz-area"><h3>${esc(a.name)}</h3><p>${esc(a.body)}</p></div>`).join("");
}
function whoHtml() {
  return WHO_FOR.map(w => `<div class="biz-who-item"><b>${esc(w.name)}</b><span>${esc(w.body)}</span></div>`).join("");
}
function trustHtml() {
  return TRUST.map(t => `<div class="biz-trust-item"><b>${esc(t.name)}</b><span>${esc(t.body)}</span></div>`).join("");
}
function stepArrow() { return `<div class="biz-step-arrow" aria-hidden="true">${ICON.rarrow}</div>`; }

// The ASK/REFINE/COMPARE/VERIFY steps, built ONLY from lib/live/deskExample.js's cached engine
// output (itself produced by oneBoxFor -> runOneBox, three real Porsche 911 generations - see that
// file's own header for why three year-pinned chassis-code queries, not one bare "911" query).
// Returns "" (the whole section is skipped) when the cache has nothing yet - never a mockup.
function stepsHtml(ex) {
  if (!ex || !Array.isArray(ex.gens) || ex.gens.length < 2 || !ex.compare || !Array.isArray(ex.verify) || !ex.verify.length) return "";
  const win = ex.windowLabel || "the last twelve months";
  const askQ = `How many Porsche 911s sold in ${win}?`;
  const ask = `<div class="biz-step"><p class="biz-step-lab">Ask</p><p class="biz-step-q">${esc(askQ)}</p><p class="biz-step-a">${esc(ex.totalSoldCount)}</p></div>`;
  const refineRows = ex.gens.map(g => `<div class="biz-step-trow"><span>${esc(g.label)}</span><b>${esc(g.soldCount)} sold</b></div>`).join("");
  const refine = `<div class="biz-step"><p class="biz-step-lab">Refine</p><p class="biz-step-q">Split them by generation.</p><div class="biz-step-table">${refineRows}</div></div>`;
  const yoy = ex.compare.yoyDirection;
  const compareHtml = yoy && Array.isArray(yoy.recentBand) && Array.isArray(yoy.priorBand)
    ? `<div class="biz-step-cmp"><div class="biz-step-cmpitem">${esc(yoy.recentWindow || "The last twelve months")}<b>${esc(usd(yoy.recentBand[0]))} to ${esc(usd(yoy.recentBand[1]))}</b></div><div class="biz-step-cmpitem">${esc(yoy.priorWindow || "The twelve months before")}<b>${esc(usd(yoy.priorBand[0]))} to ${esc(usd(yoy.priorBand[1]))}</b></div></div>`
    : "";
  const compare = `<div class="biz-step"><p class="biz-step-lab">Compare</p><p class="biz-step-q">Typical price against the twelve months before, for the ${esc(ex.compare.genCode)}.</p>${compareHtml}</div>`;
  const cards = ex.verify.map(c => {
    const img = c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : "";
    const meta = [c.platform || "", c.month || ""].filter(Boolean).join(" · ");
    return c.url ? `<a class="biz-step-card" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><span class="biz-step-card-ph">${img}</span><span class="biz-step-card-t"><span>${esc(usd(c.price))}</span><span>${esc(meta)}</span></span></a>`
      : `<div class="biz-step-card"><span class="biz-step-card-ph">${img}</span><span class="biz-step-card-t"><span>${esc(usd(c.price))}</span><span>${esc(meta)}</span></span></div>`;
  }).join("");
  const verify = `<div class="biz-step"><p class="biz-step-lab">Verify</p><p class="biz-step-q">Open the cars behind any number.</p><div class="biz-step-cards">${cards}</div></div>`;
  return `<div class="biz-steps">${ask}${stepArrow()}${refine}${stepArrow()}${compare}${stepArrow()}${verify}</div>` +
    `<p class="biz-step-note">${esc(ex.gens.map(g => g.code).join(", "))} Porsche 911 generations, real sales, computed nightly from the shared archive.</p>`;
}

async function page(req) {
  const crew = isCrewRequest(req);
  const env = supabaseEnv();
  const [updated, ex] = await Promise.all([
    lastUpdatedDate(env).catch(() => null),
    deskExample(4000).catch(() => null)
  ]);
  const heroInner = `<p class="biz-eyebrow">SAM DESK${updated ? " · Updated " + esc(updated) : ""}</p>` +
    `<h1 class="biz-h1">Ask the whole collector car market.</h1>` +
    `<p class="biz-sub">Explore sales, compare platforms and slice the market by car, mileage, time period or almost any other question. Sam gives you the answer, the analysis and the cars behind it.</p>` +
    `<div class="biz-ctas"><a class="biz-btn" href="#walkthrough">Request a walkthrough</a><a class="biz-quiet" href="#how-it-works">See how it works</a></div>`;
  const deskPh = esc(JSON.stringify(DESK_QUESTIONS));
  const answerFormat = `<div class="biz-answerformat">` +
    `<div><p class="biz-af-h">Answer first.</p><p>One sentence answering the question.</p></div>` +
    `<div><p class="biz-af-h">Figure, chart or table.</p><p>Whichever is useful for that question.</p></div>` +
    `<div><p class="biz-af-h">Receipts.</p><p>Every number opens the underlying cars.</p></div>` +
    `</div>`;
  const followChips = `<div class="biz-followchips"><span class="biz-fchip">Now split that by mileage.</span><span class="biz-fchip">Only show no reserve sales.</span><span class="biz-fchip">Compare the last six months with the six before it.</span></div>`;
  const stepsSection = stepsHtml(ex);
  const body = `<main><div class="biz-col">` +
    heroHtml(heroInner, { alt: "A collector car", layout: "banner" }) +
    `<section class="biz-sec" id="how-it-works"><h2>Start with a question. Keep digging.</h2>` +
    `<div class="biz-desk-search" role="search"><label class="sr" for="desk-q">Ask Sam Desk a question</label>` +
    `<input id="desk-q" autocomplete="off" placeholder="${esc(DESK_QUESTIONS[0])}" data-ph='${deskPh}'>` +
    `<button type="button" class="biz-desk-go" id="desk-go" aria-label="Ask">${ICON.arrow}</button></div>` +
    `<p class="biz-desk-exlabel">Example questions</p>${answerFormat}${followChips}</section>` +
    `<section class="biz-sec"><h2>One market. Whatever question you have.</h2><div class="biz-areas">${areasHtml()}</div></section>` +
    (stepsSection ? `<section class="biz-sec"><h2>Don&#8217;t stop at the first answer.</h2><p class="biz-sub2">Sam Desk is built for follow up questions. Turn an answer into a breakdown, a table or a chart, change the period, isolate a mileage band or open the sales underneath it.</p>${stepsSection}</section>` : "") +
    `<section class="biz-sec"><h2>Who it is for.</h2><div class="biz-who">${whoHtml()}</div></section>` +
    `<section class="biz-sec"><h2>Every answer can be challenged.</h2><div class="biz-trust">${trustHtml()}</div><a class="biz-trust-link" href="/how-sam-decides">How Sam decides &#8594;</a></section>` +
    `<div class="biz-close" id="walkthrough"><p class="biz-close-pair"><b>GoAskSam:</b> ask about a car.<br><b>Sam Desk:</b> ask about the market.</p>` +
    `<form class="biz-lead" id="biz-lead-form"><input type="text" id="biz-name" placeholder="Name" autocomplete="name" required>` +
    `<input type="text" id="biz-company" placeholder="Company" autocomplete="organization">` +
    `<input type="email" id="biz-email" placeholder="Work email" autocomplete="email" required>` +
    `<textarea id="biz-message" placeholder="What do you want to know?"></textarea>` +
    `<button type="submit" class="biz-btn" id="biz-lead-submit">Request a walkthrough</button>` +
    `<p class="biz-lead-msg" id="biz-lead-msg" hidden></p></form></div>` +
    `</div></main>${SHELL_MAIN_CLOSE}`;
  const leadScript = `(function(){
    var f=document.getElementById("biz-lead-form"); if(!f) return;
    f.addEventListener("submit", function(e){
      e.preventDefault();
      var msg=document.getElementById("biz-lead-msg"), btn=document.getElementById("biz-lead-submit");
      var name=document.getElementById("biz-name").value.trim(), company=document.getElementById("biz-company").value.trim(), email=document.getElementById("biz-email").value.trim(), message=document.getElementById("biz-message").value.trim();
      if(btn.disabled) return;
      btn.disabled=true; btn.textContent="Sending...";
      fetch("/api/businessLead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,company:company,email:email,message:message})})
        .then(function(r){return r.json();}).then(function(j){
          msg.hidden=false;
          if(j&&j.ok){
            Array.prototype.forEach.call(f.children, function(el){ if(el!==msg) el.style.display="none"; });
            msg.className="biz-lead-msg ok"; msg.textContent="Thanks, your request is in. We’ll be in touch by email.";
          } else {
            btn.disabled=false; btn.textContent="Request a walkthrough";
            msg.className="biz-lead-msg"; msg.textContent="That did not go through. Please try again in a moment.";
          }
        }).catch(function(){ btn.disabled=false; btn.textContent="Request a walkthrough"; msg.hidden=false; msg.className="biz-lead-msg"; msg.textContent="That did not go through. Please try again in a moment."; });
    });
    // Section 2's demo box: Sam Desk itself (/desk) is crew-only, never public, so pressing go
    // scrolls to the walkthrough request rather than running a live query. Placeholder rotates
    // through the example questions until the field is focused.
    var dq=document.getElementById("desk-q"), dgo=document.getElementById("desk-go");
    if(dq){
      var list=[]; try{list=JSON.parse(dq.getAttribute("data-ph")||"[]");}catch(e){}
      var i=0, t=null, focused=false;
      dq.addEventListener("focus", function(){ focused=true; clearInterval(t); });
      if(list.length>1 && !(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)){
        t=setInterval(function(){ if(focused){clearInterval(t);return;} i=(i+1)%list.length; dq.setAttribute("placeholder", list[i]); }, 3200);
      }
    }
    function goToWalkthrough(){ var el=document.getElementById("walkthrough"); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); var nm=document.getElementById("biz-name"); if(nm) nm.focus(); }
    if(dgo) dgo.addEventListener("click", goToWalkthrough);
    if(dq) dq.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); goToWalkthrough(); } });
  })();`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${SITE}/business">
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="${SITE}/business"><meta property="og:type" content="website">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "business", pageExtra: YOUR_RESULTS_RAIL, crew })}
${body}
<script>${SHELL_JS}</script>
<script>${leadScript}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
</body></html>`;
  return { html, crew };
}

export default async function handler(req, res) {
  const { html, crew } = await page(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "index, follow");
  // Cache-poisoning fix (Oct 2026, reproduced live on Market Check, same pattern here): an INVALID
  // gas_crew cookie still computes crew=false and would get the public, cacheable header with no
  // Vary on Cookie - a later REAL crew request to the same bare URL can then hit that stale public
  // cache entry and see the reduced rail. Any gas_crew cookie at all, valid or not, skips the cache.
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie) ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
