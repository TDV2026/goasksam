# Firebird story, stress test of two claims (Lane F, Nov 17 2026)

**Read only. No production read this time: everything is computed from the 205 sold rows already held from the pull behind firebird-kitt.md (ecb9088d). Branch lane-f-firebird-kitt. Nothing pushed. No seller name and no listing text.** Sold window 2021-11-17 to 2026-11-16, so "2021" below is only the last six weeks of that year. Groups are the engine's verdicts as before (KITT replica = the engine's replica flag; the others its variant reader, cars the engine lets into a pool). Prices are the engine's hammer figure in US dollars. A middle half is shown only where a year or period has 5 or more sales.

**The rule used for calling a trend:** both periods need at least 10 sales, and the later median must sit outside the middle half of the earlier period AND the earlier median outside the middle half of the later one. Anything less is "cannot say".

## Part 1. Trend

### By calendar year: sales, median (middle half)

| Group | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (to Nov 16) |
|---|---|---|---|---|---|---|
| KITT replica | 0 | 1, $31,500 | 0 | 3, $50,000 | 2, $51,000 | 5, $65,000 ($56,000 to $67,310) |
| 20th Anniversary Turbo Trans Am | 0 | 7, $61,000 ($52,125 to $70,250) | 6, $48,125 ($44,188 to $55,250) | 7, $38,250 ($29,640 to $51,625) | 10, $65,750 ($41,438 to $82,375) | 6, $39,501 ($34,188 to $42,188) |
| GTA | 0 | 8, $11,500 ($9,875 to $18,519) | 7, $13,500 ($12,375 to $21,650) | 7, $11,250 ($10,750 to $22,750) | 7, $24,000 ($14,300 to $24,725) | 9, $24,000 ($13,833 to $26,000) |
| Trans Am | 1, $23,750 | 7, $15,750 ($11,500 to $16,625) | 18, $12,500 ($9,604 to $15,625) | 8, $15,851 ($14,763 to $17,744) | 13, $14,077 ($9,000 to $22,250) | 15, $14,250 ($10,375 to $20,500) |

Every year of KITT has under 5 sales except 2026 (exactly 5), so no KITT year but 2026 has a middle half.

### By period: sales, median (middle half)

| Group | 2021 to 2023 | 2024 to 2026 | Last 12 months (2025-11-17 to 2026-11-16) | Call |
|---|---|---|---|---|
| KITT replica | 1, $31,500 | 10, $53,000 ($41,000 to $64,750) | 5, $65,000 ($56,000 to $67,310) | **Cannot say** |
| 20th Anniversary Turbo Trans Am | 13, $57,000 ($45,250 to $67,000) | 23, $42,000 ($35,891 to $62,000) | 8, $42,125 ($36,063 to $54,037) | **Cannot say** (lower, not called) |
| GTA | 15, $13,500 ($10,125 to $18,763) | 23, $20,500 ($11,125 to $25,100) | 11, $24,000 ($14,217 to $25,500) | **Cannot say** (higher, not called) |
| Trans Am | 26, $13,000 ($11,104 to $16,188) | 36, $14,750 ($11,063 to $20,675) | 17, $14,400 ($11,750 to $25,000) | **Flat** |

- **KITT: cannot say.** The 2021 to 2023 period has one sale. The only comparison is last 12 months against the 12 before, 5 sales at $65,000 against 2 at $51,000. Neither period has 10 sales.
- **20th Anniversary Turbo Trans Am: cannot say.** The 2024 to 2026 median ($42,000) is below the earlier middle half ($45,250 to $67,000), but the earlier median ($57,000) sits inside the later middle half ($35,891 to $62,000), so the two periods overlap. Year medians swing by up to $27,000 between neighbouring years ($65,750 in 2025, $39,501 in 2026, on 10 and 6 sales), which is the size of the noise here. Last 12 months ($42,125, 8) against the 12 before ($41,625, 10) is flat.
- **GTA: cannot say.** The 2024 to 2026 median ($20,500) is above the earlier middle half's top ($18,763), but the earlier median ($13,500) sits inside the later middle half ($11,125 to $25,100). What the years show is a step, not a drift: 2022 to 2024 at $11,250 to $13,500, then 2025 and 2026 both at $24,000 (7 and 9 sales). The mix changed too: cars sold with a reserve were 7 of 22 in 2022 to 2024 and 9 of 16 in 2025 to 2026, and the median mileage fell from 52,500 to 42,900. So the step may be the cars, not the market.
- **Trans Am: flat.** $13,000 (26) against $14,750 (36): the difference is $1,750 and each median sits inside the other period's middle half; the last 12 months is $14,400 (17).

