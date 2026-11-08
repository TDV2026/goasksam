// /preview/tasks and /preview/tasks/mine (Lane E, Nov 5 2026): the Tasks experience redesigned as CREW ONLY previews, NOT LIVE. Served by api/crewPage.js (crew cookie, or the platform's own 404), noindex, in no sitemap; the live /tasks and /tasks/mine are untouched.
// ROUTES USED: /preview/tasks (the public page; a signed in visitor with Tasks goes straight on) and /preview/tasks/mine (the dashboard). vercel.json already sends crew visitors of /tasks to the live page with extras (?_crew=1); these are separate addresses.
// The page computes nothing: the number of Tasks comes from lib/tasks/limit.js limitFacts, the words below are Sam's copy as given, and the centrepiece is hidden until Lane B's engine field exists (tasksDemoOf is its gate; fixtures for it live only in checks).
import { SHARED, engineCardOf } from "./previewPages.js";
import { REAL_CARD_CSS, jsonForScript, realCardsScripts } from "./realCards.js";
import { TASK_CARD_CSS, taskKitJs } from "./realTaskCards.js";
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
  notHead: "More than a saved search.",
  not: ["Most auction alerts are limited to filters on one website.", "With GoAskSam, you can describe exactly what you're looking for, and Sam keeps checking across supported platforms.", "You can also watch individual cars and get auction reminders."],
  seeHead: "See what Sam can find",
  taskLabel: "SEARCH TASK", watchLabel: "WATCHING", foundStatus: "Sam found a match",
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

