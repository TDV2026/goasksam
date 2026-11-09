// ONE HEADER, ONE POSITION (Lane E, Nov 6 2026; Sam's refinement brief, item 1; crew only previews). CAUSE: on Find the rail sat in a full width grid while the header's logo sat inside the page's centred 1440px wrap,
// so the logo started to the right of "+ New search" (40px against 20px at 1440, and further apart on a wider screen). FIX: the shell is inside the same .wrap as the header, so the logo, the rail content and the footer wordmark
// take the left edge from ONE rule. PAGES AFFECTED: Find, Tasks (public and dashboard), the Home preview, and the Market Check and Sell pages the day they are previewed (they use the same header() and doc()); this check renders all of them.
//   node scripts/previewHeaderCheck.mjs      (offline; headless Chrome; the mutants put the old layout back and must be caught)
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const PP = await imp("lib/preview/previewPages.js"), T = await imp("lib/preview/tasksPreview.js"), M = await imp("lib/preview/tasksMine.js");
const { header, footer, doc, CSS } = PP.SHARED;
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
// the four pages of the brief. Market Check and Sell have no preview yet: they are the shared header and footer in the shared document, active item set, which is all a preview of them will add to.
const lastStyle = (h, css) => { const i = h.lastIndexOf("</style>"); return h.slice(0, i) + css + h.slice(i); };
const stand = key => doc("GoAskSam preview: " + key, "", header(key) + '<main class="wrap" style="min-height:300px"></main>' + footer());
const PAGES = [["find", PP.findHtml(), "find"], ["market-check", stand("market-check"), "market-check"], ["sell", stand("sell"), "sell"], ["tasks", T.tasksPublicHtml({ max: 10 }), "tasks"], ["tasks dashboard", M.tasksMineHtml(), "tasks"], ["home", PP.homeHtml(), ""]];
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function measure(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); if (/id="tkapp"/.test(html)) await p.evaluateOnNewDocument(() => localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: 9999999999 }))); await p.setRequestInterception(true); p.on("request", r => r.isNavigationRequest() ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: [], count: 0, counts: { total: 0 }, limit: {}, suggestions: [], notify: null }) }));
  await p.goto("https://goasksam.com/x", { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 200));
  const m = await p.evaluate(() => { const r = e => { const q = e.getBoundingClientRect(); return { x: Math.round(q.left * 10) / 10, y: Math.round(q.top * 10) / 10, r: Math.round(q.right * 10) / 10, h: Math.round(q.height * 10) / 10, w: Math.round(q.width * 10) / 10 }; };
    const wm = document.querySelector(".gh .wm"), nav = document.querySelector(".gh .tabs"), hd = document.querySelector(".gh"), nw = document.querySelector(".new"), cur = document.querySelector(".gh .tabs a[aria-current]"), fw = document.querySelector(".ft .wm");
    return { logo: r(wm), nav: r(nav), hdr: r(hd), tabsY: [...document.querySelectorAll(".gh .tabs a")].map(a => r(a).y), tabsX: [...document.querySelectorAll(".gh .tabs a")].map(a => r(a).x), newX: nw ? r(nw).x : null, newH: nw ? r(nw).h : null, newW: nw ? r(nw).w : null, divs: [...document.querySelectorAll('.shell *')].filter(e => { const c = getComputedStyle(e); return (parseFloat(c.borderRightWidth) > 0 || parseFloat(c.borderLeftWidth) > 0) && e.getBoundingClientRect().height >= 300; }).map(e => ({ c: e.className, l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right) })), railR: document.querySelector('.rail') ? r(document.querySelector('.rail')).r : null, railW: document.querySelector('.rail') ? r(document.querySelector('.rail')).w : null, cur: cur ? { t: cur.textContent, bg: getComputedStyle(cur).backgroundColor } : null, fw: fw ? r(fw).x : null, vw: innerWidth, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
  await p.close(); return m; }
for (const w of [2000, 1920, 1680, 1440, 1280, 1024, 768, 390]) {
  const ms = []; for (const [n, html] of PAGES) ms.push([n, await measure(html, w)]);
  // THE WORKSPACE LAYOUT (Sam, Nov 6 2026): on desktop Find's logo, "+ New search" and footer wordmark sit in one 28px left gutter; every other page keeps the 40px wrap, and below 860px all pages are the same. The top right nav, the header height and the nav items never move.
  const WS = w > 860, others = ms.filter(([n]) => n !== "find"), ref = others[0][1], same = (k, f) => others.every(([, m]) => f(m) === f(ref)), allSame = (k, f) => ms.every(([, m]) => f(m) === f(ms[0][1]));
  const lg = m => m.logo.x + "," + m.logo.y + "," + m.logo.w + "," + m.logo.h, find0 = ms[0][1];
  ok(same("logo", lg), `@${w}: the logo is in one position on every page but Find (${others.map(([n, m]) => n + " " + m.logo.x + "," + m.logo.y).join("; ")})`);
  ok(WS ? (find0.logo.x === 28 && find0.logo.y === ref.logo.y && find0.logo.w === ref.logo.w && find0.logo.h === ref.logo.h) : lg(find0) === lg(ref), `@${w}: Find's logo is ${WS ? "in the 28px workspace gutter, the same height and size" : "where every other page has it (the gutter is desktop only)"} (${find0.logo.x} v ${ref.logo.x})`);
  ok(allSame("nav", m => m.nav.x + "," + m.nav.y + "," + m.nav.r), `@${w}: the nav is in one position on every page`);
  ok(allSame("hdr", m => m.hdr.h + "," + m.hdr.w), `@${w}: the header is one height on every page (${ref.hdr.h}px)`);
  ok(allSame("tabs", m => m.tabsX.join(",") + "|" + m.tabsY.join(",")), `@${w}: every nav item is at the same place on every page`);
  ok(same("fw", m => m.fw) && (WS ? find0.fw === find0.logo.x : find0.fw === ref.fw), `@${w}: the footer wordmark is at the same place on every page but Find, where it starts on the logo\'s edge (${find0.fw} v ${find0.logo.x})`);
  const find = find0; if (w > 860) ok(find.newX === find.logo.x, `@${w}: Find's "+ New search" starts exactly where the logo starts (${find.newX} v ${find.logo.x})`);
  if (w > 860) ok(find.railW >= 194 && find.railW <= 206 && find.newH >= 36 && find.newH <= 40 && find.newW < find.railW - 30, `@${w}: Find's rail is about 200px (${find.railW}), "+ New search" about 38px tall (${find.newH}) and compact (${find.newW}px wide, not the rail's width), left aligned on the logo`);
  if (w > 860) ok(find.divs.length === 1 && /rail/.test(find.divs[0].c) && Math.abs(find.divs[0].r - (find.logo.x + 200)) <= 1 && find.railR === find.divs[0].r, `@${w}: the one vertical divider in Find is the rail's own edge, 220px from the 28px gutter (at ${find.divs.map(d => d.c + " " + d.r).join(", ")}, rail edge ${find.railR}, expected ${find.logo.x + 220})`);
  ok(ms.every(([, m]) => !m.hscroll), `@${w}: no horizontal scroll`);
  ok(ms.filter(([, m]) => m.cur).every(([n, m]) => /rgb\(248, 244, 236\)/.test(m.cur.bg)) && ms.find(([n]) => n === "market-check")[1].cur.t === "Market Check" && ms.find(([n]) => n === "sell")[1].cur.t === "Sell", `@${w}: the selected page keeps the cream pill`);
  if (w <= 860) ok(ms.every(([, m]) => m.nav.r <= m.vw + 0.5 && m.nav.x >= 0), `@${w}: the mobile nav fits the screen on every page`);
}
// mutants: the 28px gutter taken away (Find falls back to the 40px wrap) and the old Find layout (the shell outside the wrap, the rail inset 20px) and a header with its own padding are caught
{ const oldRail = await measure(lastStyle(PP.findHtml(), ".shell{grid-template-columns:256px minmax(0,1fr)}.new{height:44px;display:flex;padding:0 16px}"), 1440); ok(!(oldRail.railW >= 214 && oldRail.railW <= 226 && oldRail.newH <= 40 && oldRail.newW < oldRail.railW - 30), `mutant: the old 256px rail with a full width 44px button is caught (${oldRail.railW}px, ${oldRail.newH}px, ${oldRail.newW}px wide)`); }
{ const far = await measure(lastStyle(PP.findHtml(), ".rail{border-right:0}.main{border-left:1px solid #ddd;margin-left:72px}"), 2000); ok(!(far.divs.length === 1 && /rail/.test(far.divs[0].c) && Math.abs(far.divs[0].r - (far.logo.x + 220)) <= 1), `mutant: a divider drawn by a different rule than the rail (at ${far.divs.map(d => d.c + " " + d.r).join(", ")}) is caught`); }
{ const noWs = await measure(PP.findHtml().replace(".gh .wrap,.ft .wrap,.shell.wrap{max-width:none;padding-left:28px}", ""), 1440); ok(noWs.logo.x !== 28, `mutant: without the workspace gutter rule the logo is not at 28 (${noWs.logo.x})`);
  const btn = await measure(lastStyle(PP.findHtml(), ".rail{padding-left:12px}"), 1440); ok(btn.newX !== btn.logo.x, "mutant: a rail that insets its own button is caught (the button and the logo must start together)");
  const old = lastStyle(PP.findHtml().replace('class="shell wrap"', 'class="shell"'), ".rail{padding-left:20px}"), m = await measure(old, 1440), m2 = await measure(old, 1920); ok(m.newX !== m.logo.x && m2.newX !== m2.logo.x, `mutant: the old Find layout (rail outside the header's wrap) is caught (${m.newX} v ${m.logo.x} at 1440, ${m2.newX} v ${m2.logo.x} at 1920)`);
  const pad = await measure(lastStyle(PP.findHtml(), ".gh .wrap{padding-left:60px}"), 1440), base = await measure(PP.findHtml(), 1440); ok(pad.logo.x !== base.logo.x, "mutant: a page that pads its own header moves the logo and is told apart");
  const hh = await measure(lastStyle(stand("sell"), ".gh .wrap{height:90px}"), 1440); ok(hh.hdr.h !== base.hdr.h, "mutant: a page with its own header height is told apart"); }
await b.close();
out.forEach(l => console.log(l)); console.log(`previewHeaderCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
