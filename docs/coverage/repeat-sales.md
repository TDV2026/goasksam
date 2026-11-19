# Repeat sales: duPont Live cars and the whole archive (Lane F, Nov 19 2026)

Read only. Counts and prices only: no VIN, no seller, no listing text in any file. Files beside this one: `repeat-sales-dupont.csv` (one line per duPont Live car, no VIN, cars numbered by date) and `repeat-sales-groups.csv` (every group table below). Zero vendor queries (the duPont rows were kept from the census). Production: the whole sold archive read through poolrows in dated slices (301,374 rows, every row of the archive; 1,618 calls, one at a time), 96 vinoverlap calls of 2,000 VINs, 4 vinverify calls. Nothing written. VINs were held in memory and in scratch files outside the repo, deleted afterwards.

## How a "repeat" is counted (read this first)

- A car is a distinct VIN of 11 to 32 characters (the engine's own rule). 211,073 of the 301,374 sold rows carry one (192,131 distinct VINs). The rest (pre-1981 chassis numbers, short stock numbers, no VIN) cannot be followed, so every number below is for cars with a usable VIN.
- An appearance is a sold result (price is the hammer, buyer's fee backed out as the archive stores it, USD) or a failed high bid. Two sold rows of one car within 7 days are one sale (the same lot on two feeds), and a failed attempt within 2 days of a sale is that sale.
- **Limit that matters:** the unsold side comes from vinoverlap, which returns only each car's last unsold attempt (sources with unsold data: five). So a car with three failed lots shows one, "appearances" is a lower bound, and the venue of a failed attempt is not known for the whole archive (it was looked up only for the 4 duPont cars that needed it). Venue pairs below are therefore sold then sold only.
- A pair is two consecutive appearances of one car. "Ratio" is the later result divided by the earlier (a sold price or a failed high bid), both at least $1,000. A failed bid is below its reserve by definition, so ratios that involve a failed bid are not a price change. Price bands use the earlier result.
- The archive's depth differs by venue (Bring a Trailer and Cars & Bids mostly 2023 on), so "first appearance" means first we hold.

## Part 1. duPont Live cars already in the archive from another venue

Of the 101 cars of the census: 82 have a priced result of at least $1,000 (the other 19 have only an unpriced or under $1,000 record), and 19 of those 82 have their only appearance after the duPont sale (sold elsewhere later). That leaves **63 cars with an earlier result**: 61 sold earlier, 2 failed earlier (both on Bring a Trailer, reserve not met). Each is in the csv.

| | cars | median ratio (duPont hammer over earlier result) | middle half | sold at duPont for less |
|---|---:|---:|---|---:|
| Sold then sold at duPont | 61 | **1.156** | 0.912 to 1.424 | **21** (34%) |
| Failed then sold at duPont (under 10 cars) | 2 | 1.271 | 1.141 to 1.402 | 0 |

By earlier venue (sold then sold; flag: under 10 cars):

| Earlier venue | cars | median | middle half | for less |
|---|---:|---:|---|---:|
| Bring a Trailer | 31 | 1.023 | 0.882 to 1.273 | 15 |
| Barrett-Jackson (under 10) | 7 | 1.043 | 0.921 to 1.320 | 3 |
| PCARMarket (under 10) | 7 | 1.400 | 1.287 to 1.551 | 0 |
| RM Sotheby's (under 10) | 6 | 1.389 | 1.017 to 1.694 | 2 |
| Broad Arrow (under 10) | 5 | 1.293 | 1.234 to 1.424 | 0 |
| Cars & Bids (under 10) | 2 | 1.265 | | 0 |
| Bonhams (under 10) | 2 | 1.318 | | 1 |
| Sotheby's Motorsport (under 10) | 1 | 1.383 | | 0 |

By months between (all 63; sold only in brackets):

| Months | cars | median | middle half | for less |
|---|---:|---:|---|---:|
| Under 6 | 15 (14) | 1.010 (1.002) | 0.938 to 1.108 | 7 |
| 6 to 12 | 10 (9, under 10) | 0.965 (0.906) | 0.889 to 1.473 | 5 |
| Over 12 | 38 | **1.295** | 1.053 to 1.551 | 9 |

By price band of the earlier result:

| Band | cars | median | middle half | for less |
|---|---:|---:|---|---:|
| Under $100k | 16 | **0.897** | 0.738 to 1.054 | 11 |
| $100k to $500k | 33 | 1.262 | 1.044 to 1.457 | 6 |
| Over $500k | 14 | 1.358 | 0.989 to 1.727 | 4 |

Plainly: a car that moved to duPont Live was usually sold for more than its last result (median 1.16), but the gain comes from cars that waited over a year and from the dearer cars; under $100k seven in ten sold for less. Bring a Trailer cars (31) are nearly flat (1.02). 34 percent (21 of 61) sold for less than they last made.

## Part 2. The whole archive

Cars with two or more appearances: **17,362 cars (9.0 percent of the 192,131 with a usable VIN), 36,678 appearances**. Consecutive pairs: 19,316. **Median time between: 11.6 months.** The second result beat the first in **41.9 percent** of pairs; the median ratio is **0.960** (middle half 0.815 to 1.122); 10,885 of 19,316 came in lower.

By earlier outcome:

| Earlier then later | pairs | median ratio | middle half | later beat earlier | median months |
|---|---:|---:|---|---:|---:|
| Sold then sold | 16,715 | 0.958 | 0.819 to 1.119 | 41.3% | 12.1 |
| Failed then sold | 1,248 | **1.104** | 1.009 to 1.247 | 76.6% | 1.6 |
| Sold then failed (the later is a failed bid) | 1,353 | 0.801 | 0.675 to 0.936 | 16.6% | 19.1 |

By months between (all pairs): under 3: 4,400 pairs, median 1.000, beat 47.7%. 3 to 6: 2,078, 0.986, 46.4%. 6 to 12: 3,527, 0.970, 43.6%. 12 to 24: 4,440, 0.927, 37.0%. 24 to 48: 3,983, 0.906, 35.6%. Over 48: 888, 0.988, 47.6%. (Full table with middle halves in the csv.)

By price band of the earlier result (all pairs): under $100k: 16,540 pairs, median 0.957, beat 41.5%. $100k to $500k: 2,534, 0.973, 43.0%. Over $500k: 242, 1.034, 53.3%. Sold then sold only: 0.955, 0.976, 1.036 (14,298, 2,197 and 220 pairs). Sold then failed over $500k is 12 pairs and failed then sold over $500k is 10 pairs (flag: borderline).

The ten most common venue pairs (sold then sold, earlier venue then later venue):

| Pair | pairs | median ratio | middle half | beat | median months |
|---|---:|---:|---|---:|---:|
| Bring a Trailer, Bring a Trailer | 7,956 | 0.942 | 0.818 to 1.066 | 36.1% | 12.3 |
| Barrett-Jackson, Barrett-Jackson | 1,486 | 0.921 | 0.747 to 1.153 | 38.0% | 12.2 |
| Cars & Bids, Cars & Bids | 1,344 | 0.915 | 0.784 to 1.033 | 31.3% | 11.9 |
| Cars & Bids, Bring a Trailer | 878 | 1.030 | 0.870 to 1.213 | 53.5% | 12.2 |
| Bring a Trailer, Cars & Bids | 643 | 0.925 | 0.795 to 1.077 | 36.2% | 9.9 |
| Bonhams, Bonhams | 512 | 0.963 | 0.829 to 1.091 | 41.0% | 3.4 |
| Barrett-Jackson, Bring a Trailer | 508 | 1.080 | 0.866 to 1.300 | 60.8% | 12.1 |
| Bring a Trailer, Barrett-Jackson | 301 | 0.975 | 0.795 to 1.250 | 46.2% | 10.3 |
| PCARMarket, Bring a Trailer | 258 | 1.110 | 0.964 to 1.360 | 69.0% | 19.9 |
| The Market, The Market | 163 | 0.865 | 0.758 to 1.009 | 27.0% | 13.1 |

**Moved venue against stayed on the same venue** (sold then sold): moved 4,575 pairs, median 1.033, beat 54.1%, median 13.3 months. Stayed 12,140 pairs, median 0.940, beat 36.5%, 12.0 months. Within the same month bands: under 6 months moved 1.057 (1,317) against stayed 0.957 (3,783); 6 to 12 months 1.035 (825) against 0.955 (2,380); over 12 months 1.016 (2,433) against 0.915 (5,977).

**Share of sales in the last 12 months (Nov 20 2025 to Nov 19 2026) that were a car's second or later time at auction:** of the 49,728 sales with a usable VIN, **6,266 (12.6 percent)**; of all 65,689 sold rows in the window, 9.5 percent. Of the 6,266, 5,266 followed an earlier sale and 1,000 followed only a failed bid.

## Part 3. The five most interesting findings

1. **A car resold at auction usually brings less the second time.** Of 16,715 sold-then-sold pairs the second sale beat the first only 41 percent of the time, median ratio 0.958, and the loss is steepest at 24 to 48 months (0.925, 38 percent beat). Part of it is fee basis and mix, not market.
2. **Changing venue is the one thing that goes with an uplift.** Cars that moved sold at a median 1.033 of their last sale (54 percent beat, 4,575 pairs); cars that stayed 0.940 (36.5 percent, 12,140). The strongest routes: Barrett-Jackson to Bring a Trailer 1.08 (508), PCARMarket to Bring a Trailer 1.11 (258), Cars & Bids to Bring a Trailer 1.03 (878); Bring a Trailer to Cars & Bids 0.925 (643). A pattern in the record, not a cause.
3. **A car that missed its reserve and came back sold higher in three cases of four.** 1,248 failed-then-sold pairs: 76.6 percent sold above the failed bid, median 1.104, after a median 1.6 months (1,122 of them under $100k). Going the other way, a failed bid after a sale was only 0.80 of that sale (1,353 cars, 17 percent above).
4. **duPont Live is a place cars go to be sold higher, if they waited.** 63 cars arrived with an earlier result: median 1.156, 21 of 61 sold for less; over 12 months between 1.295 (38 cars), under $100k only 0.897 (16 cars). Under 10 cars for most single earlier venues.
5. **About one sale in eight is a repeat.** 6,266 of the last 12 months' 49,728 sales with a usable VIN (12.6 percent) were the car's second or later time in our archive, 17,362 cars in all with two or more appearances, a median 11.6 months apart.

**Market Check feature "this car sold before":** yes, as a plain history line with the earlier sale and the change when the car has a VIN match (the pattern above is wide, 0.82 to 1.12 for the middle half, so it must never be a prediction), and only counts, no forecast; the line we already print stays the base.

Search check: no public page touched. No code changed, so the Class fix does not apply.
