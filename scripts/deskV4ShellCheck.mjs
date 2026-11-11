// DESK V4 SHELL (Lane E, Nov 10 2026; /preview/desk and /preview/desk/case/:id, lib/preview/deskV4.js, built to docs/desk-mockups/desk-v4.html). Offline: the crew door is run in process, the page in Chrome.
//   1 CREW ONLY: no cookie or a forged one gets the platform 404 on both routes; an unknown case gets it too; noindex and no-store; the routes in vercel.json need the crew cookie.
//   2 ZONES: at 1280 and wider the queue is 232px, the Reserve panel 372px and sticky (it stays in view after the page scrolls), the centre column takes the rest and scrolls; no Vehicle, Market evidence or Decision tabs (two top bar tabs only);
//     under 1100px the panel is above the centre column and the queue is a drawer (hidden, opened by the Cases button, closed by the scrim).
//   3 ONE SHADOW: exactly one element on the page has a box shadow, the Reserve panel.
//   4 TOP BAR: GoAskSam Desk, the org name, the two tabs (Analyst workspace, Seller report; the report view opens and closes), the saved state; the handling clock only when the server sent one.
//   5 LAYOUT: no horizontal overflow at 1440, 1280, 1024 and 390; light and dark tokens both defined and the page background changes with the scheme.
//   5b FOOTER IN VIEW: the Reserve panel's footer (Preview report, Finalize, the check lines, Send) is on screen at 1440, 1280 and 1024 with the window 900 high, at load and (sticky) after the page scrolls, even in the fullest state (four check lines, finalized, Send, a sent line): the panel scrolls its middle, never its footer.
//   6 NOTHING COMPUTED: the module's text carries no arithmetic on a figure.
//   7 THE FIGURE IS PRINTED AS SENT (Sam's first run, Nov 11): the Reserve input shows reserve.figureLine and nothing sits beside it, so no "$$25,000"; no page text carries two dollar signs in a row; no source adds a sign of its own. Mutant: a page added "$".
//   8 A SWITCH IN FLIGHT IS NEVER A DEAD CLICK: while a period or a condition switch is waiting on the server the pressed control shows it (wait, aria-pressed) and the market and its sales are dimmed (busy, opacity below 1); the answer replaces them and the dimming goes. Mutant: no feedback.
//   9 THE PANEL IS EMPTY WHILE THE NEW CASE FORM IS OPEN: only the "Recommended reserve" label is on screen (no figure, no checks, no Send) until the case exists; Cancel brings the case's panel back. Mutant: the panel keeps the previous case.
//  10 THE RAIL'S STATS sit label and value on ONE line each, none cut off, the values aligned, at 1440, 1280 and in the drawer at 1024 and 390. Mutant: the old wrapping layout.
//  11 THE QUEUE ROWS share one geometry: the same row height, the same thumbnail box and offset, the text at the same height and indent, for a photo, a text tile (no photo), a tag and a very long name. Mutant: the old row layout.
//  12 NO FIGURE, NO SIGN: Concours and Fair (no reserve figure) leave the Reserve input empty with no lone "$" in the panel, and the engine's own line (marketLine) is on the panel in its place. Mutant: a page added "$".
//  13 NO PLOT, NO HANDLE: when the engine draws no plot the plot is disabled (aria-disabled, no pointer), the "drag to move" legend is not offered, and the engine's line says why. Mutant: the legend and handle offered anyway.
//  14 THE PERIOD'S OWN LINES: evidence.sameLine and evidence.startLine print under the period control as sent, nothing when the server sent none. Mutants: a typed line; a line dropped.
//  15 NOTHING CLIPPED: no fact value (the VIN, the long accident and service sentences), no input value and no placeholder in the Reserve panel or the New case form is wider than its box at 1440, 1280, 1024 and 390. Mutant: the old squeezed facts column and the long placeholder.
//   CLASS: any tab beside the two, any second shadow, a panel that scrolls away or sits below the centre column on a small screen, a queue that squeezes the centre column. Mutants run through the same assertions must be caught.
//   node scripts/deskV4ShellCheck.mjs
import fs from "node:fs";
import { launch, openPage, imp, tally, ROOT } from "./deskV3Harness.mjs";
import { finalizeDemo, openLive, seedIntake, PV } from "./deskV4Harness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
const { mintCrewCookieValue } = await imp("lib/_crew.js"), crewPage = (await imp("api/crewPage.js")).default, V4 = await imp("lib/preview/deskV4.js"), V3 = await imp("lib/preview/deskV3.js");
const { ok, done } = tally(), crew = "gas_crew=" + mintCrewCookieValue();
async function call(url, cookie) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  const u = new URL("https://goasksam.com" + url);
  await crewPage({ url, method: "GET", query: Object.fromEntries(u.searchParams), body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) }, socket: {} }, res); return res;
}
// ---------- 1 crew only ----------
for (const url of ["/api/crewPage?page=preview-desk", "/api/crewPage?page=preview-desk&case=" + V3.DEMO_ID]) {
  const a = await call(url), b2 = await call(url, "gas_crew=v1.0.forged"), c = await call(url, crew);
  ok(a.code === 404 && b2.code === 404 && !/GoAskSam Desk/.test(a.body + b2.body), `${url}: no cookie and a forged cookie get the platform 404`);
  ok(c.code === 200 && /GoAskSam Desk/.test(c.body) && /noindex/.test(c.body) && /no-store/.test(c.h["cache-control"] || "") && /noindex/.test(c.h["x-robots-tag"] || ""), `${url}: the crew cookie gets the page, noindex and no-store`);
}
ok((await call("/api/crewPage?page=preview-desk&case=nope", crew)).code === 404, "an unknown case answers the platform 404");
{ const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")); const routes = (vj.rewrites || []).filter(r => /^\/preview\/desk(\/|$)/.test(r.source) && !/valuations/.test(r.source));
  ok(routes.length >= 3 && routes.every(r => JSON.stringify(r.has || []).includes("gas_crew")), `vercel.json routes /preview/desk, its case and its api only with the crew cookie (${routes.length} routes)`); }

