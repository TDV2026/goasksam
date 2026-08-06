// Reserve-context cells (Phase 1.5). CORRELATION ONLY, NEVER CAUSATION: we know
// the final sale price and whether a reserve existed, never the reserve amount,
// so we can never claim a reserve caused anything.
//
// Regenerated MONTHLY by scripts/refreshReserveContext.js from sales_archive
// (sold records already stored in Supabase; NO OldCarsData API calls, so this
// never touches the 33/day budget). Same cadence as the win-conditions refresh.
// Scope: a rolling window of the last 3 COMPLETE calendar months (widened from a
// single month, Aug 2026). A cell exists only when BOTH the has_reserve and
// no-reserve sides have 10+ sold records; platforms whose records lack a reliable
// has_reserve flag produce no cells (null flags skipped). The card states the
// window as "Over the past three months".

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
    "make": "Audi",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17638,
    "avg_no_reserve": 11284,
    "delta_dollars": 6354,
    "delta_pct": 56.3,
    "n_with": 12,
    "n_without": 61,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "BMW",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16732,
    "avg_no_reserve": 11775,
    "delta_dollars": 4957,
    "delta_pct": 42.1,
    "n_with": 96,
    "n_without": 227,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "BMW",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 35360,
    "avg_no_reserve": 34086,
    "delta_dollars": 1274,
    "delta_pct": 3.7,
    "n_with": 90,
    "n_without": 39,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Cadillac",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17224,
    "avg_no_reserve": 11153,
    "delta_dollars": 6071,
    "delta_pct": 54.4,
    "n_with": 11,
    "n_without": 60,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Cadillac",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 38267,
    "avg_no_reserve": 36447,
    "delta_dollars": 1820,
    "delta_pct": 5,
    "n_with": 12,
    "n_without": 14,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17378,
    "avg_no_reserve": 13443,
    "delta_dollars": 3935,
    "delta_pct": 29.3,
    "n_with": 77,
    "n_without": 181,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36099,
    "avg_no_reserve": 35054,
    "delta_dollars": 1045,
    "delta_pct": 3,
    "n_with": 150,
    "n_without": 34,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Chevrolet",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 68501,
    "avg_no_reserve": 64603,
    "delta_dollars": 3898,
    "delta_pct": 6,
    "n_with": 143,
    "n_without": 16,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Dodge",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15812,
    "avg_no_reserve": 12193,
    "delta_dollars": 3619,
    "delta_pct": 29.7,
    "n_with": 17,
    "n_without": 33,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Dodge",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 35486,
    "avg_no_reserve": 34409,
    "delta_dollars": 1077,
    "delta_pct": 3.1,
    "n_with": 27,
    "n_without": 14,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ducati",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15305,
    "avg_no_reserve": 8461,
    "delta_dollars": 6844,
    "delta_pct": 80.9,
    "n_with": 10,
    "n_without": 29,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ferrari",
    "band_low": 100000,
    "band_high": null,
    "band_key": "$100k and up",
    "avg_with_reserve": 382209,
    "avg_no_reserve": 282973,
    "delta_dollars": 99236,
    "delta_pct": 35.1,
    "n_with": 114,
    "n_without": 24,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17460,
    "avg_no_reserve": 13172,
    "delta_dollars": 4288,
    "delta_pct": 32.6,
    "n_with": 97,
    "n_without": 213,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34706,
    "avg_no_reserve": 31808,
    "delta_dollars": 2898,
    "delta_pct": 9.1,
    "n_with": 153,
    "n_without": 72,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Ford",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 67405,
    "avg_no_reserve": 63287,
    "delta_dollars": 4118,
    "delta_pct": 6.5,
    "n_with": 94,
    "n_without": 23,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Harley-Davidson",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 9761,
    "avg_no_reserve": 7749,
    "delta_dollars": 2012,
    "delta_pct": 26,
    "n_with": 14,
    "n_without": 52,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Honda",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 12124,
    "avg_no_reserve": 7054,
    "delta_dollars": 5070,
    "delta_pct": 71.9,
    "n_with": 16,
    "n_without": 206,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Jaguar",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15661,
    "avg_no_reserve": 13398,
    "delta_dollars": 2263,
    "delta_pct": 16.9,
    "n_with": 16,
    "n_without": 56,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Jaguar",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34606,
    "avg_no_reserve": 33125,
    "delta_dollars": 1481,
    "delta_pct": 4.5,
    "n_with": 19,
    "n_without": 10,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Jeep",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15921,
    "avg_no_reserve": 12014,
    "delta_dollars": 3907,
    "delta_pct": 32.5,
    "n_with": 34,
    "n_without": 84,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Land Rover",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16488,
    "avg_no_reserve": 13151,
    "delta_dollars": 3337,
    "delta_pct": 25.4,
    "n_with": 15,
    "n_without": 82,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Land Rover",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34895,
    "avg_no_reserve": 32833,
    "delta_dollars": 2062,
    "delta_pct": 6.3,
    "n_with": 27,
    "n_without": 22,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Lexus",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 18416,
    "avg_no_reserve": 15050,
    "delta_dollars": 3366,
    "delta_pct": 22.4,
    "n_with": 14,
    "n_without": 66,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Lexus",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 36431,
    "avg_no_reserve": 31864,
    "delta_dollars": 4567,
    "delta_pct": 14.3,
    "n_with": 13,
    "n_without": 13,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mazda",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16502,
    "avg_no_reserve": 12343,
    "delta_dollars": 4159,
    "delta_pct": 33.7,
    "n_with": 21,
    "n_without": 39,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17172,
    "avg_no_reserve": 12117,
    "delta_dollars": 5055,
    "delta_pct": 41.7,
    "n_with": 81,
    "n_without": 223,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 35171,
    "avg_no_reserve": 32119,
    "delta_dollars": 3052,
    "delta_pct": 9.5,
    "n_with": 87,
    "n_without": 46,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mercedes-Benz",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 73743,
    "avg_no_reserve": 67755,
    "delta_dollars": 5988,
    "delta_pct": 8.8,
    "n_with": 68,
    "n_without": 27,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "MG",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 14927,
    "avg_no_reserve": 10991,
    "delta_dollars": 3936,
    "delta_pct": 35.8,
    "n_with": 14,
    "n_without": 21,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Mini",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17562,
    "avg_no_reserve": 10578,
    "delta_dollars": 6984,
    "delta_pct": 66,
    "n_with": 16,
    "n_without": 39,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Pontiac",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16805,
    "avg_no_reserve": 12802,
    "delta_dollars": 4003,
    "delta_pct": 31.3,
    "n_with": 10,
    "n_without": 29,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17531,
    "avg_no_reserve": 14867,
    "delta_dollars": 2664,
    "delta_pct": 17.9,
    "n_with": 51,
    "n_without": 104,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 37327,
    "avg_no_reserve": 34588,
    "delta_dollars": 2739,
    "delta_pct": 7.9,
    "n_with": 117,
    "n_without": 54,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 72756,
    "avg_no_reserve": 72955,
    "delta_dollars": -199,
    "delta_pct": -0.3,
    "n_with": 177,
    "n_without": 33,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Porsche",
    "band_low": 100000,
    "band_high": null,
    "band_key": "$100k and up",
    "avg_with_reserve": 232718,
    "avg_no_reserve": 218244,
    "delta_dollars": 14474,
    "delta_pct": 6.6,
    "n_with": 211,
    "n_without": 35,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Toyota",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 18035,
    "avg_no_reserve": 14204,
    "delta_dollars": 3831,
    "delta_pct": 27,
    "n_with": 46,
    "n_without": 162,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Toyota",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 32909,
    "avg_no_reserve": 33200,
    "delta_dollars": -291,
    "delta_pct": -0.9,
    "n_with": 48,
    "n_without": 37,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Toyota",
    "band_low": 50000,
    "band_high": 100000,
    "band_key": "$50k to $100k",
    "avg_with_reserve": 69089,
    "avg_no_reserve": 65773,
    "delta_dollars": 3316,
    "delta_pct": 5,
    "n_with": 26,
    "n_without": 11,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Triumph",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 15443,
    "avg_no_reserve": 8464,
    "delta_dollars": 6979,
    "delta_pct": 82.5,
    "n_with": 15,
    "n_without": 29,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Bring a Trailer",
    "make": "Volkswagen",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16456,
    "avg_no_reserve": 11745,
    "delta_dollars": 4711,
    "delta_pct": 40.1,
    "n_with": 28,
    "n_without": 65,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Audi",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17385,
    "avg_no_reserve": 8453,
    "delta_dollars": 8932,
    "delta_pct": 105.7,
    "n_with": 24,
    "n_without": 34,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "BMW",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17416,
    "avg_no_reserve": 10551,
    "delta_dollars": 6865,
    "delta_pct": 65.1,
    "n_with": 50,
    "n_without": 107,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "BMW",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34045,
    "avg_no_reserve": 29174,
    "delta_dollars": 4871,
    "delta_pct": 16.7,
    "n_with": 40,
    "n_without": 13,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Chevrolet",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 19066,
    "avg_no_reserve": 11938,
    "delta_dollars": 7128,
    "delta_pct": 59.7,
    "n_with": 15,
    "n_without": 14,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Ford",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16704,
    "avg_no_reserve": 9768,
    "delta_dollars": 6936,
    "delta_pct": 71,
    "n_with": 14,
    "n_without": 35,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Mazda",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16621,
    "avg_no_reserve": 9182,
    "delta_dollars": 7439,
    "delta_pct": 81,
    "n_with": 14,
    "n_without": 33,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Mercedes-Benz",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17689,
    "avg_no_reserve": 8164,
    "delta_dollars": 9525,
    "delta_pct": 116.7,
    "n_with": 19,
    "n_without": 57,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Porsche",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17077,
    "avg_no_reserve": 13852,
    "delta_dollars": 3225,
    "delta_pct": 23.3,
    "n_with": 30,
    "n_without": 32,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Cars & Bids",
    "make": "Toyota",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 17703,
    "avg_no_reserve": 11550,
    "delta_dollars": 6153,
    "delta_pct": 53.3,
    "n_with": 17,
    "n_without": 33,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Hagerty",
    "make": "Chevrolet",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 18179,
    "avg_no_reserve": 11817,
    "delta_dollars": 6362,
    "delta_pct": 53.8,
    "n_with": 12,
    "n_without": 43,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Hagerty",
    "make": "Chevrolet",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 33136,
    "avg_no_reserve": 34058,
    "delta_dollars": -922,
    "delta_pct": -2.7,
    "n_with": 20,
    "n_without": 11,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Hagerty",
    "make": "Ford",
    "band_low": 0,
    "band_high": 25000,
    "band_key": "under $25k",
    "avg_with_reserve": 16710,
    "avg_no_reserve": 13315,
    "delta_dollars": 3395,
    "delta_pct": 25.5,
    "n_with": 15,
    "n_without": 38,
    "data_month": "2026-05..2026-07"
  },
  {
    "platform": "Hagerty",
    "make": "Ford",
    "band_low": 25000,
    "band_high": 50000,
    "band_key": "$25k to $50k",
    "avg_with_reserve": 34454,
    "avg_no_reserve": 34923,
    "delta_dollars": -469,
    "delta_pct": -1.3,
    "n_with": 10,
    "n_without": 13,
    "data_month": "2026-05..2026-07"
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
