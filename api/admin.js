// Analytics dashboard (Oct 2026, Lane C; docs/analytics-events.md). Read only.
//   GET  /admin                     (rewrite to ?page=1) the page. It answers 404 with the plain not-found page to
//                                   everyone; for a signed-in browser it then asks POST {part:"me"} and only an
//                                   ADMIN_EMAILS account sees the dashboard drawn in place.
//   POST /api/admin {part, ...}     the data, Authorization: Bearer <the person's sign-in token>. Anyone not on
//                                   ADMIN_EMAILS gets the plain 404. Every parameter is in the body, never the address.
//   GET  /api/admin?refresh=hour    the Vercel cron (Bearer CRON_SECRET): today's summaries.
//   GET  /api/admin?refresh=night   yesterday's summaries finalized, retention, and the 13-month purge.
// Every number comes from analytics_events (through the summary tables) except live inventory and the deploy.
import { validateBearer } from "../lib/_auth.js";
import { hasServerCredential, cronOk } from "../lib/_credential.js";
import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { supabaseSelectAll } from "../lib/_supabase.js";
import { trackHealth, withTracking } from "../lib/track/log.js";
import { BUY_CHAT_SPEND_PER_DAY_USD } from "../lib/_ceilings.js";
import { heldBackPanel, runHeldBackAlert } from "../lib/admin/heldBack.js";
import { readPremiumFreshness } from "../lib/ops/premiumFresh.js";
import { launchPanels, rightNow, launchIso } from "../lib/admin/launch.js";
import { healthPanel, healthUnread } from "../lib/admin/health.js";
import { launchWords } from "../lib/launchTime.js";
import { searchesPanel, usersPanel, userJourney } from "../lib/admin/people.js";

const CRON_ROUTES = ["/api/pullLive", "/api/tasks", "/api/refreshSpecLiveCounts", "/api/admin"];

function storeEnv() {
  const supabaseUrl = process.env.SUPABASE_URL, supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return supabaseUrl && supabaseKey ? { supabaseUrl, supabaseKey } : null;
}
const H = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
async function rows(env, path) { try { return (await supabaseSelectAll(env, path)) || []; } catch { return []; } }
async function rpc(env, fn, args) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(env), body: JSON.stringify(args || {}) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function count(env, path) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method: "HEAD", headers: { ...H(env), Prefer: "count=exact", Range: "0-0" } });
    const m = String(r.headers.get("content-range") || "").match(/\/(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

// Pacific days: the dashboard's "today" is Sam's.
function ptDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function ptRange(day) {
  // Start and end of a Pacific day as UTC instants (handles daylight saving through the offset at noon).
  const noon = new Date(`${day}T12:00:00Z`);
  const off = (new Date(noon.toLocaleString("en-US", { timeZone: "UTC" })) - new Date(noon.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })));
  const start = new Date(Date.parse(`${day}T00:00:00Z`) + off);
  return { start: start.toISOString(), end: new Date(start.getTime() + 864e5).toISOString() };
}
const sum = (a, f) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const byName = (counts, name, product) => sum(counts.filter(c => c.name === name && c.product !== "all" && (!product || c.product === product)), c => c.events);

function adminEmails() { return String(process.env.ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean); }

// ------------------------------------------------------------------------------------------------ parts
async function overview(env) {
  const day = ptDay(0);
  const [counts, search, cost, live, failRows] = await Promise.all([
    rows(env, `analytics_daily_counts?day=eq.${day}&select=product,name,events,visitors,refreshed_at`),
    rows(env, `analytics_daily_search?day=eq.${day}&select=*`),
    rows(env, `analytics_daily_cost?day=eq.${day}&select=*`),
    count(env, "live_listings?status=eq.live&select=id"),
    rows(env, `app_usage_events?event_type=eq.analytics_write_failed&created_at=gte.${encodeURIComponent(ptRange(day).start)}&select=metadata`),
  ]);
  const searches = sum(search, s => s.searches);
  return {
    day, refreshed: counts.map(c => c.refreshed_at).sort().pop() || null,
    searches, answered: sum(search, s => s.answered),
    notEnoughRate: searches ? sum(search, s => s.not_enough) / searches : null,
    clickouts: byName(counts, "auction_clickout") + byName(counts, "live_car_clicked"),
    marketChecks: sum(search.filter(s => s.product === "market_check"), s => s.searches),
    tasksCreated: byName(counts, "task_created"), signups: byName(counts, "signup_completed"),
    visitors: sum(counts.filter(c => c.product === "all" && c.name === "visitors"), c => c.visitors),
    spendUsd: sum(cost, c => c.cost_usd), spendCapUsd: BUY_CHAT_SPEND_PER_DAY_USD,
    errors: byName(counts, "error"), liveInventory: live,
    analyticsLost: sum(failRows, r => r.metadata && r.metadata.lost),
  };
}

async function reliability(env) {
  const from = ptDay(-6);
  const [cost, errs, search, emails, premium] = await Promise.all([
    rows(env, `analytics_daily_cost?day=gte.${from}&select=*&order=day.desc`),
    rows(env, `analytics_daily_errors?day=gte.${from}&select=*&order=day.desc`),
    rows(env, `analytics_daily_search?day=gte.${from}&select=day,product,searches,failed,catching_breath,fallback_used,year_widened,latency_p50,latency_p95&order=day.desc`),
    rows(env, `analytics_events?name=eq.task_match_sent&ts=gte.${encodeURIComponent(ptRange(from).start)}&select=ts,props&order=ts.desc`),
    // When the nightly job last wrote the partner premium numbers (lib/ops/premiumFresh.js); a failed read says so.
    readPremiumFreshness(supabaseSelectAll, env).catch(() => ({ error: true })),
  ]);
  const routes = {};
  for (const e of errs) { const k = e.route; routes[k] = routes[k] || { route: k, errors: 0, statuses: {} }; routes[k].errors += e.errors; routes[k].statuses[e.status] = (routes[k].statuses[e.status] || 0) + e.errors; }
  return {
    cost, search, premium,
    errorsByRoute: Object.values(routes).sort((a, b) => b.errors - a.errors),
    cronFailures: errs.filter(e => CRON_ROUTES.includes(e.route)),
    email: { runs: emails.length, sent: sum(emails, e => e.props.emails_sent), failed: sum(emails, e => e.props.failed), endedBeforeSend: sum(emails, e => e.props.ended_before_send) },
    deploy: { commit: String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null, env: process.env.VERCEL_ENV || null, region: process.env.VERCEL_REGION || null },
    thisInstance: trackHealth(),
  };
}

async function buyAndMarketCheck(env) {
  const from = ptDay(-6);
  const names = ["refinement_applied", "receipt_opened", "auction_clickout", "live_car_clicked", "identity_question_shown", "identity_question_answered", "show_more_opened", "how_sam_decides_opened", "over_time_row_opened", "sell_cta_clicked"];
  const [search, counts, width] = await Promise.all([
    rows(env, `analytics_daily_search?day=gte.${from}&product=in.(buy,market_check)&select=*&order=day.desc`),
    rows(env, `analytics_daily_counts?day=gte.${from}&product=in.(buy,market_check)&name=in.(${names.join(",")})&select=day,product,name,events`),
    rpc(env, "analytics_width_behavior", { p_days: 7 }).catch(() => []),
  ]);
  const behavior = {};
  for (const c of counts) { const k = `${c.product}|${c.name}`; behavior[k] = (behavior[k] || 0) + c.events; }
  return { search, behavior, width };
}

async function demand(env) {
  const from = ptDay(-6);
  const [d, repeats] = await Promise.all([
    rows(env, `analytics_daily_demand?day=gte.${from}&select=make,model,year_band,searches,buy_searches,mc_searches,sell_searches,answered,not_enough,zero_live,market_checked,tasks_created`),
    rpc(env, "analytics_repeats", { p_days: 30 }).catch(() => []),
  ]);
  const cars = {};
  for (const r of d) {
    const k = `${r.make}|${r.model}`;
    const c = cars[k] = cars[k] || { car: `${r.make} ${r.model === "-" ? "" : r.model}`.trim(), searches: 0, buy: 0, marketCheck: 0, sell: 0, notEnough: 0, zeroLive: 0, marketChecked: 0, tasks: 0 };
    c.searches += r.searches; c.buy += r.buy_searches; c.marketCheck += r.mc_searches; c.sell += r.sell_searches;
    c.notEnough += r.not_enough; c.zeroLive += r.zero_live; c.marketChecked += r.market_checked; c.tasks += r.tasks_created;
  }
  const all = Object.values(cars);
  return {
    top: [...all].sort((a, b) => b.searches - a.searches).slice(0, 25),
    unmet: all.filter(c => c.notEnough + c.zeroLive > 0).sort((a, b) => (b.notEnough + b.zeroLive) - (a.notEnough + a.zeroLive)).slice(0, 25),
    repeats: Array.isArray(repeats) ? repeats : [],
  };
}

