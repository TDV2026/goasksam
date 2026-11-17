# Value driver census, pilot families (Lane F, Nov 16 2026)

STATUS: PARTIAL. Stage 0 done. Stage 1 sold side done (all 19 sources, three families). Everything that needs the unsold table, the description text or the structured sections is BLANK in census.csv because no existing read path can produce it; the exact read only task is written for Lane B in docs/lane-notes.md under "For Lane B" (task valuecensus). Stages 2, 3 and 4 wait on it. Nothing here is written to production; no listing text and no seller name appears.

Basis: sold side from the existing ops task poolrows (sales_archive; sold rows with a sale price and vehicle_type car). A sold row with no price is invisible to this read, so sold counts are a floor. Families by the resolver's keys: e46_m3 (BMW M3, model years 2000 to 2006, title says M3, other generation codes dropped), p996_carrera and p996_mezger (Porsche 911 and 996, model years 1999 to 2004; Mezger = Turbo, GT2, GT3 in the title; Carrera = Carrera, C2, C4, C4S, Targa in the title). Set aside and counted: {"trim_unstated":91,"ruf":8,"both":1,"lookalike":1} (trim_unstated = a 996 era 911 whose title names no trim, e.g. "911 Cabriolet"; ruf; lookalike = replica, clone, tribute or Turbo look; both = Carrera and Turbo words together). A project_flag row stays counted and is shown in its own column of the table below. 3642 unique sold rows read.

## Stage 1 (sold side only), counts per source and family

### e46_m3

| source | sold | VIN present | mileage present | distinct VINs | VINs on 2+ sales | same VIN and date twice | project flag | first sale | last sale |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| bringatrailer | 170 | 170 | 170 | 166 | 4 | 0 | 4 | 2022-08-06 | 2026-11-15 |
| collectingcars | 97 | 2 | 97 | 2 | 0 | 0 | 0 | 2020-01-28 | 2026-11-15 |
| carsandbids | 83 | 83 | 81 | 79 | 4 | 0 | 0 | 2023-09-01 | 2026-10-23 |
| themarket | 22 | 20 | 22 | 17 | 3 | 0 | 1 | 2020-05-05 | 2026-11-10 |
| pistonheads | 20 | 0 | 20 | 0 | 0 | 0 | 1 | 2024-05-24 | 2026-11-15 |
| rmsothebys | 12 | 11 | 0 | 11 | 0 | 0 | 1 | 2018-03-09 | 2026-01-28 |
| carandclassic | 12 | 0 | 12 | 0 | 0 | 0 | 0 | 2026-06-02 | 2026-09-27 |
| barrettjackson | 7 | 7 | 0 | 7 | 0 | 0 | 0 | 2020-10-24 | 2026-04-17 |
| bonhams | 5 | 5 | 5 | 5 | 0 | 0 | 0 | 2017-12-06 | 2025-09-13 |
| hagerty | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 2026-05-20 | 2026-10-27 |
| gooding | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 2020-03-06 | 2026-08-15 |
| hemmings | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 2020-07-01 | 2026-07-16 |
| autohunter | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 2021-08-26 | 2023-01-04 |
| sothebysmotorsport | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 2024-05-22 | 2025-07-23 |
| pcarmarket | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 2026-01-16 | 2026-01-16 |
| broadarrow | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 2025-05-25 | 2025-05-25 |

Total sold rows: 444.
Body by title: {"coupe":173,"convertible":161,"unstated":110} (unstated = the title names neither coupe nor convertible).

### p996_carrera

| source | sold | VIN present | mileage present | distinct VINs | VINs on 2+ sales | same VIN and date twice | project flag | first sale | last sale |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| bringatrailer | 1335 | 1335 | 1332 | 1229 | 104 | 0 | 23 | 2022-01-02 | 2026-11-13 |
| carsandbids | 337 | 337 | 332 | 323 | 14 | 0 | 2 | 2020-06-26 | 2026-11-10 |
| collectingcars | 210 | 5 | 210 | 5 | 0 | 0 | 0 | 2020-03-16 | 2026-11-15 |
| pcarmarket | 96 | 96 | 96 | 95 | 1 | 0 | 4 | 2019-10-04 | 2026-11-10 |
| barrettjackson | 35 | 35 | 0 | 34 | 1 | 0 | 1 | 2020-01-13 | 2026-09-11 |
| themarket | 28 | 25 | 28 | 22 | 3 | 0 | 2 | 2020-02-20 | 2026-06-11 |
| carandclassic | 23 | 0 | 23 | 0 | 0 | 0 | 0 | 2026-06-14 | 2026-11-08 |
| pistonheads | 17 | 0 | 17 | 0 | 0 | 0 | 0 | 2025-02-12 | 2026-09-22 |
| hagerty | 10 | 10 | 10 | 10 | 0 | 0 | 0 | 2024-01-03 | 2026-07-22 |
| rmsothebys | 8 | 8 | 0 | 8 | 0 | 0 | 0 | 2018-04-07 | 2025-06-04 |
| autohunter | 7 | 7 | 7 | 7 | 0 | 0 | 0 | 2021-03-08 | 2026-05-26 |
| mecum | 6 | 6 | 0 | 6 | 0 | 0 | 0 | 2026-04-09 | 2026-05-10 |
| bonhams | 6 | 6 | 6 | 6 | 0 | 0 | 0 | 2018-12-03 | 2024-02-29 |
| gooding | 5 | 5 | 0 | 5 | 0 | 0 | 0 | 2022-03-04 | 2025-03-06 |
| broadarrow | 4 | 4 | 4 | 4 | 0 | 0 | 0 | 2023-06-01 | 2026-04-25 |
| hemmings | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 2022-01-25 | 2024-04-18 |
| sothebysmotorsport | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 2025-06-20 | 2026-11-05 |
| acc | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 2024-05-13 | 2024-05-13 |

