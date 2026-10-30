// THE LAUNCH TAB'S STATUS STRIP AND READINESS BLOCKS (Lane D, Oct 28 2026, for launch morning). READ ONLY: it reads analytics_events, app_config and
// the stored-answer table's time stamps, counts them and returns plain numbers and words. It writes nothing, calls no engine, computes no product answer, and
// changes no stored answer.
//
// Rules this file keeps:
//   - A number that is not recorded says "not recorded" (null), never a guess. A read that fails is null, and a strip that could not read its numbers
//     never says GOOD: it says WATCH and names what it could not read.
//   - Bots are out of every number; crew and test traffic are out unless the tab's include-crew box is ticked (the same rule as the rest of the tab).
//   - Nothing personal leaves this file: counts, times and route names only.
//   - Each result is cached on this instance (60 seconds for the hour and day numbers, 5 minutes for the stored-answer times, which are the larger read).
import { finalRuns } from "./finalOutcome.js";
import { supabaseSelect, supabaseSelectAll } from "../_supabase.js";

const HOUR = 3600000, DAY = 24 * HOUR;
const enc = encodeURIComponent;

// THE THRESHOLDS. Every one is a number the page already records. They are stated in docs/lane-notes.md and are the only place they live.
// The cold median and 95th percentile limits sit above the recorded Market Check history (median about 3.9 s, 95th about 16.3 s, the One Box latency gate).
export const THRESHOLDS = {
  window_minutes: 60,
  act: { errors_5xx: 5, failed_searches: 3, failed_share: 0.2, still_reading: 10, still_reading_share: 0.5, busy_shown: 5, task_emails_failed: 3, cold_p95_ms: 30000 },
  watch: { errors_5xx: 1, failed_searches: 1, still_reading: 3, still_reading_share: 0.1, busy_shown: 1, limits_hit: 5, task_emails_failed: 1, cold_p50_ms: 8000, cold_p95_ms: 20000, last_warm_hours: 36 },
  min_cold_answers: 5,   // a cold median or 95th over fewer answers than this is shown but never moves the strip
};

// A search_run that ended "failed" is not always a breakage. These three end states are the limits doing their job (counted under limits hit, never a failure);
// "still_reading" is the honest answer for a car with no stored answer (it gets its own line). Everything else that failed is a real failure.
const LIMIT_STATES = new Set(["rate_limited", "daily_limit", "catching_breath"]);
const PRODUCTS = ["buy", "market_check", "sell"];
export const PRODUCT_WORDS = { buy: "Find", market_check: "Market Check", sell: "Sell" };
const P = e => (e && e.props) || {};
function pctile(sorted, p) { if (!sorted.length) return null; const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1)); return sorted[i]; }
const lat = list => { const s = list.map(e => Number(P(e).latency_ms)).filter(Number.isFinite).sort((a, b) => a - b); return { n: s.length, p50: pctile(s, 0.5), p95: pctile(s, 0.95) }; };

