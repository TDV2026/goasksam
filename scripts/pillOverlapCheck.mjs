// THE ACCOUNT PILL NEVER COVERS THE PAGE (Sam, Oct 27 2026): signed in on a desktop, the email and Sign out pill at the top right sat over the search box
// and covered its arrow. The pill is drawn once (lib/authBar.js) and the pages reserve its band once (lib/appShell.js SHELL_CSS), so no page has to know about it.
//   (Market Check and Sell are also drawn in their result view, where the search box is the first thing in the page, with and without the context line above it)
//   rendered at 1440, 1024, 768 and 390, signed in with a long address and signed out, on Home, Find, Market Check, Sell, Tasks, About and Feedback:
//   the pill's box meets no text, button, input or picture of the page. Anything the page draws that the pill touches is named.
//   node scripts/pillOverlapCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => String(u).includes("job_ingest") ? new Response(JSON.stringify([{ created_at: "2026-10-26T14:00:00Z" }]), { status: 200, headers: { "content-type": "application/json" } }) : new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
const call = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status(c) { res.code = c; return res; }, json(b) { resolve(JSON.stringify(b)); }, send(b) { resolve(String(b)); }, end(b) { resolve(String(b || "")); } };
    Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve("ERR " + e)); setTimeout(() => resolve(""), 15000); }); };
const PAGES = { home: await call("home", "/"), find: await call("buy", "/find"), "market check": await call("marketCheck", "/market-check"), sell: await call("sellNext", "/api/sellNext"),
  tasks: await call("tasksPage", "/tasks"), about: await call("about", "/about"), feedback: await call("feedback", "/feedback") };
globalThis.fetch = realFetch;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("SKIP browser part: no Chrome at " + CHROME); console.log(`pillOverlapCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const EMAIL = "someone.with.a.long.address@example-mail.com";
const SIGNED_IN = `<span class="hp-account-email" title="${EMAIL}">${EMAIL}</span><button class="hp-signout">Sign out</button>`;
const SIGNED_OUT = `<button class="hp-signin">Sign in</button>`;
const BOX = `<div class="inbox mc-bar" role="search"><label class="sr" for="ob-input">Search a car</label><input id="ob-input" value="1990 Porsche 911 Carrera" autocomplete="off"><button class="go" id="ob-go" type="button">&rarr;</button></div><p class="ob-sub">Typical range, from the sales on record.</p>`;
const CTX = `<div class="ob-ctx"><span class="ob-ctx-l">Looking at</span><span class="ob-ctx-t">1990 Porsche 911 Carrera, Coupe</span><button class="ob-ctx-x" type="button">&times;</button></div>`;
const VIEWS = []; for (const [k, html] of Object.entries(PAGES)) { VIEWS.push([k, html, null]); if (/id="ob"/.test(html)) { VIEWS.push([k + " result view", html, BOX]); VIEWS.push([k + " result view with context", html, CTX + BOX]); } }
for (const [w, h] of [[1440, 900], [1440, 700], [1280, 560], [1024, 768], [1024, 600], [768, 1024], [390, 844]]) for (const [k, html, result] of VIEWS) for (const [state, markup] of [["signed in", SIGNED_IN], ["signed out", SIGNED_OUT]]) {
  ok(html.length > 1500 && !/^ERR/.test(html), `${k}: renders at ${w}`);
  const pg = await browser.newPage(); await pg.setViewport({ width: w, height: h });
  await pg.setContent(html.replace(/<script src="[^"]*"[^>]*><\/script>/g, ""), { waitUntil: "domcontentloaded" });
  const hit = await pg.evaluate((m, res) => {
    if (res) { const ob = document.getElementById("ob"); if (ob) ob.innerHTML = res; }
    for (const id of ["signin-area", "signin-area-m", "signin-area-menu"]) { const a = document.getElementById(id); if (a) a.innerHTML = m; }
    const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const pills = [...document.querySelectorAll(".gas-signbar, .gas-signbar-m")].filter(vis);
    const out = [];
    for (const p of pills) { const pr = p.getBoundingClientRect();
      for (const e of document.querySelectorAll("body *")) {
        if (p.contains(e) || e.contains(p) || !vis(e)) continue;
        if (e.closest("script,style,[hidden],.gas-scrim,.gas-menu,[aria-hidden='true']")) continue;
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()), ctl = /^(INPUT|TEXTAREA|BUTTON|SELECT|IMG|SVG|A)$/i.test(e.tagName) && e.getBoundingClientRect().width > 0;
        if (!own && !ctl) continue;
        const r = e.getBoundingClientRect();
        if (r.left < pr.right - 1 && r.right > pr.left + 1 && r.top < pr.bottom - 1 && r.bottom > pr.top + 1) out.push((e.className && String(e.className).slice(0, 30) || e.tagName) + ":" + (e.textContent || "").trim().slice(0, 20));
      } }
    return { n: pills.length, out };
  }, markup, result);
  await pg.close();
  ok(hit.out.length === 0, `${k} at ${w}, ${state}: the pill covers nothing (${hit.out.slice(0, 3).join(" | ") || "clear"})`);
}
await browser.close();
console.log(`pillOverlapCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