// The Launch tab's date picker: today and yesterday are Pacific days, "launch" runs from the opening time (the LAUNCH_AT setting; empty until Sam sets it, then nothing to count), last 7 days is a rolling week.
function launchRange(key) {
  const now = new Date(), nowIso = new Date(now.getTime() + 1000).toISOString();
  if (key === "yesterday") { const y = ptRange(ptDay(-1)); return { key, from: y.start, to: y.end }; }
  if (key === "launch") return { key, from: launchIso() || nowIso, to: nowIso };
  if (key === "last7") return { key, from: new Date(now.getTime() - 7 * 864e5).toISOString(), to: nowIso };
  return { key: "today", from: ptRange(ptDay(0)).start, to: nowIso };
}
async function launch(env, key, crew) {
  const r = { ...launchRange(key), crew: !!crew };
  const [panels, now, held_back, health] = await Promise.all([r.from >= r.to ? Promise.resolve({ range: r, before_launch: true }) : launchPanels(env, r), rightNow(env, !!crew), heldBackPanel(env, !!crew), healthPanel(env, !!crew).catch(() => healthUnread())]);
  return { ...panels, now, held_back, health, launchAt: launchIso(), launchWords: launchWords() || null };
}

const ANON_RE = /^[A-Za-z0-9_-]{16,40}$/;
async function journey(env, anon) {
  if (anon && ANON_RE.test(anon)) {
    const ev = await rows(env, `analytics_events?anon_id=eq.${encodeURIComponent(anon)}&select=ts,product,surface,name,props,region_class,consent,browser_family,device_class,ref_domain,utm_source,utm_medium,utm_campaign,launch_wave,internal,is_bot,user_id,vin&order=ts.asc&limit=500`);
    return { anon, events: ev.map(e => ({ ...e, user_id: e.user_id ? "signed in" : null })) };
  }
  const [recent, handoffRows] = await Promise.all([
    rows(env, `analytics_events?anon_id=not.is.null&internal=is.false&is_bot=is.false&ts=gte.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}&select=anon_id,ts,product&order=ts.desc&limit=2000`),
    // Handed off to Sell, 7 days: sell_started fired from a page other than Sell (Market Check's handoff), by car.
    rows(env, `analytics_events?name=eq.sell_started&product=neq.sell&internal=is.false&is_bot=is.false&ts=gte.${encodeURIComponent(ptRange(ptDay(-6)).start)}&select=anon_id,props&limit=5000`),
  ]);
  const m = new Map();
  for (const r of recent) { const x = m.get(r.anon_id) || { anon: r.anon_id, events: 0, last: r.ts, products: new Set() }; x.events++; x.products.add(r.product); m.set(r.anon_id, x); }
  return { recent: [...m.values()].slice(0, 30).map(x => ({ ...x, products: [...x.products].join(", ") })), handoffs: handoffsByCar(handoffRows) };
}

// One row per car (vehicle_key), with the model years seen; a handoff sent without the car is its own row.
export function handoffsByCar(list) {
  const cars = new Map();
  for (const r of list || []) {
    const p = r.props || {}, k = typeof p.vehicle_key === "string" && p.vehicle_key ? p.vehicle_key : null;
    const c = cars.get(k) || { vehicle_key: k, handoffs: 0, visitors: new Set(), years: new Set() };
    c.handoffs++; if (r.anon_id) c.visitors.add(r.anon_id); if (Number(p.year) > 0) c.years.add(Number(p.year));
    cars.set(k, c);
  }
  return [...cars.values()].sort((a, b) => (a.vehicle_key === null) - (b.vehicle_key === null) || b.handoffs - a.handoffs).slice(0, 50)
    .map(c => ({ vehicle_key: c.vehicle_key, handoffs: c.handoffs, visitors: c.visitors.size, years: [...c.years].sort((a, b) => a - b) }));
}

async function retention(env) {
  const [cohorts, people] = await Promise.all([
    rows(env, "analytics_weekly_retention?select=cohort_week,weeks_after,visitors&order=cohort_week.desc,weeks_after.asc"),
    rows(env, "analytics_weekly_retention_people?select=cohort_week,weeks_after,people,signed_in&order=cohort_week.desc,weeks_after.asc"),
  ]);
  return { cohorts, people };
}

// Model calls and cost against the spend ledger, and search_run against each product's own search record,
// for one Pacific day. Internal traffic is in both sides on purpose: it is real spend.
async function reconcile(env, day, since) {
  const r0 = ptRange(day);
  // since: compare from a later instant in the day (the store's first hour, a deploy), never earlier.
  const start = since && Date.parse(since) > Date.parse(r0.start) ? new Date(Date.parse(since)).toISOString() : r0.start, end = r0.end;
  const at = `created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}`;
  const ts = `ts=gte.${encodeURIComponent(start)}&ts=lt.${encodeURIComponent(end)}`;
  const [ledger, calls, runs, oldSearch, sellRows] = await Promise.all([
    rows(env, `app_usage_events?${at}&or=(anthropic_input_tokens.gt.0,anthropic_output_tokens.gt.0)&select=event_type,anthropic_cost_usd`),
    rows(env, `analytics_events?name=eq.model_call&${ts}&select=product,props`),
    rows(env, `analytics_events?name=eq.search_run&${ts}&select=product,props`),
    rows(env, `funnel_events?event=eq.search&${at}&select=tool`),
    count(env, `app_usage_events?event_type=eq.seller_decision&status=eq.decision_ready&${at}&select=id`),
  ]);
  const round = n => Math.round(n * 1e6) / 1e6;
  const per = (a, f) => a.reduce((o, x) => { const k = f(x) || "none"; o[k] = (o[k] || 0) + 1; return o; }, {});
  const completed = runs.filter(r => r.props.answer_type !== "failed");
  return {
    day, from: start, to: end,
    modelCalls: { ledgerRows: ledger.length, events: calls.length, ledgerUsd: round(sum(ledger, r => r.anthropic_cost_usd)), eventUsd: round(sum(calls, c => c.props.cost_usd)) },
    searches: { searchRunCompleted: per(completed, r => r.product), searchRunFailed: per(runs.filter(r => r.props.answer_type === "failed"), r => r.product),
      oldSearchEvents: per(oldSearch, r => r.tool), sellDecisionLedgerRows: sellRows },
  };
}

// Is the store receiving events: the last two hours by name, counts only (no id, no address).
async function storeCheck(env) {
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const ev = await rows(env, `analytics_events?ts=gte.${encodeURIComponent(since)}&select=name,product,consent,internal,is_bot,anon_id,session_id,user_id,vin`);
  const by = {};
  for (const e of ev) { const k = `${e.product}:${e.name}${e.internal ? " (internal)" : ""}`; by[k] = (by[k] || 0) + 1; }
  const fails = await rows(env, `app_usage_events?event_type=eq.analytics_write_failed&created_at=gte.${encodeURIComponent(since)}&select=created_at,status,metadata&order=created_at.desc&limit=5`);
  const day = ptDay(0);
  return {
    events2h: ev.length, byName: by,
    withAnon: ev.filter(e => e.anon_id).length, declined: ev.filter(e => e.consent === "declined").length,
    declinedWithId: ev.filter(e => e.consent === "declined" && (e.anon_id || e.session_id || e.user_id)).length, withVin: ev.filter(e => e.vin).length,
    writeFailures2h: fails.length, lastFailure: fails[0] ? { at: fails[0].created_at, status: fails[0].status } : null,
    summaryRowsToday: (await rows(env, `analytics_daily_counts?day=eq.${day}&select=name`)).length,
  };
}

// Our own test traffic (internal only), oldest first, for an end-to-end check: every field, ids shown only as
// present or absent. since: an ISO time within the last two hours.
async function testEvents(env, since) {
  const floor = Date.now() - 2 * 3600e3, t = Math.max(floor, Date.parse(since) || floor);
  const ev = await rows(env, `analytics_events?internal=is.true&ts=gte.${encodeURIComponent(new Date(t).toISOString())}&select=ts,product,surface,name,props,region_class,consent,browser_family,device_class,ref_domain,is_bot,anon_id,session_id,user_id,vin&order=ts.asc&limit=500`);
  return { events: ev.map(e => ({ ...e, anon_id: e.anon_id ? "present" : null, session_id: e.session_id ? "present" : null, user_id: e.user_id ? "present" : null, anon_tail: e.anon_id ? String(e.anon_id).slice(-4) : null })) };
}

