// SIGN-IN RETURN (Sam, Oct 25 2026): a signed-out visitor who clicks "Give Sam a Task" (or any button that asks for sign-in) lands, after the emailed code is
// verified, on the page they were going to, never on Home and never back where they started needing a second click. Scripted in headless Chrome against the REAL
// pages and the REAL public/js/auth.js with the network answered by fixtures (no Supabase, no email). Existing account and new account (the sign-up ticket path),
// every entry point, 1440 and 390, the safe-destination rule (same origin only), and nothing lost when the card is closed and reopened. No network.
//   node scripts/signinReturnCheck.mjs [--shots dir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
process.env.LAUNCH_STAGE = "2"; process.env.LAUNCH_BUSINESS = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), SHOTS = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const render = async (mod, url, query = {}) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href + "?t=" + Date.now());
  return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { r(String(b)); return res; }, end(b) { r(String(b || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; } }; Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie: "" } }, res)).catch(() => r("")); }); };
const PAGES = { "/tasks": await render("tasksPage", "/tasks"), "/tasks/mine": await render("tasksPage", "/tasks/mine", { app: "1" }), "/find": await render("buy", "/find"), "/market-check": await render("marketCheck", "/market-check"), "/sell": await render("sellPage", "/sell") };
const mime = f => f.endsWith(".js") ? "application/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function session(w, pagePath, { newAccount }) {
  const ctx = await (b.createBrowserContext ? b.createBrowserContext() : b.createIncognitoBrowserContext()); const p = await ctx.newPage(); await p.setViewport({ width: w, height: 900 }); const nav = [];
  await p.setRequestInterception(true);
  p.on("request", r => {
    const u = new URL(r.url()), CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, j = o => r.respond({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(o) });
    if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: CORS, body: "" });
    if (r.isNavigationRequest() && u.origin === "https://goasksam.com") { nav.push(u.pathname + u.search); const pg = PAGES[u.pathname] || "<!doctype html><title>" + u.pathname + "</title><body>LANDED " + u.pathname + u.search; return r.respond({ status: 200, contentType: "text/html", body: pg }); }
    if (u.host === "sb.test") { if (u.pathname === "/auth/v1/otp") return j({}); if (u.pathname === "/auth/v1/verify") return j({ access_token: "tok", refresh_token: "r", expires_in: 3600, user: { email: "me@example.com" } }); return j({}); }
    if (u.pathname === "/api/publicConfig") return j({ supabaseUrl: "https://sb.test", anonKey: "anon" });
    if (u.pathname === "/api/signup") return j(newAccount ? { ok: true, ticket: "t1" } : { ok: true });
    if (u.pathname === "/api/account") return j({ email: "me@example.com", tier: "free", dailyLimit: 10, dailyUsed: 0, dailyRemaining: 10 });
    if (u.pathname === "/api/tasks") return j({ signedIn: true, count: 0, tasks: [], limit: { max: 3 } });
    if (u.host === "goasksam.com") { const rel = u.pathname.replace(/^\/(js|obx)\.[0-9a-z]+\//, "/js/"); const f = path.join(ROOT, "public", rel); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: mime(f), body: fs.readFileSync(f) }); }
    return r.respond({ status: 204, body: "" });
  });
  if (process.env.DBG) { p.on("console", m => console.log("console:", m.text().slice(0, 160))); p.on("pageerror", e => console.log("pageerror:", String(e).slice(0, 200))); p.on("requestfinished", r => { if (/auth\.js/.test(r.url())) console.log("loaded", r.url()); }); }
  await p.goto("https://goasksam.com" + pagePath, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 900));
  if (process.env.DBG) console.log("nav", pagePath, JSON.stringify(nav), await p.evaluate(() => typeof openSignInCard + " " + location.href));
  return { p, nav };
}
async function signInFlow(p) {
  await p.waitForSelector("#auth-email", { timeout: 10000 }); await p.type("#auth-email", "me@example.com");
  await p.evaluate(() => document.querySelector("#auth-modal .auth-email-btn").click()); await p.waitForSelector("#auth-code", { timeout: 10000 });
  await p.type("#auth-code", "48201937"); await p.evaluate(() => document.querySelector("#auth-modal .auth-email-btn").click()); await new Promise(r => setTimeout(r, 1500));
}
const here = p => p.evaluate(() => location.pathname + location.search);
for (const w of [1440, 390]) for (const newAccount of [false, true]) {
  const tag = `${w}px ${newAccount ? "new account" : "existing account"}`;
  // 1. "Give Sam a Task" on the Tasks explainer -> /tasks/mine?start=1
  { const { p, nav } = await session(w, "/tasks", { newAccount });
    await p.evaluate(() => { const c = document.getElementById("tkcta") || document.getElementById("tkcta2"); c && c.click(); });
    await signInFlow(p); const at = await here(p); ok(nav.includes("/tasks/mine?start=1") && /^\/tasks\/mine/.test(at), `${tag}: "Give Sam a Task" goes to /tasks/mine?start=1 after the code (the page then tidies its own address; now ${at}; went to ${nav.join(" > ")})`);
    if (SHOTS && w) await p.screenshot({ path: `${SHOTS}/signin-return-tasks-${newAccount ? "new" : "existing"}-${w}.png` }); await p.close(); }
  // 2. The sign-in button on a page: back on the same page, search kept
  for (const [pg, qs] of [["/find", "?q=red+manual+porsche"], ["/market-check", "?q=1995+porsche+911+carrera"]]) {
    const { p } = await session(w, pg + qs, { newAccount });
    await p.evaluate(() => { openSignInCard("test"); }); await signInFlow(p); const at = await here(p); ok(at === pg + qs, `${tag}: ${pg} keeps its address and search after the code (${at})`); await p.close(); }
  // 3. Sell
  { const { p } = await session(w, "/sell", { newAccount }); await p.evaluate(() => { openSignInCard("test"); }); await signInFlow(p); const at = await here(p); ok(at === "/sell", `${tag}: Sell stays on Sell (${at})`); await p.close(); }
}
// 4. The destination is safe: same origin only, never an external address
{ const { p } = await session(1440, "/tasks", { newAccount: false });
  const r = await p.evaluate(() => ["/tasks/mine?start=1", "//evil.example/x", "https://evil.example/x", "/\\evil.example", "javascript:alert(1)", "http://goasksam.com.evil.example/", "/find?q=a#b", "", null, "tasks/mine"].map(d => typeof authSafeDest === "function" ? authSafeDest(d) : "MISSING"));
  ok(JSON.stringify(r) === JSON.stringify(["/tasks/mine?start=1", null, null, null, null, null, "/find?q=a#b", null, null, "/tasks/mine"].map(x => x === "/tasks/mine" ? "/tasks/mine" : x)), "the destination rule keeps same-origin paths and refuses every external or script address: " + JSON.stringify(r)); await p.close(); }
