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

## 3. How the expected values were derived

Each value was worked out by hand: the rung from the thresholds above, the pool by reading every title the engine returned for the
car (`obdiag`, `detail=1`) against the fences, and the band by recomputing p25 and p75 from those prices (it matched the engine's own
cluster on every car where the pool was right). Raw all-time archive counts (`poolsrc`) bound the pool from above. What no
read-only task can show is the RAW archive rows of a window, so "no legitimate sale was left out" cannot be proved for any car yet.
Cars where the rung itself depends on that are marked **pending**; the task that would settle them is specified under FOR LANE B in
`docs/lane-notes.md` (`poolrows`).

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
| 8 | 1957 Porsche 356 Speedster | exact at the threshold | pending |
| 9 | 1997 Land Rover Defender 110 | wheelbase carried | exact, 10 sales, $30,500 to $56,000 |
| 10 | 2003 BMW M3 Coupe | exact, E46 | exact, 14 sales, $23,500 to $35,500 |
| 11 | 1989 Merkur XR4Ti | thin model, rung depends on the window | pending |
| 12 | 2024 Porsche 911 GT3 | generation boundary, halo trim asked for | generation, 992, 25 sales, $244,000 to $272,000 |
| 13 | 2018 Ford Mustang GT | exactly eight, tuner package | pending |
| 14 | 1966 Ferrari 275 GTB | blends across models (no family widening) | pending |
| 15 | 1987 Buick Regal Grand National | typed words carried | exact, 55 sales, $35,500 to $56,000 |
| 16 | 2005 Saab 9-2X | sibling rung | pending |
| 17 | 1931 Bugatti Type 41 | not enough data | not_enough_data, nothing on record |
| 18 | 2011 Honda S2000 | model any year (no sale in the year or near it) | model_any_year, at least 8 sales |
| 19 | 1963 Chevrolet Corvette Split Window | typed word carried (the split window is the coupe) | exact, 32 coupes, $135,000 to $197,000 |
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
8. **356 Speedster.** The engine finds 8; the archive holds 17 titled 356 Speedster in 1957 across all years. Which of them belong to the window cannot be shown. Pending.
9. **Defender 110.** Ten 1997 Defender 110 sales, no 90 or 130. Band $30,500 to $56,000.
10. **E46 M3 Coupe.** 14 sales, band $23,500 to $35,500.
11. **Merkur XR4Ti.** 1989 holds 1; the model has 9 sales in five years. Whether the rung is the widened years or the model any year, and its count, depends on the window. Pending.
12. **2024 GT3.** 2024 holds 1, 2023 to 2025 holds 5, so the whole 992 generation (2022 to 2026) is used: 25 sales. Band $244,000 to $272,000.
13. **2018 Mustang GT.** The engine counts exactly 8, but one of them is a Steeda Q500 Enforcer (aftermarket supercharged package). Without it the count is 7 and the rung moves to 2017 to 2019. Pending a ruling on tuner packages.
14. **275 GTB.** The pool mixes 275 GTB, GTB/4 and GTB/6C titles. Whether GTB/4 belongs to "275 GTB" is a product decision. Pending.
15. **Grand National.** "Regal Grand National" and "Grand National" are one car. 55 sales (4 odd sales set aside), band $35,500 to $56,000. The label must say Grand National.
16. **Saab 9-2X.** Six in the 36-month window, 32 over all years. A sibling (Subaru Impreza) is the next rung only if the model-any-year pool fails eight. Pending.
17. **Bugatti Type 41.** No sale on record: not enough data, say so.
18. **Honda S2000, 2011.** The car was not built in 2011; no sale in 2010 to 2012. The pool is every S2000 sale in the window, labelled "all years".
19. **Split Window.** The 1963 split-window is the coupe; the convertible is a different car. 32 coupes, band $135,000 to $197,000.
20. **1995 NSX.** 15 NSX-T sales; a Honda NSX-R is set aside as an odd sale. Band $86,000 to $136,000.

## 5. Machine-readable block (read by scripts/goldenTruth.mjs)

Fields: `q` typed words; `status` ready or pending; `rung` expected `fallbackRung`; `labelHas` words every product's label must contain;
`count`, `countMin`, `tol`; `low`, `high` (null = no band, thin); `tolPct`; `empty` = nothing on record; `quick` = in the prePush subset;
`page` = also check the Market Check page heading.

