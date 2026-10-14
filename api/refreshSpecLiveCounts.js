// Cheap 4-hourly refresh of spec_pages.liveListings (Spec page type, rule 11). GET /api/refreshSpecLiveCounts
//   Auth: Vercel cron (Authorization: Bearer CRON_SECRET) or the probe key in the x-ops-key header for a manual
//   run (lib/_credential.js hasServerCredential). A key in the address is refused.
// No pool read, no OldCarsData: just recomputes each row's liveListings against the live_listings table
// (filled by /api/pullLive) and PATCHes it in place. Runs on the same 4-hourly cadence as pullLive (20
// minutes after, so live_listings is freshly filled) so a spec page's live count never waits for the
// next full nightly build.
import { hasServerCredential, keyInAddress, ADDRESS_KEY_REFUSED } from "../lib/_credential.js";
import { withTracking } from "../lib/track/log.js";
import { historyEnv } from "./_historyData.js";
import { refreshLiveCounts } from "../lib/specPages.js";

async function handler(req, res) {
  if (keyInAddress(req)) return res.status(400).json(ADDRESS_KEY_REFUSED);
  if (!hasServerCredential(req)) return res.status(401).json({ error: "Unauthorized." });
  const env = historyEnv();
  if (!env) return res.status(500).json({ error: "Supabase env missing." });
  try {
    const result = await refreshLiveCounts(env);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}

// Analytics (docs/analytics-events.md): an error event when this cron route throws or answers 5xx.
export default withTracking("/api/refreshSpecLiveCounts", handler, "buy");
