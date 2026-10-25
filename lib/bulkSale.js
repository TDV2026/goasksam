// BULK-SALE GUARD (Lane B, Oct 25 2026). One table and one function. A house sells a collection of cars as parts only (RM Sotheby's "The Junkyard", Los
// Angeles, 26 to 28 Oct 2024: 173 lots, 94 of them Porsches, 76 of those under $20,000, every one "offered as parts only", with VINs, 0 miles and a
// 911 S title). Those lots are not sales of running cars and must never sit in a range, a chip, a candle or a tile.
// THE RULE (general, no sale or event is named): rows from one HOUSE (RM Sotheby's, Gooding, Barrett-Jackson, Mecum, Broad Arrow, Bonhams) that sold
// within BULK_SALE.gapDays of each other in the same city are ONE EVENT. When an event holds at least BULK_SALE.minEventRows rows of this pool, and at
// least BULK_SALE.minOthers priced rows outside the event give a reference median, the event's lots priced under BULK_SALE.farBelow of that median are
// "far below". If at least BULK_SALE.shareFar of the event's rows are far below, the far-below lots' own median is under BULK_SALE.medianFar of the reference (a cheap house sale sits at a quarter to a half of its market; a lot of parts cars sits at a few percent), AND at least BULK_SALE.zeroMiles of those far-below rows carry no
// mileage (0 or blank: a driven car has some) the far-below lots are set aside as a bulk sale of project cars. The event's other lots stay.
import { isHouseSource } from "./_houseComps.js";
export const BULK_SALE = { minEventRows: 5, minOthers: 6, farBelow: 0.25, medianFar: 0.15, shareFar: 0.6, zeroMiles: 0.5, gapDays: 2, reason: "bulk sale" };
const dayOf = r => { const t = Date.parse(String(r.auction_end_date || r.date || r.sale_date || "").slice(0, 10)); return Number.isFinite(t) ? Math.round(t / 864e5) : null; };
const median = xs => { const a = xs.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
const noMiles = r => { const m = r.mileage == null || r.mileage === "" ? null : Number(String(r.mileage).replace(/[^\d.]/g, "")); return m == null || m === 0 || !Number.isFinite(m); };
// The house events present in `rows`: [{ rows, key }], rows of one house and city whose sale days chain with gaps of gapDays or less.
export function houseEvents(rows, opts = BULK_SALE) {
  const by = new Map();
  for (const r of rows) {
    if (!isHouseSource(r)) continue;
    const d = dayOf(r); if (d == null) continue;
    const k = `${String(r.source_slug || r.source || r.platform || "").toLowerCase()}|${String(r.city || "").toLowerCase()}`;
    (by.get(k) || by.set(k, []).get(k)).push([d, r]);
  }
  const out = [];
  for (const [k, list] of by) {
    list.sort((a, b) => a[0] - b[0]);
    let cur = [], last = null;
    for (const [d, r] of list) { if (last != null && d - last > opts.gapDays) { out.push({ key: k, rows: cur }); cur = []; } cur.push(r); last = d; }
    if (cur.length) out.push({ key: k, rows: cur });
  }
  return out;
}
// The rows of `rows` to set aside as a bulk sale: a Set of row objects. `usd(r)` gives the row's price in USD (default r._usd).
export function bulkSaleAside(rows, usd = r => r._usd, opts = BULK_SALE) {
  const aside = new Set();
  const list = (rows || []).filter(r => Number.isFinite(usd(r)) && usd(r) > 0);
  for (const ev of houseEvents(list, opts)) {
    if (ev.rows.length < opts.minEventRows) continue;
    const inEv = new Set(ev.rows);
    const others = list.filter(r => !inEv.has(r)).map(usd);
    if (others.length < opts.minOthers) continue;
    const ref = median(others);
    const far = ev.rows.filter(r => usd(r) < opts.farBelow * ref);
    if (far.length / ev.rows.length < opts.shareFar) continue;
    if (median(far.map(usd)) > opts.medianFar * ref) continue;
    if (far.filter(noMiles).length / far.length < opts.zeroMiles) continue;
    far.forEach(r => aside.add(r));
  }
  return aside;
}
