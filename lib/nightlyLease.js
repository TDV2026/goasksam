// THE NIGHTLY LEASE (Lane D, Nov 20 2026, lane-d-nightly-lease). The nightly caches job reads the archive hard, and GitHub starts it anywhere from 07:00 to 17:00 UTC, so no clock can say when it runs. The nightly says so itself: the FIRST script it runs
// (scripts/ingest.js) sets a lease, the LAST script of its longest chain (scripts/buildVinRolloutCache.js) clears it, and the lease EXPIRES BY ITSELF after 90 minutes (a nightly that dies never blocks the for sale job for long). While it is held the for sale prepare job
// (lib/forsale/prepare.js, the cron and scripts/prepareLoop.mjs, one route) makes no read. No workflow file is edited and no table is new: a row in app_usage_events, as the prepare lease is. A script never fails because of the lease (every call here swallows its own error).
export const NIGHTLY_EVENT = "nightly_lease", NIGHTLY_LEASE_MS = 90 * 60000;
const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
const post = (env, status, metadata) => fetch(`${env.supabaseUrl}/rest/v1/app_usage_events`, { method: "POST", headers: { ...hdr(env), Prefer: "return=minimal" }, body: JSON.stringify([{ event_type: NIGHTLY_EVENT, route: "nightly", status, metadata }]) });
export async function setNightlyLease(env, now = Date.now()) {
  try { const lease = "nl" + now.toString(36) + Math.random().toString(36).slice(2, 8), r = await post(env, "running", { lease, expires_at: new Date(now + NIGHTLY_LEASE_MS).toISOString() }); return r.ok ? { ok: true, lease } : { ok: false }; } catch { return { ok: false }; }
}
// clears EVERY lease still running in the window (the nightly's own, and a second dispatch's)
export async function clearNightlyLease(env, now = Date.now()) {
  try {
    const h = await nightlyLeaseHeld(env, now); let ok = true;
    for (const l of h.leases || []) { const r = await post(env, "released", { lease: l }); if (!r.ok) ok = false; }
    return { ok, cleared: (h.leases || []).length };
  } catch { return { ok: false, cleared: 0 }; }
}
// held: a lease set within the last 90 minutes and not cleared; expiresInMs: the time left of the latest one. A table that cannot be read is HELD (the job says it cannot tell and reads nothing).
export async function nightlyLeaseHeld(env, now = Date.now()) {
  try {
    const since = new Date(now - NIGHTLY_LEASE_MS).toISOString(), r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?select=id,status,metadata,created_at&event_type=eq.${NIGHTLY_EVENT}&created_at=gte.${encodeURIComponent(since)}&order=id.asc&limit=200`, { headers: hdr(env) });
    const rows = r.ok ? await r.json() : null; if (!Array.isArray(rows)) return { held: true, unreadable: true, expiresInMs: 300000, leases: [] };
    const gone = new Set(rows.filter(x => x && x.status === "released").map(x => x.metadata && x.metadata.lease)), live = rows.filter(x => x && x.status === "running" && !gone.has(x.metadata && x.metadata.lease));
    if (!live.length) return { held: false, expiresInMs: 0, leases: [] };
    const left = Math.max(...live.map(x => { const e = Date.parse(x.created_at); return (Number.isFinite(e) ? e : now) + NIGHTLY_LEASE_MS - now; }));
    return { held: left > 0, expiresInMs: Math.max(0, left), leases: live.map(x => x.metadata && x.metadata.lease).filter(Boolean) };
  } catch { return { held: true, unreadable: true, expiresInMs: 300000, leases: [] }; }
}
