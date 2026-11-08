// THE PREVIEW CARDS ARE THE REAL CARDS (Lane E, Nov 8 2026). CAUSE: the Find examples and the Tasks cards on the previews were drawn by the preview's own markup (fx-card, sf-photo and the like), so they could never look like the card a person sees on Find or on a Task.
// CLASS: any card on any preview page. A preview card must be the live component fed an engine object: Find's card(l) (api/buy.js client, via lib/findCardKit.js) and the dashboard's compactCard(t) and lookingItem(r) (lib/preview/tasksApp.js, via lib/preview/realTaskCards.js),
// lifted by name, never copied. This check proves (1) the lifted code is a verbatim slice of the live source, (2) the rendered markup is that component's output with its class names, (3) no preview source or page carries a card of its own, (4) the cards line up (same width,
// height, photo aspect, title and button positions), (5) the gates (an engine card or nothing; live, then fallback; the sale prints SOLD FOR), and (6) each failure mode is caught by a mutant. Offline, needs Chrome.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const PP = await import(ROOT + "/lib/preview/previewPages.js"), TP = await import(ROOT + "/lib/preview/tasksPreview.js");
const RC = await import(ROOT + "/lib/preview/realCards.js"), RT = await import(ROOT + "/lib/preview/realTaskCards.js");
const KIT = await import(ROOT + "/lib/findCardKit.js"), BUY = await import(ROOT + "/api/buy.js"), TA = await import(ROOT + "/lib/preview/tasksApp.js");
const EX = await import(ROOT + "/scripts/findExamplesFixture.mjs"), FX = await import(ROOT + "/scripts/tasksFixture.mjs");
const opt = { now: EX.NOW, allowData: true };
const strip = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
// ---------- 1 the lifted code is the live code ----------
{ const kit = KIT.buildKitSource(); const decl = name => { const m = new RegExp("^  function " + name + "\\(", "m").exec(BUY.BUY_CLIENT_SOURCE); return m ? BUY.BUY_CLIENT_SOURCE.slice(m.index) : ""; };
  const cardText = kit.code.slice(kit.code.indexOf("  function card(")).split("\n").slice(0, 6).join("\n");
  ok(BUY.BUY_CLIENT_SOURCE.includes(cardText.split("\n")[0]) && decl("card").startsWith(cardText.split("\n").slice(0, 3).join("\n")), "1 Find's card(l) in the kit is a verbatim slice of the live Find client (api/buy.js)");
  const tk = RT.buildTaskKitSource();
  ok(RT.TASK_KIT_NAMES.every(n => tk.code.split("\n").some(l => l.startsWith("  function " + n + "(") && TA.TASKS_APP_JS.includes(l))), "1 the Task card kit (esc, status, compactCard, lookingItem) is a verbatim slice of the dashboard client (lib/preview/tasksApp.js)");
  ok(/function compactCard\(t\)/.test(TA.TASKS_APP_JS) && /function lookingItem\(r\)/.test(TA.TASKS_APP_JS), "1 the dashboard still declares the Task card and the watching row by those names"); }
