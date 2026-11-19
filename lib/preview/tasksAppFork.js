// THE DASHBOARD CLIENT OF /preview/tasks/mine (Lane E, Nov 5 2026): a FORK of the live task app (api/tasksPage.js APP_JS and APP_CSS, copied Nov 5 2026 at lane-e-featured-wire2) so every feature of the live app is kept as it is,
// then changed by tasksAppPatch() at the places the redesign touches (the heading and count line, the tabs, the task card, the nav unread, the carried request, the preview's own API address). The live page is not changed.
// scripts/tasksNothingRemovedCheck.mjs lists every live control and fails when this fork lacks one.
import { reasonLine } from "../reasonWords.js";
import { stillReadingMarket } from "../live/search.js";
export const LIVE_APP_CSS = `
.apph{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:8px 0 18px}
.apph h1{margin:0;font:500 34px/1.15 var(--serif)}
.apph a{font:400 15px var(--sans);color:var(--sec);text-decoration:underline;text-underline-offset:4px}
.blocked{margin:0 0 18px;padding:12px 16px;border:1px solid var(--div);border-left:3px solid var(--red);background:var(--card);font:400 16px/1.5 var(--sans)}.noteinfo{margin:0 0 14px;padding:10px 14px;border:1px solid var(--div);border-radius:10px;background:var(--card);font-size:15px;color:var(--soft)}
.blocked a{color:var(--red);font-weight:600}
.limitbox{margin:0 0 18px;padding:16px 18px;border:1px solid var(--div);border-left:3px solid var(--green);border-radius:8px;background:var(--card)}
.limitbox>p{margin:0 0 12px;font:400 17px/1.5 var(--sans);color:var(--ink)}
.limitbox .lrow{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--div)}
.limitbox .ltxt{flex:1;min-width:200px;font:400 16px/1.4 var(--sans);color:var(--ink);overflow-wrap:anywhere}
.limitbox .lkeep{margin:6px 0 0}
.tkload,.tkstart{margin:10px 0 0;font:400 15px/1.5 var(--sans);color:var(--sec)}
.pausedh{margin:22px 0 10px;font:600 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sec)}
.tcard + .pausedh{margin-top:26px}
.tcard{border:1px solid var(--div);border-radius:8px;background:var(--card);padding:18px 20px 20px}
.thead{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.thead .tline{flex:1;min-width:220px;margin:0;font:400 21px/1.35 var(--serif)}
.pill{display:inline-block;font:600 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;padding:6px 8px;border-radius:4px;background:#EFEBE4;color:var(--ink);white-space:nowrap;margin-top:4px}
.pill.running{background:#1A1A1A;color:#fff}.pill.paused{background:#EFEBE4}.pill.stopped,.pill.done{background:#F3F1EC;color:var(--sec)}.pill.draft{background:#fff;border:1px solid var(--div)}
.tbtns{display:flex;gap:8px;margin-top:2px}
.sbtn{border:1px solid var(--tk-line);background:var(--card);color:var(--ink);border-radius:6px;min-height:36px;padding:0 12px;font:500 14px var(--sans);cursor:pointer}
.sbtn:hover{border-color:var(--ink)}
.readback{margin:14px 0 0;font:400 20px/1.4 var(--serif)}
.go{display:flex;gap:16px;align-items:center;margin-top:14px}
.pbtn{border:0;background:var(--ink);color:var(--on-accent,#fff);border-radius:6px;min-height:44px;padding:0 22px;font:600 16px var(--sans);cursor:pointer}
.pbtn[disabled],.sbtn[disabled],.plink[disabled]{opacity:.65;cursor:default}
.plink{background:none;border:0;padding:0;color:var(--ink);font:500 15px var(--sans);text-decoration:underline;text-underline-offset:4px;cursor:pointer;min-height:44px}
.tkask{background:var(--card);padding:10px 0 0;margin-top:14px}
.boxlab{display:block;margin:0 0 6px;font:500 14px/1.3 var(--sans);color:var(--sec)}
.tkbox{display:flex;gap:8px;align-items:center;background:var(--card);border:1px solid var(--tk-line);border-radius:6px;padding:4px 6px 4px 14px}
.tkbox input{flex:1;min-width:0;border:0;outline:0;font:400 17px/1.4 var(--sans);background:transparent;padding:11px 0}
.tkbox button{border:0;background:var(--ink);color:var(--on-accent,#fff);border-radius:6px;min-height:40px;padding:0 14px;font:500 15px var(--sans);cursor:pointer}
.tkbox button[disabled]{opacity:.6}
.choices{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}.choices .chip{font:500 15px/1 var(--sans);padding:11px 16px;min-height:44px;border:1px solid var(--div);background:#fff;color:var(--ink);border-radius:999px;cursor:pointer}.choices .chip:hover{border-color:#1A1A1A}.choices .chip:disabled{opacity:.5;cursor:default}
.statusline{margin:0 0 12px;font:500 15px/1.4 var(--sans);color:var(--sec)}
.lk .lka{display:flex;gap:8px;flex:none}.lk a.sbtn{text-decoration:none;display:inline-block}.lk li.hl{border-color:var(--ink);background:#F3F1EC}.countsline{margin-top:-4px}.lk{margin:26px 0 8px}.lk h2{margin:0 0 4px;font:600 18px/1.3 var(--sans);color:var(--ink)}.lk .lkc{margin:0 0 10px;font:400 14px/1.45 var(--sans);color:var(--sec)}.lk ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.lk li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--div);border-radius:12px;padding:12px 14px;background:var(--card,#fff)}.lk .lkw{font:500 15px/1.35 var(--sans);color:var(--ink)}.lk .lkd{display:block;margin-top:2px;font:400 13px/1.4 var(--sans);color:var(--sec)}.lk .sbtn{flex:none}
.newn{font:600 13px/1 var(--sans);padding:5px 9px;border-radius:999px;background:#1E4D38;color:#fff;white-space:nowrap}
.pill.needs{background:var(--red);color:#fff}
.tgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0 0;align-items:start}
.tc{position:relative;border:1px solid var(--div);border-radius:8px;background:var(--card);display:flex;flex-direction:column}
.tc.open{outline:2px solid var(--ink);outline-offset:-1px}
.tc .thit{display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;text-align:left;border:0;background:none;padding:14px 40px 8px 16px;cursor:pointer;color:var(--ink);font:inherit;min-height:44px}
.tc .thit::before{content:"";position:absolute;inset:0;border-radius:8px}
.tc:hover{border-color:var(--ink);background:var(--hover,#FAF8F4)}
.tc .thit:focus-visible,.tc .sbtn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.tc .thit:focus-visible{outline:0}
.tc .thit:focus-visible::before{outline:2px solid var(--ink);outline-offset:2px}
.tc .thit::after{content:"";position:absolute;right:16px;top:20px;width:9px;height:9px;border-right:2px solid var(--sec);border-bottom:2px solid var(--sec);transform:rotate(45deg);transition:transform .15s}
.tc .thit[aria-expanded=true]::after{transform:rotate(-135deg);top:25px}
.tc .tshow{position:absolute;right:36px;top:14px;font:500 13px/1.4 var(--sans);color:var(--sec)}
.tc .tbtns{position:relative;z-index:1;pointer-events:none}.tc .tbtns .sbtn{pointer-events:auto}
.tc .tline{margin:0;font:500 16px/1.4 var(--sans);overflow-wrap:anywhere}
.tc .tcount{font:400 14px/1.4 var(--sans);color:var(--sec)}
.tc .tbtns{margin:0;padding:0 16px 14px}
.tdetail{grid-column:1/-1;border:1px solid var(--div);border-radius:8px;background:var(--card);padding:6px 20px 16px}
@media (max-width:640px){.tgrid{grid-template-columns:minmax(0,1fr)}.tdetail{padding:6px 14px 14px}}
.unfin{padding:12px 16px;margin-top:12px}.unfin .unfinline{margin:0 0 8px;font:500 15px/1.4 var(--sans);overflow-wrap:anywhere}.unfin .go{margin-top:0}
.samreply{margin:10px 0 0;font:400 17px/1.45 var(--serif);color:var(--tk-text2)}
.feed{list-style:none;margin:20px 0 0;padding:0;border-top:1px solid var(--div)}
.feed>li{padding:14px 0;border-bottom:1px solid var(--div)}
.feed .when{display:block;font:500 12px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sec);margin-bottom:6px}
.feed .ut{margin:0;font:400 18px/1.45 var(--serif)}
.feed .ut.sys{font:400 15px/1.45 var(--sans);color:var(--sec)}
.cars{list-style:none;margin:10px 0 0;padding:0}
.cars li{padding:7px 0;border-top:1px solid var(--tk-soft);font:400 15px/1.45 var(--sans)}
.cars a.carlink{display:block;color:var(--ink);text-decoration:none}.cars a.carlink .t{font-weight:600}.cars a.carlink:hover .t{color:var(--green)}
.cars .fx{display:block;color:var(--sec)}
.cars .more{color:var(--sec)}
.empty{margin:14px 0 0;font:400 15px var(--sans);color:var(--sec)}
.notify{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:12px 2px 0;font:400 15px/1.5 var(--sans);color:var(--sec)}
.notify b{font-weight:600;color:var(--ink)}.often{display:inline-flex;align-items:center;gap:8px;color:var(--ink);white-space:nowrap;flex:none}.often select{min-height:36px;font:400 15px var(--sans);padding:0 8px;border:1px solid var(--div,#E6E1D8);border-radius:6px;background:var(--card);color:var(--ink)}.oftenhelp{flex-basis:100%;font-size:14px;color:var(--sec)}
.notify .plink{min-height:36px;font-size:15px}
.tksw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;min-height:36px;color:var(--ink);white-space:nowrap;flex:none}
.tksw input{position:absolute;opacity:0;width:1px;height:1px}
.tksw i{position:relative;width:38px;height:22px;border-radius:11px;background:var(--tk-switch);transition:background .15s;flex:none}
.tksw i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--card);transition:transform .15s}
.tksw input:checked+i{background:var(--ink)}.tksw input:checked+i::after{transform:translateX(16px)}
.tksw input:focus-visible+i{outline:2px solid var(--ink);outline-offset:2px}
.past{margin-top:22px}
.past>summary{cursor:pointer;font:500 15px var(--sans);color:var(--sec);min-height:44px;display:flex;align-items:center}
.past details{border-top:1px solid var(--div);padding:6px 0}
.past details>summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;font:400 17px/1.4 var(--serif);min-height:44px;padding-top:6px}
.past details>summary::-webkit-details-marker{display:none}
@media (max-width:640px){.apph h1{font-size:28px}.tcard{padding:14px 14px 16px}.thead .tline{font-size:19px;min-width:0;flex-basis:100%}}`;

