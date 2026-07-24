// Curated win-condition table (Phase 2). Marks which niche platform is ELIGIBLE
// as Card 1 / Card 2 for a segment; the car's own live comps must still back the
// pick (see applyWinConditions in api/sellerDecision.js). Never shown to users:
// a routing signal only. Cards speak qualitatively via segmentLabel.
//
// Regenerated MONTHLY from scripts/denominators.js (180-day cross-platform
// share). share = the niche platform's 180-day share of that model's
// cross-platform sales; n = total sample.
//   confidence high     (n>=100) -> eligible for CARD 1
//   confidence moderate (50-100) -> CARD 2 only, never promoted to Card 1
//   confidence low      (n<50)   -> logged, never auto-routed
//
// Last regenerated: 2026-07-24 (180-day window). Note: the 911 row is year-
// bounded to air-cooled (<=1998); water-cooled 996/997/991/992 do NOT match
// (they stay BaT/C&B). American-classic rows are model-level; the backing gate
// (the car's own comps on the niche platform) enforces era-appropriateness,
// since Hagerty carries classics, not modern cars.

export const BACKING_MIN = 3; // the car's own comparable sales required on the niche platform

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const WIN_CONDITIONS = [
  // Hagerty — classic American muscle / British classics
  { make: "Chevrolet", model: "Camaro",      platform: "hagerty",    share: 12.4, n: 234, confidence: "high",     segmentLabel: "classic American muscle" },
  { make: "Ford",      model: "Thunderbird",  platform: "hagerty",    share: 10.3, n: 126, confidence: "high",     segmentLabel: "classic American collector cars" },
  { make: "Jaguar",    model: "XJ",           platform: "hagerty",    share: 13.6, n: 81,  confidence: "moderate", segmentLabel: "classic Jaguar saloons" },
  { make: "Chevrolet", model: "Chevelle",     platform: "hagerty",    share: 11.5, n: 78,  confidence: "moderate", segmentLabel: "classic American muscle" },
  { make: "Chevrolet", model: "Impala",       platform: "hagerty",    share: 23.7, n: 38,  confidence: "low",      segmentLabel: "classic American cars" },
  { make: "Chevrolet", model: "3100",         platform: "hagerty",    share: 18.6, n: 43,  confidence: "low",      segmentLabel: "classic American trucks" },
  // PCARMarket — air-cooled / enthusiast Porsche
  { make: "Porsche",   model: "911", yearMax: 1998, platform: "pcarmarket", share: 10.2, n: 364, confidence: "high",     segmentLabel: "air-cooled 911s" },
  { make: "Porsche",   model: "964",           platform: "pcarmarket", share: 11.7, n: 60,  confidence: "moderate", segmentLabel: "air-cooled 911s" },
  { make: "Porsche",   model: "944",           platform: "pcarmarket", share: 14.5, n: 62,  confidence: "moderate", segmentLabel: "the Porsche specialist market" },
  { make: "Porsche",   model: "718",           platform: "pcarmarket", share: 38.9, n: 18,  confidence: "low",      segmentLabel: "the Porsche specialist market" }
];

// Highest-confidence matching row for a vehicle, or null. Year-bounded rows
// require a year and only match inside their range.
export function findWinCondition(vehicle) {
  if (!vehicle) return null;
  const make = norm(vehicle.make), model = norm(vehicle.model);
  if (!make || !model) return null;
  const year = Number(vehicle.year) || null;
  const rank = { high: 3, moderate: 2, low: 1 };
  return WIN_CONDITIONS
    .filter(w => norm(w.make) === make && norm(w.model) === model)
    .filter(w => {
      if (w.yearMax != null || w.yearMin != null) {
        if (!year) return false;
        if (w.yearMax != null && year > w.yearMax) return false;
        if (w.yearMin != null && year < w.yearMin) return false;
      }
      return true;
    })
    .sort((a, b) => (rank[b.confidence] - rank[a.confidence]) || (b.n - a.n))[0] || null;
}
