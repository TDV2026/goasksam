// DESK V4 SHELL (Lane E, Nov 10 2026; /preview/desk and /preview/desk/case/:id, lib/preview/deskV4.js, built to docs/desk-mockups/desk-v4.html). Offline: the crew door is run in process, the page in Chrome.
//   1 CREW ONLY: no cookie or a forged one gets the platform 404 on both routes; an unknown case gets it too; noindex and no-store; the routes in vercel.json need the crew cookie.
//   2 ZONES: at 1280 and wider the queue is 232px, the Reserve panel 372px and sticky (it stays in view after the page scrolls), the centre column takes the rest and scrolls; no Vehicle, Market evidence or Decision tabs (two top bar tabs only);
//     under 1100px the panel is above the centre column and the queue is a drawer (hidden, opened by the Cases button, closed by the scrim).
//   3 ONE SHADOW: exactly one element on the page has a box shadow, the Reserve panel.
//   4 TOP BAR: GoAskSam Desk, the org name, the two tabs (Analyst workspace, Seller report; the report view opens and closes), the saved state; the handling clock only when the server sent one.
//   5 LAYOUT: no horizontal overflow at 1440, 1280, 1024 and 390; light and dark tokens both defined and the page background changes with the scheme.
//   6 NOTHING COMPUTED: the module's text carries no arithmetic on a figure.
//   CLASS: any tab beside the two, any second shadow, a panel that scrolls away or sits below the centre column on a small screen, a queue that squeezes the centre column. Mutants run through the same assertions must be caught.
//   node scripts/deskV4ShellCheck.mjs
import fs from "node:fs";
import { launch, openPage, imp, tally, ROOT } from "./deskV3Harness.mjs";
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
// ---------- 6 nothing computed ----------
{ const src = fs.readFileSync("lib/preview/deskV4.js", "utf8").replace(/\/\/.*$/gm, ""); ok(!/Math\.(round|floor|ceil|min|max)|parseFloat|toFixed|toLocaleString|\.reduce\(/.test(src), "the module carries no arithmetic on a figure"); }
// ---------- mutants ----------
{ const m1 = html.replace('<nav aria-label="Views">', '<nav aria-label="Views"><button role="tab">Decision</button>'); const p = await openPage(b, m1, 1440, 900), m = await p.evaluate(MEASURE); await p.close(); ok(m.tabs > 0 || m.topTabs.length !== 2, "mutant caught: a third tab");
  const m2 = html.replace("</style>", ".card.pad{box-shadow:0 1px 3px #000}</style>"); const p2 = await openPage(b, m2, 1440, 900), n = await p2.evaluate(MEASURE); await p2.close(); ok(n.shadows.length > 1, "mutant caught: a second shadow");
  const m3 = html.replace("</style>", ".val{position:static!important}</style>"); const p3 = await openPage(b, m3, 1440, 900); await p3.evaluate(() => { document.getElementById("col").style.minHeight = "3000px"; window.scrollTo(0, 1200); }); const s = await p3.evaluate(MEASURE); await p3.close(); ok(!(s.val.y >= -1 && s.val.y < 40), "mutant caught: a panel that is not sticky scrolls away");
  const m4 = html.replace("</style>", "@media (max-width:1100px){.val{order:5!important}.ws{display:flex;flex-direction:column}.col{order:1}}</style>"); const p4 = await openPage(b, m4, 1024, 900), q = await p4.evaluate(MEASURE); await p4.close(); ok(!(q.val.y < q.col.y), "mutant caught: a panel below the centre column on a small screen"); }
await b.close();
done("deskV4ShellCheck");
