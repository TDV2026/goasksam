// /tasks (Lane C, Oct 2026): the public explainer for Tasks (server-rendered, indexable, in the sitemap),
// and /tasks/mine (?app=1): the signed-in buyer's task app (noindex, not in the sitemap; signed-out
// visitors are sent to /tasks). Positioning: car
// alerts, much smarter, and free. The example update is a REAL past match that went through the guard
// (app_config "tasks_example_update"); with none yet, the slot is left out ("better nothing than a
// fake number"). TASKS_PITCH and exampleUpdate() are exported so a homepage section can reuse them.
// Search: a conversation or a task is never a URL; any query-string variant is noindex, canonical /tasks.
import { BUY_CSS } from "./buy.js";
import { PAGE_CSS, FONT_LINKS, railHtml, isCrewRequest } from "./_chrome.js";
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
@media (max-width:640px){.tkhero h1{font-size:34px}.tkhero .lead{font-size:19px}}`;

// The app (/tasks/mine): one task card, the feed, past tasks folded away. No marketing copy.
const APP_CSS = `
.apph{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:8px 0 18px}
.apph h1{margin:0;font:500 34px/1.15 var(--serif)}
.apph a{font:400 15px var(--sans);color:var(--sec);text-decoration:underline;text-underline-offset:4px}
.blocked{margin:0 0 18px;padding:12px 16px;border:1px solid var(--div);border-left:3px solid var(--red);background:#fff;font:400 16px/1.5 var(--sans)}
.blocked a{color:var(--red);font-weight:600}
.tcard{border:1px solid var(--div);border-radius:8px;background:#fff;padding:18px 20px 20px}
.thead{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.thead .tline{flex:1;min-width:220px;margin:0;font:400 21px/1.35 var(--serif)}
.pill{display:inline-block;font:600 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;padding:6px 8px;border-radius:4px;background:#EFEBE4;color:var(--ink);white-space:nowrap;margin-top:4px}
.pill.running{background:#1A1A1A;color:#fff}.pill.paused{background:#EFEBE4}.pill.stopped,.pill.done{background:#F3F1EC;color:var(--sec)}.pill.draft{background:#fff;border:1px solid var(--div)}
.tbtns{display:flex;gap:8px;margin-top:2px}
.sbtn{border:1px solid #D9D3C8;background:#fff;color:var(--ink);border-radius:6px;min-height:36px;padding:0 12px;font:500 14px var(--sans);cursor:pointer}
.sbtn:hover{border-color:var(--ink)}
.readback{margin:14px 0 0;font:400 20px/1.4 var(--serif)}
.go{display:flex;gap:16px;align-items:center;margin-top:14px}
.pbtn{border:0;background:var(--ink);color:#fff;border-radius:6px;min-height:44px;padding:0 22px;font:600 16px var(--sans);cursor:pointer}
.pbtn[disabled],.sbtn[disabled],.plink[disabled]{opacity:.65;cursor:default}
.plink{background:none;border:0;padding:0;color:var(--ink);font:500 15px var(--sans);text-decoration:underline;text-underline-offset:4px;cursor:pointer;min-height:44px}
.boxlab{display:block;margin:18px 0 6px;font:500 14px var(--sans);color:var(--sec)}
.tkbox{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #D9D3C8;border-radius:6px;padding:4px 6px 4px 14px}
.tkbox input{flex:1;min-width:0;border:0;outline:0;font:400 17px/1.4 var(--sans);background:transparent;padding:11px 0}
.tkbox button{border:0;background:var(--ink);color:#fff;border-radius:6px;min-height:40px;padding:0 14px;font:500 15px var(--sans);cursor:pointer}
.tkbox button[disabled]{opacity:.6}
.samreply{margin:10px 0 0;font:400 17px/1.45 var(--serif);color:#3A3733}
.feed{list-style:none;margin:20px 0 0;padding:0;border-top:1px solid var(--div)}
.feed>li{padding:14px 0;border-bottom:1px solid var(--div)}
.feed .when{display:block;font:500 12px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sec);margin-bottom:6px}
.feed .ut{margin:0;font:400 18px/1.45 var(--serif)}
.feed .ut.sys{font:400 15px/1.45 var(--sans);color:var(--sec)}
.cars{list-style:none;margin:10px 0 0;padding:0}
.cars li{padding:7px 0;border-top:1px solid #EFEBE4;font:400 15px/1.45 var(--sans)}
.cars a{color:var(--ink);font-weight:600}
.cars .fx{display:block;color:var(--sec)}
.cars .more{color:var(--sec)}
.empty{margin:14px 0 0;font:400 15px var(--sans);color:var(--sec)}
.notify{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:12px 2px 0;font:400 15px/1.5 var(--sans);color:var(--sec)}
.notify b{font-weight:600;color:var(--ink)}
.notify .plink{min-height:36px;font-size:15px}
.sw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;min-height:36px;color:var(--ink)}
.sw input{position:absolute;opacity:0;width:1px;height:1px}
.sw i{position:relative;width:38px;height:22px;border-radius:11px;background:#CFC8BC;transition:background .15s;flex:none}
.sw i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.sw input:checked+i{background:var(--ink)}.sw input:checked+i::after{transform:translateX(16px)}
.sw input:focus-visible+i{outline:2px solid var(--ink);outline-offset:2px}
.notify .tkbox{flex-basis:100%;max-width:460px}
.past{margin-top:22px}
.past>summary{cursor:pointer;font:500 15px var(--sans);color:var(--sec);min-height:44px;display:flex;align-items:center}
.past details{border-top:1px solid var(--div);padding:6px 0}
.past details>summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;font:400 17px/1.4 var(--serif);min-height:44px;padding-top:6px}
.past details>summary::-webkit-details-marker{display:none}
@media (max-width:640px){.apph h1{font-size:28px}.tcard{padding:14px 14px 16px}.thead .tline{font-size:19px;min-width:0;flex-basis:100%}}`;

export default async function handler(req, res) {
  if (req.query && req.query.app) return appPage(req, res);
  const ex = await exampleUpdate().catch(() => null);
  const hasQuery = /\?./.test(String(req.url || ""));
  const robots = hasQuery ? "noindex, follow" : "index, follow";
  const title = "Free AI car finder and collector car alerts | GoAskSam";
  const desc = `${TASKS_PITCH.lead} ${TASKS_PITCH.sub}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "WebPage", name: "Sam Tasks", url: "https://goasksam.com/tasks", description: desc }
  ];
  // Public nav lockdown (Oct 2026, urgent, Sam): the public rail/mnav show only "Where to sell"; the
  // Buy/Sell/Tasks mobile-tab override below is crew-only. Crew unchanged (gas_crew=ok cookie, the One
  // Box crew gate's mechanism).
  const crew = isCrewRequest(req);
  const railBase = railHtml("tasks", undefined, crew);
  const rail = crew ? railBase.replace(/<nav class="mnav"[\s\S]*?<\/nav>/, '<nav class="mnav" aria-label="Sections"><a class="n" href="/buy">Buy</a><span class="bar">|</span><a class="n" href="/sell">Sell</a><span class="bar">|</span><a class="n on" aria-current="page" href="/tasks">Tasks</a></nav>') : railBase;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="${robots}"><link rel="canonical" href="https://goasksam.com/tasks">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="https://goasksam.com/tasks"><meta property="og:type" content="website"><meta property="og:image" content="https://goasksam.com/og-card.png">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
${FONT_LINKS}<style>${PAGE_CSS}${CSS}${AUTH_CSS}</style>${ld.map(o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, "\\u003c") + "</script>").join("")}</head><body>
${rail}
<main><div class="col">
<header class="tkhero"><p class="pos">Car alerts, much smarter, and free</p><h1>${esc(TASKS_PITCH.lead)}</h1><p class="lead" data-lead-sentence>${esc(TASKS_PITCH.sub)}</p>
<button type="button" class="cta" id="tkcta" data-task-entry data-href="/tasks/mine?start=1">Give Sam a task</button></header>
<section class="sec"><h2>How it works</h2><p>${esc(HOW)}</p>
<ol class="steps"><li>Tell Sam what you're looking for, in plain words.</li><li>Sam reads the job back to you, and starts when you say so.</li><li>Every time new cars come up for auction, the matching checks them against your task.</li><li>When one matches, Sam tells you what it is, how far away it is and, when the same car has been to auction before, what happened then. Nothing new means no message.</li></ol></section>
${ex ? `<section class="sec"><h2>A real update</h2><p class="example"><span class="who">Sam</span>${esc(ex.text)}</p></section>` : ""}
<section class="sec"><h2>Questions</h2><dl class="faq">${FAQ.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<p style="margin-top:30px"><button type="button" class="cta" id="tkcta2" data-task-entry data-href="/tasks/mine?start=1">Give Sam a task</button></p>
</div></main>
<script>try{sessionStorage.setItem("gas_fe_homepage_view","1")}catch(e){}window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};</script>
<script src="/js/auth.js"></script>
<script>${EXPLAINER_JS}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", robots);
  // The response now varies by the gas_crew cookie, so the shared edge cache must partition on it.
  res.setHeader("Vary", "Cookie");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
}

// The explainer's buttons. Signed in: the shared entry script (api/_chrome.js TASKS_BADGE) checks the
// slot and goes to the app. Signed out: the sign-in card, then on to the app (or to ?next=, where an
// entry point sent a signed-out buyer). Old links (/tasks?task=, ?seed=) go to the app.
const EXPLAINER_JS = String.raw`(function(){
  function signedIn(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch(e){ return false; } }
  var params = new URLSearchParams(location.search);
  var next = params.get("next");
  if (!next || !/^\/tasks\/mine(\?|$)/.test(next)) next = "/tasks/mine?start=1";
  if (signedIn() && (params.get("task") || params.get("seed"))) { location.replace("/tasks/mine" + location.search); return; }
  function signIn(){
    if (typeof openSignInCard !== "function") return;
    openSignInCard("Sign in to give Sam a task. Every GoAskSam account gets one active task free.");
    var f = document.getElementById("auth-email"), card = document.querySelector("#auth-modal .auth-dialog");
    if (card && card.scrollIntoView) card.scrollIntoView({ block: "center" });
    if (f) { try { f.focus({ preventScroll: true }); } catch(e){ f.focus(); } }
  }
  window.gateAfterSignup = function(){ location.href = next; };
  document.addEventListener("click", function(e){
    var t = e.target.closest("#tkcta,#tkcta2"); if (!t || signedIn()) return;
    e.preventDefault(); signIn();
  });
  if (!signedIn() && (params.get("signin") || params.get("start") || params.get("seed") || params.get("task"))) { if (params.get("seed") || params.get("task")) next = "/tasks/mine" + location.search.replace(/([?&])(signin|next)=[^&]*/g, "$1"); signIn(); }
})();`;

function appPage(req, res) {
  const crew = isCrewRequest(req);
  const railBase = railHtml("tasks", undefined, crew);
  const rail = crew ? railBase.replace(/<nav class="mnav"[\s\S]*?<\/nav>/, '<nav class="mnav" aria-label="Sections"><a class="n" href="/buy">Buy</a><span class="bar">|</span><a class="n" href="/sell">Sell</a><span class="bar">|</span><a class="n on" aria-current="page" href="/tasks/mine">Tasks</a></nav>') : railBase;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Your tasks | GoAskSam</title><meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#FAF8F4">
${FONT_LINKS}<style>${PAGE_CSS}${CSS}${APP_CSS}${AUTH_CSS}</style></head><body>
${rail}
<main><div class="col">
<div class="apph"><h1>Your tasks</h1><a href="/tasks">How it works</a></div>
<div id="tkapp"></div>
</div></main>
<script>try{sessionStorage.setItem("gas_fe_homepage_view","1")}catch(e){}window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};</script>
<script src="/js/auth.js"></script>
<script>${APP_JS}</script></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(html);
}

// The task app (browser). A new task is a DRAFT held here (sessionStorage) until the buyer presses Start;
// the server writes nothing before that. One task holds the slot (running or paused).
const APP_JS = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  var app = $("tkapp");
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  function signedIn(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch(e){ return false; } }
  if (!signedIn()) { location.replace("/tasks?signin=1&next=" + encodeURIComponent(location.pathname + location.search)); return; }
  var params = new URLSearchParams(location.search);
  var editEmail = false, data = null, busy = false, reply = "", pending = null, note = "", editing = false, arrived = !!(params.get("start") || params.get("seed")), scrollTo = null;
  var draft = null; try { draft = JSON.parse(sessionStorage.getItem("gas_task_draft") || "null"); } catch(e){}
  function saveDraft(d){ draft = d; try { if (d) sessionStorage.setItem("gas_task_draft", JSON.stringify(d)); else sessionStorage.removeItem("gas_task_draft"); } catch(e){} }
  function seedWords(){
    if (params.get("seed") === "vin" && params.get("vin")) return "Keep looking for this exact car: " + (params.get("car") ? params.get("car") + ", " : "") + "VIN " + params.get("vin");
    return params.get("words") || "";
  }
  function seedObj(){ if (params.get("seed") === "vin") return { from: "vin", ref: "vin:" + params.get("vin") }; if (params.get("seed") === "buy") return { from: "buy_search", ref: null }; return null; }
  function token(){ if (typeof authValidToken === "function") return authValidToken(); try { return Promise.resolve((JSON.parse(localStorage.getItem("gas_auth_session") || "null") || {}).access_token || null); } catch(e){ return Promise.resolve(null); } }
  function api(body){ return token().then(function(tk){ return fetch("/api/tasks", { method: "POST", headers: tk ? { "Content-Type": "application/json", Authorization: "Bearer " + tk } : { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }).then(function(r){ if (r.status === 401) { location.replace("/tasks?signin=1&next=" + encodeURIComponent(location.pathname + location.search)); throw new Error("auth"); } return r.json(); }); }
  function status(t){ if (t.state === "running" || t.state === "needs_you") return ["running", "Running"]; if (t.state === "paused") return ["paused", "Paused"]; if (t.state === "done") return t.kind === "research" ? ["done", "Done"] : ["stopped", "Stopped"]; return ["draft", "Not started"]; }
  // A new task was blocked by the one-task rule while the task is on screen: a short note above it, no link.
  function blockedNote(state){ return state === "paused" ? "Your task is paused below. Resume or stop it to start another." : "Your task is already running below. Stop it to start another."; }
  function dropEntryParams(){ var u = new URL(location.href); ["start", "seed", "words", "filters", "vin", "car"].forEach(function(k){ u.searchParams.delete(k); }); try { history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch(e){} }
  function when(iso){ try { var d = new Date(iso), now = new Date(); var o = { month: "short", day: "numeric" }; if (Math.abs(now - d) > 80 * 864e5) o.year = "numeric"; return d.toLocaleDateString("en-US", o) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch(e){ return ""; } }
  function money(n){ return "$" + Number(n).toLocaleString("en-US"); }
  function cars(u){
    var cs = (u.data && u.data.cards) || []; if (!cs.length) return "";
    var more = u.data.total > cs.length ? '<li class="more">' + (u.data.total - cs.length) + " more match.</li>" : "";
    return '<ul class="cars">' + cs.map(function(c){
      var fx = [c.bid_usd ? "Bid " + money(c.bid_usd) : null, c.house, c.distance_miles != null ? c.distance_miles.toLocaleString("en-US") + " miles away" : c.location, c.miles ? Number(c.miles).toLocaleString("en-US") + " mi" : c.km ? Number(c.km).toLocaleString("en-US") + " km" : null].filter(Boolean).join(" · ");
      return '<li><a href="' + esc(c.url || "#") + '" target="_blank" rel="noopener">' + esc(c.title || "Listing") + "</a>" + (fx ? '<span class="fx">' + esc(fx) + "</span>" : "") + "</li>";
    }).join("") + more + "</ul>";
  }
  function feed(t){
    var ups = (t.updates || []).filter(function(u){ return u.role === "sam" && ["match", "research", "still_looking", "system"].indexOf(u.kind) >= 0; }).slice().reverse();
    if (!ups.length) return '<p class="empty">No updates yet.</p>';
    return '<ul class="feed">' + ups.map(function(u){ return '<li><span class="when">' + esc(when(u.created_at)) + '</span><p class="ut' + (u.kind === "system" ? " sys" : "") + '">' + esc(u.text) + "</p>" + cars(u) + "</li>"; }).join("") + "</ul>";
  }
  function box(label, id, value, ph){ return '<label class="boxlab" for="' + id + '">' + esc(label) + '</label><div class="tkbox"><input id="' + id + '" autocomplete="off" value="' + esc(value || "") + '" placeholder="' + esc(ph || "") + '"><button type="button" data-send="' + id + '"' + (busy ? " disabled" : "") + ">" + (busy ? "Sam is reading..." : "Send") + "</button></div>"; }
  function taskCard(t){
    var st = status(t), live = t.state !== "done";
    var btns = live ? '<div class="tbtns">' + (t.state === "paused" ? '<button class="sbtn" data-act="resume" data-id="' + t.id + '">Resume</button>' : '<button class="sbtn" data-act="pause" data-id="' + t.id + '">Pause</button>') + '<button class="sbtn" data-act="stop" data-id="' + t.id + '">Stop</button></div>' : "";
    var h = '<section class="tcard" id="task-' + t.id + '"><div class="thead"><span class="pill ' + st[0] + '">' + st[1] + '</span><p class="tline">' + esc(t.summary) + "</p>" + btns + "</div>";
    if (live) {
      if (pending) h += '<p class="readback">' + esc(pending.summary.replace(/^Sam is looking for/, "Sam will look for").replace(/^Sam is researching/, "Sam will research")) + '</p><div class="go"><button class="pbtn" data-apply="' + t.id + '">Use this change</button><button class="plink" data-unpending>Keep the task as it is</button></div>';
      h += box("Change the task or tell Sam something", "tkq", "", "");
      if (reply && !pending) h += '<p class="samreply">' + esc(reply) + "</p>";
    }
    return h + feed(t) + "</section>";
  }
  function draftCard(){
    var last = (draft.thread || []).filter(function(m){ return m.role === "sam"; }).pop();
    var h = '<section class="tcard"><div class="thead"><span class="pill draft">Not started</span></div>';
    if (draft.summary && !editing) h += '<p class="readback">' + esc(last ? last.text : draft.summary) + '</p><div class="go"><button class="pbtn" data-start>Start</button><button class="plink" data-change>Change</button></div>';
    else h += (last ? '<p class="readback">' + esc(last.text) + "</p>" : "") + box(draft.summary ? "Change what Sam looks for" : "Answer Sam", "tkq", editing ? draft.words : "", "");
    return h + "</section>";
  }
  // Under the card: where updates go, a Change link, and the email switch (stored on the account).
  function notifyLine(){
    var n = (data && data.notify) || null; if (!n) return "";
    var sw = '<label class="sw"><input type="checkbox" data-notify-on' + (n.on ? " checked" : "") + '><i></i>Email updates</label>';
    if (editEmail) return '<div class="notify"><div class="tkbox"><input id="tkemail" type="email" value="' + esc(n.email || "") + '" aria-label="Email for task updates"><button type="button" data-save-email>Save</button></div><button class="plink" data-cancel-email>Cancel</button></div>';
    return '<div class="notify">' + (n.on ? "<span>Updates go to <b>" + esc(n.email || "your account email") + '</b>.</span> <button class="plink" data-edit-email>Change</button>' : "<span>Email is off. Updates show here and on Tasks.</span>") + sw + "</div>";
  }
  function render(){
    var tasks = (data && data.tasks) || [];
    var cur = tasks.filter(function(t){ return ["running", "needs_you", "paused"].indexOf(t.state) >= 0; })[0] || null;
    var past = tasks.filter(function(t){ return t !== cur && t.state === "done"; });
    var h = "";
    if (cur && arrived) { note = blockedNote(cur.state); scrollTo = cur.id; }
    if (arrived) { arrived = false; dropEntryParams(); }
    if (note && cur) h += '<p class="blocked" role="status">' + esc(note) + "</p>";
    if (cur) h += taskCard(cur) + notifyLine();
    else if (draft) h += draftCard();
    else h += '<section class="tcard">' + box("Tell Sam what to look for", "tkq", seedWords(), "e.g. find me a black manual 997 under $70k") + (reply ? '<p class="samreply">' + esc(reply) + "</p>" : "") + "</section>";
    if (past.length) h += '<details class="past"><summary>Past tasks (' + past.length + ")</summary>" + past.map(function(t){ var st = status(t); return '<details><summary><span class="pill ' + st[0] + '">' + st[1] + "</span>" + esc(t.summary) + "</summary>" + feed(t) + "</details>"; }).join("") + "</details>";
    app.innerHTML = h;
    if (scrollTo) { var el = app.querySelector(".blocked") || document.getElementById("task-" + scrollTo); scrollTo = null; if (el) el.scrollIntoView({ block: "start" }); }
    var q = $("tkq"); if (q && !cur && (params.get("start") || params.get("seed") || editing)) { q.focus(); }
  }
  // Pressed: disabled at once, the label says what is happening, and the other buttons in the card wait.
  function working(btn, label){ btn.disabled = true; btn.textContent = label; var card = btn.closest(".tcard"); if (card) card.querySelectorAll("button").forEach(function(b){ b.disabled = true; }); }
  function load(){ return api({ action: "list", open: (data && data.open) || params.get("task") || null }).then(function(j){ data = j; render(); }).catch(function(){}); }
  function send(text){
    if (busy) return; busy = true;
    var sb = document.querySelector("[data-send]"); if (sb) { sb.disabled = true; sb.textContent = "Sam is reading..."; } var qi = $("tkq"); if (qi) qi.readOnly = true;
    var tasks = (data && data.tasks) || [], cur = tasks.filter(function(t){ return ["running", "needs_you", "paused"].indexOf(t.state) >= 0; })[0];
    var body = cur ? { action: "say", task_id: cur.id, text: text, pending: pending } : { action: "say", text: text, draft: draft, seed: draft ? null : seedObj() };
    api(body).then(function(j){
      busy = false; editing = false; reply = j.reply || ""; note = j.blocked ? blockedNote(j.blocked.state) : "";
      if (cur) { pending = j.pending || null; return load(); }
      if (j.task) { saveDraft(null); reply = ""; return load(); }
      if (j.discarded) { saveDraft(null); return load(); }
      if (j.draft) saveDraft(j.draft);
      render();
    }).catch(function(){ busy = false; render(); var q = $("tkq"); if (q) q.value = text; });
  }
  document.addEventListener("click", function(e){
    var t = e.target.closest("[data-send],[data-act],[data-start],[data-change],[data-apply],[data-unpending],[data-goto],[data-edit-email],[data-cancel-email],[data-save-email]"); if (!t) return;
    if (t.hasAttribute("data-edit-email")) { e.preventDefault(); editEmail = true; render(); var f = $("tkemail"); if (f) f.focus(); return; }
    if (t.hasAttribute("data-cancel-email")) { e.preventDefault(); editEmail = false; render(); return; }
    if (t.hasAttribute("data-save-email")) { e.preventDefault(); var v = ($("tkemail") || {}).value || ""; working(t, "Saving..."); api({ action: "notify", email: v.trim() }).then(function(j){ if (j && j.error) { editEmail = true; note = j.error; } else { editEmail = false; if (data) data.notify = j; } render(); }); return; }
    if (t.hasAttribute("data-goto")) { var el = document.getElementById("task-" + t.getAttribute("data-goto")); if (el) { e.preventDefault(); el.scrollIntoView({ block: "start" }); } return; }
    e.preventDefault();
    if (t.hasAttribute("data-send")) { var q = $(t.getAttribute("data-send")); if (q && q.value.trim()) send(q.value.trim()); return; }
    if (t.hasAttribute("data-change")) { editing = true; render(); return; }
    if (t.hasAttribute("data-unpending")) { pending = null; reply = ""; render(); return; }
    if (t.disabled) return;
    if (t.hasAttribute("data-start")) { working(t, "Starting..."); api({ action: "start", draft: draft }).then(function(j){ if (j.blocked) { note = blockedNote(j.blocked.state); saveDraft(null); return load(); } if (j.task) { saveDraft(null); reply = ""; note = ""; } return load(); }).catch(function(){ load(); }); return; }
    if (t.hasAttribute("data-apply")) { working(t, "Saving..."); api({ action: "apply", task_id: t.getAttribute("data-apply"), pending: pending }).then(function(){ pending = null; reply = ""; note = ""; return load(); }).catch(function(){ load(); }); return; }
    if (t.hasAttribute("data-act")) { working(t, { pause: "Pausing...", resume: "Resuming...", stop: "Stopping..." }[t.getAttribute("data-act")] || "..."); api({ action: "control", task_id: t.getAttribute("data-id"), act: t.getAttribute("data-act") }).then(function(j){ note = j.blocked ? blockedNote(j.blocked.state) : ""; pending = null; reply = ""; return load(); }).catch(function(){ load(); }); }
  });
  document.addEventListener("change", function(e){
    if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-notify-on")) return;
    var on = e.target.checked; e.target.disabled = true;
    api({ action: "notify", on: on }).then(function(j){ if (data && j && !j.error) data.notify = j; render(); });
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target && e.target.id === "tkq" && e.target.value.trim()) { e.preventDefault(); send(e.target.value.trim()); } });
  load();
})();`;
