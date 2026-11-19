// WHERE THE START PAGES SIT (Sam, Oct 27 2026): the one-line box is at most START_ONE_MAX (760) wide and centred, and the group (label, heading, subline, box,
// updated line) starts the same distance down on Home, Find, Market Check and Sell, about a third of the way down a desktop window, from lib/startPage.js START_CSS
// (--gst-top, set from the viewport height) and nowhere else. A page only says how far its own wrapper already sits from the top (--gst-off).
//   1. static: no page file sets a width, max-width or top padding of its own on the box or the group (the phone rule below 701 px is the one allowance);
//   2. rendered at 1440, 1024, 768 and 390: the box is never wider than the cap on a desktop, never wider than the window on a phone, never outside the window,
//      and the group starts at the same height on every page; on a desktop the box sits about a third of the way down.
//   node scripts/startPlaceCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const rd = p => fs.readFileSync(p, "utf8");
const { START_ONE_MAX } = await import("../lib/startPage.js");
ok(START_ONE_MAX === 760, "the cap is 760 px");

// 1. static
const START = rd("lib/startPage.js");
ok(/:root\{--gst-top:clamp\(/.test(START) && /\.gst-lead\{[^}]*padding:calc\(var\(--gst-top\) - var\(--gst-off,0px\)\) 0 48px/.test(START), "START_CSS sets the position once (--gst-top from the viewport height, one .gst-lead rule)");
ok(/\.gst-one \.gst-box\{max-width:\$\{START_ONE_MAX\}px/.test(START), "START_CSS sets the box width once (START_ONE_MAX)");
const PAGES_SRC = { "api/home.js": rd("api/home.js"), "lib/live/buyLanding.js": rd("lib/live/buyLanding.js"), "lib/live/marketCheckLanding.js": rd("lib/live/marketCheckLanding.js"), "lib/sell/sellLanding.js": rd("lib/sell/sellLanding.js") };
const phoneStrip = css => css.replace(/@media \(max-width:700px\)\{[\s\S]*?\}\}/g, "").replace(/@media \(max-width:700px\)\{[^{}]*\{[^}]*\}\}/g, "");
for (const [f, s] of Object.entries(PAGES_SRC)) {
  const rules = phoneStrip(s.replace(/\/\*[\s\S]*?\*\//g, ""));
  const own = [...rules.matchAll(/([^{}`]*(?:\.gst-box|\.gst-in\b|\.gst-lead|\.gst\b|\.gst-one|\.hm\b)[^{}`]*)\{([^}]*)\}/g)].filter(m => /(^|;)\s*(width|max-width|min-width|padding(-top)?|margin(-top)?|top)\s*:/.test(m[2]) && !/^\s*\.hm-/.test(m[1]));
  const bad = own.filter(m => { const decl = m[2]; if (/\.hm\b/.test(m[1]) && !/\.hm-/.test(m[1])) return !/padding:var\(--gst-top\) 32px 56px/.test(decl) && /(^|;)\s*(width|max-width|padding-top|top)\s*:/.test(decl) || (/(^|;)\s*padding\s*:/.test(decl) && !/padding:var\(--gst-top\)/.test(decl)); return /(^|;)\s*(width|max-width|padding(-top)?|top)\s*:/.test(decl); });
  ok(bad.length === 0, `${f}: sets no width or top of its own on the box or the group (${bad.map(m => m[1].trim() + "{" + m[2].slice(0, 60) + "}").join(" ; ") || "none"})`);
}
for (const f of ["lib/live/buyLanding.js", "lib/live/marketCheckLanding.js", "lib/sell/sellLanding.js"]) ok(/--gst-off:\d+px/.test(PAGES_SRC[f]), `${f}: says only how far its wrapper sits from the top (--gst-off)`);
ok(/padding:var\(--gst-top\) 32px 56px/.test(PAGES_SRC["api/home.js"]), "api/home.js: the hero's top is --gst-top");
const TASKS = rd("api/tasksPage.js");
ok(!/\bgst-/.test(TASKS), "Tasks does not draw the start box (its signed-in Task box is the Tasks page's own, in its 880 px column)");

// 2. rendered
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => String(u).includes("job_ingest") ? new Response(JSON.stringify([{ created_at: "2026-10-26T14:00:00Z" }]), { status: 200, headers: { "content-type": "application/json" } }) : new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
const call = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status(c) { res.code = c; return res; }, json(b) { resolve(JSON.stringify(b)); }, send(b) { resolve(String(b)); }, end(b) { resolve(String(b || "")); } };
    Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve("ERR " + e)); setTimeout(() => resolve(""), 15000); }); };
const PAGES = { home: await call("home", "/"), find: await call("buy", "/find"), "market check": await call("marketCheck", "/market-check"), sell: await call("sellNext", "/api/sellNext") };
globalThis.fetch = realFetch;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("SKIP browser part: no Chrome at " + CHROME); console.log(`startPlaceCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const seen = {};
for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
  const tops = {}, boxTops = {};
  for (const [k, html] of Object.entries(PAGES)) {
    ok(html.length > 2000 && !/^ERR/.test(html), `${k}: renders at ${w}`);
    const pg = await browser.newPage(); await pg.setViewport({ width: w, height: h });
    await pg.setContent(html.replace(/<script src="[^"]*"[^>]*><\/script>/g, ""), { waitUntil: "domcontentloaded" });
    const m = await pg.evaluate(() => { const g = document.querySelector("[data-gst]"), b = g.querySelector(".gst-box").getBoundingClientRect(); return { w: b.width, l: b.left, r: b.right, top: g.firstElementChild.getBoundingClientRect().top, boxTop: b.top, vw: innerWidth, vh: innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth }; });
    await pg.close();
    tops[k] = Math.round(m.top); boxTops[k] = Math.round(m.boxTop);
    if (w >= 1024) ok(m.w <= START_ONE_MAX + 1, `${k} at ${w}: the box is ${Math.round(m.w)} px, not wider than ${START_ONE_MAX}`);
    if (w >= 1440) ok(Math.abs(m.w - START_ONE_MAX) <= 1, `${k} at ${w}: the box is the cap wide (${Math.round(m.w)})`);
    if (w <= 480) ok(m.w <= m.vw && m.l >= 0 && m.r <= m.vw, `${k} at ${w}: the box fits the window (${Math.round(m.l)} to ${Math.round(m.r)} of ${m.vw})`);
    ok(!m.hscroll, `${k} at ${w}: no sideways scroll`);
    if (w >= 1440) ok(m.boxTop > m.vh * 0.26 && m.boxTop < m.vh * 0.40, `${k} at ${w}x${h}: the box starts ${Math.round(100 * m.boxTop / m.vh)}% of the way down (about a third)`);
    (seen[w] = seen[w] || {})[k] = { box: Math.round(m.w), top: Math.round(m.top), boxTop: Math.round(m.boxTop) };
  }
  const v = Object.values(tops);
  ok(v.every(x => Math.abs(x - v[0]) <= 1), `at ${w}: the group starts at the same height on every page (${JSON.stringify(tops)})`);
}
await browser.close();
if (process.argv.includes("--print")) for (const [w, o] of Object.entries(seen)) for (const [k, r] of Object.entries(o)) console.log(`${w} ${k}: box ${r.box} wide, group starts ${r.top}, box starts ${r.boxTop}`);
console.log(`startPlaceCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
