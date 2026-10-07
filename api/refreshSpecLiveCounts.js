// Cheap 4-hourly refresh of spec_pages.liveListings (Spec page type, rule 11). GET /api/refreshSpecLiveCounts
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or ?key=PROBE_KEY for a manual run.
// No pool read, no OldCarsData: just recomputes each row's liveListings against the live_listings table
// (filled by /api/pullLive) and PATCHes it in place. Runs on the same 4-hourly cadence as pullLive (20
// minutes after, so live_listings is freshly filled) so a spec page's live count never waits for the
// next full nightly build.
import { historyEnv } from "./_historyData.js";
import { refreshLiveCounts } from "../lib/specPages.js";

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET, probeKey = process.env.PROBE_KEY || process.env.OPS_KEY;
  const isCron = !!cronSecret && String(req.headers["authorization"] || "") === `Bearer ${cronSecret}`;
  const provided = req.headers["x-ops-key"] || (req.query && req.query.key);
  if (!isCron && (!probeKey || provided !== probeKey)) return res.status(401).json({ error: "Unauthorized." });
  const env = historyEnv();
  if (!env) return res.status(500).json({ error: "Supabase env missing." });
  try {
    const result = await refreshLiveCounts(env);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
