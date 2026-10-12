// Live feed pull (Lane C, Oct 2026). GET /api/pullLive
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or ?key=PROBE_KEY for a manual run.
//   ?probe=1          ONE metered request: returns the record keys + 2 samples, writes nothing.
//   ?max-requests=N   hard guard on metered requests this run (default 30, a full walk is ~19 at 100/page; the cron uses the default).
//   ?mode=auto        THE CRON (every 15 minutes, UTC): runs whatever lib/live/pullSchedule.js gives this Pacific
//                     quarter hour (full walk, ending soonest, newest) or nothing at all. ZERO OCD when nothing.
//   ?mode=auto&dryrun=1[&date=YYYY-MM-DD]  ZERO OCD: the plan for every quarter hour of that UTC day.
//   ?mode=ending / ?mode=new   one pull of that kind (2 pages unless max-requests says less).
//   ?report=1[&date=YYYY-MM-DD]  ZERO OCD, read only: how the schedule did (scripts/pullReport.mjs).
// Fetches OCD /auctions/live (every source OCD carries live), upserts live_listings, marks listings
// that vanished from the feed as ended, and fills final_price from sales_archive once the sale lands.
// Idempotent: re-running only refreshes last_seen/current_bid and re-checks ended rows. Every metered
// request goes through lib/_ocd.js callOldCarsData (the shared daily cap + usage meter, read-only use).
import { withTracking } from "../lib/track/log.js";
import { callOldCarsData, configureOcdUsage, getOcdRunMetered, flushOcdUsage } from "../lib/_ocd.js";
import { historyEnv } from "./_historyData.js";
import { recordUsageEvent } from "./_usage.js";
import { ocdWithRetry, readRemaining, reserveFloor } from "../lib/live/ocdGuard.js";
import { pullFor, dayPlan, PAGES, ENDING_AHEAD_MS } from "../lib/live/pullSchedule.js";
import { mapLiveRecord, upsertLive, markVanished, fillFinalPrices, liveStats } from "../lib/live/feed.js";

