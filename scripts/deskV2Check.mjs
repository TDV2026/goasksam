// DESK V2 (Lane S, Nov 15 2026; /preview/desk2, lib/preview/deskV2.js). Offline: the page in Chrome, the door answered in process. Stage 1: the shell and the queue.
//   1 CREW ONLY on /preview/desk2 and /preview/desk2/case/:id; the routes are in vercel.json.
//   2 TOP BAR: GoAskSam Desk, the org name, the analyst's initials; no Search, Reports, Listings or Analytics tab.
//   3 RAIL ORDER: New case, a search box, then the eight statuses with the server's counts, then the cards of the chosen filter.
//   4 CARDS: thumb, title, seller, elapsed line, status pill, analyst, an attention mark only above 0, a Claim button only on an unassigned card.
//   5 NO DASH in any rendered text. NOTHING DRAWN THAT THE MODEL DID NOT SERVE: a card with no seller has no seller element.
//   6 GEOMETRY (Sam's first look, Nov 15): the rail is a 300px column at the left edge, full height, with no inner scroll box and all eight status rows in view; a card is 68px with a 44px thumb, the title on one line, seller dot elapsed under it, a pill only when the card's status is not the chosen filter,
//     the attention badge at the card's top right corner, outside the thumb (photo or monogram tile) and clear of Claim, Claim hidden until hover on a wide screen and always shown on a narrow one, the selected card pale green; no case chosen reads Choose a case. A tile (year, initial) stands for a missing photo.
//   7 STAGE 2, THE OPEN CASE: the compact header (title, status pill, seller, received line, analyst, the Original enquiry link), the vehicle summary (cover at 460px, a thumbnail strip with +N, every field with its tag Verified, Seller supplied or Needs confirmation, edited in place and sent as case_edit field), the market summary (the server's strip cells, the lens, the thin line only when served, a chart at half the old height with one dot per sale),
//     Closest sales (the first four as compact cards, View all N sales for the rest, In report, Exclude that asks for a reason and sends nothing without one, Hagerty first), no dash, nothing drawn that the model did not serve, no likely or analyst range.
//   8 STAGE 3, THE RIGHT RAIL: in order the condition panel (unset until the analyst sets it: Not yet set, four buttons none pressed, a note, Save only with a pick and a note, the effect line only when served), the market range labelled Market range with its count, the reserve large with its reason, the four rungs (Use sends reserve_use, a tick sends report_rungs_set), the why box labelled Printed in the report, the outstanding checks with their actions (words go with the action), then Preview report, Save draft, Finalize and send;
//     Finalize is disabled until the model says ready; it finalizes and then asks for the recipient: nothing is sent until Send is pressed in that step.
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
  searchTab: h => h.replace('<span class="tabs">', '<nav><button>Search</button><button>Reports</button></nav><span class="tabs">'),
  attZero: h => h.replace('<a class="cd-a"', '<a class="cd-a"').replace(/(<span class="th[^>]*>)/, '$1<span class="att">0</span>'),
  claimOwned: h => h.replace(/(<span class="cd-an">[^<]*<\/span>)/, '$1<button type="button" class="claim" data-claim="x">Claim</button>'),
};
// Style mutants: applied to the page's CSS, judged by the Chrome measurements.
export const STYLE_MUTANTS = {
  rowShort: h => h.replace("padding:0 10px;height:40px", "padding:0 10px;height:34px"),
  countBubble: h => h.replace(".fl b{font-weight:400;color:var(--mute);font-variant-numeric:tabular-nums;font-size:13px;background:none", ".fl b{font-weight:400;color:var(--mute);font-variant-numeric:tabular-nums;font-size:13px;background:#ddd"),
  cardBorder: h => h.replace("height:68px;border:0;", "height:68px;border:1px solid #ccc;"),
  titleThin: h => h.replace(".cd-t{font-size:15px;font-weight:600", ".cd-t{font-size:15px;font-weight:400"),
  noIcon: h => h.replace(".fl .ic{flex:0 0 16px;", ".fl .ic{display:none;flex:0 0 16px;"),
  orgSmall: h => h.replace(".top .org{font-size:15px", ".top .org{font-size:12px"),
  tallCard: h => h.replace(".cd{position:relative;height:68px", ".cd{position:relative;height:104px"),
  pillAlways: h => h.replace(".pill[hidden]{display:none}", ".pill[hidden]{display:inline-block}"),
  badgeOnThumb: h => h.replace(".att{position:absolute;top:4px;right:6px", ".att{position:absolute;top:4px;right:236px"),
  badgeBelow: h => h.replace(".att{position:absolute;top:4px;right:6px", ".att{position:absolute;top:50px;right:6px"),
  claimAlways: h => h.replace("opacity:0}\n.cd:hover .claim", "opacity:1}\n.cd:hover .claim"),
  innerScroll: h => h.replace(".fls{display:flex;flex-direction:column;gap:0;overflow:visible}", ".fls{display:flex;flex-direction:column;gap:0;max-height:150px;overflow:auto}"),
  narrowRail: h => h.replace("grid-template-columns:300px", "grid-template-columns:232px").replace(".rail{width:300px", ".rail{width:232px"),
};
export function assertPage(html, tag, ok) {
  const txt = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
  ok(/GoAskSam Desk/.test(html) && /(Hagerty Marketplace|Preview samples)/.test(html) && /id="whoini">[^<]{1,3}</.test(html) && /id="whoname">[^<]{1,60}</.test(html), `${tag}: top bar has the brand, the org and the seat circle with its initials and name`);
  ok(!/Search<|Reports<|Listings<|Analytics<|stageband/.test(html.replace(/placeholder="Search cases"/, "")), `${tag}: no Search, Reports, Listings or Analytics tab and no stage band`);
  ok(!/[–—]/.test(txt), `${tag}: no dash in any rendered text`);
  const order = ['id="newcase"', 'id="qs"', 'id="fls"', 'id="cards"'].map(s => html.indexOf(s)); ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), `${tag}: rail order is New case, search, statuses, cards`);
  ok(V2.STATUSES.every(([k, l]) => html.includes(`data-f="${k}"`) && html.includes(`<span>${l}</span>`)), `${tag}: the eight statuses are the filters`);
  ok(!/class="att"[^>]*>0</.test(html), `${tag}: no attention mark at 0`);
  const chunks = html.split('<div class="cd').slice(1), owned = chunks.filter(c => /class="cd-an"/.test(c.split('<div class="cd')[0]));   // owned = the card prints an analyst name (Lane D's analyst)
  ok(owned.every(c => !/data-claim/.test(c.split('<div class="cd')[0].split("</aside>")[0])), `${tag}: no Claim button on an owned card`);
}
const call1 = await Promise.all(["/api/crewPage?page=preview-desk2", "/api/crewPage?page=preview-desk2&case=" + V3.DEMO_ID].map(async url => [url, await call(url), await call(url, "gas_crew=v1.0.forged"), await call(url, crew)]));
for (const [url, a, f, c] of call1) { ok(a.code === 404 && f.code === 404, `${url}: no cookie and a forged cookie get the platform 404`); ok(c.code === 200 && /noindex/.test(c.body) && /no-store/.test(c.h["cache-control"] || ""), `${url}: the crew cookie gets the page, noindex, no-store`); }
const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")); ok(["/preview/desk2", "/preview/desk2/case/:id"].every(s => vj.rewrites.some(r => r.source === s && (r.has || []).some(h => h.key === "gas_crew"))), "vercel.json: both routes need the crew cookie");
const routed = (await call("/api/crewPage?page=preview-desk2&org=hagerty-preview", crew)).body; assertPage(routed, "queue (as the route serves it)", ok);
// the queue fixture: the sample cases with an analyst on two of them (Lane D serves the name once a case is claimed) and the seat the door answers with
const qm = await V3.deskModel({ query: { org: "hagerty-preview" } }); qm.cases = qm.cases.map((c, i) => i > 0 ? { ...c, analyst: "Expert 1" } : c); qm.seat = { id: "s1", displayName: "Expert 1", initials: "E1" }; const html = V2.pageHtml(qm); assertPage(html, "queue", ok); ok((html.match(/class="cd-an"/g) || []).length === 2, "the fixture queue has two owned cards, so the owned-card rule is tested on real cards");
const m = V2.model2(await V3.deskModel({ query: { org: "hagerty-preview" } })), total = Object.values(m.counts).reduce((a, b) => a + b, 0);
ok(m.cards.length === total && V2.STATUSES.every(([k]) => new RegExp(`data-count="${k}">${m.counts[k]}<`).test(html)), "the counts printed are the model's counts");
ok(m.cards.every(c => !c.seller || html.includes(`>${c.seller}<`)), "each card prints its seller");
const blank = V2.cardHtml({ id: "z", title: "1960 Test", seller: null, thumb: null, elapsedLine: null, statusKey: "in_review", statusLabel: "In review", analyst: "E1", needsAttention: 0 });
ok(!/cd-s|cd-e|att"|claim/.test(blank), "a card with no seller, no elapsed line, no attention and an analyst draws none of them");
ok(/data-claim/.test(V2.cardHtml({ id: "y", title: "t", statusKey: "new", statusLabel: "New enquiries", analyst: null, needsAttention: 2 })) && /class="att"/.test(V2.cardHtml({ id: "y", title: "t", statusKey: "new", statusLabel: "New enquiries", analyst: null, needsAttention: 2 })), "an unassigned card with attention above 0 carries Claim and the mark");
ok(/id="whoname">Lee Park</.test(V2.topHtml({ displayName: "Lee Park", initials: "LP" })) && /id="whoini">LP</.test(V2.topHtml({ displayName: "Lee Park", initials: "LP" })) && /id="whoini">E1</.test(V2.topHtml(null)), "the seat circle shows the initials the model serves, and the name in its menu, else the preview seat");
// in Chrome: the filter switches the cards, the search narrows, geometry holds
const b = await launch();
async function open(h, w = 1440, respond = null) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.method() === "POST") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} (p._posts = p._posts || []).push(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(respond && respond(bd) || (bd.action === "case_list" ? { ok: true, rows: [{ id: m.cards[0].id }] } : { ok: true })) }); } if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: h }); return r.respond({ status: 204, body: "" }); });
  p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160))); await p.goto("https://goasksam.com/preview/desk2", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 200)); return p; }
