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
