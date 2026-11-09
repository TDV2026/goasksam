// THE REDESIGNED DESK PREVIEW (Lane E, Nov 5 2026; /preview/desk, lib/preview/deskPreview.js). Three things, each proved to FAIL when its fix is taken away:
//   1 CREW ONLY: no cookie (or a forged one) gets the platform's own 404 from the page and from its API door; the crew cookie gets the page; vercel.json routes both only with the crew cookie.
//   2 THE BAR ON EVERY SCREEN: the green "GoAskSam Beta" bar spans the full width at the very top, in the brand forest, and the organisation name and the seat are VISIBLE (not clipped, not hidden) on every screen at 1440 and 390.
//   3 THE PAGE COMPUTES NOTHING: no arithmetic in the code the preview adds, and every number printed on a sheet is one the sheet's own object carries (the figure scan of sheetRenderCheck).
//   CLASS: any Desk screen whose bar, org or seat is missing or hidden at any width, and any figure on any screen that the engine did not send. Mutants for each are run through the same assertions and must be caught.
//   node scripts/deskPreviewCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { mintCrewCookieValue } = await imp("lib/_crew.js"), { allowedFigures, unexplained, figuresIn } = await imp("scripts/figureScan.mjs");
const { renderDeskPreview, previewDeskApi, resetPreviewStore, PREVIEW_ORG, PREVIEW_SEAT } = await imp("lib/preview/deskPreview.js"), crewPage = (await imp("api/crewPage.js")).default;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const REAL_JS = fs.readFileSync("public/js/deskvals.js", "utf8"), crew = "gas_crew=" + mintCrewCookieValue();

// ---------- 1 crew only (the assertions take the handler, so a handler that serves a stranger is caught) ----------
async function callWith(handler, url, { cookie, method = "GET", body } = {}) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { this.body = String(b || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL("https://goasksam.com" + url);
  await handler({ url, method, query: Object.fromEntries(u.searchParams), body: body || {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) } }, res); return res;
}
async function crewAssertions(handler, tag) {
  const bad = [];
  const page = await callWith(handler, "/api/crewPage?page=preview-desk-valuations"), api = await callWith(handler, "/api/crewPage?page=preview-desk-api", { method: "POST", body: { action: "sheet_queue", view: "queue" } });
  if (page.code !== 404 || /GoAskSam|Valuations|tb-org/.test(page.body)) bad.push("the page answered a request with no cookie");
  if (api.code !== 404 || /"ok"|rows|sheet/.test(api.body)) bad.push("the API door answered a request with no cookie");
  const forged = await callWith(handler, "/api/crewPage?page=preview-desk-valuations", { cookie: "gas_crew=v1.9999999999999.forged" }); if (forged.code !== 404) bad.push("a forged crew cookie got the page");
  const getApi = await callWith(handler, "/api/crewPage?page=preview-desk-api", { cookie: crew }); if (getApi.code !== 404) bad.push("the API door answered a GET");
  const good = await callWith(handler, "/api/crewPage?page=preview-desk-valuations", { cookie: crew }); if (good.code !== 200 || !/class="topbar"/.test(good.body)) bad.push("the crew cookie did not get the page");
  if (!/noindex/.test(good.h["x-robots-tag"] || "")) bad.push("the page carries no noindex header");
  const q = await callWith(handler, "/api/crewPage?page=preview-desk-api", { cookie: crew, method: "POST", body: { action: "sheet_queue", view: "queue" } }); let j = null; try { j = JSON.parse(q.body); } catch {} if (!(j && j.ok && j.rows && j.rows.length >= 4)) bad.push("the crew cookie did not get the sample queue from the API door");
  return bad;
}
const bad1 = await crewAssertions(crewPage); ok(bad1.length === 0, `1 crew only: ${bad1.join("; ") || "ok"}`);
{ const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")); for (const [src, page] of [["/preview/desk-valuations", "preview-desk-valuations"], ["/preview/desk/api", "preview-desk-api"]]) { const r = (vj.rewrites || []).filter(x => x.source === src); ok(r.length === 1 && r[0].destination === "/api/crewPage?page=" + page && (r[0].has || []).length === 1 && r[0].has[0].key === "gas_crew", `1 vercel.json routes ${src} only with the crew cookie`); } }
// mutant: the gate removed (a handler that serves whoever asks) must be caught
{ const leaky = async (req, res) => { const { renderDeskPreview: r, previewDeskApi: a } = await imp("lib/preview/deskPreview.js"); if (/preview-desk-api/.test(req.url)) { res.setHeader("Content-Type", "application/json"); return res.status(200).send(JSON.stringify(await a(req.body))); } res.setHeader("Content-Type", "text/html"); return res.status(200).send(r()); };
  const bad = await crewAssertions(leaky); ok(bad.length >= 3, `1 mutant: a page and API door with no cookie gate are caught (${bad.length} findings)`); }

// THE SAMPLE QUEUE DOES NOT DEPEND ON THE TIME OF DAY (Nov 6 2026): the sample sheets are aged from the clock, and today's queue lists only today's sheets, so a preview opened just after UTC midnight lost the sheet that was a few hours old. CLASS: any sample sheet whose date follows the clock.
{ const real = Date.now; const rows = async at => { Date.now = () => at; resetPreviewStore(); try { const q = await previewDeskApi({ action: "sheet_queue", view: "queue" }); return q.rows.map(r => r.id).sort().join(); } finally { Date.now = real; resetPreviewStore(); } };
  /* the day the check runs, not a pinned Nov 6: the samples are dated from the clock */ const TODAY = new Date(real()); const want = "pv_fin,pv_hm,pv_m3,pv_none,pv_thin"; const got = []; for (const [h, m] of [[0, 5], [1, 40], [12, 0], [23, 55]]) got.push(await rows(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate(), h, m)));
  ok(got.every(g => g === want), "1 the sample queue holds all five sample sheets (the demonstration case is stored at the first read) at 00:05, 01:40, 12:00 and 23:55 UTC (" + got.map(g => g.split(",").length).join(", ") + " sheets)"); }
