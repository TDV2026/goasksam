// DESK V2, THE REDESIGNED SCREEN (Lane S, Nov 15 2026) at /preview/desk2 and /preview/desk2/case/:id, beside /preview/desk, which stays as it is until Sam switches.
// Same model and same actions as /preview/desk (lib/preview/deskV3.js deskModel, the preview door at /preview/desk/api). This page computes nothing: every figure and sentence is a field the server sent or a fixed interface label.
// A field that is absent is not drawn. STAGE 1: the shell and the queue.
// STUBS UNTIL LANE D MERGES (named in the READY line): the eight statuses, the card fields (statusKey, statusLabel, analyst, elapsedLine, needsAttention, thumb) and the claim action (case_claim). Each is read from the server's field when it is sent; the stub below
// answers only when it is not, from the stage and the owner the model already carries, on the server (never in the browser).
import { PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { deskModel } from "./deskV3.js";
import { DESK_V2_CSS } from "./deskV2Css.js";
import { DESK_V2_JS } from "./deskV2Client.js";
import { FONT_LINKS } from "../../api/_chrome.js";

export const V2_BASE = "/preview/desk2", V2_CASE = "/preview/desk2/case/";
export const STATUSES = [["new_enquiries", "New enquiries"], ["assigned_to_me", "Assigned to me"], ["in_review", "In review"], ["waiting_info", "Waiting for information"], ["ready_to_send", "Ready to send"], ["report_sent", "Report sent"], ["converted", "Converted to listing"], ["closed", "Closed"]];
const LABEL = Object.fromEntries(STATUSES);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const urlOf = u => String(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));
export const initialsOf = n => String(n || "").split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join("").slice(0, 2);

// THE STUB: the server's statusKey when it sent one; otherwise the stage the model already holds. An unowned new lead is a new enquiry, an owned one is assigned.
const STAGE_STATUS = { review: "in_review", ready: "ready_to_send", final: "ready_to_send", sent: "report_sent" };
export function statusOf(c) {
  if (c.statusKey && LABEL[c.statusKey]) return c.statusKey;
  if (c.group === "new") return c.mine ? "assigned_to_me" : "new_enquiries";
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
  return { cards, counts, activeId: m.activeId || null, active: activeCard, kase: m.kase || null, filter: activeCard ? activeCard.statusKey : "new_enquiries" };
}

const thumbHtml = c => `<span class="th${c.thumb ? "" : " none"}"${c.thumb ? ` style="background-image:url('${esc(urlOf(c.thumb))}')"` : ""}></span>`;
export function cardHtml(c, activeId) {
  return `<div class="cd${c.id === activeId ? " on" : ""}" data-case="${esc(c.id)}" data-status="${esc(c.statusKey)}"><a class="cd-a" href="${V2_CASE}${esc(c.id)}">${thumbHtml(c)}<span class="cd-b"><span class="cd-t">${esc(c.title || "")}</span>`
    + (c.seller ? `<span class="cd-s">${esc(c.seller)}</span>` : "") + `<span class="cd-m">${c.elapsedLine ? `<span class="cd-e">${esc(c.elapsedLine)}</span>` : ""}<span class="pill" data-st="${esc(c.statusKey)}">${esc(c.statusLabel)}</span>${c.analyst ? `<span class="cd-an">${esc(c.analyst)}</span>` : ""}</span></span>`
    + `${c.needsAttention > 0 ? `<span class="att" title="Needs attention" aria-label="Needs attention">${esc(c.needsAttention)}</span>` : ""}</a>`
    + `${!c.analyst ? `<button type="button" class="claim" data-claim="${esc(c.id)}">Claim</button>` : ""}</div>`;
}
export function railHtml(m2) {
  const filters = STATUSES.map(([k, l]) => `<button type="button" class="fl${k === m2.filter ? " on" : ""}" data-f="${k}" aria-pressed="${k === m2.filter}"><span>${esc(l)}</span><b data-count="${k}">${esc(m2.counts[k])}</b></button>`).join("");
  return `<aside class="rail" id="rail" aria-label="Cases"><button type="button" class="btn pri" id="newcase" data-act="new">New case</button><input type="search" id="qs" placeholder="Search cases" aria-label="Search cases" autocomplete="off">`
    + `<div class="fls" id="fls" role="group" aria-label="Show">${filters}</div><div class="cards" id="cards">${m2.cards.map(c => cardHtml(c, m2.activeId)).join("")}</div><p class="none" id="none" hidden>No case here.</p></aside>`;
}
export const topHtml = () => `<header class="top" id="top"><span class="brand">GoAskSam Desk</span><span class="org" id="org">${esc(PREVIEW_ORG.name)}</span><span class="grow"></span><span class="who" id="who" title="${esc(PREVIEW_SEAT)}">${esc(initialsOf(PREVIEW_SEAT))}</span></header>`;

export function pageHtml(m) {
  const m2 = model2(m || {}), a = m2.active;
  const centre = `<main class="col" id="col">${a ? `<h1 class="ct" id="ct">${esc(a.title || "")}</h1>` : ""}</main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${a ? esc(a.title) + " | " : ""}GoAskSam Desk</title>${FONT_LINKS}<style>${DESK_V2_CSS}</style></head>`
    + `<body class="d2">${topHtml()}<div class="ws">${railHtml(m2)}${centre}</div>`
    + `<script>window.__D2__=${JSON.stringify({ api: API_PATH, base: V2_BASE, caseBase: V2_CASE, active: m2.activeId, filter: m2.filter, statuses: STATUSES }).replace(/</g, "\\u003c")};${DESK_V2_JS}</script></body></html>`;
}
export const deskV2Shell = () => pageHtml({});
export async function renderDeskV2(req) { return pageHtml(await deskModel(req)); }
