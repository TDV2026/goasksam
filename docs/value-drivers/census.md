# Value driver census, pilot families (Lane F, Nov 16 and 17 2026)

STATUS: COMPLETE, Stages 0 to 4. Read only: the ops task valuecensus (Lane D) in counts mode (374 calls) and sample mode (20 calls), zero vendor spend, zero writes. No listing text and no seller name is in this file or in census.csv; the hand check judged text in process and kept counts only.

## How to read the numbers

- Families are the ones valuecensus defines from the resolver's keys: e46_m3 (BMW M3, 2000 to 2006, a sedan title counted aside); p996_carrera (Porsche 911 or 996, 1999 to 2004, trim in Carrera, Carrera 4, Carrera 4S, Targa); p996_mezger (same, trim Turbo, GT2, GT3). A listing with no trim in its title is counted on no line (the task calls it other_trim), project cars, replicas, RUF and Turbo look are counted aside. These sold counts therefore differ a little from the Stage 1 poolrows table of Nov 16 (which used my own title rules): the task's counts are the ones used here.
- One call is one source, one family, one calendar year. Counts add across years; percentiles do not, so text_median_chars, p10 and p90 are the row weighted mean of the yearly values (approximate). distinct_vins and vins_listed_twice_or_more are sums of yearly values, so a car sold in 2023 and again in 2025 is not joined (the cross year repeat count from the Nov 16 poolrows table, bringatrailer 104 for the 996 Carrera, is the better figure for resales).
- Unsold listings (reserve not met, withdrawn) exist for bringatrailer, carsandbids, hagerty, sothebysmotorsport and mbmarket only, and only from 2025-09 on (the first unsold listing in these families is dated between 2025-09-23 and 2025-10-14), so the unsold side covers about 14 months while the sold side covers 2022 on (bringatrailer) or earlier. Unsold counts cannot be compared to sold counts over the same years.
- text_full = rows with text that show no cut sign; text_truncated = rows with text that are under 200 characters or end in an ellipsis or "more" (the larger of the two counts); text_none = no description at all. A row's text is judged complete here when it shows no cut sign; the hand check below says what that means per source.
- Sold text equals the text in raw_record on every row that has text (sold rows read: column equal to raw_record on all of them, 0 that differ, 0 where raw_record held none while the column did). Unsold text is read from raw_record only, as built.
- Comments: no raw_record in any family row carries a comments field (the top level keys are the same list on every source: title, description, listing_details, known_flaws, recent_service_history, modifications, ownership_history, stats, seller_username and the usual price, date, vin and colour keys). So comments_available is no and comments_timestamped is no, for every source: there are no seller or house comments to separate or cut off at auction end in what the vendor feed supplies. (A seller_username key exists, so the seller of a listing is identifiable in the data, but no comment author role.)
- Reserve: has_reserve is set on every sold and unsold row of these families (no null), so reserve type is known for all. Barrett-Jackson is no reserve on every row, Gooding on most (3 of 3, 5 of 5, 6 of 8); every other source is mostly reserve.

## Stage 1, counts per source and family (full table with every column: census.csv)

### e46_m3

