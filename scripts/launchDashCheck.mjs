// LAUNCH DASHBOARD CHECK (Lane D, Oct 26 2026). No network, no database, no key.
//   1. every new event (docs/analytics-events.md "Launch dashboard additions") logs through the real write path with no personal data in the row,
//      rejects a field it does not declare, and the write never blocks or slows the caller;
//   2. the Launch tab's numbers (lib/admin/launch.js build) are right on a fixture whose answers are known;
//   3. the real /admin page script with that fixture, in headless Chrome at 1440 and 390: the Launch tab is the default, the picker works, nothing scrolls sideways;
//   4. /admin still answers the plain 404 to anyone who is not on ADMIN_EMAILS, for every part including launch.
//   node scripts/launchDashCheck.mjs [--shots]     --shots also writes screenshots to proofs/launch/.
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL, fileURLToPath } from "node:url";
process.env.TRACK_STRICT = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { track, trackSystem, setTrackSink, trackDrain } = await imp("lib/track/log.js");
const { EVENTS } = await imp("lib/track/catalog.js");

// ---- 1. the new events
const rows = []; setTrackSink(r => rows.push(r));
const fakeReq = { headers: { cookie: "gas_aid=AAAAAAAAAAAAAAAAAAAAAA; gas_sid=BBBBBBBB", "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36", referer: "https://www.google.com/search?q=secret+query" }, query: {}, method: "POST", socket: { remoteAddress: "203.0.113.9" } };
const T = (name, props, opts) => { try { track(fakeReq, name, props, opts || {}); return null; } catch (e) { return e.message; } };
const PERSONAL = /203\.0\.113|me@example|gas_aid|gas_sid|BBBBBBBB|secret\+query|Mozilla\/5|google\.com\/search/;   // the pseudonymous anon id (the cookie value) is allowed; nothing else about the person is
const cases = [
  ["search_run", { query_text: "1995 acura nsx", answer_type: "range", latency_ms: 812, cache: "warm", search_id: "ab12cd34ef56ab12" }, { product: "market_check", surface: "market_check_page" }],
  ["search_run", { query_text: "x", answer_type: "failed", latency_ms: 5, failure_state: "still_reading" }, { product: "market_check", surface: "market_check_page" }],
  ["identity_question_shown", { dimension: "trim", option_count: 3, search_id: "ab12cd34ef56ab12" }, { product: "market_check", surface: "market_check_page", by: "browser" }],
  ["identity_question_answered", { dimension: "trim", choice: "Type S", skipped: false, search_id: "ab12cd34ef56ab12" }, { product: "market_check", surface: "market_check_page", by: "browser" }],
  ["auction_clickout", { platform: "bringatrailer", state: "live", surface: "find" }, { product: "buy", surface: "buy_page", by: "browser" }],
  ["auction_clickout", { platform: "carsandbids", state: "sold", surface: "market_check" }, { product: "market_check", surface: "market_check_page", by: "browser" }],
  ["auction_clickout", { platform: "bringatrailer", state: "live", surface: "tasks_email" }, { product: "tasks", surface: "email" }],
  ["signin", { method: "google", newsletter: true }, { product: "site", surface: "api" }],
  ["feedback_sent", {}, { product: "site", surface: "api" }],
  ["busy_shown", { reason: "busy" }, { product: "market_check", surface: "market_check_page", by: "browser" }],
];
for (const [name, props, opts] of cases) { const err = T(name, props, opts); ok(!err, `${name} ${JSON.stringify(props).slice(0, 60)} logs: ${err}`); }
await trackDrain();
ok(rows.length === cases.length, `all ${cases.length} new-event cases wrote a row (${rows.length})`);
ok(!rows.some(r => PERSONAL.test(JSON.stringify(r))), "no row holds an address, the session cookie, the referrer path/query or the full browser string");
ok(rows.every(r => r.anon_id === null || r.anon_id === "AAAAAAAAAAAAAAAAAAAAAA"), "the only identifier on a row is the pseudonymous anon id");
ok(rows.every(r => !("email" in r) && !("ip" in r)), "no row has an email or ip column");
const fb = rows.find(r => r.name === "feedback_sent"); ok(fb && Object.keys(fb.props).length === 0, "feedback_sent carries no field at all (a count only)");
ok(T("feedback_sent", { text: "hello" }, { product: "site", surface: "api" }) !== null, "feedback_sent with a text field is rejected");
ok(T("busy_shown", { reason: "other" }, { product: "market_check", surface: "market_check_page", by: "browser" }) !== null, "busy_shown rejects an unknown reason");
ok(T("auction_clickout", { platform: "bringatrailer", state: "live", surface: "elsewhere" }, { product: "buy", surface: "buy_page", by: "browser" }) !== null, "auction_clickout rejects an unknown surface");
ok(EVENTS.feedback_sent.cls === "service" && EVENTS.busy_shown.by.join() === "browser", "feedback_sent is a service event, busy_shown a browser event");
// never blocks: with a sink that hangs, track() still returns at once and the next call is not delayed.
setTrackSink(() => { const t = Date.now(); while (Date.now() - t < 5) {} });
const t0 = process.hrtime.bigint(); for (let i = 0; i < 50; i++) track(fakeReq, "busy_shown", { reason: "busy" }, { product: "market_check", surface: "market_check_page", by: "browser" });
const callMs = Number(process.hrtime.bigint() - t0) / 1e6;
ok(callMs < 40, `50 track() calls returned in ${callMs.toFixed(1)} ms with a slow writer (the write is queued, not awaited)`);
await trackDrain(); setTrackSink(null);
// the email route: only the listed https sources are followed, and the click is logged by the server without an address
const { isSourceUrl, trackedLink, platformKeyFor, tagOutbound } = await imp("lib/outboundUtm.js");
const tagged = tagOutbound("https://bringatrailer.com/listing/x/", "tasks_email"), tl = trackedLink(tagged);
ok(/^https:\/\/goasksam\.com\/out\?l=.+&sf=tasks_email$/.test(tl) && decodeURIComponent(tl.split("l=")[1].split("&sf=")[0]) === tagged, "a Task email link goes through /out and carries the already tagged address");
ok(!isSourceUrl("https://evil.example/x") && !isSourceUrl("http://bringatrailer.com/x") && !isSourceUrl("https://bringatrailer.com.evil.example/x") && !isSourceUrl("javascript:alert(1)") && isSourceUrl(tagged), "the /out route follows only an https link on one of the 19 sources");
{
  const outHandler = (await imp("api/out.js")).default; setTrackSink(r => rows.push(r)); const before = rows.length;
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, end() { return this; } };
  await outHandler({ query: { l: tagged, sf: "tasks_email" }, headers: { host: "goasksam.com", cookie: "gas_aid=AAAAAAAAAAAAAAAAAAAAAA" }, method: "GET" }, res); await trackDrain();
  ok(res.c === 302 && res.h.Location === tagged, "/out?l= redirects to the tagged address unchanged (utm tags kept)");
  const ev = rows.slice(before).find(r => r.name === "auction_clickout"); ok(ev && ev.props.surface === "tasks_email" && ev.props.platform === "bringatrailer" && ev.product === "tasks", "and logs auction_clickout, surface tasks_email, platform bringatrailer");
  const res2 = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, end() { return this; } };
  await outHandler({ query: { l: "https://evil.example/phish" }, headers: { host: "goasksam.com" }, method: "GET" }, res2);
  ok(res2.c === 302 && res2.h.Location === "/", "/out?l= to any other site goes home and is never followed");
  setTrackSink(null);
}

