// Evidence weighting (locked, July 2026): recency decay, scope purity,
// platform dominance and the INTERNAL confidence score. The confidence
// number is engine telemetry: it is never rendered to a user and never
// drives copy that hedges a recommendation (rule 15).

export function getRecencyMultiplier(daysAgo) {
  if (daysAgo <= 30) return 1.0;
  if (daysAgo <= 60) return 0.85;
  if (daysAgo <= 90) return 0.70;
  if (daysAgo <= 180) return 0.50;
  if (daysAgo <= 365) return 0.25;
  return 0.0;
}

// Scope purity: how directly a rung's comps describe the exact car. The
// keys map the REAL ladder rung keys (generation-aware, Phase 4) onto the
// spec's purity tiers; trim-scoped generation rungs sit between exact and
// generation because the trim is held constant.
const SCOPE_PURITY = {
  exact_year_trim: 1.0,
  near_years_trim: 0.85,
  year_range_trim: 0.85,
  generation_trim: 0.85,
  any_year_trim: 0.75,
  exact_year_model: 0.95,
  generation_model: 0.75,
  near_years_model: 0.75,
  year_range_model: 0.75,
  any_year_model: 0.60,
  segment: 0.40,
  make_context: 0.20
};

export function getScopePurityMultiplier(scope) {
  return SCOPE_PURITY[scope] ?? 0.0;
}

export function getPlatformDominanceScore(platformCounts) {
  const total = Object.values(platformCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const sorted = Object.values(platformCounts).sort((a, b) => b - a);
  const maxShare = sorted[0] / total;
  const secondShare = sorted[1] ? sorted[1] / total : 0;
  const spread = maxShare - secondShare;
  if (spread >= 0.40) return 85;
  if (spread >= 0.30) return 75;
  if (spread >= 0.20) return 60;
  if (spread >= 0.10) return 45;
  return 35;
}

// Effective sample size: each sale contributes its recency multiplier times
// the scope purity of the rung it was judged under. daysAgoList carries the
// age of each sale in days; scope is the rung key.
export function calculateEffectiveSampleSize(daysAgoList, scope) {
  const scopeMult = getScopePurityMultiplier(scope);
  let effectiveSize = 0;
  for (const daysAgo of daysAgoList) {
    effectiveSize += getRecencyMultiplier(daysAgo) * scopeMult;
  }
  return Math.round(effectiveSize * 10) / 10;
}

export const MINIMUM_EFFECTIVE_SAMPLE = 3.0;

export function calculateConfidenceScore(data) {
  const weights = { recency: 0.35, sampleSize: 0.25, platformDominance: 0.20, outcomeQuality: 0.20 };

  let recencyScore = 100;
  if (data.recencySample < 2.0) recencyScore = 40;
  else if (data.recencySample < 3.5) recencyScore = 65;
  else if (data.recencySample < 5.0) recencyScore = 85;

  let sampleScore = 100;
  if (data.totalSample < 3.0) sampleScore = 35;
  else if (data.totalSample < 5.0) sampleScore = 55;
  else if (data.totalSample < 8.0) sampleScore = 75;

  const dominanceScore = data.platformDominance;
  const outcomeScore = Math.min(data.outcomeSample * 8, 100);

  return Math.round(
    (recencyScore * weights.recency) +
    (sampleScore * weights.sampleSize) +
    (dominanceScore * weights.platformDominance) +
    (outcomeScore * weights.outcomeQuality)
  );
}

export function getConfidenceLevel(score) {
  if (score >= 90) return "HIGH";
  if (score >= 75) return "MEDIUM_HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "MEDIUM_LOW";
  return "LOW";
}