| source | listings | sold | rnm | withdrawn | reserve / no reserve | rnm with high bid | chains (with relist) | text full / cut / none | text p10, median, p90 | VIN | mileage | first to last |
|---|---:|---:|---:|---:|---|---:|---|---|---|---:|---:|---|
| bringatrailer | 203 | 165 | 38 | 0 | 150 / 53 | 38 | 38 (2) | 202 / 0 / 1 | 2276, 2873, 3873 | 203 | 202 | 2022-08-06 to 2026-11-15 |
| carsandbids | 106 | 83 | 23 | 0 | 88 / 18 | 23 | 23 (0) | 91 / 0 / 15 | 1295, 1628, 2088 | 106 | 89 | 2023-09-01 to 2026-11-16 |
| collectingcars | 97 | 97 | n/a | n/a | 96 / 1 | n/a | n/a | 0 / 97 / 0 | 145, 156, 162 | 2 | 97 | 2020-01-28 to 2026-11-15 |
| themarket | 21 | 21 | n/a | n/a | 21 / 0 | n/a | n/a | 21 / 0 / 0 | 1897, 2106, 2487 | 19 | 21 | 2020-05-05 to 2026-11-10 |
| pistonheads | 19 | 19 | n/a | n/a | 18 / 1 | n/a | n/a | 0 / 19 / 0 | 150, 172, 179 | 0 | 19 | 2024-05-24 to 2026-11-15 |
| carandclassic | 12 | 12 | n/a | n/a | 11 / 1 | n/a | n/a | 0 / 0 / 12 | no text | 0 | 12 | 2026-06-02 to 2026-09-27 |
| rmsothebys | 11 | 11 | n/a | n/a | 10 / 1 | n/a | n/a | 9 / 0 / 2 | 1432, 1481, 1590 | 10 | 7 | 2019-03-30 to 2026-01-28 |
| barrettjackson | 7 | 7 | n/a | n/a | 0 / 7 | n/a | n/a | 7 / 0 / 0 | 554, 691, 979 | 7 | 2 | 2020-10-24 to 2026-04-17 |
| bonhams | 5 | 5 | n/a | n/a | 5 / 0 | n/a | n/a | 0 / 0 / 5 | no text | 5 | 5 | 2017-12-06 to 2025-09-13 |
| hagerty | 5 | 3 | 2 | 0 | 4 / 1 | 2 | 2 (0) | 3 / 0 / 2 | 3377, 3431, 4561 | 5 | 3 | 2026-03-16 to 2026-10-27 |
| gooding | 3 | 3 | n/a | n/a | 0 / 3 | n/a | n/a | 0 / 0 / 3 | no text | 3 | 0 | 2020-03-06 to 2026-08-15 |
| hemmings | 3 | 3 | n/a | n/a | 3 / 0 | n/a | n/a | 3 / 0 / 0 | 772, 846, 920 | 3 | 3 | 2020-07-01 to 2026-07-16 |
| autohunter | 3 | 3 | n/a | n/a | 2 / 1 | n/a | n/a | 1 / 0 / 2 | 688, 688, 688 | 3 | 3 | 2021-08-26 to 2023-01-04 |

Sources with fewer than 3 rows (in the csv only): sothebysmotorsport 2, pcarmarket 1, broadarrow 1.

Totals: 499 listings, 436 sold, 63 reserve not met, 0 withdrawn. Reserve not met rows with a high bid: all of them (the high bid is present on every reserve not met row).

### p996_carrera

