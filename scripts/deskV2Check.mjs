// DESK V2 (Lane S, Nov 15 2026; /preview/desk2, lib/preview/deskV2.js). Offline: the page in Chrome, the door answered in process. Stage 1: the shell and the queue.
//   1 CREW ONLY on /preview/desk2 and /preview/desk2/case/:id; the routes are in vercel.json.
//   2 TOP BAR: GoAskSam Desk, the org name, the analyst's initials; no Search, Reports, Listings or Analytics tab.
//   3 RAIL ORDER: New case, a search box, then the eight statuses with the server's counts, then the cards of the chosen filter.
//   4 CARDS: thumb, title, seller, elapsed line, status pill, analyst, an attention mark only above 0, a Claim button only on an unassigned card.
//   5 NO DASH in any rendered text. NOTHING DRAWN THAT THE MODEL DID NOT SERVE: a card with no seller has no seller element.
//   6 GEOMETRY (Sam's first look, Nov 15): the rail is a 300px column at the left edge, full height, with no inner scroll box and all eight status rows in view; a card is 72px with a 48px thumb, the title on one line, seller dot elapsed under it, a pill only when the card's status is not the chosen filter,
//     the attention badge at the card's top right corner, outside the thumb (photo or monogram tile) and clear of Claim, Claim hidden until hover on a wide screen and always shown on a narrow one, the selected card pale green; no case chosen reads Choose a case. A tile (year, initial) stands for a missing photo.
//   7 STAGE 2, THE OPEN CASE: the compact header (title, status pill, seller, received line, analyst, the Original enquiry link), the vehicle summary (cover at 460px, a thumbnail strip with +N, every field with its tag Verified, Seller supplied or Needs confirmation, edited in place and sent as case_edit field), the market summary (the server's strip cells, the lens, the thin line only when served, a chart at half the old height with one dot per sale),
//     Closest sales (the first four as compact cards, View all N sales for the rest, In report, Exclude that asks for a reason and sends nothing without one, Hagerty first), no dash, nothing drawn that the model did not serve, no likely or analyst range.
//   Mutants (each must fail): a stage band, a Search tab, an attention mark at 0, a Claim button on an owned card, a tall card, a pill on every card, the badge outside the thumb, Claim always shown, an inner scroll box on the statuses, a 232px rail.
//   node scripts/deskV2Check.mjs
import { launch, imp, tally } from "./deskV3Harness.mjs";
import fs from "node:fs";
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
const { mintCrewCookieValue } = await imp("lib/_crew.js"), crewPage = (await imp("api/crewPage.js")).default, V2 = await imp("lib/preview/deskV2.js"), V3 = await imp("lib/preview/deskV3.js");
const { ok, done } = tally(), crew = "gas_crew=" + mintCrewCookieValue();
async function call(url, cookie) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { this.body = String(b || ""); return this; } };
  const u = new URL("https://goasksam.com" + url);
  await crewPage({ url, method: "GET", query: Object.fromEntries(u.searchParams), body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) }, socket: {} }, res); return res;
}
export const MUTANTS = {
  band: h => h.replace('<main class="col"', '<div class="stageband">Enquiry Evidence Proposal</div><main class="col"'),
  searchTab: h => h.replace('<span class="grow">', '<nav><button>Search</button><button>Reports</button></nav><span class="grow">'),
  attZero: h => h.replace('<a class="cd-a"', '<a class="cd-a"').replace(/(<span class="th[^>]*>)/, '$1<span class="att">0</span>'),
  claimOwned: h => h.replace(/(<div class="cd"[^>]*data-status="in_review"[\s\S]*?<\/a>)/, '$1<button type="button" class="claim" data-claim="x">Claim</button>'),
};
// Style mutants: applied to the page's CSS, judged by the Chrome measurements.
export const STYLE_MUTANTS = {
  tallCard: h => h.replace(".cd{position:relative;height:72px", ".cd{position:relative;height:104px"),
  pillAlways: h => h.replace(".pill[hidden]{display:none}", ".pill[hidden]{display:inline-block}"),
  badgeOnThumb: h => h.replace(".att{position:absolute;top:4px;right:6px", ".att{position:absolute;top:4px;right:236px"),
  badgeBelow: h => h.replace(".att{position:absolute;top:4px;right:6px", ".att{position:absolute;top:50px;right:6px"),
  claimAlways: h => h.replace("opacity:0}\n.cd:hover .claim", "opacity:1}\n.cd:hover .claim"),
  innerScroll: h => h.replace(".fls{display:flex;flex-direction:column;gap:2px;overflow:visible}", ".fls{display:flex;flex-direction:column;gap:2px;max-height:150px;overflow:auto}"),
  narrowRail: h => h.replace("grid-template-columns:300px", "grid-template-columns:232px").replace(".rail{width:300px", ".rail{width:232px"),
};
export function assertPage(html, tag, ok) {
  const txt = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
  ok(/GoAskSam Desk/.test(html) && /Hagerty Marketplace/.test(html) && /class="who"[^>]*>[A-Z0-9]{1,2}</.test(html), `${tag}: top bar has the name, the org and the initials`);
  ok(!/Search<|Reports<|Listings<|Analytics<|stageband/.test(html.replace(/placeholder="Search cases"/, "")), `${tag}: no Search, Reports, Listings or Analytics tab and no stage band`);
  ok(!/[–—]/.test(txt), `${tag}: no dash in any rendered text`);
  const order = ['id="newcase"', 'id="qs"', 'id="fls"', 'id="cards"'].map(s => html.indexOf(s)); ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), `${tag}: rail order is New case, search, statuses, cards`);
  ok(V2.STATUSES.every(([k, l]) => html.includes(`data-f="${k}"`) && html.includes(`<span>${l}</span>`)), `${tag}: the eight statuses are the filters`);
  ok(!/class="att"[^>]*>0</.test(html), `${tag}: no attention mark at 0`);
  const chunks = html.split('<div class="cd').slice(1), owned = chunks.filter(c => /data-status="(in_review|ready_to_send|assigned_to_me|report_sent)"/.test(c.slice(0, 200)));
  ok(owned.length > 0 && owned.every(c => !/data-claim/.test(c.split('<div class="cd')[0].split("</aside>")[0])), `${tag}: no Claim button on an owned card`);
}
const call1 = await Promise.all(["/api/crewPage?page=preview-desk2", "/api/crewPage?page=preview-desk2&case=" + V3.DEMO_ID].map(async url => [url, await call(url), await call(url, "gas_crew=v1.0.forged"), await call(url, crew)]));
for (const [url, a, f, c] of call1) { ok(a.code === 404 && f.code === 404, `${url}: no cookie and a forged cookie get the platform 404`); ok(c.code === 200 && /noindex/.test(c.body) && /no-store/.test(c.h["cache-control"] || ""), `${url}: the crew cookie gets the page, noindex, no-store`); }
const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")); ok(["/preview/desk2", "/preview/desk2/case/:id"].every(s => vj.rewrites.some(r => r.source === s && (r.has || []).some(h => h.key === "gas_crew"))), "vercel.json: both routes need the crew cookie");
const html = (await call("/api/crewPage?page=preview-desk2", crew)).body; assertPage(html, "queue", ok);
const m = V2.model2(await V3.deskModel({ query: {} })), total = Object.values(m.counts).reduce((a, b) => a + b, 0);
ok(m.cards.length === total && V2.STATUSES.every(([k]) => new RegExp(`data-count="${k}">${m.counts[k]}<`).test(html)), "the counts printed are the model's counts");
ok(m.cards.every(c => !c.seller || html.includes(`>${c.seller}<`)), "each card prints its seller");
const blank = V2.cardHtml({ id: "z", title: "1960 Test", seller: null, thumb: null, elapsedLine: null, statusKey: "in_review", statusLabel: "In review", analyst: "E1", needsAttention: 0 });
ok(!/cd-s|cd-e|att"|claim/.test(blank), "a card with no seller, no elapsed line, no attention and an analyst draws none of them");
ok(/data-claim/.test(V2.cardHtml({ id: "y", title: "t", statusKey: "new_enquiries", statusLabel: "New enquiries", analyst: null, needsAttention: 2 })) && /class="att"/.test(V2.cardHtml({ id: "y", title: "t", statusKey: "new_enquiries", statusLabel: "New enquiries", analyst: null, needsAttention: 2 })), "an unassigned card with attention above 0 carries Claim and the mark");
// in Chrome: the filter switches the cards, the search narrows, geometry holds
const b = await launch();
async function open(h, w = 1440) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.method() === "POST") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} (p._posts = p._posts || []).push(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(bd.action === "case_list" ? { ok: true, rows: [{ id: m.cards[0].id }] } : { ok: true }) }); } if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: h }); return r.respond({ status: 204, body: "" }); });
  p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160))); await p.goto("https://goasksam.com/preview/desk2", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 200)); return p; }