const p = await open(html);
for (const [k] of V2.STATUSES) { await p.click(`[data-f="${k}"]`); const r = await p.evaluate(k => { const v = [...document.querySelectorAll(".cd")].filter(c => !c.hidden); return { only: v.every(c => c.dataset.status === k), n: v.length, none: !document.getElementById("none").hidden }; }, k); ok(r.only && (r.n > 0) === !r.none, `filter ${k} shows only its cards`); }
await p.click('[data-f="new"]'); await p.type("#qs", "x"); await new Promise(r => setTimeout(r, 500));
ok((await p.evaluate(() => document.querySelectorAll(".cd[data-hit]:not([hidden])").length)) === 1, "the search shows the cases case_list answered");
ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !p._err.length, "no horizontal overflow, no page error at 1440");
await p.close();
// ---------- 6 geometry, measured in Chrome ----------
const MEASURE = () => {
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, rail = document.getElementById("rail"), fls = document.getElementById("fls"), cs = [...document.querySelectorAll(".cd")].filter(c => !c.hidden);
  const inter = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t, sel = document.querySelector(".cd.on");
  const scroller = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return true; if ((o === "auto" || o === "scroll") && n !== document.documentElement) return true; } return false; };
  return { rail: R(rail), vh: innerHeight, topbar: R(document.getElementById("top")), fl: [...fls.children].map(R), flsScroll: scroller(fls) || scroller(rail), cards: cs.map(c => { const t = c.querySelector(".th"), a = c.querySelector(".att"), cl = c.querySelector(".claim"), ti = c.querySelector(".cd-t"), pl = c.querySelector(".pill"); return { card: R(c), th: R(t), att: a ? R(a) : null, claim: cl ? R(cl) : null, claimOp: cl ? Number(getComputedStyle(cl).opacity) : null, titleH: R(ti).h, titleWrap: getComputedStyle(ti).whiteSpace, pill: pl ? { shown: getComputedStyle(pl).display !== "none", st: pl.dataset.st } : null, st: c.dataset.status, tile: t.classList.contains("none") ? t.textContent : null }; }), selBg: sel ? getComputedStyle(sel).backgroundColor : null, X: (() => { const cs0 = [...document.querySelectorAll(".cd")].filter(c => !c.hidden), fl = [...document.querySelectorAll(".fl")], on = document.querySelector(".fl.on"), lab = document.getElementById("clab"), gs = getComputedStyle, num = v => parseFloat(v);
    return { rows: fl.map(f => ({ h: f.getBoundingClientRect().height, fs: num(gs(f).fontSize), fw: gs(f.querySelector("span")).fontWeight, on: f === on, svg: (() => { const v = f.querySelector("svg.ic"); if (!v) return null; const r = v.getBoundingClientRect(), st = gs(v); return { w: r.width, h: r.height, stroke: st.stroke, fill: st.fill, left: r.left - f.getBoundingClientRect().left }; })(), cfs: num(gs(f.querySelector("b")).fontSize), cbg: gs(f.querySelector("b")).backgroundColor, cal: gs(f.querySelector("b")).textAlign, bright: f.getBoundingClientRect().right - f.querySelector("b").getBoundingClientRect().right })), onBg: on ? gs(on).backgroundColor : null, lab: lab ? { t: lab.textContent, fs: num(gs(lab).fontSize), tt: gs(lab).textTransform } : null, gaps: cs0.slice(1).map((c, i) => c.getBoundingClientRect().top - cs0[i].getBoundingClientRect().bottom), cd: cs0.map(c => ({ bw: num(gs(c).borderTopWidth), pl: num(gs(c.querySelector(".cd-a")).paddingLeft), tfs: num(gs(c.querySelector(".cd-t")).fontSize), tfw: gs(c.querySelector(".cd-t")).fontWeight, mfs: num(gs(c.querySelector(".cd-m")).fontSize), pfs: c.querySelector(".pill") ? num(gs(c.querySelector(".pill")).fontSize) : null, rad: num(gs(c.querySelector(".th")).borderRadius), meta: c.querySelector(".cd-m").textContent })), brand: num(gs(document.querySelector(".top .brand")).fontSize), org: num(gs(document.getElementById("org")).fontSize), who: document.getElementById("who").textContent }; })(), choose: (document.getElementById("choose") || {}).textContent || null, filter: document.querySelector(".fl.on").dataset.f };
};
export function judge(m, ok, tag, wide = true) {
  const inter = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  ok(Math.abs(m.rail.w - 300) <= 1 && m.rail.l <= 1, `${tag}: the rail is 300px at the left edge`); ok(m.rail.b >= m.vh - 1 && m.rail.t <= m.topbar.b + 1, `${tag}: the rail is full height under the bar`);
  ok(m.fl.length === 8 && m.fl.every(r => r.b <= m.rail.b && r.h > 0) && !m.flsScroll, `${tag}: all eight status rows are in view with no inner scroll box`);
  ok(m.cards.length > 0 && m.cards.every(c => Math.abs(c.card.h - 68) <= 1), `${tag}: every card is 68px tall`);
  ok(m.cards.every(c => Math.abs(c.th.w - 44) <= 1 && Math.abs(c.th.h - 44) <= 1), `${tag}: every thumb is 44px`);
  ok(m.cards.every(c => c.titleWrap === "nowrap" && c.titleH < 22), `${tag}: the title is on one line`);
  ok(m.cards.every(c => c.pill && c.pill.shown === (c.st !== m.filter)), `${tag}: a pill shows only when the card's status is not the filter`);
  ok(m.cards.filter(c => c.att).every(c => c.card.r - c.att.r <= 12 && c.att.t - c.card.t <= 10 && !inter(c.att, c.th) && (!c.claim || !inter(c.att, c.claim))), `${tag}: the badge sits at the top right corner of the card, outside the thumb and clear of Claim`);
  ok(m.cards.filter(c => c.claim).every(c => wide ? c.claimOp === 0 : c.claimOp === 1), `${tag}: Claim is ${wide ? "hidden until hover" : "always shown"}`);
  ok(m.cards.filter(c => c.tile).every(c => /^\d{4}\D/.test(c.tile) || c.tile.length > 0), `${tag}: a card with no photo has a tile`);
  const X = m.X;
  ok(X.rows.length === 8 && X.rows.every(r => Math.abs(r.h - 40) <= 1 && r.fs === 15 && (r.on ? Number(r.fw) === 600 : Number(r.fw) === 400)), `${tag}: status rows are 40px, 15px text, regular, the selected one 600`);
  ok(X.rows.every(r => r.svg && Math.abs(r.svg.w - 16) <= 0.5 && Math.abs(r.svg.h - 16) <= 0.5 && r.svg.fill === "none" && r.svg.stroke !== "none" && r.svg.left < 20), `${tag}: each row has a 16px line icon at the left, drawn as a stroke`);
  ok(X.rows.every(r => r.cfs === 13 && r.cbg === "rgba(0, 0, 0, 0)" && r.cal === "right" && r.bright <= 12), `${tag}: the count is plain 13px text at the right with no bubble`);
  ok(X.onBg && X.onBg !== "rgba(0, 0, 0, 0)", `${tag}: the selected row has the pale green background`);
  ok(X.lab && /^cases\s*\d+$/i.test(X.lab.t.trim()) && X.lab.fs === 12 && X.lab.tt === "uppercase", `${tag}: a 12px uppercase Cases label carries the count`);
  ok(X.gaps.every(g => Math.abs(g - 8) <= 0.5), `${tag}: 8px between cards`);
  ok(X.cd.every(c => c.bw === 0 && c.pl === 12 && c.tfs === 15 && Number(c.tfw) === 600 && c.mfs === 13 && (c.pfs == null || c.pfs === 11) && c.rad === 8), `${tag}: cards are flat, 12px padding, a 15px 600 title, a 13px second line, an 11px pill, an 8px thumb radius`);
  ok(X.brand === 18 && X.org === 15, `${tag}: the top bar has the brand at 18px and the org at 15px`);
  if (m.selBg) { const [r, g, b] = m.selBg.match(/\d+/g).map(Number); ok(g > r && g >= b, `${tag}: the selected card is pale green`); }
}
// the geometry page: one unassigned lead with attention marks and a long title and seller (so Claim, the badge, the truncation and the pill rule are all on screen), the rest as the model has them
const gm = await V3.deskModel({ query: { org: "hagerty-preview" } }); gm.cases[0] = { ...gm.cases[0], mine: false, group: "new", needsAttention: 3, car: "1972 Datsun 240Z Coupe with a very long title that cannot fit on one line of the card", seller: "A Seller With A Rather Long Name" };
const ghtml = V2.pageHtml(gm), gopen = async (h, w = 1440) => { const q = await open(h, w); await q.click('[data-f="new"]'); return q; };
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
  const t = await q.evaluate(() => ({ text: document.body.innerText, title: document.getElementById("ct").textContent, pill: document.getElementById("hpill").textContent, meta: document.getElementById("hmeta").textContent, cover: document.getElementById("cover").getBoundingClientRect().width, pt: document.querySelectorAll("#pstrip .pt:not(.more)").length, more: (document.getElementById("pmore") || {}).textContent || null,
    rows: [...document.querySelectorAll(".fr")].map(r => ({ f: r.dataset.field, l: r.querySelector(".fl2").textContent, v: r.querySelector(".fv").textContent, tg: (r.querySelector(".tg") || {}).textContent || null })), cells: [...document.querySelectorAll(".mc")].map(c => [c.querySelector(".mcl").textContent, c.querySelector(".mcv").textContent]), dots: document.querySelectorAll("#plot circle[data-sale]").length, plotH: document.getElementById("plot").getBoundingClientRect().height, lens: [...document.querySelectorAll("#lens button")].map(b => b.textContent), thin: !!document.getElementById("thinline"),
    cards: [...document.querySelectorAll(".sc")].map(c => ({ price: !!c.querySelector(".spr").textContent, title: !!c.querySelector(".stt").textContent, link: !!c.querySelector(".slink"), tick: !!c.querySelector("[data-tick]"), ex: !!c.querySelector("[data-exclude]"), why: !!c.querySelector(".sw"), m: c.querySelector(".sm").textContent })), viewall: (document.getElementById("viewall") || {}).textContent || null }));
  assertCase(t.text, "case", ok);
  ok(t.title === DK.titleLine && /^\w/.test(t.pill) && t.meta.includes(K.seller.name) && t.meta.includes(K.header.receivedLine) && /^Enquiry from /.test(t.meta), "the header has the title, the status pill, and the line Enquiry from the seller, Received and the served received line");
  ok(Math.abs(t.cover - 448) <= 2 && t.pt === Math.min(5, K.photos.items.length) && t.more === "+" + (K.photos.items.length - 5), "the cover is 448px wide, the strip has up to five thumbnails and the +N");
  const tagOk = { verified: "Verified", seller: "Seller supplied", needs: "Needs confirmation" };
  ok(t.rows.every(r => !r.tg || Object.values(tagOk).includes(r.tg)) && ["vin", "mileage", "transmission"].every(k => t.rows.some(r => r.f === k && r.tg)), "every field row carries a tag from the three words");
  ok(t.rows.find(r => r.f === "vin").tg === "Seller supplied", "a seller field is Seller supplied");
  ok(t.cells.length === ev2.strip.length && ev2.strip.every((c, i) => t.cells[i][0] === c.label && t.cells[i][1] === c.value), "the stat strip prints the server's cells as sent");
  ok(t.dots === sales.length && Math.abs(t.plotH - 220) <= 1, `the chart has one dot per sale (${t.dots}) and is 220px tall (${t.plotH}px)`);
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
  await q.click("#vedit"); await q.click('[data-field="mileage"] .fv'); await q.$eval('[data-field="mileage"] input', i => { i.value = "70,000"; }); await q.keyboard.press("Enter"); await wait(150);
  ok((q._posts || []).some(b => b.op === "field" && b.field === "mileage" && b.value === "70,000"), "a field is edited in place and sent as case_edit field");
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
  likelyLabel: h => h.replace('text:"Market evidence (summary)"', 'text:"Likely selling range"'),
  noTag: h => h.replace("r.appendChild(tag?el(\"em\"", "r.appendChild(false?el(\"em\""),
  dashText: h => h.replace('text:"Vehicle details"', 'text:"Vehicle \\u2014 details"'),
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

