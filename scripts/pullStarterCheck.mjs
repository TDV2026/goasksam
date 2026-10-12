// Who started each pull (Oct 2026, Lane C): the started_by field on the pull job's rows and every ocd_call row, and the
// split in the pull report. No network, no vendor request: fetch is replaced by an in-memory table. Run by prePush.
//   node scripts/pullStarterCheck.mjs
process.env.SUPABASE_URL = "https://fixture.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
const rows = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (init.method === "POST" && /app_usage_events/.test(u)) { const b = JSON.parse(init.body); rows.push(...(Array.isArray(b) ? b : [b])); return new Response("", { status: 201 }); }
  if (/app_usage_events/.test(u)) return new Response(JSON.stringify(rows.map(r => ({ ...r, created_at: r.created_at || new Date(Date.now() - 60e3).toISOString() }))), { status: 200, headers: { "content-type": "application/json" } });
  if (/oldcarsdata|\/auctions/.test(u)) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining": "900" } });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const { startedBy } = await import("../api/pullLive.js");
const ocd = await import("../lib/_ocd.js");
const { pullReport } = await import("../lib/live/pullReport.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const req = (ua, q) => ({ headers: { "user-agent": ua }, query: q });

// 1. The starter of a call.
const s1 = startedBy(req("vercel-cron/1.0", { mode: "auto" }), true, false);
ok(s1.by === "scheduled" && s1.detail === "/api/pullLive?mode=auto", "the Vercel scheduler with the cron secret: scheduled");
const s2 = startedBy(req("node", { mode: "ending", "max-requests": "2", key: "SECRET-SHOULD-NOT-APPEAR" }), false, true);
ok(s2.by === "probe" && s2.detail === "/api/pullLive?mode=ending&max-requests=2", "a probe-key call: probe, with its endpoint");
ok(!JSON.stringify(s2).includes("SECRET"), "the key never lands in the endpoint");
const s3 = startedBy(req("curl/8", { mode: "auto" }), true, false);
ok(s3.by === "unknown" && /not from the scheduler/.test(s3.detail), "the cron secret from something else: unknown, never guessed");
const s4 = startedBy(req("", {}), false, false);
ok(s4.by === "unknown", "no credential recognised: unknown");
ok(["scheduled", "probe", "unknown"].every(v => [s1, s2, s3, s4].some(s => s.by === v)), "every value is one of the vocabulary");

// 2. ocd_call rows carry it, and a job that does not name its starter records unknown, never blank.
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
ocd.configureOcdUsage({ ...env, job: "pull_live", startedBy: "scheduled", startedDetail: "ending soonest 09:30 PDT" });
await ocd.callOldCarsData("/auctions/live", { page: 1, limit: 100 }, "fixture-key").catch(() => null);
await ocd.flushOcdUsage();
const c1 = rows.filter(r => r.event_type === "ocd_call").pop();
ok(c1 && c1.metadata.started_by === "scheduled" && c1.metadata.started_detail === "ending soonest 09:30 PDT", "ocd_call row: started_by scheduled with its slot");
ocd.configureOcdUsage({ ...env, job: "pull_live_bid" });
await ocd.callOldCarsData("/auctions/live", { page: 1, limit: 100 }, "fixture-key").catch(() => null);
await ocd.flushOcdUsage();
const c2 = rows.filter(r => r.event_type === "ocd_call").pop();
ok(c2 && c2 !== c1 && c2.metadata.started_by === "unknown" && !("started_detail" in c2.metadata), "a job that names no starter: unknown, never inherits the last one");

// 3. The report splits spend and runs by starter; a row without the field (written before it existed) is unknown.
rows.push({ event_type: "pull_live_summary", route: "pull_live", status: "ok", oldcarsdata_metered_requests: 0, metadata: { fetched: 2300, newListings: 2 } });
rows.push({ event_type: "ocd_call", route: "pull_live", status: "final", oldcarsdata_metered_requests: 23, metadata: { job: "pull_live" } });
rows.push({ event_type: "pull_live_mode", route: "pull_live", status: "ok", oldcarsdata_metered_requests: 0, metadata: { mode: "ending", pages: 3, started_by: "scheduled", started_detail: "ending soonest 09:30 PDT" } });
rows.push({ event_type: "pull_live_mode", route: "pull_live", status: "ok", oldcarsdata_metered_requests: 0, metadata: { mode: "ending", pages: 1, started_by: "probe", started_detail: "/api/pullLive?mode=ending" } });
rows.push({ event_type: "ocd_call", route: "pull_live", status: "final", oldcarsdata_metered_requests: 1, metadata: { job: "pull_live", started_by: "probe", started_detail: "/api/pullLive?mode=ending" } });
const rep = await pullReport(env, { from: Date.now() - 3600e3, to: Date.now() + 60e3 });
const sb = rep.startedBy || {};
ok(sb.unknown && sb.unknown.fullWalks === 1 && sb.unknown.requests >= 23, "report: the old walk without the field counts as unknown, with its requests");
ok(sb.probe && sb.probe.requests === 1 && sb.probe.endingSoonest === 1 && sb.probe.byDetail["/api/pullLive?mode=ending"] === 1, "report: the probe run and its request, by endpoint");
ok(sb.scheduled && sb.scheduled.endingSoonest === 1, "report: the scheduled run");
const total = Object.values(sb).reduce((k, b) => k + b.requests, 0);
ok(total === rep.requests.total, `report: the split adds up to the total (${total} = ${rep.requests.total})`);
console.log(`pullStarterCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
