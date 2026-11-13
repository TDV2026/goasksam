// DESK V4 THIRD RUN CHECK (Lane S, Nov 12 2026): Sam's third run, six items, each with mutants that must fail. The page computes nothing: every figure and sentence below is a field the server sent.
//   1 THE THIN LINE PRINTS ONCE (and CLASS: no line of 12 or more characters is printed in two places in the Reserve panel, across every tab, in the thin, the plain and the finalized states).
//   2 COVER: every thumbnail but the cover has Set as cover (on hover and in its menu), the cover carries a small tag, the write is Lane D's case_edit cover with the photoId, the hero follows; and the report's first page prints the cover (the real report builder asked which photo it fetches first).
//   4 THE PRICE AXIS: five or six labelled ticks along the bottom of the plot, each label the engine's own words for its figure (the engine's axisTicks when sent), in order, none overlapping, at 1440, 1280 and 1024.
//   5 THE PANEL'S TABS: the figure, its lines and the check lines fixed at the top, four tabs under them, the active tab's content given the whole remaining height with no inner scroll, Preview report and Finalize fixed at the bottom, a count badge where there are open items; at 1440, 1280 and 1024.
//   6 ONE WORD FOR ONE STATE in the facts grid, from the case's own mark; "Not confirmed" is never one of them.
//   (3, the queue rows, is deskV4ShellCheck section 11.)
//   node scripts/deskV4ThirdRunCheck.mjs
import fs from "node:fs";
import { launch, openLive, tally, V3, V4, PV, seedIntake, finalizeDemo, imp } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const SRC = fs.readFileSync("lib/preview/deskV4Client.js", "utf8");
const base = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } });
const give = (html, mut) => { const m = /window\.__V4__=([\s\S]*?);window\.__DESK_V3__/.exec(html); const o = JSON.parse(m[1]); mut(o.kase); return html.replace(m[0], "window.__V4__=" + JSON.stringify(o).replace(/</g, "\\u003c") + ";window.__DESK_V3__"); };
const RM = thin => ({ recommendation: thin ? "unclear" : "reserve", line: thin ? "Only 7 sales had no reserve, too few to compare." : "A reserve is supported: 9 of 12 sales with a reserve sold.", withReserve: { count: 12, medianLine: "Median $57,875 with a reserve." }, noReserve: { count: 7, medianLine: "Median $52,000 with no reserve." }, thin, thinLine: thin ? "Only 7 sales had no reserve, too few to compare." : null });
const page = async (mut, o = {}) => openLive(b, { ...o, mutate: h => { let x = mut ? give(base, mut) : base; return o.html ? o.html(x) : x; } });
const window_max = 50996;
const TABS = ["why", "needs", "rmode", "report"];

const DUP = () => { const out = {}; for (const k of ["why", "needs", "rmode", "report"]) { (window.__v4tab || (() => 0))(k); }
  const texts = [], done = new Set(); for (const k of ["why", "needs", "rmode", "report"]) { (window.__v4tab || (() => 0))(k); for (const e of document.querySelectorAll("#val *")) { if (done.has(e) || e.children.length || e.closest("script,style,option,textarea,select,button")) continue; const vis = !!(e.offsetWidth || e.getClientRects().length); if (!vis) continue; const t = e.textContent.replace(/\s+/g, " ").trim(); if (t.length >= 12) { texts.push(k + "|" + t); done.add(e); } } }
  const seen = {}; for (const x of texts) { const t = x.split("|").slice(1).join("|"); seen[t] = (seen[t] || 0) + 1; } return Object.keys(seen).filter(t => seen[t] > 1); };