// ---------- the browser: every screen at both ends ----------
async function open(b, width, mode, { html, js }) {
  const page = await b.newPage(); await page.setViewport({ width, height: 900 }); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.evaluateOnNewDocument(m => { try { sessionStorage.setItem("desk_mode", m); } catch (e) {} }, mode); await page.setRequestInterception(true);
  page.on("request", async r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const m = /^\/dsk\.[^/]+\/([\w.-]+\.js)$/.exec(u.pathname); if (u.host === "goasksam.com" && m) return r.respond({ status: 200, contentType: "application/javascript", body: m[1] === "deskvals.js" ? js : fs.readFileSync(path.join(ROOT, "public/js", m[1]), "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/preview/desk/api" && r.method() === "POST") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(await previewDeskApi(bd)) }); }
    return r.respond({ status: 204, body: "" }); });
  await page.goto("https://goasksam.com/preview/desk-valuations", { waitUntil: "networkidle2" }).catch(() => {}); await wait(450); page._errs = errs; return page;
}
const click = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, sel);
const SCREENS = [["queue", "vals", async () => {}], ["sheet", "vals", async p => { await click(p, '[data-open="pv_m3"]'); await wait(700); await click(p, '[data-tier="3"]'); await wait(700); }], ["thin pool", "vals", async p => { await click(p, '[data-open="pv_m3"]'); await wait(700); await click(p, '[data-tier="1"]'); await wait(700); }],
  ["finalised", "vals", async p => { await click(p, '[data-open="pv_fin"]'); await wait(800); }], ["unread", "vals", async p => { await click(p, '[data-open="pv_none"]'); await wait(600); }], ["analyst empty", "analyst", async () => {}],
  ["analyst answer", "analyst", async p => { await p.evaluate(() => { document.getElementById("q").value = "Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"; document.getElementById("go").click(); }); await p.waitForFunction(() => document.querySelector("#out table.answer, #out .msg"), { timeout: 15000 }).catch(() => {}); await wait(600); }]];
