// DESK V3 SHELL (Lane E, Nov 8 2026; /preview/desk and /preview/desk/case/:id, lib/preview/deskV3.js). Offline: the crew door is run in process, the page in Chrome.
//   1 CREW ONLY: no cookie or a forged one gets the platform 404 on both routes; an unknown case id gets it too; vercel.json routes both only with the crew cookie; noindex and no-store.
//   2 THE RAIL: search, the four groups in order, each case once (car, seller, lead age, status), the opened case marked, no duplicate list anywhere on the page, the operations block only from Lane D's handling lines.
//   3 THE HEADER: photo, car and spec, seller, lead ref, submitted, status; the demonstration banner only on a case flagged demo.
//   4 FLAT AND CALM: no gradient, no emoji, the two meaning colours only, no horizontal overflow at 1440, 1280, 1024 and 390.
//   5 NOTHING COMPUTED: the module carries no arithmetic on a figure (only the sheet's own fields are printed).
//   CLASS: any case shown twice or in the wrong group, any decoration or invented line in the shell. Mutants run through the same assertions must be caught.
//   node scripts/deskV3ShellCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { mintCrewCookieValue } = await imp("lib/_crew.js"), crewPage = (await imp("api/crewPage.js")).default, V3 = await imp("lib/preview/deskV3.js"), PV = await imp("lib/preview/deskPreview.js");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const crew = "gas_crew=" + mintCrewCookieValue();
async function call(url, cookie) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { this.body = String(b || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; }, writeHead(c) { this.code = c; return this; } };
  const u = new URL("https://goasksam.com" + url);
  await crewPage({ url, method: "GET", query: Object.fromEntries(u.searchParams), body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", ...(cookie ? { cookie } : {}) }, socket: {} }, res); return res;
}

// ---------- the shell's assertions on a served page (text only) ----------
function textAssertions(html, tag, { activeId, demoCase } = {}) {
  const bad = [], n = (re) => (html.match(re) || []).length;
  const groups = [...html.matchAll(/data-group="(\w+)"/g)].map(m => m[1]);
  if (groups.join() !== "new,review,ready,final") bad.push("the four groups are not New leads, In review, Ready for report, Finalized in that order");
  const ids = [...html.matchAll(/class="cs[ "][^>]*data-case="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) bad.push("a case is listed twice");
  if (ids.length < 3) bad.push("the rail lists fewer than three cases");
  for (const label of ["New leads", "In review", "Ready for report", "Finalized"]) if (!html.includes(label)) bad.push("rail group missing: " + label);
  for (const m of html.matchAll(/<a class="cs[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) if (!/cs-car/.test(m[1]) || !/cs-age/.test(m[1]) || !/cs-st/.test(m[1])) bad.push("a case row lacks car, age or status");
  if (n(/id="railq"/g) !== 1) bad.push("the rail has no single search box");
  if (n(/<nav class="rail"/g) !== 1) bad.push("more than one rail");
  if (/gradient/i.test(html)) bad.push("a gradient is on the page");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) bad.push("an emoji is on the page");
  if (!/GoAskSam Desk/.test(html)) bad.push("the product name is missing");
  if (!html.includes(PV.PREVIEW_ORG.name)) bad.push("the org name is missing beside the product name");
  if (!/name="robots" content="noindex, nofollow"/.test(html)) bad.push("not noindex");
  const demo = /class="demo"/.test(html);
  if (activeId) {
    if (!/id="chd" data-case=/.test(html)) bad.push("no case header on an opened case");
    for (const l of ["Lead ref", "Submitted", "Status"]) if (!html.includes(l)) bad.push("header field missing: " + l);
    if (demo !== !!demoCase) bad.push(demoCase ? "a demo case has no banner" : "the demonstration banner shows on a case that is not flagged");
    if (!/aria-current="page"/.test(html)) bad.push("the opened case is not marked in the rail");
  } else if (demo) bad.push("a banner without an opened case");
  return bad;
}

// ---------- 1 crew only ----------
{
  const store = await PV.previewStore(), rows = await store.list(PV.PREVIEW_ORG.id), id = rows[0].id;
  const stranger = await call("/api/crewPage?page=preview-desk"), forged = await call("/api/crewPage?page=preview-desk", "gas_crew=v1.9999999999999.forged"), strangerCase = await call(`/api/crewPage?page=preview-desk&case=${id}`);
  ok(stranger.code === 404 && forged.code === 404 && strangerCase.code === 404, "a stranger or a forged cookie gets the 404 on the list and a case (" + [stranger.code, forged.code, strangerCase.code] + ")");
  const unknown = await call("/api/crewPage?page=preview-desk&case=nope", crew); ok(unknown.code === 404, "an unknown case id gets the 404 (" + unknown.code + ")");
  const list = await call("/api/crewPage?page=preview-desk", crew), one = await call(`/api/crewPage?page=preview-desk&case=${id}`, crew);
  ok(list.code === 200 && one.code === 200, "the crew cookie opens the list and a case (" + [list.code, one.code] + ")");
  ok(/noindex/.test(one.h["x-robots-tag"] || "") && /no-store/.test(one.h["cache-control"] || ""), "noindex header and no-store");
  const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  for (const [src, page] of [["/preview/desk", "preview-desk"], ["/preview/desk/case/:id", "preview-desk"]]) { const r = (vj.rewrites || []).find(x => x.source === src); ok(r && /gas_crew/.test(JSON.stringify(r.has || [])) && r.destination.includes("page=" + page), "vercel.json routes " + src + " only with the crew cookie"); }
  const bads = [...textAssertions(list.body, "list"), ...textAssertions(one.body, "case", { activeId: id, demoCase: rows[0].id === V3.DEMO_ID })];
  for (const b of bads) ok(false, "page: " + b); ok(!bads.length, "the served list and case pass the shell assertions");
}

// ---------- the operations block comes from Lane D's lines only ----------
{
  const mk = (handling) => V3.pageHtml([{ id: "a", car: "2002 BMW M3", spec: "", seller: "A Seller", ref: "a", age: "6 min", submitted: "2026-11-08", status: "New", group: "new", photo: null, demo: false, handling }], "a");
  ok(!/id="ops"/.test(mk(null)), "no handling lines, no operations block");
  const lines = [{ label: "Open leads", value: "3" }, { label: "Oldest waiting", value: "2 d" }]; const h = mk({ lines });
  ok(/id="ops"/.test(h) && h.includes("Open leads") && h.includes("Oldest waiting"), "Lane D's handling lines print as sent");
  ok(/class="demo"/.test(V3.pageHtml([{ id: "a", car: "x", spec: "", seller: null, ref: "a", age: "1 d", submitted: "2026-11-08", status: "New", group: "new", photo: null, demo: true, handling: null }], "a")), "a flagged demo case shows the banner");
}

// ---------- the module computes nothing ----------
function computes(src) { const bad = []; const body = src.replace(/\/\/.*$/gm, ""); if (/Math\.(round|floor|ceil|min|max|abs)|reduce\(|parseFloat|toLocaleString|toFixed|Intl\.|\bNumber\([^)]*\)\s*[-+*/]/.test(body)) bad.push("arithmetic on a figure"); if (/\$\{?\s*\d/.test(body) || /"\$[\d,]+/.test(body)) bad.push("a typed dollar figure"); return bad; }
{ const src = fs.readFileSync("lib/preview/deskV3.js", "utf8"); const b = computes(src); ok(!b.length, "deskV3.js carries no page arithmetic" + (b.length ? ": " + b : "")); }

// ---------- 4 in Chrome ----------
async function inChrome(htmlList, label) {
  const bad = [], br = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  try {
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
      const p = await br.newPage(); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: htmlList }); return r.respond({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>" }); });
      const errs = []; p.on("pageerror", e => errs.push(String(e).slice(0, 120)));
      await p.goto("https://goasksam.com/preview/desk/case/x", { waitUntil: "domcontentloaded" });
      const m = await p.evaluate(() => { const r = document.getElementById("rail").getBoundingClientRect(), hd = document.getElementById("chd").getBoundingClientRect(), vis = el => { const c = getComputedStyle(el); return c.display !== "none" && c.visibility !== "hidden"; };
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, railW: Math.round(r.width), hdTop: Math.round(hd.top), railVis: vis(document.getElementById("rail")), car: document.querySelector("#chd h1") && document.querySelector("#chd h1").textContent, bg: [...document.querySelectorAll("*")].some(e => /gradient/.test(getComputedStyle(e).backgroundImage)) }; });
      if (m.sw > m.cw) bad.push(`horizontal overflow at ${w} (${m.sw} > ${m.cw})`);
      if (!m.railVis) bad.push("the rail is hidden at " + w); if (!m.car) bad.push("no case header at " + w); if (m.bg) bad.push("a gradient is drawn at " + w);
      if (w >= 1024 && (m.railW < 200 || m.railW > 300)) bad.push(`rail width ${m.railW} at ${w}`);
      if (errs.length) bad.push("page error: " + errs[0]);
      await p.close();
    }
    // the rail search hides rows and nothing else
    const p = await br.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.setRequestInterception(true); p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: htmlList }); return r.respond({ status: 204, body: "" }); });
    await p.goto("https://goasksam.com/preview/desk/case/x", { waitUntil: "domcontentloaded" });
    const total = await p.evaluate(() => document.querySelectorAll(".cs").length); await p.type("#railq", "zzzzqq");
    const shown = await p.evaluate(() => [...document.querySelectorAll(".cs")].filter(a => !a.hidden).length), none = await p.evaluate(() => !document.getElementById("railnone").hidden);
    if (shown !== 0 || !none) bad.push("the rail search does not hide non-matching cases");
    await p.evaluate(() => { document.getElementById("railq").value = ""; document.getElementById("railq").dispatchEvent(new Event("input")); });
    const back = await p.evaluate(() => [...document.querySelectorAll(".cs")].filter(a => !a.hidden).length); if (back !== total) bad.push("clearing the search does not restore the list");
  } finally { await br.close(); }
  return bad;
}
async function goodPage() { const store = await PV.previewStore(), rows = await store.list(PV.PREVIEW_ORG.id); const r = await call(`/api/crewPage?page=preview-desk&case=${rows[0].id}`, crew); return r.body; }
const html = await goodPage();
{ const b = await inChrome(html); for (const x of b) ok(false, "chrome: " + x); ok(!b.length, "in Chrome at 1440, 1280, 1024 and 390: no overflow, rail and header drawn, flat, search works"); }