```json golden
[
 {"id":1,"q":"2025 Porsche 911","status":"ready","rung":"year_widened","labelHas":["Carrera and Carrera S","2024 to 2026"],"count":12,"tol":2,"low":143000,"high":163000,"tolPct":3,"quick":true,"page":true},
 {"id":2,"q":"2024 Porsche 911 Carrera S Coupe","status":"ready","rung":"year_widened","labelHas":["Carrera S Coupe","2023 to 2025"],"count":8,"tol":2,"low":145000,"high":163000,"tolPct":3},
 {"id":3,"q":"1995 Porsche 911 Carrera","status":"ready","rung":"exact","labelHas":["1995","911 Carrera"],"count":37,"tol":3,"low":64000,"high":107000,"tolPct":3,"quick":true,"page":true},
 {"id":4,"q":"2008 Porsche 997 Carrera S Coupe","status":"ready","rung":"exact","labelHas":["2008","997 Carrera S Coupe"],"count":14,"tol":0,"low":45500,"high":64500,"tolPct":0},
 {"id":5,"q":"1969 Chevrolet Camaro","status":"ready","rung":"exact","labelHas":["1969 Camaro"],"count":21,"tol":3,"low":45500,"high":78500,"tolPct":3,"quick":true},
 {"id":6,"q":"2006 Mercedes-Benz CLK DTM","status":"ready","rung":"year_widened","labelHas":["CLK DTM","2005 to 2007"],"count":12,"tol":0,"low":null,"high":null,"thin":true},
 {"id":7,"q":"2008 Mercedes-Benz CLK63 AMG Black Series","status":"ready","rung":"exact","labelHas":["CLK63","Black Series"],"count":35,"tol":0,"low":95000,"high":146000,"tolPct":0},
 {"id":8,"q":"1957 Porsche 356 Speedster","status":"pending","rung":"exact","labelHas":["356 Speedster"],"pending":"the engine finds 8 and the archive holds 17 in 1957; which belong to the window needs poolrows"},
 {"id":9,"q":"1997 Land Rover Defender 110","status":"ready","rung":"exact","labelHas":["1997","Defender 110"],"count":10,"tol":2,"low":30500,"high":56000,"tolPct":3,"quick":true},
 {"id":10,"q":"2003 BMW M3 Coupe","status":"ready","rung":"exact","labelHas":["2003","M3 Coupe"],"count":14,"tol":2,"low":23500,"high":35500,"tolPct":3},
 {"id":11,"q":"1989 Merkur XR4Ti","status":"pending","rung":"model_any_year","labelHas":["XR4Ti"],"pending":"rung and count depend on the window; needs poolrows"},
 {"id":12,"q":"2024 Porsche 911 GT3","status":"ready","rung":"generation","labelHas":["GT3","992 generation"],"count":25,"tol":2,"low":244000,"high":272000,"tolPct":3,"quick":true},
 {"id":13,"q":"2018 Ford Mustang GT","status":"pending","rung":"exact","labelHas":["2018","Mustang GT"],"pending":"count is 8 only if the Steeda Q500 Enforcer counts; ruling on tuner packages needed, then poolrows"},
 {"id":14,"q":"1966 Ferrari 275 GTB","status":"pending","rung":"year_widened","labelHas":["275 GTB"],"pending":"does GTB/4 belong to 275 GTB; product decision, then poolrows"},
 {"id":15,"q":"1987 Buick Regal Grand National","status":"ready","rung":"exact","labelHas":["1987","Grand National"],"count":55,"tol":0,"low":35500,"high":56000,"tolPct":0},
 {"id":16,"q":"2005 Saab 9-2X","status":"pending","rung":"model_any_year","labelHas":["9-2X"],"pending":"36-month window vs all years decides model_any_year or sibling; needs poolrows"},
 {"id":17,"q":"1931 Bugatti Type 41","status":"ready","rung":"not_enough_data","labelHas":[],"empty":true},
 {"id":18,"q":"2011 Honda S2000","status":"ready","rung":"model_any_year","labelHas":["S2000","all years"],"countMin":8,"low":null,"high":null,"anyBand":true,"quick":true},
 {"id":19,"q":"1963 Chevrolet Corvette Split Window","status":"ready","rung":"exact","labelHas":["1963"],"count":32,"tol":3,"low":135000,"high":197000,"tolPct":3},
 {"id":20,"q":"1995 Acura NSX","status":"ready","rung":"exact","labelHas":["1995","NSX"],"count":15,"tol":2,"low":86000,"high":136000,"tolPct":3}
]
```
