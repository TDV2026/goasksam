// LAUNCH TAB STATUS STRIP AND READINESS BLOCKS (Lane D, Oct 28 2026). No network, no database, no key.
//   1. statusOf: GOOD, WATCH or ACT NOW at exactly the thresholds in lib/admin/health.js THRESHOLDS; a first step only when there is something to do; a strip that could not read its numbers never says GOOD;
//   2. hourNumbers, capacityNumbers and feedbackToday count the right rows on a fixture (the last 60 minutes only, bots and failed searches out of the cold speed, the Pacific day);
//   3. the reads: bounded by time and event names, bots out, crew out unless ticked, a failed read is "not recorded" and never a zero;
//   4. THE CLASS: the strip is built only from numbers the analytics layer records (every field it reads is declared in lib/track/catalog.js), so a status can never rest on a guess;
//   5. the real /admin page in headless Chrome at 1440 and 390: the strip is the first thing on the Launch tab, one word, one sentence, the first step only for ACT NOW, "not recorded" where a number is missing,
//      nothing scrolls sideways.
//   node scripts/launchHealthCheck.mjs [--shots]     --shots writes docs/screens/launch/status-*.png
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const H = await imp("lib/admin/health.js");
const { statusOf, hourNumbers, capacityNumbers, feedbackToday, THRESHOLDS: T, _resetHealthCache } = H;
const hour = over => ({ searches: 40, failed_searches: 0, still_reading: 0, stopped_by_limit: 0, errors_5xx: 0, busy_shown: 0, limits_hit: 0, task_emails_sent: 4, task_emails_failed: 0, cold_n: 10, cold_p50_ms: 3900, cold_p95_ms: 16300, ...over });
const lv = (over, fresh = null) => statusOf({ hour: hour(over), fresh }).level;

