// DESK V2 (Lane S, Nov 15 2026; /preview/desk2, lib/preview/deskV2.js). Offline: the page in Chrome, the door answered in process. Stage 1: the shell and the queue.
//   1 CREW ONLY on /preview/desk2 and /preview/desk2/case/:id; the routes are in vercel.json.
//   2 TOP BAR: GoAskSam Desk, the org name, the analyst's initials; no Search, Reports, Listings or Analytics tab.
//   3 RAIL ORDER: New case, a search box, then the eight statuses with the server's counts, then the cards of the chosen filter.
//   4 CARDS: thumb, title, seller, elapsed line, status pill, analyst, an attention mark only above 0, a Claim button only on an unassigned card.
//   5 NO DASH in any rendered text. NOTHING DRAWN THAT THE MODEL DID NOT SERVE: a card with no seller has no seller element.
//   Mutants (each must fail): a stage band, a Search tab, an attention mark at 0, a Claim button on an owned card.
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
  attZero: h => h.replace(/<div class="cd([^"]*)" data-case="pv_hm"/, '<div class="cd$1" data-case="pv_hm"').replace(/(<a class="cd-a"[^>]*>)/, '$1<span class="att">0</span>'),
  claimOwned: h => h.replace(/(<div class="cd[^>]*data-status="in_review"[\s\S]*?<\/a>)/, '$1<button type="button" class="claim" data-claim="x">Claim</button>'),
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
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.method() === "POST") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(bd.action === "case_list" ? { ok: true, rows: [{ id: m.cards[0].id }] } : { ok: true }) }); } if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: h }); return r.respond({ status: 204, body: "" }); });
  p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160))); await p.goto("https://goasksam.com/preview/desk2", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 200)); return p; }
const p = await open(html);
for (const [k] of V2.STATUSES) { await p.click(`[data-f="${k}"]`); const r = await p.evaluate(k => { const v = [...document.querySelectorAll(".cd")].filter(c => !c.hidden); return { only: v.every(c => c.dataset.status === k), n: v.length, none: !document.getElementById("none").hidden }; }, k); ok(r.only && (r.n > 0) === !r.none, `filter ${k} shows only its cards`); }
await p.click('[data-f="new_enquiries"]'); await p.type("#qs", "x"); await new Promise(r => setTimeout(r, 500));
ok((await p.evaluate(() => document.querySelectorAll(".cd[data-hit]:not([hidden])").length)) === 1, "the search shows the cases case_list answered");
ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !p._err.length, "no horizontal overflow, no page error at 1440");
await p.close();
for (const [name, f] of Object.entries(MUTANTS)) { const mh = f(html); if (mh === html) { ok(false, "mutant target missing: " + name); continue; } let bad = 0; assertPage(mh, "mutant " + name, (c) => { if (!c) bad++; }); ok(bad > 0, `mutant ${name} is caught`); }
await b.close(); done("deskV2Check");
