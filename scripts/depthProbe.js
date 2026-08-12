// Depth probe (K) CLI: a REPORT-ONLY coverage census across OldCarsData platforms.
// The census core lives in lib/ops/depthProbe.js (shared with the web trigger,
// api/usageDashboard.js ?view=ops&task=probe). This CLI owns arg parsing, the
// budget read, the coverage table, the report file and the usage event. It NEVER
// writes to sales_archive or classifications; only /auctions is metered.
//
//   node scripts/depthProbe.js                          launch sources, windows 45/90/180
//   node scripts/depthProbe.js --windows=45,90,180,365  add a wider window
//   node scripts/depthProbe.js --sources=mbmarket,autohunter
//   node scripts/depthProbe.js --all-sources            every integrated + candidate slug
//   node scripts/depthProbe.js --max-requests=250       hard request ceiling
//   node scripts/depthProbe.js --dry-run                print the plan, call nothing
//   node scripts/depthProbe.js --no-log                 do not write the usage event
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (budget read + usage event) and
// OLDCARSDATA_API_KEY. DO NOT RUN until Sam says go: run it first after the plan
// refill, before the warming job.
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { runDepthProbe, ALL, INTEGRATED, CANDIDATE, LAUNCH_SOURCES, MARKET_BUCKETS } from "../lib/ops/depthProbe.js";

const args = process.argv.slice(2);
const flag = n => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const has = n => args.includes(`--${n}`);
const WINDOWS = (flag("windows") ? flag("windows").split(",") : ["45", "90", "180"]).map(Number).filter(n => n > 0).sort((a, b) => a - b);
const SOURCES = flag("sources") ? flag("sources").split(",").map(s => s.trim()).filter(Boolean)
  : has("all-sources") ? Object.keys(ALL) : LAUNCH_SOURCES.slice();
const MAX_REQUESTS = Number(flag("max-requests") || process.env.DEPTH_PROBE_MAX_REQUESTS || 600);
const PAGE_LIMIT = Number(flag("page-limit") || 50);
const DRY_RUN = has("dry-run");
const NO_LOG = has("no-log");
const REPORT_FILE = new URL("./depth-probe-report.json", import.meta.url).pathname;
const OCD_DAILY_REQUEST_BUDGET = Number(process.env.OCD_DAILY_REQUEST_BUDGET || 33);

const env = supabaseEnv();
const apiKey = process.env.OLDCARSDATA_API_KEY;

async function meteredToday() {
  if (!env) return null;
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const rows = await supabaseSelect(env, `app_usage_events?created_at=gte.${since.toISOString()}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=2000`);
  if (!rows) return null;
  return rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0);
}

console.log(`Depth probe: ${SOURCES.length} platform(s), windows ${WINDOWS.join("/")}d, market buckets ${MARKET_BUCKETS.join("/")}.`);
console.log(`Ceiling: ${MAX_REQUESTS} metered request(s); daily budget ${OCD_DAILY_REQUEST_BUDGET}. Report -> ${REPORT_FILE}`);
console.log(SOURCES.map(s => `${ALL[s] || s} (${s})${INTEGRATED[s] ? "" : CANDIDATE[s] ? " [candidate]" : " [custom]"}`).join(", "));
if (DRY_RUN) { console.log("\n--dry-run: no OCD calls made."); process.exit(0); }
if (!apiKey) { console.error("Need OLDCARSDATA_API_KEY."); process.exit(1); }
if (!env) console.warn("WARNING: no Supabase env - budget guard is BLIND (cannot read today's spend). Proceeding under --max-requests only.");

const startedTodaySpend = await meteredToday();
if (startedTodaySpend === null && env) console.warn("WARNING: app_usage_events unreadable - budget guard is BLIND. Proceeding under --max-requests only.");
const budgetLeft = startedTodaySpend === null ? Infinity : Math.max(0, OCD_DAILY_REQUEST_BUDGET - startedTodaySpend);
if (budgetLeft <= 0) { console.error(`OCD daily budget already spent (${startedTodaySpend}/${OCD_DAILY_REQUEST_BUDGET}).`); process.exit(0); }

const report = await runDepthProbe({
  apiKey, sources: SOURCES, windows: WINDOWS, maxRequests: Math.min(MAX_REQUESTS, budgetLeft === Infinity ? MAX_REQUESTS : budgetLeft),
  pageLimit: PAGE_LIMIT, budgetLeft, log: msg => process.stderr.write(msg + "\n")
});
report.dailyBudget = OCD_DAILY_REQUEST_BUDGET;
report.spentBeforeRun = startedTodaySpend;

// ---- coverage table --------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`\n=== COVERAGE: platform x market x window (sold counts, last ${report.widestDays}d census) ===`);
const head = `${pad("PLATFORM", 22)}${pad("MARKET", 8)}${WINDOWS.map(w => padL(w + "d", 8)).join("")}`;
console.log(head); console.log("-".repeat(head.length));
for (const s of report.sources) {
  let printedAny = false;
  for (const mk of MARKET_BUCKETS) {
    const cells = WINDOWS.map(w => s.counts[mk][w]);
    if (cells.every(c => c === 0)) continue;
    console.log(`${pad(s.label + (s.integrated ? "" : "*"), 22)}${pad(mk, 8)}${cells.map(c => padL(c, 8)).join("")}`);
    printedAny = true;
  }
  if (!printedAny) console.log(`${pad(s.label + (s.integrated ? "" : "*"), 22)}${pad("-", 8)}${WINDOWS.map(() => padL(s.sawData ? 0 : "n/a", 8)).join("")}  ${s.note || ""}`);
}
console.log("\n* = not integrated yet (candidate). n/a = slug returned no data.");
console.log(`\n=== UK POOL (last ${report.widestDays}d, sold) ===`);
console.log(report.ukPool.length ? report.ukPool.map(x => `  ${x.label}${x.integrated ? "" : "*"}: ${x.uk}`).join("\n") : "  none found");

try { fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2)); console.log(`\nReport written: ${REPORT_FILE}`); }
catch (e) { console.error("report write failed:", e.message); }

if (!NO_LOG && env && report.meteredRequests > 0) {
  try {
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({
      event_type: "depth_probe", route: "scripts/depthProbe.js", status: "ok",
      oldcarsdata_metered_requests: report.meteredRequests, duration_ms: 0,
      metadata: { windows: WINDOWS, sources: SOURCES.length, ukPlatforms: report.ukPool.length }
    }, env.supabaseUrl, env.supabaseKey);
    console.log(`Logged depth_probe usage event (${report.meteredRequests} metered request(s)).`);
  } catch (e) { console.error("usage-event log failed (non-fatal):", e.message); }
}
console.log(`\nDONE. ${report.meteredRequests} metered OCD request(s). No archive writes.`);
