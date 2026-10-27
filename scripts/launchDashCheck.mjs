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
const heldBackMock = { read: true, today: { hits: 7, visitors: 5, no_id: 1 }, week: { hits: 31, visitors: 19, no_id: 2 }, by_route: [{ k: "market_check market_check_search", today: 7, week: 25 }, { k: "buy buy_chat", today: 0, week: 6 }], by_limit: [{ k: "device_day_cars", today: 7, week: 25 }, { k: "buy_model_spend", today: 0, week: 6 }], busiest_today: { hour: "2026-10-26 19:00", hits: 4 }, busiest_week: { hour: "2026-10-25 11:00", hits: 9 }, tz: "Pacific" };
const payload = { ...D, held_back: heldBackMock, now: { minutes: 15, visitors: 7, answers: 12, failures: 1 }, generatedAt: new Date().toISOString(), launchAt: "2026-10-29T14:00:00Z" };
for (let i = 0; i < 40; i++) payload.unmet.push({ product: "market_check", query: "a rather long query about a very rare car " + i, outcome: "thin", times: 1 + (i % 3), last: at(100 - i) });
const searchesMock = { shown: 3, capped: false, limit: 300, rows: [
  { ts: at(3), product: "buy", text: "=cmd|calc a very long typed question about a rare car with many words in it " + "x".repeat(60), car: "ford gt", outcome: "range", seconds: 1.2, cache: "warm", state: "CA", device: "mobile", source: "google.com", person: "sam@example.com", signed_in: true, anon: "AAAAAAAAAAAAAAAAAAAAAA", crew: true },
  { ts: at(2), product: "market_check", text: "1948 tucker", car: "tucker 48", outcome: "thin", seconds: 0.8, cache: "cold", state: "TX", device: "desktop", source: "direct", person: "AAAAAAAAAAAAAAAAAAAAAA", signed_in: false, anon: "AAAAAAAAAAAAAAAAAAAAAA", crew: false },
  { ts: at(1), product: "sell", text: "spyker", car: "", outcome: "error", seconds: null, cache: "", state: "", device: "", source: "", person: "", signed_in: false, anon: null, crew: false }] };
const usersMock = { total: 2, capped: false, since: "2026-10-01T00:00:00Z", rows: [
  { user_id: "11111111-1111-1111-1111-111111111111", email: "someone@example.com", first_seen: at(0), first_source: "google.com", method: "google", newsletter: true, searches: 4, tasks: 1, clickouts: 2, last_seen: at(9) },
  { user_id: "22222222-2222-2222-2222-222222222222", email: "other.person.with.a.rather.long.address@example.org", first_seen: at(0), first_source: "direct", method: "email", newsletter: false, searches: 0, tasks: 0, clickouts: 0, last_seen: at(2) }] };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