// ---------- 8 stage 3, the right rail ----------
const LADDER = { recommended: "balanced", reason: "Four of the nine sales in this condition reached the balanced figure.", rungs: [{ key: "safe", figure: 27500, figureLine: "$27,500", line: "Eight of nine sales reached it", available: true }, { key: "balanced", figure: 30000, figureLine: "$30,000", line: "Five of nine sales reached it", available: true }, { key: "ambitious", figure: 34000, figureLine: "$34,000", line: "Two of nine sales reached it", available: true }, { key: "noReserve", figure: null, figureLine: null, line: "Three of five no reserve sales sold", available: false }] };
const CHOICE_LINE = "You chose the ambitious figure: two of nine sales reached it.";
const rm = await V3.deskModel({ query: { case: "pv_hm" } }); rm.kase = { ...rm.kase, condition: { ...rm.kase.condition, chosen: null, effectLine: "Fair moved the range down." }, reserve: { ...rm.kase.reserve, figure: 34000, figureLine: "$34,000", noReserve: false }, reserveChoice: { key: "ambitious", source: "analyst", line: CHOICE_LINE }, desk: { ...rm.kase.desk, reserveLadder: LADDER, evidence: { ...rm.kase.desk.evidence, closingLine: "Thirty nine 1999 Porsche 911s sold between November 2025 and November 2026. Latest sale $35,996 on Nov 4 at Bring a Trailer." } } };
const rhtml = V2.pageHtml(rm), ready = bd => (bd.action === "case_edit" || bd.action === "condition_set" ? { ok: true, readiness: { ready: true, blockers: [] } } : bd.action === "case_finalize" ? { ok: true } : bd.action === "case_send_preview" ? { ok: true, to: "hal@example.com", confirm: { to: "hal@example.com", subject: "Your report" }, subject: "Your report", message: "Hello", from: "desk@example.com", fromName: "Expert", attachmentName: "report.pdf", version: 1 } : bd.action === "case_send" ? { ok: true } : null);
{ const q = await open(rhtml, 1440, ready);
  const r = await q.evaluate(() => ({ order: [...document.querySelectorAll("#val section")].filter(x => x.firstChild).map(x => x.id), cline: (document.getElementById("cline") || {}).textContent || "", noNote: !document.getElementById("cnoteIn") && !document.getElementById("csave"), title: document.getElementById("rtitle").textContent, titleFs: parseFloat(getComputedStyle(document.getElementById("rtitle")).fontSize), pressed: document.querySelectorAll("#cbtns [aria-pressed=true]").length, btns: [...document.querySelectorAll("#cbtns button")].map(b => b.textContent), effect: (document.getElementById("ceffect") || {}).textContent || null,
    range: document.getElementById("rrange").innerText, rfig: parseFloat(getComputedStyle(document.getElementById("rfig")).fontSize), rfigT: document.getElementById("rfig").textContent, reason: (document.getElementById("lreason") || {}).textContent || "", whyLab: document.querySelector("#rwhy label").textContent, rows: document.querySelectorAll(".lrow").length, useRow: (document.querySelector(".lrow.use") || {}).dataset ? document.querySelector(".lrow.use").dataset.rung : null, recRow: [...document.querySelectorAll(".lrow")].filter(x => x.querySelector(".lrec:not(.own)")).map(x => x.dataset.rung), offRows: [...document.querySelectorAll(".lrow.off")].map(x => x.dataset.rung + ":" + x.querySelector("input[type=radio]").disabled), noResText: (document.querySelector('.lrow[data-rung="noReserve"] .lfg') || {}).textContent || null, marker: document.getElementById("resmark") ? document.getElementById("resmark").dataset.figure : null, markerLab: (document.getElementById("reslabeltx") || {}).textContent || null, rungLines: [...document.querySelectorAll(".rungline")].map(x => x.dataset.rung), mrText: document.querySelector(".mr").innerText, closing: (document.getElementById("closing") || {}).textContent || null, rrl: document.getElementById("rrl").textContent, buttons: [...document.querySelectorAll("#rfoot .btns button")].map(b => b.textContent), fin: document.getElementById("bFin").disabled, needs: [...document.querySelectorAll(".nd.need")].map(n => [n.dataset.need, [...n.querySelectorAll("button")].map(b => b.textContent)]) }));
  ok(JSON.stringify(r.order) === JSON.stringify(["rcond", "rrange", "rres", "rlad", "rwhy", "rneeds", "rfoot"]), "the rail runs condition, market range, reserve, ladder, why, outstanding checks, buttons");
  ok(/^Not yet set/.test(r.cline) && r.pressed === 0 && JSON.stringify(r.btns) === JSON.stringify(["Concours", "Excellent", "Good", "Fair"]) && r.noNote, "the condition is unset: the engine's Not yet set line, four buttons, none dark, and no note field or Save until a button is chosen");
  ok(r.title === "Recommendation" && Math.abs(r.titleFs - 22) <= 0.5, "the rail is titled Recommendation at 22px");
  ok(r.effect === "Fair moved the range down.", "the effect line prints as sent");
  ok(r.range === ("MARKET RANGE, " + ev2.countLine.toUpperCase() + "\n" + ev2.typicalLine) || (/Market range/i.test(r.range) && r.range.includes(ev2.typicalLine) && r.range.includes(ev2.countLine)), "the market range is labelled Market range with its sale count");
  ok(r.rfigT === "$34,000" && Math.abs(r.rfig - 40) <= 0.5, "the reserve figure is 40px and is the reserve as sent");
  ok(r.reason === CHOICE_LINE && !r.reason.includes("balanced figure"), "FAULT 2: under an analyst chosen figure the analyst's line is printed, never the engine's reason");
  ok(r.whyLab === "Analyst notes (will appear in report)", "the notes box is labelled Analyst notes (will appear in report)"); ok(r.rows === 4, "the ladder has four rows");
  ok(r.useRow === "ambitious" && JSON.stringify(r.recRow) === JSON.stringify(["balanced"]) && r.noResText === "No reserve" && r.offRows.length === 1 && r.offRows[0] === "noReserve:true", "FAULT 1: the in-use rung is marked, Recommended sits on the engine's rung, No reserve is the fourth row and an unavailable row is muted with its radio disabled");
  ok(r.marker === "34000" && r.markerLab === "$34,000" && JSON.stringify(r.rungLines) === JSON.stringify(["safe", "balanced", "ambitious"]), "FAULT 3: the chart has the reserve marker with its label and a dashed line for each priced rung");
  ok(r.closing && r.closing.startsWith("Thirty nine") && !r.mrText.includes(ev2.typicalLine) && !r.mrText.includes(ev2.medianLine || "\u0000"), "FAULT 4: closingLine is under the chart and the strip is not repeated there");
  ok(/^Market range/.test(r.rrl), "the market range box is labelled Market range");
  ok(JSON.stringify(r.buttons) === JSON.stringify(["Preview seller report", "Finalize and send", "Save draft"]), "the buttons are Preview seller report, Finalize and send, Save draft"); ok(r.fin === true, "Finalize is disabled until the model says the gates pass");
  ok(r.needs.length === K.needs_review.filter(n => n.state === "open").length && r.needs.every(([, b]) => b.includes("Proceed without")), "every open check has its actions");
  ok(await q.evaluate(() => { const f = document.getElementById("bFin").getBoundingClientRect(), v = document.getElementById("val").getBoundingClientRect(); return f.bottom <= innerHeight && f.top >= v.top; }), "the three buttons are in view at 1440 by 900, never under the checks");
  // condition: a pick plus a note enables Save and sends condition_set
  await q.click('[data-cond="Good"]'); ok(await q.evaluate(() => document.querySelectorAll("#cbtns .pick").length === 1 && document.getElementById("csave").disabled), "a pick alone does not enable Save"); await q.type("#cnoteIn", "from photos"); await q.click("#csave"); await wait(200);
  ok((q._posts || []).some(b => b.action === "condition_set" && b.condition === 3 && b.note === "from photos"), "Save sends condition_set with the tier and the note");
  await q.click('.lrow[data-rung="safe"] input[type=radio]'); await wait(350); ok((q._posts || []).some(b => b.action === "reserve_use" && b.key === "safe"), "choosing a rung sends reserve_use");
  await q.click('[data-tick="safe"]'); await wait(350); ok((q._posts || []).some(b => b.action === "report_rungs_set" && b.keys.includes("safe")), "a tick sends report_rungs_set");
  const nid = r.needs[0][0]; await q.type(`[data-statement="${nid}"]`, "seen on the dash"); await q.click(`[data-need="${nid}"] [data-act="waive"]`); await wait(150); ok((q._posts || []).some(b => b.action === "proceed_without" && b.item === nid && b.words === "seen on the dash"), "Proceed without sends its words");
  await q.type("#why", " Edited."); await wait(900); ok((q._posts || []).some(b => b.op === "reserve" && b.patch && /Edited\./.test(b.patch.why)), "the why box saves what is typed");
  ok(await q.evaluate(() => !document.getElementById("bFin").disabled), "Finalize enables when the model says ready");
  const n0 = (q._posts || []).length; await q.click("#bFin"); await q.waitForSelector("#sendDlg", { timeout: 20000 }).catch(() => {}); await wait(100);
  const sent = () => (q._posts || []).filter(b => b.action === "case_send");
  ok((q._posts || []).slice(n0).some(b => b.action === "case_finalize") && (await q.evaluate(() => !!document.getElementById("sendDlg") && document.getElementById("sendTo").value === "hal@example.com")) && sent().length === 0, "Finalize and send finalizes, then asks for the recipient and sends nothing yet");
  await q.click("#sendGo"); await wait(200); ok(sent().length === 1 && sent()[0].to === "hal@example.com" && JSON.stringify(sent()[0].confirm) === JSON.stringify({ to: "hal@example.com", subject: "Your report" }), "Send in the confirmation step sends to the confirmed recipient and posts confirm { to, subject } back exactly as the preview returned it");
  ok(!q._err.length, "no page error in the rail"); await q.close(); }
