// THE PATCHED DASHBOARD CLIENT (Lane E, Nov 5 2026): lib/preview/tasksAppFork.js (the live task app, copied) changed at exactly the places below. Every other line is the live app's own, so every live feature is kept: the limit card with Stop and start this one and Never mind,
// Past Tasks, the junk folder note, the Needs you auto open, the pause, stop and resume buttons, the unfinished draft card, the seed entry points (?seed= and ?words=), the Email updates switch with How often and the two hour help line, Watching and Before it ends emails.
// An anchor that is not found throws: a change to the live app cannot silently drop one of these patches. The page prints what the API sends; the numbers (working, max, unread) are the API's.
import { LIVE_APP_JS } from "./tasksAppFork.js";
import { SHARED } from "./previewPages.js";
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error("tasksApp patch: anchor not found: " + a.slice(0, 70)); return s.replace(a, b); };
const rex = (s, re, b) => { if (!re.test(s)) throw new Error("tasksApp patch: pattern not found: " + String(re).slice(0, 70)); return s.replace(re, b); };
let js = LIVE_APP_JS;
// 1 the preview's own addresses (the live app is never called with a preview page, the preview never writes through the live page)
js = rep(js, 'location.replace("/tasks?signin=1&next="', 'location.replace("/preview/tasks?signin=1&next="').split('location.replace("/tasks?signin=1&next="').join('location.replace("/preview/tasks?signin=1&next="');   // every occurrence
js = rep(js, 'window.matchMedia("(max-width:640px)").matches ? 1 : 3;', "1;");   // one wide card per row: the words, the criteria and the buttons need the room
js = rep(js, 'fetch("/api/tasks", {', 'fetch("/preview/tasks/api", {');
// 2 no count of running Tasks anywhere in the tab title; the nav shows only an unread number the API's crew badge reports
js = rep(js, 'document.title = (n ? "(" + n + ") " : "") + "Your Tasks | GoAskSam";', 'document.title = "Your Tasks | GoAskSam";');
js = rep(js, "function syncBadge(fromWatching){", `function syncUnread(){
    var u = data && data.badge && Number(data.badge.unread) > 0 ? Number(data.badge.unread) : 0, a = document.querySelector('.tabs a[href="/tasks"]'); if (!a) return;
    var b = a.querySelector(".nbadge"); if (!u) { if (b) b.remove(); return; } if (!b) { b = document.createElement("span"); b.className = "nbadge"; a.appendChild(b); } b.textContent = String(u); b.setAttribute("aria-label", u + " unread");
  }
  function syncBadge(fromWatching){ syncUnread();`);
// 3 the heading, the count line (the API's own words: left, working and max when it sends them, else its statusLine; never typed or subtracted here), New Task and the two tabs
js = rep(js, "function render(){", `var tab = "mine";
  function headHtml(lim){
    var line = !lim ? "" : typeof lim.left === "number" && typeof lim.working === "number" && typeof lim.max === "number" ? lim.working + " active " + (lim.working === 1 ? "Task" : "Tasks") + ". " + lim.left + " of " + lim.max + " remaining." : (typeof lim.statusLine === "string" && lim.statusLine ? lim.statusLine : (typeof lim.line === "string" ? lim.line : ""));
    return '<div class="dh"><div><h1 class="t-title">Your Tasks</h1>' + (line ? '<p class="dcount" role="status">' + esc(line) + "</p>" : "") + '</div><button type="button" class="tk-new" data-newtask>New Task</button></div>' +
      '<div class="dtabs" role="tablist" aria-label="Tasks"><button type="button" role="tab" data-tab="mine" aria-selected="' + (tab === "mine") + '">Search Tasks</button><button type="button" role="tab" data-tab="watching" aria-selected="' + (tab === "watching") + '">Watching</button></div>';
  }
  function render(){`);
js = rep(js, 'var lim = (data && data.limit) || null, h = "";', 'var lim = (data && data.limit) || null, h = headHtml(lim);');
js = rep(js, `if (lim && lim.statusLine) h += '<p class="statusline" role="status">' + esc(lim.statusLine) + "</p>";`, "");   // the count line is in the heading now (the API's own working and max)
js = rep(js, "if (lim && lim.atLimit && !limitHidden) h += limitCard(work)", `h += '<div class="pane" data-pane="mine"' + (tab === "mine" ? "" : " hidden") + ">";
    if (lim && lim.atLimit && !limitHidden) h += limitCard(work)`);
js = rex(js, /h \+= overview\(mine\);\s*h \+= lookingHtml\(\);/, `h += overview(mine) + "</div>";
    h += '<div class="pane" data-pane="watching"' + (tab === "watching" ? "" : " hidden") + ">" + lookingHtml() + "</div>";`);