| source | listings | sold | rnm | withdrawn | reserve / no reserve | rnm with high bid | chains (with relist) | text full / cut / none | text p10, median, p90 | VIN | mileage | first to last |
|---|---:|---:|---:|---:|---|---:|---|---|---|---:|---:|---|
| bringatrailer | 1384 | 1309 | 72 | 3 | 919 / 465 | 72 | 74 (15) | 1384 / 0 / 0 | 2331, 3036, 3852 | 1384 | 1383 | 2022-01-02 to 2026-11-13 |
| carsandbids | 342 | 335 | 7 | 0 | 252 / 90 | 7 | 7 (0) | 330 / 12 / 0 | 627, 1043, 1318 | 342 | 338 | 2020-06-26 to 2026-11-13 |
| collectingcars | 214 | 214 | n/a | n/a | 211 / 3 | n/a | n/a | 0 / 214 / 0 | 106, 118, 147 | 5 | 214 | 2020-03-16 to 2026-11-15 |
| pcarmarket | 92 | 92 | n/a | n/a | 73 / 19 | n/a | n/a | 92 / 0 / 0 | 2082, 2719, 3315 | 92 | 92 | 2019-10-04 to 2026-10-02 |
| barrettjackson | 34 | 34 | n/a | n/a | 0 / 34 | n/a | n/a | 33 / 1 / 0 | 327, 545, 962 | 34 | 3 | 2020-01-13 to 2026-09-11 |
| themarket | 23 | 23 | n/a | n/a | 23 / 0 | n/a | n/a | 20 / 3 / 0 | 1311, 1708, 2019 | 21 | 23 | 2020-02-20 to 2026-06-11 |
| carandclassic | 22 | 22 | n/a | n/a | 21 / 1 | n/a | n/a | 0 / 0 / 22 | no text | 0 | 22 | 2026-06-14 to 2026-11-08 |
| pistonheads | 17 | 17 | n/a | n/a | 15 / 2 | n/a | n/a | 1 / 16 / 0 | 133, 162, 182 | 0 | 17 | 2025-02-12 to 2026-09-22 |
| hagerty | 12 | 10 | 2 | 0 | 7 / 5 | 2 | 2 (0) | 12 / 0 / 0 | 3036, 3451, 3760 | 12 | 12 | 2024-01-03 to 2026-09-14 |
| rmsothebys | 8 | 8 | n/a | n/a | 8 / 0 | n/a | n/a | 4 / 0 / 4 | 1858, 2072, 2286 | 8 | 4 | 2018-04-07 to 2025-06-04 |
| autohunter | 7 | 7 | n/a | n/a | 5 / 2 | n/a | n/a | 2 / 0 / 5 | 354, 354, 354 | 7 | 7 | 2021-03-08 to 2026-05-26 |
| mecum | 6 | 6 | n/a | n/a | 6 / 0 | n/a | n/a | 0 / 0 / 6 | no text | 6 | 0 | 2026-04-09 to 2026-05-10 |
| bonhams | 6 | 6 | n/a | n/a | 6 / 0 | n/a | n/a | 0 / 0 / 6 | no text | 6 | 6 | 2018-12-03 to 2024-02-29 |
| gooding | 5 | 5 | n/a | n/a | 0 / 5 | n/a | n/a | 0 / 0 / 5 | no text | 5 | 0 | 2022-03-04 to 2025-03-06 |
| broadarrow | 4 | 4 | n/a | n/a | 4 / 0 | n/a | n/a | 0 / 0 / 4 | no text | 4 | 4 | 2023-06-01 to 2026-04-25 |
| hemmings | 3 | 3 | n/a | n/a | 3 / 0 | n/a | n/a | 3 / 0 / 0 | 804, 804, 804 | 3 | 3 | 2022-01-25 to 2024-04-18 |
| sothebysmotorsport | 3 | 3 | 0 | 0 | 3 / 0 | 0 | 0 (0) | 3 / 0 / 0 | 1690, 1770, 1849 | 3 | 3 | 2025-06-20 to 2026-11-05 |

Sources with fewer than 3 rows (in the csv only): acc 1.

Totals: 2183 listings, 2099 sold, 81 reserve not met, 3 withdrawn. Reserve not met rows with a high bid: all of them (the high bid is present on every reserve not met row).

### p996_mezger

| source | listings | sold | rnm | withdrawn | reserve / no reserve | rnm with high bid | chains (with relist) | text full / cut / none | text p10, median, p90 | VIN | mileage | first to last |
|---|---:|---:|---:|---:|---|---:|---|---|---|---:|---:|---|
| bringatrailer | 514 | 499 | 15 | 0 | 441 / 73 | 15 | 15 (3) | 514 / 0 / 0 | 2636, 3276, 4051 | 514 | 511 | 2022-01-03 to 2026-11-16 |
| collectingcars | 198 | 198 | n/a | n/a | 195 / 3 | n/a | n/a | 0 / 198 / 0 | 115, 136, 149 | 2 | 198 | 2020-02-06 to 2026-11-13 |
| pcarmarket | 76 | 76 | n/a | n/a | 75 / 1 | n/a | n/a | 75 / 1 / 0 | 2138, 2726, 3478 | 76 | 76 | 2019-05-09 to 2026-10-27 |
| carsandbids | 67 | 67 | 0 | 0 | 58 / 9 | 0 | 0 (0) | 64 / 3 / 0 | 705, 1075, 1321 | 67 | 67 | 2020-07-14 to 2026-11-09 |
| rmsothebys | 35 | 35 | n/a | n/a | 31 / 4 | n/a | n/a | 28 / 0 / 7 | 1384, 2041, 2851 | 29 | 23 | 2018-09-02 to 2026-08-15 |
| bonhams | 20 | 20 | n/a | n/a | 20 / 0 | n/a | n/a | 0 / 0 / 20 | no text | 20 | 17 | 2016-09-10 to 2025-04-13 |
| broadarrow | 17 | 17 | n/a | n/a | 17 / 0 | n/a | n/a | 0 / 2 / 15 | 160, 160, 160 | 17 | 15 | 2023-06-01 to 2026-11-07 |
| barrettjackson | 10 | 10 | n/a | n/a | 0 / 10 | n/a | n/a | 10 / 0 / 0 | 707, 826, 945 | 10 | 3 | 2020-01-19 to 2026-06-27 |
| themarket | 10 | 10 | n/a | n/a | 10 / 0 | n/a | n/a | 10 / 0 / 0 | 1398, 1717, 2292 | 6 | 10 | 2021-03-22 to 2026-09-22 |
| gooding | 8 | 8 | n/a | n/a | 2 / 6 | n/a | n/a | 0 / 0 / 8 | no text | 8 | 0 | 2018-08-01 to 2026-08-15 |
| sothebysmotorsport | 4 | 4 | 0 | 0 | 3 / 1 | 0 | 0 (0) | 4 / 0 / 0 | 1796, 1915, 2034 | 4 | 4 | 2024-09-19 to 2026-11-10 |