// Round 2, Stage 1 reads (server credential only, counts and categories, never an id or an address).
// write_failures: today's analytics_write_failed ledger rows, so the reason for a lost event can be read.
async function writeFailures(env) {
  const r = await rows(env, `app_usage_events?event_type=eq.analytics_write_failed&created_at=gte.${encodeURIComponent(ptRange(ptDay(0)).start)}&select=created_at,status,metadata&order=created_at.desc&limit=100`);
  const byStatus = {}; for (const x of r) { const k = x.status || "-"; byStatus[k] = (byStatus[k] || 0) + (Number(x.metadata && x.metadata.lost) || 0); }
  return { rows: r.length, lost: sum(r, x => x.metadata && x.metadata.lost), byStatus, last: r.slice(0, 20).map(x => ({ at: x.created_at, status: x.status, lost: x.metadata && x.metadata.lost, instance_total: x.metadata && x.metadata.instance_total })) };
}
// door: the held-at-the-door and error events of the last few hours, grouped. Whether a row had an anon id is
// shown as yes or no; the peak is the busiest single second.
async function doorCheck(env, hours) {
  const h = Math.min(72, Math.max(1, Number(hours) || 6));
  // Read in 3 hour slices, one at a time, so no single read is big enough to time out; a slice that fails fails the whole read.
  // (Oct 27 2026: the first version of this read returned a silent 0 rows against 2,400 events in 2 hours. The cause was not proven, so it is now sliced and a failed read says so.)
  let ev = []; const SLICE = 3 * 3600e3, end = Date.now();
  for (let t = end; t > end - h * 3600e3; t -= SLICE) {
    const part = await supabaseSelectAll(env, `analytics_events?name=in.(held_at_door,error)&ts=gte.${encodeURIComponent(new Date(Math.max(t - SLICE, end - h * 3600e3)).toISOString())}&ts=lt.${encodeURIComponent(new Date(t + 1000).toISOString())}&internal=eq.false&select=ts,name,is_bot,anon_id,browser_family,device_class,region_class,props&order=ts.desc`);
    if (part === null) { ev = null; break; }
    ev.push(...part);
  }
  if (ev === null) return { hours: h, read: false, error: "read failed" };
  const g = (f, list = ev) => { const m = {}; for (const e of list) { const k = f(e); m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 12); };
  const sec = {}, min = {}, hr = {}; for (const e of ev) { const t = String(e.ts); sec[t.slice(0, 19)] = (sec[t.slice(0, 19)] || 0) + 1; min[t.slice(0, 16)] = (min[t.slice(0, 16)] || 0) + 1; hr[t.slice(0, 13)] = (hr[t.slice(0, 13)] || 0) + 1; }
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([t, n]) => ({ at: t, n }));
  const ids = new Set(ev.filter(e => e.anon_id).map(e => e.anon_id));
  const held = ev.filter(e => e.name === "held_at_door");
  const perMin = Object.values(min).sort((a, b) => a - b);
  return { hours: h, read: true, rows: ev.length, window: { first: ev.length ? ev[ev.length - 1].ts : null, last: ev.length ? ev[0].ts : null },
    byName: g(e => e.name), byRoute: g(e => `${e.name} ${(e.props || {}).route || "?"} ${(e.props || {}).status || ""}`),
    bot: g(e => e.is_bot ? "bot" : "not flagged", held), withAnonId: g(e => e.anon_id ? "yes" : "no", held), distinct_anon_ids: ids.size,
    top_anon_id_counts: Object.values(ev.reduce((m, e) => { if (e.anon_id) m[e.anon_id] = (m[e.anon_id] || 0) + 1; return m; }, {})).sort((a, b) => b - a).slice(0, 5),
    browser: g(e => e.browser_family || "none", held), device: g(e => e.device_class || "none", held), region: g(e => e.region_class || "none", held),
    per_hour: Object.entries(hr).sort().map(([t, n]) => ({ at: t, n })), peak_seconds: top(sec, 5), peak_minutes: top(min, 5),
    minutes_active: perMin.length, median_per_active_minute: perMin.length ? perMin[Math.floor(perMin.length / 2)] : null, max_per_minute: perMin.length ? perMin[perMin.length - 1] : null };
}

