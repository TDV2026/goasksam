// Pure, network-free decision logic for scripts/ingest.js. It lives here, apart from the top-level
// ingest script (which runs on import and needs secrets), so the gap-aware-delta and health logic is
// unit-testable with stubbed inputs: no DB, no OCD, no side effects. scripts/ingest.js wires the real
// IO (Supabase reads, OCD page fetches) to these helpers.

const DAY_MS = 86400000;

// UTC weekday 0..6 (Sun..Sat) for a YYYY-MM-DD string; null if unparseable.
export function weekdayOf(dayISO) {
  const d = new Date(`${String(dayISO).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.getUTCDay() : null;
}

// Median of finite numbers; 0 for an empty set.
export function median(nums) {
  const a = (nums || []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// The `days` YYYY-MM-DD days before `asOf`, OLDEST FIRST. Completed-sale days are always in the past
// and `asOf` (today) is still accumulating, so by default asOf is EXCLUDED (we look at yesterday
// backwards). includeToday=true includes asOf as the newest day.
export function recentDayList(asOf, days, includeToday = false) {
  const base = new Date(`${String(asOf).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(base)) return [];
  const from = includeToday ? 0 : 1;
  const out = [];
  for (let i = from; i < from + days; i++) out.push(new Date(base - i * DAY_MS).toISOString().slice(0, 10));
  return out.reverse(); // oldest first
}

// Per-UTC-weekday typical (median) daily count from a {YYYY-MM-DD: count} map over a trailing window.
// Returns number[7] indexed by weekday. Days absent from the map count as 0 when asOf is given, so a
// source's genuine slow days pull the typical DOWN (we never over-state the baseline).
export function typicalByWeekday(dailyCounts, { asOf, windowDays = 42 } = {}) {
  const buckets = [[], [], [], [], [], [], []];
  const days = asOf ? recentDayList(asOf, windowDays) : Object.keys(dailyCounts || {});
  for (const day of days) {
    const w = weekdayOf(day);
    if (w == null) continue;
    buckets[w].push(Number((dailyCounts || {})[day] || 0));
  }
  return buckets.map(median);
}

// The EARLIEST (oldest) of the last `days` days whose archive count is below `fraction` of that
// weekday's typical, or null if none is short. That day is how far back a gap-aware delta must walk.
// A weekday the source never sells (typical 0) is never a gap, so a quiet source is not over-walked.
export function earliestGapDay(dailyCounts, typical, { asOf, days = 7, fraction = 0.5 } = {}) {
  for (const day of recentDayList(asOf, days)) {          // oldest first
    const w = weekdayOf(day);
    const typ = w == null ? 0 : (typical[w] || 0);
    if (typ <= 0) continue;
    const have = Number((dailyCounts || {})[day] || 0);
    if (have < typ * fraction) return day;                // oldest short day = walk-back target
  }
  return null;
}

// Shared delta stop decision. scripts/ingest.js calls this from its real page loop, and the stubbed
// test drives walkDeltaSource (below), which also calls it, so the tested logic IS the shipped logic.
// Stop ONLY when the page is fully known (we have caught up) AND there is no outstanding gap to walk
// back to, or we have paged back far enough to cover it (the page's oldest day reached catchUpFrom).
export function deltaShouldStop({ pageAllKnown, oldestDay, catchUpFrom }) {
  if (!pageAllKnown) return false;
  if (!catchUpFrom) return true;
  return !!(oldestDay && oldestDay <= catchUpFrom);
}

// Hard request-budget predicate: true once `made` OCD requests reaches `max`. max null/non-finite =
// unlimited (the nightly default), so the cap only ever binds on a dispatch that sets it. Shared by
// the live ingest loop and walkDeltaSource so the tested stop-on-cap is the shipped stop-on-cap.
export function requestCapReached(made, max) {
  return max != null && Number.isFinite(Number(max)) && Number(made) >= Number(max);
}

// Network-free delta walker for one source, used by the stubbed test. Mirrors the live loop: page
// newest-first, collect not-held rows, and stop per deltaShouldStop (gap-aware). All IO is injected:
//   fetchPage(p) -> { rows: [{ id, day }], totalPages }   (day = YYYY-MM-DD or null)
//   isHeld(id)   -> boolean
// maxRequests/requestsMade model the global --max-requests budget: the walk stops BEFORE a fetch that
// would exceed it. Returns { kept, pages, hitCeiling, capped, requestsMade }.
export async function walkDeltaSource({ fetchPage, isHeld, catchUpFrom = null, maxPages = 60, maxRequests = null, requestsMade = 0 }) {
  const kept = [];
  let pages = 0, hitCeiling = false, capped = false, made = requestsMade;
  for (let p = 1; p <= maxPages; p++) {
    if (requestCapReached(made, maxRequests)) { capped = true; break; }
    pages = p;
    const page = (await fetchPage(p)) || {};
    made++;
    const rows = page.rows || [];
    if (!rows.length) break;
    let oldest = null, pageAllKnown = true;
    for (const r of rows) {
      if (r.day && (!oldest || r.day < oldest)) oldest = r.day;
      if (isHeld(r.id)) continue;
      pageAllKnown = false;
      kept.push(r);
    }
    if (deltaShouldStop({ pageAllKnown, oldestDay: oldest, catchUpFrom })) break;
    if (page.totalPages && p >= page.totalPages) break;
    if (p >= maxPages) { hitCeiling = true; break; }
  }
  return { kept, pages, hitCeiling, capped, requestsMade: made };
}

// ---- item 3: archive-based health (judge each day by the archive's own per-source total) ----

// Longest run of consecutive zero-count days within the last `window` days before asOf.
// Returns { run, endedOn } where endedOn is the newest day of the longest zero run.
export function longestZeroRun(dailyCounts, { asOf, window = 14 } = {}) {
  let run = 0, best = 0, bestEnd = null;
  for (const day of recentDayList(asOf, window)) {        // oldest first
    const n = Number((dailyCounts || {})[day] || 0);
    if (n === 0) { run++; if (run >= best) { best = run; bestEnd = day; } }
    else run = 0;
  }
  return { run: best, endedOn: bestEnd };
}

// A source "normally has sales" when its MEDIAN daily count over the window is > 0 (it sells on most
// days). Auction houses that sell in monthly bursts have a 0 median across a window of mostly-empty
// days, so a 3-day gap is normal for them and they are NOT flagged. Continuous sources (BaT, C&B,
// Hagerty, PCARMarket) have a positive median, so a zero streak in them is a real anomaly.
export function normallyHasSales(dailyCounts, { asOf, window = 28 } = {}) {
  return median(recentDayList(asOf, window).map(d => Number((dailyCounts || {})[d] || 0))) > 0;
}

// Flag a source for a health warning when it has >= minRun consecutive zero-sale days AND it normally
// has sales. Returns { zeroRun, endedOn } or null.
export function zeroStreakFlag(dailyCounts, { asOf, window = 14, minRun = 3, salesWindow = 28 } = {}) {
  if (!normallyHasSales(dailyCounts, { asOf, window: salesWindow })) return null;
  const z = longestZeroRun(dailyCounts, { asOf, window });
  return z.run >= minRun ? { zeroRun: z.run, endedOn: z.endedOn } : null;
}