Sources with fewer than 3 rows (in the csv only): hagerty 2, pistonheads 2, mecum 1, carandclassic 1.

Totals: 965 listings, 950 sold, 15 reserve not met, 0 withdrawn. Reserve not met rows with a high bid: all of them (the high bid is present on every reserve not met row).

Chains: a chain is a vehicle (VIN, else listing address) with at least one unsold attempt in the window; with relist = a later attempt or sale of the same vehicle 1 to 90 days after an earlier attempt. Relists are few: e46_m3 2 of 63 chains, p996_carrera 15 of 83 (bringatrailer 15 of 74). A calendar year boundary can split one chain into two; no row has the same VIN and date twice anywhere, and a repeated listing address appears only on collectingcars (2 rows e46_m3, 3 rows p996_carrera, 2 rows p996_mezger).

Truncation signals by source (from the counts, then confirmed by hand below): bringatrailer, carsandbids (e46 sold), pcarmarket, hagerty, rmsothebys, sothebysmotorsport, hemmings: no repeated length, no ellipsis; collectingcars and pistonheads: almost every row is a one line stub of about 160 to 175 characters, a fixed length summary, with an ellipsis or "more" at the end on 67 of 97 (e46_m3), 116 of 214 and 120 of 198 (996) collectingcars rows; themarket: 3 of 23 Carrera rows end in an ellipsis; bonhams, gooding, mecum, carandclassic, broadarrow: no description on nearly every row (bonhams 5 of 5, 6 of 6 and 20 of 20 rows with none; carandclassic 12 of 12, 22 of 22; gooding all; mecum 6 of 6; broadarrow 15 of 17 Mezger rows); carsandbids unsold e46_m3: 15 of 23 rows with no description.

## Stage 2, the hand check (ten listings at most per source per family and table, two windows of five)

Method: valuecensus mode sample, text read in process only, counts kept. Complete = at least 400 characters and no ellipsis or "more" at the end. Sources with 20 or more listings in the family were checked; sources that hold no text (bonhams, gooding, carandclassic, mecum) have nothing to check.

What a cut looks like: only two shapes appear. (1) A fixed length stub: collectingcars and pistonheads text is one short sentence of 100 to 175 characters (collectingcars sample medians: 163 characters for the M3, 78 for the 996 Carrera, 102 for the Mezger; PistonHeads, 19 M3 rows and 17 Carrera rows, was not sampled but its counts show the same stub, median about 165), and in about half of those rows it ends in an ellipsis; the stub is the vendor's summary, not the listing. (2) An ellipsis at the end of an otherwise normal length text (themarket, 3 of 8). Bring a Trailer text does NOT end in a full stop on most rows (0 of 10 for the M3, 1 of 10 and 0 of 10 for the 996): that is how the feed ends the summary, not a cut: lengths run from about 2,000 to 5,500 characters with no repeated length and a normal last clause.

### BMW M3 (e46_m3): how many of the checked listings mention each word

| table, source, family | checked | with text | complete | rod bearings | subframe | VANOS | SMG pump or manual conversion | valve adjustment | rust | paint or repaint | accident history | service records |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sold bringatrailer e46_m3 | 10 | 10 | 10 | 0 | 2 | 2 | 0 | 0 | 0 | 8 | 10 | 4 |
| sold collectingcars e46_m3 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sold carsandbids e46_m3 | 10 | 10 | 10 | 0 | 1 | 1 | 2 | 0 | 0 | 2 | 10 | 5 |
| sold themarket e46_m3 | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| attempts bringatrailer e46_m3 | 10 | 9 | 9 | 2 | 4 | 3 | 0 | 0 | 1 | 7 | 9 | 5 |
| attempts carsandbids e46_m3 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Porsche 996 (p996_carrera and p996_mezger): how many of the checked listings mention each word

