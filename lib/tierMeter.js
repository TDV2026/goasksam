// THE RANGE METER, DRAWN (Lane D, Nov 8 2026, Sam's Desk dry run). Lane B's sheet read (lib/sheetRead.js, market.meter) says which pool the meter is and its figures: low, p25, median, p75, high and the count, of the picked tier's
// in-band sales when the tier holds five or more, else of the whole body pool. This function adds what a page needs to DRAW that and nothing else: the axis, the step, every sale as a dot with its position, and where the
// engine's range (Low to High, the numbers the meter labels) sits. Pages compute nothing: the positions (pct), the axis and the step ride on the object, so a page only prints what it is given. No figure here is new: every one is the meter's or a sale's own price.
//   meter: { scope, tier, count, low, p25, median, p75, high }     sales: [{ price, date, venue, url, title, mileage, tier, inBand }]  the pool the page lists (the tier's sales, or the whole body pool with each sale's tier)
export const METER_STEP = 500, METER_MAX_DOTS = 400;
export function drawMeter(meter, sales, pickedTier = 0) {
  if (!meter || typeof meter !== "object") return meter || null;
  const list = (Array.isArray(sales) ? sales : []).filter(c => c && Number(c.price) > 0);
  const lo = Math.min(meter.low, meter.median, ...list.map(c => c.price)), hi = Math.max(meter.high, meter.median, ...list.map(c => c.price));
  const axisMin = Math.floor(lo / 1000) * 1000, axisMax = Math.max(Math.ceil(hi / 1000) * 1000, axisMin + 1000), span = axisMax - axisMin;
  const pct = v => Math.round(((v - axisMin) / span) * 1000) / 10;
  const t = Number(pickedTier) || 0;
  return {
    ...meter, pickedTier: t || null, tierN: t ? list.filter(c => Number(c.tier) === t).length : null, axisMin, axisMax, step: METER_STEP,
    lowPct: pct(meter.low), p25Pct: pct(meter.p25), medianPct: pct(meter.median), p75Pct: pct(meter.p75), highPct: pct(meter.high), bandWidthPct: Math.round((pct(meter.high) - pct(meter.low)) * 10) / 10,
    dots: list.slice(0, METER_MAX_DOTS).map(c => ({ price: Math.round(c.price), pct: pct(c.price), date: c.date || null, venue: c.venue || null, url: c.url || null, title: c.title || null, mi: c.mileage == null ? null : c.mileage, inBand: c.inBand == null ? null : !!c.inBand, tier: c.tier == null ? null : Number(c.tier), inTier: t ? Number(c.tier) === t : null }))
  };
}
