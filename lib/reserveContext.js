// Reserve-context cells (Phase 1.5). CORRELATION ONLY, NEVER CAUSATION: we know
// the final sale price and whether a reserve existed, never the reserve amount,
// so we can never claim a reserve caused anything.
//
// Regenerated MONTHLY by scripts/refreshReserveContext.js from sales_archive
// (sold records already stored in Supabase; NO OldCarsData API calls, so this
// never touches the 33/day budget). Same cadence as the win-conditions refresh.
// Scope: the most recent COMPLETE calendar month. A cell exists only when BOTH
// the has_reserve and no-reserve sides have 10+ sold records; platforms whose
// records lack a reliable has_reserve flag produce no cells (null flags skipped).

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const RESERVE_MIN_PER_SIDE = 10;
export const RESERVE_BANDS = [
  { low: 0,      high: 25000,    key: "under $25k" },
  { low: 25000,  high: 50000,    key: "$25k to $50k" },
  { low: 50000,  high: 100000,   key: "$50k to $100k" },
  { low: 100000, high: Infinity, key: "$100k and up" },
];
export function reserveBand(priceUsd) {
  const p = Number(priceUsd);
  if (!Number.isFinite(p) || p <= 0) return null;
  return RESERVE_BANDS.find(b => p >= b.low && p < b.high) || null;
}

// Pure computation (unit-tested). rows: { platform, make, sale_price, has_reserve }.
// A row with has_reserve === null/undefined is excluded (no reliable flag).
export function computeReserveCells(rows, dataMonth) {
  const cells = new Map();
  for (const r of rows || []) {
    if (r.has_reserve === null || r.has_reserve === undefined) continue;
    const price = Number(r.sale_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const band = reserveBand(price);
    if (!band) continue;
    const make = String(r.make || "").trim();
    if (!make) continue;
    const key = `${norm(r.platform)}|${norm(make)}|${band.key}`;
    if (!cells.has(key)) cells.set(key, { platform: r.platform, make, band, withR: [], noR: [] });
    (r.has_reserve ? cells.get(key).withR : cells.get(key).noR).push(price);
  }
  const out = [];
  for (const c of cells.values()) {
    if (c.withR.length < RESERVE_MIN_PER_SIDE || c.noR.length < RESERVE_MIN_PER_SIDE) continue;
    const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    const avgW = avg(c.withR), avgN = avg(c.noR);
    const delta = avgW - avgN;
    out.push({
      platform: c.platform, make: c.make,
      band_low: c.band.low, band_high: c.band.high === Infinity ? null : c.band.high, band_key: c.band.key,
      avg_with_reserve: avgW, avg_no_reserve: avgN,
      delta_dollars: delta, delta_pct: avgN ? Math.round(delta / avgN * 1000) / 10 : 0,
      n_with: c.withR.length, n_without: c.noR.length, data_month: dataMonth,
    });
  }
  return out;
}

// Regenerated monthly by scripts/refreshReserveContext.js. Empty until the first
// refresh runs; with no cell the feature renders nothing (never a placeholder).
export const RESERVE_CONTEXT = [];

// Request-time lookup: exact platform + make + the band containing the asking
// price. No cell -> null (no make-level or platform-level approximation).
export function findReserveContext(platform, make, priceUsd, table = RESERVE_CONTEXT) {
  const band = reserveBand(priceUsd);
  if (!band) return null;
  const p = norm(platform), m = norm(make);
  return (table || []).find(c => norm(c.platform) === p && norm(c.make) === m && c.band_key === band.key) || null;
}