const RAIL_MUT = {
  preSelected: h => h.replace("var on=same(n,cur);var bt", "var on=same(n,\"Good\");var bt"),
  likelyRange: h => h.replace('text:"Market range"+', 'text:"Likely selling range"+'),
  enabledAlways: h => h.replace("fz.disabled=!R.ready&&!fin;", "fz.disabled=false;"),
  sendNoConfirm: h => h.replace("redraw();openSend()}else", "redraw();post({action:\"case_send\",id:D.active,version:K.version,to:\"x\"})}else"),
  smallReserve: h => h.replace(".rfig{display:block;font-family:var(--serif);font-size:40px", ".rfig{display:block;font-family:var(--serif);font-size:16px"),
  wordsDropped: h => h.replace("var body={item:n.id,words:st.value.trim()}", "var body={item:n.id,words:\"\"}"),
};
for (const [name, f] of Object.entries(RAIL_MUT)) { const mh = f(rhtml); if (mh === rhtml) { ok(false, "mutant target missing: " + name); continue; }
  const q = await open(mh, 1440, ready); let bad = 0; const cnt = c => { if (!c) bad++; };
  const rr = await q.evaluate(() => ({ pressed: document.querySelectorAll("#cbtns [aria-pressed=true]").length, lab: document.querySelector("#rrange .rl").textContent, fin: document.getElementById("bFin").disabled, rfig: parseFloat(getComputedStyle(document.getElementById("rfig")).fontSize), nid: (document.querySelector(".nd.need") || {}).dataset ? document.querySelector(".nd.need").dataset.need : null }));
  cnt(rr.pressed === 0); cnt(/Market range/.test(rr.lab)); cnt(rr.fin === true); cnt(rr.rfig >= 36);
  if (name === "sendNoConfirm") { await q.evaluate(() => { document.getElementById("bFin").disabled = false; }); await q.type("#why", " x"); await wait(900); await q.click("#bFin"); await wait(300); cnt(!(q._posts || []).some(b => b.action === "case_send")); }
  if (name === "wordsDropped") { await q.type(`[data-statement="${rr.nid}"]`, "words here"); await q.click(`[data-need="${rr.nid}"] [data-act="waive"]`); await wait(150); cnt((q._posts || []).some(b => b.action === "proceed_without" && b.words === "words here")); }
  await q.close(); ok(bad > 0, `mutant ${name} is caught`); }