// 4 the task card: the person's own words, the confirmed criteria, status, unread, matches, refine, pause, stop
{ const a = js.indexOf("function compactCard(t){"), b = js.indexOf("function taskDetail(t){"); if (a < 0 || b < 0 || b < a) throw new Error("tasksApp patch: compactCard not found");
  js = js.slice(0, a) + `function compactCard(t){
    var st = status(t), ov = t.overview || {}, isOpen = openId === t.id, crit = Array.isArray(t.criteria) ? t.criteria : [];
    var btns = '<span class="tbtns"><button class="sbtn" data-toggle="' + t.id + '" aria-expanded="' + isOpen + '" aria-controls="detail-' + t.id + '">' + (isOpen ? "Close" : "Refine") + "</button>" + (t.state === "paused" ? '<button class="sbtn" data-act="resume" data-id="' + t.id + '">Resume</button>' : '<button class="sbtn" data-act="pause" data-id="' + t.id + '">Pause</button>') + '<button class="sbtn" data-act="stop" data-id="' + t.id + '">Stop</button></span>';
    var nLive = Number(ov.liveCount) || 0;
    var where = nLive > 0 && !starting[t.id] ? (isOpen ? "Shown below" : "Select the card to see " + (nLive === 1 ? "it" : "them")) : "";
    var count = [starting[t.id] ? "Sam is checking the live cars now." : ov.live, where, ov.fresh].filter(Boolean).join(" \\u00B7 ");
    var showLabel = (isOpen ? "Hide " : "Show ") + (nLive > 0 && ov.cars ? ov.cars : "cars");
    var unread = Number(t.unread) > 0 ? '<span class="tun" role="status">' + Number(t.unread) + " new</span>" : "";
    return '<article class="tc' + (isOpen ? " open" : "") + '" id="task-' + t.id + '"><button type="button" class="thit" id="tt-' + t.id + '" data-toggle="' + t.id + '" aria-expanded="' + isOpen + '" aria-controls="detail-' + t.id + '"><span class="pill ' + st[0] + '">' + st[1] + "</span>" + unread + '<span class="tshow">' + esc(showLabel) + '</span><span class="tline">' + esc(t.summary) + "</span></button>" +
      (t.words ? '<p class="twords">\\u201C' + esc(t.words) + "\\u201D</p>" : "") + (crit.length ? '<ul class="tcrit" aria-label="What Sam checks every match against">' + crit.map(function(c){ return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") + (count ? '<p class="tcount">' + esc(count) + "</p>" : "") + btns + "</article>";
  }
  ` + js.slice(b);
}
// 4b the New Task box is the SHARED search component (icon, text, microphone, arrow), with voice; the live app has none. The ids and attributes the live handlers use (tkq, data-send, Enter) are kept, so typing, Enter and the arrow send exactly as before.
{ const a = js.indexOf("function newBox(){"), b = js.indexOf("// Under the card: where updates go"); if (a < 0 || b < 0 || b < a) throw new Error("tasksApp patch: newBox not found");
  js = js.slice(0, a) + `var ICON = ${JSON.stringify({ search: SHARED.IC.search, mic: SHARED.IC.mic, go: SHARED.IC.go })};
  function newBox(){ return '<section class="tcard tnew"><div class="tkask"><label class="boxlab" for="tkq">Tell Sam what to look for</label><div class="sb tksb"><span class="ico" aria-hidden="true">' + ICON.search + '</span><input id="tkq" autocomplete="off" value="' + esc(carry || seedWords()) + '" placeholder="Tell Sam what you\\'re looking for..." aria-label="Tell Sam what to look for"><button type="button" class="mic" data-mic="tkq" aria-label="Speak your search">' + ICON.mic + '</button><button type="button" class="go" data-send="tkq"' + (busy ? " disabled" : "") + ' aria-label="Send">' + ICON.go + "</button></div></div>" + (reply && replyFor === null ? '<p class="samreply">' + esc(reply) + "</p>" : "") + "</section>"; }
  ` + js.slice(b);
}
// 5 the tabs, New Task, and a carried request: the words typed before sign in are sent as the first message of the draft, once, with no retyping
js = rex(js, /\n  load\(\);\n\}\)\(\);$/, `
  app.addEventListener("click", function(e){
    var tb = e.target.closest("[data-tab]"); if (tb) { tab = tb.getAttribute("data-tab") === "watching" ? "watching" : "mine"; render(); return; }
    var mic = e.target.closest("[data-mic]"); if (mic) { var R = window.SpeechRecognition || window.webkitSpeechRecognition, box = $(mic.getAttribute("data-mic")); if (R && box) { try { var rec = new R(); rec.lang = "en-US"; rec.onresult = function(ev){ box.value = ev.results[0][0].transcript; box.focus(); }; rec.start(); } catch (x) {} } return; }
    if (e.target.closest("[data-newtask]")) { tab = "mine"; render(); var q = $("tkq"); if (q) { q.scrollIntoView({ block: "center" }); q.focus(); } }
  });
  (function(){ var R = window.SpeechRecognition || window.webkitSpeechRecognition; if (R) return; new MutationObserver(function(){ app.querySelectorAll("[data-mic]").forEach(function(m){ m.hidden = true; }); }).observe(app, { childList: true, subtree: true }); })();
  var carried = false;
  load().then(function(){ var w = params.get("words"); if (w && !carried && !draft) { carried = true; send(w.slice(0, 500), null); } });
})();`);
export const TASKS_APP_JS = js;
