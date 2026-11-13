// DESK V3, THE ANALYST WORKSPACE (Lane E, Nov 8 2026). Crew-only preview at /preview/desk and /preview/desk/case/:id. Enterprise and restrained: no gradients, two meaning colours
// (evidence green for anything from completed sales, copper for anything the analyst decided). Rule: this page computes nothing. Every figure and sentence below is a field the server
// sent (the sheet store through summaryOf, the case's own submission, Lane D's handling lines); a field that is absent is not drawn.
// STAGE 1 here: the shell (case rail, operations block, compact case header). Later stages add the summary, the sticky bar and the tabs into the same module.
import { previewStore, previewEnv, PREVIEW_ORG, PREVIEW_SEAT, API_PATH, aliasId } from "./deskPreview.js";
import { mintSheetUrls } from "../desk/storage.js";
import { summaryOf } from "../desk/sheetStore.js";
import { DESK_V3_CSS } from "./deskV3Css.js";
import { moneyWords } from "../reasonWords.js";
import { countNoun } from "../countNoun.js";
import { barHtml } from "./deskV3Bar.js";
import { DEMO_VIN, DEMO_MILES } from "../desk/demoCar.js";
import { demoCaseRecord, DEMO_PHOTOS, DEMO_ID as DID } from "./deskV3Fixture.js";
import { caseView, stageOf, live } from "../desk/caseView.js";
import { ensureCase } from "../desk/caseModel.js";
import { readinessOf } from "../desk/caseWorkflow.js";
import { TIER_LADDER } from "../conditionTier.js";
export const DEMO_ID = DID;

export const V3_BASE = "/preview/desk", V3_CASE = "/preview/desk/case/";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The four rail groups, in Lane D's stage names. The stage, the group counts (case.queue) and the operations lines (case.handling.lines) all come from the server (lib/desk/caseView.js); nothing is counted here.
export const GROUPS = [{ key: "new", label: "New leads" }, { key: "review", label: "In review" }, { key: "ready", label: "Ready for report" }, { key: "final", label: "Finalized" }, { key: "sent", label: "Sent" }];
export const SRC_LABEL = { seller: "Seller", vin_decoded: "VIN decoded", records: "Records", analyst_verified: "Analyst verified", missing: "Not confirmed", conflicting: "Not confirmed" };
export const FIELD_LABEL = { vin: "VIN", year: "Year", make: "Make", model: "Model", trim: "Trim", body: "Body", transmission: "Transmission", generation: "Generation", mileage: "Mileage", colour: "Colour", accident_history: "Accident history", service_history: "Service history" };

// One case as the shell prints it: the case view's own fields, in the words it sent.
export function caseOf(sheet, cv, now = Date.now()) {
  const sm = summaryOf(sheet, now), photos = (sheet.submission && sheet.submission.photos) || [], cover = photos.find(p => p.id === (cv.photos && cv.photos.coverId)) || photos[0] || null;
  return { id: sheet.id, car: sm.car, spec: [cv.vehicle && cv.vehicle.mileageLine, cv.fields.vin.value].filter(Boolean).join(" · ") || null, seller: cv.seller && cv.seller.name || null, ref: cv.lead_ref || sheet.id, age: sm.timeIn, submitted: cv.submitted_at ? String(cv.submitted_at).slice(0, 10) : sm.date, status: sheet.status, group: cv.stage, forwarded: cv.origin === "forwarded", mine: sheet.owner_seat === PREVIEW_SEAT, vin: cv.fields.vin.value || null, archived: sheet.archived === true || sheet.status === "Archived" || cv.stage === "archived", photo: cover ? cover.url : null, demo: sheet.id === DEMO_ID };
}

export function railHtml(cases, activeId, queue, handling) {
  const by = k => cases.filter(c => c.group === k);
  const row = c => `<a class="cs${c.id === activeId ? " on" : ""}" href="${V3_CASE}${esc(c.id)}" data-case="${esc(c.id)}" data-search="${esc([c.car, c.seller, c.ref, c.status].filter(Boolean).join(" ").toLowerCase())}"${c.id === activeId ? ' aria-current="page"' : ""}>`
    + `<span class="cs-car">${esc(c.car)}</span><span class="cs-sub">${c.seller ? esc(c.seller) : ""}</span><span class="cs-meta"><span class="cs-age">${esc(c.age)}</span><span class="cs-st">${esc(c.status)}</span></span></a>`;
  const groups = GROUPS.map(g => `<section class="grp" data-group="${g.key}"><h2 class="grp-h">${esc(g.label)}${queue && queue[g.key] != null ? `<span class="grp-n">${esc(queue[g.key])}</span>` : ""}</h2>${by(g.key).map(row).join("")}</section>`).join("");
  return `<nav class="rail" id="rail" aria-label="Cases"><button type="button" class="btn pri rail-new" id="newcase-btn">New case</button><div class="rail-s"><input id="railq" type="search" placeholder="Search cases" aria-label="Search cases" autocomplete="off"></div><div class="rail-list" id="raillist">${groups}<p class="rail-none" id="railnone" hidden>No case matches.</p></div>`
    + `${opsHtml(handling)}</nav>`;
}


// STAGE 7, A CASE FROM NOTHING: one compact form inside the workspace (not a wizard). Everything is optional except the car (a VIN, or a year, make and model). The script posts case_new, then each photo through case_edit photo_add, then opens the case.
export function newCaseHtml() {
  const f = (id, label, ph = "", cls = "") => `<label class="in ${cls}" for="${id}"><span>${esc(label)}</span><input id="${id}" type="text" autocomplete="off" placeholder="${esc(ph)}"></label>`;
  return `<section class="newcase" id="newcase" aria-label="New case" hidden><h2>New case</h2><p class="fg-s">Enter the car: a VIN, or the year, make and model. Everything else is optional.</p>`
    + `<div class="nc-grid">${f("nc-vin", "VIN")}${f("nc-year", "Year")}${f("nc-make", "Make")}${f("nc-model", "Model")}${f("nc-mileage", "Mileage")}${f("nc-trans", "Transmission")}${f("nc-body", "Body")}${f("nc-colour", "Colour")}${f("nc-seller", "Seller name")}${f("nc-asking", "Asking price")}</div>`
    + `<label class="in wide" for="nc-notes"><span>Seller notes</span><textarea id="nc-notes" rows="3"></textarea></label><label class="in wide" for="nc-photos"><span>Photos</span><input id="nc-photos" type="file" accept="image/*" multiple></label>`
    + `<div class="dbar"><button type="button" class="btn pri" id="nc-go">Create case</button><button type="button" class="btn" id="nc-x">Cancel</button><span class="fg-s" id="nc-msg" role="status"></span></div></section>`;
}

