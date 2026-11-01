// The one shared "as of [date]" for dated lead sentences (Oct 2026): /sell uses it, Market Check should
// call it too (one copy, never a second). The date is the day the page is served, in Pacific time, written
// "October 8, 2026". It says when Sam last read the sales; it is not a claim about any count.
export function asOfDate(now = new Date()) {
  return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
}

// The real last-updated date (Oct 2026, Sam): the day the nightly ingest last finished successfully (its
// job_ingest "ok" row in app_usage_events), in Pacific time, "October 7, 2026". Cached an hour per
// instance. Null when it cannot be read: the caller then shows no date at all (never a made-up one).
let lastUpdated = { v: null, at: 0 };
export async function lastUpdatedDate(env) {
  if (lastUpdated.v && Date.now() - lastUpdated.at < 3600e3) return lastUpdated.v;
  if (!env || !env.supabaseUrl || !env.supabaseKey) return lastUpdated.v;
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=eq.job_ingest&status=eq.ok&select=created_at&order=created_at.desc&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }, signal: AbortSignal.timeout(3000) });
    const rows = r.ok ? await r.json() : null;
    const at = rows && rows[0] && rows[0].created_at;
    if (at) lastUpdated = { v: asOfDate(new Date(at)), at: Date.now() };
  } catch { /* keep the last good value, or none */ }
  return lastUpdated.v;
}

// The last-updated date as the engine's updatedLine prints it ("Oct 28, 2026"), read from this instance's cache with no request; null until a lastUpdatedDate(env) call has filled it.
export function cachedUpdatedShort() { return lastUpdated.v ? shortDate(lastUpdated.v) : null; }

// THE LIVE FEED'S OWN REFRESH (Lane E, Oct 31 2026: "Live auctions · Updated Oct 28" said the live auctions were stale when only the completed sales were Oct 28): the time the live listings were last pulled, the newest ok
// pull_live_summary (a full walk) or pull_live_mode (ending soonest) row in app_usage_events, an ISO string; null when it cannot be read (the caller then makes no claim about the live cars). Cached five minutes per instance.
let lastLive = { v: null, at: 0 };
export async function lastLivePullAt(env) {
  if (lastLive.v && Date.now() - lastLive.at < 300e3) return lastLive.v;
  if (!env || !env.supabaseUrl || !env.supabaseKey) return lastLive.v;
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=in.(pull_live_summary,pull_live_mode)&status=eq.ok&select=created_at&order=created_at.desc&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }, signal: AbortSignal.timeout(4000) });
    const rows = r.ok ? await r.json() : null;
    const at = rows && rows[0] && rows[0].created_at;
    if (at && Number.isFinite(Date.parse(at))) lastLive = { v: at, at: Date.now() };
  } catch { /* keep the last good value, or none */ }
  return lastLive.v;
}
export function resetAsOfCache() { lastUpdated = { v: null, at: 0 }; lastLive = { v: null, at: 0 }; }   // tests only: the pages read these two facts through per-instance caches
export const LIVE_NOW_MS = 90 * 60e3;   // the live walk runs every fifteen minutes with gaps: a pull inside ninety minutes is "now"
// The two facts, each from its own source, never one date for both: "Live auctions now. Sales to Oct 28, 2026." The live words come from the live pull time ("now" inside LIVE_NOW_MS, else the pull's own day and time in Pacific,
// "Live auctions updated Oct 30, 3:40 PM PT."), the sales words from the last ingest date (lastUpdatedDate, the day completed sales last landed). A fact that cannot be read makes no claim: "Live auctions." / no sales words.
export function liveSalesWords(liveAt, salesDate, now = Date.now()) {
  const t = liveAt ? Date.parse(liveAt) : NaN;
  const live = Number.isFinite(t) ? (now - t <= LIVE_NOW_MS ? "Live auctions now." : "Live auctions updated " + new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })+ " PT.") : "Live auctions.";
  const sales = salesDate ? "Sales to " + shortDate(salesDate) + "." : "";
  return { live, sales, line: [live, sales].filter(Boolean).join(" ") };
}
export async function liveSalesLine(env) {
  const [liveAt, sales] = await Promise.all([lastLivePullAt(env).catch(() => null), lastUpdatedDate(env).catch(() => null)]);
  return liveSalesWords(liveAt, sales);
}

// The short month the start pages print ("October 26, 2026" -> "Oct 26, 2026"); anything that is not that shape comes back as it was.
export function shortDate(full) {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})$/.exec(String(full || ""));
  return m ? `${m[1]} ${m[2]}, ${m[3]}` : full;
}
