// /preview/tasks and /preview/tasks/mine (Lane E, Nov 5 2026): the Tasks experience redesigned as CREW ONLY previews, NOT LIVE. Served by api/crewPage.js (crew cookie, or the platform's own 404), noindex, in no sitemap; the live /tasks and /tasks/mine are untouched.
// ROUTES USED: /preview/tasks (the public page; a signed in visitor with Tasks goes straight on) and /preview/tasks/mine (the dashboard). vercel.json already sends crew visitors of /tasks to the live page with extras (?_crew=1); these are separate addresses.
// The page computes nothing: the number of Tasks comes from lib/tasks/limit.js limitFacts, the words below are Sam's copy as given, and the centrepiece is hidden until Lane B's engine field exists (tasksDemoOf is its gate; fixtures for it live only in checks).
import { SHARED } from "./previewPages.js";
import { FREE_TASK_LIMIT, limitFacts, freeTasksWords } from "../tasks/limit.js";
const { IC, esc, header, searchBox, footer, doc } = SHARED;

// THE LIMIT, never typed on the page: the account's own max comes from the API (limitFacts), the public page's from here. Lane S's crew only limit (lane-s-tasks10) is read when it exists as crewTaskLimit() or CREW_TASK_LIMIT in lib/tasks/limit.js;
// until then the preview prints the live number, honestly.
export async function crewLimitMax() {
  try { const m = await import("../tasks/limit.js"); const v = typeof m.crewTaskLimit === "function" ? m.crewTaskLimit() : m.CREW_TASK_LIMIT; if (Number.isInteger(v) && v > 0) return v; } catch {}
  return FREE_TASK_LIMIT;
}

// SAM'S COPY, EXACT (Nov 5 2026). The number words come from the limit; every other word is his.
export const COPY = {
  eyebrow: "YOUR SEARCH DOESN'T HAVE TO STOP",
  heading: "Tell Sam what you're looking for. He'll keep looking.",
  support: "Describe the exact car you want, in your own words. Sam keeps checking across auction platforms and lets you know when something matches.",
  cta: "Give Sam a Task",
  under: "Describe it once. Sam keeps looking. Get relevant matches.",
  howHead: "How it works",
  how: [{ h: "Tell Sam what you want", b: "Describe the car in your own words, including the details that matter to you." }, { h: "Sam keeps searching", b: "Your Task checks for new vehicles matching your requirements across supported auction platforms." }, { h: "Hear when there's a match", b: "See matching cars in Tasks and receive updates through your notification settings." }],
  moreHead: "More than a saved search.",
  more: "Most alerts start with filters on one website. With GoAskSam, you simply describe the car you want, including the specifications, budget and location that matter to you. Sam keeps checking across auction platforms and lets you know when something matches.",
  faq: (word) => [["Is it really free?", `Yes. You can run up to ${word} active vehicle searches with a GoAskSam account, without a paid subscription.`],
    ["What can I ask Sam to find?", "Describe the car you're looking for in natural language, including model, year, mileage, price, location and other supported preferences."],
    ["How will I hear about matches?", "New matches appear in Tasks, with email notifications according to your settings."],
    ["Can I change or stop a Task?", "Yes. Refine, pause or stop your searches using the available Task controls."],
    ["What's the difference between My Searches and Watching?", "My Searches keeps looking for new vehicles. Watching follows a particular car or auction you've already found."]]
};
// the two prominent lines, built from the limit
export const freeLines = max => ({ line: `${max} active ${max === 1 ? "Task" : "Tasks"}. Completely free.`, sub: `Run up to ${max} searches at once. Sam keeps looking, and you don't pay a thing.` });
export const limitWord = max => freeTasksWords(max).replace(/ active Tasks?$/, "");