const b = await launch();
const MEASURE = () => {
  const R = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, vis: !!(e.offsetWidth || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden" }; };
  const shadows = [...document.querySelectorAll("body *")].filter(e => getComputedStyle(e).boxShadow !== "none").map(e => e.id || e.className || e.tagName);
  return { queue: R("#queue"), col: R("#col"), val: R("#val"), top: R("#top"), valPos: getComputedStyle(document.getElementById("val")).position, tabs: document.querySelectorAll('[role=tab]').length, topTabs: [...document.querySelectorAll(".top nav button")].map(x => x.textContent.trim()),
    words: /Vehicle|Market evidence|Decision/.test([...document.querySelectorAll("button,[role=tab],nav a")].map(x => x.textContent.trim()).join("|")), shadows, hs: document.documentElement.scrollWidth > innerWidth + 1, brand: (document.querySelector(".top .brand") || {}).textContent, org: (document.querySelector(".top .org") || {}).textContent, saved: (document.getElementById("saved") || {}).textContent };
};
const html = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } });
const near = (a, b2, t = 1) => Math.abs(a - b2) <= t;
// ---------- 2 to 5 ----------
for (const w of [1440, 1280, 1024, 390]) {
  const p = await openPage(b, html, w, 900), m = await p.evaluate(MEASURE); const bad = [];
  if (w >= 1280) { if (!(m.queue.vis && near(m.queue.w, 232))) bad.push("queue " + m.queue.w); if (!near(m.val.w, 372)) bad.push("panel " + m.val.w); if (m.valPos !== "sticky") bad.push("panel not sticky"); if (!(m.col.w > 400 && m.col.x > m.queue.x + m.queue.w && m.col.x + m.col.w < m.val.x)) bad.push("centre not between"); }
  else { if (!(m.val.y < m.col.y)) bad.push("panel not above the centre column"); if (m.queue.vis && m.queue.x + m.queue.w > 1) bad.push("queue not a drawer"); }
  if (m.tabs !== 0 || m.words) bad.push("a Vehicle, Market evidence or Decision tab"); if (m.topTabs.join("|") !== "Analyst workspace|Seller report") bad.push("top tabs " + m.topTabs);
  if (m.shadows.length !== 1 || m.shadows[0] !== "val") bad.push("shadows: " + m.shadows.join(","));
  if (m.hs) bad.push("scrolls sideways"); if (!/GoAskSam Desk/.test(m.brand || "") || !/Hagerty Marketplace/.test(m.org || "") || !/Saved/.test(m.saved || "")) bad.push("top bar words");
  if (w >= 1280) { await p.evaluate(() => { document.getElementById("col").style.minHeight = "3000px"; window.scrollTo(0, 1200); }); const m2 = await p.evaluate(MEASURE); if (!(m2.val.y >= -1 && m2.val.y < 40 && m2.val.b <= 900 + 1)) bad.push("panel scrolled away (" + Math.round(m2.val.y) + ")"); }
  ok(!bad.length, `@${w}: zones, no tabs, one shadow, top bar, no overflow${bad.length ? ": " + bad.join("; ") : ""}`); ok(p._err.length === 0, `@${w}: no page error (${p._err.join(" | ")})`); await p.close();
}
{ // the drawer under 1100px
  const p = await openPage(b, html, 1024, 900); await p.click("#qopen"); await new Promise(r => setTimeout(r, 300)); const o = await p.evaluate(MEASURE); await p.click("#qscrim").catch(() => {}); await new Promise(r => setTimeout(r, 300)); const c = await p.evaluate(MEASURE); await p.close();
  ok(o.queue.vis && o.queue.x >= -1 && o.queue.w > 200 && !c.queue.vis, "@1024: the Cases button opens the queue drawer and the scrim closes it"); }
{ // the two views
  const p = await openPage(b, html, 1440, 900); await p.click("#n-report"); const r = await p.evaluate(() => [!document.getElementById("v-report").hidden, document.getElementById("v-desk").hidden]); await p.click("#n-desk"); const d = await p.evaluate(() => [document.getElementById("v-report").hidden, !document.getElementById("v-desk").hidden]); await p.close();
  ok(r.every(Boolean) && d.every(Boolean), "the Seller report tab shows the report view and the Analyst workspace tab brings the workspace back"); }
{ // light and dark
  const css = fs.readFileSync("lib/preview/deskV4Css.js", "utf8"); ok(/prefers-color-scheme: dark/.test(css) && /:root\[data-theme="dark"\]/.test(css), "the stylesheet defines light and dark tokens");
  const l = await openPage(b, html, 1440, 900); await l.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]); const bl = await l.evaluate(() => getComputedStyle(document.body).backgroundColor); await l.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]); const bd = await l.evaluate(() => getComputedStyle(document.body).backgroundColor); await l.close();
  ok(bl !== bd && bl === "rgb(244, 245, 243)" && bd === "rgb(16, 19, 20)", `the page background follows the scheme (${bl} then ${bd})`); }
{ // the clock is the server's line, printed as sent, with no timer of the page's own
  const m0 = await V3.deskModel({ query: { case: V3.DEMO_ID } }), line = m0.kase.handling && m0.kase.handling.clock;
  ok(!!line && html.includes('<b id="clock">' + line.replace(/&/g, "&amp;") + "</b>"), "the top bar prints the server's own handling clock line (" + line + ")");
  const none = V4.pageHtml({ cases: [], activeId: null, kase: null }); ok(!/id="clock"/.test(none) && /id="saved"/.test(none), "no clock on the empty page");
  const withClock = async c => { const m = await V3.deskModel({ query: { case: V3.DEMO_ID } }); m.kase = { ...m.kase, handling: { ...(m.kase.handling || {}), clock: c } }; return V4.pageHtml(m); };
  ok(/<b id="clock">Handled in 18 min\.<\/b>/.test(await withClock("Handled in 18 min.")), "a clock the server sent is printed exactly as sent");
  ok(!/id="clock"/.test(await withClock(null)) && !/id="clock"/.test(await withClock("")), "no clock field, no clock printed");
  { const typed = html.replace(/<b id="clock">[^<]*<\/b>/, '<b id="clock">Handling time so far: 3 min.</b>'); ok(!typed.includes('<b id="clock">' + line.replace(/&/g, "&amp;") + "</b>"), "mutant caught: a clock the page typed does not equal the server's line"); }
  ok(!/setInterval|clock[^\n]{0,40}setTimeout/.test(fs.readFileSync("lib/preview/deskV4.js", "utf8") + fs.readFileSync("lib/preview/deskV4Client.js", "utf8")), "the page runs no timer of its own for the clock"); }
