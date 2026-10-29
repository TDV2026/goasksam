// LAUNCH-DAY WARM COUNT (Sam, Oct 28 2026): a stored answer is served without the stale marker only when it was stored on the same UTC day as the read
// (lib/live/search.js readWarmAnswerDetailed: sameUtcDay) and is under 24 hours old. Under-24-hours alone is not enough: a row stored at 23:00Z is under 24 hours
// old at 07:00Z the next day and still counts as stale. So the launch count is by UTC day, never by age.
// rowsOffDay(rows, day): rows = [{ key, computedAt, engineVersion }], day = "YYYY-MM-DD" (UTC). Returns what the ops task task=warmDay prints.
export const utcDayOf = t => { const ms = typeof t === "number" ? t : Date.parse(t); return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null; };
export function rowsOffDay(rows, day, version = null) {
  const out = { day, version, total: 0, onDay: 0, offDay: 0, wrongVersion: 0, noTime: 0, oldest: null, examples: [] };
  for (const r of rows || []) {
    if (version && r.engineVersion !== version) { out.wrongVersion++; continue; }
    out.total++;
    const d = utcDayOf(r.computedAt);
    if (!d) { out.noTime++; out.offDay++; continue; }
    if (d === day) { out.onDay++; continue; }
    out.offDay++;
    if (!out.oldest || d < out.oldest) out.oldest = d;
    if (out.examples.length < 5) out.examples.push({ key: String(r.key || "").slice(0, 90), day: d });
  }
  return out;
}

// EPOCH MATCH (Sam, Oct 28 2026): a stored Market Check answer is served as fresh only while its stamped warmEpoch equals the live sales epoch (app_config sales_epoch, bumped by scripts/ingest.js
// when a run inserted rows). rows = [{ key, engineVersion, warmEpoch }]; current = the live epoch. Counts the rows of the live engine version only.
export function epochMatch(rows, current, version = null) {
  const out = { current: current || null, checked: 0, match: 0, mismatch: 0, noEpoch: 0, examples: [], mismatchByTier: {} };
  for (const r of rows || []) {
    if (version && r.engineVersion !== version) continue;
    out.checked++;
    if (!r.warmEpoch) { out.noEpoch++; continue; }
    if (current && r.warmEpoch === current) { out.match++; continue; }
    out.mismatch++; { const t = String(r.tier || "unknown"); out.mismatchByTier[t] = (out.mismatchByTier[t] || 0) + 1; }   // which tiers the earlier-epoch rows are (Oct 29 2026: the 80 left after two warm passes)
    if (out.examples.length < 5) out.examples.push({ key: String(r.key || "").slice(0, 90), stored: r.warmEpoch, tier: r.tier || null });
  }
  return out;
}