// The operations block: Lane D's handling lines, printed as sent ({label, value}); no lines, no block.
export function opsHtml(handling) {
  const lines = handling && Array.isArray(handling.lines) ? handling.lines.filter(l => l && l.label && l.value != null) : [];
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

// ---------- the summary, the sticky bar and the three tabs. Every figure is a field: desk.evidence (market reference), the case's assessment and reserve, market.meter built from the evidence ----------
const $ = v => moneyWords(v), rangeOf = (a, b) => `${$(a)} to ${$(b)}`, has = v => v != null && v !== "";
export const TABS = [{ key: "vehicle", label: "Vehicle" }, { key: "market", label: "Market evidence" }, { key: "decision", label: "Decision" }];
export function figuresOf(k) {
  const d = k && k.desk; if (!d || !d.evidence) return null;
  const ev = d.evidence, meter = ev.insufficient ? null : { low: ev.low, p25: ev.q1, median: ev.median, p75: ev.q3, high: ev.high };
  const a = k.assessment || {}, r = k.reserve || {};
  return { pos: k.reserve && k.reserve.positionLine || null, diff: k.assessment && k.assessment.differenceLine || null, ev, meter, a: has(a.figure) || (has(a.low) && has(a.high)) ? a : null, r: has(r.figure) ? r : null, open: (k.needs_review || []).filter(n => n.state === "open"), start: !has(a.figure) && !ev.insufficient && has(ev.median) && k.status !== "finalized" ? ev.median : null };
}
export function summaryHtml(sm) {
  if (!sm) return "";
  const ev = sm.ev, a = sm.a, val = a && has(a.figure) ? a.figure : null;
  // ONE FIGURE (Sam, Nov 9 2026): the Valuation, the analyst's number (it starts at the engine's median and is stored on the case as the assessment), with the market line under it. The reserve is not in the header.
  const big = `<button class="fig cu valblk" type="button" data-go="assess" id="figA"><span class="fg-k">Valuation</span>${val != null ? `<span class="fg-v cu" id="valBig">${$(val)}</span>` : `<span class="fg-s" id="valBig">Not set</span>`}</button>`;
  const line = ev.insufficient ? `<p class="mline" id="mline">${esc(ev.sentence)}</p>` : `<p class="mline" id="mline">Market: typical ${rangeOf(ev.q1, ev.q3)} · ${esc(countNoun(ev.count, "sale", { words: false }))} · evidence as of ${esc(ev.asOf)}${ev.stale && ev.stale.flag ? ` <span class="stale" data-stale="1">${esc(ev.stale.sentence || "Stale")}</span>` : ""}</p>`;
  const rv = sm.open.length ? `<div class="rvw" id="figV"><span class="fg-k">Needs review</span><ul class="fg-l">${sm.open.map(n => `<li>${esc(n.label)}</li>`).join("")}</ul></div>` : `<div class="rvw" id="figV"><span class="fg-k">Needs review</span><span class="fg-s">Nothing open</span></div>`;
  return `<section class="sum" id="sum" aria-label="Summary" data-start="${sm.start != null ? esc(sm.start) : ""}"><div class="sum-top"><div class="valcol">${big}${line}<span class="sav" id="sav" role="status"></span></div>${rv}</div>${sm.meter ? barHtml(sm.meter, { low: a ? a.low : null, high: a ? a.high : null, reserve: sm.r ? sm.r.figure : null, val }) : ""}</section>`;
}
export function stickyHtml(c, sm) {
  if (!c) return "";
  const ev = sm && sm.ev, a = sm && sm.a;
  const part = (k, v, cls, go) => v ? `<${go ? 'button type="button" data-go="' + go + '"' : "span"} class="sk ${cls || ""}"><i>${esc(k)}</i><b>${v}</b></${go ? "button" : "span"}>` : "";
  const asm = a && has(a.figure) ? $(a.figure) : "";
  return `<div class="stk" id="stk" hidden><span class="sk-car">${esc(c.car)}</span>${part("Valuation", asm || "Not set", "cu", "assess")}${ev && !ev.insufficient ? `<span class="sk mkt"><i>Market</i><b>${rangeOf(ev.q1, ev.q3)}</b></span>` : ""}${sm && sm.open.length ? `<span class="sk"><i>Review</i><b>${esc(sm.open[0].label)}</b></span>` : ""}`
    + `<span class="sk-tabs" id="stkTabs">${TABS.map(t => `<button type="button" data-tab="${t.key}">${esc(t.label)}</button>`).join("")}</span></div>`;
}

// ---------- stage 3: the Vehicle tab. Facts as received with the source of each, inline edit (case_edit field), the photos, Needs review with its resolve actions, the documents ----------
export const NEED_ACTIONS = { mileage_unconfirmed: [{ act: "verify", field: "mileage", label: "Mark verified" }], accident_unclear: [{ act: "verify", field: "accident_history", label: "Mark verified" }], service_documents: [{ act: "doc", label: "Invoices received" }] };
export function vehicleHtml(k, sheet) {
  if (!k) return "";
  const rows = Object.keys(FIELD_LABEL).map(key => { const f = k.fields[key], v = key === "mileage" && f.value != null && k.vehicle && k.vehicle.mileageLine ? k.vehicle.mileageLine : f.value, src = SRC_LABEL[f.source] || "Not confirmed";
    return `<tr data-field="${key}"><th scope="row">${esc(FIELD_LABEL[key])}</th><td class="v" data-v>${v == null ? '<span class="nc">Not provided</span>' : esc(v)}${f.source === "conflicting" ? `<span class="cand">${f.candidates.map(c => esc(c.value) + " (" + esc(SRC_LABEL[c.source] || c.source) + ")").join(", ")}</span>` : ""}</td><td class="src"><span class="chip${f.verified ? " ok" : ""}">${esc(SRC_LABEL[f.source] || "Not confirmed")}</span></td><td class="act"><button type="button" class="lnk" data-edit="${key}">Edit</button></td></tr>`; }).join("");
  const urls = Object.fromEntries(((sheet && sheet.submission && sheet.submission.photos) || []).map(p => [p.id, p.url])), rep = new Set(k.photos.reportIds || []);
  const photos = k.photos.items.map(p => { const cover = k.photos.coverId === p.id;
    return `<figure class="ph${cover ? " cover" : ""}" data-photo="${esc(p.id)}">${urls[p.id] ? `<button type="button" class="ph-i" data-zoom="${esc(urls[p.id])}"><img src="${esc(urls[p.id])}" alt="${esc(p.name)}"></button>` : `<div class="ph-i" aria-label="${esc(p.name)}"></div>`}<figcaption><label><input type="checkbox" data-report="${esc(p.id)}"${rep.has(p.id) ? " checked" : ""}> Report</label><button type="button" class="lnk" data-cover="${esc(p.id)}"${cover ? " disabled" : ""}>${cover ? "Cover" : "Make cover"}</button></figcaption></figure>`; }).join("");
  const needs = k.needs_review.map(n => { const acts = n.state === "open" ? (NEED_ACTIONS[n.id] || []).map(a => `<button type="button" class="btn" data-need="${esc(n.id)}" data-act="${a.act}"${a.field ? ` data-field-v="${a.field}"` : ""}>${esc(a.label)}</button>`).join("") + `<button type="button" class="btn" data-need="${esc(n.id)}" data-act="waive">Request and proceed</button>` : "";
    return `<li class="nd${n.state === "open" ? "" : " done"}" data-need-row="${esc(n.id)}"><span class="nd-l">${esc(n.label)}</span><span class="nd-s">${esc(n.state)}${n.reason ? " · " + esc(n.reason) : ""}</span><span class="nd-a">${acts}</span></li>`; }).join("");
  const docs = k.documents.map(d => `<li>${esc(d.name)}<span class="chip">${esc(d.kind)}</span><span class="chip${d.status === "received" ? " ok" : ""}">${esc(d.status)}</span></li>`).join("");
  return `<div class="veh"><section><h2>Vehicle facts</h2><table class="facts"><tbody>${rows}</tbody></table></section>`
    + `<section><h2>Photos</h2><div class="gal" id="gal">${photos}</div><label class="up"><input id="upl" type="file" accept="image/*" multiple> Add photos</label></section>`
    + `<section><h2>Needs review</h2>${needs ? `<ul class="nds">${needs}</ul>` : `<p class="fg-s">Nothing to review.</p>`}</section>`
    + `<section><h2>Documents</h2>${docs ? `<ul class="docs">${docs}</ul>` : `<p class="fg-s">No documents.</p>`}</section></div>`;
}

// ---------- stage 4: the Market evidence tab. Everything is desk.* as the engine sent it; the exclusions are the case's own (case.exclusions) ----------
export const SCOPE_LABEL = { report: "Report comps", market_calc: "Market calc" };
export const REL_LABEL = { close: "Close", similar: "Similar" };
export const LIVE_LABEL = { bid: "Bid", ask: "Ask", no_sale: "Not sold" };
const evRows = ev => !ev ? [] : ev.insufficient ? [["Reference", esc(ev.sentence)]] : [["Median", $(ev.median)], ["Typical range", rangeOf(ev.q1, ev.q3)], ["Lowest to highest", rangeOf(ev.low, ev.high)], ["Sales", esc(countNoun(ev.count, "sale", { words: false }))], ["Matching", esc(countNoun(ev.matching, "sale", { words: false }))],
  ["Period", ev.period && ev.period.from ? esc(ev.period.from + " to " + ev.period.to) : ""], ["Latest sale", ev.latestSale ? esc([ev.latestSale.date, $(ev.latestSale.price), ev.latestSale.platform].filter(Boolean).join(" · ")) : ""]].filter(r => r[1] !== "");
export function marketHtml(k) {
  const d = k && k.desk; if (!d || !d.evidence) return "";
  const col = (title, ev) => `<div class="evc"><h3>${esc(title)}</h3><dl>${evRows(ev).map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${b}</dd></div>`).join("")}</dl>${ev && ev.population ? `<p class="fg-s">${esc(ev.population.sentence)}</p>` : ""}${ev && ev.stale && ev.stale.flag ? `<p class="fg-s stale">${esc(ev.stale.sentence || "Stale")}</p>` : ""}</div>`;
  const grid = `<section class="mkt"><h2>Evidence</h2><div class="evg">${col("Original engine result", d.original)}${col("Current selected set", d.evidence)}</div></section>`;
  const ex = k.exclusions || [], sel = new Set((k.selectedComparables || []).map(String));
  const row = c => { const mine = ex.filter(e => String(e.saleId) === String(c.id)), off = mine.length > 0;
    return `<tr class="cp${off ? " ex" : ""}${c.inPopulation === false ? " outpop" : ""}" data-sale="${esc(c.id)}"><td class="cp-ph">${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : ""}</td><td class="cp-t"><b>${esc(c.title || "")}</b><span>${esc(c.why || "")}</span>${mine.map(e => `<em class="cp-x">${esc(SCOPE_LABEL[e.scope] || e.scope)}: ${esc(e.reason)}</em>`).join("")}</td><td>${esc(REL_LABEL[c.relevance] || c.relevance || "")}</td><td class="cp-s">${$(c.price)}<span>${esc([c.soldDate, c.platform].filter(Boolean).join(" · "))}</span></td><td>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">View sale</a>` : ""}</td>`
      + `<td class="cp-a"><label><input type="checkbox" data-sel="${esc(c.id)}"${sel.has(String(c.id)) ? " checked" : ""}${off ? " disabled" : ""}> In report</label><button type="button" class="lnk" data-excl="${esc(c.id)}">Exclude</button></td></tr>`; };
  const comps = Array.isArray(d.comparables) && d.comparables.length ? `<section class="mkt"><h2>Comparables</h2><div class="tw"><table class="cps"><tbody>${d.comparables.map(row).join("")}</tbody></table></div></section>` : "";
  const qs = (d.quarters || []).filter(q => q && q.shown);
  const quarters = qs.length ? `<section class="mkt"><h2>By quarter</h2><div class="tw"><table class="qt"><tbody>${qs.map(q => `<tr><th scope="row">${esc(q.label)}</th><td>${$(q.median)}</td><td>${esc(countNoun(q.count, "sale", { words: false }))}</td></tr>`).join("")}</tbody></table></div></section>` : "";
  const live = (d.live || []).length ? `<section class="mkt"><h2>Current listings</h2><div class="tw"><table class="lv"><tbody>${d.live.map(l => `<tr><td><span class="chip">${esc(LIVE_LABEL[l.type] || l.type)}</span></td><td>${l.figure != null ? $(l.figure) : ""}</td><td>${esc(l.title || "")}</td><td>${esc(l.platform || "")}</td><td>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">View listing</a>` : ""}</td></tr>`).join("")}</tbody></table></div></section>` : "";
  const out = (d.outside || []).length ? `<section class="mkt"><h2>Outside the population</h2><ul class="ol">${d.outside.map(o => `<li>${esc(o.sentence)}</li>`).join("")}</ul></section>` : "";
  return `<div class="mk4">${grid}${comps}${quarters}${live}${out}</div>`;
}


