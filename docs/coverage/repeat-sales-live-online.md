# Repeat sales pass 4: inside the 944 LIVE to ONLINE pairs (Lane F, Nov 20 2026)

Read only. Counts, prices, makes, models and decades only: no VIN, listing text or seller name is in this file or its CSV. Venue names are not used in the findings. Nothing was written to production, no code changed, no vendor query was made.

## Method and limits

- **The pairs.** Rebuilt once, as in pass 3, from the whole sold archive (poolrows in 7 day slices, one at a time) plus the vinoverlap read of the cars with two or more sales. It reproduces pass 3 exactly: 15,734 sold then sold pairs, of which LIVE to ONLINE 944, ONLINE to ONLINE 12,002, and 268 LIVE to ONLINE pairs under 6 months. Same rules: car = distinct 11 to 32 character VIN; hammer with the fee backed out, USD; rows within 7 days merged; a failed lot between two sales splits them; both prices at least $1,000; project and replica rows, and pairs whose year or make differ, dropped. Format is set by venue as in pass 3 (LIVE: a room with a sale date; ONLINE: timed online sale); it is a property of the venue, not checked sale by sale.
- **The 944 are 942 cars** (two cars have two LIVE to ONLINE pairs). Counting only each car's first pair gives the same answer, 112.9% and 64.8%, so no car is counted twice in any way that matters.
- **Working pairs file.** The pairs, with every car id replaced by a salted one way hash (the salt was used once and not kept), are in the scratchpad for later passes. It is not under docs and not committed.
- **Make and model** are the archive's own fields on the first sale, as stored. The archive's model field is not normalized (many trims and editions are written into it), so model groups are fragmented: only a handful reach the 10 pair minimum, and 495 of the 944 pairs carry a different model string on the second sale and sit in make, decade and band rows only. Read the model rows as a sample of the biggest nameplates, not as the whole.
- **Minimums.** Make 20 pairs, model 10 pairs, as ordered. The order set no minimum for decade, price band and the part F groups, so I used 30 pairs for decade and band, and 10 pairs in the under 6 months group (268) for part F. In part E, 15 pairs in each bucket. A cell under its minimum shows only its count, is marked too few and is not read in the text.
- **Median** is always a median, never a mean. "Sold for more" is the share of pairs where the second hammer is above the first. Months = days / 30.4375.
- **Limits.** The cars that come back are a chosen set (owners choose to move a car), and the cars that stayed in the room are not in this cut. A hammer is not the all in price the buyer paid.

## 1. The 944 LIVE to ONLINE pairs

Median months between the live sale and the online resale: **14.7**. Median first sale price $55,100; median second sale price $61,700. Median second price as % of first 112.9%; 64.8% sold for more.

| wait | pairs | share of 944 | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|---:|
| under 6 months | 268 | 28.4% | 116.0% | 75.0% | 2.6 |
| 6 to 12 months | 157 | 16.6% | 107.4% | 58.6% | 8.2 |
| 12 to 24 months | 166 | 17.6% | 109.4% | 60.2% | 17.4 |
| 24 months and over | 353 | 37.4% | 113.3% | 62.0% | 41.1 |

## 2. By make, model, decade and first sale price band

Minimums: make 20 pairs, model 10 pairs, decade 30, price band 30 (the order set no minimum for decade and band, so the pass 3 rule of 30 is used). A row under its minimum shows only its pair count and is marked too few; it is not read. "Model" groups only pairs whose model name is the same on both sales (495 of the 944 are not, and sit in make, decade and band rows only). Models under 10 pairs are not listed (counted in the CSV only for the count).

#### By make (20 or more pairs)

| make | pairs | share of 944 | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|---:|
| Chevrolet | 173 | 18.3% | 106.7% | 59.0% | 14.6 |
| Ford | 131 | 13.9% | 108.1% | 57.3% | 11.8 |
| Mercedes-Benz | 126 | 13.3% | 112.4% | 62.7% | 13.1 |
| Porsche | 101 | 10.7% | 122.5% | 77.2% | 20.1 |
| Ferrari | 65 | 6.9% | 128.1% | 80.0% | 28.7 |
| BMW | 35 | 3.7% | 111.5% | 65.7% | 22.7 |
| Dodge | 34 | 3.6% | 110.7% | 61.8% | 11.5 |
| Aston Martin | 23 | 2.4% | 112.8% | 60.9% | 15.4 |
| Bentley | 21 | 2.2% | 86.8% | 33.3% | 17.4 |
| all makes under the minimum (50 groups) | 235 | 24.9% | too few | | |

