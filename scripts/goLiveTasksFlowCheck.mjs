// goLiveTasksFlowCheck (Lane E, Nov 10 2026, go live held item 2): SIGNED IN, ON THE PUBLIC ADDRESS, TASKS CREATE, EDIT AND STOP WORK, AND THE ACCOUNT BUTTON OPENS THE SAME SIGN IN.
// The Tasks app page as /tasks/mine?app=1 answers with NEW_DESIGN on (the real handler), opened in Chrome with a signed in session and no network: /api/tasks is answered here, and every call the page makes is recorded.
//   CREATE  type a request in the new Task box, Sam reads it back, Start sends action "start" with the draft
//   EDIT    the box inside a Task sends "say" with that Task's id, Apply sends "apply"
//   STOP    Pause and Stop send "control" with the Task id and the act; the list is read again after each
//   ADDRESS every call goes to /api/tasks (never a /preview address)
//   SIGN IN signed out, the header's Account button opens the sign in card (auth.js's own, #auth-modal) instead of leaving the page; signed in it goes to the dashboard
// MUTANTS: the sign in script missing, the Account handler missing, the page posting to the preview door.
//   node scripts/goLiveTasksFlowCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("goLiveTasksFlowCheck: SKIP no Chrome"); process.exit(0); }
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["the sign in script missing", "lib/_publicHead.js", "if (!/\\/auth\\.js/.test(h)) end.push(", "if (false) end.push("],
    ["the Account handler missing", "lib/_publicHead.js", 'if (/id="acct"/.test(h)) end.push(', "if (false) end.push("],
    ["the page posting to the preview door", "lib/_publicHead.js", '["/preview/tasks/api", "/api/tasks"]', '["/preview/tasks/api", "/preview/tasks/api"]']
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0; try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe", timeout: 180000 }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveTasksFlowCheck mutants: " + bad + " not caught" : "goLiveTasksFlowCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.NEW_DESIGN = "all"; delete process.env.CURTAIN_SEALED;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const FX = await imp("scripts/tasksFixture.mjs"), tasksPage = (await imp("api/tasksPage.js")).default;
async function html(url) {
  const res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, json() { return this; } };
  const u = new URL(url, "https://goasksam.com"), log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await tasksPage({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com" }, socket: {} }, res); } finally { console.log = log; console.error = err; }
  return res;
}
const APP = await html("/tasks/mine?app=1"), LAND = await html("/tasks");
ok(APP.h["x-design"] === "new" && LAND.h["x-design"] === "new", "the Tasks app page and the Tasks landing are served by the new design");
ok(!/\/preview\/tasks/.test(APP.body.replace(/indexOf\("\/preview\/"\)/g, "")), "the Tasks app page names no preview address");
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
async function open(page, url, { signedIn }) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 }); p._err = []; p._calls = [];
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.evaluateOnNewDocument(si => { try { localStorage.clear(); sessionStorage.clear(); if (si) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); } catch (e) {} }, signedIn);
  await p.setRequestInterception(true);
  const list = FX.tasksFixture(10);   // the stand-in list has room for a new Task (the live limit is the engine's to send)
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method(), json = o => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (u.host !== "goasksam.com") { if (/supabase\.co\/auth\/v1\/user/.test(r.url())) return json({ id: "u", email: "x@example.com", aud: "authenticated" }); return r.respond({ status: r.resourceType() === "image" ? 200 : 204, body: "" }); }
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: page.body });
    if (m === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (u.pathname === "/api/tasks" && m === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {} p._calls.push(a);
      if (a.action === "list") return json(list); if (a.action === "say" && !a.task_id) return json({ reply: "", draft: { summary: "Sam will look for a black manual 997 Carrera.", thread: [{ role: "sam", text: "Sam will look for a black manual 997 Carrera." }], filters: { colour: "black" } } });
      if (a.action === "say") return json({ reply: "Sam will also look for under 50,000 miles.", pending: { summary: "Sam is looking for a black manual 997 Carrera under 50,000 miles.", filters: { miles_max: 50000 } } });
      if (a.action === "start") return json({ task: { id: "99999999-9999-4999-8999-999999999999", starting: true } }); return json({ ok: true }); }
    if (/^\/api\//.test(u.pathname)) return r.respond({ status: /track/.test(u.pathname) ? 204 : 200, contentType: "application/json", body: /track/.test(u.pathname) ? "" : "{}" });
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded", timeout: 60000 }); await new Promise(r => setTimeout(r, 1800)); return p;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
{ // signed in: create, edit, stop
  const p = await open(APP, "/tasks/mine?app=1", { signedIn: true });
  if (process.env.DEBUG_TF) console.log('DEBUG', p._err, JSON.stringify(await p.evaluate(() => ({ app: (document.getElementById('tkapp') || {}).innerText, tq: !!document.getElementById('tkq'), tcs: document.querySelectorAll('article.tc').length, ids: [...document.querySelectorAll('[id]')].map(e => e.id).slice(0, 40) }))).slice(0, 1200));
  const ready = await p.evaluate(() => ({ cards: document.querySelectorAll("article.tc").length, box: !!document.getElementById("tkq") }));
  ok(ready.cards >= 3 && ready.box, `signed in, the dashboard lists the Tasks and has the new Task box (${ready.cards} Tasks)`);
  await p.evaluate(() => { const i = document.getElementById("tkq"); i.value = "A black manual 997 Carrera under $70k"; document.querySelector('[data-send="tkq"]').click(); }); await wait(900);
  ok(p._calls.some(c => c.action === "say" && !c.task_id && /997/.test(c.text || "")), "CREATE: the request is sent to Sam as a say");
  await p.evaluate(() => { const s = document.querySelector("[data-start]"); if (s) s.click(); }); await wait(900);
  ok(p._calls.some(c => c.action === "start" && c.draft && c.draft.summary), "CREATE: Start sends action start with the draft");
  await p.evaluate(() => { const i = document.querySelector('input[data-task]'); if (i) { i.value = "Under 50,000 miles"; document.querySelector('[data-send="' + i.id + '"]').click(); } }); await wait(900);
  ok(p._calls.some(c => c.action === "say" && c.task_id && /50,000/.test(c.text || "")), "EDIT: the box inside a Task sends a say with that Task's id");
  await p.evaluate(() => { const a = document.querySelector("[data-apply]"); if (a) a.click(); }); await wait(700);
  ok(p._calls.some(c => c.action === "apply" && c.task_id), "EDIT: Apply sends apply for that Task");
  await p.evaluate(() => { const a = document.querySelector('[data-act="pause"]'); if (a) a.click(); }); await wait(700);
  ok(p._calls.some(c => c.action === "control" && c.act === "pause" && c.task_id), "STOP: Pause sends control with the act and the Task id");
  const before = p._calls.filter(c => c.action === "list").length;
  await p.evaluate(() => { const a = document.querySelector('[data-act="stop"]'); if (a) a.click(); }); await wait(900);
  ok(p._calls.some(c => c.action === "control" && c.act === "stop" && c.task_id), "STOP: Stop sends control stop with the Task id");
  ok(p._calls.filter(c => c.action === "list").length > before, "STOP: the list is read again after it");
  ok(p._err.length === 0, `no page error (${p._err.join(" | ")})`); await p.close();
}
{ // the Account button, signed out: the same sign in card
  const p = await open(LAND, "/tasks", { signedIn: false });
  const r = await p.evaluate(async () => { const a = document.getElementById("acct"); if (!a) return { acct: false }; const before = location.href; a.click(); await new Promise(r => setTimeout(r, 700)); return { acct: true, modal: !!document.getElementById("auth-modal"), stayed: location.href === before, fn: typeof openSignInCard, bar: !!document.getElementById("signin-area") }; });
  ok(r.acct && r.fn === "function" && r.bar, `the Account button and the sign in script are on the Tasks page (script ${r.fn})`);
  ok(r.modal && r.stayed, "signed out, the Account button opens the sign in card and stays on the page");
  await p.close();
  { // a page that did not load the sign in script before the new design (About): the same card
    const ABOUT = await (async () => { const h = (await imp("api/about.js")).default, res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end() { return this; }, json() { return this; } }; await h({ method: "GET", url: "/about", query: {}, headers: { host: "goasksam.com" }, socket: {} }, res); return res; })();
    const pa = await open(ABOUT, "/about", { signedIn: false });
    const ra = await pa.evaluate(async () => { const a = document.getElementById("acct"); if (!a) return { acct: false }; a.click(); await new Promise(r => setTimeout(r, 700)); return { acct: true, modal: !!document.getElementById("auth-modal"), fn: typeof openSignInCard }; });
    ok(ABOUT.h["x-design"] === "new" && ra.acct && ra.fn === "function" && ra.modal, `About (a page the new design gives the sign in script to): the Account button opens the same sign in card (script ${ra.fn})`); await pa.close(); }
  const q = await open(LAND, "/tasks", { signedIn: true });
  const hrefs = await q.evaluate(() => ({ acct: (document.getElementById("acct") || {}).getAttribute ? document.getElementById("acct").getAttribute("href") : null }));
  ok(hrefs.acct === "/tasks/mine", `signed in, the Account button goes to the dashboard (${hrefs.acct})`); await q.close();
}
await b.close();
for (const l of out) console.log(l);
console.log(`goLiveTasksFlowCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