const PT = "America/Los_Angeles";
let dayFmt = null;
const dayKey = ts => { dayFmt = dayFmt || new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" }); return dayFmt.format(new Date(ts)); };

// ---- the numbers: rows of one 24 hour read -> the hour, the day, the capacity block. Pure.
// rows: analytics_events with ts, product, props, name. now: ms.
export function hourNumbers(rows, now = Date.now()) {
  const from = now - THRESHOLDS.window_minutes * 60000;
  const hr = rows.filter(e => Date.parse(e.ts) >= from);
  const by = (list, n) => list.filter(e => e.name === n);
  const runs = finalRuns(by(hr, "search_run")), served = runs.filter(e => P(e).answer_type !== "failed"), endedFailed = runs.filter(e => P(e).answer_type === "failed");
  const stillReading = endedFailed.filter(e => P(e).failure_state === "still_reading").length, heldByLimit = endedFailed.filter(e => LIMIT_STATES.has(P(e).failure_state)).length;
  const failed = endedFailed.length - stillReading - heldByLimit;
  const cold = lat(served.filter(e => P(e).cache === "cold"));
  const errors = by(hr, "error"), emails = by(hr, "task_match_sent");
  return {
    searches: runs.length, failed_searches: failed, still_reading: stillReading, stopped_by_limit: heldByLimit,
    errors_5xx: errors.filter(e => Number(P(e).status) >= 500).length,
    busy_shown: by(hr, "busy_shown").length,
    limits_hit: by(hr, "limit_hit").length,
    task_emails_sent: emails.reduce((s, e) => s + (Number(P(e).emails_sent) || 0), 0),
    task_emails_failed: emails.reduce((s, e) => s + (Number(P(e).failed) || 0), 0),
    cold_n: cold.n, cold_p50_ms: cold.p50, cold_p95_ms: cold.p95,
  };
}

export function capacityNumbers(rows, now = Date.now()) {
  const day = rows.filter(e => Date.parse(e.ts) >= now - DAY);
  const errs = day.filter(e => e.name === "error");
  const m = new Map();
  for (const e of errs) { const k = `${P(e).route || "?"} ${P(e).status || "?"}${P(e).code ? " " + P(e).code : ""}`; m.set(k, (m.get(k) || 0) + 1); }
  const served = day.filter(e => e.name === "search_run" && P(e).answer_type !== "failed");
  return {
    window: "the last 24 hours",
    errors_5xx: errs.filter(e => Number(P(e).status) >= 500).length,
    errors_504: errs.filter(e => Number(P(e).status) === 504).length,
    by_route: [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    slowest: PRODUCTS.map(p => ({ product: p, ...lat(served.filter(e => e.product === p)) })).filter(x => x.n > 0).sort((a, b) => (b.p95 || 0) - (a.p95 || 0)),
    limits_hit: day.filter(e => e.name === "limit_hit").length,
    // What the logs do not record, said plainly so a zero is never read as "fine".
    not_recorded: ["A function that Vercel stops at its time limit cannot log itself, so timeouts are read in Vercel Logs, not here.",
      "Database and rate limit headroom is not logged; the only trace is limits hit (above) and analytics writes lost (Cost and Reliability tab)."],
  };
}

// Feedback form messages today (Pacific day). A count only: the form's text goes to the inbox and is never stored. Replies to Task emails
// come back to the feedback inbox and nothing counts them, so they are "not recorded".
export function feedbackToday(rows, now = Date.now()) {
  const d = dayKey(now);
  return { form_messages: rows.filter(e => e.name === "feedback_sent" && dayKey(e.ts) === d).length, replies: null, tz: "Pacific" };
}

// ---- the strip. Pure. h: { hour (hourNumbers or null when the read failed), fresh ({last_warm_hours} or null) }.
// Returns { level: "GOOD"|"WATCH"|"ACT NOW", why, step, also: [..], thresholds }.
const s = n => (n === 1 ? "" : "s");
export function statusOf(h) {
  const T = THRESHOLDS, hr = h && h.hour, fr = h && h.fresh;
  const act = [], watch = [];
  if (!hr) {
    watch.push({ why: "The last hour of numbers could not be read just now, so this strip cannot say GOOD.", step: "Reload in a minute; if it stays, tell Lane C the Launch tab cannot read its numbers." });
  } else {
    const failShare = hr.searches ? hr.failed_searches / hr.searches : 0;
    if (hr.errors_5xx >= T.act.errors_5xx) act.push({ why: `${hr.errors_5xx} server errors (5xx) in the last hour.`, step: "Open Failures below, read the first line of Errors by route and status, and send Lane C that route and the time. Do not push anything." });
    if (hr.failed_searches >= T.act.failed_searches && failShare >= T.act.failed_share) act.push({ why: `${hr.failed_searches} of ${hr.searches} searches failed in the last hour.`, step: "Open Failures below, read Searches that failed, and send Lane C the product and the state." });
    if ((hr.still_reading || 0) >= T.act.still_reading && hr.searches && hr.still_reading / hr.searches >= T.act.still_reading_share) act.push({ why: `${hr.still_reading} of ${hr.searches} searches ended on "still reading" in the last hour (cars with no stored answer).`, step: "Open Unmet demand below, copy the car names, and send them to Lane C to warm." });
    if (hr.busy_shown >= T.act.busy_shown) act.push({ why: `The busy line was shown ${hr.busy_shown} times in the last hour.`, step: "Tell Lane C the busy line is showing. Do not change a limit." });
    if (hr.task_emails_failed >= T.act.task_emails_failed) act.push({ why: `${hr.task_emails_failed} Task emails failed in the last hour.`, step: "Open Cost and Reliability, read Task emails, and tell Lane C the count." });
    if (hr.cold_n >= T.min_cold_answers && hr.cold_p95_ms != null && hr.cold_p95_ms >= T.act.cold_p95_ms) act.push({ why: `Cold answers took ${(hr.cold_p95_ms / 1000).toFixed(1)} seconds at the 95th percentile in the last hour (${hr.cold_n} cold answers).`, step: "Open Speed below and tell Lane C which product is slow." });
    if (hr.errors_5xx >= T.watch.errors_5xx && hr.errors_5xx < T.act.errors_5xx) watch.push({ why: `${hr.errors_5xx} server error${s(hr.errors_5xx)} (5xx) in the last hour.` });
    if (hr.failed_searches >= T.watch.failed_searches && !act.some(a => /searches failed/.test(a.why))) watch.push({ why: `${hr.failed_searches} of ${hr.searches} searches failed in the last hour.` });
    if ((hr.still_reading || 0) >= T.watch.still_reading && hr.searches && hr.still_reading / hr.searches >= T.watch.still_reading_share && !act.some(a => /still reading/.test(a.why))) watch.push({ why: `${hr.still_reading} of ${hr.searches} searches ended on "still reading" in the last hour (cars with no stored answer).` });
    if (hr.busy_shown >= T.watch.busy_shown && hr.busy_shown < T.act.busy_shown) watch.push({ why: `The busy line was shown ${hr.busy_shown} time${s(hr.busy_shown)} in the last hour.` });
    if (hr.limits_hit >= T.watch.limits_hit) watch.push({ why: `${hr.limits_hit} daily or hourly limits were hit by real visitors in the last hour.` });
    if (hr.task_emails_failed >= T.watch.task_emails_failed && hr.task_emails_failed < T.act.task_emails_failed) watch.push({ why: `${hr.task_emails_failed} Task email${s(hr.task_emails_failed)} failed in the last hour.` });
    if (hr.cold_n >= T.min_cold_answers && hr.cold_p95_ms != null && hr.cold_p95_ms >= T.watch.cold_p95_ms && hr.cold_p95_ms < T.act.cold_p95_ms) watch.push({ why: `Cold answers took ${(hr.cold_p95_ms / 1000).toFixed(1)} seconds at the 95th percentile in the last hour.` });
    if (hr.cold_n >= T.min_cold_answers && hr.cold_p50_ms != null && hr.cold_p50_ms >= T.watch.cold_p50_ms) watch.push({ why: `The cold median is ${(hr.cold_p50_ms / 1000).toFixed(1)} seconds in the last hour.` });
  }
  if (fr && fr.last_warm_hours != null && fr.last_warm_hours > T.watch.last_warm_hours) watch.push({ why: `The newest stored answer is ${Math.round(fr.last_warm_hours)} hours old.` });
  if (act.length) { const first = act[0]; return { level: "ACT NOW", why: first.why, step: first.step, also: [...act.slice(1), ...watch].map(x => x.why), thresholds: T }; }
  if (watch.length) return { level: "WATCH", why: watch[0].why, step: watch[0].step || null, also: watch.slice(1).map(x => x.why), thresholds: T };
  return { level: "GOOD", why: hr.searches ? `${hr.searches} ${hr.searches === 1 ? "search" : "searches"} in the last hour, none failed, no server errors, no busy line.` : "No searches in the last hour, and nothing failed.", step: null, also: [], thresholds: T };
}

// ---- reads
const cache = new Map();
export const _resetHealthCache = () => cache.clear();   // for the check only
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 30) for (const k of cache.keys()) if (Date.now() - cache.get(k).at > 10 * 60000) cache.delete(k);
  return v;
}
const BASE = (from, crew) => `analytics_events?ts=gte.${enc(from)}&is_bot=eq.false${crew ? "" : "&internal=eq.false"}`;