// ---------- stage 5: the Decision tab. The analyst's figures are the case's (case.assessment, case.reserve, case.condition); the market reference, the factors and the condition basis are desk.*; readiness is Lane D's readinessOf; nothing is made here ----------
export const VERIFY_LABEL = { verified: "Verified", documented: "Documented", seller_stated: "Seller stated", not_confirmed: "Not confirmed" };
const num = id => (label, v, attr = "") => `<label class="in" for="${id}"><span>${esc(label)}</span><input id="${id}" type="text" inputmode="numeric" value="${esc(v == null ? "" : v)}" autocomplete="off"${attr}></label>`;
const slider = (id, ev, v, label) => ev && !ev.insufficient && has(ev.low) && has(ev.high) ? `<input class="sl" id="${id}" type="range" min="${esc(ev.low)}" max="${esc(ev.high)}" step="100" value="${esc(has(v) ? v : ev.median)}" aria-label="${esc(label)}">` : "";
export function decisionHtml(sm, k) {
  const a = (k && k.assessment) || {}, r = (k && k.reserve) || {}, ev = sm && sm.ev, d = (k && k.desk) || {}, cond = (k && k.condition) || {};
  const ref = ev && !ev.insufficient ? `<div class="dcell ev"><span class="fg-k">Market reference</span><b>${$(ev.median)}</b></div>` : "";
  const asmt = `<div class="dcell cu"><span class="fg-k">Valuation</span><b>${has(a.figure) ? $(a.figure) : "Not set"}</b></div>`;
  const diffc = `<div class="dcell"><span class="fg-k">Difference</span><b>${sm && sm.diff ? esc(sm.diff) : "Not set"}</b></div>`;
  const assess = `<section class="cu-sec" id="assess"><h2>Valuation</h2><div class="dtri" id="dtri-a">${ref}${asmt}${diffc}</div><div class="ins">${num("in-afigure")("Valuation", a.figure)}${num("in-alow")("Range low (optional)", a.low)}${num("in-ahigh")("Range high (optional)", a.high)}</div><label class="in wide" for="in-aexp"><span>Explanation</span><textarea id="in-aexp" rows="3">${esc(a.explanation || "")}</textarea></label></section>`;
  const against = sm && sm.pos ? `<div class="dcell"><span class="fg-k">Against the reference</span><b>${esc(sm.pos)}</b></div>` : "";
  const reserve = `<section class="cu-sec" id="reserve"><h2>Reserve</h2><div class="dtri" id="dtri-r">${ref}<div class="dcell cu"><span class="fg-k">Reserve</span><b>${has(r.figure) ? $(r.figure) : "Not set"}</b></div>${against}</div><div class="ins">${num("in-reserve")("Reserve", r.figure)}</div>${slider("sl-r", ev, r.figure, "Reserve slider")}<label class="in wide" for="in-rrat"><span>Rationale</span><textarea id="in-rrat" rows="3">${esc(r.rationale || "")}</textarea></label><label class="chk"><input id="in-agreed" type="checkbox"${r.seller_agreed ? " checked" : ""}> Seller agreed</label></section>`;
  const sug = cond.suggested && (cond.suggested.tier != null ? cond.suggested.tier : cond.suggested), sel = cond.selected && cond.selected.tier;
  const condition = `<section class="dsec" id="dc-cond"><h2>Condition</h2><div class="seg" role="radiogroup" aria-label="Condition">${[1, 2, 3, 4].map(t => `<button type="button" role="radio" aria-checked="${Number(sel) === t}" class="seg-b${Number(sug) === t ? " sug" : ""}" data-cond="${t}" data-name="${esc(TIER_LADDER[t].name)}">${esc(TIER_LADDER[t].name)}</button>`).join("")}</div>${d.condition && d.condition.basis ? `<p class="fg-s">${esc(d.condition.basis)}</p>` : ""}</section>`;
  const factors = (d.factors || []).length ? `<section class="dsec" id="dc-fac"><h2>Factors</h2><ul class="fcs">${d.factors.map(f => `<li class="fc" data-factor="${esc(f.key)}"><b>${esc(f.title || f.key)}</b>${f.verification ? `<span class="chip${f.verification === "verified" || f.verification === "documented" ? " ok" : ""}">${esc(VERIFY_LABEL[f.verification] || f.verification)}</span>` : ""}${f.effectSentence ? `<span class="fc-e">${esc(f.effectSentence)}</span>` : ""}<span class="fg-s">${esc(f.basis || "")}</span></li>`).join("")}</ul></section>` : `<section class="dsec" id="dc-fac" hidden></section>`;
  const rd = k ? readinessOf(k) : { ready: false, blockers: [] };
  const ready = `<section class="dsec" id="dc-rdy"><h2>Report readiness</h2>${rd.blockers.length ? `<ul class="rdy">${rd.blockers.map(b => `<li data-blocker="${esc(b.key)}">${esc(b.why)}</li>`).join("")}</ul>` : `<p class="fg-s rok">Ready</p>`}</section>`;
  const audit = k && (k.audit || []).length ? `<section class="dsec" id="dc-aud"><h2>Audit trail</h2><ul class="aud">${k.audit.map(x => `<li><span>${esc(x.at)}</span><span>${esc(x.by)}</span><span>${esc(x.line || x.what)}</span></li>`).join("")}</ul></section>` : `<section class="dsec" id="dc-aud" hidden></section>`;
  const bar = `<div class="dbar"><button type="button" class="btn" id="b-save">Save draft</button><button type="button" class="btn" id="b-prev">Preview report</button><button type="button" class="btn pri" id="b-fin"${rd.ready ? "" : " disabled"}>Finalize</button><span class="fg-s" id="dmsg" role="status"></span></div>`;
  return `<div class="dec">${assess}${reserve}${condition}${factors}${ready}${audit}${bar}<section class="pane" id="pdfpane" hidden><div class="pane-h"><h2>Report preview</h2><button type="button" class="btn" id="pdfx">Close preview</button></div><iframe id="pdff" title="Report preview"></iframe></section></div>`;
}

