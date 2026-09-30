// OldCarsData API client. /makes and /models are free; /auctions is metered.
//
// Hard daily cap + usage recording live HERE so every caller (scripts + api) is protected by the
// same guard and every real HTTP request is counted, including 429 retries (each retry re-enters
// callOldCarsData, so it is counted again). See docs/OCD_SPIKE report: a delta ingest re-walked all
// sources while the DB was blind and burned ~7,500 requests; this cap makes that impossible.
import { recordUsageEvent } from "../api/_usage.js";

export const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";

// Env-overridable so a deliberate backfill can raise it (OCD_DAILY_HARD_CAP=8000 node scripts/...).
const OCD_DAILY_HARD_CAP = Number(process.env.OCD_DAILY_HARD_CAP || 2500);
// OCD's monthly account quota, used with the x-ratelimit header as a third, DB-independent estimate
// of today's usage (item 7). The header's own limit wins when present.
const OCD_MONTHLY_ACCOUNT_LIMIT = Number(process.env.OCD_MONTHLY_ACCOUNT_LIMIT || 10000);
const FLUSH_EVERY = 100;   // write a running total to app_usage_events every N requests (crash-safe)

// ---------- per-process usage/guard state ----------
let usageCtx = { supabaseUrl: process.env.SUPABASE_URL || null, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null, job: "ocd" };
let stateDay = null;         // UTC day the counters below belong to
let seedToday = 0;           // metered /auctions already recorded in app_usage_events earlier today
let monthBeforeToday = null; // metered this month BEFORE today (baseline for the header estimate)
let seeded = false;
let runCount = 0;            // /auctions HTTP requests THIS process made today (incl 429 retries)
let flushedCount = 0;        // of runCount, how much has been written to app_usage_events
let lastRemaining = null;    // most recent x-ratelimit-remaining
let lastLimit = null;        // most recent x-ratelimit-limit

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
function rollDayIfNeeded() {
  const day = utcDay();
  if (stateDay !== day) { stateDay = day; seedToday = 0; monthBeforeToday = null; seeded = false; runCount = 0; flushedCount = 0; }
}

// A caller (a script) sets its job label + env so periodic/final usage rows are attributed to it.
export function configureOcdUsage(opts = {}) {
  if (opts.supabaseUrl) usageCtx.supabaseUrl = opts.supabaseUrl;
  if (opts.supabaseKey) usageCtx.supabaseKey = opts.supabaseKey;
  if (opts.job) usageCtx.job = String(opts.job);
}
export function getOcdRunMetered() { return runCount; }   // this process's total /auctions requests (incl retries)
export function getOcdDailyHardCap() { return OCD_DAILY_HARD_CAP; }

