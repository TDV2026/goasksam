// Shared by the Desk v3 checks (Lane E, Nov 8 2026): the demonstration case page as the crew door serves it, opened in Chrome with nothing but that page.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
export const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
export const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
export const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const V3 = await imp("lib/preview/deskV3.js"), FX = await imp("lib/preview/deskV3Fixture.js"), CV = await imp("lib/desk/caseView.js"), RW = await imp("lib/reasonWords.js"), CN = await imp("lib/countNoun.js");
export const demoHtml = async () => V3.renderDeskV3({ query: { case: V3.DEMO_ID } });
export const launch = () => puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
export async function openPage(b, html, w = 1440, h = 900) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.method() === "POST" && u.pathname === "/preview/desk/api") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); return r.respond({ status: 204, body: "" }); });
  p._err = []; p.on("pageerror", e => p._err.push(String(e).slice(0, 160)));
  await p.goto("https://goasksam.com/preview/desk/case/" + V3.DEMO_ID, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 200)); return p;
}
export const tally = () => { let pass = 0, fail = 0; const out = []; return { ok: (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } }, done: name => { console.log(out.join("\n")); console.log(`${name}: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0); } }; };
