// Depth probe (K): a REPORT-ONLY coverage census across every OldCarsData
// platform - the ones we already ingest AND the ones we do not integrate yet
// (PistonHeads, The Market, MB Market, Car & Classic, Collecting Cars, the
// auction houses). It answers three questions before we spend real budget on the
// nightly warm or an expansion decision:
//   1. UK pool reality   - how many UK-market sold records actually exist, and where.
//   2. Expansion pool     - which not-yet-integrated platforms carry real volume.
//   3. Warming list        - which platform x market x window cells are dense enough to warm.
//
// Output is a coverage table: platform x market x window (sold counts) plus a
// JSON report at scripts/depth-probe-report.json. It NEVER writes to the archive
// (sales_archive) or classifications - it only reads OCD and writes the report
// file (and, unless --no-log, a single depth_probe usage event so the budget
// meter stays honest for the warm/real searches that run after it).
//
// It RESPECTS THE BUDGET GUARD: it reads today's metered OCD spend from
// app_usage_events and stops before crossing OCD_DAILY_REQUEST_BUDGET, and it
// honours --max-requests as a hard ceiling. Metered endpoint is /auctions only.
//
//   node scripts/depthProbe.js                          full census, analysis windows 45/90/180
//   node scripts/depthProbe.js --windows=45,90,180,365  add a wider window
//   node scripts/depthProbe.js --sources=pistonheads,themarket
//   node scripts/depthProbe.js --max-requests=250       hard request ceiling
//   node scripts/depthProbe.js --dry-run                print the plan, call nothing
//   node scripts/depthProbe.js --no-log                 do not write the usage event
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for the budget read + usage
// event) and OLDCARSDATA_API_KEY. DO NOT RUN until Sam says go: run it first
// after the plan refill, before the warming job.
import fs from "node:fs";
import { callOldCarsData } from "../lib/_ocd.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

// ---- platform universe -----------------------------------------------------
// Integrated today (we ingest these). Slugs proven against OCD in lib/_ocd.js
// callers (ingest.js / pullSources.js).
const INTEGRATED = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty Marketplace",
  pcarmarket: "PCARMarket", acc: "All Collector Cars", gooding: "Gooding & Co",
  rmsothebys: "RM Sotheby's", sothebysmotorsport: "Sotheby's Motorsport", autohunter: "AutoHunter"
};
// Not integrated yet - candidate slugs. Slugs for these are BEST-GUESS: OCD has
// no sources-listing endpoint, so the run itself validates them. A slug that
// returns nothing (unknown or truly empty) is reported as "no data" rather than
// silently dropped, which is itself a coverage finding.
const CANDIDATE = {
  pistonheads: "PistonHeads", themarket: "The Market", mbmarket: "MB Market",
  carandclassic: "Car & Classic", collectingcars: "Collecting Cars", bonhams: "Bonhams",
  bonhamscars: "Bonhams Cars", mecum: "Mecum", barrettjackson: "Barrett-Jackson",
  silverstoneauctions: "Silverstone Auctions", historics: "Historics", classiccarauctions: "Classic Car Auctions",
  broadarrow: "Broad Arrow", artcurial: "Artcurial", bonhamsmph: "Bonhams | MPH"
};
const ALL = { ...INTEGRATED, ...CANDIDATE };

// ---- market classification -------------------------------------------------
// OCD /auctions has no country/market query param, so market is derived from the
// record. Read the first present of several candidate location fields and bucket
// it. Unknown stays Unknown (a finding, never guessed).
const MARKET_BUCKETS = ["US", "UK", "EU", "CA", "AU", "Other", "Unknown"];
const LOC_FIELDS = ["country", "listing_country", "seller_country", "auction_country", "location_country",
  "location", "seller_location", "region", "market", "sale_location"];
function marketOf(r) {
  let raw = "";
  for (const f of LOC_FIELDS) { const v = r && r[f]; if (v != null && String(v).trim()) { raw = String(v).trim(); break; } }
  const l = raw.toLowerCase();
  if (!l) return "Unknown";
  if (/\b(usa|u\.s\.a|united states|u\.s\.|\bus\b|america|american)\b/.test(l) || /,\s*[a-z]{2}\s*\d{5}/.test(l)) return "US";
  if (/\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|britain|british|gb)\b/.test(l)) return "UK";
  if (/\b(canada|canadian|ontario|quebec|alberta|british columbia)\b/.test(l)) return "CA";
  if (/\b(australia|australian|nsw|victoria|queensland|new zealand)\b/.test(l)) return "AU";
  if (/\b(germany|france|italy|spain|netherlands|belgium|switzerland|sweden|austria|portugal|ireland|denmark|norway|finland|poland|europe|european|monaco)\b/.test(l)) return "EU";
  // Bare 2-letter US state code (common OCD form for US listings).
  if (/^[a-z]{2}$/.test(l) && "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" ").includes(l)) return "US";
  return "Other";
}