// 5. Nothing lost when the card is closed and reopened; a stale stash is ignored
{ const { p } = await session(1440, "/tasks", { newAccount: false });
  await p.evaluate(() => localStorage.setItem("gas_signin_return", JSON.stringify({ path: "/find?q=x", at: Date.now() - 3 * 3600e3 }))); const old = await p.evaluate(() => authTakeReturn()); ok(old === null, "a stash older than 30 minutes is ignored");
  await p.evaluate(() => { document.getElementById("tkcta").click(); }); await p.waitForSelector("#auth-email"); await p.evaluate(() => authCloseModal());
  const kept = await p.evaluate(() => localStorage.getItem("gas_signin_return")); ok(!!kept && /start=1/.test(kept), "closing the card keeps the destination");
  await p.evaluate(() => { document.getElementById("tkcta").click(); }); await signInFlow(p); ok(/^\/tasks\/mine/.test(await here(p)), "reopening and signing in still lands on the Task page (" + (await here(p)) + ")");
await p.close(); }
// 6. What they had typed rides along: remembered when the card opens, waiting in the destination's box
{ const { p } = await session(1440, "/find", { newAccount: false });
  await p.evaluate(() => { const bx = document.querySelector(".gst-in, textarea"); if (bx) { bx.value = "red manual porsche"; } openSignInCard("x", { dest: "/tasks/mine?start=1" }); });
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("gas_signin_return") || "null")); ok(st && st.typed === "red manual porsche" && st.path === "/tasks/mine?start=1", "the typed words and the destination are remembered when the card opens");
  await signInFlow(p); const typed = await p.evaluate(() => JSON.parse(localStorage.getItem("gas_signin_typed") || "null")); ok(typed && typed.text === "red manual porsche", "the typed words wait for the destination after sign-in");
  await p.close(); }
{ const { p } = await session(1440, "/find", { newAccount: false });
  await p.evaluate(() => { localStorage.setItem("gas_signin_typed", JSON.stringify({ text: "red manual porsche", path: "/find", at: Date.now() })); authApplyTyped(); });
  const v = await p.evaluate(() => (document.querySelector(".gst-in, textarea") || {}).value); ok(v === "red manual porsche", "on the destination the typed words fill the empty box (" + v + ")"); await p.close(); }
await b.close();
console.log(`signinReturnCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
