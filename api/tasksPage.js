// /tasks (Lane C, Oct 2026): the public page for Tasks (server-rendered, indexable, in the sitemap) and,
// for a signed-in buyer, the task app on the same URL (rendered in the browser). Positioning: car
// alerts, much smarter, and free. The example update is a REAL past match that went through the guard
// (app_config "tasks_example_update"); with none yet, the slot is left out ("better nothing than a
// fake number"). TASKS_PITCH and exampleUpdate() are exported so a homepage section can reuse them.
// Search: a conversation or a task is never a URL; any query-string variant is noindex, canonical /tasks.
import { BUY_CSS } from "./buy.js";
import { PAGE_CSS, FONT_LINKS, railHtml } from "./_chrome.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

export const TASKS_PITCH = { lead: "A free AI buying agent for collector cars.", sub: "Tell Sam what you're looking for. Sam keeps checking the market and lets you know when something matches." };
const HOW = "The cars Sam shows you come from our rules-based matching algorithm. AI helps understand the question and explain the results, but it does not invent the cars, the matches or the numbers. Every number comes from real market evidence.";
const FAQ = [
  ["Is it free?", "Yes. Every GoAskSam account gets one active task free. Sign in, tell Sam what you're looking for, and Sam keeps checking."],
  ["How is it different from a saved search?", "You describe the car in plain words, the way you'd tell a friend, and Sam confirms exactly what it will look for before it starts. When a car matches, the update says what came up, how far away it is and, when the same car has been to auction before, what happened then."],
  ["How will I be told?", "Each update appears in your task on GoAskSam, with a badge on Tasks, and Sam sends one email per update. Several matches in one check arrive as one update, never one email per car. When nothing new matches, Sam stays quiet."],
  ["Does AI choose the cars?", "No. Which live cars match your task is decided by our rules-based matching algorithm, the same one behind the GoAskSam search. AI helps understand what you asked for and write each update, but it does not invent the cars, the matches or the numbers."],
  ["Can I change or stop a task?", "Yes, at any time. Type the change in the task, or use the pause and stop links in any update. A task keeps running after a match until you pause or stop it."],
  ["What can I ask Sam to do?", "Watch for a car (\"Find me a black manual 997 under $70k\", \"Keep looking for a 964 within 500 miles of LA\"), or research one car (\"Research this car and tell me if it has sold before\" with its VIN or a listing link)."]
];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The real example update, if one has been recorded (never invented).
export async function exampleUpdate() {
  const env = supabaseEnv(); if (!env) return null;
  const r = await supabaseSelect(env, "app_config?key=eq.tasks_example_update&select=value&limit=1").catch(() => null);
  const v = r && r[0] && r[0].value; const o = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  return o && o.text ? o : null;
}