// ------------------------------------------------------------------------------------------------ cron
async function refresh(env, which) {
  const out = {};
  if (which === "hour") {
    out.today = await rpc(env, "analytics_refresh_day", { p_day: ptDay(0), p_final: false });
    // The first hour after midnight also catches yesterday's last events.
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date()));
    if (h === 0) out.yesterday = await rpc(env, "analytics_refresh_day", { p_day: ptDay(-1), p_final: false });
    // Held back: an email to the admin accounts when 5 or more visitors hit the Market Check cap inside the hour (lib/admin/heldBack.js).
    out.held_back_alert = await runHeldBackAlert(env);
  } else {
    out.yesterday = await rpc(env, "analytics_refresh_day", { p_day: ptDay(-1), p_final: true });
    out.retention = await rpc(env, "analytics_refresh_retention", {});
    out.purged = await rpc(env, "analytics_purge", {});
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the page
function pageHtml() {
  // The plain not-found page, plus a script that draws the dashboard only for an allowed signed-in account.
  // The script holds no key and no data; everything comes from POST /api/admin with the person's own token.
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content="noindex,nofollow"><title>404: NOT_FOUND</title>
<style>:root{color-scheme:dark;--background:#0a0a0a;--foreground:#ededed;--copy:#ffffff;--secondary:#a0a0a0}@media(prefers-color-scheme:light){:root{color-scheme:light;--background:#ffffff;--foreground:#171717;--copy:#171717;--secondary:#4d4d4d}}*,*::before,*::after{box-sizing:border-box}html,body{min-height:100%}body{margin:0;background:var(--background);color:var(--foreground);font-family:geist,-apple-system,BlinkMacSystemFont,segoe ui,helvetica neue,Arial,sans-serif}main.nf{display:grid;min-height:100vh;place-items:center;padding:32px}h1{font-size:24px;font-weight:600;letter-spacing:-.96px;line-height:32px;margin:0}p{margin:8px 0 0;color:var(--copy);font-size:16px;line-height:24px}.metadata{margin-top:23px;color:var(--secondary);font-family:geist mono,sfmono-regular,Consolas,liberation mono,Menlo,monospace;font-size:12px;line-height:16px}</style>
<style id=ad-style media="not all">body.ad{background:#f7f6f3;color:#1a1a1a;color-scheme:light}.ad main{max-width:1100px;margin:0 auto;padding:16px}.ad h1{font-size:20px;letter-spacing:0}.ad h2{font-size:16px;margin:22px 0 8px}.ad nav{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.ad nav button{border:1px solid #cfcac2;background:#fff;border-radius:16px;padding:6px 12px;font-size:14px;cursor:pointer;color:#1a1a1a}.ad nav button.on{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.ad .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.ad .tile{background:#fff;border:1px solid #e4e0d8;border-radius:10px;padding:10px}.ad .tile b{display:block;font-size:22px;margin-top:4px}.ad .tile span{font-size:12px;color:#5f5a53}.ad .wrap{overflow-x:auto;background:#fff;border:1px solid #e4e0d8;border-radius:10px}.ad table{border-collapse:collapse;width:100%;font-size:13px}.ad th,.ad td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap}.ad th{color:#5f5a53;font-weight:600}.ad .note{font-size:12px;color:#5f5a53;margin:6px 0}.ad input{font-size:14px;padding:6px 8px;border:1px solid #cfcac2;border-radius:6px;width:min(320px,100%)}.ad .muted{color:#8a857d}.ad .fresh{background:#fff;border:1px solid #e4e0d8;border-radius:10px;padding:10px 12px;margin:12px 0 0;font-size:14px}.ad h3{font-size:14px;margin:16px 0 6px}.ad .lrange{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.ad .lrange button{border:1px solid #cfcac2;background:#fff;border-radius:16px;padding:6px 12px;font-size:14px;cursor:pointer;color:#1a1a1a}.ad .lrange button.on{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.ad .fresh.amber{background:#fff4d6;border-color:#d9a400;color:#5c4100}.ad .strip{border:2px solid;border-radius:12px;padding:12px 14px;margin:12px 0;display:flex;flex-direction:column;gap:4px}.ad .strip .lv{font-size:22px;letter-spacing:.04em}.ad .strip span{font-size:15px;line-height:1.4}.ad .strip .also{font-size:13px}.ad .strip.good{background:#e8f3ea;border-color:#2f7d4a;color:#143d24}.ad .strip.watch{background:#fff4d6;border-color:#d9a400;color:#5c4100}.ad .strip.act{background:#fde8e6;border-color:#c0392b;color:#6b1a12}</style>
</head><body><main class=nf><section aria-labelledby=error-title><h1 id=error-title>This page doesn&#8217;t exist</h1><p>It may have been moved, removed, or never existed.</p><div class=metadata><p>404 NOT_FOUND</p></div></section></main>
<script>(function(){
var tok=null;
function session(){try{return JSON.parse(localStorage.getItem("gas_auth_session")||"null");}catch(e){return null;}}
function api(body){return fetch("/api/admin",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+tok},body:JSON.stringify(body),cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();});}
function token(){var s=session();if(!s||!s.access_token)return Promise.resolve(null);var now=Date.now()/1000;
 if(!s.expires_at||s.expires_at-now>60)return Promise.resolve(s.access_token);if(!s.refresh_token)return Promise.resolve(null);
 return fetch("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({part:"refresh",refresh_token:s.refresh_token})}).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j||!j.access_token)return null;try{localStorage.setItem("gas_auth_session",JSON.stringify(Object.assign({},s,j)));}catch(e){}return j.access_token;}).catch(function(){return null;});}
var E=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});};
var n=function(x){return x==null?"-":Number(x).toLocaleString("en-US");},usd=function(x){return x==null?"-":"$"+Number(x).toFixed(2);},pct=function(x){return x==null?"-":Math.round(x*100)+"%";};
function table(cols,rows){if(!rows||!rows.length)return '<p class=note>No rows yet.</p>';return '<div class=wrap><table><tr>'+cols.map(function(c){return '<th>'+E(c[0])+'</th>';}).join("")+'</tr>'+rows.map(function(r){return '<tr>'+cols.map(function(c){return '<td>'+(c[2]?c[2](r[c[1]],r):E(r[c[1]]))+'</td>';}).join("")+'</tr>';}).join("")+'</table></div>';}
function heldBackBlock(b){if(!b)return '';var hr=function(x){return x?E(x.hour)+' ('+n(x.hits)+')':'none';};
 return tiles([["Hits today",n(b.today.hits)],["Visitors today",n(b.today.visitors)],["Hits, 7 days",n(b.week.hits)],["Visitors, 7 days",n(b.week.visitors)],["Busiest hour today",hr(b.busiest_today)],["Busiest hour, 7 days",hr(b.busiest_week)]])
 +(b.today.no_id||b.week.no_id?'<p class=note>Hits with no visitor id: '+n(b.today.no_id)+' today, '+n(b.week.no_id)+' in 7 days. They are in the hit counts, not the visitor counts.</p>':'')
 +'<h3>By route</h3>'+table([["Route","k"],["Today","today",n],["7 days","week",n]],b.by_route)
 +'<h3>By limit</h3>'+table([["Limit","k"],["Today","today",n],["7 days","week",n]],b.by_limit);}
function tiles(t){return '<div class=tiles>'+t.map(function(x){return '<div class=tile><span>'+E(x[0])+'</span><b>'+x[1]+'</b>'+(x[2]?'<span>'+E(x[2])+'</span>':'')+'</div>';}).join("")+'</div>';}
// Partner premium numbers: how long since the nightly job last wrote them; amber past the limit (36 hours).
function hoursText(h){var r=Math.round(h),W=["zero","one","two","three","four","five","six","seven","eight","nine","ten"];return h<1?"less than an hour":(r<=10?W[r]:n(r))+(r===1?" hour":" hours");}
function premiumLine(p){if(!p||p.error)return '<p class="fresh amber">Premium numbers: the last refresh time could not be read.</p>';
 if(!p.lastRefreshed)return '<p class="fresh amber">Premium numbers: no partner has a stored number.</p>';
 var act=(p.partners||[]).filter(function(x){return x.active;}),behind=act.filter(function(x){return x.computedAt&&Date.parse(p.lastRefreshed)-Date.parse(x.computedAt)>36e5;}).map(function(x){return x.name;}),none=act.filter(function(x){return !x.computedAt;}).map(function(x){return x.name;});
 return '<p class="fresh'+(p.stale?' amber':'')+'" title="'+E(new Date(p.lastRefreshed).toLocaleString())+'">Premium numbers last refreshed '+hoursText(p.hoursOld)+' ago.'+(p.stale?' That is over '+n(p.staleAfterHours)+' hours: check the nightly premium job.':'')+'</p>'
  +(behind.length?'<p class=note>Older than that run: '+E(behind.join(", "))+'.</p>':'')+(none.length?'<p class=note>No stored number (below the sales needed): '+E(none.join(", "))+'.</p>':'');}
var PARTS=[["launch","Launch"],["searches","Searches"],["users","Users"],["overview","Today"],["reliability","Cost and Reliability"],["buy","Buy and Market Check"],["demand","Demand"],["journey","Journey"],["retention","Retention"]];
var R={
overview:function(d){return tiles([["Searches",n(d.searches)],["Answered with a range",n(d.answered)],["Not enough data",pct(d.notEnoughRate)],["Clickouts",n(d.clickouts)],["Market Checks",n(d.marketChecks)],["Tasks created",n(d.tasksCreated)],["Sign-ups",n(d.signups)],["Visitors",n(d.visitors)],["Model spend",usd(d.spendUsd),"of the "+usd(d.spendCapUsd)+" cap"],["Errors",n(d.errors)],["Live cars",n(d.liveInventory)],["Analytics events lost",n(d.analyticsLost)]])+'<p class=note>'+E(d.day)+' Pacific. '+(d.refreshed?'Summaries refreshed '+E(new Date(d.refreshed).toLocaleTimeString()):'Summaries not refreshed yet')+'; crew, test and bot traffic left out.</p>';},
reliability:function(d){return premiumLine(d.premium)+'<h2>Spend by product</h2>'+table([["Day","day"],["Product","product"],["Calls","model_calls",n],["Cache hits","cache_hits",n],["Tokens in","tokens_in",n],["Tokens out","tokens_out",n],["Cost","cost_usd",usd]],d.cost)
 +'<h2>Errors by route, 7 days</h2>'+table([["Route","route"],["Errors","errors",n],["Statuses","statuses",function(v){return E(Object.keys(v).map(function(k){return k+": "+v[k];}).join(", "));}]],d.errorsByRoute)
 +'<h2>Latency and failures</h2>'+table([["Day","day"],["Product","product"],["Searches","searches",n],["p50 ms","latency_p50",n],["p95 ms","latency_p95",n],["Failed","failed",n],["Catching his breath","catching_breath",n],["Fallback rung","fallback_used",n],["Year widened","year_widened",n]],d.search)
 +'<h2>Cron failures</h2>'+table([["Day","day"],["Route","route"],["Status","status"],["Errors","errors",n]],d.cronFailures)
 +'<h2>Task emails, 7 days</h2>'+tiles([["Runs",n(d.email.runs)],["Sent",n(d.email.sent)],["Failed",n(d.email.failed)],["Ended before the email",n(d.email.endedBeforeSend)]])
 +'<h2>Deploy</h2>'+tiles([["Commit",E(d.deploy.commit||"-")],["Environment",E(d.deploy.env||"-")],["Writes lost, this instance",n(d.thisInstance.events_lost)]]);},
buy:function(d){var b=d.behavior,rowsB=[];["buy","market_check"].forEach(function(p){rowsB.push({product:p,ref:b[p+"|refinement_applied"]||0,rec:b[p+"|receipt_opened"]||0,click:(b[p+"|auction_clickout"]||0)+(b[p+"|live_car_clicked"]||0),iq:b[p+"|identity_question_shown"]||0,iqa:b[p+"|identity_question_answered"]||0,more:b[p+"|show_more_opened"]||0});});
 return '<h2>Searches and answers, 7 days</h2>'+table([["Day","day"],["Product","product"],["Searches","searches",n],["Range","answered",n],["Which car?","identity_q",n],["Not enough","not_enough",n],["Zero","zero_result",n],["Answer rate","answered",function(v,r){return pct(r.searches?v/r.searches:null);}],["Range width (median)","width_median",function(v){return v==null?"-":pct(v);}]],d.search)
 +'<h2>What people did, 7 days</h2>'+table([["Product","product"],["Refinements","ref",n],["Receipts opened","rec",n],["Clickouts","click",n],["Which car? shown","iq",n],["answered","iqa",n],["Show more","more",n]],rowsB)
 +'<h2>Range width against behavior, 7 days</h2><p class=note>Share of sessions that opened a receipt or clicked out after a range answer.</p>'+table([["Product","product"],["Width","width_band"],["Range answers","searches",n],["Went on","went_on",n],["Share","went_on",function(v,r){return pct(r.searches?v/r.searches:null);}]],d.width);},
demand:function(d){var c=[["Car","car"],["Searches","searches",n],["Buy","buy",n],["Market Check","marketCheck",n],["Sell","sell",n],["Not enough data","notEnough",n],["No live cars","zeroLive",n],["Market Checked","marketChecked",n],["Tasks","tasks",n]];
 return '<h2>Top searches, 7 days</h2>'+table(c,d.top)+'<h2>Unmet searches</h2>'+table(c,d.unmet)+'<h2>Searched again on another day, 30 days</h2>'+table([["Car","vehicle_key",function(v){return E(String(v||"").replace("|"," "));}],["Visitors who came back to it","visitors",n],["Searches","searches",n]],d.repeats);},
journey:function(d){if(d.events)return (d.user?'<h2>Journey: '+E(d.anon)+'</h2>':'<h2>One anonymous journey</h2>')+'<p class=note>'+(d.user?'Every event linked to this account, oldest first.':'Events for one anon id, oldest first.')+' VINs are shown to admins only.</p>'+table([["Time","ts",function(v){return E(new Date(v).toLocaleString());}],["Product","product"],["Event","name"],["Fields","props",function(v){return E(JSON.stringify(v));}],["Region","region_class"],["Consent","consent"],["Browser","browser_family"],["Device","device_class"],["From","ref_domain"],["Campaign","utm_source"],["Account","user_id"],["VIN","vin"]],d.events)+'<p><button id=ad-back>Back to recent journeys</button></p>';
 return '<h2>Recent journeys, last 24 hours</h2><p class=note>Pick one to see it. Only anonymous ids; no address, no account email.</p>'+table([["Anon id","anon",function(v){return '<a href="#" data-anon="'+E(v)+'">'+E(v.slice(0,6))+'...</a>';}],["Events","events",n],["Products","products"],["Last","last",function(v){return E(new Date(v).toLocaleString());}]],d.recent)
  +'<h2>Handed off to Sell, 7 days</h2><p class=note>Market Check results passed to Sell, by car. Crew, test and bot traffic left out.</p>'+table([["Car","vehicle_key",function(v){return v?E(String(v).replace("|"," ")):'<span class=muted>Car not recorded</span>';}],["Model years","years",function(v){return v&&v.length?E(v.length>3?v[0]+" to "+v[v.length-1]:v.join(", ")):"-";}],["Handoffs","handoffs",n],["Visitors","visitors",n]],d.handoffs);},
retention:function(d){function grid(list,field,first){var w={},weeks=0;(list||[]).forEach(function(r){(w[r.cohort_week]=w[r.cohort_week]||{})[r.weeks_after]=r[field];weeks=Math.max(weeks,r.weeks_after);});
 var rows=Object.keys(w).sort().reverse().map(function(k){var o={week:k};for(var i=0;i<=Math.min(weeks,12);i++)o["w"+i]=w[k][i]==null?null:(i===0?w[k][0]:w[k][i]/w[k][0]);return o;});
 var cols=[["Week of","week"]];for(var i=0;i<=Math.min(weeks,12);i++)cols.push([i===0?first:"Week "+i,"w"+i,i===0?n:pct]);return table(cols,rows);}
 return '<h2>Weekly retention by person</h2><p class=note>A signed-in person counts once across devices; everyone else by browser. Grouped by first week, with the share seen again each week after.</p>'+grid(d.people,"people","People")
  +'<h2>Weekly retention by browser</h2><p class=note>By anon id only, so a second device counts as new.</p>'+grid(d.cohorts,"visitors","Visitors");}};
var rng="today",lastLaunch=null,crew=false,sf={product:"",outcome:"",text:""},ut="";
function crewBox(){return '<p class=note><label><input type=checkbox id=ad-crew'+(crew?' checked':'')+'> Include crew traffic (Sam, Pat and test visits). Off by default; bots stay out.</label></p>'+(crew?'<p class="fresh amber">Crew traffic is included in everything on this tab.</p>':'');}
function rangeBtns(){return '<div class=lrange>'+[["today","Today"],["yesterday","Yesterday"],["launch","Since launch"],["last7","Last 7 days"]].map(function(x){return '<button data-r="'+x[0]+'" class="'+(rng===x[0]?"on":"")+'">'+x[1]+'</button>';}).join("")+'</div>';}
function opt(list,cur){return list.map(function(x){return '<option value="'+E(x[0])+'"'+(cur===x[0]?' selected':'')+'>'+E(x[1])+'</option>';}).join("");}
function csvCell(v){var t=String(v==null?"":v);if(/^[=+@-]/.test(t))t="'"+t;var q=String.fromCharCode(34);return q+t.split(q).join(q+q)+q;}
function csvOf(rows,cols){var nl=String.fromCharCode(10);return [cols.map(function(c){return csvCell(c[0]);}).join(",")].concat(rows.map(function(r){return cols.map(function(c){return csvCell(r[c[1]]);}).join(",");})).join(nl)+nl;}
function download(name,text){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/csv"}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);}
var SCOLS=[["Time","ts"],["Product","product"],["Text","text"],["Car","car"],["Outcome","outcome"],["Seconds","seconds"],["Cache","cache"],["State","state"],["Device","device"],["Source","source"],["Person","person"],["Crew","crew"]];
function askedBlock(a){var h='<h2>What people typed</h2>';
 if(!a)return h+'<p class=note>Not recorded: the list could not be read just now.</p>';
 return h+'<p class=note>Every Find, Market Check and Sell search, whatever it ended in, word for word as scrubbed of emails, phone numbers and VINs. The last '+n(a.max)+' different texts, newest first, with the car each one resolved to and how many times it was asked. No visitor is attached to this list. Same range, product and crew box as below.'+(a.capped?' Counts are over the most recent '+n(a.searches_read)+' searches in the range.':' Counts are over all '+n(a.searches_read)+' searches in the range.')+'</p>'
 +table([["Text","text"],["Product","product",function(v){return pn(v);}],["Car it resolved to","car",function(v){return v?E(v):'<span class=muted>not resolved</span>';}],["Times asked","times",n],["Last asked","last",function(v){return E(fmtT(v));}],["Last ended","outcome"]],a.rows);}
R.searches=function(d){
 var h=rangeBtns()+'<div class=lrange><select id=sf-product>'+opt([["","All products"],["buy","Find"],["market_check","Market Check"],["sell","Sell"]],sf.product)+'</select> <select id=sf-outcome>'+opt([["","All outcomes"],["range","Range"],["thin","Thin"],["nothing","Nothing"],["error","Error"],["asked_back","Asked back"]],sf.outcome)+'</select> <input id=sf-text placeholder="Search the text" value="'+E(sf.text)+'"> <button id=sf-go>Apply</button> <button id=sf-csv>Download CSV (up to 5,000 rows)</button></div>'+crewBox();
 h+='<p class=note>Newest first. The text is what was typed, scrubbed of emails, phone numbers and VINs. Person is the account email when signed in, else the anonymous id. Source is the first page of that visit in this range. Showing '+n(d.shown)+(d.capped?' (the most recent '+n(d.limit)+'; narrow the filters to see older ones)':'')+'.</p>';
 return h+askedBlock(d.asked)+'<h2>Every search, with who and when</h2>'+table([["Time","ts",function(v){return E(fmtT(v));}],["Product","product",function(v){return pn(v);}],["Text","text"],["Car","car"],["Outcome","outcome"],["Seconds","seconds"],["Cache","cache"],["State","state"],["Device","device"],["Source","source"],["Person","person",function(v,r){return r.anon&&!r.signed_in?'<a href="#" data-anon="'+E(v)+'">'+E(String(v).slice(0,8))+'...</a>':E(v);}],["Crew","crew",function(v){return v?"crew":"";}]],d.rows);};
R.users=function(d){
 return '<div class=lrange><input id=ut-text placeholder="Search emails" value="'+E(ut)+'"> <button id=ut-go>Apply</button> <button id=ut-csv>Download CSV</button></div>'+crewBox()+'<p class=note>'+n(d.total)+' accounts, most recently seen first (the first 1,000 shown). Searches, Tasks and clickouts are counted from '+E(String(d.since).slice(0,10))+'. Click an email for the whole journey.'+(d.capped?' Activity is capped at 60,000 events, so the newest are missing.':'')+'</p>'
  +table([["Email","email",function(v,r){return '<a href="#" data-user="'+E(r.user_id)+'">'+E(v)+'</a>';}],["First seen","first_seen",function(v){return E(fmtT(v));}],["First source","first_source"],["Sign-in","method"],["Newsletter","newsletter",function(v){return v?"yes":"no";}],["Searches","searches",n],["Tasks","tasks",n],["Clickouts","clickouts",n],["Last seen","last_seen",function(v){return E(fmtT(v));}]],d.rows);};
R.user_journey=function(d){return R.journey(d);};
var UCOLS=[["Email","email"],["First seen","first_seen"],["First source","first_source"],["Sign-in","method"],["Newsletter","newsletter"],["Searches","searches"],["Tasks","tasks"],["Clickouts","clickouts"],["Last seen","last_seen"]];
function wirePeople(box,part){
 var c=document.getElementById("ad-crew");if(c)c.onchange=function(){crew=c.checked;show(part);};
 box.querySelectorAll(".lrange button[data-r]").forEach(function(b){b.onclick=function(){rng=b.getAttribute("data-r");show(part);};});
 var g=document.getElementById("sf-go");if(g)g.onclick=function(){sf={product:document.getElementById("sf-product").value,outcome:document.getElementById("sf-outcome").value,text:document.getElementById("sf-text").value};show("searches");};
 var t=document.getElementById("sf-text");if(t)t.onkeydown=function(e){if(e.key==="Enter")g.click();};
 var cs=document.getElementById("sf-csv");if(cs)cs.onclick=function(){cs.disabled=true;api({part:"searches",range:rng,product:sf.product,outcome:sf.outcome,text:sf.text,crew:crew,limit:5000,asked:false}).then(function(d){download("goasksam-searches-"+rng+".csv",csvOf(d.rows,SCOLS));cs.disabled=false;}).catch(function(){cs.disabled=false;});};
 var ug=document.getElementById("ut-go");if(ug)ug.onclick=function(){ut=document.getElementById("ut-text").value;show("users");};
 var uc=document.getElementById("ut-csv");if(uc)uc.onclick=function(){api({part:"users",text:ut,crew:crew}).then(function(d){download("goasksam-users.csv",csvOf(d.rows,UCOLS));});};
 box.querySelectorAll("[data-user]").forEach(function(a){a.onclick=function(e){e.preventDefault();show("user_journey",{user:a.getAttribute("data-user")});};});}
function pc(a,b){return b?Math.round(a/b*100)+"%":"-";}
function cell(a,b){return n(a)+" ("+pc(a,b)+")";}
function ms(x){return x==null?"-":(x>=1000?(x/1000).toFixed(1)+" s":n(x)+" ms");}
function fmtT(v){try{return new Date(v).toLocaleString();}catch(e){return v;}}
var PN={buy:"Find",market_check:"Market Check",sell:"Sell",total:"All products"};
function pn(v){return E(PN[v]||v);}
function ago(v){if(!v)return "";var m=Math.round((Date.now()-new Date(v).getTime())/60000);if(!isFinite(m)||m<0)return "";return m<90?m+" min ago":m<2880?Math.round(m/60)+" hours ago":Math.round(m/1440)+" days ago";}
function atT(v){if(!v)return "not recorded";var g=ago(v);return E(fmtT(v))+(g?" ("+E(g)+")":"");}
function healthStrip(hh){if(!hh||!hh.status)return '';var st=hh.status,c=st.level==="GOOD"?"good":st.level==="WATCH"?"watch":"act",x=hh.hour;
 return '<div class="strip '+c+'" role=status><b class=lv>'+E(st.level)+'</b><span>'+E(st.why)+'</span>'+(st.step?'<span>First step: '+E(st.step)+'</span>':'')+(st.also&&st.also.length?'<span class=also>Also: '+E(st.also.join(" "))+'</span>':'')+'</div>'
 +(x?'<p class=note>Last 60 minutes: '+n(x.searches)+' searches, '+n(x.failed_searches)+' failed, '+n(x.still_reading)+' still reading, '+n(x.stopped_by_limit)+' stopped by a limit, '+n(x.errors_5xx)+' server errors, busy line '+n(x.busy_shown)+', limits hit '+n(x.limits_hit)+', Task emails failed '+n(x.task_emails_failed)+', cold median '+(x.cold_n?ms(x.cold_p50_ms)+' and 95th '+ms(x.cold_p95_ms)+' over '+n(x.cold_n)+' cold answers':'not recorded (no cold answers)')+'.</p>':'');}
function healthBlocks(hh){if(!hh)return '';var f=hh.fresh,c=hh.capacity,lr=hh.last_real,fb=hh.feedback,h='<h2>Ready for launch</h2>';
 h+='<h3>How fresh the stored answers are</h3>';
 if(!f){h+='<p class=note>Not recorded: the stored answers could not be read just now.</p>';}
 else{h+=tiles([["Newest stored answer (last warm)",f.last_warm.read?atT(f.last_warm.at):"not recorded"],["Sales epoch",f.epoch.read?(f.epoch.at?atT(f.epoch.at):"none set"):"not recorded"],["Market Check answers not stored today (UTC)",f.off_day.read?n(f.off_day.market_check)+(f.off_day.capped?" or more":""):"not recorded"],["Buy and Tasks answers not stored today (UTC)",f.off_day.read?n(f.off_day.buy_and_tasks)+(f.off_day.capped?" or more":""):"not recorded"],["Market Check answers on an older epoch",f.epoch_mismatch.read?n(f.epoch_mismatch.n)+(f.epoch_mismatch.capped?" or more":""):"not recorded"]])+'<p class=note>Read from the time stamps of the stored answers and the sales epoch; nothing is recomputed. Counts stop at 1,000. Refreshed every 5 minutes.</p>';}
 h+='<h3>Capacity, last 24 hours</h3>';
 if(!c){h+='<p class=note>Not recorded: the last 24 hours could not be read just now.</p>';}
 else{h+=tiles([["Server errors (5xx)",n(c.errors_5xx)],["Of those, 504",n(c.errors_504)],["Limits hit by real visitors",n(c.limits_hit)]])
  +table([["Slowest search first","product",function(v){return pn(v);}],["Answers","n",n],["Median","p50",ms],["95th percentile","p95",ms]],c.slowest)
  +table([["Errors by route and status","k"],["Count","n",n]],c.by_route)+c.not_recorded.map(function(t){return '<p class=note>Not recorded: '+E(t)+'</p>';}).join("");}
 h+='<h3>Feedback today (Pacific)</h3>'+(fb?tiles([["Feedback form messages",n(fb.form_messages)],["Replies to Task emails","not recorded"]])+'<p class=note>A count only; the messages and replies are in the feedback inbox. Nothing counts the replies.</p>':'<p class=note>Not recorded: could not be read just now.</p>');
 h+='<h3>The last real answer, per product</h3>'+(lr?table([["Product","product",function(v){return pn(v);}],["Last real answer","at"]],["buy","market_check","sell"].map(function(p){var r=lr[p];return {product:p,at:!r||!r.read?"not recorded":r.ts?atT(r.ts):"none in the last 30 days"};}))+'<p class=note>A real answer is a range, as the rest of this tab counts it. Bots are left out; crew only when the box is ticked.</p>':'<p class=note>Not recorded: could not be read just now.</p>');
 return h;}
R.launch=function(d){
 var h=healthStrip(d.health)+'<div class=lrange>'+[["today","Today"],["yesterday","Yesterday"],["launch","Since launch"],["last7","Last 7 days"]].map(function(x){return '<button data-r="'+x[0]+'" class="'+(rng===x[0]?"on":"")+'">'+x[1]+'</button>';}).join("")+'</div>';
 h+='<p class=note>Refreshes every 60 seconds. '+(d.generatedAt?'Numbers as of '+E(fmtT(d.generatedAt))+'. ':'')+(crew?'Crew and test traffic are included. ':'Crew and test traffic are left out. ')+'Bots are left out. Nothing here is personal: visitors are counted, never listed. Visitors who declined analytics in Europe, the UK or Switzerland appear only in the answer counts.</p>';
 h+=crewBox();
 h+=healthBlocks(d.health);
 if(d.before_launch||(d.range&&rng==="launch"&&d.range.from>=d.range.to))h+='<p class="fresh amber">'+(d.launchWords?'Launch is '+E(d.launchWords)+'.':'The opening time is not set yet.')+' Nothing to count yet.</p>';
 if(d.truncated)h+='<p class="fresh amber">This range has more page views than the tab counts; only the earliest 60,000 are in the visitor numbers.</p>';
 if(!d.answerRate){return h;}
 // 1
 h+='<h2>1. Did they get an answer? Answer rate</h2><p class=note>Real result = a range (or live cars on Find). Asked back = the page asked which car. Thin or nothing = not enough sales, or no result. Error = the search failed.</p>'
  +table([["Product","product",function(v){return pn(v);}],["Asked","asked",n],["Real result","real",function(v,r){return cell(v,r.asked);}],["Asked back","asked_back",function(v,r){return cell(v,r.asked);}],["Thin or nothing","thin",function(v,r){return cell(v,r.asked);}],["Error","error",function(v,r){return cell(v,r.asked);}]],d.answerRate)
  +'<p class=note>Refusals are counted apart and are not asks: daily or hourly limit reached '+n(d.refusals.limit_hit)+' (limit_hit), sign-ups refused '+n(d.refusals.signup_refused)+' (signup_refused).</p>';
 // 2
 h+='<h2>2. Unmet demand</h2><p class=note>Every query that ended thin, with nothing, or in an error, word for word (scrubbed of emails, phone numbers and VINs), newest first, with how many times it was asked.</p>'
  +table([["Last asked","last",function(v){return E(fmtT(v));}],["Product","product",function(v){return pn(v);}],["Query","query"],["Ended","outcome",function(v){return v==="error"?"error":"thin or nothing";}],["Times asked","times",n]],d.unmet)
  +'<h2>Top 20 cars asked</h2>'+table([["Car","car"],["Asked","asked",n],["Find","buy",n],["Market Check","market_check",n],["Sell","sell",n]],d.topCars);
 // 3
 h+='<h2>3. Drop-off</h2><p class=note>Each step is inside the one before it. Arrived = a page view. Asked = ran a search. Real result = got a range or live cars. Acted = clicked out to an auction, opened a Task, or asked for an introduction. Came back = a second session in this range. The percent is the share lost from the step before.</p>'
  +table([["Product","product",function(v){return pn(v);}],["Arrived","arrived",n],["Asked","asked",function(v,r){return n(v)+" (lost "+pc(r.arrived-v,r.arrived)+")";}],["Real result","real",function(v,r){return n(v)+" (lost "+pc(r.asked-v,r.asked)+")";}],["Acted","acted",function(v,r){return n(v)+" (lost "+pc(r.real-v,r.real)+")";}],["Came back","came_back",function(v,r){return n(v)+" (lost "+pc(r.acted-v,r.acted)+")";}]],d.funnel)
  +'<p class=note>Acted without a real result (not in the table): '+n(d.actedNoReal)+' visitors.</p>'
  +'<h2>The asked-back loop</h2>'+tiles([["Were asked a question",n(d.loop.asked)],["Answered it",cell(d.loop.answered,d.loop.asked)],["Skipped it",cell(d.loop.skipped,d.loop.asked)],["Real result after answering",cell(d.loop.real_after,d.loop.answered)],["Left at the question",cell(d.loop.left,d.loop.asked)]])
  +(d.loop.shown_without_id?'<p class=note>'+n(d.loop.shown_without_id)+' question views carried no search id and are not in these numbers.</p>':'');
 // 4
 var a=d.action;
 h+='<h2>4. Action</h2><h3>Outbound clicks by platform and surface</h3><p class=note>Find, Market Check and Tasks pages, and the links in Task emails. Sell is the venue links, read from the outbound clicks table'+(d.outbound_sell_read?'':' (that table could not be read just now)')+'. Closest-sales links count as clicks too.</p>'
  +table([["Platform","platform"],["Find","find",n],["Market Check","market_check",n],["Tasks","tasks",n],["Task emails","tasks_email",n],["Sell","sell",n],["Other","unlabelled",n],["Total","total",n]],d.outbound)
  +tiles([["Tasks created",n(a.tasks_created)],["Tasks paused",n(a.tasks_paused)],["Tasks stopped",n(a.tasks_stopped)],["Task emails sent",n(a.task_emails_sent),n(a.task_emails_failed)+" failed"],["Sell flows started",n(a.sell_started)],["Sell finished",cell(a.sell_finished,a.sell_started)],["Introductions requested",n(a.introductions)],["Sign-ins started",n(a.signin_started),n(a.code_requested)+" codes requested"],["Sign-ins completed",n(a.signin_completed),"Google "+n(a.signin_google)+", code "+n(a.signin_code)+", method not recorded "+n(a.signin_method_unknown)],["New accounts",n(a.new_accounts)],["Newsletter box ticked",n(a.newsletter_ticked),"not ticked "+n(a.newsletter_not_ticked)+", not recorded "+n(a.newsletter_unknown)]]);
 // 5
 h+='<h2>5. Came back, and where from</h2>'+tiles([["Visitors",n(d.returning.visitors)],["Came back (second session)",cell(d.returning.returning,d.returning.visitors)]])
  +'<p class=note>Source is each first page view of each visitor in this range: the utm source if the link had one, otherwise the referring site, otherwise direct. Acted and came back are shares of that source.</p>'
  +table([["Source","source"],["First page","product",function(v){return pn(v);}],["Visitors","visitors",n],["Asked","asked",function(v,r){return cell(v,r.visitors);}],["Hit the limit","walled",function(v,r){return cell(v,r.visitors);}],["Signed in","signed_in",function(v,r){return cell(v,r.visitors);}],["Started a Task","task",function(v,r){return cell(v,r.visitors);}],["Started a watch","watch",function(v,r){return cell(v,r.visitors);}],["Acted","acted",function(v,r){return cell(v,r.visitors);}],["Came back","came_back",function(v,r){return cell(v,r.visitors);}]],d.sources)
  +'<p class=note>Hit the limit = reached a daily limit. Signed in = signed in at any point. Started a watch = armed a watch or a before-it-ends email. Searches before and after sign-in: '+(d.searchSplit||[]).map(function(x){return pn(x.product)+' '+n(x.anonymous)+' before, '+n(x.signed_in)+' after';}).join('; ')+'.</p>';
 // 6
 var w=d.now||{};
 h+='<h2>6. Right now (last 15 minutes)</h2>'+tiles([["Visitors",n(w.visitors)],["Answers served",n(w.answers)],["Failures",n(w.failures)]]);
 // 7
 h+='<h2>7. Speed</h2><p class=note>Seconds from the question to the answer, as the server measured it, failed searches left out. Cold = computed for this request. Warm = served from the stored answer. Find does not record cold or warm.</p>'
  +table([["Product","product",function(v){return pn(v);}],["Answers","n",n],["Median","p50",ms],["95th percentile","p95",ms],["Cold median","cold",function(v){return v.n?ms(v.p50)+" ("+n(v.n)+")":"none yet";}],["Cold 95th","cold",function(v){return v.n?ms(v.p95):"none yet";}],["Warm median","warm",function(v){return v.n?ms(v.p50)+" ("+n(v.n)+")":"none yet";}],["Warm 95th","warm",function(v){return v.n?ms(v.p95):"none yet";}]],d.speed);
 // 8
 var f=d.failures;
 h+='<h2>8. Failures</h2>'+tiles([["Busy line shown",n(f.busy_shown)],["Errors (5xx)",n(f.errors.reduce(function(s,x){return s+x.n;},0))],["Limits hit",n(f.limit_hit.reduce(function(s,x){return s+x.n;},0))],["Searches failed",n(f.search_failed.reduce(function(s,x){return s+x.n;},0))]])
  +'<h3>Held at the door</h3><p class=note>The sealed-site holding page (a 503 with Retry-After). Not an error, and it goes to zero on its own after launch.'+(f.held.read?'':' Could not be read just now.')+'</p>'+tiles([["Held at the door, this range",n(f.held.total)],["Held in the last hour",f.held.read?n(f.held.last_hour):"not recorded","This is the one that reads zero after the site opens"],["Last held visit",f.held.read?(f.held.last_at?atT(f.held.last_at):"none in this range"):"not recorded"],["Bot share",f.held.bot_share==null?"-":pc(f.held.bots,f.held.total)]])+table([["Route","k"],["Count","n",n]],f.held.by_route)
  +'<h3>Held back</h3><p class=note>Visitors stopped by a daily limit (limit_hit). Visitors are counted, never listed; hits with no visitor id are shown apart. Pacific time.'+(d.held_back&&d.held_back.read?'':' Could not be read just now.')+'</p>'+heldBackBlock(d.held_back)
  +'<h3>Errors by route and status</h3><p class=note>Real failures only: database, missing environment, and 5xx from routes.</p>'+table([["Route and status","k"],["Count","n",n]],f.errors)
  +'<h3>Searches that failed</h3>'+table([["Product and state","k"],["Count","n",n]],f.search_failed)
  +'<h3>Limits hit (limit_hit)</h3>'+table([["Limit","k"],["Count","n",n]],f.limit_hit)
  +'<h3>Last 20</h3>'+table([["When","ts",function(v){return E(fmtT(v));}],["What","kind"],["Detail","detail"]],f.last);
 // 9
 var c=d.cost;
 h+='<h2>9. Cost per answer</h2><p class=note>Answers served in this range: '+n(c.answers_served)+'. Anthropic is the model_call events; OldCarsData is the credits ledger (ocd_call rows), shown for visitor searches, live pulls, and the nightly and other jobs.'+(c.ocd_read?'':' The ledger could not be read just now.')+'</p>'
  +tiles([["Anthropic spend","$"+Number(c.anthropic_usd||0).toFixed(2),c.anthropic_per_answer==null?"":"$"+Number(c.anthropic_per_answer).toFixed(4)+" per answer"],["OldCarsData, visitor searches",n(c.ocd_visitor_search),c.ocd_per_answer_search_only==null?"":Number(c.ocd_per_answer_search_only).toFixed(2)+" credits per answer"],["OldCarsData, live pulls",n(c.ocd_live_pull)],["OldCarsData, nightly and other jobs",n(c.ocd_nightly_and_other)],["OldCarsData, all credits",n(c.ocd_total),c.ocd_per_answer_all==null?"":Number(c.ocd_per_answer_all).toFixed(2)+" credits per answer"]])
  +table([["Job","job"],["Credits","credits",n]],c.by_job);
 // 10
 h+='<h2>10. Feedback</h2>'+tiles([["Messages sent",n(d.feedback)]])+'<p class=note>A count only. Feedback goes to the inbox and is never stored here.</p>';
 // 11
 var w2=d.where;
 h+='<h2>11. Where from and what on</h2><p class=note>A coarse place from the edge (country, state and city name only, never a precise location) and the device class. Visitors are counted once each; searches are counts. A visitor in the EEA, UK or Switzerland, or who declined analytics, has no place and is not in these tables ('+n(w2.no_place_page_views)+' page views in this range have none).</p>'
  +'<h3>By country</h3>'+table([["Country","k"],["Visitors","visitors",n],["Searches","searches",n]],w2.countries)
  +'<h3>By US state</h3>'+table([["State","k"],["Visitors","visitors",n],["Searches","searches",n]],w2.states);
 w2.devices.forEach(function(x){h+='<h3>Devices, '+pn(x.product)+'</h3>'+table([["Device","k"],["Visitors","visitors",n],["Searches","searches",n]],x.rows);});
 h+='<h3>Zips typed for near me</h3>'+table([["Zip","zip"],["Times","times",n],["Visitors","visitors",n],["Last","last",function(v){return E(fmtT(v));}]],w2.zips);
 return h;};
var cur="launch",main,lTimer=null;
function wireLaunch(box){var c=document.getElementById("ad-crew");if(c)c.onchange=function(){crew=c.checked;show("launch");};box.querySelectorAll(".lrange button").forEach(function(b){b.onclick=function(){rng=b.getAttribute("data-r");show("launch");};});}
function refreshLaunch(){var box=document.getElementById("ad-body");if(!box||cur!=="launch")return;
 token().then(function(t){if(t)tok=t;return api({part:"launch",range:rng,crew:crew});}).then(function(d){if(cur!=="launch")return;var y=window.scrollY;box.innerHTML=R.launch(d);wireLaunch(box);window.scrollTo(0,y);}).catch(function(){});}
function show(part,extra){cur=part;if(lTimer){clearInterval(lTimer);lTimer=null;}main.querySelectorAll("nav button").forEach(function(b){b.className=b.getAttribute("data-p")===part?"on":"";});var box=document.getElementById("ad-body");box.innerHTML='<p class=note>Loading...</p>';
 token().then(function(t){if(t)tok=t;return api(Object.assign({part:part},part==="launch"?{range:rng,crew:crew}:part==="searches"?{range:rng,product:sf.product,outcome:sf.outcome,text:sf.text,crew:crew}:part==="users"?{text:ut,crew:crew}:{},extra||{}));}).then(function(d){box.innerHTML=R[part](d);
  if(part==="searches"||part==="users")wirePeople(box,part);
  if(part==="launch"){wireLaunch(box);lTimer=setInterval(function(){if(!document.hidden)refreshLaunch();},60000);}
  box.querySelectorAll("[data-anon]").forEach(function(a){a.onclick=function(e){e.preventDefault();show("journey",{anon:a.getAttribute("data-anon")});};});
  var bk=document.getElementById("ad-back");if(bk)bk.onclick=function(){show(part==="user_journey"?"users":"journey");};}).catch(function(){box.innerHTML='<p class=note>That part could not load. Try again in a moment.</p>';});}
token().then(function(t){if(!t)return;tok=t;return api({part:"me"}).then(function(){
 document.getElementById("ad-style").media="all";document.body.className="ad";document.title="GoAskSam numbers";
 main=document.querySelector("main");main.className="";main.innerHTML='<h1>GoAskSam numbers</h1><nav>'+PARTS.map(function(p){return '<button data-p="'+p[0]+'">'+E(p[1])+'</button>';}).join("")+'</nav><div id=ad-body></div>';
 main.querySelectorAll("nav button").forEach(function(b){b.onclick=function(){show(b.getAttribute("data-p"));};});show("launch");});}).catch(function(){});
})();</script></body></html>`;
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const q = req.query || {};

  if (req.method === "GET" && q.refresh) {
    const cron = process.env.CRON_SECRET && cronOk(req);
    if (!cron) return sendDisguisedNotFound(res);
    const env = storeEnv(); if (!env) return res.status(500).json({ ok: false, error: "store not configured" });
    try { return res.status(200).json({ ok: true, ...(await refresh(env, q.refresh === "night" ? "night" : "hour")) }); }
    catch (e) { return res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 120) }); }
  }
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(404).send(pageHtml());
  }
  if (req.method !== "POST") return sendDisguisedNotFound(res);
  const b = req.body && typeof req.body === "object" ? req.body : {};

  // A token refresh for the page, done here so the page never holds a key. Returns only the new session fields.
  if (b.part === "refresh") {
    const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon || typeof b.refresh_token !== "string" || b.refresh_token.length > 400) return sendDisguisedNotFound(res);
    try {
      const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { "Content-Type": "application/json", apikey: anon }, body: JSON.stringify({ refresh_token: b.refresh_token }) });
      if (!r.ok) return sendDisguisedNotFound(res);
      const j = await r.json();
      return res.status(200).json({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + Number(j.expires_in || 3600) });
    } catch { return sendDisguisedNotFound(res); }
  }

  // Our own server credential (header only, never the address) may read the same parts, plus "check" (is the store
  // receiving events) and "refresh_now" (today's summaries, as the hourly cron does). Anyone else needs ADMIN_EMAILS.
  const cred = hasServerCredential(req);
  const auth = cred ? null : await validateBearer(req.headers.authorization).catch(() => null);
  if (!cred && (!auth || !auth.email || !adminEmails().includes(auth.email))) return sendDisguisedNotFound(res);
  const env = storeEnv(); if (!env) return res.status(500).json({ error: "store not configured" });
  try {
    if (b.part === "check" && cred) return res.status(200).json(await storeCheck(env));
    if (b.part === "test_events" && cred) return res.status(200).json(await testEvents(env, typeof b.since === "string" ? b.since : null));
    if (b.part === "write_failures" && cred) return res.status(200).json(await writeFailures(env));
    if (b.part === "door" && cred) return res.status(200).json(await doorCheck(env, b.hours));
    if (b.part === "refresh_now" && cred) return res.status(200).json(await refresh(env, "hour"));
    if (b.part === "me") return res.status(200).json({ ok: true });
    if (b.part === "launch") return res.status(200).json(await launch(env, typeof b.range === "string" ? b.range : "today", b.crew === true));
    if (b.part === "searches") { const r = launchRange(typeof b.range === "string" ? b.range : "today"); return res.status(200).json(await searchesPanel(env, { from: r.from, to: r.to, product: b.product, outcome: b.outcome, text: b.text, crew: b.crew === true, limit: b.limit, asked: b.asked !== false })); }
    if (b.part === "users") return res.status(200).json(await usersPanel(env, { text: b.text, crew: b.crew === true, adminEmail: e => adminEmails().includes(String(e).toLowerCase()) }));
    if (b.part === "user_journey") return res.status(200).json({ ...(await userJourney(env, b.user)), user: true });
    if (b.part === "overview") return res.status(200).json(await overview(env));
    if (b.part === "reliability") return res.status(200).json(await reliability(env));
    if (b.part === "buy") return res.status(200).json(await buyAndMarketCheck(env));
    if (b.part === "demand") return res.status(200).json(await demand(env));
    if (b.part === "journey") return res.status(200).json(await journey(env, typeof b.anon === "string" ? b.anon : null));
    if (b.part === "retention") return res.status(200).json(await retention(env));
    if (b.part === "reconcile") return res.status(200).json(await reconcile(env, /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || "")) ? b.day : ptDay(-1), typeof b.since === "string" && Number.isFinite(Date.parse(b.since)) ? b.since : null));
  } catch (e) { return res.status(500).json({ error: "read failed" }); }
  return sendDisguisedNotFound(res);
}

// Analytics: an error event when this route throws or answers 5xx (a failed summary refresh shows as a cron failure).
export default withTracking("/api/admin", handler, "site");
