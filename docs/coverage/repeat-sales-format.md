# Repeat sales pass 3, auction format (Lane F, Nov 19 2026)

Read only. Counts and prices only: no VIN, no listing text, no seller name in this file or in repeat-sales-format.csv beside it. Nothing was written to production and no code changed, so the Class fix line does not apply. No vendor query was made.

## Method and limits (read first)

- **Data.** The pass 2 files were deleted after pass 2 (they held VINs), so the pairs could not be reused: I re-read the sold archive the same way (poolrows in dated slices, 1,618 calls, one at a time, 301,374 sold rows) and the vinoverlap check on the 15,340 cars that sold twice or more. The pairs are built exactly as in pass 2 and come to the same **15,734 sold then sold pairs** (91,061 rows without a lookable VIN, 5,616 rows the engine set aside as project or replica, 604 under $1,000, and 466 pairs with a different year or make are left out; a failed lot between two sales splits the pair, as before).
- A pair is two consecutive sold appearances of one car. Price is the hammer (house fee backed out, USD). Second price as a percent of the first is the median of later over earlier. "Sold for more" is the share with a ratio above 1. Months is days over 30.44.
- **Cells under 30 pairs are marked "too few" and are not read.**
- **Format is set by the slug, not by the sale.** The archive carries no format field. The order named the slugs; the others are set by the day cluster rule in the table. Where the slug of a sale holds both formats I cannot prove it from the archive: the "possibly mixed" flag marks slugs whose rows fall on days of 15 or more lots in between 15% and 85% of cases, kept in the format named. That rule is weak (a busy timed venue also closes 15 lots a day), so it flags, it does not decide.
- **Two notes on the mapping.** (1) `sothebysmotorsport` is LIVE as the order says, but its 797 rows never fall on a day of 15 or more lots, so it does not look like a room; it touches 24 LIVE to ONLINE pairs (and 45 ONLINE to LIVE, 33 LIVE to LIVE), and taking it out alone leaves LIVE to ONLINE at 113.0% and 64.8% (920 pairs). (2) `dupontregistrylive` is named ONLINE but has no sold rows in the archive, so it is in no pair. `autohunter` (defunct, history only) was not named and is ONLINE by the cluster rule.
- **Sensitivity.** Taking out every pair that touches the three possibly mixed slugs and `sothebysmotorsport` leaves LIVE to ONLINE at 113.5% and 65.7% sold for more (893 pairs), ONLINE to LIVE 100.0% and 49.4% (510), ONLINE to ONLINE 94.7% and 38.2% (11,749), LIVE to LIVE 96.3% and 42.9% (2,187); LIVE to ONLINE is still ahead in all 16 readable cells of the price by time table. Taking out every pair that touches the largest online venue leaves LIVE to ONLINE at 112.8% and 60.3% (141 pairs) against ONLINE to ONLINE 93.2% and 34.1% (2,036).
- Mileage change is the second listing's mileage less the first's, for pairs where both carry a mileage (unit not recorded). It is shown with its pair count; most live sales carry no mileage, so those medians rest on few pairs.

## 1. Venue mapping (every slug in the sold archive; the full mapping first)

| slug | sold rows | format | how set | share of rows on a day of 15 or more lots | mixed |
|---|---:|---|---|---:|---|
| bringatrailer | 150175 | ONLINE | named in the order | 100.0% | no |
| carsandbids | 33841 | ONLINE | named in the order | 89.0% | no |
| bonhams | 27927 | LIVE | named in the order | 99.5% | no |
| barrettjackson | 21793 | LIVE | named in the order | 100.0% | no |
| collectingcars | 19415 | ONLINE | named in the order | 19.1% | possibly mixed, kept in ONLINE |
| rmsothebys | 11640 | LIVE | named in the order | 98.8% | no |
| hemmings | 5603 | ONLINE | named in the order | 0.3% | no |
| themarket | 5287 | ONLINE | named in the order | 1.7% | no |
| pcarmarket | 4756 | ONLINE | named in the order | 0.0% | no |
| hagerty | 4535 | ONLINE | named in the order | 16.3% | possibly mixed, kept in ONLINE |
| mecum | 3031 | LIVE | named in the order | 100.0% | no |
| autohunter | 2763 | ONLINE | day cluster rule | 0.0% | no |
| gooding | 2654 | LIVE | named in the order | 98.2% | no |
| carandclassic | 2509 | ONLINE | named in the order | 61.6% | possibly mixed, kept in ONLINE |
| broadarrow | 2294 | LIVE | named in the order | 99.9% | no |
| mbmarket | 1116 | ONLINE | named in the order | 0.0% | no |
| sothebysmotorsport | 797 | LIVE | named in the order | 0.0% | no (but see the note: it does not look like a room) |
| pistonheads | 647 | ONLINE | named in the order | 0.0% | no |
| acc | 591 | ONLINE | named in the order | 0.0% | no |

## 2. The four buckets (sold then sold, 15734 pairs)