export function tabsHtml(sm, k, sheet) {
  const a = sm && sm.a, r = sm && sm.r;
  const inp = (id, label, v) => `<label class="in" for="${id}"><span>${esc(label)}</span><input id="${id}" type="text" inputmode="numeric" value="${esc(v == null ? "" : v)}" autocomplete="off"></label>`;
  return `<div class="tabs3" role="tablist" id="tabs3">${TABS.map((t, i) => `<button role="tab" type="button" id="tab-${t.key}" aria-controls="pn-${t.key}" aria-selected="${i === 0}" data-tab="${t.key}">${esc(t.label)}</button>`).join("")}</div>`
    + `<div class="pn" id="pn-vehicle" role="tabpanel" aria-labelledby="tab-vehicle">${vehicleHtml(k, sheet)}</div><div class="pn" id="pn-market" role="tabpanel" aria-labelledby="tab-market" hidden>${marketHtml(k)}</div>`
    + `<div class="pn" id="pn-decision" role="tabpanel" aria-labelledby="tab-decision" hidden>${decisionHtml(sm, k)}</div>`;
}

export function pageHtml(model) {
  const { cases = [], activeId = null, queue = null, handling = null, kase = null, sheet = null } = model || {};
  const active = cases.find(c => c.id === activeId) || null, sm = active && kase ? figuresOf(kase) : null;
  const bar = `<header class="bar" id="bar"><div class="bar-l"><span class="bar-m">GoAskSam Desk</span><span class="bar-o">${esc(PREVIEW_ORG.name)}</span></div><div class="bar-r"><span class="bar-seat">${esc(PREVIEW_SEAT)}</span></div></header>`;
  const main = `<main class="work" id="work">${newCaseHtml()}${headerHtml(active)}${stickyHtml(active, sm)}${summaryHtml(sm)}${active ? tabsHtml(sm, kase, sheet) : ""}</main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${active ? esc(active.car) + " | " : ""}GoAskSam Desk</title><style>${DESK_V3_CSS}</style></head>`
    + `<body class="v3">${bar}<div class="shell">${railHtml(cases, activeId, queue, handling)}${main}</div><div class="lb" id="lb" hidden><button type="button" class="lb-x" aria-label="Close">Close</button><img alt=""></div><script>window.__DESK_V3__={api:${JSON.stringify(API_PATH)},base:${JSON.stringify(V3_BASE)},active:${JSON.stringify(activeId)}};${RAIL_JS}${REFRESH_JS}${DRAG_JS}${TAB_JS}${ACT_JS}${DEC_JS}${NEW_JS}</script></body></html>`;
}

