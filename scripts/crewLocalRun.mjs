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
process.chdir(root); process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const crewPage = await import(pathToFileURL(path.join(root, "api/crewPage.js")).href);
async function call(url, cookie) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); await crewPage.default({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: cookie ? { cookie } : {}, body: null }, res); return res; }
// the page reads the engine through the seams; here each seam runs Lane B's real reader over the stand-in world (the page's own env check is bypassed the same way crewWiringCheck does)
const wire = W => { crewPage.FIND_EXAMPLES.read = () => FE.findExamplesField(env, CREW, W.d); crewPage.TASKS_DEMO.read = () => TD.tasksDemoField(env, CREW, W.d); crewPage.WATCHING_DEMO.read = () => WD.watchingDemoField(env, CREW, W.d);
  crewPage.FIND_EXAMPLES.now = crewPage.TASKS_DEMO.now = () => W.clock; };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6075"/><stop offset="1" stop-color="#9db0c0"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/></svg>`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function load(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 1100 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = r.url(); if (/^https:\/\/(?!goasksam\.com)/.test(u) && /\.(jpe?g|png|webp)(\?|$)|photo|img/i.test(u) || r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg }); if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); r.respond({ status: 200, contentType: "text/plain", body: "" }); });
  p.on("pageerror", e => out.push("FAIL page error: " + e.message)); await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 600)); return p; }
const GEO = sel => [...document.querySelectorAll(sel)].map(a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".ph"), t = a.querySelector(".ttl").getBoundingClientRect(); const pr = ph ? ph.getBoundingClientRect() : null; return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), asp: pr ? Math.round(pr.width / pr.height * 100) / 100 : 0, ty: Math.round(t.top), photo: !!ph, bid: (a.querySelector(".mlab") || {}).textContent || "", tag: (a.querySelector(".chip") || {}).textContent || "", t: a.querySelector(".ttl").textContent }; });
const same = (a, k) => a.every(c => c[k] === a[0][k]);
async function scenario(name, W, expect) {
  wire(W); const f = await call("/api/crewPage?page=preview-find", CREW), t = await call("/api/crewPage?page=preview-tasks", CREW), s1 = await call("/api/crewPage?page=preview-find", null);
  ok(f.code === 200 && t.code === 200 && s1.code === 404, `${name}: crew gets both pages, a stranger gets the 404`);
  for (const w of [1440, 1024]) {
    const pf = await load(f.body, w), cf = await pf.evaluate(GEO, "#fx-grid article.car"); if (shots && w === 1440) await pf.screenshot({ path: path.join(root, `docs/design/preview/find-${name}.png`) }); await pf.close();
    ok(cf.length === 3 && cf.every(c => c.photo) && same(cf, "w") && same(cf, "asp") && (w >= 1440 ? same(cf, "y") && same(cf, "h") && same(cf, "ty") : true), `${name} Find @${w}: THREE real Find cards, one width, photos of one aspect${w >= 1440 ? ", one height, titles on one baseline" : ""} (${cf.map(c => c.w + "x" + c.h + "@" + c.ty).join(", ")})`);
    if (w === 1440) { ok(cf.filter(c => /LAST BID SEEN/.test(c.bid)).length === expect.findLive && cf.filter(c => /SOLD FOR/.test(c.bid)).length === 3 - expect.findLive, `${name} Find: ${expect.findLive} card(s) with the LAST BID SEEN badge and ${3 - expect.findLive} with SOLD FOR (${cf.map(c => c.bid.replace(/\s+/g, " ").trim()).join(" | ")})`);
      ok(cf.filter(c => /Sold$/.test(c.tag)).length === 3 - expect.findLive, `${name} Find: a sale's tag reads Sold (${cf.map(c => c.tag).join(" | ")})`); }
    const pt = await load(t.body, w), ct = await pt.evaluate(() => ({ tc: [...document.querySelectorAll(".sf-card .tc, .sf-card .lkdemo li")].map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height) }; }), pill: (document.querySelector(".sf-card .pill") || {}).textContent || "", line: (document.querySelector(".sf-card .tline") || {}).textContent || "", count: (document.querySelector(".sf-card .tcount") || {}).textContent || "", watch: (document.querySelector(".sf-card .lkw") || {}).textContent || "", dis: [...document.querySelectorAll(".sf-card .tbtns button, .sf-card [data-lk-stop]")].every(x => x.disabled), hs: document.documentElement.scrollWidth > innerWidth + 1 })), cc = await pt.evaluate(GEO, ".sf-card article.car");
    if (shots && w === 1440) await pt.screenshot({ path: path.join(root, `docs/design/preview/tasks-${name}.png`), fullPage: true }); await pt.close();
    ok(ct.tc.length === 2 && ct.tc[0].y === ct.tc[1].y && ct.tc[0].h === ct.tc[1].h && cc.length === 2 && same(cc, "y") && same(cc, "h") && same(cc, "w") && same(cc, "asp") && same(cc, "ty") && cc.every(c => c.photo) && !ct.hs, `${name} Tasks @${w}: TWO real Task cards (the Task card and the watching row one height) with their Find cards one size, one photo aspect, one baseline (${JSON.stringify(ct.tc)} ${cc.map(c => c.w + "x" + c.h).join(", ")})`);
    if (w === 1440) { ok(/Running|Done|Stopped/.test(ct.pill) && ct.line.length > 10 && ct.count.length > 3 && ct.watch.length > 3 && ct.dis, `${name} Tasks: the engine's read back sentence "${ct.line.slice(0, 60)}", its count "${ct.count.slice(0, 40)}", the watching row "${ct.watch.slice(0, 50)}", the controls disabled`);
      if (expect.ended !== null) ok(expect.ended ? /Done|Stopped/.test(ct.pill) && /ended/i.test(ct.count) && /Recent example/.test(t.body) : /Running/.test(ct.pill) && !/Recent example/.test(t.body), `${name} Tasks: ${expect.ended ? "the fallback is an ended car (Done, 'This auction has ended', Recent example)" : "a running Task, no Recent example label"}`); } }
}
// LIVE: three live cars, a live Task, a live watch
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); await TD.refreshTasksDemo(env, W.d); await WD.refreshWatchingDemo(env, W.d); await scenario("live", W, { findLive: 3, ended: false }); }
// FALLBACK: no live cars (they ended), the archive holds the sales: the engine answers its fallback
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); await TD.refreshTasksDemo(env, W.d); await WD.refreshWatchingDemo(env, W.d);
  W.rows = []; W.clock = NOW + 400 * 3600e3; W.ownSale = null; await scenario("fallback", W, { findLive: 0, ended: true }); }
// ONE LIVE CAR + SALES make three
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); await TD.refreshTasksDemo(env, W.d); await WD.refreshWatchingDemo(env, W.d); W.rows = W.rows.slice(0, 1); await scenario("mixed", W, { findLive: 1, ended: null }); }
await b.close();
out.forEach(l => console.log(l)); console.log(`crewLocalRun: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