| bucket | pairs | median second price as % of first | sold for more | median months | median first price | mileage change: median (pairs with both mileages) |
|---|---:|---:|---:|---:|---:|---|
| LIVE to ONLINE | 944 | 112.9% | 64.8% | 14.7 | $55,100 | 290 miles (143) |
| ONLINE to LIVE | 568 | 101.3% | 50.7% | 12.0 | $60,800 | 240 miles (123) |
| ONLINE to ONLINE | 12002 | 94.8% | 38.3% | 11.9 | $23,000 | 1,000 miles (11720) |
| LIVE to LIVE | 2220 | 96.6% | 43.2% | 14.5 | $68,000 | 0 miles (201) |

## 3. Controls (each cell: pairs; median second price as % of first; share sold for more. Under 30 pairs: too few, not read)

#### a. First sale price band

| level | LIVE to ONLINE | ONLINE to LIVE | ONLINE to ONLINE | LIVE to LIVE |
|---|---|---|---|---|
| under $25k | 214; 112.7%; 64.5% | 116; 101.9%; 50.9% | 6417; 94.7%; 39.8% | 342; 96.1%; 44.7% |
| $25k to $50k | 216; 112.2%; 63.4% | 137; 105.3%; 56.9% | 3115; 93.3%; 34.1% | 463; 99.2%; 45.1% |
| $50k to $100k | 234; 112.0%; 64.5% | 125; 101.3%; 51.2% | 1554; 95.4%; 39.0% | 636; 96.7%; 42.6% |
| $100k to $250k | 185; 112.5%; 64.3% | 120; 101.8%; 50.8% | 766; 97.2%; 40.5% | 511; 90.2%; 36.2% |
| $250k and over | 95; 118.5%; 70.5% | 70; 92.1%; 37.1% | 150; 99.3%; 44.7% | 268; 103.3%; 52.6% |

#### b. Elapsed time between sales

| level | LIVE to ONLINE | ONLINE to LIVE | ONLINE to ONLINE | LIVE to LIVE |
|---|---|---|---|---|
| under 6 months | 268; 116.0%; 75.0% | 145; 106.8%; 61.4% | 3780; 96.3%; 39.3% | 485; 97.4%; 40.6% |
| 6 to 12 | 157; 107.4%; 58.6% | 140; 102.7%; 52.1% | 2261; 96.7%; 42.6% | 493; 95.7%; 40.6% |
| 12 to 24 | 166; 109.4%; 60.2% | 147; 97.8%; 46.3% | 3060; 93.2%; 36.7% | 537; 92.1%; 38.0% |
| 24 and over | 353; 113.3%; 62.0% | 136; 97.1%; 42.6% | 2901; 91.3%; 35.3% | 705; 101.9%; 50.8% |

#### c. Year of the second sale

| level | LIVE to ONLINE | ONLINE to LIVE | ONLINE to ONLINE | LIVE to LIVE |
|---|---|---|---|---|
| 2021 and earlier | 21, too few | 2, too few | 119; 101.3%; 54.6% | 325; 97.5%; 39.4% |
| 2022 | 113; 125.2%; 75.2% | 15, too few | 746; 97.6%; 43.4% | 277; 108.9%; 58.8% |
| 2023 | 160; 115.7%; 66.3% | 55; 97.8%; 45.5% | 1671; 94.4%; 35.8% | 308; 95.6%; 44.8% |
| 2024 | 168; 113.7%; 66.7% | 114; 97.9%; 47.4% | 2640; 92.0%; 33.1% | 395; 91.2%; 36.5% |
| 2025 | 228; 106.3%; 59.6% | 153; 102.6%; 52.3% | 3345; 93.3%; 35.5% | 381; 92.8%; 36.0% |
| 2026 | 254; 110.2%; 60.6% | 229; 102.8%; 52.8% | 3481; 97.6%; 44.4% | 534; 98.7%; 46.6% |

#### d. Season of the second sale

| level | LIVE to ONLINE | ONLINE to LIVE | ONLINE to ONLINE | LIVE to LIVE |
|---|---|---|---|---|
| Jan to Mar | 203; 115.7%; 72.4% | 230; 102.6%; 51.7% | 2260; 95.3%; 39.2% | 963; 100.0%; 46.3% |
| Apr to Jun | 241; 112.1%; 65.6% | 173; 99.0%; 45.1% | 3178; 95.7%; 40.5% | 568; 94.8%; 39.8% |
| Jul to Sep | 281; 112.1%; 62.3% | 97; 105.7%; 61.9% | 3504; 94.2%; 37.4% | 379; 99.1%; 46.7% |
| Oct to Dec | 219; 111.7%; 60.3% | 68; 97.8%; 45.6% | 3060; 93.8%; 36.4% | 310; 89.6%; 35.5% |

#### Combined: first sale price band by elapsed time (LIVE to ONLINE against ONLINE to ONLINE)