#### By decade

| decade | pairs | share of 944 | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|---:|
| 1940s | 3 (too few) | 0.3% |  |  |  |
| 1950s | 21 (too few) | 2.2% |  |  |  |
| 1960s | 150 | 15.9% | 108.9% | 64.0% | 17.9 |
| 1970s | 122 | 12.9% | 111.6% | 63.9% | 13.0 |
| 1980s | 158 | 16.7% | 116.2% | 69.0% | 17.1 |
| 1990s | 165 | 17.5% | 118.5% | 72.1% | 14.4 |
| 2000s | 193 | 20.4% | 114.4% | 66.3% | 14.4 |
| 2010s | 93 | 9.9% | 108.7% | 59.1% | 17.1 |
| 2020s | 39 | 4.1% | 96.2% | 33.3% | 6.2 |

#### By band

| band | pairs | share of 944 | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|---:|
| under $25k | 214 | 22.7% | 112.7% | 64.5% | 7.8 |
| $25k to $50k | 216 | 22.9% | 112.2% | 63.4% | 15.4 |
| $50k to $100k | 234 | 24.8% | 112.0% | 64.5% | 17.1 |
| $100k to $250k | 185 | 19.6% | 112.5% | 64.3% | 19.3 |
| $250k and over | 95 | 10.1% | 118.5% | 70.5% | 18.4 |

#### By model (10 or more pairs)

| model | pairs | share of 944 | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|---:|
| Chevrolet Corvette | 60 | 6.4% | 111.0% | 63.3% | 17.4 |
| Ford Bronco | 28 | 3.0% | 101.4% | 50.0% | 9.3 |
| Chevrolet Camaro | 22 | 2.3% | 95.2% | 40.9% | 12.9 |
| Ford Mustang | 19 | 2.0% | 97.4% | 47.4% | 16.9 |
| Porsche 911 | 18 | 1.9% | 127.9% | 94.4% | 31.6 |
| all models under the minimum (175 groups) | 302 | 32.0% | too few | | |

## 3. The direct answers

### A. Is the 112.9% driven mainly by one or two makes, models or decades?

For each group: its share of the 944 and the LIVE to ONLINE median with that group removed (pairs left, median, share beating). Makes of 20 or more pairs, the 15 biggest models, and all decades of 30 or more pairs.

| make | pairs | share of 944 | median of the group | median with the group removed | pairs left | sold for more, group removed |
|---|---:|---:|---:|---:|---:|---:|
| Chevrolet | 173 | 18.3% | 106.7% | 114.1% | 771 | 66.1% |
| Ford | 131 | 13.9% | 108.1% | 113.4% | 813 | 66.1% |
| Mercedes-Benz | 126 | 13.3% | 112.4% | 113.0% | 818 | 65.2% |
| Porsche | 101 | 10.7% | 122.5% | 112.0% | 843 | 63.3% |
| Ferrari | 65 | 6.9% | 128.1% | 112.4% | 879 | 63.7% |
| BMW | 35 | 3.7% | 111.5% | 113.0% | 909 | 64.8% |
| Dodge | 34 | 3.6% | 110.7% | 113.1% | 910 | 64.9% |
| Aston Martin | 23 | 2.4% | 112.8% | 113.0% | 921 | 64.9% |
| Bentley | 21 | 2.2% | 86.8% | 113.3% | 923 | 65.5% |

| decade | pairs | share of 944 | median of the group | median with the group removed | pairs left | sold for more, group removed |
|---|---:|---:|---:|---:|---:|---:|
| 2000s | 193 | 20.4% | 114.4% | 112.5% | 751 | 64.4% |
| 1990s | 165 | 17.5% | 118.5% | 111.8% | 779 | 63.3% |
| 1980s | 158 | 16.7% | 116.2% | 112.4% | 786 | 64.0% |
| 1960s | 150 | 15.9% | 108.9% | 113.4% | 794 | 65.0% |
| 1970s | 122 | 12.9% | 111.6% | 113.1% | 822 | 65.0% |
| 2010s | 93 | 9.9% | 108.7% | 113.3% | 851 | 65.5% |
| 2020s | 39 | 4.1% | 96.2% | 113.8% | 905 | 66.2% |