| table, source, family | checked | with text | complete | IMS bearing | engine replaced or rebuilt | bore scoring | rear main seal | air oil separator | clutch | paint or repaint | accident history | service records |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sold bringatrailer p996_carrera | 10 | 10 | 10 | 5 | 4 | 0 | 3 | 2 | 5 | 7 | 10 | 6 |
| sold carsandbids p996_carrera | 10 | 10 | 10 | 3 | 1 | 0 | 0 | 0 | 1 | 0 | 6 | 0 |
| sold collectingcars p996_carrera | 10 | 10 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sold pcarmarket p996_carrera | 10 | 10 | 10 | 8 | 2 | 0 | 2 | 1 | 3 | 7 | 7 | 6 |
| sold barrettjackson p996_carrera | 10 | 10 | 4 | 3 | 1 | 0 | 2 | 0 | 1 | 5 | 3 | 1 |
| sold themarket p996_carrera | 8 | 8 | 5 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| sold bringatrailer p996_mezger | 10 | 10 | 10 | 0 | 1 | 0 | 0 | 0 | 3 | 10 | 10 | 5 |
| sold collectingcars p996_mezger | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sold pcarmarket p996_mezger | 10 | 10 | 10 | 0 | 1 | 0 | 0 | 0 | 2 | 9 | 10 | 7 |
| sold carsandbids p996_mezger | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 9 | 2 |
| sold rmsothebys p996_mezger | 10 | 5 | 5 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 1 |
| attempts bringatrailer p996_carrera | 10 | 10 | 10 | 4 | 1 | 0 | 0 | 0 | 1 | 8 | 10 | 4 |
| attempts bringatrailer p996_mezger | 7 | 7 | 7 | 0 | 1 | 0 | 1 | 0 | 5 | 5 | 7 | 3 |
| attempts carsandbids p996_carrera | 7 | 7 | 7 | 5 | 1 | 0 | 0 | 0 | 1 | 3 | 4 | 3 |