async function sumMetered(filter) {
  const { supabaseUrl, supabaseKey } = usageCtx;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/app_usage_events?${filter}&select=oldcarsdata_metered_requests&limit=100000`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0);
  } catch { return null; }
}
async function seedIfNeeded() {
  if (seeded) return;
  seeded = true;   // set BEFORE the reads so a failed read never re-hammers the DB and we still enforce in-process (fail closed)
  const dayStart = `${stateDay}T00:00:00.000Z`;
  const monthStart = `${stateDay.slice(0, 7)}-01T00:00:00.000Z`;
  const t = await sumMetered(`created_at=gte.${dayStart}&oldcarsdata_metered_requests=gt.0`);
  if (t != null) seedToday = t;   // DB unreadable -> stays 0, cap still enforced via runCount
  monthBeforeToday = await sumMetered(`created_at=gte.${monthStart}&created_at=lt.${dayStart}&oldcarsdata_metered_requests=gt.0`);
}

// Item 7: never trust one source. Today's usage = the HIGHER of (DB seed + this process) and the
// header-derived estimate (account limit - remaining - start-of-day baseline). Both undercount in
// different failure modes, so the max is the fail-closed number.
function effectiveUsedToday() {
  const viaCounter = seedToday + runCount;
  let viaHeader = -1;
  if (lastRemaining != null && monthBeforeToday != null) {
    const limit = (lastLimit != null && lastLimit > 0) ? lastLimit : OCD_MONTHLY_ACCOUNT_LIMIT;
    viaHeader = limit - lastRemaining - monthBeforeToday;
  }
  return Math.max(viaCounter, viaHeader);
}

// Crash-safe recording: each row carries the INCREMENT since the last write, so the DB SUM equals the
// run total even if the job is killed mid-run (the every-100 rows survive; flushOcdUsage writes the tail).
async function maybeFlush(final = false) {
  const pending = runCount - flushedCount;
  if (pending <= 0) return;
  if (!final && pending < FLUSH_EVERY) return;
  flushedCount = runCount;
  try {
    await recordUsageEvent({
      event_type: `job_${usageCtx.job}`, route: usageCtx.job, status: final ? "final" : "progress",
      oldcarsdata_metered_requests: pending, metadata: { phase: final ? "final" : "progress", run_total: runCount, day: stateDay }
    }, usageCtx.supabaseUrl, usageCtx.supabaseKey);
  } catch { /* recording is best-effort; never let it break a job */ }
}
export async function flushOcdUsage() { await maybeFlush(true); }

function readRateLimit(res) {
  const g = (...names) => { for (const n of names) { const v = res.headers.get(n); if (v != null && v !== "") return v; } return null; };
  return {
    remaining: g("x-ratelimit-remaining", "ratelimit-remaining", "x-rate-limit-remaining"),
    limit: g("x-ratelimit-limit", "ratelimit-limit", "x-rate-limit-limit"),
    reset: g("x-ratelimit-reset", "ratelimit-reset", "x-rate-limit-reset", "retry-after")
  };
}
function noteRateLimit(rl) {
  if (!rl) return;
  if (rl.remaining != null && rl.remaining !== "") lastRemaining = Number(rl.remaining);
  if (rl.limit != null && rl.limit !== "") lastLimit = Number(rl.limit);
}

export async function fetchJson(url, headers = {}, options = {}) {
  const res = await fetch(url, { headers, signal: options.signal });
  const rateLimit = readRateLimit(res);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${res.status}: ${json.message || json.error || "request failed"}`);
    err.status = res.status;
    err.rateLimited = res.status === 429;
    err.rateLimit = rateLimit;
    throw err;
  }
  try { Object.defineProperty(json, "__rateLimit", { value: rateLimit, enumerable: false }); } catch (e) {}
  return json;
}

export async function callOldCarsData(path, params, apiKey, options = {}) {
  const url = new URL(`${OLDCARSDATA_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const metered = String(path).startsWith("/auctions");   // /makes, /models are free and uncapped
  if (metered) {
    rollDayIfNeeded();
    await seedIfNeeded();
    // Cap check BEFORE the request. Enforced from the in-process counter even when the DB seed failed
    // (fail closed): a blind DB never grants unlimited spend.
    if (effectiveUsedToday() >= OCD_DAILY_HARD_CAP) {
      const err = new Error(`OCD daily hard cap reached (${effectiveUsedToday()}/${OCD_DAILY_HARD_CAP} on ${stateDay}). Set OCD_DAILY_HARD_CAP higher for a deliberate backfill.`);
      err.ocdHardCap = true;
      throw err;
    }
    runCount++;   // this HTTP request is about to be made; count it even if it 429s (each retry re-enters here)
  }
  try {
    const json = await fetchJson(url.toString(), { Authorization: `Bearer ${apiKey}` }, options);
    if (metered) { noteRateLimit(json.__rateLimit); await maybeFlush(false); }
    return json;
  } catch (e) {
    if (metered) { noteRateLimit(e && e.rateLimit); await maybeFlush(false); }
    throw e;
  }
}