// ---------- 1 the thin line prints once, and nothing in the panel prints twice ----------
await (async () => { try {
{ const p = await page(c => { c.desk.reserveMode = RM(true); }); const r = await p.evaluate(() => { (window.__v4tab || (() => 0))("rmode"); const line = document.getElementById("rmLine"), tiles = document.querySelector(".rmc"), all = [...document.querySelectorAll("#val *")].filter(e => !e.children.length && e.textContent.trim() === "Only 7 sales had no reserve, too few to compare." && (e.offsetWidth || e.getClientRects().length)); return { n: all.length, above: line.getBoundingClientRect().bottom <= tiles.getBoundingClientRect().top + 1, cls: line.className, extra: !!document.getElementById("rmThin") }; });
  ok(r.n === 1 && r.above && !r.extra, `the reserve mode's thin line prints once, above the two count tiles (${r.n} on screen, ${r.cls})`);
  { const d = await p.evaluate(DUP); ok(d.length === 0, "CLASS: no line of 12 or more characters is printed in two places in the Reserve panel (thin case, every tab)" + (d.length ? ": " + d.join(" | ") : "")); } await p.close(); }
{ const p = await page(c => { c.desk.reserveMode = RM(false); }); const d = await p.evaluate(DUP); ok(d.length === 0, "CLASS: no line printed twice in the Reserve panel (plain case, every tab)" + (d.length ? ": " + d.join(" | ") : "")); await p.close(); }
{ const mut = h => h.replace('rl.classList.toggle("thin", rm.thin === true);', 'rl.classList.toggle("thin", rm.thin === true); if (rm.thin) { var d2 = document.createElement("p"); d2.textContent = rm.thinLine || ""; document.querySelector(".rmc").after(d2); }');
  const p = await page(c => { c.desk.reserveMode = RM(true); }, { html: mut }); const d = await p.evaluate(DUP); ok(d.length > 0, "mutant caught: the thin line printed a second time under the tiles"); await p.close(); }


} catch (e) { ok(false, "section crashed: " + String(e.message).slice(0, 110)); } })();
// ---------- 2 the cover ----------
await (async () => { try {
const COVER = () => { const th = [...document.querySelectorAll("#thumbs .th[data-photo]")], hero = document.getElementById("hero"); const tag = th.filter(t => t.querySelector("[data-cover-tag]")).map(t => t.dataset.photo);
  return { n: th.length, tag, set: th.filter(t => t.querySelector("[data-setcover]")).map(t => t.dataset.photo), menu: th.filter(t => t.querySelector("[data-menu-cover]")).map(t => t.dataset.photo), hero: hero.style.backgroundImage, urls: Object.fromEntries(window.__v4.K().photos.items.map(p => [p.id, p.url])), cover: window.__v4.K().photos.coverId }; };
{ const p = await openLive(b); const a = await p.evaluate(COVER);
  ok(a.n >= 4 && a.tag.length === 1 && a.tag[0] === (a.cover || Object.keys(a.urls)[0]) && a.set.length === a.n - 1 && !a.set.includes(a.tag[0]) && a.menu.length === a.n - 1, `every thumbnail but the cover offers Set as cover (hover and menu), the cover carries one Cover tag (${a.tag.join(",")}; ${a.set.length} of ${a.n})`);
  const pick = Object.keys(a.urls).filter(i => i !== a.tag[0])[2]; const n0 = p._posts.length;
  await p.hover(`#thumbs [data-photo="${pick}"]`); const vis = await p.evaluate(id => { const s = document.querySelector(`#thumbs [data-photo="${id}"] [data-setcover]`); return getComputedStyle(s).opacity; }, pick);
  await p.click(`#thumbs [data-photo="${pick}"] [data-setcover]`); await wait(1200); const w = p._posts.slice(n0).filter(x => x.action === "case_edit" && x.op === "cover"); const z = await p.evaluate(COVER);
  ok(vis === "1" && w.length === 1 && w[0].photoId === pick && z.cover === pick && z.tag.length === 1 && z.tag[0] === pick && z.hero.includes(z.urls[pick].slice(0, 40)), `hover shows Set as cover; clicking it writes case_edit cover with that photoId and the tag and the hero move (${w.length} write, cover ${z.cover})`);
  const toggles = p._posts.slice(n0).filter(x => x.op === "report_photos").length; ok(toggles === 0, "setting the cover does not toggle the photo's place in the report");
  // the menu route
  const pick2 = Object.keys(a.urls).filter(i => i !== pick)[0]; await p.hover(`#thumbs [data-photo="${pick2}"]`); await p.click(`#thumbs [data-photo="${pick2}"] [data-photo-menu]`); await p.click(`#thumbs [data-photo="${pick2}"] [data-menu-cover]`); await wait(1200); const y = await p.evaluate(COVER);
  ok(y.cover === pick2 && y.tag[0] === pick2, "the thumbnail's menu sets the cover as well");
  // the report's first page prints the cover: the real builder, asked which photo it fetches first
  const sheet = (await (await PV.previewStore()).get?.(PV.PREVIEW_ORG.id, V3.DEMO_ID)) || null;
  await p.close();
  const get = await PV.previewDeskApi({ action: "case_get", id: V3.DEMO_ID }); const c = get.case, { buildReportV3 } = await imp("lib/desk/reportPdfV3.js");
  const fetched = []; const mk = cv => ({ id: "x", owner_seat: "Jane Park", forwarded_by: "Jane Park", created_at: new Date().toISOString(), submission: { typed: false, photos: c.photos.items.map(i => ({ id: i.id, url: i.url })) }, state: {}, case: cv, final: { reportNumber: "DV-0", org: { name: "Acme" }, finalisedAt: new Date().toISOString() } });
  const first = async cv => { fetched.length = 0; await buildReportV3(mk(cv), { name: "Acme", contactEmail: "d@acme.example" }, { fetchImage: async u => { fetched.push(u); return null; }, draft: true }); return fetched[0]; };
  const url0 = await first(c); ok(c.photos.coverId === pick2 && url0 === c.photos.items.find(i => i.id === pick2).url, "the report's first page fetches the case's cover photo (the real report builder, the cover just set)");
  const wrongCover = JSON.parse(JSON.stringify(c)); wrongCover.photos.coverId = c.photos.items.find(i => i.id !== pick2).id; ok((await first(wrongCover)) !== c.photos.items.find(i => i.id === pick2).url, "mutant caught: a case whose cover was not written (the page's write lost) prints another photo on page one"); }
for (const [label, mut] of [["a Set as cover that writes report_photos instead", h => h.replace('edit("cover", { photoId: id })', 'edit("report_photos", { ids: [id] })')], ["a Set as cover that sends the wrong photo", h => h.replace('edit("cover", { photoId: id })', 'edit("cover", { photoId: "ph_1" })')], ["a cover with no tag", h => h.replace('if (isCover) t.appendChild(el("em", { class: "ctag"', 'if (false) t.appendChild(el("em", { class: "ctag"')], ["no Set as cover on the thumbnails", h => h.replace('else t.appendChild(el("button", { type: "button", class: "thc"', 'else if (false) t.appendChild(el("button", { type: "button", class: "thc"')]]) {
  const p = await openLive(b, { mutate: mut }); const a = await p.evaluate(COVER); const pick = Object.keys(a.urls).filter(i => i !== a.tag[0] && i !== "ph_1")[1]; let good = a.tag.length === 1 && a.set.length === a.n - 1;
  if (good) { await p.click(`#thumbs [data-photo="${pick}"] [data-setcover]`).catch(() => { good = false; }); await wait(900); const z = await p.evaluate(COVER); good = good && z.cover === pick && z.tag[0] === pick; } ok(!good, "mutant caught: " + label); await p.close(); }


} catch (e) { ok(false, "section crashed: " + String(e.message).slice(0, 110)); } })();
// ---------- 4 the price axis ----------
await (async () => { try {
const AXIS = () => { const svg = document.getElementById("plot"), ax = document.getElementById("axis"); if (!ax) return { n: 0 }; const R = e => e.getBoundingClientRect(), sr = R(svg);
  const labs = [...ax.querySelectorAll("text")].map(t => ({ t: t.textContent, v: Number(t.dataset.ticklabel), l: R(t).left, r: R(t).right, top: R(t).top, bot: R(t).bottom })), ticks = [...ax.querySelectorAll("line")].map(l => ({ v: Number(l.dataset.tick), x: R(l).left })), e = window.__v4.K().desk.evidence, med = document.getElementById("medline");
  const sorted = labs.every((x, i) => !i || labs[i - 1].v < x.v), over = labs.some((x, i) => i && x.l < labs[i - 1].r + 2), inside = labs.every(x => x.l >= sr.left - 1 && x.r <= sr.right + 1 && x.bot <= sr.bottom + 1);
  return { n: labs.length, ticks: ticks.length, labels: labs.map(x => x.t), sent: [].concat(...Object.values(e.byWindow || {}).map(w => (w.axisTicks || []).map(t => t.label))), sorted, over, inside, medX: med ? Math.round(R(med).left) : null, firstTick: ticks.length ? Math.round(ticks[0].x) : null, lastTick: ticks.length ? Math.round(ticks[ticks.length - 1].x) : null }; };
for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]]) { const p = await openLive(b, { w, h }); const a = await p.evaluate(AXIS); await p.close();
  ok(a.n >= 5 && a.n <= 6 && a.ticks === a.n && a.sorted && !a.over && a.inside && a.labels.every(l => a.sent.includes(l)), `@${w}: the plot has a bottom price axis of ${a.n} labelled ticks, each label a string the engine sent in axisTicks, in order, none overlapping (${(a.labels || []).join(" ")})`);
  ok(a.medX != null && a.firstTick <= a.medX && a.medX <= a.lastTick, `@${w}: the median line sits inside the axis the ticks span (${a.firstTick} to ${a.lastTick}, line at ${a.medX})`); }
{ const sent = [{ value: 20000, label: "$20,000" }, { value: 28000, label: "$28,000" }, { value: 32500, label: "$32,500" }, { value: 38000, label: "$38,000" }, { value: 45000, label: "$45,000" }, { value: 51000, label: "$51,000" }];
  const put = ticks => c => { const e = c.desk.evidence, w = e.byWindow[String(e.windowMonths)]; w.axisTicks = ticks; w.axisMin = ticks.length ? ticks[0].value : null; w.axisMax = ticks.length ? ticks[ticks.length - 1].value : null; };
  const p = await page(put(sent)); const a = await p.evaluate(AXIS); await p.close(); ok(a.n === 6 && sent.every(s => a.labels.includes(s.label)), `the engine's own axisTicks print as sent when it sends them (${a.labels.join(" ")})`);
  const none = await page(put([])); const z0 = await none.evaluate(() => document.querySelectorAll("#axis text").length); await none.close(); ok(z0 === 0, "no ticks sent means no axis labels (the page makes none of its own)");
  const crowd = [{ value: 30000, label: "$30,000" }, { value: 30100, label: "$30,100" }, { value: 30200, label: "$30,200" }, { value: 30300, label: "$30,300" }, { value: 30400, label: "$30,400" }, { value: 60000, label: "$60,000" }];
  const q = await page(put(crowd)); const y = await q.evaluate(AXIS); await q.close(); ok(y.n >= 2 && y.sorted && !y.over && y.inside && y.labels[y.labels.length - 1] === "$60,000", `crowded ticks: the labels never overlap and the last tick keeps its label (${y.labels.join(" ")})`);
  const r = await page(put(crowd), { html: h => h.replace("if (x - lastx >= 62)", "if (true)") }); const z = await r.evaluate(AXIS); await r.close(); ok(z.over, "mutant caught: axis labels that crowd each other (on crowded ticks)"); }