// The sign-in card is the shared one (js/auth.js openSignInCard), styled by the same rules /buy and
// /sell use: taken from BUY_CSS so there is one source. On desktop the card centres in the content
// column, clear of the 240px rail.
const AUTH_CSS = BUY_CSS.split("\n").filter(l => /^\.(hp-dialog|auth-)/.test(l)).join("\n") + "\n@media (min-width:861px){#auth-modal{padding-left:256px}}\n";
const CSS = `:root{--page:#FAF8F4;--ink:#1A1A1A;--sec:#5F5A53;--div:#E4DFD6;--red:#D7262C}
body{background:var(--page);color:var(--ink)}.rail{background:var(--page)}
.col{max-width:880px}
.tkhero h1{margin:8px 0 10px;font:500 46px/1.08 var(--serif);letter-spacing:-.015em}
.tkhero .lead{margin:0;font:400 23px/1.45 var(--serif)}
.tkhero .pos{margin:12px 0 0;font:500 14px/1.4 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sec)}
.cta{display:inline-flex;align-items:center;min-height:48px;margin-top:22px;padding:0 20px;border-radius:6px;background:var(--ink);color:#fff;font:500 16px/1 var(--sans);text-decoration:none;border:0;cursor:pointer}
.sec{border-top:1px solid var(--div);margin-top:34px;padding-top:22px}
.sec h2{margin:0 0 10px;font:500 26px/1.25 var(--serif)}
.sec p{margin:0 0 12px;font:400 17px/1.55 var(--sans)}
.example{border-left:2px solid var(--red);padding:2px 0 2px 16px;font:italic 400 20px/1.45 var(--serif)}
.example .who{display:block;font:600 12px/1 var(--sans);font-style:normal;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:8px}
.steps{margin:0;padding:0 0 0 20px;font:400 17px/1.6 var(--sans)}
.faq dt{margin-top:16px;font:500 19px/1.4 var(--serif)}
.faq dd{margin:4px 0 0;font:400 16px/1.55 var(--sans)}
/* the app (signed in) */
#tkapp{margin-top:8px}
.tkbox{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #D9D3C8;border-radius:6px;padding:4px 6px 4px 16px;margin-top:18px}
.tkbox input{flex:1;min-width:0;border:0;outline:0;font:400 17px/1.4 var(--sans);background:transparent;padding:12px 0}
.tkbox button{border:0;background:var(--ink);color:#fff;border-radius:6px;min-height:40px;padding:0 14px;font:500 15px var(--sans);cursor:pointer}
.tklist{list-style:none;margin:16px 0 0;padding:0}
.tklist li{border-top:1px solid var(--div);padding:12px 0;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.tklist a{color:var(--ink);font:400 17px/1.4 var(--serif);text-decoration:none}
.tklist a:hover{text-decoration:underline}
.st{font:600 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;padding:5px 7px;border-radius:4px;background:#EFEBE4;color:var(--ink)}
.st.needs_you{background:var(--red);color:#fff}.st.running{background:#1A1A1A;color:#fff}
.thread{margin-top:18px}
.msg{margin:0 0 14px}
.msg.buyer{font:400 17px/1.45 var(--sans);color:#3A3733}
.msg.sam{font:400 21px/1.4 var(--serif)}
.msg.sam.match{border-left:2px solid var(--red);padding-left:14px}
.tkcars{list-style:none;margin:-6px 0 16px;padding:0 0 0 16px;font:400 15px/1.45 var(--sans)}
.tkcars li{padding:4px 0;border-bottom:1px solid #E7E2DA}
.tkcars a{color:#1A1A1A;font-weight:600}
.tkcars span{color:#5F5A53}
.tkcars .more{color:#5F5A53;border:0}
.ctl{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 10px;font:500 15px var(--sans)}
.ctl a{color:var(--ink);text-decoration:underline;text-underline-offset:4px;min-height:44px;display:inline-flex;align-items:center}
.ctl a.go{color:var(--red)}
.sugg{margin-top:14px;font:400 16px/1.5 var(--sans)}
.sugg a{color:var(--red)}
@media (max-width:640px){.tkhero h1{font-size:34px}.tkhero .lead{font-size:19px}}`;