const RAIL_JS = `(function(){var q=document.getElementById("railq");if(!q)return;q.addEventListener("input",function(){var t=q.value.toLowerCase().trim(),n=0;document.querySelectorAll(".cs").forEach(function(a){var h=t&&a.getAttribute("data-search").indexOf(t)<0;a.hidden=!!h;if(!h)n++;});document.getElementById("railnone").hidden=n>0;});})();`;
// REDRAW IN PLACE (Sam, Nov 9 2026): after a save the page asks for the same case again and swaps the parts that carry figures (header, summary, sticky bar, the Vehicle and Market evidence tabs, the Decision tab's condition, factors, readiness, audit and the two figure rows). The page is server drawn from the stored case Lane D's caseView reads, so the figures that come back are the server's, never the script's; nothing reloads and a field being typed in is left alone.
export const REFRESH_JS = `window.__deskRefresh=function(){var C=window.__DESK_V3__;if(!C||!C.active)return Promise.resolve();return fetch(location.pathname+location.search,{credentials:"same-origin",headers:{accept:"text/html"}}).then(function(r){return r.text()}).then(function(h){var d=new DOMParser().parseFromString(h,"text/html");
["chd","sum","stk","pn-vehicle","pn-market","dc-cond","dc-fac","dc-rdy","dc-aud","dtri-a","dtri-r"].forEach(function(id){var n=d.getElementById(id),o=document.getElementById(id);if(n&&o){o.innerHTML=n.innerHTML;if(n.hasAttribute("hidden")&&id!=="stk")o.setAttribute("hidden","");else if(id!=="stk")o.removeAttribute("hidden")}});
var f=d.getElementById("b-fin"),o=document.getElementById("b-fin");if(f&&o)o.disabled=f.disabled;window.dispatchEvent(new Event("deskrefreshed"))})};`;
export const TAB_JS = `(function(){var tabs=[].slice.call(document.querySelectorAll("#tabs3 [data-tab]")),stk=document.getElementById("stk"),sum=document.getElementById("sum"),cur="vehicle";
function show(k){cur=k;tabs.forEach(function(b){b.setAttribute("aria-selected",String(b.getAttribute("data-tab")===k))});["vehicle","market","decision"].forEach(function(x){var p=document.getElementById("pn-"+x);if(p)p.hidden=x!==k});try{sessionStorage.setItem("deskv3_tab",k)}catch(e){}sync()}
var inSum=true;function sync(){if(!stk)return;stk.hidden=!(cur!=="vehicle"||!inSum);document.body.setAttribute("data-view",cur)}
if(sum&&"IntersectionObserver"in window){new IntersectionObserver(function(e){inSum=e[0].isIntersecting;sync()},{rootMargin:"-96px 0px 0px 0px"}).observe(sum)}
document.addEventListener("click",function(e){var t=e.target.closest&&e.target.closest("button[data-tab]");if(t){show(t.getAttribute("data-tab"));return}var g=e.target.closest&&e.target.closest("[data-go]");if(g){var id={assess:"in-afigure",reserve:"in-reserve"}[g.getAttribute("data-go")];if(!id)return;show("decision");var el=document.getElementById(id);if(el){el.scrollIntoView({block:"center"});el.focus()}}});
var first="vehicle";try{first=sessionStorage.getItem("deskv3_tab")||"vehicle"}catch(e){}tabs.length&&show(first)})();`;
// the Vehicle tab's actions: each one posts to the preview's own door and, when the server accepts it, shows the case the server sent back (a reload of the same case, on the same tab); a refusal is printed as the server worded it
export const ACT_JS = `(function(){var C=window.__DESK_V3__;if(!C||!C.active)return;function post(b){return fetch(C.api,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()})}
function done(r){if(r&&r.ok){return window.__deskRefresh()}var m=document.getElementById("msg");if(!m){m=document.createElement("p");m.id="msg";m.className="msg";document.getElementById("pn-vehicle").prepend(m)}m.textContent=(r&&(r.why||r.line))||"That did not save."}
function edit(op,x){x.action="case_edit";x.id=C.active;x.op=op;return post(x).then(done)}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("button");if(!b)return;
if(b.dataset.edit){var tr=b.closest("tr"),td=tr.querySelector("[data-v]"),cur=td.firstChild&&td.firstChild.className==="nc"?"":td.firstChild.textContent;td.innerHTML='<input class="ed" type="text" value=""><button type="button" class="btn" data-save="'+b.dataset.edit+'">Save</button>';td.querySelector("input").value=cur;td.querySelector("input").focus();return}
if(b.dataset.save){var v=b.parentNode.querySelector("input").value;edit("field",{field:b.dataset.save,value:v});return}
if(b.dataset.need){var a=b.dataset.act,id=b.dataset.need;if(a==="verify")edit("verify",{field:b.dataset.fieldV});else if(a==="doc"){var pk=document.createElement("input");pk.type="file";pk.accept="application/pdf,image/jpeg,image/png";pk.onchange=function(){var f=pk.files[0];if(!f)return;var r=new FileReader();r.onload=function(){edit("doc_add",{kind:"invoice",title:f.name.replace(/\.[^.]+$/,""),name:f.name,data:String(r.result).split(",")[1]})};r.readAsDataURL(f)};pk.click()}else edit("need",{item:id,state:"waived",reason:"Requested from the seller, proceeding"});return}
if(b.dataset.excl){var tr=b.closest('tr'),old=tr.querySelector('.xf');if(old){old.remove();return}var f=document.createElement('div');f.className='xf';f.innerHTML='<label>Why <input class="xr" type="text" required></label><label>Scope <select class="xs"><option value="report">Report comps</option><option value="market_calc">Market calc</option></select></label><button type="button" class="btn" data-xgo="'+b.dataset.excl+'" disabled>Exclude</button>';tr.querySelector('.cp-t').appendChild(f);f.querySelector('.xr').addEventListener('input',function(){f.querySelector('[data-xgo]').disabled=!f.querySelector('.xr').value.trim()});f.querySelector('.xr').focus();return}
if(b.dataset.xgo){var fm=b.closest('.xf');var why=fm.querySelector('.xr').value.trim();if(!why)return;edit('exclude',{saleId:b.dataset.xgo,scope:fm.querySelector('.xs').value,reason:why});return}
if(b.dataset.zoom){var lb=document.getElementById("lb");lb.querySelector("img").src=b.dataset.zoom;lb.hidden=false;return}
if(b.classList.contains("lb-x")){document.getElementById("lb").hidden=true;return}
if(b.dataset.cover){edit("cover",{photoId:b.dataset.cover});return}});
document.addEventListener("change",function(e){var t=e.target;if(t.dataset&&t.dataset.sel){var sids=[].slice.call(document.querySelectorAll('[data-sel]')).filter(function(x){return x.checked}).map(function(x){return x.dataset.sel});edit('comparables',{ids:sids});return}
if(t.dataset&&t.dataset.report){var ids=[].slice.call(document.querySelectorAll("[data-report]")).filter(function(x){return x.checked}).map(function(x){return x.dataset.report});edit("report_photos",{ids:ids});return}
if(t.id==="upl"){var files=[].slice.call(t.files),chain=Promise.resolve(),fail=null;files.forEach(function(f){chain=chain.then(function(){return new Promise(function(res){var r=new FileReader();r.onload=function(){res(String(r.result).split(",")[1])};r.readAsDataURL(f)})}).then(function(b64){return post({action:"case_edit",op:"photo_add",id:C.active,name:f.name,data:b64})}).then(function(x){if(!x.ok)fail=x})});chain.then(function(){done(fail||{ok:true})})}});
document.addEventListener("keydown",function(e){if(e.key==="Escape"){var lb=document.getElementById("lb");if(lb)lb.hidden=true}})})();`;

