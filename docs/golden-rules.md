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
- **The one odd-sale rule (Sam, Oct 15 2026: keep 1.35).** Take the pool after every other fence, sort the prices and find the top of the
  middle half, p75, by straight-line interpolation between the two nearest sales (position (n - 1) x 0.75 in the sorted list). A sale priced
  above 1.35 times that p75 is set aside as an odd sale. High side only: a low sale is never an odd sale, only the $2,500 floor and the other
  fences remove it. One pass, no repeat on the smaller pool, and the same rule on every rung, every venue and every product. Hand
  derivations use this rule, never the wider fence (p75 plus 1.5 times the middle range). Engine: `r4Split` in lib/onebox.js.
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
- **Options, rule 1: body and identity options** (Coupe, Cabriolet, Targa, Fastback and similar) show whenever they hold at least one qualifying sale, each count equals the count of the page it opens, and the counts sum to Any, on all four products (Sam, Oct 15 2026). Checked by the identity rows (the 1965 Ford Mustang).
- **Options, rule 2: variant-market options** (Pushrod, Carrera four-cam, Road, Competizione) show only when both sides hold 8 or more sales and the two sides sit 25 percent apart; a smaller variant is set aside and named in the scope line. Checked by rows 22 (1957 Porsche 356 Speedster) and 23 (1966 Ferrari 275 GTB).
- **Never a zero option.** An option with zero sales never shows under either rule, and no restoration option line appears (restoration is a labelled set-aside).
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
| 4 | 2008 Porsche 997 Carrera S Coupe | exact, chassis code, last twelve months, US and Canada | exact, 11 sales, $58,500 to $69,000 |
| 5 | 1969 Chevrolet Camaro | exact, halo aside (Z/28, SS, COPO, Yenko) | exact, 21 sales, $45,500 to $78,500 |
| 6 | 2006 Mercedes-Benz CLK DTM | thin: house sales do not make an online range; US and Canada only | year_widened, 2005 to 2006, 6 sales, no band |
| 7 | 2008 Mercedes-Benz CLK63 AMG Black Series | Black Series is the pool asked for | exact, 35 sales, $95,000 to $146,000 |
| 8 | 1957 Porsche 356 Speedster | exact at the threshold, online sales only | exact, 8 sales, $282,000 to $363,000 |
| 9 | 1997 Land Rover Defender 110 | wheelbase carried | exact, 10 sales, $30,500 to $56,000 |
| 10 | 2003 BMW M3 Coupe | exact, E46 | exact, 14 sales, $23,500 to $35,500 |
| 11 | 1989 Merkur XR4Ti | thin model, no rung reaches eight | thin, no band |
| 12 | 2024 Porsche 911 GT3 | halo trim asked for, window before years | year_widened, 2023 to 2024, 14 sales, $243,000 to $269,000 |
| 13 | 2018 Ford Mustang GT | exactly eight, aftermarket package still counts | exact, 8 sales, $30,000 to $35,500 |
| 14 | 1966 Ferrari 275 GTB | its own model (the 275 GTB/4, GTS and GTB/C are out), blends across models, US and Canada only | year_widened, 1965 to 1966, 9 sales, thin, no band |
| 15 | 1987 Buick Regal Grand National | typed words carried | exact, 55 sales, $35,500 to $56,000 |
| 16 | 2005 Saab 9-2X | exact year, five-year window, modified cars fenced | exact, 15 sales, $9,000 to $12,500 |
| 17 | 1931 Bugatti Type 41 | not enough data | not_enough_data, nothing on record |
| 18 | 2011 Honda S2000 | year outside the production run, span clamped to 2009 | year_widened, 2009, 15 sales, $36,500 to $64,000 |
| 19 | 1963 Chevrolet Corvette Split Window | typed word carried (the split window is the coupe) | exact, 38 coupes, $140,000 to $214,000 |
| 20 | 1995 Acura NSX | exact, odd-sale fence (a Honda NSX-R set aside) | exact, 15 sales, $86,000 to $136,000 |
| 21 | 1965 Ford Mustang (bare) | the identity question: every option opens the pool it counts, and the options add up to Any | each option count equals the count its page shows, options sum to Any |
| 22 | 1957 Porsche 356 Speedster (set-aside and options) | same car as row 8; replicas, recreations and the odd sale set aside with their reasons; Sam, Oct 15 2026: an option with zero sales is never shown, on any product, and no restoration option line appears | exact, 8 sales in range plus 2 set aside (odd sale, modified), $282,000 to $363,000, no option shown at zero; variant-market rule: a variant shows only with 8 or more sales on both sides, 25 percent apart, else set aside and named |
| 23 | 1966 Ferrari 275 GTB (thin, no zero option) | same car as row 14; nine sales, thin, no range, no question screen, set-aside sales listed with their reasons; no option at zero, no restoration line | year_widened, 9 sales, no range, same answer on all four products |
| 24 | 1969 Chevrolet Camaro (bare) | the identity question: "convertible" typed and the Convertible chip give one answer; every option opens the pool it counts, and the options add up to Any | chip count equals typed count, each option equals its page, options sum to Any (expected to fail until e56) |
| 25 | 1969 Chevrolet Camaro convertible (typed) | the same answer as the Convertible chip on the bare 1969 Camaro page: label "1969 Camaro Convertible", the bare car's exact rung (never widened), 3 sales, no range (under the band) | on all four products; expected to fail until e56 (e55 reads 24, widened to 1967 to 1969) |
| 26 | 2005 Porsche 911 (bare) | the identity question: every option, Targa included, equals its typed words and its page, and the options add up to Any | chip count equals typed count for each option (expected to fail on Targa until e57) |
| 27 | 2005 Porsche 911 targa (typed) | the same answer as the Targa chip on the bare 2005 911 page: the chip page reads 1 sale, exact rung, 2005 only, no range (read live Oct 16 2026) | on all four products; expected to fail until e57 (e56 reads 9, the body word is filed as a trim) |
| 28 | 1965 Ford Mustang fastback (typed) | the same answer as the Fastback chip on the bare 1965 Mustang page: the chip page reads 12 sales, exact rung, 1965 only, $37,000 to $50,000 (read live Oct 16 2026) | on all four products; expected to fail until e57 (e56 reads 15) |
| 29 | 2012 BMW M3 Competition Coupe (typed) | a typed body never fenced to sedans; equals the bare "2012 BMW M3 Competition" page (13 sales, exact, 2012, $38,500 to $79,500) | read live on e58, Oct 16 2026 |
| 30 | 1973 Porsche 911 Targa (typed) | PENDING e59: Targa rows exist but all are set aside; the page must not say no Targa sale on record while Targa rows exist | pending Lane B e59 |
| 31 | 1963 Chevrolet Corvette Roadster (typed) | Roadster = Convertible: equals the Convertible chip on the bare 1963 Corvette (18 sales, exact, 1963, $48,500 to $77,000) | read live on e58 |
| 32 | 1989 Mazda Miata Roadster (typed) | PENDING e59: no title states a body, so the whole pool is read with the one "states a body" line; equals the bare 1989 Miata | pending Lane B e59 |
| 33 | 1967 Shelby Cobra Roadster (typed) | the 289 or 427 question, no count or range; each answer typed equals its chip | read live on e58 |
| 34 | 1955 Mercedes-Benz 300SL Roadster (typed) | PENDING e59: expected words "No Roadster 1955 Mercedes-Benz 300SL sale on record in the last five years." and no count or range; e58 reads 9 roadsters over 1954 to 1956 | pending Lane B e59 |
| 35 | 1989 Porsche 911 Turbo Targa (typed) | words answer "No Targa 1989 Porsche 911 Turbo sale on record in the last five years.", no count or range, no market on Buy, Sell, Tasks | read live on e58 |
| 36 | 2001 Porsche 911 Carrera 4S Cabriolet (typed) | words answer "No Cabriolet 2001 Porsche 911 Carrera 4S sale on record in the last five years.", no count or range | read live on e58 |
| 37 | 2006 Porsche Boxster Convertible (typed) | PENDING e59: the whole 2006 Boxster pool (31) with the line "No listing of the 2006 Porsche Boxster states a body, so this reads every 2006 Boxster." | pending Lane B e59 (e58 gives a words answer) |
| 38 | 2010 Porsche Boxster Convertible (typed) | the whole 2010 Boxster pool, equal to the bare page (30 sales, exact, 2010, $26,000 to $35,000) | read live on e58; the engine carries the line as bodyLine; the page does not render it yet (Lane A shared card), so the page check is red until it does |