const p = await open(html);
for (const [k] of V2.STATUSES) { await p.click(`[data-f="${k}"]`); const r = await p.evaluate(k => { const v = [...document.querySelectorAll(".cd")].filter(c => !c.hidden); return { only: v.every(c => c.dataset.status === k), n: v.length, none: !document.getElementById("none").hidden }; }, k); ok(r.only && (r.n > 0) === !r.none, `filter ${k} shows only its cards`); }
await p.click('[data-f="new_enquiries"]'); await p.type("#qs", "x"); await new Promise(r => setTimeout(r, 500));
ok((await p.evaluate(() => document.querySelectorAll(".cd[data-hit]:not([hidden])").length)) === 1, "the search shows the cases case_list answered");
ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !p._err.length, "no horizontal overflow, no page error at 1440");
await p.close();
// ---------- 6 geometry, measured in Chrome ----------
const MEASURE = () => {
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, rail = document.getElementById("rail"), fls = document.getElementById("fls"), cs = [...document.querySelectorAll(".cd")].filter(c => !c.hidden);
  const inter = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t, sel = document.querySelector(".cd.on");
  const scroller = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return true; if ((o === "auto" || o === "scroll") && n !== document.documentElement) return true; } return false; };
  return { rail: R(rail), vh: innerHeight, topbar: R(document.getElementById("top")), fl: [...fls.children].map(R), flsScroll: scroller(fls) || scroller(rail), cards: cs.map(c => { const t = c.querySelector(".th"), a = c.querySelector(".att"), cl = c.querySelector(".claim"), ti = c.querySelector(".cd-t"), pl = c.querySelector(".pill"); return { card: R(c), th: R(t), att: a ? R(a) : null, claim: cl ? R(cl) : null, claimOp: cl ? Number(getComputedStyle(cl).opacity) : null, titleH: R(ti).h, titleWrap: getComputedStyle(ti).whiteSpace, pill: pl ? { shown: getComputedStyle(pl).display !== "none", st: pl.dataset.st } : null, st: c.dataset.status, tile: t.classList.contains("none") ? t.textContent : null }; }), selBg: sel ? getComputedStyle(sel).backgroundColor : null, choose: (document.getElementById("choose") || {}).textContent || null, filter: document.querySelector(".fl.on").dataset.f };
};
export function judge(m, ok, tag, wide = true) {
  const inter = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  ok(Math.abs(m.rail.w - 300) <= 1 && m.rail.l <= 1, `${tag}: the rail is 300px at the left edge`); ok(m.rail.b >= m.vh - 1 && m.rail.t <= m.topbar.b + 1, `${tag}: the rail is full height under the bar`);
  ok(m.fl.length === 8 && m.fl.every(r => r.b <= m.rail.b && r.h > 0) && !m.flsScroll, `${tag}: all eight status rows are in view with no inner scroll box`);
  ok(m.cards.length > 0 && m.cards.every(c => Math.abs(c.card.h - 72) <= 1), `${tag}: every card is 72px tall`);
  ok(m.cards.every(c => Math.abs(c.th.w - 48) <= 1 && Math.abs(c.th.h - 48) <= 1), `${tag}: every thumb is 48px`);
  ok(m.cards.every(c => c.titleWrap === "nowrap" && c.titleH < 22), `${tag}: the title is on one line`);
  ok(m.cards.every(c => c.pill && c.pill.shown === (c.st !== m.filter)), `${tag}: a pill shows only when the card's status is not the filter`);
  ok(m.cards.filter(c => c.att).every(c => c.card.r - c.att.r <= 12 && c.att.t - c.card.t <= 10 && !inter(c.att, c.th) && (!c.claim || !inter(c.att, c.claim))), `${tag}: the badge sits at the top right corner of the card, outside the thumb and clear of Claim`);
  ok(m.cards.filter(c => c.claim).every(c => wide ? c.claimOp === 0 : c.claimOp === 1), `${tag}: Claim is ${wide ? "hidden until hover" : "always shown"}`);
  ok(m.cards.filter(c => c.tile).every(c => /^\d{4}\D/.test(c.tile) || c.tile.length > 0), `${tag}: a card with no photo has a tile`);
  if (m.selBg) { const [r, g, b] = m.selBg.match(/\d+/g).map(Number); ok(g > r && g >= b, `${tag}: the selected card is pale green`); }
}
// the geometry page: one unassigned lead with attention marks and a long title and seller (so Claim, the badge, the truncation and the pill rule are all on screen), the rest as the model has them
const gm = await V3.deskModel({ query: {} }); gm.cases[0] = { ...gm.cases[0], mine: false, group: "new", needsAttention: 3, car: "1972 Datsun 240Z Coupe with a very long title that cannot fit on one line of the card", seller: "A Seller With A Rather Long Name" };
const ghtml = V2.pageHtml(gm), gopen = async (h, w = 1440) => { const q = await open(h, w); await q.click('[data-f="new_enquiries"]'); return q; };
{ const q = await gopen(ghtml); const m0 = await q.evaluate(MEASURE); judge(m0, ok, "rail", true); ok(m0.cards.some(c => c.claim && c.att), "the geometry page has a card with Claim and a badge"); await q.close();
  const an = await (await gopen(ghtml)).evaluate(() => [...document.querySelectorAll(".cd")].map(c => [!!c.querySelector(".claim"), !!c.querySelector(".cd-an")])); ok(an.length > 0 && an.every(([claim, name]) => claim !== name), "the analyst's name follows the elapsed line only when the case is assigned");
  const q0 = await open(html); ok((await q0.evaluate(MEASURE)).choose === "Choose a case", "no case chosen reads Choose a case"); await q0.close();
  const q2 = await gopen(ghtml, 600); const m1 = await q2.evaluate(MEASURE); ok(m1.cards.some(c => c.claim) && m1.cards.filter(c => c.claim).every(c => c.claimOp === 1), "narrow: Claim is always shown"); await q2.close();
  const q3 = await open((await call("/api/crewPage?page=preview-desk2&case=pv_thin", crew)).body); const m3 = await q3.evaluate(MEASURE); ok(m3.selBg && m3.cards.length > 0, "an open case's card is selected"); judge(m3, ok, "open case", true); await q3.close();
  for (const [name, f] of Object.entries(STYLE_MUTANTS)) { const mh = f(ghtml); if (mh === ghtml) { ok(false, "mutant target missing: " + name); continue; } const q4 = await gopen(mh); const mm = await q4.evaluate(MEASURE); let bad = 0; judge(mm, c => { if (!c) bad++; }, "mutant " + name, true); ok(bad > 0, `mutant ${name} is caught`); await q4.close(); } }
