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
// The monthly reserve: never spend the account's monthly quota down past this many requests.
// Read from OCD's OWN x-ratelimit-remaining header (a MONTHLY figure that resets ~25th), NOT from
// our daily count. This is a separate, header-driven guard from the daily cap above.
const OCD_MONTHLY_RESERVE = Number(process.env.OCD_MONTHLY_RESERVE || 100);
const FLUSH_EVERY = 100;   // write a running total to app_usage_events every N requests (crash-safe)

// ---------- per-process usage/guard state ----------
let usageCtx = { supabaseUrl: process.env.SUPABASE_URL || null, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null, job: "ocd" };
let stateDay = null;         // UTC day the counters below belong to
let seedToday = 0;           // metered /auctions already recorded in app_usage_events earlier today
let seeded = false;
let runCount = 0;            // /auctions HTTP requests THIS process made today (incl 429 retries)
let flushedCount = 0;        // of runCount, how much has been written to app_usage_events
let lastRemaining = null;    // most recent x-ratelimit-remaining (MONTHLY quota remaining)
let lastLimit = null;        // most recent x-ratelimit-limit
let headerSeen = false;      // have we read a usable remaining header yet this process?
let headerUnreadable = false;// did the LAST metered response come back without a usable remaining?
let lastEndpoint = null;     // the metered path shape of the most recent call (for per-endpoint attribution)

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
function rollDayIfNeeded() {
  const day = utcDay();
  if (stateDay !== day) { stateDay = day; seedToday = 0; seeded = false; runCount = 0; flushedCount = 0; }
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
  // Count ONLY the authoritative ocd_call rows (one per OCD request, written by maybeFlush below).
  // Other event_types (seller_decision, data_unavailable, ...) also carry a metered figure for cost
  // reporting; summing them too DOUBLE-COUNTED the same requests. ocd_call is the single source of truth.
  const t = await sumMetered(`created_at=gte.${dayStart}&event_type=eq.ocd_call&oldcarsdata_metered_requests=gt.0`);
  if (t != null) seedToday = t;   // DB unreadable -> stays 0, cap still enforced via runCount
}

// Today's usage is ONLY what WE recorded today: the DB seed for this UTC day plus this process's
// in-process counter. The x-ratelimit header is a MONTHLY remaining and is NEVER read as today's
// count (treating it that way was the 8713/2500 false-cap bug: month-to-date usage read as "today").
function effectiveUsedToday() {
  return seedToday + runCount;
}

// Separate monthly guard, read from OCD's OWN x-ratelimit-remaining header. Returns an error message
// when this request must be refused, else null. Fails CLOSED: before the first metered call of the
// process there is no header yet, so that one call is allowed to establish it; after that a response
// with no usable remaining, or a remaining this request would push below the reserve, aborts.
function monthlyGuardError() {
  if (!headerSeen && !headerUnreadable) return null;   // no header yet: allow the one call that reads it
  if (headerUnreadable || lastRemaining == null || Number.isNaN(lastRemaining)) {
    return `OCD monthly guard is blind: x-ratelimit-remaining was missing or unreadable on the last metered response. Failing closed (reserve ${OCD_MONTHLY_RESERVE}).`;
  }
  if (lastRemaining - 1 < OCD_MONTHLY_RESERVE) {
    return `OCD monthly reserve reached: ${lastRemaining} requests remaining this month, reserve is ${OCD_MONTHLY_RESERVE}. The monthly quota resets ~25th; wait for the reset or lower OCD_MONTHLY_RESERVE deliberately.`;
  }
  return null;
}

// Single source of truth for OCD request accounting: EVERY metered call writes one `ocd_call` row the
// moment it is made (no 100-request batching), carrying the INCREMENT since the last write. So the DB
// SUM of ocd_call rows equals the true request count for EVERY caller - including small runs and any
// caller (e.g. the engine) that never calls flushOcdUsage. flushedCount advances ONLY on a successful
// write, so a failed write is retried on the next call and nothing is lost. The job is stamped in
// metadata (attribution) but the event_type is always ocd_call so the guard + meter never double-count
// a caller's own cost-reporting event. FLUSH_EVERY is retained only as a no-op compatibility constant.
async function maybeFlush(final = false) {
  const pending = runCount - flushedCount;
  if (pending <= 0) return;
  const target = runCount;
  try {
    await recordUsageEvent({
      event_type: "ocd_call", route: usageCtx.job, status: final ? "final" : "progress",
      oldcarsdata_metered_requests: pending, metadata: { job: usageCtx.job, endpoint: lastEndpoint, run_total: runCount, day: stateDay }
    }, usageCtx.supabaseUrl, usageCtx.supabaseKey);
    flushedCount = target;   // advance ONLY on success; a failed write stays pending and is retried
  } catch { /* recording is best-effort; the increment stays pending and is retried next call / on flush */ }
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
  // rl is null only when there was NO HTTP response at all (e.g. a network error). That is not the
  // same as "the server answered without the header": a transient network failure must not latch the
  // monthly guard into blind-fail-closed forever, so we leave headerUnreadable untouched here.
  if (!rl) return;
  if (rl.limit != null && rl.limit !== "") { const n = Number(rl.limit); if (!Number.isNaN(n)) lastLimit = n; }
  if (rl.remaining != null && rl.remaining !== "") {
    const n = Number(rl.remaining);
    if (!Number.isNaN(n)) { lastRemaining = n; headerSeen = true; headerUnreadable = false; return; }
  }
  // A metered response that carried no usable remaining: the monthly guard is now blind.
  headerUnreadable = true;
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
    // Daily cap check BEFORE the request, counted from OUR recorded usage only (DB seed for the UTC
    // day + this process's counter). Enforced from the in-process counter even when the DB seed
    // failed (fail closed): a blind DB never grants unlimited spend.
    if (effectiveUsedToday() >= OCD_DAILY_HARD_CAP) {
      const err = new Error(`OCD daily hard cap reached (${effectiveUsedToday()}/${OCD_DAILY_HARD_CAP} recorded on ${stateDay}). Set OCD_DAILY_HARD_CAP higher for a deliberate backfill.`);
      err.ocdHardCap = true;
      throw err;
    }
    // Monthly reserve guard, from OCD's own remaining header and independent of the daily cap.
    const monthlyErr = monthlyGuardError();
    if (monthlyErr) { const err = new Error(monthlyErr); err.ocdMonthlyGuard = true; throw err; }
    runCount++;   // this HTTP request is about to be made; count it even if it 429s (each retry re-enters here)
    lastEndpoint = String(path).replace(/\/\d+(?=\/|$)/g, "/:id").split("?")[0];   // /auctions, /auctions/live, /auctions/:id
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