| model | pairs | share of 944 | median of the group | median with the group removed | pairs left | sold for more, group removed |
|---|---:|---:|---:|---:|---:|---:|
| Chevrolet Corvette | 60 | 6.4% | 111.0% | 113.1% | 884 | 64.9% |
| Ford Bronco | 28 | 3.0% | 101.4% | 113.3% | 916 | 65.3% |
| Chevrolet Camaro | 22 | 2.3% | 95.2% | 113.1% | 922 | 65.4% |
| Ford Mustang | 19 | 2.0% | 97.4% | 113.1% | 925 | 65.2% |
| Porsche 911 | 18 | 1.9% | 127.9% | 112.5% | 926 | 64.3% |

### B. Remove Ferrari, Porsche and any make whose median sits more than 10 points above the 112.9% median

Makes removed: Ferrari, Porsche (no other make of 20 or more pairs sits more than 10 points above). Their pairs: 166 of 944.

| set | pairs | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|
| LIVE to ONLINE, what is left | 778 | 111.1% | 62.0% | 13.3 |
| ONLINE to ONLINE, the same makes left | 10179 | 93.7% | 36.4% | 11.5 |

### C. The five that gained most moving live to online, and D. the five that gained least or lost

Median second sale as % of first; makes of 20 or more pairs, models of 10 or more pairs (the model lists rest on small groups, read with that in mind).

#### C. most, by make (9 groups qualify)

| make | pairs | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|
| Ferrari | 65 | 128.1% | 80.0% | 28.7 |
| Porsche | 101 | 122.5% | 77.2% | 20.1 |
| Aston Martin | 23 | 112.8% | 60.9% | 15.4 |
| Mercedes-Benz | 126 | 112.4% | 62.7% | 13.1 |
| BMW | 35 | 111.5% | 65.7% | 22.7 |

#### D. least or lost, by make (9 groups qualify)

| make | pairs | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|
| Bentley | 21 | 86.8% | 33.3% | 17.4 |
| Chevrolet | 173 | 106.7% | 59.0% | 14.6 |
| Ford | 131 | 108.1% | 57.3% | 11.8 |
| Dodge | 34 | 110.7% | 61.8% | 11.5 |
| BMW | 35 | 111.5% | 65.7% | 22.7 |

#### C. most, by model (5 groups qualify)

| model | pairs | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|
| Porsche 911 | 18 | 127.9% | 94.4% | 31.6 |
| Chevrolet Corvette | 60 | 111.0% | 63.3% | 17.4 |
| Ford Bronco | 28 | 101.4% | 50.0% | 9.3 |
| Ford Mustang | 19 | 97.4% | 47.4% | 16.9 |
| Chevrolet Camaro | 22 | 95.2% | 40.9% | 12.9 |

#### D. least or lost, by model (5 groups qualify)

| model | pairs | median second as % of first | sold for more | median months |
|---|---:|---:|---:|---:|
| Chevrolet Camaro | 22 | 95.2% | 40.9% | 12.9 |
| Ford Mustang | 19 | 97.4% | 47.4% | 16.9 |
| Ford Bronco | 28 | 101.4% | 50.0% | 9.3 |
| Chevrolet Corvette | 60 | 111.0% | 63.3% | 17.4 |
| Porsche 911 | 18 | 127.9% | 94.4% | 31.6 |

### E. Same make or model, LIVE to ONLINE against ONLINE to ONLINE (15 or more pairs in each bucket)


#### By make: 11 groups qualify. LIVE to ONLINE is ahead on the median in **10**, not ahead in **1**; ahead on the share sold for more in 11, not ahead in 0.

| make | L to O pairs | L to O median | L to O sold for more | O to O pairs | O to O median | O to O sold for more | median gap, points |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chevrolet | 173 | 106.7% | 59.0% | 912 | 95.2% | 36.6% | +11.5 |
| Ford | 131 | 108.1% | 57.3% | 933 | 93.5% | 35.5% | +14.5 |
| Mercedes-Benz | 126 | 112.4% | 62.7% | 1766 | 92.3% | 35.6% | +20.1 |
| Porsche | 101 | 122.5% | 77.2% | 1584 | 99.6% | 47.5% | +22.9 |
| Ferrari | 65 | 128.1% | 80.0% | 239 | 102.0% | 55.6% | +26.2 |
| BMW | 35 | 111.5% | 65.7% | 1549 | 94.7% | 37.9% | +16.8 |
| Dodge | 34 | 110.7% | 61.8% | 173 | 97.3% | 40.5% | +13.4 |
| Aston Martin | 23 | 112.8% | 60.9% | 128 | 95.9% | 39.8% | +16.9 |
| Bentley | 21 | 86.8% | 33.3% | 99 | 90.0% | 20.2% | -3.2 |
| Pontiac | 18 | 105.4% | 61.1% | 122 | 95.8% | 37.7% | +9.6 |
| Plymouth | 16 | 115.8% | 81.3% | 45 | 97.4% | 42.2% | +18.4 |

