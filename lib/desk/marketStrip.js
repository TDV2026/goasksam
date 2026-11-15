// THE MARKET STAT STRIP (Stage 1, Nov 14 2026): the four cells under What the market paid, made from the view's own evidence strings in the table's words, so the page prints text and formats nothing.
// Typical range (the emphasised cell), Median, Sales (its note is the date span) and Lowest to highest. A cell with no value is not made; a view with too few sales has the Sales cell alone.
import { reasonLine } from "../reasonWords.js";
export function stripOf(e) {
  if (!e) return [];
  const cells = [], ok = !e.insufficient;
  if (ok && e.typicalLine) cells.push({ key: "typical", label: reasonLine("desk.strip.typical_label"), value: e.typicalLine, note: reasonLine("desk.strip.typical_note"), emphasis: true });
  if (ok && e.medianLine) cells.push({ key: "median", label: reasonLine("desk.strip.median_label"), value: e.medianLine, note: reasonLine("desk.strip.median_note"), emphasis: false });
  if (e.countLine) cells.push({ key: "count", label: reasonLine("desk.strip.sales_label"), value: e.countLine, note: e.periodLine || null, emphasis: false });
  if (ok && e.extremesLine) cells.push({ key: "extremes", label: reasonLine("desk.strip.extremes_label"), value: e.extremesLine, note: reasonLine("desk.strip.extremes_note"), emphasis: false });
  return cells;
}