Per car, in the words of the derivation:

1. **2025 Porsche 911.** 2025 alone holds 2 sales. Plus and minus one year (2024 to 2026): 12 Carrera and Carrera S coupes and cabriolets
   (10 coupes, 2 cabriolets) reach eight, so stop. p25 $142,748 and p75 $163,375 round to $143,000 and $163,000. The 4S, T, GTS,
   Targa, Turbo and GT3 sales in those years are outside a bare 911. Label must say Carrera and Carrera S and 2024 to 2026.
2. **2024 Carrera S Coupe.** 2024 alone holds 6. Adding 2023 (1) and 2025 (1) makes 8: stop at 2023 to 2025. Band p25 $144,875 and p75 $163,375.
3. **1995 Carrera.** 37 sales in the twelve months, all 1995, Carrera 4 and RS excluded. Band $64,000 to $107,000.
4. **2008 997 Carrera S Coupe.** (Re-derived Oct 15 on e40 from poolrows, US and Canada only.) The last twelve months (since 15 Oct 2025) hold 11 coupes that pass every fence: Bring a Trailer 2026-04-16 $66,000, 2026-04-02 $59,500, 2026-01-02 $57,500, 2025-12-15 $70,000, 2025-12-01 $29,000, 2025-11-02 $60,000, 2025-10-28 $71,288 and $67,500; Cars & Bids 2026-08-19 $66,000 and 2025-12-02 $42,500; PCarMarket 2025-12-17 $76,000. Set aside: two modified coupes (2026-09-21, 2026-04-09), the cabriolets (a different body), and the Collecting Cars sales in Great Britain, Sweden and New Zealand (outside the US and Canada). Eleven is eight or more, so the window is the twelve months and the exact year is the rung. p25 $58,500 (halfway between $57,500 and $59,500) and p75 $68,750 (halfway between $67,500 and $70,000), so $58,500 to $69,000. No sale is above 1.35 times p75. The old 14 and $45,500 to $64,500 was an earlier window and included rows now outside the country rule; the count will fall as the two 28 Oct 2025 sales leave the window, so tol is 2.
5. **1969 Camaro.** 21 base-trim sales (2 modified set aside). Band $45,500 to $78,500.
6. **CLK DTM.** (Re-derived Oct 15 on e40, US and Canada only.) 2006 alone holds 3 (Broad Arrow 2026-03-07 $500,000, RM 2025-01-24 $575,000, Gooding 2022-08-20 $415,000; five-year window); 2005 adds 3 (RM 2024-08-17 coupe and cabriolet, RM 2023-11-17 coupe), 2007 none. the ladder widens to 2005 to 2007 but 2007 holds no sale in the pool, so the label names the years the pool really holds, 2005 to 2006, and holds 6, fewer than eight: the Broad Arrow, Bonhams and RM sales sold in Europe, the prototypes, the modified Bring a Trailer car and the no-photo rows are out. All six are house sales. Old reading was 12 (the earlier derivation counted the European sales). Online sales: 0, so the tier is thin and there is no band. Online sales: 0, so the tier is thin and there is no band. The facts line
   may state the lowest and highest real sale. Basis note: cards carry the all-in figure and the thin span carries hammer; pick one before printing.
