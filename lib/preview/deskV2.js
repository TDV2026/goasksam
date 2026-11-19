// DESK V2, THE REDESIGNED SCREEN (Lane S, Nov 15 2026) at /preview/desk2 and /preview/desk2/case/:id, beside /preview/desk, which stays as it is until Sam switches.
// Same model and same actions as /preview/desk (lib/preview/deskV3.js deskModel, the preview door at /preview/desk/api). This page computes nothing: every figure and sentence is a field the server sent or a fixed interface label.
// A field that is absent is not drawn. STAGE 1: the shell and the queue.
// STUBS UNTIL LANE D MERGES (named in the READY line): the eight statuses, the card fields (statusKey, statusLabel, analyst, elapsedLine, needsAttention, thumb) and the claim action (case_claim). Each is read from the server's field when it is sent; the stub below
// answers only when it is not, from the stage and the owner the model already carries, on the server (never in the browser).
import { PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { deskModel, SRC_LABEL } from "./deskV3.js";
import { newCaseV4Html } from "./deskV4.js";
import { deskV4New } from "./deskV4Client.js";
import { DESK_V2_CSS } from "./deskV2Css.js";
import { DESK_V2_JS } from "./deskV2Client.js";
import { readinessOf } from "../desk/caseWorkflow.js";
import { moneyWords, reasonLine } from "../reasonWords.js";
import { DOC_KINDS } from "../desk/caseModel.js";
import { FONT_LINKS } from "../../api/_chrome.js";

export const V2_BASE = "/preview/desk2", V2_CASE = "/preview/desk2/case/";
export const STATUSES = [["new", "New enquiries"], ["assigned", "Assigned to me"], ["in_review", "In review"], ["waiting", "Waiting for information"], ["ready", "Ready to send"], ["sent", "Report sent"], ["converted", "Converted to listing"], ["closed", "Closed"]];
const LABEL = Object.fromEntries(STATUSES);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = u => String(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));
// the 16px line icons of the status rows, drawn as strokes in the muted grey (inbox, person, clock, info circle, paper plane, check, tag, archive)
const ICONS = { new: '<path d="M2 9l2-5h8l2 5v4H2z"/><path d="M2 9h3.5l1 1.5h3L11 9H14"/>', assigned: '<circle cx="8" cy="5.5" r="2.6"/><path d="M2.8 14c.4-3 2.5-4.6 5.2-4.6s4.8 1.6 5.2 4.6"/>', in_review: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/>', waiting: '<circle cx="8" cy="8" r="6"/><path d="M8 7.2V11"/><circle cx="8" cy="5" r=".4"/>', ready: '<path d="M14 2L7 9"/><path d="M14 2l-4.5 12-2.5-5.5L1.5 6z"/>', sent: '<path d="M2.5 8.5l3.6 3.6L13.5 4.5"/>', converted: '<path d="M2 8.5V3h5.5L14 9.5 9.5 14z"/><circle cx="5" cy="5.8" r=".5"/>', closed: '<rect x="2" y="3" width="12" height="3" rx=".6"/><path d="M3 6v7h10V6"/><path d="M6.5 9h3"/>' };
const iconOf = k => `<svg class="ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICONS[k] || ""}</svg>`;
export const initialsOf = n => String(n || "").split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join("").slice(0, 2);

// THE STUB: the server's statusKey when it sent one; otherwise the stage the model already holds. An unowned new lead is a new enquiry, an owned one is assigned.
const STAGE_STATUS = { review: "in_review", ready: "ready", final: "ready", sent: "sent" };
export function statusOf(c) {
  if (c.statusKey && LABEL[c.statusKey]) return c.statusKey;
  if (c.group === "new") return c.mine ? "assigned" : "new";
  return STAGE_STATUS[c.group] || "in_review";
}
// The card the queue prints. Every field is the server's; a missing one is null and the card leaves it out.
export function cardOf(c) {
  const key = statusOf(c);
  return { id: c.id, title: c.title || c.car || null, seller: c.seller || null, thumb: c.thumb || c.photo || null, elapsedLine: c.elapsedLine || (c.age ? c.age : null), statusKey: key, statusLabel: c.statusLabel || LABEL[key], analyst: c.analyst !== undefined ? c.analyst : (c.mine ? PREVIEW_SEAT : null), needsAttention: Number(c.needsAttention) || 0, forwarded: !!c.forwarded };
}
export function model2(m) {
  const cards = (m.cases || []).filter(c => !c.archived).map(cardOf), counts = Object.fromEntries(STATUSES.map(([k]) => [k, 0]));
  const sv = m.queue && m.queue.statuses;   // Lane D's counts, when sent
  cards.forEach(c => { counts[c.statusKey] += 1; });
  if (sv) STATUSES.forEach(([k]) => { if (sv[k] != null) counts[k] = sv[k]; });
  const active = (m.cases || []).find(c => c.id === m.activeId) || null, activeCard = active ? cardOf(active) : null;
  return { kase: m.kase || null, cards, counts, activeId: m.activeId || null, active: activeCard, filter: activeCard ? activeCard.statusKey : (counts.assigned > 0 ? "assigned" : (STATUSES.find(([k]) => counts[k] > 0) || STATUSES[0])[0]) };   // no case open: the analyst's own cases first, else the first status that has any
}

// The tile for a card with no cover photo, cut from the title the way the live desk does it (the year over the make's first letter, on a sage tile); no figure is made.
export const tileOf = t => { const m = String(t || "").trim().match(/^(\d{4})\s+([^\s\d])/); return m ? { year: m[1], initial: m[2].toUpperCase() } : { year: "", initial: String(t || "").trim().slice(0, 1).toUpperCase() }; };
// What the browser half is given for the open case: the case as the server sent it, plus the words the server holds for it. Nothing here is a made figure.
export function clientCase(m, m2) {
  const k = m2.kase, a = m2.active; if (!k || !a) return null;
  const row = (m.cases || []).find(c => c.id === (m.activeId || a.id)) || {};
  const ask = k.seller && k.seller.asking_price != null ? Number(k.seller.asking_price) : null, items = (k.photos && k.photos.items) || [];
  return { kase: k, title: (k.desk && k.desk.titleLine) || a.title, seller: a.seller || (k.seller && k.seller.name) || null, analyst: a.analyst, statusLabel: a.statusLabel, statusKey: a.statusKey, receivedLine: (k.header && k.header.receivedLine) || (k.vehicle && k.vehicle.submittedLine) || null, sellerName: (k.header && k.header.sellerName) || null, photoCount: items.length, activeSeconds: (() => { const v = Number(k.lifecycle && k.lifecycle.activeSeconds != null ? k.lifecycle.activeSeconds : k.activeSeconds); return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0; })(),
    readiness: readinessOf(k), askLine: Number.isFinite(ask) && ask > 0 ? moneyWords(ask) : null, photoMore: Math.max(0, items.length - 5), forwarded: !!row.forwarded, archived: !!(row.archived || k.archived), rereadWord: reasonLine("case.reread.button"), tags: TAGS, docKinds: DOC_KINDS.map(k => [k, reasonLine("case.doc.kind." + k)]) };
}
export const TAGS = { verified: "Verified", seller: "Seller supplied", needs: "Needs confirmation" };
const thumbHtml = c => { const t = tileOf(c.title); return `<span class="th${c.thumb ? "" : " none"}"${c.thumb ? ` style="background-image:url('${esc(urlOf(c.thumb))}')"` : ""}>${c.thumb ? "" : (t.year ? `<i>${esc(t.year)}</i>` : "") + `<b>${esc(t.initial)}</b>`}</span>`; };
// One card: 72px, a 48px thumb with the attention badge on its corner, the title on one line, the seller, a dot and the elapsed line, a status pill only when the card's status is not the chosen filter, Claim at the right.
export function cardHtml(c, activeId, filter) {
  return `<div class="cd${c.id === activeId ? " on" : ""}" data-case="${esc(c.id)}" data-status="${esc(c.statusKey)}"><a class="cd-a" href="${V2_CASE}${esc(c.id)}">${thumbHtml(c)}<span class="cd-b"><span class="cd-t">${esc(c.title || "")}</span>`
    + `<span class="cd-m">${c.seller ? `<span class="cd-s">${esc(c.seller)}</span>` : ""}${c.seller && c.elapsedLine ? `<i class="dot">&middot;</i>` : ""}${c.elapsedLine ? `<span class="cd-e">${esc(c.elapsedLine)}</span>` : ""}${c.analyst ? `<i class="dot">&middot;</i><span class="cd-an">${esc(c.analyst)}</span>` : ""}<span class="pill" data-st="${esc(c.statusKey)}"${c.statusKey === filter ? " hidden" : ""}>${esc(c.statusLabel)}</span></span></span></a>`
    + `${c.needsAttention > 0 ? `<span class="att" title="Needs attention" aria-label="Needs attention">${esc(c.needsAttention)}</span>` : ""}${!c.analyst ? `<button type="button" class="claim" data-claim="${esc(c.id)}">Claim</button>` : ""}</div>`;
}
export function railHtml(m2) {
  const filters = STATUSES.map(([k, l]) => `<button type="button" class="fl${k === m2.filter ? " on" : ""}" data-f="${k}" aria-pressed="${k === m2.filter}">${iconOf(k)}<span>${esc(l)}</span><b data-count="${k}">${esc(m2.counts[k])}</b></button>`).join("");
  return `<aside class="rail" id="rail" aria-label="Cases"><button type="button" class="btn pri" id="newcase-btn" data-act="new">New case</button><input type="search" id="qs" placeholder="Search cases" aria-label="Search cases" autocomplete="off">`
    + `<div class="fls" id="fls" role="group" aria-label="Show">${filters}</div><div class="clab" id="clab"><span>Cases</span><b id="clabn">${esc(m2.counts[m2.filter])}</b></div><div class="sortr" id="sortr"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 3v10M2 11l2 2 2-2M12 13V3M10 5l2-2 2 2"/></svg><span>Sort: Newest first</span></div><div class="cards" id="cards">${m2.cards.map(c => cardHtml(c, m2.activeId, m2.filter)).join("")}</div><p class="none" id="none" hidden>No case here.</p><button type="button" class="link" id="viewallc">View all cases</button></aside>`;
}
// the seat: the analyst's name when the model serves seat.displayName, the initials otherwise
export const topHtml = (seat, orgName) => { const nm = seat && seat.displayName ? String(seat.displayName) : "", ini = seat && seat.initials ? String(seat.initials) : initialsOf(nm || PREVIEW_SEAT);
  const who = `<span class="whow"><button type="button" class="who" id="who" aria-haspopup="true" aria-expanded="false" title="${esc(nm || PREVIEW_SEAT)}"><span class="wi" id="whoini">${esc(ini)}</span><svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg></button><div class="wmenu" id="wmenu" hidden><span class="wn" id="whoname">${esc(nm || PREVIEW_SEAT)}</span><button type="button" class="link" id="whorename">Change name</button></div></span>`;
  return `<header class="top" id="top"><span class="brand">GoAskSam Desk</span><span class="org" id="org">${esc(orgName || PREVIEW_ORG.name)}</span><span class="tr">${who}</span></header>`; };

// THE THREE STEP BAND (Sam, Nov 15 2026): navigation, not stages. Three chevron segments; the one whose section is in view is dark green; a click scrolls to its section; nothing is locked or gated. The words are fixed labels.
export const STEP_DEFS = [["enquiry", "Enquiry", "Vehicle details, photos and history", "s-vehicle"], ["evidence", "Evidence", "Market data and closest sales", "s-market"], ["proposal", "Proposal", "Reserve strategy and seller report", "rres"]];
const STEPS = `<nav class="steps" id="steps" aria-label="Case sections">${STEP_DEFS.map((d, i) => `<button type="button" class="st${i === 0 ? " on" : ""}" data-step="${d[0]}" data-target="${d[3]}"${i === 0 ? ' aria-current="step"' : ""}><b>${d[1]}</b><span>${d[2]}</span></button>`).join("")}</nav>`;
export function pageHtml(m) {
  const m2 = model2(m || {}), a = m2.active;
  const centre = `<main class="col" id="col">${a ? `<div id="s-head"></div>${STEPS}<p class="msg" id="msg" role="alert" hidden></p><section class="card" id="s-vehicle" aria-label="Vehicle"></section><section class="card" id="s-words" aria-label="Seller's words" hidden></section><div class="three" id="s-three"></div><section class="card" id="s-market" aria-label="Market"></section><section class="card" id="s-closest" aria-label="Closest sales"></section>` : `<p class="choose" id="choose">Choose a case</p>`}</main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${a ? esc(a.title) + " | " : ""}GoAskSam Desk</title>${FONT_LINKS}<style>${DESK_V2_CSS}</style></head>`
    + `<body class="d2">${topHtml(m && m.seat, m && m.org && m.org.name)}<div class="ncover" id="ncover" role="presentation"><div class="ncsheet">${newCaseV4Html()}</div></div><div class="ws${a ? " has-case" : ""}">${railHtml(m2)}${centre}${a ? `<aside class="val" id="val" aria-label="Recommendation"></aside>` : ""}</div>`
    + `<script>window.__D2__=${JSON.stringify({ case: clientCase(m, m2), api: API_PATH, org: (m && m.org && m.org.id) || null, seat: (m && m.seat) ? { displayName: m.seat.displayName || null, initials: m.seat.initials || null } : null, base: V2_BASE, caseBase: V2_CASE, active: m2.activeId, filter: m2.filter, statuses: STATUSES }).replace(/</g, "\\u003c")};${DESK_V2_JS}window.__DESK_V3__={api:${JSON.stringify(API_PATH)},srcLabels:${JSON.stringify(SRC_LABEL)},base:${JSON.stringify(V2_BASE)},active:${JSON.stringify(m2.activeId)},seat:${JSON.stringify(PREVIEW_SEAT)}};(${deskV4New})();</script></body></html>`;
}
export const deskV2Shell = () => pageHtml({});
// The seat comes from the door's own case_list answer (seat.displayName), never made here.
export async function renderDeskV2(req) { const m = await deskModel(req); try { const { previewDeskApi } = await import("./deskPreview.js"), r = await previewDeskApi({ action: "case_list", org: m.org && m.org.id }); if (r && r.seat) m.seat = r.seat; } catch {} return pageHtml(m); }
