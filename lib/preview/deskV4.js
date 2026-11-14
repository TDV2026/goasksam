// DESK V4, THE ANALYST WORKSPACE (Lane E, Nov 10 2026), built to docs/desk-mockups/desk-v4.html. Crew-only preview at /preview/desk and /preview/desk/case/:id; it replaces the tabbed V3 workspace there (the old Valuations preview stays at /preview/desk-valuations).
// This page computes nothing: every figure and sentence below is a field the server sent (Lane D's case view through lib/preview/deskV3.js deskModel, Lane B's desk.* fields) or a fixed interface label. A field that is absent is not drawn.
// STAGE 1 here: the shell and layout. Top bar (GoAskSam Desk, the org, two tabs, saved state, handling clock); three zones (case queue 232px, the centre column that scrolls, the Reserve panel 372px, sticky, the only element with a shadow); no Vehicle, Market evidence or Decision tabs;
// under 1100px the Reserve panel moves to the top and the queue becomes a drawer. The centre column's cards and the Reserve panel's parts are filled by stages 2 and 3 into the slots below.
import { PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { deskModel, GROUPS, SRC_LABEL, V3_BASE, V3_CASE } from "./deskV3.js";
import { deskV4Client, deskV4New, deskV4Queue } from "./deskV4Client.js";
import { moneyWords, reasonLine } from "../reasonWords.js";
import { DOC_KINDS } from "../desk/caseModel.js";
import { readinessOf } from "../desk/caseWorkflow.js";
import { DESK_V4_CSS } from "./deskV4Css.js";
import { FONT_LINKS } from "../../api/_chrome.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = u => String(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));

// The tile for a case with no photo, cut from the case's own title (no figure is made): the year over the make's first letter, in one small serif tile. A title with no year and make gives its first word.
export function tileOf(car) { const t = String(car || "").trim(), m = t.match(/^(\d{4})\s+([^\s\d])/); if (m) return { year: m[1], initial: m[2].toUpperCase() }; return { year: "", initial: (t.split(/\s+/)[0] || "").slice(0, 5) }; }
const tileHtml = car => { const t = tileOf(car); return t.year ? `<i class="ty">${esc(t.year)}</i><b class="tm">${esc(t.initial)}</b>` : `<b class="tm word">${esc(t.initial)}</b>`; };
// The queue: Lane D's stage groups with the counts it sent, one row per case. Every row is the same: one thumbnail box, a title that wraps (a Forwarded lead pill follows it inline), the seller and the time in the queue on the second line, a menu (Open, Archive or Restore, Delete). Archived cases sit in a collapsed group at the bottom.
// The operations are Lane D's case_archive, case_restore and case_delete (named here, not yet served: a refusal prints the server's own why under the row).
const ROW_OPS = `<button type="button" class="qk" aria-haspopup="menu" aria-expanded="false" aria-label="Case actions">&#8943;</button><div class="qm" role="menu" hidden><button type="button" role="menuitem" data-op="open">Open</button><button type="button" role="menuitem" data-op="archive">Archive</button><button type="button" role="menuitem" data-op="restore">Restore</button><button type="button" role="menuitem" data-op="delete">Delete</button></div><div class="qc" hidden><span>Delete this case?</span><button type="button" class="btn sm dng" data-op="delete-yes">Delete</button><button type="button" class="btn sm" data-op="delete-no">Keep</button></div><p class="qe" role="alert" hidden></p>`;
export function queueHtml(cases, activeId, queue, handling) {
  const live = cases.filter(c => !c.archived), arch = cases.filter(c => c.archived), by = k => live.filter(c => c.group === k);
  const row = c => `<div class="qi${c.id === activeId ? " on" : ""}" data-case="${esc(c.id)}" data-group="${esc(c.group || "")}" data-mine="${c.mine ? 1 : 0}" data-fwd="${c.forwarded ? 1 : 0}" data-archived="${c.archived ? 1 : 0}" data-search="${esc([c.car, c.seller, c.vin, c.ref, c.status].filter(Boolean).join(" ").toLowerCase())}">`
    + `<a class="qa" href="${V3_CASE}${esc(c.id)}"${c.id === activeId ? ' aria-current="page"' : ""}><div class="ph${c.photo ? "" : " none"}"${c.photo ? ` style="background-image:url('${esc(urlOf(c.photo))}')"` : ""}>${c.photo ? "" : tileHtml(c.car)}</div><div class="qt"><span class="qn" title="${esc(c.car)}">${esc(c.car)}</span><span class="q2"><i class="qsel${c.seller ? "" : " none"}" title="${esc(c.seller || "")}">${esc(c.seller || "No seller yet")}</i>${c.group === "new" && c.forwarded ? `<em class="tag" data-forwarded="1">Forwarded lead</em>` : ""}<i class="qage">${esc(c.age)}</i></span></div></a>${ROW_OPS}</div>`;
  const groups = GROUPS.map(g => `<div class="qgrp" data-group="${g.key}"><div class="qg"><span>${esc(g.label)}</span>${queue && queue[g.key] != null ? `<span data-count>${esc(queue[g.key])}</span>` : ""}</div>${by(g.key).map(row).join("")}</div>`).join("");
  return `<aside class="card queue" id="queue" aria-label="Cases"><button type="button" class="btn pri new" id="newcase-btn">New case</button><input type="search" id="qs" placeholder="Search title, seller or VIN" aria-label="Search cases" autocomplete="off">`
    + `<div class="qf" id="qf" role="group" aria-label="Show"><button type="button" class="on" data-f="all" aria-pressed="true">All</button><button type="button" data-f="mine" aria-pressed="false">Mine</button><button type="button" data-f="forwarded" aria-pressed="false">Forwarded</button></div>`
    + `${groups}<p class="qnone" id="qnone" hidden>No case matches.</p>`
    + `<div class="qgrp qarch" id="qarch"${arch.length ? "" : " hidden"}><button type="button" class="qg qgh" id="qarchh" aria-expanded="false" aria-controls="qarchbox"><span>Archived</span>${queue && queue.archived != null ? `<span data-count>${esc(queue.archived)}</span>` : ""}</button><div id="qarchbox" hidden>${arch.map(row).join("")}</div></div>`
    + `</aside>`;
}

// THE TODAY PANEL: the centre when no case is open. Every number and sentence is the server's (case.today and case.handling.lines); the page draws them in one tile style and counts nothing. "Start the next lead" is a link to the case the server named (today.nextLead).
export function todayHtml(today, handling) {
  if (!today || !Array.isArray(today.tiles)) return "";
  const tile = (k, l, v, sub) => `<div class="tl" data-tile="${esc(k)}"><span class="tlab">${esc(l)}</span><b class="tval">${esc(v)}</b>${sub ? `<small class="tsub">${esc(sub)}</small>` : ""}</div>`;
  const lines = handling && Array.isArray(handling.lines) ? handling.lines.filter(l => l && l.label && l.value != null) : [];
  const next = today.nextLead && today.nextLead.id ? `<a class="btn pri" id="startnext" href="${V3_CASE}${esc(today.nextLead.id)}" data-next="${esc(today.nextLead.id)}">${esc(today.startLabel || "")}</a>` : `<button type="button" class="btn pri" id="startnext" disabled>${esc(today.startLabel || "")}</button>`;
  return `<section class="card pad today" id="today" aria-label="${esc(today.title || "")}"><div class="trow"><h2 class="tt">${esc(today.title || "")}</h2>${next}</div>`
    + `<div class="ttiles" id="ttiles">${today.tiles.map(t => tile(t.key, t.label, t.value, t.sub)).join("")}</div>`
    + (lines.length ? `<div class="ttiles tstats" id="ops">${lines.map((l, i) => tile("stat" + i, l.label, l.value, null)).join("")}</div>` : "") + `</section>`;
}
// The top bar. The handling clock is the server's line for this analyst on this case (case.handling.clock, Lane D); with no such field the clock is not drawn.
export function topHtml(clock) {
  return `<header class="top" id="top"><button type="button" class="qopen" id="qopen" aria-controls="queue" aria-expanded="false">Cases</button><span class="brand">GoAskSam Desk<span class="org">${esc(PREVIEW_ORG.name)}</span></span>`
    + `<nav aria-label="Views"><button type="button" class="on" id="n-desk" data-view="desk">Analyst workspace</button><button type="button" id="n-report" data-view="report">Seller report</button></nav>`
    + `<span class="r"><span id="saved" role="status" aria-live="polite">Saved</span>${clock ? `<span class="num" id="clockw"><b id="clock">${esc(clock)}</b></span>` : ""}</span></header>`;
}

// The New case panel, in two steps (docs/desk-mockups/desk-v4.html): one large field and Start, then the car card (title, spec line, where it came from, each decoded value a quiet tag with a pencil) over the optional facts. Labels are interface words; nothing here is a figure.
const fld = (id, label, inner, cls = "") => `<div class="fld nf${cls ? " " + cls : ""}"><label for="${id}"><span>${esc(label)}</span></label>${inner}</div>`;
const pick = (id, list, ph) => `<span class="pk"><input id="${id}" class="txt" type="text" autocomplete="off" list="${list}" placeholder="${esc(ph)}"><em class="dtag" id="${id}-dec" hidden>decoded</em></span><datalist id="${list}"></datalist>`;
const unit = (id, pre, post, ph) => `<span class="unit">${pre ? `<i class="u pre">${pre}</i>` : ""}<input id="${id}" class="txt" type="text" inputmode="numeric" autocomplete="off" placeholder="${esc(ph)}">${post ? `<i class="u post">${post}</i>` : ""}</span>`;
export const newCaseV4Html = () => `<section class="card pad nc" id="newcase" aria-label="New case" hidden>`
  + `<div id="nc-s1"><h2 class="nc-h">New case</h2><label class="nc-lead" for="nc-start">VIN, or year, make and model</label><div class="nc-startrow"><input id="nc-start" class="nc-big" type="text" autocomplete="off" spellcheck="false" placeholder="A VIN, or for example 1999 Porsche 911 Carrera"><button type="button" class="btn pri" id="nc-startbtn">Start</button></div><p class="msg" id="nc-msg1" role="alert" hidden></p><div class="ncbar"><button type="button" class="btn quiet" id="nc-x1">Cancel</button></div></div>`
  + `<div id="nc-s2" hidden><div class="nc-car" id="nc-car"><div class="nc-cardtop"><h2 class="nc-title" id="nc-title"></h2><button type="button" class="link" id="nc-back">Change car</button></div><p class="nc-vin" id="nc-spec"></p><p class="nc-src" id="nc-src"></p><p class="nc-warnline" id="nc-warn" role="status" hidden></p><div class="nc-tags" id="nc-tags"></div></div>`
  + `<div class="ncform"><h3 class="nc-sub">Optional facts</h3><div class="nc2">`
  + fld("nc-body", "Body", pick("nc-body", "dl-body", "Choose or type")) + fld("nc-trans", "Transmission", pick("nc-trans", "dl-trans", "Choose or type")) + fld("nc-colour", "Colour", pick("nc-colour", "dl-colour", "Choose or type"))
  + fld("nc-mileage", "Mileage", unit("nc-mileage", "", "miles", "0")) + fld("nc-asking", "Asking price", unit("nc-asking", "&#36;", "", "0")) + fld("nc-seller", "Seller name", `<input id="nc-seller" class="txt" type="text" autocomplete="off">`)
  + fld("nc-notes", "Seller notes", `<textarea id="nc-notes" rows="3"></textarea>`, "wide")
  + `<div class="fld nf wide"><label for="nc-photos"><span>Photos</span></label><div class="drop" id="nc-drop"><span>Drop photos here, or <u>choose them</u></span><small>JPG, PNG, WebP or HEIC. Add as many as you like, in as many goes as you like.</small><input id="nc-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple></div><div class="nclist" id="nc-list"></div></div>`
  + `</div><datalist id="dl-trim"></datalist>`
  + `<div class="ncbar"><button type="button" class="btn pri" id="nc-go">Create case</button><button type="button" class="btn quiet" id="nc-x">Cancel</button></div><p class="msg" id="nc-msg" role="alert" hidden></p></div></div></section>`;

// The centre column's cards. Each is an empty container that lib/preview/deskV4Client.js fills from the case the server sent; the headings and labels are interface words, no figure or sentence is typed here.
const card = (id, inner, cls = "card pad") => `<div class="${cls}" id="${id}">${inner}</div>`;
const secH = (h, act = "") => `<div class="sec-h"><h3>${esc(h)}</h3>${act ? `<div class="act">${act}</div>` : ""}</div>`;
export const CENTRE_CARDS = () => [
  `<div class="casehead" id="s-head"></div><p class="msg" id="v4msg" role="alert" hidden></p>`,
  card("s-car", ""),
  card("s-docs", secH("Documents", `<span id="dcount"></span><span id="rereadbox"></span><span id="dockindbox"></span>`) + `<p class="rereadmsg" id="rereadmsg" role="status" hidden></p><div class="docs" id="docs"></div><div class="sellerwords" id="sellerWords" hidden></div>`),
  card("s-own", `<div class="own-h"><h3 id="own-h"></h3></div><ul class="ownrows" id="ownrows"></ul><div class="ownlive" id="ownlive" hidden></div>`),
  card("s-market", secH("What the market paid", `<span class="cndbox" id="condbox"><span class="cndl">Condition</span><span class="seg" id="cond" role="group" aria-label="Condition"></span><span class="cndhint" id="condhint" hidden>Dot marks the suggestion</span></span><span class="seg" id="period" role="group" aria-label="Period"></span>`) + `<p class="msg" id="swmsg" role="alert" hidden></p><div class="winlines" id="winlines" hidden></div><div class="mk-sum" id="mk-sum"></div><p class="mute" id="mkins" hidden></p><svg id="plot" height="170" role="img" aria-label="Every completed sale as a dot on a price axis, with the typical range, the median, the asking price and the reserve"></svg>`
    + `<div class="legend"><span><i style="background:var(--ev-dot)"></i>One completed sale</span><span><i style="background:var(--ev-soft);border-radius:2px;width:14px"></i>Typical range</span><span><i style="background:var(--ev);width:3px;border-radius:1px;height:11px"></i>Median</span><span><i style="background:var(--an);width:3px;border-radius:1px;height:11px"></i>Reserve, drag to move</span><span><i style="background:none;border-left:2px dashed var(--faint);width:0;border-radius:0;height:11px"></i>Asking</span></div><p class="rungline" id="rungline"></p><p class="mute" style="font-size:12px;margin-top:2px" id="mknote"></p>`),
  card("s-live", secH("For sale now", "For the analyst only. Each opens its listing. Never in the report.") + `<div class="live" id="live"></div>`),
  card("s-closest", secH("Closest sales", `<span>Each opens its listing</span><span>·</span><span id="ccount"></span><span>·</span><button type="button" class="link" id="showall" hidden></button>`) + `<div id="comps"></div>`),
  card("s-considered", secH("What we took into account", "Printed in the report. The engine's items are the start: edit, remove or add.") + `<div class="steps" id="considered"></div><div style="margin-top:8px"><button type="button" class="btn sm" id="addcon">Add an item</button></div>`),
  card("s-steps", secH("Next steps for the seller", "Printed in the report. Edit, remove or add.") + `<div class="steps" id="steps"></div><div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm" id="addstep">Add a step</button><span class="mute" style="font-size:12px" id="stepAuto"></span></div>`)
].join("");

// What the browser half is given: the case view as the server sent it, plus the words the server holds for it (title, stage, the seller's asking figure as worded by reasonWords). Nothing here is a made figure.
export function clientModel(model) {
  const { cases = [], activeId = null, kase = null } = model || {}, active = cases.find(c => c.id === activeId) || null; if (!active || !kase) return null;
  const ask = kase.seller && kase.seller.asking_price != null ? Number(kase.seller.asking_price) : null, stage = GROUPS.find(g => g.key === kase.stage);
  return { kase, title: (kase.desk && kase.desk.titleLine) || active.car, stageLabel: stage ? stage.label : null, stages: Object.fromEntries(GROUPS.map(g => [g.key, g.label])), forwarded: !!(cases.find(c => c.id === activeId) || {}).forwarded, receivedLine: kase.vehicle && kase.vehicle.submittedLine || null, readiness: readinessOf(kase), clock: kase.handling && kase.handling.clock || null, asking: Number.isFinite(ask) ? ask : null, askLine: Number.isFinite(ask) ? moneyWords(ask) : null,
    srcLabels: SRC_LABEL, rereadWord: reasonLine("case.reread.button"), docKinds: DOC_KINDS.map(k => [k, reasonLine("case.doc.kind." + k)]) };
}
const jsonIn = o => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

// The Reserve panel's parts, in the mockup's order. Labels are interface words; every figure and sentence is filled by lib/preview/deskV4Client.js from the case the server sent.
const PANEL_HTML = `<div class="hd"><span class="eyebrow">Recommended reserve</span><div class="numrow"><input id="valIn" class="num" inputmode="numeric" autocomplete="off" aria-label="Recommended reserve in dollars"></div>`
  + `<p class="diff" id="diff"></p><p class="diff" id="ownLiveLine" hidden></p><p class="diff" id="sellerAsk" hidden></p><p class="diff" id="sellerPref" hidden></p><label class="hi" id="hiWarn" hidden><input type="checkbox" id="sellerReq"><span id="hiTxt">The sales do not support this figure. Tick if the seller asked for it; the report will say so.</span></label><div class="mkt" id="mkt"></div><p class="mute" style="font-size:12px;margin-top:8px" id="resStart"></p></div>`
  + `<div class="chk" id="chk"></div>`
  + `<div class="tabs" id="vtabs" role="tablist" aria-label="Reserve panel">`
  + [["why", "Why this figure"], ["needs", "Needs attention"], ["rmode", "Reserve or no reserve"], ["report", "Report"]].map(([k, l], n) => `<button type="button" role="tab" id="tab-${k}" data-tab="${k}" aria-controls="tp-${k}" aria-selected="${n === 0 ? "true" : "false"}" tabindex="${n === 0 ? 0 : -1}"><span>${l}</span><i class="bdg" data-bdg="${k}" hidden></i></button>`).join("")
  + `</div>`
  + `<div class="bd"><section id="tp-why" role="tabpanel" aria-labelledby="tab-why" data-tabpanel="why">`
  + `<div class="fld"><label for="cnote"><span>Condition note</span><span>Optional, printed if filled</span></label><input id="cnote" class="txt" autocomplete="off" placeholder="For example: from photographs"></div>`
  + `<div class="fld"><label for="why"><span>Printed in the report</span><span>Edit freely</span></label><textarea id="why"></textarea></div></section>`
  + `<section id="tp-needs" role="tabpanel" aria-labelledby="tab-needs" data-tabpanel="needs" hidden><div class="fld"><label><span id="attN"></span></label><div class="att" id="att"></div></div></section>`
  + `<section id="tp-rmode" role="tabpanel" aria-labelledby="tab-rmode" data-tabpanel="rmode" hidden><div class="rmode" id="rmode" hidden><p class="rmline" id="rmLine"></p><div class="rmc"><div id="rmWith"><span>With a reserve</span><b></b><em></em></div><div id="rmNo"><span>No reserve</span><b></b><em></em></div></div>`
  + `<label class="rmctl"><input type="checkbox" id="rmNoRes"><span>Recommend no reserve in the report</span></label><input id="rmWhy" class="txt" autocomplete="off" aria-label="Why no reserve" placeholder="Why no reserve"><p class="rmset" id="rmSet" hidden></p></div><p class="mute" id="rmNone" hidden>Nothing to show here for this car.</p></section>`
  + `<section id="tp-report" role="tabpanel" aria-labelledby="tab-report" data-tabpanel="report" hidden><small id="finHint"></small><div class="fin" id="finBox"></div><div class="send" id="sendBox" hidden><button type="button" class="btn" id="bSend">Send to seller</button><small id="sendHint" role="status"></small><div class="sentline" id="sentLine" hidden></div></div></section></div>`
  + `<div class="ft"><div class="row"><button type="button" class="btn" id="bPrev">Preview report</button><button type="button" class="btn pri" id="bFin" disabled>Finalize</button></div></div>`;
const SEND_DIALOG = `<div class="scrim2" id="sendScrim" hidden><div class="dlg" id="sendDlg" role="dialog" aria-modal="true" aria-labelledby="sendT"><h3 id="sendT">Send to seller</h3>`
  + `<div class="fld"><label><span>From</span></label><div class="ro" id="sendFrom"></div></div><div class="fld"><label for="sendTo"><span>To</span></label><input id="sendTo" class="txt" type="email" autocomplete="off"></div><div class="fld"><label><span>Subject</span></label><div class="ro" id="sendSubject"></div></div>`
  + `<div class="fld"><label><span>Message</span></label><div class="ro msg2" id="sendMsg"></div></div><div class="fld"><label><span>Attachment</span></label><div class="ro att2"><span id="sendAtt"></span><span class="mute">Version <b id="sendVer"></b></span></div></div>`
  + `<div class="fld" id="sendEarlierBox" hidden><label><span>Earlier sends</span></label><div id="sendEarlier"></div></div><p class="msg" id="sendErr" role="alert" hidden></p><div class="ncbar"><button type="button" class="btn pri" id="sendGo">Send</button><button type="button" class="btn" id="sendNo">Cancel</button></div></div></div>`;

export function pageHtml(model) {
  const { cases = [], activeId = null, queue = null, handling = null, kase = null, today = null } = model || {};
  const active = cases.find(c => c.id === activeId) || null, clock = kase && kase.handling && kase.handling.clock ? kase.handling.clock : null;
  const centre = `<div class="col" id="col">${newCaseV4Html()}${active ? CENTRE_CARDS() : todayHtml(today, handling)}</div>`;
  const panel = `<aside class="card val" id="val" aria-label="Reserve"${active ? "" : " hidden"}>${active ? PANEL_HTML : `<div class="hd"><span class="eyebrow">Recommended reserve</span></div>`}</aside>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${active ? esc(active.car) + " | " : ""}GoAskSam Desk</title>${FONT_LINKS}<style>${DESK_V4_CSS}</style></head>`
    + `<body class="v4"><div class="wrap">${topHtml(clock)}<section class="view" id="v-desk"><div class="ws">${queueHtml(cases, activeId, queue, handling)}${centre}${panel}</div></section>`
    + `<section class="view" id="v-report" hidden><div class="rep" id="rep"></div></section></div><div class="qscrim" id="qscrim"></div>${active ? SEND_DIALOG : ""}`
    + `<script>window.__V4__=${jsonIn(clientModel(model))};window.__DESK_V3__={api:${JSON.stringify(API_PATH)},srcLabels:${JSON.stringify(SRC_LABEL)},base:${JSON.stringify(V3_BASE)},active:${JSON.stringify(activeId)},seat:${JSON.stringify(PREVIEW_SEAT)}};${SHELL_JS}(${deskV4New})();(${deskV4Queue})();(${deskV4Client})();</script></body></html>`;
}

// Shell behaviour only: the two views, the queue drawer under 1100px. No figure is made here.
const SHELL_JS = `(function(){var $=function(i){return document.getElementById(i)};
function view(v,quiet){var d=v!=="report";$("v-desk").hidden=!d;$("v-report").hidden=d;$("n-desk").classList.toggle("on",d);$("n-report").classList.toggle("on",!d);try{history.replaceState(null,"",d?location.pathname+location.search:"#report")}catch(e){}if(!d&&!quiet&&window.__v4report)window.__v4report()}window.__v4view=view;
[].forEach.call(document.querySelectorAll(".top nav [data-view]"),function(b){b.addEventListener("click",function(){view(b.getAttribute("data-view"))})});if(location.hash==="#report")setTimeout(function(){view("report")},0);
var qo=$("qopen"),qu=$("queue"),sc=$("qscrim");function drawer(on){qu.classList.toggle("open",on);sc.classList.toggle("on",on);qo.setAttribute("aria-expanded",on?"true":"false")}
if(qo){qo.addEventListener("click",function(){drawer(!qu.classList.contains("open"))});sc.addEventListener("click",function(){drawer(false)});document.addEventListener("keydown",function(e){if(e.key==="Escape")drawer(false)})}
})();`;

export const deskV4Shell = () => pageHtml({});
export async function renderDeskV4(req) { return pageHtml(await deskModel(req)); }
