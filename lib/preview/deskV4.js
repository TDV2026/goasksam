// DESK V4, THE ANALYST WORKSPACE (Lane E, Nov 10 2026), built to docs/desk-mockups/desk-v4.html. Crew-only preview at /preview/desk and /preview/desk/case/:id; it replaces the tabbed V3 workspace there (the old Valuations preview stays at /preview/desk-valuations).
// This page computes nothing: every figure and sentence below is a field the server sent (Lane D's case view through lib/preview/deskV3.js deskModel, Lane B's desk.* fields) or a fixed interface label. A field that is absent is not drawn.
// STAGE 1 here: the shell and layout. Top bar (GoAskSam Desk, the org, two tabs, saved state, handling clock); three zones (case queue 232px, the centre column that scrolls, the Reserve panel 372px, sticky, the only element with a shadow); no Vehicle, Market evidence or Decision tabs;
// under 1100px the Reserve panel moves to the top and the queue becomes a drawer. The centre column's cards and the Reserve panel's parts are filled by stages 2 and 3 into the slots below.
import { PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { deskModel, GROUPS, newCaseHtml, NEW_JS, V3_BASE, V3_CASE } from "./deskV3.js";
import { DESK_V4_CSS } from "./deskV4Css.js";
import { FONT_LINKS } from "../../api/_chrome.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = u => String(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));

// The queue: Lane D's four stage groups with the counts it sent, one row per case (its photo, car, seller, time in the queue), the search and the operations lines as sent.
export function queueHtml(cases, activeId, queue, handling) {
  const by = k => cases.filter(c => c.group === k);
  const row = c => `<a class="qi${c.id === activeId ? " on" : ""}" href="${V3_CASE}${esc(c.id)}" data-case="${esc(c.id)}" data-search="${esc([c.car, c.seller, c.ref, c.status].filter(Boolean).join(" ").toLowerCase())}"${c.id === activeId ? ' aria-current="page"' : ""}>`
    + `<div class="ph"${c.photo ? ` style="background-image:url('${esc(urlOf(c.photo))}')"` : ""}></div><div><b>${esc(c.car)}</b><span><i style="font-style:normal">${esc(c.seller || "")}</i><i style="font-style:normal">${esc(c.age)}</i></span></div></a>`;
  const groups = GROUPS.map(g => `<div class="qg"><span>${esc(g.label)}</span>${queue && queue[g.key] != null ? `<span>${esc(queue[g.key])}</span>` : ""}</div>${by(g.key).map(row).join("")}`).join("");
  const lines = handling && Array.isArray(handling.lines) ? handling.lines.filter(l => l && l.label && l.value != null) : [];
  return `<aside class="card queue" id="queue" aria-label="Cases"><button type="button" class="btn pri new" id="newcase-btn">New case</button><input type="search" id="qs" placeholder="Search cases" aria-label="Search cases" autocomplete="off">${groups}<p class="qnone" id="qnone" hidden>No case matches.</p>`
    + `${lines.length ? `<div class="ops" id="ops">${lines.map(l => `<div><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join("")}</div>` : ""}</aside>`;
}

// The top bar. The handling clock is the server's line for this analyst on this case (case.handling.clock, Lane D); with no such field the clock is not drawn.
export function topHtml(clock) {
  return `<header class="top" id="top"><button type="button" class="qopen" id="qopen" aria-controls="queue" aria-expanded="false">Cases</button><span class="brand">GoAskSam Desk<span class="org">${esc(PREVIEW_ORG.name)}</span></span>`
    + `<nav aria-label="Views"><button type="button" class="on" id="n-desk" data-view="desk">Analyst workspace</button><button type="button" id="n-report" data-view="report">Seller report</button></nav>`
    + `<span class="r"><span id="saved" role="status" aria-live="polite">Saved</span>${clock ? `<span class="num">Handling <b id="clock">${esc(clock)}</b></span>` : ""}</span></header>`;
}

// The slots the next stages fill. Each card prints its own heading now so the three zones can be laid out and measured; no figure, sentence or list item is typed here.
const SLOTS = [["car", ""], ["docs", "Documents"], ["market", "What the market paid"], ["closest", "Closest sales"], ["steps", "Next steps for the seller"], ["live", "For sale now"]];
const slotHtml = ([k, h]) => `<div class="card pad" id="s-${k}" data-slot="${k}">${h ? `<div class="sec-h"><h3>${esc(h)}</h3></div>` : ""}</div>`;

export function pageHtml(model) {
  const { cases = [], activeId = null, queue = null, handling = null, kase = null } = model || {};
  const active = cases.find(c => c.id === activeId) || null, clock = kase && kase.handling && kase.handling.clock ? kase.handling.clock : null;
  const centre = `<div class="col" id="col">${newCaseHtml()}${active ? SLOTS.map(slotHtml).join("") : `<div class="card pad"><p class="mute">Select a case from the list.</p></div>`}</div>`;
  const panel = `<aside class="card val" id="val" aria-label="Reserve"${active ? "" : " hidden"}><div class="hd"><span class="eyebrow">Recommended reserve</span></div></aside>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${active ? esc(active.car) + " | " : ""}GoAskSam Desk</title>${FONT_LINKS}<style>${DESK_V4_CSS}</style></head>`
    + `<body class="v4"><div class="wrap">${topHtml(clock)}<section class="view" id="v-desk"><div class="ws">${queueHtml(cases, activeId, queue, handling)}${centre}${panel}</div></section>`
    + `<section class="view" id="v-report" hidden><div class="rep" id="rep"></div></section></div><div class="qscrim" id="qscrim"></div>`
    + `<script>window.__DESK_V3__={api:${JSON.stringify(API_PATH)},base:${JSON.stringify(V3_BASE)},active:${JSON.stringify(activeId)},seat:${JSON.stringify(PREVIEW_SEAT)}};${SHELL_JS}${NEW_JS}</script></body></html>`;
}

// Shell behaviour only: the two views, the queue search, the queue drawer under 1100px. No figure is made here.
const SHELL_JS = `(function(){var $=function(i){return document.getElementById(i)};
function view(v){var d=v!=="report";$("v-desk").hidden=!d;$("v-report").hidden=d;$("n-desk").classList.toggle("on",d);$("n-report").classList.toggle("on",!d);try{history.replaceState(null,"",d?location.pathname+location.search:"#report")}catch(e){}}
[].forEach.call(document.querySelectorAll(".top nav [data-view]"),function(b){b.addEventListener("click",function(){view(b.getAttribute("data-view"))})});if(location.hash==="#report")view("report");
var q=$("qs");if(q)q.addEventListener("input",function(){var t=q.value.toLowerCase().trim(),n=0;[].forEach.call(document.querySelectorAll(".queue .qi"),function(a){var h=t&&a.getAttribute("data-search").indexOf(t)<0;a.hidden=!!h;if(!h)n++});$("qnone").hidden=n>0||!t});
var qo=$("qopen"),qu=$("queue"),sc=$("qscrim");function drawer(on){qu.classList.toggle("open",on);sc.classList.toggle("on",on);qo.setAttribute("aria-expanded",on?"true":"false")}
if(qo){qo.addEventListener("click",function(){drawer(!qu.classList.contains("open"))});sc.addEventListener("click",function(){drawer(false)});document.addEventListener("keydown",function(e){if(e.key==="Escape")drawer(false)})}
})();`;

export const deskV4Shell = () => pageHtml({});
export async function renderDeskV4(req) { return pageHtml(await deskModel(req)); }
