// THE CREW PREVIEWS ON A LOCAL RUN WITH THE REAL ENGINE FIELDS (Lane E, Nov 8 2026). Lane B's readers (findExamplesField, tasksDemoField, watchingDemoField) run for real over Lane B's own stand-in world (their fixtures are read from scripts/engineCardShapeCheck.mjs, not copied, so a change there is a change
// here): the real enrichFast cards, the real Task and watching rows. The answers go through the real api/crewPage.js with the signed crew cookie, and the page is loaded in Chrome (images answered locally). It asserts THREE Find cards and TWO Task cards, drawn by the real components, lined up,
// in both states (live, and the fallback after the cars end), and writes a screenshot of each to docs/design/preview/. CAUSE this closes: each side was only ever checked against a fixture of its own shape, so Sam saw empty pages. The check joins the two real sides.
//   node scripts/crewLocalRun.mjs [--shots]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { createRequire } from "node:module";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..");
const puppeteer = createRequire(path.join(root, "package.json"))("puppeteer-core");
const shots = process.argv.includes("--shots");
const src = fs.readFileSync(path.join(root, "scripts/engineCardShapeCheck.mjs"), "utf8");
const ia = src.indexOf("process.chdir(root);"), ib = src.indexOf("// (1) FIND");
if (ia < 0 || ib < ia) { console.log("FAIL  Lane B's engineCardShapeCheck no longer has the markers this run reads (process.chdir(root); ... // (1) FIND)"); process.exit(1); }
const gen = path.join(root, "scripts/_crewLocalRun.gen.mjs");
const head = `import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; const root = ${JSON.stringify(root)};\n`;
const tail = `
export { world, live3, sale, car, env, NOW, IN, CREW, FE, TD, WD };
`;
fs.writeFileSync(gen, head + src.slice(ia, ib) + tail);
let W0;
try { W0 = await import(pathToFileURL(gen).href); } finally { fs.unlinkSync(gen); }
const { world, live3, sale, car, env, NOW, CREW, FE, TD, WD } = W0;
// Lane B's tasksEmailExample world (a stored match update for the 1995 BMW M3 Coupe), read from scripts/tasksEmailExampleCheck.mjs the same way
const src2 = fs.readFileSync(path.join(root, "scripts/tasksEmailExampleCheck.mjs"), "utf8"), ja = src2.indexOf("let metered = 0, listings = [];"), jb = src2.indexOf("{ // (1) preferred");
if (ja < 0 || jb < ja) { console.log("FAIL  Lane B's tasksEmailExampleCheck no longer has the markers this run reads"); process.exit(1); }
const gen2 = path.join(root, "scripts/_crewLocalRun2.gen.mjs");
fs.writeFileSync(gen2, `import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; const ROOT = ${JSON.stringify(root)};\n` + src2.slice(ja, jb) + "\nexport { world as emailWorld, M3, OTHER, upd, card, TASKS, TD, env as env2, CREW as CREW2 };\n");
let E2; try { E2 = await import(pathToFileURL(gen2).href); } finally { fs.unlinkSync(gen2); }
process.chdir(root); process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const crewPage = await import(pathToFileURL(path.join(root, "api/crewPage.js")).href);
async function call(url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); await crewPage.default({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: cookie ? { cookie } : {}, body: null }, res); return res; }
// the page reads the engine through the seams; here each seam runs Lane B's real reader over the stand-in world (the page's own env check is bypassed the same way crewWiringCheck does)
const emailW = () => E2.emailWorld({ updates: [E2.upd("u2", "tA", Date.parse("2026-11-07T18:00:00Z"), E2.card(E2.M3))], tasks: E2.TASKS, rows: [E2.M3] });
const wire = W => { crewPage.FIND_EXAMPLES.read = () => FE.findExamplesField(env, CREW, W.d); crewPage.FIND_EXAMPLES.now = () => W.clock;
  crewPage.TASKS_EMAIL_EXAMPLE.read = async () => E2.TD.tasksEmailExample(E2.env2, CREW, emailW()); };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6075"/><stop offset="1" stop-color="#9db0c0"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/></svg>`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function load(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 1100 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = r.url(); if (/^https:\/\/(?!goasksam\.com)/.test(u) && /\.(jpe?g|png|webp)(\?|$)|photo|img/i.test(u) || r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg }); if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); r.respond({ status: 200, contentType: "text/plain", body: "" }); });
  p.on("pageerror", e => out.push("FAIL page error: " + e.message)); await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 600)); return p; }
