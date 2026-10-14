# Golden rules and golden cars (Lane B2, Oct 13 2026)

One engine serves Market Check, Buy, Sell and Tasks. The same typed words give the same rung, label, pool, count and range on
every product. This file says what that answer is, written down by hand from the rules and the archive, so the engine is
checked against a human reading and not against itself. `scripts/goldenTruth.mjs` reads the JSON block at the bottom of this
file and compares all four product paths to it. Report-only for now.

## 1. The ladder

Walk the rungs in this order. Stop at the first rung whose pool reaches eight sales (`RANGE_THRESHOLD`).

1. **Exact.** The exact model year, honouring every typed word: make, model, trim, edition, body, wheelbase, series, number.
2. **Widen one year each side, inside the generation.** Year +/- 1, then +/- 2, one year at a time, never past the
   generation (or the curated production run). Stop at the first span that reaches eight. Label: `{car}, {first} to {last}`
   using the years the pool really holds.
3. **The whole generation.** Label `{car} ({code} generation)`.
4. **The model, any year.** Label `{model}, all years`.
5. **A named sibling,** labelled `Closest: {sibling}`. Only from the curated sibling table.
6. **Not enough data.** Nothing on record for the car or anything near it.

Under eight sales on every rung: show the nearest real sales, count only, name the rung. No band, no range, no median.

## 2. The rules that apply on every rung

- **Every fence on every rung.** Parts, memorabilia, replicas, clones, tributes, race cars, restomods, projects, modified or
  non-stock cars, odd-sale outliers and sub-$2,500 rows are out of the pool whatever the rung. Widening never relaxes a fence.
- **A bare model name means the base trims only.** A bare 911 is Carrera and Carrera S (coupe, cabriolet): Carrera 4, 4S, T, GTS,
  Targa, Turbo, GT3 and GT2 are separate named options and stay out. A bare Camaro leaves out Z/28, SS, COPO and Yenko. A bare
  AMG-badge pool leaves out only what sits above the badge. **The label must say so** ("911 Carrera and Carrera S, ..."), because
  a reader of "911 models" assumes every 911.
- **Typed words are carried, never dropped.** A trim, edition, wheelbase, body or series the user typed scopes the pool and
  appears in the label. A halo trim that is the thing asked for (GT3, Black Series) is the pool, not an aside.
- **An aftermarket or dealer package does not change the car.** A Mustang GT with a Steeda (or Roush) package is still a Mustang GT and counts in the Mustang GT
  pool. Only a substantial modification, a conversion, a clone or a replica is out (the modified and replica fences). A package never moves a car to another
  model's pool or out of its own.
- **A model with its own name is its own pool.** The 275 GTB/4 is a separate model from the 275 GTB (two-cam): it is not in the 275 GTB pool, and the 275 GTB is
  not in its. The same applies to any suffix that names a different car (GTB/4, GTS, GTC).
- **Halo aside.** On a base query a separate, pricier tier is set aside. It is the base pool that must survive.
- **Models that blend.** A nameplate whose number covers distinct cars (Ferrari 250, 275, 330, 365, 512, Dodge Viper) never widens
  into the family; it stays on its own sales.
- **Window.** The pool is the last twelve months when that already holds eight sales; otherwise the engine looks back up to five
  years and labels the window. Count, band and cards all come from that one window.
- **Range basis.** With eight or more sales and a cluster, the band is the middle half of the pool (p25 to p75), rounded to the
  nearest $500 below $100,000 and the nearest $1,000 from $100,000. The same pool gives the count, the cards and the band.
- **Thin.** Fewer than eight ONLINE sales (house sales do not count toward the online range) is the thin tier: the sales
  themselves, no band. Eight or more sales of any kind let the facts line state the lowest and highest real sale.
- **Same answer everywhere.** Market Check, Buy, Sell and Tasks agree on rung, label, count, low and high for the same words.