7. **CLK63 AMG Black Series.** Every one of the 35 titles says Black Series. Band $95,000 to $146,000.
8. **356 Speedster.** (Settled Oct 14 from poolrows.) 1957 Speedster rows that are not replicas, re-creations, conversions or Carrera/Zagato cars: 33 since Feb 2022, 18 of them house sales and 15 online. House sales do not make the online range, so the pool is the online sales: the last twelve months hold 1, so the window looks back (five years, from 1 Feb 2022). Fifteen online rows less the Collecting Cars rows with no photo, one modified car and one odd sale leaves 8 to 10. The ladder stops on the exact year at eight. Band: p25 and p75 of the eight cards, $282,000 to $363,000 (tolPct 5, because the exact set depends on the photo and modified fences).
9. **Defender 110.** Ten 1997 Defender 110 sales, no 90 or 130. Band $30,500 to $56,000.
10. **E46 M3 Coupe.** 14 sales, band $23,500 to $35,500.
11. **Merkur XR4Ti.** (Settled Oct 14 from poolrows.) Eleven rows on record. In the five-year window, less one project car and one $1,400 sale (under the $2,500 floor): 8 sales across the whole model (1985 to 1989: $4,505, $6,200, $6,600, $7,250, $8,000, $9,700, $16,000, $31,000). 1989 holds 1, 1987 to 1989 holds 6. Under the odd-sale rule (1.35 times p75): the eight prices put p75 at $11,275 (position 5.25, a quarter of the way from $9,700 to $16,000), so the fence is $15,221 and both the $16,000 and the $31,000 sale are set aside as odd sales, leaving 6, not the 7 the earlier wider fence ($18,437) gave. The whole model never reaches eight, and the 1987 to 1989 rung holds 6 before its own fence, so no rung reaches eight whatever the fence does: thin, the sales themselves, no band. The row result is unchanged. (The engine shows 3 sales, on a 36 month window; the ladder's window is five years, so the count it prints is shorter than the ladder's 6. Reported, not a band difference.)
12. **2024 GT3.** (Re-derived Oct 14 from poolrows, 300 rows of 2022 to 2026 GT3 sales; the old 25 counted the 2022 cars from a 12 month window.) The pool is the plain GT3: Touring, RS, Weissach, Manthey and Clubsport are other tiers, and Tribute and race cars are fenced. Plain GT3 by year on record: 2022 40, 2023 10, 2024 6, 2026 5, 2025 none. Exact 2024: 2 in twelve months, 6 over five years, never eight. Plus and minus one year (2023 to 2025): 6 in twelve months, so the window looks back: 9 in 18 months, 14 in 24 months. Eight reached, stop. The pool holds 2023 and 2024 (no plain 2025 sale), 14 sales since Oct 2024, p25 $243,125 and p75 $269,000: $243,000 to $269,000. The ladder stops at the first span that reaches eight, and the window rule extends the window inside the rung, so the whole generation (rung 3) is never needed. The label must read years, not the generation: "911 GT3, 2023 to 2024" (the whole-generation label would say a 2022 to 2026 pool).
13. **2018 Mustang GT.** Eight sales, band $30,000 to $35,500. One is a Steeda Q500 Enforcer; an aftermarket package does not change the car, so it counts. (A Roush
    Jackhammer is set aside as an odd sale on price, not for the package.) Exactly eight, so the ladder stops on the exact year.
