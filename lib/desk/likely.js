// THE NEAREST CARS (Lane D, Nov 15 2026, order 2318, replacing the Likely result of Nov 14). desk.likely = { closestIds, count, low, high, nearestLine }, made from the engine's own desk.likelyBasis ({ low, high, count, ids, months }: lib/deskV3.js likelyBasisOf, the nearest comparables inside the longest window, the car's own previous sale left out) and nothing else.
// There is NO likely figure: no figure, figureLine, median or "Likely result" is served, on the case or in the report. The line names the nearest cars, the period they sold in and their range, low and high rounded the way the reserve is (roundReserve). With fewer than three nearest cars every field but count and closestIds is null.
import { reasonLine } from "../reasonWords.js";
import { roundReserve } from "../deskV3.js";
export function likelyOf(desk) {
  const b = desk && desk.likelyBasis, none = { low: null, high: null, count: b && Number.isFinite(b.count) ? b.count : 0, closestIds: b && Array.isArray(b.ids) ? b.ids.slice() : [], nearestLine: null };
  if (!b || b.low == null || b.high == null || !(b.count >= 3) || !(b.months > 0)) return none;
  const low = roundReserve(b.low), high = roundReserve(b.high);
  if (low == null || high == null) return none;
  return { low, high, count: b.count, closestIds: b.ids.slice(), nearestLine: reasonLine(low === high ? "case.likely.nearest_same" : "case.likely.nearest", { count: b.count, months: b.months, low, high }) };
}
