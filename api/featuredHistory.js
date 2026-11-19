// FEATURED HISTORY, CREW ONLY, NOT LIVE (Lane B, Nov 2026). GET /api/featuredHistory answers the Homepage feature's one object to a request carrying the signed crew cookie, and 404 to everyone else (no body, no field).
// Nothing else serves it: no public route, page, feed, sitemap or cache key reads lib/live/featuredHistory.js (scripts/featuredHistoryCheck.mjs fails if one does). Sam says in writing when it goes live.
import { isCrewRequest } from "../lib/_crew.js";
import { readFeaturedHistory } from "../lib/live/featuredHistory.js";
import { historyEnv } from "./_historyData.js";
export default async function handler(req, res) {
  if (!isCrewRequest(req)) { res.statusCode = 404; res.setHeader("Cache-Control", "no-store"); return res.end(); }
  const env = historyEnv();
  const featuredHistory = env ? await readFeaturedHistory(env, req).catch(() => null) : null;
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ featuredHistory });
}