// The last time each product answered a real search (a range answer, as the tab counts "real"), over the last 30 days. null = none in 30 days.
async function lastReal(env, crew, now) {
  const from = new Date(now - 30 * DAY).toISOString();
  const out = {};
  for (const p of PRODUCTS) {
    const r = await supabaseSelect(env, `${BASE(from, crew)}&name=eq.search_run&product=eq.${p}&props->>answer_type=eq.range&select=ts&order=ts.desc&limit=1`);
    out[p] = Array.isArray(r) ? { read: true, ts: r[0] ? r[0].ts : null } : { read: false, ts: null };
  }
  return out;
}

// How fresh the stored answers are: the sales epoch (app_config), the time of the newest stored answer (the last warm), and how many stored answers were
// not stored on today's UTC day (the launch warm rule, lib/warmDay.js). Counts stop at 1,000 and say so. Narrow columns only, no answer body is read.
async function freshness(env, now) {
  const out = { epoch: { read: false, at: null }, last_warm: { read: false, at: null, hours: null }, off_day: { read: false, market_check: null, buy_and_tasks: null, capped: false }, epoch_mismatch: { read: false, n: null, capped: false } };
  const epochRows = await supabaseSelect(env, "app_config?key=eq.sales_epoch&select=value");
  const epoch = Array.isArray(epochRows) && epochRows[0] ? String(epochRows[0].value || "").replace(/^"|"$/g, "") : null;
  if (Array.isArray(epochRows)) out.epoch = { read: true, at: epoch || null };
  const newest = await supabaseSelect(env, "spec_market_cache?select=computed_at&order=computed_at.desc&limit=1");
  if (Array.isArray(newest)) { const t = newest[0] ? Date.parse(newest[0].computed_at) : NaN; out.last_warm = { read: true, at: Number.isFinite(t) ? new Date(t).toISOString() : null, hours: Number.isFinite(t) ? Math.round((now - t) / 36e5 * 10) / 10 : null }; }
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const cut = enc(dayStart.toISOString());
  const mc = await supabaseSelect(env, `spec_market_cache?select=spec_key&computed_at=lt.${cut}&spec_key=like.MCWARM:*&limit=1001`);
  const core = await supabaseSelect(env, `spec_market_cache?select=spec_key&computed_at=lt.${cut}&spec_key=not.like.MCWARM:*&limit=1001`);
  if (Array.isArray(mc) && Array.isArray(core)) out.off_day = { read: true, market_check: Math.min(mc.length, 1000), buy_and_tasks: Math.min(core.length, 1000), capped: mc.length > 1000 || core.length > 1000 };
  if (epoch) {
    const mm = await supabaseSelect(env, `spec_market_cache?select=spec_key&spec_key=like.MCWARM:*&market->>warmEpoch=neq.${enc(epoch)}&limit=1001`);
    if (Array.isArray(mm)) out.epoch_mismatch = { read: true, n: Math.min(mm.length, 1000), capped: mm.length > 1000 };
  }
  return out;
}

