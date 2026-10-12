// Analytics layer checks (Oct 2026, Lane C; docs/analytics-events.md). No database, no network, no keys:
// the store is replaced by a sink (or by a closed local port for the store-down test).
//   node scripts/analyticsCheck.mjs            all checks, exit 1 on any failure
//   node scripts/analyticsCheck.mjs --journey  also print one sample journey (test data)
// Run by scripts/prePush.mjs.
import http from "node:http";

process.env.SUPABASE_URL = "http://127.0.0.1:9";   // nothing listens here: any real write fails fast
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
delete process.env.TRACK_STRICT;

const { EVENTS, validateEvent } = await import("../lib/track/catalog.js");
const { scrubText, uaClass, refDomain, pickUtm, pathTemplate } = await import("../lib/track/privacy.js");
const { identity, consentState } = await import("../lib/track/consent.js");
const log = await import("../lib/track/log.js");
const { ledgerEvents, isModelRow } = await import("../lib/track/ledger.js");
const { helperJs } = await import("../api/track.js");

let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else { fails++; console.log("FAIL  " + what); } };
const rows = [];
const useSink = () => { rows.length = 0; log.setTrackSink(r => rows.push(r)); };

function mkReq({ country = "US", cookie = "", ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", headers = {} } = {}) {
  return { method: "POST", query: {}, headers: { "x-vercel-ip-country": country, cookie, "user-agent": ua, "x-forwarded-for": "203.0.113.77", "x-real-ip": "203.0.113.77", host: "goasksam.com", ...headers } };
}
function mkRes() {
  const h = {};
  return { statusCode: 200, headers: h, setHeader(k, v) { h[k.toLowerCase()] = v; }, getHeader(k) { return h[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
}
const setCookies = res => [].concat(res.getHeader("set-cookie") || []);

// ---------------------------------------------------------------- 1. the catalog
{
  ok(!validateEvent("made_up", {}).ok, "unknown event is rejected");
  ok(!validateEvent("receipt_opened", { sale_id: "1", extra: 1 }).ok, "unknown field is rejected");
  ok(!validateEvent("receipt_opened", {}).ok, "missing required field is rejected");
  ok(validateEvent("receipt_opened", { sale_id: "bat-123" }).ok, "a valid event passes");
  ok(!validateEvent("search_run", { query_text: "x", answer_type: "range", latency_ms: 5 }, "browser").ok, "a server event cannot come from the browser");
  process.env.TRACK_STRICT = "1";
  let threw = false; try { log.track(mkReq(), "made_up", {}, { product: "buy" }); } catch { threw = true; }
  ok(threw, "tests: an unknown event throws");
  threw = false; try { log.track(mkReq(), "limit_hit", { limit: "x", nope: 1 }, { product: "buy" }); } catch { threw = true; }
  ok(threw, "tests: an unknown field throws");
  delete process.env.TRACK_STRICT;
  log.setTrackSink(null);
  const before = log.trackHealth().dropped_invalid;
  let quiet = true; try { log.track(mkReq(), "made_up", {}, { product: "buy" }); } catch { quiet = false; }
  ok(quiet && log.trackHealth().dropped_invalid === before + 1, "production: an unknown event is dropped and counted, never thrown");
  ok(validateEvent("page_hidden", { path: "/buy", seconds: 42 }, "browser").ok && !validateEvent("page_hidden", { path: "/buy" }, "browser").ok, "page_hidden needs path and seconds");
  ok(validateEvent("signin_started", {}, "browser").ok && validateEvent("code_requested", { resend: true }, "browser").ok && !validateEvent("code_requested", { email: "x" }, "browser").ok, "signin_started and code_requested take no address");
  const js = helperJs();
  ok(/page_hidden/.test(js) && /visibilitychange/.test(js) && /signin_started/.test(js) && /code_requested/.test(js), "browser helper sends page_hidden once per page view and knows the sign-in events");
  ok(!/search_run|model_call/.test(js) && /receipt_opened/.test(js) && /page_view/.test(js), "browser helper carries only browser events, built from the catalog");
  let parses = true; try { new Function(js); } catch { parses = false; }
  ok(parses, "browser helper parses");
}

// ---------------------------------------------------------------- 2. privacy helpers
{
  const s = scrubText("call me 415-555-0134 or jo@example.com about WP0AB0911JS120000, ref 123456789 " + "x".repeat(200));
  ok(!/415|555|0134|example\.com|jo@|123456789|WP0AB/.test(s.text) && s.vin === "WP0AB0911JS120000" && s.text.length <= 120, "free text: phone, email, digits and VIN scrubbed, cut to 120");
  ok(scrubText("1973 Porsche 911T coupe").text === "1973 Porsche 911T coupe", "free text: a normal search is unchanged");
  const u = uaClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
  ok(u.browser_family === "safari" && u.device_class === "mobile", "user agent: family and device class only");
  ok(uaClass("Mozilla/5.0 (compatible; Googlebot/2.1)").browser_family === "bot", "user agent: a crawler is a bot");
  ok(refDomain("https://www.google.com/search?q=porsche+911+price&client=x") === "google.com" && refDomain("https://goasksam.com/buy") === null, "referrer: domain only, own site dropped");
  const t = pickUtm("?utm_source=Newsletter&utm_medium=email&gclid=abc&email=a@b.co&launch_wave=w1&utm_campaign=oct");
  ok(t.utm_source === "newsletter" && t.launch_wave === "w1" && !("gclid" in t) && !("email" in t), "campaign fields: whitelist only");
  ok(pathTemplate("/history/WP0AB0911JS120000?x=1") === "/history/:id" && pathTemplate("/cars/porsche/911") === "/cars/porsche/911", "path: VIN segment and query removed");
}

// ---------------------------------------------------------------- 3. consent groups with simulated region headers
const groups = {
  "open (US, no cookie)": { country: "US", cookie: "" },
  "restricted + granted (DE)": { country: "DE", cookie: "gas_consent=granted" },
  "restricted + declined (FR)": { country: "FR", cookie: "gas_consent=declined; gas_aid=OLDanonOLDanonOLDanon; gas_sid=OLDsessOLDsessOLDsess; gas_vid=quota-device-id-123" },
  "restricted, no cookie (GB)": { country: "GB", cookie: "gas_vid=quota-device-id-456" },
};
const consentResults = {};
for (const [label, g] of Object.entries(groups)) {
  useSink();
  const req = mkReq(g), res = mkRes();
  const id = identity(req, res, { mint: true });
  const cookieReq = mkReq({ ...g, cookie: [g.cookie, ...setCookies(res).filter(c => !/Max-Age=0/.test(c)).map(c => c.split(";")[0])].filter(Boolean).join("; ") });
  log.trackFromBrowser(cookieReq, mkRes(), [
    { name: "page_view", product: "market_check", surface: "market_check_page", props: { path: "/market-check" } },
    { name: "receipt_opened", product: "market_check", surface: "market_check_page", props: { sale_id: "bat-1" } },
    { name: "refinement_applied", product: "market_check", surface: "market_check_page", props: { field: "tx", value: "manual" } },
  ], { ref: "https://www.google.com/search?q=x", utm: { utm_source: "news" } });
  log.track(cookieReq, "search_run", { query_text: "1987 911 carrera", answer_type: "range", latency_ms: 900 }, { product: "market_check", surface: "market_check_page" });
  log.track(cookieReq, "signin", {}, { product: "site", surface: "api", user_id: "11111111-1111-4111-8111-111111111111" });
  log.track(cookieReq, "limit_hit", { limit: "device_day" }, { product: "buy", surface: "api" });
  await log.trackDrain();
  const journey = rows.filter(r => !["search_run", "limit_hit"].includes(r.name));
  const ids = rows.filter(r => r.anon_id || r.session_id || r.user_id);
  consentResults[label] = { consent: id.consent, region: id.region_class, stored: rows.map(r => r.name), withIds: ids.length, journey: journey.length,
    cookiesSet: setCookies(res).map(c => c.split("=")[0] + (/Max-Age=0/.test(c) ? " (deleted)" : "")) };
  const declined = id.consent === "declined";
  if (declined) {
    ok(ids.length === 0, `${label}: no identifier on any stored event`);
    ok(journey.length === 0, `${label}: no journey events stored`);
    ok(rows.some(r => r.name === "search_run") && rows.some(r => r.name === "limit_hit"), `${label}: service events still stored`);
    ok(!setCookies(res).some(c => /^gas_(aid|sid)=[^;]/.test(c)), `${label}: no analytics cookie made`);
  } else {
    ok(rows.length === 6 && rows.every(r => r.anon_id && r.session_id), `${label}: all events stored with anon and session ids`);
  }
  ok(rows.every(r => !JSON.stringify(r).includes("quota-device-id")), `${label}: the quota device id is never in an event`);
  ok(rows.every(r => r.region_class === id.region_class && !/"(US|DE|FR|GB)"/.test(JSON.stringify(r))), `${label}: region class only, never the country`);
}
ok(consentResults["open (US, no cookie)"].consent === "not_required" && consentResults["restricted + granted (DE)"].consent === "granted"
  && consentResults["restricted + declined (FR)"].consent === "declined" && consentResults["restricted, no cookie (GB)"].consent === "declined", "consent states: open, granted, declined, missing cookie counts as declined");
ok(consentResults["restricted + declined (FR)"].cookiesSet.join(",") === "gas_aid (deleted),gas_sid (deleted)", "declined: existing analytics cookies are deleted");
ok(consentState(mkReq({ country: "US", cookie: "gas_consent=declined" })).consent === "declined", "an explicit decline is honoured in an open region");
ok(consentState(mkReq({ country: "US", headers: { "x-gas-region": "restricted" } })).consent === "declined", "x-gas-region: restricted makes an open visitor restricted (declined until they accept)");
ok(consentState(mkReq({ country: "DE", headers: { "x-gas-region": "open" } })).region_class === "restricted", "x-gas-region can never open a restricted visitor");
{
  const r = mkRes(); identity(mkReq(), r, { mint: true });
  const aid = setCookies(r).find(c => c.startsWith("gas_aid="));
  ok(/Max-Age=34128000/.test(aid) && /HttpOnly/.test(aid), "anon_id cookie: 13 months, HttpOnly");
  ok(!/203\.0\.113/.test(aid), "anon_id is not derived from the address");
}

// ---------------------------------------------------------------- 4. never stored
{
  useSink();
  const req = mkReq({ headers: { referer: "https://www.reddit.com/r/porsche/comments/abc/where_to_sell?utm_source=x" } });
  log.trackFromBrowser(req, mkRes(), [{ name: "page_view", product: "buy", surface: "buy_page", props: { path: "/history/WP0AB0911JS120000" } }],
    { ref: "https://www.reddit.com/r/porsche/comments/abc/my_name_is_jo?token=secret123", utm: { utm_source: "reddit", fbclid: "zzz" } });
  log.track(req, "search_run", { query_text: "email me at jo@example.com 4155550134 WP0AB0911JS120000", answer_type: "range", latency_ms: 3 }, { product: "buy", surface: "buy_page" });
  await log.trackDrain();
  const all = JSON.stringify(rows);
  const props = JSON.stringify(rows.map(r => ({ ...r, vin: undefined })));
  ok(!all.includes("203.0.113"), "the address is never stored");
  ok(!all.includes("Mozilla") && !all.includes("AppleWebKit"), "the full user agent is never stored");
  ok(!all.includes("/r/porsche") && !all.includes("token=") && !all.includes("secret123") && rows[0].ref_domain === "reddit.com", "the full referrer is never stored, the domain is");
  ok(!all.includes("fbclid") && !all.includes("zzz"), "only whitelisted campaign fields are stored");
  ok(!props.includes("jo@example.com") && !props.includes("4155550134") && !props.includes("WP0AB0911JS120000"), "unscrubbed free text and VINs never reach props");
  ok(rows.find(r => r.name === "search_run").vin === "WP0AB0911JS120000" && rows.find(r => r.name === "page_view").props.path === "/history/:id", "a VIN goes to its own column only");
}

// ---------------------------------------------------------------- 5. the store is down
{
  log.setTrackSink(null);
  const h0 = log.trackHealth();
  // A wrapped handler answers the same with the store down as with it up.
  const inner = async (req, res) => { log.track(req, "limit_hit", { limit: "x" }, { product: "buy" }); return res.status(200).json({ answer: 42 }); };
  const wrapped = log.withTracking("/api/test", inner, "buy");
  const t0 = Date.now(); const r1 = mkRes(); await wrapped(mkReq(), r1); const ms = Date.now() - t0;
  ok(r1.statusCode === 200 && r1.body.answer === 42 && ms < 50, `store down: the response is unchanged and immediate (${ms}ms)`);
  const failing = log.withTracking("/api/test", async (req, res) => res.status(503).json({ x: 1 }), "buy");
  const r2 = mkRes(); await failing(mkReq(), r2);
  ok(r2.statusCode === 503 && r2.body.x === 1, "store down: an error response is passed through untouched");
  // The real browser endpoint: 204 at once whatever the store does.
  const { default: trackHandler } = await import("../api/track.js");
  const r3 = mkRes(); const req3 = mkReq(); req3.body = { events: [{ name: "page_view", product: "site", surface: "home", props: { path: "/" } }] };
  const t1 = Date.now(); await trackHandler(req3, r3);
  ok(r3.statusCode === 204 && Date.now() - t1 < 50, "store down: /api/track still answers 204 at once");
  const t2 = Date.now(); await log.trackDrain(); const drainMs = Date.now() - t2;
  const h1 = log.trackHealth();
  ok(h1.write_failures > h0.write_failures && h1.events_lost > h0.events_lost, `store down: the failure counter goes up (${h1.write_failures - h0.write_failures} failed writes, ${h1.events_lost - h0.events_lost} events)`);
  ok(drainMs < 2000, `store down: a failed write gives up within the bound (${drainMs}ms)`);
  // A store that hangs: still bounded.
  const srv = http.createServer(() => {}); await new Promise(r => srv.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${srv.address().port}`;
  log.track(mkReq(), "limit_hit", { limit: "y" }, { product: "buy" });
  const t3 = Date.now(); await log.trackDrain(); const hangMs = Date.now() - t3;
  ok(hangMs >= 1400 && hangMs < 2500 && log.trackHealth().last_failure === "timeout", `store hangs: the write gives up at the 1.5 second bound (${hangMs}ms)`);
  // The queue is bounded: with three batches stuck in flight, at most 200 more wait, the rest are dropped and counted.
  const full0 = log.trackHealth().dropped_full;
  const t4 = Date.now();
  for (let i = 0; i < 700; i++) log.track(mkReq(), "limit_hit", { limit: "z" }, { product: "buy" });
  const burstMs = Date.now() - t4;
  ok(log.trackHealth().dropped_full - full0 === 200 && burstMs < 500, `the queue is bounded: 700 events in one burst, 300 in flight, 200 queued, ${log.trackHealth().dropped_full - full0} dropped and counted (${burstMs}ms)`);
  await log.trackDrain();
  srv.close(); process.env.SUPABASE_URL = "http://127.0.0.1:9";
}

// ---------------------------------------------------------------- 6. reconciliation: a day of test ledger traffic
{
  useSink();
  const ledger = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/rest/v1/app_usage_events")) { ledger.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    return realFetch(url, init);
  };
  const { recordUsageEvent } = await import("../api/_usage.js");
  const { anthropicCost } = await import("../api/_usage.js");
  const types = ["buy_chat_turn", "tasks_model_turn", "chat", "sell_followup_turn", "seller_decision", "pull_live_summary", "task_email_run"];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const t = types[Math.floor(rnd() * types.length)];
    const model = ["buy_chat_turn", "tasks_model_turn", "chat", "sell_followup_turn"].includes(t) && rnd() > 0.1;
    const u = model ? { input_tokens: Math.floor(rnd() * 5000), output_tokens: 1 + Math.floor(rnd() * 900), cache_read_input_tokens: rnd() > 0.5 ? Math.floor(rnd() * 3000) : 0 } : null;
    await recordUsageEvent({ event_type: t, route: t.startsWith("buy") ? "/buy#chat" : t.startsWith("tasks") ? "tasks" : "/sell", status: "ok",
      anthropic_input_tokens: u ? u.input_tokens : 0, anthropic_output_tokens: u ? u.output_tokens : 0, anthropic_cost_usd: u ? anthropicCost(u) : 0,
      oldcarsdata_metered_requests: 0, metadata: { cache_read: u ? u.cache_read_input_tokens : 0, sent: 2, matches: 3, endedBeforeSend: 1, failed: 0, newListings: 4, ended: 1, upserted: 9, ocdRequests: 5 } }, "http://ledger.test", "k");
  }
  await log.trackDrain();
  globalThis.fetch = realFetch;
  const ledgerModel = ledger.filter(isModelRow);
  const calls = rows.filter(r => r.name === "model_call");
  const sum = a => Math.round(a.reduce((n, x) => n + x, 0) * 1e6) / 1e6;
  const ledgerCost = sum(ledgerModel.map(r => Number(r.anthropic_cost_usd))), eventCost = sum(calls.map(r => r.props.cost_usd));
  const byProduct = {}; for (const c of calls) byProduct[c.product] = (byProduct[c.product] || 0) + 1;
  console.log(`reconcile (test day): ledger rows ${ledger.length}, model rows ${ledgerModel.length}, model_call events ${calls.length}; ledger cost $${ledgerCost}, event cost $${eventCost}; by product ${JSON.stringify(byProduct)}`);
  ok(calls.length === ledgerModel.length, "model_call count equals the ledger's model rows");
  ok(Math.abs(ledgerCost - eventCost) < 1e-6, "model_call cost equals the ledger's cost");
  ok(rows.filter(r => r.name === "pull_run").length === ledger.filter(r => r.event_type === "pull_live_summary").length, "pull_run count equals the pull report rows");
  ok(rows.filter(r => r.name === "task_match_sent").length === ledger.filter(r => r.event_type === "task_email_run").length, "task_match_sent count equals the Task email runs");
  ok(rows.filter(r => r.name === "model_call").every(r => r.anon_id === null && r.consent === "not_required"), "ledger events carry no visitor id");
}

// ---------------------------------------------------------------- 7. the dashboard gate
{
  process.env.ADMIN_EMAILS = "someone@example.com";
  const { default: admin } = await import("../api/admin.js");
  const g = mkRes(); await admin({ method: "GET", query: { page: "1" }, headers: {} }, g);
  ok(g.statusCode === 404 && /This page doesn/.test(g.body), "/admin answers 404 with the plain not-found page");
  ok(!/eyJ|service_role|SUPABASE_|sk-ant|ADMIN_EMAILS|someone@example/.test(g.body), "/admin page carries no key, no setting and no address");
  const p1 = mkRes(); await admin({ method: "POST", query: {}, headers: {}, body: { part: "overview" } }, p1);
  ok(p1.statusCode === 404, "data without a sign-in: 404");
  const p2 = mkRes(); await admin({ method: "POST", query: {}, headers: { authorization: "Bearer not-a-real-token" }, body: { part: "overview" } }, p2);
  ok(p2.statusCode === 404, "data with a bad token: 404");
  const c1 = mkRes(); await admin({ method: "GET", query: { refresh: "hour" }, headers: { authorization: "Bearer wrong" } }, c1);
  ok(c1.statusCode === 404, "summary refresh without the cron secret: 404");
}

// ---------------------------------------------------------------- 7. one sample journey (test data)
if (process.argv.includes("--journey")) {
  useSink();
  const res0 = mkRes(); identity(mkReq(), res0, { mint: true });
  const cookie = setCookies(res0).map(c => c.split(";")[0]).join("; ");
  const req = mkReq({ cookie });
  const base = Date.now() - 10 * 60000, at = (m, s) => new Date(base + (m * 60 + s) * 1000).toISOString();
  log.trackFromBrowser(req, mkRes(), [{ name: "page_view", product: "market_check", surface: "market_check_page", ts: at(0, 0), props: { path: "/market-check" } }], { ref: "https://www.google.com/", utm: {} });
  log.track(req, "search_run", { query_text: "1987 porsche 911 carrera", answer_type: "range", latency_ms: 3900, vehicle_key: "porsche|911", year: 1987, pool_size: 41, range_low: 74000, range_high: 98000, year_widened: false, fallback_rung: "exact_trim", model_used: false, cost_usd: 0 }, { product: "market_check", surface: "market_check_page", engine_version: "e17", ts: at(0, 40) });
  log.trackFromBrowser(req, mkRes(), [
    { name: "refinement_applied", product: "market_check", surface: "market_check_page", ts: at(1, 10), props: { field: "tx", value: "manual" } },
    { name: "receipt_opened", product: "market_check", surface: "market_check_page", ts: at(1, 40), props: { sale_id: "bat-88231" } },
    { name: "auction_clickout", product: "market_check", surface: "market_check_page", ts: at(2, 5), props: { platform: "bringatrailer", state: "sold" } },
    { name: "page_view", product: "buy", surface: "buy_page", ts: at(3, 0), props: { path: "/buy" } }], null);
  log.track(req, "search_run", { query_text: "porsche 911 manual", answer_type: "range", latency_ms: 1200, vehicle_key: "porsche|911", result_count: 12, live_count: 12, model_used: false, cost_usd: 0 }, { product: "buy", surface: "buy_page", ts: at(3, 20) });
  await log.trackDrain();
  console.log("\nSAMPLE JOURNEY (TEST DATA, made by this script, not a real visitor)");
  for (const r of rows) console.log(`  ${r.ts.slice(11, 19)}  ${r.product.padEnd(12)} ${r.name.padEnd(18)} ${JSON.stringify(r.props)}  [${r.region_class}, ${r.consent}, ${r.browser_family}/${r.device_class}${r.ref_domain ? ", from " + r.ref_domain : ""}]`);
  console.log(`  anon_id ${rows[0].anon_id.slice(0, 4)}... (random), session ${rows[0].session_id.slice(0, 4)}..., user_id ${rows[0].user_id}`);
}

log.setTrackSink(null);
console.log("\nCONSENT GROUPS");
for (const [k, v] of Object.entries(consentResults)) console.log(`  ${k.padEnd(28)} consent=${v.consent.padEnd(12)} stored=${v.stored.length} journey=${v.journey} with ids=${v.withIds} cookies: ${v.cookiesSet.join(", ") || "none"}`);
console.log(`\nanalyticsCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
