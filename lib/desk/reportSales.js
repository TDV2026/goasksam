// THE SALES THE REPORT PRINTS (Lane D, Nov 15 2026, order 2318 item 2). ONE function: page three, the readiness check, the finalized version's row and the screen's "In report" count all read it, so they cannot name different sales.
// Found live: page three printed four sales that were not ticked "In report". RULE: exactly the sales ticked, in the order the case holds them; a ticked id the engine no longer lists, or the analyst excluded, is not printed; with none ticked, the top three by the engine's rank, never the car's own previous sale (desk.comparables.ownSale, set by the engine) and never a sale listed apart for another gearbox.
// Pure: ids and rows go in, rows come out. No sentence is made here (lib/desk/caseView.js words it with the table).
export const TOP_WHEN_NONE = 3;
export function reportSalesOf(c) {
  const d = (c && c.desk) || {}, listed = Array.isArray(d.comparables) ? d.comparables : [], byId = new Map(listed.map(x => [String(x.id), x])), out = new Set(((c && c.exclusions) || []).map(e => String(e.saleId)));
  const ticked = [...new Set(((c && c.selectedComparables) || []).map(String))].filter(id => byId.has(id) && !out.has(id));
  if (ticked.length) return { source: "ticked", ids: ticked, rows: ticked.map(id => byId.get(id)) };
  const top = listed.filter(x => x && !x.ownSale && x.inPopulation !== false && !out.has(String(x.id)) && Number(x.price) > 0).slice(0, TOP_WHEN_NONE);
  return { source: top.length ? "top" : "none", ids: top.map(x => String(x.id)), rows: top };
}
