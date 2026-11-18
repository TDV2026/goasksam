# For sale cars with a VIN we have seen before (Lane F, Nov 18 2026)

Read only. Counts only: no VIN, no seller name and no listing text is in this file. Nothing was written to production. Method in one line: every active US listing of 18 classifieds sources was read from the vendor's classifieds endpoint, kept in a scratch file outside the repo (since deleted), and its normalized VIN was matched against our sold archive and our unsold attempts through the new ops task vinoverlap (live on main, a14bb8ad), 17 calls of 2,000 VINs, one at a time. Asking prices were joined in process.

## THE NUMBER

**1,760 cars for sale right now have a VIN we have seen sold or offered at auction before. That is 3.7 percent of the 47,985 distinct VINs on the for sale side, and 5.2 percent of the 33,537 we could look up.**

- 1,395 were sold in our archive (2.9 percent of all VINs), 431 had an unsold attempt (0.9 percent), 66 had both.
- Why two shares: 14,448 of the 47,985 VINs were too short to look up (see "VINs too short" below), so 3.7 percent understates the share of cars that can be matched at all.

## The set (item 1)

US listings: country_code US and currency USD (Sam's set rule), status active, last_seen_at in the 24 hours before the pull began (Nov 18 2026, about 19:10 UTC), excluding gatewayclassiccars, lowmilesnomiles and carandclassic.

| | count |
|---|---:|
| Listings | **76,690** |
| Listings with a VIN | **69,130** |
| Listings with no VIN | 7,560 |
| Distinct VINs | **47,985** |
| of which looked up (11 to 32 characters) | 33,537 (25,683 of 17 characters, 7,854 of 11 to 16) |
| of which too short to look up | 14,448 |

The listings are far fewer cars than listings: 9,672 of the 33,537 lookable VINs (29 percent) are listed on two or more sources (autotraderclassics and classiccars carry many of the same dealer cars), so everything below counts cars (distinct VINs), not listings.

Listings by source: autotraderclassics 34,835; classiccars 28,818; dupontregistry 8,978; streetside 1,485; classicautomall 699; grautogallery 590; barnfinds 561; fusionmotorco 126; autobarnclassiccars 122; vanguardmotorsales 107; ellingsonmotorcars 89 (no VIN on any); rkmotors 73; pjsautoworld 59; restoreamusclecar 41; supersportclassics 41; driversource 40; gpmotorsports 21; gaudinclassic 5 (no VIN on any). Seller type: dealer 72,179, private 3,942, none 569.

### VINs too short to look up

14,448 distinct VINs (23,515 listings) were not looked up, by the task's own rule (a chassis number under 11 characters repeats across makes and years, so matching it would join two different cars). 20,129 of those listings are model year before 1981 (chassis numbers); 3,386 are 1981 or later (stock numbers or partial VINs). One listing had an id over 32 characters. Another 7,560 listings carry no VIN at all. By source the short ones are mostly autotraderclassics (11,686 listings) and classiccars (10,126). So for roughly 1 car in 3 on the for sale side this question cannot be answered with the archive as it stands.

## Item 2: distinct VINs with a history, by source and by dealer against classified

A car listed on two sources counts once in each source row, so the source rows add to more than 1,760.

| Source | VINs | looked up | sold | attempt | **either** | share of looked up |
|---|---:|---:|---:|---:|---:|---:|
| autotraderclassics | 31,212 | 19,595 | 986 | 296 | **1,235** | 6.3% |
| classiccars | 24,700 | 14,818 | 685 | 204 | **854** | 5.8% |
| dupontregistry | 8,961 | 8,259 | 304 | 104 | **397** | 4.8% |
| streetside | 1,485 | 1,124 | 33 | 16 | 47 | 4.2% |
| grautogallery | 581 | 478 | 21 | 4 | 24 | 5.0% |
| classicautomall | 686 | 414 | 9 | 3 | 12 | 2.9% (under 10 sold) |
| barnfinds | 294 | 175 | 5 | 0 | 5 | 2.9% (under 10) |
| fusionmotorco | 126 | 119 | 5 | 2 | 6 | 5.0% (under 10) |
| vanguardmotorsales | 107 | 97 | 10 | 4 | 12 | 12.4% |
| rkmotors | 72 | 54 | 3 | 1 | 4 | 7.4% (under 10) |
| autobarnclassiccars | 116 | 52 | 1 | 1 | 2 | under 10 |
| pjsautoworld | 59 | 47 | 3 | 4 | 7 | under 10 |
| restoreamusclecar | 41 | 41 | 3 | 0 | 3 | under 10 |
| supersportclassics | 41 | 39 | 0 | 0 | 0 | under 10 |
| driversource | 40 | 24 | 7 | 1 | 8 | under 10 |
| gpmotorsports | 21 | 19 | 2 | 0 | 2 | under 10 |

Dealer against classified. I took "dealer" as seller_type dealer, and "classified" as private or no seller type (the vendor's own field; it is the only dealer against private marker it gives, and a car with any dealer listing counts as dealer in the car level steps below).

| | VINs | looked up | sold | attempt | either | share |
|---|---:|---:|---:|---:|---:|---:|
| dealer | 46,880 | 32,714 | 1,376 | 411 | **1,724** | 5.3% |
| classified (private or none) | 1,120 | 833 | 19 | 21 | **37** | 4.4% |

(46,880 plus 1,120 is 48,000, 15 more than 47,985: a car listed once by a dealer and once privately sits in both rows.)

## Item 3: the cars with a prior sale (1,395)

Sold once **1,254**, twice **118**, three times or more **23**.

Time since the last sale (to the pull date):

| band | cars |
|---|---:|
| under 6 months | 379 |
| 6 to 12 months | 272 |
| 1 to 2 years | 231 |
| 2 to 3 years | 170 |
| over 3 years | 343 |

169 were last sold within 90 days (167 of them now at a dealer).

## Item 4: asking price against the car's own last sale

Per car. A car on several listings uses the median of its asking prices. The last sale is the archive's USD hammer (buyer's premium backed out, same basis as the engine); the asking price is the vendor's current asking price. **Not like for like by a few points**: a hammer is below the all in price the buyer paid, so some of every gap below is the auction's fee, not the dealer's margin. Cars with no asking price (137) are left out; every priced car has an asking price and a last sale of at least $1,000, so nothing else was dropped.

**1,258 cars. Median ratio asking to last sale: 1.37.**

| asking against the last sale | cars | share |
|---|---:|---:|
| below the last sale | 84 | 6.7% |
| up to 10 percent above | 84 | 6.7% |
| 10 to 25 percent above | 286 | 22.7% |
| 25 to 50 percent above | 334 | 26.6% |
| over 50 percent above | 470 | 37.4% |

Dealer cars (1,239): median 1.373. Classified (private or none) (19): median 1.358.

**Bought at auction and now at a dealer within 12 months:** 578 cars (last sale under 12 months before the pull, with a dealer listing, a price on both ends). Our archive holds auction results only, so every last sale is an auction sale. **Median markup 35.7 percent, a median gap of $13,949.** 26 of the 578 (4.5 percent) are asking below the auction price; 42 up to 10 percent above; 141 10 to 25; 173 25 to 50; 196 over 50.

## Item 5: asking price against a failed high bid

431 cars have a failed latest attempt (429 reserve not met, 2 withdrawn); 365 of them have no sale on record. 391 have both an asking price and a high bid of at least $1,000 (38 have no asking price, 2 no high bid). 371 of the 391 are on a dealer listing. All 391 are reserve not met.

**Median ratio asking to the high bid it did not sell at: 1.50.**

| asking against the high bid | cars |
|---|---:|
| below the high bid | 3 |
| up to 10 percent above | 21 |
| 10 to 25 percent above | 62 |
| 25 to 50 percent above | 112 |
| over 50 percent above | 193 |

A high bid that missed the reserve is below the reserve by definition, so asking above it is expected; this is not a markup over what the car is worth.

## Item 6: the five most interesting patterns

1. **Dealers are asking far above what the car last sold for at auction: median 1.37 times (1,258 cars), only 84 (7 percent) asking less, 470 (37 percent) asking over 50 percent more, and 168 asking more than double.** Only 11 ask less than three quarters of the last sale. (Part of it is the auction fee that the hammer does not include.)
2. **The quick flip is common and carries a large markup: 578 cars sold at auction within the last year are now with a dealer, median markup 35.7 percent, $13,949 a car; 26 are asking below the price they sold for.** The markup is as large on a sale 2 years ago as on a sale 2 months ago (median ratio 1.358 for under 12 months, 585 cars; 1.374 for 12 to 24 months, 210 cars; 1.386 over 24 months, 463 cars), so the gap does not shrink with the age of the sale.
3. **A car that missed its reserve is asked 1.5 times the last bid: 391 cars, 388 asking above the bid, 193 asking over 50 percent more.** Only 3 ask less. Of the 431 cars with a failed attempt, 365 have never sold in our archive.
4. **The markup is about the same wherever the car is listed: autotraderclassics 1.37 (910 cars), classiccars 1.43 (630), dupontregistry 1.38 (251), streetside 1.38 (33), grautogallery 1.31 (21).** Private or no seller type: 1.36 (19 cars, small). Sources with under 10 cars (driversource 2 cars at 10.5 times, rkmotors 2, gpmotorsports 2, barnfinds 5, fusionmotorco 5, classicautomall 9, restoreamusclecar 3, autobarnclassiccars 1, pjsautoworld 3) are not read.
5. **Most cars with a history are repeat dealer stock, listed in several places: 560 of the 1,395 cars with a prior sale are on two or more sources, 141 sold twice or more (23 three or more times), and 389 (28 percent) last sold for $100,000 or more.** Private sellers hardly appear: 37 of 833 lookable private cars (4.4 percent) have any history, 19 with a prior sale.

## What to keep in mind

- **For sale now is the vendor's word.** The census found that autotraderclassics keeps stamping last_seen_at on cars that have gone (5 of 25 sampled active listings had gone). autotraderclassics is 34,835 of the 76,690 listings, and 1,235 of the 1,760 history cars, so the share of cars that are really for sale is probably lower than shown for that source. Not measured here.
- **Every active US row of the 18 sources was read to the end** (82,422 rows; 76,690 were seen in the last 24 hours at the start of the pull; the other 5,732 were not and are left out). A source the vendor has that I never found is not in these numbers (21 source keys were found in the census).
- **Short VINs are the biggest hole:** about one distinct VIN in three could not be looked up.
- Our archive's depth differs by source (Bring a Trailer and Cars and Bids are mostly recent years), so "not seen before" means not in our archive, not "never sold".

## What this cost

Vendor: about 1,035 requests of the monthly 10,000 (4,963 remained at the start; 200 of the 1,035 were a first pass that was abandoned for the per source one). Production: 17 POST calls to vinoverlap, one at a time, each 200 and 1.9 to 2.8 seconds; nothing written, no code changed, so the Class fix does not apply. VINs were held only in memory and in a scratch file outside the repo, which was deleted afterwards.

Search check: no public page touched.