## Part 2. Reserve against venue

**Mapping.** Online: Bring a Trailer, Cars & Bids, PCARMarket, Hemmings, Hagerty, Collecting Cars, Car & Classic, ACC, AutoHunter, MB Market, Sotheby's Motorsport, The Market, PistonHeads. Live: Barrett-Jackson, Mecum, RM Sotheby's, Gooding, Bonhams, Broad Arrow. KITT sold at Bring a Trailer and Car & Classic (online) and Barrett-Jackson (live). GTA sold at Bring a Trailer, Cars & Bids, ACC, Hagerty, AutoHunter and PCARMarket (online) and Barrett-Jackson (live).

| Cell | Sales | Median price | Median miles (n) | Median model year | Price range |
|---|---|---|---|---|---|
| **KITT** online, reserve | 7 | $64,000 | 45,000 (5) | 1984 | $18,250 to $96,000 |
| KITT online, no reserve | 1 | $31,500 | 71,000 (1) | 1992 | one sale |
| KITT live, reserve | 0 | none | none | none | none |
| KITT live, no reserve | 3 | $38,000 | none stated (0) | 1983 | $10,000 to $50,000 |
| KITT reserve unknown | 0 | none | none | none | none |
| **GTA** online, reserve | 16 | $22,250 | 17,000 (15) | 1988 | $7,500 to $42,000 |
| GTA online, no reserve | 17 | $11,250 | 56,000 (17) | 1988 | $4,900 to $24,250 |
| GTA live, reserve | 0 | none | none | none | none |
| GTA live, no reserve | 5 | $25,000 | none stated (0) | 1987 | $9,500 to $27,000 |
| GTA reserve unknown | 0 | none | none | none | none |

**Every live sale of both cars was a no reserve sale** (Barrett-Jackson sold nothing with a reserve in this family), so venue type and reserve status cannot be pulled apart for live.

- **Inside online alone:** KITT reserve $64,000 (7) against no reserve $31,500 (**1 sale: cannot say**). GTA reserve $22,250 (16) against no reserve $11,250 (17): the reserve premium appears, 2.0 times, **but the reserve cars are much lower mileage (17,000 against 56,000 miles) with the same model year (1988).** Inside mileage bands, GTA online: under 30,000 miles reserve $24,000 (9) against no reserve $24,250 (**1**: no comparison); 30,000 to 80,000 miles $16,542 (4) against $11,250 (13), 1.5 times; over 80,000 miles $8,750 (2) against $11,000 (3), no premium (both under 5). So the 2.0 times mostly goes once mileage is held, and what remains rests on 4 reserve cars.
- **Inside live alone:** there is no reserve cell to compare. Live no reserve is KITT $38,000 (3) and GTA $25,000 (5), and live no reserve GTA at $25,000 is above online no reserve at $11,250: the no reserve sales are not cheap by being no reserve.

### The KITT questions, counts only