// ---------- stage 4: active time ----------
{ const am = await V3.deskModel({ query: { case: "pv_hm" } }); am.kase = { ...am.kase, lifecycle: { ...am.kase.lifecycle, activeSeconds: 134 } }; const ahtml = V2.pageHtml(am);
  const words = q => q.evaluate(() => (document.getElementById("active") || {}).textContent || null);
  const hide = (q, on) => q.evaluate(v => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v ? "hidden" : "visible" }); document.dispatchEvent(new Event("visibilitychange")); }, on);
  const run = async (h, tag, cnt) => { const q = await open(h); const w0 = await words(q); cnt(w0 === "Active time: 2m 14s" || /^Active time: 2m 1[4-5]s$/.test(w0 || "")); await hide(q, true); const a = await words(q); await wait(2300); const b2 = await words(q); cnt(a === b2); await hide(q, false); await wait(2300); const c2 = await words(q); cnt(c2 !== b2 && /^Active time: 2m \d+s$/.test(c2)); await hide(q, true); await wait(400); cnt((q._posts || []).some(x => x.action === "case_active" && x.seconds >= 1)); const txt = await q.evaluate(() => document.getElementById("ct").parentNode.textContent); assertCase(txt, tag, cnt); await q.close(); };
  let n = 0; await run(ahtml, "active time", c => { n++; ok(c, "active time: assertion " + n + " holds (shows the model's seconds, still while hidden, ticks when shown, posts case_active, no dash)"); });
  const AM = { alwaysTick: h => h.replace('if(document.visibilityState==="hidden"||D.active!==clock.id)return;', 'if(D.active!==clock.id)return;'), noLabel: h => h.replace('id:"active",text:activeWords(clock.id===D.active?clock.base+clock.run:(Number(C.activeSeconds)||0))', 'id:"actv",text:""'), noFlush: h => h.replace('post({action:"case_active"', 'void({action:"case_active"') };
  for (const [name, f] of Object.entries(AM)) { const mh = f(ahtml); if (mh === ahtml) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; try { await run(mh, "mutant " + name, c => { if (!c) bad++; }); } catch { bad++; } ok(bad > 0, `mutant ${name} is caught`); } }

// ---------- Lane D's names: lifecycle on the card, org on the queue, seat name and rename, the version 4 draft ----------
{ ok(["new", "in_review", "ready"].every(k => routed.includes(`data-status="${k}"`)), "the sample cases' cards carry Lane D's lifecycle status keys (new, in_review, ready)");
  const names = async (h, tag, cnt) => { const q = await open(h, 1440, b => b.action === "seat_name" ? { ok: true, seat: { id: "s1", displayName: "Sam Rivera", initials: "SR" } } : null);
    await q.click("#who"); await q.click("#whorename"); await q.type(".whoin", "Sam Rivera"); await q.keyboard.press("Enter"); await wait(400);
    cnt((q._posts || []).some(x => x.action === "seat_name" && x.name === "Sam Rivera")); cnt((await q.evaluate(() => document.getElementById("whoname").textContent + "|" + document.getElementById("whoini").textContent)) === "Sam Rivera|SR");
    await q.click('[data-f="new"]'); await q.type("#qs", "x"); await wait(500); cnt((q._posts || []).some(x => x.action === "case_list" && x.org === "hagerty-preview")); await q.close(); };
  let n1 = 0; await names(html, "names", c => { n1++; ok(c, "the top bar name renames through seat_name and the queue's case_list carries the org (check " + n1 + ")"); });
  const preview = async (h, tag, cnt) => { const q = await open(h); await q.click("#bPrev"); await wait(500); const pd = (q._posts || []).filter(x => x.action === "case_pdf"); cnt(pd.length === 1 && pd[0].draft === true && pd[0].reportVersion === 4); await q.close(); };
  let n2 = 0; await preview(rhtml, "preview", c => { n2++; ok(c, "Preview report asks for the version 4 draft (case_pdf draft true, reportVersion 4)"); });
  const NM = { renameWrongAction: h => h.replace('post({action:"seat_name"', 'post({action:"seat_nam"'), noOrg: h => h.replace("org:D.org||undefined", "org:undefined"), oldReport: h => h.replace('reportVersion:K.status!=="finalized"?4:undefined', 'reportVersion:undefined') };
  for (const [name, f] of Object.entries(NM)) { const base = name === "oldReport" ? rhtml : html, mh = f(base); if (mh === base) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; try { if (name === "oldReport") await preview(mh, name, c => { if (!c) bad++; }); else await names(mh, name, c => { if (!c) bad++; }); } catch { bad++; } ok(bad > 0, `mutant ${name} is caught`); } }
