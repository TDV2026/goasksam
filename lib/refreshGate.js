// BEHIND-THE-RESPONSE REFRESHES: ONE PER ROW, A FEW AT ONCE (Lane B, Nov 1 2026). A stored answer that is served old is recomputed after the response; many readers of one car must start one refresh, and a burst of old rows must not start dozens.
// tryRefresh(key, job): "started" (job runs, its promise is returned for waitUntil), "inflight" (this row is already being refreshed in this instance) or "capped" (this instance already runs REFRESH_CAP refreshes). A refused row is served as stored and tried again on its next read.
const inflight = new Map(); let running = 0;
export function refreshCap() { const n = Number(process.env.REFRESH_CAP); return Number.isFinite(n) && n >= 0 ? n : 3; }
export function tryRefresh(key, job) {
  if (inflight.has(key)) return { state: "inflight" };
  if (running >= refreshCap()) return { state: "capped" };
  running++;
  const promise = Promise.resolve().then(job).catch(() => {}).finally(() => { running--; inflight.delete(key); });
  inflight.set(key, promise);
  return { state: "started", promise };
}
export function refreshesRunning() { return running; }
