# Hagerty models, last 12 months (Lane F, Nov 14 2026)

SOURCE: one read-only pass of the sales pool (sales_archive through ops task=poolrows), no write, zero OldCarsData. WINDOW: sales dated Nov 14 2025 to Nov 13 2026 (the newest Hagerty sale in the pool is Nov 13 2026). HAGERTY: source hagerty. ALL VENUES: every venue in the pool for the same makes and window (Hagerty included). FAMILY: the Desk's own grouping key (lib/desk/familyKey.js deskModelFamily), so a chassis code folds into its model (996 into 911) and a performance badge that is its own market stays its own family. FENCES: sold rows with a price, cars only, price at or above $2,500, project and shell cars left out, and parts lots left out by the engine's own title rule (isPartsListing in lib/_classify.js, run on the title alone with a year of 1885 or later). Prices are the stored USD figure; medians are the middle price (interpolated when the count is even). NOT applied: the engine's replica and modification set-asides and the full non-vehicle lot read (it needs the description, which this read did not take), so a part lot that names a donor car's year can still sit in a count, so a count can sit a little above what the engine would count for the same family.

| # | Model family | Hagerty sales | All-venue sales | Hagerty median | All-venue median |
|---|---|---:|---:|---:|---:|
| 1 | Chevrolet Corvette | 148 | 2317 | $25,000 | $50,001 |
| 2 | Ford Mustang | 108 | 1699 | $22,275 | $33,600 |
| 3 | Chevrolet Camaro | 70 | 949 | $24,500 | $47,300 |
| 4 | Ford F-Series | 49 | 1340 | $14,250 | $23,500 |
| 5 | Pontiac Firebird | 48 | 385 | $12,753 | $31,250 |
| 6 | Porsche 911 | 38 | 3560 | $46,128 | $91,000 |
| 7 | Chevrolet C/K | 33 | 542 | $14,000 | $23,375 |
| 8 | Ford Thunderbird | 33 | 410 | $15,250 | $19,650 |
| 9 | Ford Model A | 24 | 116 | $17,875 | $19,625 |
| 10 | Volkswagen Beetle | 21 | 320 | $8,250 | $13,625 |
| 11 | Dodge Challenger | 17 | 356 | $43,000 | $72,750 |
| 12 | Chevrolet Chevelle | 17 | 351 | $38,000 | $59,400 |
| 13 | Lincoln Continental | 16 | 191 | $8,428 | $30,000 |
| 14 | Chevrolet Impala | 15 | 200 | $23,600 | $41,900 |
| 15 | Pontiac GTO | 15 | 215 | $45,000 | $55,000 |

THREE FAMILIES TIE AT 15 HAGERTY SALES for the last place. Pontiac GTO takes the 15th row by the order the pool returned it; the other two are: Mercedes-Benz SL-Class (Hagerty 15, all venues 642, Hagerty median $18,000, all-venue median $19,375); Jaguar XJ (Hagerty 15, all venues 202, Hagerty median $9,300, all-venue median $10,725). They are shown here so the cut is not hidden.

## One Hagerty sale in the last 90 days (Aug 16 to Nov 13 2026) for the top 5, the most recent one

| Model family | Year | Title | Price | Date |
|---|---:|---|---:|---|
| Chevrolet Corvette | 1989 | 1989 Chevrolet Corvette Convertible | $6,400 | 2026-11-13 |
| Ford Mustang | 2020 | 1,100-Mile 2020 Ford Mustang Shelby GT350 | $66,250 | 2026-11-10 |
| Chevrolet Camaro | 1994 | Two-Owner 1994 Chevrolet Camaro Z28 Convertible | $6,500 | 2026-11-13 |
| Ford F-Series | 1971 | 1971 Ford F-100 Sport Custom 3-Speed | $7,750 | 2026-11-09 |
| Pontiac Firebird | 1979 | 1979 Pontiac Trans Am Special Edition | $35,000 | 2026-10-07 |

No email address and no seller name are in this file: the read did not select either.

Search check: no public page touched.