if (SHOTS) fs.mkdirSync(path.join(ROOT, "proofs/launch"), { recursive: true });
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: h });
  const calls = [];
  await page.setRequestInterception(true);
  page.on("request", rq => {
    if (rq.url().endsWith("/api/admin") && rq.method() === "POST") { let body = {}; try { body = JSON.parse(rq.postData() || "{}"); } catch {} calls.push(body); const ranged = { ...payload, range: { key: body.range } }; return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body.part === "me" ? { ok: true } : body.part === "searches" ? searchesMock : body.part === "users" ? usersMock : body.part === "user_journey" ? { user: true, anon: "sam@example.com", events: [{ ts: at(1), product: "buy", name: "page_view", props: { path: "/buy" }, user_id: "signed in" }] } : ranged) }); }
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
  ok(/Held back/.test(txt) && txt.indexOf("Held back") > txt.indexOf("Held at the door") && txt.indexOf("Held back") < txt.indexOf("Errors by route and status"), `${tag}: the Held back panel sits next to Held at the door`);
  ok(/Visitors today\s*5/.test(txt) && /Visitors, 7 days\s*19/.test(txt) && /market_check market_check_search/.test(txt) && /device_day_cars/.test(txt) && /2026-10-26 19:00 \(4\)/.test(txt), `${tag}: Held back shows hits, visitors, route, limit and the busiest hour`);
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
  // Searches and Users tabs (round 2, stages 3 to 5)
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent === "Searches").click());
  await page.waitForFunction(() => document.querySelector("#sf-go"), { timeout: 4000 }).catch(() => {});
  const stxt = await page.evaluate(() => document.body.innerText);
  ok(/Newest first/.test(stxt) && /1948 tucker/.test(stxt) && /sam@example\.com/.test(stxt), `${tag}: the Searches tab draws its rows, with the signed-in email`);
  ok(await page.evaluate(() => !!document.querySelector("#sf-product") && !!document.querySelector("#sf-outcome") && !!document.querySelector("#sf-text") && !!document.querySelector("#sf-csv")), `${tag}: Searches has the product, outcome and text filters and the CSV button`);
  ok(await page.evaluate(() => { const c = document.getElementById("ad-crew"); return c && !c.checked; }), `${tag}: the include-crew switch is off by default on Searches`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tag}: Searches has no sideways page scroll`);
  const nCalls = calls.length;
  await page.evaluate(() => { document.getElementById("ad-crew").click(); });
  await page.waitForFunction(n => true, {}, 0);
  await new Promise(r => setTimeout(r, 300));
  ok(calls.slice(nCalls).some(c => c.part === "searches" && c.crew === true), `${tag}: switching crew on asks for crew traffic`);
  await page.evaluate(() => { document.getElementById("sf-outcome").value = "thin"; document.getElementById("sf-go").click(); });
  await new Promise(r => setTimeout(r, 300));
  ok(calls.some(c => c.part === "searches" && c.outcome === "thin" && c.crew === true), `${tag}: the outcome filter and the crew switch are sent together`);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent === "Users").click());
  await page.waitForFunction(() => document.querySelector("#ut-go"), { timeout: 4000 }).catch(() => {});
  ok(await page.evaluate(() => /someone@example\.com/.test(document.body.innerText) && document.documentElement.scrollWidth <= window.innerWidth), `${tag}: the Users tab draws with no sideways scroll`);
  await page.evaluate(() => document.querySelector("[data-user]").click());
  await new Promise(r => setTimeout(r, 300));
  ok(calls.some(c => c.part === "user_journey" && /^1{8}-/.test(c.user)), `${tag}: clicking a user asks for that account's journey`);
  ok(await page.evaluate(() => /Journey: sam@example\.com/.test(document.body.innerText)), `${tag}: the journey page names the account`);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent === "Launch").click());
  await page.waitForFunction(() => document.getElementById("ad-crew"), { timeout: 4000 }).catch(() => {});
  ok(await page.evaluate(() => { const c = document.getElementById("ad-crew"); return c && c.checked && /Crew and test traffic are included/.test(document.body.innerText); }), `${tag}: the crew switch carries over to Launch and says so plainly`);
  // a table wider than the screen scrolls inside its own box, not the page
  if (tag === "390") { const wide = await page.evaluate(() => { const w = document.querySelector(".wrap"); return w && getComputedStyle(w).overflowX; }); ok(wide === "auto", "390: wide tables scroll inside their own box"); }
  await page.close();
}
await b.close();

