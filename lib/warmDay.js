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
  const out = { current: current || null, checked: 0, match: 0, mismatch: 0, noEpoch: 0, examples: [], noEpochExamples: [], mismatchByTier: {} };
  for (const r of rows || []) {
    if (version && r.engineVersion !== version) continue;
    out.checked++;
    if (!r.warmEpoch) { out.noEpoch++; if (out.noEpochExamples.length < 5) out.noEpochExamples.push({ key: String(r.key || "").slice(0, 90), tier: r.tier || null, computedAt: r.computedAt || null }); continue; }   // the keys of the rows with no stamp, so the row is found by name, not by a count
    if (current && r.warmEpoch === current) { out.match++; continue; }
    out.mismatch++; { const t = String(r.tier || "unknown"); out.mismatchByTier[t] = (out.mismatchByTier[t] || 0) + 1; }   // which tiers the earlier-epoch rows are (Oct 29 2026: the 80 left after two warm passes)
    if (out.examples.length < 5) out.examples.push({ key: String(r.key || "").slice(0, 90), stored: r.warmEpoch, tier: r.tier || null });
  }
  return out;
}

// A WARM THAT RUNS BEFORE THE DAY'S INGEST IS STALE AT THE NEXT BUMP (Lane B, Nov 7 2026; Lane C's warm after warmguard: the bare Delahaye 135 and Duesenberg Model J rows read epoch_mismatch).
// CAUSE, read from the stored rows and the ingest log, not a guess: every row was stamped with the live epoch at the moment it was written (2026-11-06T15:00:05Z on the rows stored at 08:22Z Nov 7), and the daily ingest bumped the epoch at the end of its run
// (job_ingest events end 13:58 to 17:01Z, 6 days of them; Nov 7 at 13:58:13Z), so every row stored in the hours before it reads as the previous epoch. A deploy does not change the epoch (only scripts/ingest.js bumps it), and the warm and the reader both
// read the one app_config row through currentEpoch. warmEpochNote says it on the warm's own reply: the epoch it stamped, when the last bump was, when the next is usual, and whether this warm is ahead of it.
// events = [{ at }] (job_ingest rows, newest first or any order); now = ms; epoch = what the warm stamped.
export function warmEpochNote({ now, epoch, events }) {
  const ats = (events || []).map(e => Date.parse(e && (e.at || e.created_at))).filter(t => Number.isFinite(t) && t <= now).sort((a, b) => b - a).slice(0, 7);   // only runs that have happened by the warm's own time
  if (!ats.length) return { epoch: epoch || null, known: false, aheadOfBump: null, line: "No ingest run is recorded, so the usual bump time is not known." };
  const mod = ms => { const d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); }, hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const mins = ats.map(mod), lo = Math.min(...mins), hi = Math.max(...mins), lastBump = ats[0];
  const sameDay = utcDayOf(lastBump) === utcDayOf(now), aheadOfBump = !sameDay && mod(now) < hi;
  const line = aheadOfBump
    ? `This warm stamps ${epoch || "the live epoch"}. The daily ingest has ended between ${hhmm(lo)} and ${hhmm(hi)} UTC on the last ${ats.length} days and bumps the epoch when it does (last bump ${new Date(lastBump).toISOString()}), so every row stored before it reads epoch_mismatch. Run the warm after today's ingest.`
    : `This warm stamps ${epoch || "the live epoch"}; today's ingest has already bumped it (last bump ${new Date(lastBump).toISOString()}), so rows stored now stay fresh until tomorrow's.`;
  return { epoch: epoch || null, known: true, lastBump: new Date(lastBump).toISOString(), usualBumpUtc: { from: hhmm(lo), to: hhmm(hi) }, aheadOfBump, line };
}
export async function warmEpochNoteFor(env, { supabaseSelect, currentEpoch, now = Date.now() }) {
  const epoch = await currentEpoch(env).catch(() => null);
  const rows = await supabaseSelect(env, "app_usage_events?event_type=eq.job_ingest&select=created_at&order=created_at.desc&limit=8").catch(() => null);
  return warmEpochNote({ now, epoch, events: Array.isArray(rows) ? rows.map(r => ({ at: r.created_at })) : [] });
}