// ---- 2. the numbers
const { build } = await imp("lib/admin/launch.js");
const T0 = "2026-10-29T15:00:00Z", at = m => new Date(Date.parse(T0) + m * 60000).toISOString();
const E = (name, product, anon, m, props, sess) => ({ ts: at(m), name, product, anon_id: anon, session_id: sess || "s-" + anon, props: props || {} });
const run = (product, anon, m, answer_type, extra, sess) => E("search_run", product, anon, m, { answer_type, query_text: "q " + anon + m, latency_ms: 1000, ...extra }, sess);
const pv = (product, anon, m, extra, sess) => ({ ts: at(m), product, anon_id: anon, session_id: sess || "s-" + anon, ref_domain: null, utm_source: null, utm_medium: null, ...extra });
const fixture = {
  pv: [pv("market_check", "a1", 0, { ref_domain: "google.com" }), pv("market_check", "a2", 1, { ref_domain: "google.com" }), pv("market_check", "a3", 2, { utm_source: "newsletter" }), pv("buy", "b1", 3), pv("sell", "c1", 4), pv("market_check", "a1", 90, {}, "s-a1-later")],
  ev: [
    run("market_check", "a1", 0.5, "range", { vehicle_key: "acura|nsx", cache: "warm", latency_ms: 400 }),
    run("market_check", "a2", 1.5, "identity_question", { vehicle_key: "bmw|m5", search_id: "sidone", latency_ms: 700 }),
    E("identity_question_shown", "market_check", "a2", 1.6, { dimension: "trim", search_id: "sidone" }),
    E("identity_question_answered", "market_check", "a2", 2, { dimension: "trim", choice: "x", skipped: false, search_id: "sidone" }),
    run("market_check", "a2", 2.1, "range", { vehicle_key: "bmw|m5", search_id: "sidone", cache: "cold", latency_ms: 9000 }),
    E("identity_question_shown", "market_check", "a3", 2.5, { dimension: "trim", search_id: "sidtwo" }),
    run("market_check", "a3", 2.4, "not_enough_data", { vehicle_key: "spyker|c8", query_text: "2008 spyker c8", latency_ms: 800 }),
    run("market_check", "a3", 3, "failed", { failure_state: "catching_breath", query_text: "porsche 959" }),
    run("buy", "b1", 3.5, "zero_result", { vehicle_key: "tucker|48", query_text: "1948 tucker", latency_ms: 300 }),
    run("sell", "c1", 4.5, "range", { vehicle_key: "ford|gt", latency_ms: 2000 }),
    E("auction_clickout", "market_check", "a1", 5, { platform: "bringatrailer", state: "live", surface: "market_check" }),
    E("auction_clickout", "tasks", "a1", 6, { platform: "bringatrailer", state: "live", surface: "tasks_email" }, "s-a1-later"),
    E("task_created", "tasks", "c1", 7, {}), E("sell_started", "sell", "c1", 4.2, {}), E("sell_answer_shown", "sell", "c1", 4.6, { recommended_platform: "bat" }),
    E("signin_started", "site", "a1", 8, {}), E("signin", "site", "a1", 9, { method: "google", newsletter: true }), E("signin", "site", "b1", 10, { method: "email", newsletter: false }),
    E("limit_hit", "site", null, 11, { limit: "daily" }), E("error", "site", null, 12, { route: "/api/buySearch", status: 502 }), E("busy_shown", "market_check", "a3", 13, { reason: "busy" }), E("feedback_sent", "site", null, 14, {}),
  ],
  held: [{ ts: "2026-10-29T14:01:00Z", is_bot: true, props: { route: "/api/history", status: 503 } }, { ts: "2026-10-29T14:02:00Z", is_bot: true, props: { route: "/api/history", status: 503 } }, { ts: "2026-10-29T14:03:00Z", is_bot: false, props: { route: "/api/buy", status: 503 } }, { ts: "2026-10-29T14:04:00Z", is_bot: false, props: { route: "/api/history", status: 503 } }],
  mc: [{ product: "market_check", props: { cost_usd: 0.02 } }, { product: "buy", props: { cost_usd: 0.01 } }],
  out: [{ platform: "bringatrailer" }, { platform: "carsandbids" }],
  ocd: [{ oldcarsdata_metered_requests: 3, job: "ocd" }, { oldcarsdata_metered_requests: 10, job: "pull_live" }, { oldcarsdata_metered_requests: 50, job: "ingest" }], pvCapped: false,
};
const D = build(fixture, { from: T0, to: at(200), key: "today" });
const ar = p => D.answerRate.find(x => x.product === p);
ok(ar("market_check").asked === 5 && ar("market_check").real === 2 && ar("market_check").asked_back === 1 && ar("market_check").thin === 1 && ar("market_check").error === 1, "answer rate, Market Check: 5 asked, 2 real, 1 asked back, 1 thin, 1 error");
ok(ar("total").asked === 7 && ar("total").real === 3 && ar("buy").thin === 1 && ar("sell").real === 1, "answer rate totals: 7 asked, 3 real; Find 1 thin; Sell 1 real");
ok(D.refusals.limit_hit === 1 && D.refusals.signup_refused === 0, "refusals are counted apart");
ok(D.unmet.length === 3 && D.unmet.map(u => u.query).includes("2008 spyker c8") && D.unmet.map(u => u.query).includes("porsche 959") && D.unmet.map(u => u.query).includes("1948 tucker"), "unmet lists the thin, failed and zero-result queries word for word");
ok(D.unmet[0].last >= D.unmet[1].last && D.unmet[1].last >= D.unmet[2].last, "unmet is newest first");
ok(D.topCars[0].asked >= D.topCars[1].asked && D.topCars.length <= 20, "top cars are ranked and capped at 20");
const fm = D.funnel.find(x => x.product === "market_check"), ft = D.funnel.find(x => x.product === "total");
ok(fm.arrived === 3 && fm.asked === 3 && fm.real === 2 && fm.acted === 1 && fm.came_back === 1, `Market Check funnel 3 arrived, 3 asked, 2 real, 1 acted, 1 came back (got ${fm.arrived},${fm.asked},${fm.real},${fm.acted},${fm.came_back})`);
ok(ft.arrived === 5 && ft.asked === 5 && ft.real === 3, "total funnel: 5 arrived, 5 asked, 3 real");
ok(ft.lost[0] === 0 && Math.abs(ft.lost[1] - 0.4) < 1e-9, "percent lost at each step is computed from the step before");
ok(D.loop.asked === 2 && D.loop.answered === 1 && D.loop.real_after === 1 && D.loop.left === 1 && D.loop.skipped === 0, "asked-back loop: 2 asked, 1 answered, 1 real result after, 1 left at the question");
const br = D.outbound.find(o => o.platform === "bringatrailer");
ok(br.market_check === 1 && br.tasks_email === 1 && br.sell === 1 && br.total === 3 && D.outbound.find(o => o.platform === "carsandbids").sell === 1, "outbound clicks merge the event surfaces with the Sell venue clicks");
ok(D.action.signin_started === 1 && D.action.signin_completed === 2 && D.action.signin_google === 1 && D.action.signin_code === 1 && D.action.newsletter_ticked === 1 && D.action.newsletter_not_ticked === 1, "sign-ins by method and the newsletter box");
ok(D.action.tasks_created === 1 && D.action.sell_started === 1 && D.action.sell_finished === 1, "tasks created, Sell started and finished");
const srcN = k => D.sources.filter(x => x.source === k).reduce((n, x) => n + x.visitors, 0);
ok(srcN("google.com") === 2 && srcN("utm: newsletter") === 1 && srcN("direct") === 2 && D.sources.filter(x => x.source === "direct").length === 2, "sources: google.com 2, utm newsletter 1, direct 2 (split by the product of the first page), each visitor's first page view")
ok(D.returning.visitors === 5 && D.returning.returning === 1, "returning visitors: 1 of 5 had a second session");
const sp = D.speed.find(s => s.product === "market_check");
ok(sp.cold.n === 1 && sp.cold.p50 === 9000 && sp.warm.n === 1 && sp.warm.p50 === 400 && D.speed.find(s => s.product === "buy").cache_recorded === 0, "speed splits cold and warm where recorded, and says Find records neither");
ok(D.failures.held.total === 4 && D.failures.held.bots === 2 && D.failures.held.bot_share === 0.5 && D.failures.held.by_route[0].k === "/api/history" && D.failures.held.by_route[0].n === 3, "held at the door: its own count, bot share and routes");
ok(!D.failures.errors.some(x => /503/.test(x.k)) && D.failures.errors.length === 1, "held pages never appear in Errors");
ok(D.failures.busy_shown === 1 && D.failures.errors[0].k === "/api/buySearch 502" && D.failures.search_failed[0].k === "market_check catching_breath" && D.failures.last.length === 3, "failures: busy line, errors by route and status, failed searches, last list");
ok(D.cost.answers_served === 6 && Math.abs(D.cost.anthropic_usd - 0.03) < 1e-9 && D.cost.ocd_visitor_search === 3 && D.cost.ocd_live_pull === 10 && D.cost.ocd_nightly_and_other === 50 && D.cost.ocd_total === 63, "cost: answers served, Anthropic spend, OldCarsData split into searches, live pulls, nightly and other");
ok(D.feedback === 1, "feedback count");
ok(!("anon_id" in D) && !JSON.stringify(D).includes('"a1"') && !JSON.stringify(D).includes("s-a1"), "the result holds no visitor id or session id");