Mentions are counts of listings whose text contains the word or a close variant (a plain word match, so "paint or repaint" also counts a mention of factory paint, and "service records" counts any mention of records); they say the words are in the text, not what the text claims. Words that never appear in any checked listing: valve adjustment (M3), bore scoring in the sold M3 and most 996 sources (one each from themarket and RM Sotheby's), air oil separator outside Bring a Trailer and PCARMarket.

How sellers phrase the headline issue, in my words and without quoting: (996) the IMS bearing is almost always raised as a completed job, stated as replaced or upgraded with an aftermarket kit, usually with the month and year and often bundled in one list with the rear main seal and the clutch; the other common wording is the negative, an explicit statement that no record of an upgrade exists (PCARMarket). Cars and Bids and Collecting Cars writers mention it as a reassurance in a selling line ("peace of mind", "addressed") with little detail. A seller saying the engine itself was rebuilt or replaced is rarer than a bearing kit. (M3) rod bearings come up as a recall or service job done in a stated year, or as one item in a long overhaul list next to VANOS, the rear subframe reinforcement, engine mounts and the timing chain tensioner; the subframe is named as a repair already done, not as a worry. Neither car's headline issue is described as a current problem in any checked text; it is a history item with a date.

## Stage 3, structured value drivers (share of listings carrying the field)

Fields are the vendor's own columns; colours are free text values, not grouped (the raw_record also carries standard_exterior_color and standard_interior_color keys, a grouped value, not measured here). Distinct values are the number of different values seen, counted before any grouping (at least this many: each year contributed its 40 most common values, no row had a value longer than 40 characters except 2 bringatrailer Mezger exteriors).

### e46_m3

| source | listings | exterior colour | interior colour | gearbox | body | distinct exterior values | distinct interior values | known flaws | service history | modifications |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bringatrailer | 203 | 99% | 98% | 91% | 100% | 36 | 22 | 81% | 91% | 83% |
| carsandbids | 106 | 86% | 86% | 86% | 86% | 19 | 8 | 86% | 86% | 75% |
| collectingcars | 97 | 96% | 96% | 19% | 49% | 37 | 28 | 1% | 4% | 7% |
| themarket | 21 | 100% | 100% | 100% | 43% | 12 | 10 | 0% | 0% | 0% |
| pistonheads | 19 | 100% | 16% | 100% | 100% | 5 | 3 | 0% | 32% | 11% |
| carandclassic | 12 | 100% | 0% | 100% | 75% | 5 | 0 | 0% | 0% | 0% |
| rmsothebys | 11 | 73% | 73% | 36% | 100% | 4 | 3 | 18% | 64% | 9% |

### p996_carrera

| source | listings | exterior colour | interior colour | gearbox | body | distinct exterior values | distinct interior values | known flaws | service history | modifications |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bringatrailer | 1384 | 100% | 100% | 99% | 100% | 64 | 62 | 77% | 91% | 80% |
| carsandbids | 342 | 100% | 100% | 100% | 100% | 46 | 22 | 100% | 88% | 89% |
| collectingcars | 214 | 96% | 96% | 12% | 40% | 64 | 49 | 0% | 5% | 3% |
| pcarmarket | 92 | 100% | 100% | 100% | 100% | 19 | 14 | 87% | 97% | 97% |
| barrettjackson | 34 | 100% | 100% | 100% | 88% | 23 | 11 | 26% | 50% | 41% |
| themarket | 23 | 100% | 100% | 100% | 30% | 10 | 14 | 9% | 0% | 0% |
| carandclassic | 22 | 100% | 0% | 100% | 68% | 6 | 0 | 0% | 0% | 0% |
| pistonheads | 17 | 100% | 18% | 100% | 100% | 6 | 2 | 0% | 47% | 29% |
| hagerty | 12 | 100% | 100% | 92% | 100% | 11 | 7 | 100% | 75% | 67% |

### p996_mezger

| source | listings | exterior colour | interior colour | gearbox | body | distinct exterior values | distinct interior values | known flaws | service history | modifications |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bringatrailer | 514 | 100% | 99% | 100% | 99% | 35 | 40 | 72% | 89% | 84% |
| collectingcars | 198 | 92% | 92% | 10% | 21% | 67 | 35 | 0% | 2% | 6% |
| pcarmarket | 76 | 100% | 100% | 100% | 100% | 19 | 13 | 75% | 95% | 92% |
| carsandbids | 67 | 100% | 100% | 100% | 100% | 20 | 12 | 99% | 85% | 90% |
| rmsothebys | 35 | 69% | 51% | 17% | 46% | 11 | 12 | 6% | 43% | 20% |
| bonhams | 20 | 0% | 0% | 0% | 75% | 0 | 0 | 0% | 0% | 0% |
| broadarrow | 17 | 0% | 0% | 0% | 6% | 0 | 0 | 0% | 0% | 0% |
| barrettjackson | 10 | 100% | 100% | 100% | 100% | 6 | 5 | 40% | 40% | 60% |
| themarket | 10 | 100% | 100% | 100% | 0% | 8 | 6 | 0% | 0% | 0% |

Mandatory sections: none. In every source with 10 or more rows no section is present on all rows (the list of always present fields is empty everywhere). Bring a Trailer, Cars and Bids, PCARMarket and Hagerty carry the flaws, service and modifications sections on most rows (about 75 to 100 percent) and an empty section means the field was left blank, not that it does not exist; Collecting Cars, The Market and Car and Classic carry almost none of them, and PistonHeads a few (service history on about a third).

## Stage 4, the verdict against Gate 0

Gate 0: at least 300 usable listings (full text and a known outcome), at least 60 of them reserve not met, from at least two sources with 75 or more usable each. Usable here = sold, or reserve not met, with a description that shows no cut sign (so Collecting Cars and PistonHeads stubs, and every row with no text, do not count; withdrawn is not counted as an outcome). The source test uses any source with full text.

| family | usable listings | of them reserve not met | usable attempt chains (chains with a relist) | usable unsold with a high bid | sources with 75 or more usable | Gate 0 |
|---|---:|---:|---:|---:|---|---|
| e46_m3 | 340 | 45 | 45 (2) | 45 | 2: bringatrailer 202, carsandbids 91 | FAIL |
| p996_carrera | 1881 | 81 | 83 (15) | 81 | 3: bringatrailer 1381, carsandbids 330, pcarmarket 92 | PASS |
| p996_mezger | 707 | 15 | 15 (3) | 15 | 2: bringatrailer 514, pcarmarket 75 | not asked (for reference fail) |

**e46_m3: FAIL.** 340 usable listings (clears 300) and two sources above 75 (bringatrailer, carsandbids) but only 45 usable reserve not met listings against 60. The archive holds 63 reserve not met listings; 18 of them have no description (15 Cars and Bids rows and 1 Bring a Trailer row; the two Hagerty rows have none). What is missing: 15 reserve not met listings with text. If the 15 Cars and Bids rows without a description were re-read from the vendor with text the count would reach exactly 60, the gate, and only if all 15 had text; with the text as stored today it stays at 45. The window also matters: reserve not met listings exist only from September 2025, 14 months, so the count grows by about 4 a month for this family.

**p996_carrera: PASS.** 1881 usable listings, 81 of them reserve not met (against 60), from three sources with 75 or more (bringatrailer, carsandbids, pcarmarket). Two cautions: 72 of the 81 reserve not met rows come from one source (bringatrailer), so the reserve not met signal is nearly one source; and the reserve not met rows cover 14 months where the sold rows cover 5 years, so any sold to unsold comparison must use the same 14 months. About 55 bringatrailer, 14 collectingcars, 7 pcarmarket and 1 carsandbids 996 era titles name no trim and are on no line, so the Carrera count could rise slightly if trims were read from the description.

For reference, p996_mezger (not asked): 707 usable, 15 reserve not met: fewer than 60, so it would fail on the same count.

## What looks wrong in the archive

1. Collecting Cars: VIN on 2 of 97, 5 of 214 and 2 of 198 sold rows (and no VIN on PistonHeads or Car and Classic), so no listing can be joined to a second listing or a relist; and its text is a one line stub of about 160 characters, half of them ending in an ellipsis. Collecting Cars is the second largest source for the M3 (97) and the third for the 996 Carrera (214), so it adds sold rows but nothing for a text test.
2. Mileage is missing on much of the auction house data (counted as a stored figure or the raw mileage text): Gooding 0 of 3, 0 of 5, 0 of 8 and Mecum 0 of 6 on every row, Barrett-Jackson 2 of 7 (M3), 3 of 34 and 3 of 10 (996), RM Sotheby's 7 of 11, 4 of 8 and 23 of 35; Bonhams and Broad Arrow carry it. (This corrects my Nov 16 note, which said none of the houses had mileage: that table read only the stored figure column; counting the raw mileage text as well, RM Sotheby's, Bonhams and Broad Arrow do have it.) Bonhams, Gooding, Mecum and Car and Classic carry no description on nearly every row, so for those houses text is missing as well.
3. Bring a Trailer sold history in these families starts in January 2022 (996) and August 2022 (M3); Cars and Bids starts September 2023 for the M3 and June 2020 for the 996. Unsold history starts in September to October 2025 for every source: the archive holds roughly 14 months of reserve not met listings, so reserve not met rates cannot be measured over the years the sold rows span.
4. Cars and Bids reserve not met e46_m3 rows: 15 of 23 have no description (and 15 of 23 carry no structured sections), where the Cars and Bids Carrera reserve not met rows are all complete. This is the one gap that decides the e46_m3 verdict.
5. About 55 Bring a Trailer, 14 Collecting Cars, 7 PCARMarket and 1 Cars and Bids 996 era 911 rows have a title with no Carrera, Targa, Turbo, GT2 or GT3 word, so they are in no family (other_trim); the sold counts per family are a floor.
6. Cars and Bids Carrera sold text is short (median 1,035 characters for the whole family, 440 to 731 in the ten checked), Barrett-Jackson Carrera median 545: complete sentences but brief, so a text test finds less on them.
7. No comments exist in the vendor payload for any source (see above), so seller and house comments cannot be used at all.
8. Bring a Trailer and Cars and Bids rows are nearly all stored once; no row repeats a VIN and date. Repeated VINs across different dates are resales (bringatrailer 104 in the 996 Carrera sold rows).

Search check: no public page touched.
