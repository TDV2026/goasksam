// Live feed pull (Lane C, Oct 2026). GET /api/pullLive
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or ?key=PROBE_KEY for a manual run.
//   ?probe=1          ONE metered request: returns the record keys + 2 samples, writes nothing.
//   ?max-requests=N   hard guard on metered requests this run (default 30, a full walk is ~19 at 100/page; the cron uses the default).
// Fetches OCD /auctions/live (every source OCD carries live), upserts live_listings, marks listings
// that vanished from the feed as ended, and fills final_price from sales_archive once the sale lands.
// Idempotent: re-running only refreshes last_seen/current_bid and re-checks ended rows. Every metered
// request goes through lib/_ocd.js callOldCarsData (the shared daily cap + usage meter, read-only use).
import { callOldCarsData, configureOcdUsage, getOcdRunMetered, flushOcdUsage } from "../lib/_ocd.js";
import { historyEnv } from "./_historyData.js";
import { recordUsageEvent } from "./_usage.js";
import { mapLiveRecord, upsertLive, markVanished, fillFinalPrices, liveStats } from "../lib/live/feed.js";

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET, probeKey = process.env.PROBE_KEY || process.env.OPS_KEY;
  const isCron = !!cronSecret && String(req.headers["authorization"] || "") === `Bearer ${cronSecret}`;
  const provided = req.headers["x-ops-key"] || (req.query && req.query.key);
  if (!isCron && (!probeKey || provided !== probeKey)) return res.status(401).json({ error: "Unauthorized." });
  const apiKey = process.env.OLDCARSDATA_API_KEY;
  const env = historyEnv();
  if (!apiKey || !env) return res.status(500).json({ error: "OCD or Supabase env missing." });
  configureOcdUsage({ ...env, job: "pull_live" });
  const start = getOcdRunMetered();
  const used = () => getOcdRunMetered() - start;
  const maxReq = Math.max(1, Math.min(200, Number((req.query && (req.query["max-requests"] || req.query.maxRequests)) || 30)));
  const limit = Math.max(25, Math.min(1000, Number(process.env.LIVE_PAGE_LIMIT || 100)));

  try {
    // ?usage=1: ZERO OCD. Metered requests this job recorded today (UTC), from app_usage_events.
    if (req.query && req.query.usage) {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const rr = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?created_at=gte.${since.toISOString()}&route=eq.pull_live&select=created_at,oldcarsdata_metered_requests,status&order=created_at.asc&limit=500`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
      const rows = rr.ok ? await rr.json() : [];
      return res.status(200).json({ usage: true, ocdRequests: 0, todayPullLiveMetered: rows.reduce((k, r) => k + (Number(r.oldcarsdata_metered_requests) || 0), 0), rows });
    }
    if (req.query && req.query.probe) {
      const r = await callOldCarsData("/auctions/live", { page: 1, limit: Math.min(1000, Number(req.query.limit) || 25) }, apiKey);
      const data = r.data || r.results || [];
      await flushOcdUsage();
      return res.status(200).json({ probe: true, ocdRequests: used(), returned: data.length, meta: r.meta || null, keys: data[0] ? Object.keys(data[0]) : [], samples: data.slice(0, 2) });
    }
    // 0. Monthly guard: skip the whole run while OCD's own remaining monthly quota (the header /sell
    // persists to app_config ocd_rate_limit) is below OCD_SELL_MONTHLY_RESERVE + 100. Logged when skipped.
    const reserve = Number(process.env.OCD_SELL_MONTHLY_RESERVE || 450) + 100;
    const rl = await readRemaining(env);
    if (rl && rl.fresh && rl.remaining < reserve) {
      await recordUsageEvent({ event_type: "pull_live_skipped", route: "pull_live", status: "skipped", oldcarsdata_metered_requests: 0, metadata: { remaining: rl.remaining, reserve, at: rl.at } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, skipped: "monthly OCD remaining below reserve", remaining: rl.remaining, reserve, ocdRequests: 0 });
    }
    // 1. Walk every page of the live feed, bounded by --max-requests.
    const seenAt = new Date().toISOString();
    const rows = [], perSource = {};
    let page = 1, total = null, truncated = false, stoppedForReserve = null;
    while (true) {
      if (used() >= maxReq) { truncated = true; break; }
      const r = await ocdWithRetry(() => callOldCarsData("/auctions/live", { page, limit }, apiKey), used, maxReq);
      const hdr = r.__rateLimit && r.__rateLimit.remaining != null ? Number(r.__rateLimit.remaining) : null;
      if (hdr != null && hdr < reserve) { stoppedForReserve = hdr; truncated = true; }
      const data = r.data || r.results || [];
      if (total == null) total = (r.meta && (r.meta.total ?? r.meta.total_results ?? r.meta.count)) ?? null;
      for (const rec of data) {
        const row = mapLiveRecord(rec, seenAt);
        if (!row) continue;
        rows.push(row);
        perSource[row.source] = (perSource[row.source] || 0) + 1;
      }
      const pages = r.meta && (r.meta.total_pages ?? r.meta.pages ?? r.meta.last_page);
      if (stoppedForReserve != null) break;
      if (!data.length || data.length < limit || (pages && page >= pages) || (total != null && page * limit >= total)) break;
      page++;
    }
    // 2. Upsert. 3. Vanished -> ended (only when the walk was COMPLETE, so a truncated run never
    // ends live cars it simply did not reach). 4. Final prices from the archive.
    const up = await upsertLive(env, rows);
    const ended = truncated ? { skipped: "walk truncated by max-requests" } : await markVanished(env, seenAt);
    const finals = await fillFinalPrices(env);
    const stats = await liveStats(env, rows);
    await flushOcdUsage();
    if (stoppedForReserve != null) await recordUsageEvent({ event_type: "pull_live_skipped", route: "pull_live", status: "stopped", oldcarsdata_metered_requests: 0, metadata: { remaining: stoppedForReserve, reserve } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    return res.status(200).json({ ok: true, ocdRequests: used(), maxRequests: maxReq, truncated, stoppedForReserve, feedTotal: total, fetched: rows.length, perSource, upserted: up, ended, finals, ...stats });
  } catch (e) {
    await flushOcdUsage().catch(() => {});
    return res.status(500).json({ ok: false, ocdRequests: used(), error: String((e && e.message) || e).slice(0, 300) });
  }
}

// A metered call with at most 2 retries, and only for a 5xx or a network failure. Any 4xx stops at
// once (a 4xx is never retried: it costs a request and will not change), as does the run's cap.
async function ocdWithRetry(fn, used, maxReq) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const st = Number(e && e.status);
      if (e && e.ocdHardCap) throw e;
      if (st >= 400 && st < 500) throw e;
      if (attempt === 2 || used() >= maxReq) throw e;
    }
  }
  throw last;
}
// OCD's monthly remaining, as persisted by /sell from the response header (app_config ocd_rate_limit).
async function readRemaining(env) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=eq.ocd_rate_limit&select=value&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json(); const raw = rows && rows[0] && rows[0].value; if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const remaining = Number(v && v.remaining), at = Number(v && v.at) || 0;
    if (!Number.isFinite(remaining)) return null;
    return { remaining, at, fresh: at > 0 && Date.now() - at < 6 * 3600e3 };
  } catch { return null; }
}