// ---------- 5b the footer stays in view ----------
{ const FOOT = () => { const f = document.querySelector("#val .ft").getBoundingClientRect(), fin = document.getElementById("bFin").getBoundingClientRect(), pv = document.getElementById("bPrev").getBoundingClientRect(); return { ftBot: Math.round(f.bottom), vh: innerHeight, btns: fin.bottom <= innerHeight && fin.top >= 0 && pv.bottom <= innerHeight && pv.top >= 0 }; };
  const probe = async (h, w, label, { scroll = false } = {}) => { const p = await openPage(b, h, w, 900); if (scroll) await p.evaluate(() => { document.getElementById("col").style.minHeight = "3000px"; window.scrollTo(0, 1200); });
    const sl = await p.evaluate(() => { const e = document.getElementById("sentLine"); if (e && !document.getElementById("sendBox").hidden) { e.hidden = false; e.textContent = "Report sent to a.long.address@example.com on 10 November 2026 at 14:05 in the afternoon."; } return null; }); const m = await p.evaluate(FOOT); await p.close(); return m; };
  for (const w of [1440, 1280, 1024]) { const m = await probe(html, w), m2 = w >= 1280 ? await probe(html, w, "scrolled", { scroll: true }) : m; ok(m.ftBot <= m.vh && m.btns && m2.ftBot <= m2.vh && m2.btns, `@${w} x 900: the Reserve panel's footer and its Preview and Finalize buttons are on screen${w >= 1280 ? " at load and after the page scrolls" : ""} (footer ends at ${m.ftBot}${w >= 1280 ? " then " + m2.ftBot : ""})`); }
  await finalizeDemo(); const fullest = await V4.renderDeskV4({ query: { case: V3.DEMO_ID } });
  for (const w of [1440, 1280, 1024]) { const m = await probe(fullest, w); ok(m.ftBot <= m.vh && m.btns, `@${w} x 900, the fullest state (finalized, Send, a sent line): the footer is still on screen (ends at ${m.ftBot})`); }
  { const bad = fullest.replace("</style>", "@media (min-width:1101px){.val{max-height:none!important}}@media (max-width:1100px){.val .bd{max-height:none!important}}</style>"), m = await probe(bad, 1280), m3 = await probe(bad, 1024); ok(!(m.ftBot <= m.vh && m3.ftBot <= m3.vh), `mutant caught: a panel that does not scroll its middle pushes the footer off screen (${m.ftBot} at 1280, ${m3.ftBot} at 1024)`); } }
