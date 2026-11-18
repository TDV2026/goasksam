// For sale pull and prepare (Lane D, lane-d-forsale, Nov 2026). GET /api/pullForSale
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or the probe key in the x-ops-key header. A key in the address is refused.
//   ?mode=pull      THE PULL: the vendor's classifieds into for_sale_listings, US only, held sources never asked for, dealers first and autotraderclassics last and only if switched on. Spends vendor queries (one a page), ONLY within
//                   the budget in data/forsaleBudget.json (default 0: none), never the auction feed's reserve, never past the per run cap. A run that would pass a limit stops, marks nothing gone, and says so.
//   ?mode=prepare   THE READ MADE READY: the engine's resolved car, read and the car's earlier record, stored on each row, so a visitor's request never runs the engine. Zero vendor queries.
//   ?report=1       ZERO vendor queries, read only: how many rows are in each state, the budget (limits, what this cycle has cost, the vendor's own count left) and how the last pull ended.
// NO SCHEDULE FIRES UNTIL SAM SAYS SO: vercel.json carries no cron for this route, and a call that arrives as a scheduled one (Authorization: Bearer CRON_SECRET) is refused unless data/forsaleBudget.json schedule.pull_on / prepare_on is true.
// The vendor key is read from the environment here and handed to the client; it is never printed, logged, stored or returned. A visitor never reaches this: a visitor's Find reads our table only.
import { hasServerCredential, keyInAddress, ADDRESS_KEY_REFUSED, cronOk } from "../lib/_credential.js";
import { configureOcdUsage, flushOcdUsage, getOcdRunMetered } from "../lib/_ocd.js";
import { historyEnv } from "./_historyData.js";
import { recordUsageEvent } from "./_usage.js";
import { readRemaining, reserveFloor } from "../lib/live/ocdGuard.js";
import { BUDGET, planRun, spentThisCycle, cycleStart } from "../lib/forsale/budget.js";
import { pullForSale } from "../lib/forsale/ingest.js";
import { prepareForSale } from "../lib/forsale/prepare.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (keyInAddress(req)) return res.status(400).json(ADDRESS_KEY_REFUSED);
  if (!hasServerCredential(req)) return res.status(401).json({ error: "Unauthorized." });
  const env = historyEnv();
  if (!env) return res.status(500).json({ error: "Supabase env missing." });
  const q = req.query || {}, mode = String(q.mode || "pull");
  try {
    const scheduled = cronOk(req);   // a call that arrives as the platform's scheduled one (Bearer CRON_SECRET)
    if (q.report) {
      const count = async f => { const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${f}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } }); const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null; };
      const now = Date.now(), rl = await readRemaining(env), spent = await spentThisCycle(env, now), all = await spentThisCycle(env, now, null);
      const plan = planRun({ spentCycle: spent, remaining: rl && rl.fresh ? rl.remaining : null, now });
      let last = null;
      try { const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=in.(forsale_pull,forsale_pull_skipped)&select=created_at,event_type,metadata&order=created_at.desc&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }); const x = r.ok ? await r.json() : []; if (x[0]) { const m = x[0].metadata || {}; last = { at: x[0].created_at, event: x[0].event_type, requests: m.vendorQueries ?? m.requests ?? 0, allowance: m.allowance ?? null, stopped: m.stopped || null, skipped: m.skipped || null, errors: Array.isArray(m.errors) ? m.errors.length : 0, markedGone: m.markedGone ?? null, sources: m.sources ? Object.fromEntries(Object.entries(m.sources).map(([k, v]) => [k, { pages: v.pages, seen: v.seen, kept: v.kept, complete: v.complete }])) : null }; } } catch { /* the report still answers */ }
      const budget = { cycleStart: cycleStart(now).toISOString(), planMonthly: BUDGET.plan_monthly, auctionReserveMonthly: BUDGET.auction_reserve_monthly, forsaleMonthlyBudget: BUDGET.forsale_monthly_budget, forsaleRunCap: BUDGET.forsale_run_cap, pull: BUDGET.pull, schedule: BUDGET.schedule, spentThisCycle: spent, allVendorQueriesThisCycle: all, auctionFeedThisCycleMeasured: spent == null || all == null ? null : Math.max(0, all - spent), vendorRemaining: rl ? rl.remaining : null, vendorRemainingFresh: !!(rl && rl.fresh), nextRunAllowance: plan.allowance, nextRunBinding: plan.binding, nextRunWhy: plan.why, lastRun: last };
      return res.status(200).json({ report: true, vendorQueries: 0, budget, live: await count("gone=eq.false"), gone: await count("gone=eq.true"), resolved: await count("gone=eq.false&resolve_state=eq.resolved"), unresolved: await count("gone=eq.false&resolve_state=eq.unresolved"), notTried: await count("gone=eq.false&resolve_state=is.null"), withRead: await count("gone=eq.false&read=not.is.null") });
    }
    if (scheduled && (mode === "prepare" ? BUDGET.schedule.prepare_on : BUDGET.schedule.pull_on) !== true) {
      return res.status(200).json({ ok: true, skipped: "schedule_off", mode, vendorQueries: 0, note: "no schedule runs until data/forsaleBudget.json schedule." + (mode === "prepare" ? "prepare_on" : "pull_on") + " is true" });
    }
    if (mode === "prepare") {
      const out = await prepareForSale(env, { budgetMs: Number(q.budgetMs) || undefined });
      await recordUsageEvent({ event_type: "forsale_prepare", route: "pull_for_sale", status: "ok", oldcarsdata_metered_requests: 0, metadata: out }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, mode, vendorQueries: 0, ...out });
    }
    // the pull: the vendor key from the environment, in process only
    const now = Date.now(), rl = await readRemaining(env), spent = await spentThisCycle(env, now);
    const plan = planRun({ spentCycle: spent, remaining: rl && rl.fresh ? rl.remaining : null, now });
    if (plan.allowance < 1) {
      const skipped = { skipped: plan.binding, why: plan.why, plan: { allowance: plan.allowance, limits: plan.limits, monthlyCap: plan.monthlyCap, spentCycle: plan.spentCycle, remaining: plan.remaining, reserveLeft: plan.reserveLeft ?? null, daysLeft: plan.daysLeft } };
      await recordUsageEvent({ event_type: "forsale_pull_skipped", route: "pull_for_sale", status: "skipped", oldcarsdata_metered_requests: 0, metadata: skipped }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, mode, vendorQueries: 0, ...skipped });
    }
    // never past the vendor's own monthly reserve either (the existing floor every live job keeps), whatever the config says
    const floor = reserveFloor(); if (rl && rl.fresh && rl.remaining - plan.allowance < floor) plan.allowance = Math.max(0, rl.remaining - floor);
    if (plan.allowance < 1) { const skipped = { skipped: "auction_reserve", why: "the vendor's remaining count is under the shared floor" }; await recordUsageEvent({ event_type: "forsale_pull_skipped", route: "pull_for_sale", status: "skipped", oldcarsdata_metered_requests: 0, metadata: skipped }, env.supabaseUrl, env.supabaseKey).catch(() => {}); return res.status(200).json({ ok: true, mode, vendorQueries: 0, ...skipped }); }
    const apiKey = process.env.OLDCARSDATA_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Vendor key missing." });
    configureOcdUsage({ ...env, job: "pull_for_sale", startedBy: scheduled ? "scheduled" : "probe", startedDetail: "classifieds pull" });
    const start = getOcdRunMetered();
    const out = await pullForSale(env, apiKey, { maxRequests: plan.allowance });
    await flushOcdUsage();
    const meta = { ...out, vendorQueries: getOcdRunMetered() - start, binding: plan.binding, plan: { limits: plan.limits, monthlyCap: plan.monthlyCap, spentCycle: plan.spentCycle, remaining: plan.remaining } };
    await recordUsageEvent({ event_type: "forsale_pull", route: "pull_for_sale", status: out.errors.length ? "errors" : out.stopped ? "stopped" : "ok", oldcarsdata_metered_requests: 0, metadata: meta }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    return res.status(200).json({ ok: true, mode, ...meta });
  } catch (e) {
    console.error("pullForSale failed:", String(e && e.message || e).replace(/Bearer\s+\S+/gi, "Bearer "));
    return res.status(500).json({ error: "pull failed" });
  }
}