export function healthUnread() {
  return { read: false, status: statusOf({ hour: null, fresh: null }), capacity: null, feedback: null, last_real: null, fresh: null };
}

export async function healthPanel(env, crew = false, now = Date.now()) {
  const key = crew ? "crew" : "visitors";
  const day = await cached("day|" + key, 60000, async () => {
    try {
      const rows = await supabaseSelectAll(env, `${BASE(new Date(now - DAY).toISOString(), crew)}&name=in.(search_run,error,busy_shown,limit_hit,task_match_sent,feedback_sent)&select=ts,name,product,anon_id,session_id,props&order=ts.asc`);
      return Array.isArray(rows) ? rows : null;
    } catch { return null; }
  });
  const fresh = await cached("fresh", 300000, async () => { try { return await freshness(env, now); } catch { return null; } });
  const lastRealV = await cached("last|" + key, 60000, async () => { try { return await lastReal(env, crew, now); } catch { return null; } });
  const hour = day ? hourNumbers(day, now) : null;
  const status = statusOf({ hour, fresh: fresh && fresh.last_warm && fresh.last_warm.read ? { last_warm_hours: fresh.last_warm.hours } : null });
  return { read: !!day, status, hour, capacity: day ? capacityNumbers(day, now) : null, feedback: day ? feedbackToday(day, now) : null, last_real: lastRealV, fresh, generatedAt: new Date(now).toISOString() };
}