// ---------- 6 nothing computed ----------
{ const src = fs.readFileSync("lib/preview/deskV4.js", "utf8").replace(/\/\/.*$/gm, ""); ok(!/Math\.(round|floor|ceil|min|max)|parseFloat|toFixed|toLocaleString|\.reduce\(/.test(src), "the module carries no arithmetic on a figure"); }
// ---------- mutants ----------
{ const m1 = html.replace('<nav aria-label="Views">', '<nav aria-label="Views"><button role="tab">Decision</button>'); const p = await openPage(b, m1, 1440, 900), m = await p.evaluate(MEASURE); await p.close(); ok(m.tabs > 0 || m.topTabs.length !== 2, "mutant caught: a third tab");
  const m2 = html.replace("</style>", ".card.pad{box-shadow:0 1px 3px #000}</style>"); const p2 = await openPage(b, m2, 1440, 900), n = await p2.evaluate(MEASURE); await p2.close(); ok(n.shadows.length > 1, "mutant caught: a second shadow");
  const m3 = html.replace("</style>", ".val{position:static!important}</style>"); const p3 = await openPage(b, m3, 1440, 900); await p3.evaluate(() => { document.getElementById("col").style.minHeight = "3000px"; window.scrollTo(0, 1200); }); const s = await p3.evaluate(MEASURE); await p3.close(); ok(!(s.val.y >= -1 && s.val.y < 40), "mutant caught: a panel that is not sticky scrolls away");
  const m4 = html.replace("</style>", "@media (max-width:1100px){.val{order:5!important}.ws{display:flex;flex-direction:column}.col{order:1}}</style>"); const p4 = await openPage(b, m4, 1024, 900), q = await p4.evaluate(MEASURE); await p4.close(); ok(!(q.val.y < q.col.y), "mutant caught: a panel below the centre column on a small screen"); }
// ---------- 7 to 11, Sam's first run ----------
const CSSMUT = (h, css) => h.replace("</style>", css + "</style>");
const wait = ms => new Promise(r => setTimeout(r, ms));
{ // 7 the figure as sent
  const SIGN = () => { const K = window.__v4.K(), nr = document.querySelector(".numrow"), vi = document.getElementById("valIn"); return { fl: K.reserve.figureLine, val: vi.value, beside: nr.textContent.trim(), twice: /\$\s*\$/.test(document.body.innerText + " " + [...document.querySelectorAll("input,textarea")].map(i => i.value).join(" ")) }; };
  const probe = async h => { const p = await openPage(b, h, 1440, 900); const r = await p.evaluate(SIGN); await p.close(); return r; };
  const g = await probe(html); ok(!!g.fl && g.val === g.fl && g.beside === "" && !g.twice, `the Reserve input prints the server's figureLine as sent (${g.val}) with nothing added beside it`);
  const m = await probe(html.replace('<div class="numrow">', '<div class="numrow"><span>$</span>')); ok(m.beside !== "" && /\$\s*\$/.test(m.beside + m.val), `mutant caught: a page added "$" before the figure line reads ${m.beside}${m.val}`);
  const src = ["lib/preview/deskV4.js", "lib/preview/deskV4Client.js", "lib/preview/deskV3.js"].map(f => fs.readFileSync(f, "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")).join("\n");
  const RX = /(>\$<)|(["']\$ ?["'])|(\+\s*["']\$)|(["']\$["']\s*\+)|(`\$[^{])|(["']\$\d)/; ok(!RX.test(src), "no page source adds a dollar sign of its own (a sign comes only inside a line the server sent)");
  ok(RX.test(src.replace("<h3>New case</h3>", "<h3>New case</h3><span>$</span>")), "mutant caught: the source scan finds a literal sign"); }
{ // 8 feedback while a switch is in flight
  const IN = () => { const q = s => document.querySelector(s), m = q("#s-market"), on = [...document.querySelectorAll("#period button")].find(x => x.classList.contains("wait")); return { wait: !!on, pressed: on && on.getAttribute("aria-pressed"), busy: m.classList.contains("busy"), op: Number(getComputedStyle(m).opacity), sales: Number(getComputedStyle(q("#s-closest")).opacity), cbusy: q("#cond").classList.contains("busy"), cop: Number(getComputedStyle(q("#cond")).opacity), cw: !!q("#cond .wait"), cpressed: (q("#cond .wait") || { getAttribute() {} }).getAttribute("aria-pressed"), msg: q("#swmsg").hidden ? "" : q("#swmsg").textContent, on: (q("#period .on") || {}).textContent }; };
  // the demonstration case holds one recorded read (12 months), so the real reader REFUSES 6 and 24 with its own line; an answered switch is the real 12 month answer with the window the page asked for
  const answered = async bd => { if (bd.action === "case_edit" && bd.op === "window") { const r = await PV.previewDeskApi({ ...bd, months: 12 }); r.case.desk.evidence.windowMonths = bd.months; r.case.windowMonths = bd.months; return r; } };
  const run = async (mutate, intercept) => { const p = await openLive(b, { delay: 900, mutate, intercept }); await p.click('#period [data-m="24"]'); await wait(300); const a = await p.evaluate(IN); await wait(1500); const z = await p.evaluate(IN);
    await p.evaluate(() => { const bt = [...document.querySelectorAll("#cond button")].find(x => x.getAttribute("aria-pressed") !== "true"); bt.click(); }); await wait(300); const c = await p.evaluate(IN); await wait(1500); const c2 = await p.evaluate(IN); await p.close(); return { a, z, c, c2 }; };
  const g = await run(null, answered); ok(g.a.wait && g.a.pressed === "true" && g.a.busy && g.a.op < 1 && g.a.sales < 1, `a period switch in flight: the pressed control and the dimmed market and sales show it (opacity ${g.a.op})`);
  ok(!g.z.busy && !g.z.wait && g.z.op === 1 && g.z.on === "24 months", "the server's answer replaces it: the dimming and the pressed state are gone and the period it answered for is on");
  ok(g.c.cbusy && g.c.cw && g.c.cpressed === "true" && g.c.cop < 1 && g.c.op < 1, `a condition switch in flight shows it too (the picked rung pressed, the section dimmed, opacity ${g.c.cop})`);
  ok(!g.c2.cbusy && !g.c2.cw && g.c2.cop === 1, "the condition answer replaces it and the dimming goes");
  const rf = await run(null, null); ok(rf.a.busy && !rf.z.busy && !rf.z.wait && rf.z.on === "12 months" && /could not read the sales/.test(rf.z.msg), `a switch the server refuses: the controls come back as they were and its own line is printed under the period control (${rf.z.msg.slice(0, 50)})`);
  const mu = await run(h => h.replace("function working(on, who) {", "function working(on, who) { return;"), answered); ok(!(mu.a.busy && mu.a.wait) && !(mu.c.cbusy && mu.c.cw), "mutant caught: a switch with no feedback is a dead click");
  const mu2 = await run(h => h.replace("function switched(r) {", "function switched(r) { return;"), null); ok(!/could not read the sales/.test(mu2.z.msg), "mutant caught: a refusal that is not printed"); }
{ // 9 the panel while the New case form is open
  const VIS = () => { const v = e => { const x = document.querySelector(e); return !!x && x.offsetWidth > 0 && x.offsetHeight > 0 && getComputedStyle(x).visibility !== "hidden"; }; return { panel: v("#val"), label: v("#val .eyebrow"), fig: v("#valIn"), chk: v("#chk"), fin: v("#bFin"), send: v("#bSend"), cond: v("#cond"), text: (document.querySelector("#val .eyebrow") || {}).textContent }; };
  const run = async (w, mutate) => { const p = await openLive(b, { w, mutate }); const before = await p.evaluate(VIS); await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(250); const open = await p.evaluate(VIS); await p.evaluate(() => document.getElementById("nc-x").click()); await wait(200); const after = await p.evaluate(VIS); await p.close(); return { before, open, after }; };
  for (const w of [1440, 1024]) { const r = await run(w); ok(r.before.fig && r.open.panel && r.open.label && /Recommended reserve/.test(r.open.text) && !r.open.fig && !r.open.chk && !r.open.fin && !r.open.send && !r.open.cond && r.after.fig && r.after.fin, `@${w}: with the New case form open the Reserve panel shows its label only, and Cancel brings the case back`); }
  const mu = await run(1440, h => h.replace(/body\[data-new\] #val \.hd>:not\(\.eyebrow\)[^}]*}/, "")); ok(mu.open.fig, "mutant caught: a panel that keeps the previous case's figure while the form is open"); }
{ // 10 the rail's stats
  const OPS = () => [...document.querySelectorAll(".ops div")].map(d => { const s = d.querySelector("span"), v = d.querySelector("b"), r = d.getBoundingClientRect(); return { h: Math.round(r.height), cut: s.scrollWidth > s.clientWidth + 1, right: Math.round(v.getBoundingClientRect().right), t: s.textContent }; });
  const run = async (w, mutate, drawer) => { const p = await openLive(b, { w, mutate }); if (drawer) { await p.click("#qopen"); await wait(300); } const r = await p.evaluate(OPS); await p.close(); return r; };
  const okOps = r => r.length >= 3 && r.every(x => x.h <= 18 && !x.cut) && new Set(r.map(x => x.right)).size === 1;
  for (const [w, d] of [[1440, false], [1280, false], [1024, true], [390, true]]) { const r = await run(w, null, d); ok(okOps(r) && r.some(x => /Cases needing more from the seller/.test(x.t)), `@${w}${d ? " (drawer)" : ""}: every rail stat is one line, label whole, values aligned (${r.map(x => x.h).join(",")} px)`); }
  const mu = await run(1440, h => CSSMUT(h, ".ops div{white-space:normal!important}.ops div span{overflow:visible!important}.ops{font-size:13px!important}"), false); ok(!okOps(mu), "mutant caught: the old wrapping stat layout"); }
{ // 11 the queue rows
  await seedIntake();
  const ROWS = () => { const rows = [...document.querySelectorAll("#queue .qi")], q0 = rows[0].querySelector(".qn"); q0.textContent = "1999 Porsche 911 Carrera Cabriolet Tiptronic With A Very Long Name Indeed"; if (!rows[0].querySelector(".tag")) { const t = document.createElement("em"); t.className = "tag"; t.textContent = "Forwarded lead"; q0.parentElement.appendChild(t); }
    return rows.map(q => { const r = q.getBoundingClientRect(), ph = q.querySelector(".ph").getBoundingClientRect(), bb = q.querySelector(".qt b").getBoundingClientRect(), sp = q.querySelector(".qt > span").getBoundingClientRect(); return { h: Math.round(r.height), pw: Math.round(ph.width), phh: Math.round(ph.height), pt: Math.round(ph.top - r.top), bt: Math.round(bb.top - r.top), bl: Math.round(bb.left - r.left), st: Math.round(sp.top - r.top), none: q.querySelector(".ph").classList.contains("none"), tile: q.querySelector(".ph").textContent.trim(), tag: !!q.querySelector(".tag") }; }); };
  const run = async (w, mutate) => { const p = await openLive(b, { w, mutate }); const r = await p.evaluate(ROWS); await p.close(); return r; };
  const same = r => ["h", "pw", "phh", "pt", "bt", "bl", "st"].every(k => new Set(r.map(x => x[k])).size === 1);
  for (const w of [1440, 1280]) { const r = await run(w); ok(r.length >= 8 && r.some(x => x.none) && r.some(x => !x.none) && r.some(x => x.tag) && same(r) && r.filter(x => x.none).every(x => x.tile), `@${w}: ${r.length} queue rows (photo, text tile, tag, a very long name) share one row height, thumbnail box and text offset`); }
  const t = await run(1440); ok(t.filter(x => x.none).every(x => /^\d\d[A-Z]$|^[A-Za-z]{1,5}$/.test(x.tile)), `the text tile is cut from the case's own title (${[...new Set(t.filter(x => x.none).map(x => x.tile))].join(", ")})`);
  const mu = await run(1440, h => CSSMUT(h, ".qi{height:auto!important;padding:7px 8px!important}.qi .ph.none{width:30px!important;height:20px!important}.qi b{display:block!important;height:auto!important}.qi .tag{display:block!important}.qi .qn{white-space:normal!important}")); ok(!same(mu), "mutant caught: rows that differ in height and thumbnail box"); }
{ // 12 and 13 no figure, no plot
  const NOFIG = () => { const q = i => document.getElementById(i), K = window.__v4.K(), lg = document.querySelector("#s-market .legend"); return { val: q("valIn").value, lone: /(^|\s)\$(\s|$)/.test(q("val").innerText), mkt: q("mkt").hidden ? "" : q("mkt").textContent, want: K.marketLine, dis: q("plot").getAttribute("aria-disabled"), pe: getComputedStyle(q("plot")).pointerEvents, legend: !!lg && lg.offsetHeight > 0, ins: q("mkins").hidden ? "" : q("mkins").textContent, fig: K.reserve.figure }; };
  const run = async (tier, mutate) => { const p = await openLive(b, { mutate }); await p.evaluate(t => document.querySelector('#cond [data-c="' + t + '"]').click(), tier); await wait(900); const r = await p.evaluate(NOFIG); await p.close(); return r; };
  for (const [tier, name] of [[1, "Concours"], [4, "Fair"]]) { const r = await run(tier);
    ok(r.fig == null && r.val === "" && !r.lone && !!r.want && r.mkt === r.want, `${name}: no figure leaves the reserve input empty with no lone sign, and the engine's line is on the panel (${r.mkt.slice(0, 50)})`);
    ok(r.dis === "true" && r.pe === "none" && !r.legend && r.ins.length > 0, `${name}: no plot, so the plot is disabled, "drag to move" is not offered and the engine's line says why`); }
  const m1 = await run(1, h => h.replace('<div class="numrow">', '<div class="numrow"><span>$</span>')); ok(m1.lone, "mutant caught: a bare sign beside an empty reserve");
  const m2 = await run(1, h => CSSMUT(h.replace('svg.setAttribute("aria-disabled", none ? "true" : "false");', 'svg.setAttribute("aria-disabled", "false");'), "#s-market.noplot .legend{display:flex!important}#plot{pointer-events:auto!important}")); ok(m2.dis !== "true" && m2.legend, "mutant caught: a handle and legend offered with no plot"); }
{ // 14 the period's own lines
  const A = "Same 3 sales in the last 12 months.", B2 = "Sales on record start Nov 17, 2025.";
  const give = (sameLine, startLine) => async bd => { if (bd.action === "case_edit" && bd.op === "window") { const r = await PV.previewDeskApi({ ...bd, months: 12 }); r.case.desk.evidence.windowMonths = bd.months; r.case.desk.evidence.sameLine = sameLine; r.case.desk.evidence.startLine = startLine; return r; } };
  const run = async (sameLine, startLine, mutate) => { const p = await openLive(b, { intercept: give(sameLine, startLine), mutate }); const before = await p.evaluate(() => { const w = document.getElementById("winlines"); return w.hidden ? "" : w.textContent; }); await p.click('#period [data-m="24"]'); await wait(900); const r = await p.evaluate(() => { const w = document.getElementById("winlines"); return { t: w.hidden ? "" : w.textContent, n: w.children.length }; }); await p.close(); return { before, ...r }; };
  const g = await run(A, B2); ok(g.t === A + B2 && g.n === 2 && g.before === "", "the engine's sameLine and startLine print under the period control exactly as sent (and none before the server sent any)");
  const o = await run(null, null); ok(o.t === "", "no line from the server, no line printed");
  const m1 = await run(A, B2, h => h.replace("[e && e.sameLine, e && e.startLine]", '["Same sales as the longer period.", e && e.startLine]')); ok(m1.t !== A + B2, "mutant caught: a same-sales line the page wrote");
  const m2 = await run(A, B2, h => h.replace("[e && e.sameLine, e && e.startLine]", "[e && e.sameLine]")); ok(m2.t !== A + B2, "mutant caught: a start line dropped"); }
{ // 15 nothing clipped
  const CLIP = () => { const ctx = document.createElement("canvas").getContext("2d"), out = []; for (const i of document.querySelectorAll("#facts input, #val input:not([type=checkbox]), #newcase input.txt")) { const cs = getComputedStyle(i); if (!i.offsetWidth) continue; ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; const avail = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), txt = i.value || i.placeholder || ""; if (ctx.measureText(txt).width > avail + 0.5) out.push((i.id || i.getAttribute("data-field") || i.getAttribute("aria-label")) + " " + txt.slice(0, 24)); } return out; };
  const run = async (w, mutate) => { const p = await openLive(b, { w, mutate }); const r = await p.evaluate(CLIP); await p.close(); return r; };
  for (const w of [1440, 1280, 1024, 390]) { const r = await run(w); ok(r.length === 0, `@${w}: no fact value, panel field or placeholder is wider than its box${r.length ? ": " + r.join(" | ") : ""}`); }
  const mu = await run(1440, h => CSSMUT(h.replace('placeholder="For example: from photographs"', 'placeholder="For example: assessed from photographs, inspection advised"'), ".facts{grid-template-columns:auto 1fr auto!important}.facts>.k.long,.facts>.v.long,.facts .marks{grid-column:auto!important}")); ok(mu.some(x => /vin|cnote/.test(x)), `mutant caught: the squeezed facts column and the long placeholder (${mu.slice(0, 2).join(" | ")})`); }
await b.close();
done("deskV4ShellCheck");
