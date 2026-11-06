// /preview/tasks and /preview/tasks/mine (Lane E, Nov 5 2026): the Tasks experience redesigned as CREW ONLY previews, NOT LIVE. Served by api/crewPage.js (crew cookie, or the platform's own 404), noindex, in no sitemap; the live /tasks and /tasks/mine are untouched.
// ROUTES USED: /preview/tasks (the public page; a signed in visitor with Tasks goes straight on) and /preview/tasks/mine (the dashboard). vercel.json already sends crew visitors of /tasks to the live page with extras (?_crew=1); these are separate addresses.
// The page computes nothing: the number of Tasks comes from lib/tasks/limit.js limitFacts, the words below are Sam's copy as given, and the centrepiece is hidden until Lane B's engine field exists (tasksDemoOf is its gate; fixtures for it live only in checks).
import { SHARED } from "./previewPages.js";
import { FREE_TASK_LIMIT, CREW_TASK_LIMIT, crewTaskLimit, limitFacts, freeTasksWords } from "../tasks/limit.js";
const { IC, esc, header, searchBox, footer, doc } = SHARED;

// THE LIMIT, never typed on the page: the account's own max comes from the API (limitFacts), the public page's from here, and for this crew only preview it is Lane S's crew limit, read ONLY from crewTaskLimit() and CREW_TASK_LIMIT in lib/tasks/limit.js.
// (This module lives in lib/preview/, never under public/, and is served only by api/crewPage.js behind the crew cookie.)
export async function crewLimitMax() { const v = typeof crewTaskLimit === "function" ? crewTaskLimit() : CREW_TASK_LIMIT; return Number.isInteger(v) && v > 0 ? v : FREE_TASK_LIMIT; }

// SAM'S COPY, EXACT (Nov 5 2026). The number words come from the limit; every other word is his.
export const COPY = {
  eyebrow: "YOUR SEARCH DOESN'T HAVE TO STOP",
  heading: "Tell Sam what you want. He'll keep looking.",
  support: "Describe the exact car you're after, including mileage, color, budget or location. Sam keeps checking supported auction platforms and lets you know when there's a match.",
  placeholder: "e.g. A red Ferrari under $150k with fewer than 20k miles",
  notHead: "Not another Porsche 911 alert.",
  not: ["Most auction alerts let you select a make and model on one website.", "With GoAskSam, you can describe the exact car you're looking for in your own words, including mileage, color, transmission, budget and location.", "Sam keeps looking across supported auction platforms and lets you know when something matches."],
  faqHead: "Questions",
  faq: (word) => [["Is it really free?", `Yes. You can run up to ${word} active Tasks for free.`],
    ["What can I ask Sam to find?", "Describe the car you want in your own words, including details such as make, model, year, mileage, color, transmission, budget and location."],
    ["How will I hear about matches?", "Matching vehicles appear in your Tasks, and Sam sends notifications according to your notification settings."],
    ["Can I change or stop a Task?", "Yes. Refine a Task by typing what you want changed, or pause, resume or stop it from your Tasks."],
    ["What's the difference between Search Tasks and Watching?", "Search Tasks look for new vehicles matching your description. Watching follows a particular vehicle you're already interested in."]]
};
// the two prominent lines, built from the limit
export const freeLines = max => ({ line: `${max} active ${max === 1 ? "Task" : "Tasks"}. Completely free.`, sub: `Run up to ${max} ${max === 1 ? "Task" : "Tasks"} at once. No subscription required.` });
export const limitWord = max => freeTasksWords(max).replace(/ active Tasks?$/, "");