#### By model: 5 groups qualify. LIVE to ONLINE is ahead on the median in **5**, not ahead in **0**; ahead on the share sold for more in 5, not ahead in 0.

| model | L to O pairs | L to O median | L to O sold for more | O to O pairs | O to O median | O to O sold for more | median gap, points |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chevrolet Corvette | 60 | 111.0% | 63.3% | 405 | 95.9% | 37.3% | +15.2 |
| Ford Bronco | 28 | 101.4% | 50.0% | 114 | 91.0% | 33.3% | +10.4 |
| Chevrolet Camaro | 22 | 95.2% | 40.9% | 110 | 93.8% | 31.8% | +1.4 |
| Ford Mustang | 19 | 97.4% | 47.4% | 305 | 95.3% | 38.0% | +2.1 |
| Porsche 911 | 18 | 127.9% | 94.4% | 385 | 98.8% | 46.0% | +29.1 |

### F. The under 6 months LIVE to ONLINE group (268 pairs; median 116.0%, 75.0% sold for more, median 2.6 months)

A group needs 10 or more pairs in the 268 to show a median (the order set no minimum here); under that it is listed only as part of "others". Over-representation = share of the 268 divided by the group's share of the whole 944; above 1 means it is over-represented in the under 6 months group.

#### By make (groups with 10 or more pairs in the 268; they cover 163 of 268)

| make | pairs in under 6 months | share of the 268 | median second as % of first | share of the whole 944 | over-representation |
|---|---:|---:|---:|---:|---:|
| Chevrolet | 54 | 20.1% | 118.6% | 18.3% | 1.10 |
| Ford | 40 | 14.9% | 116.9% | 13.9% | 1.08 |
| Mercedes-Benz | 35 | 13.1% | 114.3% | 13.3% | 0.98 |
| Porsche | 21 | 7.8% | 126.9% | 10.7% | 0.73 |
| Dodge | 13 | 4.9% | 107.1% | 3.6% | 1.35 |

#### By model (groups with 10 or more pairs in the 268; they cover 23 of 268)

| model | pairs in under 6 months | share of the 268 | median second as % of first | share of the whole 944 | over-representation |
|---|---:|---:|---:|---:|---:|
| Chevrolet Corvette | 13 | 4.9% | 117.9% | 6.4% | 0.76 |
| Chevrolet Camaro | 10 | 3.7% | 120.7% | 2.3% | 1.60 |

#### By decade (groups with 10 or more pairs in the 268; they cover 264 of 268)

| decade | pairs in under 6 months | share of the 268 | median second as % of first | share of the whole 944 | over-representation |
|---|---:|---:|---:|---:|---:|
| 1960s | 40 | 14.9% | 123.4% | 15.9% | 0.94 |
| 1970s | 36 | 13.4% | 122.3% | 12.9% | 1.04 |
| 1980s | 49 | 18.3% | 115.8% | 16.7% | 1.09 |
| 1990s | 46 | 17.2% | 120.1% | 17.5% | 0.98 |
| 2000s | 55 | 20.5% | 118.8% | 20.4% | 1.00 |
| 2010s | 20 | 7.5% | 109.2% | 9.9% | 0.76 |
| 2020s | 18 | 6.7% | 99.2% | 4.1% | 1.63 |

#### By band (groups with 10 or more pairs in the 268; they cover 268 of 268)

| band | pairs in under 6 months | share of the 268 | median second as % of first | share of the whole 944 | over-representation |
|---|---:|---:|---:|---:|---:|
| under $25k | 89 | 33.2% | 120.0% | 22.7% | 1.46 |
| $25k to $50k | 65 | 24.3% | 119.2% | 22.9% | 1.06 |
| $50k to $100k | 60 | 22.4% | 117.2% | 24.8% | 0.90 |
| $100k to $250k | 29 | 10.8% | 114.1% | 19.6% | 0.55 |
| $250k and over | 25 | 9.3% | 112.4% | 10.1% | 0.93 |

## 4. Where this lands

