// FOR SALE: THE PULL'S OWN BUDGET (Lane D, lane-d-forsale, Nov 18 2026). The classifieds pull spends vendor queries from the SAME monthly plan as the auction feed; it has its own monthly budget and per run cap,
// both read from one config (data/forsaleBudget.json, default 0 = nothing is pulled), and it can never spend the auction feed's allowance (a hard reserve for auctions).
// Pure of reads: the caller passes what it measured (spentCycle from our usage table, remaining from the vendor's own header). Anything unknown fails CLOSED: no allowance.
import CONFIG from "../../data/forsaleBudget.json" with { type: "json" };

export const BUDGET = CONFIG;
const DAY = 86400e3;
const n0 = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };   // a missing, negative or unreadable number is 0: nothing to spend

// The billing cycle: from the reset day (UTC midnight) most recently passed to the next one.
export function cycleStart(now, resetDay = BUDGET.cycle_reset_day) {
  const d = new Date(now), day = Math.min(28, Math.max(1, n0(resetDay) || 25));
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (d.getUTCDate() < day) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return new Date(Date.UTC(y, m, day));
}
export function cycleEnd(now, resetDay = BUDGET.cycle_reset_day) { const s = cycleStart(now, resetDay); return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate())); }
export const daysLeft = (now, resetDay) => Math.max(0, (cycleEnd(now, resetDay).getTime() - now) / DAY);

// THE LIMITS: monthly cap for for sale (its own budget, never above plan minus the auction reserve), what is left of it, the room above the auction feed's reserve, the run cap.
// in: { cfg, spentCycle (our own count of for sale queries this cycle, or null when unreadable), remaining (the vendor's own count left this month, or null when unknown), now }
// out: { allowance, binding, limits:{ runCap, monthlyLeft, reserveRoom }, monthlyCap, reserveLeft, why }; allowance 0 means the pull makes no vendor query.
export function planRun({ cfg = BUDGET, spentCycle, remaining, now = Date.now() } = {}) {
  const plan = n0(cfg.plan_monthly), reserve = n0(cfg.auction_reserve_monthly), budget = n0(cfg.forsale_monthly_budget), runCap = n0(cfg.forsale_run_cap);
  const monthlyCap = Math.min(budget, Math.max(0, plan - reserve));
  const out = { allowance: 0, binding: null, monthlyCap, runCap, spentCycle: spentCycle == null ? null : n0(spentCycle), remaining: remaining == null ? null : n0(remaining), daysLeft: Math.round(daysLeft(now, cfg.cycle_reset_day) * 10) / 10, why: null };
  if (!(budget > 0) || !(runCap > 0)) { out.binding = "budget_zero"; out.why = "the for sale budget or the per run cap is 0 (the default): nothing is pulled until a person sets both in data/forsaleBudget.json"; return finish(out, 0, 0, 0); }
  if (!(plan > 0)) { out.binding = "plan_unknown"; out.why = "plan_monthly is not set"; return finish(out, 0, 0, runCap); }
  if (spentCycle == null) { out.binding = "spend_unreadable"; out.why = "our own count of this cycle's for sale queries could not be read, so no query is spent"; return finish(out, 0, 0, runCap); }
  if (remaining == null) { out.binding = "remaining_unknown"; out.why = "the vendor's own count of queries left this month is not known (no fresh reading), so the auction feed's reserve cannot be proved: no query is spent"; return finish(out, 0, 0, runCap); }
  const monthlyLeft = Math.max(0, monthlyCap - n0(spentCycle));
  const reserveLeft = Math.ceil(reserve * Math.min(1, daysLeft(now, cfg.cycle_reset_day) / 30));   // the exact days, not the rounded ones shown   // the auction feed still needs this much for the days left in the cycle
  const reserveRoom = Math.max(0, n0(remaining) - reserveLeft);
  out.reserveLeft = reserveLeft;
  return finish(out, monthlyLeft, reserveRoom, runCap);
}
function finish(out, monthlyLeft, reserveRoom, runCap) {
  out.limits = { runCap, monthlyLeft, reserveRoom };
  if (out.binding) { out.allowance = 0; return out; }
  const a = Math.min(runCap, monthlyLeft, reserveRoom);
  out.allowance = a;
  out.binding = a === reserveRoom ? "auction_reserve" : a === monthlyLeft ? "monthly_budget" : "run_cap";
  if (a <= 0) out.why = out.binding === "auction_reserve" ? "the vendor's remaining count is at or under what the auction feed is kept for the rest of the cycle" : "this cycle's for sale budget is spent";
  return out;
}

