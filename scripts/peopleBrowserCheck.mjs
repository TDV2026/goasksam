// clock: real-ok the stub data uses fixed Oct 29 timestamps and only generatedAt and the sign-in expiry are relative to now; no assertion compares them to a launch time (Lane G, Oct 29 2026)
// THE ADMIN PEOPLE AND LAUNCH TABS IN CHROME, data stubbed (Lane D, Oct 29 2026). The real /admin page script at 1440 and 390 against the real
// panel code (peoplePanel, personDrill, launch build) on a fake store: no network, no live data, no credential.
//   People: one row per signed-in email (first source, device, searches, Tasks, watches, last seen), the same list for visitors by cookie id,
//   the source filter, a drill-in of one person's searches in order with the exact typed words. Launch: "utm: beehiiv" for a reader who lands and
//   searches and for one who signs in afterwards. No sideways scroll.
//   node scripts/peopleBrowserCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("peopleBrowserCheck: SKIP (no Chrome)"); process.exit(0); }
process.env.ADMIN_EMAILS = "sam@example.com";
const admin = await import("../api/admin.js");
const { peoplePanel, personDrill } = await import("../lib/admin/people.js");
const { build } = await import("../lib/admin/launch.js");
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const t = m => new Date(Date.UTC(2026, 9, 29, 14, m)).toISOString();
const E = (m, name, who, extra) => ({ ts: t(m), name, anon_id: null, user_id: null, device_class: "mobile", ref_domain: null, utm_source: null, text: null, control: null, outcome: null, ...who, ...extra });
const EVENTS = [
  E(0, "page_view", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { utm_source: "beehiiv" }),
  E(1, "search_run", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { text: "1987 porsche 911 carrera", product: "market_check", answer_type: "range" }),
  E(2, "search_run", { anon_id: "ANON-A-aaaaaaaaaa" }, { text: "ferrari 308 gts", product: "buy", answer_type: "zero_result" }),
  E(3, "standing_arm", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, { control: "watch_spec", outcome: "added" }),
  E(5, "task_created", { anon_id: "ANON-A-aaaaaaaaaa", user_id: U1 }, {}),
  E(0, "page_view", { anon_id: "ANON-B-bbbbbbbbbb", user_id: U2 }, { ref_domain: "google.com", device_class: "desktop" }),
  E(1, "search_run", { anon_id: "ANON-B-bbbbbbbbbb", user_id: U2 }, { text: "bronco", product: "sell", answer_type: "identity_question" }),
  E(0, "page_view", { anon_id: "ANON-C-cccccccccc" }, { utm_source: "beehiiv" }),
  E(1, "search_run", { anon_id: "ANON-C-cccccccccc" }, { text: "miata", product: "buy", answer_type: "range" }),
];
const ACCOUNTS = [{ user_id: U1, email: "ann@example.com" }, { user_id: U2, email: "bo.with.a.rather.long.address.for.the.narrow.screen@example.org" }];
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url)), j = b => ({ ok: true, json: async () => b });
  if (u.includes("/accounts?")) return j(ACCOUNTS.filter(a => u.includes(a.user_id)));
  if (u.includes("analytics_events?user_id=eq.")) { const id = u.match(/user_id=eq\.([0-9a-f-]+)/)[1]; return j(EVENTS.filter(e => e.user_id === id)); }
  if (u.includes("analytics_events?anon_id=in.(")) { const ids = u.match(/anon_id=in\.\(([^)]*)\)/)[1].split(","); return j(EVENTS.filter(e => ids.includes(e.anon_id) && !e.user_id)); }
  if (u.includes("analytics_events?anon_id=eq.")) { const id = u.match(/anon_id=eq\.([^&]+)/)[1]; return j(EVENTS.filter(e => e.anon_id === id)); }
  if (u.includes("analytics_events?name=in.(")) return j(EVENTS);
  return j([]);
};
const env = { supabaseUrl: "https://x.test", supabaseKey: "k" }, adminEmail = e => e === "sam@example.com";
// Launch: one reader lands from the email link and searches (a), one signs in afterwards (b), one lands and leaves (c)
const pv = (anon, m, extra) => ({ ts: t(m), product: "site", anon_id: anon, session_id: "s" + anon, ref_domain: null, utm_source: null, utm_medium: null, device_class: "mobile", props: {}, ...extra });
const ev = (anon, m, name, product, props) => ({ ts: t(m), name, product: product || "site", anon_id: anon, session_id: "s" + anon, device_class: "mobile", props: props || {} });
const LD = build({ pv: [pv("a", 0, { utm_source: "beehiiv" }), pv("b", 1, { utm_source: "beehiiv" }), pv("c", 2, { utm_source: "beehiiv" })],
  ev: [ev("a", 5, "search_run", "market_check", { answer_type: "range", query_text: "x", vehicle_key: "porsche|911" }), ev("b", 5, "search_run", "buy", { answer_type: "range", query_text: "y", vehicle_key: "ford|gt" }), ev("b", 7, "signin"), ev("b", 8, "task_created")], mc: [], out: [], ocd: [], held: [] }, { from: t(0), to: t(60), key: "launch" });