// ---------- 3 no preview source draws a card of its own ----------
const OWN = /class="(?:[^"]*\s)?(?:fx-card|fx-photo|fx-ct|fx-t|fx-m|fx-b|fx-sb|sf-photo|sf-bid|sf-req|sf-ct|sf-meta|sf-st|sf-prev|sf-pl|sf-pm|sf-pp)(?:\s[^"]*)?"/;
const ownMarkup = html => OWN.test(strip(html)) || /\bfx-card\b|\bsf-photo\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""));
const SRC = ["lib/preview/previewPages.js", "lib/preview/tasksPreview.js"].map(f => [f, fs.readFileSync(f, "utf8")]);
for (const [f, t] of SRC) ok(!/class="(?:fx-card|fx-photo|fx-ct|sf-photo|sf-bid|sf-req|sf-ct|sf-prev)"/.test(t) && !/class=\\?"fx-card/.test(t), `3 ${f} holds no card markup of its own`);
ok(/window\.GASCARD\.card\(/.test(fs.readFileSync("lib/preview/previewPages.js", "utf8")) && /window\.GASCARD\.card\(/.test(fs.readFileSync("lib/preview/tasksPreview.js", "utf8")) && /GASTASK\.card\(/.test(fs.readFileSync("lib/preview/tasksPreview.js", "utf8")) && /GASTASK\.watching\(/.test(fs.readFileSync("lib/preview/tasksPreview.js", "utf8")), "3 both pages hand their cards to the live components (GASCARD.card, GASTASK.card, GASTASK.watching)");
const FIND = PP.findHtml({ examples: EX.examplesFixture(), ...opt }), FINDMIX = PP.findHtml({ examples: { cars: [EX.examplesFixture()[0]], fallback: EX.fallbackFixture() }, ...opt });
const TASKS = TP.tasksPublicHtml({ max: 10, demo: FX.tasksDemoFixture(), watching: FX.watchingDemoFixture(), ...opt }), TASKSFB = TP.tasksPublicHtml({ max: 10, demo: FX.tasksFallbackFixture(), watching: FX.watchingFallbackFixture(), ...opt });
ok(![FIND, FINDMIX, TASKS, TASKSFB].some(ownMarkup), "3 no served preview page carries a card of its own");
ok(FIND.includes(KIT.findCardKitJs()) && TASKS.includes(KIT.findCardKitJs()) && TASKS.includes(RT.taskKitJs()), "3 the pages carry the live kits' own script, byte for byte");
// ---------- 5 gates ----------
const cards = h => (strip(h).match(/data-find-examples="(\d)"/) || [])[1] | 0;
ok(cards(PP.findHtml({ examples: null, ...opt })) === 0 && cards(PP.findHtml({ examples: [], ...opt })) === 0, "5 Find: the engine sent nothing, no section");
ok(cards(FIND) === 3 && cards(PP.findHtml({ examples: EX.examplesFixture().slice(0, 2), ...opt })) === 2, "5 Find: three live engine cards show three; fewer than three show only those");
ok(cards(FINDMIX) === 3 && /data-fallback="2"/.test(FINDMIX) && cards(PP.findHtml({ examples: { cars: [], fallback: EX.fallbackFixture() }, ...opt })) === 3, "5 Find: live cars first, then the engine's fallback sales, up to three");
{ const old = [{ title: "1991 Porsche 911 Carrera 2", platform: "Bring a Trailer", url: "https://a.test/1", photo: "https://a.test/p.jpg", live: true, endsAt: new Date(EX.NOW + 3600e3).toISOString(), findUrl: "/find?q=x", priceLabel: "Current bid $1" }];
  ok(cards(PP.findHtml({ examples: old, ...opt })) === 0, "5 Find: an item with no engine card (the old hand-drawn shape) is not drawn at all");
  const c = EX.examplesFixture()[0].card, bad = [{ ...c, id: null }, { ...c, title: "" }, { ...c, url: "http://a.test" }, { ...c, photo_url: "http://a.test/p.jpg" }, { ...c, end_time: new Date(EX.NOW - 3600e3).toISOString() }, { ...c, sold: { price: "$1", when: "x" } }].map(x => ({ card: x }));
  ok(bad.every(b => cards(PP.findHtml({ examples: [b], ...opt })) === 0), "5 Find: a card with no id, no title, a non https link or photo, an ended auction, or a sale in the live slot is refused");
  const f = EX.fallbackFixture()[0].card, badf = [{ ...f, sold: null }, { ...f, sold: { price: "$1", when: "" } }, { ...f, sold: { price: "a bargain", when: "x" } }].map(x => ({ card: x }));
  ok(badf.every(b => cards(PP.findHtml({ examples: { cars: [], fallback: [b] }, ...opt })) === 0), "5 Find: a fallback card with no sale, no date or valuation words is refused"); }
{ const T = (d, w) => TP.tasksPublicHtml({ max: 10, demo: d, watching: w, ...opt }), has = (h, k) => new RegExp('data-sf="' + k + '"').test(strip(h));
  ok(has(TASKS, "task") && has(TASKS, "watching") && /data-tasks-demo/.test(TASKS) && /data-watching-demo/.test(TASKS), "5 Tasks: a live Task and a live watched car show both cards");
  ok(has(TASKSFB, "task") && has(TASKSFB, "watching") && /data-fallback/.test(TASKSFB) && /Recent example/.test(TASKSFB), "5 Tasks: with no live car the engine's fallback shows both cards, labelled Recent example");
  ok(has(T(FX.tasksDemoFixture(), FX.watchingFallbackFixture()), "watching") && has(T(FX.tasksFallbackFixture(), FX.watchingDemoFixture()), "task"), "5 Tasks: each card falls back on its own");
  ok(T(null, null) === TP.tasksPublicHtml({ max: 10, ...opt }) && !has(T(null, null), "task") && !has(T({}, {}), "task"), "5 Tasks: the engine sent nothing, no cards");
  const old = { request: "x", shortRequest: "x", car: { title: "t", platform: "p", url: "https://a.test", photo: "https://a.test/p.jpg", live: true } };
  ok(!has(T(old, old), "task"), "5 Tasks: the old hand drawn field shape (no engine Task row, no engine card) draws nothing");
  const rows = FX.tasksDemoFixture(); rows.task.summary = "Sam found a bargain"; ok(!has(T(rows, null), "task"), "5 Tasks: valuation words in Sam's read back refuse the card");
  const r2 = FX.tasksDemoFixture(); r2.task.state = "weird"; ok(!has(T(r2, null), "task"), "5 Tasks: an unknown Task state refuses the card"); }
// ---------- 2 and 4 the rendered cards ----------
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function load(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 1000 }); p.on("pageerror", e => out.push("FAIL page error: " + e.message)); await p.setContent(html, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 450)); return p; }
const GEO = sel => [...document.querySelectorAll(sel)].map(a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".ph").getBoundingClientRect(), t = a.querySelector(".ttl").getBoundingClientRect(), v = a.querySelector(".acts").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), asp: Math.round(ph.width / ph.height * 100) / 100, ty: Math.round(t.top), vy: Math.round(v.top) }; });
const same = (a, k) => a.every(c => c[k] === a[0][k]), rowSame = (a, k) => a.every(c => a.filter(d => d.y === c.y).every(d => d[k] === c[k]));
{ const p = await load(FINDMIX, 1440);
  const fr = await p.evaluate(() => [...document.querySelectorAll("#fx-grid article.car")].map(a => ({ html: a.outerHTML, cls: a.className, mlab: (a.querySelector(".mlab") || {}).textContent || "", pill: (a.querySelector(".chip") || {}).textContent || "", has: ["ph", "chips", "tx", "ttl", "meta", "specs", "acts"].every(c => !!a.querySelector("." + c)) })));
  ok(fr.length === 3 && fr.every(c => c.cls === "car" && c.has), "2 Find: three article.car cards with the live card's own parts (ph, chips, tx, ttl, meta, specs, acts)");
  ok(/LAST BID SEEN/.test(fr[0].mlab) && /SOLD FOR/.test(fr[1].mlab) && /\$90,000/.test(fr[1].mlab) && /October 10, 2026/.test(fr[1].mlab) && !/LAST BID SEEN/.test(fr[1].mlab) && /Sold$/.test(fr[1].pill), "2 Find: a live card carries the LAST BID SEEN badge and the platform and time tag; a sale card carries SOLD FOR with the engine's price and date where the badge goes, and the tag reads Sold");
  const skel = el => [...el.querySelectorAll("*")].map(e => e.tagName + "." + e.className).join("|");
  const sk = await p.evaluate(() => { const L = JSON.parse(document.getElementById("fx-data").textContent), d = document.createElement("div"); d.innerHTML = window.GASCARD.card(L[0]); const f = e => [e, ...e.querySelectorAll("*")].map(x => x.tagName + "." + x.className).join("|"); return [f(d.firstElementChild), f(document.querySelector("#fx-grid article.car"))]; });
  ok(sk[0] === sk[1], "2 Find: the markup on the page is exactly what the live card function returns for the engine card");
  await p.close(); }