// ---- 1. the strip
ok(lv({}) === "GOOD", "a quiet, healthy hour is GOOD");
{ const g = statusOf({ hour: hour({}), fresh: null }); ok(g.step === null && /40 searches/.test(g.why) && /none failed/.test(g.why), "GOOD has a sentence from the recorded count and no first step"); }
{ const g = statusOf({ hour: hour({ searches: 0, cold_n: 0, cold_p50_ms: null, cold_p95_ms: null }), fresh: null }); ok(g.level === "GOOD" && /No searches in the last hour/.test(g.why), "an hour with no searches says so, not a number it does not have"); }
ok(lv({ errors_5xx: 1 }) === "WATCH" && lv({ errors_5xx: T.act.errors_5xx - 1 }) === "WATCH" && lv({ errors_5xx: T.act.errors_5xx }) === "ACT NOW", "5xx: 1 is WATCH, " + T.act.errors_5xx + " is ACT NOW");
ok(lv({ failed_searches: 3, searches: 10 }) === "ACT NOW" && lv({ failed_searches: 3, searches: 40 }) === "WATCH" && lv({ failed_searches: 1 }) === "WATCH", "failed searches: 3 of 10 is ACT NOW, 3 of 40 (under 20 percent) is WATCH, one is WATCH");
ok(lv({ still_reading: 2, searches: 10 }) === "GOOD" && lv({ still_reading: 4, searches: 40 }) === "WATCH" && lv({ still_reading: 3, searches: 100 }) === "GOOD" && lv({ still_reading: 10, searches: 40 }) === "WATCH" && lv({ still_reading: 10, searches: 20 }) === "ACT NOW", "still reading (a car with no stored answer): 3 or more and at least 10 percent is WATCH, 10 and half of all searches is ACT NOW, never from a handful");
ok(lv({ stopped_by_limit: 500, searches: 600 }) === "GOOD", "searches stopped by a limit (rate_limited, daily_limit, catching_breath) are the protection working, never a failure");
ok(lv({ busy_shown: 1 }) === "WATCH" && lv({ busy_shown: 5 }) === "ACT NOW", "busy line: 1 WATCH, 5 ACT NOW");
ok(lv({ limits_hit: 4 }) === "GOOD" && lv({ limits_hit: 5 }) === "WATCH" && lv({ limits_hit: 500 }) === "WATCH", "limits hit: under 5 GOOD, 5 or more WATCH and never ACT NOW (a limit is the protection working)");
ok(lv({ task_emails_failed: 1 }) === "WATCH" && lv({ task_emails_failed: 3 }) === "ACT NOW", "Task emails failed: 1 WATCH, 3 ACT NOW");
ok(lv({ cold_p95_ms: 19999 }) === "GOOD" && lv({ cold_p95_ms: 20000 }) === "WATCH" && lv({ cold_p95_ms: 30000 }) === "ACT NOW", "cold 95th: 20 s WATCH, 30 s ACT NOW");
ok(lv({ cold_p50_ms: 8000 }) === "WATCH" && lv({ cold_p50_ms: 7999 }) === "GOOD", "cold median: 8 s WATCH");
ok(lv({ cold_n: 4, cold_p50_ms: 40000, cold_p95_ms: 60000 }) === "GOOD", "a slow cold speed over fewer than 5 answers is shown but never moves the strip");
ok(lv({}, { last_warm_hours: 36 }) === "GOOD" && lv({}, { last_warm_hours: 36.1 }) === "WATCH", "the newest stored answer older than 36 hours is WATCH");
ok(lv({}, { last_warm_hours: null }) === "GOOD", "a stored-answer time that is not recorded does not invent a status");
{ const u = statusOf({ hour: null, fresh: null }); ok(u.level === "WATCH" && /could not be read/.test(u.why) && u.step, "a strip that could not read its hour is WATCH with a step, never GOOD"); }
{ const a = statusOf({ hour: hour({ errors_5xx: 6, busy_shown: 5, task_emails_failed: 3 }) }); ok(a.level === "ACT NOW" && /6 server errors/.test(a.why) && /Errors by route/.test(a.step) && a.also.length === 2, "ACT NOW names the worst cause first, gives its first step and lists the others"); }
{ const all = JSON.stringify([statusOf({ hour: hour({ errors_5xx: 9, failed_searches: 9, busy_shown: 9, task_emails_failed: 9, limits_hit: 9, cold_p95_ms: 99999 }) }), statusOf({ hour: null }), statusOf({ hour: hour({}) })].map(x => ({ ...x, thresholds: null })));
  ok(!/[–—]/.test(all), "no em or en dash in any strip sentence"); }

// ---- 2. the numbers
const NOW = Date.parse("2026-10-29T14:30:00Z"), ago = m => new Date(NOW - m * 60000).toISOString();
const ev = (name, m, props = {}, product = "market_check") => ({ ts: ago(m), name, product, props });
const rows = [
  ev("search_run", 5, { answer_type: "range", latency_ms: 4000, cache: "cold" }), ev("search_run", 10, { answer_type: "range", latency_ms: 900, cache: "warm" }), ev("search_run", 15, { answer_type: "failed", latency_ms: 99999, cache: "cold" }), ev("search_run", 16, { answer_type: "failed", failure_state: "still_reading", latency_ms: 200 }), ev("search_run", 17, { answer_type: "failed", failure_state: "rate_limited", latency_ms: 100 }), ev("search_run", 18, { answer_type: "failed", failure_state: "daily_limit", latency_ms: 100 }),
  ev("search_run", 90, { answer_type: "range", latency_ms: 70000, cache: "cold" }),   // older than the hour
  ev("error", 3, { route: "/api/x", status: 503 }), ev("error", 4, { route: "/api/y", status: 404 }), ev("error", 200, { route: "/api/x", status: 504 }),
  ev("busy_shown", 2), ev("limit_hit", 2, { limit: "a" }), ev("task_match_sent", 20, { emails_sent: 3, failed: 1 }), ev("feedback_sent", 30), ev("feedback_sent", 60 * 20),
];
{ const h = hourNumbers(rows, NOW);
  ok(h.searches === 6 && h.failed_searches === 1 && h.still_reading === 1 && h.stopped_by_limit === 2 && h.errors_5xx === 1 && h.busy_shown === 1 && h.limits_hit === 1 && h.task_emails_sent === 3 && h.task_emails_failed === 1, "the hour counts only the last 60 minutes (6 searches: 1 failed, 1 still reading, 2 stopped by a limit; 1 five-hundred, 1 busy, 1 limit, 3 emails sent, 1 failed)");
  ok(h.cold_n === 1 && h.cold_p50_ms === 4000, "the cold speed leaves out the failed search and the one older than the hour"); }
{ const c = capacityNumbers(rows, NOW); ok(c.errors_5xx === 2 && c.errors_504 === 1 && c.by_route[0].n === 1 && c.slowest[0].product === "market_check" && c.not_recorded.length === 2 && c.not_recorded.every(t => /not logged|cannot log itself/.test(t)), "capacity: 24 hour 5xx and 504, slowest search, and what is not recorded is said"); }
{ const f = feedbackToday(rows, NOW); ok(f.form_messages === 1 && f.replies === null, "feedback today is the Pacific day (the message 20 hours ago is yesterday) and replies are not recorded"); }