- **A page says what its engine said.** What a product's page prints (the scope line, the sales count, the range or sold-between range) is the same pool as that
  product's engine answer: same count, same low and high, same years in the scope line. goldenTruth reports a difference as RENDER DRIFT.

## 3. How the expected values were derived

Each value was worked out by hand: the rung from the thresholds above, the pool by reading every title the engine returned for the
car (`obdiag`, `detail=1`) against the fences, and the band by recomputing p25 and p75 from those prices (it matched the engine's own
cluster on every car where the pool was right). Raw all-time archive counts (`poolsrc`) bound the pool from above. What no
read-only task can show is the RAW archive rows of a window, so "no legitimate sale was left out" cannot be proved for any car yet.
Cars 8, 11 and 16 were pending until `poolrows` was built; they were settled on Oct 14 (see their lines below). Cars 12 and 18 were re-derived the same day because the archive grew.

Expected counts for cars on the "last twelve months" window drift as old sales leave it. `tol` is the allowed drift on the count (and
`tolPct` on a band edge). Refresh this file when a car moves further than that.

## 4. The twenty golden cars

| # | Car | What it covers | Expected |
|---|---|---|---|
| 1 | 2025 Porsche 911 | widen one year each side, bare model = base trims | year_widened, 2024 to 2026, 12 sales, $143,000 to $163,000 |
| 2 | 2024 Porsche 911 Carrera S Coupe | widen, trim + body kept | year_widened, 2023 to 2025, 8 sales, $145,000 to $163,000 |
| 3 | 1995 Porsche 911 Carrera | exact, Carrera 4 fenced out | exact, 37 sales, $64,000 to $107,000 |
| 4 | 2008 Porsche 997 Carrera S Coupe | exact, chassis code | exact, 14 sales, $45,500 to $64,500 |
| 5 | 1969 Chevrolet Camaro | exact, halo aside (Z/28, SS, COPO, Yenko) | exact, 21 sales, $45,500 to $78,500 |
| 6 | 2006 Mercedes-Benz CLK DTM | thin: house sales do not make an online range | year_widened, 2005 to 2007, 12 sales, no band |
| 7 | 2008 Mercedes-Benz CLK63 AMG Black Series | Black Series is the pool asked for | exact, 35 sales, $95,000 to $146,000 |
| 8 | 1957 Porsche 356 Speedster | exact at the threshold, online sales only | exact, 8 sales, $282,000 to $363,000 |
| 9 | 1997 Land Rover Defender 110 | wheelbase carried | exact, 10 sales, $30,500 to $56,000 |
| 10 | 2003 BMW M3 Coupe | exact, E46 | exact, 14 sales, $23,500 to $35,500 |
| 11 | 1989 Merkur XR4Ti | thin model, no rung reaches eight | thin, no band |
| 12 | 2024 Porsche 911 GT3 | halo trim asked for, window before years | year_widened, 2023 to 2024, 14 sales, $243,000 to $269,000 |
| 13 | 2018 Ford Mustang GT | exactly eight, aftermarket package still counts | exact, 8 sales, $30,000 to $35,500 |
| 14 | 1966 Ferrari 275 GTB | its own model (the 275 GTB/4 is out), blends across models | year_widened, 1965 to 1966, 10 sales, thin, no band |
| 15 | 1987 Buick Regal Grand National | typed words carried | exact, 55 sales, $35,500 to $56,000 |
| 16 | 2005 Saab 9-2X | exact year, five-year window | exact, 20 sales, $9,000 to $13,500 |
| 17 | 1931 Bugatti Type 41 | not enough data | not_enough_data, nothing on record |
| 18 | 2011 Honda S2000 | year outside the production run, span clamped to 2009 | year_widened, 2009, 15 sales, $36,500 to $64,000 |
| 19 | 1963 Chevrolet Corvette Split Window | typed word carried (the split window is the coupe) | exact, 38 coupes, $140,000 to $214,000 |
| 20 | 1995 Acura NSX | exact, odd-sale fence (a Honda NSX-R set aside) | exact, 15 sales, $86,000 to $136,000 |