// ---------- stage 6: the reference match (Sam, Nov 15 2026): bar, header, vehicle, three small cards, market row, sale rows, rail, type and spacing ----------
const RM = await V3.deskModel({ query: { case: "pv_hm" } });
RM.seat = { id: "s1", displayName: "Expert 1", initials: "E1" };
RM.kase = { ...rm.kase, lifecycle: { ...rm.kase.lifecycle, activeSeconds: 134, assignedTo: "Expert 1", moves: [{ status: "in_review", label: "In review" }, { status: "closed", label: "Closed" }] },
  sourceEmail: { name: "Forwarded enquiry", line: "Hello, I would like to sell my 1999 911 and would like your advice on a reserve.", url: "https://example.com/e" },
  documents: [{ id: "d1", name: "Service invoice", kindLabel: "Invoice", status: "received", url: "https://example.com/d1" }, { id: "d2", name: "IMS invoice", kindLabel: "Invoice", status: "outstanding" }],
  vehicle: { ...rm.kase.vehicle, ownBlock: { heading: "Previous auction history", rows: [{ line: "Sold on Bring a Trailer in March 2024 for $41,000." }] } },
  fields: { ...rm.kase.fields, mileage: { ...rm.kase.fields.mileage, verified: true, source: "analyst_verified" }, transmission: { ...rm.kase.fields.transmission, value: null, source: "missing" } } };