// ---- 3. the reads
const { healthPanel } = H;
const env = { supabaseUrl: "https://example.supabase.co", supabaseKey: "k" };
const urls = []; const realFetch = globalThis.fetch;
const mock = (fail = []) => { globalThis.fetch = async (u, init) => { const url = String(u); urls.push(url); const body = (() => {
  if (fail.some(f => url.includes(f))) return null;
  if (url.includes("name=in.(search_run")) return JSON.stringify(rows.map(r => ({ ...r, ts: r.ts })));
  if (url.includes("app_config")) return JSON.stringify([{ value: "2026-10-29T10:00:00Z" }]);
  if (url.includes("order=computed_at.desc")) return JSON.stringify([{ computed_at: new Date(Date.now() - 5 * 36e5).toISOString() }]);
  if (url.includes("spec_market_cache")) return JSON.stringify(url.includes("not.like") ? [{ spec_key: "a" }, { spec_key: "b" }] : [{ spec_key: "c" }]);
  if (url.includes("props->>answer_type=eq.range")) return JSON.stringify([{ ts: ago(7) }]);
  return "[]"; })();
  return body === null ? { ok: false, status: 500, text: async () => "", json: async () => [], headers: { get: () => null } } : { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body), headers: { get: () => null } }; }; };
mock(); const full = await healthPanel(env, false, NOW);
ok(full.read && full.status.level && full.fresh.last_warm.read && full.fresh.off_day.market_check === 1 && full.fresh.off_day.buy_and_tasks === 2 && full.last_real.sell.read, "the panel reads the hour, the stored answers and the last real answer");
{ const q = urls.filter(u => u.includes("analytics_events")); ok(q.length >= 4 && q.every(u => /ts=gte\./.test(u) && /is_bot=eq\.false/.test(u) && /internal=eq\.false/.test(u)), "every analytics read is bounded by time, leaves bots out and leaves crew out by default (" + q.length + " reads)");
  ok(q.filter(u => /name=in\./.test(u)).every(u => /name=in\.\(search_run,error,busy_shown,limit_hit,task_match_sent,feedback_sent\)/.test(u)), "the hour read asks for named events only");
  ok(urls.filter(u => u.includes("spec_market_cache")).every(u => /select=(spec_key|computed_at)/.test(u) && !/select=\*|market\b[,&]/.test(u.replace(/market->>/g, ""))), "the stored-answer reads take time stamps and keys only, never an answer body"); }