// ---------- mutants: each must be caught by the same assertions ----------
const MUT = [
  ["a case listed twice in the rail", h => h.replace(/(<a class="cs on"[\s\S]*?<\/a>)/, "$1$1"), "text"],
  ["a group missing", h => h.replace(/<section class="grp" data-group="ready">[\s\S]*?<\/section>/, ""), "text"],
  ["groups out of order", h => h.replace(/data-group="new"/, "data-group=\"zz\"").replace(/data-group="final"/, "data-group=\"new\"").replace(/data-group="zz"/, "data-group=\"final\""), "text"],
  ["a gradient on the page", h => h.replace("</style>", ".bar{background:linear-gradient(#fff,#eee)}</style>"), "text"],
  ["an emoji in the shell", h => h.replace("Search cases\"", "Search cases \u{1F50D}\""), "text"],
  ["a demonstration banner on a plain case", h => h.replace('<header class="chd"', '<div class="demo">Demonstration case</div><header class="chd"'), "text"],
  ["the org name dropped", h => h.split(PV.PREVIEW_ORG.name).join(""), "text"],
  ["the header's lead ref dropped", h => h.replace("Lead ref", "Reference"), "text"],
  ["a second rail", h => h.replace("</main>", '<nav class="rail"></nav></main>'), "text"],
  ["the page overflows sideways", h => h.replace("</style>", ".v3 .work{min-width:2400px!important}</style>"), "chrome"],
  ["the rail hidden", h => h.replace("</style>", ".v3 .rail{display:none!important}</style>"), "chrome"]
];
const id0 = (await (await PV.previewStore()).list(PV.PREVIEW_ORG.id))[0].id;
for (const [name, fn, kind] of MUT) {
  const m = fn(html); let caught = false;
  if (kind === "text") caught = textAssertions(m, "mutant", { activeId: id0, demoCase: false }).length > 0; else caught = (await inChrome(m)).length > 0;
  ok(caught, "mutant caught: " + name);
}
{ const src = fs.readFileSync("lib/preview/deskV3.js", "utf8"); ok(computes(src.replace("age: sm.timeIn", "age: Math.round(sm.timeIn / 60)")).length > 0, "mutant caught: arithmetic on a figure in the module"); }


