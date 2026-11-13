// THE RESERVE MODE'S SENTENCES, MADE WHEN THE CASE IS SERVED (Lane D, Nov 12 2026; Sam's live run: the demo case still printed an old "Reserve or no reserve" line because the engine's sentence was stored on the case when it was seeded).
// A stored case keeps the engine's figures (counts, medians, shares, the decision). The words are the table's (lib/reasonWords.js) and are made here from those figures every time a case is served, so a wording change reaches every case at once, old ones included.
// The decision itself is never remade here: recommendation and thin stay as the engine gave them. A case with no figures to speak from keeps what it holds.
import { reasonLine, deskAndList } from "../reasonWords.js";
const n = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export function speakReserveMode(rm) {
  if (!rm || typeof rm !== "object" || !rm.withReserve || !rm.noReserve) return rm;
  const w = rm.withReserve, o = rm.noReserve, res = n(w.count), nores = n(o.count), min = n(rm.margin && rm.margin.minOutcomes) || 5;
  if (res == null || nores == null) return rm;
  const out = { ...rm }, cnt = { res, nores, min }, one = (side) => ({ ...side, medianLine: n(side.median) != null ? reasonLine("desk4.rmode_median", { median: n(side.median) }) : (side.medianLine == null ? null : side.medianLine) });
  out.withReserve = one(w); out.noReserve = one(o);
  if (rm.thin) out.thinLine = out.line = reasonLine(res < min && nores < min ? "desk4.rmode_thin_both" : nores < min ? "desk4.rmode_thin_no_reserve" : "desk4.rmode_thin_reserve", cnt);
  else if (rm.recommendation === "no_reserve" || rm.recommendation === "reserve") {
    const lead = rm.recommendation, hi = lead === "no_reserve" ? o : w, lo = lead === "no_reserve" ? w : o, parts = [];
    if (n(hi.median) != null && n(lo.median) != null && Math.abs(hi.median - lo.median) / Math.min(hi.median, lo.median) * 100 >= (n(rm.margin && rm.margin.medianPercent) || 10) && hi.median > lo.median) parts.push(reasonLine("desk4.rmode_gap_median", { hi: hi.median, lo: lo.median }));
    if (n(hi.soldShare) != null && n(lo.soldShare) != null && hi.soldShare - lo.soldShare >= (n(rm.margin && rm.margin.sharePoints) || 10)) parts.push(reasonLine("desk4.rmode_gap_share", { hi: hi.soldShare, lo: lo.soldShare }));
    if (parts.length) out.line = reasonLine(lead === "no_reserve" ? "desk4.rmode_lead_no_reserve" : "desk4.rmode_lead_reserve", { why: parts.join(" and ") });
  }
  else if (rm.recommendation === "unclear") {
    const med = n(w.median) != null && n(o.median) != null ? Math.abs(w.median - o.median) / Math.min(w.median, o.median) * 100 : null, shr = n(w.soldShare) != null && n(o.soldShare) != null ? Math.abs(w.soldShare - o.soldShare) : null;
    const medSide = med != null && med >= (n(rm.margin && rm.margin.medianPercent) || 10), shrSide = shr != null && shr >= (n(rm.margin && rm.margin.sharePoints) || 10);
    out.line = reasonLine(medSide || shrSide ? "desk4.rmode_conflict" : "desk4.rmode_flat", { ...cnt, pct: Math.floor(med || 0), pts: Math.floor(shr || 0) });
  }
  if (rm.unflagged && n(rm.unflagged.count)) out.unflagged = { ...rm.unflagged, line: reasonLine("desk4.rmode_unflagged", { count: rm.unflagged.count, noun: rm.unflagged.count === 1 ? "sale" : "sales", venues: deskAndList(rm.unflagged.venues || []) }) };
  return out;
}
// the case with its reserve mode spoken: a copy, the stored case is never changed
export const spoken = c => (c && c.desk && c.desk.reserveMode ? { ...c, desk: { ...c.desk, reserveMode: speakReserveMode(c.desk.reserveMode) } } : c);