// ---- 3. the page, rendered
const admin = await imp("api/admin.js");
const resObj = () => ({ h: {}, c: null, b: null, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } });
const g = resObj(); await admin.default({ method: "GET", query: {}, headers: {} }, g);
ok(g.c === 404 && /noindex/.test(g.b) && /R\.launch=/.test(g.b) && /var cur="launch"/.test(g.b), "GET /admin answers 404 to everyone (noindex) and carries the Launch tab as the default");
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const payload = { ...D, now: { minutes: 15, visitors: 7, answers: 12, failures: 1 }, generatedAt: new Date().toISOString(), launchAt: "2026-10-29T14:00:00Z" };
for (let i = 0; i < 40; i++) payload.unmet.push({ product: "market_check", query: "a rather long query about a very rare car " + i, outcome: "thin", times: 1 + (i % 3), last: at(100 - i) });
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
if (SHOTS) fs.mkdirSync(path.join(ROOT, "proofs/launch"), { recursive: true });
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: h });
  const calls = [];
  await page.setRequestInterception(true);
  page.on("request", rq => {
    if (rq.url().endsWith("/api/admin") && rq.method() === "POST") { let body = {}; try { body = JSON.parse(rq.postData() || "{}"); } catch {} calls.push(body); const ranged = { ...payload, range: { key: body.range } }; return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body.part === "me" ? { ok: true } : ranged) }); }
    if (rq.url().startsWith("http://admin.test/")) return rq.respond({ status: 404, contentType: "text/html; charset=utf-8", body: g.b });
    return rq.abort();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 3000 })); });
  await page.goto("http://admin.test/admin", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#ad-body h2"), { timeout: 8000 }).catch(() => {});
  const txt = await page.evaluate(() => document.body.innerText);
  ok(/GoAskSam numbers/.test(txt) && /1\. Did they get an answer/.test(txt), `${tag}: the Launch tab draws by default`);
  const order = ["1. Did they get an answer", "2. Unmet demand", "3. Drop-off", "4. Action", "5. Came back", "6. Right now", "7. Speed", "8. Failures", "9. Cost per answer", "10. Feedback"].map(s => txt.indexOf(s));
  ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), `${tag}: the ten panels are all there, in the priority order`);
  const firstNav = await page.evaluate(() => { const b = document.querySelector("nav button"); return b && b.textContent; });
  ok(firstNav === "Launch", `${tag}: Launch is the first tab`);
  ok(/Real result/.test(txt) && /Real result after answering/.test(txt) && /Left at the question/.test(txt), `${tag}: answer rate and the asked-back loop show`);
  const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
  ok(over.sw <= over.iw && over.bw <= over.iw, `${tag}: no sideways page scroll (scrollWidth ${over.sw}, body ${over.bw}, window ${over.iw})`);
  if (SHOTS) await page.screenshot({ path: path.join(ROOT, `proofs/launch/launch-${tag}-today.png`), fullPage: true });
  // the picker asks for each range
  for (const r of ["yesterday", "launch", "last7", "today"]) {
    await page.evaluate(r => document.querySelector(`.lrange button[data-r="${r}"]`).click(), r);
    await page.waitForFunction(r => { const b = document.querySelector(`.lrange button[data-r="${r}"]`); return b && b.className === "on"; }, { timeout: 4000 }, r).catch(() => {});
  }
  const asked = calls.filter(c => c.part === "launch").map(c => c.range);
  ok(["yesterday", "launch", "last7"].every(r => asked.includes(r)), `${tag}: the date picker asks for yesterday, since launch and last 7 days (${asked.join(",")})`);
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(over2, `${tag}: still no sideways scroll after the picker`);
  // a table wider than the screen scrolls inside its own box, not the page
  if (tag === "390") { const wide = await page.evaluate(() => { const w = document.querySelector(".wrap"); return w && getComputedStyle(w).overflowX; }); ok(wide === "auto", "390: wide tables scroll inside their own box"); }
  await page.close();
}
await b.close();