// ---- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = n => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const has = n => args.includes(`--${n}`);
const WINDOWS = (flag("windows") ? flag("windows").split(",") : ["45", "90", "180"]).map(Number).filter(n => n > 0).sort((a, b) => a - b);
const WIDEST = WINDOWS[WINDOWS.length - 1];
const SOURCES = (flag("sources") ? flag("sources").split(",").map(s => s.trim()).filter(Boolean) : Object.keys(ALL));
const MAX_REQUESTS = Number(flag("max-requests") || process.env.DEPTH_PROBE_MAX_REQUESTS || 600);
const PAGE_LIMIT = Number(flag("page-limit") || 50);
const DRY_RUN = has("dry-run");
const NO_LOG = has("no-log");
const REPORT_FILE = new URL("./depth-probe-report.json", import.meta.url).pathname;

const OCD_DAILY_REQUEST_BUDGET = Number(process.env.OCD_DAILY_REQUEST_BUDGET || 33);

const env = supabaseEnv();
const apiKey = process.env.OLDCARSDATA_API_KEY;

// ---- budget read (respects the same guard sellerDecision enforces) ---------
async function meteredToday() {
  if (!env) return null;
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const rows = await supabaseSelect(env,
    `app_usage_events?created_at=gte.${since.toISOString()}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=2000`);
  if (!rows) return null; // unreadable -> caller treats as BLIND
  return rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0);
}

const toDate = v => { const d = new Date(v || ""); return Number.isFinite(d.getTime()) ? d : null; };
const daysAgo = n => new Date(Date.now() - n * 86400000);

// ---- plan ------------------------------------------------------------------
console.log(`Depth probe: ${SOURCES.length} platform(s), windows ${WINDOWS.join("/")}d, market buckets ${MARKET_BUCKETS.join("/")}.`);
console.log(`Ceiling: ${MAX_REQUESTS} metered request(s); daily budget ${OCD_DAILY_REQUEST_BUDGET}. Report -> ${REPORT_FILE}`);
console.log(SOURCES.map(s => `${ALL[s] || s} (${s})${INTEGRATED[s] ? "" : CANDIDATE[s] ? " [candidate]" : " [custom]"}`).join(", "));

if (DRY_RUN) { console.log("\n--dry-run: no OCD calls made."); process.exit(0); }
if (!apiKey) { console.error("Need OLDCARSDATA_API_KEY."); process.exit(1); }
if (!env) console.warn("WARNING: no Supabase env - budget guard is BLIND (cannot read today's spend). Proceeding under --max-requests only.");

const startedTodaySpend = await meteredToday();
if (startedTodaySpend === null && env) console.warn("WARNING: app_usage_events unreadable - budget guard is BLIND. Proceeding under --max-requests only.");
let budgetLeft = startedTodaySpend === null ? Infinity : Math.max(0, OCD_DAILY_REQUEST_BUDGET - startedTodaySpend);
if (budgetLeft <= 0) { console.error(`OCD daily budget already spent (${startedTodaySpend}/${OCD_DAILY_REQUEST_BUDGET}). Nothing to do; try again after reset.`); process.exit(0); }

// counts[source][market][window] = sold count; plus a per-source meta block.
const counts = {};
const meta = {};
let metered = 0;
const cutoff = daysAgo(WIDEST);

function stopBudget() {
  if (metered >= MAX_REQUESTS) return "max_requests";
  if (budgetLeft !== Infinity && metered >= budgetLeft) return "daily_budget";
  return null;
}