for (const [name, f] of Object.entries(MUTANTS)) { const mh = f(html); if (mh === html) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; assertPage(mh, "mutant " + name, (c) => { if (!c) bad++; }); ok(bad > 0, `mutant ${name} is caught`); }

// ---------- 7 stage 2, the open case, in Chrome ----------
export function assertCase(txt, tag, ok) { ok(!/[\u2013\u2014]/.test(txt), `${tag}: no dash in any rendered text`); ok(!/likely|analyst range|stage band/i.test(txt), `${tag}: no likely range, no analyst range`); }
const chtml = (await call("/api/crewPage?page=preview-desk2&case=pv_hm", crew)).body;
const cm = await V3.deskModel({ query: { case: "pv_hm" } }), K = cm.kase, DK = K.desk, ev2 = DK.evidence, sales = DK.sales.filter(s => s.price > 0);
const wait = ms => new Promise(r => setTimeout(r, ms));
{ const q = await open(chtml);
  const t = await q.evaluate(() => ({ text: document.body.innerText, title: document.getElementById("ct").textContent, pill: document.getElementById("hpill").textContent, meta: document.getElementById("hmeta").textContent, enq: !!document.getElementById("enqlink"), cover: document.getElementById("cover").getBoundingClientRect().width, pt: document.querySelectorAll("#pstrip .pt:not(.more)").length, more: (document.getElementById("pmore") || {}).textContent || null,
    rows: [...document.querySelectorAll(".fr")].map(r => ({ f: r.dataset.field, l: r.querySelector(".fl2").textContent, v: r.querySelector(".fv").textContent, tg: (r.querySelector(".tg") || {}).textContent || null })), cells: [...document.querySelectorAll(".mc")].map(c => [c.querySelector(".mcl").textContent, c.querySelector(".mcv").textContent]), dots: document.querySelectorAll("#plot circle").length, plotH: document.getElementById("plot").getBoundingClientRect().height, lens: [...document.querySelectorAll("#lens button")].map(b => b.textContent), thin: !!document.getElementById("thinline"),
    cards: [...document.querySelectorAll(".sc")].map(c => ({ price: !!c.querySelector(".spr").textContent, title: !!c.querySelector(".stt").textContent, link: !!c.querySelector(".slink"), tick: !!c.querySelector("[data-tick]"), ex: !!c.querySelector("[data-exclude]"), why: !!c.querySelector(".sw"), m: c.querySelector(".sm").textContent })), viewall: (document.getElementById("viewall") || {}).textContent || null }));
  assertCase(t.text, "case", ok);
  ok(t.title === DK.titleLine && /^\w/.test(t.pill) && t.meta.includes(K.seller.name) && t.meta.includes(K.vehicle.submittedLine) && t.enq, "the header has the title, the status pill, the seller, the received line, the analyst and the Original enquiry link");
  ok(Math.abs(t.cover - 460) <= 2 && t.pt === Math.min(5, K.photos.items.length) && t.more === "+" + (K.photos.items.length - 5), "the cover is 460px wide, the strip has up to five thumbnails and the +N");
  const tagOk = { verified: "Verified", seller: "Seller supplied", needs: "Needs confirmation" };
  ok(t.rows.every(r => !r.tg || Object.values(tagOk).includes(r.tg)) && ["vin", "generation", "mileage", "transmission"].every(k => t.rows.some(r => r.f === k && r.tg)), "every field row carries a tag from the three words");
  ok(t.rows.find(r => r.f === "vin").tg === "Seller supplied" && t.rows.find(r => r.f === "generation").tg === "Verified", "a seller field is Seller supplied and a decoded one is Verified");
  ok(t.cells.length === ev2.strip.length && ev2.strip.every((c, i) => t.cells[i][0] === c.label && t.cells[i][1] === c.value), "the stat strip prints the server's cells as sent");
  ok(t.dots === sales.length && t.plotH <= 90, `the chart has one dot per sale (${t.dots}) at half the old height (${t.plotH}px)`);
  ok(t.lens.length === DK.windows.length && !t.thin, "the lens has the server's periods; no thin line when the model says none");
  ok(t.cards.length === 4 && t.cards.every(c => c.price && c.title && c.link && c.tick && c.ex && c.why && /\u00b7/.test(c.m)), "Closest sales shows the first four as cards with price, title, miles, venue and month, why, link, In report and Exclude");
  ok(t.viewall === "View all " + (DK.comparablesCount != null ? DK.comparablesCount : DK.comparables.length) + " sales", "View all N sales");
  await q.click("#viewall"); ok((await q.evaluate(() => document.querySelectorAll(".sc").length)) === (DK.comparables.length), "View all shows the rest of the sales");
  await q.click("#viewall");
  // exclude asks for a reason and sends nothing without one
  const id = DK.comparables[0].id; await q.click(`[data-exclude="${id}"]`); await q.click(`[data-confirm="${id}"]`); await wait(150);
  ok(!(q._posts || []).some(b => b.op === "exclude"), "an exclude with no reason sends nothing");
  await q.type(`[data-reason="${id}"]`, "a replica"); await q.click(`[data-confirm="${id}"]`); await wait(200);
  ok((q._posts || []).some(b => b.op === "exclude" && b.saleId === String(id) && b.reason === "a replica"), "an exclude with a reason sends it");
  await q.click(`[data-tick="${DK.comparables[1].id}"]`); await wait(150); ok((q._posts || []).some(b => b.op === "comparables" && b.ids.includes(String(DK.comparables[1].id))), "In report sends the ticked ids");
  await q.click('#lens button:not(.on)'); await wait(200); ok((q._posts || []).some(b => b.op === "window"), "a lens button sends the window");
  await q.click('[data-field="mileage"] .fv'); await q.$eval('[data-field="mileage"] input', i => { i.value = "70,000"; }); await q.keyboard.press("Enter"); await wait(150);
  ok((q._posts || []).some(b => b.op === "field" && b.field === "mileage" && b.value === "70,000"), "a field is edited in place and sent as case_edit field");
  await q.click("#enqlink"); ok(await q.evaluate(() => !document.getElementById("enq").hidden), "Original enquiry expands");
  ok(!q._err.length, "no page error on the open case"); await q.close(); }
