// DESK V3, THE ANALYST WORKSPACE (Lane E, Nov 8 2026). Crew-only preview at /preview/desk and /preview/desk/case/:id. Enterprise and restrained: no gradients, two meaning colours
// (evidence green for anything from completed sales, copper for anything the analyst decided). Rule: this page computes nothing. Every figure and sentence below is a field the server
// sent (the sheet store through summaryOf, the case's own submission, Lane D's handling lines); a field that is absent is not drawn.
// STAGE 1 here: the shell (case rail, operations block, compact case header). Later stages add the summary, the sticky bar and the tabs into the same module.
import { previewStore, PREVIEW_ORG, PREVIEW_SEAT, API_PATH } from "./deskPreview.js";
import { summaryOf } from "../desk/sheetStore.js";
import { DESK_V3_CSS } from "./deskV3Css.js";

export const V3_BASE = "/preview/desk", V3_CASE = "/preview/desk/case/";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The four rail groups. A case sits in the group its stage names; Lane D's case.stage ("new" | "review" | "ready" | "final") wins when it sends one, else the sheet status decides.
export const GROUPS = [{ key: "new", label: "New leads" }, { key: "review", label: "In review" }, { key: "ready", label: "Ready for report" }, { key: "final", label: "Finalized" }];
const STATUS_GROUP = { "New": "new", "In progress": "review", "Needs the car": "review", "Finalised": "final", "Sent": "final" };
export const groupOf = s => (s.case && GROUPS.some(g => g.key === s.case.stage) ? s.case.stage : STATUS_GROUP[s.status] || "review");

// One case as the shell prints it: the sheet's own fields, in the words the sheet sent.
export function caseOf(sheet, now = Date.now()) {
  const sm = summaryOf(sheet, now), sub = sheet.submission || {}, photos = sub.photos || [], cover = photos.find(p => p.id === (sheet.state && sheet.state.heroId)) || photos[0] || null;
  return { id: sheet.id, car: sm.car, spec: [sub.mileage ? Number(sub.mileage).toLocaleString("en-US") + " miles" : null, sheet.vin].filter(Boolean).join(" · "), seller: (sub.consignor && sub.consignor.name) || null, ref: sheet.id,
    age: sm.timeIn, submitted: sm.date, status: sheet.status, group: groupOf(sheet), photo: cover ? cover.url : null, demo: !!sheet.demo, handling: sheet.handling || null };
}

export function railHtml(cases, activeId) {
  const by = k => cases.filter(c => c.group === k);
  const row = c => `<a class="cs${c.id === activeId ? " on" : ""}" href="${V3_CASE}${esc(c.id)}" data-case="${esc(c.id)}" data-search="${esc([c.car, c.seller, c.ref, c.status].filter(Boolean).join(" ").toLowerCase())}"${c.id === activeId ? ' aria-current="page"' : ""}>`
    + `<span class="cs-car">${esc(c.car)}</span><span class="cs-sub">${c.seller ? esc(c.seller) : ""}</span><span class="cs-meta"><span class="cs-age">${esc(c.age)}</span><span class="cs-st">${esc(c.status)}</span></span></a>`;
  const groups = GROUPS.map(g => { const rows = by(g.key); return `<section class="grp" data-group="${g.key}"><h2 class="grp-h">${esc(g.label)}</h2>${rows.map(row).join("")}</section>`; }).join("");
  return `<nav class="rail" id="rail" aria-label="Cases"><div class="rail-s"><input id="railq" type="search" placeholder="Search cases" aria-label="Search cases" autocomplete="off"></div><div class="rail-list" id="raillist">${groups}<p class="rail-none" id="railnone" hidden>No case matches.</p></div>`
    + `${opsHtml(cases)}</nav>`;
}

// The operations block: Lane D's handling lines, printed as sent ({label, value}); no lines, no block.
export function opsHtml(cases) {
  const lines = []; for (const c of cases) if (c.handling && Array.isArray(c.handling.lines)) { for (const l of c.handling.lines) if (l && l.label && l.value != null && !lines.some(x => x.label === l.label)) lines.push(l); }
  if (!lines.length) return "";
  return `<div class="ops" id="ops"><h2 class="ops-h">Operations</h2>${lines.map(l => `<div class="ops-r"><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join("")}</div>`;
}

export function headerHtml(c) {
  if (!c) return `<header class="chd chd-empty" id="chd"><p>Select a case from the list.</p></header>`;
  return `${c.demo ? `<div class="demo" role="note">Demonstration case</div>` : ""}<header class="chd" id="chd" data-case="${esc(c.id)}">`
    + `<div class="chd-ph">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : ""}</div>`
    + `<div class="chd-car"><h1>${esc(c.car)}</h1>${c.spec ? `<p class="chd-spec">${esc(c.spec)}</p>` : ""}</div>`
    + `<dl class="chd-f">${c.seller ? `<div><dt>Seller</dt><dd>${esc(c.seller)}</dd></div>` : ""}<div><dt>Lead ref</dt><dd>${esc(c.ref)}</dd></div><div><dt>Submitted</dt><dd>${esc(c.submitted)}</dd></div><div><dt>Status</dt><dd class="chd-st">${esc(c.status)}</dd></div></dl></header>`;
}

export function pageHtml(cases, activeId) {
  const active = cases.find(c => c.id === activeId) || null;
  const bar = `<header class="bar" id="bar"><div class="bar-l"><span class="bar-m">GoAskSam Desk</span><span class="bar-o">${esc(PREVIEW_ORG.name)}</span></div><div class="bar-r"><span class="bar-seat">${esc(PREVIEW_SEAT)}</span></div></header>`;
  const main = `<main class="work" id="work">${headerHtml(active)}<div class="body" id="body"></div></main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${active ? esc(active.car) + " | " : ""}GoAskSam Desk</title><style>${DESK_V3_CSS}</style></head>`
    + `<body class="v3">${bar}<div class="shell">${railHtml(cases, activeId)}${main}</div><script>window.__DESK_V3__={api:${JSON.stringify(API_PATH)},base:${JSON.stringify(V3_BASE)},active:${JSON.stringify(activeId || null)}};${RAIL_JS}</script></body></html>`;
}

// The rail's search only hides rows; it reads nothing and computes nothing.
const RAIL_JS = `(function(){var q=document.getElementById("railq");if(!q)return;q.addEventListener("input",function(){var t=q.value.toLowerCase().trim(),n=0;document.querySelectorAll(".cs").forEach(function(a){var h=t&&a.getAttribute("data-search").indexOf(t)<0;a.hidden=!!h;if(!h)n++;});document.getElementById("railnone").hidden=n>0;});})();`;

export async function renderDeskV3(req) {
  const store = await previewStore(), rows = await store.list(PREVIEW_ORG.id), now = Date.now();
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const cases = rows.map(s => caseOf(s, now)), id = String((req && req.query && req.query.case) || "");
  if (id && !cases.some(c => c.id === id)) throw new Error("no such case");   // the door answers the platform 404
  return pageHtml(cases, id || null);
}

// the page with no case read yet: the shell only (the copy check reads this one; the served page is renderDeskV3)
export const deskV3Shell = () => pageHtml([], null);