const same = (a, k) => a.every(c => c[k] === a[0][k]);
const ROWFN = () => [...document.querySelectorAll("#fx-grid .lc")].map(a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".lc-ph"), pr = ph.getBoundingClientRect(); return { y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), asp: Math.round(pr.width / pr.height * 100) / 100, photo: !!ph.querySelector("img"), title: a.querySelector(".lc-t").textContent, plat: a.querySelector(".lc-p").textContent, link: a.querySelector(".lc-l").textContent, extras: a.querySelectorAll(".mlab,.sl,.specs,.acts,button,.chip").length, href: a.getAttribute("href") }; });
async function scenario(name, W, expect) {
  wire(W); const f = await call("/api/crewPage?page=preview-find", CREW), t = await call("/api/crewPage?page=preview-tasks", CREW), s1 = await call("/api/crewPage?page=preview-find", null);
  ok(f.code === 200 && t.code === 200 && s1.code === 404, `${name}: crew gets both pages, a stranger gets the 404`);
  for (const w of [1440, 390]) { const pf = await load(f.body, w), cf = await pf.evaluate(ROWFN); if (shots && w === 1440) await pf.screenshot({ path: path.join(root, `docs/design/preview/find-${name}.png`) }); await pf.close();
    ok(cf.length === 3 && cf.every(c => c.photo && c.title.length > 5 && c.plat && /↗$/.test(c.link) && c.extras === 0 && /^\/find\?q=/.test(c.href)) && same(cf, "w") && same(cf, "asp") && (w >= 1440 ? same(cf, "y") && same(cf, "h") : true), `${name} Find @${w}: THREE landing cards from Lane B's real field (photo, title, platform, one link line, one link each, equal height) (${cf.map(c => c.title).join(" | ")})`);
    if (w === 1440) ok(((f.body.match(/data-fallback="(\d)"/) || [])[1] | 0) === 3 - expect.live, `${name} Find: ${expect.live} live car(s), the other ${3 - expect.live} filled with Lane B's fallback sales`); }
  const pt = await load(t.body, 1440), em = await pt.evaluate(() => { const fr = document.querySelector(".em-frame"); if (!fr) return null; const r = fr.getBoundingClientRect(); return { w: Math.round(r.width), text: fr.innerText.replace(/\s+/g, " "), img: !!fr.querySelector("img"), btns: [...fr.querySelectorAll("a")].map(a => a.textContent.trim()).filter(x => /View auction|Market Check/.test(x)) }; });
  if (shots) await pt.screenshot({ path: path.join(root, `docs/design/preview/tasks-${name}.png`), fullPage: true }); await pt.close();
  ok(!!em && em.w <= 700 && /New since your last email/i.test(em.text) && /1995 BMW M3 Coupe/.test(em.text) && /Matches your Task: a BMW from 1995\./.test(em.text) && /147,000 miles/.test(em.text) && /West New York/.test(em.text) && em.img && em.btns.length >= 2, `${name} Tasks: the real Task match email renders from Lane B's stored update (the 1995 BMW M3 Coupe, New since your last email, the reason line, View auction and Market Check; the stand-in listing's auction ended by the real clock, so its bid line is the card's own call)`);
}
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); await scenario("live", W, { live: 3 }); }
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); W.rows = W.rows.slice(0, 1); await scenario("mixed", W, { live: 1 }); }
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); W.rows = []; W.clock = NOW + 400 * 3600e3; await scenario("fallback", W, { live: 0 }); }
// MARKET CHECK AND SELL ENTRY PAGES with Lane B's real example readers (lib/live/marketCheckExamples.js) over the stand-in world of scripts/_mcExamplesWorld.mjs, through the real api/crewPage.js (Lane B, Nov 8 2026): the section is drawn from the real field at 1440 and 390, a stranger gets the 404, and the kill switch leaves no section.
{ const { load: loadMc } = await import(pathToFileURL(path.join(root, "scripts/_mcExamplesWorld.mjs")).href), X = await loadMc(root), cookie = X.CREW.headers.cookie;
  const mc = X.world(X.ALLMC(X.pool(14))), sl = X.world({}, X.ALLSELL(X.places(3)));
  crewPage.MC_EXAMPLES.read = () => X.MX.marketCheckExampleResult(X.env, X.CREW, mc.d); crewPage.SELL_EXAMPLE.read = () => X.MX.sellExample(X.env, X.CREW, sl.d);
  const m = await call("/api/crewPage?page=preview-market-check", cookie), se = await call("/api/crewPage?page=preview-sell", cookie), st = await call("/api/crewPage?page=preview-market-check", null);
  ok(m.code === 200 && se.code === 200 && st.code === 404, "Market Check and Sell entry: crew gets both pages, a stranger gets the 404");
  { const fr = await call("/api/crewPage?page=preview-market-check-example", cookie), fs0 = await call("/api/crewPage?page=preview-market-check-example", null); const got = /window\.__GAS_MC_EXAMPLE=(\{[\s\S]*?\});<\/script>/.exec(fr.body); let o = null; try { o = JSON.parse(got[1]); } catch {}
    ok(fr.code === 200 && !!o && !!o.result && fs0.code === 404, "Market Check example frame: crew gets the live page's document with Lane B's real result handed to its results script (" + (o && o.result && (o.result.titleLine || o.model)) + "), a stranger gets the 404"); }
  for (const w of [1440, 390]) {
    const pm = await load(m.body, w), cm = await pm.evaluate(() => { const f = document.querySelector("[data-example-result] iframe"); return { frame: !!f, src: f && f.getAttribute("src"), head: (document.querySelector("[data-example-result] .fx-h") || {}).textContent, over: document.documentElement.scrollWidth > innerWidth, sales: document.querySelectorAll("[data-example-sales]").length }; }); await pm.close();
    ok(cm.frame && cm.src === "/preview/market-check/example" && cm.head === "Today's Market Check" && !cm.over && cm.sales === 0, `Market Check entry @${w}: the day's real result in its frame under "Today's Market Check" from Lane B's real field (marketCheckExampleResult), no old sales section, no overflow`);
    const ps = await load(se.body, w), cs = await ps.evaluate(() => [...document.querySelectorAll("[data-sell-example] .pc")].map(a => ({ t: a.querySelector(".pc-t").textContent, l: a.querySelector(".pc-m").textContent, over: document.documentElement.scrollWidth > innerWidth }))); if (shots && w === 1440) await ps.screenshot({ path: path.join(root, "docs/design/preview/sell-entry.png") }); await ps.close();
    ok(cs.length === 3 && cs.every(c => c.t && /^\d+ sales in the last 24 months: /.test(c.l) && !c.over), `Sell entry @${w}: THREE cars from Lane B's real field, each with the engine's sentence, no overflow`);
  }
  process.env.CREW_MC_EXAMPLES = "0"; process.env.CREW_SELL_EXAMPLE = "0"; X.MX.resetRecheck();
  const mc2 = X.world(X.ALLMC(X.pool(14))), sl2 = X.world({}, X.ALLSELL(X.places(3)));
  crewPage.MC_EXAMPLES.read = () => X.MX.marketCheckExampleSales(X.env, X.CREW, mc2.d); crewPage.SELL_EXAMPLE.read = () => X.MX.sellExample(X.env, X.CREW, sl2.d);
  const m0 = await call("/api/crewPage?page=preview-market-check", cookie), s0 = await call("/api/crewPage?page=preview-sell", cookie); delete process.env.CREW_MC_EXAMPLES; delete process.env.CREW_SELL_EXAMPLE;
  ok(m0.code === 200 && s0.code === 200 && !/data-example-sales/.test(m0.body) && !/data-sell-example/.test(s0.body) && !/data-could-not-read/.test(m0.body + s0.body), "Market Check and Sell entry with the kill switches on: the pages stand, no example section, no error line"); }
