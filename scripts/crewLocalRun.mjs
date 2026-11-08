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
const wire = W => { crewPage.FIND_EXAMPLES.read = () => FE.findExamplesField(env, CREW, W.d); crewPage.FIND_EXAMPLES.now = () => W.clock;
  crewPage.TASKS_EMAIL_EXAMPLE.read = async () => (typeof TD.tasksEmailExample === "function" ? await TD.tasksEmailExample(env, CREW, W.d) : null); };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6075"/><stop offset="1" stop-color="#9db0c0"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/></svg>`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function load(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 1100 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = r.url(); if (/^https:\/\/(?!goasksam\.com)/.test(u) && /\.(jpe?g|png|webp)(\?|$)|photo|img/i.test(u) || r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: svg }); if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); r.respond({ status: 200, contentType: "text/plain", body: "" }); });
  p.on("pageerror", e => out.push("FAIL page error: " + e.message)); await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 600)); return p; }
const same = (a, k) => a.every(c => c[k] === a[0][k]);
const ROWFN = () => { const vis = e => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; return [...document.querySelectorAll("#fx-grid .fx-item")].map(it => { const a = it.querySelector("article.car"), r = it.getBoundingClientRect(), ph = a.querySelector(".ph"), pr = ph.getBoundingClientRect(), t = a.querySelector(".ttl").getBoundingClientRect(); return { y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), asp: Math.round(pr.width / pr.height * 100) / 100, ty: Math.round(t.top), photo: !!ph.querySelector("img"), tag: (a.querySelector(".chip") || {}).textContent || "", bid: vis(a.querySelector(".mlab")), sam: vis(a.querySelector(".sl")), acts: vis(a.querySelector(".acts")), href: it.querySelector("a.fx-open").getAttribute("href") }; }); };
async function scenario(name, W, expect) {
  wire(W); const f = await call("/api/crewPage?page=preview-find", CREW), t = await call("/api/crewPage?page=preview-tasks", CREW), s1 = await call("/api/crewPage?page=preview-find", null);
  ok(f.code === 200 && t.code === 200 && s1.code === 404, `${name}: crew gets both pages, a stranger gets the 404`);
  for (const w of [1440, 390]) { const pf = await load(f.body, w), cf = await pf.evaluate(ROWFN); if (shots && w === 1440) await pf.screenshot({ path: path.join(root, `docs/design/preview/find-${name}.png`) }); await pf.close();
    ok(cf.length === expect.find && cf.every(c => c.photo && c.tag && !c.bid && !c.sam && !c.acts && /^\/find\?q=/.test(c.href)) && (cf.length < 2 || (same(cf, "w") && same(cf, "asp") && (w >= 1440 ? same(cf, "y") && same(cf, "h") && same(cf, "ty") : true))), `${name} Find @${w}: ${expect.find} real landing card(s), photo, title and platform tag only, one link each, one size (${cf.map(c => c.w + "x" + c.h).join(", ")})`); }
  const hasEmail = /data-task-email="1"/.test(t.body);
  ok(hasEmail === expect.email, `${name} Tasks: ${expect.email ? "the one real Task match email shows" : "no email section while Lane B's tasksEmailExample does not exist (hidden, as agreed)"}`);
}
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); await scenario("live", W, { find: 3, email: typeof TD.tasksEmailExample === "function" }); }
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); W.rows = W.rows.slice(0, 1); await scenario("mixed", W, { find: 1, email: typeof TD.tasksEmailExample === "function" }); }
{ const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d); W.rows = []; W.clock = NOW + 400 * 3600e3; await scenario("fallback", W, { find: 0, email: typeof TD.tasksEmailExample === "function" }); }
await b.close();
out.forEach(l => console.log(l)); console.log(`crewLocalRun: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
