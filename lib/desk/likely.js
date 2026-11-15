// THE LIKELY RESULT (Lane D, Nov 14 2026, order 2318). desk.likely = { figure, low, high, count, closestIds, line, sellerLine } and reserve.roleLine, made from the engine's own desk.likelyBasis ({ median, low, high, count, ids }: Lane B, lib/deskV3.js likelyBasisOf, over the rows of
// desk.comparables, the Closest sales, of the view) and nothing else: no figure is made here, the words come from the table. With fewer than three closest sales the engine gives no median, and everything here is null (the report then shows the market sentence alone).
import { reasonLine } from "../reasonWords.js";
export function likelyOf(desk, ck) {
  const b = desk && desk.likelyBasis, none = { figure: null, figureLine: null, low: null, high: null, count: b && Number.isFinite(b.count) ? b.count : 0, closestIds: b && Array.isArray(b.ids) ? b.ids.slice() : [], line: null, sellerLine: null };
  if (!b || b.median == null || b.low == null || b.high == null || !(b.count >= 3)) return none;
  const byId = new Map((desk.comparables || []).map(x => [String(x.id), x])), three = b.ids.slice(0, 3).map(i => byId.get(String(i))).filter(x => x && Number(x.price) > 0).map(x => Number(x.price)).sort((x, y) => x - y);
  const range = reasonLine(b.low === b.high ? "case.likely.line_same" : "case.likely.line", { low: b.low, high: b.high, median: b.median }), floor = ck && ck.of ? reasonLine("case.likely.floor", { reserve: ck.reserve, reached: ck.reached, of: ck.of }) : null;
  return { figure: b.median, figureLine: reasonLine("case.likely.figure", { figure: b.median }), low: b.low, high: b.high, count: b.count, closestIds: b.ids.slice(), line: [range, floor].filter(Boolean).join(" "), sellerLine: [reasonLine("case.likely.seller", { median: b.median }), three.length === 3 ? reasonLine("case.likely.closest", { first: three[0], second: three[1], third: three[2] }) : null].filter(Boolean).join(" ") };
}
export const roleLineOf = likely => (likely && likely.figure != null ? reasonLine("case.reserve.role") : null);