async function handler(req, res) {
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
      const rr = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?created_at=gte.${since.toISOString()}&route=eq.pull_live&select=created_at,event_type,oldcarsdata_metered_requests,status,metadata&order=created_at.asc&limit=500`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
      const rows = rr.ok ? await rr.json() : [];
      return res.status(200).json({ usage: true, ocdRequests: 0, todayPullLiveMetered: rows.reduce((k, r) => k + (Number(r.oldcarsdata_metered_requests) || 0), 0), rows });
    }
    // ?report=1[&date=YYYY-MM-DD Pacific day | &from=ISO&to=ISO]: ZERO OCD, read only. How the pull schedule did
    // (requests, new cars per pull type, busy-window pages, Tasks runs, stale bids): lib/live/pullReport.js.
    if (req.query && req.query.report) {
      const { pullReport, pacificDay } = await import("../lib/live/pullReport.js");
      const q = req.query, win = q.date ? pacificDay(String(q.date).slice(0, 10)) : [Date.parse(q.from || ""), Date.parse(q.to || "")];
      return res.status(200).json({ report: true, ocdRequests: 0, ...(await pullReport(env, { from: win[0], to: win[1] })) });
    }
    if (req.query && req.query.probe) {
      // Cap 100, not 1000 (Oct 2026 fix): OCD's own /auctions/live rejects limit over 100 ("limit:
      // Too big: expected number to be <=100") - confirmed live, the prior 1000 cap let a caller send
      // a value the vendor would just 400 on. No behavior change for any value already under 100.
      // &probePage=N (default 1): walks the vendor's own soonest-ending-first default order one
      // metered request per page, so a specific-listing presence question that isn't near page 1 can
      // still be answered without guessing - see &find= below. Named separately from the file's other
      // `page` variables so this branch can never be confused with a real pull's pagination.
      const probePage = Math.max(1, Number(req.query.probePage) || 1);
      const r = await callOldCarsData("/auctions/live", { page: probePage, limit: Math.min(100, Number(req.query.limit) || 25) }, apiKey);
      const data = r.data || r.results || [];
      await flushOcdUsage();
      // &find=<text>: ONE metered request (same as any other ?probe=1 call, still writes nothing -
      // no mapLiveRecord/upsertLive call here, unlike every other branch in this file). Searches the
      // FULL returned page (not just the 2 samples below) for a case-insensitive substring match
      // against title/source_listing_id/url-ish fields, so a specific-listing presence question
      // ("is OCD's own live feed carrying X right now") can be answered without a second vendor call
      // or any write. /auctions/live has no source/make filter server-side (confirmed by reading this
      // file's other branches - only page/limit/sort/direction are ever sent) - this walks the
      // vendor's own default order (soonest-ending first), one real page per call.
      const find = req.query.find ? String(req.query.find).toLowerCase() : null;
      const match = find ? data.filter(rec => JSON.stringify(rec).toLowerCase().includes(find)) : null;
      // endRange: the page's own min/max auction_end_at (not just 2 samples) - lets a caller triangulate
      // which page a target end-time sits on without spending an extra request per guess.
      const ends = data.map(rec => Date.parse(String(rec.auction_end_at || rec.auction_end_date || "").replace(" ", "T") + "Z")).filter(Number.isFinite).sort((a, b) => a - b);
      const endRange = ends.length ? { firstEndsAt: new Date(ends[0]).toISOString(), lastEndsAt: new Date(ends[ends.length - 1]).toISOString(), hoursFromNowFirst: Math.round((ends[0] - Date.now()) / 36e5 * 10) / 10, hoursFromNowLast: Math.round((ends[ends.length - 1] - Date.now()) / 36e5 * 10) / 10 } : null;
      return res.status(200).json({ probe: true, probePage, ocdRequests: used(), returned: data.length, meta: r.meta || null, endRange, keys: data[0] ? Object.keys(data[0]) : [], samples: data.slice(0, 2), find, matchCount: match ? match.length : null, matches: match ? match.slice(0, 5) : null });
    }
    // The schedule (lib/live/pullSchedule.js): a dry run answers from the clock alone, no vendor call.
    let mode = String((req.query && req.query.mode) || "");
    if (mode === "auto") {
      if (req.query.dryrun) return res.status(200).json({ ok: true, dryrun: true, ocdRequests: 0, now: pullFor(new Date()), plan: dayPlan(String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10)) });
      const slot = pullFor(new Date());
      if (!slot.mode) return res.status(200).json({ ok: true, slot, nothing: true, ocdRequests: 0 });
      mode = slot.mode === "full" ? "" : slot.mode;
    }
    // 0. Monthly guard: skip the whole run while OCD's own remaining monthly quota (the header /sell
    // persists to app_config ocd_rate_limit) is below OCD_SELL_MONTHLY_RESERVE + 100. Logged when skipped.
    const reserve = reserveFloor();
    const rl = await readRemaining(env);
    if (rl && rl.fresh && rl.remaining < reserve) {
      await recordUsageEvent({ event_type: "pull_live_skipped", route: "pull_live", status: "skipped", oldcarsdata_metered_requests: 0, metadata: { remaining: rl.remaining, reserve, at: rl.at } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, skipped: "monthly OCD remaining below reserve", remaining: rl.remaining, reserve, ocdRequests: 0 });
    }
    // Ending soonest and newest (the schedule's short pulls, or one credentialed test run). Each page's own sort
    // field is checked against the order asked for, so a test shows whether the vendor honoured the sort.
    if (mode === "new" || mode === "ending") {
      const seenAt = new Date().toISOString(), rows = [], cap = Math.min(PAGES[mode] || 2, maxReq);
      // Ending soonest is the vendor's DEFAULT order (soonest-ending first; every sort option tried was rejected).
      // "new" has no working order and is not scheduled; it stays only as a credentialed test.
      let params = mode === "new" ? { sort: "created_at", direction: "desc" } : {};
      // A credentialed test may name the sort to try (&sort=<name>&direction=asc|desc, or &sort=none for the
      // vendor's default order); the order that comes back is checked below. The cron never sends this.
      if (!isCron && req.query.sort != null) params = String(req.query.sort) === "none" ? {} : { sort: String(req.query.sort).slice(0, 40), direction: String(req.query.direction || "asc") === "desc" ? "desc" : "asc" };
      const field = mode === "new" ? "created_at" : "auction_end_at", seq = [];
      let pagesRead = 0;
      // &fromEnd=1 (test): the vendor's default order is soonest-ending first, so its LAST pages are the
      // latest-ending auctions (for fixed-length auctions, the newest listed). The last page number comes from
      // the latest full walk's own count (pull_live_summary), with no extra vendor call.
      let pageList = null;
      if (req.query.fromEnd) {
        const last = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=eq.pull_live_summary&select=metadata&order=created_at.desc&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }).then(r => r.ok ? r.json() : []).catch(() => []);
        const total = Number(last && last[0] && last[0].metadata && last[0].metadata.fetched) || 0;
        const lastPage = Math.max(1, Math.ceil(total / limit));
        pageList = []; for (let k = 0; k < cap; k++) if (lastPage - k >= 1) pageList.push(lastPage - k);
        params = {};
      }
      for (let i = 0, page = pageList ? pageList[0] : 1; (pageList ? i < pageList.length : page <= cap) && used() < maxReq; i++, page = pageList ? pageList[i] : page + 1) {
        const r = await ocdWithRetry(() => callOldCarsData("/auctions/live", { page, limit, ...params }, apiKey), used, maxReq);
        await flushOcdUsage();   // record the spend page by page, so a timeout never loses the count
        pagesRead++;
        const hdr = r.__rateLimit && r.__rateLimit.remaining != null ? Number(r.__rateLimit.remaining) : null;
        const data = r.data || r.results || [];
        for (const rec of data) { const t = Date.parse(String(rec[field] || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(rec[field] || "")) ? "" : "Z")); if (Number.isFinite(t)) seq.push(t); }
        const mapped = data.map(rec => mapLiveRecord(rec, seenAt)).filter(Boolean);
        rows.push(...mapped);
        if (hdr != null && hdr < reserve) break;
        if (data.length < limit) break;
        // Page on until the last car returned ends more than 6 hours ahead (capped above at 3 pages), so a busy
        // window with more than 100 cars ending soon is never cut off.
        if (mode === "ending") { const lastEnd = Date.parse(mapped.length ? mapped[mapped.length - 1].end_time : ""); if (!(lastEnd < Date.now() + ENDING_AHEAD_MS)) break; }
        if (mode === "new") { const ids = mapped.map(m => m.source_listing_id); const known = await knownIds(env, ids); if (known >= ids.length) break; }
      }
      const wrong = seq.slice(1).filter((t, i) => mode === "new" ? t > seq[i] : t < seq[i]).length;
      const ages = seq.map(t => (Date.now() - t) / 3600e3).sort((a, b) => a - b);
      const createdAge = mode === "new" && ages.length ? { pages: pageList, medianHours: Math.round(ages[Math.floor(ages.length / 2)] * 10) / 10, within24h: ages.filter(h => h <= 24).length, within48h: ages.filter(h => h <= 48).length, of: ages.length } : undefined;
      const order = { field, sent: params.sort ? params.sort + " " + params.direction : "default order", asked: mode === "new" ? "desc" : "asc", values: seq.length, outOfOrder: wrong, honoured: seq.length > 1 && wrong === 0, first: seq.length ? new Date(seq[0]).toISOString() : null, last: seq.length ? new Date(seq[seq.length - 1]).toISOString() : null, futureEnds: mode === "ending" ? seq.filter(t => t > Date.now()).length : undefined, createdAge };
      const fresh = await newCount(env, rows);
      const up = await upsertLive(env, rows);
      await flushOcdUsage();
      const lastEndAt = rows.length ? Date.parse(rows[rows.length - 1].end_time) : null;
      const out = { mode, pages: pagesRead, ocdRequests: used(), fetched: rows.length, newListings: fresh, upserted: up, order, coveredHoursAhead: lastEndAt ? Math.round((lastEndAt - Date.now()) / 360e3) / 10 : null, cappedShort: mode === "ending" && pagesRead >= cap && lastEndAt != null && lastEndAt < Date.now() + ENDING_AHEAD_MS };
      await recordUsageEvent({ event_type: "pull_live_mode", route: "pull_live", status: "ok", oldcarsdata_metered_requests: 0, metadata: out }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, ...out });
    }
    // 1. Walk every page of the live feed, bounded by --max-requests.
    const seenAt = new Date().toISOString();
    const tRun = Date.now(), stepMs = {};
    const rows = [], perSource = {};
    let page = 1, total = null, truncated = false, stoppedForReserve = null;
    while (true) {
      if (used() >= maxReq) { truncated = true; break; }
      const r = await ocdWithRetry(() => callOldCarsData("/auctions/live", { page, limit }, apiKey), used, maxReq);
      await flushOcdUsage();   // record the spend page by page, so a timeout never loses the count
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
    stepMs.walk = Date.now() - tRun;
    // 2. Upsert. 3. Vanished -> ended (only when the walk was COMPLETE, so a truncated run never
    // ends live cars it simply did not reach). 4. Final prices from the archive. 5. VIN stats.
    // Steps 4 and 5 run on wall-clock budgets (120s / 60s) so the run always returns this summary and
    // never hits the 300s function limit; a budget stop reports what was handled and what is left.
    let t = Date.now();
    const fresh = await newCount(env, rows); stepMs.newCount = Date.now() - t; t = Date.now();
    const up = await upsertLive(env, rows); stepMs.upsert = Date.now() - t; t = Date.now();
    const ended = truncated ? { skipped: "walk truncated by max-requests" } : await markVanished(env, seenAt); stepMs.markEnded = Date.now() - t; t = Date.now();
    const finals = await fillFinalPrices(env, { budgetMs: 120000 }); stepMs.finalPrices = Date.now() - t; t = Date.now();
    const stats = await liveStats(env, rows, { budgetMs: 60000 }); stepMs.stats = Date.now() - t;
    stepMs.total = Date.now() - tRun;
    await flushOcdUsage();
    if (stoppedForReserve != null) await recordUsageEvent({ event_type: "pull_live_skipped", route: "pull_live", status: "stopped", oldcarsdata_metered_requests: 0, metadata: { remaining: stoppedForReserve, reserve } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    // The run's summary also lands in app_usage_events (pull_live_summary), so a cron run's timings and
    // backlog are readable afterwards (the cron's own HTTP response is not kept anywhere).
    await recordUsageEvent({ event_type: "pull_live_summary", route: "pull_live", status: "ok", oldcarsdata_metered_requests: 0, metadata: { stepMs, fetched: rows.length, ocdRequests: used(), newListings: fresh, upserted: up, ended, finals, stats: { withVin: stats.withVin, vinsChecked: stats.vinsChecked, vinsLeft: stats.vinsLeft, budgetHit: stats.budgetHit } } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    return res.status(200).json({ ok: true, ocdRequests: used(), maxRequests: maxReq, truncated, stoppedForReserve, feedTotal: total, fetched: rows.length, newListings: fresh, perSource, upserted: up, ended, finals, stepMs, ...stats });
  } catch (e) {
    await flushOcdUsage().catch(() => {});
    return res.status(500).json({ ok: false, ocdRequests: used(), error: String((e && e.message) || e).slice(0, 300) });
  }
}


async function knownIds(env, ids) {
  if (!ids.length) return 0;
  const list = ids.map(i => '"' + String(i).replace(/"/g, "") + '"').join(",");
  const r = await fetch(`${env.supabaseUrl}/rest/v1/live_listings?source_listing_id=in.(${encodeURIComponent(list)})&select=id&limit=200`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) ? rows.length : 0;
}
// How many of this pull's listings we had never seen (source + id), before the upsert stamps them.
async function newCount(env, rows) {
  let seen = 0;
  const bySource = new Map();
  for (const r of rows) { if (!bySource.has(r.source)) bySource.set(r.source, []); bySource.get(r.source).push(r.source_listing_id); }
  for (const [source, ids] of bySource) for (let i = 0; i < ids.length; i += 200) {
    const list = ids.slice(i, i + 200).map(x => '"' + String(x).replace(/"/g, "") + '"').join(",");
    const r = await fetch(`${env.supabaseUrl}/rest/v1/live_listings?source=eq.${encodeURIComponent(source)}&source_listing_id=in.(${encodeURIComponent(list)})&select=id&limit=200`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }).catch(() => null);
    const got = r && r.ok ? await r.json().catch(() => []) : [];
    seen += Array.isArray(got) ? got.length : 0;
  }
  return Math.max(0, rows.length - seen);
}

// Analytics (docs/analytics-events.md): an error event when this cron route throws or answers 5xx.
export default withTracking("/api/pullLive", handler, "buy");