Per car, in the words of the derivation:

1. **2025 Porsche 911.** 2025 alone holds 2 sales. Plus and minus one year (2024 to 2026): 12 Carrera and Carrera S coupes and cabriolets
   (10 coupes, 2 cabriolets) reach eight, so stop. p25 $142,748 and p75 $163,375 round to $143,000 and $163,000. The 4S, T, GTS,
   Targa, Turbo and GT3 sales in those years are outside a bare 911. Label must say Carrera and Carrera S and 2024 to 2026.
2. **2024 Carrera S Coupe.** 2024 alone holds 6. Adding 2023 (1) and 2025 (1) makes 8: stop at 2023 to 2025. Band p25 $144,875 and p75 $163,375.
3. **1995 Carrera.** 37 sales in the twelve months, all 1995, Carrera 4 and RS excluded. Band $64,000 to $107,000.
4. **2008 997 Carrera S Coupe.** 14 in the model-year window (twelve months holds fewer than eight). Band $45,500 to $64,500.
5. **1969 Camaro.** 21 base-trim sales (2 modified set aside). Band $45,500 to $78,500.
6. **CLK DTM.** 2006 alone holds 6; 2005 to 2007 holds 12, all house sales. Online sales: 0, so the tier is thin and there is no band. The facts line
   may state the lowest and highest real sale. Basis note: cards carry the all-in figure and the thin span carries hammer; pick one before printing.
7. **CLK63 AMG Black Series.** Every one of the 35 titles says Black Series. Band $95,000 to $146,000.
8. **356 Speedster.** (Settled Oct 14 from poolrows.) 1957 Speedster rows that are not replicas, re-creations, conversions or Carrera/Zagato cars: 33 since Feb 2022, 18 of them house sales and 15 online. House sales do not make the online range, so the pool is the online sales: the last twelve months hold 1, so the window looks back (five years, from 1 Feb 2022). Fifteen online rows less the Collecting Cars rows with no photo, one modified car and one odd sale leaves 8 to 10. The ladder stops on the exact year at eight. Band: p25 and p75 of the eight cards, $282,000 to $363,000 (tolPct 5, because the exact set depends on the photo and modified fences).
9. **Defender 110.** Ten 1997 Defender 110 sales, no 90 or 130. Band $30,500 to $56,000.
10. **E46 M3 Coupe.** 14 sales, band $23,500 to $35,500.
11. **Merkur XR4Ti.** (Settled Oct 14 from poolrows.) Eleven rows on record. In the five-year window, less one project car and one $1,400 sale (under the $2,500 floor): 8 sales across the whole model (1985 to 1989: $4,505, $6,200, $6,600, $7,250, $8,000, $9,700, $16,000, $31,000). 1989 holds 1, 1987 to 1989 holds 6. The whole model reaches eight only with the $31,000 1985 car, which sits above p75 + 1.5 x the middle range ($11,275 + 1.5 x $4,775 = $18,437) and is set aside as an odd sale, leaving 7. No rung reaches eight: thin, the sales themselves, no band. (The engine shows 3 sales, on a 36 month window; the ladder's window is five years, so the count it prints is shorter than the ladder's 6. Reported, not a band difference.)
12. **2024 GT3.** (Re-derived Oct 14 from poolrows, 300 rows of 2022 to 2026 GT3 sales; the old 25 counted the 2022 cars from a 12 month window.) The pool is the plain GT3: Touring, RS, Weissach, Manthey and Clubsport are other tiers, and Tribute and race cars are fenced. Plain GT3 by year on record: 2022 40, 2023 10, 2024 6, 2026 5, 2025 none. Exact 2024: 2 in twelve months, 6 over five years, never eight. Plus and minus one year (2023 to 2025): 6 in twelve months, so the window looks back: 9 in 18 months, 14 in 24 months. Eight reached, stop. The pool holds 2023 and 2024 (no plain 2025 sale), 14 sales since Oct 2024, p25 $243,125 and p75 $269,000: $243,000 to $269,000. The ladder stops at the first span that reaches eight, and the window rule extends the window inside the rung, so the whole generation (rung 3) is never needed. The label must read years, not the generation: "911 GT3, 2023 to 2024" (the whole-generation label would say a 2022 to 2026 pool).
13. **2018 Mustang GT.** Eight sales, band $30,000 to $35,500. One is a Steeda Q500 Enforcer; an aftermarket package does not change the car, so it counts. (A Roush
    Jackhammer is set aside as an odd sale on price, not for the package.) Exactly eight, so the ladder stops on the exact year.