// what the bar looks like on screen: full width, at the very top, brand forest, and the three words visible inside the viewport
const barOf = p => p.evaluate(() => {
  const bar = document.querySelector(".topbar"); if (!bar) return { missing: true };
  const r = bar.getBoundingClientRect(), cs = getComputedStyle(bar), seen = sel => { const e = bar.querySelector(sel); if (!e) return null; const c = getComputedStyle(e), q = e.getBoundingClientRect(); const vis = c.display !== "none" && c.visibility !== "hidden" && q.width > 0 && q.height > 0 && q.left >= 0 && q.right <= innerWidth + 0.5 && q.top >= 0 && q.bottom <= r.bottom + 0.5; return vis ? e.textContent.trim() : "HIDDEN"; };
  return { x: r.left, y: r.top, w: r.width, vw: innerWidth, bg: cs.backgroundColor, mark: seen(".tb-mark"), beta: seen(".tb-beta"), org: seen(".tb-org"), seat: seen(".tb-seat") };
});
async function barAssertions(b, ctx, tag) {
  const bad = [];
  for (const w of [1440, 390]) for (const [name, mode, fn] of SCREENS) {
    resetPreviewStore(); const p = await open(b, w, mode, ctx); await fn(p); const x = await barOf(p); await p.close();
    if (x.missing) { bad.push(`${name} @${w}: no bar`); continue; }
    if (!(Math.abs(x.w - x.vw) < 1 && x.x === 0 && x.y === 0)) bad.push(`${name} @${w}: the bar is not full width at the top`);
    if (x.bg !== "rgb(11, 49, 38)") bad.push(`${name} @${w}: the bar is ${x.bg}, not the brand forest`);
    if (x.mark !== "GoAskSam" || !/^beta$/i.test(x.beta || "")) bad.push(`${name} @${w}: "GoAskSam Beta" is not shown (${x.mark} ${x.beta})`);
    if (x.org !== PREVIEW_ORG.name) bad.push(`${name} @${w}: the organisation name is ${x.org === "HIDDEN" ? "hidden" : "not shown"}`);
    if (x.seat !== PREVIEW_SEAT) bad.push(`${name} @${w}: the seat is ${x.seat === "HIDDEN" ? "hidden" : "not shown"}`);
  }
  return bad;
}
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const real = { html: renderDeskPreview(), js: REAL_JS };
const bad2 = await barAssertions(b, real); ok(bad2.length === 0, `2 the GoAskSam Beta bar, the organisation and the seat are on every screen at 1440 and 390 (${SCREENS.length * 2} screens): ${bad2.slice(0, 4).join("; ") || "ok"}`);
// the preview carries no tester or seat stand-ins of its own: what the bar prints is the org settings and the seat the server knows
ok(real.html.includes(PREVIEW_ORG.name) && real.html.includes(`>${PREVIEW_SEAT}<`), "2 the bar's org and seat are written by the server from the org settings and the seat");
// mutants: a screen without the bar; the organisation hidden on a phone (the way a narrow screen can lose it); a bar in the wrong green
for (const [name, html] of [["no bar", real.html.replace(/<header class="topbar"[\s\S]*?<\/header>/, "")], ["the organisation hidden on a phone", real.html.replace("</style></head>", "@media (max-width:640px){.topbar .tb-org{display:none}}</style></head>")], ["the wrong green", real.html.replace("</style></head>", ".topbar{background:#1E4D38!important}</style></head>")]]) {
  ok(html !== real.html, `2 mutant "${name}" applies`); const bad = await barAssertions(b, { html, js: REAL_JS }); ok(bad.length > 0, `2 mutant: ${name} is caught (${bad[0] || "NOT CAUGHT"})`);
}

// ---------- 3 the page computes nothing ----------
const ADDED = fs.readFileSync("lib/preview/deskPreview.js", "utf8") + "\n" + real.html.slice(real.html.indexOf("window.__DESK_PREVIEW__"), real.html.indexOf("window.__DESK_PREVIEW__") + 400);
ok(!/Math\.|\.reduce\(|\.sort\(|parseFloat|toFixed|toPrecision|Number\(/.test(ADDED.replace(/Number\(ms\)/g, "")), "3 the code the preview adds holds no Math, sort, reduce or rounding");
ok(!/<script[^>]*>[^<]*[0-9]\s*[-+*\/]\s*[0-9]/.test(real.html.replace(/<script src[^>]*><\/script>/g, "")), "3 no arithmetic in the page's inline script");
const sheetText = p => p.evaluate(() => { const c = document.querySelector(".sheet"); if (!c) return ""; const o = [], w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest(".no, .covfix, textarea, script, style")) continue; o.push(n.textContent); } return o.join(" | "); });
async function figureAssertions(ctx) {
  const bad = []; for (const id of ["pv_m3", "pv_fin"]) for (const tier of id === "pv_m3" ? [3, 1] : [null]) {
    resetPreviewStore(); const p = await open(b, 1440, "vals", ctx); await click(p, `[data-open="${id}"]`); await wait(700); if (tier) { await click(p, `[data-tier="${tier}"]`); await wait(700); }
    const obj = await p.evaluate(() => window.__deskVals.state.sheets[window.__deskVals.state.active].v), text = await sheetText(p), un = unexplained(text, allowedFigures(obj.read, obj.evaluation, obj.sheet, obj.org, obj.thisCar, obj.sections, obj.checklist, obj.reasons));
    if (figuresIn(text).length < 30) bad.push(`${id} tier ${tier}: too few figures read`); if (un.length) bad.push(`${id} tier ${tier}: unexplained figures ${un.slice(0, 4).join(", ")}`); await p.close();
  } return bad;
}
const bad3 = await figureAssertions(real); ok(bad3.length === 0, `3 every figure on the sample sheets is one the engine's object carries: ${bad3.join("; ") || "ok"}`);
{ const mutated = REAL_JS.replace('f("Sales", nf(m.count))', 'f("Sales", nf(m.count + 5))'); ok(mutated !== REAL_JS, "3 mutant (a count made by the page) applies"); const bad = await figureAssertions({ html: real.html, js: mutated }); ok(bad.length > 0, `3 mutant: a page that computes a count is caught (${bad[0] || "NOT CAUGHT"})`); }
{ const html = real.html.replace("window.__DESK_PREVIEW__=1;", "window.__DESK_PREVIEW__=1;var z=Math.round(2*3);"); const lint = !/Math\./.test(html.slice(html.indexOf("window.__DESK_PREVIEW__"), html.indexOf("window.__DESK_PREVIEW__") + 400)); ok(!lint, "3 mutant: arithmetic added to the preview's script is caught by the lint"); }
await b.close();
out.forEach(l => console.log(l)); console.log(`deskPreviewCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