- **Do the top prices sit on one platform?** Mostly one. The five highest ($96,000, $67,310, $65,000, $64,000, $56,000) are all online and all with a reserve: four on Bring a Trailer, one on Car & Classic. Of the seven at or above $50,000: 5 Bring a Trailer, 1 Car & Classic, 1 Barrett-Jackson ($50,000). Bring a Trailer also holds 7 of the 11 sales, so it holds most of everything.
- **Do the cheapest sit at live auctions?** The cheapest ($10,000) is Barrett-Jackson, and 2 of the 4 cheapest are Barrett-Jackson ($10,000, $38,000) against 2 on Bring a Trailer ($18,250, $31,500). All 3 live sales are at or below the KITT median of $50,000.
- **What lines up best with price?** Reserve status: the 7 reserve cars out of 11 had a higher price than the no reserve cars in 24.5 of the 28 reserve against no reserve pairs (88 percent). Venue type: online above live in 19.5 of 24 pairs (81 percent). Those two are nearly the same split (all 7 reserve sales were online; 3 of the 4 no reserve sales were live), so the data cannot say which one matters. Mileage does not line up: on the 6 cars with a mileage, the three cars at or under 58,000 miles were not dearer than the three above (2 of 9 pairs, 22 percent), the wrong way round for a mileage story. Model year does not line up either (4 cars from 1987 on at $47,750 against 7 older at $50,000, 50 percent). No regression: 11 cars.
- **Dropping the single highest ($96,000) and lowest ($10,000) KITT sale:** reserve against no reserve before: $64,000 (7) against $34,750 (4); after: $60,000 (6) against $38,000 (3). The gap narrows from 1.84 times to 1.58 times and does not disappear. KITT median before and after: $50,000 and $50,000 (9 cars).

## Part 3. Three robustness checks

| Check | All 11 KITT sales | Highest and lowest dropped (9) |
|---|---|---|
| KITT median against the Trans Am median ($14,275, 62 sales) | $50,000, 3.5 times | $50,000, 3.5 times |
| KITT sales above the Trans Am median ($14,275) | 10 of 11 (91 percent) | 9 of 9 |
| KITT sales above the 20th Anniversary Turbo Trans Am median ($45,150, 36 sales) | 7 of 11 (64 percent) | 6 of 9 (67 percent) |

For scale: the top of the Trans Am middle half is $17,875, and 10 of the 11 KITT sales are above it too.

## Part 4. The four answers

**1. Is the KITT premium real?** Over the ordinary Trans Am, yes, on the counts we have: 10 of 11 KITT replica sales are above the real Trans Am median of $14,275 (62 sales), and the replica median is $50,000, 3.5 times, which is unchanged after dropping the highest and lowest sale (9 of 9 above). It does not extend to the rarest real Firebird: against the $45,150 Turbo Trans Am median only 7 of 11 (6 of 9) are above. The finding rests on 11 cars, 6 of them with a stated mileage, from 3 venues.

**2. Are KITT prices rising?** Cannot say. 2021 to 2023 holds one KITT sale, so there is nothing to compare 2024 to 2026 ($53,000, 10 sales) against. Last 12 months is $65,000 on 5 sales against $51,000 on 2 sales before. The 2026 year looks higher ($65,000 on 5 sales against $44,000 on 6 sales for 2022 to 2025), but a reshuffle test gives a gap that large in 24 percent of draws. None of the four groups meets the rule for a trend, and the one the numbers lean towards, GTA, rose in a step in 2025 that coincides with more reserve sales and lower mileage cars.

**3. Does reserve itself appear to matter, or is venue or car quality the better explanation?** Neither sentence is established. "A reserve nearly doubles the median" is not supported as a statement about reserves: the GTA online reserve premium is 2.0 times ($22,250 on 16 against $11,250 on 17), but those reserve cars have a median of 17,000 miles against 56,000, and with mileage held the premium is 1.5 times on 4 reserve cars in the 30,000 to 80,000 band and nothing in the others (1 and 5 cars). For KITT, reserve is 64,000 against $34,750 and does not vanish when the highest and lowest sale are dropped ($60,000 against $38,000), but every one of the 7 reserve sales was online and 3 of the 4 no reserve sales were Barrett-Jackson, so reserve and venue are the same split and 11 cars cannot separate them. "The best replicas sell online with reserves while the weak ones appear elsewhere" fits the KITT counts better than a reserve effect (the 3 live sales are $10,000, $38,000 and $50,000), but two weak sales are also online ($18,250 with a reserve, $31,500 without), so it is a lean, not a finding. For the GTA the data supports car quality (mileage) over reserve.

**4. The single most surprising statistic that is also defensible, for the newsletter image.** "Ten of the eleven Knight Rider replicas sold for more than the typical real Trans Am: the replica median is $50,000, against $14,275 for 62 real Trans Ams, 3.5 times, and it stays $50,000 after the highest and lowest sale are removed." Rests on 11 cars (9 after dropping the extremes): not under 10 in the headline form, but small, and it says nothing about why they sell high.

Search check: no public page touched.
