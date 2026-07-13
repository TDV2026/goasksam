// Career-wide partner stats and platform baselines (locked principle:
// platforms are judged model-specific, powersellers are judged on their
// entire body of work). Partner stats are computed over the partner's ENTIRE
// tracked sales history via seller usernames, never scoped to the current
// search's comparable records. Every stat renders only when its sample
// clears the config minimum; no stat extrapolates from partner-provided
// claims.

import { supabaseSelect } from "./_supabase.js";

export const STAT_MINIMUMS = {
  careerSample: 5,      // below this the card says we've tracked too few to be fair
  sellThroughSample: 20,
  medianSample: 5,
  mixSample: 5,
  relevanceSample: 3
};

const DAY_MS = 24 * 60 * 60 * 1000;
const median = values => {
  const nums = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
};
const isSold = status => /sold/i.test(String(status || "")) && !/not[_ ]?sold|unsold/i.test(String(status || ""));

export function priceBand(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 50000) return "under $50k";
  if (value < 150000) return "$50k to $150k";
  return "over $150k";
}

// ---- Platform baselines (cached daily per instance) ----
// Sell-through is only computable once the dataset contains non-sold
// listings; today's records are fetched sold-only, so sellThroughPercent
// stays null until the partner-history backfill (which fetches all statuses)
// or a future all-status fetch lands. Callers must omit, never pad.

let baselinesCache = { computedAt: 0, value: null };

export async function computePlatformBaselines(env) {
  if (baselinesCache.value && Date.now() - baselinesCache.computedAt < DAY_MS) return baselinesCache.value;
  // Supabase caps a response at 1,000 rows; page through everything or the
  // recency-ordered head silently drops the unsold rows that make
  // sell-through computable at all.
  const rows = [];
  for (let page = 0; page < 12; page++) {
    const batch = await supabaseSelect(env, `vehicle_market_records?select=platform,make,price,auction_status&limit=1000&offset=${page * 1000}&order=ingested_at.desc`);
    if (!batch) { if (!rows.length) return null; break; }
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  if (!rows.length) return null;
  const platforms = {};
  for (const row of rows) {
    const key = String(row.platform || "unknown");
    if (!platforms[key]) platforms[key] = { listings: 0, sold: 0, prices: [], byBand: {} };
    const p = platforms[key];
    p.listings++;
    if (isSold(row.auction_status)) p.sold++;
    if (isSold(row.auction_status) && Number.isFinite(Number(row.price))) p.prices.push(Number(row.price));
    const band = priceBand(Number(row.price));
    if (band) {
      if (!p.byBand[band]) p.byBand[band] = { listings: 0, sold: 0, prices: [] };
      p.byBand[band].listings++;
      if (isSold(row.auction_status)) p.byBand[band].sold++;
      if (isSold(row.auction_status)) p.byBand[band].prices.push(Number(row.price));
    }
  }
  // Bias guard: most records are fetched sold-only, so a bucket whose unsold
  // share is trivial is a sold-biased sample, not a real sell-through base.
  // Require at least 5% non-sold rows in the bucket itself.
  const finish = bucket => ({
    listings: bucket.listings,
    medianPrice: median(bucket.prices),
    sellThroughPercent: bucket.listings >= STAT_MINIMUMS.sellThroughSample
        && (bucket.listings - bucket.sold) / bucket.listings >= 0.05
      ? Math.round(bucket.sold / bucket.listings * 100)
      : null
  });
  const value = Object.fromEntries(Object.entries(platforms).map(([key, p]) => [key, {
    ...finish(p),
    byBand: Object.fromEntries(Object.entries(p.byBand).map(([band, bucket]) => [band, finish(bucket)]))
  }]));
  baselinesCache = { computedAt: Date.now(), value };
  return value;
}

// ---- Partner career stats (cached daily per partner) ----

const partnerStatsCache = new Map();

export async function computePartnerCareerStats(usernames, env) {
  const key = [...usernames].sort().join("|").toLowerCase();
  const cached = partnerStatsCache.get(key);
  if (cached && Date.now() - cached.computedAt < DAY_MS) return cached.value;

  const list = usernames.map(u => `"${String(u).replace(/"/g, "")}"`).join(",");
  const rows = await supabaseSelect(env,
    `vehicle_market_records?seller_username=in.(${encodeURIComponent(list)})&select=make,platform,price,auction_status,auction_end_date&limit=2000`);
  if (!rows) return null;

  const soldRows = rows.filter(row => isSold(row.auction_status) || !row.auction_status);
  const prices = soldRows.map(row => Number(row.price)).filter(Number.isFinite);
  const makeCounts = new Map();
  for (const row of soldRows) if (row.make) makeCounts.set(row.make, (makeCounts.get(row.make) || 0) + 1);
  // Same bias guard as the baselines: a partner's sell-through only computes
  // when his tracked history genuinely includes non-sold listings (>=5%).
  const nonSold = rows.filter(row => row.auction_status && !isSold(row.auction_status)).length;
  const hasMixedStatuses = rows.length > 0 && nonSold / rows.length >= 0.05;
  const dominantPlatform = [...soldRows.reduce((m, r) => m.set(r.platform, (m.get(r.platform) || 0) + 1), new Map()).entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const stats = {
    trackedSales: soldRows.length,
    latestSaleDate: soldRows.map(row => row.auction_end_date).filter(Boolean).sort().at(-1) || null,
    medianSaleValue: prices.length >= STAT_MINIMUMS.medianSample ? { value: median(prices), sample: prices.length } : null,
    sellThrough: hasMixedStatuses && rows.length >= STAT_MINIMUMS.sellThroughSample
      ? { ratePercent: Math.round(rows.filter(row => isSold(row.auction_status)).length / rows.length * 100), sample: rows.length, platform: dominantPlatform }
      : null,
    makeMix: soldRows.length >= STAT_MINIMUMS.mixSample
      ? [...makeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([make, count]) => ({ make, count, percent: Math.round(count / soldRows.length * 100) }))
      : null,
    belowCareerMinimum: soldRows.length < STAT_MINIMUMS.careerSample,
    minimums: STAT_MINIMUMS,
    // raw slices for request-time relevance; not rendered directly
    rowsByMake: Object.fromEntries([...makeCounts.entries()]),
    soldPrices: prices,
    soldMakesPrices: soldRows.map(row => ({ make: row.make || null, price: Number(row.price) }))
  };
  partnerStatsCache.set(key, { computedAt: Date.now(), value: stats });
  return stats;
}

// ONE relevance line connecting the partner's career to the current car.
// Only returned when the numbers are meaningful.
export function partnerRelevance(stats, vehicle, estimatedValue) {
  if (!stats || !vehicle?.make) return null;
  const makeCount = stats.rowsByMake?.[vehicle.make] || 0;
  if (makeCount < STAT_MINIMUMS.relevanceSample) return null;
  let inPriceBand = null;
  if (Number.isFinite(estimatedValue)) {
    // Scoped to the same make: "13 Ferrari sales tracked, 123 in this car's
    // price range" read as 123 Ferraris when it counted every make.
    const near = stats.soldMakesPrices.filter(row =>
      String(row.make || "").toLowerCase() === String(vehicle.make).toLowerCase() &&
      Number.isFinite(row.price) && row.price >= estimatedValue * 0.6 && row.price <= estimatedValue * 1.4).length;
    if (near > 0) inPriceBand = near;
  }
  return { make: vehicle.make, makeCount, inPriceBand };
}