Where the sample becomes too small: 50 of the 59 makes have under 20 pairs and are not read (235 of the 944 pairs); 175 of the 180 models have under 10 pairs (302 pairs); the 1940s (3) and 1950s (21) are too few; the 2020s (39) is readable but thin; in part F only two models reach 10 pairs; only 9 makes and 5 models qualify for the top and bottom five, so those lists overlap and are the whole field, not a ranking of many.

**A. Not driven by one or two groups.** The biggest make, Chevrolet, is 18.3% of the 944 and sits below the whole (106.7%); the biggest decade, the 2000s, is 20.4%; the biggest model is 6.4%. Removing any one of the nine makes moves the median between 112.0% (Porsche out) and 114.1% (Chevrolet out); removing any one decade moves it between 111.8% (1990s out) and 113.8% (2020s out); removing any one of the five biggest models moves it between 112.5% and 113.3%. Against 112.9%, that is a spread of about two points.

**B. Without Ferrari and Porsche it holds.** No other make of 20 or more pairs sits more than 10 points above 112.9%, so the two are the only ones removed (166 pairs). What is left, 778 pairs: median 111.1%, 62.0% sold for more, median 13.3 months. The ONLINE to ONLINE pairs of the same makes (10,179): 93.7%, 36.4%.

**C and D.** By make (9 qualify, so the lists overlap): most gained, Ferrari 128.1% (65 pairs), Porsche 122.5% (101), Aston Martin 112.8% (23), Mercedes-Benz 112.4% (126), BMW 111.5% (35). Least: Bentley 86.8% (21 pairs, 33.3% sold for more), the only make below 100%, then Chevrolet 106.7% (173), Ford 108.1% (131), Dodge 110.7% (34), BMW 111.5% (35). By model (5 qualify, all listed): Porsche 911 127.9% (18), Corvette 111.0% (60), Bronco 101.4% (28), Mustang 97.4% (19), Camaro 95.2% (22). Two of the five models (Mustang, Camaro) are under 100%, on 19 and 22 pairs.

**E. Same make or model, side by side.** By make, 11 groups have 15 or more pairs in both buckets: LIVE to ONLINE is ahead on the median in 10 and not ahead in 1 (Bentley, 21 against 99 pairs, 3.2 points behind); ahead on the share sold for more in all 11. By model, 5 groups qualify: ahead in all 5 (the gap is 1.4 and 2.1 points for Camaro and Mustang, 10 to 29 points for the other three).

**F. The under 6 months group (268 pairs; 116.0%, 75.0% sold for more).** The makes mirror the whole: Chevrolet 20.1% of the 268 against 18.3% of the 944, Ford 14.9% against 13.9%, Mercedes-Benz 13.1% against 13.3%; Porsche is under-represented (7.8% against 10.7%) and Dodge over (4.9% against 3.6%, 13 pairs). By price band, the cheap end is over-represented: under $25k is 33.2% of the 268 against 22.7% of the 944 (1.46 times), and $100k to $250k is under (10.8% against 19.6%, 0.55 times); the median stays between 112.4% and 120.0% in every band. By decade the 2020s are over (6.7% against 4.1%, 18 pairs, median 99.2%) and the 2010s under (7.5% against 9.9%); the other decades are within 10% of their whole share. Only Corvette (13 pairs) and Camaro (10) reach 10 pairs by model, so models are not read here. Across the four waits the median does not rise with the wait: 116.0%, 107.4%, 109.4%, 113.3%.

### The strongest defensible TDV finding

Of 944 cars (942 distinct) that sold at a live auction house and later sold again at an online auction, the second hammer had a median of 112.9% of the first and 64.8% sold for more; with Ferrari and Porsche removed it is 111.1% and 62.0% on 778 pairs, and for the same makes the ONLINE to ONLINE pairs sit at 93.7% and 36.4%; within a make, LIVE to ONLINE is ahead in 10 of the 11 makes with 15 or more pairs on each side.

### The biggest objection

The 944 are cars their owners chose to move from a room to an online sale, and the cars that stayed in a room are not in the cut, so the pattern says what happened to cars that moved, not what moving does to a car; add that the format is set by venue, not checked sale by sale, and that model groups rest on small counts.

### Would I still lead the article with live to online

Yes, because the pattern survives every cut asked for (any one make, model or decade removed, Ferrari and Porsche removed, same make against same make, every wait), provided the line carries the count and says these are cars that came back to a sale online, and keeps the Bentley and the Camaro and Mustang exceptions out of the headline claim but in the body.

Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. (No page or email was touched; this is a read only study.)

Class fix: not applicable, no code changed.

Search check: no public page touched.