// DRAG_JS_BEGIN
// THE ONLY PLACE THE PAGE DOES ARITHMETIC (Sam asked for a draggable marker, Nov 9 2026): it turns a pointer position on the market bar into a place on the bar's own scale and back. It reads the bar's own data-lo and data-hi (the lowest and highest figure the bar was drawn from, sent by the server) and nothing else, never a median, a range or the reserve; the figure it returns is the analyst's choice and is written as the case's valuation. deskV3ShellCheck holds this block to those words.
export const DRAG_JS = `window.__deskBar=(function(){function bar(){return document.querySelector("#sum .bar3")}
function lo(){var b=bar();return b?Number(b.dataset.lo):0}function hi(){var b=bar();return b?Number(b.dataset.hi):0}
return {fmt:${moneyWords},   /* the engine's own dollar formatter (lib/reasonWords.js moneyWords), the one the server prints every figure with */
valueAt:function(x){var b=bar();if(!b)return 0;var r=b.getBoundingClientRect(),f=Math.max(0,Math.min(1,(x-r.left)/(r.width||1)));return Math.round((lo()+f*(hi()-lo()))/100)*100},
leftOf:function(v){var d=hi()-lo(),f=d>0?(v-lo())/d:0;return (Math.max(0,Math.min(1,f))*100).toFixed(2)+"%"},
step:function(v,d){return Math.max(lo(),Math.min(hi(),v+d))}}})();`;
// DRAG_JS_END
export const DEC_JS = `
(function(){var C=window.__DESK_V3__;if(!C||!C.active||!document.getElementById("pn-decision"))return;var $=function(i){return document.getElementById(i)};
function post(b){return fetch(C.api,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()})}
function say(t){var m=$("dmsg");if(m)m.textContent=t||""}
function sav(t){var m=$("sav");if(m)m.textContent=t||""}
function val(i){var e=$(i);return e?e.value:""}
function fmt(v){return window.__deskBar.fmt(v)}
function bar(){return document.querySelector("#sum .bar3")}
// THE VALUATION: the marker, the big number, the sticky figure and the typed figure are one value. A drag or a typed figure shows at once and is written through case_edit (assessment, the figure only, so the reserve never moves), debounced, with Saving shown; the figures are then redrawn from the stored case.
var seq=0,timer=null;
function show(v){var b=bar(),big=$("valBig"),mk=b&&b.querySelector(".mk-val");if(big){big.className="fg-v cu";big.textContent=fmt(v)}var sk=document.querySelector("#stk .sk.cu b");if(sk)sk.textContent=fmt(v);
if(b&&mk){mk.style.left=window.__deskBar.leftOf(v);mk.dataset.v=v;mk.setAttribute("aria-valuenow",v);var em=mk.querySelector("em");if(em)em.textContent=fmt(v)}}
function write(v){var my=++seq;sav("Saving");clearTimeout(timer);timer=setTimeout(function(){post({action:"case_edit",id:C.active,op:"assessment",patch:{figure:v}}).then(function(x){if(my!==seq)return;if(!x.ok){sav((x&&(x.why||x.line))||"That did not save.");return}return window.__deskRefresh().then(function(){if(my===seq)sav("Saved")})}).catch(function(){sav("That did not save.")})},400)}
function setVal(v,fromInput){show(v);if(!fromInput){var i=$("in-afigure");if(i)i.value=String(v)}write(v)}
var drag=false;
document.addEventListener("pointerdown",function(e){var m=e.target.closest&&e.target.closest("#sum .mk-val");if(!m)return;drag=true;e.preventDefault()});
document.addEventListener("pointermove",function(e){if(!drag)return;if(!bar())return;setVal(window.__deskBar.valueAt(e.clientX))});
document.addEventListener("pointerup",function(){drag=false});
document.addEventListener("keydown",function(e){var m=e.target.closest&&e.target.closest("#sum .mk-val");if(!m)return;var d={ArrowLeft:-100,ArrowDown:-100,ArrowRight:100,ArrowUp:100,PageDown:-1000,PageUp:1000}[e.key];if(!d)return;e.preventDefault();setVal(window.__deskBar.step(Number(m.dataset.v),d))});
document.addEventListener("input",function(e){var t=e.target;if(t.id==="in-afigure"){var v=Number(String(t.value).replace(/[^\\d]/g,""));if(v>0)setVal(v,true)}
if(t.id==="sl-r"||t.id==="in-reserve"){var n=Number(String(t.value).replace(/[^\\d]/g,"")),b=bar(),mk=b&&b.querySelector(".mk-res");if(t.id==="sl-r"){var ri=$("in-reserve");if(ri)ri.value=t.value}if(b&&mk&&n>0){mk.style.left=window.__deskBar.leftOf(n);mk.dataset.v=n}}});
function save(){var a={figure:val("in-afigure"),low:val("in-alow"),high:val("in-ahigh"),explanation:val("in-aexp")},r={figure:val("in-reserve"),rationale:val("in-rrat"),seller_agreed:$("in-agreed").checked};
return post({action:"case_edit",id:C.active,op:"assessment",patch:a}).then(function(x){if(!x.ok)throw x;return post({action:"case_edit",id:C.active,op:"reserve",patch:r})}).then(function(x){if(!x.ok)throw x;return x})}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("button");if(!b)return;
if(b.id==="b-save"){say("Saving");save().then(function(){return window.__deskRefresh()}).then(function(){say("Saved")}).catch(function(x){say((x&&(x.why||x.line))||"That did not save.")});return}
if(b.dataset.cond){say("Saving");post({action:"case_edit",id:C.active,op:"condition",selected:{tier:Number(b.dataset.cond),name:b.dataset.name}}).then(function(x){if(x.ok)return window.__deskRefresh().then(function(){say("")});say(x.why||"That did not save.")});return}
if(b.id==="b-prev"){say("Opening the report");post({action:"case_pdf",id:C.active,draft:true}).then(function(x){if(x&&x.ok&&x.pdf_b64){var bin=atob(x.pdf_b64),u8=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);var url=URL.createObjectURL(new Blob([u8],{type:"application/pdf"}));if(window.__pdfUrl)URL.revokeObjectURL(window.__pdfUrl);window.__pdfUrl=url;$("pdff").src=url;$("pdfpane").hidden=false;say("");$("pdfpane").scrollIntoView({block:"start"})}else say((x&&(x.why||x.line))||"The report preview is not available.")}).catch(function(){say("The report preview is not available.")});return}
if(b.id==="pdfx"){$("pdfpane").hidden=true;$("pdff").removeAttribute("src");return}
if(b.id==="b-fin"&&!b.disabled){say("Finalizing");save().then(function(){return post({action:"case_finalize",id:C.active})}).then(function(x){if(x.ok)location.reload();else say(x.why||"Not ready.")}).catch(function(x){say((x&&x.why)||"That did not save.")});return}});
// a case opened with no valuation takes the engine's median as its valuation, stored on the case (the figure is copied from the summary's data-start, which the server printed from desk.evidence)
var sum=$("sum"),st=sum&&Number(sum.getAttribute("data-start"));if(st>0){post({action:"case_edit",id:C.active,op:"assessment",patch:{figure:st}}).then(function(x){if(x.ok)return window.__deskRefresh()})}
})();`;