const heldBackMock = { read: true, today: { hits: 7, visitors: 5, no_id: 1 }, week: { hits: 31, visitors: 19, no_id: 2 }, by_route: [{ k: "market_check market_check_search", today: 7, week: 25 }, { k: "buy buy_chat", today: 0, week: 6 }], by_limit: [{ k: "device_day_cars", today: 7, week: 25 }, { k: "buy_model_spend", today: 0, week: 6 }], busiest_today: { hour: "2026-10-26 19:00", hits: 4 }, busiest_week: { hour: "2026-10-25 11:00", hits: 9 }, tz: "Pacific" };
const launchPayload = { ...LD, held_back: heldBackMock, now: { minutes: 15, visitors: 3, answers: 2, failures: 0 }, generatedAt: new Date().toISOString(), launchAt: "2026-10-29T14:00:00Z" };
ok(LD.sources.some(s => s.source === "utm: beehiiv" && s.visitors === 3), "the stub Launch data has the source utm: beehiiv with 3 visitors");
const resObj = () => ({ h: {}, c: null, b: null, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } });
const g = resObj(); await admin.default({ method: "GET", query: {}, headers: {} }, g);
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: h }); const errs = []; page.on("pageerror", e => errs.push(e.message.slice(0, 120)));
  const calls = [];
  await page.setRequestInterception(true);
  page.on("request", async rq => {
    const u = rq.url();
    if (u.endsWith("/api/admin") && rq.method() === "POST") {
      let body = {}; try { body = JSON.parse(rq.postData() || "{}"); } catch {} calls.push(body);
      const out = body.part === "launch" ? launchPayload : body.part === "people" ? await peoplePanel(env, { who: body.who === "anonymous" ? "anonymous" : "signed_in", source: body.source, text: body.text, adminEmail })
        : body.part === "person" ? await personDrill(env, body.person) : { ok: true, rows: [] };
      return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    }
    if (u.startsWith("http://admin.test/")) return rq.respond({ status: 404, contentType: "text/html; charset=utf-8", body: g.b });
    return rq.abort();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 3000 })); });
  await page.goto("http://admin.test/admin", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#ad-body h2"), { timeout: 8000 }).catch(() => {});
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
  const text = () => page.evaluate(() => document.body.innerText);
  // Launch
  const lt = await text();
  ok(/utm: beehiiv/.test(lt), `${tag}: Launch shows the source "utm: beehiiv"`);
  ok(await noScroll(), `${tag}: Launch has no sideways scroll`);
  // People
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent === "People").click());
  await page.waitForFunction(() => document.querySelector("#pp-go"), { timeout: 5000 }).catch(() => {});
  const pt = await text();
  ok(/ann@example\.com/.test(pt) && /bo\.with\.a\.rather/.test(pt) && !/sam@example\.com/.test(pt), `${tag}: People lists each signed-in email, not the admin`);
  ok(/utm beehiiv/.test(pt) && /google\.com/.test(pt) && /mobile/.test(pt) && /desktop/.test(pt), `${tag}: People shows first source and device`);
  ok(/1987 porsche 911 carrera|ferrari 308 gts/.test(pt) || /ferrari 308 gts/.test(pt), `${tag}: People shows the last typed search`);
  ok(await noScroll(), `${tag}: People has no sideways scroll`);
  await page.select("#pp-who", "anonymous"); await page.evaluate(() => document.getElementById("pp-go").click());
  await page.waitForFunction(() => /ANON-C-cccc/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  const at = await text();
  ok(/ANON-C-cccc/.test(at) && /ANON-A/.test(at) === false, `${tag}: visitors who never sign in show by cookie id (cut to 12 characters), not the signed-in browsers`);
  ok(calls.some(c => c.part === "people" && c.who === "anonymous"), `${tag}: the visitor list is a separate read`);
  await page.select("#pp-who", "signed_in"); await page.evaluate(() => { document.getElementById("pp-go").click(); });
  await page.waitForFunction(() => /ann@example\.com/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => [...document.querySelectorAll("[data-person]")].find(a => /ann@/.test(a.textContent)).click());
  await page.waitForFunction(() => /ferrari 308 gts/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  const dt = await text();
  ok(/1987 porsche 911 carrera/.test(dt) && /ferrari 308 gts/.test(dt) && dt.indexOf("1987 porsche") < dt.indexOf("ferrari 308") && /Market Check/.test(dt) && /Find/.test(dt), `${tag}: the drill-in lists the exact typed words in order with the page`);
  ok(/Watch/.test(dt) && /Task started/.test(dt), `${tag}: the drill-in shows the watch and the Task`);
  ok(await noScroll(), `${tag}: the drill-in has no sideways scroll`);
  ok(errs.length === 0, `${tag}: no page errors ${errs.join(" | ")}`);
  await page.close();
}
await b.close();
console.log(`peopleBrowserCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