// DESK V3 WORKSPACE with the real readers (Lane E, Nov 9 2026): Lane D's demonstration case (HM-24117) with Lane B's deskBlock over the stand-in sales, through the real api/crewPage.js, caseView, reportState and readinessOf: crew gets the list and the case, a stranger and an unknown case get the 404, and the page prints what the readers produced at 1440 and 390.
{ const DC = "gas_crew=" + (await import(pathToFileURL(path.join(root, "lib/_crew.js")).href)).mintCrewCookieValue(), D = await import(pathToFileURL(path.join(root, "lib/preview/deskV3Fixture.js")).href), RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href), W = await import(pathToFileURL(path.join(root, "lib/desk/caseWorkflow.js")).href), kase = await D.demoCaseRecord(), ev = kase.desk.evidence, rd = W.readinessOf(kase);
  const list = await call("/api/crewPage?page=preview-desk", DC), one = await call("/api/crewPage?page=preview-desk&case=" + D.DEMO_ID, DC), none = await call("/api/crewPage?page=preview-desk&case=nope", DC), st = await call("/api/crewPage?page=preview-desk&case=" + D.DEMO_ID, null);
  ok(list.code === 200 && one.code === 200 && none.code === 404 && st.code === 404, `Desk: crew gets the list and the case, an unknown case and a stranger get the 404 (${list.code}, ${one.code}, ${none.code}, ${st.code})`);
  for (const w of [1440, 390]) { const pd = await load(one.body, w), m = await pd.evaluate(() => { const q = s => document.querySelector(s); return { market: q("#valBig") && q("#valBig").textContent, line: (q("#mline") || {}).textContent, figs: document.querySelectorAll("#sum .fg-v").length, tabs: document.querySelectorAll("#tabs3 [role=tab]").length, header: !!q("#chd h1"), over: document.documentElement.scrollWidth > innerWidth, blockers: [...document.querySelectorAll("[data-blocker]")].map(e => e.getAttribute("data-blocker")), fin: q("#b-fin") && q("#b-fin").disabled, rows: document.querySelectorAll(".cps tr.cp").length }; }); await pd.close();
    ok(m.market === RW.moneyWords(kase.assessment.figure) && m.figs === 1 && m.line.startsWith("Market: typical " + RW.moneyWords(ev.q1) + " to " + RW.moneyWords(ev.q3)) && m.tabs === 3 && m.header && !m.over && m.rows === kase.desk.comparables.length && JSON.stringify(m.blockers) === JSON.stringify(rd.blockers.map(b => b.key)) && m.fin === !rd.ready, `Desk case @${w}: the valuation ${RW.moneyWords(kase.assessment.figure)} as the one big figure with the market line under it, three tabs, ${kase.desk.comparables.length} comparables and Lane D's ${rd.blockers.length} readiness blockers as the readers produced them, no overflow (${m.market}, ${m.figs}, ${m.tabs}, ${m.rows})`); } }
await b.close();
out.forEach(l => console.log(l)); console.log(`crewLocalRun: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