// ---------- stage 2: the sticky bar collapses in at 1440, 1280 and 1024, is never taller than 92px and never covers what the analyst is working on ----------
{
  const H = await imp("scripts/deskV3Harness.mjs"), page0 = await H.demoHtml();
  async function stickyBad(h, w) {
    const bad = [], br = await H.launch();
    try {
      const p = await H.openPage(br, h, w, 520), st = () => p.evaluate(() => { const s = document.getElementById("stk"), r = s.getBoundingClientRect(); return { hidden: s.hidden, h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), txt: s.innerText.replace(/\s+/g, " ") }; });
      let m = await st(); if (!m.hidden) bad.push(`the sticky bar shows with the summary in view at ${w}`);
      await p.evaluate(() => window.scrollTo(0, 900)); await new Promise(r => setTimeout(r, 250)); m = await st();
      if (m.hidden) bad.push(`the sticky bar does not appear when the summary scrolls out at ${w}`);
      else { if (m.h > 92) bad.push(`the sticky bar is ${m.h}px tall at ${w}`); if (m.top > 60 || m.top < 46) bad.push(`the sticky bar is not stuck directly under the top bar at ${w} (top ${m.top})`); for (const k of ["Market", "Assessment", "Reserve", "Review", "Vehicle", "Market evidence", "Decision"]) if (!m.txt.toLowerCase().includes(k.toLowerCase())) bad.push(`the sticky bar lacks ${k} at ${w}`); }
      await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('[data-tab="market"]').click(); }); await new Promise(r => setTimeout(r, 200)); m = await st(); if (m.hidden) bad.push(`the sticky bar is not kept on Market evidence at ${w}`);
      await p.click("#figA"); await new Promise(r => setTimeout(r, 300)); m = await st();
      const inp = await p.evaluate(() => { const r = document.getElementById("in-alow").getBoundingClientRect(); return { top: Math.round(r.top) }; });
      if (inp.top < m.bottom) bad.push(`the sticky bar covers the assessment input at ${w} (input top ${inp.top}, bar bottom ${m.bottom})`);
    } finally { await br.close(); }
    return bad;
  }
  for (const w of [1440, 1280, 1024]) { const b = await stickyBad(page0, w); for (const x of b) ok(false, "sticky: " + x); ok(!b.length, `sticky bar at ${w}: collapses in and out, at most 92px, sticks under the top bar, never covers the input`); }
  for (const [n, fn] of [["a sticky bar 140px tall", h => h.replace("</style>", ".v3 .stk{min-height:140px!important;max-height:none!important}</style>")], ["a sticky bar pinned over the content", h => h.replace("</style>", ".v3 .stk{position:fixed!important;top:0!important;left:272px;right:0;z-index:50;height:90px}</style>")], ["a sticky bar that never collapses", h => h.replace('hidden=!(cur!=="vehicle"||!inSum)', "hidden=false")]]) {
    const b = await stickyBad(fn(page0), 1440); ok(b.length > 0, "mutant caught: " + n);
  }
}

console.log(out.join("\n")); console.log(`deskV3ShellCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
