// READ-ONLY measurement for the Buy cost and pull schedule report (Oct 2026, Lane C). Stored records only:
// live_listings, task_updates, watch_sends, app_usage_events, search_events. No vendor call, no write.
// Returns aggregates only (counts and hours), never a listing, an address or a user.
import { supabaseSelectAll } from "../_supabase.js";

const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" });
const ptHour = t => Number(PT.format(new Date(t))) % 24;
const H = 3600e3, DAY = 864e5;
const q = (xs, f) => { if (!xs.length) return null; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))]; };
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
const hours24 = () => Array.from({ length: 24 }, () => 0);

export async function liveTiming(env, { days = 60, recentDays = 30 } = {}) {
  const now = Date.now(), since = new Date(now - days * DAY).toISOString(), since30 = new Date(now - recentDays * DAY).toISOString();
  const rows = (await supabaseSelectAll(env, `live_listings?or=(first_seen.gte.${since},end_time.gte.${since})&select=id,source,first_seen,last_seen,end_time,bid_at,status&order=id.asc`)) || [];
  const oldest = (await supabaseSelectAll(env, `live_listings?select=first_seen&order=first_seen.asc&limit=1`, 1)) || [];
  const tableStart = oldest[0] && oldest[0].first_seen;
  const windowStart = Math.max(Date.parse(since), tableStart ? Date.parse(tableStart) : 0);

  // Actual live pull run times (the final usage row of each /api/pullLive run), for the window.
  const pullRows = (await supabaseSelectAll(env, `app_usage_events?created_at=gte.${since}&event_type=in.(pull_live_summary,pull_live_skipped)&select=created_at,event_type,metadata&order=created_at.asc`)) || [];
  const pulls = pullRows.filter(p => p.event_type === "pull_live_summary").map(p => Date.parse(p.created_at)).sort((a, b) => a - b);
  const gaps = pulls.slice(1).map((t, i) => (t - pulls[i]) / H);

  // JOB 2: per source, by Pacific hour: first seen (OUR pull time) and auction end (the source's own time).
  const bySource = {};
  const S = s => (bySource[s] = bySource[s] || { firstSeen: hours24(), ends: hours24(), firstSeenN: 0, endsN: 0, hoursFirstSeenToEnd: [] });
  for (const r of rows) {
    const src = r.source || "unknown", fs = Date.parse(r.first_seen), et = Date.parse(r.end_time);
    if (fs >= windowStart && fs <= now) { S(src).firstSeen[ptHour(fs)]++; S(src).firstSeenN++; }
    if (et >= windowStart && et <= now) { S(src).ends[ptHour(et)]++; S(src).endsN++; }
    if (fs >= Date.parse(since30) && et > fs) S(src).hoursFirstSeenToEnd.push((et - fs) / H);
  }
  for (const s of Object.values(bySource)) { const a = s.hoursFirstSeenToEnd; s.hoursFirstSeenToEnd = { n: a.length, p10: r1(q(a, 0.1)), median: r1(q(a, 0.5)), p90: r1(q(a, 0.9)), max: r1(a.length ? Math.max(...a) : null) }; }

  // JOB 3: Task email (task_updates kind=match) and Keep looking email (watch_sends l:<id>) after first seen.
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  const tu = (await supabaseSelectAll(env, `task_updates?kind=eq.match&created_at=gte.${since30}&emailed_at=not.is.null&select=listing_ids,emailed_at,email_status,created_at&order=id.asc`)) || [];
  const ws = (await supabaseSelectAll(env, `watch_sends?sent_at=gte.${since30}&event_key=like.l:*&select=event_key,sent_at,send_status&order=id.asc`)) || [];
  const lag = { task: [], keep: [] };
  for (const u of tu) for (const id of u.listing_ids || []) { const r = byId.get(Number(id)); if (r && r.first_seen) lag.task.push({ h: (Date.parse(u.emailed_at) - Date.parse(r.first_seen)) / H, at: Date.parse(r.first_seen), status: u.email_status }); }
  for (const w of ws) { const r = byId.get(Number(String(w.event_key).slice(2))); if (r && r.first_seen) lag.keep.push({ h: (Date.parse(w.sent_at) - Date.parse(r.first_seen)) / H, at: Date.parse(r.first_seen), status: w.send_status }); }
  const byHour = list => { const out = []; for (let h = 0; h < 24; h++) { const xs = list.filter(x => ptHour(x.at) === h).map(x => x.h); if (xs.length) out.push({ hourPT: h, n: xs.length, median: r1(q(xs, 0.5)), p90: r1(q(xs, 0.9)) }); } return out; };
  const sum = list => { const xs = list.map(x => x.h); return { n: xs.length, median: r1(q(xs, 0.5)), p90: r1(q(xs, 0.9)), statuses: list.reduce((m, x) => (m[x.status || "none"] = (m[x.status || "none"] || 0) + 1, m), {}), byHourPT: byHour(list) }; };

  // JOB 4: cars that ended in the last 30 days. Age of our stored snapshot (last_seen) and of the feed's own
  // bid time (bid_at) at the end time; and, minute by minute through each car's last hour, how old the
  // stored bid was given the real pull times (a pull that ran inside the hour refreshes it from then on).
  const ended = rows.filter(r => { const et = Date.parse(r.end_time); return et >= Date.parse(since30) && et <= now && r.first_seen; });
  const pullBefore = t => { let lo = 0, hi = pulls.length - 1, best = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (pulls[m] <= t) { best = pulls[m]; lo = m + 1; } else hi = m - 1; } return best; };
  const fresh = [];
  for (const r of ended) {
    const et = Date.parse(r.end_time), ls = Date.parse(r.last_seen), ba = r.bid_at ? Date.parse(r.bid_at) : null;
    let staleMin = 0;
    for (let m = 0; m < 60; m++) { const t = et - (60 - m) * 60e3, p = pullBefore(t); const seenFrom = Math.max(p || 0, Date.parse(r.first_seen)); if (t - seenFrom > H) staleMin++; }
    fresh.push({ hourPT: ptHour(et), snapAgeH: (et - ls) / H, bidAgeH: ba ? (et - ba) / H : null, staleMin, source: r.source });
  }
  const freshByHour = []; for (let h = 0; h < 24; h++) { const xs = fresh.filter(x => x.hourPT === h); if (!xs.length) continue; const sa = xs.map(x => x.snapAgeH).filter(x => x >= 0), ba = xs.map(x => x.bidAgeH).filter(x => x != null && x >= 0); freshByHour.push({ hourPT: h, n: xs.length, snapAgeMedianH: r1(q(sa, 0.5)), snapAgeP90H: r1(q(sa, 0.9)), bidAgeMedianH: r1(q(ba, 0.5)), share_final_hour_minutes_over_1h: r1(100 * xs.reduce((k, x) => k + x.staleMin, 0) / (xs.length * 60)), share_cars_any_minute_over_1h: r1(100 * xs.filter(x => x.staleMin > 0).length / xs.length) }); }
  const allSnap = fresh.map(x => x.snapAgeH).filter(x => x >= 0), allBid = fresh.map(x => x.bidAgeH).filter(x => x != null && x >= 0);

  // JOB 1 and 5: metered vendor requests by job by day, Buy chat model use, Buy searches.
  const ocd = (await supabaseSelectAll(env, `app_usage_events?created_at=gte.${since30}&event_type=eq.ocd_call&select=created_at,oldcarsdata_metered_requests,metadata&order=id.asc`)) || [];
  const ocdByJob = {}; for (const o of ocd) { const j = (o.metadata && o.metadata.job) || "unlabelled", d = String(o.created_at).slice(0, 10); ocdByJob[j] = ocdByJob[j] || {}; ocdByJob[j][d] = (ocdByJob[j][d] || 0) + (Number(o.oldcarsdata_metered_requests) || 0); }
  const ocdJobs = Object.fromEntries(Object.entries(ocdByJob).map(([j, m]) => { const v = Object.values(m); return [j, { days: v.length, total: v.reduce((a, b) => a + b, 0), perDayMedian: q(v, 0.5), perDayMax: Math.max(...v) }]; }));
  const runs = pullRows.filter(p => p.event_type === "pull_live_summary").map(p => (p.metadata || {}));
  const chat = (await supabaseSelectAll(env, `app_usage_events?created_at=gte.${since30}&event_type=eq.buy_chat_turn&select=created_at,anthropic_model,anthropic_input_tokens,anthropic_output_tokens,anthropic_cost_usd,metadata&order=id.asc`)) || [];
  const tok = k => chat.map(c => Number(c[k]) || 0);
  const searches = (await supabaseSelectAll(env, `search_events?surface=eq.buy&created_at=gte.${since30}&select=created_at&order=id.asc`)) || [];

  return {
    window: { days, recentDays, from: new Date(windowStart).toISOString(), to: new Date(now).toISOString(), daysUsed: r1((now - windowStart) / DAY), tableFirstRow: tableStart || null, rowsRead: rows.length },
    pulls: { runs: pulls.length, skipped: pullRows.filter(p => p.event_type === "pull_live_skipped").length, gapHours: { median: r1(q(gaps, 0.5)), p90: r1(q(gaps, 0.9)), max: r1(gaps.length ? Math.max(...gaps) : null) }, runHourPT: pulls.reduce((m, t) => (m[ptHour(t)] = (m[ptHour(t)] || 0) + 1, m), {}), fetchedPerRun: { median: q(runs.map(m => Number(m.fetched) || 0).filter(Boolean), 0.5) }, sampleMeta: runs.slice(-2) },
    bySource,
    emailLagHours: { task: sum(lag.task), keepLooking: sum(lag.keep), taskUpdateRows: tu.length, keepRows: ws.length },
    bidFreshness: { ended: fresh.length, snapAgeH: { median: r1(q(allSnap, 0.5)), p90: r1(q(allSnap, 0.9)) }, bidAgeH: { n: allBid.length, median: r1(q(allBid, 0.5)), p90: r1(q(allBid, 0.9)) }, share_final_hour_minutes_over_1h: r1(100 * fresh.reduce((k, x) => k + x.staleMin, 0) / Math.max(1, fresh.length * 60)), share_cars_any_minute_over_1h: r1(100 * fresh.filter(x => x.staleMin > 0).length / Math.max(1, fresh.length)), byHourPT: freshByHour },
    vendor: { ocdCallRows: ocd.length, byJob: ocdJobs },
    buyChat: { turns: chat.length, models: chat.reduce((m, c) => (m[c.anthropic_model || "?"] = (m[c.anthropic_model || "?"] || 0) + 1, m), {}), inTokens: { median: q(tok("anthropic_input_tokens"), 0.5), p90: q(tok("anthropic_input_tokens"), 0.9), total: tok("anthropic_input_tokens").reduce((a, b) => a + b, 0) }, outTokens: { median: q(tok("anthropic_output_tokens"), 0.5), p90: q(tok("anthropic_output_tokens"), 0.9), total: tok("anthropic_output_tokens").reduce((a, b) => a + b, 0) }, costUsd: { median: q(chat.map(c => Number(c.anthropic_cost_usd) || 0), 0.5), total: r1(chat.reduce((a, c) => a + (Number(c.anthropic_cost_usd) || 0), 0) * 100) / 100 }, toolsPerTurn: q(chat.map(c => { const t = (c.metadata || {}).tools; return Array.isArray(t) ? t.length : Number(t) || 0; }), 0.5), latencyMs: q(chat.map(c => Number((c.metadata || {}).latency_ms) || 0).filter(Boolean), 0.5) },
    buySearches: { n: searches.length, perDay: r1(searches.length / recentDays) }
  };
}