| price band | elapsed | LIVE to ONLINE (pairs; median %; more) | ONLINE to ONLINE (pairs; median %; more) | gap in median, points (only where both 30 or more) |
|---|---|---|---|---|
| under $25k | under 6 months | 89; 120.0%; 74.2% | 2364; 97.1%; 42.4% | +22.9 |
| under $25k | 6 to 12 | 38; 114.2%; 63.2% | 1255; 98.5%; 46.9% | +15.7 |
| under $25k | 12 to 24 | 32; 108.3%; 59.4% | 1561; 91.6%; 36.3% | +16.7 |
| under $25k | 24 and over | 55; 107.8%; 52.7% | 1237; 87.2%; 31.8% | +20.7 |
| $25k to $50k | under 6 months | 65; 119.2%; 75.4% | 836; 95.3%; 34.1% | +24.0 |
| $25k to $50k | 6 to 12 | 30; 98.9%; 46.7% | 552; 95.5%; 38.2% | +3.3 |
| $25k to $50k | 12 to 24 | 49; 108.1%; 57.1% | 816; 91.8%; 33.2% | +16.3 |
| $25k to $50k | 24 and over | 72; 113.4%; 63.9% | 911; 90.2%; 32.3% | +23.2 |
| $50k to $100k | under 6 months | 60; 117.2%; 78.3% | 375; 95.2%; 34.1% | +21.9 |
| $50k to $100k | 6 to 12 | 34; 108.2%; 67.6% | 288; 95.5%; 37.5% | +12.7 |
| $50k to $100k | 12 to 24 | 38; 101.7%; 50.0% | 421; 96.3%; 41.1% | +5.3 |
| $50k to $100k | 24 and over | 102; 111.6%; 60.8% | 470; 95.3%; 41.9% | +16.2 |
| $100k to $250k | under 6 months | 29, too few | 164; 97.7%; 34.8% |  |
| $100k to $250k | 6 to 12 | 40; 108.6%; 60.0% | 134; 94.1%; 32.1% | +14.5 |
| $100k to $250k | 12 to 24 | 33; 112.8%; 72.7% | 228; 96.7%; 41.7% | +16.1 |
| $100k to $250k | 24 and over | 83; 113.3%; 61.4% | 240; 99.9%; 47.9% | +13.5 |
| $250k and over | under 6 months | 25, too few | 41; 97.2%; 31.7% |  |
| $250k and over | 6 to 12 | 15, too few | 32; 98.5%; 40.6% |  |
| $250k and over | 12 to 24 | 14, too few | 34; 99.7%; 50.0% |  |
| $250k and over | 24 and over | 41; 136.1%; 75.6% | 43; 103.1%; 55.8% | +32.9 |

## Does the format effect survive the controls?

**Yes, and in one direction: cars that went from a live room to an online sale came back higher than cars that stayed online, at the same price, the same wait, in the same year and in the same season.**

- Against ONLINE to ONLINE, LIVE to ONLINE has the higher median in every readable cell: 5 of 5 price bands, 4 of 4 time bands, 5 of 5 years (2022 to 2026; 2021 and earlier is too few), 4 of 4 seasons, and 16 of 16 cells of the price by time table (the other 4 are too few). The gap in that table runs from +3.3 to +32.9 points of median; it is 13 to 24 points in 12 of the 16 cells.
- Against ONLINE to LIVE (the reverse move), LIVE to ONLINE is higher in every row where both cells are readable: 5 of 5 price bands, 4 of 4 time bands, 4 of 4 years (2023 to 2026), 4 of 4 seasons. ONLINE to LIVE sits between: 101.3% overall, with 50.7% selling for more.
- LIVE to LIVE sits near ONLINE to ONLINE (96.6% against 94.8%), so what separates the buckets is the move from a room to an online sale, not simply having a room first or an online sale last.

## Findings

**Strongest defensible finding.** Of 15,734 cars that sold at auction twice in our records, the 944 that went from a live room to an online sale came back at a median 112.9% of their first price and 64.8% sold for more, against 94.8% and 38.3% for the 12,002 that went from one online sale to another; the gap holds in every readable cell at the same first price band, the same wait, the same year and the same season (16 of 16 cells in the price by time table).

**Most interesting surprise.** The reverse move did not mirror it: the 568 cars that went from an online sale to a live room came back at 101.3% with 50.7% selling for more, and at $250,000 and over it was 92.1% with 37.1% selling for more (70 pairs) while the live to online cars at that price were at 118.5% with 70.5% (95 pairs). The live to online gap is also largest at the quickest returns: under 6 months, 116.0% and 75.0% selling for more (268 pairs) against 96.3% and 39.3% for staying online (3,780 pairs).

**Biggest caveat.** A car that goes from a room to an online sale is chosen by its owner, and a car that comes back is not a random car; we only see the cars that did move, never the cars that stayed in the room. The first sale price is a hammer with fees backed out, and format comes from the slug, which can hold both. The controls cannot remove that selection, and live sales carry mileage rarely (143 of the 944 live to online pairs), so condition is mostly unseen.

**One sentence for The Daily Vroom.** Of 15,734 cars that sold at auction twice, the 944 that went from a live room to an online sale came back at a median 112.9% of their first price (64.8% sold for more), against 94.8% (38.3%) for the 12,002 that stayed online, and the gap held at every price, wait, year and season we checked.

Rule: pages and emails compute nothing, everything comes from oneEngineAnswer.
Class fix: not applicable, no code changed.

Search check: no public page touched.
