// Screenshots and layout measures of /preview/tasks and /preview/tasks/mine at 1440, 1024, 768, 390 (Lane E, Nov 5 2026): offline, the pages as lib/preview renders them, the dashboard against the fixture API (the real client, a fake server).
//   node scripts/tasksShots.mjs [outdir]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { tasksPublicHtml } = await imp("lib/preview/tasksPreview.js"), { tasksMineHtml } = await imp("lib/preview/tasksMine.js"), { tasksDemoFixture, watchingDemoFixture, demoFixture, watchingFixture, tasksFixture, lookingFixture, NOW } = await imp("scripts/tasksFixture.mjs");
const OUT = path.resolve(process.argv[2] || "docs/design/preview"); fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
export async function fakeApi(body, fx) { const a = body && body.action; if (a === "list") return fx.list; if (a === "looking") return fx.looking; if (a === "cards") return { cards: {} }; if (a === "limit") return { ok: true }; return { ok: true }; }
async function open(html, width, { signedIn = false, mine = false } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const fx = { list: tasksFixture(10), looking: lookingFixture() };
  if (signedIn) await p.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: 9999999999 })); });
  await p.setRequestInterception(true);
  p.on("request", async r => { const u = new URL(r.url());
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.pathname === "/preview/tasks/api") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(await fakeApi(bd, fx)) }); }
    if (u.pathname === "/api/tasks") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: true, count: 0, active: null }) });
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/preview/tasks" + (mine ? "/mine" : ""), { waitUntil: "networkidle2" }).catch(() => {}); await new Promise(r => setTimeout(r, 500)); return p;
}
const shot = async (p, name, w) => { const h = await p.evaluate(() => Math.max(innerHeight, document.documentElement.scrollHeight)); await p.setViewport({ width: w, height: Math.min(h, 7000) }); await new Promise(r => setTimeout(r, 200)); await p.screenshot({ path: path.join(OUT, `${name}-${w}.png`) }); };
const PUB = tasksPublicHtml({ max: 10 }), PUBDEMO = tasksPublicHtml({ max: 10, demo: tasksDemoFixture(), watching: watchingDemoFixture(), now: NOW, allowData: true }), PUBTASK = tasksPublicHtml({ max: 10, demo: demoFixture(), now: NOW, allowData: true }), PUBWATCH = tasksPublicHtml({ max: 10, watching: watchingFixture(), now: NOW, allowData: true }), MINE = tasksMineHtml();
for (const w of [1440, 1024, 768, 390]) {
  let p = await open(PUB, w); await shot(p, "tasks-public", w); await p.close();
  p = await open(PUBDEMO, w); await shot(p, "tasks-public-demo", w); await p.close();
  p = await open(PUBTASK, w); await shot(p, "tasks-public-task-only", w); await p.close();
  p = await open(PUBWATCH, w); await shot(p, "tasks-public-watching-only", w); await p.close();
  p = await open(MINE, w, { signedIn: true, mine: true }); await shot(p, "tasks-mine", w);
  await p.evaluate(() => document.querySelector('[data-tab="watching"]').click()); await new Promise(r => setTimeout(r, 300)); await shot(p, "tasks-mine-watching", w); await p.close();
}
await b.close();
