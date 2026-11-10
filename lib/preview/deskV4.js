// DESK V4, THE ANALYST WORKSPACE (Lane E, Nov 10 2026), built to docs/desk-mockups/desk-v4.html. Crew-only preview at /preview/desk and /preview/desk/case/:id; it replaces the tabbed V3 workspace there (the old Valuations preview stays at /preview/desk-valuations).
// This page computes nothing: every figure and sentence below is a field the server sent (Lane D's case view through lib/preview/deskV3.js deskModel, Lane B's desk.* fields) or a fixed interface label. A field that is absent is not drawn.
// STAGE 1 here: the shell and layout. Top bar (GoAskSam Desk, the org, two tabs, saved state, handling clock); three zones (case queue 232px, the centre column that scrolls, the Reserve panel 372px, sticky, the only element with a shadow); no Vehicle, Market evidence or Decision tabs;
// under 1100px the Reserve panel moves to the top and the queue becomes a drawer. The centre column's cards and the Reserve panel's parts are filled by stages 2 and 3 into the slots below.
import { PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { deskModel, GROUPS, SRC_LABEL, V3_BASE, V3_CASE } from "./deskV3.js";
import { deskV4Client, deskV4New } from "./deskV4Client.js";
import { moneyWords, reasonLine } from "../reasonWords.js";
import { DOC_KINDS } from "../desk/caseModel.js";
import { readinessOf } from "../desk/caseWorkflow.js";
import { DESK_V4_CSS } from "./deskV4Css.js";
import { FONT_LINKS } from "../../api/_chrome.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = u => String(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));

// The queue: Lane D's four stage groups with the counts it sent, one row per case (its photo, car, seller, time in the queue), the search and the operations lines as sent.
export function queueHtml(cases, activeId, queue, handling) {
  const by = k => cases.filter(c => c.group === k);
  const row = c => `<a class="qi${c.id === activeId ? " on" : ""}" href="${V3_CASE}${esc(c.id)}" data-case="${esc(c.id)}" data-search="${esc([c.car, c.seller, c.ref, c.status].filter(Boolean).join(" ").toLowerCase())}"${c.id === activeId ? ' aria-current="page"' : ""}>`
    + `<div class="ph"${c.photo ? ` style="background-image:url('${esc(urlOf(c.photo))}')"` : ""}></div><div><b>${esc(c.car)}</b>${c.group === "new" && c.forwarded ? `<em class="tag" data-forwarded="1">Forwarded lead</em>` : ""}<span><i style="font-style:normal">${esc(c.seller || "")}</i><i style="font-style:normal">${esc(c.age)}</i></span></div></a>`;
  const groups = GROUPS.map(g => `<div class="qg"><span>${esc(g.label)}</span>${queue && queue[g.key] != null ? `<span>${esc(queue[g.key])}</span>` : ""}</div>${by(g.key).map(row).join("")}`).join("");
  const lines = handling && Array.isArray(handling.lines) ? handling.lines.filter(l => l && l.label && l.value != null) : [];
  return `<aside class="card queue" id="queue" aria-label="Cases"><button type="button" class="btn pri new" id="newcase-btn">New case</button><input type="search" id="qs" placeholder="Search cases" aria-label="Search cases" autocomplete="off">${groups}<p class="qnone" id="qnone" hidden>No case matches.</p>`
    + `${lines.length ? `<div class="ops" id="ops">${lines.map(l => `<div><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join("")}</div>` : ""}</aside>`;
}

// The top bar. The handling clock is the server's line for this analyst on this case (case.handling.clock, Lane D); with no such field the clock is not drawn.
export function topHtml(clock) {
  return `<header class="top" id="top"><button type="button" class="qopen" id="qopen" aria-controls="queue" aria-expanded="false">Cases</button><span class="brand">GoAskSam Desk<span class="org">${esc(PREVIEW_ORG.name)}</span></span>`
    + `<nav aria-label="Views"><button type="button" class="on" id="n-desk" data-view="desk">Analyst workspace</button><button type="button" id="n-report" data-view="report">Seller report</button></nav>`
    + `<span class="r"><span id="saved" role="status" aria-live="polite">Saved</span>${clock ? `<span class="num" id="clockw"><b id="clock">${esc(clock)}</b></span>` : ""}</span></header>`;
}

// The New case form, in the design's card, field and button styles. Labels are interface words; nothing here is a figure.
const ncField = (id, label, ph = "") => `<div class="fld"><label for="${id}"><span>${esc(label)}</span></label><input id="${id}" class="txt" type="text" autocomplete="off" placeholder="${esc(ph)}"></div>`;
export const newCaseV4Html = () => `<section class="card pad" id="newcase" aria-label="New case" hidden><div class="sec-h"><h3>New case</h3><div class="act">A VIN, or the year, make and model. Everything else is optional.</div></div>`
  + `<div class="ncgrid">${ncField("nc-vin", "VIN")}${ncField("nc-year", "Year")}${ncField("nc-make", "Make")}${ncField("nc-model", "Model")}${ncField("nc-mileage", "Mileage")}${ncField("nc-trans", "Transmission")}${ncField("nc-body", "Body")}${ncField("nc-colour", "Colour")}${ncField("nc-seller", "Seller name")}${ncField("nc-asking", "Asking price")}</div>`
  + `<div class="fld"><label for="nc-notes"><span>Seller notes</span></label><textarea id="nc-notes" rows="3"></textarea></div><div class="fld"><label for="nc-photos"><span>Photos</span></label><input id="nc-photos" type="file" accept="image/*" multiple></div>`
  + `<div class="ncbar"><button type="button" class="btn pri" id="nc-go">Create case</button><button type="button" class="btn" id="nc-x">Cancel</button><span class="mute" id="nc-msg" role="status"></span></div></section>`;

// The centre column's cards. Each is an empty container that lib/preview/deskV4Client.js fills from the case the server sent; the headings and labels are interface words, no figure or sentence is typed here.
const card = (id, inner, cls = "card pad") => `<div class="${cls}" id="${id}">${inner}</div>`;
const secH = (h, act = "") => `<div class="sec-h"><h3>${esc(h)}</h3>${act ? `<div class="act">${act}</div>` : ""}</div>`;
export const CENTRE_CARDS = () => [
  `<div class="casehead" id="s-head"></div><p class="msg" id="v4msg" role="alert" hidden></p>`,
  card("s-car", ""),
  card("s-docs", secH("Documents", `<span id="dcount"></span><span id="dockindbox"></span>`) + `<div class="docs" id="docs"></div>`),
  card("s-market", secH("What the market paid", `<span class="seg" id="period" role="group" aria-label="Period"></span>`) + `<div class="mk-sum" id="mk-sum"></div><p class="mute" id="mkins" hidden></p><svg id="plot" height="170" role="img" aria-label="Every completed sale as a dot on a price axis, with the typical range, the median, the asking price and the reserve"></svg>`
    + `<div class="legend"><span><i style="background:var(--ev-dot)"></i>One completed sale</span><span><i style="background:var(--ev-soft);border-radius:2px;width:14px"></i>Typical range</span><span><i style="background:var(--ev);width:3px;border-radius:1px;height:11px"></i>Median</span><span><i style="background:var(--an);width:3px;border-radius:1px;height:11px"></i>Reserve, drag to move</span><span><i style="background:none;border-left:2px dashed var(--faint);width:0;border-radius:0;height:11px"></i>Asking</span></div><p class="rungline" id="rungline"></p><p class="mute" style="font-size:12px;margin-top:2px" id="mknote"></p>`),
  card("s-closest", secH("Closest sales", `<span>Each opens its listing</span><span>·</span><span id="ccount"></span><span>·</span><button type="button" class="link" id="showall" hidden></button>`) + `<div id="comps"></div>`),
  card("s-steps", secH("Next steps for the seller", "Printed in the report. Edit, remove or add.") + `<div class="steps" id="steps"></div><div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm" id="addstep">Add a step</button><span class="mute" style="font-size:12px" id="stepAuto"></span></div>`),
  card("s-live", secH("For sale now", "For the analyst only. Each opens its listing. Never in the report.") + `<div class="live" id="live"></div>`)
].join("");

// What the browser half is given: the case view as the server sent it, plus the words the server holds for it (title, stage, the seller's asking figure as worded by reasonWords). Nothing here is a made figure.
export function clientModel(model) {
  const { cases = [], activeId = null, kase = null } = model || {}, active = cases.find(c => c.id === activeId) || null; if (!active || !kase) return null;
  const ask = kase.seller && kase.seller.asking_price != null ? Number(kase.seller.asking_price) : null, stage = GROUPS.find(g => g.key === kase.stage);
  return { kase, title: (kase.desk && kase.desk.titleLine) || active.car, stageLabel: stage ? stage.label : null, stages: Object.fromEntries(GROUPS.map(g => [g.key, g.label])), forwarded: !!(cases.find(c => c.id === activeId) || {}).forwarded, receivedLine: kase.vehicle && kase.vehicle.submittedLine || null, readiness: readinessOf(kase), clock: kase.handling && kase.handling.clock || null, asking: Number.isFinite(ask) ? ask : null, askLine: Number.isFinite(ask) ? moneyWords(ask) : null,
    srcLabels: SRC_LABEL, windows: [[6, "6 months"], [12, "12 months"], [24, "24 months"]], docKinds: DOC_KINDS.map(k => [k, reasonLine("case.doc.kind." + k)]) };
}
const jsonIn = o => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

// The Reserve panel's parts, in the mockup's order. Labels are interface words; every figure and sentence is filled by lib/preview/deskV4Client.js from the case the server sent.
const PANEL_HTML = `<div class="hd"><span class="eyebrow">Recommended reserve</span><div class="numrow"><span>$</span><input id="valIn" class="num" inputmode="numeric" autocomplete="off" aria-label="Recommended reserve in dollars"></div>`
  + `<p class="diff" id="diff"></p><label class="hi" id="hiWarn" hidden><input type="checkbox" id="sellerReq"><span id="hiTxt">The sales do not support this figure. Tick if the seller asked for it; the report will say so.</span></label><div class="mkt" id="mkt"></div><p class="mute" style="font-size:12px;margin-top:8px" id="resStart"></p></div>`
  + `<div class="bd"><div class="fld"><label><span>Condition</span><span>Dot marks the suggestion</span></label><div class="seg full" id="cond" role="group" aria-label="Condition"></div></div>`
  + `<div class="fld"><label for="cnote"><span>Condition note</span><span>Optional, printed if filled</span></label><input id="cnote" class="txt" autocomplete="off" placeholder="For example: assessed from photographs, inspection advised"></div>`
  + `<div class="fld"><label for="why"><span>Why this figure</span><span>Edit freely. Printed.</span></label><textarea id="why"></textarea></div>`
  + `<div class="fld"><label><span>Needs attention</span><span id="attN"></span></label><div class="att" id="att"></div></div></div>`
  + `<div class="ft"><div class="row"><button type="button" class="btn" id="bPrev">Preview report</button><button type="button" class="btn pri" id="bFin" disabled>Finalize</button></div><div class="chk" id="chk"></div><small id="finHint"></small><div class="fin" id="finBox"></div><div class="send" id="sendBox" hidden><button type="button" class="btn" id="bSend">Send to seller</button><small id="sendHint" role="status"></small><p class="sentline" id="sentLine" hidden></p></div></div>`;
const SEND_DIALOG = `<div class="scrim2" id="sendScrim" hidden><div class="dlg" id="sendDlg" role="dialog" aria-modal="true" aria-labelledby="sendT"><h3 id="sendT">Send to seller</h3>`
  + `<div class="fld"><label><span>From</span></label><div class="ro" id="sendFrom"></div></div><div class="fld"><label for="sendTo"><span>To</span></label><input id="sendTo" class="txt" type="email" autocomplete="off"></div><div class="fld"><label><span>Subject</span></label><div class="ro" id="sendSubject"></div></div>`
  + `<div class="fld"><label><span>Message</span></label><div class="ro msg2" id="sendMsg"></div></div><div class="fld"><label><span>Attachment</span></label><div class="ro att2"><span id="sendAtt"></span><span class="mute">Version <b id="sendVer"></b></span></div></div>`
  + `<div class="fld" id="sendEarlierBox" hidden><label><span>Earlier sends</span></label><div id="sendEarlier"></div></div><p class="msg" id="sendErr" role="alert" hidden></p><div class="ncbar"><button type="button" class="btn pri" id="sendGo">Send</button><button type="button" class="btn" id="sendNo">Cancel</button></div></div></div>`;

export function pageHtml(model) {
  const { cases = [], activeId = null, queue = null, handling = null, kase = null } = model || {};
  const active = cases.find(c => c.id === activeId) || null, clock = kase && kase.handling && kase.handling.clock ? kase.handling.clock : null;
  const centre = `<div class="col" id="col">${newCaseV4Html()}${active ? CENTRE_CARDS() : `<div class="card pad"><p class="mute">Select a case from the list.</p></div>`}</div>`;
  const panel = `<aside class="card val" id="val" aria-label="Reserve"${active ? "" : " hidden"}>${active ? PANEL_HTML : `<div class="hd"><span class="eyebrow">Recommended reserve</span></div>`}</aside>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${active ? esc(active.car) + " | " : ""}GoAskSam Desk</title>${FONT_LINKS}<style>${DESK_V4_CSS}</style></head>`
    + `<body class="v4"><div class="wrap">${topHtml(clock)}<section class="view" id="v-desk"><div class="ws">${queueHtml(cases, activeId, queue, handling)}${centre}${panel}</div></section>`
    + `<section class="view" id="v-report" hidden><div class="rep" id="rep"></div></section></div><div class="qscrim" id="qscrim"></div>${active ? SEND_DIALOG : ""}`
    + `<script>window.__V4__=${jsonIn(clientModel(model))};window.__DESK_V3__={api:${JSON.stringify(API_PATH)},base:${JSON.stringify(V3_BASE)},active:${JSON.stringify(activeId)},seat:${JSON.stringify(PREVIEW_SEAT)}};${SHELL_JS}(${deskV4New})();(${deskV4Client})();</script></body></html>`;
}

// Shell behaviour only: the two views, the queue search, the queue drawer under 1100px. No figure is made here.
const SHELL_JS = `(function(){var $=function(i){return document.getElementById(i)};
function view(v,quiet){var d=v!=="report";$("v-desk").hidden=!d;$("v-report").hidden=d;$("n-desk").classList.toggle("on",d);$("n-report").classList.toggle("on",!d);try{history.replaceState(null,"",d?location.pathname+location.search:"#report")}catch(e){}if(!d&&!quiet&&window.__v4report)window.__v4report()}window.__v4view=view;
[].forEach.call(document.querySelectorAll(".top nav [data-view]"),function(b){b.addEventListener("click",function(){view(b.getAttribute("data-view"))})});if(location.hash==="#report")setTimeout(function(){view("report")},0);
var q=$("qs");if(q)q.addEventListener("input",function(){var t=q.value.toLowerCase().trim(),n=0;[].forEach.call(document.querySelectorAll(".queue .qi"),function(a){var h=t&&a.getAttribute("data-search").indexOf(t)<0;a.hidden=!!h;if(!h)n++});$("qnone").hidden=n>0||!t});
var qo=$("qopen"),qu=$("queue"),sc=$("qscrim");function drawer(on){qu.classList.toggle("open",on);sc.classList.toggle("on",on);qo.setAttribute("aria-expanded",on?"true":"false")}
if(qo){qo.addEventListener("click",function(){drawer(!qu.classList.contains("open"))});sc.addEventListener("click",function(){drawer(false)});document.addEventListener("keydown",function(e){if(e.key==="Escape")drawer(false)})}
})();`;

export const deskV4Shell = () => pageHtml({});
export async function renderDeskV4(req) { return pageHtml(await deskModel(req)); }