urls.length = 0; globalThis.fetch = realFetch; _resetHealthCache(); mock(); await healthPanel(env, true, NOW + 1);
ok(urls.filter(u => u.includes("analytics_events")).every(u => /is_bot=eq\.false/.test(u) && !/internal=eq\.false/.test(u)) && urls.some(u => u.includes("analytics_events")), "with the include-crew box ticked crew traffic is read, bots still are not");
globalThis.fetch = realFetch; _resetHealthCache(); mock(["name=in.(search_run"]); const bad = await healthPanel(env, false, NOW + 2 * 61000);
ok(!bad.read && bad.status.level === "WATCH" && bad.hour === null && bad.capacity === null && bad.feedback === null, "when the hour read fails the strip is WATCH and every number from it is null (not recorded), never a zero");
globalThis.fetch = realFetch; _resetHealthCache(); mock(["spec_market_cache", "app_config"]); const nf = await healthPanel(env, false, NOW + 3 * 301000);
ok(nf.read && nf.fresh.last_warm.read === false && nf.fresh.last_warm.at === null && nf.fresh.off_day.read === false, "when the stored answers cannot be read the freshness block says not recorded and the strip does not call that fresh or stale");
globalThis.fetch = realFetch;

// ---- 3b. the sealed door: held visits are not errors, and the line that reads zero after the site opens is the last hour
{ const { build } = await imp("lib/admin/launch.js"); const nowMs = Date.now(), at = m => new Date(nowMs - m * 60000).toISOString();
  const mk = held => build({ pv: [], ev: [], mc: [], out: [], ocd: [], held }, { from: at(1440), to: at(-1), key: "today" }).failures.held;
  const closed = mk([{ ts: at(5), is_bot: true, props: { route: "/api/history" } }, { ts: at(20), is_bot: false, props: { route: "/" } }, { ts: at(300), is_bot: true, props: { route: "/api/history" } }]);
  ok(closed.total === 3 && closed.last_hour === 2 && closed.last_at === at(5), "sealed: the range total is 3, the last hour is 2, the last held visit is the newest one");
  const opened = mk([{ ts: at(90), is_bot: true, props: { route: "/api/history" } }, { ts: at(300), is_bot: true, props: { route: "/api/history" } }]);
  ok(opened.total === 2 && opened.last_hour === 0 && opened.read === true, "after the site opens: the range keeps its earlier hits but the last hour reads 0 by itself, with nothing to switch off");
  const none = mk([]); ok(none.total === 0 && none.last_hour === 0 && none.last_at === null, "no held visits at all: 0, and no last visit");
  const noRead = build({ pv: [], ev: [], mc: [], out: [], ocd: [], held: null }, { from: at(1440), to: at(-1), key: "today" }).failures.held; ok(noRead.read === false, "a held read that failed says it was not read, not zero");
  const flood = Array.from({ length: 500 }, (_, i) => ev("held_at_door", i % 50, { route: "/api/history", status: 503 }));
  ok(JSON.stringify(hourNumbers([...rows, ...flood], NOW)) === JSON.stringify(hourNumbers(rows, NOW)) && JSON.stringify(capacityNumbers([...rows, ...flood], NOW)) === JSON.stringify(capacityNumbers(rows, NOW)), "500 held visits change nothing in the strip's hour or in the capacity block: a held visit is never an error");
  const srcLaunch = fs.readFileSync(path.join(ROOT, "lib/admin/launch.js"), "utf8"), errLine = srcLaunch.split("\n").find(l => /errors: group\(errs/.test(l)) || "";
  ok(/errs = by\("error"\)/.test(srcLaunch) && !/held_at_door/.test(errLine), "the Errors lines read error events only, never held_at_door"); }

// ---- 4. the class: only recorded numbers
const { EVENTS } = await imp("lib/track/catalog.js");
const src = fs.readFileSync(path.join(ROOT, "lib/admin/health.js"), "utf8");
const used = { search_run: ["answer_type", "latency_ms", "cache", "failure_state"], error: ["route", "status", "code"], busy_shown: [], limit_hit: [], task_match_sent: ["emails_sent", "failed"], feedback_sent: [] };
const fieldsOf = n => { const e = EVENTS[n]; return e ? new Set([...Object.keys(e.req || {}), ...Object.keys(e.opt || {})]) : null; };
for (const [n, fl] of Object.entries(used)) { const f = fieldsOf(n); ok(!!f && fl.every(x => f.has(x)), `the strip reads ${n}${fl.length ? " (" + fl.join(", ") + ")" : ""}, and the catalog records ${f ? "all of it" : "no such event"}`); }
{ const names = [...src.matchAll(/by\(hr, "([a-z_]+)"\)/g)].map(m => m[1]).concat([...src.matchAll(/e\.name === "([a-z_]+)"/g)].map(m => m[1])); ok(names.length > 5 && names.every(n => EVENTS[n]), "every event name the health file reads is in the catalog (" + [...new Set(names)].join(", ") + ")"); }
{ const states = EVENTS.search_run.opt.failure_state, srcH = fs.readFileSync(path.join(ROOT, "lib/admin/health.js"), "utf8"); const named = new Set([...srcH.matchAll(/LIMIT_STATES = new Set\(\[([^\]]*)\]/g)].flatMap(m => m[1].match(/"[a-z_]+"/g) || []).map(x => x.replace(/"/g, "")).concat(srcH.includes('"still_reading"') ? ["still_reading"] : []));
  ok(Array.isArray(states) && states.every(x => named.has(x)), "every failure_state the catalog can record is classed by the strip (a limit, or still reading), so a new state cannot be silently counted as a failure or as nothing (" + states.join(", ") + ")"); }
ok(!/Math\.random|estimate|guess/i.test(src.replace(/^\s*\/\/.*$/gm, "").replace(/never a guess|not a guess/g, "")), "the health file has no random number and no estimate");
ok(!/\b(oneEngineAnswer|runOneBox|sellerDecision|oldcarsdata|fetchOCD)\b/i.test(src.replace(/^\s*\/\/.*$/gm, "")), "the health file calls no engine and no OldCarsData");
ok(!/supabaseInsert|method:\s*"(POST|PATCH|PUT|DELETE)"|\.insert\(|\.upsert\(/.test(src), "the health file writes nothing");

// ---- 5. the page
const admin = await imp("api/admin.js");
const g = { h: {}, c: null, b: null, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } };
await admin.default({ method: "GET", query: {}, headers: {} }, g);
ok(g.c === 404 && /healthStrip/.test(g.b) && /class="strip /.test(g.b.replace(/'/g, '"')), "GET /admin still answers 404 (noindex) and carries the strip");
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const st = (level, why, step, also = []) => ({ level, why, step, also, thresholds: T });
const fresh = { epoch: { read: true, at: "2026-10-29T10:00:00Z" }, last_warm: { read: true, at: "2026-10-29T09:12:00Z", hours: 5.3 }, off_day: { read: true, market_check: 0, buy_and_tasks: 12, capped: false }, epoch_mismatch: { read: true, n: 0, capped: false } };
const base = { read: true, hour: hour({}), capacity: capacityNumbers(rows, NOW), feedback: { form_messages: 2, replies: null, tz: "Pacific" }, last_real: { buy: { read: true, ts: "2026-10-29T14:20:00Z" }, market_check: { read: true, ts: "2026-10-29T14:25:00Z" }, sell: { read: true, ts: null } }, fresh };
const CASES = {
  good: { ...base, status: st("GOOD", "40 searches in the last hour, none failed, no server errors, no busy line.", null) },
  watch: { ...base, hour: hour({ errors_5xx: 2 }), status: st("WATCH", "2 server errors (5xx) in the last hour.", null, ["The busy line was shown 1 time in the last hour."]) },
  act: { ...base, hour: hour({ errors_5xx: 7, task_emails_failed: 5 }), status: st("ACT NOW", "7 server errors (5xx) in the last hour.", "Open Failures below, read the first line of Errors by route and status, and send Lane C that route and the time. Do not push anything.", ["5 Task emails failed in the last hour."]) },
  unread: { read: false, status: statusOf({ hour: null, fresh: null }), hour: null, capacity: null, feedback: null, last_real: null, fresh: null },
};
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
if (SHOTS) fs.mkdirSync(path.join(ROOT, "docs/screens/launch"), { recursive: true });
for (const [w, hgt, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) for (const [name, health] of Object.entries(CASES)) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on("request", rq => {
    if (rq.url().endsWith("/api/admin") && rq.method() === "POST") return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ before_launch: true, range: { key: "today", from: "2026-10-29T14:00:00Z", to: "2026-10-29T14:00:00Z" }, health, now: { minutes: 15, visitors: 0, answers: 0, failures: 0 }, held_back: { read: true, today: { hits: 0, visitors: 0, no_id: 0 }, week: { hits: 0, visitors: 0, no_id: 0 }, by_route: [], by_limit: [], busiest_today: null, busiest_week: null, tz: "Pacific" }, generatedAt: new Date().toISOString(), launchAt: "2026-10-29T14:00:00Z" }) });
    if (rq.url().startsWith("http://admin.test/")) return rq.respond({ status: 404, contentType: "text/html; charset=utf-8", body: g.b });
    return rq.abort();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 3000 })); });
  await page.goto("http://admin.test/admin", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#ad-body .strip"), { timeout: 8000 }).catch(() => {});
  const r = await page.evaluate(() => { const s = document.querySelector("#ad-body .strip"), body = document.getElementById("ad-body"), lr = document.querySelector(".lrange"); const br = s && s.getBoundingClientRect(); return { has: !!s, first: !!s && body.firstElementChild === s, lv: s && s.querySelector(".lv").textContent, text: s ? s.innerText : "", cls: s && s.className, beforeRange: !!s && !!lr && (s.compareDocumentPosition(lr) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, fits: !!s && br.left >= 0 && br.right <= innerWidth, sw: document.documentElement.scrollWidth, iw: innerWidth, all: document.body.innerText, fs: s ? parseFloat(getComputedStyle(s.querySelector("span")).fontSize) : 0 }; });
  const lvl = { good: "GOOD", watch: "WATCH", act: "ACT NOW", unread: "WATCH" }[name];
  ok(r.has && r.first && r.beforeRange, `${tag} ${name}: the strip is the first thing on the Launch tab, above the date buttons`);
  ok(r.lv === lvl, `${tag} ${name}: the strip says ${lvl} (${r.lv})`);
  ok(r.fits && r.sw <= r.iw, `${tag} ${name}: the strip fits and nothing scrolls sideways (${r.sw} of ${r.iw})`);
  ok(r.fs >= 14, `${tag} ${name}: the sentence is at least 14px`);
  ok((name === "act" || name === "unread") === /First step:/.test(r.text), `${tag} ${name}: a first step is written only when there is something to do`);
  ok(/Ready for launch/.test(r.all) && (name === "unread" || /Newest stored answer/.test(r.all)), `${tag} ${name}: the readiness blocks draw`);
  ok(!/\(\s*\)/.test(r.all), `${tag} ${name}: no empty brackets where a time has no age`);
  if (name === "good") ok(/Replies to Task emails\s*not recorded/.test(r.all) && /none in the last 30 days/.test(r.all) && /Feedback form messages\s*2/.test(r.all), `${tag}: replies are "not recorded", the product with no real answer says none in 30 days, feedback shows its count`);
  if (name === "unread") ok(/Not recorded: the stored answers could not be read/.test(r.all) && /Not recorded: the last 24 hours/.test(r.all), `${tag}: with nothing readable every block says not recorded and no zero is drawn`);
  if (SHOTS) await page.screenshot({ path: path.join(ROOT, `docs/screens/launch/status-${name}-${tag}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(hgt * 1.6, 1500) } });
  await page.close();
}
await b.close();
console.log(`launchHealthCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