// What this cycle has cost, counted from our own usage table: every metered vendor call writes one ocd_call row stamped with its job (lib/_ocd.js). null when unreadable (the plan fails closed).
export async function spentThisCycle(env, now = Date.now(), job = "pull_for_sale", resetDay) {
  const since = cycleStart(now, resetDay).toISOString();
  try {
    const f = job ? `&metadata->>job=eq.${encodeURIComponent(job)}` : "";
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=eq.ocd_call&created_at=gte.${encodeURIComponent(since)}${f}&select=oldcarsdata_metered_requests&limit=100000`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows.reduce((s, x) => s + (Number(x.oldcarsdata_metered_requests) || 0), 0) : null;
  } catch { return null; }
}

// WHAT A WALK COSTS: the vendor gives 100 listings a page at most (openapi /classifieds limit maximum 100), a cursor and no count, so a source of n listings is ceil(n / 100) queries (at least 1). counts: { source: listings }.
export const callsFor = (counts, sources) => sources.reduce((s, k) => s + Math.max(1, Math.ceil((Number(counts[k]) || 0) / 100)), 0);

// THE VENDOR'S OWN FIGURES, as its response headers give them (x-ratelimit-limit: the plan, x-ratelimit-remaining, x-ratelimit-reset), kept in the one app_config row the live jobs already read (ocd_rate_limit, the same value shape /sell writes:
// { remaining, limit, reset, at }). The pull writes it after a run, so the next run's reserve check never waits on a visitor's search to refresh it.
export function figuresOf(rl) {
  if (!rl) return null;
  const num = v => (v != null && v !== "" && Number.isFinite(Number(v))) ? Number(v) : null;
  const remaining = num(rl.remaining); if (remaining === null) return null;
  return { remaining, limit: num(rl.limit), reset: rl.reset != null && rl.reset !== "" ? String(rl.reset) : null, at: Date.now() };
}
export async function persistFigures(env, rl) {
  const v = figuresOf(rl); if (!v) return false;
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?on_conflict=key`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: "ocd_rate_limit", value: v }]) });
    return r.ok;
  } catch { return false; }
}
// The figures as stored, for the report: the plan, what is left, the reset (the header's own value, and as a date when it reads as one), when they were read.
export async function readFigures(env, now = Date.now()) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=eq.ocd_rate_limit&select=value&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json(), raw = rows && rows[0] && rows[0].value; if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw, at = Number(v.at) || null, n = Number(v.reset);
    const ms = Number.isFinite(n) && n > 0 ? (n < 1e11 ? n * 1000 : n) : null;   // a header of unix seconds or milliseconds
    return { plan: Number.isFinite(Number(v.limit)) ? Number(v.limit) : null, remaining: Number.isFinite(Number(v.remaining)) ? Number(v.remaining) : null, reset: v.reset ?? null, resetAt: ms ? new Date(ms).toISOString() : null, readAt: at ? new Date(at).toISOString() : null, ageMinutes: at ? Math.round((now - at) / 60000) : null, fresh: !!(at && now - at < 6 * 3600e3), from: "the vendor's x-ratelimit-limit, x-ratelimit-remaining and x-ratelimit-reset response headers, as last read" };
  } catch { return null; }
}