// ---- 4. the gate
const gate = async (b, headers) => { const r = resObj(); await admin.default({ method: "POST", query: {}, headers: { host: "goasksam.com", ...(headers || {}) }, body: b }, r); return r; };
for (const part of ["launch", "overview", "me", "demand"]) {
  const a = await gate({ part, range: "today" }); const c = await gate({ part, range: "today" }, { authorization: "Bearer not-a-real-token" });
  ok(a.c === 404 && c.c === 404, `/admin part ${part}: the plain 404 with no token and with a bad token`);
}

// ---- 5. ADMIN_EMAILS accounts are internal (round 2, addition 1)
{
  const crewMod = await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href + "?int=" + Date.now());
  const cons = await import(pathToFileURL(path.join(ROOT, "lib/track/consent.js")).href + "?int=" + Date.now());
  const prevCode = process.env.CURTAIN_CREW_CODE, prevAdm = process.env.ADMIN_EMAILS;
  process.env.CURTAIN_CREW_CODE = "test-code-for-check"; process.env.ADMIN_EMAILS = "Sam@Example.com, pat@example.com";
  ok(crewMod.isAdminEmail("sam@example.com") && crewMod.isAdminEmail(" PAT@example.com "), "admin email match ignores case and spaces");
  ok(!crewMod.isAdminEmail("visitor@example.com") && !crewMod.isAdminEmail("") && !crewMod.isAdminEmail(null), "a non-admin or empty email is not internal");
  const v = crewMod.mintInternalCookieValue();
  const withCookie = c => ({ headers: { cookie: c } });
  ok(cons.isInternal(withCookie("gas_int=" + v)), "a signed gas_int cookie makes the request internal");
  ok(!cons.isInternal(withCookie("gas_int=v1.9999999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")), "a made-up gas_int is not internal");
  ok(!cons.isInternal(withCookie("gas_int=ok")), "gas_int=ok is not internal");
  ok(!crewMod.isCrewRequest(withCookie("gas_int=" + v)), "the internal cookie is not a crew cookie (no access)");
  const crewV = crewMod.mintCrewCookieValue();
  ok(!cons.isInternal(withCookie("gas_int=" + crewV)), "a crew cookie value passed as gas_int is refused (own HMAC label)");
  ok(cons.isInternal(withCookie("gas_crew=" + crewV)), "the crew cookie is still internal");
  ok(!cons.isInternal(withCookie("gas_aid=abcdefghijklmnop")), "an ordinary visitor and a tester stay not internal");
  delete process.env.CURTAIN_CREW_CODE;
  ok(!cons.isInternal(withCookie("gas_int=" + v)), "with no secret set nothing is internal (fail closed)");
  process.env.CURTAIN_CREW_CODE = prevCode ?? ""; if (prevCode == null) delete process.env.CURTAIN_CREW_CODE;
  if (prevAdm == null) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prevAdm;
  const acct = fs.readFileSync(path.join(ROOT, "api/account.js"), "utf8");
  ok(/isAdminEmail\(auth\.email\)/.test(acct) && /internal: adminAcct/.test(acct) && /INTERNAL_COOKIE/.test(acct), "api/account.js marks an admin sign-in and sets the internal flag on its own events");
}

// ---- 6. the holding page is logged as held_at_door, never as an error (round 2, addition 2)
{
  const { withTracking } = await imp("lib/track/log.js");
  const mk = (code, retry) => { const h = {}; return { statusCode: code, getHeader: k => h[k], setHeader: (k, v) => { h[k] = v; } , _h: h, _retry: retry }; };
  setTrackSink(r => rows.push(r));
  const before = rows.length;
  const held = mk(503); held.setHeader("Retry-After", "3600");
  await withTracking("/api/history", async () => {}, "site")(fakeReq, Object.assign(held, { statusCode: 503 }));
  const real = mk(503);
  await withTracking("/api/history", async () => {}, "site")(fakeReq, real);
  const five = mk(502);
  await withTracking("/api/buySearch", async () => {}, "site")(fakeReq, five);
  await trackDrain();
  const added = rows.slice(before).map(r => r.name + ":" + r.props.route + ":" + r.props.status);
  ok(added.length === 3 && added[0] === "held_at_door:/api/history:503", "a 503 with Retry-After logs held_at_door");
  ok(added[1] === "error:/api/history:503" && added[2] === "error:/api/buySearch:502", "a 503 without Retry-After and any other 5xx still log error");
}
console.log(`launchDashCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