// ---- 4. the gate
const gate = async (b, headers) => { const r = resObj(); await admin.default({ method: "POST", query: {}, headers: { host: "goasksam.com", ...(headers || {}) }, body: b }, r); return r; };
for (const part of ["launch", "overview", "me", "demand", "write_failures", "door", "searches", "users", "user_journey"]) {
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

// ---- 7. geo and device (round 2, stage 2)
{
  setTrackSink(r => rows.push(r));
  const geoReq = (h) => ({ headers: { cookie: "gas_aid=AAAAAAAAAAAAAAAAAAAAAA; gas_sid=BBBBBBBB", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", ...h }, query: {}, method: "POST" });
  const b0 = rows.length;
  const us = geoReq({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco", "x-vercel-ip-latitude": "37.77", "x-vercel-ip-longitude": "-122.41" });
  track(us, "search_run", { query_text: "x", answer_type: "range", latency_ms: 5 }, { product: "buy", surface: "buy_page" });
  track(us, "near_me_zip", { zip: "94105" }, { product: "buy", surface: "buy_page" });
  track(us, "feedback_sent", {}, { product: "site", surface: "api" });
  const de = geoReq({ "x-vercel-ip-country": "DE", "x-vercel-ip-city": "Berlin" });
  track(de, "search_run", { query_text: "x", answer_type: "range", latency_ms: 5 }, { product: "buy", surface: "buy_page" });
  track(geoReq({}), "search_run", { query_text: "x", answer_type: "range", latency_ms: 5 }, { product: "buy", surface: "buy_page" });
  await trackDrain();
  const g = rows.slice(b0);
  ok(g[0].props.geo_country === "US" && g[0].props.geo_region === "CA" && g[0].props.geo_city === "San Francisco", "an open-region search carries country, state and city name");
  ok(g[1].props.geo_country === "US" && g[1].props.zip === "94105", "near_me_zip carries the zip and the coarse place");
  ok(!Object.keys(g[2].props).some(k => /^geo_/.test(k)), "other events carry no geo");
  ok(!JSON.stringify(g).includes("37.77") && !JSON.stringify(g).includes("-122.41"), "latitude and longitude are never stored");
  ok(!Object.keys(g[3].props).some(k => /^geo_/.test(k)) && g[3].region_class === "restricted", "a restricted-region visitor has no place at all");
  ok(!Object.keys(g[4].props).some(k => /^geo_/.test(k)), "a request with no geo header has none");
  ok(g[0].device_class === "mobile" || /phone|mobile/i.test(String(g[0].device_class)), "device class is stored on every event (" + g[0].device_class + ")");
  const mk = (anon, dev, geo) => ({ ts: at(1), product: "buy", anon_id: anon, session_id: "s" + anon, ref_domain: null, utm_source: null, utm_medium: null, device_class: dev, props: geo || {} });
  const W = build({ pv: [mk("a", "mobile", { geo_country: "US", geo_region: "CA" }), mk("b", "desktop", { geo_country: "US", geo_region: "TX" }), mk("c", "mobile", { geo_country: "US", geo_region: "CA" }), mk("d", "desktop", {})],
    ev: [{ ...run("buy", "a", 2, "range", {}), device_class: "mobile", props: { answer_type: "range", query_text: "q", latency_ms: 1, geo_country: "US", geo_region: "CA" } },
      { ts: at(3), name: "near_me_zip", product: "buy", anon_id: "a", session_id: "sa", props: { zip: "94105", geo_country: "US" } }, { ts: at(4), name: "near_me_zip", product: "buy", anon_id: "c", session_id: "sc", props: { zip: "94105", geo_country: "US" } }, { ts: at(5), name: "near_me_zip", product: "buy", anon_id: "b", session_id: "sb", props: { zip: "78701", geo_country: "US" } }],
    mc: [], out: [], ocd: [], held: [] }, { from: at(0), to: at(60), key: "today" }).where;
  ok(W.countries[0].k === "US" && W.countries[0].visitors === 3 && W.countries[0].searches === 1 && W.no_place_page_views === 1, "by country: 3 visitors, 1 search, 1 page view with no place");
  ok(W.states[0].k === "CA" && W.states[0].visitors === 2 && W.states[0].searches === 1 && W.states[1].k === "TX", "by US state: California 2 visitors, 1 search; Texas next");
  const bd = W.devices.find(x => x.product === "buy").rows; ok(bd.find(x => x.k === "mobile").visitors === 2 && bd.find(x => x.k === "desktop").visitors === 2, "device split per product counts each visitor once");
  ok(W.zips[0].zip === "94105" && W.zips[0].times === 2 && W.zips[0].visitors === 2 && W.zips[1].zip === "78701", "zips typed for near me, most often first");
}

// ---- 8. Searches and Users, server side (round 2, stages 3 to 5): the reads, with fetch stubbed
{
  const { searchesPanel, usersPanel, userJourney } = await imp("lib/admin/people.js");
  const realFetch = globalThis.fetch, urls = [];
  const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
  globalThis.fetch = async (url, init) => {
    const u = String(url); urls.push(u);
    const j = body => ({ ok: true, json: async () => body });
    if (u.includes("/accounts?user_id=in.")) return j([{ user_id: U1, email: "someone@example.com" }]);
    if (u.includes("/accounts?select=")) return j([{ user_id: U1, email: "someone@example.com", created_at: "2026-10-20T00:00:00Z", marketing_consent: false }, { user_id: U2, email: "Sam@Example.com", created_at: "2026-10-21T00:00:00Z", marketing_consent: true }]);
    if (u.includes("name=eq.page_view")) return j([{ anon_id: "AAAA", ref_domain: "google.com", utm_source: null }, { anon_id: "AAAA", ref_domain: "later.example", utm_source: null }]);
    if (u.includes("name=eq.search_run")) return j([{ ts: "2026-10-29T15:00:00Z", product: "buy", anon_id: "AAAA", user_id: U1, device_class: "mobile", internal: false, props: { query_text: "porsche 911", answer_type: "not_enough_data", vehicle_key: "porsche|911", latency_ms: 1234, cache: "cold", geo_region: "CA" } }]);
    if (u.includes("user_id=not.is.null")) return j([
      { ts: "2026-10-22T00:00:00Z", name: "page_view", user_id: U1, ref_domain: "google.com", utm_source: null, props: {} }, { ts: "2026-10-23T00:00:00Z", name: "signin", user_id: U1, props: { method: "google", newsletter: true } },
      { ts: "2026-10-24T00:00:00Z", name: "search_run", user_id: U1, props: {} }, { ts: "2026-10-24T01:00:00Z", name: "task_created", user_id: U1, props: {} }, { ts: "2026-10-24T02:00:00Z", name: "auction_clickout", user_id: U1, props: {} },
      { ts: "2026-10-25T00:00:00Z", name: "search_run", user_id: U2, props: {} }]);
    return j([]);
  };
  try {
    const env = { supabaseUrl: "https://x.test", supabaseKey: "k" };
    const sp = await searchesPanel(env, { from: "2026-10-29T14:00:00Z", to: "2026-10-30T14:00:00Z", product: "buy", outcome: "thin", text: "por*sche,(x)", crew: false, limit: 999999 });
    const su = urls.find(x => x.includes("name=eq.search_run"));
    ok(/internal=eq\.false/.test(su) && /is_bot=eq\.false/.test(su) && /product=eq\.buy/.test(su) && /answer_type=in\.\(not_enough_data\)/.test(su) && /ilike\.\*por%20sche%20x\*/.test(su.replace(/%20+/g, "%20")) && /order=ts\.desc/.test(su), "Searches: crew off leaves internal out, bots always out, product and outcome and text filters sent, newest first");
    ok(sp.limit === 5000, "Searches: a limit above 5,000 is held to 5,000 rows (" + sp.limit + ")");
    ok(sp.rows.length === 1 && sp.rows[0].outcome === "thin" && sp.rows[0].seconds === 1.2 && sp.rows[0].person === "someone@example.com" && sp.rows[0].source === "google.com" && sp.rows[0].state === "CA" && sp.rows[0].car === "porsche 911", "Searches: row shows outcome, seconds, state, the account email, and the first page of the visit as its source");
    ok(!("vin" in sp.rows[0]), "Searches: no VIN column");
    urls.length = 0; await searchesPanel(env, { from: "a", to: "b", crew: true });
    ok(!/internal=eq\.false/.test(urls.find(x => x.includes("name=eq.search_run"))) && /is_bot=eq\.false/.test(urls.find(x => x.includes("name=eq.search_run"))), "Searches: crew on drops the internal filter and keeps bots out");
    const off = await usersPanel(env, { crew: false, adminEmail: e => /^sam@example\.com$/i.test(e) });
    ok(off.rows.length === 1 && off.rows[0].email === "someone@example.com" && off.rows[0].searches === 1 && off.rows[0].tasks === 1 && off.rows[0].clickouts === 1 && off.rows[0].method === "google" && off.rows[0].newsletter === true && off.rows[0].first_source === "google.com", "Users: counts, sign-in method, newsletter and first source per account; an admin account is left out");
    const on = await usersPanel(env, { crew: true, adminEmail: e => /^sam@example\.com$/i.test(e) });
    ok(on.rows.length === 2 && on.total === 2, "Users: crew on brings the admin account in");
    ok(urls.some(x => /name=in\.\(page_view,search_run,task_created,auction_clickout,live_car_clicked,signin\)/.test(x)) && !urls.some(x => /select=[^&]*\bvin\b/.test(x)), "Users: reads only the listed event names and never the VIN column");
    urls.length = 0; const uj = await userJourney(env, U1);
    ok(urls.some(x => x.includes("user_id=eq." + U1)) && uj.events.every(e => e.user_id === "signed in" || e.user_id == null), "User journey: reads one account's events and never returns the user id");
    const bad = await userJourney(env, "not-a-uuid'); drop"); ok(bad.events.length === 0, "User journey: a malformed id reads nothing");
  } finally { globalThis.fetch = realFetch; }
}

// ---- Held back panel and the Market Check cap email (Lane D, Oct 26 2026)
{
  const hb = await imp("lib/admin/heldBack.js");
  const now = Date.parse("2026-10-26T20:30:00Z");   // 1:30 PM Pacific
  const mk = (min, id, product = "market_check", props = { limit: "device_day_cars", scope: "market_check_search" }) => ({ ts: new Date(now - min * 60000).toISOString(), product, anon_id: id, props });
  const rowsHB = [mk(5, "a1a1a1a1a1a1a1a1a1a1a1"), mk(6, "a1a1a1a1a1a1a1a1a1a1a1"), mk(10, "b2b2b2b2b2b2b2b2b2b2b2"), mk(20, null), mk(30, "c3c3c3c3c3c3c3c3c3c3c3"),
    mk(40, "d4d4d4d4d4d4d4d4d4d4d4"), mk(50, "e5e5e5e5e5e5e5e5e5e5e5"), mk(70, "f6f6f6f6f6f6f6f6f6f6f6"),
    mk(60 * 30, "g7g7g7g7g7g7g7g7g7g7g7", "buy", { limit: "buy_model_spend", scope: "buy_chat" }),   // yesterday
    mk(60 * 24 * 9, "h8h8h8h8h8h8h8h8h8h8h8")];                                                      // nine days ago, outside seven
  const p = hb.buildHeldBack(rowsHB, now);
  ok(p.today.hits === 8 && p.today.visitors === 6 && p.today.no_id === 1, "Held back: today counts hits, distinct visitors, and hits with no id apart (" + JSON.stringify(p.today) + ")");
  ok(p.week.hits === 9 && p.week.visitors === 7, "Held back: seven days leaves out a hit from nine days ago (" + JSON.stringify(p.week) + ")");
  ok(p.by_route[0].k === "market_check market_check_search" && p.by_route[0].today === 8 && p.by_route[0].week === 8 && p.by_route.some(r => r.k === "buy buy_chat" && r.today === 0 && r.week === 1), "Held back: by route, today and seven days");
  ok(p.by_limit.some(r => r.k === "device_day_cars" && r.week === 8) && p.by_limit.some(r => r.k === "buy_model_spend" && r.week === 1), "Held back: by limit");
  ok(p.busiest_today && /^2026-10-26 1[23]:00$/.test(p.busiest_today.hour) && p.busiest_today.hits >= 4, "Held back: busiest hour is a Pacific clock hour (" + JSON.stringify(p.busiest_today) + ")");
  ok(!/a1a1a1|b2b2b2|203\.0|@/.test(JSON.stringify(p)), "Held back: the panel returns counts only, no visitor id, address or email");
  // reads: bots out always, internal out unless crew, bounded by name and time
  const hurls = []; const rf = globalThis.fetch;
  globalThis.fetch = async u => { hurls.push(String(u)); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const henv = { supabaseUrl: "https://x.test", supabaseKey: "k" };
    await hb.readHeldBack(henv, { crew: false, now }); await hb.readHeldBack(henv, { crew: true, now });
    ok(/name=eq\.limit_hit/.test(hurls[0]) && /is_bot=eq\.false/.test(hurls[0]) && /internal=eq\.false/.test(hurls[0]) && /ts=gte\./.test(hurls[0]), "Held back: reads limit_hit only, bots and crew out, time bounded");
    ok(/is_bot=eq\.false/.test(hurls[1]) && !/internal=eq\.false/.test(hurls[1]), "Held back: the include-crew switch adds crew back, bots stay out");
  } finally { globalThis.fetch = rf; }
  // the alert
  ok(hb.marketCheckBurst(rowsHB, now) === 5, "Alert: counts different Market Check visitors in the last hour, not hits and not hits with no id (" + hb.marketCheckBurst(rowsHB, now) + ")");
  ok(hb.marketCheckBurst(rowsHB.filter(r => r.anon_id !== "e5e5e5e5e5e5e5e5e5e5e5"), now) === 4, "Alert: four visitors do not reach five");
  ok(hb.marketCheckBurst([mk(5, "z1z1z1z1z1z1z1z1z1z1z1", "buy", { limit: "buy_model_spend" })], now) === 0, "Alert: only the Market Check cap counts");
  const sent = []; let marked = 0, seenFlag = false;
  const send = async m => { sent.push(m); return { ok: true }; };
  const base = { rows: rowsHB, now, recipients: ["sam@example.com", "pat@example.com"], send, seen: async () => seenFlag, mark: async () => { marked++; } };
  const r1 = await hb.maybeSendHeldBackAlert(base);
  ok(r1.sent === true && sent.length === 2 && marked === 1 && sent.map(m => m.to).join() === "sam@example.com,pat@example.com", "Alert: five visitors send one email to each admin account and mark the hour");
  ok(sent.every(m => !/@|203\.0|a1a1a1|device_day/.test(m.subject + m.text + m.html)) && !/[\u2013\u2014]/.test(sent[0].subject + sent[0].text + sent[0].html), "Alert: subject and body are plain, hold no address or id, and no em or en dash");
  seenFlag = true; sent.length = 0;
  const r2 = await hb.maybeSendHeldBackAlert(base);
  ok(r2.sent === null && r2.already === true && sent.length === 0, "Alert: at most one an hour (a second inside the hour sends nothing)");
  seenFlag = false;
  const r3 = await hb.maybeSendHeldBackAlert({ ...base, rows: rowsHB.slice(2) });
  ok(r3.sent === null && sent.length === 0, "Alert: under five sends nothing");
  const r4 = await hb.maybeSendHeldBackAlert({ ...base, recipients: [] });
  ok(r4.sent === null && r4.skipped, "Alert: no ADMIN_EMAILS accounts sends nothing");
  ok(hb.adminRecipients("Sam@Example.com; pat@example.com ,sam@example.com") .join() === "sam@example.com,pat@example.com", "Alert: recipients come from ADMIN_EMAILS, lower-cased and once each");
  const src = fs.readFileSync(path.join(ROOT, "lib/admin/heldBack.js"), "utf8");
  ok(!/sk_|re_[A-Za-z0-9]{8}|Bearer /.test(src) && !/process\.env\.(?!ADMIN_EMAILS)/.test(src), "Alert: no key in code and no new environment setting (only ADMIN_EMAILS is read)");
  // cron: the hourly refresh runs the alert (no database here, so it must fail soft)
  const cr = await hb.runHeldBackAlert({ supabaseUrl: "https://127.0.0.1:9", supabaseKey: "k" });
  ok(cr && (cr.error || cr.visitors === 0), "Alert: the hourly run never throws when the read fails");
  const adminSrc = fs.readFileSync(path.join(ROOT, "api/admin.js"), "utf8");
  ok(/out\.held_back_alert = await runHeldBackAlert\(env\)/.test(adminSrc), "Alert: the hourly admin refresh runs it");
}
console.log(`launchDashCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
