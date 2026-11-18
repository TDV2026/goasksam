# The variant story: how far apart the trims of one model sell (Lane F, Nov 17 2026)

**Window for everything: sold between 2021-11-17 and 2026-11-16.** Read only. Branch lane-f-variant-story. Nothing pushed. No seller name and no listing text anywhere.

## How it was read (and what is missing)

- **Families:** the four the engine has a variant list for in data/variantFamilies.json: third generation Pontiac Firebird (1982 to 1992), third generation Chevrolet Camaro (1982 to 1992), Fox Ford Mustang (1979 to 1993) and C4 Chevrolet Corvette (1984 to 1996). **The E30 3 Series, the 1984 to 1989 911 and the R107 SL have no variant list in the engine's data, so they are not covered.** I did not classify them from titles. Adding them is a data change for Lane B (a family entry per model in data/variantFamilies.json), then this pull reruns in minutes.
- **Variant of each sale:** the engine's own reader, `variantOfSale` in lib/variants.js, run unchanged on the sale's title against the family list (most specific first; a package such as the GTA or the IROC-Z is its own variant, so the parent's figures exclude it, as the engine's package rule does; a sale that names no variant is "Unstated", never base). The rows come from the existing ops task poolrows with fence=1: one request at a time, 8 reads in all, no writes. poolrows hands back the engine's own verdict for each sale (its `qualifyReason`). A sale counts when the engine would let it into a pool. The engine's set asides are removed and counted: replicas and tributes, substantially modified or non-stock cars, projects, race cars, prototypes, parts, sales under the $2,500 car floor, and no photo. Prices are the engine's hammer basis in US dollars (hammerUsd, premiums backed out, the basis the Desk reads).
- **Mileage:** the sale's mileage as the engine reads it. A mileage of 0 or none is treated as not stated (about one sale in eight), and every mileage figure below says how many sales it rests on.
- **NOT AVAILABLE, and exactly what is missing:** (a) **colour and gearbox** (item 2's colour and gearbox, and item 5, manual against automatic): poolrows selects raw_record transmission, which is empty on every one of the 2,792 rows read, and it does not select the exterior colour at all. The sales_archive columns transmission and exterior_color exist, but no read route returns them for these families (valuecensus takes only the three BMW and Porsche families). The fix is one line in api/usageDashboard.js poolrows: select `transmission` and `exterior_color` as columns. That is a push, so I stopped there. (b) **Unsold attempts (item 6):** no read route returns auction_attempts for these families (valuecensus attempts mode accepts only e46_m3 and the two 996 families). Missing: the same valuecensus counts for these four families, or an attempts-by-title read in poolrows.
- **What the pull held:** Firebird 205 sales read, Camaro 350, Mustang 807, Corvette 1,430 (every sale in the window the archive holds; archive history for several sources starts in 2022, and Bring a Trailer is the main venue).

## Pontiac Firebird, 1982 to 1992

- Sales read 205; counted 177; set aside by the engine: 11 replica or tribute named in the title, 0 more flagged replica, tribute or recreation by the engine's project flag (see item 9), 17 other (11 substantially modified, 2 modified or non-stock, 1 project or incomplete car, 1 below the $2,500 car floor, 1 project or incomplete car, 1 no photo).

| Variant | Sales | Median | Middle half | Lowest | Highest | Median miles (n) | Under 30,000 mi | Last 12 months vs the 12 before |
|---|---|---|---|---|---|---|---|---|
| Firehawk | 0 | | | | | | | |
| 20th Anniversary Turbo Trans Am | 36 | $45,150 | $37,750 to $65,500 | $12,000 | $96,500 | 11,000 (33) | 82% (27 of 33) | $42,125 (8) vs $41,625 (10) |
| GTA | 38 | $15,950 | $11,000 to $24,813 | $4,900 | $42,000 | 47,000 (32) | 31% (10 of 32) | $24,000 (11) vs $19,000 (8) |
| Trans Am | 62 | $14,275 | $11,104 to $17,875 | $3,950 | $59,000 | 47,495 (54) | 39% (21 of 54) | $14,400 (17) vs $13,552 (12) |
| Formula | 23 | $14,250 | $10,025 to $16,430 | $5,000 | $60,000 | 31,500 (22) | 46% (10 of 22) | not shown (4 and 6 sales) |
| Unstated | 18 | $11,300 | $6,375 to $16,313 | $4,100 | $20,250 | 31,000 (17) | 47% (8 of 17) | not shown (3 and 5 sales) |

(* under 10 sales.) Venue note: the sales are mostly Bring a Trailer.

**Top sale of each variant, facts only** (colour and gearbox not available, see the top of this file):

| Variant | Price | Sold | Venue | Model year | Mileage |
|---|---|---|---|---|---|
| 20th Anniversary Turbo Trans Am | $96,500 | Mar 2025 | bringatrailer | 1989 | 59 |
| GTA | $42,000 | Sep 2026 | bringatrailer | 1989 | 9,000 |
| Trans Am | $59,000 | Jan 2023 | barrettjackson | 1989 | not stated |
| Formula | $60,000 | Oct 2026 | bringatrailer | 1991 | 3,000 |
| Unstated | $20,250 | Oct 2022 | bringatrailer | 1991 | 8,000 |

**7. Highest variant median against the lowest** (variants with 8 or more sales): 20th Anniversary Turbo Trans Am ($45,150, 36 sales) over Formula ($14,250, 23 sales) is **3.17 times**.

**Widest gap against mileage** (20th Anniversary Turbo Trans Am over Formula; whole gap $30,900, 3.17 times): under 30,000 miles 27 against 10 sales, $50,000 against $16,500, gap $33,500 (108% of the whole), 3.03 times; 30,000 to 80,000 miles 6 against 10 sales, $33,225 against $13,875, gap $19,350 (63% of the whole), 2.39 times (under 10 sales in a cell); over 80,000 miles 0 against 2 sales, cannot be compared.

**9. Replicas and tributes set aside:** 11 named in the title (the engine's "memorabilia or replica"), median $50,000. Against the variant each copies: Unstated: 3 replicas at $50,000 against 18 real sales at $11,300 (under 10); Trans Am: 6 replicas at $44,000 against 62 real sales at $14,275 (under 10); Formula: 1 replica at $96,000 against 23 real sales at $14,250 (under 10); GTA: 1 replica at $64,000 against 38 real sales at $15,950 (under 10).

**10. Sales with the variant unstated:** 18 sales, median $11,300 (middle half $6,375 to $16,313).

## Chevrolet Camaro, 1982 to 1992

- Sales read 350; counted 310; set aside by the engine: 1 replica or tribute named in the title, 3 more flagged replica, tribute or recreation by the engine's project flag (see item 9), 36 other (2 project or incomplete car, 3 modified or non-stock, 25 substantially modified, 1 part or automobilia, 2 project or incomplete car, 3 race car).

| Variant | Sales | Median | Middle half | Lowest | Highest | Median miles (n) | Under 30,000 mi | Last 12 months vs the 12 before |
|---|---|---|---|---|---|---|---|---|
| Berlinetta * | 4 | $10,750 | $8,875 to $15,625 | $8,500 | $25,000 | 33,000 (3) | 33% (1 of 3) | not shown (0 and 1 sales) |
| IROC-Z | 161 | $24,800 | $16,500 to $34,000 | $5,000 | $128,787 | 26,000 (125) | 54% (67 of 125) | $23,375 (36) vs $19,250 (34) |
| Z28 | 103 | $16,250 | $12,775 to $23,625 | $5,600 | $65,000 | 34,000 (85) | 46% (39 of 85) | $15,000 (31) vs $16,000 (19) |
| RS | 28 | $10,750 | $8,375 to $16,213 | $5,500 | $29,000 | 48,000 (23) | 26% (6 of 23) | not shown (7 and 8 sales) |
| Unstated | 14 | $8,625 | $5,613 to $12,250 | $4,000 | $15,394 | 37,000 (11) | 36% (4 of 11) | not shown (3 and 1 sales) |

(* under 10 sales.) Venue note: the sales are mostly Bring a Trailer.

**Top sale of each variant, facts only** (colour and gearbox not available, see the top of this file):

| Variant | Price | Sold | Venue | Model year | Mileage |
|---|---|---|---|---|---|
| Berlinetta | $25,000 | Jan 2022 | barrettjackson | 1983 | not stated |
| IROC-Z | $128,787 | Nov 2026 | bringatrailer | 1987 | 105 |
| Z28 | $65,000 | Jan 2025 | barrettjackson | 1982 | not stated |
| RS | $29,000 | May 2025 | autohunter | 1991 | 2,408 |
| Unstated | $15,394 | Feb 2024 | acc | 1984 | 18,181 |

**7. Highest variant median against the lowest** (variants with 8 or more sales): IROC-Z ($24,800, 161 sales) over RS ($10,750, 28 sales) is **2.31 times**.

**Widest gap against mileage** (IROC-Z over RS; whole gap $14,050, 2.31 times): under 30,000 miles 67 against 6 sales, $28,500 against $16,225, gap $12,275 (87% of the whole), 1.76 times (under 10 sales in a cell); 30,000 to 80,000 miles 49 against 10 sales, $18,350 against $10,500, gap $7,850 (56% of the whole), 1.75 times; over 80,000 miles 9 against 7 sales, $14,000 against $7,100, gap $6,900 (49% of the whole), 1.97 times (under 10 sales in a cell).

**9. Replicas and tributes set aside:** 1 named in the title (the engine's "memorabilia or replica"), median $16,000. Against the variant each copies: RS: 1 replica at $16,000 against 28 real sales at $10,750 (under 10).

**10. Sales with the variant unstated:** 14 sales, median $8,625 (middle half $5,613 to $12,250).

## Ford Mustang, 1979 to 1993

- Sales read 807; counted 644; set aside by the engine: 1 replica or tribute named in the title, 17 more flagged replica, tribute or recreation by the engine's project flag (see item 9), 145 other (121 substantially modified, 5 project or incomplete car, 3 below the $2,500 car floor, 8 race car, 2 project or incomplete car, 3 modified or non-stock, 1 prototype, 1 no photo, 1 project or incomplete car).

| Variant | Sales | Median | Middle half | Lowest | Highest | Median miles (n) | Under 30,000 mi | Last 12 months vs the 12 before |
|---|---|---|---|---|---|---|---|---|
| Saleen | 29 | $41,286 | $35,750 to $49,250 | $22,000 | $79,500 | 34,000 (28) | 39% (11 of 28) | not shown (4 and 5 sales) |
| SVO | 26 | $14,300 | $9,125 to $16,938 | $5,600 | $26,000 | 38,000 (21) | 38% (8 of 21) | not shown (6 and 4 sales) |
| Cobra | 79 | $59,500 | $45,126 to $71,250 | $11,000 | $211,000 | 18,000 (73) | 66% (48 of 73) | $64,000 (22) vs $74,000 (14) |
| GT | 259 | $17,500 | $12,825 to $24,750 | $4,600 | $54,000 | 37,381 (232) | 37% (86 of 232) | $20,125 (78) vs $16,125 (44) |
| LX | 196 | $17,625 | $13,013 to $26,063 | $3,000 | $80,000 | 39,000 (177) | 41% (72 of 177) | $17,250 (58) vs $18,000 (51) |
| Unstated | 55 | $13,333 | $8,500 to $24,050 | $3,100 | $100,000 | 39,500 (42) | 41% (17 of 42) | $15,750 (14) vs $25,500 (13) |

(* under 10 sales.) Venue note: the sales are mostly Bring a Trailer.

**Top sale of each variant, facts only** (colour and gearbox not available, see the top of this file):

| Variant | Price | Sold | Venue | Model year | Mileage |
|---|---|---|---|---|---|
| Saleen | $79,500 | Jun 2022 | bringatrailer | 1990 | 11,000 |
| SVO | $26,000 | Dec 2022 | bringatrailer | 1985 | 28,000 |
| Cobra | $211,000 | Jan 2024 | bringatrailer | 1993 | 66 |
| GT | $54,000 | Dec 2025 | bringatrailer | 1993 | 454 |
| LX | $80,000 | Jul 2025 | bringatrailer | 1990 | 1,900 |
| Unstated | $100,000 | Mar 2025 | bringatrailer | 1991 | 203 |

**7. Highest variant median against the lowest** (variants with 8 or more sales): Cobra ($59,500, 79 sales) over SVO ($14,300, 26 sales) is **4.16 times**.

**Widest gap against mileage** (Cobra over SVO; whole gap $45,200, 4.16 times): under 30,000 miles 48 against 8 sales, $64,750 against $18,500, gap $46,250 (102% of the whole), 3.50 times (under 10 sales in a cell); 30,000 to 80,000 miles 23 against 11 sales, $43,801 against $14,000, gap $29,801 (66% of the whole), 3.13 times; over 80,000 miles 2 against 2 sales, $37,125 against $7,598, gap $29,527 (65% of the whole), 4.89 times (under 10 sales in a cell).

**9. Replicas and tributes set aside:** 1 named in the title (the engine's "memorabilia or replica"), median $37,500. Against the variant each copies: Unstated: 1 replica at $37,500 against 55 real sales at $13,333 (under 10).

**10. Sales with the variant unstated:** 55 sales, median $13,333 (middle half $8,500 to $24,050).

## Chevrolet Corvette, 1984 to 1996

- Sales read 1430; counted 1314; set aside by the engine: 7 replica or tribute named in the title, 3 more flagged replica, tribute or recreation by the engine's project flag (see item 9), 106 other (72 substantially modified, 5 project or incomplete car, 5 project or incomplete car, 6 modified or non-stock, 6 race car, 10 no photo, 1 project or incomplete car, 1 prototype).

| Variant | Sales | Median | Middle half | Lowest | Highest | Median miles (n) | Under 30,000 mi | Last 12 months vs the 12 before |
|---|---|---|---|---|---|---|---|---|
| ZR-1 | 280 | $35,000 | $26,250 to $46,000 | $11,000 | $105,000 | 16,000 (246) | 71% (174 of 246) | $35,000 (62) vs $35,000 (69) |
| Grand Sport | 48 | $38,250 | $32,688 to $43,904 | $16,850 | $88,500 | 12,000 (41) | 88% (36 of 41) | $35,250 (12) vs $40,126 (12) |
| Collector Edition | 64 | $17,150 | $13,788 to $22,000 | $7,600 | $38,500 | 33,000 (59) | 42% (25 of 59) | $16,750 (19) vs $18,249 (17) |
| Unstated | 922 | $13,500 | $9,677 to $18,000 | $3,400 | $800,000 | 32,000 (805) | 47% (377 of 805) | $11,004 (204) vs $12,000 (213) |

(* under 10 sales.) Venue note: the sales are mostly Bring a Trailer.

**Top sale of each variant, facts only** (colour and gearbox not available, see the top of this file):

| Variant | Price | Sold | Venue | Model year | Mileage |
|---|---|---|---|---|---|
| ZR-1 | $105,000 | Oct 2024 | barrettjackson | 1993 | not stated |
| Grand Sport | $88,500 | May 2026 | bringatrailer | 1996 | 52 |
| Collector Edition | $38,500 | Apr 2026 | bringatrailer | 1996 | 5,000 |
| Unstated | $800,000 | Apr 2022 | barrettjackson | 1986 | not stated |

**7. Highest variant median against the lowest** (variants with 8 or more sales): Grand Sport ($38,250, 48 sales) over Collector Edition ($17,150, 64 sales) is **2.23 times**.

**Widest gap against mileage** (Grand Sport over Collector Edition; whole gap $21,100, 2.23 times): under 30,000 miles 36 against 25 sales, $39,998 against $22,000, gap $17,998 (85% of the whole), 1.82 times; 30,000 to 80,000 miles 3 against 28 sales, $29,000 against $15,126, gap $13,874 (66% of the whole), 1.92 times (under 10 sales in a cell); over 80,000 miles 2 against 6 sales, $22,925 against $10,400, gap $12,525 (59% of the whole), 2.20 times (under 10 sales in a cell).

**9. Replicas and tributes set aside:** 7 named in the title (the engine's "memorabilia or replica"), median $62,000. Against the variant each copies: Unstated: 7 replicas at $62,000 against 922 real sales at $13,500 (under 10).

**10. Sales with the variant unstated:** 922 sales, median $13,500 (middle half $9,677 to $18,000).

## 8. Variants that sell above one the public would rank higher

"Public rank" below is my stated assumption (original price and badge), not a data field. Medians are from the tables above; every band cell shows its sales.

| Pair | Whole window | Under 30,000 mi | 30,000 to 80,000 mi | Over 80,000 mi | Holds inside the bands? |
|---|---|---|---|---|---|
| Mustang LX above GT | LX $17,625 (196) over GT $17,500 (259): 0.7 percent, no real gap | GT $23,875 (86) over LX $22,875 (72) | LX $17,250 (81) over GT $16,500 (121) | LX $16,125 (24) over GT $12,850 (25) | No. It flips twice. There is no LX over GT premium, only a tie. |
| Mustang GT and LX above SVO | SVO $14,300 (26) under GT $17,500 and LX $17,625 | SVO $18,500 (8) under GT $23,875 (86), LX $22,875 (72) | SVO $14,000 (11) under GT $16,500 (121), LX $17,250 (81) | SVO 2 sales, not comparable | Yes in the two bands that have sales, but the SVO cells are 8 and 11 sales, so it rests on thin cells. |
| Corvette Grand Sport above ZR-1 | Grand Sport $38,250 (48) over ZR-1 $35,000 (280): 9 percent | $39,998 (36) against $39,463 (174): 1 percent | 3 Grand Sport sales, not comparable | 2 Grand Sport sales, not comparable | Gap almost gone where it can be compared. Mostly mileage: Grand Sport sales are 88 percent under 30,000 miles (36 of 41 with a mileage), ZR-1 71 percent (174 of 246). |
| Firebird GTA above Trans Am (expected order, shown for the band test) | GTA $15,950 (38) over Trans Am $14,275 (62): 12 percent | GTA $24,125 (10) over $17,500 (21) | Trans Am $13,914 (24) over GTA $12,750 (17) | 5 and 9 sales | The GTA premium lives in the low mileage cars (10 sales); with 30,000 to 80,000 miles the Trans Am is ahead. |
| Firebird Formula against Trans Am | Formula $14,250 (23), Trans Am $14,275 (62): tie | $16,500 (10) against $17,500 (21) | $13,875 (10) against $13,914 (24) | Formula 2 sales | A tie in every band. |
| Camaro IROC-Z above Z28 (the IROC-Z is a Z28 package) | IROC-Z $24,800 (161) over Z28 $16,250 (103): 1.53 times | $28,500 (67) over $23,750 (39) | $18,350 (49) over $14,100 (35) | $14,000 (9) over $10,000 (11) | Yes in every band, about half the gap remains (56, 50 and 47 percent of the $8,550 whole gap). The over 80,000 cell is thin. |

## The five findings a collector would most likely find surprising

1. **Fake KITT Firebirds sell for more than real Trans Ams:** the 11 Firebirds the engine sets aside as replicas or tributes (6 of them Trans Am KITT tributes) have a median of $50,000, against $14,275 for 62 real Trans Ams, 3.5 times. (The 6 Trans Am tributes alone: $44,000, which is under 10 sales.)
2. **The Mustang SVO, the rare turbocharged one, sells below the ordinary GT and LX:** $14,300 (26 sales) against $17,500 (259) and $17,625 (196), and it stays below in both bands that have SVO sales ($18,500 on 8 sales under 30,000 miles, $14,000 on 11 sales between 30,000 and 80,000), so the band figures rest on fewer than 10 and 11 sales.
3. **A Fox Mustang LX sells for the same as a GT:** $17,625 (196 sales) against $17,500 (259), and inside the mileage bands the lead changes hands (GT ahead by 4 percent under 30,000 miles on 86 and 72 sales, LX ahead by 5 percent from 30,000 to 80,000 on 81 and 121 sales, LX ahead by 25 percent over 80,000 on 24 and 25 sales).
4. **The ZR-1 Corvette and the rarer 1996 Grand Sport sell almost the same:** $35,000 (280 sales) against $38,250 (48), and for cars under 30,000 miles it is $39,463 (174) against $39,998 (36); the ZR-1's median did not move in a year ($35,000 on 62 sales against $35,000 on 69).
5. **The Fox Mustang Cobra and the GT are going opposite ways:** the Cobra's median fell from $74,000 (14 sales) to $64,000 (22) over the last year while the GT's rose from $16,125 (44) to $20,125 (78), and the Cobra is still 3.4 times the GT ($59,500 on 79 sales against $17,500 on 259), 2.7 times for cars under 30,000 miles ($64,750 on 48 against $23,875 on 86), so the Cobra's lead is not a mileage effect.

Numbers resting on fewer than 10 sales: the six Trans Am tributes in finding 1, the SVO band figures in finding 2 (8 and 11 sales), every cell marked "under 10" above, every variant with a star in the tables, and any band cell showing fewer than 10 in item 8.

## Other things the pull showed

- **Mileage is not the story for the widest gaps** except where noted: the Cobra over the SVO is 4.16 times overall and still about 3.5 times under 30,000 miles ($64,750 on 48 against $18,500 on 8) and 3.1 times from 30,000 to 80,000 ($43,801 on 23 against $14,000 on 11). The 20th Anniversary Turbo Trans Am over the Formula (3.17 times) is 3.0 times under 30,000 miles (27 against 10 sales). The IROC-Z over the RS (2.31 times) is about 1.75 to 1.97 times inside every band (67 against 6, 49 against 10, 9 against 7). The Grand Sport over the Collector Edition (2.23 times) is 1.82 times under 30,000 miles (36 against 25) and cannot be compared above that (3 and 2 Grand Sport sales).
- **What looks wrong in the archive or the engine, for Lane B:** (a) the engine's project flag marks 17 Mustang sales as replica, tribute or recreation whose titles read as plain Saleen SSC (6) and LX cars (7, some "SSP" police specification); I read no listing text, so I cannot say the flag is wrong, but the titles look like real cars. With them counted the Saleen median is $44,500 on 35 sales instead of $41,286 on 29. (b) 922 of the 1,314 counted C4 Corvettes (70 percent) name no variant, because the list holds only ZR-1, Grand Sport and Collector Edition; the base car, the Z51 and the convertible are not separated. Two Barrett-Jackson sales in that unstated group ($800,000 in April 2022 and $481,818 in January 2025) pass the engine's read and are the two highest prices in the pull. (c) poolrows reads the gearbox from raw_record and finds none on any of the 2,792 rows. (d) The engine counted a model year of 105 miles as the highest Camaro sale ($128,787, a 1987 IROC-Z, November 2026, 105 miles): kept, it does not move a median.
- Basis: the engine's hammer figure in US dollars, the engine's own set asides, variants read by its own reader. Nothing here is a valuation: these are the medians and spreads of the recorded sales in the window.

Search check: no public page touched.
