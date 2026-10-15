// /business proof-strip facts (Lane A, Oct 2026). Archive-only reads, zero vendor cost: plain
// Supabase REST counts against sales_archive, never OldCarsData, never the engine (oneBoxFor/
// runOneBox) - this file exists so the proof strip's real numbers never require a live, possibly
// metered Sam Desk query to render. supabaseSelect (lib/_supabase.js) does not expose Prefer headers,
// so this calls fetch directly, the same count=exact/Content-Range pattern the ops tasks use.

function countUrl(env, filter) {
  return `${env.supabaseUrl}/rest/v1/sales_archive?${filter}&select=id&limit=1`;
}
async function exactCount(env, filter) {
  try {
    const r = await fetch(countUrl(env, filter), { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact" } });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

// Completed sales only: sale_price IS NOT NULL. De-duplicated by the table's own unique index
// (docs/supabase-sales-archive-dedupe-key.sql, sales_archive_natkey_uidx) - no distinct logic needed.
// auction_attempts (reserve-not-met/no-sale bids) is a separate table, never counted here.
export async function completedSalesCount(env) {
  if (!env) return null;
  return exactCount(env, "sale_price=not.is.null");
}

// Whether the archive carries VIN/chassis-level history for the cars it holds (section 2c, "print
// only if true"). A non-trivial share of rows carrying a real vin_norm is enough to say so honestly -
// this never claims every row has one (older/obscure listings often do not).
export async function vinHistoryShare(env) {
  if (!env) return null;
  const [withVin, total] = await Promise.all([
    exactCount(env, "vin_norm=not.is.null&vin_norm=neq."),
    exactCount(env, "sale_price=not.is.null")
  ]);
  if (withVin == null || total == null || !total) return null;
  return { withVin, total, share: withVin / total };
}

// Quarterly sold-count check for a candidate demo car (archive-only; never the engine). Returns the
// last 4 complete calendar quarters' sold counts so a candidate can be confirmed to clear 8+ in EACH
// quarter before any live engine call is considered. title/make match only - a coarse pre-check, not
// the engine's own fenced pool (the engine read, once approved, is the real source for the page).
export async function quarterlyPrecheck(env, make, titleWord, now = new Date()) {
  if (!env) return null;
  const q = []; // [{ start, end }] for the last 4 complete quarters, oldest first
  const curQStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  for (let i = 4; i >= 1; i--) {
    const start = new Date(Date.UTC(curQStart.getUTCFullYear(), curQStart.getUTCMonth() - i * 3, 1));
    const end = new Date(Date.UTC(curQStart.getUTCFullYear(), curQStart.getUTCMonth() - (i - 1) * 3, 1));
    q.push({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
  }
  const makeTok = encodeURIComponent("*" + String(make).split(/\s+/)[0] + "*");
  const titleTok = encodeURIComponent("*" + titleWord + "*");
  const counts = await Promise.all(q.map(w => exactCount(env, `sale_price=not.is.null&make=ilike.${makeTok}&listing_title=ilike.${titleTok}&sale_date=gte.${w.start}&sale_date=lt.${w.end}`)));
  return q.map((w, i) => ({ start: w.start, end: w.end, count: counts[i] }));
}
