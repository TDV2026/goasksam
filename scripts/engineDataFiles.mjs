// THE ENGINE-AND-DATA FILES (Sam, Oct 17 2026, the tiered prePush). A push that changes any of these runs the FULL
// prePush (archive-backed checks, the browser check against the live site, golden truth); a push that changes none of
// them runs the FAST prePush (module load, every offline unit check, the identity pages, the search check report-only,
// no archive read), and the owning lane runs its own live check after the deploy and posts it.
// A file counts when it is on the fixed list below, OR when its own committed text reads one of the market tables or
// imports the engine (ENGINE_DATA_CONTENT_RE), so a file that starts reading the archive counts without anyone updating
// this list. A deleted file is judged by its path alone.
export const ENGINE_DATA_PREFIXES = ["lib/live/", "lib/desk/", "lib/sell/", "lib/tasks/", "lib/tools/"];
export const ENGINE_DATA_FILES = [
  // named by Sam
  "lib/onebox.js", "lib/vehicle.js", "lib/_supabase.js", "lib/sell/sellFacts.js", "api/partnerAnswer.js",
  // the engine's own helpers and every file that read sales_archive, live_listings or the market tables on Oct 17 2026
  "lib/_classify.js", "lib/_corrections.js", "lib/_epoch.js", "lib/_flags.js", "lib/_houseComps.js", "lib/_specRecompute.js",
  "lib/_unknownClassify.js", "lib/_urlNorm.js", "lib/_ocd.js", "lib/generations.js", "lib/vehicleData.js", "lib/modelRules.js",
  "lib/materialVariants.js", "lib/marketSpec.js", "lib/dailyPulse.js", "lib/marketStats.js", "lib/platformPick.js",
  "lib/reserveContext.js", "lib/specializationShare.js", "lib/specPages.js",
  "api/_historyData.js", "api/admin.js", "api/business.js", "api/buy.js", "api/buySearch.js", "api/desk.js", "api/history.js",
  "api/pullLive.js", "api/refreshSpecLiveCounts.js", "api/sellChat.js", "api/sellerDecision.js", "api/tasks.js",
  "api/usageDashboard.js", "api/vehicleIdentity.js", "api/watch.js"
];
export const ENGINE_DATA_CONTENT_RE = /\b(sales_archive|live_listings|vehicle_market_records|spec_market_cache|market_fetch_cache|auction_attempts|vin_index|vin_summary)\b|from\s+["'][./]*(lib\/)?onebox\.js["']/;
// files: changed paths; readText(path) returns the committed text or null (deleted). Returns the files that count, each
// with why: "listed", "folder" or "reads the archive or imports the engine".
export function engineDataTouched(files, readText) {
  const out = [];
  for (const f of files) {
    if (ENGINE_DATA_FILES.includes(f)) { out.push({ file: f, why: "listed" }); continue; }
    if (ENGINE_DATA_PREFIXES.some(p => f.startsWith(p))) { out.push({ file: f, why: "folder" }); continue; }
    if (/\.(m?js|sql)$/.test(f) && !f.startsWith("docs/")) { const t = readText(f); if (t && ENGINE_DATA_CONTENT_RE.test(t)) out.push({ file: f, why: "reads the archive or imports the engine" }); }
  }
  return out;
}
