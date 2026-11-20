# Third generation Pontiac Firebird, 1982 to 1992: the Knight Rider replicas against the real cars (Lane F, Nov 17 2026)

**Read only. Branch lane-f-firebird-kitt. Nothing pushed. No seller name and no listing text in this file or the csv files.**

## The two windows, up top

- **Sold rows:** sold between **2021-11-17 and 2026-11-16**, every venue the archive holds (205 sales read in one call).
- **Unsold attempts (the only dates sell-through can be stated for):** the attempts table holds **2025-09-16 to 2026-11-16** (this family's own first attempt 2025-09-17, last 2026-11-13), and only for five venues: **Bring a Trailer, Cars & Bids, Hagerty, Sotheby's Motorsport and MB Market** (this read found attempts at Bring a Trailer, Cars & Bids and Hagerty). Every other venue (Barrett-Jackson, Mecum, Bonhams, PCarMarket, Hemmings, ACC, AutoHunter and the rest) has sales and no attempts, so no sell-through can be stated for them. Sell-through below is therefore: sales at those five venues since 2025-09-16, against the 17 attempts. "Last 12 months" is 2025-11-17 to 2026-11-16.
- **Caution on the attempts table:** it holds 17 attempts for this family against 65 sales at the same five venues in the same window, about one unsold car for every 3.8 sold. I cannot say from here whether that is the market or a gap in what the table captured (the attempts ingest stops at the first page it already holds), so read every sell-through rate as an upper bound.

## How the groups were made

- **Groups come from the engine's verdicts, not from titles I read:** KITT replica = the engine's replica and tribute flag (isReplicaCar, returned by poolrows as replica); the other four are the engine's variant reader (variantOfSale) on cars that are not replicas and that the engine lets into a pool (its set asides removed: modified, project, no photo, under the $2,500 floor). Sales that name no variant (25) and set asides (18) are in no group. All 11 KITT sales and the 1 KITT attempt carry the flag.
- **One defect found:** poolrows returned no variant for 19 rows (the house's model text, for example "FIREBIRD TRANS AM", is not read as a Firebird, so the family lookup fails). For those I ran the same engine reader (variantOfSale) with the Firebird family given, on the row's title: the engine's own words, but applied by me. This affects the variant labels on poolrows rows only (for Lane B or D).
- **Repeats:** a car key (a keyed hash of the VIN) joins the same car across sales and attempts. Rows with no car key: **2 of 205 sold rows and 0 of 17 attempts (0.9%)**; a keyless row counts as its own car. Every sale is kept for price; for sell-through each car counts once, by its latest event in the window. Overall 17 cars appear more than once (21 extra rows).

| Group | Repeat cars | Extra rows | Rows with no car key |
|---|---|---|---|
| KITT replica | 0 | 0 | 1 |
| 20th Anniversary Turbo Trans Am | 1 | 1 | 0 |
| GTA | 2 | 4 | 0 |
| Trans Am | 6 | 7 | 0 |
| Formula | 2 | 2 | 0 |

## Per group

Prices are the engine's hammer figure in US dollars. Mileage 0 or none counts as not stated. A median is shown for a mileage band only with 5 or more sales.

### 1 and 2. Sell-through and sold prices

| Group | Sales (full window) | Median | Middle half | Lowest | Highest | Attempts window: cars, sold, not sold, rate | Last 12 months: cars, sold, not sold, rate |
|---|---|---|---|---|---|---|---|
| KITT replica | 11 | $50,000 | $34,750 to $64,500 | $10,000 | $96,000 | 5, 4, 1, 80% | 3, 3, 0, 100% |
| 20th Anniversary Turbo Trans Am | 36 | $45,150 | $37,750 to $65,500 | $12,000 | $96,500 | 9, 8, 1, 89% | 9, 8, 1, 89% |
| GTA | 38 | $15,950 | $11,000 to $24,813 | $4,900 | $42,000 | 13, 12, 1, 92% | 11, 10, 1, 91% |
| Trans Am | 62 | $14,275 | $11,104 to $17,875 | $3,950 | $59,000 | 22, 20, 2, 91% | 17, 15, 2, 88% |
| Formula | 23 | $14,250 | $10,025 to $16,430 | $5,000 | $60,000 | 7, 6, 1, 86% | 5, 4, 1, 80% |

Every sell-through cell rests on 3 to 22 cars, all under 25 and most under 10.

### 3. The cars that did not sell

| Group | Attempts | With a high bid | Median high bid | Asking reserve |
|---|---|---|---|---|
| KITT replica | 1 | 1 | $26,500 | not held (the archive stores whether a car had a reserve, not the figure) |
| 20th Anniversary Turbo Trans Am | 1 | 1 | $49,500 | not held (the archive stores whether a car had a reserve, not the figure) |
| GTA | 3 | 3 | $18,777 | not held (the archive stores whether a car had a reserve, not the figure) |
| Trans Am | 3 | 2 | $9,750 | not held (the archive stores whether a car had a reserve, not the figure) |
| Formula | 1 | 1 | $17,100 | not held (the archive stores whether a car had a reserve, not the figure) |

### 4. Mileage

| Group | Median miles of sold cars (n) | Under 30,000 | 30,000 to 80,000 | Over 80,000 |
|---|---|---|---|---|
| KITT replica | 58,000 (6) | 1 sales, no median (under 5) | 4 sales, no median (under 5) | 1 sales, no median (under 5) |
| 20th Anniversary Turbo Trans Am | 11,000 (33) | 27 sales, $50,000 | 6 sales, $33,225 | 0 sales, no median (under 5) |
| GTA | 47,000 (32) | 10 sales, $24,125 | 17 sales, $12,750 | 5 sales, $10,250 |
| Trans Am | 47,495 (54) | 21 sales, $17,500 | 24 sales, $13,914 | 9 sales, $6,750 |
| Formula | 31,500 (22) | 10 sales, $16,500 | 10 sales, $13,875 | 2 sales, no median (under 5) |

### 5. By calendar year: sold median (sales)

| Group | 2022 | 2023 | 2024 | 2025 | 2026 (to Nov 16) |
|---|---|---|---|---|---|
| KITT replica | $31,500 (1) | none | $50,000 (3) | $51,000 (2) | $65,000 (5) |
| 20th Anniversary Turbo Trans Am | $61,000 (7) | $48,125 (6) | $38,250 (7) | $65,750 (10) | $39,501 (6) |
| GTA | $11,500 (8) | $13,500 (7) | $11,250 (7) | $24,000 (7) | $24,000 (9) |
| Trans Am | $15,750 (7) | $12,500 (18) | $15,851 (8) | $14,077 (13) | $14,250 (15) |
| Formula | $21,753 (2) | $15,278 (8) | $7,611 (4) | $10,500 (5) | $14,625 (4) |

Sell-through by year where attempts exist (2025 means 2025-09-16 to 2025-12-31; 2026 is to Nov 16), cars sold of cars:

| Group | 2025 | 2026 |
|---|---|---|
| KITT replica | 1 of 2 (50%) | 3 of 3 (100%) |
| 20th Anniversary Turbo Trans Am | 2 of 2 (100%) | 6 of 7 (86%) |
| GTA | 5 of 5 (100%) | 8 of 9 (89%) |
| Trans Am | 6 of 6 (100%) | 14 of 16 (88%) |
| Formula | 3 of 3 (100%) | 4 of 5 (80%) |

### 6. Venue: sales and median

- **KITT replica:** bringatrailer 7 at $56,000; barrettjackson 3 at $38,000; carandclassic 1 at $67,310
- **20th Anniversary Turbo Trans Am:** bringatrailer 32 at $45,150; barrettjackson 3 at $67,000; carsandbids 1 at $33,250
- **GTA:** bringatrailer 22 at $17,788; carsandbids 5 at $14,600; barrettjackson 5 at $25,000; hagerty 3 at $7,500; acc 1 at $25,200; pcarmarket 1 at $13,500; autohunter 1 at $10,000
- **Trans Am:** bringatrailer 40 at $15,175; hagerty 9 at $8,000; barrettjackson 7 at $13,000; autohunter 3 at $14,300; bonhams 1 at $35,762; hemmings 1 at $3,950; pcarmarket 1 at $17,000
- **Formula:** bringatrailer 15 at $15,000; hagerty 3 at $10,500; carsandbids 2 at $10,900; autohunter 2 at $16,750; barrettjackson 1 at $5,000

For KITT, the seven sales at or above $50,000 sit on three venues: bringatrailer 5, carandclassic 1, barrettjackson 1. Bring a Trailer holds 7 of the 11 KITT sales (median $56,000), Barrett-Jackson 3 (median $38,000), Car & Classic 1 ($67,310). So the high prices are mostly on Bring a Trailer, which is also where most KITT cars sell: the venue does not separate them, although the three Barrett-Jackson sales are the cheaper ones ($50,000, $38,000, $10,000).

### 7. Reserve against no reserve (sold; sell-through in the attempts window)

| Group | Reserve: sales, median, cars sold of cars | No reserve: sales, median, cars sold of cars |
|---|---|---|
| KITT replica | 7, $64,000, 4 of 5 | 4, $34,750, 0 of 0 |
| 20th Anniversary Turbo Trans Am | 27, $45,250, 7 of 8 | 9, $45,050, 1 of 1 |
| GTA | 16, $22,250, 6 of 7 | 22, $12,375, 6 of 6 |
| Trans Am | 20, $15,250, 7 of 9 | 42, $13,375, 13 of 13 |
| Formula | 7, $16,500, 3 of 4 | 16, $10,625, 4 of 4 |

The reserve status is known on every sale. Almost every unsold attempt had a reserve (16 of 17), which is how reserve not met works, so the no reserve sell-through is close to 100 percent by construction.

### 8. Manual against automatic (5 or more sales each)

| Group | Manual | Automatic | Read |
|---|---|---|---|
| KITT replica | 0 sales | 10 sales, $53,000 | manual under 5 sales: no comparison |
| 20th Anniversary Turbo Trans Am | 0 sales | 36 sales, $45,150 | manual under 5 sales: no comparison |
| GTA | 0 sales | 38 sales, $15,950 | manual under 5 sales: no comparison |
| Trans Am | 14 sales, $14,825 | 47 sales, $13,750 | both have 5 or more: shown |
| Formula | 6 sales, $16,028 | 17 sales, $13,500 | both have 5 or more: shown |

Only the Trans Am (manual $14,825 on 14, automatic $13,750 on 47) and the Formula (manual $16,028 on 6, automatic $13,500 on 17) have both. The KITT cars are all black, and all automatic where the gearbox is recorded (10 of 11).

## The Knight Rider replicas in detail

All 11 sold KITT replicas, facts only (colour and gearbox are the archive's):

| Price | Sold | Venue | Model year | Mileage | Colour | Gearbox | Reserve |
|---|---|---|---|---|---|---|---|
| $96,000 | May 2026 | bringatrailer | 1992 | 85,000 | black | automatic | reserve |
| $67,310 | Sep 2026 | carandclassic | 1982 | 71,000 | black | automatic | reserve |
| $65,000 | Jul 2026 | bringatrailer | 1984 | 1,000 | black | automatic | reserve |
| $64,000 | Nov 2025 | bringatrailer | 1987 | not stated | black | automatic | reserve |
| $56,000 | Oct 2026 | bringatrailer | 1984 | 45,000 | black | automatic | reserve |
| $50,000 | Apr 2024 | barrettjackson | 1984 | not stated | black | automatic | no_reserve |
| $50,000 | Mar 2024 | bringatrailer | 1984 | not stated | black | automatic | reserve |
| $38,000 | Jan 2025 | barrettjackson | 1983 | not stated | black | not recorded | no_reserve |
| $31,500 | Nov 2022 | bringatrailer | 1992 | 71,000 | black | automatic | no_reserve |
| $18,250 | Aug 2024 | bringatrailer | 1987 | 45,000 | black | automatic | reserve |
| $10,000 | Sep 2026 | barrettjackson | 1982 | not stated | black | automatic | no_reserve |

### 9. Counts by price, and failed attempts

| At or above | KITT sales | Failed KITT attempts with a high bid in the range |
|---|---|---|
| $40,000 | 7 | 0 |
| $50,000 | 7 | 0 |
| $60,000 | 4 | 0 |
| $90,000 | 1 | 0 |

There is one failed KITT attempt, a reserve not met at Bring a Trailer in Oct 2025 with a high bid of $26,500: below every range. One attempt cannot say where cars stall.

### 10. Are the 2026 sales unusual?

| | Sales | Median | Middle half | Lowest to highest |
|---|---|---|---|---|
| 2026 (to Nov 16) | 5 | $65,000 | $56,000 to $67,310 | $10,000 to $96,000 |
| 2022 to 2025 | 6 | $44,000 | $33,125 to $50,000 | $18,250 to $64,000 |

The 2026 median is $21,000 higher. A permutation test (20,000 reshuffles of the 11 prices into groups of 5 and 6) finds a difference of medians that large or larger in **24 percent** of reshuffles (p = 0.235). **At this sample size the difference could easily be chance.** The 2026 spread is also wide: it holds both the cheapest sale ($10,000) and the dearest ($96,000).

### 11. Does mileage explain the premium?

Mileage is stated on 6 of the 11 KITT sales. Mileage against price: 1,000 mi at $65,000; 45,000 mi at $56,000; 45,000 mi at $18,250; 71,000 mi at $67,310; 71,000 mi at $31,500; 85,000 mi at $96,000. Rank correlation between mileage and price on those 6: 0.31 (positive: the higher mileage cars were not cheaper). The only low mileage car (1,000 miles) sold at $65,000, below the $96,000 car with 85,000 miles. **Mileage does not explain the premium, but 6 cars cannot say much, and 5 have no mileage.** By band: under 30,000 miles 1 sale; 30,000 to 80,000 miles 4 sales (median $43,750); over 80,000 miles 1 sale. The real Trans Am by band: under 30,000 $17,500 (21 sales), 30,000 to 80,000 $13,914 (24), over 80,000 $6,750 (9). The KITT cars with 45,000 to 71,000 miles ($56,000, $67,310, $31,500, $18,250) all sold above the $13,914 Trans Am median for the same band.

### 12. What separates the expensive replicas from the cheap ones

One sample read of the replica flag, last 366 days (2025-11-17 to 2026-11-16), held in process and not written to disk. **It returned 5 of the 11 KITT sales. The other 6 sold before 2025-11-17 (the earliest 2022-11-09, the latest 4 days before the window opens) and could not be coded.** One of the 5 has no description at all, so 4 could be read. Each was coded by fixed word lists (below), not by my reading, so the coding is coarse: a "yes" means the words appear, not that the claim is true.

| Price | Sold | Venue | Model year | Mileage | Underneath | Conversion quality claim | Interior treatment | Working electronics or dash | Documented build or builder | Screen used or studio claim | Engine swap mentioned |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $96,000 | May 2026 | bringatrailer | 1992 | 85,000 | Formula | no | yes | yes | no | no | yes |
| $67,310 | Sep 2026 | carandclassic | 1982 | 71,000 | not stated | no | no | no | no | no | no (no description) |
| $65,000 | Jul 2026 | bringatrailer | 1984 | 1,000 | Trans Am | no | yes | yes | no | yes | yes |
| $56,000 | Oct 2026 | bringatrailer | 1984 | 45,000 | Firebird, trim not named | no | yes | yes | no | no | yes |
| $10,000 | Sep 2026 | barrettjackson | 1982 | not stated | Trans Am | no | yes | yes | no | no | yes |

Word lists: quality (professional, expert, well executed, high quality, meticulous, period correct, frame off, ground up, show quality, accurate, faithful, detailed); interior (custom, retrimmed, reupholstered, Recaro, scanner, console, control panel, cockpit, digital); electronics (working, functional, illuminates, animated, voice, LED, LCD, monitor, display, screen, scanner); build or builder (builder, built by, converted by, documentation, receipts, build sheet or thread); studio (screen used, studio, Universal, hero car, used in the show). **Read:** the four described cars score alike on almost every column (interior and electronics yes, no quality claim, no builder claim, one studio claim), yet they sold at $10,000, $56,000, $65,000 and $96,000. The coded features do not separate cheap from dear. What does differ is the venue and the sale terms: the $10,000 car sold at Barrett-Jackson with no reserve; the three above $50,000 sold on Bring a Trailer with a reserve. Five cars are too few for more than that.

## What the numbers support

- **A. Replicas consistently command a premium: SUPPORTED over the ordinary cars, on 11 sales.** 10 of the 11 KITT sales are above the real Trans Am median of $14,275 (62 sales); the KITT median is $50,000 (middle half $34,750 to $64,500), 3.5 times. Against the 20th Anniversary Turbo Trans Am ($45,150, 36 sales) 7 of 11 are above: level with the dearest real Firebird, not clearly above it. The exception is the one $10,000 car.
- **B. Only the best replicas command a premium: NOT TESTABLE.** 10 of 11 are already above the real car, and the coding of 4 described cars does not separate them.
- **C. Prices are rising: NOT SUPPORTED.** 2026 $65,000 on 5 sales against $44,000 on 6 for 2022 to 2025, and chance reproduces a gap that big 24 percent of the time.
- **D. The sample is too small to say: YES, for most of it.** 11 KITT sales, 1 KITT attempt (no sell-through), 5 coded cars, 6 with a stated mileage, and every sell-through cell under 25 cars.
- **E. Something else:** every KITT car is black, and automatic where recorded, so those traits cannot explain differences inside the group; reserve cars sold higher than no reserve cars ($64,000 on 7 against $34,750 on 4); and the attempts table looks thin (17 attempts), which would flatter every sell-through.

## The five most interesting findings, ranked by surprise and by how defensible they are

1. **Replica Knight Rider Firebirds sell for 3.5 times a real Trans Am.** 11 KITT sales at a median of $50,000 against $14,275 on 62 Trans Ams; 10 of the 11 are above the Trans Am median and 7 are at or above $50,000. Rests on 11 cars: defensible on the count, with a venue mix and no sell-through.
2. **The replica is worth about as much as the rarest real Firebird.** KITT median $50,000 (11) against $45,150 for the 20th Anniversary Turbo Trans Am (36), whose cars have a median of 11,000 miles; 7 of the 11 KITT sales beat that median.
3. **Mileage does not explain it.** The dearest KITT ($96,000) has 85,000 miles; the 1,000 mile car made $65,000; the correlation between mileage and price is +0.31 on 6 cars. **Rests on 6 cars with a stated mileage (fewer than 10).**
4. **2026 looks richer but may be luck.** 2026 median $65,000 (5 sales) against $44,000 (6) before; chance gives a gap that big 24 percent of the time. **Rests on 5 and 6 cars (fewer than 10).**
5. **A reserve moves the GTA's price a lot.** GTA with a reserve $22,250 (16 sales) against $12,375 with no reserve (22); the KITT split is $64,000 (7) against $34,750 (4, **fewer than 10**). Reserve cars are the better cars as much as anything: a pattern, not a cause.

Search check: no public page touched.