14. **275 GTB.** The 275 GTB/4 (1966 to 1968, four-cam) is its own model and is out. What is left is the two-cam 275 GTB, including GTB/6C and Alloy: 1966 alone holds 7,
    1965 adds 3, so 1965 to 1966 holds 10 and the ladder stops. Every one is a house sale, so the tier is thin: the sales themselves, no band. (The engine pools 19: nine
    of them 1967 GTB/4.)
15. **Grand National.** "Regal Grand National" and "Grand National" are one car. 55 sales (4 odd sales set aside), band $35,500 to $56,000. The label must say Grand National.
16. **Saab 9-2X.** (Settled Oct 14 from poolrows; the one derivation that rests on the window reading.) 33 rows on record, all 2005 and 2006. Exact 2005: 4 in 36 months, 20 in the five-year window since 15 Oct 2021. The written window rule is "the last twelve months when it holds eight, otherwise back up to five years", so the exact year is the rung: 20 sales, p25 $9,000 and p75 $13,262, $9,000 to $13,500. The engine stops widening the window at 36 months for this car and lands on 2005 to 2006 with 6 sales and no band; that is the difference goldenTruth reports (Lane B's window).
17. **Bugatti Type 41.** No sale on record: not enough data, say so.
18. **Honda S2000, 2011.** (Re-derived Oct 14 from poolrows.) The S2000 was built 2000 to 2009. Exact 2011: none. Plus and minus two years is 2009 to 2013, but the ladder never goes past the curated production run, so the span is 2009 alone. 2009 holds 5 in twelve months to 24 months (9), and 18 in the five-year window since 23 Apr 2022; two CR cars ($170,000, $200,000) are odd sales, one more is below the floor or no photo: 15 to 16 sales (the engine used 14). p25 $36,375 and p75 $64,000: $36,500 to $64,000. The rung is year_widened, and the label must name the years the pool holds (2009). The old "model any year" reading assumed the widened span held no sale; it holds 2009.
19. **Split Window.** The 1963 split-window is the coupe; the convertible is a different car. Re-derived Oct 14 from poolrows (1963 Corvette rows since 24 Oct 2025, convertibles fenced as a different body): 58 coupes, 39 of them online sales (house sales do not make the online range), less one odd sale ($312,500): 38, p25 $140,000 and p75 $213,500, so $140,000 to $214,000. The old 32 and $135,000 to $197,000 were the pool in October's first window; new BaT sales have moved it.
20. **1995 NSX.** 15 NSX-T sales; a Honda NSX-R is set aside as an odd sale. Band $86,000 to $136,000.

## 5. Machine-readable block (read by scripts/goldenTruth.mjs)

Fields: `q` typed words; `status` ready or pending; `rung` expected `fallbackRung`; `labelHas` words every product's label must contain;
`count`, `countMin`, `tol`; `low`, `high` (null = no band, thin); `tolPct`; `empty` = nothing on record; `quick` = in the prePush subset;
`page` = also check the Market Check page heading.

```json golden
[
 {"id":1,"q":"2025 Porsche 911","status":"ready","rung":"year_widened","labelHas":["Carrera and Carrera S","2024 to 2026"],"count":12,"tol":2,"low":143000,"high":163000,"tolPct":3,"quick":true,"page":true},
 {"id":2,"q":"2024 Porsche 911 Carrera S Coupe","status":"ready","rung":"year_widened","labelHas":["Carrera S Coupe","2023 to 2025"],"count":8,"tol":2,"low":145000,"high":163000,"tolPct":3},
 {"id":3,"q":"1995 Porsche 911 Carrera","status":"ready","rung":"exact","labelHas":["1995","911 Carrera"],"count":37,"tol":3,"low":64000,"high":107000,"tolPct":3,"quick":true},
 {"id":4,"q":"2008 Porsche 997 Carrera S Coupe","status":"ready","rung":"exact","labelHas":["2008","997 Carrera S Coupe"],"count":14,"tol":0,"low":45500,"high":64500,"tolPct":0},
 {"id":5,"q":"1969 Chevrolet Camaro","status":"ready","rung":"exact","labelHas":["1969 Camaro"],"count":21,"tol":3,"low":45500,"high":78500,"tolPct":3},
 {"id":6,"q":"2006 Mercedes-Benz CLK DTM","status":"ready","rung":"year_widened","labelHas":["CLK DTM","2005 to 2007"],"count":12,"tol":0,"low":null,"high":null,"thin":true},
 {"id":7,"q":"2008 Mercedes-Benz CLK63 AMG Black Series","status":"ready","rung":"exact","labelHas":["CLK63","Black Series"],"count":35,"tol":0,"low":95000,"high":146000,"tolPct":0},
 {"id":8,"q":"1957 Porsche 356 Speedster","status":"ready","rung":"exact","labelHas":["1957","356 Speedster"],"count":8,"tol":2,"low":282000,"high":363000,"tolPct":5},
 {"id":9,"q":"1997 Land Rover Defender 110","status":"ready","rung":"exact","labelHas":["1997","Defender 110"],"count":10,"tol":2,"low":30500,"high":56000,"tolPct":3},
 {"id":10,"q":"2003 BMW M3 Coupe","status":"ready","rung":"exact","labelHas":["2003","M3 Coupe"],"count":14,"tol":2,"low":23500,"high":35500,"tolPct":3},
 {"id":11,"q":"1989 Merkur XR4Ti","status":"ready","labelHas":["XR4Ti"],"low":null,"high":null,"thin":true},
 {"id":12,"q":"2024 Porsche 911 GT3","status":"ready","rung":"year_widened","labelHas":["GT3","2023 to 2024"],"count":14,"tol":2,"low":243000,"high":269000,"tolPct":3,"quick":true},
 {"id":13,"q":"2018 Ford Mustang GT","status":"ready","rung":"exact","labelHas":["2018","Mustang GT"],"count":8,"tol":0,"low":30000,"high":35500,"tolPct":0},
 {"id":14,"q":"1966 Ferrari 275 GTB","status":"ready","rung":"year_widened","labelHas":["275 GTB","1965 to 1966"],"count":10,"tol":0,"low":null,"high":null,"thin":true},
 {"id":15,"q":"1987 Buick Regal Grand National","status":"ready","rung":"exact","labelHas":["1987","Grand National"],"count":55,"tol":0,"low":35500,"high":56000,"tolPct":0},
 {"id":16,"q":"2005 Saab 9-2X","status":"ready","rung":"exact","labelHas":["2005","9-2X"],"count":20,"tol":3,"low":9000,"high":13500,"tolPct":5},
 {"id":17,"q":"1931 Bugatti Type 41","status":"ready","rung":"not_enough_data","labelHas":[],"empty":true},
 {"id":18,"q":"2011 Honda S2000","status":"ready","rung":"year_widened","labelHas":["S2000","2009"],"count":15,"tol":2,"low":36500,"high":64000,"tolPct":3},
 {"id":19,"q":"1963 Chevrolet Corvette Split Window","status":"ready","rung":"exact","labelHas":["1963"],"count":38,"tol":3,"low":140000,"high":214000,"tolPct":3},
 {"id":20,"q":"1995 Acura NSX","status":"ready","rung":"exact","labelHas":["1995","NSX"],"count":15,"tol":2,"low":86000,"high":136000,"tolPct":3}
]
```
