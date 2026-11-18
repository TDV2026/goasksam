// For sale pull and prepare (Lane D, lane-d-forsale, Nov 2026). GET /api/pullForSale
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or the probe key in the x-ops-key header. A key in the address is refused.
//   ?mode=pull      THE PULL, every 6 hours (the vendor's own cadence): the vendor's classifieds into for_sale_listings, US only, held sources never asked for. Spends vendor queries (one a page).
//   ?mode=prepare   THE READ MADE READY, hourly: the engine's resolved car, read and the car's earlier record, stored on each row, so a visitor's request never runs the engine. Zero vendor queries.
//   ?report=1       ZERO vendor queries, read only: how many rows are in each state.
// The vendor key is read from the environment here and handed to the client; it is never printed, logged, stored or returned. A visitor never reaches this: a visitor's Find reads our table only.
import { hasServerCredential, keyInAddress, ADDRESS_KEY_REFUSED } from "../lib/_credential.js";
import { configureOcdUsage, flushOcdUsage, getOcdRunMetered } from "../lib/_ocd.js";
import { historyEnv } from "./_historyData.js";
import { recordUsageEvent } from "./_usage.js";
import { readRemaining, reserveFloor } from "../lib/live/ocdGuard.js";
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
    if (q.report) {
      const count = async f => { const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${f}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } }); const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null; };
      return res.status(200).json({ report: true, vendorQueries: 0, live: await count("gone=eq.false"), gone: await count("gone=eq.true"), resolved: await count("gone=eq.false&resolve_state=eq.resolved"), unresolved: await count("gone=eq.false&resolve_state=eq.unresolved"), notTried: await count("gone=eq.false&resolve_state=is.null"), withRead: await count("gone=eq.false&read=not.is.null") });
    }
    if (mode === "prepare") {
      const out = await prepareForSale(env, { budgetMs: Number(q.budgetMs) || undefined });
      await recordUsageEvent({ event_type: "forsale_prepare", route: "pull_for_sale", status: "ok", oldcarsdata_metered_requests: 0, metadata: out }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, mode, vendorQueries: 0, ...out });
    }
    // the pull: the vendor key from the environment, in process only
    const apiKey = process.env.OLDCARSDATA_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Vendor key missing." });
    const reserve = reserveFloor(), rl = await readRemaining(env);
    if (rl && rl.fresh && rl.remaining < reserve) {
      await recordUsageEvent({ event_type: "forsale_pull_skipped", route: "pull_for_sale", status: "skipped", oldcarsdata_metered_requests: 0, metadata: { remaining: rl.remaining, reserve } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ok: true, skipped: "monthly vendor remaining below reserve", remaining: rl.remaining, reserve, vendorQueries: 0 });
    }
    configureOcdUsage({ ...env, job: "pull_for_sale", startedBy: req.headers.authorization ? "scheduled" : "probe", startedDetail: "classifieds pull" });
    const start = getOcdRunMetered();
    const out = await pullForSale(env, apiKey, { maxRequests: Math.max(1, Math.min(400, Number(q["max-requests"]) || 250)) });
    await flushOcdUsage();
    const meta = { ...out, vendorQueries: getOcdRunMetered() - start };
    await recordUsageEvent({ event_type: "forsale_pull", route: "pull_for_sale", status: out.errors.length ? "errors" : "ok", oldcarsdata_metered_requests: 0, metadata: meta }, env.supabaseUrl, env.supabaseKey).catch(() => {});
    return res.status(200).json({ ok: true, mode, ...meta });
  } catch (e) {
    console.error("pullForSale failed:", String(e && e.message || e).replace(/Bearer\s+\S+/gi, "Bearer "));
    return res.status(500).json({ error: "pull failed" });
  }
}