export const LIVE_APP_JS = String.raw`(function(){
  var $ = function(id){ return document.getElementById(id); };
  var app = $("tkapp");
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];}); }
  function signedIn(){ try { var s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); return !!(s && s.access_token); } catch(e){ return false; } }
  if (!signedIn()) { location.replace("/tasks?signin=1&next=" + encodeURIComponent(location.pathname + location.search)); return; }
  var params = new URLSearchParams(location.search);
  var data = null, busy = false, reply = "", replyFor = null, pending = null, pendingId = null, note = "", editing = false, arrived = !!(params.get("start") || params.get("seed")), scrollTo = null;
  // At the limit (the server says so, data.limit.atLimit): the one card with the working Tasks and "Stop and start this one".
  // { mode: "seed" | "typed" | "draft" | "resume", attempted (the new job's words), line (the server's sentence), resume_id }.
  // It shows only while the server's latest answer says the account is at the limit: every list drops it the moment it is not.
  var limit = null, limitHidden = false, carry = "", draftOpen = !!(params.get("start") || params.get("seed")), miss = false;
  var starting = {}, firing = {}, cardsOut = {}, fullCache = {}, askN = {};
  var looking = null;   // what Find's toggles and buttons made (api/tasks.js action looking): the person's watches and before-it-ends alerts
  var COULD_NOT = ${JSON.stringify(reasonLine("cold.missed"))}, STILL_RETRY = ${Number(stillReadingMarket().retryAfterMs)}, STILL_WAIT = ${Number(stillReadingMarket().waitMaxMs)}, coldSince = {};   // cold spec: a card still being read is asked for every retryAfterMs for up to the engine's waitMaxMs (market.waitMaxMs), then the one plain line; never "try again"; no wait number of the page's own
  function phraseOf(t){ return String((t && t.summary) || "").replace(/^Sam is (?:looking for|researching)\s+/i, "").replace(/:.*$/, "").replace(/[.]+$/, ""); }
  function showLimit(l){ limit = l; limitHidden = false; api({ action: "limit", event: "seen", mode: l.mode, attempted: l.attempted }).catch(function(){}); }
  // "Never mind" and Escape: the card is drawn from the server's atLimit, so clearing the limit variable alone leaves it up. limitHidden is what closes it; it opens again
  // on the next blocked attempt (showLimit) and is reset when the account is no longer at the limit.
  function dismissLimit(){ var lk = limit; limit = null; carry = ""; limitHidden = true; if (lk) api({ action: "limit", event: "keep", mode: lk.mode, attempted: lk.attempted }).catch(function(){}); dropEntryParams(); render(); }
  function syncLimit(){ if (!(data && data.limit && data.limit.atLimit)) limitHidden = false; if (limit && !(data && data.limit && data.limit.atLimit)) { if (limit.mode === "seed" || limit.mode === "typed") carry = limit.attempted || ""; limit = null; } }
  var draft = null; try { draft = JSON.parse(sessionStorage.getItem("gas_task_draft") || "null"); } catch(e){}
  function saveDraft(d){ draft = d; if (!d) { draftOpen = false; miss = false; } try { if (d) sessionStorage.setItem("gas_task_draft", JSON.stringify(d)); else sessionStorage.removeItem("gas_task_draft"); } catch(e){} }
  function seedWords(){
    if (params.get("seed") === "vin" && params.get("vin")) return "Keep looking for this exact car: " + (params.get("car") ? params.get("car") + ", " : "") + "VIN " + params.get("vin");
    return params.get("words") || "";
  }
  function seedObj(){ if (params.get("seed") === "vin") return { from: "vin", ref: "vin:" + params.get("vin") }; if (params.get("seed") === "buy") { var bf = null; try { bf = JSON.parse(params.get("filters") || "null"); } catch(e){} return { from: "buy_search", ref: null, filters: bf && typeof bf === "object" && !Array.isArray(bf) ? bf : null }; } return null; }
  function token(){ if (typeof authValidToken === "function") return authValidToken(); try { return Promise.resolve((JSON.parse(localStorage.getItem("gas_auth_session") || "null") || {}).access_token || null); } catch(e){ return Promise.resolve(null); } }
  function api(body){ return token().then(function(tk){ return fetch("/api/tasks", { method: "POST", headers: tk ? { "Content-Type": "application/json", Authorization: "Bearer " + tk } : { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }).then(function(r){ if (r.status === 401) { location.replace("/tasks?signin=1&next=" + encodeURIComponent(location.pathname + location.search)); throw new Error("auth"); } return r.json(); }); }
  function status(t){ if (starting[t.id]) return ["running", "Sam is starting"]; if (t.state === "needs_you") return ["needs", "Needs you"]; if (t.state === "running") return ["running", "Running"]; if (t.state === "paused") return ["paused", "Paused"]; if (t.state === "done") return t.kind === "research" ? ["done", "Done"] : ["stopped", "Stopped"]; return ["draft", "Not started"]; }
  function dropEntryParams(){ var u = new URL(location.href); ["start", "seed", "words", "filters", "vin", "car"].forEach(function(k){ u.searchParams.delete(k); }); try { history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch(e){} }
  function when(iso){ try { var d = new Date(iso), now = new Date(); var o = { month: "short", day: "numeric" }; if (Math.abs(now - d) > 80 * 864e5) o.year = "numeric"; return d.toLocaleDateString("en-US", o) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch(e){ return ""; } }
  function money(n){ return "$" + Number(n).toLocaleString("en-US"); }
  // A stored bid by its own time, as on Buy's cards (lib/tasks/bidTime.js): within the hour "Bid $42,500"; older, "Last
  // bid we saw: $42,500 at 4:12am" in the reader's clock; no bid time, no bid.
  function bidFx(c){ var t = Date.parse(c.bid_at || ""); if (!c.bid_usd || isNaN(t)) return null; if (Date.now() - t <= 3600e3) return "Bid " + money(c.bid_usd); var d = new Date(t), s = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", "am").replace(" PM", "pm"); return "Last bid seen: " + money(c.bid_usd) + " at " + s + (d.toDateString() === new Date().toDateString() ? "" : " on " + d.toLocaleDateString("en-US", { weekday: "long" })); }
  // The cars of an update, drawn with FIND'S OWN CARD (window.GASCARD, lib/findCardKit.js: the card code is Find's own, lifted from its
  // client). The server read each listing again with Find's engine step (u.data.full); a car whose row could not be read keeps the thin line.
  function cars(u){
    var cs = (u.data && u.data.cards) || []; if (!cs.length) return "";
    if (u.data.full === undefined && cardsOut[u.task_id] !== "done") return '<p class="tkload">Getting the cars.</p>';
    var full = (u.data && u.data.full) || [], big = [], thin = [];
    cs.forEach(function(c, i){ var f = full[i], h = ""; if (f && window.GASCARD) { try { h = window.GASCARD.card(f); } catch(e){ h = ""; } } if (h) big.push(h); else thin.push(c); });
    var more = u.data.total > cs.length ? '<p class="more">' + (u.data.total - cs.length) + " more match.</p>" : "";
    var h = big.length ? '<div class="cgrid tkgrid n' + big.length + '">' + big.join("") + "</div>" : "";
    if (thin.length) h += '<ul class="cars">' + thin.map(function(c){
      var fx = [bidFx(c), c.house, c.distance_miles != null ? c.distance_miles.toLocaleString("en-US") + " miles away" : c.location, c.miles ? Number(c.miles).toLocaleString("en-US") + " mi" : c.km ? Number(c.km).toLocaleString("en-US") + " km" + (c.kmMiles ? " (" + Number(c.kmMiles).toLocaleString("en-US") + " mi)" : "") : ""].filter(Boolean).join(" · ");
      return '<li><a class="carlink" href="' + esc(c.url || "#") + '" target="_blank" rel="noopener"><span class="t">' + esc(c.title || "Listing") + "</span>" + (fx ? '<span class="fx">' + esc(fx) + "</span>" : "") + "</a></li>";
    }).join("") + "</ul>";
    return h + more;
  }
  function feed(t){
    var ups = (t.updates || []).filter(function(u){ return u.role === "sam" && ["match", "research", "still_looking", "system"].indexOf(u.kind) >= 0; }).slice().reverse();
    if (!ups.length) return '<p class="empty">No updates yet.</p>';
    return '<ul class="feed">' + (starting[t.id] ? '<li><p class="ut sys tkstart">Sam is checking the live cars now.</p></li>' : "") + ups.map(function(u){ var eline = u.kind === "match" && u.data && u.data.line && ((u.data.full || []).some(function(f){ return !!f; }) || (u.data.cards || []).length);
      return '<li><span class="when">' + esc(when(u.created_at)) + '</span>' + (eline ? '<p class="ut line">' + esc(u.data.line) + "</p>" : '<p class="ut' + (u.kind === "system" ? " sys" : "") + '">' + esc(u.text) + "</p>") + cars(u) + "</li>"; }).join("") + "</ul>";
  }
  function box(label, id, value, ph, tid){ return '<div class="tkask"><label class="boxlab" for="' + id + '">' + esc(label) + '</label><div class="tkbox"><input id="' + id + '" autocomplete="off"' + (tid ? ' data-task="' + tid + '"' : "") + ' value="' + esc(value || "") + '" placeholder="' + esc(ph || "") + '"><button type="button" data-send="' + id + '"' + (tid ? ' data-task="' + tid + '"' : "") + (busy ? " disabled" : "") + ">" + (busy ? "Sam is reading..." : "Send") + "</button></div></div>"; }
  // THE OVERVIEW (Oct 25 2026): every Task is a compact card side by side (status, the Task sentence, the server's count line, Pause and Stop).
  // All start closed. One opens at a time and its detail (change box, cars, timeline) sits directly below its row; a second click closes it.
  // The open one is kept through redraws and reloads (sessionStorage). A Task that needs the person opens itself once.
  var openId = null; try { openId = sessionStorage.getItem("gas_task_open") || null; } catch(e){}
  var autoOpened = {};
  function setOpen(id){ openId = id; try { if (id) sessionStorage.setItem("gas_task_open", id); else sessionStorage.removeItem("gas_task_open"); } catch(e){} }
  var cols = function(){ return window.matchMedia && window.matchMedia("(max-width:640px)").matches ? 1 : 3; };
  function compactCard(t){
    var st = status(t), ov = t.overview || {}, isOpen = openId === t.id;
    var btns = '<span class="tbtns">' + (t.state === "paused" ? '<button class="sbtn" data-act="resume" data-id="' + t.id + '">Resume</button>' : '<button class="sbtn" data-act="pause" data-id="' + t.id + '">Pause</button>') + '<button class="sbtn" data-act="stop" data-id="' + t.id + '">Stop</button></span>';
    var nLive = Number(ov.liveCount) || 0;
    var where = nLive > 0 && !starting[t.id] ? (isOpen ? "Shown below" : "Select the card to see " + (nLive === 1 ? "it" : "them")) : "";
    var closeLine = where;   // a count with no list behind it is never printed
    var count = [starting[t.id] ? "Sam is checking the live cars now." : ov.live, closeLine, ov.fresh].filter(Boolean).join(" \u00B7 ");
    var showLabel = (isOpen ? "Hide " : "Show ") + (nLive > 0 && ov.cars ? ov.cars : "cars");
    return '<article class="tc' + (isOpen ? " open" : "") + '" id="task-' + t.id + '"><button type="button" class="thit" id="tt-' + t.id + '" data-toggle="' + t.id + '" aria-expanded="' + isOpen + '" aria-controls="detail-' + t.id + '"><span class="pill ' + st[0] + '">' + st[1] + '</span><span class="tshow">' + esc(showLabel) + '</span><span class="tline">' + esc(t.summary) + "</span>" + (count ? '<span class="tcount">' + esc(count) + "</span>" : "") + "</button>" + btns + "</article>";
  }
  function taskDetail(t){
    var h = '<section class="tdetail" id="detail-' + t.id + '" aria-label="' + esc(t.summary) + '">';
    if (t.state !== "paused") {
      if (pending && pendingId === t.id) h += '<p class="readback">' + esc(pending.summary.replace(/^Sam is looking for/, "Sam will look for").replace(/^Sam is researching/, "Sam will research")) + '</p><div class="go"><button class="pbtn" data-apply="' + t.id + '">Use this change</button><button class="plink" data-unpending>Keep the Task as it is</button></div>';
      h += box("Change the Task or tell Sam something", "tkq-" + t.id, "", "", t.id);
      if (reply && !(pending && pendingId === t.id) && replyFor === t.id) h += '<p class="samreply">' + esc(reply) + "</p>";
    }
    return h + feed(t) + "</section>";
  }
  function overview(list){
    if (!list.length) return "";
    var n = cols(), out = "", dIdx = -1;
    list.forEach(function(t, i){ if (t.id === openId) dIdx = i; });
    var after = dIdx < 0 ? -1 : Math.min(list.length - 1, dIdx - (dIdx % n) + n - 1);
    list.forEach(function(t, i){ out += compactCard(t); if (i === after) out += taskDetail(list[dIdx]); });
    return '<div class="tgrid">' + out + "</div>";
  }
  // The draft in the top slot (opened by typing, Continue or a seed): the question last asked with its choices as buttons and the box,
  // or the read-back with Start and Change. Never an old error line: the not-understood sentence shows only for the answer just given.
  function choiceButtons(){
    var o = (draft.options || []).slice(0, 8), any = draft.any;
    if (!draft.question || (!o.length && !any)) return "";
    return '<div class="choices">' + o.concat(any ? [any] : []).map(function(c){ return '<button type="button" class="chip" data-choice="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>";
  }
  function draftCard(){
    var h = '<section class="tcard"><div class="thead"><span class="pill draft">Not started</span><div class="tbtns"><button class="sbtn" data-discard>Discard</button></div></div>';
    if (draft.summary && !editing) {
      var last = (draft.thread || []).filter(function(m){ return m.role === "sam"; }).pop();
      return h + '<p class="readback">' + esc(last ? last.text : draft.summary) + '</p><div class="go"><button class="pbtn" data-start>Start</button><button class="plink" data-change>Change</button></div></section>';
    }
    if (draft.question) {
      if (miss && replyFor === null && reply) h += '<p class="samreply">' + esc(reply) + "</p>";
      else h += '<p class="readback">' + esc(draft.question) + "</p>";
      return h + choiceButtons() + box("Or tell Sam", "tkq", editing ? draft.words : "", "") + "</section>";
    }
    return h + box(draft.summary ? "Change what Sam looks for" : "Tell Sam what to look for", "tkq", editing ? draft.words : "", "") + "</section>";
  }
  // An unfinished draft seen from the rail: a small card under the clean setup box, never the page.
  function unfinishedCard(){
    return '<section class="tcard unfin"><p class="unfinline">Unfinished: ' + esc(String(draft.words || draft.summary || "").slice(0, 80)) + '</p><div class="go"><button class="pbtn" data-continue>Continue</button><button class="plink" data-discard>Discard</button></div></section>';
  }
  // THE LIMIT CARD (one, compact): the server's sentence, then the working Tasks, each with the action that stops it and starts the new one.
  function limitCard(workingTasks){
    return '<section class="limitbox" role="status"><p>' + esc(limit ? ((data && data.limit && data.limit.line) || limit.line || "") : ((data && data.limit && data.limit.entryLine) || "")) + '</p>' + workingTasks.map(function(t){
      return '<div class="lrow"><span class="ltxt">' + esc(phraseOf(t)) + '</span><button class="sbtn" data-limit-stop="' + t.id + '">Stop and start this one</button></div>'; }).join("") +
      '<p class="lkeep"><button class="plink" data-limit-keep>Never mind</button></p></section>';
  }
  function newBox(){ return '<section class="tcard">' + box("Tell Sam what to look for", "tkq", carry || seedWords(), "e.g. find me a black manual 997 under $70k") + (reply && replyFor === null ? '<p class="samreply">' + esc(reply) + "</p>" : "") + "</section>"; }
  // Under the card: where updates go (the sign-in address, not a setting) and the email switch (stored on the account).
  function notifyLine(){
    var n = (data && data.notify) || null; if (!n) return "";
    var sw = '<label class="tksw"><input type="checkbox" data-notify-on' + (n.on ? " checked" : "") + '><i></i>Email updates</label>';
    // How often (Oct 2026): one setting for all of a person's Tasks; shown once the account can store it.
    var opts = [["daily", "Once a day"], ["twice", "Twice a day"], ["thrice", "Three times a day"], ["instant", "As soon as one comes"]];
    var cur = n.every || "daily";
    var often = n.on && n.everyReady ? '<label class="often">How often <select data-notify-every>' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<span class="oftenhelp">' + (cur === "instant" ? "An email each time Sam finds one, up to six a day." : "One email with everything new from all your Tasks.") + " A car you asked to hear about before bidding ends gets its own email about two hours before the end." + "</span>" : "";
    return '<div class="notify">' + (n.on ? "<span>Updates go to <b>" + esc(n.email || "your account email") + '</b>, the address you sign in with.</span>' : "<span>Email is off. Updates show here and on Tasks.</span>") + sw + often + "</div>";
  }
  // WHAT FIND'S TOGGLES AND BUTTONS MADE (Oct 29 2026): each watch and each before-it-ends email, what it watches (the server's own label) and a Stop. The counts are apart from the Task limit: a watch or an email never uses
  // up one of the working Tasks. Every word that is not a label comes from the server (looking.counts, looking.rule).
  function lookingItem(r){
    var when = r.ends_at ? " Bidding ends " + esc(new Date(r.ends_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + "." : "";
    return '<li id="lk-' + esc(r.ref) + '"><span class="lkw">' + esc(r.what || "") + '<span class="lkd">' + esc(r.detail || "") + when + '</span></span><span class="lka">' + (r.start_href ? '<a class="sbtn" href="' + esc(r.start_href) + '">' + esc(r.start_label || "") + "</a> " : "") + '<button class="sbtn" data-lk-stop="' + esc(r.ref) + '">Stop</button></span></li>';
  }
  // Watching and Before-it-ends emails, always shown (never collapsed, never hidden when empty), right under the Tasks. The counts come from the server (looking.counts).
  function lookingHtml(){
    if (!looking || !looking.rows) return "";
    var rows = looking.rows, w = rows.filter(function(r){ return r.kind !== "alert"; }), a = rows.filter(function(r){ return r.kind === "alert"; });
    return '<section class="lk" id="watching" aria-label="Watching"><h2>Watching ' + w.length + "</h2>" + (w.length ? "<ul>" + w.map(lookingItem).join("") + "</ul>" : '<p class="lkc">Nothing yet. Press Look for the next sale on a Find card.</p>') + "</section>" +
      '<section class="lk" id="emails" aria-label="Before-it-ends emails"><h2>Before-it-ends emails ' + a.length + "</h2>" + (a.length ? "<ul>" + a.map(lookingItem).join("") + "</ul>" : '<p class="lkc">None set. Switch on Email me before bidding ends in a Find card.</p>') + '<p class="lkc">Watches and emails do not use up your Tasks.</p></section>';
  }
  function loadLooking(){ return api({ action: "looking" }).then(function(j){ looking = j && j.rows ? j : null; syncBadge(true); render(); jumpToHash(); }).catch(function(){}); }
  function render(){
    // Typed text and focus survive a redraw (cars fill in while a person is typing in a Task's box).
    var keep = {}, fid = document.activeElement && document.activeElement.id; app.querySelectorAll("input[id^=tkq]").forEach(function(i){ keep[i.id] = i.value; });
    var tasks = (data && data.tasks) || [];
    var work = tasks.filter(function(t){ return ["running", "needs_you"].indexOf(t.state) >= 0; });
    var paused = tasks.filter(function(t){ return t.state === "paused"; });
    var past = tasks.filter(function(t){ return t.state === "done"; });
    var lim = (data && data.limit) || null, h = "";
    // Arriving with a new job (a seed) at the limit: the card, with that job as the one to start.
    if (arrived) { if (params.get("seed") && lim && lim.atLimit && !limit) showLimit({ mode: "seed", attempted: seedWords(), line: lim.line }); arrived = false; if (!limit) dropEntryParams(); }
    if (note) h += '<p class="noteinfo" role="status">' + esc(note) + "</p>";
    // The junk-folder line: the server says when it shows (from a Task's start until the first alert email has gone out).
    if (data && data.notify && data.notify.junk) h += '<p class="noteinfo" role="status">If this isn\'t in your inbox, check your junk folder, and mark it as not junk so the next one lands.</p>';
    // The new Task comes first: the limit card (only at the limit), else the read-back, else the box.
    // The one status line, then the setup box; at the limit the limit card takes the box's place, so nobody types into a box that cannot be used.
    if (lim && lim.statusLine) h += '<p class="statusline" role="status">' + esc(lim.statusLine) + "</p>";
    // The three counts and what each is, in one plain line (the server writes it: lib/live/looking.js countsOf), under the Tasks status line.
    { var cl = (looking && looking.counts && looking.counts.line) || (data && data.counts && data.counts.line); if (cl) h += '<p class="statusline countsline" role="status">' + esc(cl) + "</p>"; }
    if (lim && lim.atLimit && !limitHidden) h += limitCard(work) + (draft ? unfinishedCard() : "");
    else if (draft && draftOpen) h += draftCard();
    else h += newBox() + (draft ? unfinishedCard() : "");
    var mine = work.concat(paused);
    // A Task that needs the person opens itself, once.
    work.forEach(function(t){ if (t.state === "needs_you" && !autoOpened[t.id]) { autoOpened[t.id] = true; setOpen(t.id); } });
    if (openId && !mine.some(function(t){ return t.id === openId; })) setOpen(null);
    h += overview(mine);
    h += lookingHtml();
    // The email settings show for everyone signed in, with or without a working Task: exact-car, sold-car and
    // Before it ends emails use them too.
    h += notifyLine();
    if (past.length) h += '<details class="past"><summary>Past Tasks (' + past.length + ")</summary>" + past.map(function(t){ var st = status(t); return '<details><summary><span class="pill ' + st[0] + '">' + st[1] + "</span>" + esc(t.summary) + "</summary>" + feed(t) + "</details>"; }).join("") + "</details>";
    app.innerHTML = h;
    Object.keys(keep).forEach(function(k){ var el = $(k); if (el && keep[k]) el.value = keep[k]; });
    if (fid && $(fid)) { try { $(fid).focus({ preventScroll: true }); } catch(e){} }
    if (window.GASCARD) { window.GASCARD.bind(); window.GASCARD.stamp(); }
    if (scrollTo) { var el2 = document.getElementById("task-" + scrollTo); scrollTo = null; if (el2) el2.scrollIntoView({ block: "start" }); }
    var q = $("tkq"); if (q && (params.get("start") || params.get("seed") || editing || carry)) { q.focus(); }
  }
  // Pressed: disabled at once, the label says what is happening, and the other buttons in the card wait.
  function working(btn, label){ btn.disabled = true; btn.textContent = label; var card = btn.closest(".tcard,.tc,.limitbox"); if (card) card.querySelectorAll("button").forEach(function(b){ b.disabled = true; }); }
  // The rail's Tasks badge shows the server's count of open Tasks after every list.
  function syncBadge(fromWatching){
    // One number everywhere: open Tasks + watches + before-it-ends emails that are on. Whichever list was read last (the Tasks list or the Watching list) says it; both carry the same total from the server.
    var n = fromWatching && looking && looking.counts && typeof looking.counts.total === "number" ? looking.counts.total : (data && data.count);
    document.querySelectorAll("[data-gas-tasks-badge],[data-tasks-badge]").forEach(function(b){ if (n) { b.textContent = String(n); b.hidden = false; b.classList.remove("nu"); } else { b.textContent = ""; b.hidden = true; } });
    document.title = (n ? "(" + n + ") " : "") + "Your Tasks | GoAskSam";
  }
  // Arriving from a Find card's "Open Tasks" link: the item it made is scrolled to and marked.
  function jumpToHash(){ var h = decodeURIComponent((location.hash || "").replace(/^#/, "")); if (!/^lk-[wa]:/.test(h)) return; var el = document.getElementById(h); if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center" }); } }
  function findTask(id){ return ((data && data.tasks) || []).filter(function(x){ return x.id === id; })[0] || null; }
  // The list is fast (no full cards); the cars and the first match run follow and fill in.
  function load(){ return api({ action: "list", fast: true, draft: draft, open: openId || params.get("task") || null }).then(function(j){
    data = j; if (draft && j.draft_ok === false) saveDraft(null); syncLimit(); syncBadge();
    (data.tasks || []).forEach(function(t){ (t.updates || []).forEach(function(u){ if (u.data && fullCache[u.id]) u.data.full = fullCache[u.id]; }); });
    render(); kick(); loadLooking(); }).catch(function(){}); }
  function kick(){
    ((data && data.tasks) || []).forEach(function(t){
      if (t.kind === "hunt" && t.state === "running" && !firing[t.id] && !(t.updates || []).some(function(u){ return u.kind === "match"; })) {
        firing[t.id] = true; starting[t.id] = true; render();
        api({ action: "first", task_id: t.id }).catch(function(){}).then(function(){ delete starting[t.id]; return load(); });
        return;
      }
      var need = (t.updates || []).some(function(u){ return u.data && Array.isArray(u.data.cards) && u.data.cards.length && u.data.full === undefined; });
      if (need && !cardsOut[t.id]) {
        cardsOut[t.id] = true;
        api({ action: "cards", task_id: t.id }).then(function(j){
          (j.updates || []).forEach(function(x){ fullCache[x.id] = x.full; var tk = findTask(t.id); if (tk) (tk.updates || []).forEach(function(u){ if (u.id === x.id && u.data) u.data.full = x.full; }); });
          cardsOut[t.id] = "done"; render(); markets();
        }).catch(function(){ cardsOut[t.id] = "done"; render(); });
      }
    });
  }
  // A card whose market is not back (the engine's own pending answer, or none yet) is asked for again exactly as Buy asks: the
  // engine says when (retryAfterMs), each card fills in place the moment its own market lands, and a card still pending after
  // 45 seconds says so plainly instead of holding the reading line.
  function isPend(l){ return l && (l.market === undefined || l.market === null || (l.market && l.market.kind === "pending" && !l.market.couldNot)); }
  function allFull(){ var out = []; Object.keys(fullCache).forEach(function(k){ (fullCache[k] || []).forEach(function(l){ if (l && out.indexOf(l) < 0) out.push(l); }); }); return out; }
  function redrawCard(l){ if (!window.GASCARD) return; app.querySelectorAll('article.car[data-id="' + l.id + '"]').forEach(function(a){ var d = document.createElement("div"); d.innerHTML = window.GASCARD.card(l); var n = d.firstElementChild; if (n) a.replaceWith(n); }); if (window.GASCARD.stamp) window.GASCARD.stamp(); }
  function markets(){
    var still = allFull().filter(function(l){ return isPend(l) && !(l.market && l.market.couldNot); });
    if (!still.length) return;
    var ids = still.map(function(l){ return l.id; }).slice(0, 60);
    ids.forEach(function(id){ askN[id] = (askN[id] || 0) + 1; });
    fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enrich", ids: ids }) }).then(function(r){ return r.json(); }).catch(function(){ return { cards: [] }; }).then(function(j){
      var waits = [];
      still.forEach(function(l){
        var c = ((j && j.cards) || []).filter(function(x){ return x.id === l.id; })[0];
        if (c && c.market !== undefined) { l.market = c.market; l.seen_before = c.seen_before; if (c.timeline !== undefined) l.timeline = c.timeline; l.sam_lines = c.sam_lines; if (typeof c.cardHeadline === "string") { l.cardLabel = c.cardLabel; l.cardHeadline = c.cardHeadline; l.cardLine = c.cardLine; l.cardBand = c.cardBand || null; } }
        if (isPend(l)) {
          coldSince[l.id] = coldSince[l.id] || Date.now();
          var k = Number(window.GAS_WAIT_SCALE) || 1;
          var lim = Number(l.market && l.market.waitMaxMs) > 0 ? Number(l.market.waitMaxMs) : STILL_WAIT;
          if (lim > 0 && Date.now() - coldSince[l.id] >= lim * k) { l.market = { kind: "pending", stillReading: false, couldNot: true, line: COULD_NOT }; try { if (typeof gasTrack === "function") gasTrack("cold_miss", { wait_ms: Math.round(Date.now() - coldSince[l.id]), reason: "timeout", text: String(l.title || "").slice(0, 120), from_product: "tasks" }); } catch (e) {} }
          else waits.push((l.market && l.market.retryAfterMs > 0 ? l.market.retryAfterMs : STILL_RETRY) * k);
        } else delete coldSince[l.id];
        redrawCard(l);
      });
      if (waits.length) setTimeout(markets, Math.min.apply(null, waits));
    });
  }
  function send(text, tid){
    if (busy) return; busy = true;
    var sb = document.querySelector('[data-send="' + (tid ? "tkq-" + tid : "tkq") + '"]'); if (sb) { sb.disabled = true; sb.textContent = "Sam is reading..."; } var qi = $(tid ? "tkq-" + tid : "tkq"); if (qi) qi.readOnly = true;
    // The box in a Task speaks to that Task; the top box starts a new one.
    var body = tid ? { action: "say", task_id: tid, text: text, pending: pendingId === tid ? pending : null } : { action: "say", text: text, draft: draftOpen ? draft : null, seed: draftOpen && draft ? null : seedObj() };
    api(body).then(function(j){
      busy = false; editing = false; carry = ""; if (!tid) { var tq0 = $("tkq"); if (tq0) tq0.value = ""; } reply = j.reply || ""; replyFor = tid || null;
      if (tid) { pending = j.pending || null; pendingId = pending ? tid : null; return load(); }
      if (j.blocked) { showLimit({ mode: "typed", attempted: text, line: j.blocked.line }); reply = ""; return load(); }
      if (j.task) { saveDraft(null); reply = ""; return load(); }
      if (j.discarded) { saveDraft(null); return load(); }
      if (j.draft) { saveDraft(j.draft); draftOpen = true; miss = !!j.miss; }
      render();
    }).catch(function(){ busy = false; render(); var q = $(tid ? "tkq-" + tid : "tkq"); if (q) q.value = text; });
  }
  document.addEventListener("click", function(e){
    var lk = e.target.closest("[data-lk-stop]"); if (lk) { e.preventDefault(); if (lk.disabled) return; lk.disabled = true; lk.textContent = "Stopping..."; api({ action: "looking_stop", ref: lk.getAttribute("data-lk-stop") }).catch(function(){}).then(loadLooking); return; }
    var t = e.target.closest("[data-send],[data-act],[data-start],[data-change],[data-apply],[data-unpending],[data-goto],[data-limit-stop],[data-limit-keep],[data-choice],[data-continue],[data-discard],[data-toggle]"); if (!t) return;
    if (t.hasAttribute("data-limit-keep")) { e.preventDefault(); dismissLimit(); return; }
    if (t.hasAttribute("data-limit-stop")) { e.preventDefault(); if (t.disabled) return; var ls = limit || { mode: "none", attempted: "" }, cid = t.getAttribute("data-limit-stop"); working(t, "Stopping...");
      api({ action: "limit", event: "stop", mode: ls.mode, task_id: cid, attempted: ls.attempted, resume_id: ls.resume_id || null, draft: ls.mode === "draft" ? draft : null, defer: true }).then(function(j){
        limit = null; reply = "";
        if (ls.mode === "draft" && j && j.task) { saveDraft(null); if (j.task.state === "running") { starting[j.task.id] = true; } }
        // A typed or seeded job: the slot is free now, so Sam drafts it at once (the read-back, then Start).
        if (ls.mode === "seed" || ls.mode === "typed") { var w = ls.mode === "seed" ? seedWords() : ls.attempted; if (ls.mode === "seed") dropEntryParams(); return load().then(function(){ if (w) send(w); }); }
        return load();
      }).catch(function(){ limit = null; load(); }); return; }
    if (t.hasAttribute("data-toggle")) { e.preventDefault(); var tid2 = t.getAttribute("data-toggle"); if (openId === tid2) { setOpen(null); render(); } else { setOpen(tid2); render(); load(); } var tb = $("tt-" + tid2); if (tb) tb.focus({ preventScroll: true }); return; }
    if (t.hasAttribute("data-goto")) { var el = document.getElementById("task-" + t.getAttribute("data-goto")); if (el) { e.preventDefault(); el.scrollIntoView({ block: "start" }); } return; }
    e.preventDefault();
    if (t.hasAttribute("data-choice")) { if (!t.disabled) send(t.getAttribute("data-choice")); return; }
    if (t.hasAttribute("data-continue")) { draftOpen = true; miss = false; reply = ""; render(); return; }
    if (t.hasAttribute("data-discard")) { saveDraft(null); reply = ""; editing = false; render(); return; }
    if (t.hasAttribute("data-send")) { var q = $(t.getAttribute("data-send")); if (q && q.value.trim()) send(q.value.trim(), t.getAttribute("data-task") || null); return; }
    if (t.hasAttribute("data-change")) { editing = true; render(); return; }
    if (t.hasAttribute("data-unpending")) { pending = null; pendingId = null; reply = ""; render(); return; }
    if (t.disabled) return;
    // Start: the Task is created and shown at once (running, "Sam is starting"); the first match run and the cars fill in after.
    if (t.hasAttribute("data-start")) { working(t, "Starting..."); api({ action: "start", draft: draft, defer: true }).then(function(j){
      if (j.blocked) { showLimit({ mode: "draft", attempted: (draft && (draft.summary || draft.words)) || "", line: j.blocked.line }); return load(); }
      if (j.task) { saveDraft(null); reply = ""; limit = null; if (j.task.starting) starting[j.task.id] = true; note = ""; }
      return load(); }).catch(function(){ load(); }); return; }
    if (t.hasAttribute("data-apply")) { working(t, "Saving..."); api({ action: "apply", task_id: t.getAttribute("data-apply"), pending: pending }).then(function(){ pending = null; pendingId = null; reply = ""; note = ""; return load(); }).catch(function(){ load(); }); return; }
    if (t.hasAttribute("data-act")) { working(t, { pause: "Pausing...", resume: "Resuming...", stop: "Stopping..." }[t.getAttribute("data-act")] || "..."); api({ action: "control", task_id: t.getAttribute("data-id"), act: t.getAttribute("data-act") }).then(function(j){ note = ""; pending = null; pendingId = null; reply = "";
      if (j.blocked) { var rt = findTask(t.getAttribute("data-id")); showLimit({ mode: "resume", attempted: rt ? phraseOf(rt) : "", line: j.blocked.line, resume_id: t.getAttribute("data-id") }); }
      return load(); }).catch(function(){ load(); }); }
  });
  window.addEventListener("resize", (function(last){ return function(){ var c = cols(); if (c !== last) { last = c; render(); } }; })(cols()));
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && data && data.limit && data.limit.atLimit && !limitHidden && document.querySelector(".limitbox")) { dismissLimit(); return; } });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && openId && e.target && e.target.closest && e.target.closest(".tc,.tdetail")) { var id = openId; setOpen(null); render(); var b = $("tt-" + id); if (b) b.focus(); } });
  document.addEventListener("change", function(e){
    if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-notify-every")) {
      var every = e.target.value; e.target.disabled = true;
      if (typeof gasTrack === "function") gasTrack("task_frequency_changed", { frequency: every });
      api({ action: "notify", every: every }).then(function(j){ if (j && j.error) note = j.error; else if (data && j) data.notify = j; render(); });
      return;
    }
    if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-notify-on")) return;
    var on = e.target.checked; e.target.disabled = true;
    api({ action: "notify", on: on }).then(function(j){ if (data && j && !j.error) data.notify = j; render(); });
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target && /^tkq/.test(e.target.id || "") && e.target.value.trim()) { e.preventDefault(); send(e.target.value.trim(), e.target.getAttribute("data-task") || null); } });
  load();
})();`;
