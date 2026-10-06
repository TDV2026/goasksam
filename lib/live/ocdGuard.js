// Shared OCD guards for every live-feed request (Lane C, Oct 2026). Read-only use of lib/_ocd.js.
//  - monthly reserve: OCD's own remaining (the header /sell persists to app_config ocd_rate_limit) must stay
//    at or above OCD_SELL_MONTHLY_RESERVE + 100, or the job does not spend.
//  - retries: at most 2, only on a 5xx or network failure; any 4xx stops at once.
//  - LIVE_FRESHNESS: the 30-minute jobs and the on-demand bid stay OFF unless this env is "1".
export const freshnessOn = () => process.env.LIVE_FRESHNESS === "1";
export function reserveFloor() { return Number(process.env.OCD_SELL_MONTHLY_RESERVE || 450) + 100; }
export async function readRemaining(env) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=eq.ocd_rate_limit&select=value&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json(); const raw = rows && rows[0] && rows[0].value; if (!raw) return null;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const remaining = Number(v && v.remaining), at = Number(v && v.at) || 0;
    if (!Number.isFinite(remaining)) return null;
    return { remaining, at, fresh: at > 0 && Date.now() - at < 6 * 3600e3 };
  } catch { return null; }
}
export async function underReserve(env) { const rl = await readRemaining(env); return !!(rl && rl.fresh && rl.remaining < reserveFloor()) ? rl : null; }
export async function ocdWithRetry(fn, used, maxReq) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const st = Number(e && e.status);
      if (e && e.ocdHardCap) throw e;
      if (st >= 400 && st < 500) throw e;
      if (attempt === 2 || (used && maxReq && used() >= maxReq)) throw e;
    }
  }
  throw last;
}