// nothing drawn that the model did not serve: a case with no photos, no email, no documents, no prior auction row, no sales
{ const bm = await V3.deskModel({ query: { case: "pv_240z" } }); bm.kase = { ...bm.kase, photos: { items: [], coverId: null }, documents: [], sourceEmail: null, priorCases: null, documentsLine: null, desk: { ...bm.kase.desk, sales: [], comparables: [], windows: [], evidence: { ...bm.kase.desk.evidence, strip: [] } } };
  globalThis.__emptyHtml = V2.pageHtml(bm); const q = await open(globalThis.__emptyHtml); const n = await q.evaluate(() => ({ strip: !!document.getElementById("pstrip"), more: !!document.getElementById("pmore"), enq: !!document.getElementById("enqlink"), prior: !!document.getElementById("prior"), plot: !!document.getElementById("plot"), thin: !!document.getElementById("thinline"), cards: document.querySelectorAll(".sc").length, viewall: !!document.getElementById("viewall"), docs: !!document.querySelector('[data-field="auction"]'), cells: document.querySelectorAll(".mc").length }));
  ok(!n.strip && !n.more && !n.enq && !n.prior && !n.plot && !n.thin && !n.cards && !n.viewall && !n.docs && !n.cells, "no element for anything the model does not serve"); await q.close(); }