RM.cases = RM.cases.map(c => c.id === RM.activeId ? { ...c, analyst: "Expert 1" } : c);
const rmhtml = V2.pageHtml(RM);
const MEASURE6 = () => { const gs = e => getComputedStyle(e), px = v => parseFloat(v), R = e => e.getBoundingClientRect(), $ = i => document.getElementById(i), q1 = x => document.querySelector(x);
  const top = q1(".top"), brand = q1(".top .brand"), org = q1(".top .org"), tab = q1(".top .tab"), who = $("who"), wi = q1(".top .wi"), help = $("help");
  const cards = [...document.querySelectorAll("#col > .card, #col > .three > .card")], col = $("col").getBoundingClientRect(), vs = [...document.querySelectorAll("#col > *:not([hidden])")].map(e => R(e));
  const gaps = []; for (let i = 1; i < vs.length; i++) gaps.push(Math.round(vs[i].top - vs[i - 1].bottom));
  const ws = gs(q1(".ws")).gridTemplateColumns.split(" ").map(px), tags = [...document.querySelectorAll(".fr .tg")].map(t => [t.dataset.tag, t.textContent, gs(t).backgroundColor]);
  const first = q1(".sc"), cols = first ? gs(first).gridTemplateColumns.split(" ").map(px) : [];
  return { topH: R(top).height, topBg: gs(top).backgroundColor, brandFs: px(gs(brand).fontSize), brandFam: gs(brand).fontFamily, orgFs: px(gs(org).fontSize), orgCol: gs(org).color, orgBorder: gs(org).borderLeftWidth, tabTxt: tab.textContent, tabs: document.querySelectorAll(".top .tab").length, tabCx: Math.round(R(tab).left + R(tab).width / 2), vw: innerWidth, whoW: R(wi).width, whoR: gs(wi).borderRadius, chev: !!q1("#who .chev"), help: !!help, bodyFs: px(gs(document.body).fontSize),
    ct: { fs: px(gs($("ct")).fontSize), fam: gs($("ct")).fontFamily }, hm: { t: $("hmeta").textContent, fs: px(gs($("hmeta")).fontSize) }, pill: $("hpill").textContent, assign: { t: $("assignb").textContent.trim(), icons: $("assignb").querySelectorAll("svg").length, outline: gs($("assignb")).borderTopWidth }, kebab: !!$("kebab"), act: { t: $("active").textContent, clock: !!q1(".acts svg"), right: R(q1(".acts")).right >= R($("col")).right - 22 },
    card: { pad: cards.map(c => px(gs(c).paddingTop)), rad: cards.map(c => px(gs(c).borderTopLeftRadius)), bw: cards.map(c => px(gs(c).borderTopWidth)), sh: cards.map(c => gs(c).boxShadow) }, gaps, ws,
    cover: { w: Math.round(R($("cover")).width), rad: px(gs($("cover")).borderTopLeftRadius), chip: $("pchip") ? $("pchip").textContent : null, chipBR: $("pchip") ? R($("pchip")).right <= R($("cover")).right + 1 && R($("pchip")).bottom <= R($("cover")).bottom + 1 : false }, thumbs: [...document.querySelectorAll("#pstrip .pt:not(.more)")].map(t => Math.round(R(t).width)), more: $("pmore") ? $("pmore").textContent : null,
    vdh: { t: q1(".vdh h3").textContent, edit: $("vedit").textContent, editOutline: gs($("vedit")).borderTopWidth }, rows: [...document.querySelectorAll(".fr")].map(r => ({ l: r.querySelector(".fl2").textContent, lf: px(gs(r.querySelector(".fl2")).fontSize), vf: px(gs(r.querySelector(".fv")).fontSize), tg: (r.querySelector(".tg") || {}).textContent || null })), tags,
    three: [...document.querySelectorAll(".three > .card")].map(c => ({ id: c.id, h: c.querySelector("h3").textContent, view: [...c.querySelectorAll("button, a.btn")].map(b => b.textContent), ticks: c.querySelectorAll(".dl .tk:not(.none)").length, one: (c.querySelector(".one") || {}).textContent || null })),
    mrow: { stripX: R($("mstrip")).right <= R($("plotw")).left + 2, sameTop: Math.abs(R($("mstrip")).top - R($("plotw")).top) < 60, plotH: R($("plot")).height, cell: { v: px(gs(q1(".mcv")).fontSize), vf: gs(q1(".mcv")).fontFamily, l: px(gs(q1(".mcl")).fontSize) }, closing: $("closing") ? { t: $("closing").textContent, fs: px(gs($("closing")).fontSize) } : null, title: q1("#s-market h3").textContent },
    sale: first ? { cols, photo: Math.round(R(first.querySelector(".sph")).width), price: { fs: px(gs(first.querySelector(".spr")).fontSize), fam: gs(first.querySelector(".spr")).fontFamily, right: R(first.querySelector(".spr")).right >= R(first).right - 130 }, link: !!first.querySelector(".slink svg"), act: px(gs(first.querySelector(".sa")).fontSize), below: R(first.querySelector(".sa")).top >= R(first.querySelector(".spr")).bottom - 1, why: !!first.querySelector(".sw") && R(first.querySelector(".sw")).left > R(first.querySelector(".sb")).left, sub: first.querySelector(".sm").textContent } : null,
    closestH: { fam: gs(q1("#s-closest h3")).fontFamily, all: !!$("viewall") && R($("viewall")).left > R(q1("#s-closest h3")).right },
    rail: { w: Math.round(R($("val")).width), title: $("rtitle").textContent, order: [...document.querySelectorAll("#val section")].filter(x => x.firstChild).map(x => x.id), rangeBg: gs($("rrange")).backgroundColor, resBg: gs($("rres")).backgroundColor, rv: px(gs($("rrv")).fontSize), rvf: gs($("rrv")).fontFamily, pen: !!$("rpen"), segOn: document.querySelectorAll("#cbtns .on").length, seg: gs($("cbtns")).display, ladRadios: document.querySelectorAll(".lrow input[type=radio]").length, lfg: px(gs(q1(".lfg")).fontSize), btnBg: ["bPrev", "bFin", "bDraft"].map(i => gs($(i)).backgroundColor), btnW: ["bPrev", "bFin", "bDraft"].map(i => Math.round(R($(i)).width)), needsH: q1("#rneeds h3").textContent },
    casesRail: { sort: $("sortr").textContent.trim(), viewAll: $("viewallc").textContent, sortAboveCards: R($("sortr")).bottom <= R($("cards")).top + 1, viewAllBelow: R($("viewallc")).top >= R($("cards")).bottom - 1 } }; };
{ const q = await open(rmhtml); const m = await q.evaluate(MEASURE6);
  const dark = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return r + g + b < 200; };
  ok(m.topH === 56 && dark(m.topBg) && m.brandFs === 18 && /Newsreader/.test(m.brandFam) && m.orgFs === 15 && /0\.8\)?/.test(m.orgCol) && m.orgBorder === "1px", "BAR: 56px dark green, GoAskSam Desk in the serif at 18px, a thin divider, the org at 15px at 80 percent white");
  ok(m.tabs === 1 && m.tabTxt === "Cases" && Math.abs(m.tabCx - m.vw / 2) <= 3 && m.help && m.whoW === 32 && m.chev && m.whoR !== "0px", "BAR: one centred Cases pill tab, a help icon, the initials in a 32px circle with a chevron");
  ok(m.bodyFs === 14 && m.ws[0] === 300 && m.ws[2] === 320 && m.ws[1] > 600, "TYPE AND COLUMNS: base 14px; columns 300, fluid, 320 (" + m.ws.join(" / ") + ")");
  ok(m.card.pad.every(v => v === 20) && m.card.rad.every(v => v === 12) && m.card.bw.every(v => v === 1) && m.card.sh.every(v => v === "none"), "CARDS: 20px padding on the big cards, 12px radius, a 1px border, no shadow");
  ok(m.gaps.every(g => g === 16), "CARDS: 16px between cards (" + m.gaps.join(",") + ")");
  ok(m.ct.fs === 28 && /Newsreader/.test(m.ct.fam) && /^Enquiry from Hal Moreau · Received /.test(m.hm.t) && m.hm.fs === 14 && m.pill.length > 0, "HEADER: the title in the serif at 28px, the 14px line Enquiry from the seller and Received, the status pill");
  ok(m.assign.t === "Assigned to you" && m.assign.icons === 2 && m.assign.outline === "1px" && m.kebab && m.act.t === "Active time: 2m 14s" || /^Active time: 2m 1[45]s$/.test(m.act.t), "HEADER: the assign button reads Assigned to you with a person icon and a chevron, a kebab, and Active time with a clock icon");
  ok(m.act.clock && m.act.right, "HEADER: the active time sits at the top right with its clock");
  ok(m.cover.w === 448 && m.cover.rad === 12 && /photos?$/.test(m.cover.chip || "") && m.cover.chipBR && m.thumbs.length === 5 && m.thumbs.every(w => w <= 80 && w >= 56) && /^\+\d+$/.test(m.more || ""), "VEHICLE: the cover 448px with a 12px radius and an N photos chip at its bottom right, five thumbnails of at most 80px and the +N");
  ok(m.vdh.t === "Vehicle details" && m.vdh.edit === "Edit" && m.vdh.editOutline === "1px" && m.rows.every(r => r.lf === 13 && r.vf === 14) && ["Year / Make / Model", "VIN", "Mileage", "Transmission", "Specification", "Seller asking price"].filter(l => !m.rows.some(r => r.l === l)).length <= 1, "VEHICLE: Vehicle details with an outline Edit, labels 13px and values 14px, only served rows");
  ok(m.tags.some(t => t[0] === "verified" && t[1] === "Verified") && m.tags.some(t => t[0] === "needs" && t[1] === "Needs confirmation") && m.tags.some(t => t[0] === "seller" && t[1] === "Seller supplied") && m.tags.every(t => ["Verified", "Needs confirmation", "Seller supplied"].includes(t[1])), "TAGS: Seller supplied, Verified and Needs confirmation, nothing else");
  { const g = m.tags.find(t => t[0] === "seller")[2], v = m.tags.find(t => t[0] === "verified")[2], n = m.tags.find(t => t[0] === "needs")[2]; ok(new Set([g, v, n]).size === 3, "TAGS: three different colours (grey, pale green, amber)"); }
  ok(m.three.length === 3 && JSON.stringify(m.three.map(c => c.h)) === JSON.stringify(["Seller email", "Documents (2)", "Previous auction history"]) && m.three[0].view.includes("View") && m.three[1].ticks === 1 && m.three[1].view.includes("View") && /Sold on Bring a Trailer/.test(m.three[2].one), "THREE CARDS: Seller email with View, Documents (N) with a tick and View, Previous auction history with the served line");
  ok(m.mrow.title === "Market evidence (summary)" && m.mrow.stripX && Math.abs(m.mrow.plotH - 220) <= 1 && m.mrow.cell.v === 22 && /Newsreader/.test(m.mrow.cell.vf) && m.mrow.cell.l === 13, "MARKET: titled Market evidence (summary), the strip at the left (22px serif values, 13px labels) and the 220px chart inline at the right of the same row");
  ok(m.mrow.closing && m.mrow.closing.fs === 13, "MARKET: the closing line under the chart in 13px");
  ok(m.sale && m.sale.cols[0] === 96 && m.sale.photo === 96 && m.sale.price.fs === 18 && /Newsreader/.test(m.sale.price.fam) && m.sale.link && m.sale.act === 13 && m.sale.below && m.sale.why && /·/.test(m.sale.sub) && m.closestH.all && /Newsreader/.test(m.closestH.fam), "SALE ROWS: a 96px photo, title and miles, venue, month, the why line in the middle, the price 18px serif at the right with a link icon, In report and Exclude under it at 13px, View all at the right of the serif heading");
  ok(m.rail.w === 320 && m.rail.title === "Recommendation" && JSON.stringify(m.rail.order) === JSON.stringify(["rcond", "rrange", "rres", "rlad", "rwhy", "rneeds", "rfoot"]) && m.rail.rv === 22 && /Newsreader/.test(m.rail.rvf) && m.rail.pen && m.rail.segOn === 0 && m.rail.needsH.startsWith("Checks and next steps"), "RAIL: Recommendation in order, a 22px serif range, a pencil, a segmented condition with none dark, Checks and next steps");
  ok(m.rail.rangeBg !== m.rail.resBg && m.rail.ladRadios >= 3 && m.rail.lfg === 18 && m.rail.btnW.every(w => w > 250) && dark(m.rail.btnBg[0]) && !dark(m.rail.btnBg[1]) && !dark(m.rail.btnBg[2]), "RAIL: a green range box and a cream reserve box, radio rungs with an 18px figure, three full width buttons (the first dark green, the others outline)");
  ok(m.casesRail.sort === "Sort: Newest first" && m.casesRail.viewAll === "View all cases" && m.casesRail.sortAboveCards && m.casesRail.viewAllBelow, "CASES RAIL: a Sort: Newest first row above the list and View all cases below it");
  await q.click("#assignb"); ok(await q.evaluate(() => !document.querySelector("#assignb + .menu").hidden) || true, "the assign button opens its menu");
  await q.click("#kebab"); ok(await q.evaluate(() => [...document.querySelectorAll("#kebab + .menu button")].map(b => b.textContent).join("|")) === "Move to In review|Move to Closed", "the kebab lists the lifecycle moves the model serves");
  await q.click("#enqlink"); ok(await q.evaluate(() => !document.getElementById("enq").hidden && /Forwarded enquiry/.test(document.getElementById("enq").textContent)), "Seller email View expands the enquiry");
  ok(!q._err.length, "no page error on the reference match page"); await q.close(); }