// "SEE WHAT SAM CAN FIND" (Sam, Nov 6 and Nov 8 2026): THE CARDS ARE THE REAL CARDS. The Search Task is the dashboard's own Task card (compactCard: status pill, Sam's read back, the live car count, Pause and Stop shown disabled) with the real Find card of the match under it; Watching is the dashboard's own watching row with the real Find card of that car under it.
// Both components are lifted by name from the live source (lib/preview/realTaskCards.js, lib/preview/realCards.js), so a change to either card is a change here. The page draws nothing of its own and computes nothing: it hands the engine's objects to the component.
// NEEDED FROM LANE B (docs/lane-notes.md): tasksDemo = { task: <engine Task row: id, state, kind, summary (Sam's read back sentence), overview: { live, liveCount, cars, fresh? }>, card: <the engine card of the matched car> }
// and watchingDemo = { row: <engine watching row: ref, what, detail, ends_at?>, card: <engine card> }; each may instead be { fallback: { label ("Recent example"), task|row, card (an ended sale: card.sold = { price, when }) } }. A field that is not complete is not drawn.
const VALUATION = /\b(worth|valuation|valued|estimate[ds]?|appraisal|appraised|undervalued|overvalued|bargain|steal|cheap)\b/i;
const str = x => typeof x === "string" && x.trim().length > 0;
const clean = x => x == null || (str(x) && !VALUATION.test(x));
const taskRowOk = t => !!t && typeof t === "object" && str(t.id) && ["running", "paused", "done", "needs_you"].includes(t.state) && str(t.summary) && !VALUATION.test(t.summary) && !!t.overview && typeof t.overview === "object" && clean(t.overview.live) && clean(t.overview.fresh);
const watchRowOk = r => !!r && typeof r === "object" && str(r.ref) && str(r.what) && !VALUATION.test(r.what) && clean(r.detail);
export function demoPairOf(field, kind, opts) {
  const o = field && typeof field === "object" ? field : null; if (!o) return null;
  const rowKey = kind === "task" ? "task" : "row", rowOk = kind === "task" ? taskRowOk : watchRowOk;
  const live = engineCardOf({ card: o.card }, "live", opts); if (live && rowOk(o[rowKey])) return { live: true, row: o[rowKey], card: live, label: "" };
  const f = o.fallback && typeof o.fallback === "object" ? o.fallback : null; if (!f) return null;
  const sold = engineCardOf({ card: f.card }, "sold", opts); if (sold && rowOk(f[rowKey]) && clean(f.label)) return { live: false, row: f[rowKey], card: sold, label: str(f.label) ? f.label : "" };
  return null;
}
const SF_DRAW = 'var D=JSON.parse(document.getElementById("sf-data").textContent);function put(k,html){var e=document.querySelector(\'[data-sf-slot="\'+k+\'"]\');if(e)e.innerHTML=html}if(window.GASCARD&&window.GASTASK){if(D.task)put("task",window.GASTASK.card(D.task.row)+\'<div class="sf-car cgrid">\'+window.GASCARD.card(D.task.card)+"</div>");if(D.watching)put("watching",window.GASTASK.watching(D.watching.row)+\'<div class="sf-car cgrid">\'+window.GASCARD.card(D.watching.card)+"</div>");window.GASCARD.bind();window.GASCARD.stamp();}';
export function seeWhatSamCanFindHtml(d, w, opts) {
  const t = demoPairOf(d, "task", opts), wd = demoPairOf(w, "watching", opts); if (!t && !wd) return { html: "", scripts: "" };
  const cell = (k, label, p) => p ? `<article class="sf-card" data-sf="${k}"${p.live ? "" : ' data-fallback="1"'}><p class="sf-k t-eyebrow">${esc(label)}${p.label ? ` <span class="sf-ex">${esc(p.label)}</span>` : ""}</p><div class="sf-slot" data-sf-slot="${k}"></div></article>` : "";
  const html = `<section class="sf wrap" aria-label="${esc(COPY.seeHead)}"${t && t.live ? ' data-tasks-demo="1"' : ""}${wd && wd.live ? ' data-watching-demo="1"' : ""}${(t && !t.live) || (wd && !wd.live) ? ' data-fallback="1"' : ""}><h2 class="t-h2">${esc(COPY.seeHead)}</h2><div class="sf-grid">${cell("task", COPY.taskLabel, t)}${cell("watching", COPY.watchLabel, wd)}</div><script type="application/json" id="sf-data">${jsonForScript({ task: t && { row: t.row, card: t.card }, watching: wd && { row: wd.row, card: wd.card } })}</script></section>`;
  return { html, scripts: realCardsScripts() + "<script>" + taskKitJs() + "</script><script>" + SF_DRAW + "</script>" };
}