// STAGE 7: the New case form. case_new with the car and what is known, then each photo through case_edit photo_add (the first becomes the cover), then the case opens with the engine's reference in its summary.
export const NEW_JS = `(function(){var C=window.__DESK_V3__;if(!C)return;var $=function(i){return document.getElementById(i)};
function post(b){return fetch(C.api,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()})}
function msg(t){var m=$("nc-msg");if(m)m.textContent=t||""}
function open(on){var f=$("newcase");if(!f)return;f.hidden=!on;document.body.toggleAttribute("data-new",on);if(on){var i=$("nc-vin");if(i)i.focus()}}
function b64(f){return new Promise(function(res){var r=new FileReader();r.onload=function(){res(String(r.result).split(",")[1])};r.readAsDataURL(f)})}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("button");if(!b)return;
if(b.id==="newcase-btn"){open(true);return}if(b.id==="nc-x"){open(false);return}
if(b.id==="nc-go"){var v=function(i){return ($(i).value||"").trim()},vin=v("nc-vin"),yr=v("nc-year"),mk=v("nc-make"),md=v("nc-model");
if(!vin&&!(yr&&mk&&md)){msg("Enter a VIN, or the year, make and model.");return}
var req={action:"case_new"};[["vin",vin],["year",yr],["make",mk],["model",md],["mileage",v("nc-mileage")],["transmission",v("nc-trans")],["body",v("nc-body")],["colour",v("nc-colour")],["seller_name",v("nc-seller")],["asking_price",v("nc-asking")],["seller_notes",($("nc-notes").value||"").trim()]].forEach(function(p){if(p[1])req[p[0]]=p[1]});
b.disabled=true;msg("Creating the case");var files=[].slice.call($("nc-photos").files||[]),id=null,last=null;
post(req).then(function(x){if(!x.ok)throw x;id=x.id;last=x;var chain=Promise.resolve();files.forEach(function(f,i){chain=chain.then(function(){msg("Adding photo "+(i+1)+" of "+files.length);return b64(f)}).then(function(d){return post({action:"case_edit",id:id,op:"photo_add",name:f.name,data:d})}).then(function(r){if(!r.ok)throw r;last=r})});return chain})
.then(function(){return last}).then(function(r){if(r&&r.ok===false)throw r;var ev=r&&r.case&&r.case.desk&&r.case.desk.evidence,a=r&&r.case&&r.case.assessment;if(ev&&!ev.insufficient&&ev.median!=null&&!(a&&a.figure!=null))return post({action:"case_edit",id:id,op:"assessment",patch:{figure:ev.median}})})
.then(function(){location.href=C.base+"/case/"+id}).catch(function(x){b.disabled=false;msg((x&&(x.why||x.line||x.error))||"The case could not be created: the server sent no reason (check the photo size and try again).")})}});})();`;
export const deskV3Shell = () => pageHtml({});

