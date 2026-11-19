// THE LAST WRITE IS THE NEWEST PICK (Lane B, Nov 11 2026). Lane C rebuilt the Find three (a forced build, new pick, new selectedAt) and the next pull put the PREVIOUS three back ("kept 3"). CAUSE: a refresh reads the stored pick FIRST, then spends tens of seconds
// on the live pool, the history reads and the engine's band reads, and writes at the END: the final write spreads the pick it read at the start (the kept entries, a fresh checkedAt), so a pick written by someone else in between (a rebuild, an hourly replacement) was overwritten
// by the older one. THE RULE: a refresh never overwrites, or clears, a stored pick NEWER than the one it read. guardedRefresh wraps a refresh: it notes the selectedAt of the pick the refresh read at its start, and before every write or clear of the store key it reads the key
// again; a newer selectedAt there means the refresh is superseded: its write is dropped, and it answers { stored: <the newer pick>, why: "superseded" }. A rebuild is therefore always the last write. Used by Find's three, the Home pick, the Tasks demo and the Watching demo (every
// picker keeps its pick under one app_config key the same way).
export const selectedMs = v => { const t = Date.parse(v && v.selectedAt); return Number.isFinite(t) ? t : 0; };
export function guardedRefresh(core, { key, defaults }) {
  return async function guarded(env, deps = {}) {
    const base = { ...defaults(), ...deps }; let seen, flagged = false, latest = null;
    const readNow = async () => { const rows = await base.select(env, `app_config?key=eq.${key}&select=value&limit=1`).catch(() => null); const v = Array.isArray(rows) && rows[0] && rows[0].value; return v && typeof v === "object" ? v : null; };
    const select = async (e, q) => { const rows = await base.select(e, q); if (seen === undefined && typeof q === "string" && q.startsWith(`app_config?key=eq.${key}`)) { const v = Array.isArray(rows) && rows[0] && rows[0].value; seen = selectedMs(v && typeof v === "object" ? v : null); } return rows; };
    const newer = async () => { if (seen === undefined) return null; const v = await readNow(); return v && selectedMs(v) > seen ? v : null; };
    const write = async (e, row) => { if (row && row.key === key) { const n = await newer(); if (n) { flagged = true; latest = n; return undefined; } const r = await base.write(e, row); if (row.value && row.value.selectedAt) seen = Math.max(seen || 0, selectedMs(row.value)); return r; } return base.write(e, row); };
    const clear = async (e, k) => { if (k === undefined || k === key) { const n = await newer(); if (n) { flagged = true; latest = n; return undefined; } } return base.clear(e, k); };
    const r = await core(env, { ...base, select, write, clear });
    return flagged ? { stored: latest, why: "superseded", ...(r && r.funnel ? { funnel: r.funnel } : {}) } : r;
  };
}