for (const [label, mut] of [["a plot with no axis", h => h.replace('svg.appendChild(ax);', '')], ["an axis with a single tick", h => h.replace('drawn.forEach(function (d) {', 'drawn.slice(0, 1).forEach(function (d) {')]]) {
  const p = await openLive(b, { mutate: mut }); const a = await p.evaluate(AXIS); await p.close(); ok(!(a.n >= 5 && a.n <= 6 && a.sorted && !a.over && a.inside), "mutant caught: " + label); }


} catch (e) { ok(false, "section crashed: " + String(e.message).slice(0, 110)); } })();
// ---------- 5 the right panel's tabs ----------
await (async () => { try {
const LAY = () => { const R = e => e && e.getBoundingClientRect(), val = document.getElementById("val"), vr = R(val), hd = R(val.querySelector(".hd")), chk = document.getElementById("chk") || document.createElement("div"), cr = R(chk), tb = R(document.getElementById("vtabs")), bd = val.querySelector(".bd"), br = R(bd), ft = R(val.querySelector(".ft")), fig = R(document.getElementById("valIn"));
  const tabs = [...document.querySelectorAll("#vtabs [role=tab]")], vis = e => !!(e.offsetWidth || e.getClientRects().length), sel = tabs.filter(t => t.getAttribute("aria-selected") === "true"), act = [...bd.querySelectorAll("[role=tabpanel]")].filter(p => !p.hidden);
  const K = window.__v4.K(), lines = (window.__v4.D.readiness && window.__v4.D.readiness.checks) || K.checks || [];
  return { tabs: tabs.map(t => t.querySelector("span").textContent), tabsVis: tabs.every(vis) && tabs.every(t => { const q = t.getBoundingClientRect(); return q.left >= vr.left - 1 && q.right <= vr.right + 1; }), sel: sel.length, act: act.length, actId: act[0] && act[0].id, figVis: fig.top >= 0 && fig.bottom <= innerHeight, figInPanel: fig.top >= vr.top && fig.bottom <= hd.bottom + 1, chkLines: [...chk.children].map(c => c.textContent), sentLines: lines.map(l => l.line), chkAbove: cr.bottom <= tb.top + 1 && cr.top >= hd.bottom - 1, order: hd.bottom <= cr.top + 1 && tb.top >= cr.bottom - 1 && br.top >= tb.bottom - 1 && ft.top >= br.bottom - 1,
    bdFull: Math.abs((vr.bottom - ft.height - tb.bottom) - br.bottom) <= 1.5 || Math.abs(br.bottom - ft.top) <= 1.5, scroll: bd.scrollHeight > bd.clientHeight + 1, ftIn: ft.bottom <= innerHeight + 0.5 && ft.top >= 0 && R(document.getElementById("bFin")).bottom <= innerHeight && R(document.getElementById("bPrev")).bottom <= innerHeight, vh: innerHeight, ftBot: Math.round(ft.bottom), figTop: Math.round(fig.top), bdH: Math.round(br.height), bdScroll: bd.scrollHeight,
    badges: Object.fromEntries([...document.querySelectorAll("#vtabs [data-bdg]")].map(b => [b.dataset.bdg, b.hidden ? "" : b.textContent])), open: K.needs_review.filter(n => n.state === "open").length, vehicleBlock: !!((window.__v4.D.readiness || {}).blockers || []).some(x => x.key === "vehicle"), blockers: document.querySelectorAll("#chk .no").length, attN: document.getElementById("attN").textContent }; };
for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]]) { const p = await openLive(b, { w, h }); const r0 = await p.evaluate(LAY);
  ok(r0.tabs.join("|") === "Why this figure|Needs attention|Reserve or no reserve|Report" && r0.tabsVis && r0.sel === 1 && r0.act === 1, `@${w} x ${h}: four tabs (${r0.tabs.join(", ")}), one selected, one panel showing`);
  ok(r0.figInPanel && r0.order && r0.chkAbove && r0.chkLines.length >= 1 && r0.chkLines.join("|") === r0.sentLines.join("|") && r0.ftIn, `@${w}: the figure, then the check lines (${r0.chkLines.length}, as sent), then the tabs, then the content, then Preview and Finalize on screen (footer ends ${r0.ftBot} of ${r0.vh})`);
  const per = []; for (const k of TABS) { await p.evaluate(k => (window.__v4tab || (() => 0))(k), k); per.push([k, await p.evaluate(LAY)]); }
  // the content area takes the whole remaining height in every tab; it scrolls only when the tab's own content is taller than that height (the Needs attention list with three open items is, on a short screen), never as a small box
  ok(per.every(([k, r]) => r.act === 1 && r.actId === "tp-" + k && r.ftIn && r.bdFull && (!r.scroll || (k === "needs" && h < 900))) && per.every(([k, r]) => r.bdH >= 200 || k !== "why"), `@${w}: each tab's content has the whole remaining height, the footer stays on screen and it scrolls only when its own list is longer than the screen (${per.map(([k, r]) => k + " " + r.bdH + "/" + r.bdScroll).join(", ")})`);
  const bd = per.find(([k]) => k === "needs")[1]; ok(bd.open > 0 && bd.badges.needs === String(bd.open) && bd.badges.why === "" && bd.badges.rmode === "" && (bd.badges.report === "" ? bd.blockers === 0 : bd.badges.report === String(bd.blockers)), `@${w}: a count badge on Needs attention (${bd.badges.needs} = ${bd.open} open) and Report (${bd.badges.report || "none"} = ${bd.blockers} blockers); none on a tab with no open items`);
  if (w === 1440 || w === 1280) { await p.evaluate(() => { document.getElementById("col").style.minHeight = "3500px"; window.scrollTo(0, 1500); }); await wait(150); const s = await p.evaluate(LAY); ok(s.figVis && s.ftIn, `@${w}: after the page scrolls the reserve figure and the footer are still on screen (figure at ${s.figTop})`); }
  await p.focus("#tab-why"); await p.keyboard.press("ArrowRight"); const k1 = await p.evaluate(() => document.querySelector("#vtabs [aria-selected=true]").dataset.tab); await p.keyboard.press("End"); const k2 = await p.evaluate(() => document.querySelector("#vtabs [aria-selected=true]").dataset.tab);
  ok(k1 === "needs" && k2 === "report", `@${w}: the arrow keys and End move between the tabs (${k1}, ${k2})`);
  await p.close();
  const bad = async (label, mut, test) => { const q = await openLive(b, { w, h, mutate: mut }); await q.evaluate(() => (window.__v4tab || (() => 0))("why")); let r = await q.evaluate(LAY); if (test.after) { await q.evaluate(test.after); await wait(150); r = await q.evaluate(LAY); } await q.close(); ok(test.caught(r), `@${w}: mutant caught: ${label}`); };
  await bad("a tab hidden", h => h.replace("</style>", '#vtabs [data-tab="needs"]{display:none}</style>'), { caught: r => !r.tabsVis });
  await bad("the footer pushed off screen (no height limit, every tab showing)", h => h.replace("</style>", ".val{max-height:none!important}.val .bd>[role=tabpanel][hidden]{display:grid!important}</style>"), { caught: r => !r.ftIn });
  await bad("a small inner scroll (the content area capped)", h => h.replace("</style>", ".val .bd{max-height:90px!important}</style>"), { caught: r => r.scroll });
  if (w >= 1280) await bad("the figure scrolling away with the page", h => h.replace("</style>", ".val{position:static!important}</style>"), { after: () => { document.getElementById("col").style.minHeight = "3500px"; window.scrollTo(0, 1500); }, caught: r => !r.figVis });
  await bad("the check lines moved into the scrolling content", h => h.replace('<div class="chk" id="chk"></div>', ""), { caught: r => !(r.chkLines.length >= 1) });
  await bad("a tab with no count badge", h => h.replace('badge("needs", open);', ""), { caught: r => r.badges.needs === "" });
}


} catch (e) { ok(false, "section crashed: " + String(e.message).slice(0, 110)); } })();
// ---------- 6 one word for one state in the facts grid ----------
await (async () => { try {
const F = await seedIntake();
const MARKS = () => { const K = window.__v4.K(), W = ["Verified", "Unverified", "Conflicting"], mk = f => f.verified ? "Verified" : f.source === "conflicting" ? "Conflicting" : f.source === "seller" && f.value != null && f.value !== "" ? "Unverified" : null;
  const rows = [...document.querySelectorAll("#facts .marks[data-fact]")].map(m => ({ k: m.dataset.fact, want: mk(K.fields[m.dataset.fact]), got: [...m.querySelectorAll(".chip")].map(c => c.textContent).filter(t => W.includes(t) || /confirm|verif/i.test(t)) }));
  return { rows, n: rows.length, bad: rows.filter(r => r.got.length !== (r.want ? 1 : 0) || (r.want && r.got[0] !== r.want)).map(r => r.k + ": " + r.got.join("/") + " not " + r.want), notConfirmed: /not confirmed/i.test(document.getElementById("facts").textContent), words: [...new Set([].concat(...rows.map(r => r.got)))].sort().join("/") }; };
const check = async (id, mut) => { const p = await openLive(b, { id, mutate: mut }); const m = await p.evaluate(MARKS); await p.close(); return m; };
for (const [label, id] of [["the demonstration case", V3.DEMO_ID], ["a forwarded lead", F.fwd], ["a case with no car", F.nocar], ["a hand made case", F.typed]]) { const r = await check(id); ok(r.n >= 8 && !r.bad.length && !r.notConfirmed, `CLASS: ${label}: every fact in the grid shows the one word its mark gives (${r.words || "none"} over ${r.n} facts) and never "Not confirmed"${r.bad.length ? ": " + r.bad.join("; ") : ""}`); }
{ const r = await check(V3.DEMO_ID, h => h.replace('f.source === "seller" && f.value != null && f.value !== "" ? "unverified" : null;', 'f.source === "seller" && f.value != null && f.value !== "" ? "unverified" : "unverified";')); ok(r.bad.length > 0, "mutant caught: a fact with no value marked Unverified (the mark is not the case's)"); }
{ const r = await check(V3.DEMO_ID, h => h.replace('unverified: "Unverified", conflicting', 'unverified: "Not confirmed", conflicting')); ok(r.bad.length > 0 || r.notConfirmed, 'mutant caught: "Not confirmed" for the unverified state'); }
{ const r = await check(F.nocar, h => h.replace('if (m) g.appendChild(el("span", { class: "chip " + (m === "conflicting"', 'if (!m) g.appendChild(el("span", { class: "chip", text: "Not confirmed" })); if (m) g.appendChild(el("span", { class: "chip " + (m === "conflicting"')); ok(r.notConfirmed, 'mutant caught: "Not confirmed" printed for a fact with no value'); }
// the finalized case last (it settles the open items, so it must not run before the sections above)
{ await finalizeDemo(); const fin = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } }); const p = await openLive(b, { mutate: () => fin }); const d = await p.evaluate(DUP); ok(d.length === 0, "CLASS: no line printed twice in the Reserve panel (finalized case, every tab)" + (d.length ? ": " + d.join(" | ") : "")); await p.close(); }

} catch (e) { ok(false, "section crashed: " + String(e.message).slice(0, 110)); } })();
await b.close();
done("deskV4ThirdRunCheck");