// the case record the demonstration case holds; every other sample sheet reads through the same case view
let seeded = null;
async function seed(store) {
  if (store.persistent) return null;   // the production store is seeded once by the ops task, never at a render
  if (seeded) return seeded;
  seeded = (async () => {
    const at = new Date().toISOString();
    if (!(await store.get(PREVIEW_ORG.id, DEMO_ID))) await store.insert(PREVIEW_ORG.id, { id: DEMO_ID, owner_seat: PREVIEW_SEAT, forwarded_by: PREVIEW_SEAT, vin: DEMO_VIN, car_label: "1999 Porsche 911 Carrera", status: "In progress", created_at: new Date(Date.now() - 18 * 3600e3).toISOString(), opened_at: null, version: 0,
      submission: { consignor: { name: "Hal Moreau", email: "hal@example.com" }, mileage: DEMO_MILES, photos: DEMO_PHOTOS, documents: [] }, state: { heroId: null, photosSelected: DEMO_PHOTOS.map(p => p.id) }, read: null, events: [], case: await demoCaseRecord(at) });
  })();
  return seeded;
}
// the model both workspaces draw from (V3 and V4): the org's cases through Lane D's case view, the open case, the queue counts and the operations lines, exactly as the server sent them
// THE PAGE'S OWN LOAD MINTS ADDRESSES TOO (Lane C's live run: an uploaded photo was a grey box on the case page). CAUSE: the stored sheet carries a storage path and url null by design; every answer of the Desk's actions mints the signed address (sheetActions minted), but this model read the stored rows straight into the case view, so the page opened with url null until an edit answered. The opened case is minted in full (photos, documents, the original email); every other row only its cover photo, which is all the rail draws.
export async function mintedRows(rows, openId, env = {}, org = PREVIEW_ORG.id) {
  return Promise.all(rows.map(async s => {
    const ph = (s.submission && s.submission.photos) || []; if (!s.submission || (!ph.some(p => p && p.path) && s.id !== openId)) return s;
    if (s.id === openId) return mintSheetUrls(env, org, s);
    const cover = ph.find(p => p && p.id === (s.case && s.case.photos && s.case.photos.coverId)) || ph[0]; if (!cover || !cover.path) return s;
    const m = await mintSheetUrls(env, org, { ...s, submission: { photos: [cover] } });
    return { ...s, submission: { ...s.submission, photos: ph.map(p => (p === cover ? m.submission.photos[0] : p)) } };
  }));
}
export async function deskModel(req) {
  const store = await previewStore(); await seed(store);
  const listed = await store.list(PREVIEW_ORG.id), now = Date.now(), nowIso = new Date(now).toISOString();
  listed.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const openId = await aliasId(store, String((req && req.query && req.query.case) || "")), rows = await mintedRows(listed, openId, (await previewEnv()) || {});
  // THE RAIL LISTS WHAT THE GROUP COUNTS COUNT (Lane F's run: the Finalized group read 0 above a listed finalized case). CAUSE: the counts are of the live sheets (a finalized sheet that a revision corrects is replaced by the revision, caseView.live) and the rail listed every row, so the superseded finalized version was listed in a group that did not count it. The list is the live sheets; a superseded version stays reachable by its own link.
  const views = rows.map(s => caseView(s, rows, nowIso)), liveIds = new Set(live(rows).map(s => s.id)), id = openId, all = rows.map((s, i) => caseOf(s, views[i], now)), cases = all.filter(c => liveIds.has(c.id) || c.id === id);   // the version the analyst opened by its own link stays listed while it is open
  if (id && !all.some(c => c.id === id)) throw new Error("no such case");   // the door answers the platform 404
  const i = rows.findIndex(s => s.id === id), cv = i >= 0 ? views[i] : null;
  return { cases, activeId: id || null, queue: views[0] ? views[0].queue : null, today: views[0] ? views[0].today : null, handling: views[0] ? views[0].handling : null, kase: cv, sheet: i >= 0 ? rows[i] : null };
}
export async function renderDeskV3(req) { return pageHtml(await deskModel(req)); }
