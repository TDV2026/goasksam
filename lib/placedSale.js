// THE ONE SHAPE OF A SALE THE ENGINE HANDS A PAGE WITHOUT ITS VENUE (Lane B, Nov 2 2026; moved here from api/partnerAnswer.js so the partner answer's placedSales and the engine's nearestSales are one copy). A sale's name is the engine row's own title; if it
// carries a venue word or a link, the row's own year, make and model instead; never a venue, never a URL. No key called id, title or url.
import { photoId } from "./_salePhoto.js";
export const VENUE_RE = /bring ?a ?trailer|\bbat\b|cars ?(&|and) ?bids|pcar ?market|hagerty|gooding|rm sotheby|sotheby|bonhams|mecum|barrett|broad ?arrow|hemmings|collecting ?cars|car ?& ?classic|pistonheads|all ?collector|mb ?market|autohunter|\bthemarket\b|https?:\/\//i;
export function rowTitle(r) {
  const t = String((r && r.title) || "").trim();
  if (t && !VENUE_RE.test(t)) return t;
  const f = [r && r.year, r && r.make, r && r.model].filter(Boolean).join(" ").trim();
  return f && !VENUE_RE.test(f) ? f : "";
}
export function placedSaleOf(s) {
  const name = rowTitle({ title: s.title });
  return { date: s.date || null, miles: s.miles ?? null, price: s.price, name: name || null, ...(s.photoId != null && photoId(s.photoId) ? { photo: photoId(s.photoId) } : {}), place: s.place };
}
// a nearest sale: the placed sale's shape without the photo and the place against a range (a nearest sale is read against the car's miles, not against a range)
export function nearestSaleOf(s) { const { date, miles, price, name } = placedSaleOf(s); return { date, miles, price, name }; }