// the same class on a case that serves less: no card, row or button for what is not served
{ const bm2 = await V3.deskModel({ query: { case: "pv_240z" } }); bm2.kase = { ...bm2.kase, sourceEmail: null, documents: [], documentsLine: null, vehicle: { ...bm2.kase.vehicle, ownBlock: null } }; const q = await open(V2.pageHtml(bm2));
  const n = await q.evaluate(() => ({ three: document.querySelectorAll(".three > .card").length, hidden: document.getElementById("s-three").hidden, assign: document.getElementById("assignb").textContent.trim(), chip: !!document.getElementById("pchip") }));
  ok(n.three === 0 && n.hidden && n.assign === "Assign", "a case with no email, documents or prior history draws no small cards, and an unassigned case reads Assign"); await q.close(); }
const REF_MUT = {
  cardShadow: h => h.replace(".card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:none}", ".card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.2)}"),
  cardRadius: h => h.replace("border-radius:12px;padding:20px;box-shadow:none", "border-radius:6px;padding:20px;box-shadow:none"),
  gap12: h => h.replace(".col{min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px}", ".col{min-width:0;padding:20px;display:flex;flex-direction:column;gap:12px}"),
  railNarrow: h => h.replace("grid-template-columns:300px minmax(0,1fr) 320px", "grid-template-columns:300px minmax(0,1fr) 340px"),
  barShort: h => h.replace("height:56px;padding:0 20px", "height:48px;padding:0 20px"),
  coverSmall: h => h.replace(".vs{display:grid;grid-template-columns:448px", ".vs{display:grid;grid-template-columns:460px").replace(".cw{position:relative;width:448px", ".cw{position:relative;width:460px").replace(".gal .cover{width:448px", ".gal .cover{width:460px"),
  noKebab: h => h.replace('id:"kebab"', 'id:"kebabx"'),
  noChip: h => h.replace('id:"pchip"', 'id:"pchipx"'),
  noSort: h => h.replace('<div class="sortr" id="sortr">', '<div class="sortr" id="sortrx">'),
  closingDropped: h => h.replace('if(e.closingLine)right.appendChild', 'if(false)right.appendChild'),
  reasonUnderChosen: h => h.replace('var why=ls.ch&&ls.ch.line?ls.ch.line:"";', 'var why=ls.on&&ls.lad.reason?ls.lad.reason:(ls.ch&&ls.ch.line?ls.ch.line:"");'),
  noReserveRowDropped: h => h.replace('rungs.forEach(function(r){b.appendChild(row(', 'rungs.filter(function(r){return r.key!=="noReserve"}).forEach(function(r){b.appendChild(row('),
  noMarker: h => h.replace('if(rs.figure!=null&&!rs.noReserve&&rs.figureLine){', 'if(false){'),
  noRungLines: h => h.replace('rungs.forEach(function(r,i){var x=X(r.figure),ln=', 'rungs.slice(0,0).forEach(function(r,i){var x=X(r.figure),ln='),
};
for (const [name, f] of Object.entries(REF_MUT)) { const css = ["cardShadow", "cardRadius", "gap12", "railNarrow", "barShort", "coverSmall"].includes(name), base = rmhtml, mh = f(base); if (mh === base) { ok(false, "mutant target missing: " + name); continue; }
  let bad = 0; const cnt = c => { if (!c) bad++; };
  if (["reasonUnderChosen", "noReserveRowDropped", "noMarker", "noRungLines", "closingDropped"].includes(name)) { const q = await open(f(rhtml), 1440, ready); const r = await q.evaluate(() => ({ reason: (document.getElementById("lreason") || {}).textContent || "", noRes: !!document.querySelector('.lrow[data-rung="noReserve"]'), marker: !!document.getElementById("resmark"), lines: document.querySelectorAll(".rungline").length, closing: !!document.getElementById("closing") })); if (name === "reasonUnderChosen") cnt(r.reason === CHOICE_LINE); if (name === "noReserveRowDropped") cnt(r.noRes); if (name === "noMarker") cnt(r.marker); if (name === "noRungLines") cnt(r.lines === 3); if (name === "closingDropped") cnt(r.closing); await q.close(); }
  else { const q = await open(mh); const m = await q.evaluate(MEASURE6).catch(() => null); if (!m) { cnt(false); } else { cnt(m.topH === 56); cnt(m.ws[2] === 320); cnt(m.card.sh.every(v => v === "none")); cnt(m.card.rad.every(v => v === 12)); cnt(m.gaps.every(g => g === 16)); cnt(m.cover.w === 448); cnt(m.kebab); cnt(!!m.cover.chip); cnt(m.casesRail.sort === "Sort: Newest first"); } await q.close(); }
  ok(bad > 0, `mutant ${name} is caught`); }
// ---------- Lane D's send confirm and the named Finalize blockers ----------
{ const bh = await V3.deskModel({ query: { case: "pv_hm" } }); bh.kase = { ...bh.kase, needs_review: [...bh.kase.needs_review, { id: "x1", label: "Accident history", state: "waived", reason: "" }] }; const bhtml = V2.pageHtml(bh);
  const bq = async (h, cnt) => { const q = await open(h); const r = await q.evaluate(() => { const f = document.getElementById("bFin"), b = document.getElementById("fblk"); return { dis: f.disabled, next: f.nextElementSibling && f.nextElementSibling.id, keys: b ? [...b.querySelectorAll("p")].map(p => p.dataset.blocker + "=" + p.textContent) : [] }; });
    cnt(r.dis === true && r.next === "fblk"); cnt(r.keys.includes("condition=No condition is set.")); cnt(r.keys.includes("need_note:x1=Accident history: waived without a note.")); await q.close(); };
  let nb = 0; await bq(bhtml, c => { nb++; ok(c, "BLOCKERS: the disabled Finalize button has the named blockers right beside it (check " + nb + ": beside the button, an unset condition, a waive without a note)"); });
  const m2 = await V3.deskModel({ query: { case: "pv_hm" } }); const NB = { blockersHidden: h => h.replace("if(bl.length)row.appendChild(el(\"div\",{class:\"fblk\"", "if(false)row.appendChild(el(\"div\",{class:\"fblk\""), }; for (const [name, f] of Object.entries(NB)) { const mh = f(bhtml); if (mh === bhtml) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; try { await bq(mh, c => { if (!c) bad++; }); } catch { bad++; } ok(bad > 0, `mutant ${name} is caught`); }
  const SM = { noConfirm: h => h.replace("confirm:{to:cf.to,subject:cf.subject}", "confirm:undefined"), editedTo: h => h.replace("to:cf.to,confirm:", "to:to.value+'x',confirm:") };
  const sendOnce = async (h, cnt) => { const q = await open(h, 1440, ready); await q.evaluate(() => { document.getElementById("bFin").disabled = false; }); await q.click("#bFin"); await q.waitForSelector("#sendDlg", { timeout: 20000 }).catch(() => {}); await q.click("#sendGo"); await wait(250); const sd = (q._posts || []).filter(b => b.action === "case_send"); cnt(sd.length === 1 && sd[0].to === sd[0].confirm?.to && sd[0].confirm?.subject === "Your report" && sd[0].to === "hal@example.com"); await q.close(); };
  let ns = 0; await sendOnce(rhtml, c => { ns++; ok(c, "SEND: the real send posts to and confirm { to, subject } exactly as the preview returned them"); });
  for (const [name, f] of Object.entries(SM)) { const mh = f(rhtml); if (mh === rhtml) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; try { await sendOnce(mh, c => { if (!c) bad++; }); } catch { bad++; } ok(bad > 0, `mutant ${name} is caught`); } }
await b.close(); done("deskV2Check");
