// /preview/tasks and /preview/tasks/mine (Lane E, Nov 5 2026): the Tasks experience redesigned as CREW ONLY previews, NOT LIVE. Served by api/crewPage.js (crew cookie, or the platform's own 404), noindex, in no sitemap; the live /tasks and /tasks/mine are untouched.
// ROUTES USED: /preview/tasks (the public page; a signed in visitor with Tasks goes straight on) and /preview/tasks/mine (the dashboard). vercel.json already sends crew visitors of /tasks to the live page with extras (?_crew=1); these are separate addresses.
// The page computes nothing: the number of Tasks comes from lib/tasks/limit.js limitFacts, the words below are Sam's copy as given, and the centrepiece is hidden until Lane B's engine field exists (tasksDemoOf is its gate; fixtures for it live only in checks).
import { SHARED } from "./previewPages.js";
import { taskEmailBody } from "../tasks/tasks.js";
import { composeDigest } from "../tasks/digest.js";
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
  emailHead: "Here's what happens when Sam finds a match.",
  emailLine: "Sam keeps looking and emails you when a new car matches your Task.",
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

// "HERE'S WHAT HAPPENS WHEN SAM FINDS A MATCH" (Sam, Nov 8 2026, final): ONE email, the real Task match email, from a REAL stored match update. THE ENGINE'S SHAPE (Lane B, lib/live/tasksDemo.js tasksEmailExample): { source: "preferred"|"latest", update: { id, at }, subject, why, block } where block is exactly what
// lib/tasks/tasks.js taskEmailBlocks hands the template for that car (cardHtml, cardText, cardHead, bid ...) plus card, and why is the email's own reason line ("Matches your Task: a BMW from 1995."). The whole email is made by the REAL lib/tasks/digest.js composeDigest (its "New since your last email" heading and its footer)
// around the Task's section, and the car card inside is the block's own cardHtml from lib/tasks/emailCards.js. When the engine also sends the Task's criteria (task: { summary, filters }) the section is the real lib/tasks/tasks.js taskEmailBody; until it does, the section is the block's card followed by the engine's own reason line, printed as sent.
// The page types nothing of the email and computes nothing; hidden until the field exists and is complete. Watching is not featured here (it stays in the FAQ).
const VALUATION = /\b(worth|valuation|valued|estimate[ds]?|appraisal|appraised|undervalued|overvalued|bargain|steal|cheap)\b/i;
const str = x => typeof x === "string" && x.trim().length > 0;
export function emailExampleOf(field) {
  const o = field && typeof field === "object" ? field : null; if (!o) return null;
  const b = o.block && typeof o.block === "object" ? o.block : null; if (!b || !str(b.cardHtml) || !str(b.cardText) || VALUATION.test(b.cardText)) return null;
  if (!str(o.why) || VALUATION.test(o.why)) return null;
  const t = o.task && typeof o.task === "object" && str(o.task.summary) && !VALUATION.test(o.task.summary) && o.task.filters && typeof o.task.filters === "object" ? o.task : null;
  return { block: b, why: o.why, subject: str(o.subject) ? o.subject : null, task: t, every: str(o.every) ? o.every : "daily", source: o.source === "latest" ? "latest" : "preferred" };
}
// the Task's section of the email: the real taskEmailBody when the engine sent the Task's criteria, else the block's own card and reason line
export function emailSectionOf(ex) {
  if (ex.task) return taskEmailBody({ id: "example", ...ex.task }, [ex.block], { section: true });
  const esc2 = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return { text: ex.block.cardText + "\n" + ex.why, html: (ex.block.cardHead || "") + ex.block.cardHtml + `<p class="em-why">${esc2(ex.why)}</p>` };
}
// the real email: the whole email from composeDigest (a later email: catchUp false, so the heading is "New since your last email")
export function renderTaskEmail(ex) {
  const section = emailSectionOf(ex);
  return composeDigest([{ subject: ex.subject, text: section.text, html: section.html, cars: 1, catchUp: false }], { every: ex.every, first: false, stopAll: null });
}
export function taskEmailSectionHtml(field) {
  const ex = emailExampleOf(field); if (!ex) return "";
  const mail = renderTaskEmail(ex);
  return `<section class="em wrap" aria-label="${esc(COPY.emailHead)}" data-task-email="1"><h2 class="t-h2">${esc(COPY.emailHead)}</h2><p class="em-line">${esc(COPY.emailLine)}</p><div class="em-frame" role="group" aria-label="The email Sam sends"><div class="em-body">${mail.html}</div></div></section>`;
}
export const TASKS_CSS = `
.tk-top{padding-top:56px;padding-bottom:8px}.tk-top>*{max-width:760px}
.tk-top .eb{color:var(--forest)}.tk-top h1{margin:14px 0 18px;text-wrap:balance}.tk-top .sup{margin:0 0 26px;color:var(--sec);max-width:60ch}
.tk-free{margin:0 0 28px;padding:16px 0 4px;border-top:1px solid var(--line)}.tk-free b{display:block;font:600 22px/1.25 var(--sans);color:var(--ink)}.tk-free span{display:block;margin-top:6px;color:var(--sec);font:400 15.5px/1.5 var(--sans)}
.tk-top .sb{margin-top:20px}
.em{padding-top:18px;padding-bottom:4px;text-align:left}.em h2{margin:0 0 8px}.em-line{margin:0 0 16px;color:var(--sec);font:400 17px/1.5 var(--sans);max-width:62ch}
.em-frame{max-width:540px;margin:0;text-align:left;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 34px rgba(11,49,38,.10),0 1px 2px rgba(11,49,38,.06);padding:10px 12px;overflow:hidden}
.em-why{margin:6px 0 0;font:400 15px/1.5 Arial,sans-serif;color:#1A1A1A}.em-body{overflow-wrap:anywhere}.em-body table{max-width:100%}
/*EM-HIDE*/
.em-body>div>h2{margin:0 0 6px!important}.em-body .gc-card{border:0!important;border-radius:0!important}.em-body .gc-card img{border-radius:10px}.em-body .gc-card>tbody{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.em-body .gc-card>tbody>tr{display:block;flex:0 0 100%}.em-body .gc-card>tbody>tr:nth-child(2),.em-body .gc-card>tbody>tr:nth-child(3){flex:0 0 auto}.em-body .gc-card td.gc-pad{padding-top:0!important;padding-bottom:0!important;padding-left:0!important;padding-right:0!important}.em-body .gc-card tr:has(.gc-t),.em-body .gc-card tr:has(.gc-m){line-height:1.25}.em-body .gc-card p{margin:1px 0!important;line-height:1.15!important}.em-body .gc-card tr:has(.gc-t) td{padding-top:2px!important}.em-body>div>div>.gc-card+p{margin:4px 2px 0!important}
.em-body .gc-card img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.em-body .gc-card tr:has(.gc-chip),.em-body .gc-card tr:has(.gc-panel),.em-body .gc-card tr:has(.gc-s),.em-body .gc-card tr:has(.gc-g):not(:has(.gc-btn)){display:none}
.em-body>div>p,.em-body>div>div>p{display:none}.em-body>div>div>.gc-card+p,.em-body>div>p.em-why{display:block}
/*/EM-HIDE*/
@media (max-width:640px){.em{padding-top:12px}.em-frame{padding:12px 12px;border-radius:14px}}
.tk-not{padding-top:28px;padding-bottom:20px}.tk-not h2{margin:0 0 14px}.tk-not p{margin:0 0 10px;color:var(--sec);font:400 17px/1.6 var(--sans);max-width:66ch}.tk-not p:last-child{margin-bottom:0}
.tk-faq{padding-top:4px;padding-bottom:56px}.tk-faq>*{max-width:760px}.tk-faq h2{margin:0 0 14px}
.tk-faq details{border-top:1px solid var(--line);padding:0}.tk-faq details:last-child{border-bottom:1px solid var(--line)}
.tk-faq summary{list-style:none;cursor:pointer;padding:16px 0;font:500 17px/1.4 var(--sans);display:flex;justify-content:space-between;gap:16px}.tk-faq summary::-webkit-details-marker{display:none}.tk-faq summary::after{content:"+";color:var(--forest);font-size:20px;line-height:1}
.tk-faq details[open] summary::after{content:"\\2212"}.tk-faq p{margin:0 0 18px;color:var(--sec);max-width:62ch}
.tk-faq summary:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
@media (max-width:860px){.tk-top{padding-top:34px;padding-bottom:8px}.tk-free b{font-size:20px}.tk-not{padding-top:20px}.tk-faq{padding-bottom:40px}}
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

// THE COPY PRINTS THE PUBLIC LIMIT, whoever asks (Sam, Nov 11 2026): the headline, the "Run up to N" line, the FAQ and the page script read FREE_TASK_LIMIT, never the viewer's own cap. An account's own cap shows only on its Tasks list and in the message it gets when it hits it (the API's facts). A caller cannot pass a number in.
export function tasksPublicHtml({ emailExample = null, readError = null } = {}) {
  const f = limitFacts(0, FREE_TASK_LIMIT).max, free = freeLines(f), emh = taskEmailSectionHtml(emailExample) || (readError ? `<section class="em wrap" data-could-not-read="tasks"><p class="em-line">${esc(readError)}</p></section>` : "");
  const body = `${header("tasks")}
<main><section class="tk-top wrap"><div class="eb t-eyebrow">${esc(COPY.eyebrow)}</div><h1 class="t-hero">${esc(COPY.heading)}</h1><p class="sup t-lead">${esc(COPY.support)}</p>
<p class="tk-free"><b>${esc(free.line)}</b><span>${esc(free.sub)}</span></p>${searchBox(true, COPY.placeholder)}</section>
${emh}
<section class="tk-not wrap" aria-label="${esc(COPY.notHead)}"><h2 class="t-h2">${esc(COPY.notHead)}</h2>${COPY.not.map(t => `<p>${esc(t)}</p>`).join("")}</section>
<section class="tk-faq wrap" aria-label="${esc(COPY.faqHead)}"><h2 class="t-h3">${esc(COPY.faqHead)}</h2>${COPY.faq(f).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section></main>${footer()}`;
  const extra = `<script src="/js/auth.js" defer></script><script>${TASKS_JS.replace("__FREE_WORDS__", freeTasksWords(f))}</script>`;
  return doc("GoAskSam preview: Tasks", TASKS_CSS, body, extra);
}
