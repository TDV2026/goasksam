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

// "&" -> "and" BEFORE stripping non-alphanumerics, so the display-name platform
// stored in a cell ("Cars & Bids" -> "carsandbids") matches the route slug
// ("carsandbids"). Without this the & is dropped ("carsbids") and Cars & Bids
// cells never attach.
const norm = s => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

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
export const RESERVE_CONTEXT = [
  {
    "platform": "Bring a Trailer",
    "make": "BMW",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16591,
    "avg_no_reserve": 11425,
    "delta_dollars": 5166,
    "delta_pct": 45.2,
    "n_with": 48,
    "n_without": 135,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "BMW",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36029,
    "avg_no_reserve": 33729,
    "delta_dollars": 2300,
    "delta_pct": 6.8,
    "n_with": 47,
    "n_without": 14,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17573,
    "avg_no_reserve": 13006,
    "delta_dollars": 4567,
    "delta_pct": 35.1,
    "n_with": 41,
    "n_without": 95,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36110,
    "avg_no_reserve": 35612,
    "delta_dollars": 498,
    "delta_pct": 1.4,
    "n_with": 87,
    "n_without": 18,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 67631,
    "avg_no_reserve": 66714,
    "delta_dollars": 917,
    "delta_pct": 1.4,
    "n_with": 73,
    "n_without": 10,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17031,
    "avg_no_reserve": 13542,
    "delta_dollars": 3489,
    "delta_pct": 25.8,
    "n_with": 48,
    "n_without": 97,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34689,
    "avg_no_reserve": 30940,
    "delta_dollars": 3749,
    "delta_pct": 12.1,
    "n_with": 83,
    "n_without": 33,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 67894,
    "avg_no_reserve": 62280,
    "delta_dollars": 5614,
    "delta_pct": 9,
    "n_with": 50,
    "n_without": 11,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Jeep",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15755,
    "avg_no_reserve": 11486,
    "delta_dollars": 4269,
    "delta_pct": 37.2,
    "n_with": 14,
    "n_without": 41,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Land Rover",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36771,
    "avg_no_reserve": 31005,
    "delta_dollars": 5766,
    "delta_pct": 18.6,
    "n_with": 13,
    "n_without": 12,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16957,
    "avg_no_reserve": 11979,
    "delta_dollars": 4978,
    "delta_pct": 41.6,
    "n_with": 52,
    "n_without": 101,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34687,
    "avg_no_reserve": 33556,
    "delta_dollars": 1131,
    "delta_pct": 3.4,
    "n_with": 42,
    "n_without": 24,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 71461,
    "avg_no_reserve": 71533,
    "delta_dollars": -72,
    "delta_pct": -0.1,
    "n_with": 30,
    "n_without": 12,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17176,
    "avg_no_reserve": 15600,
    "delta_dollars": 1576,
    "delta_pct": 10.1,
    "n_with": 24,
    "n_without": 56,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36881,
    "avg_no_reserve": 36693,
    "delta_dollars": 188,
    "delta_pct": 0.5,
    "n_with": 53,
    "n_without": 25,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 71513,
    "avg_no_reserve": 71771,
    "delta_dollars": -258,
    "delta_pct": -0.4,
    "n_with": 83,
    "n_without": 12,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 100000,
    "band_high": null,
    "band_key": "$100k and up",
    "avg_with_reserve": 225453,
    "avg_no_reserve": 213470,
    "delta_dollars": 11983,
    "delta_pct": 5.6,
    "n_with": 111,
    "n_without": 17,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Toyota",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 18182,
    "avg_no_reserve": 14144,
    "delta_dollars": 4038,
    "delta_pct": 28.5,
    "n_with": 32,
    "n_without": 87,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Toyota",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 32905,
    "avg_no_reserve": 33455,
    "delta_dollars": -550,
    "delta_pct": -1.6,
    "n_with": 25,
    "n_without": 19,
    "data_month": "2026-06"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Volkswagen",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17724,
    "avg_no_reserve": 11956,
    "delta_dollars": 5768,
    "delta_pct": 48.2,
    "n_with": 11,
    "n_without": 29,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "make": "Audi",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16457,
    "avg_no_reserve": 8943,
    "delta_dollars": 7514,
    "delta_pct": 84,
    "n_with": 14,
    "n_without": 20,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "make": "BMW",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16521,
    "avg_no_reserve": 10688,
    "delta_dollars": 5833,
    "delta_pct": 54.6,
    "n_with": 29,
    "n_without": 52,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "make": "Mazda",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16160,
    "avg_no_reserve": 8870,
    "delta_dollars": 7290,
    "delta_pct": 82.2,
    "n_with": 10,
    "n_without": 16,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "make": "Mercedes-Benz",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17565,
    "avg_no_reserve": 8454,
    "delta_dollars": 9111,
    "delta_pct": 107.8,
    "n_with": 13,
    "n_without": 24,
    "data_month": "2026-06"
  },
  {
    "platform": "Cars & Bids",
    "make": "Porsche",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17150,
    "avg_no_reserve": 14070,
    "delta_dollars": 3080,
    "delta_pct": 21.9,
    "n_with": 19,
    "n_without": 13,
    "data_month": "2026-06"
  }
];

// Request-time lookup: exact platform + make + the band containing the asking
// price. No cell -> null (no make-level or platform-level approximation).
export function findReserveContext(platform, make, priceUsd, table = RESERVE_CONTEXT) {
  const band = reserveBand(priceUsd);
  if (!band) return null;
  const p = norm(platform), m = norm(make);
  return (table || []).find(c => norm(c.platform) === p && norm(c.make) === m && c.band_key === band.key) || null;
}