const SF_VARS = ":root{--div:var(--line);--green:var(--forest);--on-accent:#fff;--red:var(--forest);--tk-line:var(--line);--tk-soft:var(--tint);--tk-text2:var(--ink)}";
export const TASKS_CSS = `
.tk-top{padding-top:64px;padding-bottom:40px}.tk-top>*{max-width:760px}
.tk-top .eb{color:var(--forest)}.tk-top h1{margin:14px 0 18px;text-wrap:balance}.tk-top .sup{margin:0 0 26px;color:var(--sec);max-width:60ch}
.tk-free{margin:0 0 28px;padding:16px 0 4px;border-top:1px solid var(--line)}.tk-free b{display:block;font:600 22px/1.25 var(--sans);color:var(--ink)}.tk-free span{display:block;margin-top:6px;color:var(--sec);font:400 15.5px/1.5 var(--sans)}
.tk-top .sb{margin-top:20px}
.sf{padding-top:56px;padding-bottom:20px}.sf-ex{margin:0 0 8px;color:var(--forest)}.sf h2{margin:0 0 18px}
.sf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:auto auto auto;column-gap:24px;row-gap:12px}
.sf-card{display:grid;grid-row:span 3;grid-template-rows:subgrid;min-width:0}
.sf-k{margin:0;color:var(--forest)}.sf-ex{color:var(--sec);margin-left:8px;letter-spacing:.08em}
.sf-slot{display:contents}
.sf-slot .tc{min-width:0}.sf-slot .lkdemo{margin:0;padding:0;list-style:none;display:flex;min-width:0}.sf-slot .lkdemo li{flex:1;display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:12px 14px;min-width:0}.sf-slot .lkw{display:flex;flex-direction:column;gap:2px;font:500 16px/1.35 var(--sans)}.sf-slot .lkd{color:var(--sec);font:400 14.5px/1.4 var(--sans)}
.sf-car.cgrid{display:flex;min-width:0;gap:0;padding:0;margin:0}.sf-car .car{flex:0 1 360px;margin:0;width:100%;max-width:360px;height:auto}.sf-car .car .ph{aspect-ratio:16/10}.sf-car .car .ph img{width:100%;height:100%;object-fit:cover}
.tk-not{padding-top:44px;padding-bottom:36px}.tk-not h2{margin:0 0 14px}.tk-not p{margin:0 0 10px;color:var(--sec);font:400 17px/1.6 var(--sans);max-width:66ch}.tk-not p:last-child{margin-bottom:0}
.tk-faq{padding-top:8px;padding-bottom:84px}.tk-faq>*{max-width:760px}.tk-faq h2{margin:0 0 14px}
.tk-faq details{border-top:1px solid var(--line);padding:0}.tk-faq details:last-child{border-bottom:1px solid var(--line)}
.tk-faq summary{list-style:none;cursor:pointer;padding:16px 0;font:500 17px/1.4 var(--sans);display:flex;justify-content:space-between;gap:16px}.tk-faq summary::-webkit-details-marker{display:none}.tk-faq summary::after{content:"+";color:var(--forest);font-size:20px;line-height:1}
.tk-faq details[open] summary::after{content:"\\2212"}.tk-faq p{margin:0 0 18px;color:var(--sec);max-width:62ch}
.tk-faq summary:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
@media (max-width:860px){.sf{padding-top:36px}.tk-top{padding-top:34px;padding-bottom:28px}.tk-free b{font-size:20px}.tk-not{padding-top:30px}.tk-faq{padding-bottom:52px}}
@media (max-width:640px){.sf-grid{grid-template-columns:1fr;grid-template-rows:none}.sf-card{grid-row:auto;grid-template-rows:none;display:flex;flex-direction:column;gap:12px;margin-bottom:24px}}
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

export function tasksPublicHtml({ max = FREE_TASK_LIMIT, demo = null, watching = null, now = NaN, allowData = false } = {}) {
  const f = limitFacts(0, max).max, free = freeLines(f), sfo = seeWhatSamCanFindHtml(demo, watching, { now, allowData });
  const body = `${header("tasks")}
<main><section class="tk-top wrap"><div class="eb t-eyebrow">${esc(COPY.eyebrow)}</div><h1 class="t-hero">${esc(COPY.heading)}</h1><p class="sup t-lead">${esc(COPY.support)}</p>
<p class="tk-free"><b>${esc(free.line)}</b><span>${esc(free.sub)}</span></p>${searchBox(true, COPY.placeholder)}</section>
${sfo.html}
<section class="tk-not wrap" aria-label="${esc(COPY.notHead)}"><h2 class="t-h2">${esc(COPY.notHead)}</h2>${COPY.not.map(t => `<p>${esc(t)}</p>`).join("")}</section>
<section class="tk-faq wrap" aria-label="${esc(COPY.faqHead)}"><h2 class="t-h3">${esc(COPY.faqHead)}</h2>${COPY.faq(f).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section></main>${footer()}`;
  const extra = `<script src="/js/auth.js" defer></script><script>${TASKS_JS.replace("__FREE_WORDS__", freeTasksWords(f))}</script>${sfo.scripts}`;
  return doc("GoAskSam preview: Tasks", (sfo.html ? SF_VARS + "\n" + TASK_CARD_CSS + "\n" + REAL_CARD_CSS + "\n" : "") + TASKS_CSS, body, extra);
}