Total sold rows: 2134.

### p996_mezger

| source | sold | VIN present | mileage present | distinct VINs | VINs on 2+ sales | same VIN and date twice | project flag | first sale | last sale |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| bringatrailer | 504 | 504 | 499 | 466 | 37 | 0 | 6 | 2022-01-03 | 2026-11-10 |
| collectingcars | 198 | 2 | 198 | 2 | 0 | 0 | 0 | 2020-02-06 | 2026-11-13 |
| pcarmarket | 79 | 79 | 79 | 77 | 2 | 0 | 3 | 2019-05-09 | 2026-10-27 |
| carsandbids | 67 | 67 | 67 | 66 | 1 | 0 | 0 | 2020-07-14 | 2026-11-09 |
| rmsothebys | 36 | 30 | 0 | 29 | 1 | 0 | 1 | 2018-09-02 | 2026-08-15 |
| bonhams | 19 | 19 | 16 | 17 | 2 | 0 | 0 | 2016-09-10 | 2025-04-13 |
| broadarrow | 16 | 16 | 14 | 16 | 0 | 0 | 0 | 2023-06-01 | 2026-11-07 |
| barrettjackson | 10 | 10 | 0 | 9 | 1 | 0 | 0 | 2020-01-19 | 2026-06-27 |
| themarket | 9 | 5 | 9 | 5 | 0 | 0 | 0 | 2021-03-22 | 2026-07-27 |
| gooding | 8 | 8 | 0 | 8 | 0 | 0 | 0 | 2018-08-01 | 2026-08-15 |
| sothebysmotorsport | 4 | 4 | 4 | 4 | 0 | 0 | 0 | 2024-09-19 | 2026-11-10 |
| hagerty | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 2023-02-02 | 2025-10-31 |
| pistonheads | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 2024-11-06 | 2025-11-12 |
| mecum | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 2026-05-14 | 2026-05-14 |
| carandclassic | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 2026-08-08 | 2026-08-08 |

Total sold rows: 956.

In census.csv the columns sold and listings_total are the sold count only (the unsold listings are not yet counted, so listings_total is a floor); every other outcome, reserve, text, structure and comments column is empty, not zero.

## Stage 4, verdict against Gate 0: NOT DECIDABLE YET

Usable means full text and a known outcome. Full text cannot be measured until valuecensus exists, and the reserve not met count (60 needed) lives only in auction_attempts, which exists for five sources: bringatrailer, carsandbids, hagerty, sothebysmotorsport, mbmarket. What the sold side already settles:

- UPPER BOUNDS on usable listings (every sold row, before any text test): e46_m3 444 sold; p996_carrera 2,134; p996_mezger 956 (before the unsold side is added).
- Sources with 75 or more SOLD rows (ceiling for the 75 per source test): e46_m3: bringatrailer 170, collectingcars 97, carsandbids 83 (3); p996_carrera: bringatrailer 1,335, carsandbids 337, collectingcars 210, pcarmarket 96 (4); p996_mezger: bringatrailer 504, collectingcars 198, pcarmarket 79 (3; carsandbids has 67).
- The reserve not met test can only be met from sources that have attempts: for e46_m3 that means bringatrailer and carsandbids (collectingcars and pcarmarket have no unsold record by rule), so the two sources with 75 usable listings must be those two, and e46_m3 passes the source test only if every one of the 83 carsandbids sold rows (and 75 of its 83) has full text. That is a tight margin, to be read.
- collectingcars sold rows carry a VIN on 2 of 97 (e46_m3), 5 of 210 and 2 of 198: its listings cannot be linked to a car or a relist chain.
- Pass or fail for e46_m3 and p996_carrera: NOT STATED. I will not guess at the text or the unsold counts. What is missing: the unsold counts per source and family (rnm, withdrawn, high bid, chains) and the description length and cut per source and family, both from valuecensus.

## Anything in the archive that looks wrong (so far)

1. Collecting Cars rows carry almost no VIN (2 of 97, 5 of 210, 2 of 198) and PistonHeads and Car & Classic none, so a VIN can never join them to a second listing or a later sale.
2. Auction house rows (RM Sotheby's, Barrett-Jackson, Gooding, Mecum) carry no mileage in the structured column on every row read (0 of 12, 0 of 7, 0 of 3, 0 of 6), as the product notes already say houses are null.
3. BaT and Cars & Bids history starts later than the other sources in these families: the first BaT sale in e46_m3 is 2022-08-06 and in the two 996 families 2022-01-02, Cars & Bids 2023-09-01 for the M3 and 2020 for the 996 (the notes say BaT and C&B were seeded back only to 2023 in places; the dates here show 2022). A relist or a price trend before those dates is invisible.
4. 91 sold 996 era 911 titles name no trim and cannot be put in Carrera or Mezger by the title; the resolver would give them no trim as well. They are counted aside, not in either family.
5. 104 BaT p996_carrera VINs and 37 p996_mezger VINs appear on two or more sold rows: real resales of the same car, or the same listing stored twice. The same VIN and the same date twice is 0 everywhere, so no row is stored twice on one day.
6. Nothing found yet about the unsold side or text; those checks wait on valuecensus.

Search check: no public page touched.
