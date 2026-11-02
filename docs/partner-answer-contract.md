# Partner answer contract (api/partnerAnswer.js), Lane B, Nov 1 2026

Behind the partner gate. The page computes nothing; every figure below is the engine's (lib/onebox.js).

## Request (POST /api/partnerAnswer)
The usual body (`q`, `vin`, `refine`) plus any of:
- `prices`: `{ starting_bid, buy_it_now, reserve, item_price }`, whole dollars (also accepted flat on the body). Up to four.
- `mileage`: whole miles.
- `order`: `miles` | `date` | `price`.
A request with none of these gets the answer it always got.

## Response additions (only when the request asked)
- `positions[]`: `{ key, value, place: below | within | above, low, high }`, one per price the engine can place against the range (placingFor). A price it cannot place has no entry. No range: empty.
- `placedSales[]`: up to five `{ date, miles, price, name, photo?, place }`. `name` is the venue-safe name. `photo` is an archive id served through `/api/partnerAnswer?photo=`, present only when the sale has a photo that loads. No venue and no address, anywhere (the answer guard exempts nothing). No range: empty.
- `order`: the order used (`miles` falls back to `date` with no mileage).

## An answer that prices apart (`perOption`)
An answer apart or split by body, gearbox, year, mileage or edition has no single `range` (`range: null`, `answerType: "not_enough_data"`). When the request asked (prices, mileage or order) it also carries:
```
perOption: {
  dimension: "body" | "gearbox" | "year" | "mileage" | "edition",
  forMileage: null | { value, nearest, line },   // mileage split only, with a typed mileage: the band those miles sit in, or the nearest band that has a range (line = the engine's sentence)
  options: [{ value, label, dimension, n, range: { low, high } | null, positions[], placedSales[], salesReason? }]
}
```
Each option is placed against its OWN range with the same comparison and the same shapes as a single answer (`positions[]` as above; `placedSales[]` up to five, ordered by the request's order, a typed mileage orders each option's five). An option with no range of its own (too few sales): `range: null`, `positions: []`, `placedSales: []`, `salesReason: "too_few_for_a_range"`. An edition option has a range but its sales are not held as a list: positions, `placedSales: []`, `salesReason: "not_listed"`. Same guards as `placedSales`: no venue, no address, no key `title`, `photo` is an archive id. A single-range answer has no `perOption`. The page sends the same request (`prices`, `mileage`, `order`) and computes nothing: it picks the option the visitor chose, or shows each, and prints `positions` and `placedSales` as sent.

## Always present on a range answer
- `span`: `{ low, high }`, the included sales' EXACT lowest and highest sale (the engine's `lowestSaleN` / `highestSaleN`, the figures `lib/sellsForCard.js` reads for the spread beside the range), for the ends of the bar. NOT `d.span`, which is the rounded rail. Null without a range. Numbers only, guarded like every field.

## Served from storage
A demo car's stored answer holds the placed sales for the default order (`date`). A request with prices and no mileage, order `date` or none, is served from it with positions placed from the stored range (partnerPlacesOf): no engine read. A typed mileage or another order reads live. A request that asked nothing gets neither `placedSales` nor `order`.

## Ceiling
`partner_demo` (lib/_ceilings.js): per device 120 a minute, 1,500 an hour, 6,000 a day; per address 1,200 a minute, 15,000 an hour, 60,000 a day. Every POST counts, served from storage or not.