14. **275 GTB.** (Re-derived Oct 15 on e40: US and Canada only; the GTB/C, GTB/4 and GTS are their own cars.) 1966 alone holds 4 (RM 2026-08-15 Alloy, RM 2024-08-17 GTB/6C Alloy, Broad Arrow 2024-08-15, Gooding 2023-08-19), 1965 adds 5 (RM 2026-08-15, Gooding 2023-03-02, RM 2022-08-20 GTB/6C, Gooding 2022-03-04, RM 2022-01-27), so 1965 to 1966 holds 9 and nine is the pool; the GTB/6C Alloy that is a project and the sales in Europe, Monaco, London and Switzerland are out. The last twelve months hold 2 and the window is five years. Every one is a house sale: thin, no band. Old reading was 10 (it counted a European sale). The text of the first derivation follows. The 275 GTB/4 (1966 to 1968, four-cam) is its own model and is out. What is left is the two-cam 275 GTB, including GTB/6C and Alloy: 1966 alone holds 7,
    1965 adds 3, so 1965 to 1966 holds 10 and the ladder stops. Every one is a house sale, so the tier is thin: the sales themselves, no band. (The engine pools 19: nine
    of them 1967 GTB/4.)
15. **Grand National.** "Regal Grand National" and "Grand National" are one car. 55 sales (4 odd sales set aside), band $35,500 to $56,000. The label must say Grand National.
16. **Saab 9-2X.** (Re-derived Oct 15 on e40: the four modified Aero cars are now fenced, which is why 20 became 16.) 33 rows on record, all 2005 and 2006. Exact 2005: 16 in the five-year window since 15 Oct 2021 once the four modified cars are out ($6,900 to $17,750; the last twelve months hold none). p25 $8,992 and p75 $12,929: $9,000 to $13,000. Odd sale (Sam's rule, 1.35 times p75): the 16 prices sorted are $6,900, $8,300, $8,750, $8,969, $9,000, $9,100, $9,500, $9,600, $10,300, $10,400, $12,000, $12,805, $13,300, $13,500, $14,800, $17,750; p75 sits at position 11.25, so $12,805 + a quarter of the step to $13,300 = $12,929; 1.35 times that is $17,454, and the $17,750 Cars & Bids sale of 2021-12-10 is above it and is set aside as an odd sale. That leaves 15: p25 $8,985 and p75 $12,403, so $9,000 to $12,500. This matches the engine (the earlier hand reading of 16 and $9,000 to $13,000 used the wider fence and is withdrawn). Earlier text: exact 2005: 4 in 36 months, 20 in the five-year window since 15 Oct 2021. The written window rule is "the last twelve months when it holds eight, otherwise back up to five years", so the exact year is the rung: 20 sales, p25 $9,000 and p75 $13,262, $9,000 to $13,500. The engine stops widening the window at 36 months for this car and lands on 2005 to 2006 with 6 sales and no band; that is the difference goldenTruth reports (Lane B's window).
17. **Bugatti Type 41.** No sale on record: not enough data, say so.
18. **Honda S2000, 2011.** (Re-derived Oct 14 from poolrows.) The S2000 was built 2000 to 2009. Exact 2011: none. Plus and minus two years is 2009 to 2013, but the ladder never goes past the curated production run, so the span is 2009 alone. 2009 holds 5 in twelve months to 24 months (9), and 18 in the five-year window since 23 Apr 2022; two CR cars ($170,000, $200,000) are odd sales, one more is below the floor or no photo: 15 to 16 sales (the engine used 14). p25 $36,375 and p75 $64,000: $36,500 to $64,000. The rung is year_widened, and the label must name the years the pool holds (2009). The old "model any year" reading assumed the widened span held no sale; it holds 2009.
19. **Split Window.** The 1963 split-window is the coupe; the convertible is a different car. Re-derived Oct 14 from poolrows (1963 Corvette rows since 24 Oct 2025, convertibles fenced as a different body): 58 coupes, 39 of them online sales (house sales do not make the online range), less one odd sale ($312,500): 38, p25 $140,000 and p75 $213,500, so $140,000 to $214,000. The old 32 and $135,000 to $197,000 were the pool in October's first window; new BaT sales have moved it.
20. **1995 NSX.** 15 NSX-T sales; a Honda NSX-R is set aside as an odd sale. Band $86,000 to $136,000.
21. **1965 Ford Mustang, bare.** An identity check, not a range check (Oct 15). The page asks "Which Mustang?" and prints a count beside each body. Rule: (a) each printed option count equals the count the Market Check page shows when that option is typed ("1965 Ford Mustang coupe"); (b) the option counts add up to the Any count on the bare page, or an "Other" option carries the rest. goldenTruth reads the bare page, then each option's page, and reports every number. Until Lane B's next push the live page prints Convertible (33) and Coupe (19) against Any (69), and the Coupe page shows another count.