for (const w of [1440, 1024]) { const p = await load(FINDMIX, w), g = await p.evaluate(GEO, "#fx-grid article.car"); await p.close();
  const rows = new Set(g.map(c => c.y)).size;
  ok(g.length === 3 && same(g, "w") && same(g, "asp") && (w >= 1440 ? same(g, "y") && same(g, "ty") && same(g, "vy") && same(g, "h") : rowSame(g, "h") && rowSame(g, "ty") && rowSame(g, "vy")), `4 Find @${w}: three cards of one width and one height, photos of one aspect (${g.map(c => c.asp).join(", ")})${w >= 1440 ? ", titles and buttons on one baseline (" + g.map(c => c.ty + "/" + c.vy).join(", ") + ")" : ""}`); }
for (const [name, html] of [["live", TASKS], ["fallback", TASKSFB]]) for (const w of [1440, 1024]) { const p = await load(html, w);
  const m = await p.evaluate(() => ({ tc: [...document.querySelectorAll(".sf-card .tc, .sf-card .lkdemo li")].map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height) }; }), car: [...document.querySelectorAll(".sf-card article.car")].map(a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".ph").getBoundingClientRect(), t = a.querySelector(".ttl").getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), asp: Math.round(ph.width / ph.height * 100) / 100, ty: Math.round(t.top) }; }),
    dis: [...document.querySelectorAll(".sf-card .tbtns button, .sf-card [data-lk-stop]")].every(x => x.disabled), nbtn: document.querySelectorAll(".sf-card .tbtns button, .sf-card [data-lk-stop]").length, pill: (document.querySelector(".sf-card .pill") || {}).textContent || "", hs: document.documentElement.scrollWidth > innerWidth + 1 }));
  ok(m.tc.length === 2 && m.tc[0].y === m.tc[1].y && m.tc[0].h === m.tc[1].h && m.car.length === 2 && same(m.car, "y") && same(m.car, "h") && same(m.car, "w") && same(m.car, "asp") && same(m.car, "ty") && !m.hs, `4 Tasks ${name} @${w}: the Task card and the watching row are one height, the two Find cards one size, one photo aspect and one title baseline (${JSON.stringify(m.tc)} ${JSON.stringify(m.car)})`);
  ok(m.dis && m.nbtn >= 3 && /Running|Done|Stopped/.test(m.pill), `2 Tasks ${name} @${w}: the dashboard's own Task card (status pill ${m.pill}) with Pause, Stop and the watching Stop shown disabled (${m.nbtn} controls)`);
  await p.close(); }
{ const p = await load(TASKS, 1440), d = await p.evaluate(() => { const t = document.querySelector(".sf-card .tc"); return { html: t.outerHTML, pill: !!t.querySelector(".pill"), thit: !!t.querySelector(".thit"), line: (t.querySelector(".tline") || {}).textContent, count: (t.querySelector(".tcount") || {}).textContent }; }); await p.close();
  const fx = FX.tasksDemoFixture(); ok(d.pill && d.thit && d.line === fx.task.summary && d.count.startsWith(fx.task.overview.live), "2 Tasks: the Task card prints the engine's read back sentence and live car count as sent, in the dashboard's own markup (pill, thit, tline, tcount)"); }
