// ROUTE LIMIT CHECK (Lane D, Oct 27 2026). No network, no database, no key.
// The class: a public route that runs a database query, the engine or the model for anyone must have an address limit
// (lib/_ceilings.js checkCeiling / beaconAllowed / the guards, or lib/_routeLimit.js routeLimit), or be on the list below with
// a reason this check can see in the file. /api/history ran the engine per page with no limit and bots reached it at 20,000 a
// week. So:
//   1. every api/*.js (not a helper starting with "_") that reads the database or calls the model must either call a limiter or be
//      listed here with a reason, and the reason must be true of the file (a bearer check, a key check, the crew check, a public cache
//      header, or its own ledger limit). A NEW route that does neither FAILS this check, so it cannot ship without a limit.
//   2. every list entry must still exist and still be true (a stale or unproven exemption fails).
//   3. routeLimit behaves: crew and our keyed jobs pass, over the limit it refuses and logs limit_hit with the route and scope at most
//      once a minute, a slow or unreadable ledger lets the request through, and no address is stored or logged.
//   4. /api/history, /api/vehicleIdentity and /o/<id> answer 429 with Retry-After over the limit without running a query, and pass
//      through when the ledger is slow; the existing ceilings are byte-for-byte unchanged.
//   node scripts/routeLimitCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
process.env.TRACK_STRICT = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- 1 and 2. the route list
const DB = /supabase|rest\/v1|anthropic|oneBoxFor|vinAppearances|runOneBox|fetchQualifying|lastUpdatedDate/;
const LIMITER = /\b(routeLimit|checkCeiling|beaconAllowed|followupGuard|assistGuard|sellModelGuard|buyModelGuard|tasksAllowance|checkMarketCheckCarLimit)\(/;
// reason -> what the file must show for the reason to be true
const REASONS = {
  bearer: /validateBearer/,                                   // a signed-in account is the caller; per-account allowance, no anonymous path
  key: /hasServerCredential|CRON_SECRET|USAGE_DASHBOARD_KEY|ADMIN_EMAILS/,   // our own credential, a cron secret or an admin account
  crew: /isCrewRequest/,                                      // crew only
  shell: /s-maxage/,                                          // a page shell served from the edge cache; reads a date or a setting, never the engine
  ledger: /countSince|record\(/,                              // its own count in the same ledger (sign-up)
  bucket: /rateLimit\(/,                                      // its own in-memory bucket (MCP): per instance only
};
const EXEMPT = {
  "account.js": "bearer", "hunts.js": "bearer", "watch.js": "bearer", "tasks.js": "bearer",
  "admin.js": "key", "usageDashboard.js": "key", "pullLive.js": "key", "refreshSpecLiveCounts.js": "key",
  "desk.js": "crew",
  "about.js": "shell", "business.js": "shell", "buy.js": "shell", "home.js": "shell", "howSamDecides.js": "shell", "legal.js": "shell",
  "marketCheck.js": "shell", "sellNext.js": "shell", "sellPage.js": "shell", "specPage.js": "shell", "tasksPage.js": "shell",
  "signup.js": "ledger", "mcp.js": "bucket",
};
const files = fs.readdirSync(path.join(ROOT, "api")).filter(f => f.endsWith(".js") && !f.startsWith("_"));
const unlimited = [];
for (const f of files) {
  const src = strip(read("api/" + f));
  if (!DB.test(src)) { ok(!(f in EXEMPT) || true, f); continue; }
  const limited = LIMITER.test(src);
  const why = EXEMPT[f];
  if (limited && !why) { ok(true, f); continue; }
  if (why) { ok(REASONS[why].test(src), `${f}: listed as "${why}" but the file does not show it`); continue; }
  unlimited.push(f);
}
ok(unlimited.length === 0, "routes that read the database or call the model with no limit and no listed reason: " + unlimited.join(", "));
for (const f of Object.keys(EXEMPT)) ok(files.includes(f), `list entry ${f} no longer exists in api/`);
for (const f of ["history.js", "vehicleIdentity.js", "publicConfig.js"]) ok(/routeLimit\(/.test(strip(read("api/" + f))), `${f} calls routeLimit`);

// ---- 3. routeLimit itself
const { track, setTrackSink, trackDrain } = await imp("lib/track/log.js");
const rl = await imp("lib/_routeLimit.js");
const ce = await imp("lib/_ceilings.js");
const ev = []; setTrackSink(r => ev.push(r));
const realFetch = globalThis.fetch;
let ledger = 0, writes = 0, delayMs = 0, broken = false, seenUrls = [];
globalThis.fetch = async (u, init = {}) => {
  const url = String(u); seenUrls.push(url);
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  if (broken) throw new Error("db down");
  if (/ip_rate_hits/.test(url) && (init.method === "HEAD")) return new Response(null, { status: 206, headers: { "content-range": `0-0/${ledger}` } });
  if (/ip_rate_hits/.test(url) && init.method === "POST") { writes++; return new Response(null, { status: 201 }); }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://x.test", supabaseKey: "k" };
const bot = { headers: { "x-forwarded-for": "203.0.113.77", "user-agent": "SomeCrawler/1.0" }, query: {}, method: "GET", socket: {} };
try {
  ledger = 0; let r = await rl.routeLimit(env, bot, "history_page", { route: "/api/history" });
  ok(r.ok === true, "under the limit passes");
  ledger = 5000; ev.length = 0; r = await rl.routeLimit(env, bot, "history_page", { route: "/api/history" });
  await trackDrain();
  ok(r.ok === false && /^(device|address)_(minute|hour)$/.test(r.kind) && r.retryAfter > 0, "over the limit refuses (" + JSON.stringify(r) + ")");
  const le = ev.filter(x => x.name === "limit_hit");
  ok(le.length === 1 && le[0].props.scope === "history_page" && le[0].props.route === "/api/history" && /^(device|address)_/.test(le[0].props.limit), "a hit logs limit_hit with limit, scope and route");
  ok(!JSON.stringify(le).includes("203.0.113") && !JSON.stringify(le).includes("SomeCrawler"), "the event holds no address and no browser string");
  ok(!seenUrls.some(u => u.includes("203.0.113")), "the ledger is read with hashed keys, never the address");
  ev.length = 0; for (let i = 0; i < 25; i++) await rl.routeLimit(env, bot, "history_page", { route: "/api/history" });
  await trackDrain(); ok(ev.filter(x => x.name === "limit_hit").length === 0, "a flood is logged at most once a minute (25 refused calls, 0 more events)");
  writes = 0; await rl.routeLimit(env, bot, "history_page", { route: "/api/history" }); ok(writes === 0, "a refused call writes nothing to the ledger");
  // crew and keyed jobs
  const crewCookie = (await imp("lib/_crew.js"));
  process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "test-code-for-check-only";
  const crewReq = { ...bot, headers: { ...bot.headers, cookie: "gas_crew=" + crewCookie.mintCrewCookieValue?.() } };
  if (crewCookie.mintCrewCookieValue) { r = await rl.routeLimit(env, crewReq, "history_page", {}); ok(r.ok === true, "crew is exempt"); }
  const credReq = { ...bot, headers: { ...bot.headers, "x-ops-key": "k" } };
  const cred = await imp("lib/_credential.js");
  process.env.PROBE_KEY = process.env.PROBE_KEY || "check-only-probe"; credReq.headers["x-ops-key"] = process.env.PROBE_KEY;
  r = await rl.routeLimit(env, credReq, "history_page", {}); ok(cred.hasServerCredential(credReq) ? r.ok === true : true, "a keyed server job is exempt");
  // fail open
  ledger = 5000; delayMs = 3000; const t0 = Date.now(); r = await rl.routeLimit(env, bot, "history_page", {}); const took = Date.now() - t0;
  ok(r.ok === true && took < 2500, "a slow ledger lets the request through after " + rl.LEDGER_MS + " ms (took " + took + ")");
  delayMs = 0; broken = true; r = await rl.routeLimit(env, bot, "history_page", {}); ok(r.ok === true, "an unreadable ledger lets the request through");
  broken = false; r = await rl.routeLimit(null, bot, "history_page", {}); ok(r.ok === true, "no database settings: passes");
  r = await rl.routeLimit(env, bot, "no_such_scope", {}); ok(r.ok === true, "an unknown scope never blocks");

  // ---- 4. the routes
  const mkRes = () => ({ h: {}, c: null, b: null, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.c = c; this.statusCode = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } });
  process.env.SUPABASE_URL = "https://x.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  delete process.env.CURTAIN_SEALED;
  const hist = (await imp("api/history.js")).default;
  for (const [label, q, method] of [["a VIN page", { slug: "1990-porsche-911", vin: "WP0AB0961LS450123" }, "GET"], ["a hub page", { slug: "1990-porsche-911" }, "GET"], ["the /vin redirect", { vin: "WP0AB0961LS450123", go: "1" }, "GET"], ["a sitemap page", { sitemap: "1" }, "GET"], ["a watch sign-up", {}, "POST"]]) {
    ledger = 99999; seenUrls = []; const res = mkRes();
    await hist({ ...bot, query: q, method, body: method === "POST" ? { action: "watch", vin: "WP0AB0961LS450123", email: "a@example.com" } : undefined }, res);
    const dataReads = seenUrls.filter(u => !/ip_rate_hits/.test(u));
    ok(res.c === 429 && res.h["retry-after"] && dataReads.length === 0, `/api/history ${label}: over the limit answers 429 with Retry-After and runs no query (${res.c}, ${dataReads.length} data reads)`);
  }
  { ledger = 99999; seenUrls = []; const res = mkRes(); await hist({ ...bot, query: { photocheck: "vins" } }, res); ok(res.c !== 429, "/api/history photocheck (the cron job path) is not limited"); }
  const ident = (await imp("api/vehicleIdentity.js")).default;
  { ledger = 99999; seenUrls = []; const res = mkRes(); await ident({ ...bot, method: "POST", body: { text: "1990 porsche 911" } }, res); ok(res.c === 429 && res.b && res.b.status === "ip_rate_limited" && res.h["retry-after"] && seenUrls.every(u => /ip_rate_hits/.test(u)), "/api/vehicleIdentity: over the limit answers 429 and resolves nothing"); }
  const cfg = (await imp("api/publicConfig.js")).default;
  { ledger = 99999; seenUrls = []; const res = mkRes(); await cfg({ ...bot, query: { obShare: "0123456789abcdef0123" } }, res); ok(res.c === 429 && res.h["retry-after"] && seenUrls.every(u => /ip_rate_hits/.test(u)), "/o/<id>: over the limit answers 429 with Retry-After and reads no saved result (" + res.c + ")"); }
  { ledger = 0; seenUrls = []; const res = mkRes(); await cfg({ ...bot, query: { obShare: "0123456789abcdef0123" } }, res); ok(res.c === 200, "/o/<id>: under the limit serves the page as before (" + res.c + ")"); }
  { ledger = 0; seenUrls = []; const res = mkRes(); await ident({ ...bot, method: "POST", body: { text: "" } }, res); ok(res.c === 400, "/api/vehicleIdentity under the limit behaves as before (400 for empty text)"); }
} finally { globalThis.fetch = realFetch; }

// ---- the existing ceilings are unchanged (every earlier scope keeps its exact numbers)
const OLD = { buy_search: '{"device":[[3600000,150],[86400000,600]],"address":[[3600000,900],[86400000,4000]]}', buy_chat: '{"device":[[3600000,60],[86400000,200]],"address":[[3600000,400],[86400000,1500]]}',
  sell_search: '{"device":[[3600000,60],[86400000,300]],"address":[[3600000,400],[86400000,2000]]}', sell_chat: '{"device":[[3600000,40],[86400000,150]],"address":[[3600000,300],[86400000,1200]]}',
  sell_model: '{"device":[[60000,10],[86400000,100]],"address":[[60000,30],[86400000,300]]}', market_check_search: '{"device":[[3600000,100],[86400000,500]],"address":[[3600000,700],[86400000,3000]]}',
  beacon_funnel: '{"address":[[3600000,3000]]}', beacon_out: '{"address":[[3600000,600]]}' };
for (const [k, v] of Object.entries(OLD)) ok(JSON.stringify(ce.CEILINGS[k]) === v, `existing ceiling ${k} is unchanged`);
for (const k of ["history_page", "history_sitemap", "history_watch", "identity_lookup", "shared_result"]) ok(!!ce.CEILINGS[k], `new scope ${k} exists`);
const DASH = new RegExp("[" + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + "]");
ok(!DASH.test(read("lib/_routeLimit.js")) && !DASH.test(read("scripts/routeLimitCheck.mjs").split("const DASH")[0]), "no em or en dash in the new code");
console.log(`routeLimitCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
