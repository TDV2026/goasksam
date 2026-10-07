// Tasks sign-in check (Lane C, Oct 2026): the real sign-in path, no stubbed account.
//   PROBE_KEY=... node scripts/tasksAuthCheck.mjs [--shots DIR]
// 1. Signed out on the live /tasks at 1440, 1024 and 390: "Give Sam a task" opens the shared sign-in card,
//    styled, fully in view, clear of the rail, email field focused.
// 2. The normal email-code sign-in for the one test account (feedback+taskstest@goasksam.com): the page's
//    own "Email me a code" (Supabase /otp), a real code (the probe-only test_otp asks Supabase's admin API
//    for it, so no inbox is read), the page's own verify. It must land back on /tasks with the task box
//    open, focused, holding what was typed.
// 3. /api/tasks with that real Supabase token only (server-side verification, no probe header): summary is
//    signed in, a task is created under the real user id; a tampered token and no token are both 401.
// Cleans up the test account's tasks. Exits 1 on any failure.
import puppeteer from "puppeteer-core";

const KEY = process.env.PROBE_KEY;
if (!KEY) { console.error("PROBE_KEY is required"); process.exit(2); }
const SITE = process.env.SITE || "https://goasksam.com";
const shots = (() => { const i = process.argv.indexOf("--shots"); return i > 0 ? process.argv[i + 1] : null; })();
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fails = [];
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) fails.push(name); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const fresh = async (w, h) => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1 }); return p; };
try {
  // 1. signed out
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
    const p = await fresh(w, h);
    await p.goto(`${SITE}/tasks?chk=${Date.now()}`, { waitUntil: "networkidle2" });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.click("#tkcta2");
    await p.waitForSelector("#auth-modal .auth-dialog", { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    const o = await p.evaluate(() => {
      const d = document.querySelector("#auth-modal .auth-dialog"); if (!d) return null;
      const r = d.getBoundingClientRect(), rail = document.querySelector(".rail");
      const railRight = rail && getComputedStyle(rail).display !== "none" ? rail.getBoundingClientRect().right : 0;
      const btn = getComputedStyle(document.querySelector(".auth-email-btn"));
      return { inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clear: r.left >= railRight, focused: document.activeElement && document.activeElement.id === "auth-email", styled: btn.borderRadius === "12px" && btn.backgroundColor !== "rgba(0, 0, 0, 0)" && btn.backgroundColor !== "rgb(239, 239, 239)" };
    });
    check(`signed out ${w}px: sign-in card shown, styled, in view, clear of the rail, email focused`, !!o && o.inView && o.clear && o.focused && o.styled, JSON.stringify(o));
    if (shots) await p.screenshot({ path: `${shots}/tasks-signin-${w}.png` });
    await p.browserContext().close();
  }
  // 2. the email-code sign-in
  const p = await fresh(1440, 900);
  await p.goto(`${SITE}/tasks?start=1&chk=${Date.now()}`, { waitUntil: "networkidle2" });
  const typed = "Find me a black manual 997 under $70k";
  await p.type("#tkq", typed); await p.click("#tksend");
  await p.waitForSelector("#auth-email", { timeout: 10000 });
  await p.type("#auth-email", "feedback+taskstest@goasksam.com"); await p.click(".auth-email-btn");
  const codeScreen = await p.waitForSelector("#auth-code", { timeout: 20000 }).then(() => true).catch(() => false);
  check("the page's own 'Email me a code' reached the code screen", codeScreen);
  const otp = await p.evaluate(async K => (await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json", "x-probe-key": K }, body: JSON.stringify({ action: "test_otp" }) })).json(), KEY);
  check("a real one-time code issued for the test account", !!otp.otp, otp.otp ? "" : JSON.stringify(otp));
  await p.type("#auth-code", String(otp.otp || "")); await p.click(".auth-email-btn");
  await p.waitForFunction(() => !document.getElementById("auth-modal"), { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  const after = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); const q = document.getElementById("tkq"); return { path: location.pathname, email: s && s.email, jwt: !!(s && /^ey/.test(s.access_token || "")), box: !!q, value: q && q.value, focused: document.activeElement === q }; });
  check("signed in with a real Supabase session, back on /tasks, task box open and focused with the typed task", after.path === "/tasks" && after.email === "feedback+taskstest@goasksam.com" && after.jwt && after.box && after.focused && after.value === typed, JSON.stringify(after));
  if (shots) await p.screenshot({ path: `${shots}/tasks-signin-after-1440.png` });
  // 3. /api/tasks on the real token
  const tok = await p.evaluate(() => (JSON.parse(localStorage.getItem("gas_auth_session") || "{}")).access_token);
  const real = await p.evaluate(async tok => {
    const H = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
    const sum = await (await fetch("/api/tasks?summary=1", { headers: { Authorization: "Bearer " + tok }, cache: "no-store" })).json();
    const say = await fetch("/api/tasks", { method: "POST", headers: H, body: JSON.stringify({ action: "say", text: "Find me a black manual 997 under $70k" }) });
    const sj = await say.json();
    const bad = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok.slice(0, -4) + "AAAA" }, body: JSON.stringify({ action: "list" }) });
    return { signedIn: sum.signedIn === true, sayStatus: say.status, userId: sj.task && sj.task.user_id, taskEmail: sj.task && sj.task.email, tampered: bad.status };
  }, tok);
  check("real token: summary signed in", real.signedIn);
  check("real token: a task created under the real account", real.sayStatus === 200 && /^[0-9a-f-]{36}$/.test(real.userId || "") && !/^00000000-0000-4000-8000-/.test(real.userId) && real.taskEmail === "feedback+taskstest@goasksam.com", JSON.stringify(real));
  check("tampered token rejected (401)", real.tampered === 401, String(real.tampered));
  // No token, from a fresh signed-out browser (on a signed-in page js/auth.js adds the token to /api calls).
  const anon = await fresh(1024, 768);
  await anon.goto(`${SITE}/tasks`, { waitUntil: "domcontentloaded" });
  const noTok = await anon.evaluate(async () => (await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) })).status);
  check("no token rejected (401)", noTok === 401, String(noTok));
  const clean = await p.evaluate(async (tok, K) => (await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json", "x-probe-key": K, Authorization: "Bearer " + tok }, body: JSON.stringify({ action: "test_real_cleanup" }) })).json(), tok, KEY);
  check("test account's tasks cleaned up", typeof clean.deleted_tasks === "number", JSON.stringify(clean));
} catch (e) { check("run", false, String(e && e.message || e)); }
await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