// ---------- 6 mutants ----------
{ ok(ownMarkup(FIND.replace('<div class="fx-grid cgrid" id="fx-grid">', '<div class="fx-grid cgrid" id="fx-grid"><a class="fx-card" href="/find"><span class="fx-photo"></span></a>')), "6 mutant: a Find page that draws its own card is caught");
  ok(ownMarkup(TASKS.replace('<div class="sf-slot" data-sf-slot="task">', '<div class="sf-slot" data-sf-slot="task"><div class="sf-photo"></div>')), "6 mutant: a Tasks page that draws its own card is caught");
  ok(!/window\.GASCARD\.card\(/.test(fs.readFileSync("lib/preview/previewPages.js", "utf8").replace(/window\.GASCARD\.card\(/g, "own(")), "6 mutant: a source that no longer calls the live card is caught");
  const tall = FINDMIX.replace("height:100%}", "height:auto;align-self:start}"), p = await load(tall, 1440), g = await p.evaluate(GEO, "#fx-grid article.car"); await p.close();
  ok(!same(g, "h"), `6 mutant: cards that stop filling their row (different heights ${g.map(c => c.h).join(", ")}) are caught`);
  const asp = FINDMIX.replace(".fx-grid .car .ph{aspect-ratio:16/10}", ".fx-grid .car:first-child .ph{aspect-ratio:1}"), p2 = await load(asp, 1440), g2 = await p2.evaluate(GEO, "#fx-grid article.car"); await p2.close();
  ok(!same(g2, "asp"), `6 mutant: one photo with its own aspect (${g2.map(c => c.asp).join(", ")}) is caught`);
  const taskTall = TASKS.replace(".sf-card{display:grid;grid-row:span 3;grid-template-rows:subgrid;min-width:0}", ".sf-card{display:flex;flex-direction:column;min-width:0;align-self:start}"), p3 = await load(taskTall, 1440), m3 = await p3.evaluate(() => [...document.querySelectorAll(".sf-card article.car")].map(a => Math.round(a.getBoundingClientRect().top))); await p3.close();
  ok(m3.length === 2 && m3[0] !== m3[1], `6 mutant: Task and watching cards that no longer share rows (car tops ${m3.join(", ")}) are caught`); }
await b.close();
out.forEach(l => console.log(l)); console.log(`previewRealCardCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