outer:
for (const source of SOURCES) {
  const label = ALL[source] || source;
  counts[source] = {}; MARKET_BUCKETS.forEach(m => { counts[source][m] = {}; WINDOWS.forEach(w => counts[source][m][w] = 0); });
  meta[source] = { label, integrated: !!INTEGRATED[source], totalSold: 0, pagesRead: 0, sawData: false, oldestSeen: null, note: null };

  for (let p = 1; p <= 10000; p++) {
    const reason = stopBudget();
    if (reason) { meta[source].note = `stopped: ${reason}`; console.log(`\n[budget] ${reason} reached at ${metered} request(s).`); break outer; }
    metered++;
    let res;
    try {
      res = await callOldCarsData("/auctions", { source, status: "sold", sort: "date", direction: "desc", page: p, limit: PAGE_LIMIT }, apiKey);
    } catch (e) {
      meta[source].note = `error p${p}: ${e.message}`;
      if (e.rateLimited) { console.error(`\n[ratelimit] ${label} p${p}: ${e.message} - stopping.`); break outer; }
      console.error(`\n${label} p${p} error: ${e.message}`);
      break;
    }
    const rows = res.data || [];
    if (!rows.length) break;
    meta[source].sawData = true; meta[source].pagesRead = p;
    let oldest = null;
    for (const r of rows) {
      const d = toDate(r.auction_end_date);
      if (d && (!oldest || d < oldest)) oldest = d;
      if (!d || d < cutoff) continue;                 // outside the widest window
      const mk = marketOf(r);
      meta[source].totalSold++;
      for (const w of WINDOWS) { if (d >= daysAgo(w)) counts[source][mk][w]++; }
    }
    if (oldest) meta[source].oldestSeen = (!meta[source].oldestSeen || oldest < new Date(meta[source].oldestSeen)) ? oldest.toISOString().slice(0, 10) : meta[source].oldestSeen;
    process.stderr.write(`\r${label} p${p}/${res.meta?.total_pages ?? "?"} sold-in-window ${meta[source].totalSold} reqs ${metered}   `);
    // Past the widest window (records are date-desc): the rest are older, stop.
    if (oldest && oldest < cutoff) break;
    if (p >= (res.meta?.total_pages || 1)) break;
  }
  process.stderr.write("\n");
  if (!meta[source].sawData) meta[source].note = meta[source].note || "no data (unknown slug or empty)";
  console.log(`${label}: ${meta[source].totalSold} sold in last ${WIDEST}d${meta[source].note ? ` (${meta[source].note})` : ""}`);
}

// ---- coverage table --------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`\n=== COVERAGE: platform x market x window (sold counts, last ${WIDEST}d census) ===`);
const head = `${pad("PLATFORM", 22)}${pad("MARKET", 8)}${WINDOWS.map(w => padL(w + "d", 8)).join("")}`;
console.log(head); console.log("-".repeat(head.length));
for (const source of SOURCES) {
  const m = meta[source];
  let printedAny = false;
  for (const mk of MARKET_BUCKETS) {
    const cells = WINDOWS.map(w => counts[source][mk][w]);
    if (cells.every(c => c === 0)) continue;
    console.log(`${pad(m.label + (m.integrated ? "" : "*"), 22)}${pad(mk, 8)}${cells.map(c => padL(c, 8)).join("")}`);
    printedAny = true;
  }
  if (!printedAny) console.log(`${pad(m.label + (m.integrated ? "" : "*"), 22)}${pad("-", 8)}${WINDOWS.map(() => padL(m.sawData ? 0 : "n/a", 8)).join("")}  ${m.note || ""}`);
}
console.log("\n* = not integrated yet (candidate). n/a = slug returned no data.");

// UK-pool headline (question 1): UK sold volume by platform at the widest window.
const ukByPlatform = SOURCES
  .map(s => ({ label: meta[s].label, integrated: meta[s].integrated, uk: counts[s].UK[WIDEST] }))
  .filter(x => x.uk > 0).sort((a, b) => b.uk - a.uk);
console.log(`\n=== UK POOL (last ${WIDEST}d, sold) ===`);
console.log(ukByPlatform.length ? ukByPlatform.map(x => `  ${x.label}${x.integrated ? "" : "*"}: ${x.uk}`).join("\n") : "  none found");

// ---- report file (NOT the archive) -----------------------------------------
const report = {
  generatedAt: new Date().toISOString(), windows: WINDOWS, widestDays: WIDEST, markets: MARKET_BUCKETS,
  meteredRequests: metered, dailyBudget: OCD_DAILY_REQUEST_BUDGET, spentBeforeRun: startedTodaySpend,
  sources: SOURCES.map(s => ({ source: s, ...meta[s], counts: counts[s] })),
  ukPool: ukByPlatform
};
try { fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2)); console.log(`\nReport written: ${REPORT_FILE}`); }
catch (e) { console.error("report write failed:", e.message); }

// ---- usage event so the guard stays honest (NOT the archive) ---------------
if (!NO_LOG && env && metered > 0) {
  try {
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({
      event_type: "depth_probe", route: "scripts/depthProbe.js", status: "ok",
      oldcarsdata_metered_requests: metered, duration_ms: 0,
      metadata: { windows: WINDOWS, sources: SOURCES.length, ukPlatforms: ukByPlatform.length }
    }, env.supabaseUrl, env.supabaseKey);
    console.log(`Logged depth_probe usage event (${metered} metered request(s)).`);
  } catch (e) { console.error("usage-event log failed (non-fatal):", e.message); }
}
console.log(`\nDONE. ${metered} metered OCD request(s). No archive writes.`);