// THE CENTREPIECE'S ENGINE FIELD (Lane B will build it; shape agreed here, NEEDED FROM LANE B in docs/lane-notes.md): one live car that the Task matcher proved matches the request written from it.
//   tasksDemo = { request, car:{ title, platform, url, photo, live:true, endsAt, priceLabel (the engine's own label: "Current bid $X" or "Asking $X"), mileage, mileageLine ("4,783 miles", reason history.miles), location, why }, previous?:{ kind:"sold"|"listed", date, platform, mileage, price (sold only), photo, url, historyUrl, priceLine ("Previously sold for $325,000", reason demo.prior_sale), mileageLine }, matchedAt, checkedAt }
// tasksDemoOf() is the gate: anything short of a complete, honest field returns null and the whole centrepiece is hidden (never an expired auction, a placeholder or an invented car).
const VALUATION = /\b(worth|valuation|valued|estimate[ds]?|appraisal|appraised|undervalued|overvalued|bargain|steal|cheap)\b/i;
const https = (u, allowData) => typeof u === "string" && (/^https:\/\/[^\s"'<>]+$/.test(u) || (allowData === true && /^data:image\//.test(u)));
const str = x => typeof x === "string" && x.trim().length > 0;
export function tasksDemoOf(d, { now = NaN, allowData = false } = {}) {
  const o = d && typeof d === "object" ? d : null; if (!o) return null;
  const c = o.car && typeof o.car === "object" ? o.car : null; if (!c) return null;
  if (!str(o.request) || VALUATION.test(o.request)) return null;
  if (!str(c.title) || !str(c.platform) || !https(c.url) || !https(c.photo, allowData) || c.live !== true || !str(c.priceLabel) || !str(c.location) || !str(c.why) || VALUATION.test(c.why)) return null;
  if (!str(c.mileageLine)) return null;   // the reading is the engine's line ("4,783 miles"); the page words no figure
  const ends = Date.parse(c.endsAt); if (!Number.isFinite(ends) || !(ends > now)) return null;
  if (!Number.isFinite(Date.parse(o.matchedAt)) || !Number.isFinite(Date.parse(o.checkedAt))) return null;
  if (o.criteria != null && (!Array.isArray(o.criteria) || o.criteria.some(x => !str(x) || VALUATION.test(x)))) return null;
  if (o.previous != null) { const p = o.previous; if (typeof p !== "object" || (p.kind !== "sold" && p.kind !== "listed") || !str(p.date) || !/\b(?:19|20)\d{2}\b/.test(p.date) || !str(p.platform) || !https(p.url) || !https(p.photo, allowData)) return null;
    if (p.kind === "sold" && !str(p.priceLine)) return null; if (p.mileage != null && !str(p.mileageLine)) return null; if (p.kind === "listed" && p.price != null) return null; if (p.historyUrl != null && !/^\/vin\/[^\s\/?#]+$/.test(p.historyUrl)) return null; }
  return o;
}
export function centrepieceHtml(d, opts) {
  const o = tasksDemoOf(d, opts); if (!o) return "";
  const c = o.car, p = o.previous, crit = Array.isArray(o.criteria) ? o.criteria : [];
  // SAM'S TWO COLUMNS (Nov 6 2026): left 40% THE REQUEST (the engine's words), right 60% SAM FOUND A MATCH (the car at card size, the engine's own price label, then the engine's matched criteria). Beneath, only when the engine carries an earlier record, the SOLD BEFORE row.
  const row = p ? `<${p.historyUrl ? 'a href="' + esc(p.historyUrl) + '"' : "div"} class="tc-prev" aria-label="${esc((p.kind === "sold" ? "Sold before" : "Listed before") + ", " + p.date + ": see this car's auction history")}"><span class="tc-pl">${p.kind === "sold" ? "SOLD BEFORE" : "LISTED BEFORE"}</span><span class="tc-pm">${esc(p.date)} &middot; ${esc(p.platform)}${p.mileage != null ? " &middot; " + esc(p.mileageLine) : ""}</span>${p.kind === "sold" ? `<span class="tc-pp">${esc(p.priceLine)}</span>` : `<span class="tc-pp tc-ns">No completed sale confirmed</span>`}${p.historyUrl ? '<span class="tc-lk">See this car\'s auction history &#8599;</span>' : ""}</${p.historyUrl ? "a" : "div"}>` : "";
  return `<section class="tc wrap" aria-label="A Task and its match" data-tasks-demo="1"><div class="tc-grid"><div class="tc-req"><p class="tc-rl t-eyebrow">THE REQUEST</p><div class="tc-bar"><span class="ico" aria-hidden="true">${IC.search}</span><span class="tc-rt">${esc(o.request)}</span></div></div>
<div class="tc-car"><p class="tc-rl t-eyebrow">SAM FOUND A MATCH</p><div class="tc-card"><a class="tc-photo" href="${esc(c.url)}" target="_blank" rel="noopener" aria-label="View this auction: ${esc(c.title)}"><img src="${esc(c.photo)}" alt="${esc(c.title + ", live at auction on " + c.platform)}" loading="eager" referrerpolicy="no-referrer"></a>
<div class="tc-ct"><h3 class="t-h3">${esc(c.title)}</h3><p class="tc-meta">${esc(c.platform)}</p><p class="tc-bid">${esc(c.priceLabel)}</p><p class="tc-meta">${esc(c.mileageLine)} &middot; ${esc(c.location)}</p>${crit.length ? `<ul class="tc-crit" aria-label="What matched">${crit.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<a class="tc-view" href="${esc(c.url)}" target="_blank" rel="noopener">View this auction</a></div></div></div></div>${row}</section>`;
}

export const TASKS_CSS = `
.tk-top{padding-top:64px;padding-bottom:40px}.tk-top>*{max-width:760px}
.tk-top .eb{color:var(--forest)}.tk-top h1{margin:14px 0 18px;text-wrap:balance}.tk-top .sup{margin:0 0 26px;color:var(--sec);max-width:60ch}
.tk-free{margin:0 0 28px;padding:16px 0 4px;border-top:1px solid var(--line)}.tk-free b{display:block;font:600 22px/1.25 var(--sans);color:var(--ink)}.tk-free span{display:block;margin-top:6px;color:var(--sec);font:400 15.5px/1.5 var(--sans)}
.tk-top .sb{margin-top:20px}
.tc{padding-top:28px;padding-bottom:20px}
.tc-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:44px;align-items:start}
.tc-rl{margin:0 0 12px;color:var(--forest)}
.tc-bar{display:flex;align-items:flex-start;gap:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r-box);padding:20px 22px;box-shadow:0 1px 2px rgba(11,49,38,.08),0 6px 18px rgba(11,49,38,.06)}.tc-bar .ico{font-size:22px;margin-top:2px}.tc-rt{font:400 19px/1.45 var(--sans);color:var(--ink)}
.tc-card{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:22px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:var(--r-box);padding:14px;box-shadow:0 1px 2px rgba(11,49,38,.06)}
.tc-photo{display:block;border-radius:10px;overflow:hidden;background:#E6E2D8;aspect-ratio:3/2}.tc-photo img{display:block;width:100%;height:100%;object-fit:cover}
.tc-ct{min-width:0;padding:2px 4px 2px 0}.tc-ct h3{margin:0 0 4px;font-size:24px}.tc-meta{margin:0 0 4px;color:var(--sec);font:400 15.5px/1.45 var(--sans)}.tc-bid{margin:2px 0 4px;font:600 22px/1.25 var(--sans);color:var(--ink)}
.tc-crit{margin:12px 0 12px;padding:0;list-style:none;display:grid;gap:5px}.tc-crit li{position:relative;padding-left:20px;font:400 15px/1.4 var(--sans);color:var(--ink)}.tc-crit li::before{content:"";position:absolute;left:2px;top:.5em;width:9px;height:5px;border-left:2px solid var(--forest);border-bottom:2px solid var(--forest);transform:rotate(-45deg) translateY(-30%)}
.tc-view{font:500 15px/1.2 var(--sans);color:var(--forest);text-underline-offset:4px}
.tc-prev{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 26px;margin-top:22px;padding:16px 22px;background:var(--tint);border:1px solid #C9D6CD;border-left:4px solid var(--forest);border-radius:12px;text-decoration:none;color:inherit}
a.tc-prev:hover{background:#DCE8E0}
.tc-pl{font:600 12px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--forest)}.tc-pm{color:var(--sec);font:400 15.5px/1.4 var(--sans)}.tc-pp{font:600 18px/1.3 var(--sans);color:var(--ink)}.tc-ns{font-size:16px;font-weight:500}
.tc-lk{margin-left:auto;font:500 15px/1.2 var(--sans);color:var(--forest);text-underline-offset:4px}a.tc-prev:hover .tc-lk{text-decoration:underline}
.tk-not{padding-top:44px;padding-bottom:36px}.tk-not h2{margin:0 0 14px}.tk-not p{margin:0 0 10px;color:var(--sec);font:400 17px/1.6 var(--sans);max-width:66ch}.tk-not p:last-child{margin-bottom:0}
.tk-faq{padding-top:8px;padding-bottom:84px}.tk-faq>*{max-width:760px}.tk-faq h2{margin:0 0 14px}
.tk-faq details{border-top:1px solid var(--line);padding:0}.tk-faq details:last-child{border-bottom:1px solid var(--line)}
.tk-faq summary{list-style:none;cursor:pointer;padding:16px 0;font:500 17px/1.4 var(--sans);display:flex;justify-content:space-between;gap:16px}.tk-faq summary::-webkit-details-marker{display:none}.tk-faq summary::after{content:"+";color:var(--forest);font-size:20px;line-height:1}
.tk-faq details[open] summary::after{content:"\\2212"}.tk-faq p{margin:0 0 18px;color:var(--sec);max-width:62ch}
.tk-faq summary:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
@media (max-width:1180px){.tc-grid{grid-template-columns:1fr;gap:26px}}
@media (max-width:860px){.tk-top{padding-top:34px;padding-bottom:28px}.tk-free b{font-size:20px}.tc-card{grid-template-columns:1fr}.tc-lk{margin-left:0}.tk-not{padding-top:30px}.tk-faq{padding-bottom:52px}}
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
    if (typeof openSignInCard === "function") openSignInCard("Sign in to start your Task. Every GoAskSam account gets " + FREE + " free.", { dest: dest });
  }
  window.__tasksGo = go;
  if (input) input.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true })); } });
  if (form) form.addEventListener("submit", function(e){ e.preventDefault(); go((input && input.value || "").replace(/\s+/g, " ").trim().slice(0, 500)); });
  var P = new URLSearchParams(location.search);
  if (!signedIn() && (P.get("signin") || P.get("words"))) go((P.get("words") || "").slice(0, 500));
  if (signedIn()) { fetch("/api/tasks?summary=1", { cache: "no-store", headers: { Authorization: "Bearer " + token() } }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.signedIn && (j.active || Number(j.count) > 0)) location.replace(MINE); }).catch(function(){}); }
})();`;

export function tasksPublicHtml({ max = FREE_TASK_LIMIT, demo = null, now = NaN, allowData = false } = {}) {
  const f = limitFacts(0, max).max, free = freeLines(f);
  const body = `${header("tasks")}
<main><section class="tk-top wrap"><div class="eb t-eyebrow">${esc(COPY.eyebrow)}</div><h1 class="t-hero">${esc(COPY.heading)}</h1><p class="sup t-lead">${esc(COPY.support)}</p>
<p class="tk-free"><b>${esc(free.line)}</b><span>${esc(free.sub)}</span></p>${searchBox(true, COPY.placeholder)}</section>
${centrepieceHtml(demo, { now, allowData })}
<section class="tk-not wrap" aria-label="${esc(COPY.notHead)}"><h2 class="t-h2">${esc(COPY.notHead)}</h2>${COPY.not.map(t => `<p>${esc(t)}</p>`).join("")}</section>
<section class="tk-faq wrap" aria-label="${esc(COPY.faqHead)}"><h2 class="t-h3">${esc(COPY.faqHead)}</h2>${COPY.faq(f).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section></main>${footer()}`;
  const extra = `<script src="/js/auth.js" defer></script><script>${TASKS_JS.replace("__FREE_WORDS__", freeTasksWords(f))}</script>`;
  return doc("GoAskSam preview: Tasks", TASKS_CSS, body, extra);
}