export default async function handler(req, res) {
  const ex = await exampleUpdate().catch(() => null);
  const hasQuery = /\?./.test(String(req.url || ""));
  const robots = hasQuery ? "noindex, follow" : "index, follow";
  const title = "Free AI car finder and collector car alerts | GoAskSam";
  const desc = `${TASKS_PITCH.lead} ${TASKS_PITCH.sub}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "WebPage", name: "Sam Tasks", url: "https://goasksam.com/tasks", description: desc }
  ];
  const rail = railHtml("tasks").replace(/<nav class="mnav"[\s\S]*?<\/nav>/, '<nav class="mnav" aria-label="Sections"><a class="n" href="/buy">Buy</a><span class="bar">|</span><a class="n" href="/sell">Sell</a><span class="bar">|</span><a class="n on" aria-current="page" href="/tasks">Tasks</a></nav>');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="${robots}"><link rel="canonical" href="https://goasksam.com/tasks">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="https://goasksam.com/tasks"><meta property="og:type" content="website"><meta property="og:image" content="https://goasksam.com/og-card.png">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
${FONT_LINKS}<style>${PAGE_CSS}${CSS}${AUTH_CSS}</style>${ld.map(o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, "\\u003c") + "</script>").join("")}</head><body>
${rail}
<main><div class="col">
<div id="tkapp" hidden></div>
<header class="tkhero"><p class="pos">Car alerts, much smarter, and free</p><h1>${esc(TASKS_PITCH.lead)}</h1><p class="lead" data-lead-sentence>${esc(TASKS_PITCH.sub)}</p>
<button type="button" class="cta" id="tkcta">Give Sam a task</button></header>
<section class="sec"><h2>How it works</h2><p>${esc(HOW)}</p>
<ol class="steps"><li>Tell Sam what you're looking for, in plain words.</li><li>Sam reads the job back to you, and starts when you say so.</li><li>Every time new cars come up for auction, the matching checks them against your task.</li><li>When one matches, Sam tells you what it is, how far away it is and, when the same car has been to auction before, what happened then. Nothing new means no message.</li></ol></section>
${ex ? `<section class="sec"><h2>A real update</h2><p class="example"><span class="who">Sam</span>${esc(ex.text)}</p></section>` : ""}
<section class="sec"><h2>Questions</h2><dl class="faq">${FAQ.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<p style="margin-top:30px"><button type="button" class="cta" id="tkcta2">Give Sam a task</button></p>
</div></main>
<script>try{sessionStorage.setItem("gas_fe_homepage_view","1")}catch(e){}window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};</script>
<script src="/js/auth.js"></script>
<script>${CLIENT}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", robots);
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
}

// The task app (browser). Signed out: the box and the buttons go to sign-in, which returns here.
const CLIENT = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  var app = $("tkapp");
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  function signedIn(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch(e){ return false; } }
  var params = new URLSearchParams(location.search);
  var STATE = { running: "Running", needs_you: "Needs you", paused: "Paused", done: "Done", draft: "Not started" };
  var openId = params.get("task"), data = null;
  function seedWords(){
    if (params.get("seed") === "vin" && params.get("vin")) return "Keep looking for this exact car: " + (params.get("car") ? params.get("car") + ", " : "") + "VIN " + params.get("vin");
    if (params.get("words")) return params.get("words");
    return "";
  }
  function seedObj(){
    if (params.get("seed") === "vin") return { from: "vin", ref: "vin:" + params.get("vin") };
    if (params.get("seed") === "buy") return { from: "buy_search", ref: null, filters: (function(){ try { return JSON.parse(params.get("filters") || "null"); } catch(e){ return null; } })() };
    return null;
  }
  function needSignIn(){
    var u = new URL(location.href); u.searchParams.set("start", "1"); try { history.replaceState(null, "", u.toString()); } catch(e){}
    var q = $("tkq"); if (q && q.value.trim()) { try { sessionStorage.setItem("gas_task_pending", q.value.trim()); } catch(e){} }
    if (typeof openSignInCard !== "function") return;
    openSignInCard("Sign in to give Sam a task. Every GoAskSam account gets one active task free.");
    var f = $("auth-email"), card = document.querySelector("#auth-modal .auth-dialog");
    if (card && card.scrollIntoView) card.scrollIntoView({ block: "center" });
    if (f) { try { f.focus({ preventScroll: true }); } catch(e){ f.focus(); } }
  }
  // Back from the email code (auth.js calls this after a sign-in): open the task box, with what the
  // buyer had typed.
  window.gateAfterSignup = function(){ params.set("start", "1"); load().then(function(){ var q = $("tkq"); var pend = null; try { pend = sessionStorage.getItem("gas_task_pending"); sessionStorage.removeItem("gas_task_pending"); } catch(e){} if (q && pend && !q.value) q.value = pend; if (q) q.focus(); }); };
  function box(prefill){
    return '<div class="tkbox"><label for="tkq" style="position:absolute;left:-9999px">Give Sam a task</label><input id="tkq" autocomplete="off" placeholder="Give Sam a task, e.g. find me a black manual 997 under $70k" value="' + esc(prefill || "") + '"><button type="button" id="tksend">Send</button></div>';
  }
  function ctlLinks(t){
    var a = [];
    if (t.state === "draft" && t.summary) a.push('<a href="#" class="go" data-act="start" data-id="' + t.id + '">Start the task</a>');
    if (t.state === "running" || t.state === "needs_you") a.push('<a href="#" data-act="pause" data-id="' + t.id + '">Pause</a>');
    if (t.state === "paused") a.push('<a href="#" class="go" data-act="resume" data-id="' + t.id + '">Resume</a>');
    if (t.state !== "done") a.push('<a href="#" data-act="stop" data-id="' + t.id + '">Stop</a>');
    return a.length ? '<p class="ctl">' + a.join("") + "</p>" : "";
  }
  // The cars behind a match update, each linking to its listing.
  function carList(u){
    var cs = (u.data && u.data.cards) || [];
    if (!cs.length) return "";
    var more = u.data.total > cs.length ? '<li class="more">' + (u.data.total - cs.length) + " more match.</li>" : "";
    return '<ul class="tkcars">' + cs.map(function(c){ var bits = [c.house, c.distance_miles != null ? c.distance_miles.toLocaleString("en-US") + " miles away" : c.location, c.miles ? c.miles.toLocaleString("en-US") + " mi" : null].filter(Boolean).join(" \u00b7 "); return '<li><a href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + esc(c.title || "Listing") + "</a>" + (bits ? ' <span>' + esc(bits) + "</span>" : "") + "</li>"; }).join("") + more + "</ul>";
  }
  function thread(t){
    return '<div class="thread"><h2 style="margin:0 0 6px;font:500 22px/1.3 var(--serif)">' + esc(t.summary || t.words) + ' <span class="st ' + t.state + '">' + STATE[t.state] + "</span></h2>" + ctlLinks(t) +
      (t.updates || []).map(function(u){ return '<p class="msg ' + (u.role === "buyer" ? "buyer" : "sam") + (u.kind === "match" ? " match" : "") + '">' + esc(u.text) + "</p>" + carList(u); }).join("") +
      box("") .replace('id="tkq"', 'id="tkq" data-task="' + t.id + '"').replace("Give Sam a task, e.g. find me a black manual 997 under $70k", "Reply to Sam, change the task, or say pause or stop") + "</div>";
  }
  function render(choice){
    var tasks = (data && data.tasks) || [], sugg = (data && data.suggestions) || [];
    var open = tasks.find(function(t){ return t.id === openId; }) || null;
    var h = '<h1 style="margin:8px 0 0;font:500 34px/1.15 var(--serif)">Your tasks</h1>';
    if (choice) h += '<p class="msg sam">Sam can run one task at a time. The one running now: ' + esc(choice.current.summary) + ' Which should Sam keep?</p><p class="ctl"><a href="#" class="go" data-act="keep_new" data-id="' + esc(choice.task.id) + '">Keep the new one</a><a href="#" data-act="keep_current" data-id="' + esc(choice.task.id) + '">Keep the current one</a></p>';
    if (tasks.length) h += '<ul class="tklist">' + tasks.map(function(t){ return '<li><span class="st ' + t.state + '">' + STATE[t.state] + '</span><a href="?task=' + t.id + '" data-open="' + t.id + '">' + esc(t.summary || t.words) + "</a>" + (t.unread ? ' <span class="st">' + t.unread + " new</span>" : "") + "</li>"; }).join("") + "</ul>";
    if (open) h += thread(open);
    else {
      h += box(seedWords());
      if (sugg.length) h += sugg.map(function(s){ return '<p class="sugg">You told Sam you were hunting: ' + esc(s.words) + '. <a href="#" data-sugg="' + esc(s.ref) + '" data-from="' + esc(s.from) + '" data-words="' + esc(s.words) + '">Start a task from it</a></p>'; }).join("");
    }
    app.innerHTML = h; app.hidden = false;
    var q = $("tkq"); if (q && (params.get("start") || params.get("seed"))) q.focus();
  }
  // The signed-in buyer's token, refreshed when near expiry (js/auth.js authValidToken), on every call.
  function token(){ if (typeof authValidToken === "function") return authValidToken(); try { return Promise.resolve((JSON.parse(localStorage.getItem("gas_auth_session") || "null") || {}).access_token || null); } catch(e){ return Promise.resolve(null); } }
  function api(body){ return token().then(function(tk){ return fetch("/api/tasks", { method: "POST", headers: tk ? { "Content-Type": "application/json", Authorization: "Bearer " + tk } : { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }).then(function(r){ if (r.status === 401) { needSignIn(); throw new Error("auth"); } return r.json(); }); }
  function load(){ return api({ action: "list", open: openId }).then(function(j){ data = j; render(); }).catch(function(){}); }
  function say(text, taskId){
    if (!signedIn()) return needSignIn();
    var btn = $("tksend"); if (btn) { btn.disabled = true; btn.textContent = "Sam is reading..."; }
    api({ action: "say", text: text, task_id: taskId || null, seed: taskId ? null : seedObj() }).then(function(j){ if (j.task) openId = j.task.id; return load().then(function(){ if (j.control && j.control.needChoice) render(j.control); }); }).catch(function(){ if (btn) { btn.disabled = false; btn.textContent = "Send"; } });
  }
  document.addEventListener("click", function(e){
    var t = e.target.closest("#tksend,[data-act],[data-open],[data-sugg],#tkcta,#tkcta2");
    if (!t) return;
    if (t.id === "tkcta" || t.id === "tkcta2") { if (!signedIn()) return needSignIn(); app.hidden = false; window.scrollTo(0, 0); var q0 = $("tkq"); if (q0) q0.focus(); return; }
    e.preventDefault();
    if (t.id === "tksend") { var q = $("tkq"); if (q && q.value.trim()) say(q.value.trim(), q.getAttribute("data-task")); return; }
    if (t.hasAttribute("data-open")) { openId = t.getAttribute("data-open"); history.replaceState(null, "", "?task=" + openId); load(); return; }
    if (t.hasAttribute("data-sugg")) { params = new URLSearchParams("words=" + encodeURIComponent(t.getAttribute("data-words"))); say(t.getAttribute("data-words")); return; }
    if (t.hasAttribute("data-act")) { api({ action: "control", task_id: t.getAttribute("data-id"), act: t.getAttribute("data-act") }).then(function(j){ if (j.task) openId = j.task.id; return load().then(function(){ if (j.needChoice) render(j); }); }); }
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target && e.target.id === "tkq") { e.preventDefault(); var q = e.target; if (q.value.trim()) say(q.value.trim(), q.getAttribute("data-task")); } });
  if (signedIn()) load().then(function(){ var pend = null; try { pend = sessionStorage.getItem("gas_task_pending"); sessionStorage.removeItem("gas_task_pending"); } catch(e){} var q = $("tkq"); if (q && pend && !q.value) q.value = pend; }); else if (params.get("seed") || params.get("start")) { app.innerHTML = box(seedWords()); app.hidden = false; }
})();`;