// THE CENTREPIECE'S ENGINE FIELD (Lane B will build it; shape agreed here, NEEDED FROM LANE B in docs/lane-notes.md): one live car that the Task matcher proved matches the request written from it.
//   tasksDemo = { request, car:{ title, platform, url, photo, live:true, endsAt, priceLabel (the engine's own label: "Current bid $X" or "Asking $X"), mileage, location, why }, previous?:{ kind:"sold"|"listed", date, platform, mileage, price (sold only), photo, url, historyUrl }, matchedAt, checkedAt }
// tasksDemoOf() is the gate: anything short of a complete, honest field returns null and the whole centrepiece is hidden (never an expired auction, a placeholder or an invented car).
const VALUATION = /\b(worth|valuation|valued|estimate[ds]?|appraisal|appraised|undervalued|overvalued|bargain|steal|cheap)\b/i;
const https = (u, allowData) => typeof u === "string" && (/^https:\/\/[^\s"'<>]+$/.test(u) || (allowData === true && /^data:image\//.test(u)));
const str = x => typeof x === "string" && x.trim().length > 0;
export function tasksDemoOf(d, { now = NaN, allowData = false } = {}) {
  const o = d && typeof d === "object" ? d : null; if (!o) return null;
  const c = o.car && typeof o.car === "object" ? o.car : null; if (!c) return null;
  if (!str(o.request) || VALUATION.test(o.request)) return null;
  if (!str(c.title) || !str(c.platform) || !https(c.url) || !https(c.photo, allowData) || c.live !== true || !str(c.priceLabel) || !str(c.location) || !str(c.why) || VALUATION.test(c.why)) return null;
  if (!(Number.isFinite(Number(c.mileage)) && Number(c.mileage) >= 0) && !str(c.mileage)) return null;
  const ends = Date.parse(c.endsAt); if (!Number.isFinite(ends) || !(ends > now)) return null;
  if (!Number.isFinite(Date.parse(o.matchedAt)) || !Number.isFinite(Date.parse(o.checkedAt))) return null;
  if (o.previous != null) { const p = o.previous; if (typeof p !== "object" || (p.kind !== "sold" && p.kind !== "listed") || !str(p.date) || !/\b(?:19|20)\d{2}\b/.test(p.date) || !str(p.platform) || !https(p.url) || !https(p.photo, allowData)) return null;
    if (p.kind === "sold" && !(Number(p.price) > 0)) return null; if (p.kind === "listed" && p.price != null) return null; if (p.historyUrl != null && !/^\/vin\/[^\s\/?#]+$/.test(p.historyUrl)) return null; }
  return o;
}
const usd = n => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });   // formatting only
const miles = x => typeof x === "string" ? x : Number(x).toLocaleString("en-US") + " miles";
export function centrepieceHtml(d, opts) {
  const o = tasksDemoOf(d, opts); if (!o) return "";
  const c = o.car, p = o.previous;
  const prev = p ? `<div class="tc-prev"><div class="tc-pd"><p class="tc-pl">${p.kind === "sold" ? "Sold before" : "Listed before"}</p><p class="tc-pm">${esc(p.date)} &middot; ${esc(p.platform)}${p.mileage != null ? " &middot; " + esc(miles(p.mileage)) : ""}</p>${p.kind === "sold" ? `<p class="tc-pp">Sold for ${esc(usd(p.price))}</p>` : `<p class="tc-pp tc-ns">No completed sale confirmed</p>`}${p.historyUrl ? `<a class="tc-lk" href="${esc(p.historyUrl)}">See this car's history &#8599;</a>` : ""}</div>
<a class="tc-pph" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="The earlier listing"><img src="${esc(p.photo)}" alt="${esc(c.title + ", at its earlier " + (p.kind === "sold" ? "sale" : "listing") + " in " + p.date)}" loading="eager" referrerpolicy="no-referrer"></a></div>` : "";
  return `<section class="tc wrap" aria-label="A Task and its match" data-tasks-demo="1"><div class="tc-req"><p class="tc-rl t-eyebrow">The request</p><div class="tc-bar"><span class="ico" aria-hidden="true">${IC.search}</span><span class="tc-rt">${esc(o.request)}</span></div></div>
<div class="tc-car"><p class="tc-rl t-eyebrow">A live match</p><a class="tc-photo" href="${esc(c.url)}" target="_blank" rel="noopener" aria-label="View this auction: ${esc(c.title)}"><img src="${esc(c.photo)}" alt="${esc(c.title + ", live at auction on " + c.platform)}" loading="eager" referrerpolicy="no-referrer"></a>
<h3 class="t-h3">${esc(c.title)}</h3><p class="tc-meta">${esc(c.platform)} &middot; ${esc(c.priceLabel)} &middot; ${esc(miles(c.mileage))} &middot; ${esc(c.location)}</p><p class="tc-why">${esc(c.why)}</p><a class="tc-view" href="${esc(c.url)}" target="_blank" rel="noopener">View this auction</a>${prev}</div>
<p class="tc-under">${esc(COPY.under)}</p></section>`;
}

export const TASKS_CSS = `
.tk-top{padding-top:64px;padding-bottom:40px}.tk-top>*{max-width:760px}
.tk-top .eb{color:var(--forest)}.tk-top h1{margin:14px 0 18px;text-wrap:balance}.tk-top .sup{margin:0 0 26px;color:var(--sec);max-width:60ch}
.tk-free{margin:0 0 28px;padding:16px 0 4px;border-top:1px solid var(--line)}.tk-free b{display:block;font:600 22px/1.25 var(--sans);color:var(--ink)}.tk-free span{display:block;margin-top:6px;color:var(--sec);font:400 15.5px/1.5 var(--sans)}
.tk-cta{display:inline-flex;align-items:center;height:44px;padding:0 20px;border:0;border-radius:var(--r-ctl);background:var(--forest);color:#fff;font:500 15.5px/1 var(--sans);cursor:pointer}.tk-cta:hover{background:var(--forest-hover)}.tk-cta:active{transform:translateY(1px)}
.tk-top .sb{margin-top:20px}
.tc{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:44px;align-items:start;padding-top:28px;padding-bottom:20px}
.tc-rl{margin:0 0 12px;color:var(--forest)}
.tc-bar{display:flex;align-items:flex-start;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r-box);padding:20px 22px;box-shadow:0 1px 2px rgba(11,49,38,.08),0 6px 18px rgba(11,49,38,.06)}.tc-bar .ico{font-size:22px;margin-top:2px}.tc-rt{font:400 19px/1.45 var(--sans);color:var(--ink)}
.tc-photo{display:block;border-radius:12px;overflow:hidden;background:#E6E2D8;aspect-ratio:16/10}.tc-photo img{display:block;width:100%;height:100%;object-fit:cover}
.tc-car h3{margin:16px 0 4px}.tc-meta{margin:0 0 8px;color:var(--sec);font:400 15.5px/1.45 var(--sans)}.tc-why{margin:0 0 12px;font:400 16px/1.5 var(--sans);max-width:56ch}
.tc-view{font:500 15px/1.2 var(--sans);color:var(--forest);text-underline-offset:4px}
.tc-prev{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
.tc-pl{margin:0 0 6px;font:600 12px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec)}.tc-pm{margin:0 0 6px;color:var(--sec);font:400 15.5px/1.4 var(--sans)}.tc-pp{margin:0 0 8px;font:600 22px/1.2 var(--sans)}.tc-ns{font-size:16px;font-weight:500}
.tc-lk{font:500 15px/1.2 var(--sans);color:var(--forest);text-underline-offset:4px}
.tc-pph{flex:none;display:block;width:128px;aspect-ratio:3/2;border-radius:9px;overflow:hidden;background:#E6E2D8}.tc-pph img{display:block;width:100%;height:100%;object-fit:cover}
.tc-under{grid-column:1/-1;margin:6px 0 0;color:var(--sec);font:400 16px/1.5 var(--sans)}
.tk-how{display:grid;grid-template-columns:1.1fr repeat(3,1fr);padding-top:36px;padding-bottom:52px}
.tk-how .hd{padding-right:36px}.tk-how .eb{color:var(--forest)}.tk-how h2{margin:12px 0 0;font-size:clamp(26px,2.3vw,32px);line-height:1.18}
.tk-how .rule{padding:2px 26px 0;border-left:1px solid var(--line)}.tk-how .n{font:500 36px/1 var(--serif);color:var(--forest)}.tk-how h3{margin:12px 0 8px;font:600 18px/1.3 var(--sans)}.tk-how p{margin:0;color:var(--sec)}
.tk-more{padding-top:12px;padding-bottom:44px}.tk-more h2{margin:0 0 12px}.tk-more p{margin:0;color:var(--sec);font:400 17px/1.6 var(--sans);max-width:66ch}
.tk-faq{padding-top:8px;padding-bottom:84px}.tk-faq>*{max-width:760px}.tk-faq h2{margin:0 0 14px}
.tk-faq details{border-top:1px solid var(--line);padding:0}.tk-faq details:last-child{border-bottom:1px solid var(--line)}
.tk-faq summary{list-style:none;cursor:pointer;padding:16px 0;font:500 17px/1.4 var(--sans);display:flex;justify-content:space-between;gap:16px}.tk-faq summary::-webkit-details-marker{display:none}.tk-faq summary::after{content:"+";color:var(--forest);font-size:20px;line-height:1}
.tk-faq details[open] summary::after{content:"\\2212"}.tk-faq p{margin:0 0 18px;color:var(--sec);max-width:62ch}
.tk-faq summary:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
@media (max-width:1180px){.tk-how{grid-template-columns:repeat(3,1fr);row-gap:30px}.tk-how .hd{grid-column:1/-1;padding:0}.tk-how .rule:nth-of-type(1){border-left:0;padding-left:0}.tc{grid-template-columns:1fr;gap:28px}}
@media (max-width:860px){.tk-top{padding-top:34px;padding-bottom:28px}.tk-free b{font-size:20px}.tk-how{grid-template-columns:1fr;padding-bottom:36px}.tk-how .rule,.tk-how .rule:nth-of-type(1){border-left:0;padding:18px 0 0;border-top:1px solid var(--line)}.tc-pph{width:104px}.tk-faq{padding-bottom:52px}.tk-cta{width:100%;justify-content:center}}
`;

// The public page's script: the typed request is carried through sign in by the destination (the dashboard's own seed address, words=), the same way auth.js keeps a destination; a signed in visitor with Tasks goes straight to the dashboard.
const TASKS_JS = String.raw`(function(){
  var FREE = "__FREE_WORDS__", MINE = "/preview/tasks/mine";
  function signedIn(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch(e){ return false; } }
  function token(){ try { return (JSON.parse(localStorage.getItem("gas_auth_session") || "null") || {}).access_token || ""; } catch(e){ return ""; } }
  var input = document.getElementById("pq"), form = document.getElementById("pq-form");
  function destFor(words){ return MINE + "?start=1" + (words ? "&words=" + encodeURIComponent(words) : ""); }
  function go(words){
    var dest = destFor(words);
    if (signedIn()) { location.href = dest; return; }
    if (typeof openSignInCard === "function") openSignInCard("Sign in to give Sam a Task. Every GoAskSam account gets " + FREE + " free.", { dest: dest });
  }
  window.__tasksGo = go;
  if (form) form.addEventListener("submit", function(e){ e.preventDefault(); go((input && input.value || "").trim().slice(0, 500)); });
  var cta = document.getElementById("tk-cta"); if (cta) cta.addEventListener("click", function(){ go((input && input.value || "").trim().slice(0, 500)); });
  var P = new URLSearchParams(location.search);
  if (!signedIn() && (P.get("signin") || P.get("words"))) go((P.get("words") || "").slice(0, 500));
  if (signedIn()) { fetch("/api/tasks?summary=1", { cache: "no-store", headers: { Authorization: "Bearer " + token() } }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.signedIn && (j.active || Number(j.count) > 0)) location.replace(MINE); }).catch(function(){}); }
})();`;

export function tasksPublicHtml({ max = FREE_TASK_LIMIT, demo = null, now = NaN, allowData = false } = {}) {
  const f = limitFacts(0, max).max, free = freeLines(f), word = limitWord(f);
  const body = `${header("tasks")}
<main><section class="tk-top wrap"><div class="eb t-eyebrow">${esc(COPY.eyebrow)}</div><h1 class="t-hero">${esc(COPY.heading)}</h1><p class="sup t-lead">${esc(COPY.support)}</p>
<p class="tk-free"><b>${esc(free.line)}</b><span>${esc(free.sub)}</span></p>
<button type="button" class="tk-cta" id="tk-cta">${esc(COPY.cta)}</button>${searchBox(true)}</section>
${centrepieceHtml(demo, { now, allowData })}
<section class="tk-how wrap" aria-label="${esc(COPY.howHead)}"><div class="hd"><div class="eb t-eyebrow">${esc(COPY.howHead)}</div></div>${COPY.how.map((r, i) => `<div class="rule"><div class="n">${i + 1}</div><h3>${esc(r.h)}</h3><p class="t-body">${esc(r.b)}</p></div>`).join("")}</section>
<section class="tk-more wrap"><h2 class="t-h2">${esc(COPY.moreHead)}</h2><p>${esc(COPY.more)}</p></section>
<section class="tk-faq wrap" aria-label="Questions"><h2 class="t-h3">Questions</h2>${COPY.faq(word).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section></main>${footer()}`;
  const extra = `<script src="/js/auth.js" defer></script><script>${TASKS_JS.replace("__FREE_WORDS__", freeTasksWords(f))}</script>`;
  return doc("GoAskSam preview: Tasks", TASKS_CSS, body, extra);
}