## 5. Machine-readable block (read by scripts/goldenTruth.mjs)

Fields: `q` typed words; `status` ready or pending; `rung` expected `fallbackRung`; `labelHas` words every product's label must contain;
`count`, `countMin`, `tol`; `low`, `high` (null = no band, thin); `tolPct`; `empty` = nothing on record; `quick` = in the prePush subset;
`page` = also check the Market Check page heading; `identity` = the options-add-up check above (row 21), no range compared.

```json golden
[
 {"id":1,"q":"2025 Porsche 911","status":"ready","rung":"year_widened","labelHas":["Carrera and Carrera S","2024 to 2026"],"count":12,"tol":2,"low":143000,"high":163000,"tolPct":3,"quick":true,"page":true},
 {"id":2,"q":"2024 Porsche 911 Carrera S Coupe","status":"ready","rung":"year_widened","labelHas":["Carrera S Coupe","2023 to 2025"],"count":8,"tol":2,"low":145000,"high":163000,"tolPct":3},
 {"id":3,"q":"1995 Porsche 911 Carrera","status":"ready","rung":"exact","labelHas":["1995","911 Carrera"],"count":37,"tol":3,"low":64000,"high":107000,"tolPct":3,"quick":true},
 {"id":4,"q":"2008 Porsche 997 Carrera S Coupe","status":"ready","rung":"exact","labelHas":["2008","997 Carrera S Coupe"],"count":11,"tol":2,"low":58500,"high":69000,"tolPct":3},
 {"id":5,"q":"1969 Chevrolet Camaro","status":"ready","rung":"exact","labelHas":["1969 Camaro"],"count":21,"tol":3,"low":45500,"high":78500,"tolPct":3},
 {"id":6,"q":"2006 Mercedes-Benz CLK DTM","status":"ready","rung":"year_widened","labelHas":["CLK DTM","2005 to 2006"],"count":6,"tol":0,"low":null,"high":null,"thin":true},
 {"id":7,"q":"2008 Mercedes-Benz CLK63 AMG Black Series","status":"ready","rung":"exact","labelHas":["CLK63","Black Series"],"count":35,"tol":0,"low":95000,"high":146000,"tolPct":0},
 {"id":8,"q":"1957 Porsche 356 Speedster","status":"ready","rung":"exact","labelHas":["1957","356 Speedster"],"count":8,"tol":2,"low":282000,"high":363000,"tolPct":5},
 {"id":9,"q":"1997 Land Rover Defender 110","status":"ready","rung":"exact","labelHas":["1997","Defender 110"],"count":10,"tol":2,"low":30500,"high":56000,"tolPct":3},
 {"id":10,"q":"2003 BMW M3 Coupe","status":"ready","rung":"exact","labelHas":["2003","M3 Coupe"],"count":14,"tol":2,"low":23500,"high":35500,"tolPct":3},
 {"id":11,"q":"1989 Merkur XR4Ti","status":"ready","labelHas":["XR4Ti"],"low":null,"high":null,"thin":true},
 {"id":12,"q":"2024 Porsche 911 GT3","status":"ready","rung":"year_widened","labelHas":["GT3","2023 to 2024"],"count":14,"tol":2,"low":243000,"high":269000,"tolPct":3,"quick":true},
 {"id":13,"q":"2018 Ford Mustang GT","status":"ready","rung":"exact","labelHas":["2018","Mustang GT"],"count":8,"tol":0,"low":30000,"high":35500,"tolPct":0},
 {"id":14,"q":"1966 Ferrari 275 GTB","status":"ready","rung":"year_widened","labelHas":["275 GTB","1965 to 1966"],"count":9,"tol":0,"low":null,"high":null,"thin":true},
 {"id":15,"q":"1987 Buick Regal Grand National","status":"ready","rung":"exact","labelHas":["1987","Grand National"],"count":55,"tol":0,"low":35500,"high":56000,"tolPct":0},
 {"id":16,"q":"2005 Saab 9-2X","status":"ready","rung":"exact","labelHas":["2005","9-2X"],"count":15,"tol":0,"low":9000,"high":12500,"tolPct":0},
 {"id":17,"q":"1931 Bugatti Type 41","status":"ready","rung":"not_enough_data","labelHas":[],"empty":true},
 {"id":18,"q":"2011 Honda S2000","status":"ready","rung":"year_widened","labelHas":["S2000","2009"],"count":15,"tol":2,"low":36500,"high":64000,"tolPct":3},
 {"id":19,"q":"1963 Chevrolet Corvette Split Window","status":"ready","rung":"exact","labelHas":["1963"],"count":38,"tol":3,"low":140000,"high":214000,"tolPct":3},
 {"id":20,"q":"1995 Acura NSX","status":"ready","rung":"exact","labelHas":["1995","NSX"],"count":15,"tol":2,"low":86000,"high":136000,"tolPct":3},
 {"id":21,"q":"1965 Ford Mustang","status":"ready","identity":true,"labelHas":["Mustang"]},
 {"id":24,"q":"1969 Chevrolet Camaro","status":"ready","identity":true,"labelHas":["Camaro"]},
 {"id":25,"q":"1969 Chevrolet Camaro convertible","status":"ready","rung":"exact","labelHas":["1969 Camaro Convertible"],"count":3,"tol":0,"low":null,"high":null,"thin":true},
 {"id":26,"q":"2005 Porsche 911","status":"ready","identity":true,"labelHas":["911"]},
 {"id":27,"q":"2005 Porsche 911 targa","status":"ready","rung":"exact","labelHas":["2005","Targa"],"count":1,"tol":0,"low":null,"high":null,"thin":true},
 {"id":28,"q":"1965 Ford Mustang fastback","status":"ready","rung":"exact","labelHas":["1965","Fastback"],"count":12,"tol":0,"low":37000,"high":50000,"tolPct":5},
 {"id":22,"q":"1957 Porsche 356 Speedster","status":"ready","rung":"exact","labelHas":["1957","356 Speedster"],"count":8,"tol":0,"low":282000,"high":363000,"tolPct":5,"setAside":{"total":2,"reasons":["odd sale","modified"]},"noZeroOptions":true,"variantRule":true,"noRestoration":true},
 {"id":23,"q":"1966 Ferrari 275 GTB","status":"ready","rung":"year_widened","labelHas":["275 GTB","1965 to 1966"],"count":9,"tol":0,"low":null,"high":null,"thin":true,"noZeroOptions":true,"variantRule":true,"noRestoration":true},
 {"id":29,"q":"2012 BMW M3 Competition Coupe","status":"ready","rung":"exact","labelHas":["2012 M3 Competition Coupe"],"count":13,"tol":0,"low":38500,"high":79500,"tolPct":5,"equalsBare":"2012 BMW M3 Competition"},
 {"id":30,"q":"1973 Porsche 911 Targa","status":"pending","countMin":1},
 {"id":31,"q":"1963 Chevrolet Corvette Roadster","status":"ready","rung":"exact","labelHas":["1963 Corvette Roadster"],"count":18,"tol":0,"low":48500,"high":77000,"tolPct":5,"chipPairs":[{"bare":"1963 Chevrolet Corvette","label":"Convertible","typed":"1963 Chevrolet Corvette Roadster"}]},
 {"id":32,"q":"1989 Mazda Miata Roadster","status":"pending","equalsBare":"1989 Mazda Miata"},
 {"id":33,"q":"1967 Shelby Cobra Roadster","status":"ready","question":true,"wordsHas":["Which is it, the 289 or the 427?"],"noCountRange":true,"chipPairs":[{"bare":"1967 Shelby Cobra","label":"289","typed":"1967 Shelby Cobra 289"},{"bare":"1967 Shelby Cobra","label":"427","typed":"1967 Shelby Cobra 427"}]},
 {"id":34,"q":"1955 Mercedes-Benz 300SL Roadster","status":"pending","empty":true,"wordsHas":["No Roadster 1955 Mercedes-Benz 300SL sale on record in the last five years."],"noCountRange":true},
 {"id":35,"q":"1989 Porsche 911 Turbo Targa","status":"ready","empty":true,"wordsHas":["No Targa 1989 Porsche 911 Turbo sale on record in the last five years."],"noCountRange":true},
 {"id":36,"q":"2001 Porsche 911 Carrera 4S Cabriolet","status":"ready","empty":true,"wordsHas":["No Cabriolet 2001 Porsche 911 Carrera 4S sale on record in the last five years."],"noCountRange":true},
 {"id":37,"q":"2006 Porsche Boxster Convertible","status":"pending","rung":"exact","labelHas":["2006 Boxster"],"count":31,"tol":0,"low":16500,"high":25000,"tolPct":5,"equalsBare":"2006 Porsche Boxster","statesBody":"No listing of the 2006 Porsche Boxster states a body, so this reads every 2006 Boxster."},
 {"id":38,"q":"2010 Porsche Boxster Convertible","status":"ready","rung":"exact","labelHas":["2010 Boxster Convertible"],"count":30,"tol":0,"low":26000,"high":35000,"tolPct":5,"equalsBare":"2010 Porsche Boxster","statesBody":"No listing of the 2010 Porsche Boxster states a body, so this reads every 2010 Boxster."}
]
```
