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

// Platform sell-through baselines removed (1b): sell-through is not computable
// from sold-only data and is a banned claim. computePlatformBaselines is gone.

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
  // Sell-through removed (1b): a "% sold" rate is a banned market claim.

  const stats = {
    trackedSales: soldRows.length,
    latestSaleDate: soldRows.map(row => row.auction_end_date).filter(Boolean).sort().at(-1) || null,
    medianSaleValue: prices.length >= STAT_MINIMUMS.medianSample ? { value: median(prices), sample: prices.length } : null,
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
