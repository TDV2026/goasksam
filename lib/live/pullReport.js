// THE PULL REPORT (Lane C, Oct 2026): how the live pull schedule (lib/live/pullSchedule.js) did over a window.
// READ ONLY, stored records only (app_usage_events, live_listings): no vendor call, no write. Aggregates only,
// never a listing, an address or a user. Served at GET /api/pullLive?report=1 (probe key) and run from the
// command line by scripts/pullReport.mjs.
//   requests      metered vendor requests by the pull job (route pull_live), and how many runs of each kind
//   started by    the same requests and runs split by who started them (started_by on each row: scheduled, probe,
//                 admin, unknown). Rows written before the field existed (Oct 12 2026) count as unknown, never guessed.
//   new cars      cars first seen, per pull type (full walk = pull_live_summary, ending soonest = pull_live_mode)
//   busy window   each ending-soonest pull: Pacific time, pages, hours covered ahead, cut short by the page cap
//   tasks         full Tasks runs (tasks_run rows; an at-once exit logs nothing) and whether each pull that found
//                 a new car was followed by a Tasks run within 20 minutes
//   stale bids    for cars that ended in the window, the share of final-hour minutes in which our stored bid was
//                 over an hour old: the same measure as the Oct 11 baseline (69.3 percent), except that an
//                 ending-soonest pull now refreshes the cars it returned (those ending by the last car it read).
import { supabaseSelectAll } from "../_supabase.js";

const H = 3600e3;
const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ptHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" });
const pt = t => PT.format(new Date(t));
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
export const BASELINE_STALE_SHARE = 69.3;   // Oct 11 2026, 890 ended cars, the 4-hourly walks before option 1

// Pacific calendar day YYYY-MM-DD -> [start, end) in UTC milliseconds (handles either clock offset).
export function pacificDay(dateIso) {
  const [y, m, d] = String(dateIso).split("-").map(Number);
  const offsetAt = t => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map(x => [x.type, Number(x.value)])); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - t; };
  const at = (yy, mm, dd) => { const g = Date.UTC(yy, mm - 1, dd); return g - offsetAt(g - offsetAt(g)); };
  return [at(y, m, d), at(y, m, d + 1)];
}

