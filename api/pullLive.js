// Live feed pull (Lane C, Oct 2026). GET /api/pullLive
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or ?key=PROBE_KEY for a manual run.
//   ?probe=1          ONE metered request: returns the record keys + 2 samples, writes nothing.
//   ?max-requests=N   hard guard on metered requests this run (default 40; the cron uses the default).
// Fetches OCD /auctions/live (every source OCD carries live), upserts live_listings, marks listings
// that vanished from the feed as ended, and fills final_price from sales_archive once the sale lands.
// Idempotent: re-running only refreshes last_seen/current_bid and re-checks ended rows. Every metered
// request goes through lib/_ocd.js callOldCarsData (the shared daily cap + usage meter, read-only use).
import { callOldCarsData, configureOcdUsage, getOcdRunMetered, flushOcdUsage } from "../lib/_ocd.js";
import { historyEnv } from "./_historyData.js";
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
  const maxReq = Math.max(1, Math.min(200, Number((req.query && (req.query["max-requests"] || req.query.maxRequests)) || 40)));
  const limit = 100;

  try {
    if (req.query && req.query.probe) {
      const r = await callOldCarsData("/auctions/live", { page: 1, limit: 25 }, apiKey);
      const data = r.data || r.results || [];
      await flushOcdUsage();
      return res.status(200).json({ probe: true, ocdRequests: used(), meta: r.meta || null, keys: data[0] ? Object.keys(data[0]) : [], samples: data.slice(0, 2) });
    }
    // 1. Walk every page of the live feed, bounded by --max-requests.
    const seenAt = new Date().toISOString();
    const rows = [], perSource = {};
    let page = 1, total = null, truncated = false;
    while (true) {
      if (used() >= maxReq) { truncated = true; break; }
      const r = await callOldCarsData("/auctions/live", { page, limit }, apiKey);
      const data = r.data || r.results || [];
      if (total == null) total = (r.meta && (r.meta.total ?? r.meta.total_results ?? r.meta.count)) ?? null;
      for (const rec of data) {
        const row = mapLiveRecord(rec, seenAt);
        if (!row) continue;
        rows.push(row);
        perSource[row.source] = (perSource[row.source] || 0) + 1;
      }
      const pages = r.meta && (r.meta.total_pages ?? r.meta.pages ?? r.meta.last_page);
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
    return res.status(200).json({ ok: true, ocdRequests: used(), maxRequests: maxReq, truncated, feedTotal: total, fetched: rows.length, perSource, upserted: up, ended, finals, ...stats });
  } catch (e) {
    await flushOcdUsage().catch(() => {});
    return res.status(500).json({ ok: false, ocdRequests: used(), error: String((e && e.message) || e) });
  }
}
