// ONE FULL HEIGHT COLUMN, AND TASKS' EMAIL SECTION ON THE LEFT EDGE (Lane E, Nov 8 2026; crew previews).
//   CAUSE 1: the shared shell was header, content and footer stacked in a block, so a short page (the Market Check and Sell entry) ended mid screen with the footer under it and bare page below.
//   FIX 1: the shell is a full height column (lib/preview/previewPages.js CSS; the same rule rides in the wrapped live results): the footer is at the bottom of the viewport when the content is short and after the content when it is long.
//   CAUSE 2: on Tasks the "Here's what happens when Sam finds a match." section was centred (text-align:center, auto margins) while the hero is on the left edge. FIX 2: left aligned to the hero's edge; the card keeps its width.
//   PAGES AFFECTED by 1: every preview page: Home, Find, Tasks (public and dashboard), Market Check and Sell entry and results. This check renders each, short and long, at 1440, 1280, 1024 and 390.
//   node scripts/previewShellCheck.mjs      (offline; headless Chrome; the mutants put the old layout back and must be caught)
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "x"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const PP = await imp("lib/preview/previewPages.js"), T = await imp("lib/preview/tasksPreview.js"), M = await imp("lib/preview/tasksMine.js"), MC = await imp("lib/preview/mcSellPreview.js"), FX = await imp("scripts/tasksFixture.mjs");
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const lastStyle = (h, css) => { const i = h.lastIndexOf("</style>"); return h.slice(0, i) + css + h.slice(i); };
const tall = h => h.replace(/<footer class="ft"/, '<div id="spacer" style="height:1800px"></div><footer class="ft"');
const PAGES = [["home", PP.homeHtml()], ["find", PP.findHtml()], ["tasks", T.tasksPublicHtml({ max: 10, emailExample: FX.tasksEmailFixture() })], ["tasks dashboard", M.tasksMineHtml()], ["market-check entry", MC.entryHtml("mc")], ["sell entry", MC.entryHtml("sell")]];
async function measure(html, w) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); if (u.pathname.startsWith("/api/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" }); return r.respond({ status: 204, body: "" }); });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "x", expires_at: 9999999999, user: { email: "a@b.c" } })); } catch (e) {} });
  await p.goto("https://goasksam.com/x", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 250));
  const m = await p.evaluate(() => { const f = document.querySelector("footer.ft"), q = e => e && e.getBoundingClientRect(), sp = document.getElementById("spacer"), h1 = document.querySelector("h1"), em = document.querySelector(".em h2"), fr = document.querySelector(".em-frame"), eml = document.querySelector(".em-line");
    return { vh: innerHeight, sh: document.documentElement.scrollHeight, fTop: f && Math.round(q(f).top + scrollY), fBot: f && Math.round(q(f).bottom + scrollY), spBot: sp ? Math.round(q(sp).bottom + scrollY) : null, h1x: h1 && Math.round(q(h1).left), emx: em && Math.round(q(em).left), lnx: eml && Math.round(q(eml).left), frx: fr && Math.round(q(fr).left), frw: fr && Math.round(q(fr).width), hs: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  await p.close(); return m;
}
// the footer's bottom is the page's bottom (short content: the viewport's bottom; long content or a naturally tall page: after the content)
const badFooter = (m, long) => long ? (m.fTop < m.spBot || m.fBot !== m.sh) : (m.fBot !== m.sh || m.sh < m.vh);
for (const w of [1440, 1280, 1024, 390]) {
  for (const [n, html] of PAGES) {
    const s = await measure(html, w), l = await measure(tall(html), w);
    ok(!badFooter(s, false), `@${w} ${n}, short: the footer ends at the bottom of the page, which is never shorter than the viewport (footer bottom ${s.fBot}, viewport ${s.vh}, page ${s.sh})`);
    ok(!badFooter(l, true), `@${w} ${n}, long: the footer comes after the content (footer top ${l.fTop}, content ends ${l.spBot}, page ${l.sh})`);
    ok(!s.hs && !l.hs, `@${w} ${n}: no horizontal scroll`);
  }
  const t = await measure(PAGES[2][1], w);
  ok(t.emx === t.h1x && t.lnx === t.h1x && t.frx === t.h1x, `@${w} tasks: the email section's heading, line and card start at the hero's left edge (hero ${t.h1x}; heading ${t.emx}, line ${t.lnx}, card ${t.frx})`);
  if (w >= 1024) ok(t.frw >= 520 && t.frw <= 540, `@${w} tasks: the card keeps its width (${t.frw})`);
}
// mutants
{ const m = await measure(PAGES[4][1].replace("body{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}", ""), 1440); ok(badFooter(m, false), "mutant: the entry page without the column puts the footer mid page, caught"); }
{ const m = await measure(PAGES[4][1].replace("body>.ft{margin-top:auto}", ""), 1280); ok(badFooter(m, false), "mutant: a column whose footer does not take the spare room is caught"); }
{ const m = await measure(lastStyle(tall(PAGES[5][1]), ".ft{position:fixed;bottom:0;left:0;right:0}"), 390); ok(badFooter(m, true), "mutant: a footer pinned over the content is caught on a long page"); }
{ const m = await measure(lastStyle(PAGES[2][1], ".em{text-align:center}.em-frame{margin:0 auto}.em-line{margin:0 auto 16px}"), 1440); ok(!(m.emx === m.h1x && m.lnx === m.h1x && m.frx === m.h1x), "mutant: the centred email section is caught"); }
{ const m = await measure(lastStyle(PAGES[2][1], ".em-frame{margin-left:40px}"), 1440); ok(m.frx !== m.h1x, "mutant: a card off the edge is caught"); }
await b.close();
out.forEach(l => console.log(l)); console.log(`previewShellCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