export async function pullReport(env, { from, to } = {}) {
  const now = Date.now();
  const end = Math.min(Number(to) || now, now), start = Number(from) || end - 24 * H;
  const iso = t => new Date(t).toISOString();
  // Pull rows from a day before the window, so a car ending early in the window still has the pull before it.
  const ev = (await supabaseSelectAll(env, `app_usage_events?route=eq.pull_live&created_at=gte.${iso(start - 24 * H)}&created_at=lt.${iso(end)}&select=created_at,event_type,status,oldcarsdata_metered_requests,metadata&order=created_at.asc`)) || [];
  const inWin = e => { const t = Date.parse(e.created_at); return t >= start && t < end; };
  const meta = e => e.metadata || {};

  const requests = ev.filter(inWin).reduce((k, e) => k + (Number(e.oldcarsdata_metered_requests) || 0), 0);
  const fulls = ev.filter(e => e.event_type === "pull_live_summary");
  const modes = ev.filter(e => e.event_type === "pull_live_mode");
  const endings = modes.filter(e => meta(e).mode === "ending");
  const starterOf = e => meta(e).started_by || "unknown";
  const full = fulls.filter(inWin).map(e => ({ at: pt(e.created_at), fetched: meta(e).fetched || 0, newListings: meta(e).newListings || 0, startedBy: starterOf(e), startedDetail: meta(e).started_detail || null }));
  const ending = endings.filter(inWin).map(e => { const m = meta(e); return { at: pt(e.created_at), startedBy: starterOf(e), startedDetail: m.started_detail || null, pages: m.pages || 0, requests: m.ocdRequests || 0, fetched: m.fetched || 0, newListings: m.newListings || 0, hoursAhead: m.coveredHoursAhead, cappedShort: !!m.cappedShort }; });
  const other = modes.filter(inWin).filter(e => meta(e).mode !== "ending").length;
  const skipped = ev.filter(inWin).filter(e => e.event_type === "pull_live_skipped").length;
  const sum = (xs, k) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const pagesHist = ending.reduce((m, x) => (m[x.pages] = (m[x.pages] || 0) + 1, m), {});
  // Spend and runs by who started them: requests from the ocd_call rows, runs from the run rows.
  const byStarter = {};
  for (const e of ev.filter(inWin)) {
    const b = byStarter[starterOf(e)] = byStarter[starterOf(e)] || { requests: 0, fullWalks: 0, endingSoonest: 0, otherPulls: 0, skipped: 0, byDetail: {} };
    const n = Number(e.oldcarsdata_metered_requests) || 0, d = meta(e).started_detail || "not recorded";
    if (n) { b.requests += n; b.byDetail[d] = (b.byDetail[d] || 0) + n; }
    if (e.event_type === "pull_live_summary") b.fullWalks++;
    else if (e.event_type === "pull_live_mode") { if (meta(e).mode === "ending") b.endingSoonest++; else b.otherPulls++; }
    else if (e.event_type === "pull_live_skipped") b.skipped++;
  }

  // Tasks: full runs in the window, and the first full run after each pull that found a new car.
  const runs = (await supabaseSelectAll(env, `app_usage_events?event_type=eq.tasks_run&created_at=gte.${iso(start)}&created_at=lt.${iso(end + H)}&select=created_at,status,metadata&order=created_at.asc`)) || [];
  const runTimes = runs.filter(r => r.status === "ok").map(r => Date.parse(r.created_at));
  const finders = [...fulls, ...endings].filter(inWin).filter(e => (meta(e).newListings || 0) > 0).map(e => Date.parse(e.created_at)).sort((a, b) => a - b);
  const lags = finders.map(t => { const r = runTimes.find(x => x >= t); return r == null ? null : (r - t) / 60e3; });
  const tasks = {
    fullRuns: runs.filter(r => Date.parse(r.created_at) < end && Date.parse(r.created_at) >= start && r.status === "ok").length,
    errors: runs.filter(r => Date.parse(r.created_at) < end && r.status !== "ok").length,
    pullsThatFoundCars: finders.length,
    followedWithin20Min: lags.filter(x => x != null && x <= 20).length,
    minutesToRun: { median: r1(lags.filter(x => x != null).sort((a, b) => a - b)[Math.floor(lags.filter(x => x != null).length / 2)] ?? null), max: r1(lags.some(x => x != null) ? Math.max(...lags.filter(x => x != null)) : null) }
  };

  // Stale bids. A full walk refreshes every live car; an ending-soonest pull refreshes the cars it returned,
  // that is those ending after the pull and no later than the last car it read (order.last).
  const walks = fulls.map(e => Date.parse(e.created_at)).sort((a, b) => a - b);
  const short = endings.map(e => ({ t: Date.parse(e.created_at), last: Date.parse((meta(e).order || {}).last || "") })).filter(x => Number.isFinite(x.last));
  const firstPull = walks[0];
  const ended = firstPull == null ? [] : ((await supabaseSelectAll(env, `live_listings?end_time=gte.${iso(Math.max(start, firstPull + H))}&end_time=lt.${iso(end)}&first_seen=not.is.null&select=first_seen,end_time&order=id.asc`)) || []);
  let staleMin = 0, carsAny = 0; const byHour = {};
  for (const r of ended) {
    const et = Date.parse(r.end_time), fs = Date.parse(r.first_seen);
    const refresh = walks.filter(t => t < et).concat(short.filter(x => x.t < et && et <= x.last).map(x => x.t)).sort((a, b) => a - b);
    let s = 0, i = 0, last = null;
    for (let m = 0; m < 60; m++) { const t = et - (60 - m) * 60e3; while (i < refresh.length && refresh[i] <= t) last = refresh[i++]; if (t - Math.max(last || 0, fs) > H) s++; }
    staleMin += s; if (s) carsAny++;
    const h = Number(ptHour.format(new Date(et))) % 24; const b = byHour[h] = byHour[h] || { cars: 0, staleMin: 0 }; b.cars++; b.staleMin += s;
  }
  const share = ended.length ? r1(100 * staleMin / (ended.length * 60)) : null;

  // Cars that ended before an email could carry them (the combined Task email, lib/tasks/digest.js): a Task update
  // whose cars had all ended at send time (task_updates email_status "ended"), and an armed Before it ends car that
  // ended first (buy_alerts send_status "ended_before_send"). Cars dropped from an update that still had live ones
  // are not counted here.
  const endedUps = (await supabaseSelectAll(env, `task_updates?email_status=eq.ended&created_at=gte.${iso(start)}&created_at=lt.${iso(end)}&select=data`).catch(() => null)) || [];
  const endedAlerts = (await supabaseSelectAll(env, `buy_alerts?send_status=eq.ended_before_send&sent_at=gte.${iso(start)}&sent_at=lt.${iso(end)}&select=id`).catch(() => null)) || [];
  const endedBeforeEmail = { taskUpdates: endedUps.length, cars: endedUps.reduce((k, u) => k + (((u.data || {}).cards || []).length), 0), beforeItEnds: endedAlerts.length };

  return {
    endedBeforeEmail,
    window: { from: iso(start), to: iso(end), fromPT: pt(start), toPT: pt(end) },
    startedBy: byStarter,
    requests: { total: requests, fullWalks: full.length, endingSoonest: ending.length, otherPulls: other, skippedForReserve: skipped, byType: { endingSoonest: sum(ending, "requests"), fullWalksAndAnyOther: requests - sum(ending, "requests") } },
    newCars: { fullWalk: sum(full, "newListings"), endingSoonest: sum(ending, "newListings") },
    busyWindow: { pulls: ending.length, pagesNeeded: pagesHist, cappedShort: ending.filter(x => x.cappedShort).length, maxPages: ending.reduce((k, x) => Math.max(k, x.pages), 0) },
    full, ending, tasks,
    staleBids: { endedCars: ended.length, shareFinalHourMinutesOver1h: share, baseline: BASELINE_STALE_SHARE, shareCarsAnyMinuteOver1h: ended.length ? r1(100 * carsAny / ended.length) : null, byEndHourPT: Object.entries(byHour).map(([h, b]) => ({ hourPT: Number(h), cars: b.cars, share: r1(100 * b.staleMin / (b.cars * 60)) })).sort((a, b) => a.hourPT - b.hourPT) }
  };
}