// Hagerty first, with its mark and a highlighted dot
{ const hm = await V3.deskModel({ query: { case: "pv_hm" } }); hm.kase = { ...hm.kase, desk: { ...hm.kase.desk, comparables: hm.kase.desk.comparables.map((c, i) => i === 3 ? { ...c, platform: "Hagerty" } : c), sales: hm.kase.desk.sales.map((s, i) => i === 0 ? { ...s, platform: "Hagerty" } : s) } };
  const q = await open(V2.pageHtml(hm)); const h = await q.evaluate(() => ({ first: document.querySelector(".sc").classList.contains("hag"), mark: !!document.querySelector(".sc .hmark"), dot: !!document.querySelector("#plot circle[data-hagerty]") })); ok(h.first && h.mark && h.dot, "a Hagerty sale comes first in Closest sales with its mark and a highlighted dot"); await q.close(); }
// mutants on the open case
const CASE_MUT = {
  noReasonGate: h => h.replace("if(!why2){inp.placeholder=\"Say why first\";inp.focus();return}", ""),
  fiveCards: h => h.replace("ordered.slice(0,4)", "ordered.slice(0,5)"),
  likelyLabel: h => h.replace('text:"What the market paid"', 'text:"Likely selling range"'),
  noTag: h => h.replace("if(tag)r.appendChild(el(\"em\"", "if(false)r.appendChild(el(\"em\""),
  dashText: h => h.replace('text:"Original enquiry"', 'text:"Original \\u2014 enquiry"'),
  drawNoSales: h => h.replace("if(!sales.length||e.insufficient){return}", ""),
};
for (const [name, f] of Object.entries(CASE_MUT)) { const base = name === "drawNoSales" ? globalThis.__emptyHtml : chtml, mh = f(base); if (mh === base) { ok(false, "mutant target missing: " + name); continue; }
  const q = await open(mh); let bad = 0; const cnt = c => { if (!c) bad++; };
  const text = await q.evaluate(() => document.body.innerText); assertCase(text, "mutant " + name, cnt);
  if (name === "noReasonGate") { const id = DK.comparables[0].id; await q.click(`[data-exclude="${id}"]`); await q.click(`[data-confirm="${id}"]`); await wait(150); cnt(!(q._posts || []).some(b => b.op === "exclude")); }
  if (name === "drawNoSales") cnt(!(await q.evaluate(() => !!document.getElementById("plot"))));
  if (name === "fiveCards") cnt((await q.evaluate(() => document.querySelectorAll(".sc").length)) === 4);
  if (name === "noTag") cnt((await q.evaluate(() => document.querySelectorAll(".fr .tg").length)) > 0);
  await q.close(); ok(bad > 0, `mutant ${name} is caught`); }
await b.close(); done("deskV2Check");
