// The paging rule for scripts/ingestAttempts.js, kept pure so it can be proven on a recorded page set with no network.
// Pages one source newest first and stops at the first of:
//   cutoff     a page's oldest row is older than the outer bound (--months), so the window is covered
//   known      the whole page is already held (primary key source_slug + source_record_id): nothing newer can follow
//              (an unsold attempt is final, and the list is date-descending), the same rule scripts/ingest.js --delta uses
//   last_page  the vendor has no more pages
//   empty      a page came back with no rows
// `full` turns the known-page stop off (a deliberate full re-read of the window). `isHeld` null (the held-ids read failed)
// also never stops on known pages: a failed read is not an empty table, it falls back to the whole window.
// IO is injected: fetchPage(p) -> { rows, totalPages }, isHeld(rec) -> boolean, dayOf(rec) -> "YYYY-MM-DD" | null.
export async function walkAttemptsSource({ fetchPage, isHeld = null, dayOf, cutoffDay, full = false, maxPages = 3000 }) {
  const rows = [];
  let pages = 0, stop = "max_pages";
  for (let p = 1; p <= maxPages; p++) {
    const page = (await fetchPage(p)) || {};
    const recs = page.rows || [];
    if (!recs.length) { stop = "empty"; break; }
    pages = p;
    rows.push(...recs);
    let oldest = null;
    for (const rec of recs) { const d = dayOf(rec); if (d && (!oldest || d < oldest)) oldest = d; }
    if (oldest && oldest < cutoffDay) { stop = "cutoff"; break; }
    if (!full && isHeld && recs.every(isHeld)) { stop = "known"; break; }
    if (p >= (page.totalPages || 1)) { stop = "last_page"; break; }
  }
  return { rows, pages, stop };
}
